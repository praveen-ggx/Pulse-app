import type { TripRow } from "@/features/trips/services/trips.service";
import { getTripStopCoordinate } from "@/features/trips/domain/tripStage";

export function simulateStageStopTarget(
  targetStatus: string,
): "pickup" | "drop" {
  const s = String(targetStatus ?? "").trim().toLowerCase();
  if (s === "at_drop" || s === "completed" || s === "delivered" || s === "done") {
    return "drop";
  }
  return "pickup";
}

export function resolveSimulateStageCoordinate(
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
  targetStatus: string,
  live: { lat: number | null; lng: number | null },
): { lat: number | null; lng: number | null } {
  if (
    live.lat != null &&
    live.lng != null &&
    Number.isFinite(live.lat) &&
    Number.isFinite(live.lng)
  ) {
    return { lat: live.lat, lng: live.lng };
  }
  const stop = getTripStopCoordinate(trip, simulateStageStopTarget(targetStatus));
  if (!stop) return { lat: null, lng: null };
  return { lat: stop.latitude, lng: stop.longitude };
}

export function appendBisimNote(params: {
  existingNotes: string | null | undefined;
  targetStatus: string;
  fromStatus: string;
  userName: string;
  lat: number | null;
  lng: number | null;
  at?: string;
}): string {
  const at = params.at ?? new Date().toISOString();
  const simEntry = `[BISIM|${params.targetStatus}|${at}|${params.lat ?? ""}|${params.lng ?? ""}|${params.userName}|${params.fromStatus}]`;
  const existing = params.existingNotes?.trim() || "";
  return existing ? `${existing}\n${simEntry}` : simEntry;
}

export function lastBisimCoordinate(
  entries: Array<{ lat: number | null; lng: number | null }>,
): { latitude: number; longitude: number } | null {
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    const lat = entries[i]?.lat;
    const lng = entries[i]?.lng;
    if (lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)) {
      return { latitude: lat, longitude: lng };
    }
  }
  return null;
}
