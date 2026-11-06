import { createLedgerEntry } from "../finance.service";
import { withLedgerDescriptionTxnDateConfirmed } from "@/features/tripCompliance/utils/compliancePaymentDate.util";
import { isComplianceTxnDateConfirmed } from "@/features/tripCompliance/utils/compliancePaymentDate.util";

const mockFrom = jest.fn();

jest.mock("@/lib/supabase", () => ({
  supabase: () => ({
    from: mockFrom,
    auth: {
      getSession: () =>
        Promise.resolve({ data: { session: { user: { id: "user-1" } } } }),
      getUser: () => Promise.resolve({ data: { user: { id: "user-1" } } }),
    },
  }),
}));

jest.mock("@/lib/tripChatInvalidate", () => ({
  notifyTripChatMessagesChanged: jest.fn(),
}));

jest.mock("@/features/trips/services/tripWorkflow.service", () => ({
  recordTripWorkflowEvent: jest.fn().mockResolvedValue({
    error: null,
    event: { id: "evt-1" },
    alreadyExists: false,
  }),
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
  ["select", "eq", "in", "order", "limit", "range", "update", "insert", "neq", "gte", "lte"].forEach(
    (m) => {
      builder[m] = jest.fn(() => builder);
    },
  );
  builder.maybeSingle = jest.fn(() => Promise.resolve(result));
  builder.single = jest.fn(() => Promise.resolve(result));
  builder.then = (resolve: (v: typeof result) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return builder;
}

function transactionsTableBuilder(insertResult: { data: unknown; error: unknown }) {
  let mode: "insert" | "select" | null = null;
  const builder: Record<string, unknown> = {};
  ["select", "eq", "order", "limit", "range", "neq", "gte", "lte", "in"].forEach((m) => {
    builder[m] = jest.fn(() => {
      if (m === "select" && mode === null) mode = "select";
      return builder;
    });
  });
  builder.insert = jest.fn((payload: Record<string, unknown>) => {
    mode = "insert";
    (builder as { __lastInsert?: Record<string, unknown> }).__lastInsert = payload;
    return builder;
  });
  const resolveResult = () =>
    mode === "insert" ? insertResult : { data: [], error: null };
  builder.single = jest.fn(() => Promise.resolve(resolveResult()));
  builder.maybeSingle = jest.fn(() => Promise.resolve(resolveResult()));
  builder.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(resolveResult()).then(resolve, reject);
  return builder;
}

describe("createLedgerEntry — Compliance Sync date QMETA", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("keeps compliance_txn_date_set when rebuilding description QMETA on insert", async () => {
    let lastInsert: Record<string, unknown> | undefined;
    mockFrom.mockImplementation((table: string) => {
      if (table === "transactions") {
        const builder = transactionsTableBuilder({
          data: {
            id: "tx-adv-1",
            trip_id: "trip-1",
            contact_type: "supplier",
            contact_id: "sup-1",
            amount_in: 0,
            amount_out: 62400,
            organization_id: "org-1",
            party_name: "Megha Engineering",
            description: "Compliance Advance",
            transaction_date: "2026-11-06",
            created_at: "2026-11-06T12:00:00.000Z",
            ledger_category: "compliance_advance",
          },
          error: null,
        });
        const originalInsert = builder.insert as jest.Mock;
        builder.insert = jest.fn((payload: Record<string, unknown>) => {
          lastInsert = payload;
          return originalInsert(payload);
        });
        return builder;
      }
      if (table === "suppliers") {
        return genericBuilder({ data: { name: "Megha Engineering" }, error: null });
      }
      return genericBuilder();
    });

    const stamped = withLedgerDescriptionTxnDateConfirmed(
      "Compliance Advance | Mode: Bank | UTR: NEFT123",
    );
    expect(isComplianceTxnDateConfirmed(stamped)).toBe(true);

    const { error } = await createLedgerEntry("org-1", {
      trip_id: "trip-1",
      trip_number: "TRP001919",
      contact_type: "supplier",
      contact_id: "sup-1",
      party_name: "Megha Engineering",
      amount_in: 0,
      amount_out: 62400,
      description: stamped,
      transaction_date: "2026-11-06",
      ledger_category: "compliance_advance",
      payment_reference: "NEFT123",
    });

    expect(error).toBeNull();
    expect(lastInsert).toBeDefined();
    const storedDescription = String(lastInsert?.description ?? "");
    expect(isComplianceTxnDateConfirmed(storedDescription)).toBe(true);
    expect(storedDescription).toContain("Compliance Advance");
  });
});
