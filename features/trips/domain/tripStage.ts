import { getPopularPlacesInIndia, type PlaceResult } from "@/lib/placesService";
import type { TripRow } from "@/features/trips/services/trips.service";

/**
 * Canonical driver-facing trip stage, derived from `trips.status`.
 *
 * Consolidates two previously-duplicated implementations that had drifted to
 * use different type names for the identical status->stage mapping:
 *   - `deriveDriverGuidanceStep` in features/drivers/screens/DriverHomeScreen.tsx
 *   - `deriveDriverFlowStepFromTrip` in features/driver/utils/driverTripStatusNotes.util.ts
 * `'lr'` (lorry-receipt upload) is a client-only sub-step of `'pickup'` set by
 * DriverTripFlowCard; it has no corresponding `trips.status` value, so
 * deriveTripStage() never returns it — callers that track it do so locally.
 */
export type TripStage =
  | "accepted"
  | "pickup"
  | "lr"
  | "transit"
  | "reached"
  | "completed";

/** Which stop this stage is oriented toward, for map centering/highlighting. */
export type TripStageTarget = "pickup" | "drop" | null;

export function deriveTripStage(trip: TripRow): TripStage {
  const s = String(trip.status ?? "").toLowerCase();
  if (s === "completed" || s === "delivered" || s === "done") return "completed";
  if (s === "at_drop") return "reached";
  if (s === "in_transit" || s === "transit") return "transit";
  if (s === "picked_up" || s === "pickup" || s === "in_progress") return "pickup";
  return "accepted";
}

export function getTripStageTarget(stage: TripStage): TripStageTarget {
  if (stage === "accepted" || stage === "pickup" || stage === "lr") return "pickup";
  return "drop";
}

/**
 * Resolves lat/lon for a trip's pickup or drop stop. Falls back to a popular-
 * places lookup by area name when the DB row has no coordinates.
 */
export function getTripStopCoordinate(
  trip: Pick<
    TripRow,
    | "pickup_lat"
    | "pickup_lon"
    | "drop_lat"
    | "drop_lon"
    | "pickup_area"
    | "drop_location"
    | "drop_area"
  >,
  target: "pickup" | "drop",
): { latitude: number; longitude: number } | null {
  const latitude = Number(target === "pickup" ? trip.pickup_lat : trip.drop_lat);
  const longitude = Number(target === "pickup" ? trip.pickup_lon : trip.drop_lon);
  if (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    (latitude !== 0 || longitude !== 0)
  ) {
    return { latitude, longitude };
  }

  // Last resort: popular places fallback if coordinates are missing in DB
  const areaStr = (
    target === "pickup" ? trip.pickup_area : trip.drop_location || trip.drop_area
  )?.trim();
  if (areaStr) {
    // 1. Exact or prefix/includes match
    const popular = getPopularPlacesInIndia(areaStr);
    if (popular.length > 0) {
      const exact = popular.find(
        (p: PlaceResult) => p.displayName.toLowerCase() === areaStr.toLowerCase(),
      );
      const match = exact || popular[0];
      return { latitude: match.lat, longitude: match.lon };
    }

    // 2. Try matching individual parts (e.g. "Okhla, Delhi" -> match "Delhi")
    const parts = areaStr
      .split(/[,|\s]+/)
      .map((p: string) => p.trim())
      .filter((p: string) => p.length > 2);
    for (const part of parts) {
      const matches = getPopularPlacesInIndia(part);
      if (matches.length > 0) {
        return { latitude: matches[0].lat, longitude: matches[0].lon };
      }
    }
  }

  return null;
}
