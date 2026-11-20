/**
 * Driven path for a COMPLETED trip map (read once, never live).
 *
 * Cleans the saved GPS history + checkpoints so the map shows what really happened:
 *  - drops invalid / 0,0 points and sorts oldest → newest
 *  - skips GPS wobble: a point closer than `minStepM` to the last kept point
 *    (but keeps the last point of a ≥5 min stay, so the map can show the halt length)
 *  - driver never really moved (every point within `stationaryRadiusM` of the
 *    first) → a single "last location" dot, no line
 */
import {
  mergeMapLocationTrail,
  type MapTrailPoint,
} from '@/features/trips/utils/mapDriverTracking.util';
import { TRIP_HALT_MIN_DURATION_MS } from '@/features/trips/utils/tripHalts.util';

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

function timeMs(p: MapTrailPoint): number {
  return new Date(p.recorded_at).getTime();
}

export function buildCompletedTripPath(
  gpsHistory: MapTrailPoint[],
  checkpoints: MapTrailPoint[],
  opts: { minStepM?: number; stationaryRadiusM?: number; dwellKeepMs?: number } = {},
): MapTrailPoint[] {
  const minStepM = opts.minStepM ?? COMPLETED_PATH_MIN_STEP_M;
  const dwellKeepMs = opts.dwellKeepMs ?? TRIP_HALT_MIN_DURATION_MS;
  const stationaryRadiusM = opts.stationaryRadiusM ?? COMPLETED_PATH_STATIONARY_RADIUS_M;

  const ordered = mergeMapLocationTrail(gpsHistory, checkpoints).filter(isUsable);
  if (ordered.length === 0) return [];

  const first = ordered[0];
  const last = ordered[ordered.length - 1];
  const moved = ordered.some((p) => distanceM(first, p) > stationaryRadiusM);
  if (!moved) return [last];

  const kept: MapTrailPoint[] = [first];
  // Last skipped point of the current stationary run. Kept when the driver
  // stayed ≥ dwellKeepMs so the map can show how long they halted there.
  let runLast: MapTrailPoint | null = null;
  for (let i = 1; i < ordered.length; i++) {
    const p = ordered[i];
    const anchor = kept[kept.length - 1];
    if (distanceM(anchor, p) >= minStepM) {
      if (runLast && timeMs(runLast) - timeMs(anchor) >= dwellKeepMs) kept.push(runLast);
      kept.push(p);
      runLast = null;
    } else {
      runLast = p;
    }
  }
  // Always end on the real last fix (where the trip finished).
  const tail = kept[kept.length - 1];
  if (tail !== last) {
    const dwelled = timeMs(last) - timeMs(tail) >= dwellKeepMs;
    if (distanceM(tail, last) < minStepM && !dwelled) kept[kept.length - 1] = last;
    else kept.push(last);
  }
  return kept;
}
