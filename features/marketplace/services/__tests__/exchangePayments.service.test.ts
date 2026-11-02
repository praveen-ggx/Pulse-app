import {
  claimExchangePayment,
  claimExchangePaymentOnce,
  confirmExchangePayment,
  exchangeErrorMessage,
  exchangeModeFromLedgerLabel,
  getExchangeTripSummary,
  isExchangeClaimOverdue,
  isExchangeLedgerContact,
  listExchangeTrips,
  rejectExchangePayment,
} from "../exchangePayments.service";

const mockRpc = jest.fn();

jest.mock("@/lib/supabase", () => ({
  supabase: () => ({ rpc: (...args: unknown[]) => mockRpc(...args) }),
}));

beforeEach(() => {
  mockRpc.mockReset();
});

describe("exchangeErrorMessage", () => {
  it("maps DB error codes to user copy", () => {
    expect(exchangeErrorMessage("over_settlement: claimed 9000 > agreed 8000")).toMatch(/past the agreed amount/);
    expect(exchangeErrorMessage("duplicate_reference: UTR123")).toMatch(/already recorded/);
    expect(exchangeErrorMessage("marketplace_account_reserved: x")).toMatch(/not connected to/);
  });

  it("keeps the server's own explanation for a locked ledger write", () => {
    expect(
      exchangeErrorMessage("exchange_ledger_locked: this trip settles through Pulse Exchange; record the payment in Exchange"),
    ).toBe("this trip settles through Pulse Exchange; record the payment in Exchange");
  });

  it("strips an unknown code prefix and keeps the message", () => {
    expect(exchangeErrorMessage("forbidden: not a member")).toBe("not a member");
    expect(exchangeErrorMessage("plain failure")).toBe("plain failure");
  });
});

describe("exchangeModeFromLedgerLabel", () => {
  it.each([
    ["UPI", "UPI"],
    ["Cheque", "CHEQUE"],
    ["Bank Transfer", "BANK"],
    ["NEFT", "BANK"],
    ["Cash", "CASH"],
    [null, "CASH"],
  ])("%s → %s", (label, mode) => {
    expect(exchangeModeFromLedgerLabel(label)).toBe(mode);
  });
});

describe("isExchangeClaimOverdue", () => {
  const now = new Date("2026-10-06T12:00:00.000Z");

  it("flags a claim waiting more than 72 hours", () => {
    expect(isExchangeClaimOverdue({ status: "claimed", claimed_at: "2026-10-03T11:00:00.000Z" }, now)).toBe(true);
    expect(isExchangeClaimOverdue({ status: "claimed", claimed_at: "2026-10-03T13:00:00.000Z" }, now)).toBe(false);
  });

  it("never flags decided payments", () => {
    expect(isExchangeClaimOverdue({ status: "confirmed", claimed_at: "2026-09-01T00:00:00.000Z" }, now)).toBe(false);
    expect(isExchangeClaimOverdue({ status: "rejected", claimed_at: "2026-09-01T00:00:00.000Z" }, now)).toBe(false);
  });
});

describe("isExchangeLedgerContact", () => {
  const supplierSide = { ledger_contact_type: "supplier" as const, ledger_contact_id: "acct-b" };

  it("matches the viewer's counterparty party on the trip", () => {
    expect(isExchangeLedgerContact(supplierSide, "supplier", "acct-b")).toBe(true);
    expect(isExchangeLedgerContact(supplierSide, "SUPPLIER", "acct-b")).toBe(true);
  });

  it("leaves other parties on the trip to the normal ledger", () => {
    expect(isExchangeLedgerContact(supplierSide, "supplier", "other")).toBe(false);
    expect(isExchangeLedgerContact(supplierSide, "client", "acct-b")).toBe(false);
    expect(isExchangeLedgerContact(null, "supplier", "acct-b")).toBe(false);
  });

  it("matches any DCO entry on a DCO award", () => {
    expect(isExchangeLedgerContact({ ledger_contact_type: "dco", ledger_contact_id: null }, "dco", "payee-1")).toBe(true);
  });
});

describe("Exchange RPC wrappers", () => {
  it("claim sends trimmed, nullable fields", async () => {
    mockRpc.mockResolvedValue({ data: { id: "xp-1", status: "claimed" }, error: null });

    const { error, payment } = await claimExchangePayment({
      tripId: "trip-1",
      amount: 2500,
      paymentMode: "UPI",
      idempotencyKey: "k-1",
      paymentReference: "  UTR9  ",
      paidOn: "2026-10-05T10:00:00Z",
      notes: "   ",
    });

    expect(error).toBeNull();
    expect(payment?.id).toBe("xp-1");
    expect(mockRpc).toHaveBeenCalledWith("claim_exchange_payment", {
      p_trip_id: "trip-1",
      p_amount: 2500,
      p_payment_mode: "UPI",
      p_idempotency_key: "k-1",
      p_payment_reference: "UTR9",
      p_paid_on: "2026-10-05",
      p_notes: null,
    });
  });

  it("decision calls map DB errors to user copy", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: "over_settlement: 9000 > 8000" } });
    const { error } = await confirmExchangePayment("xp-1");
    expect(error?.message).toMatch(/past the agreed amount/);
    expect(mockRpc).toHaveBeenCalledWith("confirm_exchange_payment", { p_exchange_payment_id: "xp-1" });
  });

  it("reject passes the reason", async () => {
    mockRpc.mockResolvedValue({ data: { id: "xp-1", status: "rejected" }, error: null });
    await rejectExchangePayment("xp-1", "not received");
    expect(mockRpc).toHaveBeenCalledWith("reject_exchange_payment", {
      p_exchange_payment_id: "xp-1",
      p_reason: "not received",
    });
  });

  it("claimExchangePaymentOnce keeps one deterministic key across timeout and retry", async () => {
    const input = { tripId: "trip-1", amount: 1200, paymentMode: "UPI" as const, paymentReference: "UTR5", paidOn: "2026-10-05" };
    mockRpc
      .mockResolvedValueOnce({ data: null, error: { message: "network timeout" } })
      .mockResolvedValueOnce({ data: { id: "xp-9", status: "claimed" }, error: null })
      .mockResolvedValueOnce({ data: { id: "xp-9", status: "claimed" }, error: null });

    await claimExchangePaymentOnce("org-1", input);
    await claimExchangePaymentOnce("org-1", { ...input, paymentReference: " utr5 " });
    await claimExchangePaymentOnce("org-1", input);

    const keys = mockRpc.mock.calls.map(([, args]) => (args as { p_idempotency_key: string }).p_idempotency_key);
    expect(keys[1]).toBe(keys[0]);
    expect(keys[2]).toBe(keys[0]);
  });

  it("claimExchangePaymentOnce shares the key between concurrent submits", async () => {
    mockRpc.mockResolvedValue({ data: { id: "xp-11", status: "claimed" }, error: null });
    const input = { tripId: "trip-2", amount: 500, paymentMode: "CASH" as const, paidOn: "2026-10-05" };

    await Promise.all([claimExchangePaymentOnce("org-1", input), claimExchangePaymentOnce("org-1", input)]);

    const keys = mockRpc.mock.calls.map(([, args]) => (args as { p_idempotency_key: string }).p_idempotency_key);
    expect(keys).toHaveLength(1);
    expect(keys[0]).toBe("exchange-claim:org-1:trip-2:500:CASH::2026-10-05");
  });

  it("claimExchangePaymentOnce gives different payments different keys", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: "network timeout" } });
    const base = { tripId: "trip-3", amount: 500, paymentMode: "CASH" as const, paidOn: "2026-10-05" };

    await claimExchangePaymentOnce("org-1", base);
    await claimExchangePaymentOnce("org-1", { ...base, amount: 600 });

    const keys = mockRpc.mock.calls.map(([, args]) => (args as { p_idempotency_key: string }).p_idempotency_key);
    expect(keys[1]).not.toBe(keys[0]);
  });

  it("summary is null for non-Exchange trips", async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    await expect(getExchangeTripSummary("trip-own")).resolves.toEqual({ error: null, summary: null });
  });

  it("lane list returns rows, or an error with no rows", async () => {
    mockRpc.mockResolvedValueOnce({ data: [{ trip_id: "t-1", viewer_trip_id: "m-1" }], error: null });
    await expect(listExchangeTrips("org-1")).resolves.toEqual({
      error: null,
      trips: [{ trip_id: "t-1", viewer_trip_id: "m-1" }],
    });
    expect(mockRpc).toHaveBeenCalledWith("list_exchange_trips", { p_org_id: "org-1" });

    mockRpc.mockResolvedValueOnce({ data: null, error: { message: "unauthorized: not staff" } });
    const failed = await listExchangeTrips("org-2");
    expect(failed.trips).toEqual([]);
    expect(failed.error?.message).toMatch(/unauthorized/);
  });
});
