/** Open work the driver dashboard and trip shortcuts need. History stays on its own screen. */
export const DRIVER_DASHBOARD_CLOSED_STATUSES = [
  "completed",
  "cancelled",
  "canceled",
  "done",
  "delivered",
] as const;

/**
 * Dashboard-only cap. The database applies it (inclusive range).
 * Live work is ordered first so this cap does not drop the trip in progress.
 */
export const DRIVER_DASHBOARD_OPEN_TRIP_LIMIT = 80;

export function driverDashboardOpenTripQuery(knownOrganizationIds?: readonly string[]) {
  return {
    limit: DRIVER_DASHBOARD_OPEN_TRIP_LIMIT,
    offset: 0,
    excludeStatuses: DRIVER_DASHBOARD_CLOSED_STATUSES,
    knownOrganizationIds,
    exactLimit: true as const,
    preferStarted: true as const,
  };
}

/** Fresh cache is reused. A stale result refreshes once per focus. An in-flight first load is not fetched again. */
export function shouldRefetchDriverDashboardTrips(state: {
  isFetched: boolean;
  isStale: boolean;
}): boolean {
  return state.isFetched === true && state.isStale === true;
}

export function refetchDriverDashboardTripsIfStale(
  state: { isFetched: boolean; isStale: boolean },
  refetch: () => void,
): void {
  if (shouldRefetchDriverDashboardTrips(state)) refetch();
}
