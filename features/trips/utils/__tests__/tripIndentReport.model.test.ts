import type { IndentRow } from "@/features/indents/services/indents.service";
import type { TripRow } from "@/features/trips/services/trips.service";
import {
  buildTripIndentReportRows,
  formatTonnageCapacity,
  indentIdsCoveredByTrips,
  resolveIndentId,
  resolveIndentType,
  resolvePulseId,
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
  it("maps indent type from lane and circulation", () => {
    expect(resolveIndentType({ laneId: "lane-1" })).toBe("Contract");
    expect(resolveIndentType({ circulationTarget: "marketplace" })).toBe("Spot");
    expect(resolveIndentType({ circulationTarget: "both" })).toBe("Spot");
    expect(resolveIndentType({})).toBe("ADHOC");
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
    expect(rows[0]?.pulseId).toBe("GGV234ABCTRIP000009");
    expect(rows[0]?.tripId).toBe("TRP-9");
    expect(rows[0]?.status).toBe("assigned");
    expect(rows[1]?.pulseId).toBe("GGV234ABCIND000002");
    expect(rows[1]?.tripId).toBe("");
    expect(rows[1]?.status).toBe("Pending");
  });

  it("keeps confirmed date blank for pending indents and shows Pulse ID without Trip ID", () => {
    const rows = buildTripIndentReportRows(
      [],
      [
        indent({
          id: "i1",
          status: "broadcast",
          indent_operational_code: "GGV234ABCIND000010",
        }),
      ],
      {},
      "org-1",
    );
    expect(rows[0]?.confirmedAt).toBe("");
    expect(rows[0]?.status).toBe("Pending");
    expect(rows[0]?.pulseId).toBe("GGV234ABCIND000010");
    expect(rows[0]?.tripId).toBe("");
  });

  it("builds a dated filename", () => {
    expect(tripIndentReportFileName(new Date("2026-10-23T12:00:00Z"))).toBe(
      "Pulse_Trip_Report_2026-10-23.xlsx",
    );
  });

  it("drops cost columns when finance access is off", () => {
    const withCosts = tripIndentReportColumnsForAccess(true);
    const withoutCosts = tripIndentReportColumnsForAccess(false);
    expect(withCosts).toHaveLength(TRIP_INDENT_REPORT_COLUMNS.length);
    expect(withCosts.some((c) => c.key === "clientCost")).toBe(true);
    expect(withCosts.some((c) => c.key === "indentId")).toBe(true);
    expect(withCosts.some((c) => c.key === "clientRate")).toBe(false);
    expect(withCosts.some((c) => c.key === "vendorRate")).toBe(false);
    expect(withoutCosts.some((c) => c.key === "clientCost")).toBe(false);
    expect(withoutCosts.some((c) => c.key === "supplierCost")).toBe(false);
    expect(withoutCosts.some((c) => c.key === "indentId")).toBe(true);
    expect(withoutCosts).toHaveLength(TRIP_INDENT_REPORT_COLUMNS.length - 2);
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
    expect(rows[0]?.indentId).toBe("IND-7");
    expect(rows[0]?.clientCost).toBe(20000);
    expect(rows[0]?.supplierCost).toBe(17000);
    expect(rows[0]?.tripId).toBeTruthy();
  });
});
