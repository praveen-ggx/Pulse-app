/**
 * Realtime subscriptions that invalidate TanStack Query cache on DB change.
 * Granular invalidation: UPDATE → only the changed row's detail key.
 *                        INSERT/DELETE → the list key too.
 */
import { useEffect } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { queryKeys } from '@/lib/queryKeys';
import { subscribeSharedPostgresChanges } from '@/lib/realtimeRegistry';
import { scheduleInvalidation } from '@/lib/platform/moderator';
import { getTripLedgerEmbed, toLedgerRow, type LedgerRow } from '@/features/finance/services/finance.service';

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
        const tripId = (payload.new as { id?: string })?.id ?? (payload.old as { id?: string })?.id;

        // Silent merge on UPDATE — avoids refetch storm when status is mirrored in chat payloads.
        if (tripId && payload.eventType === 'UPDATE' && payload.new && typeof payload.new === 'object') {
          qc.setQueryData(queryKeys.trips.detail(tripId), (old: unknown) => {
            if (!old || typeof old !== 'object') return old;
            return { ...(old as Record<string, unknown>), ...(payload.new as object) };
          });
        } else if (tripId) {
          qc.invalidateQueries({ queryKey: queryKeys.trips.detail(tripId) });
        }

        // Invalidate list only on INSERT or DELETE (UPDATE just changes the row in-place)
        if (payload.eventType !== 'UPDATE') {
          // Debounced: a convoy of inserts collapses these four keys into one
          // flush per window instead of four invalidations per event.
          scheduleInvalidation(qc, queryKeys.trips.all(organizationId));
          scheduleInvalidation(qc, queryKeys.trips.finite(organizationId));
          scheduleInvalidation(qc, queryKeys.trips.whereOrgIsClient(organizationId));
          scheduleInvalidation(qc, queryKeys.trips.whereOrgIsSupplier(organizationId));
        } else {
          // UPDATE: update the list cache in-place to avoid a full refetch
          qc.setQueriesData(
            { queryKey: queryKeys.trips.finite(organizationId) },
            (old: unknown) => {
              if (!Array.isArray(old) || !tripId) return old;
              const updated = payload.new as Record<string, unknown>;
              return old.map((t: { id: string }) => (t.id === tripId ? { ...t, ...updated } : t));
            },
          );
        }

        // Shipper names only change when client_id or client_name changes — not on status/location
        // updates. Firing this on every realtime event caused a spurious RPC call on every GPS ping.
        const newRow = payload.new as Record<string, unknown> | null;
        const oldRow = payload.old as Record<string, unknown> | null;
        const clientChanged =
          payload.eventType !== 'UPDATE' ||
          newRow?.client_id !== oldRow?.client_id ||
          newRow?.client_name !== oldRow?.client_name;
        if (clientChanged) {
          qc.invalidateQueries({ queryKey: queryKeys.trips.shipperNamesForSupplier(organizationId) });
        }

        // Assignment audit only matters when driver/vehicle/assigner fields change.
        const assignmentChanged =
          payload.eventType !== 'UPDATE' ||
          newRow?.driver_id !== oldRow?.driver_id ||
          newRow?.vehicle_id !== oldRow?.vehicle_id ||
          newRow?.assigned_by_user_id !== oldRow?.assigned_by_user_id ||
          newRow?.status !== oldRow?.status;
        if (assignmentChanged) {
          qc.invalidateQueries({ queryKey: queryKeys.trips.assignmentAuditRoot });
        }

        // Unlinked counterparties change when: a new trip is inserted/deleted, OR
        // when the name or FK fields change on UPDATE. GPS pings (last_location_at)
        // and status updates must NOT trigger this — they're the hot path.
        const counterpartyChanged =
          payload.eventType !== 'UPDATE' ||
          newRow?.supplier_name !== oldRow?.supplier_name ||
          newRow?.client_name !== oldRow?.client_name ||
          newRow?.supplier_id !== oldRow?.supplier_id ||
          newRow?.client_id !== oldRow?.client_id;
        if (counterpartyChanged) {
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
