const mockInsert = jest.fn();
let mockStored: { id: string; idempotency_key: string } | null = null;

jest.mock("@/lib/supabase", () => ({
  supabase: () => ({
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
    mockStored = null;
  });

  it("inserts a milestone the first time", async () => {
    const result = await recordTripWorkflowEvent({
      tripId: "trip-1",
      orgId: "org-1",
      eventType: "pod.uploaded",
    });
    expect(result.error).toBeNull();
    expect(result.alreadyExists).toBe(false);
    expect(mockInsert).toHaveBeenCalledTimes(1);
  });

  it("does not insert when that milestone is already stored", async () => {
    mockStored = { id: "evt-1", idempotency_key: "trip-1:pod.uploaded" };
    const result = await recordTripWorkflowEvent({
      tripId: "trip-1",
      orgId: "org-1",
      eventType: "pod.uploaded",
    });
    expect(result.error).toBeNull();
    expect(result.alreadyExists).toBe(true);
    // Production (V1.0.1) reads only the id and reports the duplicate without the stored row.
    expect(result.event).toBeNull();
    expect(mockInsert).not.toHaveBeenCalled();
  });
});
