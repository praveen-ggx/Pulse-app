const mockRpc = jest.fn();
const mockRemember = jest.fn();
const mockAttempted = jest.fn();
const mockReject = jest.fn();
const mockAcknowledge = jest.fn();

jest.mock("@/lib/supabase", () => ({
  supabase: () => ({ rpc: mockRpc }),
}));

jest.mock("@/features/dco-self/offline/dcoSelfOutbox", () => ({
  rememberDcoSelfOutbox: (...args: unknown[]) => mockRemember(...args),
  markDcoSelfOutboxAttempted: (...args: unknown[]) => mockAttempted(...args),
  rejectDcoSelfOutbox: (...args: unknown[]) => mockReject(...args),
  acknowledgeDcoSelfOutbox: (...args: unknown[]) => mockAcknowledge(...args),
  cancelDcoSelfOutbox: jest.fn(),
  listPendingDcoSelfOutbox: jest.fn().mockResolvedValue([]),
}));

jest.mock("@/features/dco-self/offline/dcoSelfLocalBook", () => ({
  cancelLocalDcoSelfTripTag: jest.fn(),
  listLocalDcoSelfTripTags: jest.fn().mockResolvedValue([]),
  mergeDcoSelfParties: jest.fn().mockResolvedValue([]),
  rememberLocalDcoSelfParty: jest.fn(),
  rememberLocalDcoSelfTripTag: jest.fn(),
}));

jest.mock("@/features/dco-self/offline/dcoSelfSync", () => ({
  flushDcoSelfOutbox: jest.fn(),
}));

import { issueDcoSelfReceivable } from "@/features/dco-self/services/dcoSelfReceivable.service";

const INPUT = { partyBId: "party-1", billed: 1000, idempotencyKey: "dco-self-issue:trip-1", tripId: "trip-1" };

beforeEach(() => {
  mockRpc.mockReset();
  mockRemember.mockReset().mockResolvedValue({ id: "outbox-1", idempotencyKey: "dco-self-issue:trip-1" });
  mockAttempted.mockReset().mockResolvedValue(undefined);
  mockReject.mockReset().mockResolvedValue(undefined);
  mockAcknowledge.mockReset().mockResolvedValue(undefined);
});

describe("issueDcoSelfReceivable: trip scope errors", () => {
  it.each([
    ["dco_self_fleet_trip_denied", "Fleet trips stay on your employer's ledger. Only DCO trips go on your Self book."],
    ["dco_self_payee_denied", "This DCO trip pays a different DCO. Only trips paid to you go on your Self book."],
    ["dco_self_trip_already_issued", "This trip already has a receivable. Correct that one instead of issuing another."],
    ["dco_self_trip_denied", "That trip is not one of your DCO trips."],
    ["dco_self_marketplace_denied", "Marketplace trips stay on Pulse Exchange."],
  ])("maps %s to a readable message and rejects the outbox item", async (code, message) => {
    mockRpc.mockResolvedValue({ data: null, error: { message: code } });
    const result = await issueDcoSelfReceivable(INPUT);
    expect(result.error?.message).toBe(message);
    expect(result.receivableId).toBeNull();
    expect(mockReject).toHaveBeenCalledWith("outbox-1", code);
    expect(mockAcknowledge).not.toHaveBeenCalled();
  });

  it("does not mistake a fleet-trip rejection for the generic trip message", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: "dco_self_fleet_trip_denied" } });
    const result = await issueDcoSelfReceivable(INPUT);
    expect(result.error?.message).not.toBe("That trip is not one of your DCO trips.");
  });

  it("keeps a transport failure pending instead of rejecting it", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: "Network request failed" } });
    const result = await issueDcoSelfReceivable(INPUT);
    expect(result.error).toBeNull();
    expect(result.pending).toBe(true);
    expect(mockReject).not.toHaveBeenCalled();
  });

  it("returns a replay as success", async () => {
    mockRpc.mockResolvedValue({ data: { ok: true, id: "recv-1", replayed: true }, error: null });
    const result = await issueDcoSelfReceivable(INPUT);
    expect(result).toEqual({ error: null, receivableId: "recv-1", replayed: true });
    expect(mockAcknowledge).toHaveBeenCalledWith("outbox-1");
  });
});
