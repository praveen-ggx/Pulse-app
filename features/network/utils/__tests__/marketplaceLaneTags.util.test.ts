import { marketplaceLaneTags } from "@/features/network/utils/marketplaceLaneTags.util";
import { canonicalPoolLanes } from "@/features/network/utils/pooledOpportunity.util";

const labels = (lane: Parameters<typeof marketplaceLaneTags>[0]) =>
  marketplaceLaneTags(lane).map((tag) => tag.label);

describe("marketplaceLaneTags", () => {
  it("shows no pay or route tag when the lane does not report them", () => {
    expect(labels({ load_count: 3 })).toEqual([]);
  });

  it("tags a single pay basis and point-to-point lanes", () => {
    expect(labels({ load_count: 2, per_trip_count: 2, per_mt_count: 0, multi_stop_count: 0 })).toEqual([
      "Pay per trip",
      "Point to point",
    ]);
    expect(labels({ load_count: 1, per_trip_count: 0, per_mt_count: 1, multi_stop_count: 1 })).toEqual([
      "Pay per MT",
      "Multi-stop",
    ]);
  });

  it("splits mixed pools with counts", () => {
    expect(labels({ load_count: 5, per_trip_count: 3, per_mt_count: 2, multi_stop_count: 1 })).toEqual([
      "Pay per trip · 3",
      "Pay per MT · 2",
      "Point to point · 4",
      "Multi-stop · 1",
    ]);
  });

  it("adds extra requirements after pay and route", () => {
    expect(labels({ load_count: 1, per_trip_count: 1, requirements: ["GPS", " Tarpaulin "] })).toEqual([
      "Pay per trip",
      "GPS",
      "Tarpaulin",
    ]);
  });

  it("sums tag counts when case-only lane variants merge", () => {
    const [pool] = canonicalPoolLanes([
      { pickup_area: "Pune", drop_location: "Surat", vehicle_type: "7 MT", load_count: 2, per_trip_count: 2, per_mt_count: 0, multi_stop_count: 0 },
      { pickup_area: "pune", drop_location: "surat", vehicle_type: "7 mt", load_count: 1, per_trip_count: 0, per_mt_count: 1, multi_stop_count: 1, requirements: ["GPS"] },
    ]);
    expect(pool).toMatchObject({ load_count: 3, per_trip_count: 2, per_mt_count: 1, multi_stop_count: 1, requirements: ["GPS"] });
  });
});
