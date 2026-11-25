/**
 * Driver-facing trip distance for cards / history.
 *
 * Offer / incoming cards must show **planned** km only — never odometer or GPS
 * trip totals (those belong to in-progress / completed verification). Mixing
 * them is how a NEW TRIP offer can show "4,445 km" from a leftover odo reading.
 *
 * Active / history: prefer odometer for primary display, but expose GPS
 * separately so UI can compare without conflating sources.
 */

import { computeDistanceDiscrepancy } from "@/features/trips/verification/verification.service";
import { ODOMETER_GPS_CONFLICT_THRESHOLD_KM } from "@/features/trips/verification/selectors/verificationSelectors";

export type DriverDisplayDistanceTrip = {
  distance?: string | number | null;
  odometer_distance_km?: number | null;
  gps_distance_km?: number | null;
  actual_distance_traveled_km?: number | null;
  start_odometer_km?: number | null;
  end_odometer_km?: number | null;
};

function coercePositiveKm(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const n =
    typeof raw === "number"
      ? raw
      : parseFloat(String(raw).replace(/,/g, "").replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

/** Planned / commercial range from `trips.distance` only. */
export function resolveDriverPlannedDistanceKm(
  trip: DriverDisplayDistanceTrip | null | undefined,
): number | null {
  if (!trip) return null;
  return coercePositiveKm(trip.distance);
}

/** Odometer trip km from stored total or start/end readings. */
export function resolveDriverOdometerDistanceKm(
  trip: DriverDisplayDistanceTrip | null | undefined,
): number | null {
  if (!trip) return null;
  const stored = coercePositiveKm(trip.odometer_distance_km);
  if (stored != null) return stored;
  if (trip.start_odometer_km == null || trip.end_odometer_km == null) return null;
  const delta = Number(trip.end_odometer_km) - Number(trip.start_odometer_km);
  if (!Number.isFinite(delta) || delta <= 0) return null;
  return delta;
}

/** Tracked GPS / actual distance — never planned. */
export function resolveDriverGpsDistanceKm(
  trip: DriverDisplayDistanceTrip | null | undefined,
): number | null {
  if (!trip) return null;
  const gps = coercePositiveKm(trip.gps_distance_km);
  if (gps != null) return gps;
  return coercePositiveKm(trip.actual_distance_traveled_km);
}

/**
 * Offer / incoming job cards: planned only.
 * Optional route fallback (live corridor km) when planned is missing.
 */
export function resolveDriverOfferDistanceKm(
  trip: DriverDisplayDistanceTrip | null | undefined,
  opts?: { fallbackKm?: number | null },
): number | null {
  const planned = resolveDriverPlannedDistanceKm(trip);
  if (planned != null) return planned;
  const fb = opts?.fallbackKm;
  if (fb != null && Number.isFinite(fb) && fb > 0) return fb;
  return null;
}

/**
 * Best single km for history / active cards when a compare strip is not shown.
 * Priority: odometer → GPS → actual → planned.
 */
export function resolveDriverDisplayDistanceKm(
  trip: DriverDisplayDistanceTrip | null | undefined,
): number | null {
  if (!trip) return null;

  const odo = resolveDriverOdometerDistanceKm(trip);
  if (odo != null) return odo;

  const gps = resolveDriverGpsDistanceKm(trip);
  if (gps != null) return gps;

  return resolveDriverPlannedDistanceKm(trip);
}

export type GpsOdometerCompareModel = {
  odometerKm: number | null;
  gpsKm: number | null;
  plannedKm: number | null;
  discrepancyKm: number | null;
  hasConflict: boolean;
  /** True when both odo and GPS are present — UI should show dual compare. */
  canCompare: boolean;
  /** Which source is higher when both exist. */
  lead: "odometer" | "gps" | "tie" | null;
  alertText: string | null;
};

export function buildGpsOdometerCompareModel(
  trip: DriverDisplayDistanceTrip | null | undefined,
  opts?: { gpsOverrideKm?: number | null },
): GpsOdometerCompareModel {
  const odometerKm = resolveDriverOdometerDistanceKm(trip);
  const gpsKm =
    opts?.gpsOverrideKm != null &&
    Number.isFinite(opts.gpsOverrideKm) &&
    opts.gpsOverrideKm > 0
      ? opts.gpsOverrideKm
      : resolveDriverGpsDistanceKm(trip);
  const plannedKm = resolveDriverPlannedDistanceKm(trip);
  const discrepancyKm = computeDistanceDiscrepancy(odometerKm, gpsKm);
  const canCompare = odometerKm != null && gpsKm != null;
  const hasConflict =
    canCompare &&
    discrepancyKm != null &&
    discrepancyKm >= ODOMETER_GPS_CONFLICT_THRESHOLD_KM;

  let lead: GpsOdometerCompareModel["lead"] = null;
  if (canCompare && odometerKm != null && gpsKm != null) {
    if (Math.abs(odometerKm - gpsKm) < 0.05) lead = "tie";
    else lead = odometerKm > gpsKm ? "odometer" : "gps";
  }

  let alertText: string | null = null;
  if (hasConflict && discrepancyKm != null) {
    const higher =
      lead === "odometer" ? "Odometer" : lead === "gps" ? "GPS" : "Sources";
    alertText = `${higher} is higher by ${formatKmShort(discrepancyKm)} — review before settling.`;
  } else if (canCompare && discrepancyKm != null && discrepancyKm < ODOMETER_GPS_CONFLICT_THRESHOLD_KM) {
    alertText = `GPS and odometer align (Δ ${formatKmShort(discrepancyKm)}).`;
  } else if (odometerKm != null && gpsKm == null) {
    alertText = "GPS track pending — odometer captured.";
  } else if (gpsKm != null && odometerKm == null) {
    alertText = "GPS tracked — enter start/end odometer to compare.";
  }

  return {
    odometerKm,
    gpsKm,
    plannedKm,
    discrepancyKm,
    hasConflict,
    canCompare,
    lead,
    alertText,
  };
}

function formatKmShort(v: number): string {
  return `${Number(v).toLocaleString("en-IN", { maximumFractionDigits: 1 })} km`;
}

export function formatDriverDisplayDistanceKm(
  trip: DriverDisplayDistanceTrip | null | undefined,
  opts?: { empty?: string; unit?: "km" | "KM"; fallbackKm?: number | null },
): string {
  const empty = opts?.empty ?? "—";
  const unit = opts?.unit ?? "km";
  const km =
    resolveDriverDisplayDistanceKm(trip) ??
    (opts?.fallbackKm != null &&
    Number.isFinite(opts.fallbackKm) &&
    opts.fallbackKm > 0
      ? opts.fallbackKm
      : null);
  if (km == null) return empty;
  return `${Math.round(km).toLocaleString("en-IN")} ${unit}`;
}

export function formatDriverOfferDistanceKm(
  trip: DriverDisplayDistanceTrip | null | undefined,
  opts?: { empty?: string; unit?: "km" | "KM"; fallbackKm?: number | null },
): string {
  const empty = opts?.empty ?? "—";
  const unit = opts?.unit ?? "km";
  const km = resolveDriverOfferDistanceKm(trip, {
    fallbackKm: opts?.fallbackKm ?? null,
  });
  if (km == null) return empty;
  return `${Math.round(km).toLocaleString("en-IN")} ${unit}`;
}
