jest.mock("@/features/finance/services/finance.service", () => ({
  createLedgerEntry: jest.fn(),
  updateLedgerEntry: jest.fn(),
}));

import { quoteAdvancePayablesForTrips } from "@/features/tripCompliance/services/complianceAdvanceFinanceBreakdown.service";
import { previewComplianceBulkUpdate, tripIdsByLrNumber } from "@/features/tripCompliance/services/complianceBulkUpdate.service";
import { validateComplianceBulkPayments } from "@/features/tripCompliance/services/tripComplianceBulkPayment.service";
import { financialYearOf } from "@/features/suppliers/utils/supplierVendorOnboarding.util";

type Row = Record<string, unknown>;

let mockTables: Record<string, Row[]> = {};

function mockQuery(rows: Row[]) {
  const filters: Array<{ op: "eq" | "in" | "is"; column: string; value: unknown }> = [];
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  const apply = () =>
    rows.filter((row) =>
      filters.every((filter) => {
        if (filter.op === "eq") return row[filter.column] === filter.value;
        if (filter.op === "in") return (filter.value as unknown[]).includes(row[filter.column]);
        return filter.value === null ? row[filter.column] == null : row[filter.column] === filter.value;
      }),
    );
  builder.select = chain;
  builder.eq = (column: string, value: unknown) => {
    filters.push({ op: "eq", column, value });
    return builder;
  };
  builder.in = (column: string, value: unknown[]) => {
    filters.push({ op: "in", column, value });
    return builder;
  };
  builder.is = (column: string, value: unknown) => {
    filters.push({ op: "is", column, value });
    return builder;
  };
  builder.neq = chain;
  builder.or = chain;
  builder.order = chain;
  builder.limit = chain;
  builder.gt = chain;
  builder.maybeSingle = async () => ({ data: apply()[0] ?? null, error: null });
  builder.then = (resolve: (value: { data: Row[]; error: null }) => void) => resolve({ data: apply(), error: null });
  return builder;
}

jest.mock("@/lib/supabase", () => ({
  supabase: () => ({
    from: (table: string) => mockQuery(mockTables[table] ?? []),
    rpc: () => Promise.resolve({ data: [], error: null }),
    auth: { getSession: async () => ({ data: { session: null } }) },
  }),
}));

const FY = financialYearOf(new Date());
const ORG = "org-1";

function tripRow(id: string, extra: Row = {}): Row {
  return {
    id,
    organization_id: ORG,
    deleted_at: null,
    supplier_rate: 20000,
    supplier_rate_basis: "per_trip",
    load_tons: null,
    indent_id: null,
    source_indent_id: null,
    trip_code: "TRP-1042",
    client_price: 100000,
    supplier_id: "sup-1",
    compliance_verified_at: "2026-09-01",
    finance_verified_at: "2026-09-02",
    ...extra,
  };
}

beforeEach(() => {
  mockTables = {
    trips: [tripRow("trip-ok")],
    indents: [],
    suppliers: [{ id: "sup-1", organization_id: ORG, advance_percentage: 40, vendor_status: "active" }],
    supplier_tds_rates: [{ id: "tds-1", organization_id: ORG, supplier_id: "sup-1", financial_year: FY, rate_percent: 1, deleted_at: null }],
    org_document_charge_settings: [{ organization_id: ORG, enabled: true }],
    org_document_charge_slabs: [{ id: "slab-1", organization_id: ORG, min_freight: 0, max_freight: null, charge: 100, sort_order: 1 }],
    payment_requests: [],
    transactions: [],
    trip_documents: [],
  };
});

describe("quoteAdvancePayablesForTrips", () => {
  it("returns the payable, percent, freight, TDS and documentation charge", async () => {
    const quotes = await quoteAdvancePayablesForTrips(ORG, [{ id: "trip-ok", supplierId: "sup-1" }]);
    expect(quotes.get("trip-ok")).toEqual({
      payable: 7700,
      percent: 40,
      baseFreight: 20000,
      tdsAmount: 200,
      documentationCharges: 100,
    });
  });

  it("skips a trip with no freight row", async () => {
    const quotes = await quoteAdvancePayablesForTrips(ORG, [{ id: "trip-missing", supplierId: "sup-1" }]);
    expect(quotes.has("trip-missing")).toBe(false);
  });

  it("skips a trip whose payable is zero", async () => {
    mockTables.trips = [tripRow("trip-zero", { supplier_rate: 1000 })];
    mockTables.org_document_charge_slabs = [{ id: "slab-1", organization_id: ORG, min_freight: 0, max_freight: null, charge: 900, sort_order: 1 }];
    mockTables.supplier_tds_rates = [];
    const quotes = await quoteAdvancePayablesForTrips(ORG, [{ id: "trip-zero", supplierId: "sup-1" }]);
    expect(quotes.has("trip-zero")).toBe(false);
  });

  it("does not return a negative payable when charges exceed the advance", async () => {
    mockTables.trips = [tripRow("trip-negative", { supplier_rate: 1000 })];
    mockTables.org_document_charge_slabs = [{ id: "slab-1", organization_id: ORG, min_freight: 0, max_freight: null, charge: 5000, sort_order: 1 }];
    mockTables.supplier_tds_rates = [];
    const quotes = await quoteAdvancePayablesForTrips(ORG, [{ id: "trip-negative", supplierId: "sup-1" }]);
    expect(quotes.has("trip-negative")).toBe(false);
    expect([...quotes.values()].every((quote) => quote.payable > 0)).toBe(true);
  });
});

describe("saved advance stays authoritative", () => {
  const tripId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

  beforeEach(() => {
    mockTables.trips = [tripRow(tripId)];
    mockTables.org_document_charge_settings = [{ organization_id: ORG, enabled: false }];
    mockTables.org_document_charge_slabs = [];
    mockTables.supplier_tds_rates = [];
    mockTables.suppliers = [{ id: "sup-1", organization_id: ORG, advance_percentage: 90, vendor_status: "active" }];
    mockTables.payment_requests = [{
      trip_id: tripId,
      approved_amount: 8000,
      terms_snapshot: { advance_percent: 40 },
      created_at: "2026-09-02T00:00:00Z",
      payment_type: "advance",
      status: "approved",
    }];
  });

  it("keeps the saved amount and percent when the file amount is blank", async () => {
    const result = await validateComplianceBulkPayments({
      organizationId: ORG,
      category: "compliance_advance",
      rows: [{ rowIndex: 2, tripId, amount: null, paymentModeId: "UPI", utr: "UTR-SAVED" }],
    });
    expect(result.invalid).toEqual([]);
    expect(result.valid[0].row.amount).toBe(8000);
    expect(result.valid[0].row.advancePercent).toBe(40);
  });

  it("keeps a matching file amount and does not adopt the quote percent", async () => {
    const result = await validateComplianceBulkPayments({
      organizationId: ORG,
      category: "compliance_advance",
      rows: [{ rowIndex: 2, tripId, amount: 8000, paymentModeId: "UPI", utr: "UTR-SAVED" }],
    });
    expect(result.valid[0].row.amount).toBe(8000);
    expect(result.valid[0].row.advancePercent).toBe(40);
  });

  it("keeps a different reachable file amount and updates only the percent", async () => {
    const result = await validateComplianceBulkPayments({
      organizationId: ORG,
      category: "compliance_advance",
      rows: [{ rowIndex: 2, tripId, amount: 9000, paymentModeId: "UPI", utr: "UTR-SAVED" }],
    });
    expect(result.invalid).toEqual([]);
    expect(result.valid[0].row.amount).toBe(9000);
    expect(result.valid[0].row.advancePercent).toBe(45);
  });
});

describe("tripIdsByLrNumber", () => {
  const local = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
  const second = "cccccccc-cccc-cccc-cccc-cccccccccccc";
  const otherOrg = "dddddddd-dddd-dddd-dddd-dddddddddddd";

  beforeEach(() => {
    mockTables.trips = [
      tripRow(local, { trip_code: "TRP-1" }),
      tripRow(second, { trip_code: "TRP-2" }),
      tripRow(otherOrg, { organization_id: "org-2", trip_code: "TRP-9" }),
    ];
    mockTables.trip_documents = [
      { trip_id: local, document_type: "lr", document_number: "LR-100" },
      { trip_id: second, document_type: "lr", document_number: JSON.stringify({ lrNumber: "LR-55", invoice: "LR-1009" }) },
      { trip_id: local, document_type: "lr", document_number: "LR-55" },
      { trip_id: otherOrg, document_type: "lr", document_number: "LR-OTHER" },
    ];
  });

  it("matches the parsed LR exactly", async () => {
    const found = await tripIdsByLrNumber(ORG, ["lr-100"]);
    expect(found.get("LR-100")).toEqual([local]);
  });

  it("does not confirm a substring that is not the stored LR", async () => {
    const found = await tripIdsByLrNumber(ORG, ["LR-1009"]);
    expect(found.has("LR-1009")).toBe(false);
  });

  it("returns every local trip that stores the same LR", async () => {
    const found = await tripIdsByLrNumber(ORG, ["LR-55"]);
    expect(found.get("LR-55")?.sort()).toEqual([local, second].sort());
  });

  it("returns no trip when nothing stores that LR", async () => {
    const found = await tripIdsByLrNumber(ORG, ["LR-NONE"]);
    expect(found.size).toBe(0);
  });

  it("excludes a trip from another organization", async () => {
    const found = await tripIdsByLrNumber(ORG, ["LR-OTHER"]);
    expect(found.has("LR-OTHER")).toBe(false);
  });
});

describe("previewComplianceBulkUpdate", () => {
  const local = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

  beforeEach(() => {
    mockTables.trips = [tripRow(local, { trip_code: "TRP-1042" })];
    mockTables.trip_documents = [{ trip_id: local, document_type: "lr", document_number: "LR-9" }];
    mockTables.transactions = [];
  });

  it("resolves a blank Trip ID from the LR", async () => {
    const [row] = await previewComplianceBulkUpdate({
      organizationId: ORG,
      category: "compliance_advance",
      rows: [{ rowIndex: 2, tripKey: "", lrKey: "LR-9", amount: null, mode: "", date: "", utr: "UTR1", remarks: "" }],
    });
    expect(row.tripId).toBe(local);
    expect(row.tag).not.toBe("invalid");
  });

  it("still resolves an existing Trip ID", async () => {
    const [row] = await previewComplianceBulkUpdate({
      organizationId: ORG,
      category: "compliance_advance",
      rows: [{ rowIndex: 2, tripKey: "TRP-1042", amount: null, mode: "", date: "", utr: "UTR1", remarks: "" }],
    });
    expect(row.tripId).toBe(local);
    expect(row.tag).not.toBe("invalid");
  });
});
