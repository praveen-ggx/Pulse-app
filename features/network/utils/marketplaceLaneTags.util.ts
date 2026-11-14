import type { MarketplaceSearchLane } from "@/features/network/utils/marketplaceSearch.util";

export type LaneTagKind = "pay" | "route" | "requirement";

export type LaneTag = { key: string; kind: LaneTagKind; label: string };

function count(value: number | null | undefined): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Tags for a lane card: pay basis, point-to-point vs multi-stop, then any extra
 * requirements. A tag only appears when the lane reports that field, so older
 * lane data shows no pay or route tag rather than a guessed one.
 */
export function marketplaceLaneTags(
  lane: Pick<
    MarketplaceSearchLane,
    "load_count" | "per_trip_count" | "per_mt_count" | "multi_stop_count" | "requirements"
  >,
): LaneTag[] {
  const tags: LaneTag[] = [];
  const total = Number(lane.load_count) || 0;

  const perTrip = count(lane.per_trip_count);
  const perMt = count(lane.per_mt_count);
  if (perTrip && perMt) {
    tags.push({ key: "pay-trip", kind: "pay", label: `Pay per trip · ${perTrip}` });
    tags.push({ key: "pay-mt", kind: "pay", label: `Pay per MT · ${perMt}` });
  } else if (perMt) {
    tags.push({ key: "pay-mt", kind: "pay", label: "Pay per MT" });
  } else if (perTrip) {
    tags.push({ key: "pay-trip", kind: "pay", label: "Pay per trip" });
  }

  const multi = count(lane.multi_stop_count);
  if (multi != null) {
    if (multi === 0) {
      tags.push({ key: "route-p2p", kind: "route", label: "Point to point" });
    } else if (multi >= total) {
      tags.push({ key: "route-multi", kind: "route", label: "Multi-stop" });
    } else {
      tags.push({ key: "route-p2p", kind: "route", label: `Point to point · ${total - multi}` });
      tags.push({ key: "route-multi", kind: "route", label: `Multi-stop · ${multi}` });
    }
  }

  for (const item of lane.requirements ?? []) {
    const label = item.trim();
    if (label) tags.push({ key: `req-${label.toLowerCase()}`, kind: "requirement", label });
  }
  return tags;
}
