import { getDriverPresenceForTrips } from "@/features/tracking/services/driverPresence.service";
import { HUB_ASSIGNMENT_AUDIT_TRIP_LIMIT } from "@/features/trips/utils/hubAssignmentAuditTripIds.util";
import type { TripRow } from "@/features/trips/services/trips.service";
import {
  formatHubPingOfflineLabel,
  formatHubPingTimeLabel,
} from "@/features/trips/utils/driverLastPingDisplay.util";
import {
  isDriverLocationRecentlySeen,
  isTripTrackingActive,
} from "@/features/trips/utils/tripTrackingStatus.util";
import { useAppStateIsActive } from "@/lib/hooks/useAppStateIsActive";
import { queryKeys } from "@/lib/queryKeys";
import { useQuery } from "@tanstack/react-query";

export type TripHubInTransitPingMeta = {
  timeLabel: string | null;
  offlineLabel: string | null;
  isOnline: boolean;
  recordedAt: string | null;
};

/** Plain object — TanStack Query cannot round-trip `Map` through cache. */
export type TripHubInTransitPingIndex = Record<string, TripHubInTransitPingMeta>;

function shouldFetchHubPing(trip: TripRow): boolean {
  return (
    isTripTrackingActive(trip.status, trip.completed_at) &&
    !!(trip.driver_id ?? "").trim()
  );
}

export function buildTripHubInTransitPingMeta(
  recordedAt: string | null | undefined,
): TripHubInTransitPingMeta {
  const at = (recordedAt ?? "").trim() || null;
  const offlineLabel = formatHubPingOfflineLabel(at);
  const isOnline = isDriverLocationRecentlySeen(at);
  return {
    timeLabel: at ? formatHubPingTimeLabel(at) : null,
    offlineLabel,
    isOnline,
    recordedAt: at,
  };
}

async function fetchInTransitPings(
  trips: TripRow[],
): Promise<TripHubInTransitPingIndex> {
  const eligible = trips.filter(shouldFetchHubPing);
  const index: TripHubInTransitPingIndex = {};
  if (eligible.length === 0) return index;

  // One query for the whole list. The previous per-trip pair (location RPC +
  // presence) was 16–32 concurrent REST calls per reload and filled PostgREST
  // on login (2026-09-19 11:11–11:43 IST: 95 get_latest_driver_location_for_trip
  // calls, then PGRST002). driver_presence is the primary last-seen source.
  const { presenceByTripId } = await getDriverPresenceForTrips(
    eligible.map((trip) => trip.id),
  );

  for (const trip of eligible) {
    index[trip.id] = buildTripHubInTransitPingMeta(
      presenceByTripId.get(trip.id)?.recorded_at,
    );
  }

  return index;
}

export function getTripHubInTransitPing(
  index: TripHubInTransitPingIndex | undefined,
  tripId: string,
): TripHubInTransitPingMeta | null {
  if (!index || !tripId) return null;
  return index[tripId] ?? null;
}

export function useTripHubInTransitPings(
  organizationId: string | null | undefined,
  trips: TripRow[],
) {
  const isActive = useAppStateIsActive();
  const inTransitIds = trips
    .filter(shouldFetchHubPing)
    .slice(0, HUB_ASSIGNMENT_AUDIT_TRIP_LIMIT)
    .map((t) => t.id)
    .sort()
    .join(",");

  return useQuery({
    queryKey: queryKeys.trips.hubInTransitPings(
      organizationId ?? "",
      inTransitIds,
    ),
    enabled: !!organizationId && inTransitIds.length > 0,
    staleTime: 90_000,
    // Only poll while the app is foregrounded — a backgrounded web tab was
    // otherwise hitting the DB every 2 min indefinitely.
    refetchInterval: isActive ? 120_000 : false,
    queryFn: () =>
      fetchInTransitPings(
        trips.filter(shouldFetchHubPing).slice(0, HUB_ASSIGNMENT_AUDIT_TRIP_LIMIT),
      ),
  });
}
