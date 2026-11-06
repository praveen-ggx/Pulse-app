import type { TripRow } from "@/features/trips/services/trips.service";
import {
  scoreTripLrHubSearchMatch,
  tripMatchesHubSearch,
} from "@/features/trips/utils/tripHubSearch.util";

function trip(partial: Partial<TripRow> & Pick<TripRow, "id">): TripRow {
  return {
    organization_id: "org",
    status: "in_transit",
    pickup_area: "Chennai",
    drop_location: "Hyderabad",
    client_name: "Berger",
    supplier_name: "Hema Sai Transport",
    driver_display_name: "Babu Gandrati",
    vehicle_display_number: "TN09AB1234",
    trip_number: "TRP8559",
    display_trip_id: "TRP8559",
    ...partial,
  } as TripRow;
}

describe("scoreTripLrHubSearchMatch", () => {
  it("scores exact and folded LR numbers as strong", () => {
    expect(scoreTripLrHubSearchMatch("AI1050", "AI1050")).toBe(100);
    expect(scoreTripLrHubSearchMatch("AI-1050", "ai1050")).toBe(100);
    expect(scoreTripLrHubSearchMatch("AI1050, AI1051", "AI1050")).toBe(100);
    expect(scoreTripLrHubSearchMatch("AI1050", "AI10")).toBe(85);
    expect(scoreTripLrHubSearchMatch("", "AI1050")).toBe(0);
  });
});

describe("tripMatchesHubSearch", () => {
  const row = trip({ id: "t1" });

  it("matches trip id, client, supplier, driver, vehicle, and LR", () => {
    expect(tripMatchesHubSearch(row, "trp8559")).toBe(true);
    expect(tripMatchesHubSearch(row, "berger")).toBe(true);
    expect(tripMatchesHubSearch(row, "hema")).toBe(true);
    expect(tripMatchesHubSearch(row, "babu")).toBe(true);
    expect(tripMatchesHubSearch(row, "tn09ab")).toBe(true);
    expect(tripMatchesHubSearch(row, "TN 09 AB 1234")).toBe(true);
    expect(
      tripMatchesHubSearch(row, "ai3524", { lrLabel: "AI3524" }),
    ).toBe(true);
    expect(tripMatchesHubSearch(row, "nope")).toBe(false);
    expect(tripMatchesHubSearch(row, "  ")).toBe(true);
  });
});
