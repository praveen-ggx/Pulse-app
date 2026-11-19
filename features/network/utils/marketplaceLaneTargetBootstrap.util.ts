import { listOpenMarketplaceLoadsPage } from "@/features/network/services/findLoadsForOrg.service";
import {
  combineLaneTarget,
  type MarketplaceSearchLane,
} from "@/features/network/utils/marketplaceSearch.util";
import { poolKeyFromLane, poolKeyId } from "@/features/network/utils/pooledOpportunity.util";

/** Parallel first-page reads. Matches the hot-lane window so the visible cards fill together. */
const TARGET_BOOTSTRAP_CONCURRENCY = 6;
/** Extra pages only when the first page already shows more than one target. */
const TARGET_BOOTSTRAP_MAX_PAGES = 3;

export type LaneTargetRange = { min: number | null; max: number | null };

export function marketplaceLaneTargetKey(orgId: string): string {
  return `pulse.marketplaceLaneTargets.v1.${orgId}`;
}

/** True when this row came from a lane payload that already includes the range columns. */
export function laneDeclaresTargetRange(lane: object): boolean {
  return "target_rate_min" in lane || "target_rate_max" in lane;
}

export function applyLaneTargetBootstrap<T extends MarketplaceSearchLane>(
  lanes: readonly T[],
  saved: Readonly<Record<string, LaneTargetRange>>,
): T[] {
  if (Object.keys(saved).length === 0) return lanes as T[];
  let changed = false;
  const next = lanes.map((lane) => {
    if (laneDeclaresTargetRange(lane)) return lane;
    const hit = saved[poolKeyId(poolKeyFromLane(lane))];
    if (!hit) return lane;
    changed = true;
    return { ...lane, target_rate_min: hit.min, target_rate_max: hit.max };
  });
  return changed ? next : (lanes as T[]);
}

/**
 * Fills target prices for lanes whose list payload has no range columns.
 * Hottest lanes go first. A page that shares one supplier target stops there.
 * Each lane reports as soon as it has a number, so the card does not wait for
 * the rest of the list.
 */
export async function bootstrapMarketplaceLaneTargets(
  orgId: string,
  lanes: readonly MarketplaceSearchLane[],
  onLane: (poolId: string, range: LaneTargetRange) => void,
  isCancelled: () => boolean = () => false,
): Promise<void> {
  const missing = lanes
    .filter((lane) => !laneDeclaresTargetRange(lane))
    .sort((a, b) => (Number(b.load_count) || 0) - (Number(a.load_count) || 0));
  if (missing.length === 0) return;

  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(TARGET_BOOTSTRAP_CONCURRENCY, missing.length) },
    async () => {
      while (!isCancelled()) {
        const index = cursor;
        cursor += 1;
        const lane = missing[index];
        if (!lane) return;
        const poolId = poolKeyId(poolKeyFromLane(lane));
        let min: number | null = null;
        let max: number | null = null;
        let offset = 0;
        for (let page = 0; page < TARGET_BOOTSTRAP_MAX_PAGES && !isCancelled(); page += 1) {
          const result = await listOpenMarketplaceLoadsPage(orgId, offset, 15, {
            pickup: lane.pickup_area,
            drop: lane.drop_location,
            vehicleType: lane.vehicle_type,
          });
          if (result.error) break;
          for (const load of result.loads) {
            min = combineLaneTarget(min, load.rate_offer, "min");
            max = combineLaneTarget(max, load.rate_offer, "max");
          }
          if (isCancelled()) return;
          if (min != null || max != null) onLane(poolId, { min, max });
          const uniform = min != null && min === max;
          if (uniform || !result.hasMore || result.loads.length === 0 || result.nextOffset == null) break;
          offset = result.nextOffset;
        }
        if (!isCancelled()) onLane(poolId, { min, max });
      }
    },
  );
  await Promise.all(workers);
}
