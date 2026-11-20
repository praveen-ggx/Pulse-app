import {
  getOptimalRoute,
  parseRouteFetchKey,
  type LatLon,
  type RouteResult,
} from '@/lib/routingService';

export function isUsableRouteResult(
  res: RouteResult | null | undefined,
): res is RouteResult {
  if (!res || !Array.isArray(res.coordinates) || res.coordinates.length < 2) {
    return false;
  }
  const first = res.coordinates[0];
  const last = res.coordinates[res.coordinates.length - 1];
  const distinctM = distanceMeters(
    first.latitude,
    first.longitude,
    last.latitude,
    last.longitude,
  );
  return distinctM > 25;
}

function distanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6_371_000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/** Midpoint along the routed path (for distance badges). */
export function routeMidpoint(coords: LatLon[]): LatLon | null {
  if (!coords.length) return null;
  if (coords.length === 1) return coords[0];
  const mid = Math.floor(coords.length / 2);
  return coords[mid] ?? null;
}

/** Driver is en route to pickup — dashed approach until package is collected. */
export function shouldShowDriverApproachRoute(
  step: string | null | undefined,
): boolean {
  return step === 'accepted' || step === 'pickup';
}

/** After package collected — navigate driver → drop on roads. */
export function shouldShowDriverToDropRoute(
  step: string | null | undefined,
): boolean {
  return step === 'transit' || step === 'reached' || step === 'completed';
}

export async function fetchUsableRouteForKey(
  routeFetchKey: string,
): Promise<RouteResult | null> {
  const parsed = parseRouteFetchKey(routeFetchKey);
  if (!parsed) return null;
  const res = await getOptimalRoute(parsed.from, parsed.to);
  return isUsableRouteResult(res) ? res : null;
}

/** Stops closer than this are treated as the same point (no leg to route). */
const MULTI_STOP_MIN_LEG_M = 40;

/**
 * Road geometry through every stop in order (Pickup 1 → … → Drop N), one leg per
 * pair via `getOptimalRoute` (cached). Returns null when any leg cannot be routed,
 * so callers can fall back to the straight "approx" line instead of a half-road path.
 */
export async function fetchUsableMultiStopRoute(
  stops: LatLon[],
): Promise<RouteResult | null> {
  const legs: Array<[LatLon, LatLon]> = [];
  for (let i = 1; i < stops.length; i += 1) {
    const from = stops[i - 1];
    const to = stops[i];
    if (
      distanceMeters(from.latitude, from.longitude, to.latitude, to.longitude) >
      MULTI_STOP_MIN_LEG_M
    ) {
      legs.push([from, to]);
    }
  }
  if (legs.length === 0) return null;

  const routed = await Promise.all(
    legs.map(([from, to]) => getOptimalRoute(from, to).catch(() => null)),
  );
  if (routed.some((leg) => !isUsableRouteResult(leg))) return null;

  const coordinates: LatLon[] = [];
  let distance = 0;
  let duration = 0;
  for (const leg of routed as RouteResult[]) {
    // Drop each leg's first point after the first leg so joins don't double up.
    coordinates.push(...(coordinates.length ? leg.coordinates.slice(1) : leg.coordinates));
    distance += leg.distance;
    duration += leg.duration;
  }
  return { coordinates, distance, duration };
}
