import {
  acknowledgeDcoSelfOutbox,
  listPendingDcoSelfOutbox,
  rememberDcoSelfOutbox,
} from "../dcoSelfOutbox";

const mockMemory = new Map<string, string>();

jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn(async (key: string) => mockMemory.get(key) ?? null),
  setItem: jest.fn(async (key: string, value: string) => {
    mockMemory.set(key, value);
  }),
  removeItem: jest.fn(async (key: string) => {
    mockMemory.delete(key);
  }),
  clear: jest.fn(async () => {
    mockMemory.clear();
  }),
}));

describe("dcoSelfOutbox v2 party_b_id", () => {
  beforeEach(() => {
    mockMemory.clear();
  });

  it("stores tag/issue payloads with party_b_id and flushes pending order", async () => {
    const tag = await rememberDcoSelfOutbox({
      kind: "tag",
      payload: { tripId: "t1", partyBId: "party-b-1", partyName: "Acme" },
      idempotencyKey: "tag-1",
    });
    const issue = await rememberDcoSelfOutbox({
      kind: "issue",
      payload: { tripId: "t1", partyBId: "party-b-1", billed: 5000 },
      idempotencyKey: "issue-1",
    });
    expect(tag.payload.partyBId).toBe("party-b-1");
    expect(issue.payload.partyBId).toBe("party-b-1");

    const pending = await listPendingDcoSelfOutbox();
    expect(pending.map((row) => row.kind)).toEqual(["tag", "issue"]);

    await acknowledgeDcoSelfOutbox(tag.id);
    const after = await listPendingDcoSelfOutbox();
    expect(after.map((row) => row.kind)).toEqual(["issue"]);
  });

  it("dedupes identical fingerprints instead of double-queuing", async () => {
    const first = await rememberDcoSelfOutbox({
      kind: "collect",
      payload: { receivableId: "r1", amount: 100, paymentMode: "UPI" },
    });
    const second = await rememberDcoSelfOutbox({
      kind: "collect",
      payload: { receivableId: "r1", amount: 100, paymentMode: "UPI" },
    });
    expect(second.id).toBe(first.id);
    expect(await listPendingDcoSelfOutbox()).toHaveLength(1);
  });

  it("does not read PR #65 v1 storage key", async () => {
    mockMemory.set(
      "pulse.dco_self_outbox.v1",
      JSON.stringify([{ id: "legacy", kind: "issue", payload: { party_id: "old" } }]),
    );
    expect(await listPendingDcoSelfOutbox()).toEqual([]);
  });
});
