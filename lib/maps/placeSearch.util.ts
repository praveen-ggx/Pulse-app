/**
 * Place-search helpers shared by LocationSearchField and placesService.
 * Mapbox Geocoding v5 types are the official allowlist (poi data was removed).
 */

/** Official Geocoding v5 `types` values (docs.mapbox.com/api/search/geocoding-v5). */
export const MAPBOX_GEOCODING_V5_SUPPORTED_TYPES = [
  "country",
  "region",
  "postcode",
  "district",
  "place",
  "locality",
  "neighborhood",
  "address",
] as const;

export type MapboxGeocodingV5Type = (typeof MAPBOX_GEOCODING_V5_SUPPORTED_TYPES)[number];

/**
 * Forward-search types for India logistics.
 * Includes `district` (supported; previously omitted).
 * Does **not** include `poi` / `poi.landmark`: Mapbox removed POI data from
 * Geocoding v5; a POI-only or POI-weighted filter can yield empty features.
 */
export const MAPBOX_FORWARD_SEARCH_TYPES: string = [
  "address",
  "place",
  "locality",
  "neighborhood",
  "postcode",
  "district",
].join(",");

export const NOMINATIM_SEARCH_URL = "https://nominatim.openstreetmap.org/search";
export const NOMINATIM_REVERSE_URL = "https://nominatim.openstreetmap.org/reverse";

/** App identity only — no invented contact mailbox. */
export const NOMINATIM_USER_AGENT = "Pulse-Logistics/1.0 (India places)";

export function isUsablePlaceCoordinate(
  lat?: number | null,
  lon?: number | null,
): boolean {
  if (lat == null || lon == null) return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return false;
  if (Math.abs(lat) < 0.000001 && Math.abs(lon) < 0.000001) return false;
  return true;
}

export function coordsOrUnset(coords?: {
  lat?: number | null;
  lon?: number | null;
} | null): { lat: number | null; lon: number | null } {
  if (!isUsablePlaceCoordinate(coords?.lat, coords?.lon)) {
    return { lat: null, lon: null };
  }
  return { lat: coords!.lat as number, lon: coords!.lon as number };
}

/** Text-only custom address: never invent a pin. */
export function customPlaceCoords(): { lat: null; lon: null } {
  return { lat: null, lon: null };
}

export function shouldCachePlaceSearchResults(results: readonly unknown[]): boolean {
  return Array.isArray(results) && results.length > 0;
}

export function buildNominatimReverseUrl(
  lat: number,
  lon: number,
  extra?: Record<string, string>,
): string {
  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lon),
    format: "json",
    addressdetails: "1",
    ...extra,
  });
  return `${NOMINATIM_REVERSE_URL}?${params.toString()}`;
}

/**
 * OpenStreetMap tags Chennai (and other Indian municipal) corporation wards as
 * the area's neighbourhood/suburb — e.g. "Ward 30", "Zone 10 Kodambakkam".
 * Ward numbers are not place names, so they must never become a trip label.
 * Returns the cleaned area name, or "" when the value is only a ward/zone number.
 *   "Ward 185"              → ""
 *   "Ward No. 30"           → ""
 *   "Zone 3"                → ""
 *   "Zone 10 Kodambakkam"   → "Kodambakkam"
 *   "Velayudam Colony"      → "Velayudam Colony" (unchanged)
 */
export function cleanOsmAreaName(value: string | null | undefined): string {
  let v = (value ?? "").trim().replace(/\s+/g, " ");
  if (!v) return "";
  if (/^ward\s*(?:no\.?\s*)?[-#:]?\s*\d+[a-z]?\b/i.test(v)) return "";
  v = v.replace(/^zone\s*(?:no\.?\s*)?[-#:]?\s*\d+[a-z]?\b[\s,:-]*/i, "").trim();
  return v;
}
