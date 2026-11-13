/**
 * Driven path for a COMPLETED trip map (read once, never live).
 *
 * Cleans the saved GPS history + checkpoints so the map shows what really happened:
 *  - drops invalid / 0,0 points and sorts oldest → newest
 *  - skips GPS wobble: a point closer than `minStepM` to the last kept point
 *  - driver never really moved (every point within `stationaryRadiusM` of the
 *    first) → a single "last location" dot, no line
 */
import {
  mergeMapLocationTrail,
  type MapTrailPoint,
} from '@/features/trips/utils/mapDriverTracking.util';

export const COMPLETED_PATH_MIN_STEP_M = 30;
export const COMPLETED_PATH_STATIONARY_RADIUS_M = 100;

function distanceM(a: MapTrailPoint, b: MapTrailPoint): number {
  const R = 6_371_000;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLon = ((b.longitude - a.longitude) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.latitude * Math.PI) / 180) *
      Math.cos((b.latitude * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function isUsable(p: MapTrailPoint): boolean {
  if (!Number.isFinite(p.latitude) || !Number.isFinite(p.longitude)) return false;
  if (Math.abs(p.latitude) > 90 || Math.abs(p.longitude) > 180) return false;
  if (Math.abs(p.latitude) < 1e-6 && Math.abs(p.longitude) < 1e-6) return false;
  return Number.isFinite(new Date(p.recorded_at).getTime());
}

export function buildCompletedTripPath(
  gpsHistory: MapTrailPoint[],
  checkpoints: MapTrailPoint[],
  opts: { minStepM?: number; stationaryRadiusM?: number } = {},
): MapTrailPoint[] {
  const minStepM = opts.minStepM ?? COMPLETED_PATH_MIN_STEP_M;
  const stationaryRadiusM = opts.stationaryRadiusM ?? COMPLETED_PATH_STATIONARY_RADIUS_M;

  const ordered = mergeMapLocationTrail(gpsHistory, checkpoints).filter(isUsable);
  if (ordered.length === 0) return [];

  const first = ordered[0];
  const last = ordered[ordered.length - 1];
  const moved = ordered.some((p) => distanceM(first, p) > stationaryRadiusM);
  if (!moved) return [last];

  const kept: MapTrailPoint[] = [first];
  for (let i = 1; i < ordered.length; i++) {
    const p = ordered[i];
    if (distanceM(kept[kept.length - 1], p) >= minStepM) kept.push(p);
  }
  // Always end on the real last fix (where the trip finished).
  const tail = kept[kept.length - 1];
  if (tail !== last) {
    if (distanceM(tail, last) < minStepM) kept[kept.length - 1] = last;
    else kept.push(last);
  }
  return kept;
}
