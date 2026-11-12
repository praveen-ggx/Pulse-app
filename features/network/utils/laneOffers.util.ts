import type {
  LaneOffer,
  LaneOffersPage,
} from "@/features/network/services/laneOffers.service";

export type LaneOffersDialogMode = "offers" | "recommend_marketplace" | "none";

/**
 * What the post-create dialog shows for a freshly shared indent.
 * - offers: something is already on the indent (attached lane commitments)
 *   or on the lane, in a channel the shipper can use or switch on.
 * - recommend_marketplace: shared to Network only and the Network has nothing;
 *   Marketplace reach is the next step, with its lane bids if any.
 * - none: nothing to say (e.g. offline load, or Marketplace already on and empty).
 */
export function laneOffersDialogMode(
  page: Pick<
    LaneOffersPage,
    "network_open" | "marketplace_open" | "network_count" | "marketplace_count"
  > | null,
  attachedCount: number,
): LaneOffersDialogMode {
  if (!page) return attachedCount > 0 ? "offers" : "none";
  const networkOffers = attachedCount + page.network_count;
  if (page.network_open && !page.marketplace_open && networkOffers === 0) {
    return "recommend_marketplace";
  }
  if (!page.network_open && !page.marketplace_open) {
    return attachedCount > 0 ? "offers" : "none";
  }
  return networkOffers + page.marketplace_count > 0 ? "offers" : "none";
}

export type LaneOfferAction =
  | { kind: "attach"; label: string }
  | { kind: "invite"; label: string }
  | { kind: "post_to_marketplace"; label: string }
  | { kind: "status"; label: string };

export function laneOfferAction(offer: LaneOffer, amountLabel: string): LaneOfferAction {
  if (offer.invite_blocker === "needs_marketplace") {
    return { kind: "post_to_marketplace", label: "Post to Marketplace" };
  }
  if (offer.invite_blocker === "needs_network") {
    return { kind: "status", label: "Network only" };
  }
  if (offer.invite_blocker === "not_in_network") {
    return { kind: "status", label: "Not in your Network" };
  }
  if (offer.kind === "pool_commitment") {
    return { kind: "attach", label: `Add at ${amountLabel}` };
  }
  if (offer.invite_status === "pending") return { kind: "status", label: "Invited" };
  if (offer.invite_status === "accepted") return { kind: "status", label: "Accepted" };
  return {
    kind: "invite",
    label: offer.invite_status === "declined" || offer.invite_status === "expired"
      ? `Invite again at ${amountLabel}`
      : `Invite at ${amountLabel}`,
  };
}

export function laneOfferSourceLabel(offer: LaneOffer): string {
  if (offer.kind === "pool_commitment") {
    const left = offer.vehicles_left ?? 0;
    return `Lane rate · ${left} ${left === 1 ? "vehicle" : "vehicles"} left`;
  }
  return offer.source_indent_number ? `Bid on ${offer.source_indent_number}` : "Bid on this lane";
}

const LANE_ERRORS: Array<[string, string]> = [
  ["needs_marketplace", "Post this load to Marketplace first to invite Marketplace bidders."],
  ["needs_network", "Share this load with your Network first."],
  ["not_in_network", "This carrier is not in your Network."],
  ["already_bid", "This carrier already has an offer on this load."],
  ["source_not_found", "That offer is no longer open. Refresh to see current offers."],
  ["indent_not_open", "This load is no longer open for offers."],
  ["invite_not_pending", "This request was already answered."],
  ["unauthorized", "You don't have access to do this."],
  ["owner_vehicle_required", "Choose an active vehicle before accepting."],
  ["driver_unavailable", "Finish your active trip before accepting another load."],
  ["not_marketplace_circulated", "This load is no longer on Marketplace."],
  ["indent_not_visible", "This load is no longer shared with your organization."],
  ["quote_locked", "Your quote on this load can no longer be changed."],
];

export function laneOfferErrorMessage(error: Error | null | undefined): string {
  const raw = error?.message ?? "";
  const hit = LANE_ERRORS.find(([code]) => raw.includes(code));
  return hit ? hit[1] : raw || "Something went wrong. Please try again.";
}
