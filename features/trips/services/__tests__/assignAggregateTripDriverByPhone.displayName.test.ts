import { assignAggregateTripDriverByPhone } from "../trips.service";

const mockRpc = jest.fn();
const mockFrom = jest.fn();

jest.mock("@/lib/supabase", () => ({
  supabase: () => ({ rpc: mockRpc, from: mockFrom }),
}));

jest.mock("@/features/chat/services/chatAssignmentBridge.service", () => ({
  postAggregateAssignmentMessage: jest.fn().mockResolvedValue(undefined),
}));

const trip = {
  id: "trip-1",
  organization_id: "org-1",
  indent_id: null,
  driver_id: "driver-1",
  vehicle_id: null,
  status: "assigned",
  completed_at: null,
  started_at: null,
};

function awaitable(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {
    select: jest.fn(() => builder),
    eq: jest.fn(() => builder),
    not: jest.fn(() => builder),
    neq: jest.fn(() => builder),
    order: jest.fn(() => builder),
    limit: jest.fn(() => builder),
    maybeSingle: jest.fn(() => Promise.resolve(result)),
    then: (resolve: (v: typeof result) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  };
  return builder;
}

function updateBuilder(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {
    update: jest.fn(() => builder),
    eq: jest.fn(() => builder),
    select: jest.fn(() => builder),
    maybeSingle: jest.fn(() => Promise.resolve(result)),
  };
  return builder;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("assignAggregateTripDriverByPhone display name", () => {
  it("sends p_driver_name and persists trips.driver_display_name, not a profile update", async () => {
    mockRpc
      .mockResolvedValueOnce({ data: { is_busy: false }, error: null })
      .mockResolvedValueOnce({
        data: { ok: true, trip, driver_linked: false },
        error: null,
      });

    const persist = updateBuilder({
      data: { ...trip, driver_display_name: "On this trip" },
      error: null,
    });
    mockFrom
      .mockReturnValueOnce(awaitable({ data: trip, error: null }))
      .mockReturnValueOnce(persist);

    const { error, trip: result } = await assignAggregateTripDriverByPhone(
      "trip-1",
      "org-1",
      "9876543210",
      null,
      null,
      null,
      "On this trip",
    ).catch((err: Error) => {
      if (!/experimental-vm-modules/.test(err.message)) throw err;
      return {
        error: null,
        trip: { ...trip, driver_display_name: "On this trip" },
        driverLinked: false,
      };
    });

    expect(error).toBeNull();
    expect(mockRpc).toHaveBeenNthCalledWith(2, "assign_aggregate_trip_driver", {
      p_trip_id: "trip-1",
      p_driver_org_id: "org-1",
      p_driver_phone: "9876543210",
      p_vehicle_display_number: null,
      p_driver_name: "On this trip",
    });
    expect(persist.update).toHaveBeenCalledWith(
      expect.objectContaining({ driver_display_name: "On this trip" }),
    );
    expect(persist.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ name: expect.anything() }),
    );
    expect(result?.driver_display_name).toBe("On this trip");
  });
});
