/**
 * Keeps the finite, complete, and compliance trip catalogs in step
 * without copying one catalog into another.
 *
 * Location pings patch the finite list only. Totals, status, assignment,
 * payment, and compliance fields patch every catalog that already holds
 * the trip. A catalog that does not contain the trip is left alone.
 */
import type { QueryClient, QueryKey } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";

type TripId = { id?: string };

const LOCATION_PING_FIELDS = [
  "last_location_at",
  "last_location_chat_at",
  "gps_distance_km",
  "actual_distance_traveled_km",
] as const;

/** Fields that change a total, an analytic, an assignment, or a settlement figure. */
export const COMPLETE_HISTORY_FIELDS = [
  "status",
  "client_price",
  "supplier_rate",
  "margin",
  "platform_fee",
  "driver_commission",
  "amount_paid",
  "advance_paid",
  "payment_status",
  "sale_unit_rate",
  "sale_rate_basis",
  "supplier_rate_basis",
  "dco_party_billed",
  "client_id",
  "client_name",
  "supplier_id",
  "driver_id",
  "driver_display_name",
  "vehicle_id",
  "vehicle_display_number",
  "owner_vehicle_id",
  "assigned_by_user_id",
  "deleted_at",
  "cancelled_at",
  "compliance_decision",
  "compliance_verified_at",
  "compliance_declined_at",
  "pod_received_at",
  "pod_hard_copy_courier",
  "pod_hard_copy_awb_number",
  "pod_hard_copy_received_by",
  "finance_verified_at",
] as const;

export function tripCatalogQueryKeys(orgId: string): QueryKey[] {
  return [
    queryKeys.trips.finite(orgId),
    queryKeys.trips.complete(orgId),
    queryKeys.trips.compliance(orgId),
  ];
}

/** True when both timestamps exist and the incoming event is strictly older. */
export function isOlderThanCached(current: object, incoming: object): boolean {
  const cachedAt = (current as Record<string, unknown>).updated_at;
  const nextAt = (incoming as Record<string, unknown>).updated_at;
  if (typeof cachedAt !== "string" || typeof nextAt !== "string") return false;
  if (!cachedAt || !nextAt) return false;
  return nextAt < cachedAt;
}

/**
 * Finite-list patch. A full row with updated_at merges. A payload without
 * updated_at may change location fields only. An older updated_at is ignored.
 */
export function patchFiniteTripFromRealtime<T extends TripId>(
  row: T,
  incoming: Record<string, unknown>,
): T {
  if (isOlderThanCached(row, incoming)) return row;
  if (typeof incoming.updated_at !== "string" || incoming.updated_at.length === 0) {
    const next: Record<string, unknown> = { ...row };
    let changed = false;
    for (const field of LOCATION_PING_FIELDS) {
      if (field in incoming && incoming[field] !== next[field]) {
        next[field] = incoming[field];
        changed = true;
      }
    }
    return changed ? (next as T) : row;
  }
  return { ...row, ...incoming } as T;
}

export function incomingAffectsCompleteHistory(
  current: object,
  incoming: object,
): boolean {
  const cached = current as Record<string, unknown>;
  const next = incoming as Record<string, unknown>;
  return COMPLETE_HISTORY_FIELDS.some(
    (field) => field in next && next[field] !== cached[field],
  );
}

export function patchTripCatalogRow<T extends TripId>(
  queryClient: QueryClient,
  queryKey: QueryKey,
  tripId: string,
  merge: (row: T) => T,
  onlyWhen?: (row: T) => boolean,
): void {
  queryClient.setQueriesData<T[]>({ queryKey }, (rows) => {
    if (!Array.isArray(rows)) return rows;
    const index = rows.findIndex((row) => row?.id === tripId);
    if (index < 0) return rows;
    const current = rows[index];
    if (onlyWhen && !onlyWhen(current)) return rows;
    const nextRow = merge(current);
    if (nextRow === current) return rows;
    const next = rows.slice();
    next[index] = nextRow;
    return next;
  });
}

/** Patch each catalog independently. A missing trip is not inserted from another catalog. */
export function patchTripInEveryCatalog<T extends TripId>(
  queryClient: QueryClient,
  orgId: string,
  tripId: string,
  merge: (row: T) => T,
): void {
  for (const queryKey of tripCatalogQueryKeys(orgId)) {
    patchTripCatalogRow(queryClient, queryKey, tripId, merge);
  }
}

/**
 * Realtime UPDATE. The finite list stays live, including location pings.
 * Complete and compliance lists change only when a history field differs
 * from the row already cached, so a GPS heartbeat does not rewrite them
 * and does not refetch them.
 */
export function patchCompleteHistoryFromRealtime(
  queryClient: QueryClient,
  orgId: string,
  tripId: string,
  incoming: Record<string, unknown>,
): void {
  if (typeof incoming.updated_at !== "string" || incoming.updated_at.length === 0) return;
  const merge = <T extends TripId>(row: T): T => ({ ...row, ...incoming }) as T;
  for (const queryKey of [
    queryKeys.trips.complete(orgId),
    queryKeys.trips.compliance(orgId),
  ]) {
    patchTripCatalogRow(queryClient, queryKey, tripId, merge, (row) =>
      !isOlderThanCached(row, incoming) && incomingAffectsCompleteHistory(row, incoming),
    );
  }
}

export type TripCatalogSnapshots<T extends TripId = TripId> = {
  finite?: T;
  complete?: T;
  compliance?: T;
};

function findTrip<T extends TripId>(rows: T[] | undefined, tripId: string): T | undefined {
  return rows?.find((row) => row?.id === tripId);
}

export function readTripCatalogSnapshots<T extends TripId>(
  queryClient: QueryClient,
  orgId: string,
  tripId: string,
): TripCatalogSnapshots<T> {
  return {
    finite: findTrip(queryClient.getQueryData<T[]>(queryKeys.trips.finite(orgId)), tripId),
    complete: findTrip(queryClient.getQueryData<T[]>(queryKeys.trips.complete(orgId)), tripId),
    compliance: findTrip(
      queryClient.getQueryData<T[]>(queryKeys.trips.compliance(orgId)),
      tripId,
    ),
  };
}

export function applyOptimisticTripStatus<T extends TripId>(
  queryClient: QueryClient,
  orgId: string,
  tripId: string,
  patch: object,
): void {
  patchTripInEveryCatalog<T>(queryClient, orgId, tripId, (row) => ({ ...row, ...patch }) as T);
}

/**
 * Restore one catalog row only when it still shows the status this mutation wrote.
 * A newer status edit on the same trip is left in place. Other trips are untouched.
 */
export function rollbackOptimisticTripStatus<T extends TripId & { status?: string }>(
  queryClient: QueryClient,
  orgId: string,
  tripId: string,
  previous: TripCatalogSnapshots<T>,
  writtenStatus: string,
): void {
  const entries: Array<[QueryKey, T | undefined]> = [
    [queryKeys.trips.finite(orgId), previous.finite],
    [queryKeys.trips.complete(orgId), previous.complete],
    [queryKeys.trips.compliance(orgId), previous.compliance],
  ];
  for (const [queryKey, prior] of entries) {
    if (!prior) continue;
    queryClient.setQueryData<T[]>(queryKey, (rows) => {
      if (!Array.isArray(rows)) return rows;
      let changed = false;
      const next = rows.map((row) => {
        if (row?.id !== tripId) return row;
        if (row.status !== writtenStatus) return row;
        changed = true;
        return prior;
      });
      return changed ? next : rows;
    });
  }
}

/** User-initiated garage refresh. Marks both catalogs stale and does not copy either list. */
export function invalidateGarageFinanceTripCaches(
  queryClient: QueryClient,
  orgId: string,
): void {
  void queryClient.invalidateQueries({ queryKey: queryKeys.trips.finite(orgId) });
  void queryClient.invalidateQueries({ queryKey: queryKeys.trips.complete(orgId) });
}
