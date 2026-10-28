/**
 * Place search for India with lat/lon.
 * Primary: Mapbox (100k free/mo, fast) → Google Places (if key) → Nominatim (1 req/s).
 * Fallback: cached places (AsyncStorage, selected only, max 500) + popular list.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  MAPBOX_FORWARD_SEARCH_TYPES,
  NOMINATIM_SEARCH_URL,
  NOMINATIM_USER_AGENT,
  buildNominatimReverseUrl,
  isUsablePlaceCoordinate,
  shouldCachePlaceSearchResults,
} from '@/lib/maps/placeSearch.util';

export {
  MAPBOX_FORWARD_SEARCH_TYPES,
  NOMINATIM_REVERSE_URL,
  buildNominatimReverseUrl,
  isUsablePlaceCoordinate,
} from '@/lib/maps/placeSearch.util';

export interface PlaceResult {
  placeId: string;
  displayName: string;
  lat: number;
  lon: number;
  pincode?: string | null;
  city?: string | null;
  state?: string | null;
  /**
   * The place's own name (neighborhood / locality / suburb), when the provider
   * reports it separately from the parent city. Kept so labels can show
   * "Pallavaram, Tamil Nadu" instead of collapsing to the parent district.
   */
  locality?: string | null;
  /** Revenue/administrative district. Never used as `city` — in India these differ. */
  district?: string | null;
}

export type ReverseGeocodeIndiaResult = {
  city: string | null;
  state: string | null;
  pincode: string | null;
  locality: string | null;
  street: string | null;
};

const EMPTY_REVERSE_GEOCODE: ReverseGeocodeIndiaResult = {
  city: null,
  state: null,
  pincode: null,
  locality: null,
  street: null,
};

function normalizeIndianPincode(value?: string | null): string | null {
  const digits = value?.replace(/\D/g, '').slice(0, 6) ?? '';
  if (digits.length !== 6 || digits[0] === '0') return null;
  return digits;
}

/** Pull a 6-digit Indian PIN from free-form place labels when providers omit structured data. */
export function extractPincodeFromPlaceText(text?: string | null): string | null {
  if (!text?.trim()) return null;
  const match = text.match(/\b([1-9]\d{5})\b/);
  return match ? normalizeIndianPincode(match[1]) : null;
}

type MapboxContextItem = { id?: string; text?: string };

function readMapboxContextText(
  context: MapboxContextItem[] | undefined,
  prefix: string,
): string | null {
  const hit = context?.find((item) => item.id?.startsWith(prefix));
  return hit?.text?.trim() || null;
}

type MapboxFeature = {
  id?: string;
  place_name?: string;
  text?: string;
  center?: [number, number];
  place_type?: string[];
  context?: MapboxContextItem[];
  properties?: { address?: string };
};

function placeResultFromMapboxFeature(feature: MapboxFeature): PlaceResult | null {
  const displayName = feature.place_name?.trim() || feature.text?.trim() || '';
  const lng = feature.center?.[0];
  const lat = feature.center?.[1];
  if (!displayName || lat == null || lng == null) return null;

  const context = feature.context;
  const pincode =
    normalizeIndianPincode(readMapboxContextText(context, 'postcode')) ||
    extractPincodeFromPlaceText(displayName);
  // `district` is the revenue district (e.g. Chengalpattu) — never the city.
  const city = readMapboxContextText(context, 'place');
  const district = readMapboxContextText(context, 'district');
  const state = readMapboxContextText(context, 'region');
  // Neighborhood/locality hits carry their own name in `text`; keep it so the
  // label doesn't fall back to the parent city or district.
  const featureName = feature.text?.trim() || null;
  const isSubCity = feature.place_type?.some(
    (t) => t === 'neighborhood' || t === 'locality' || t === 'address' || t === 'poi',
  );
  const locality =
    readMapboxContextText(context, 'neighborhood') ||
    readMapboxContextText(context, 'locality') ||
    (isSubCity ? featureName : null);

  return {
    placeId: feature.id ?? displayName,
    displayName,
    lat,
    lon: lng,
    pincode,
    city,
    state,
    locality,
    district,
  };
}

const PLACES_CACHE_KEY = 'pulse_places_cache';
const PLACES_CACHE_MAX = 500;

type SearchOpts = {
  /** Optional abort signal for canceling network requests. */
  signal?: AbortSignal;
};

function normalizeKey(displayName: string): string {
  return displayName.trim().toLowerCase().replace(/\s+/g, ' ');
}

const NOMINATIM_BASE = NOMINATIM_SEARCH_URL;
const USER_AGENT = NOMINATIM_USER_AGENT;

const MAPBOX_GEOCODING_BASE = 'https://api.mapbox.com/geocoding/v5/mapbox.places';

/**
 * Guardrails to reduce unwanted usage:
 * - Only call network APIs for queries >= 3 chars (shorter uses cache/popular)
 * - Per-provider cooldowns (Nominatim is 1 req/s)
 * - In-memory TTL cache to dedupe repeated typing/rerenders
 */
const MIN_API_QUERY_LENGTH = 3;
const MEMORY_CACHE_TTL_MS = 5 * 60 * 1000;
const MEMORY_CACHE_MAX = 200;

// Hard cap (per app session/device) to protect against runaway usage.
// When exceeded, we fall back to cached/popular results until the window refills.
const MAPBOX_HARD_CAP = { capacity: 20, refillMs: 60 * 1000 } as const;
const MAPBOX_CIRCUIT_BREAKER_MS = 5 * 60 * 1000;

const PLACES_DEBUG =
  typeof process !== 'undefined' &&
  String(process.env?.EXPO_PUBLIC_PLACES_DEBUG ?? '').trim() === '1';

const PROVIDER_COOLDOWN_MS = {
  mapbox: 250,
  google: 300,
  nominatim: 1100,
} as const;

type Provider = keyof typeof PROVIDER_COOLDOWN_MS;

const memoryCache = new Map<string, { ts: number; results: PlaceResult[] }>();
const inflight = new Map<string, Promise<PlaceResult[]>>();
const lastProviderCallAt: Record<Provider, number> = {
  mapbox: 0,
  google: 0,
  nominatim: 0,
};

type TokenBucket = { tokens: number; lastRefillAt: number };
const mapboxBucket: TokenBucket = { tokens: MAPBOX_HARD_CAP.capacity, lastRefillAt: Date.now() };
let mapboxBlockedUntil = 0;

function tryConsumeMapboxToken(): boolean {
  const now = Date.now();
  const elapsed = now - mapboxBucket.lastRefillAt;
  if (elapsed >= MAPBOX_HARD_CAP.refillMs) {
    const periods = Math.floor(elapsed / MAPBOX_HARD_CAP.refillMs);
    if (periods > 0) {
      mapboxBucket.tokens = MAPBOX_HARD_CAP.capacity;
      mapboxBucket.lastRefillAt = now;
    }
  }
  if (mapboxBucket.tokens <= 0) return false;
  mapboxBucket.tokens -= 1;
  return true;
}

function isMapboxBlocked(): boolean {
  return Date.now() < mapboxBlockedUntil;
}

function blockMapboxTemporarily() {
  mapboxBlockedUntil = Date.now() + MAPBOX_CIRCUIT_BREAKER_MS;
}

/** Test-only: clear per-provider cooldowns so a retry can hit the network. */
export function resetPlacesProviderCooldownsForTests() {
  lastProviderCallAt.mapbox = 0;
  lastProviderCallAt.google = 0;
  lastProviderCallAt.nominatim = 0;
}

/** Test-only: clear TTL cache, inflight dedupe, and provider budgets. */
export function resetPlacesSearchMemoryForTests() {
  memoryCache.clear();
  inflight.clear();
  resetPlacesProviderCooldownsForTests();
  mapboxBucket.tokens = MAPBOX_HARD_CAP.capacity;
  mapboxBucket.lastRefillAt = Date.now();
  mapboxBlockedUntil = 0;
}

function cacheGet(key: string): PlaceResult[] | null {
  const hit = memoryCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.ts > MEMORY_CACHE_TTL_MS) {
    memoryCache.delete(key);
    return null;
  }
  return hit.results;
}

function cacheSet(key: string, results: PlaceResult[]) {
  // Empty / error-shaped lists must not pin "no such place" for the TTL.
  if (!shouldCachePlaceSearchResults(results)) return;
  memoryCache.set(key, { ts: Date.now(), results });
  if (memoryCache.size > MEMORY_CACHE_MAX) {
    // drop oldest entries to cap memory
    const entries = [...memoryCache.entries()].sort((a, b) => a[1].ts - b[1].ts);
    const toDrop = entries.slice(0, Math.ceil(MEMORY_CACHE_MAX / 5));
    for (const [k] of toDrop) memoryCache.delete(k);
  }
}

function canCallProvider(provider: Provider): boolean {
  const now = Date.now();
  if (now - lastProviderCallAt[provider] < PROVIDER_COOLDOWN_MS[provider]) return false;
  lastProviderCallAt[provider] = now;
  return true;
}

/** Mapbox Geocoding: fast, 100k free/month. India-only. center is [lon, lat]. */
async function searchMapbox(query: string, opts?: SearchOpts): Promise<PlaceResult[]> {
  const token = typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_MAPBOX_TOKEN?.trim();
  if (!token) return [];

  const trimmed = query.trim();
  if (!trimmed) return [];
  if (isMapboxBlocked()) return [];
  // Budget first, then the per-keystroke cooldown: canCallProvider() stamps the
  // clock on success, so checking it before a failing token consume burns the
  // slot and makes the next (wanted) query return [] with no provider hit.
  if (!tryConsumeMapboxToken()) return [];
  if (!canCallProvider('mapbox')) return [];

  const params = new URLSearchParams({
    access_token: token,
    country: 'IN',
    limit: '8',
    types: MAPBOX_FORWARD_SEARCH_TYPES,
  });
  const url = `${MAPBOX_GEOCODING_BASE}/${encodeURIComponent(trimmed)}.json?${params.toString()}`;

  if (__DEV__ && PLACES_DEBUG) {
    console.debug('[places] mapbox', {
      q: trimmed,
      tokens_left_in_window: mapboxBucket.tokens,
      blocked_until_ms: mapboxBlockedUntil,
    });
  }

  const res = await fetch(url, { signal: opts?.signal });
  if (!res.ok) {
    // If Mapbox is throttling or temporarily failing, stop trying for a bit
    // so we don't keep hitting it on every keystroke.
    if (res.status === 429 || (res.status >= 500 && res.status <= 599)) {
      blockMapboxTemporarily();
    }
    return [];
  }
  const data = (await res.json()) as { features?: MapboxFeature[] };
  const features = data.features ?? [];
  return features
    .map((feature) => placeResultFromMapboxFeature(feature))
    .filter((place): place is PlaceResult => place != null);
}

/** Nominatim: search places in India; returns display name and coordinates. Fallback (1 req/s). */
async function searchNominatim(query: string, opts?: SearchOpts): Promise<PlaceResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  if (!canCallProvider('nominatim')) return [];

  const params = new URLSearchParams({
    q: trimmed,
    countrycodes: 'in',
    format: 'json',
    limit: '10',
    addressdetails: '1',
  });
  const url = `${NOMINATIM_BASE}?${params.toString()}`;

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      'User-Agent': USER_AGENT,
    },
    signal: opts?.signal,
  });
  if (!res.ok) return [];
  const data = (await res.json()) as Array<{
    place_id: number;
    display_name: string;
    lat: string;
    lon: string;
    address?: {
      postcode?: string;
      city?: string;
      town?: string;
      village?: string;
      state?: string;
      state_district?: string;
      suburb?: string;
      neighbourhood?: string;
      city_district?: string;
    };
  }>;
  if (!Array.isArray(data)) return [];

  return data.map((item) => {
    const address = item.address;
    // state_district is the revenue district — excluded from `city` on purpose.
    const city = address?.city || address?.town || address?.village || null;
    const locality =
      address?.neighbourhood?.trim() ||
      address?.suburb?.trim() ||
      address?.city_district?.trim() ||
      null;
    const pincode =
      normalizeIndianPincode(address?.postcode) ||
      extractPincodeFromPlaceText(item.display_name);

    return {
      placeId: String(item.place_id),
      displayName: item.display_name ?? '',
      lat: parseFloat(item.lat) || 0,
      lon: parseFloat(item.lon) || 0,
      pincode,
      city,
      state: address?.state?.trim() || null,
      locality,
      district: address?.state_district?.trim() || null,
    };
  });
}

/** Google Places Autocomplete + Details (optional). Requires EXPO_PUBLIC_GOOGLE_PLACES_API_KEY. */
async function searchGooglePlaces(query: string, opts?: SearchOpts): Promise<PlaceResult[]> {
  const apiKey = typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY?.trim();
  if (!apiKey) return [];

  const trimmed = query.trim();
  if (!trimmed) return [];
  if (!canCallProvider('google')) return [];

  const autocompleteUrl = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(trimmed)}&components=country:in&key=${apiKey}`;
  const acRes = await fetch(autocompleteUrl, { signal: opts?.signal });
  if (!acRes.ok) return [];
  const acData = (await acRes.json()) as { predictions?: Array<{ place_id: string; description: string }> };
  const predictions = acData.predictions ?? [];
  if (predictions.length === 0) return [];

  const results: PlaceResult[] = [];
  for (const p of predictions.slice(0, 10)) {
    const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(p.place_id)}&fields=geometry,name,formatted_address,address_components&key=${apiKey}`;
    const detRes = await fetch(detailsUrl, { signal: opts?.signal });
    if (!detRes.ok) continue;
    const detData = (await detRes.json()) as {
      result?: {
        geometry?: { location?: { lat: number; lng: number } };
        formatted_address?: string;
        name?: string;
        address_components?: Array<{ long_name: string; short_name: string; types: string[] }>;
      };
    };
    const loc = detData.result?.geometry?.location;
    if (!loc) continue;
    const formatted = detData.result?.formatted_address ?? p.description ?? '';
    const postal = detData.result?.address_components?.find((c) =>
      c.types.includes('postal_code'),
    );
    // `locality` is the city; admin_area_2 is the district and is kept separate.
    const cityComponent = detData.result?.address_components?.find((c) =>
      c.types.includes('locality'),
    );
    const districtComponent = detData.result?.address_components?.find((c) =>
      c.types.includes('administrative_area_level_2'),
    );
    const localityComponent = detData.result?.address_components?.find((c) =>
      c.types.some((t) => t === 'sublocality_level_1' || t === 'sublocality' || t === 'neighborhood'),
    );
    const stateComponent = detData.result?.address_components?.find((c) =>
      c.types.includes('administrative_area_level_1'),
    );
    results.push({
      placeId: p.place_id,
      displayName: formatted,
      lat: loc.lat,
      lon: loc.lng,
      pincode:
        normalizeIndianPincode(postal?.long_name ?? postal?.short_name) ||
        extractPincodeFromPlaceText(formatted),
      city: cityComponent?.long_name ?? null,
      state: stateComponent?.long_name ?? null,
      locality: localityComponent?.long_name ?? null,
      district: districtComponent?.long_name ?? null,
    });
  }
  return results;
}

/**
 * Popular Indian cities for instant suggestions (prefix match when API returns nothing).
 * Approximate lat/lon for map/distance use.
 */
const POPULAR_PLACES: PlaceResult[] = [
  { placeId: 'popular-mumbai', displayName: 'Mumbai, Maharashtra', lat: 19.076, lon: 72.8777, pincode: '400001', city: 'Mumbai', state: 'Maharashtra' },
  { placeId: 'popular-delhi', displayName: 'Delhi, NCR', lat: 28.6139, lon: 77.209, pincode: '110001', city: 'Delhi', state: 'Delhi' },
  { placeId: 'popular-bengaluru', displayName: 'Bengaluru, Karnataka', lat: 12.9716, lon: 77.5946, pincode: '560001', city: 'Bangalore', state: 'Karnataka' },
  { placeId: 'popular-hyderabad', displayName: 'Hyderabad, Telangana', lat: 17.385, lon: 78.4867, pincode: '500001', city: 'Hyderabad', state: 'Telangana' },
  { placeId: 'popular-chennai', displayName: 'Chennai, Tamil Nadu', lat: 13.0827, lon: 80.2707, pincode: '600001', city: 'Chennai', state: 'Tamil Nadu' },
  { placeId: 'popular-kolkata', displayName: 'Kolkata, West Bengal', lat: 22.5726, lon: 88.3639, pincode: '700001', city: 'Kolkata', state: 'West Bengal' },
  { placeId: 'popular-pune', displayName: 'Pune, Maharashtra', lat: 18.5204, lon: 73.8567, pincode: '411001', city: 'Pune', state: 'Maharashtra' },
  { placeId: 'popular-ahmedabad', displayName: 'Ahmedabad, Gujarat', lat: 23.0225, lon: 72.5714, pincode: '380001', city: 'Ahmedabad', state: 'Gujarat' },
  { placeId: 'popular-jaipur', displayName: 'Jaipur, Rajasthan', lat: 26.9124, lon: 75.7873, pincode: '302001', city: 'Jaipur', state: 'Rajasthan' },
  { placeId: 'popular-surat', displayName: 'Surat, Gujarat', lat: 21.1702, lon: 72.8311, pincode: '395001', city: 'Surat', state: 'Gujarat' },
  { placeId: 'popular-lucknow', displayName: 'Lucknow, Uttar Pradesh', lat: 26.8467, lon: 80.9462, pincode: '226001', city: 'Lucknow', state: 'Uttar Pradesh' },
  { placeId: 'popular-nagpur', displayName: 'Nagpur, Maharashtra', lat: 21.1458, lon: 79.0882, pincode: '440001', city: 'Nagpur', state: 'Maharashtra' },
  { placeId: 'popular-indore', displayName: 'Indore, Madhya Pradesh', lat: 22.7196, lon: 75.8577, pincode: '452001', city: 'Indore', state: 'Madhya Pradesh' },
  { placeId: 'popular-kochi', displayName: 'Kochi, Kerala', lat: 9.9312, lon: 76.2673, pincode: '682001', city: 'Kochi', state: 'Kerala' },
  { placeId: 'popular-coimbatore', displayName: 'Coimbatore, Tamil Nadu', lat: 11.0168, lon: 76.9558, pincode: '641001', city: 'Coimbatore', state: 'Tamil Nadu' },
  { placeId: 'popular-manali', displayName: 'Manali, Himachal Pradesh', lat: 32.2396, lon: 77.1887, pincode: '175131', city: 'Manali', state: 'Himachal Pradesh' },
  { placeId: 'popular-shimla', displayName: 'Shimla, Himachal Pradesh', lat: 31.1048, lon: 77.1734, pincode: '171001', city: 'Shimla', state: 'Himachal Pradesh' },
  { placeId: 'popular-goa', displayName: 'Panaji, Goa', lat: 15.4909, lon: 73.8278, pincode: '403001', city: 'Panaji', state: 'Goa' },
  { placeId: 'popular-rishikesh', displayName: 'Rishikesh, Uttarakhand', lat: 30.0869, lon: 78.2676, pincode: '249201', city: 'Rishikesh', state: 'Uttarakhand' },
  { placeId: 'popular-dehradun', displayName: 'Dehradun, Uttarakhand', lat: 30.3165, lon: 78.0322, pincode: '248001', city: 'Dehradun', state: 'Uttarakhand' },
  { placeId: 'popular-ooty', displayName: 'Ooty, Tamil Nadu', lat: 11.4102, lon: 76.6950, pincode: '643001', city: 'Ooty', state: 'Tamil Nadu' },
  { placeId: 'popular-darjeeling', displayName: 'Darjeeling, West Bengal', lat: 27.0410, lon: 88.2663, pincode: '734101', city: 'Darjeeling', state: 'West Bengal' },
  { placeId: 'popular-udaipur', displayName: 'Udaipur, Rajasthan', lat: 24.5854, lon: 73.7125, pincode: '313001', city: 'Udaipur', state: 'Rajasthan' },
  { placeId: 'popular-varanasi', displayName: 'Varanasi, Uttar Pradesh', lat: 25.3176, lon: 82.9739, pincode: '221001', city: 'Varanasi', state: 'Uttar Pradesh' },
  { placeId: 'popular-amritsar', displayName: 'Amritsar, Punjab', lat: 31.6340, lon: 74.8723, pincode: '143001', city: 'Amritsar', state: 'Punjab' },
];

/** Head-GPO style fallback PIN when providers return city-only results without postcode. */
const CITY_DEFAULT_PINCODES: Record<string, string> = Object.fromEntries(
  POPULAR_PLACES.map((place) => {
    const city = place.city?.trim().toLowerCase();
    const pin = place.pincode?.trim();
    return city && pin ? [city, pin] : [];
  }),
);

const CITY_PIN_ALIASES: Record<string, string> = {
  bombay: 'mumbai',
  bengaluru: 'bangalore',
  'new delhi': 'delhi',
  gurugram: 'gurgaon',
  gurgaon: 'gurgaon',
  mysuru: 'mysore',
  mangaluru: 'mangalore',
  madras: 'chennai',
  calcutta: 'kolkata',
  panaji: 'panaji',
};

function pincodeForIndianCity(city?: string | null): string | null {
  if (!city?.trim()) return null;
  const raw = city.trim().toLowerCase();
  const key = CITY_PIN_ALIASES[raw] ?? raw;
  return normalizeIndianPincode(CITY_DEFAULT_PINCODES[key]);
}

function pincodeFromPopularPlace(
  displayName?: string,
  city?: string | null,
  state?: string | null,
): string | null {
  const key = displayName ? normalizeKey(displayName) : '';
  if (key) {
    const exact = POPULAR_PLACES.find((place) => normalizeKey(place.displayName) === key);
    if (exact?.pincode) return normalizeIndianPincode(exact.pincode);
  }

  const cityNorm = city?.trim().toLowerCase();
  const stateNorm = state?.trim().toLowerCase();
  if (cityNorm) {
    const hit = POPULAR_PLACES.find((place) => {
      const placeCity = place.city?.trim().toLowerCase();
      const placeState = place.state?.trim().toLowerCase();
      if (placeCity !== cityNorm && placeCity !== (CITY_PIN_ALIASES[cityNorm] ?? cityNorm)) {
        return false;
      }
      return !stateNorm || !placeState || placeState === stateNorm;
    });
    if (hit?.pincode) return normalizeIndianPincode(hit.pincode);
  }

  return pincodeForIndianCity(city);
}

/** Return popular places, optionally filtered by prefix (case-insensitive). */
export function getPopularPlacesInIndia(prefix?: string): PlaceResult[] {
  const p = (prefix ?? '').trim().toLowerCase();
  if (!p) return POPULAR_PLACES;
  return POPULAR_PLACES.filter((place) =>
    place.displayName.toLowerCase().includes(p)
  );
}

/** Read cached places from AsyncStorage, optionally filtered by query. */
export async function getCachedPlaces(query?: string): Promise<PlaceResult[]> {
  try {
    const raw = await AsyncStorage.getItem(PLACES_CACHE_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as PlaceResult[];
    if (!Array.isArray(list)) return [];
    const q = (query ?? '').trim().toLowerCase();
    if (!q) return list.slice(0, 30);
    const filtered = list.filter((p) =>
      (p.displayName ?? '').toLowerCase().includes(q)
    );
    const prefixMatches = filtered.filter((p) =>
      (p.displayName ?? '').toLowerCase().startsWith(q)
    );
    const rest = filtered.filter((p) => !prefixMatches.includes(p));
    return [...prefixMatches, ...rest].slice(0, 25);
  } catch {
    return [];
  }
}

/** Add a place to the cache (e.g. when user selects it). Dedupes by displayName; keeps recent first; cap at PLACES_CACHE_MAX. */
export async function addToPlacesCache(place: PlaceResult): Promise<void> {
  if (!place?.displayName?.trim()) return;
  if (!isUsablePlaceCoordinate(place.lat, place.lon)) return;
  try {
    const raw = await AsyncStorage.getItem(PLACES_CACHE_KEY);
    const list: PlaceResult[] = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(list)) return;
    const key = normalizeKey(place.displayName);
    const without = list.filter((p) => normalizeKey(p.displayName) !== key);
    const next = [{ ...place, placeId: place.placeId || `cache-${key}` }, ...without].slice(0, PLACES_CACHE_MAX);
    await AsyncStorage.setItem(PLACES_CACHE_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

/**
 * Search places in India: Mapbox (primary) → Google → Nominatim, then cache + popular fallback.
 */
export async function searchPlacesInIndia(query: string, opts?: SearchOpts): Promise<PlaceResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const cacheKey = normalizeKey(trimmed);
  const cachedMemory = cacheGet(cacheKey);
  if (cachedMemory) return cachedMemory;

  // Avoid spamming APIs for very short inputs; use cached/popular instead.
  if (trimmed.length < MIN_API_QUERY_LENGTH) {
    const popular = getPopularPlacesInIndia(trimmed);
    const cached = await getCachedPlaces(trimmed);
    const seen = new Set<string>();
    const merged: PlaceResult[] = [];
    for (const p of [...cached, ...popular]) {
      const k = normalizeKey(p.displayName);
      if (seen.has(k)) continue;
      seen.add(k);
      merged.push(p);
    }
    const q = trimmed.toLowerCase();
    const prefixFirst = merged.sort((a, b) => {
      const aLow = a.displayName.toLowerCase();
      const bLow = b.displayName.toLowerCase();
      const aStarts = aLow.startsWith(q) ? 1 : 0;
      const bStarts = bLow.startsWith(q) ? 1 : 0;
      if (aStarts !== bStarts) return bStarts - aStarts;
      return aLow.localeCompare(bLow);
    });
    const out = prefixFirst.slice(0, 25);
    cacheSet(cacheKey, out);
    return out;
  }

  // Deduplicate concurrent identical queries (e.g. multiple rerenders/fields).
  const inflightHit = inflight.get(cacheKey);
  if (inflightHit) return inflightHit;

  const hasMapbox = typeof process !== 'undefined' && !!process.env?.EXPO_PUBLIC_MAPBOX_TOKEN?.trim();
  const hasGoogle = typeof process !== 'undefined' && !!process.env?.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY?.trim();

  const p = (async () => {
    let apiResults: PlaceResult[] = [];
    try {
      if (hasMapbox) {
        apiResults = await searchMapbox(trimmed, opts);
      }
      if (apiResults.length === 0 && hasGoogle) {
        apiResults = await searchGooglePlaces(trimmed, opts);
      }
      if (apiResults.length === 0) {
        apiResults = await searchNominatim(trimmed, opts);
      }
    } catch (e: unknown) {
      // Abort is expected during typing; suppress noisy logs.
      const name = e instanceof Error ? e.name : (e as { name?: string } | null)?.name;
      if (name !== 'AbortError') {
        console.warn('placesService search error', e);
      }
    }

    if (apiResults.length > 0) {
      cacheSet(cacheKey, apiResults);
      return apiResults;
    }

    const popular = getPopularPlacesInIndia(trimmed);
    const cached = await getCachedPlaces(trimmed);
    const seen = new Set<string>();
    const merged: PlaceResult[] = [];
    for (const p of [...cached, ...popular]) {
      const k = normalizeKey(p.displayName);
      if (seen.has(k)) continue;
      seen.add(k);
      merged.push(p);
    }
    const q = trimmed.toLowerCase();
    const prefixFirst = merged.sort((a, b) => {
      const aLow = a.displayName.toLowerCase();
      const bLow = b.displayName.toLowerCase();
      const aStarts = aLow.startsWith(q) ? 1 : 0;
      const bStarts = bLow.startsWith(q) ? 1 : 0;
      if (aStarts !== bStarts) return bStarts - aStarts;
      return aLow.localeCompare(bLow);
    });
    const out = prefixFirst.slice(0, 25);
    // Do NOT cache this: it is a local popular/recents fallback, not a provider
    // answer. Every provider can be momentarily rate-gated (each silently
    // returns []), and caching that under the real query key would pin a wrong
    // "no such place" result for the whole TTL — so a retry never recovers.
    return out;
  })().finally(() => {
    inflight.delete(cacheKey);
  });

  inflight.set(cacheKey, p);
  return p;
}

async function reverseMapboxPostcode(lat: number, lon: number): Promise<string | null> {
  const token = typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_MAPBOX_TOKEN?.trim();
  if (!token) return null;

  const params = new URLSearchParams({
    access_token: token,
    country: 'IN',
    types: 'postcode',
    limit: '1',
    worldview: 'IN',
  });
  const url = `${MAPBOX_GEOCODING_BASE}/${lon},${lat}.json?${params.toString()}`;

  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as { features?: MapboxFeature[] };
    const feature = data.features?.[0];
    if (!feature) return null;
    return (
      normalizeIndianPincode(feature.text) ||
      normalizeIndianPincode(readMapboxContextText(feature.context, 'postcode'))
    );
  } catch {
    return null;
  }
}

async function reverseMapbox(lat: number, lon: number): Promise<ReverseGeocodeIndiaResult> {
  const token = typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_MAPBOX_TOKEN?.trim();
  if (!token) return EMPTY_REVERSE_GEOCODE;

  const params = new URLSearchParams({
    access_token: token,
    country: 'IN',
    types: 'address,place,locality,neighborhood,postcode,region,district',
    worldview: 'IN',
  });
  const url = `${MAPBOX_GEOCODING_BASE}/${lon},${lat}.json?${params.toString()}`;

  try {
    const res = await fetch(url);
    if (!res.ok) return EMPTY_REVERSE_GEOCODE;
    const data = (await res.json()) as {
      features?: Array<{
        text?: string;
        place_type?: string[];
        context?: Array<{ id?: string; text?: string }>;
        properties?: { address?: string };
      }>;
    };
    const feature = data.features?.[0];
    if (!feature) return EMPTY_REVERSE_GEOCODE;

    const context = feature.context;
    const postcode = readMapboxContextText(context, 'postcode');
    const region = readMapboxContextText(context, 'region');
    const place = readMapboxContextText(context, 'place');
    const locality =
      readMapboxContextText(context, 'locality') ||
      readMapboxContextText(context, 'neighborhood') ||
      readMapboxContextText(context, 'district');
    const street = feature.place_type?.includes('address')
      ? [feature.properties?.address, feature.text].filter(Boolean).join(' ').trim() ||
        feature.text?.trim() ||
        null
      : null;

    return {
      city: place || locality,
      state: region,
      pincode: normalizeIndianPincode(postcode),
      locality,
      street,
    };
  } catch {
    return EMPTY_REVERSE_GEOCODE;
  }
}

async function reverseNominatim(lat: number, lon: number): Promise<ReverseGeocodeIndiaResult> {
  try {
    const res = await fetch(buildNominatimReverseUrl(lat, lon, { zoom: '16' }), {
      headers: {
        Accept: 'application/json',
        'User-Agent': USER_AGENT,
      },
    });
    if (!res.ok) return EMPTY_REVERSE_GEOCODE;
    const data = (await res.json()) as {
      display_name?: string;
      address?: {
        postcode?: string;
        city?: string;
        town?: string;
        village?: string;
        county?: string;
        state_district?: string;
        suburb?: string;
        neighbourhood?: string;
        road?: string;
        state?: string;
      };
    };
    const address = data.address;
    if (!address) return EMPTY_REVERSE_GEOCODE;

    const city =
      address.city ||
      address.town ||
      address.village ||
      address.county ||
      address.state_district ||
      null;
    const locality = address.suburb || address.neighbourhood || null;
    const pincode =
      normalizeIndianPincode(address.postcode) ||
      extractPincodeFromPlaceText(data.display_name);

    return {
      city,
      state: address.state?.trim() || null,
      pincode,
      locality,
      street: address.road?.trim() || null,
    };
  } catch {
    return EMPTY_REVERSE_GEOCODE;
  }
}

/** Reverse-geocode lat/lon in India — Mapbox, Nominatim, then postcode-only fallback. */
export async function reverseGeocodePlaceInIndia(
  lat: number,
  lon: number,
): Promise<ReverseGeocodeIndiaResult> {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) {
    return EMPTY_REVERSE_GEOCODE;
  }

  const [mapbox, nominatim] = await Promise.all([
    reverseMapbox(lat, lon),
    reverseNominatim(lat, lon),
  ]);

  let pincode = mapbox.pincode || nominatim.pincode;
  if (!pincode) {
    pincode = await reverseMapboxPostcode(lat, lon);
  }

  return {
    city: mapbox.city || nominatim.city,
    state: mapbox.state || nominatim.state,
    pincode,
    locality: mapbox.locality || nominatim.locality,
    street: mapbox.street || nominatim.street,
  };
}

async function forwardPincodeFromCity(
  city?: string | null,
  state?: string | null,
): Promise<string | null> {
  if (!city?.trim()) return null;
  const query = [city.trim(), state?.trim(), 'India'].filter(Boolean).join(', ');

  try {
    const nominatimHits = await searchNominatim(query);
    for (const hit of nominatimHits) {
      if (hit.pincode) return hit.pincode;
    }
  } catch {
    // ignore
  }

  const token = typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_MAPBOX_TOKEN?.trim();
  if (!token) return null;

  try {
    const params = new URLSearchParams({
      access_token: token,
      country: 'IN',
      types: 'postcode,locality,place,neighborhood,address',
      limit: '8',
      worldview: 'IN',
    });
    const url = `${MAPBOX_GEOCODING_BASE}/${encodeURIComponent(`${city} ${state ?? ''}`.trim())}.json?${params.toString()}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as { features?: MapboxFeature[] };
    for (const feature of data.features ?? []) {
      const place = placeResultFromMapboxFeature(feature);
      if (place?.pincode) return place.pincode;
    }
  } catch {
    // ignore
  }

  return null;
}

/** Resolve an Indian PIN from selection hints, reverse geocode, forward search, then city catalog. */
export async function resolveIndiaPincode(input: {
  lat: number;
  lon: number;
  displayName?: string;
  hintPincode?: string | null;
  city?: string | null;
  state?: string | null;
  /** When the caller already reverse-geocoded, pass it here to skip a duplicate request. */
  reverseGeo?: ReverseGeocodeIndiaResult | null;
}): Promise<string | null> {
  const fromHint =
    normalizeIndianPincode(input.hintPincode) ||
    extractPincodeFromPlaceText(input.displayName);
  if (fromHint) return fromHint;

  const fromPopular = pincodeFromPopularPlace(input.displayName, input.city, input.state);
  if (fromPopular) return fromPopular;

  if (!Number.isFinite(input.lat) || !Number.isFinite(input.lon) || (input.lat === 0 && input.lon === 0)) {
    return pincodeForIndianCity(input.city);
  }

  const geo =
    input.reverseGeo ?? (await reverseGeocodePlaceInIndia(input.lat, input.lon));
  if (geo.pincode) return geo.pincode;

  const city = input.city || geo.city;
  const state = input.state || geo.state;

  const fromForward = await forwardPincodeFromCity(city, state);
  if (fromForward) return fromForward;

  return pincodeForIndianCity(city);
}
