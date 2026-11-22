import { createLedgerEntry } from "../finance.service";

const mockFrom = jest.fn();
const mockClaim = jest.fn();
const mockSummary = jest.fn();

jest.mock("@/lib/supabase", () => ({
  supabase: () => ({
    from: mockFrom,
    auth: { getUser: () => Promise.resolve({ data: { user: { id: "user-1" } } }) },
  }),
}));

jest.mock("@/features/marketplace/services/exchangePayments.service", () => {
  const actual = jest.requireActual("@/features/marketplace/services/exchangePayments.service");
  return {
    ...actual,
    getExchangeTripSummary: (...args: unknown[]) => mockSummary(...args),
    claimExchangePaymentOnce: (...args: unknown[]) => mockClaim(...args),
  };
});

jest.mock("@/lib/tripChatInvalidate", () => ({ notifyTripChatMessagesChanged: jest.fn() }));
jest.mock("@/features/trips/services/tripWorkflow.service", () => ({
  recordTripWorkflowEvent: jest.fn().mockResolvedValue({ error: null }),
}));
jest.mock("@/features/drivers/services/drivers.service", () => ({
  getDriverProfileDisplay: jest.fn(),
  getDriverProfileDisplayBatch: jest.fn(),
}));
jest.mock("@/lib/avatarUpload", () => ({
  AVATAR_BUCKET: "avatars",
  LEGACY_AVATAR_BUCKET: "avatars-legacy",
  extractPathFromStorageUrl: jest.fn(),
  getSignedAvatarUrl: jest.fn(),
  resolveAvatarPublicUrl: jest.fn(),
}));

function genericBuilder(result: { data: unknown; error: unknown } = { data: null, error: null }) {
  const builder: Record<string, unknown> = {};
  ["select", "eq", "in", "order", "limit", "range", "update", "insert", "neq", "gte", "lte"].forEach((m) => {
    builder[m] = jest.fn(() => builder);
  });
  builder.maybeSingle = jest.fn(() => Promise.resolve(result));
  builder.single = jest.fn(() => Promise.resolve(result));
  builder.then = (resolve: (v: typeof result) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return builder;
}

const exchangeSupplierPayment = {
  trip_id: "trip-mkt",
  trip_number: "T-MKT",
  ledgerWritePassthroughTripContext: true,
  contact_type: "supplier",
  contact_id: "acct-bidder",
  party_name: "Bidder Logistics",
  amount_in: 0,
  amount_out: 4000,
  description: "PAYMENT | Mode: UPI | UTR: UTR77",
  transaction_date: "2026-10-05",
};

function summary(viewerSide: "payer" | "payee", contactType: string, contactId: string | null) {
  return {
    error: null,
    summary: { viewer_side: viewerSide, ledger_contact_type: contactType, ledger_contact_id: contactId },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockFrom.mockImplementation(() => genericBuilder());
  mockSummary.mockResolvedValue({ error: null, summary: null });
});

function insertingBuilder() {
  mockFrom.mockImplementation((table: string) => {
    if (table !== "transactions") return genericBuilder();
    const inserted = genericBuilder({
      data: { id: "tx-1", ...exchangeSupplierPayment, organization_id: "org-1" },
      error: null,
    });
    const builder = genericBuilder({ data: [], error: null });
    builder.insert = jest.fn(() => inserted);
    return builder;
  });
}

describe("createLedgerEntry — Exchange trips", () => {
  it("records the shipper's payment to its bidder account as an Exchange claim", async () => {
    mockSummary.mockResolvedValue(summary("payer", "supplier", "acct-bidder"));
    mockClaim.mockResolvedValue({ error: null, payment: { id: "xp-1", status: "claimed" } });

    const result = await createLedgerEntry("org-1", exchangeSupplierPayment as never);

    expect(result).toEqual({ error: null, row: null, pendingExchangeConfirmation: true });
    expect(mockSummary).toHaveBeenCalledWith("trip-mkt");
    expect(mockClaim).toHaveBeenCalledWith("org-1", {
      tripId: "trip-mkt",
      amount: 4000,
      paymentMode: "UPI",
      paymentReference: "UTR77",
      paidOn: "2026-10-05",
    });
    expect(mockFrom).not.toHaveBeenCalledWith("transactions");
  });

  it("records the bidder's receipt from its shipper account as an Exchange claim", async () => {
    mockSummary.mockResolvedValue(summary("payee", "client", "acct-shipper"));
    mockClaim.mockResolvedValue({ error: null, payment: { id: "xp-2", status: "claimed" } });

    const result = await createLedgerEntry("org-1", {
      ...exchangeSupplierPayment,
      contact_type: "client",
      contact_id: "acct-shipper",
      amount_in: 2500,
      amount_out: 0,
    } as never);

    expect(result.pendingExchangeConfirmation).toBe(true);
    expect(mockClaim).toHaveBeenCalledWith("org-1", expect.objectContaining({ tripId: "trip-mkt", amount: 2500 }));
  });

  it("surfaces an Exchange rejection (e.g. over-settlement) without writing", async () => {
    mockSummary.mockResolvedValue(summary("payer", "supplier", "acct-bidder"));
    mockClaim.mockResolvedValue({ error: new Error("over the agreed amount"), payment: null });

    const result = await createLedgerEntry("org-1", exchangeSupplierPayment as never);

    expect(result.error?.message).toBe("over the agreed amount");
    expect(result.pendingExchangeConfirmation).toBeUndefined();
    expect(mockFrom).not.toHaveBeenCalledWith("transactions");
  });

  it("does not turn a refund from the counterparty into a payment claim", async () => {
    mockSummary.mockResolvedValue(summary("payer", "supplier", "acct-bidder"));
    insertingBuilder();

    await createLedgerEntry("org-1", { ...exchangeSupplierPayment, amount_in: 500, amount_out: 0 } as never);

    expect(mockClaim).not.toHaveBeenCalled();
    expect(mockFrom).toHaveBeenCalledWith("transactions");
  });

  it("leaves other parties on an Exchange trip on the normal ledger path", async () => {
    mockSummary.mockResolvedValue(summary("payer", "supplier", "acct-bidder"));
    insertingBuilder();

    const result = await createLedgerEntry("org-1", { ...exchangeSupplierPayment, contact_id: "sup-1" } as never);

    expect(mockClaim).not.toHaveBeenCalled();
    expect(mockFrom).toHaveBeenCalledWith("transactions");
    expect(result.error).toBeNull();
  });

  it("leaves tripless and non-Exchange payments on the normal ledger path", async () => {
    insertingBuilder();

    await createLedgerEntry("org-1", { ...exchangeSupplierPayment, trip_id: null } as never);
    await createLedgerEntry("org-1", exchangeSupplierPayment as never);

    expect(mockSummary).toHaveBeenCalledTimes(1);
    expect(mockClaim).not.toHaveBeenCalled();
  });

  it("falls back to the normal path when the Exchange lookup fails (the server guard still applies)", async () => {
    mockSummary.mockRejectedValue(new Error("network down"));
    insertingBuilder();

    const result = await createLedgerEntry("org-1", exchangeSupplierPayment as never);

    expect(mockClaim).not.toHaveBeenCalled();
    expect(mockFrom).toHaveBeenCalledWith("transactions");
    expect(result.error).toBeNull();
  });

  it.each(["compliance_advance", "compliance_balance"])(
    "posts a %s to the bidder account straight to the ledger (no Exchange claim)",
    async (category) => {
      mockSummary.mockResolvedValue(summary("payer", "supplier", "acct-bidder"));
      insertingBuilder();

      const result = await createLedgerEntry("org-1", {
        ...exchangeSupplierPayment,
        ledger_category: category,
      } as never);

      expect(mockClaim).not.toHaveBeenCalled();
      expect(mockFrom).toHaveBeenCalledWith("transactions");
      expect(result.pendingExchangeConfirmation).toBeUndefined();
      expect(result.error).toBeNull();
    },
  );

  it("still routes an ordinary payment to the same bidder account through Exchange", async () => {
    mockSummary.mockResolvedValue(summary("payer", "supplier", "acct-bidder"));
    mockClaim.mockResolvedValue({ error: null, payment: { id: "xp-3", status: "claimed" } });

    const result = await createLedgerEntry("org-1", { ...exchangeSupplierPayment, ledger_category: "freight" } as never);

    expect(result.pendingExchangeConfirmation).toBe(true);
    expect(mockFrom).not.toHaveBeenCalledWith("transactions");
  });
});
