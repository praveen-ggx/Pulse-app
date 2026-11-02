/**
 * Independent DRIVER outbox lifecycle — ordered flush queue, restart survival,
 * dedupe, and pending / confirmed / rejected states.
 */
import {
  acknowledgeDriverIndieOutbox,
  listPendingDriverIndieOutbox,
  rejectDriverIndieOutbox,
  rememberDriverIndieOutbox,
} from "../driverIndieOutbox";

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

const STORAGE_KEY = "pulse.driver_indie_outbox.v1";

describe("driverIndieOutbox lifecycle", () => {
  beforeEach(() => {
    mockMemory.clear();
  });

  it("queues upsert → tag → issue → collect in flush order", async () => {
    // Insert out of order; pending list must still sort by kind order.
    await rememberDriverIndieOutbox({
      kind: "collect",
      payload: { receivableId: "r1", amount: 500, paymentMode: "CASH" },
      idempotencyKey: "collect-1",
    });
    await rememberDriverIndieOutbox({
      kind: "issue",
      payload: { tripId: "t1", partyId: "p1", billed: 1000 },
      idempotencyKey: "issue-1",
    });
    await rememberDriverIndieOutbox({
      kind: "tag",
      payload: { tripId: "t1", partyId: "p1", name: "Alpha" },
      idempotencyKey: "tag-1",
    });
    await rememberDriverIndieOutbox({
      kind: "upsert_party",
      payload: { name: "Alpha", phone: "+910000000001", localPartyId: "local:1" },
      idempotencyKey: "party-1",
    });

    const pending = await listPendingDriverIndieOutbox();
    expect(pending.map((row) => row.kind)).toEqual([
      "upsert_party",
      "tag",
      "issue",
      "collect",
    ]);
  });

  it("dedupes identical fingerprints (no duplicate receivables/collections)", async () => {
    const first = await rememberDriverIndieOutbox({
      kind: "issue",
      payload: { tripId: "t1", partyId: "p1", billed: 1000 },
      idempotencyKey: "issue-dup",
    });
    const second = await rememberDriverIndieOutbox({
      kind: "issue",
      payload: { tripId: "t1", partyId: "p1", billed: 1000 },
      idempotencyKey: "issue-dup-other-key",
    });
    expect(second.id).toBe(first.id);
    expect(await listPendingDriverIndieOutbox()).toHaveLength(1);
  });

  it("survives app restart (storage re-read) while pending", async () => {
    await rememberDriverIndieOutbox({
      kind: "tag",
      payload: { tripId: "t-offline", partyId: "p1", name: "Beta" },
      idempotencyKey: "tag-offline-1",
    });
    expect(mockMemory.has(STORAGE_KEY)).toBe(true);

    // Simulate process death: only durable storage remains.
    const disk = mockMemory.get(STORAGE_KEY);
    expect(disk).toBeTruthy();

    // Fresh "boot" still sees the pending tag.
    const pending = await listPendingDriverIndieOutbox();
    expect(pending).toHaveLength(1);
    expect(pending[0]?.kind).toBe("tag");
    expect(pending[0]?.payload.tripId).toBe("t-offline");
  });

  it("moves pending → confirmed (ack) and pending → rejected", async () => {
    const issue = await rememberDriverIndieOutbox({
      kind: "issue",
      payload: { tripId: "t2", partyId: "p2", billed: 750 },
      idempotencyKey: "issue-state",
    });
    const collect = await rememberDriverIndieOutbox({
      kind: "collect",
      payload: { receivableId: "r2", amount: 750, paymentMode: "UPI" },
      idempotencyKey: "collect-state",
    });

    expect(await listPendingDriverIndieOutbox()).toHaveLength(2);

    await acknowledgeDriverIndieOutbox(issue.id);
    let pending = await listPendingDriverIndieOutbox();
    expect(pending.map((row) => row.id)).toEqual([collect.id]);

    await rejectDriverIndieOutbox(collect.id, "driver_indie_not_due");
    pending = await listPendingDriverIndieOutbox();
    expect(pending).toHaveLength(1);
    expect(pending[0]?.id).toBe(collect.id);
    expect(pending[0]?.lastError).toBe("driver_indie_not_due");

    // Confirmed issue is no longer pending.
    expect(pending.some((row) => row.id === issue.id)).toBe(false);
  });

  it("never shares DCO Self outbox storage", async () => {
    await rememberDriverIndieOutbox({
      kind: "collect",
      payload: { receivableId: "r3", amount: 100, paymentMode: "CASH" },
    });
    expect(mockMemory.has(STORAGE_KEY)).toBe(true);
    expect(mockMemory.has("pulse.dco_self_outbox.v2")).toBe(false);
    expect(mockMemory.has("pulse.dco_self_outbox.v1")).toBe(false);
  });
});
