import type { TripRow } from "@/features/trips/services/trips.service";
import {
  buildTripOpsReportRow,
  buildTripOpsReportRows,
  TRIP_OPS_REPORT_COLUMNS,
  tripOpsReportFileName,
} from "../tripOpsReport.model";

function trip(partial: Partial<TripRow> & { id: string }): TripRow {
  return {
    organization_id: "org-1",
    trip_number: "TRP001",
    indent_id: null,
    pickup_area: "Pune",
    drop_location: "Mumbai",
    client_id: null,
    client_name: "Acme",
    supplier_id: null,
    supplier_name: "Fleet Co",
    driver_id: "drv-1",
    vehicle_id: null,
    client_price: 1000,
    supplier_rate: 800,
    margin: 200,
    platform_fee: 0,
    driver_commission: 0,
    is_guaranteed: false,
    payment_status: "pending",
    amount_paid: 0,
    status: "assigned",
    pickup_date: null,
    started_at: "2026-10-01T08:00:00.000Z",
    completed_at: null,
    load_type: null,
    notes: null,
    created_at: "2026-10-01T06:00:00.000Z",
    updated_at: "2026-10-01T06:00:00.000Z",
    distance: 120,
    estimated_duration: null,
    display_trip_id: "TRP-9",
    vehicle_display_number: "MH12AB1234",
    driver_display_name: "Ravi",
    indent_reference_code: "IND-7",
    ...partial,
  } as TripRow;
}

describe("tripOpsReport.model", () => {
  it("keeps the classic TripOps column order and labels", () => {
    expect(TRIP_OPS_REPORT_COLUMNS.map((c) => c.label)).toEqual([
      "TRIP ID",
      "LR NO",
      "CLIENT",
      "SOURCE",
      "DESTINATION",
      "SUPPLIER",
      "VEHICLE NO",
      "DRIVER",
      "DRIVER NO",
      "STATUS",
      "Km",
      "Indent",
      "ASSIGNED",
      "PICKUP",
      "IN-TRANSIT",
      "ETA",
      "ARRIVED AT DROP OFF",
      "DELIVERED",
    ]);
  });

  it("maps trip / document / audit fields into the ops row", () => {
    const row = buildTripOpsReportRow(
      trip({
        id: "Trip-1",
        source_indent_code: "SRC-1",
        indent_reference_code: "",
        actual_distance_traveled_km: 99,
        distance: null,
        completed_at: "2026-10-02T18:00:00.000Z",
      }),
      {
        statusTimesByTripId: {
          "trip-1": {
            assigned: "2026-10-01T07:00:00.000Z",
            in_progress: "2026-10-01T09:00:00.000Z",
            in_transit: "2026-10-01T10:00:00.000Z",
            at_drop: "2026-10-02T12:00:00.000Z",
            completed: "2026-10-02T17:00:00.000Z",
          },
        },
        lrNumberByTripId: { "trip-1": "LR-42" },
        driverPhoneByTripId: { "Trip-1": "9876543210" },
        partyMetaByTripId: {
          "Trip-1": {
            displaySupplierName: "Meta Supplier",
            displayDriverName: "Meta Driver",
          },
        },
        clientNameForTrip: () => "Hub Client",
        stageLabelForTrip: () => "In transit",
      },
    );

    expect(row.tripId).toBe("TRP-9");
    expect(row.lrNo).toBe("LR-42");
    expect(row.client).toBe("Hub Client");
    expect(row.source).toBe("Pune");
    expect(row.destination).toBe("Mumbai");
    expect(row.supplier).toBe("Meta Supplier");
    expect(row.vehicleNo).toBe("MH12AB1234");
    expect(row.driver).toBe("Meta Driver");
    expect(row.driverNo).toBe("9876543210");
    expect(row.status).toBe("In transit");
    expect(row.km).toBe(99);
    expect(row.indent).toBe("SRC-1");
    expect(row.assigned).toContain("2026");
    expect(row.pickup).toContain("2026");
    expect(row.inTransit).toContain("2026");
    expect(row.arrivedAtDrop).toContain("2026");
    expect(row.delivered).toContain("2026");
  });

  it("falls back to trip.created_at / started_at / supplier_name / driver phone by id", () => {
    const phones = new Map<string, string>([["drv-1", "9000000000"]]);
    const row = buildTripOpsReportRow(trip({ id: "t2", display_trip_id: null }), {
      driverPhoneByDriverId: phones,
      clientNameForTrip: (t) => t.client_name ?? "",
      stageLabelForTrip: () => "Assigned",
    });
    expect(row.tripId).toBe("TRP001");
    expect(row.supplier).toBe("Fleet Co");
    expect(row.driver).toBe("Ravi");
    expect(row.driverNo).toBe("9000000000");
    expect(row.assigned).toContain("2026");
    expect(row.pickup).toContain("2026");
    expect(row.indent).toBe("IND-7");
    expect(row.km).toBe(120);
  });

  it("builds one row per trip and a dated filename", () => {
    const rows = buildTripOpsReportRows([trip({ id: "a" }), trip({ id: "b" })]);
    expect(rows).toHaveLength(2);
    expect(tripOpsReportFileName(new Date("2026-10-31T12:00:00Z"))).toBe(
      "Pulse_Trip_Report_2026-10-31.xlsx",
    );
  });
});
