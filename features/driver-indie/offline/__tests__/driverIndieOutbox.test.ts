import {
  listPendingDriverIndieOutbox,
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

describe("driverIndieOutbox", () => {
  beforeEach(() => {
    mockMemory.clear();
  });

  it("queues indie issue/collect without sharing DCO Self storage", async () => {
    await rememberDriverIndieOutbox({
      kind: "issue",
      payload: { tripId: "t1", partyId: "p1", billed: 2500 },
      idempotencyKey: "indie-issue-1",
    });
    const pending = await listPendingDriverIndieOutbox();
    expect(pending).toHaveLength(1);
    expect(pending[0]?.payload.partyId).toBe("p1");
    expect(mockMemory.has("pulse.dco_self_outbox.v2")).toBe(false);
  });
});
