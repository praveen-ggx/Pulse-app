import type { PoolBidCommitCopy } from "@/features/network/components/bidding/PoolBidCommitSheet";

/** Opt-in step after a pooled Marketplace bid: keep the rate on the whole lane. */
export const MARKETPLACE_LANE_RATE_COPY: PoolBidCommitCopy = {
  title: "Apply to new loads on this lane",
  scope: "for every open and new load on this lane",
  countHint: (count, max) =>
    `Your rate is placed automatically on loads shared on this lane until ${count} ${count === 1 ? "is" : "are"} awarded to you. Loads you already bid on, declined, or were rejected on are left alone. You can commit up to ${max}.`,
  dateHint: "After this date new loads stop receiving your rate. Bids already placed stay until you withdraw them.",
  submitLabel: (count) => `Apply to lane · ${count} vehicle${count === 1 ? "" : "s"}`,
  submitA11y: "Apply this rate to open and new loads on this lane",
  dismissLabel: "Not now",
};

export function laneRateConfirmation(input: {
  amountLabel: string;
  attached: number;
  vehicleLimit: number;
  validUntilDate: string;
}): { title: string; message: string } {
  const vehicles = `${input.vehicleLimit} vehicle${input.vehicleLimit === 1 ? "" : "s"}`;
  const now =
    input.attached > 0
      ? `Placed on ${input.attached} more open load${input.attached === 1 ? "" : "s"} now. `
      : "";
  return {
    title: "Lane rate on",
    message: `${now}New loads on this lane get ${input.amountLabel} automatically until ${input.validUntilDate} or ${vehicles} awarded.`,
  };
}
