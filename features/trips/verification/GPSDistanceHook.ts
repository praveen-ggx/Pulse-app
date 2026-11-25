import { useMemo } from "react";
import type { TripRow } from "@/features/trips/services/trips.service";

/**
 * True GPS / tracked distance only — never substitute planned `trips.distance`
 * (that would mis-label commercial range as GPS in comparison UI).
 */
export function useGPSDistanceEstimate(trip: TripRow | null): number | null {
  return useMemo(() => {
    if (!trip) return null;
    if (trip.gps_distance_km != null) {
      const gps = Number(trip.gps_distance_km);
      return Number.isFinite(gps) && gps >= 0 ? Math.round(gps * 10) / 10 : null;
    }
    const actual = Number(
      (trip as { actual_distance_traveled_km?: number | null }).actual_distance_traveled_km,
    );
    if (Number.isFinite(actual) && actual >= 0) {
      return Math.round(actual * 10) / 10;
    }
    return null;
  }, [trip]);
}
