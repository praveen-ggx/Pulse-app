/**
 * Marketplace Loads → My Bids: group this org's pending/closed market_bids
 * back into anonymous lane cards (same chrome as Get Load Network bid pools).
 * Shipper identity and indent numbers stay off the card until Awarded.
 */
import type { MyOrgMarketBidRow } from "@/features/network/services/findLoadsForOrg.service";
import { canonicalPoolField } from "@/features/network/utils/pooledOpportunity.util";

export type MarketplaceBidPool = {
  id: string;
  pickup: string;
  drop: string;
  /** Commodity / load type when present — shown as the Vehicle-style fact. */
  loadType: string;
  members: MyOrgMarketBidRow[];
  earliestPickup: string | null;
  latestPickup: string | null;
  rateMin: number;
  rateMax: number;
  /** Uniform bid status across members, or null when mixed. */
  uniformStatus: MyOrgMarketBidRow["status"] | null;
};

function laneId(bid: MyOrgMarketBidRow): string {
  return [
    canonicalPoolField(bid.pickup_area),
    canonicalPoolField(bid.drop_location),
    canonicalPoolField(bid.load_type),
  ].join("|");
}

function positiveAmount(value: unknown): number | null {
  const n = Number(value ?? 0);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Groups bids that share pickup × drop × load type into one anonymous pool.
 * Order follows first-seen lane. Empty input → empty pools.
 */
export function buildMarketplaceBidPools(
  bids: readonly MyOrgMarketBidRow[],
): MarketplaceBidPool[] {
  const byId = new Map<string, MarketplaceBidPool>();
  const order: string[] = [];
  for (const bid of bids) {
    const id = laneId(bid);
    const pickup = (bid.pickup_area ?? "").trim() || "Pickup";
    const drop = (bid.drop_location ?? "").trim() || "Drop";
    const loadType = (bid.load_type ?? "").trim();
    const date = (bid.pickup_date ?? "").slice(0, 10) || null;
    const amount = positiveAmount(bid.amount) ?? 0;
    const prev = byId.get(id);
    if (!prev) {
      order.push(id);
      byId.set(id, {
        id,
        pickup,
        drop,
        loadType,
        members: [bid],
        earliestPickup: date,
        latestPickup: date,
        rateMin: amount,
        rateMax: amount,
        uniformStatus: bid.status,
      });
      continue;
    }
    prev.members.push(bid);
    if (date) {
      if (!prev.earliestPickup || date < prev.earliestPickup) prev.earliestPickup = date;
      if (!prev.latestPickup || date > prev.latestPickup) prev.latestPickup = date;
    }
    if (amount > 0) {
      prev.rateMin = prev.rateMin > 0 ? Math.min(prev.rateMin, amount) : amount;
      prev.rateMax = Math.max(prev.rateMax, amount);
    }
    if (prev.uniformStatus !== bid.status) prev.uniformStatus = null;
  }
  return order.map((id) => byId.get(id)!);
}
