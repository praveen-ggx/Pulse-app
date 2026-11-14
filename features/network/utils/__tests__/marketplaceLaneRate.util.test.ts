import {
  MARKETPLACE_LANE_RATE_COPY,
  laneRateConfirmation,
} from "@/features/network/utils/marketplaceLaneRate.util";

describe("marketplace lane rate copy", () => {
  it("offers a skip and names the vehicle count on submit", () => {
    expect(MARKETPLACE_LANE_RATE_COPY.dismissLabel).toBe("Not now");
    expect(MARKETPLACE_LANE_RATE_COPY.submitLabel(1)).toBe("Apply to lane · 1 vehicle");
    expect(MARKETPLACE_LANE_RATE_COPY.submitLabel(3)).toBe("Apply to lane · 3 vehicles");
  });

  it("states that prior offers are left alone", () => {
    expect(MARKETPLACE_LANE_RATE_COPY.countHint(2, 200)).toMatch(
      /already bid on, declined, or were rejected on are left alone/,
    );
  });

  it("confirms loads reached now and the stop conditions", () => {
    expect(
      laneRateConfirmation({
        amountLabel: "₹42,000",
        attached: 2,
        vehicleLimit: 3,
        validUntilDate: "2026-11-21",
      }),
    ).toEqual({
      title: "Lane rate on",
      message:
        "Placed on 2 more open loads now. New loads on this lane get ₹42,000 automatically until 2026-11-21 or 3 vehicles awarded.",
    });
  });

  it("omits the immediate count when nothing else is open", () => {
    expect(
      laneRateConfirmation({
        amountLabel: "₹42,000",
        attached: 0,
        vehicleLimit: 1,
        validUntilDate: "2026-11-21",
      }).message,
    ).toBe(
      "New loads on this lane get ₹42,000 automatically until 2026-11-21 or 1 vehicle awarded.",
    );
  });
});
