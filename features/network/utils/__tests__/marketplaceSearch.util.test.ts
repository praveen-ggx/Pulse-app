import {
  filterMarketplaceOptions,
  isMarketplaceLaneSelected,
  isMarketplaceSearchReady,
  isUnsupportedMarketplaceSearchRpc,
  lanesFromMarketplaceLoads,
  marketplaceSearchKey,
  marketplaceSearchSummary,
  normalizeMarketplaceSearch,
} from "@/features/network/utils/marketplaceSearch.util";

describe("marketplaceSearch", () => {
  it("requires from, to, and vehicle before a search is ready", () => {
    expect(isMarketplaceSearchReady(null)).toBe(false);
    expect(
      isMarketplaceSearchReady({ pickup: "Bh", drop: "", vehicleType: "40 FT" }),
    ).toBe(false);
    expect(
      isMarketplaceSearchReady({
        pickup: "Bhandara",
        drop: "Bengaluru",
        vehicleType: "40 FT",
      }),
    ).toBe(true);
  });

  it("normalizes whitespace for cache keys", () => {
    const a = normalizeMarketplaceSearch({
      pickup: "  Bhandara  ",
      drop: "Bengaluru",
      vehicleType: "40 FT",
    });
    expect(marketplaceSearchKey(a)).toBe("bhandara|bengaluru|40 ft");
    expect(marketplaceSearchSummary(a)).toBe("Bhandara → Bengaluru · 40 FT");
  });

  it("narrows drop and vehicle to live Marketplace availability", () => {
    const lanes = [
      {
        pickup_area: "Bhandara",
        drop_location: "Bengaluru",
        vehicle_type: "40 FT",
        load_count: 4,
      },
      {
        pickup_area: "Bhandara",
        drop_location: "Bhiwadi",
        vehicle_type: "32 MT",
        load_count: 2,
      },
      {
        pickup_area: "Chennai",
        drop_location: "Hyderabad",
        vehicle_type: "40 FT",
        load_count: 1,
      },
    ];
    const fromBhandara = filterMarketplaceOptions(
      lanes,
      { pickup: "Bhandara", drop: "", vehicleType: "" },
      "drop",
    );
    expect(fromBhandara.map((o) => o.label)).toEqual(["Bengaluru", "Bhiwadi"]);
    const vehicles = filterMarketplaceOptions(
      lanes,
      { pickup: "Bhandara", drop: "Bengaluru", vehicleType: "" },
      "vehicle",
    );
    expect(vehicles).toEqual([{ label: "40 FT", count: 4 }]);
    expect(
      isMarketplaceLaneSelected(lanes, {
        pickup: "Bhandara",
        drop: "Bengaluru",
        vehicleType: "40 FT",
      }),
    ).toBe(true);
  });

  it("keeps the lowest and highest target on a lane", () => {
    const lanes = lanesFromMarketplaceLoads([
      { pickup_area: "Bhandara", drop_location: "Bengaluru", vehicle_type: "40 FT", rate_offer: 18000 },
      { pickup_area: "Bhandara", drop_location: "Bengaluru", vehicle_type: "40 FT", rate_offer: 12400 },
      { pickup_area: "Bhandara", drop_location: "Bengaluru", vehicle_type: "40 FT", rate_offer: 0 },
    ]);
    expect(lanes[0]?.target_rate_min).toBe(12400);
    expect(lanes[0]?.target_rate_max).toBe(18000);
  });

  it("builds dropdown lanes from an unfiltered marketplace page", () => {
    const lanes = lanesFromMarketplaceLoads([
      { pickup_area: "Bhandara", drop_location: "Bengaluru", vehicle_type: "40 FT" },
      { pickup_area: "Bhandara", drop_location: "Bengaluru", vehicle_type: "40 FT" },
      { pickup_area: "Chennai", drop_location: "Madurai", vehicle_type: "Tata Ace" },
    ]);
    expect(lanes[0]).toEqual({
      pickup_area: "Bhandara",
      drop_location: "Bengaluru",
      vehicle_type: "40 FT",
      load_count: 2,
      target_rate_min: null,
      target_rate_max: null,
    });
    expect(isUnsupportedMarketplaceSearchRpc("Could not find the function public.list_marketplace_search_lanes")).toBe(
      true,
    );
  });
});
