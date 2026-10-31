import type { TripRow } from "@/features/trips/services/trips.service";
import {
  bestTripHubSearchMatch,
  collectTripHubSearchMatches,
  pickTripHubSearchStage,
  scoreTripHubSearchMatch,
  tripHubSearchStageForTrip,
} from "@/features/trips/utils/tripHubSearchStage.util";

function trip(partial: Partial<TripRow> & Pick<TripRow, "id">): TripRow {
  return {
    organization_id: "org",
    status: "assigned",
    driver_id: "drv-1",
    vehicle_id: null,
    client_name: "Apollo",
    supplier_name: null,
    pickup_area: "Perambra",
    drop_location: "Nagpur",
    trip_number: "SAT812GOGTRIP001676",
    trip_operational_code: "SAT812GOGTRIP001676",
    display_trip_id: "SAT812GOGTRIP001676",
    created_at: "2026-10-20T10:00:00.000Z",
    ...partial,
  } as TripRow;
}

describe("tripHubSearchStageForTrip", () => {
  it("maps open statuses onto Active rail tiles", () => {
    expect(
      tripHubSearchStageForTrip(trip({ id: "a", status: "draft", driver_id: null })),
    ).toBe("unassigned");
    expect(
      tripHubSearchStageForTrip(trip({ id: "b", status: "assigned", driver_id: "d" })),
    ).toBe("assigned");
    expect(
      tripHubSearchStageForTrip(
        trip({ id: "c", status: "in_progress", driver_id: "d" }),
      ),
    ).toBe("loading");
    expect(
      tripHubSearchStageForTrip(
        trip({ id: "d", status: "in_transit", driver_id: "d" }),
      ),
    ).toBe("in_transit");
    expect(
      tripHubSearchStageForTrip(
        trip({ id: "e", status: "unloading", driver_id: "d" }),
      ),
    ).toBe("unloading");
  });

  it("maps completed trips to Delivered and drops cancelled", () => {
    expect(
      tripHubSearchStageForTrip(
        trip({ id: "f", status: "completed", driver_id: "d" }),
      ),
    ).toBe("delivered_docs_pending");
    expect(
      tripHubSearchStageForTrip(
        trip({ id: "g", status: "cancelled", driver_id: "d" }),
      ),
    ).toBeNull();
  });
});

describe("pickTripHubSearchStage", () => {
  it("prefers the strongest score, then earlier lifecycle on ties", () => {
    expect(
      pickTripHubSearchStage([
        { tripId: "a", stage: "in_transit", score: 10 },
        { tripId: "b", stage: "assigned", score: 10 },
      ]),
    ).toBe("assigned");
    expect(
      pickTripHubSearchStage([
        { tripId: "a", stage: "assigned", score: 20 },
        { tripId: "b", stage: "delivered_docs_pending", score: 100 },
      ]),
    ).toBe("delivered_docs_pending");
  });

  it("returns null when there are no matches", () => {
    expect(pickTripHubSearchStage([])).toBeNull();
  });
});

describe("collectTripHubSearchMatches", () => {
  it("finds a trip id on In transit and scores an exact code match", () => {
    const row = trip({
      id: "hit",
      status: "in_transit",
      driver_id: "d",
      trip_number: "SAT812GOGTRIP001676",
      trip_operational_code: "SAT812GOGTRIP001676",
    });
    const matches = collectTripHubSearchMatches({
      query: "SAT812GOGTRIP001676",
      trips: [
        row,
        trip({
          id: "other",
          trip_number: "OTHER",
          trip_operational_code: "OTHER",
          display_trip_id: "OTHER",
          status: "assigned",
        }),
      ],
      organizationId: "org",
    });
    expect(matches).toEqual([
      { tripId: "hit", stage: "in_transit", score: 100 },
    ]);
    expect(pickTripHubSearchStage(matches)).toBe("in_transit");
    expect(bestTripHubSearchMatch(matches, "in_transit")?.tripId).toBe("hit");
    expect(scoreTripHubSearchMatch(row, "SAT812GOGTRIP001676", "org")).toBe(100);
  });
});
