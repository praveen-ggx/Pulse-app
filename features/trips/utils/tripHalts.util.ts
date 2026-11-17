/**
 * Halt detection for the trip map: turns a chronological GPS trail into
 * "the driver stopped here for N minutes" clusters.
 *
 * A halt = consecutive points that stay within `radiusM` of their running centre
 * and span at least `minDurationMs`. Points without a usable `recorded_at` never
 * join a halt (no time → no duration). Display only — nothing here is saved.
 */

export const TRIP_HALT_RADIUS_M = 100;
export const TRIP_HALT_MIN_DURATION_MS = 5 * 60_000;
/** Severity bands for the halt pill colour. */
export const TRIP_HALT_MEDIUM_MS = 15 * 60_000;
export const TRIP_HALT_LONG_MS = 60 * 60_000;

export type TripHaltSeverity = 'short' | 'medium' | 'long';

export type TripHaltPoint = {
  latitude: number;
  longitude: number;
  recorded_at?: string;
};

export type TripHalt = {
  latitude: number;
  longitude: number;
  startAt: string;
  endAt: string;
  durationMs: number;
  severity: TripHaltSeverity;
  /** Inclusive index range into the input trail. */
  firstIndex: number;
  lastIndex: number;
};

function timeMs(p: TripHaltPoint): number | null {
  if (!p.recorded_at) return null;
  const t = new Date(p.recorded_at).getTime();
  return Number.isFinite(t) ? t : null;
}

function distanceM(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function haltSeverity(durationMs: number): TripHaltSeverity {
  if (durationMs >= TRIP_HALT_LONG_MS) return 'long';
  if (durationMs >= TRIP_HALT_MEDIUM_MS) return 'medium';
  return 'short';
}

/** Halts in trail order. Input must be chronological (oldest first). */
export function detectTripHalts(
  points: TripHaltPoint[],
  opts: { radiusM?: number; minDurationMs?: number } = {},
): TripHalt[] {
  const radiusM = opts.radiusM ?? TRIP_HALT_RADIUS_M;
  const minDurationMs = opts.minDurationMs ?? TRIP_HALT_MIN_DURATION_MS;
  const halts: TripHalt[] = [];
  const n = points.length;
  let i = 0;
  while (i < n) {
    const startT = timeMs(points[i]);
    if (startT == null) {
      i++;
      continue;
    }
    let sumLat = points[i].latitude;
    let sumLng = points[i].longitude;
    let count = 1;
    let j = i + 1;
    while (j < n) {
      const p = points[j];
      if (timeMs(p) == null) break;
      if (distanceM(sumLat / count, sumLng / count, p.latitude, p.longitude) > radiusM) break;
      sumLat += p.latitude;
      sumLng += p.longitude;
      count++;
      j++;
    }
    const lastIndex = j - 1;
    const endT = lastIndex > i ? timeMs(points[lastIndex]) : null;
    if (endT != null && endT - startT >= minDurationMs) {
      const durationMs = endT - startT;
      halts.push({
        latitude: sumLat / count,
        longitude: sumLng / count,
        startAt: points[i].recorded_at as string,
        endAt: points[lastIndex].recorded_at as string,
        durationMs,
        severity: haltSeverity(durationMs),
        firstIndex: i,
        lastIndex,
      });
      i = lastIndex + 1;
    } else {
      i++;
    }
  }
  return halts;
}

/** Trail indices that belong to a halt (drawn as the halt pill, not as dots). */
export function haltIndexSet(halts: TripHalt[]): Set<number> {
  const out = new Set<number>();
  for (const h of halts) {
    for (let k = h.firstIndex; k <= h.lastIndex; k++) out.add(k);
  }
  return out;
}

/** "8m", "1h 20m", "2h". */
export function formatHaltDuration(ms: number): string {
  const totalMin = Math.max(0, Math.round(ms / 60_000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** "25 min", "1 hr 20 min" — long form for cards. */
export function formatHaltDurationLong(ms: number): string {
  const totalMin = Math.max(0, Math.round(ms / 60_000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`;
}

/** A moving stretch with no GPS for at least this long is drawn as "No signal". */
export const TRIP_TRACKING_GAP_MIN_MS = 15 * 60_000;

export type TripTrackingGap = {
  /** Gap is between trail[fromIndex] and trail[fromIndex + 1]. */
  fromIndex: number;
  durationMs: number;
};

/**
 * Only trails that normally ping this often can have a "no signal" gap. Sparse
 * trails (e.g. the older ~12-pings-per-trip history) are spaced out by design,
 * so a long step there is normal, not lost signal.
 */
export const TRIP_TRACKING_DENSE_MEDIAN_MS = 5 * 60_000;
/** A gap must also be this many times the trail's usual step. */
export const TRIP_TRACKING_GAP_MEDIAN_FACTOR = 4;

function medianStepMs(points: TripHaltPoint[]): number | null {
  const steps: number[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const ta = timeMs(points[i]);
    const tb = timeMs(points[i + 1]);
    if (ta != null && tb != null && tb > ta) steps.push(tb - ta);
  }
  if (steps.length === 0) return null;
  steps.sort((a, b) => a - b);
  return steps[Math.floor(steps.length / 2)];
}

/**
 * Consecutive pings ≥ `minGapMs` apart that are NOT a halt (they are more than
 * `radiusM` apart, so the driver moved while nothing was recorded) — only on
 * trails that usually ping every few minutes, and only when the step is well
 * above that trail's usual spacing.
 */
export function detectTrackingGaps(
  points: TripHaltPoint[],
  opts: { minGapMs?: number; radiusM?: number } = {},
): TripTrackingGap[] {
  const radiusM = opts.radiusM ?? TRIP_HALT_RADIUS_M;
  const median = medianStepMs(points);
  if (median == null || median > TRIP_TRACKING_DENSE_MEDIAN_MS) return [];
  const minGapMs = Math.max(
    opts.minGapMs ?? TRIP_TRACKING_GAP_MIN_MS,
    median * TRIP_TRACKING_GAP_MEDIAN_FACTOR,
  );
  const gaps: TripTrackingGap[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const ta = timeMs(a);
    const tb = timeMs(b);
    if (ta == null || tb == null) continue;
    if (tb - ta < minGapMs) continue;
    if (distanceM(a.latitude, a.longitude, b.latitude, b.longitude) <= radiusM) continue;
    gaps.push({ fromIndex: i, durationMs: tb - ta });
  }
  return gaps;
}

export function summarizeTripHalts(
  points: TripHaltPoint[],
  halts: TripHalt[],
): { stoppedMs: number; movingMs: number | null } {
  const stoppedMs = halts.reduce((s, h) => s + h.durationMs, 0);
  const firstT = points.length ? timeMs(points[0]) : null;
  const lastT = points.length ? timeMs(points[points.length - 1]) : null;
  const movingMs =
    firstT != null && lastT != null && lastT > firstT
      ? Math.max(0, lastT - firstT - stoppedMs)
      : null;
  return { stoppedMs, movingMs };
}
