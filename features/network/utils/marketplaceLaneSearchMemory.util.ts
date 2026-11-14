import type { MarketplaceLoadSearch, MarketplaceSearchLane } from "@/features/network/utils/marketplaceSearch.util";
import { normalizeMarketplaceSearch } from "@/features/network/utils/marketplaceSearch.util";
import {
  canonicalPoolField,
  canonicalPoolLanes,
  poolFieldOptions,
} from "@/features/network/utils/pooledOpportunity.util";

export function marketplaceLaneSearchKey(orgId: string): string {
  return `pulse.marketplaceLaneSearch.v1.${orgId}`;
}

/** Busiest live lane. Used when this org has no saved search. */
export function presetMarketplaceSearch(
  lanes: readonly MarketplaceSearchLane[],
): MarketplaceLoadSearch | null {
  const pools = canonicalPoolLanes(lanes);
  if (pools.length === 0) return null;
  const top = [...pools].sort(
    (a, b) => (Number(b.load_count) || 0) - (Number(a.load_count) || 0) || a.poolId.localeCompare(b.poolId),
  )[0];
  return {
    pickup: top.pickup_area,
    drop: top.drop_location,
    vehicleType: top.vehicle_type,
  };
}

/**
 * Last search, kept only for fields that still exist on live lanes.
 * Pickup is required. A drop or vehicle that is no longer offered is dropped.
 */
export function liveMarketplaceSearch(
  lanes: readonly MarketplaceSearchLane[],
  saved: Partial<MarketplaceLoadSearch> | null | undefined,
): MarketplaceLoadSearch | null {
  const draft = normalizeMarketplaceSearch(saved);
  if (!draft.pickup) return null;
  const pickup = poolFieldOptions(lanes, {}, "pickup").find(
    (option) => canonicalPoolField(option.label) === canonicalPoolField(draft.pickup),
  );
  if (!pickup) return null;
  if (!draft.drop) {
    return { pickup: pickup.label, drop: "", vehicleType: "" };
  }
  const drop = poolFieldOptions(lanes, { pickup: pickup.label }, "drop").find(
    (option) => canonicalPoolField(option.label) === canonicalPoolField(draft.drop),
  );
  if (!drop) return { pickup: pickup.label, drop: "", vehicleType: "" };
  const vehicle = poolFieldOptions(lanes, { pickup: pickup.label, drop: drop.label }, "vehicle").find(
    (option) => canonicalPoolField(option.label) === canonicalPoolField(draft.vehicleType),
  );
  return {
    pickup: pickup.label,
    drop: drop.label,
    vehicleType: vehicle?.label ?? "",
  };
}

export function marketplaceLaneCountKey(orgId: string): string {
  return `pulse.marketplaceLaneCount.v1.${orgId}`;
}

/** Pickup and drop only. A bid does not carry the lane's vehicle. */
export function bidderLaneKey(pickup: string | null | undefined, drop: string | null | undefined): string {
  return `${canonicalPoolField(pickup)}|${canonicalPoolField(drop)}`;
}

export function lanePoolCounts(
  lanes: readonly { pickup_area?: string | null; drop_location?: string | null; load_count?: number | null }[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const lane of lanes) {
    const key = bidderLaneKey(lane.pickup_area, lane.drop_location);
    counts.set(key, (counts.get(key) ?? 0) + (Number(lane.load_count) || 0));
  }
  return counts;
}

/** Highest open count seen for a lane. A later smaller count stays below it. */
export function rememberLaneCounts(
  previous: Readonly<Record<string, number>>,
  current: ReadonlyMap<string, number>,
): Record<string, number> {
  const next: Record<string, number> = { ...previous };
  for (const [key, count] of current) {
    if (count > (next[key] ?? 0)) next[key] = count;
  }
  return next;
}

export type BidderLanePreview = {
  tone: "live" | "reduced" | "expired";
  label: string;
};

function pickupHasPassed(pickupDate: string | null | undefined, today: string): boolean {
  const day = String(pickupDate ?? "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) && day < today;
}

/**
 * What the bidder should see for a pending bid's lane.
 * Expired stays once the pickup day has passed or the lane is no longer open.
 * Reduced stays while the live count is below the highest count already seen.
 */
export function bidderLanePreview(input: {
  bidStatus: string;
  pickupDate?: string | null;
  currentCount: number;
  rememberedCount?: number | null;
  lanesReady: boolean;
  today: string;
}): BidderLanePreview | null {
  if (input.bidStatus !== "pending" || !input.lanesReady) return null;
  if (pickupHasPassed(input.pickupDate, input.today) || input.currentCount <= 0) {
    return { tone: "expired", label: "Expired" };
  }
  const remembered = Number(input.rememberedCount);
  if (Number.isFinite(remembered) && remembered > input.currentCount) {
    return { tone: "reduced", label: `Reduced · ${input.currentCount} pooled` };
  }
  return { tone: "live", label: `${input.currentCount} pooled` };
}

/** Same pickup and drop are one pool. Bids do not carry the lane vehicle. */
export function groupBidsByLane<T extends { pickup_area: string | null; drop_location: string | null }>(
  bids: readonly T[],
): { key: string; bids: T[] }[] {
  const order: string[] = [];
  const groups = new Map<string, T[]>();
  for (const bid of bids) {
    const key = bidderLaneKey(bid.pickup_area, bid.drop_location);
    const list = groups.get(key);
    if (list) list.push(bid);
    else {
      groups.set(key, [bid]);
      order.push(key);
    }
  }
  return order.map((key) => ({ key, bids: groups.get(key) ?? [] }));
}
