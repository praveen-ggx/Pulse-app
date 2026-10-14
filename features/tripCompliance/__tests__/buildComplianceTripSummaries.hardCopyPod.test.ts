/**
 * Phase 4 fix: the settlement derivation's hardCopyReceived signal must come
 * from trips.pod_received_at (the pre-existing, pervasively-used field that
 * Trip Detail / Log Incoming PODs / POD reconciliation / Invoicing all
 * already read) — not from pod_hard_copy_courier/awb_number/received_by,
 * which only the Compliance panel's own modal used to write. Before this
 * fix, marking hard-copy POD received from Trip Detail or Log Incoming PODs
 * never advanced Balance Payment eligibility.
 */
function mockMakeThenable<T>(result: { data: T; error: null }) {
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  builder.select = chain;
  builder.eq = chain;
  builder.in = chain;
  builder.is = chain;
  builder.then = (resolve: (v: typeof result) => void) => resolve(result);
  return builder;
}

let mockTripDocsResult: { data: unknown[]; error: null };
let mockFlagsResult: { data: unknown[]; error: null };
let mockTxnsResult: { data: unknown[]; error: null };

jest.mock("@/lib/supabase", () => ({
  supabase: () => ({
    from: (table: string) => {
      if (table === "trip_documents") return mockMakeThenable(mockTripDocsResult);
      if (table === "trips") return mockMakeThenable(mockFlagsResult);
      if (table === "transactions") return mockMakeThenable(mockTxnsResult);
      if (table === "trip_workflow_events") return mockMakeThenable({ data: [], error: null });
      throw new Error(`unexpected table ${table}`);
    },
  }),
}));

jest.mock("@/features/compliance/services/documents.service", () => ({
  getDocumentsForEntities: jest.fn().mockResolvedValue({ error: null, documents: [] }),
}));

import { buildComplianceTripSummaries } from "@/features/tripCompliance/services/tripComplianceRead.service";
import type { TripRow } from "@/features/trips/services/trips.service";

// No vehicle_id/driver_id -> the vault/KYC document fetches short-circuit,
// keeping this test scoped to the hard-copy-POD signal specifically.
function makeTrip(overrides: Partial<TripRow> = {}): TripRow {
  return {
    id: "trip-1",
    organization_id: "org-1",
    status: "delivered",
    vehicle_id: null,
    owner_vehicle_id: null,
    driver_id: null,
    vehicle_display_number: null,
    ...overrides,
  } as TripRow;
}

describe("buildComplianceTripSummaries — hard-copy POD signal", () => {
  beforeEach(() => {
    mockTripDocsResult = { data: [], error: null };
    mockTxnsResult = { data: [], error: null };
  });

  it("is NOT received when only pod_hard_copy_courier/awb/received_by are set but pod_received_at is null", async () => {
    mockFlagsResult = {
      data: [
        {
          id: "trip-1",
          compliance_verified_at: "2026-09-01",
          pod_hard_copy_courier: "BlueDart",
          pod_hard_copy_awb_number: "AWB123",
          pod_hard_copy_received_by: "Ramesh",
          pod_received_at: null,
        },
      ],
      error: null,
    };
    const [summary] = await buildComplianceTripSummaries([makeTrip()], "org-1");
    expect(summary.hardCopyPod.received).toBe(false);
  });

  it("IS received once pod_received_at is set — regardless of which surface wrote it", async () => {
    mockFlagsResult = {
      data: [
        {
          id: "trip-1",
          compliance_verified_at: "2026-09-01",
          pod_hard_copy_courier: null,
          pod_hard_copy_awb_number: null,
          pod_hard_copy_received_by: null,
          pod_received_at: "2026-09-21T10:00:00Z",
        },
      ],
      error: null,
    };
    const [summary] = await buildComplianceTripSummaries([makeTrip({ pod_received_at: "2026-09-21T10:00:00Z" })], "org-1");
    expect(summary.hardCopyPod.received).toBe(true);
  });

  it("Balance Payment stays blocked until hard-copy POD is received, even with an advance posted", async () => {
    mockTripDocsResult = { data: [{ id: "d1", trip_id: "trip-1", document_type: "lr", status: "verified" }], error: null };
    mockFlagsResult = {
      data: [{ id: "trip-1", compliance_verified_at: "2026-09-01", pod_received_at: null }],
      error: null,
    };
    mockTxnsResult = {
      data: [
        {
          id: "t1",
          trip_id: "trip-1",
          amount_in: 25000,
          amount_out: 0,
          ledger_category: "compliance_advance",
          transaction_date: "2026-09-05",
          // Posted (created_at) after compliance_verified_at ("2026-09-01") —
          // a genuinely-posted advance, per Change 1's postedAt gate.
          created_at: "2026-09-05",
        },
      ],
      error: null,
    };
    const [summary] = await buildComplianceTripSummaries([makeTrip()], "org-1");
    expect(summary.stage).toBe("hard_copy_pod_received"); // delivered + verified, hard copy not yet marked
  });

  it("moves to balance_pending once hard-copy POD is received (via pod_received_at)", async () => {
    mockTripDocsResult = { data: [{ id: "d1", trip_id: "trip-1", document_type: "lr", status: "verified" }], error: null };
    mockFlagsResult = {
      data: [{ id: "trip-1", compliance_verified_at: "2026-09-01", pod_received_at: "2026-09-21T10:00:00Z" }],
      error: null,
    };
    mockTxnsResult = {
      data: [
        {
          id: "t1",
          trip_id: "trip-1",
          amount_in: 25000,
          amount_out: 0,
          ledger_category: "compliance_advance",
          transaction_date: "2026-09-05",
          // Posted (created_at) after compliance_verified_at ("2026-09-01") —
          // a genuinely-posted advance, per Change 1's postedAt gate.
          created_at: "2026-09-05",
        },
      ],
      error: null,
    };
    const [summary] = await buildComplianceTripSummaries([makeTrip({ pod_received_at: "2026-09-21T10:00:00Z" })], "org-1");
    expect(summary.stage).toBe("balance_pending");
  });
});
