import type { PoolBidCommitCopy } from "@/features/network/components/bidding/PoolBidCommitSheet";

/** How long a Marketplace lane rate stays visible to new loads. The database sets this. */
export const MARKETPLACE_LANE_RATE_HOURS = 48;

export function marketplaceLaneRateValidUntilIso(from = new Date()): string {
  return new Date(from.getTime() + MARKETPLACE_LANE_RATE_HOURS * 60 * 60 * 1000).toISOString();
}

/** Retry copy. The rate is bid visibility for 48 hours, not a vehicle reservation. */
export const MARKETPLACE_LANE_RATE_COPY: PoolBidCommitCopy = {
  title: "Lane rate for 48 hours",
  scope: "on eligible loads on this lane",
  hidesAllocation: true,
  countHint: () =>
    "Each eligible load gets its own bid. The shipper accepts that bid. This does not reserve a vehicle or award the load.",
  dateHint:
    "New loads on this lane receive your rate for 48 hours from when it was saved. Sending the same rate again does not extend that window. Accepted bids stay as they are.",
  submitLabel: () => "Save lane rate for 48 hours",
  submitA11y: "Save this lane rate for 48 hours",
  dismissLabel: "Close",
};

export function laneRateConfirmation(input: {
  amountLabel: string;
  attached: number;
  reused?: boolean;
  rateChanged?: boolean;
  renewed?: boolean;
}): { title: string; message: string } {
  const placed =
    input.attached > 0
      ? `Placed on ${input.attached} more open load${input.attached === 1 ? "" : "s"}. `
      : "";
  if (input.renewed) {
    return {
      title: "Lane rate renewed",
      message: `${placed}Your rate of ${input.amountLabel} is visible on this lane for a new 48 hours. Each shipper accepts its own bid. No vehicle is reserved.`,
    };
  }
  if (input.rateChanged) {
    return {
      title: "Lane rate updated",
      message: `${placed}Pending bids on this lane now use ${input.amountLabel}. Accepted bids are unchanged. The 48-hour window was not extended.`,
    };
  }
  if (input.reused) {
    return {
      title: "Lane rate already on",
      message: `${placed}This rate stays on the lane. The 48-hour window was not extended. Each shipper still accepts its own bid.`,
    };
  }
  return {
    title: "Lane rate on",
    message: `${placed}New loads on this lane get ${input.amountLabel} for 48 hours. Each load has its own bid, and the shipper accepts it. No vehicle is reserved and nothing is awarded automatically.`,
  };
}
