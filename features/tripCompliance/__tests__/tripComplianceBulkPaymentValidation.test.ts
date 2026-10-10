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
  builder.select = chain;
  builder.eq = chain;
  builder.in = chain;
  builder.then = (resolve: (v: typeof result) => void) => resolve(result);
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
