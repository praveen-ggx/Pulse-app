import type { TripRow } from "@/features/trips/services/trips.service";
import {
  buildHubSearchScopedCounts,
  resolveHubStructuralSearchMode,
  scoreTripVehicleHubSearchMatch,
} from "@/features/trips/utils/hubSearchScopedCounts.util";

function trip(
  partial: Partial<TripRow> & Pick<TripRow, "id" | "status">,
): TripRow {
  return {
    organization_id: "org",
    client_name: "Acme",
    pickup_area: "A",
    drop_location: "B",
    trip_number: null,
    display_trip_id: null,
    vehicle_display_number: null,
    driver_display_name: null,
    ...partial,
  } as TripRow;
}

describe("scoreTripVehicleHubSearchMatch", () => {
  it("scores exact and folded plate matches as strong", () => {
    expect(
      scoreTripVehicleHubSearchMatch(
        trip({ id: "t1", status: "assigned", vehicle_display_number: "TN52AJ8388" }),
        "TN52AJ8388",
      ),
    ).toBe(100);
    expect(
      scoreTripVehicleHubSearchMatch(
        trip({ id: "t1", status: "assigned", vehicle_display_number: "TN 52 AJ 8388" }),
        "tn52aj",
      ),
    ).toBe(85);
  });
});

describe("resolveHubStructuralSearchMode", () => {
  const assigned = trip({
    id: "t1",
    status: "assigned",
    trip_number: "SAT812GOGTRIP001932",
    vehicle_display_number: "TN52AJ8388",
  });
  const transit = trip({
    id: "t2",
    status: "in_transit",
    vehicle_display_number: "TN52AJ8388",
  });
  const byId = new Map([
    [assigned.id, assigned],
    [transit.id, transit],
  ]);

  it("classifies trip id, vehicle, and indent id", () => {
    expect(
      resolveHubStructuralSearchMode({
        query: "SAT812GOGTRIP001932",
        tripMatches: [
          { tripId: "t1", stage: "assigned", score: 100 },
        ],
        indentMatches: [],
        tripsById: byId,
        organizationId: "org",
      }),
    ).toBe("trip_id");

    expect(
      resolveHubStructuralSearchMode({
        query: "TN52AJ8388",
        tripMatches: [
          { tripId: "t1", stage: "assigned", score: 100 },
          { tripId: "t2", stage: "in_transit", score: 100 },
        ],
        indentMatches: [],
        tripsById: byId,
        organizationId: "org",
      }),
    ).toBe("vehicle");

    expect(
      resolveHubStructuralSearchMode({
        query: "SAT812GOGIND003250",
        tripMatches: [],
        indentMatches: [
          { indentId: "i1", stage: "pending", score: 100 },
        ],
        tripsById: byId,
      }),
    ).toBe("indent_id");
  });
});

describe("buildHubSearchScopedCounts", () => {
  const assigned = trip({
    id: "t1",
    status: "assigned",
    trip_number: "SAT812GOGTRIP001932",
    vehicle_display_number: "TN52AJ8388",
  });
  const transit = trip({
    id: "t2",
    status: "in_transit",
    vehicle_display_number: "TN52AJ8388",
  });
  const delivered = trip({
    id: "t3",
    status: "completed",
    vehicle_display_number: "TN52AJ8388",
  });
  const byId = new Map([
    [assigned.id, assigned],
    [transit.id, transit],
    [delivered.id, delivered],
  ]);

  it("trip id: count 1 on owning stage, 0 elsewhere", () => {
    const scoped = buildHubSearchScopedCounts({
      mode: "trip_id",
      query: "SAT812GOGTRIP001932",
      tripMatches: [{ tripId: "t1", stage: "assigned", score: 100 }],
      indentMatches: [],
      tripsById: byId,
      organizationId: "org",
    });
    expect(scoped.metricCounts.assigned).toBe(1);
    expect(scoped.metricCounts.in_transit).toBe(0);
    expect(scoped.metricCounts.indent).toBe(0);
    expect(scoped.activeAllCount).toBe(1);
    expect(scoped.historyCount).toBe(0);
    expect(scoped.highlightedTripMetrics.has("assigned")).toBe(true);
    expect(scoped.highlightedTripMetrics.has("all")).toBe(true);
  });

  it("vehicle: counts per stage, zeros elsewhere", () => {
    const withDriver = new Map([
      [
        "t1",
        trip({
          id: "t1",
          status: "assigned",
          driver_id: "d1",
          vehicle_display_number: "TN52AJ8388",
        }),
      ],
      [
        "t2",
        trip({
          id: "t2",
          status: "in_transit",
          driver_id: "d1",
          vehicle_display_number: "TN52AJ8388",
        }),
      ],
      [
        "t3",
        trip({
          id: "t3",
          status: "completed",
          vehicle_display_number: "TN52AJ8388",
        }),
      ],
    ]);
    const scoped = buildHubSearchScopedCounts({
      mode: "vehicle",
      query: "TN52AJ8388",
      tripMatches: [
        { tripId: "t1", stage: "assigned", score: 100 },
        { tripId: "t2", stage: "in_transit", score: 100 },
        { tripId: "t3", stage: "delivered_docs_pending", score: 100 },
      ],
      indentMatches: [],
      tripsById: withDriver,
    });
    expect(scoped.metricCounts.assigned).toBe(1);
    expect(scoped.metricCounts.in_transit).toBe(1);
    expect(scoped.metricCounts.delivered_docs_pending).toBe(1);
    expect(scoped.metricCounts.unassigned).toBe(0);
    expect(scoped.activeAllCount).toBe(2);
    expect(scoped.historyCount).toBe(1);
    expect(scoped.matchingTripIds.size).toBe(3);
  });

  it("indent id: count 1 on indent stage only", () => {
    const scoped = buildHubSearchScopedCounts({
      mode: "indent_id",
      query: "IND003250",
      tripMatches: [],
      indentMatches: [{ indentId: "i1", stage: "bids", score: 100 }],
      tripsById: byId,
    });
    expect(scoped.indentTagCounts.bids).toBe(1);
    expect(scoped.indentTagCounts.pending).toBe(0);
    expect(scoped.metricCounts.indent).toBe(1);
    expect(scoped.metricCounts.assigned).toBe(0);
    expect(scoped.activeAllCount).toBe(0);
  });
});
