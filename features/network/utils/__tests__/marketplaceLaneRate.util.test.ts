import {
  MARKETPLACE_LANE_RATE_COPY,
  MARKETPLACE_LANE_RATE_HOURS,
  laneRateConfirmation,
  marketplaceLaneRateValidUntilIso,
} from "@/features/network/utils/marketplaceLaneRate.util";

describe("marketplace lane rate copy", () => {
  it("describes a 48-hour rate and does not offer vehicles", () => {
    expect(MARKETPLACE_LANE_RATE_HOURS).toBe(48);
    expect(MARKETPLACE_LANE_RATE_COPY.hidesAllocation).toBe(true);
    expect(MARKETPLACE_LANE_RATE_COPY.dismissLabel).toBe("Close");
    expect(MARKETPLACE_LANE_RATE_COPY.submitLabel(1)).toBe("Save lane rate for 48 hours");
    expect(MARKETPLACE_LANE_RATE_COPY.dateHint).toMatch(/does not extend/);
    expect(MARKETPLACE_LANE_RATE_COPY.countHint(1, 10)).toMatch(/does not reserve a vehicle/);
  });

  it("sets the client hint 48 hours ahead", () => {
    const from = new Date("2026-11-17T00:00:00.000Z");
    expect(marketplaceLaneRateValidUntilIso(from)).toBe("2026-11-19T00:00:00.000Z");
  });

  it("tells the carrier a new rate lasts 48 hours and is not an award", () => {
    expect(
      laneRateConfirmation({
        amountLabel: "₹42,000",
        attached: 2,
      }),
    ).toEqual({
      title: "Lane rate on",
      message:
        "Placed on 2 more open loads. New loads on this lane get ₹42,000 for 48 hours. Each load has its own bid, and the shipper accepts it. No vehicle is reserved and nothing is awarded automatically.",
    });
  });

  it("does not claim a new window when the same rate is sent again", () => {
    expect(
      laneRateConfirmation({
        amountLabel: "₹42,000",
        attached: 0,
        reused: true,
      }).message,
    ).toMatch(/was not extended/);
  });

  it("keeps accepted bids out of a rate change", () => {
    expect(
      laneRateConfirmation({
        amountLabel: "₹40,000",
        attached: 0,
        rateChanged: true,
      }).message,
    ).toMatch(/Accepted bids are unchanged/);
  });

  it("starts a fresh 48 hours only on an explicit renewal", () => {
    expect(
      laneRateConfirmation({
        amountLabel: "₹42,000",
        attached: 0,
        renewed: true,
      }).message,
    ).toMatch(/new 48 hours/);
  });
});
