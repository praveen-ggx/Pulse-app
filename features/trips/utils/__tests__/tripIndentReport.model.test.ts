import type { IndentRow } from "@/features/indents/services/indents.service";
import type { TripRow } from "@/features/trips/services/trips.service";
import {
  buildTripIndentReportRows,
  formatTonnageCapacity,
  indentIdsCoveredByTrips,
  resolveIndentId,
  resolveIndentType,
  resolvePulseId,
  reportIdentityIds,
  resolveTripIndentReportAudience,
  tripIndentReportColumnsForAccess,
  tripIndentReportFileName,
  TRIP_INDENT_REPORT_COLUMNS,
} from "../tripIndentReport.model";

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
    driver_id: null,
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
    started_at: null,
    completed_at: null,
    load_type: null,
    notes: null,
    created_at: "2026-10-01T10:00:00.000Z",
    updated_at: "2026-10-01T10:00:00.000Z",
    distance: null,
    estimated_duration: null,
    ...partial,
  } as TripRow;
}

function indent(partial: Partial<IndentRow> & { id: string }): IndentRow {
  return {
    organization_id: "org-1",
    indent_number: "IND001",
    pickup_area: "Pune",
    drop_location: "Mumbai",
    client_name: "Acme",
    client_price: 1000,
    supplier_target: 800,
    status: "pending",
    vehicle_type: "Open 20 Feet",
    load_type: "FMCG",
    pickup_date: null,
    circulation_target: "offline",
    created_at: "2026-10-01T09:00:00.000Z",
    ...partial,
  } as IndentRow;
}

describe("tripIndentReport.model", () => {
  it("marks a saved lane as Contract and everything else as Adhoc", () => {
    expect(resolveIndentType({ laneId: "lane-1" })).toBe("Contract");
    expect(resolveIndentType({ laneId: "lane-1", circulationTarget: "marketplace" })).toBe(
      "Contract",
    );
    expect(resolveIndentType({ circulationTarget: "marketplace" })).toBe("Adhoc");
    expect(resolveIndentType({ circulationTarget: "both" })).toBe("Adhoc");
    expect(resolveIndentType({})).toBe("Adhoc");
  });

  it("formats tonnage from capacity, load tons, or indent kg", () => {
    expect(formatTonnageCapacity({ vehicleCapacity: "18 MT" })).toBe("18 MT");
    expect(formatTonnageCapacity({ loadTons: 7.5 })).toBe("7.5 MT");
    expect(formatTonnageCapacity({ weightKg: 9000 })).toBe("9 MT");
    expect(formatTonnageCapacity({})).toBe("");
  });

  it("covers indent ids from indent_id and source_indent_id", () => {
    const covered = indentIdsCoveredByTrips([
      trip({ id: "t1", indent_id: "i1" }),
      trip({ id: "t2", indent_id: null, source_indent_id: "i2" }),
    ]);
    expect(covered.has("i1")).toBe(true);
    expect(covered.has("i2")).toBe(true);
  });

  it("resolves Pulse ID from operational codes only (not Trip ID)", () => {
    expect(
      resolvePulseId({
        tripOperationalCode: "GGV234ABCTRIP000001",
        tripCode: "GGV234-TRP-001",
      }),
    ).toBe("GGV234ABCTRIP000001");
    expect(resolvePulseId({ indentCode: "GGV234-IND-001" })).toBe("GGV234-IND-001");
    expect(resolvePulseId({})).toBe("");
  });

  it("emits one trip row and drops the matching indent (no duplicate)", () => {
    const rows = buildTripIndentReportRows(
      [
        trip({
          id: "t1",
          indent_id: "i1",
          display_trip_id: "TRP-9",
          trip_operational_code: "GGV234ABCTRIP000009",
        }),
      ],
      [
        indent({
          id: "i1",
          status: "awarded",
          indent_operational_code: "GGV234ABCIND000001",
        }),
        indent({
          id: "i2",
          status: "pending",
          indent_operational_code: "GGV234ABCIND000002",
        }),
      ],
      {},
      "org-1",
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]?.serial).toBe(1);
    expect(rows[0]?.indentId).toBe("IND001");
    expect(rows[0]?.pulseId).toBe("GGV234ABCIND000001");
    expect(rows[0]?.tripId).toBe("TRP-9");
    expect(rows[0]?.pulseId).not.toBe("GGV234ABCTRIP000009");
    expect(rows[0]?.status).toBe("Assigned");
    expect(rows[1]?.serial).toBe(2);
    expect(rows[1]?.pulseId).toBe("GGV234ABCIND000002");
    expect(rows[1]?.tripId).toBe("");
    expect(rows[1]?.status).toBe("Created");
  });

  it("shows the indent creator, not the person who later created the trip", () => {
    const rows = buildTripIndentReportRows(
      [
        trip({
          id: "t1",
          indent_id: "i1",
          created_by_user_id: "praveen",
          created_at: "2026-11-16T10:00:00.000Z",
        }),
      ],
      [
        indent({
          id: "i1",
          created_by_user_id: "sandra",
          created_at: "2026-09-04T04:30:00.000Z",
        }),
      ],
      {
        creatorNameByUserId: {
          sandra: "Sandramariyamshaji",
          praveen: "Praveen R",
        },
      },
      "org-1",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.createdBy).toBe("Sandramariyamshaji");
    expect(rows[0]?.indentDate).toBe("04 Sept 2026");
    expect(rows[0]?.awardedDate).toBe("");
  });

  it("keeps the awarded date blank until the indent is awarded", () => {
    const rows = buildTripIndentReportRows(
      [],
      [
        indent({
          id: "i1",
          status: "broadcast",
          indent_operational_code: "GGV234ABCIND000010",
          pickup_area: "Chennai, Tamil Nadu",
        }),
      ],
      {},
      "org-1",
    );
    expect(rows[0]?.awardedDate).toBe("");
    expect(rows[0]?.status).toBe("Created");
    expect(rows[0]?.region).toBe("South");
    expect(rows[0]?.commercialType).toBe("Adhoc");
    expect(rows[0]?.pulseId).toBe("GGV234ABCIND000010");
    expect(rows[0]?.tripId).toBe("");
  });

  it("uses the stored lane for Contract even when the trip payload omitted it", () => {
    const rows = buildTripIndentReportRows(
      [
        trip({
          id: "t1",
          indent_id: "i1",
          vehicle_display_number: "",
          vehicle_id: "v1",
          status: "awarded",
        }),
      ],
      [
        indent({
          id: "i1",
          status: "awarded",
          lane_id: null,
          circulation_target: "marketplace",
          cancel_reason: null,
        }),
      ],
      {
        laneIdByTripId: { t1: "lane-contract" },
        vehicleById: {
          v1: { vehicleType: "Open", capacity: "16 MT", vehicleNumber: "TN01AB1234" },
        },
        confirmedAtByIndentId: { i1: "2026-11-02T08:30:00.000Z" },
      },
      "org-1",
    );
    expect(rows[0]?.commercialType).toBe("Contract");
    expect(rows[0]?.truckNumber).toBe("TN01AB1234");
    expect(rows[0]?.status).toBe("Assigned");
    expect(rows[0]?.awardedDate).not.toBe("");
  });

  it("uses the supplier, driver, and trip cancel category stored beside the trip", () => {
    const rows = buildTripIndentReportRows(
      [
        trip({
          id: "t1",
          indent_id: "i1",
          supplier_id: "sup-1",
          supplier_name: "",
          driver_id: "drv-1",
          driver_display_name: "",
          vehicle_display_number: "",
          status: "cancelled",
        }),
      ],
      [indent({ id: "i1", status: "awarded", lane_id: "lane-1" })],
      {
        supplierNameBySupplierId: { "sup-1": "South Haul" },
        driverNameByDriverId: { "drv-1": "Ravi" },
        tripCancelByTripId: { t1: { reason: "client_requested", note: "" } },
      },
      "org-1",
    );
    expect(rows[0]?.commercialType).toBe("Contract");
    expect(rows[0]?.supplierName).toBe("South Haul");
    expect(rows[0]?.driverName).toBe("Ravi");
    expect(rows[0]?.status).toBe("Client requested cancellation");
  });

  it("shows the stored cancel and expiry category", () => {
    const rows = buildTripIndentReportRows(
      [],
      [
        indent({
          id: "i1",
          status: "cancelled",
          cancel_reason: "wrong_entry",
        }),
        indent({
          id: "i2",
          status: "expired",
          cancel_reason: "indent_expired",
        }),
        indent({
          id: "i3",
          status: "cancelled",
          cancel_reason: "client_cancelled",
        }),
      ],
      {},
      "org-1",
    );
    expect(rows.map((row) => row.status)).toEqual([
      "Wrong entry",
      "Indent expired",
      "Cancelled by client",
    ]);
  });

  it("builds a dated filename", () => {
    expect(tripIndentReportFileName(new Date("2026-10-23T12:00:00Z"))).toBe(
      "Pulse_Trip_Report_2026-10-23.xlsx",
    );
  });

  it("keeps the MIR columns in order, including both prices", () => {
    const columns = tripIndentReportColumnsForAccess(false);
    expect(columns.map((column) => column.label)).toEqual([
      "S.No",
      "Customer (Client Name)",
      "Region",
      "Adhoc / Contract",
      "Source",
      "Destination",
      "Supplier Name",
      "Truck Number",
      "Truck Type",
      "Ton",
      "Driver Name",
      "Driver Number",
      "Indent Date",
      "Indent Awarded Date",
      "Customer Price",
      "Supplier Price",
      "Status",
      "Indent ID",
      "Pulse ID",
      "Trip ID",
      "Created By",
    ]);
    expect(columns).toHaveLength(TRIP_INDENT_REPORT_COLUMNS.length);
    expect(tripIndentReportColumnsForAccess(true)).toEqual(columns);
  });

  it("resolves report audience from member domains (Sales wins when both)", () => {
    expect(resolveTripIndentReportAudience({ sales: true, tripops: false })).toBe(
      "sales",
    );
    expect(resolveTripIndentReportAudience({ sales: false, tripops: true })).toBe(
      "tripops",
    );
    expect(resolveTripIndentReportAudience({ sales: true, tripops: true })).toBe(
      "sales",
    );
    expect(resolveTripIndentReportAudience({ sales: false, tripops: false })).toBe(
      "tripops",
    );
  });

  it("keeps Indent ID, Pulse ID, and Trip ID on different fields", () => {
    expect(
      reportIdentityIds({
        indent: {
          display_indent_id: "IND003359",
          indent_number: "IND003359",
          indent_operational_code: "SAT812GOGIND003360",
          indent_code: "SAT812-IND-003359",
        },
        trip: {
          display_trip_id: "TRP001933",
          trip_number: "TRP001933",
        },
      }),
    ).toEqual({
      indentId: "IND003359",
      pulseId: "SAT812GOGIND003360",
      tripId: "TRP001933",
    });
    expect(
      reportIdentityIds({
        indent: {
          display_indent_id: "IND003375",
          indent_operational_code: "SAT812GOGIND003376",
        },
        trip: null,
      }).tripId,
    ).toBe("");
  });

  it("resolves Indent ID from display codes (never UUID)", () => {
    expect(
      resolveIndentId({
        tripIndentNumber: "IND-42",
        indentOperationalCode: "GGV234ABCIND000042",
      }),
    ).toBe("IND-42");
    expect(
      resolveIndentId({
        indentOperationalCode: "GGV234ABCIND000042",
        indentCode: "GGV234-IND-042",
      }),
    ).toBe("GGV234ABCIND000042");
  });

  it("includes Indent ID with Client Cost and Supplier Cost on trip rows", () => {
    const rows = buildTripIndentReportRows(
      [
        trip({
          id: "t1",
          indent_id: "i1",
          indent_number: "IND-7",
          client_price: 20000,
          supplier_rate: 17000,
        }),
      ],
      [indent({ id: "i1", indent_code: "GGV-IND-7" })],
      {},
      "org-1",
    );
    expect(rows[0]?.indentId).toBe("IND001");
    expect(rows[0]?.pulseId).toBe("GGV-IND-7");
    expect(rows[0]?.customerPrice).toBe(20000);
    expect(rows[0]?.supplierPrice).toBe(17000);
    expect(rows[0]?.tripId).toBeTruthy();
  });
});
