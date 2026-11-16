/**
 * A bid on a lane applies to every live indent on that lane: ones that
 * already existed when the bid was placed, and ones created afterwards.
 * The offer rows stay on the indents that received them; every other live
 * indent on the same pickup + drop + vehicle shows that lane bid.
 */
import { poolKey, poolKeyId } from "@/features/network/utils/pooledOpportunity.util";
import { formatINR } from "@/lib/format";

type LaneIndent = {
  id: string;
  pickup_area: string | null;
  drop_location: string | null;
  vehicle_type: string | null;
};

export function indentLaneKey(indent: LaneIndent): string | null {
  const key = poolKey({
    pickup: indent.pickup_area,
    drop: indent.drop_location,
    vehicleType: indent.vehicle_type,
  });
  if (!key.pickup || !key.drop || !key.vehicleType) return null;
  return poolKeyId(key);
}

/** Lane key → number of indents on that lane with at least one live bid. */
export function laneBiddingIndentCounts(
  indents: readonly LaneIndent[],
  bidCountById: Readonly<Record<string, number>>,
): Map<string, number> {
  const counts = new Map<string, number>();
  const seen = new Set<string>();
  for (const indent of indents) {
    if (seen.has(indent.id)) continue;
    seen.add(indent.id);
    if ((bidCountById[indent.id] ?? 0) <= 0) continue;
    const key = indentLaneKey(indent);
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

export type LaneBidSpread = {
  biddingLoads: number;
  lowest: number | null;
  highest: number | null;
};

type BidAmount = {
  lowestAmount: number | null;
  highestAmount: number | null;
};

/** Lowest and highest live offer on a lane, across every indent that holds one. */
export function laneBidSpreads(
  indents: readonly LaneIndent[],
  bidCountById: Readonly<Record<string, number>>,
  snapshots: Readonly<Record<string, BidAmount>>,
): Map<string, LaneBidSpread> {
  const spreads = new Map<string, LaneBidSpread>();
  const seen = new Set<string>();
  for (const indent of indents) {
    if (seen.has(indent.id)) continue;
    seen.add(indent.id);
    if ((bidCountById[indent.id] ?? 0) <= 0) continue;
    const key = indentLaneKey(indent);
    if (!key) continue;
    const snap = snapshots[indent.id];
    const current = spreads.get(key) ?? {
      biddingLoads: 0,
      lowest: null,
      highest: null,
    };
    current.biddingLoads += 1;
    const low = snap?.lowestAmount ?? null;
    const high = snap?.highestAmount ?? null;
    if (low != null && low > 0 && (current.lowest == null || low < current.lowest)) {
      current.lowest = low;
    }
    if (high != null && high > 0 && (current.highest == null || high > current.highest)) {
      current.highest = high;
    }
    spreads.set(key, current);
  }
  return spreads;
}

/** Pill text for a waiting indent that inherits its lane's bids. */
export function laneBidTag(spread: LaneBidSpread | null | undefined): string | null {
  if (!spread || spread.biddingLoads <= 0) return null;
  const { lowest, highest } = spread;
  if (lowest == null && highest == null) return "LANE HAS BIDS";
  if (lowest != null && highest != null && lowest !== highest) {
    return `${formatINR(lowest)}–${formatINR(highest)}`;
  }
  return formatINR((lowest ?? highest) as number);
}

/** "Lane bids ₹4,233–₹5,250 on 13 loads", or null when the lane has none. */
export function laneBidHint(input: {
  biddingLoads: number;
  lowest: number | null;
  highest: number | null;
}): string | null {
  const { biddingLoads, lowest, highest } = input;
  if (biddingLoads <= 0) return null;
  const loads = `${biddingLoads} load${biddingLoads === 1 ? "" : "s"}`;
  if (lowest == null && highest == null) return `Lane has bids on ${loads}`;
  const range =
    lowest != null && highest != null && lowest !== highest
      ? `${formatINR(lowest)}–${formatINR(highest)}`
      : formatINR((lowest ?? highest) as number);
  return `Lane bids ${range} on ${loads}`;
}
