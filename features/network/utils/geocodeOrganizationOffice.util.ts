import type { OrganizationLocation } from "@/features/organization/services/organization.service";
import type { OfficeMapCoordinate } from "@/features/network/hooks/useOrganizationOfficeMap";
import { buildOrganizationOfficeGeocodeQuery } from "@/features/network/utils/organizationOfficeLocation.util";
import {
  haversineKm,
  lookupIndianCityCoordinate,
} from "@/lib/indianCityCoordinates.util";

const MAPBOX_GEOCODING_BASE =
  "https://api.mapbox.com/geocoding/v5/mapbox.places";
const NOMINATIM_BASE = "https://nominatim.openstreetmap.org/search";
const NOMINATIM_USER_AGENT = "Pulse-Logistics/1.0 (office HQ geocode)";
/** Reject street hits that land far from the stated city (e.g. Gingee town vs Coimbatore). */
const MAX_CITY_DISTANCE_KM = 80;

type GeocodeHit = { coordinate: OfficeMapCoordinate; name: string };

function readMapboxToken(): string {
  if (typeof process === "undefined") return "";
  return process.env.EXPO_PUBLIC_MAPBOX_TOKEN?.trim() ?? "";
}

function officeGeocodeQueries(
  location?: OrganizationLocation | null,
): string[] {
  if (!location) return [];
  const seen = new Set<string>();
  const queries: string[] = [];
  const push = (q: string) => {
    const trimmed = q.trim();
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    queries.push(trimmed);
  };

  const full = buildOrganizationOfficeGeocodeQuery(location);
  if (full) push(full);

  const address = location.address_line?.trim();
  const city = location.city?.trim();
  const state = location.state?.trim();

  if (address && city && state) {
    push(`${address}, ${city}, ${state}, India`);
  }
  if (address && city) {
    push(`${address}, ${city}, India`);
  }
  if (city && state) {
    push(`${city}, ${state}, India`);
  }
  if (city) {
    push(`${city}, India`);
  }

  return queries;
}

function cityAnchor(location?: OrganizationLocation | null): OfficeMapCoordinate | null {
  const fromTable = lookupIndianCityCoordinate(location?.city);
  if (fromTable) return fromTable;
  return null;
}

function isNearStatedCity(
  coordinate: OfficeMapCoordinate,
  location?: OrganizationLocation | null,
): boolean {
  const anchor = cityAnchor(location);
  if (!anchor) return true;
  return (
    haversineKm(
      coordinate.latitude,
      coordinate.longitude,
      anchor.latitude,
      anchor.longitude,
    ) <= MAX_CITY_DISTANCE_KM
  );
}

function placeNameMatchesCity(name: string, city?: string | null): boolean {
  const cityKey = city?.trim().toLowerCase();
  if (!cityKey) return true;
  const normalized = name.toLowerCase();
  if (normalized.includes(cityKey)) return true;
  if (cityKey === "bengaluru" && normalized.includes("bangalore")) return true;
  if (cityKey === "bangalore" && normalized.includes("bengaluru")) return true;
  if (cityKey === "mysuru" && normalized.includes("mysore")) return true;
  if (cityKey === "mysore" && normalized.includes("mysuru")) return true;
  if (cityKey === "mangaluru" && normalized.includes("mangalore")) return true;
  if (cityKey === "mangalore" && normalized.includes("mangaluru")) return true;
  return false;
}

function acceptHit(
  hit: GeocodeHit | null,
  location?: OrganizationLocation | null,
  options?: { requireCityInName?: boolean },
): GeocodeHit | null {
  if (!hit) return null;
  if (!isNearStatedCity(hit.coordinate, location)) return null;
  if (options?.requireCityInName && !placeNameMatchesCity(hit.name, location?.city)) {
    return null;
  }
  return hit;
}

async function forwardMapbox(
  query: string,
  proximity?: OfficeMapCoordinate | null,
): Promise<GeocodeHit | null> {
  const token = readMapboxToken();
  if (!token) return null;

  const params = new URLSearchParams({
    access_token: token,
    country: "IN",
    limit: "1",
    types: "address,place,locality,neighborhood,poi",
    worldview: "in",
  });
  if (proximity) {
    params.set("proximity", `${proximity.longitude},${proximity.latitude}`);
  }
  const url = `${MAPBOX_GEOCODING_BASE}/${encodeURIComponent(query)}.json?${params}`;

  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as {
      features?: Array<{
        place_name?: string;
        center?: [number, number];
      }>;
    };
    const feature = data.features?.[0];
    const lng = feature?.center?.[0];
    const lat = feature?.center?.[1];
    if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      return null;
    }
    return {
      coordinate: { latitude: lat, longitude: lng },
      name: feature?.place_name?.trim() || query,
    };
  } catch {
    return null;
  }
}

async function forwardNominatim(query: string): Promise<GeocodeHit | null> {
  const params = new URLSearchParams({
    q: query,
    countrycodes: "in",
    format: "json",
    limit: "1",
    addressdetails: "0",
  });

  try {
    const res = await fetch(`${NOMINATIM_BASE}?${params}`, {
      headers: {
        Accept: "application/json",
        "User-Agent": NOMINATIM_USER_AGENT,
      },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Array<{
      display_name?: string;
      lat?: string;
      lon?: string;
    }>;
    const hit = data?.[0];
    const lat = hit?.lat ? parseFloat(hit.lat) : NaN;
    const lng = hit?.lon ? parseFloat(hit.lon) : NaN;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return {
      coordinate: { latitude: lat, longitude: lng },
      name: hit?.display_name?.trim() || query,
    };
  } catch {
    return null;
  }
}

function cityFallback(
  location?: OrganizationLocation | null,
): { coordinate: OfficeMapCoordinate; geocodedName: string } | null {
  const anchor = cityAnchor(location);
  if (!anchor) return null;
  const city = location?.city?.trim();
  const state = location?.state?.trim();
  const label = [city, state, "India"].filter(Boolean).join(", ");
  return {
    coordinate: anchor,
    geocodedName: label || city || "India",
  };
}

/** Forward-geocode org HQ — Mapbox then Nominatim, India-biased with city validation. */
export async function geocodeOrganizationOffice(
  location?: OrganizationLocation | null,
): Promise<{ coordinate: OfficeMapCoordinate | null; geocodedName: string | null }> {
  const queries = officeGeocodeQueries(location);
  const proximity = cityAnchor(location);

  for (const query of queries) {
    const isCityLevel =
      !location?.address_line?.trim() ||
      query === `${location.city?.trim()}, ${location.state?.trim()}, India` ||
      query === `${location.city?.trim()}, India`;

    const mapbox = acceptHit(
      await forwardMapbox(query, proximity),
      location,
      { requireCityInName: !isCityLevel },
    );
    if (mapbox) {
      return {
        coordinate: mapbox.coordinate,
        geocodedName: mapbox.name,
      };
    }

    const nominatim = acceptHit(await forwardNominatim(query), location, {
      requireCityInName: !isCityLevel,
    });
    if (nominatim) {
      return {
        coordinate: nominatim.coordinate,
        geocodedName: nominatim.name,
      };
    }
  }

  const fallback = cityFallback(location);
  if (fallback) {
    return {
      coordinate: fallback.coordinate,
      geocodedName: fallback.geocodedName,
    };
  }

  return { coordinate: null, geocodedName: null };
}
