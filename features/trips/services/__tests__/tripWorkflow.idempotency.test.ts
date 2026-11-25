const mockInsert = jest.fn();
let mockStored: { id: string; idempotency_key: string } | null = null;
const mockRpc = jest.fn();

jest.mock("@/lib/supabase", () => ({
  supabase: () => ({
    rpc: (...args: unknown[]) => mockRpc(...args),
    from: () => ({
      select: () => ({
        eq: () => ({
          limit: () => ({
            maybeSingle: async () => ({ data: mockStored, error: null }),
          }),
        }),
      }),
      insert: (row: unknown) => {
        mockInsert(row);
        return {
          select: () => ({
            single: async () => ({ data: { id: "new", ...(row as object) }, error: null }),
          }),
        };
      },
    }),
  }),
}));

import { recordTripWorkflowEvent } from "@/features/trips/services/tripWorkflow.service";

describe("recordTripWorkflowEvent", () => {
  beforeEach(() => {
    mockInsert.mockClear();
    mockRpc.mockReset();
    mockStored = null;
    // Default: the server function is deployed and inserts the milestone.
    mockRpc.mockResolvedValue({ data: { id: "new" }, error: null });
  });

  it("inserts a milestone the first time", async () => {
    const result = await recordTripWorkflowEvent({
      tripId: "trip-1",
      orgId: "org-1",
      eventType: "pod.uploaded",
    });
    expect(result.error).toBeNull();
    expect(result.alreadyExists).toBe(false);
    expect(mockRpc).toHaveBeenCalledWith(
      "record_trip_workflow_event",
      expect.objectContaining({ p_idempotency_key: "trip-1:pod.uploaded" }),
    );
  });

  it("does not insert when that milestone is already stored", async () => {
    // The server function reports a duplicate by returning NULL (ON CONFLICT DO NOTHING).
    mockRpc.mockResolvedValue({ data: null, error: null });
    const result = await recordTripWorkflowEvent({
      tripId: "trip-1",
      orgId: "org-1",
      eventType: "pod.uploaded",
    });
    expect(result.error).toBeNull();
    expect(result.alreadyExists).toBe(true);
    expect(result.event).toBeNull();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("falls back to the old check-then-insert when the function is not deployed yet", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { code: "PGRST202", message: "missing" } });
    mockStored = { id: "evt-1", idempotency_key: "trip-1:pod.uploaded" };
    const dup = await recordTripWorkflowEvent({ tripId: "trip-1", orgId: "org-1", eventType: "pod.uploaded" });
    expect(dup.alreadyExists).toBe(true);
    expect(mockInsert).not.toHaveBeenCalled();
    mockStored = null;
    const first = await recordTripWorkflowEvent({ tripId: "trip-1", orgId: "org-1", eventType: "pod.uploaded" });
    expect(first.alreadyExists).toBe(false);
    expect(mockInsert).toHaveBeenCalledTimes(1);
  });
});
