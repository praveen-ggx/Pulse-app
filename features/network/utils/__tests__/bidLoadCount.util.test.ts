import {
  countActiveLoadsInPlay,
  countActiveMarketplaceBids,
  countSubmittedBids,
  countWonMarketplaceBids,
  laneBidCaption,
  loadsCaption,
  loadsStillInPlay,
} from "@/features/network/utils/bidLoadCount.util";

describe("countSubmittedBids", () => {
  it("counts bid rows and the distinct loads they were sent on", () => {
    expect(
      countSubmittedBids([
        { indent_id: "load-a" },
        { indent_id: "load-a" },
        { indent_id: "load-b" },
      ]),
    ).toEqual({ bids: 3, loads: 2 });
  });

  it("counts one active lane bid and only the loads still pending", () => {
    expect(
      countActiveMarketplaceBids([
        { status: "pending", indent_id: "load-a", pickup_area: "Salem", drop_location: "Chennai" },
        { status: "pending", indent_id: "load-b", pickup_area: "Salem", drop_location: "Chennai" },
        { status: "rejected", indent_id: "load-c", pickup_area: "Salem", drop_location: "Chennai" },
      ]),
    ).toEqual({ bids: 1, loads: 2 });
  });

  it("counts one won lane separately from the loads on it", () => {
    expect(
      countWonMarketplaceBids([
        { status: "accepted", indent_id: "load-a", pickup_area: "Pune", drop_location: "Bengaluru" },
        { status: "accepted", indent_id: "load-b", pickup_area: "Pune", drop_location: "Bengaluru" },
        { status: "pending", indent_id: "load-c", pickup_area: "Pune", drop_location: "Bengaluru" },
      ]),
    ).toEqual({ bids: 1, loads: 2 });
    expect(laneBidCaption(2)).toBe("1 bid · 2 loads");
  });

  it("keeps a bid on the loads it covers when the lane has grown", () => {
    const bids = Array.from({ length: 8 }, (_, index) => ({
      status: "pending",
      indent_id: `load-${index}`,
      pickup_area: "Periyapalayam",
      drop_location: "Poonamallee",
    }));
    const lanes = [{ pickup_area: "Periyapalayam", drop_location: "Poonamallee", load_count: 19 }];
    expect(loadsStillInPlay(8, 19)).toBe(8);
    expect(countActiveLoadsInPlay(bids, lanes)).toEqual({ bids: 1, loads: 8 });
  });

  it("drops the count when awarded loads leave the lane", () => {
    const bids = Array.from({ length: 19 }, (_, index) => ({
      status: "pending",
      indent_id: `load-${index}`,
      pickup_area: "Periyapalayam",
      drop_location: "Poonamallee",
    }));
    const lanes = [{ pickup_area: "Periyapalayam", drop_location: "Poonamallee", load_count: 8 }];
    expect(loadsStillInPlay(19, 8)).toBe(8);
    expect(countActiveLoadsInPlay(bids, lanes)).toEqual({ bids: 1, loads: 8 });
    expect(countActiveLoadsInPlay(bids, null)).toEqual({ bids: 1, loads: 19 });
  });

  it("labels one load and many loads", () => {
    expect(loadsCaption(1)).toBe("1 load");
    expect(loadsCaption(4)).toBe("4 loads");
  });
});
