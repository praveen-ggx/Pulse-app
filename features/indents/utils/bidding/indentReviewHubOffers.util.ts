import type { DirectQuoteRow } from "@/features/indents/services/direct-quotes.service";
import type { DriverDirectBidRow } from "@/features/network/services/bids.service";
import type { MarketBidForIndentRow } from "@/features/network/services/marketBids.service";

export function driverDirectBidToHubQuote(
  bid: DriverDirectBidRow,
  indentId: string,
  available?: boolean,
): DirectQuoteRow {
  const name = bid.driver_display_name.trim() || "Driver";
  const onOtherTrip = bid.status === "pending" && available === false;
  const unavailable = bid.status === "superseded" || onOtherTrip;
  return {
    id: bid.id,
    indent_id: indentId,
    bidder_organization_id: "",
    bidder_organization_name: bid.is_fleet_owner
      ? `Fleet owner (${name})`
      : `Driver (${name})`,
    amount: bid.amount,
    notes: bid.note,
    status: unavailable ? "superseded" : bid.status,
    created_at: bid.created_at,
    updated_at: bid.updated_at,
    counter_amount: bid.counter_amount,
    offer_source: "driver_direct_bid",
    bidder_avatar_url: bid.driver_avatar_url,
    bidder_avatar_seed: bid.driver_avatar_seed,
    bidder_user_id: bid.driver_user_id,
    bidderUnavailable: unavailable,
  };
}

export function marketBidToHubQuote(bid: MarketBidForIndentRow): DirectQuoteRow {
  const name =
    bid.bidder_organization_name?.trim() ||
    bid.bidder_display_name.trim() ||
    "Bidder";
  return {
    id: bid.id,
    indent_id: bid.indent_id,
    bidder_organization_id: bid.bidder_organization_id ?? "",
    bidder_organization_name: name,
    amount: bid.amount,
    notes: bid.note,
    status: bid.status,
    created_at: bid.created_at,
    updated_at: bid.updated_at,
    offer_source: "market_bid",
    bidder_user_id: bid.bidder_user_id,
  };
}

export function mergeIndentReviewHubOffers(args: {
  indentId: string;
  directQuotes: DirectQuoteRow[];
  driverBids?: DriverDirectBidRow[];
  marketBids?: MarketBidForIndentRow[];
}): DirectQuoteRow[] {
  const fromQuotes = args.directQuotes.map((q) => ({
    ...q,
    offer_source: q.offer_source ?? ("direct_quote" as const),
  }));
  const fromDrivers = (args.driverBids ?? []).map((b) =>
    driverDirectBidToHubQuote(b, args.indentId),
  );
  const fromMarket = (args.marketBids ?? []).map(marketBidToHubQuote);
  return [...fromQuotes, ...fromDrivers, ...fromMarket];
}

export function shouldFallbackDirectQuotesToTable(
  rpcError: { message?: string } | null,
  rpcData: unknown,
): boolean {
  return rpcError != null || !Array.isArray(rpcData);
}
