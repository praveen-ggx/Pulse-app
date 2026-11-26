const mockRpc = jest.fn();
const mockInsert = jest.fn();
const mockMaybeSingle = jest.fn();

jest.mock("@/lib/supabase", () => ({
  supabase: () => ({
    rpc: (...args: unknown[]) => mockRpc(...args),
    from: () => ({
      select: () => ({
        eq: () => ({ limit: () => ({ maybeSingle: mockMaybeSingle }) }),
      }),
      insert: (row: unknown) => {
        mockInsert(row);
        return {
          select: () => ({
            single: () => Promise.resolve({ data: { id: "e1" }, error: null }),
          }),
        };
      },
    }),
  }),
}));

import { recordTripWorkflowEvent } from "../tripWorkflow.service";

describe("recordTripWorkflowEvent", () => {
  beforeEach(() => jest.clearAllMocks());

  it("sends the singleton key to the RPC and returns the inserted row", async () => {
    mockRpc.mockResolvedValue({ data: { id: "e1" }, error: null });
    const r = await recordTripWorkflowEvent({ tripId: "t1", orgId: "o1", eventType: "pod.uploaded" });
    expect(mockRpc).toHaveBeenCalledWith(
      "record_trip_workflow_event",
      expect.objectContaining({ p_trip_id: "t1", p_org_id: "o1", p_idempotency_key: "t1:pod.uploaded" }),
    );
    expect(r).toEqual({ error: null, event: { id: "e1" }, alreadyExists: false });
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("treats a NULL RPC result as already recorded (duplicate is a no-op)", async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    const r = await recordTripWorkflowEvent({ tripId: "t1", orgId: "o1", eventType: "pod.uploaded" });
    expect(r).toEqual({ error: null, event: null, alreadyExists: true });
  });

  it("passes a null key for multi-occurrence events", async () => {
    mockRpc.mockResolvedValue({ data: { id: "e2" }, error: null });
    await recordTripWorkflowEvent({ tripId: "t1", orgId: "o1", eventType: "supplier.paid" as never });
    expect(mockRpc).toHaveBeenCalledWith(
      "record_trip_workflow_event",
      expect.objectContaining({ p_idempotency_key: null }),
    );
  });

  it("surfaces a real RPC error (not-authorized) without falling back", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { code: "P0001", message: "unauthorized" } });
    const r = await recordTripWorkflowEvent({ tripId: "t1", orgId: "o1", eventType: "pod.uploaded" });
    expect(r.error?.message).toBe("unauthorized");
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("does NOT fall back when 42883 comes from a broken helper inside the function", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { code: "42883", message: "function private.org_is_trip_party(uuid, uuid) does not exist" } });
    const r = await recordTripWorkflowEvent({ tripId: "t1", orgId: "o1", eventType: "pod.uploaded" });
    expect(r.error?.message).toContain("org_is_trip_party");
    expect(mockInsert).not.toHaveBeenCalled();
  });

  describe("legacy fallback when the RPC is not deployed", () => {
    beforeEach(() => mockRpc.mockResolvedValue({ data: null, error: { code: "PGRST202", message: "missing" } }));

    it("skips the insert when the singleton event already exists", async () => {
      mockMaybeSingle.mockResolvedValue({ data: { id: "x" }, error: null });
      const r = await recordTripWorkflowEvent({ tripId: "t1", orgId: "o1", eventType: "pod.uploaded" });
      expect(r.alreadyExists).toBe(true);
      expect(mockInsert).not.toHaveBeenCalled();
    });

    it("inserts when no event exists", async () => {
      mockMaybeSingle.mockResolvedValue({ data: null, error: null });
      const r = await recordTripWorkflowEvent({ tripId: "t1", orgId: "o1", eventType: "pod.uploaded" });
      expect(r.alreadyExists).toBe(false);
      expect(mockInsert).toHaveBeenCalledTimes(1);
    });
  });
});
