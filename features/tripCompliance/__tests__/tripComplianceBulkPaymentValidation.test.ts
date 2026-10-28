// See tripComplianceBulkPayment.service.test.ts for why finance.service is mocked here.
jest.mock("@/features/finance/services/finance.service", () => ({
  createLedgerEntry: jest.fn(),
  updateLedgerEntry: jest.fn(),
}));

import { validateComplianceBulkPayments } from "@/features/tripCompliance/services/tripComplianceBulkPayment.service";
import type { TripRow } from "@/features/trips/services/trips.service";

/**
 * Minimal thenable query-builder mock — mirrors how supabase-js's
 * PostgrestFilterBuilder resolves on `await` after chained `.select()/.eq()/.in()`
 * calls, without needing the real client.
 */
function mockMakeThenable<T>(result: { data: T; error: null }) {
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  // Single-page fake: the keyset follow-up page (`gt("id", …)`) is empty.
  let current: { data: unknown; error: null } = result;
  builder.select = chain;
  builder.eq = chain;
  builder.in = chain;
  builder.order = chain;
  builder.limit = chain;
  builder.gt = () => {
    current = { data: [], error: null };
    return builder;
  };
  builder.then = (resolve: (v: typeof result) => void) => resolve(current as typeof result);
  return builder;
}

const TRIP_1 = { id: "trip-1", organization_id: "org-1" } as unknown as TripRow;
const TRIP_1_VERIFIED = {
  id: "trip-1",
  organization_id: "org-1",
  compliance_verified_at: "2026-09-01",
  finance_verified_at: "2026-09-02",
} as unknown as TripRow;
const TRIP_2 = { id: "trip-2", organization_id: "org-1" } as unknown as TripRow;

function verifiedRequiredDocs(tripId: string) {
  return ["lr", "eway_bill", "invoice"].map((type) => ({
    id: `${tripId}-${type}`,
    trip_id: tripId,
    document_type: type,
    file_name: `${type}.pdf`,
    storage_path: type,
    uploaded_at: "2026-09-01",
    status: "verified",
    verified_by: "u1",
    verified_at: "2026-09-01",
    rejection_reason: null,
  }));
}

let mockTripsResult: { data: unknown[]; error: null };
let mockTxnsResult: { data: unknown[]; error: null };
let mockDocsResult: { data: unknown[]; error: null };

jest.mock("@/lib/supabase", () => ({
  supabase: () => ({
    from: (table: string) => {
      if (table === "trips") return mockMakeThenable(mockTripsResult);
      if (table === "transactions") return mockMakeThenable(mockTxnsResult);
      if (table === "trip_documents") return mockMakeThenable(mockDocsResult);
      throw new Error(`unexpected table ${table}`);
    },
  }),
}));

describe("validateComplianceBulkPayments", () => {
  beforeEach(() => {
    mockTripsResult = { data: [TRIP_1, TRIP_2], error: null };
    mockTxnsResult = { data: [], error: null };
    mockDocsResult = { data: [], error: null };
  });

  it("accepts well-formed rows referencing real, org-scoped trips", async () => {
    mockTripsResult = { data: [TRIP_1_VERIFIED, TRIP_2], error: null };
    mockDocsResult = { data: verifiedRequiredDocs("trip-1"), error: null };
    const result = await validateComplianceBulkPayments({
      organizationId: "org-1",
      category: "compliance_advance",
      rows: [
        { rowIndex: 2, tripId: "trip-1", amount: 5000, paymentModeId: "UPI", utr: "UTR001" },
      ],
    });
    expect(result.valid).toHaveLength(1);
    expect(result.invalid).toHaveLength(0);
  });

  it("rejects a Trip ID that isn't found in this organization", async () => {
    const result = await validateComplianceBulkPayments({
      organizationId: "org-1",
      category: "compliance_advance",
      rows: [{ rowIndex: 2, tripId: "trip-unknown", amount: 5000, paymentModeId: "UPI", utr: "UTR001" }],
    });
    expect(result.valid).toHaveLength(0);
    expect(result.invalid[0].errors).toContain("Trip ID not found in this organization");
  });

  it("rejects an invalid amount", async () => {
    const result = await validateComplianceBulkPayments({
      organizationId: "org-1",
      category: "compliance_advance",
      rows: [{ rowIndex: 2, tripId: "trip-1", amount: -5, paymentModeId: "UPI", utr: "UTR001" }],
    });
    expect(result.invalid[0].errors).toContain("Invalid amount");
  });

  it("rejects an invalid payment mode", async () => {
    const result = await validateComplianceBulkPayments({
      organizationId: "org-1",
      category: "compliance_advance",
      rows: [{ rowIndex: 2, tripId: "trip-1", amount: 5000, paymentModeId: "BITCOIN", utr: "UTR001" }],
    });
    expect(result.invalid[0].errors.some((e) => e.includes("Invalid payment mode"))).toBe(true);
  });

  it("rejects a duplicate UTR against an already-posted compliance transaction", async () => {
    mockTxnsResult = {
      data: [{ trip_id: "trip-1", description: "Compliance Advance | Mode: UPI | UTR: UTR001", ledger_category: "compliance_advance" }],
      error: null,
    };
    const result = await validateComplianceBulkPayments({
      organizationId: "org-1",
      category: "compliance_advance",
      rows: [{ rowIndex: 2, tripId: "trip-1", amount: 5000, paymentModeId: "UPI", utr: "UTR001" }],
    });
    expect(result.invalid[0].errors.some((e) => e.includes("Duplicate UTR"))).toBe(true);
  });

  it("rejects a duplicate UTR appearing twice within the same batch, keeping the first row valid", async () => {
    mockTripsResult = { data: [TRIP_1_VERIFIED, TRIP_2], error: null };
    mockDocsResult = { data: verifiedRequiredDocs("trip-1"), error: null };
    const result = await validateComplianceBulkPayments({
      organizationId: "org-1",
      category: "compliance_advance",
      rows: [
        { rowIndex: 2, tripId: "trip-1", amount: 5000, paymentModeId: "UPI", utr: "UTR001" },
        { rowIndex: 3, tripId: "trip-1", amount: 3000, paymentModeId: "UPI", utr: "UTR001" },
      ],
    });
    expect(result.valid).toHaveLength(1);
    expect(result.valid[0].row.rowIndex).toBe(2);
    expect(result.invalid).toHaveLength(1);
    expect(result.invalid[0].row.rowIndex).toBe(3);
  });

  it("never partially silent-processes: every input row is accounted for in valid+invalid", async () => {
    const result = await validateComplianceBulkPayments({
      organizationId: "org-1",
      category: "compliance_advance",
      rows: [
        { rowIndex: 2, tripId: "trip-1", amount: 5000, paymentModeId: "UPI", utr: "UTR001" },
        { rowIndex: 3, tripId: "trip-unknown", amount: 100, paymentModeId: "CASH" },
        { rowIndex: 4, tripId: "trip-2", amount: -1, paymentModeId: "CASH" },
      ],
    });
    expect(result.valid.length + result.invalid.length + result.blocked.length + result.alreadyPaid.length).toBe(3);
  });

  it("blocks advance when a required document is missing", async () => {
    mockDocsResult = {
      data: verifiedRequiredDocs("trip-1").filter((d) => d.document_type !== "invoice"),
      error: null,
    };
    const result = await validateComplianceBulkPayments({
      organizationId: "org-1",
      category: "compliance_advance",
      rows: [{ rowIndex: 2, tripId: "trip-1", amount: 5000, paymentModeId: "CASH" }],
    });
    expect(result.valid).toHaveLength(0);
    expect(result.blocked[0].gateReason).toBe("Invoice missing");
  });

  it("blocks advance when required documents are pending verification", async () => {
    mockDocsResult = {
      data: ["lr", "eway_bill", "invoice"].map((type) => ({
        id: type,
        trip_id: "trip-1",
        document_type: type,
        file_name: `${type}.pdf`,
        storage_path: type,
        uploaded_at: "2026-09-01",
        status: "pending",
        verified_by: null,
        verified_at: null,
        rejection_reason: null,
      })),
      error: null,
    };
    const result = await validateComplianceBulkPayments({
      organizationId: "org-1",
      category: "compliance_advance",
      rows: [{ rowIndex: 2, tripId: "trip-1", amount: 5000, paymentModeId: "CASH" }],
    });
    expect(result.blocked[0].gateReason).toBe("LR pending verification");
  });

  it("blocks advance when documents are verified but Compliance is not marked verified", async () => {
    mockDocsResult = { data: verifiedRequiredDocs("trip-1"), error: null };
    const result = await validateComplianceBulkPayments({
      organizationId: "org-1",
      category: "compliance_advance",
      rows: [{ rowIndex: 2, tripId: "trip-1", amount: 5000, paymentModeId: "CASH" }],
    });
    expect(result.blocked[0].gateReason).toBe("Compliance verification not completed");
  });

  it("rejects a duplicate reference read from the structured payment_reference column, not just parsed description", async () => {
    mockTxnsResult = {
      data: [
        {
          trip_id: "trip-1",
          description: "Compliance Advance | Mode: UPI",
          payment_reference: "UTR001",
          ledger_category: "compliance_advance",
        },
      ],
      error: null,
    };
    const result = await validateComplianceBulkPayments({
      organizationId: "org-1",
      category: "compliance_advance",
      rows: [{ rowIndex: 2, tripId: "trip-1", amount: 5000, paymentModeId: "UPI", utr: "UTR001" }],
    });
    expect(result.invalid[0].errors.some((e) => e.includes("Duplicate UTR"))).toBe(true);
  });

  it("rejects a row whose amount exceeds the trip's client_price", async () => {
    const tripWithPrice = { id: "trip-1", organization_id: "org-1", client_price: 10000 } as unknown as TripRow;
    mockTripsResult = { data: [tripWithPrice, TRIP_2], error: null };
    const result = await validateComplianceBulkPayments({
      organizationId: "org-1",
      category: "compliance_advance",
      rows: [{ rowIndex: 2, tripId: "trip-1", amount: 50000, paymentModeId: "CASH" }],
    });
    expect(result.invalid[0].errors.some((e) => e.includes("exceeds the trip value"))).toBe(true);
  });

  it("sends already-posted advances to alreadyPaid instead of eligible", async () => {
    mockTxnsResult = {
      data: [{ trip_id: "trip-1", ledger_category: "compliance_advance", description: "Compliance Advance | Mode: UPI" }],
      error: null,
    };
    const result = await validateComplianceBulkPayments({
      organizationId: "org-1",
      category: "compliance_advance",
      rows: [{ rowIndex: 2, tripId: "trip-1", amount: 5000, paymentModeId: "CASH" }],
    });
    expect(result.valid).toHaveLength(0);
    expect(result.alreadyPaid).toHaveLength(1);
  });
});

/**
 * Bulk Payment now reads trip documents through fetchTripDocumentsForTrips (the
 * Compliance list reader). Typed E-way numbers (`…/eway_bill/fields.json` +
 * `document_number`) and legacy type names count exactly as on the list.
 * Documents only shape the block *reason* for unverified advance rows —
 * eligibility is still decided by compliance / finance verification and POD.
 */
describe("validateComplianceBulkPayments — document semantics match the Compliance list", () => {
  function listShapedDocs(tripId: string, ewayNumber: string | null) {
    return [
      { id: `${tripId}-lr`, trip_id: tripId, document_type: "Lorry Receipt", file_name: "lr.pdf", storage_path: `${tripId}/lr/1.pdf`, uploaded_at: "2026-10-27", status: "verified", verified_by: "u1", verified_at: "2026-10-27", rejection_reason: null, document_number: "LR-1" },
      { id: `${tripId}-inv`, trip_id: tripId, document_type: "tax_invoice", file_name: "inv.pdf", storage_path: `${tripId}/invoice/1.pdf`, uploaded_at: "2026-10-27", status: "verified", verified_by: "u1", verified_at: "2026-10-27", rejection_reason: null, document_number: "INV-1" },
      { id: `${tripId}-eway`, trip_id: tripId, document_type: "E-Way Bill", file_name: "eway-fields.json", storage_path: `${tripId}/eway_bill/fields.json`, uploaded_at: "2026-10-27", status: "verified", verified_by: "u1", verified_at: "2026-10-27", rejection_reason: null, document_number: ewayNumber },
    ];
  }
  const advanceRow = { rowIndex: 2, tripId: "trip-1", amount: 5000, paymentModeId: "UPI", utr: "UTR9" };
  beforeEach(() => {
    mockTxnsResult = { data: [], error: null };
  });

  it("typed E-way numbers and legacy type names count as on file (reason is verification, not a missing doc)", async () => {
    mockTripsResult = { data: [TRIP_1], error: null };
    mockDocsResult = { data: listShapedDocs("trip-1", JSON.stringify({ ewayNo: "582093285239", entries: [{ ewayNo: "582093285239" }] })), error: null };
    const result = await validateComplianceBulkPayments({ organizationId: "org-1", category: "compliance_advance", rows: [advanceRow] });
    expect(result.valid).toHaveLength(0);
    expect(result.blocked[0].gateReason).toBe("Compliance verification not completed");
  });

  it("an E-way details marker with no numbers is still missing", async () => {
    mockTripsResult = { data: [TRIP_1], error: null };
    mockDocsResult = { data: listShapedDocs("trip-1", "{}"), error: null };
    const result = await validateComplianceBulkPayments({ organizationId: "org-1", category: "compliance_advance", rows: [advanceRow] });
    expect(result.blocked[0].gateReason).toMatch(/missing$/);
    expect(result.blocked[0].gateReason).toMatch(/e-?way/i);
  });

  it("eligibility is unchanged: a compliance + finance verified trip is payable regardless of documents", async () => {
    mockTripsResult = { data: [TRIP_1_VERIFIED], error: null };
    mockDocsResult = { data: [], error: null };
    const result = await validateComplianceBulkPayments({ organizationId: "org-1", category: "compliance_advance", rows: [advanceRow] });
    expect(result.valid).toHaveLength(1);
    expect(result.blocked).toHaveLength(0);
  });
});
