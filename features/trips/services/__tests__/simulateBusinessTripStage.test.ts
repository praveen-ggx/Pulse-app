const mockFrom = jest.fn();

jest.mock("@/lib/crashReporter", () => ({
  captureMessage: jest.fn(),
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

jest.mock("@/lib/authEngine", () => ({
  TimeoutError: class TimeoutError extends Error {},
  withTimeout: (work: (signal: AbortSignal) => Promise<unknown>) =>
    work(new AbortController().signal),
}));

jest.mock("@/lib/supabase", () => ({
  supabase: () => ({ from: mockFrom }),
}));

import { simulateBusinessTripStage } from "../trips.service";

function updateBuilder(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {
    update: jest.fn(() => builder),
    eq: jest.fn(() => builder),
    select: jest.fn(() => builder),
    maybeSingle: jest.fn(() => Promise.resolve(result)),
    abortSignal: jest.fn(() => builder),
  };
  return builder;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("simulateBusinessTripStage", () => {
  it("issues one trips UPDATE with status and BISIM notes together", async () => {
    const builder = updateBuilder({
      data: { id: "trip-112", status: "at_drop" },
      error: null,
    });
    mockFrom.mockReturnValue(builder);

    const notes =
      "[BISIM|at_drop|2026-09-22T10:00:00.000Z|15.139|76.921|Ops|in_transit]";
    const { error } = await simulateBusinessTripStage({
      tripId: "trip-112",
      targetStatus: "at_drop",
      fromStatus: "in_transit",
      notes,
    });

    expect(error).toBeNull();
    expect(mockFrom).toHaveBeenCalledTimes(1);
    expect(mockFrom).toHaveBeenCalledWith("trips");
    expect(builder.update).toHaveBeenCalledTimes(1);
    const payload = (builder.update as jest.Mock).mock.calls[0][0] as Record<
      string,
      unknown
    >;
    expect(payload.status).toBe("at_drop");
    expect(payload.notes).toBe(notes);
    expect(payload.status_change_origin).toBe("business_simulated");
    expect(builder.select).toHaveBeenCalledTimes(1);
  });
});
