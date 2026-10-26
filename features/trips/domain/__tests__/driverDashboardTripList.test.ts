import {
  DRIVER_DASHBOARD_CLOSED_STATUSES,
  DRIVER_DASHBOARD_OPEN_TRIP_LIMIT,
  driverDashboardOpenTripQuery,
  refetchDriverDashboardTripsIfStale,
} from "@/features/trips/domain/driverDashboardTripList";

describe("driver dashboard open-trip contract", () => {
  it("excludes completed, cancelled, and delivered work and caps the page at 80", () => {
    const query = driverDashboardOpenTripQuery(["org-1"]);
    expect(query.limit).toBe(80);
    expect(query.limit).toBe(DRIVER_DASHBOARD_OPEN_TRIP_LIMIT);
    expect(query.offset).toBe(0);
    expect(query.exactLimit).toBe(true);
    expect(query.preferStarted).toBe(true);
    expect(query.excludeStatuses).toEqual(
      expect.arrayContaining(["completed", "cancelled", "delivered"]),
    );
    expect(query.excludeStatuses).not.toEqual(
      expect.arrayContaining(["in_progress", "assigned", "picked_up"]),
    );
    expect(DRIVER_DASHBOARD_CLOSED_STATUSES).not.toContain("in_progress");
  });

  it("reuses a fresh cached dashboard and refetches a stale one once", () => {
    const refetch = jest.fn();
    refetchDriverDashboardTripsIfStale(
      { isFetched: true, isStale: false },
      refetch,
    );
    expect(refetch).not.toHaveBeenCalled();

    refetchDriverDashboardTripsIfStale(
      { isFetched: false, isStale: true },
      refetch,
    );
    expect(refetch).not.toHaveBeenCalled();

    refetchDriverDashboardTripsIfStale(
      { isFetched: true, isStale: true },
      refetch,
    );
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});
