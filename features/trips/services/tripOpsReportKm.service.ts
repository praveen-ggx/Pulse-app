/**
 * Batch-load KM for Trip Ops Excel — same idea as Manifest Range on the card.
 *
 * Do NOT call Nominatim from the browser (CORS + 429). Fill order:
 * 1) stored distance / odometer / GPS
 * 2) haversine × 1.3 from real pins or local India city table
 * 3) Mapbox forward geocode (CORS-safe with token) for remaining place names
 * 4) optional getOptimalRoute upgrade when pins exist
 */
import { getOptimalRoute } from "@/lib/routingService";
import { supabase } from "@/lib/supabase";
import {
  estimateTripOpsReportKmFromCoords,
  estimateTripOpsReportKmFromRoute,
  parseTripOpsKmValue,
  readTripOpsLatLon,
  resolveTripOpsPlaceCoords,
  resolveTripOpsReportKmFromStored,
} from "@/features/trips/utils/tripOpsReport.model";
import type { TripRow } from "@/features/trips/services/trips.service";

const CHUNK = 80;
const ROUTE_CONCURRENCY = 3;
const MAPBOX_GEOCODE_CONCURRENCY = 2;
const MAPBOX_GEOCODE_TIMEOUT_MS = 4_000;
const MAPBOX_GEOCODING_BASE =
  "https://api.mapbox.com/geocoding/v5/mapbox.places";

type LatLon = { latitude: number; longitude: number };

type KmTripRow = Pick<
  TripRow,
  | "id"
  | "distance"
  | "actual_distance_traveled_km"
  | "odometer_distance_km"
  | "gps_distance_km"
  | "start_odometer_km"
  | "end_odometer_km"
  | "pickup_lat"
  | "pickup_lon"
  | "drop_lat"
  | "drop_lon"
  | "pickup_area"
  | "drop_location"
>;

const KM_SELECT =
  "id, distance, actual_distance_traveled_km, odometer_distance_km, gps_distance_km, start_odometer_km, end_odometer_km, pickup_lat, pickup_lon, drop_lat, drop_lon, pickup_area, drop_location";

const geocodeCache = new Map<string, LatLon | null>();

function readMapboxToken(): string {
  if (typeof process === "undefined") return "";
  return process.env?.EXPO_PUBLIC_MAPBOX_TOKEN?.trim() ?? "";
}

async function mapPool<T>(
  items: T[],
  concurrency: number,
  run: (item: T) => Promise<void>,
): Promise<void> {
  if (items.length === 0) return;
  let next = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (next < items.length) {
        const index = next;
        next += 1;
        await run(items[index]!);
      }
    },
  );
  await Promise.all(workers);
}

/** Mapbox only — never Nominatim in the browser (CORS / 429). */
async function geocodePlaceWithMapbox(
  location: string | null | undefined,
): Promise<LatLon | null> {
  const raw = (location ?? "").trim();
  if (!raw) return null;
  const local = resolveTripOpsPlaceCoords(raw);
  if (local) return local;

  const key = raw.toLowerCase();
  if (geocodeCache.has(key)) return geocodeCache.get(key) ?? null;

  const token = readMapboxToken();
  if (!token) {
    geocodeCache.set(key, null);
    return null;
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), MAPBOX_GEOCODE_TIMEOUT_MS);
    const params = new URLSearchParams({
      access_token: token,
      country: "IN",
      limit: "1",
      types: "place,locality,district,region",
    });
    const url = `${MAPBOX_GEOCODING_BASE}/${encodeURIComponent(raw)}.json?${params}`;
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) {
      geocodeCache.set(key, null);
      return null;
    }
    const data = (await res.json()) as {
      features?: Array<{ center?: [number, number] }>;
    };
    const center = data.features?.[0]?.center;
    const lon = center?.[0];
    const lat = center?.[1];
    const pin = readTripOpsLatLon(lat, lon);
    geocodeCache.set(key, pin);
    return pin;
  } catch {
    geocodeCache.set(key, null);
    return null;
  }
}

async function resolveEndpointCoords(
  lat: number | string | null | undefined,
  lon: number | string | null | undefined,
  placeName: string | null | undefined,
): Promise<LatLon | null> {
  return (
    readTripOpsLatLon(lat, lon) ??
    resolveTripOpsPlaceCoords(placeName) ??
    (await geocodePlaceWithMapbox(placeName))
  );
}

export async function loadTripOpsReportKmByTripId(
  tripIds: string[],
): Promise<Record<string, number>> {
  const ids = [...new Set(tripIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) return {};

  const out: Record<string, number> = {};
  const pending: KmTripRow[] = [];

  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const { data, error } = await supabase()
      .from("trips")
      .select(KM_SELECT)
      .in("id", chunk);
    if (error) {
      console.warn("[tripOpsReportKm] fetch:", error.message);
      continue;
    }
    for (const row of (data ?? []) as KmTripRow[]) {
      const key = String(row.id ?? "").trim().toLowerCase();
      if (!key) continue;

      const stored = resolveTripOpsReportKmFromStored(row as TripRow);
      if (stored != null) {
        out[key] = stored;
        continue;
      }
      const raw = parseTripOpsKmValue(row.distance);
      if (raw != null) {
        out[key] = Math.round(raw * 10) / 10;
        continue;
      }

      const estimated = estimateTripOpsReportKmFromRoute(row as TripRow);
      if (estimated != null) {
        out[key] = estimated;
        if (
          readTripOpsLatLon(row.pickup_lat, row.pickup_lon) &&
          readTripOpsLatLon(row.drop_lat, row.drop_lon)
        ) {
          pending.push(row);
        }
        continue;
      }

      pending.push(row);
    }
  }

  const stillMissing = pending.filter((row) => {
    const key = String(row.id ?? "").trim().toLowerCase();
    return Boolean(key && out[key] == null);
  });

  // Dedupe place strings first so Mapbox is hit once per unique name.
  const uniquePlaces = [
    ...new Set(
      stillMissing.flatMap((row) =>
        [row.pickup_area, row.drop_location]
          .map((v) => (v ?? "").trim())
          .filter(Boolean),
      ),
    ),
  ];
  await mapPool(uniquePlaces, MAPBOX_GEOCODE_CONCURRENCY, async (place) => {
    await geocodePlaceWithMapbox(place);
  });

  await mapPool(stillMissing, MAPBOX_GEOCODE_CONCURRENCY, async (row) => {
    const key = String(row.id ?? "").trim().toLowerCase();
    if (!key || out[key] != null) return;
    const origin = await resolveEndpointCoords(
      row.pickup_lat,
      row.pickup_lon,
      row.pickup_area,
    );
    const destination = await resolveEndpointCoords(
      row.drop_lat,
      row.drop_lon,
      row.drop_location,
    );
    const estimated = estimateTripOpsReportKmFromCoords(origin, destination);
    if (estimated != null) out[key] = estimated;
  });

  const routeCandidates = pending.filter((row) => {
    const key = String(row.id ?? "").trim().toLowerCase();
    if (!key) return false;
    return Boolean(
      readTripOpsLatLon(row.pickup_lat, row.pickup_lon) &&
        readTripOpsLatLon(row.drop_lat, row.drop_lon),
    );
  });

  await mapPool(routeCandidates, ROUTE_CONCURRENCY, async (row) => {
    const key = String(row.id ?? "").trim().toLowerCase();
    if (!key) return;
    const from = readTripOpsLatLon(row.pickup_lat, row.pickup_lon);
    const to = readTripOpsLatLon(row.drop_lat, row.drop_lon);
    if (!from || !to) return;
    try {
      const route = await getOptimalRoute(from, to);
      if (
        route?.distance != null &&
        Number.isFinite(route.distance) &&
        route.distance > 0
      ) {
        out[key] = Math.round((route.distance / 1000) * 10) / 10;
      }
    } catch (err) {
      console.warn(
        "[tripOpsReportKm] route:",
        err instanceof Error ? err.message : err,
      );
    }
  });

  return out;
}
