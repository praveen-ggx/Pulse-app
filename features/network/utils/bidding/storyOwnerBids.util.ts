import type { DirectQuoteRow } from "@/features/indents/services/direct-quotes.service";
import type {
  BidRow,
  DriverDirectBidRow,
} from "@/features/network/services/bids.service";

export type StoryOwnerBidChannel = "pulse_story" | "load_center" | "fleet_owner";

export type StoryOwnerBidRow = {
  key: string;
  channel: StoryOwnerBidChannel;
  channelLabel: string;
  identifier: string;
  bidderOrgId: string;
  bidderName: string;
  amount: number;
  status: string;
  note: string | null;
  createdAt: string;
  bidId: string | null;
  quoteId: string | null;
  /** Set for driver_direct_bids rows. */
  directBidId?: string | null;
  bidderAvatarUrl?: string | null;
  bidderAvatarSeed?: string | null;
};

function shortIdentifier(prefix: string, id: string): string {
  const compact = id.replace(/-/g, "").slice(0, 8).toUpperCase();
  return `${prefix}·${compact}`;
}

function normalizeStatus(status: string | null | undefined): string {
  return (status ?? "").trim().toLowerCase();
}

function fleetOwnerBidderLabel(bid: DriverDirectBidRow): string {
  const name = bid.driver_display_name.trim() || "Driver";
  if (bid.is_fleet_owner) {
    return `Fleet owner with driver (${name})`;
  }
  return `Driver (${name})`;
}

/**
 * Merge Pulse story bids (`bids` on post), Load center quotes (`direct_quotes`
 * on indent), and Fleet Owner / independent driver_direct_bids on the post.
 */
export function buildStoryOwnerBidRows(
  storyBids: BidRow[],
  directQuotes: DirectQuoteRow[],
  driverDirectBids: DriverDirectBidRow[] = [],
): StoryOwnerBidRow[] {
  const quoteNameByOrg = new Map(
    directQuotes
      .filter((q) => q.bidder_organization_id && q.bidder_organization_name?.trim())
      .map((q) => [q.bidder_organization_id, q.bidder_organization_name!.trim()] as const),
  );
  const storyBidderOrgs = new Set(
    storyBids.map((b) => b.bidder_organization_id).filter(Boolean),
  );
  const rows: StoryOwnerBidRow[] = [];

  for (const bid of storyBids) {
    rows.push({
      key: `story-${bid.id}`,
      channel: "pulse_story",
      channelLabel: "Pulse story",
      identifier: shortIdentifier("STORY", bid.id),
      bidderOrgId: bid.bidder_organization_id,
      bidderName:
        bid.bidder_org_name?.trim() ||
        quoteNameByOrg.get(bid.bidder_organization_id) ||
        "Partner",
      amount: Number(bid.amount ?? 0),
      status: normalizeStatus(bid.status),
      note: bid.note,
      createdAt: bid.created_at,
      bidId: bid.id,
      quoteId: null,
      directBidId: null,
    });
  }

  for (const quote of directQuotes) {
    if (storyBidderOrgs.has(quote.bidder_organization_id)) continue;
    rows.push({
      key: `load-${quote.id}`,
      channel: "load_center",
      channelLabel: "Load center",
      identifier: shortIdentifier("LOAD", quote.id),
      bidderOrgId: quote.bidder_organization_id,
      bidderName: quote.bidder_organization_name?.trim() || "Partner",
      amount: Number(quote.amount ?? 0),
      status: normalizeStatus(quote.status),
      note: quote.notes,
      createdAt: quote.created_at,
      bidId: null,
      quoteId: quote.id,
      directBidId: null,
    });
  }

  for (const bid of driverDirectBids) {
    rows.push({
      key: `direct-${bid.id}`,
      channel: "fleet_owner",
      channelLabel: bid.is_fleet_owner ? "Fleet owner" : "Driver",
      identifier: shortIdentifier(bid.is_fleet_owner ? "FO" : "DRV", bid.id),
      bidderOrgId: bid.driver_user_id,
      bidderName: fleetOwnerBidderLabel(bid),
      amount: Number(bid.amount ?? 0),
      status: normalizeStatus(bid.status),
      note: bid.note,
      createdAt: bid.created_at,
      bidId: null,
      quoteId: null,
      directBidId: bid.id,
      bidderAvatarUrl: bid.driver_avatar_url,
      bidderAvatarSeed: bid.driver_avatar_seed,
    });
  }

  return rows.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

export function storyOwnerBidsLabel(count: number, loading: boolean): string {
  if (loading) return "…";
  if (count === 0) return "No bids yet";
  if (count === 1) return "1 bid";
  return `${count} bids`;
}

/** Newest submitted-at wins. History stays; this is the one to pick. */
export function latestStoryOwnerBid(
  rows: readonly StoryOwnerBidRow[],
): StoryOwnerBidRow | null {
  if (rows.length === 0) return null;
  return [...rows].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  )[0] ?? null;
}

export function formatStoryBidSubmittedAt(iso: string | null | undefined): string {
  if (!iso) return "";
  const at = new Date(iso);
  if (!Number.isFinite(at.getTime())) return "";
  return at.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
