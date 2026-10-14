/**
 * Shared TanStack Query invalidation after hard-copy POD create/update.
 * Keeps Manifest Management, Log Incoming PODs, Invoicing, Trips hub,
 * POD reconciliation, and Trip Compliance in sync off the same trips.pod_* fields.
 *
 * Prefer org-scoped trip list invalidation — never wipe the entire `["q","trips"]`
 * tree (that refetches every trip detail/bundle and makes hub navigations janky).
 */
import { fetchTripHardCopyPodState } from "@/features/trips/services/tripDocumentLrPod.service";
import type { TripHardCopyPodState } from "@/features/trips/services/tripDocumentLrPod.service";
import {
  applyHardCopyPodColumnsToTrip,
  patchCachedCompliancePod,
  patchCachedTripPod,
  type HardCopyPodColumnPatch,
  type HardCopyPodSummaryPatch,
} from "@/lib/queries/hardCopyPodCache.util";
import { queryKeys } from "@/lib/queryKeys";
import type { QueryClient } from "@tanstack/react-query";

function columnsFromHardCopyPodState(
  state: TripHardCopyPodState,
): HardCopyPodColumnPatch {
  const row = applyHardCopyPodColumnsToTrip<Record<string, unknown>>({}, state);
  return {
    pod_received_at: (row.pod_received_at as string | null) ?? null,
    pod_hard_copy_courier: state.courier,
    pod_hard_copy_awb_number: state.awbNumber,
    pod_hard_copy_received_by: state.receivedBy,
  };
}

function summaryFromHardCopyPodState(
  state: TripHardCopyPodState,
): HardCopyPodSummaryPatch {
  return {
    received: state.status === "RECEIVED",
    receivedAt: state.status === "RECEIVED" ? state.receivedAt : null,
    courier: state.courier,
    awbNumber: state.awbNumber,
    receivedBy: state.receivedBy,
    ibond: state.ibond,
  };
}

const TRIP_POD_CACHE_PREFIXES = [
  ["q", "trips"],
  ["q", "invoicing"],
  ["q", "log-pods"],
  ["q", "pod-reconciliation"],
] as const;

/** Push one trip's POD record into every mounted list/detail cache. */
export function publishHardCopyPodState(
  queryClient: QueryClient,
  tripId: string,
  state: TripHardCopyPodState,
): void {
  const id = tripId.trim();
  if (!id) return;
  queryClient.setQueryData(queryKeys.trips.hardCopyPod(id), state);
  const patch = columnsFromHardCopyPodState(state);
  const summary = summaryFromHardCopyPodState(state);
  for (const queryKey of TRIP_POD_CACHE_PREFIXES) {
    queryClient.setQueriesData({ queryKey: [...queryKey] }, (old) =>
      patchCachedTripPod(old, id, patch),
    );
  }
  queryClient.setQueriesData({ queryKey: ["q", "tripCompliance"] }, (old) =>
    patchCachedCompliancePod(old, id, summary),
  );
}

function invalidateOrgHardCopyPodSurfaces(
  queryClient: QueryClient,
  orgId: string,
  tripIds: string[],
): void {
  // Hub finite/infinite lists + POD reconciliation (`…, 'reconciliation', …`).
  void queryClient.invalidateQueries({ queryKey: queryKeys.trips.all(orgId) });
  void queryClient.invalidateQueries({ queryKey: queryKeys.logPods.trips(orgId) });
  void queryClient.invalidateQueries({
    queryKey: queryKeys.logPods.tripsIncludingReceived(orgId),
  });
  void queryClient.invalidateQueries({ queryKey: queryKeys.invoicing.trips(orgId) });
  void queryClient.invalidateQueries({ queryKey: queryKeys.invoicing.summary(orgId) });
  void queryClient.invalidateQueries({
    queryKey: ["q", "tripCompliance", "list", "vault-v2", orgId],
  });
  void queryClient.invalidateQueries({ queryKey: ["q", "finance-pro"] });
  void queryClient.invalidateQueries({ queryKey: ["q", "debit-control"] });
  for (const tripId of tripIds) {
    void queryClient.invalidateQueries({
      queryKey: queryKeys.tripCompliance.detail(orgId, tripId),
    });
  }
}

function invalidateTripHardCopyPodReaders(
  queryClient: QueryClient,
  tripIds: string[],
): void {
  for (const tripId of tripIds) {
    void queryClient.invalidateQueries({
      queryKey: queryKeys.trips.hardCopyPod(tripId),
    });
    void queryClient.invalidateQueries({
      queryKey: queryKeys.trips.timeline(tripId),
    });
    void queryClient.invalidateQueries({
      queryKey: queryKeys.trips.workflow(tripId),
    });
  }
}

/** Invalidate all surfaces that read hard-copy POD for one trip. */
export function invalidateHardCopyPodCaches(
  queryClient: QueryClient,
  args: { tripId?: string | null; organizationId?: string | null },
): void {
  const tripId = String(args.tripId ?? "").trim();
  const orgId = String(args.organizationId ?? "").trim();
  const tripIds = tripId ? [tripId] : [];

  invalidateTripHardCopyPodReaders(queryClient, tripIds);
  for (const id of tripIds) {
    void queryClient.invalidateQueries({ queryKey: queryKeys.trips.detail(id) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.trips.bundle(id) });
  }

  if (orgId) {
    invalidateOrgHardCopyPodSurfaces(queryClient, orgId, tripIds);
  } else if (tripIds.length === 0) {
    // No trip/org context — last-resort prefix (avoid on the hot path).
    void queryClient.invalidateQueries({ queryKey: ["q", "trips"] });
  }
}

/** Same as {@link invalidateHardCopyPodCaches} for a batch of trips (one org-wide pass). */
export function invalidateHardCopyPodCachesForTrips(
  queryClient: QueryClient,
  args: { tripIds: string[]; organizationId?: string | null },
): void {
  const tripIds = Array.from(
    new Set((args.tripIds ?? []).map((id) => String(id ?? "").trim()).filter(Boolean)),
  );
  const orgId = String(args.organizationId ?? "").trim();

  invalidateTripHardCopyPodReaders(queryClient, tripIds);
  for (const tripId of tripIds) {
    void queryClient.invalidateQueries({ queryKey: queryKeys.trips.detail(tripId) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.trips.bundle(tripId) });
  }

  if (orgId) {
    invalidateOrgHardCopyPodSurfaces(queryClient, orgId, tripIds);
  } else if (tripIds.length === 0) {
    void queryClient.invalidateQueries({ queryKey: ["q", "trips"] });
  }
}

/**
 * After a successful hard-copy POD write, read the trip's POD record back
 * and publish it into the shared query plus any cached trip rows for that id.
 * Callers must invoke this only when the write succeeded.
 */
export async function syncHardCopyPodRecord(
  queryClient: QueryClient,
  args: { tripId?: string | null; organizationId?: string | null },
): Promise<{ error: Error | null }> {
  const tripId = String(args.tripId ?? "").trim();
  if (!tripId) {
    invalidateHardCopyPodCaches(queryClient, args);
    return { error: new Error("Trip is not linked.") };
  }

  await queryClient.cancelQueries({
    queryKey: queryKeys.trips.hardCopyPod(tripId),
  });
  const orgId = String(args.organizationId ?? "").trim();
  if (orgId) {
    await queryClient.cancelQueries({ queryKey: queryKeys.trips.all(orgId) });
  }
  const { error, state } = await fetchTripHardCopyPodState(tripId);
  if (!error && state) {
    publishHardCopyPodState(queryClient, tripId, state);
  }

  invalidateHardCopyPodCaches(queryClient, args);
  return { error };
}
