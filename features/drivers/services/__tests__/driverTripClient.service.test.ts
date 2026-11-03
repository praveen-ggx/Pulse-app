const mockRpc = jest.fn();

function mockNotesQuery(notes: string) {
  const query: {
    select: () => typeof query;
    eq: () => typeof query;
    maybeSingle: () => Promise<{ data: { instructions: string }; error: null }>;
  } = {
    select: () => query,
    eq: () => query,
    maybeSingle: () => Promise.resolve({ data: { instructions: notes }, error: null }),
  };
  return query;
}

jest.mock("@/lib/supabase", () => ({
  supabase: () => ({
    rpc: (...args: unknown[]) => mockRpc(...args),
    from: () => mockNotesQuery(""),
  }),
}));

import { tagTripWithDcoClient } from "../driverTripClient.service";

describe("tagTripWithDcoClient", () => {
  beforeEach(() => {
    mockRpc.mockReset();
    mockRpc.mockResolvedValue({ error: null, data: null });
  });

  it("saves the party on the trip notes and confirms the write", async () => {
    const { error } = await tagTripWithDcoClient(
      "trip-1",
      { id: "local:ajio", name: "Ajio" },
      { billed: 18500 },
    );
    expect(error).toBeNull();
    expect(mockRpc).toHaveBeenCalledWith(
      "driver_save_offline_trip_notes",
      expect.objectContaining({
        p_trip_id: "trip-1",
        p_notes: expect.stringContaining("<!--pulse-dco-party:"),
      }),
    );
  });

  it("denies marketplace before any write", async () => {
    await expect(
      tagTripWithDcoClient("mkt-1", { id: "c-1", name: "X" }, { source: "market_bid" }),
    ).resolves.toMatchObject({
      error: expect.objectContaining({ message: expect.stringMatching(/Marketplace/) }),
    });
    expect(mockRpc).not.toHaveBeenCalled();
  });
});
