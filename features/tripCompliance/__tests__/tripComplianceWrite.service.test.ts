// See tripComplianceBulkPayment.service.test.ts for why finance.service is mocked here.
jest.mock("@/features/finance/services/finance.service", () => ({
  createLedgerEntry: jest.fn(),
  updateLedgerEntry: jest.fn(),
}));

import { createLedgerEntry } from "@/features/finance/services/finance.service";
import {
  checkCompliancePaymentAllowed,
  postCompliancePayment,
  validateCompliancePaymentAmount,
  withdrawComplianceAdvancePayment,
} from "@/features/tripCompliance/services/tripComplianceWrite.service";
import { processComplianceBulkPayments } from "@/features/tripCompliance/services/tripComplianceBulkPayment.service";
import type { TripRow } from "@/features/trips/services/trips.service";

const mockCreateLedgerEntry = createLedgerEntry as jest.Mock;

// compliance_verified_at/pod_received_at default to "eligible" so existing
// tests that don't care about the Phase 6 prerequisite gate aren't affected
// by it; tests that DO care override explicitly.
function makeTrip(overrides: Partial<TripRow> = {}): TripRow {
  return {
    id: "trip-1",
    booking_ref: "TRP001",
    client_name: "Acme Logistics",
    client_id: "client-1",
    client_price: 50000,
    compliance_verified_at: "2026-09-01T00:00:00Z",
    pod_received_at: "2026-09-15T00:00:00Z",
    ...overrides,
  } as TripRow;
}

function mockMakeThenable<T>(result: { data: T; error: null }) {
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  builder.select = chain;
  builder.eq = chain;
  builder.in = chain;
  builder.then = (resolve: (v: typeof result) => void) => resolve(result);
  builder.delete = () => {
    const del: Record<string, unknown> = {};
    const next = () => del;
    del.eq = next;
    del.select = next;
    del.maybeSingle = async () => mockDeleteResult;
    return del;
  };
  return builder;
}

let mockTxnsResult: { data: unknown[]; error: null };
let mockDeleteResult: { data: { id: string } | null; error: { message?: string } | null };
/** Live `trips` flags read by postCompliancePayment; null = row not readable (falls back to the passed trip). */
let mockLiveTripFlags: Pick<TripRow, "compliance_verified_at" | "pod_received_at"> | null = null;

jest.mock("@/lib/supabase", () => ({
  supabase: () => ({
    from: (table: string) => {
      if (table === "transactions") {
        return mockMakeThenable(mockTxnsResult);
      }
      if (table === "trips") {
        const builder: Record<string, unknown> = {};
        builder.select = () => builder;
        builder.eq = () => builder;
        builder.maybeSingle = async () => ({ data: mockLiveTripFlags, error: null });
        return builder;
      }
      throw new Error(`unexpected table ${table}`);
    },
  }),
}));

beforeEach(() => {
  mockLiveTripFlags = null;
  mockDeleteResult = { data: { id: "tx-adv-1" }, error: null };
});

describe("checkCompliancePaymentAllowed — duplicate payment / already-settled protection", () => {
  beforeEach(() => {
    mockTxnsResult = { data: [], error: null };
  });

  it("allows the first advance payment on a trip with no prior compliance transactions", async () => {
    const result = await checkCompliancePaymentAllowed({ tripId: "trip-1", category: "compliance_advance" });
    expect(result.ok).toBe(true);
  });

  it("rejects a second advance payment on the same trip", async () => {
    mockTxnsResult = {
      data: [{ trip_id: "trip-1", ledger_category: "compliance_advance", description: "Compliance Advance | Mode: UPI" }],
      error: null,
    };
    const result = await checkCompliancePaymentAllowed({ tripId: "trip-1", category: "compliance_advance" });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/already been posted/i);
  });

  it("rejects a balance payment before any advance has been posted", async () => {
    const result = await checkCompliancePaymentAllowed({ tripId: "trip-1", category: "compliance_balance" });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/advance payment must be posted/i);
  });

  it("rejects a second balance payment once the trip is already settled", async () => {
    mockTxnsResult = {
      data: [
        { trip_id: "trip-1", ledger_category: "compliance_advance", description: "Compliance Advance | Mode: UPI" },
        { trip_id: "trip-1", ledger_category: "compliance_balance", description: "Compliance Balance | Mode: UPI" },
      ],
      error: null,
    };
    const result = await checkCompliancePaymentAllowed({ tripId: "trip-1", category: "compliance_balance" });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/already settled/i);
  });

  it("allows a balance payment once an advance exists and no balance has been posted yet", async () => {
    mockTxnsResult = {
      data: [{ trip_id: "trip-1", ledger_category: "compliance_advance", description: "Compliance Advance | Mode: UPI" }],
      error: null,
    };
    const result = await checkCompliancePaymentAllowed({ tripId: "trip-1", category: "compliance_balance" });
    expect(result.ok).toBe(true);
  });
});

describe("validateCompliancePaymentAmount — sanity ceiling against trip value", () => {
  it("passes when the amount is within the trip's client_price", () => {
    expect(validateCompliancePaymentAmount({ amount: 25000, trip: { client_price: 50000 } }).ok).toBe(true);
  });

  it("passes when amount equals client_price exactly", () => {
    expect(validateCompliancePaymentAmount({ amount: 50000, trip: { client_price: 50000 } }).ok).toBe(true);
  });

  it("fails when the amount exceeds client_price", () => {
    const result = validateCompliancePaymentAmount({ amount: 75000, trip: { client_price: 50000 } });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/exceeds the trip value/i);
  });

  it("does not check when client_price is unset — no business rule to invent", () => {
    expect(validateCompliancePaymentAmount({ amount: 999999, trip: { client_price: 0 } }).ok).toBe(true);
  });
});

describe("postCompliancePayment — amount ceiling, structured reference, duplicate translation", () => {
  beforeEach(() => {
    mockTxnsResult = { data: [], error: null };
    mockCreateLedgerEntry.mockReset();
  });

  it("blocks posting when the amount exceeds the trip's client_price, without calling createLedgerEntry", async () => {
    const result = await postCompliancePayment({
      organizationId: "org-1",
      trip: makeTrip({ client_price: 50000 }),
      category: "compliance_advance",
      amount: 200000,
      paymentModeId: "CASH",
      paymentModeLabel: "Cash",
    });
    expect(result.error?.message).toMatch(/exceeds the trip value/i);
    expect(mockCreateLedgerEntry).not.toHaveBeenCalled();
  });

  it("passes the UTR through as a structured payment_reference, not only embedded in description", async () => {
    mockCreateLedgerEntry.mockResolvedValue({ error: null, row: {} });
    await postCompliancePayment({
      organizationId: "org-1",
      trip: makeTrip(),
      category: "compliance_advance",
      amount: 25000,
      paymentModeId: "UPI",
      paymentModeLabel: "UPI",
      utr: "  TEST-ADV-001  ",
    });
    expect(mockCreateLedgerEntry).toHaveBeenCalledWith(
      "org-1",
      expect.objectContaining({ payment_reference: "TEST-ADV-001" }),
    );
  });

  it('translates a 23505 duplicate-key error into an "already posted" message, not a raw DB error', async () => {
    const dbError = new Error('duplicate key value violates unique constraint "ux_transactions_compliance_trip_category"');
    (dbError as Error & { code?: string }).code = "23505";
    mockCreateLedgerEntry.mockResolvedValue({ error: dbError, row: null });

    const result = await postCompliancePayment({
      organizationId: "org-1",
      trip: makeTrip(),
      category: "compliance_advance",
      amount: 25000,
      paymentModeId: "UPI",
      paymentModeLabel: "UPI",
      utr: "TEST-ADV-001",
    });
    expect(result.error?.message).toMatch(/already been posted/i);
    expect(result.error?.message).not.toMatch(/constraint/i);
  });

  it("passes through a non-duplicate ledger error unchanged", async () => {
    mockCreateLedgerEntry.mockResolvedValue({ error: new Error("network timeout"), row: null });
    const result = await postCompliancePayment({
      organizationId: "org-1",
      trip: makeTrip(),
      category: "compliance_advance",
      amount: 25000,
      paymentModeId: "UPI",
      paymentModeLabel: "UPI",
      utr: "TEST-ADV-001",
    });
    expect(result.error?.message).toBe("network timeout");
  });
});

describe("postCompliancePayment — Phase 6 server-side settlement-prerequisite gate", () => {
  beforeEach(() => {
    mockTxnsResult = { data: [], error: null };
    mockCreateLedgerEntry.mockReset();
  });

  it("blocks an advance for a trip with no compliance approval, without calling createLedgerEntry", async () => {
    const result = await postCompliancePayment({
      organizationId: "org-1",
      trip: makeTrip({ compliance_verified_at: null }),
      category: "compliance_advance",
      amount: 25000,
      paymentModeId: "CASH",
      paymentModeLabel: "Cash",
    });
    expect(result.error?.message).toMatch(/compliance must be approved/i);
    expect(mockCreateLedgerEntry).not.toHaveBeenCalled();
  });

  it("allows an advance once compliance_verified_at is set — exception approval counts, no compliance_decision check needed", async () => {
    mockCreateLedgerEntry.mockResolvedValue({ error: null, row: {} });
    const result = await postCompliancePayment({
      organizationId: "org-1",
      // compliance_verified_at set by approve_trip_compliance_with_exception()
      // just like mark_trip_compliance_verified() — same field, same check.
      trip: makeTrip({ compliance_verified_at: "2026-09-01T00:00:00Z" }),
      category: "compliance_advance",
      amount: 25000,
      paymentModeId: "CASH",
      paymentModeLabel: "Cash",
    });
    expect(result.error).toBeNull();
    expect(mockCreateLedgerEntry).toHaveBeenCalledTimes(1);
  });

  it("blocks a balance payment for a trip with no hard-copy POD received, without calling createLedgerEntry", async () => {
    mockTxnsResult = {
      data: [{ trip_id: "trip-1", ledger_category: "compliance_advance", description: "Compliance Advance | Mode: CASH" }],
      error: null,
    };
    const result = await postCompliancePayment({
      organizationId: "org-1",
      trip: makeTrip({ pod_received_at: null }),
      category: "compliance_balance",
      amount: 25000,
      paymentModeId: "CASH",
      paymentModeLabel: "Cash",
    });
    expect(result.error?.message).toMatch(/hard-copy pod must be received/i);
    expect(mockCreateLedgerEntry).not.toHaveBeenCalled();
  });

  it('translates a 42501 RLS rejection (stale client state disagreeing with the DB) into a clear message, not a raw "row violates policy" error', async () => {
    const rlsError = new Error('new row violates row-level security policy for table "transactions"');
    (rlsError as Error & { code?: string }).code = "42501";
    mockCreateLedgerEntry.mockResolvedValue({ error: rlsError, row: null });

    const result = await postCompliancePayment({
      organizationId: "org-1",
      trip: makeTrip(), // client believes it's eligible; DB (mocked) disagrees
      category: "compliance_advance",
      amount: 25000,
      paymentModeId: "CASH",
      paymentModeLabel: "Cash",
    });
    expect(result.error?.message).toMatch(/compliance must be approved/i);
    expect(result.error?.message).not.toMatch(/row-level security|policy/i);
  });
});

describe("postCompliancePayment — advance gate reads the live trip, not the cached one", () => {
  beforeEach(() => {
    mockTxnsResult = { data: [], error: null };
    mockCreateLedgerEntry.mockReset();
    mockCreateLedgerEntry.mockResolvedValue({ error: null, row: {} });
  });

  it("rejects an advance when the cached trip looks verified but compliance_verified_at is null in the DB", async () => {
    mockLiveTripFlags = { compliance_verified_at: null, pod_received_at: null };
    const result = await postCompliancePayment({
      organizationId: "org-1",
      trip: makeTrip({ compliance_verified_at: "2026-09-01T00:00:00Z" }),
      category: "compliance_advance",
      amount: 25000,
      paymentModeId: "UPI",
      paymentModeLabel: "UPI",
    });
    expect(result.error?.message).toMatch(/compliance must be approved/i);
    expect(mockCreateLedgerEntry).not.toHaveBeenCalled();
  });

  it("allows an advance when the cached trip is stale but the DB has compliance_verified_at set", async () => {
    mockLiveTripFlags = { compliance_verified_at: "2026-10-02T00:00:00Z", pod_received_at: null };
    const result = await postCompliancePayment({
      organizationId: "org-1",
      trip: makeTrip({ compliance_verified_at: null }),
      category: "compliance_advance",
      amount: 25000,
      paymentModeId: "UPI",
      paymentModeLabel: "UPI",
    });
    expect(result.error).toBeNull();
    expect(mockCreateLedgerEntry).toHaveBeenCalledTimes(1);
  });

  it("does not add a gate to balance beyond the POD rule", async () => {
    mockTxnsResult = {
      data: [{ trip_id: "trip-1", ledger_category: "compliance_advance", description: "Compliance Advance | Mode: UPI" }],
      error: null,
    };
    mockLiveTripFlags = { compliance_verified_at: null, pod_received_at: "2026-10-03T00:00:00Z" };
    const result = await postCompliancePayment({
      organizationId: "org-1",
      trip: makeTrip(),
      category: "compliance_balance",
      amount: 25000,
      paymentModeId: "UPI",
      paymentModeLabel: "UPI",
    });
    expect(result.error).toBeNull();
    expect(mockCreateLedgerEntry).toHaveBeenCalledTimes(1);
  });
});

describe("processComplianceBulkPayments — same advance gate per row", () => {
  beforeEach(() => {
    mockTxnsResult = { data: [], error: null };
    mockCreateLedgerEntry.mockReset();
    mockCreateLedgerEntry.mockResolvedValue({ error: null, row: {} });
  });

  const bulkRow = (tripId: string) => ({
    row: { rowIndex: 2, tripId, amount: 25000, paymentModeId: "UPI", utr: "UTR-BULK-1" },
    errors: [],
  });

  it("rejects an advance row whose trip is not compliance-verified", async () => {
    const trip = makeTrip({ compliance_verified_at: null });
    const results = await processComplianceBulkPayments({
      organizationId: "org-1",
      category: "compliance_advance",
      rows: [bulkRow(trip.id)] as never,
      tripsById: new Map([[trip.id, trip]]),
    });
    expect(results[0].error?.message).toMatch(/compliance must be approved/i);
    expect(mockCreateLedgerEntry).not.toHaveBeenCalled();
  });

  it("posts an advance row whose trip is compliance-verified", async () => {
    const trip = makeTrip();
    const results = await processComplianceBulkPayments({
      organizationId: "org-1",
      category: "compliance_advance",
      rows: [bulkRow(trip.id)] as never,
      tripsById: new Map([[trip.id, trip]]),
    });
    expect(results[0].error).toBeNull();
    expect(mockCreateLedgerEntry).toHaveBeenCalledTimes(1);
  });
});

describe("withdrawComplianceAdvancePayment", () => {
  const advanceRow = {
    id: "tx-adv-1",
    trip_id: "trip-1",
    amount_in: 25000,
    amount_out: 0,
    description: "Compliance Advance",
    transaction_date: "2026-10-01",
    created_by: "u1",
    ledger_category: "compliance_advance",
  };

  it("deletes the trip's compliance_advance row", async () => {
    mockTxnsResult = { data: [advanceRow], error: null };
    const result = await withdrawComplianceAdvancePayment({ tripId: "trip-1", transactionId: "tx-adv-1" });
    expect(result.error).toBeNull();
  });

  it("blocks a Finance receipt id so client receipts are not deleted", async () => {
    mockTxnsResult = { data: [advanceRow], error: null };
    const result = await withdrawComplianceAdvancePayment({
      tripId: "trip-1",
      transactionId: "amount-paid:trip-1",
    });
    expect(result.error?.message).toMatch(/posted in Finance/i);
  });

  it("blocks when a balance payment already exists", async () => {
    mockTxnsResult = {
      data: [
        advanceRow,
        { ...advanceRow, id: "tx-bal-1", ledger_category: "compliance_balance" },
      ],
      error: null,
    };
    const result = await withdrawComplianceAdvancePayment({ tripId: "trip-1" });
    expect(result.error?.message).toMatch(/balance payment/i);
  });

  it("fails when there is no advance to send back", async () => {
    mockTxnsResult = { data: [], error: null };
    const result = await withdrawComplianceAdvancePayment({ tripId: "trip-1" });
    expect(result.error?.message).toMatch(/no advance payment/i);
  });

  it("fails when delete is not permitted", async () => {
    mockTxnsResult = { data: [advanceRow], error: null };
    mockDeleteResult = { data: null, error: null };
    const result = await withdrawComplianceAdvancePayment({ tripId: "trip-1" });
    expect(result.error?.message).toMatch(/permission/i);
  });
});
