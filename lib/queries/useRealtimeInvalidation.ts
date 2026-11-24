/**
 * Realtime subscriptions that invalidate TanStack Query cache on DB change.
 * Granular invalidation: UPDATE → only the changed row's detail key.
 *                        INSERT/DELETE → the list key too.
 */
import { getTripLedgerEmbed, toLedgerRow, type LedgerRow } from '@/features/finance/services/finance.service';
import { refreshCompliancePodForTrip } from '@/lib/queries/invalidateHardCopyPodCaches';
import { invalidateComplianceSettlementCaches } from '@/lib/queries/syncFinanceComplianceCaches';
import { queryKeys } from '@/lib/queryKeys';
import {
  isOlderThanCached,
  patchCompleteHistoryFromRealtime,
  patchFiniteTripFromRealtime,
} from '@/lib/queries/tripCatalogFreshness';
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
        applyTripRealtimeEvent(qc, organizationId, payload);
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

function readCachedTripRow(
  qc: QueryClient,
  orgId: string,
  tripId: string,
): Record<string, unknown> | undefined {
  for (const queryKey of [
    queryKeys.trips.finite(orgId),
    queryKeys.trips.complete(orgId),
    queryKeys.trips.compliance(orgId),
  ]) {
    const rows = qc.getQueryData<Array<{ id?: string }>>(queryKey);
    const found = rows?.find((row) => row?.id === tripId);
    if (found) return found as Record<string, unknown>;
  }
  return undefined;
}

/**
 * Trip realtime. INSERT and DELETE still invalidate the org trip prefix, which
 * refetches finite, complete, and compliance through their own query functions.
 * UPDATE patches the finite row in place. Complete and compliance rows are
 * patched only when a history field changed, so a location ping does not
 * download the full catalog.
 */
export function applyTripRealtimeEvent(
  qc: QueryClient,
  organizationId: string,
  payload: RealtimePostgresChangesPayload<Record<string, unknown>>,
): void {
  const tripId = (payload.new as { id?: string })?.id ?? (payload.old as { id?: string })?.id;
  const newRow = payload.new as Record<string, unknown> | null;
  const oldRow = payload.old as Record<string, unknown> | null;

  if (tripId && payload.eventType === 'UPDATE' && payload.new && typeof payload.new === 'object') {
    qc.setQueryData(queryKeys.trips.detail(tripId), (old: unknown) => {
      if (!old || typeof old !== 'object') return old;
      return { ...(old as Record<string, unknown>), ...(payload.new as object) };
    });
  } else if (tripId) {
    qc.invalidateQueries({ queryKey: queryKeys.trips.detail(tripId) });
  }

  // Compare against the cached row when the realtime old record is only the
  // primary key. Otherwise every location ping looks like a price, status,
  // and client change and invalidates the surrounding catalogs.
  const cachedBeforePatch = tripId
    ? readCachedTripRow(qc, organizationId, tripId)
    : undefined;
  const staleUpdate = Boolean(
    payload.eventType === 'UPDATE' &&
      newRow &&
      cachedBeforePatch &&
      isOlderThanCached(cachedBeforePatch, newRow),
  );
  const fieldChanged = (field: string): boolean => {
    if (staleUpdate || !newRow) return false;
    if (oldRow && Object.prototype.hasOwnProperty.call(oldRow, field)) {
      return oldRow[field] !== newRow[field];
    }
    if (
      !cachedBeforePatch ||
      !Object.prototype.hasOwnProperty.call(cachedBeforePatch, field)
    ) {
      return false;
    }
    return cachedBeforePatch[field] !== newRow[field];
  };

  if (payload.eventType !== 'UPDATE') {
    scheduleInvalidation(qc, queryKeys.trips.all(organizationId));
    scheduleInvalidation(qc, queryKeys.trips.finite(organizationId));
    scheduleInvalidation(qc, queryKeys.trips.whereOrgIsClient(organizationId));
    scheduleInvalidation(qc, queryKeys.trips.whereOrgIsSupplier(organizationId));
  } else if (!staleUpdate && tripId && newRow) {
    qc.setQueriesData(
      { queryKey: queryKeys.trips.finite(organizationId) },
      (old: unknown) => {
        if (!Array.isArray(old)) return old;
        return old.map((t: { id: string }) =>
          t.id === tripId ? patchFiniteTripFromRealtime(t, newRow) : t,
        );
      },
    );
    patchCompleteHistoryFromRealtime(qc, organizationId, tripId, newRow);
    const podChanged =
      fieldChanged('pod_received_at') ||
      fieldChanged('pod_hard_copy_courier') ||
      fieldChanged('pod_hard_copy_awb_number') ||
      fieldChanged('pod_hard_copy_received_by');
    if (podChanged) {
      qc.invalidateQueries({ queryKey: queryKeys.trips.hardCopyPod(tripId) });
      qc.invalidateQueries({ queryKey: queryKeys.trips.timeline(tripId) });
      void refreshCompliancePodForTrip(qc, tripId);
      qc.invalidateQueries({ queryKey: ["q", "invoicing"] });
      qc.invalidateQueries({ queryKey: ["q", "log-pods"] });
    }
    const settlementChanged =
      fieldChanged('compliance_verified_at') ||
      fieldChanged('compliance_decision') ||
      fieldChanged('compliance_declined_at') ||
      fieldChanged('amount_paid');
    if (settlementChanged) {
      invalidateComplianceSettlementCaches(qc, organizationId, tripId);
    }
  }

  const clientChanged =
    payload.eventType !== 'UPDATE' ||
    fieldChanged('client_id') ||
    fieldChanged('client_name');
  if (clientChanged) {
    qc.invalidateQueries({ queryKey: queryKeys.trips.shipperNamesForSupplier(organizationId) });
  }

  const assignmentChanged =
    payload.eventType !== 'UPDATE' ||
    fieldChanged('driver_id') ||
    fieldChanged('vehicle_id') ||
    fieldChanged('assigned_by_user_id') ||
    fieldChanged('status');
  if (assignmentChanged) {
    qc.invalidateQueries({ queryKey: queryKeys.trips.assignmentAuditRoot });
  }

  const counterpartyChanged =
    payload.eventType !== 'UPDATE' ||
    fieldChanged('supplier_name') ||
    fieldChanged('client_name') ||
    fieldChanged('supplier_id') ||
    fieldChanged('client_id');
  if (counterpartyChanged) {
    qc.invalidateQueries({
      queryKey: queryKeys.unlinkedCounterparties(organizationId),
    });
  }
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
