const mockRpc = jest.fn();

jest.mock("@/lib/supabase", () => ({
  supabase: () => ({ rpc: mockRpc }),
  getAccessToken: jest.fn(),
}));

import { listMarketplaceSearchLanes } from "../findLoadsForOrg.service";

beforeEach(() => mockRpc.mockReset());

describe("listMarketplaceSearchLanes price bootstrap", () => {
  it("uses the one-shot bootstrap and coerces numeric strings", async () => {
    mockRpc.mockImplementation((name: string) => {
      if (name === "list_marketplace_lane_bootstrap") {
        return Promise.resolve({
          data: [
            {
              pickup_area: "Bhandara",
              drop_location: "Bengaluru",
              vehicle_type: "40 FT",
              load_count: 3,
              target_rate_min: "4200",
              target_rate_max: "4800.50",
            },
          ],
          error: null,
        });
      }
      return Promise.resolve({ data: [], error: null });
    });
    const { error, lanes } = await listMarketplaceSearchLanes("org-1");
    expect(error).toBeNull();
    expect(lanes[0]?.target_rate_min).toBe(4200);
    expect(lanes[0]?.target_rate_max).toBe(4800.5);
  });

  it("keeps the lane list when the bootstrap function is not deployed", async () => {
    mockRpc.mockImplementation((name: string) => {
      if (name === "list_marketplace_lane_bootstrap") {
        return Promise.resolve({
          data: null,
          error: { message: "Could not find the function public.list_marketplace_lane_bootstrap" },
        });
      }
      return Promise.resolve({
        data: [
          {
            pickup_area: "Bhandara",
            drop_location: "Bengaluru",
            vehicle_type: "40 FT",
            load_count: 3,
          },
        ],
        error: null,
      });
    });
    const { error, lanes } = await listMarketplaceSearchLanes("org-1");
    expect(error).toBeNull();
    expect(lanes).toHaveLength(1);
    expect("target_rate_min" in (lanes[0] ?? {})).toBe(false);
  });
});
