import { listOpenMarketplaceLoadsPage } from "@/features/network/services/findLoadsForOrg.service";
import {
  applyLaneTargetBootstrap,
  bootstrapMarketplaceLaneTargets,
  laneDeclaresTargetRange,
} from "@/features/network/utils/marketplaceLaneTargetBootstrap.util";

jest.mock("@/features/network/services/findLoadsForOrg.service", () => ({
  listOpenMarketplaceLoadsPage: jest.fn(),
}));

const page = listOpenMarketplaceLoadsPage as jest.Mock;

beforeEach(() => {
  page.mockReset();
});

describe("marketplace lane target bootstrap", () => {
  it("leaves a payload that already declares its range untouched", () => {
    const lanes = [
      {
        pickup_area: "Bhandara",
        drop_location: "Bengaluru",
        vehicle_type: "40 FT",
        load_count: 3,
        target_rate_min: null,
        target_rate_max: null,
      },
    ];
    expect(laneDeclaresTargetRange(lanes[0])).toBe(true);
    expect(applyLaneTargetBootstrap(lanes, { "bhandara|bengaluru|40 ft": { min: 1, max: 2 } })).toBe(lanes);
  });

  it("stops after one page when every load on it shares a target", async () => {
    page.mockResolvedValue({
      error: null,
      loads: [{ rate_offer: 4200 }, { rate_offer: "4200" }],
      hasMore: true,
      nextOffset: 15,
    });
    const seen: Array<[string, { min: number | null; max: number | null }]> = [];
    await bootstrapMarketplaceLaneTargets(
      "org-1",
      [
        {
          pickup_area: "Bhandara",
          drop_location: "Bengaluru",
          vehicle_type: "40 FT",
          load_count: 12,
        },
      ],
      (poolId, range) => seen.push([poolId, range]),
    );
    expect(page).toHaveBeenCalledTimes(1);
    expect(page.mock.calls[0][1]).toBe(0);
    expect(seen.some(([, range]) => range.min === 4200 && range.max === 4200)).toBe(true);
  });

  it("reads the next page only when the first page has two targets", async () => {
    page
      .mockResolvedValueOnce({
        error: null,
        loads: [{ rate_offer: 4000 }, { rate_offer: 5000 }],
        hasMore: true,
        nextOffset: 15,
      })
      .mockResolvedValueOnce({
        error: null,
        loads: [{ rate_offer: 4500 }],
        hasMore: false,
        nextOffset: undefined,
      });
    const seen: Array<{ min: number | null; max: number | null }> = [];
    await bootstrapMarketplaceLaneTargets(
      "org-1",
      [
        {
          pickup_area: "Delhi",
          drop_location: "Hyderabad",
          vehicle_type: "32 FT",
          load_count: 4,
        },
      ],
      (_poolId, range) => seen.push(range),
    );
    expect(page).toHaveBeenCalledTimes(2);
    expect(seen.at(-1)).toEqual({ min: 4000, max: 5000 });
  });
});
