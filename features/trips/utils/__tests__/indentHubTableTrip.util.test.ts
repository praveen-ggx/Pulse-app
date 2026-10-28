import {
  indentHubLaneLabel,
  indentHubTableDate,
  indentHubTableMargin,
  indentHubTableStatus,
  indentRowToHubTrip,
} from "@/features/trips/utils/indentHubTableTrip.util";
import type { IndentRow } from "@/features/indents/services/indents.service";

function indent(overrides: Partial<IndentRow> = {}): IndentRow {
  return {
    id: "ind-1",
    organization_id: "org-1",
    indent_number: "IND001",
    display_indent_id: "SAT812GOGIND003150",
    pickup_area: "Perambra",
    drop_location: "Cuttack",
    client_name: "Apollo",
    client_price: 12000,
    supplier_target: 10000,
    status: "pending",
    vehicle_type: "32 Ft MXL",
    load_type: "Tyre",
    pickup_date: "2026-10-27",
    circulation_target: "marketplace",
    created_at: "2026-10-27T00:00:00Z",
    ...overrides,
  };
}

describe("indentRowToHubTrip", () => {
  it("maps indent identity and route onto a hub table trip row", () => {
    const trip = indentRowToHubTrip(indent());
    expect(trip.id).toBe("ind-1");
    expect(trip.display_trip_id).toBe("SAT812GOGIND003150");
    expect(trip.pickup_area).toBe("Perambra");
    expect(trip.drop_location).toBe("Cuttack");
    expect(trip.client_name).toBe("Apollo");
    expect(trip.source).toBe("indent");
    expect(trip.status).toBe("pending");
    expect(trip.margin).toBe(2000);
  });
});

describe("indent hub spreadsheet cells", () => {
  it("shortens the lane and keeps the full hover path", () => {
    expect(
      indentHubLaneLabel("Bhandara, Maharashtra", "Tumakuru, Karnataka"),
    ).toEqual({
      short: "Bhandara → Tumakuru",
      full: "Bhandara, Maharashtra → Tumakuru, Karnataka",
    });
  });

  it("formats margin against sales", () => {
    expect(indentHubTableMargin(20000, 19000)).toEqual({
      amount: "₹1.0K",
      ofSales: "5% of sales",
    });
  });

  it("formats pickup day without a timezone shift", () => {
    expect(indentHubTableDate("2026-10-26")).toBe("26 Oct");
  });

  it("uses the indent lifecycle label", () => {
    expect(indentHubTableStatus("open", 0)).toBe("WAITING FOR BID");
    expect(indentHubTableStatus("open", 2)).toBe("RECEIVING BIDS");
    expect(indentHubTableStatus("cancelled", 1)).toBe("FAILED");
  });
});
