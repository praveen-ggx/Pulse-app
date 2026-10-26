import type { TripRow } from "@/features/trips/services/trips.service";
import { tripMatchesHubSearch } from "@/features/trips/utils/tripHubSearch.util";

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
