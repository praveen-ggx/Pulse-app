import { TRACKING_LOCATION_GEOCODE_MAX } from '@/lib/trackingLocation.constants';
import { cleanOsmAreaName } from '@/lib/maps/placeSearch.util';

/**
 * Reverse geocode coordinates → human-readable place labels (tracking UI).
 * Coordinates stay internal; this service is the only path for map callouts/cards.
 *
 * Provider order: Mapbox → Nominatim → (optional native via reverseGeocodePlace.util).
 */
import { Platform } from 'react-native';

export type MapLocationLabelMode = 'full' | 'city';

export type ResolveMapLocationLabelOptions = {
  mode?: MapLocationLabelMode;
  signal?: AbortSignal;
  /** Skip network (cache-only). */
  cacheOnly?: boolean;
};

const MAPBOX_REVERSE_BASE = 'https://api.mapbox.com/geocoding/v5/mapbox.places';
const NOMINATIM_REVERSE_BASE = 'https://nominatim.openstreetmap.org/reverse';
const NOMINATIM_USER_AGENT = 'Pulse-Logistics/1.0 (India reverse geocode)';

const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX = 400;
const NOMINATIM_COOLDOWN_MS = 1100;
const MAPBOX_COOLDOWN_MS = 200;

const memoryCache = new Map<string, { ts: number; label: string }>();
const inflight = new Map<string, Promise<string | null>>();
let lastMapboxAt = 0;
let lastNominatimAt = 0;

function isValidCoord(latitude: number, longitude: number): boolean {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return false;
  if (Math.abs(latitude) < 0.0001 && Math.abs(longitude) < 0.0001) return false;
  return true;
}

function cacheKey(latitude: number, longitude: number, mode: MapLocationLabelMode): string {
  return `${latitude.toFixed(4)},${longitude.toFixed(4)}:${mode}`;
}

function cacheGet(key: string): string | null {
  const hit = memoryCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.ts > CACHE_TTL_MS) {
    memoryCache.delete(key);
    return null;
  }
  return hit.label;
}

function cacheSet(key: string, label: string) {
  memoryCache.set(key, { ts: Date.now(), label });
  if (memoryCache.size > CACHE_MAX) {
    const oldest = [...memoryCache.entries()].sort((a, b) => a[1].ts - b[1].ts);
    for (const [k] of oldest.slice(0, Math.ceil(CACHE_MAX / 8))) {
      memoryCache.delete(k);
    }
  }
}

function canCallMapbox(): boolean {
  const now = Date.now();
  if (now - lastMapboxAt < MAPBOX_COOLDOWN_MS) return false;
  lastMapboxAt = now;
  return true;
}

function canCallNominatim(): boolean {
  const now = Date.now();
  if (now - lastNominatimAt < NOMINATIM_COOLDOWN_MS) return false;
  lastNominatimAt = now;
  return true;
}

function formatMapboxPlaceName(placeName: string, mode: MapLocationLabelMode): string | null {
  const trimmed = placeName.trim();
  if (!trimmed) return null;
  if (mode === 'full') return trimmed;
  const parts = trimmed.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return parts.slice(-2).join(', ');
  }
  return trimmed;
}

function formatNominatimAddress(
  address: Record<string, string | undefined> | undefined,
  mode: MapLocationLabelMode,
): string | null {
  if (!address) return null;
  // OSM ward numbers ("Ward 30", "Zone 3 Madhavaram") are cleaned/skipped.
  const road =
    address.road?.trim() ||
    address.pedestrian?.trim() ||
    cleanOsmAreaName(address.neighbourhood) ||
    '';
  const city =
    address.city?.trim() ||
    cleanOsmAreaName(address.town) ||
    address.village?.trim() ||
    cleanOsmAreaName(address.suburb) ||
    '';
  const state = address.state?.trim() || '';
  if (mode === 'city') {
    const parts = [city, state].filter(Boolean);
    return parts.length ? parts.join(', ') : null;
  }
  const parts = [road, city, state].filter(Boolean);
  return parts.length ? parts.join(', ') : null;
}

async function reverseMapbox(
  latitude: number,
  longitude: number,
  mode: MapLocationLabelMode,
  signal?: AbortSignal,
): Promise<string | null> {
  const token =
    typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_MAPBOX_TOKEN?.trim();
  if (!token || !canCallMapbox()) return null;

  const params = new URLSearchParams({
    access_token: token,
    country: 'IN',
    limit: '1',
    types: 'address,place,locality,neighborhood,region',
  });
  const url = `${MAPBOX_REVERSE_BASE}/${longitude},${latitude}.json?${params.toString()}`;
  const res = await fetch(url, { signal });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    features?: Array<{ place_name?: string }>;
  };
  const placeName = data.features?.[0]?.place_name;
  if (!placeName) return null;
  return formatMapboxPlaceName(placeName, mode);
}

async function reverseNominatim(
  latitude: number,
  longitude: number,
  mode: MapLocationLabelMode,
  signal?: AbortSignal,
): Promise<string | null> {
  if (!canCallNominatim()) return null;

  const params = new URLSearchParams({
    lat: String(latitude),
    lon: String(longitude),
    format: 'json',
    addressdetails: '1',
    zoom: mode === 'city' ? '10' : '16',
  });
  const url = `${NOMINATIM_REVERSE_BASE}?${params.toString()}`;
  const res = await fetch(url, {
    signal,
    headers: {
      Accept: 'application/json',
      'User-Agent': NOMINATIM_USER_AGENT,
    },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    display_name?: string;
    address?: Record<string, string | undefined>;
  };
  const fromAddress = formatNominatimAddress(data.address, mode);
  if (fromAddress) return fromAddress;
  const display = data.display_name?.trim();
  if (!display) return null;
  if (mode === 'city') {
    const parts = display.split(',').map((p) => p.trim()).filter(Boolean);
    return parts.length >= 2 ? parts.slice(-2).join(', ') : display;
  }
  return display;
}

async function reverseNativeExpo(
  latitude: number,
  longitude: number,
  mode: MapLocationLabelMode,
): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  try {
    const Location = await import('expo-location');
    const results = await Location.reverseGeocodeAsync({ latitude, longitude });
    const addr = results[0];
    if (!addr) return null;
    if (mode === 'city') {
      const city =
        addr.city?.trim() ||
        addr.subregion?.trim() ||
        (addr as { district?: string | null }).district?.trim() ||
        '';
      const state = addr.region?.trim() || '';
      const parts = [city, state].filter(Boolean);
      return parts.length ? parts.join(', ') : null;
    }
    const parts = [
      addr.street?.trim() || addr.name?.trim() || null,
      addr.city?.trim() || addr.subregion?.trim() || null,
      addr.region?.trim() || null,
    ].filter(Boolean) as string[];
    return parts.length ? parts.join(', ') : null;
  } catch {
    return null;
  }
}

/**
 * Resolve a single coordinate pair to a display label (never returns raw lat/lon).
 */
export async function resolveMapLocationLabel(
  latitude: number,
  longitude: number,
  opts?: ResolveMapLocationLabelOptions,
): Promise<string | null> {
  if (!isValidCoord(latitude, longitude)) return null;

  const mode = opts?.mode ?? 'full';
  const key = cacheKey(latitude, longitude, mode);
  const cached = cacheGet(key);
  if (cached) return cached;

  if (opts?.cacheOnly) return null;

  const existing = inflight.get(key);
  if (existing) return existing;

  const task = (async (): Promise<string | null> => {
    try {
      let label =
        (await reverseMapbox(latitude, longitude, mode, opts?.signal)) ??
        (await reverseNominatim(latitude, longitude, mode, opts?.signal)) ??
        (await reverseNativeExpo(latitude, longitude, mode));

      if (label) {
        cacheSet(key, label);
        return label;
      }
      return null;
    } catch (e: unknown) {
      if ((e as { name?: string })?.name === 'AbortError') return null;
      return null;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, task);
  return task;
}

export type CoordinateWithRecordedAt = {
  latitude: number;
  longitude: number;
  recorded_at?: string;
};

export type CoordinateWithLocationName = CoordinateWithRecordedAt & {
  locationName: string | null;
};

/**
 * Resolve labels for many pings (newest batch first). Throttles Nominatim/Mapbox usage.
 */
export async function resolveMapLocationLabelsBatch(
  points: CoordinateWithRecordedAt[],
  opts?: {
    maxResolve?: number;
    mode?: MapLocationLabelMode;
    delayMs?: number;
    onProgress?: (resolved: CoordinateWithLocationName[]) => void;
  },
): Promise<CoordinateWithLocationName[]> {
  const maxResolve = opts?.maxResolve ?? TRACKING_LOCATION_GEOCODE_MAX;
  const mode = opts?.mode ?? 'full';
  const delayMs = opts?.delayMs ?? 280;

  const base: CoordinateWithLocationName[] = points.map((p) => ({
    ...p,
    locationName: null,
  }));

  if (points.length === 0) return base;

  const toResolve = points.slice(-maxResolve);
  const startIndex = points.length - toResolve.length;
  const next = [...base];

  for (let i = 0; i < toResolve.length; i++) {
    const pt = toResolve[i]!;
    const label = await resolveMapLocationLabel(pt.latitude, pt.longitude, { mode });
    const idx = startIndex + i;
    if (next[idx]) {
      next[idx] = { ...next[idx]!, locationName: label };
    }
    opts?.onProgress?.([...next]);
    if (i < toResolve.length - 1 && delayMs > 0) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  return next;
}

/** UI placeholder while geocoding — never show coordinates. */
export const MAP_LOCATION_LABEL_LOADING = 'Resolving location…';
export const MAP_LOCATION_LABEL_UNKNOWN = 'Current location';
