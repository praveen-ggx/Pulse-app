import {
  indentLaneKey,
  laneBidHint,
  laneBidSpreads,
  laneBidTag,
  laneBiddingIndentCounts,
} from "@/features/trips/utils/indentLaneBids.util";

const lane = (id: string, pickup: string, drop: string, vehicle: string) => ({
  id,
  pickup_area: pickup,
  drop_location: drop,
  vehicle_type: vehicle,
});

describe("indentLaneBids", () => {
  it("keys a lane on pickup, drop and vehicle after trim and case-fold", () => {
    expect(indentLaneKey(lane("a", " Periyapalayam ", "Poonamallee", "20 FT"))).toBe(
      indentLaneKey(lane("b", "periyapalayam", "POONAMALLEE", "20 ft")),
    );
    expect(indentLaneKey(lane("c", "Periyapalayam", "", "20 FT"))).toBeNull();
  });

  it("counts only indents with live bids, per lane", () => {
    const counts = laneBiddingIndentCounts(
      [
        lane("a", "Periyapalayam", "Poonamallee", "20 FT"),
        lane("b", "periyapalayam", "poonamallee", "20 ft"),
        lane("c", "Periyapalayam", "Poonamallee", "20 FT"),
        lane("d", "Periyapalayam", "Chittoor", "20 FT"),
        lane("a", "Periyapalayam", "Poonamallee", "20 FT"),
      ],
      { a: 2, b: 1, c: 0, d: 0 },
    );
    expect(counts.get(indentLaneKey(lane("x", "Periyapalayam", "Poonamallee", "20 FT"))!)).toBe(2);
    expect(counts.get(indentLaneKey(lane("x", "Periyapalayam", "Chittoor", "20 FT"))!)).toBeUndefined();
  });

  it("carries a lane's bid range onto every live indent, before or after the bid", () => {
    const key = indentLaneKey(lane("x", "Periyapalayam", "Poonamallee", "20 FT"))!;
    const spreads = laneBidSpreads(
      [
        lane("before", "Periyapalayam", "Poonamallee", "20 FT"),
        lane("bid", "periyapalayam", "poonamallee", "20 ft"),
        lane("after", "PERIYAPALAYAM", "Poonamallee", "20 FT"),
        lane("other", "Periyapalayam", "Chittoor", "20 FT"),
      ],
      { before: 0, bid: 2, after: 0, other: 1 },
      {
        bid: { lowestAmount: 4233, highestAmount: 5250 },
        other: { lowestAmount: 9000, highestAmount: 9000 },
      },
    );
    const spread = spreads.get(key)!;
    expect(spread.biddingLoads).toBe(1);
    expect(spread.lowest).toBe(4233);
    expect(spread.highest).toBe(5250);
    expect(laneBidTag(spread)).toMatch(/^₹\s?4,233–₹\s?5,250$/);
    expect(laneBidTag(spreads.get(indentLaneKey(lane("x", "Periyapalayam", "Chittoor", "20 FT"))!))).toMatch(
      /^₹\s?9,000$/,
    );
    expect(laneBidTag({ biddingLoads: 2, lowest: null, highest: null })).toBe("LANE HAS BIDS");
    expect(laneBidTag(undefined)).toBeNull();
  });

  it("phrases the hint with the lane's live bid range", () => {
    expect(laneBidHint({ biddingLoads: 0, lowest: 4233, highest: 5250 })).toBeNull();
    expect(laneBidHint({ biddingLoads: 13, lowest: 4233, highest: 5250 })).toMatch(
      /^Lane bids ₹\s?4,233–₹\s?5,250 on 13 loads$/,
    );
    expect(laneBidHint({ biddingLoads: 1, lowest: 4000, highest: 4000 })).toMatch(
      /^Lane bids ₹\s?4,000 on 1 load$/,
    );
    expect(laneBidHint({ biddingLoads: 2, lowest: null, highest: null })).toBe(
      "Lane has bids on 2 loads",
    );
  });
});
