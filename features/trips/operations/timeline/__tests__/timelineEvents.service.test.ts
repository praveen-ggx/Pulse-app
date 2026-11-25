const mockRpc = jest.fn();
const mockInsert = jest.fn();
const mockMaybeSingle = jest.fn();

jest.mock("@/lib/supabase", () => ({
  supabase: () => ({
    rpc: (...args: unknown[]) => mockRpc(...args),
    from: (table: string) => ({
      select: () => ({ eq: () => ({ maybeSingle: mockMaybeSingle }) }),
      insert: (row: unknown) => {
        mockInsert(table, row);
        return Promise.resolve({ error: null });
      },
    }),
  }),
}));

const mockWarn = jest.fn();
jest.mock("@/lib/logger", () => ({ logger: { warn: (...a: unknown[]) => mockWarn(...a) } }));

import { appendTripOperationalTimelineEvent, appendTripOperationalTimelineEventSafe } from "../timelineEvents.service";

const base = { tripId: "t1", eventType: "odometer_added" as const };

describe("appendTripOperationalTimelineEvent", () => {
  beforeEach(() => jest.clearAllMocks());

  it("writes through the server function with the caller's org", async () => {
    mockRpc.mockResolvedValue({ data: "e1", error: null });
    const r = await appendTripOperationalTimelineEvent({ ...base, organizationId: "o1", payload: { a: 1 } });
    expect(mockRpc).toHaveBeenCalledWith(
      "record_trip_operational_timeline_event",
      expect.objectContaining({ p_trip_id: "t1", p_organization_id: "o1", p_event_type: "odometer_added", p_payload: { a: 1 } }),
    );
    expect(r.error).toBeNull();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("lets the server pick the trip's org when none is given (driver case)", async () => {
    mockRpc.mockResolvedValue({ data: "e1", error: null });
    await appendTripOperationalTimelineEvent(base);
    expect(mockRpc).toHaveBeenCalledWith(
      "record_trip_operational_timeline_event",
      expect.objectContaining({ p_organization_id: null }),
    );
    expect(mockMaybeSingle).not.toHaveBeenCalled();
  });

  it("returns a real RPC error (not authorized) without falling back to a direct insert", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { code: "P0001", message: "unauthorized" } });
    const r = await appendTripOperationalTimelineEvent({ ...base, organizationId: "o1" });
    expect(r.error?.message).toBe("unauthorized");
    expect(mockInsert).not.toHaveBeenCalled();
  });

  describe("legacy fallback when the function is not deployed", () => {
    beforeEach(() => mockRpc.mockResolvedValue({ data: null, error: { code: "PGRST202", message: "missing" } }));

    it("inserts directly with the given org", async () => {
      const r = await appendTripOperationalTimelineEvent({ ...base, organizationId: "o1" });
      expect(r.error).toBeNull();
      expect(mockInsert).toHaveBeenCalledWith(
        "trip_operational_timeline_events",
        expect.objectContaining({ organization_id: "o1", trip_id: "t1" }),
      );
    });

    it("looks the org up from the trip when none is given", async () => {
      mockMaybeSingle.mockResolvedValue({ data: { organization_id: "o9" } });
      await appendTripOperationalTimelineEvent(base);
      expect(mockInsert).toHaveBeenCalledWith(
        "trip_operational_timeline_events",
        expect.objectContaining({ organization_id: "o9" }),
      );
    });
  });

  describe("appendTripOperationalTimelineEventSafe", () => {
    it("logs a refused write instead of swallowing it", async () => {
      mockRpc.mockResolvedValue({ data: null, error: { code: "P0001", message: "unauthorized: nope" } });
      await expect(appendTripOperationalTimelineEventSafe({ ...base, organizationId: "o1" })).resolves.toBeUndefined();
      expect(mockWarn).toHaveBeenCalledWith(
        "trip timeline event not written",
        expect.objectContaining({ tripId: "t1", reason: "unauthorized: nope" }),
      );
    });

    it("stays quiet on success", async () => {
      mockRpc.mockResolvedValue({ data: "e1", error: null });
      await appendTripOperationalTimelineEventSafe({ ...base, organizationId: "o1" });
      expect(mockWarn).not.toHaveBeenCalled();
    });
  });
});
