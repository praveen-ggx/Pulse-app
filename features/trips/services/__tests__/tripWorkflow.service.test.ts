const mockInsert = jest.fn();
const mockMaybeSingle = jest.fn();

jest.mock("@/lib/supabase", () => ({
  supabase: () => ({
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

  it("skips the insert when the singleton event already exists", async () => {
    mockMaybeSingle.mockResolvedValue({ data: { id: "x" }, error: null });
    const r = await recordTripWorkflowEvent({
      tripId: "t1",
      orgId: "o1",
      eventType: "pod.uploaded",
    });
    expect(r.alreadyExists).toBe(true);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("inserts when no event exists", async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });
    const r = await recordTripWorkflowEvent({
      tripId: "t1",
      orgId: "o1",
      eventType: "pod.uploaded",
    });
    expect(r.alreadyExists).toBe(false);
    expect(mockInsert).toHaveBeenCalledTimes(1);
  });
});
