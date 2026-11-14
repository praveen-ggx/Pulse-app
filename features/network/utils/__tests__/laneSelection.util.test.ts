import {
  filterLanesBySelection,
  laneSelectionActive,
  normalizeLaneSelection,
  selectionFieldOptions,
} from "@/features/network/utils/pooledOpportunity.util";
import { liveLaneSelection } from "@/features/network/utils/marketplaceLaneSearchMemory.util";
import type { MarketplaceSearchLane } from "@/features/network/utils/marketplaceSearch.util";

const lane = (pickup: string, drop: string, vehicle: string, count: number): MarketplaceSearchLane => ({
  pickup_area: pickup,
  drop_location: drop,
  vehicle_type: vehicle,
  load_count: count,
});

const LANES = [
  lane("Pune", "Bengaluru", "7 MT", 2),
  lane("Mumbai", "Bengaluru", "7 MT", 1),
  lane("Nagpur", "Delhi", "32 FT", 1),
  lane("Chennai", "Pune", "20 FT", 3),
];

describe("lane selection (multi-value filters)", () => {
  it("matches any chosen value within a field and all chosen fields together", () => {
    const pools = filterLanesBySelection(LANES, {
      pickup: ["pune", "Mumbai"],
      drop: [],
      vehicleType: ["7 MT"],
    });
    expect(pools.map((p) => p.pickup_area).sort()).toEqual(["Mumbai", "Pune"]);
    expect(filterLanesBySelection(LANES, null)).toHaveLength(4);
  });

  it("narrows options by the other fields but never by the field's own choices", () => {
    const sel = { pickup: ["Pune", "Nagpur"], drop: [], vehicleType: [] };
    expect(selectionFieldOptions(LANES, sel, "drop").map((o) => o.label)).toEqual([
      "Bengaluru",
      "Delhi",
    ]);
    expect(selectionFieldOptions(LANES, sel, "pickup")).toHaveLength(4);
  });

  it("normalizes saved values, including the older one-string shape", () => {
    expect(normalizeLaneSelection({ pickup: " Pune ", drop: ["Delhi", "delhi", ""], vehicleType: 3 })).toEqual({
      pickup: ["Pune"],
      drop: ["Delhi"],
      vehicleType: [],
    });
    expect(laneSelectionActive(normalizeLaneSelection(null))).toBe(false);
  });

  it("restores only saved values that are still live", () => {
    expect(
      liveLaneSelection(LANES, { pickup: ["Pune", "Goa", "Mumbai"], drop: ["Delhi"], vehicleType: [] }),
    ).toEqual({ pickup: ["Pune", "Mumbai"], drop: [], vehicleType: [] });
    expect(liveLaneSelection(LANES, { pickup: "Chennai", drop: "Pune" })).toEqual({
      pickup: ["Chennai"],
      drop: ["Pune"],
      vehicleType: [],
    });
    expect(liveLaneSelection(LANES, { pickup: ["Goa"] })).toBeNull();
  });
});
