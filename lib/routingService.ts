/**
 * Routing service for fetching optimal road routes.
 * Primary: Mapbox Directions (geometries=geojson)
 * Fallback: Google Directions (requires polyline decoding)
 */

export interface LatLon {
  latitude: number;
  longitude: number;
}

export interface RouteResult {
  coordinates: LatLon[];
  distance: number; // in meters
  duration: number; // in seconds
}

const ROUTE_FETCH_KEY_SEPARATOR = "|";
const ROUTE_FETCH_KEY_COORD_SEPARATOR = ",";

function formatKeyCoord(value: number, decimals: number): string {
  return Number.isFinite(value) ? value.toFixed(decimals) : (0).toFixed(decimals);
}

/**
 * Stable key for memoized route fetches.
 * @param coordDecimals — use 6 for fixed stop-to-stop legs; use ~3 (~100m)
 *   when `from`/`to` includes live GPS so every meter of jitter does not refetch.
 */
export function buildRouteFetchKey(
  tripId: string,
  from: LatLon,
  to: LatLon,
  coordDecimals = 6,
): string {
  const normalizedTripId = (tripId ?? "").trim();
  const decimals = Number.isFinite(coordDecimals)
    ? Math.min(6, Math.max(2, Math.floor(coordDecimals)))
    : 6;
  return [
    normalizedTripId,
    `${formatKeyCoord(from.latitude, decimals)}${ROUTE_FETCH_KEY_COORD_SEPARATOR}${formatKeyCoord(from.longitude, decimals)}`,
    `${formatKeyCoord(to.latitude, decimals)}${ROUTE_FETCH_KEY_COORD_SEPARATOR}${formatKeyCoord(to.longitude, decimals)}`,
  ].join(ROUTE_FETCH_KEY_SEPARATOR);
}

/**
 * Parse a route fetch key back into coords.
 */
export function parseRouteFetchKey(
  key: string,
): { tripId: string; from: LatLon; to: LatLon } | null {
  const raw = (key ?? "").trim();
  if (!raw) return null;

  const [tripId, fromRaw, toRaw] = raw.split(ROUTE_FETCH_KEY_SEPARATOR);
  if (!tripId || !fromRaw || !toRaw) return null;

  const [fromLatRaw, fromLonRaw] = fromRaw.split(ROUTE_FETCH_KEY_COORD_SEPARATOR);
  const [toLatRaw, toLonRaw] = toRaw.split(ROUTE_FETCH_KEY_COORD_SEPARATOR);
  const fromLat = Number(fromLatRaw);
  const fromLon = Number(fromLonRaw);
  const toLat = Number(toLatRaw);
  const toLon = Number(toLonRaw);

  if (![fromLat, fromLon, toLat, toLon].every((n) => Number.isFinite(n))) {
    return null;
  }

  return {
    tripId,
    from: { latitude: fromLat, longitude: fromLon },
    to: { latitude: toLat, longitude: toLon },
  };
}

const MAPBOX_DIRECTIONS_BASE = 'https://api.mapbox.com/directions/v5/mapbox/driving';
const OSRM_DIRECTIONS_BASE = 'https://router.project-osrm.org/route/v1/driving';
const NETLIFY_ROUTE_PROXY_PATH = '/.netlify/functions/route-proxy';

/**
 * Netlify route proxy is only available on Netlify deploys (or when explicitly configured).
 * Expo web on localhost would otherwise GET /.netlify/functions/... → 404 noise every route fetch.
 */
function buildWebRouteProxyUrl(from: LatLon, to: LatLon): string | null {
  // RN/Hermes polyfills a global `window` but not `window.location`, so guard both.
  if (typeof window === 'undefined' || !window.location) return null;

  const explicit =
    typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_ROUTE_PROXY_URL?.trim();
  const params = new URLSearchParams({
    fromLat: String(from.latitude),
    fromLon: String(from.longitude),
    toLat: String(to.latitude),
    toLon: String(to.longitude),
  }).toString();

  if (explicit) {
    const base = explicit.split('?')[0]?.replace(/\/$/, '') ?? explicit;
    return base.includes('route-proxy') ? `${base}?${params}` : `${base}${NETLIFY_ROUTE_PROXY_PATH}?${params}`;
  }

  // `window.location` can be a partially-polyfilled object on native (RN/Hermes),
  // so it may pass the truthy guard above yet still lack `hostname`/`origin`.
  // Read both defensively — a missing hostname just means "not a Netlify deploy".
  const loc = window.location;
  const host = typeof loc?.hostname === 'string' ? loc.hostname : '';
  if (host.endsWith('.netlify.app') && typeof loc?.origin === 'string') {
    return `${loc.origin}${NETLIFY_ROUTE_PROXY_PATH}?${params}`;
  }

  return null;
}
const OSRM_NETWORK_ERROR_COOLDOWN_MS = 60_000;
const OSRM_TEMPORARY_BACKOFF_MS = 5 * 60_000;
const OSRM_FETCH_TIMEOUT_MS = 4_000;
const ROUTE_CACHE_COORD_DECIMALS = 4;
const optimalRouteCache = new Map<string, RouteResult>();
let lastOSRMNetworkErrorLogAt = 0;
let osrmBackoffUntil = 0;

function isNetworkRequestTransientError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  const message = error.message.toLowerCase();
  return (
    message.includes('network request failed') ||
    message.includes('network request timed out') ||
    message.includes('the request timed out') ||
    message.includes('aborted')
  );
}

function logOSRMError(error: unknown) {
  if (isNetworkRequestTransientError(error)) {
    const now = Date.now();
    osrmBackoffUntil = now + OSRM_TEMPORARY_BACKOFF_MS;
    if (now - lastOSRMNetworkErrorLogAt >= OSRM_NETWORK_ERROR_COOLDOWN_MS) {
      lastOSRMNetworkErrorLogAt = now;
      console.warn(
        '[routingService] osrm network unavailable; using fallback providers (Mapbox/Google).',
      );
    }
    return;
  }

  console.error('[routingService] osrm error:', error);
}

/**
 * Fetch a route from OSRM (Open Source Routing Machine).
 * Truly free, no token required (uses OSM data).
 */
async function getOSRMRoute(from: LatLon, to: LatLon): Promise<RouteResult | null> {
  if (!isRoutableLatLon(from) || !isRoutableLatLon(to)) return null;
  if (Date.now() < osrmBackoffUntil) return null;

  const coords = `${from.longitude},${from.latitude};${to.longitude},${to.latitude}`;
  const url = `${OSRM_DIRECTIONS_BASE}/${coords}?overview=full&geometries=geojson`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), OSRM_FETCH_TIMEOUT_MS);
    let res: Response;
    try {
      const isWebRuntime = typeof window !== 'undefined';
      res = await fetch(url, {
        // Browsers block custom User-Agent header; keep it only for native/server runtimes.
        headers: isWebRuntime
          ? undefined
          : {
              'User-Agent': 'Pulse-Logistics/1.0',
            },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!res.ok) return null;
    const data = await res.json();

    if (!data.routes || data.routes.length === 0) return null;

    const route = data.routes[0];
    const coordinates = route.geometry.coordinates.map((c: [number, number]) => ({
      latitude: c[1],
      longitude: c[0],
    }));

    return {
      coordinates,
      distance: route.distance,
      duration: route.duration,
    };
  } catch (error) {
    logOSRMError(error);
    return null;
  }
}

/**
 * Fetch a route from Mapbox Directions API using GeoJSON format.
 */
async function getMapboxRoute(from: LatLon, to: LatLon): Promise<RouteResult | null> {
  if (!isRoutableLatLon(from) || !isRoutableLatLon(to)) return null;
  const token = typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_MAPBOX_TOKEN?.trim();
  if (!token) return null;

  const coords = `${from.longitude},${from.latitude};${to.longitude},${to.latitude}`;
  const params = new URLSearchParams({
    access_token: token,
    geometries: 'geojson',
    overview: 'full',
    steps: 'false',
  });

  const url = `${MAPBOX_DIRECTIONS_BASE}/${coords}?${params.toString()}`;

  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();

    if (!data.routes || data.routes.length === 0) return null;

    const route = data.routes[0];
    const coordinates = route.geometry.coordinates.map((c: [number, number]) => ({
      latitude: c[1],
      longitude: c[0],
    }));

    return {
      coordinates,
      distance: route.distance,
      duration: route.duration,
    };
  } catch (error) {
    console.error('[routingService] mapbox error:', error);
    return null;
  }
}

/**
 * Fetch a route from Google Directions API.
 * Note: returns polyline string, requires decoding if used. 
 * For now, we prefer Mapbox as it gives GeoJSON directly.
 */
async function getGoogleRoute(from: LatLon, to: LatLon): Promise<RouteResult | null> {
  if (!isRoutableLatLon(from) || !isRoutableLatLon(to)) return null;
  const apiKey = typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY?.trim();
  if (!apiKey) return null;

  const origin = `${from.latitude},${from.longitude}`;
  const destination = `${to.latitude},${to.longitude}`;
  const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin}&destination=${destination}&key=${apiKey}`;

  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();

    if (data.status !== 'OK' || !data.routes || data.routes.length === 0) return null;

    const route = data.routes[0];
    // Google returns polyline. For simplicity in this implementation without adding deps,
    // we use a simple decoder or prefer Mapbox.
    // If Mapbox fails and Google is needed, we'd need a polyline decoder here.
    
    // Simple polyline decoder implementation
    const decodePolyline = (encoded: string) => {
      let index = 0, len = encoded.length;
      let lat = 0, lng = 0;
      const coords = [];

      while (index < len) {
        let b, shift = 0, result = 0;
        do {
          b = encoded.charCodeAt(index++) - 63;
          result |= (b & 0x1f) << shift;
          shift += 5;
        } while (b >= 0x20);
        let dlat = ((result & 1) ? ~(result >> 1) : (result >> 1));
        lat += dlat;

        shift = 0;
        result = 0;
        do {
          b = encoded.charCodeAt(index++) - 63;
          result |= (b & 0x1f) << shift;
          shift += 5;
        } while (b >= 0x20);
        let dlng = ((result & 1) ? ~(result >> 1) : (result >> 1));
        lng += dlng;

        coords.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
      }
      return coords;
    };

    return {
      coordinates: decodePolyline(route.overview_polyline.points),
      distance: route.legs[0].distance.value,
      duration: route.legs[0].duration.value,
    };
  } catch (error) {
    console.error('[routingService] google error:', error);
    return null;
  }
}

async function fetchProxyRoute(from: LatLon, to: LatLon): Promise<RouteResult | null> {
  if (!isRoutableLatLon(from) || !isRoutableLatLon(to)) return null;
  const proxyUrl = buildWebRouteProxyUrl(from, to);
  if (!proxyUrl) return null;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), OSRM_FETCH_TIMEOUT_MS);
    try {
      const proxyRes = await fetch(proxyUrl, { signal: controller.signal });
      if (!proxyRes.ok) return null;
      const payload = (await proxyRes.json()) as {
        ok?: boolean;
        route?: RouteResult;
      };
      if (payload?.ok === true && payload.route) return payload.route;
    } finally {
      clearTimeout(timeoutId);
    }
  } catch {
    /* fall through */
  }
  return null;
}

function firstResolvedRoute(
  tasks: Array<Promise<RouteResult | null>>,
): Promise<RouteResult | null> {
  if (tasks.length === 0) return Promise.resolve(null);
  return new Promise((resolve) => {
    let pending = tasks.length;
    let settled = false;
    for (const task of tasks) {
      void task.then((route) => {
        if (route && !settled) {
          settled = true;
          resolve(route);
          return;
        }
        pending -= 1;
        if (!settled && pending === 0) resolve(null);
      });
    }
  });
}

/**
 * Main entry point: Get optimal route.
 * Races the Netlify proxy with OSRM, then Mapbox / Google. Results are cached.
 */
/** Reject Null Island / unset GPS so OSRM and Mapbox are not called with `;0,0`. */
export function isRoutableLatLon(point: LatLon | null | undefined): boolean {
  if (!point) return false;
  const { latitude, longitude } = point;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return false;
  if (Math.abs(latitude) < 0.0001 && Math.abs(longitude) < 0.0001) return false;
  return true;
}

export async function getOptimalRoute(from: LatLon, to: LatLon): Promise<RouteResult | null> {
  if (!isRoutableLatLon(from) || !isRoutableLatLon(to)) return null;

  const cacheKey = [
    formatKeyCoord(from.latitude, ROUTE_CACHE_COORD_DECIMALS),
    formatKeyCoord(from.longitude, ROUTE_CACHE_COORD_DECIMALS),
    formatKeyCoord(to.latitude, ROUTE_CACHE_COORD_DECIMALS),
    formatKeyCoord(to.longitude, ROUTE_CACHE_COORD_DECIMALS),
  ].join(ROUTE_FETCH_KEY_SEPARATOR);
  const cached = optimalRouteCache.get(cacheKey);
  if (cached) return cached;

  const raced = await firstResolvedRoute([
    fetchProxyRoute(from, to),
    getOSRMRoute(from, to),
  ]);
  const route = raced ?? (await getMapboxRoute(from, to)) ?? (await getGoogleRoute(from, to));
  if (route) optimalRouteCache.set(cacheKey, route);
  return route;
}

/** Straight-line km — offline fallback when every routing provider fails. */
function straightLineKm(from: LatLon, to: LatLon): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(to.latitude - from.latitude);
  const dLon = toRad(to.longitude - from.longitude);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(from.latitude)) *
      Math.cos(toRad(to.latitude)) *
      Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Typical Indian road winding vs straight line. Only applied to the offline
 * fallback so an estimate is not obviously short.
 */
const ROAD_WINDING_FACTOR = 1.25;

export type LaneDistanceSource = 'road' | 'estimate';

export type LaneDistanceResult = {
  km: number;
  /** 'road' = real routed distance; 'estimate' = straight-line × winding factor. */
  source: LaneDistanceSource;
};

/** Memoized per endpoint pair — repeated lane edits must not refetch. */
const laneDistanceCache = new Map<string, LaneDistanceResult>();

/**
 * Road distance in km between two lane endpoints, rounded to 1 decimal.
 * Free by default: OSRM first (no key, no quota), then the existing Mapbox /
 * Google fallbacks, then an offline straight-line estimate. Results are cached
 * per coordinate pair, so re-opening a lane costs nothing.
 */
export async function getLaneDistanceKm(
  from: LatLon,
  to: LatLon,
): Promise<LaneDistanceResult> {
  // 4 decimals (~11m) — lane endpoints are cities/areas, not live GPS.
  const key = buildRouteFetchKey('lane', from, to, 4);
  const cached = laneDistanceCache.get(key);
  if (cached) return cached;

  let result: LaneDistanceResult;
  try {
    const route = await getOptimalRoute(from, to);
    result =
      route && Number.isFinite(route.distance) && route.distance > 0
        ? { km: Math.round(route.distance / 100) / 10, source: 'road' }
        : {
            km: Math.round(straightLineKm(from, to) * ROAD_WINDING_FACTOR * 10) / 10,
            source: 'estimate',
          };
  } catch {
    result = {
      km: Math.round(straightLineKm(from, to) * ROAD_WINDING_FACTOR * 10) / 10,
      source: 'estimate',
    };
  }

  laneDistanceCache.set(key, result);
  return result;
}
