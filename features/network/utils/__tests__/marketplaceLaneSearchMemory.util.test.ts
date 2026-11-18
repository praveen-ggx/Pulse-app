import {
  bidderLanePreview,
  groupBidsByLane,
  liveMarketplaceSearch,
  presetMarketplaceSearch,
  rememberLaneCounts,
} from "@/features/network/utils/marketplaceLaneSearchMemory.util";

const LANES = [
  { pickup_area: "Bhandara", drop_location: "Bengaluru", vehicle_type: "40 FT", load_count: 3 },
  { pickup_area: "Periyapalayam", drop_location: "Poonamallee", vehicle_type: "20 FT", load_count: 18 },
];

describe("marketplace lane search memory", () => {
  it("presets the lane with the most open loads", () => {
    expect(presetMarketplaceSearch(LANES)).toEqual({
      pickup: "Periyapalayam",
      drop: "Poonamallee",
      vehicleType: "20 FT",
    });
  });

  it("keeps a saved search whose cities are still live", () => {
    expect(
      liveMarketplaceSearch(LANES, {
        pickup: "bhandara",
        drop: "Bengaluru",
        vehicleType: "40 ft",
      }),
    ).toEqual({
      pickup: "Bhandara",
      drop: "Bengaluru",
      vehicleType: "40 FT",
    });
  });

  it("drops only the saved field that no longer matches the kept ones", () => {
    expect(
      liveMarketplaceSearch(LANES, {
        pickup: "Bhandara",
        drop: "Poonamallee",
        vehicleType: "40 FT",
      }),
    ).toEqual({ pickup: "Bhandara", drop: "", vehicleType: "40 FT" });
  });

  it("keeps drop and vehicle when the saved pickup is gone", () => {
    expect(
      liveMarketplaceSearch(LANES, {
        pickup: "Delhi",
        drop: "Bengaluru",
        vehicleType: "40 FT",
      }),
    ).toEqual({ pickup: "", drop: "Bengaluru", vehicleType: "40 FT" });
  });

  it("restores a vehicle-only search and returns nothing when no field is live", () => {
    expect(liveMarketplaceSearch(LANES, { vehicleType: "20 ft" })).toEqual({
      pickup: "",
      drop: "",
      vehicleType: "20 FT",
    });
    expect(liveMarketplaceSearch(LANES, { pickup: "Delhi", drop: "Agra" })).toBeNull();
  });

  it("keeps a reduced lane below the highest count already seen", () => {
    expect(rememberLaneCounts({ "periyapalayam|poonamallee": 18 }, new Map([["periyapalayam|poonamallee", 8]]))).toEqual({
      "periyapalayam|poonamallee": 18,
    });
    expect(
      bidderLanePreview({
        bidStatus: "pending",
        pickupDate: "2026-11-20",
        currentCount: 8,
        rememberedCount: 18,
        lanesReady: true,
        today: "2026-11-14",
      }),
    ).toEqual({ tone: "reduced", label: "Reduced · 8 pooled" });
  });

  it("keeps an expired lane once the pickup day has passed or the pool is gone", () => {
    expect(
      bidderLanePreview({
        bidStatus: "pending",
        pickupDate: "2026-10-29",
        currentCount: 8,
        rememberedCount: 8,
        lanesReady: true,
        today: "2026-11-14",
      }),
    ).toEqual({ tone: "expired", label: "Expired" });
    expect(
      bidderLanePreview({
        bidStatus: "pending",
        pickupDate: "2026-11-20",
        currentCount: 0,
        rememberedCount: 18,
        lanesReady: true,
        today: "2026-11-14",
      }),
    ).toEqual({ tone: "expired", label: "Expired" });
  });

  it("groups bids on the same pickup and drop into one pool", () => {
    const grouped = groupBidsByLane([
      { pickup_area: "Periyapalayam", drop_location: "Poonamallee" },
      { pickup_area: "periyapalayam", drop_location: "poonamallee" },
      { pickup_area: "Bhandara", drop_location: "Bengaluru" },
    ]);
    expect(grouped.map((group) => group.bids.length)).toEqual([2, 1]);
  });
});
