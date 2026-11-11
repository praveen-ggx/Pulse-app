/**
 * Marketplace Loads → My Bids: group this org's not-yet-allocated
 * market_bids back into anonymous lane cards (same chrome as Get Load
 * Network bid pools). Shipper identity and indent numbers stay off the card
 * until the bid is awarded AND the Marketplace fee is settled.
 */
import type { MyOrgMarketBidRow } from "@/features/network/services/findLoadsForOrg.service";
import {
  canonicalPoolField,
  poolKey,
} from "@/features/network/utils/pooledOpportunity.util";
import type { MarketplaceLoadSearch } from "@/features/network/utils/marketplaceSearch.util";

export type MarketplaceBidPool = {
  id: string;
  pickup: string;
  drop: string;
  /** Vehicle type when the server sends it (pool key); otherwise empty. */
  vehicleType: string;
  /** Commodity / load type — fallback fact when vehicle type is unavailable. */
  loadType: string;
  members: MyOrgMarketBidRow[];
  earliestPickup: string | null;
  latestPickup: string | null;
  rateMin: number;
  rateMax: number;
  weightKgMin: number | null;
  weightKgMax: number | null;
  /** Uniform bid status across members, or null when mixed. */
  uniformStatus: MyOrgMarketBidRow["status"] | null;
  /**
   * Marketplace pool to reopen for "Revise bid" — only when the vehicle type
   * is known, since Marketplace pools are keyed pickup × drop × vehicle.
   */
  reviseKey: MarketplaceLoadSearch | null;
};

function positiveNumber(value: unknown): number | null {
  const n = Number(value ?? 0);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function laneId(bid: MyOrgMarketBidRow): string {
  const vehicle = (bid.vehicle_type ?? "").trim();
  return [
    canonicalPoolField(bid.pickup_area),
    canonicalPoolField(bid.drop_location),
    // Same key as Marketplace pools when the server sends vehicle_type;
    // load type keeps older servers grouping sensibly.
    vehicle ? `v:${canonicalPoolField(vehicle)}` : `l:${canonicalPoolField(bid.load_type)}`,
  ].join("|");
}

function minOf(a: number | null, b: number | null): number | null {
  if (a == null) return b;
  if (b == null) return a;
  return Math.min(a, b);
}

function maxOf(a: number | null, b: number | null): number | null {
  if (a == null) return b;
  if (b == null) return a;
  return Math.max(a, b);
}

/**
 * Groups bids that share a lane into one anonymous pool. Order follows the
 * first-seen lane. Empty input → empty pools.
 */
export function buildMarketplaceBidPools(
  bids: readonly MyOrgMarketBidRow[],
): MarketplaceBidPool[] {
  const byId = new Map<string, MarketplaceBidPool>();
  const order: string[] = [];
  for (const bid of bids) {
    const id = laneId(bid);
    const date = (bid.pickup_date ?? "").slice(0, 10) || null;
    const amount = positiveNumber(bid.amount);
    const kg = positiveNumber(bid.weight);
    const prev = byId.get(id);
    if (!prev) {
      const pickup = (bid.pickup_area ?? "").trim() || "Pickup";
      const drop = (bid.drop_location ?? "").trim() || "Drop";
      const vehicleType = (bid.vehicle_type ?? "").trim();
      order.push(id);
      byId.set(id, {
        id,
        pickup,
        drop,
        vehicleType,
        loadType: (bid.load_type ?? "").trim(),
        members: [bid],
        earliestPickup: date,
        latestPickup: date,
        rateMin: amount ?? 0,
        rateMax: amount ?? 0,
        weightKgMin: kg,
        weightKgMax: kg,
        uniformStatus: bid.status,
        reviseKey:
          vehicleType && bid.pickup_area && bid.drop_location
            ? poolKey({
                pickup: bid.pickup_area,
                drop: bid.drop_location,
                vehicleType,
              })
            : null,
      });
      continue;
    }
    prev.members.push(bid);
    if (date) {
      if (!prev.earliestPickup || date < prev.earliestPickup) prev.earliestPickup = date;
      if (!prev.latestPickup || date > prev.latestPickup) prev.latestPickup = date;
    }
    if (amount != null) {
      prev.rateMin = prev.rateMin > 0 ? Math.min(prev.rateMin, amount) : amount;
      prev.rateMax = Math.max(prev.rateMax, amount);
    }
    prev.weightKgMin = minOf(prev.weightKgMin, kg);
    prev.weightKgMax = maxOf(prev.weightKgMax, kg);
    if (prev.uniformStatus !== bid.status) prev.uniformStatus = null;
  }
  return order.map((id) => byId.get(id)!);
}
