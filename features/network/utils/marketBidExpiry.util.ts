/**
 * Individual Marketplace bid expiry, as the shipper sees it.
 * The database owns the rule (market_bids.expires_at, refused with
 * bid_expired at award time); this only decides what the UI shows.
 */

export type MarketBidExpiryView =
  | { kind: "active"; label: string }
  | { kind: "expired"; label: string }
  | { kind: "none" };

export const MARKET_BID_EXPIRED_LABEL = "Bid expired";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

type ExpiringBid = { status?: string | null; expires_at?: string | null };

function expiryMs(bid: ExpiringBid): number | null {
  if (!bid.expires_at) return null;
  const ms = Date.parse(bid.expires_at);
  return Number.isFinite(ms) ? ms : null;
}

function isPending(bid: ExpiringBid): boolean {
  return (bid.status ?? "pending").toLowerCase() === "pending";
}

/** Pending and at or past its own expires_at. Accepted and closed bids are never "expired". */
export function isMarketBidExpired(bid: ExpiringBid, nowMs: number): boolean {
  const at = expiryMs(bid);
  return isPending(bid) && at != null && nowMs >= at;
}

/**
 * Pending and not yet expired. A row without expires_at (server not yet
 * migrated) stays actionable; the award RPC still decides.
 */
export function isMarketBidActionable(bid: ExpiringBid, nowMs: number): boolean {
  return isPending(bid) && !isMarketBidExpired(bid, nowMs);
}

/** "18 Nov, 10:30 AM" in the device time zone. */
export function formatMarketBidExpiry(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return null;
  const h24 = d.getHours();
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${d.getDate()} ${MONTHS[d.getMonth()]}, ${h12}:${mm} ${h24 < 12 ? "AM" : "PM"}`;
}

/** What to show under a bid: its validity while pending, nothing once decided. */
export function marketBidExpiryView(bid: ExpiringBid, nowMs: number): MarketBidExpiryView {
  if (!isPending(bid) || !bid.expires_at) return { kind: "none" };
  if (isMarketBidExpired(bid, nowMs)) return { kind: "expired", label: MARKET_BID_EXPIRED_LABEL };
  const when = formatMarketBidExpiry(bid.expires_at);
  return when ? { kind: "active", label: `Valid until ${when}` } : { kind: "none" };
}

/** award_market_bid refused the bid because its own clock had passed. */
export function isMarketBidExpiredError(message: string | null | undefined): boolean {
  return /\bbid_expired\b/.test(message ?? "");
}

/** Next instant a currently actionable bid in the list will expire, if any. */
export function nextMarketBidExpiryMs(bids: readonly ExpiringBid[], nowMs: number): number | null {
  let next: number | null = null;
  for (const bid of bids) {
    if (!isPending(bid)) continue;
    const at = expiryMs(bid);
    if (at == null || at <= nowMs) continue;
    if (next == null || at < next) next = at;
  }
  return next;
}
