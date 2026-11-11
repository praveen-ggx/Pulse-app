jest.mock("expo-sharing", () => ({
  isAvailableAsync: jest.fn(async () => false),
  shareAsync: jest.fn(async () => undefined),
}));
jest.mock("expo-file-system/legacy", () => ({
  cacheDirectory: "/tmp/",
  writeAsStringAsync: jest.fn(async () => undefined),
}));

import type { TripRow } from "@/features/trips/services/trips.service";
import {
  buildTripOpsReportRow,
  buildTripOpsReportRows,
  resolveTripOpsReportKm,
  TRIP_OPS_REPORT_COLUMNS,
  tripOpsReportFileName,
} from "../tripOpsReport.model";
import { buildTripOpsReportWorkbook } from "../tripOpsReportExport.util";

function trip(partial: Partial<TripRow> & { id: string }): TripRow {
  return {
    organization_id: "org-1",
    trip_number: "TRP001",
    indent_id: "indent-1",
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
  it("keeps the All Trips 20-column contract", () => {
    expect(TRIP_OPS_REPORT_COLUMNS.map((c) => c.label)).toEqual([
      "ID",
      "TRIP ID",
      "LR NO",
      "CLIENT",
      "SOURCE",
      "DESTINATION",
      "SUPPLIER",
      "VEHICLE NO",
      "DRIVER NAME",
      "DRIVER NO",
      "TRIP STATUS",
      "KM",
      "INDENT DATE",
      "ASSIGNED DATE",
      "PICKUP",
      "IN-TRANSIT",
      "ETA",
      "ARRIVED AT DROP OFF",
      "DELIVERED",
      "POD soft copy uploaded by",
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
        softCopyUploaderByTripId: { "trip-1": "Rithvik" },
        indentCreatedAtByIndentId: {
          "indent-1": "2026-09-30T05:00:00.000Z",
        },
      },
    );

    expect(row.id).toBe("SRC-1");
    expect(row.tripId).toBe("TRP-9");
    expect(row.lrNo).toBe("LR-42");
    expect(row.client).toBe("Hub Client");
    expect(row.source).toBe("Pune");
    expect(row.destination).toBe("Mumbai");
    expect(row.supplier).toBe("Meta Supplier");
    expect(row.vehicleNo).toBe("MH12AB1234");
    expect(row.driverName).toBe("Meta Driver");
    expect(row.driverNo).toBe("9876543210");
    expect(row.tripStatus).toBe("In transit");
    expect(row.km).toBe(99);
    expect(row.indentDate).toContain("2026");
    expect(row.assignedDate).toContain("2026");
    expect(row.pickup).toContain("2026");
    expect(row.inTransit).toContain("2026");
    expect(row.arrivedAtDrop).toContain("2026");
    expect(row.delivered).toContain("2026");
    expect(row.softCopyUploadedBy).toBe("Rithvik");
  });

  it("falls back to trip.created_at / started_at / supplier_name / driver phone by id", () => {
    const phones = new Map<string, string>([["drv-1", "9000000000"]]);
    const row = buildTripOpsReportRow(trip({ id: "t2", display_trip_id: null }), {
      driverPhoneByDriverId: phones,
      clientNameForTrip: (t) => t.client_name ?? "",
      stageLabelForTrip: () => "Assigned",
    });
    expect(row.id).toBe("IND-7");
    expect(row.tripId).toBe("TRP001");
    expect(row.supplier).toBe("Fleet Co");
    expect(row.driverName).toBe("Ravi");
    expect(row.driverNo).toBe("9000000000");
    expect(row.assignedDate).toContain("2026");
    expect(row.pickup).toContain("2026");
    expect(row.indentDate).toContain("2026");
    expect(row.km).toBe(120);
  });

  it("builds one row per trip and a dated filename", () => {
    const rows = buildTripOpsReportRows([
      trip({ id: "a" }),
      trip({ id: "b", indent_reference_code: "SAT812GO" }),
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0].id).toBe("IND-7");
    expect(rows[1].id).toBe("SAT812GO");
    expect(tripOpsReportFileName(new Date("2026-10-31T12:00:00Z"))).toBe(
      "Pulse_Trip_Report_2026-10-31.xlsx",
    );
  });

  it("fills KM from odometer/GPS/odometer-delta/override when planned distance is missing", () => {
    expect(
      resolveTripOpsReportKm(
        trip({ id: "k1", distance: null, odometer_distance_km: 245.6 }),
      ),
    ).toBe(245.6);
    expect(
      resolveTripOpsReportKm(
        trip({
          id: "k2",
          distance: null,
          odometer_distance_km: null,
          gps_distance_km: 88,
        }),
      ),
    ).toBe(88);
    expect(
      resolveTripOpsReportKm(trip({ id: "k3", distance: "150 km" as unknown as number })),
    ).toBe(150);
    expect(
      resolveTripOpsReportKm(
        trip({
          id: "k4",
          distance: null,
          start_odometer_km: 1000,
          end_odometer_km: 1125.5,
        }),
      ),
    ).toBe(125.5);
    expect(
      resolveTripOpsReportKm(trip({ id: "k5", distance: null }), 333),
    ).toBe(333);
    // Card-style estimate: Pune → Mumbai crow-fly × 1.3 when DB km is missing.
    const estimated = resolveTripOpsReportKm(
      trip({
        id: "k6",
        distance: null,
        pickup_area: "Pune",
        drop_location: "Mumbai",
      }),
    );
    expect(typeof estimated).toBe("number");
    expect(estimated).toBeGreaterThan(100);
    // Shared India city table (TripMap) — cities not in the tiny trip-detail list.
    const nashikNagpur = resolveTripOpsReportKm(
      trip({
        id: "k7",
        distance: null,
        pickup_area: "Nashik, Maharashtra",
        drop_location: "Nagpur",
      }),
    );
    expect(typeof nashikNagpur).toBe("number");
    expect(nashikNagpur).toBeGreaterThan(100);
    // Stored coords when place names are unknown to the city tables.
    const fromCoords = resolveTripOpsReportKm(
      trip({
        id: "k8",
        distance: null,
        pickup_area: "Custom warehouse A",
        drop_location: "Custom warehouse B",
        pickup_lat: 18.5,
        pickup_lon: 73.8,
        drop_lat: 19.0,
        drop_lon: 72.8,
      }),
    );
    expect(typeof fromCoords).toBe("number");
    expect(fromCoords).toBeGreaterThan(50);
    // null lat/lon must not become 0,0 — fall through to city names.
    const fromNamesDespiteNullCoords = resolveTripOpsReportKm(
      trip({
        id: "k9",
        distance: null,
        pickup_area: "Pune, Maharashtra",
        drop_location: "Chennai, Tamil Nadu",
        pickup_lat: null,
        pickup_lon: null,
        drop_lat: null,
        drop_lon: null,
      }),
    );
    expect(typeof fromNamesDespiteNullCoords).toBe("number");
    expect(fromNamesDespiteNullCoords).toBeGreaterThan(500);
    // Hosur is on the expanded city table (Manifest Range sample trip).
    const hosurChennai = resolveTripOpsReportKm(
      trip({
        id: "k10",
        distance: null,
        pickup_area: "Hosur, Tamil Nadu",
        drop_location: "Chennai, Tamil Nadu",
        pickup_lat: null,
        pickup_lon: null,
        drop_lat: null,
        drop_lon: null,
      }),
    );
    expect(typeof hosurChennai).toBe("number");
    expect(hosurChennai).toBeGreaterThan(200);
  });

  it("writes a styled All Trips sheet with headers on row 1", () => {
    const wb = buildTripOpsReportWorkbook([
      buildTripOpsReportRow(trip({ id: "sheet-1" })),
    ]);
    expect(wb.SheetNames).toEqual(["All Trips"]);
    const sheet = wb.Sheets["All Trips"];
    expect(sheet.A1?.v).toBe("ID");
    expect(sheet.L1?.v).toBe("KM");
    expect(sheet.T1?.v).toBe("POD soft copy uploaded by");
    expect(sheet.A2?.v).toBe("IND-7");
    expect(sheet.L2?.v).toBe(120);
    expect(sheet.A1?.s?.fill?.fgColor?.rgb).toBe("B4C6E7");
    expect(sheet.A1?.s?.font?.bold).toBe(true);
    expect(sheet.A2?.s?.border?.top?.style).toBe("thin");
  });
});
