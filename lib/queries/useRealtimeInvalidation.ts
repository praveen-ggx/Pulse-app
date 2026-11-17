/**
 * Realtime subscriptions that invalidate TanStack Query cache on DB change.
 * Granular invalidation: UPDATE → only the changed row's detail key.
 *                        INSERT/DELETE → the list key too.
 */
import { getTripLedgerEmbed, toLedgerRow, type LedgerRow } from '@/features/finance/services/finance.service';
import { refreshCompliancePodForTrip } from '@/lib/queries/invalidateHardCopyPodCaches';
import { invalidateComplianceSettlementCaches } from '@/lib/queries/syncFinanceComplianceCaches';
import { queryKeys } from '@/lib/queryKeys';
import { applyTripRealtimeCatalogUpdate } from '@/lib/queries/tripRealtimeChange';
import { subscribeSharedPostgresChanges } from '@/lib/realtimeRegistry';
import { scheduleInvalidation } from '@/lib/platform/moderator';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

export function useRealtimeTripsInvalidation(organizationId: string | null) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!organizationId) return;
    return subscribeSharedPostgresChanges(
      `trips:org:${organizationId}`,
      [
        {
          event: '*',
          schema: 'public',
          table: 'trips',
          filter: `organization_id=eq.${organizationId}`,
        },
      ],
      (payload) => {
        const decision = applyTripRealtimeCatalogUpdate(qc, organizationId, payload);
        if (decision.ignore) return;
        const tripId = decision.tripId;

        // A primary-key-only old row is not a POD or settlement change. Comparing
        // it with the full new row reloaded the compliance catalog on every update.
        if (decision.podChanged && tripId) {
          qc.invalidateQueries({ queryKey: queryKeys.trips.hardCopyPod(tripId) });
          qc.invalidateQueries({ queryKey: queryKeys.trips.timeline(tripId) });
          void refreshCompliancePodForTrip(qc, tripId);
          qc.invalidateQueries({ queryKey: ["q", "invoicing"] });
          qc.invalidateQueries({ queryKey: ["q", "log-pods"] });
        }
        if (decision.settlementChanged) {
          invalidateComplianceSettlementCaches(qc, organizationId, tripId);
        }

        if (decision.clientChanged) {
          qc.invalidateQueries({ queryKey: queryKeys.trips.shipperNamesForSupplier(organizationId) });
        }
        if (decision.assignmentChanged) {
          qc.invalidateQueries({ queryKey: queryKeys.trips.assignmentAuditRoot });
        }
        if (decision.counterpartyChanged) {
          qc.invalidateQueries({
            queryKey: queryKeys.unlinkedCounterparties(organizationId),
          });
        }
      },
    );
  }, [organizationId, qc]);
}

export function useRealtimeTransactionsInvalidation(organizationId: string | null) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!organizationId) return;
    return subscribeSharedPostgresChanges(
      `transactions:org:${organizationId}`,
      [
        {
          event: '*',
          schema: 'public',
          table: 'transactions',
          filter: `organization_id=eq.${organizationId}`,
        },
      ],
      (payload) => {
        void applyTransactionRealtimeEvent(qc, organizationId, payload);
      },
    );
  }, [organizationId, qc]);
}

/**
 * Keeps transactions.finite's cache correct without a full-list refetch: DELETE
 * removes the row locally; INSERT/UPDATE reconstruct the same transformed LedgerRow
 * toLedgerRow would produce, fetching only the trip-label embed (the one thing a
 * realtime payload can't carry — it has no joins) when the trip is new or changed.
 * transactions.infinite and transactions.byContact aren't surgically patched here,
 * so they keep their existing (broader) invalidation behaviour unchanged.
 */
export async function applyTransactionRealtimeEvent(
  qc: QueryClient,
  organizationId: string,
  payload: RealtimePostgresChangesPayload<Record<string, unknown>>,
): Promise<void> {
  const newRow = payload.new as Record<string, unknown> | undefined;
  const oldRow = payload.old as Record<string, unknown> | undefined;
  const txId = (newRow?.id as string | undefined) ?? (oldRow?.id as string | undefined) ?? null;

  if (txId) {
    if (payload.eventType === 'DELETE') {
      qc.setQueriesData(
        { queryKey: queryKeys.transactions.finite(organizationId) },
        (old: unknown) => {
          if (!Array.isArray(old)) return old;
          return old.filter((item: { id: string }) => item.id !== txId);
        },
      );
    } else if (newRow) {
      const cached = qc.getQueryData<LedgerRow[]>(queryKeys.transactions.finite(organizationId));
      // No observer is watching this org's finite list right now — skip the trip-embed
      // fetch too, since there'd be no cache entry for setQueriesData to patch.
      if (cached !== undefined) {
        const existing = cached.find((item) => item.id === txId);
        const tripId = (newRow.trip_id as string | null | undefined) ?? null;
        let trips: LedgerRow['trips'] = null;
        if (tripId) {
          trips =
            existing && existing.trip_id === tripId && existing.trips
              ? existing.trips
              : (await getTripLedgerEmbed(tripId)).embed;
        }
        const transformed = toLedgerRow({
          ...(newRow as Parameters<typeof toLedgerRow>[0]),
          trips,
        });
        qc.setQueriesData<LedgerRow[]>(
          { queryKey: queryKeys.transactions.finite(organizationId) },
          (old) => {
            if (!Array.isArray(old)) return old;
            const idx = old.findIndex((item) => item.id === txId);
            if (idx === -1) return [transformed, ...old];
            const next = old.slice();
            next[idx] = transformed;
            return next;
          },
        );
      }
    }
  }

  // .finite is self-sufficient above; .infinite and .byContact are not surgically
  // patched, so preserve their existing invalidation behaviour, unchanged in scope.
  scheduleInvalidation(qc, ['q', 'transactions', organizationId, 'infinite']);
  scheduleInvalidation(qc, ['q', 'transactions', organizationId, 'contact']);
  scheduleInvalidation(qc, ['q', 'finance-aggregation', 'customer', organizationId]);
  scheduleInvalidation(qc, ['q', 'finance-aggregation', 'supplier', organizationId]);
  scheduleInvalidation(qc, queryKeys.financeAggregation.driver(organizationId));
  scheduleInvalidation(qc, queryKeys.financeAggregation.dco(organizationId));

  // Trip-linked ledger rows drive Compliance Advance Processed / stage counts.
  const tripId =
    (newRow?.trip_id as string | null | undefined) ??
    (oldRow?.trip_id as string | null | undefined) ??
    null;
  const ledgerCategory =
    (newRow?.ledger_category as string | null | undefined) ??
    (oldRow?.ledger_category as string | null | undefined) ??
    null;
  const affectsCompliance =
    Boolean(tripId) ||
    ledgerCategory === 'compliance_advance' ||
    ledgerCategory === 'compliance_balance';
  if (affectsCompliance) {
    invalidateComplianceSettlementCaches(qc, organizationId, tripId);
  }
}

/**
 * Subscribes to connection_requests (low-write) and invalidates clients/suppliers
 * when a request involving this org transitions to 'approved'. This is the only
 * cross-org cache bust path — the approving org invalidates itself manually, but
 * the requesting org has no other signal.
 */
export function useRealtimeNetworkInvalidation(organizationId: string | null) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!organizationId) return;

    const invalidate = () => {
      qc.invalidateQueries({ queryKey: queryKeys.clients.all(organizationId) });
      qc.invalidateQueries({ queryKey: queryKeys.suppliers.all(organizationId) });
      qc.invalidateQueries({ queryKey: queryKeys.connectionRequests.received(organizationId) });
      qc.invalidateQueries({ queryKey: queryKeys.connectionRequests.sent(organizationId) });
      qc.invalidateQueries({ queryKey: queryKeys.indents.market(organizationId) });
    };

    const isApproval = (payload: { eventType: string; new: unknown }) =>
      payload.eventType === 'UPDATE' &&
      (payload.new as { status?: string })?.status === 'approved';

    // Two subscriptions: one for requests this org sent, one for requests it received.
    const unsubFrom = subscribeSharedPostgresChanges(
      `conn_req:from:${organizationId}`,
      [{ event: 'UPDATE', schema: 'public', table: 'connection_requests', filter: `from_organization_id=eq.${organizationId}` }],
      (payload) => { if (isApproval(payload)) invalidate(); },
    );

    const unsubTo = subscribeSharedPostgresChanges(
      `conn_req:to:${organizationId}`,
      [{ event: 'UPDATE', schema: 'public', table: 'connection_requests', filter: `to_organization_id=eq.${organizationId}` }],
      (payload) => { if (isApproval(payload)) invalidate(); },
    );

    return () => { unsubFrom(); unsubTo(); };
  }, [organizationId, qc]);
}
