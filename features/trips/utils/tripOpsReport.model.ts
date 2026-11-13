/**
 * Trip Ops Excel report — operational columns and field mapping.
 *
 * Used by Trip Ops members on the Trips hub Download button.
 * Sales members use `tripIndentReport` instead — do not mix those column sets.
 *
 * Column contract (20 columns, All Trips sample sheet):
 * - ID ← indent_reference_code | source_indent_code
 * - TRIP ID ← display_trip_id | trip_number | id
 * - LR NO ← trip_documents LR via loadHubPodReceiptFlags
 * - CLIENT ← hub client display name
 * - SOURCE ← pickup_area
 * - DESTINATION ← drop_location
 * - SUPPLIER ← hub party meta displaySupplierName | supplier_name
 * - VEHICLE NO ← vehicle_display_number
 * - DRIVER NAME ← hub party meta displayDriverName | driver_display_name
 * - DRIVER NO ← get_trip_driver_phones | drivers.phone fallback
 * - TRIP STATUS ← hub stage label
 * - KM ← distance | actual/odometer/GPS | odometer delta | card estimate (haversine×1.3)
 * - INDENT DATE ← indent.created_at (enrichment) | trip.created_at fallback
 * - ASSIGNED DATE ← trip_status_audit assigned | created_at
 * - PICKUP ← trip_status_audit in_progress | started_at
 * - IN-TRANSIT ← trip_status_audit in_transit
 * - ETA ← manifest delivery plan estimate
 * - ARRIVED AT DROP OFF ← trip_status_audit at_drop
 * - DELIVERED ← completed_at | trip_status_audit completed
 * - POD soft copy uploaded by ← trip_documents POD uploader display name
 */

import {
  haversineKmBetween,
  inferCoordsFromLocationName,
} from "@/features/trips/components/trip-detail/tripDetail.helpers";
import type { TripRow } from "@/features/trips/services/trips.service";
import type { TripStatusTimesByTripId } from "@/features/trips/services/tripStatusTimes.service";
import { buildManifestDeliveryPlan } from "@/features/trips/utils/manifestDeliveryPlan.util";
import { lookupIndianCityCoordinate } from "@/lib/indianCityCoordinates.util";
import { isUsablePlaceCoordinate } from "@/lib/maps/placeSearch.util";

/** Same road-factor the trip card / TripMap uses when DB km is empty (≈ crow-fly × 1.3). */
const CARD_ROAD_KM_FACTOR = 1.3;

/**
 * Prefer the shared India city table (TripMap), then the small trip-detail
 * helper list. Also try the first comma segment ("Hosur, Tamil Nadu" → Hosur).
 */
export function resolveTripOpsPlaceCoords(
  location: string | null | undefined,
): { latitude: number; longitude: number } | null {
  const raw = (location ?? "").trim();
  if (!raw) return null;
  const direct =
    lookupIndianCityCoordinate(raw) ?? inferCoordsFromLocationName(raw);
  if (direct) return direct;
  const first = raw.split(",")[0]?.trim() ?? "";
  if (!first || first.toLowerCase() === raw.toLowerCase()) return null;
  return (
    lookupIndianCityCoordinate(first) ?? inferCoordsFromLocationName(first)
  );
}

/** Read lat/lon only when both values are real pins (null must not become 0). */
export function readTripOpsLatLon(
  lat: number | string | null | undefined,
  lon: number | string | null | undefined,
): { latitude: number; longitude: number } | null {
  if (lat == null || lon == null || lat === "" || lon === "") return null;
  const latitude = typeof lat === "number" ? lat : Number(lat);
  const longitude = typeof lon === "number" ? lon : Number(lon);
  if (!isUsablePlaceCoordinate(latitude, longitude)) return null;
  return { latitude, longitude };
}

export const TRIP_OPS_REPORT_COLUMNS = [
  { key: "id", label: "ID" },
  { key: "tripId", label: "TRIP ID" },
  { key: "lrNo", label: "LR NO" },
  { key: "client", label: "CLIENT" },
  { key: "source", label: "SOURCE" },
  { key: "destination", label: "DESTINATION" },
  { key: "supplier", label: "SUPPLIER" },
  { key: "vehicleNo", label: "VEHICLE NO" },
  { key: "driverName", label: "DRIVER NAME" },
  { key: "driverNo", label: "DRIVER NO" },
  { key: "tripStatus", label: "TRIP STATUS" },
  { key: "km", label: "KM" },
  { key: "indentDate", label: "INDENT DATE" },
  { key: "assignedDate", label: "ASSIGNED DATE" },
  { key: "pickup", label: "PICKUP" },
  { key: "inTransit", label: "IN-TRANSIT" },
  { key: "eta", label: "ETA" },
  { key: "arrivedAtDrop", label: "ARRIVED AT DROP OFF" },
  { key: "delivered", label: "DELIVERED" },
  { key: "softCopyUploadedBy", label: "POD soft copy uploaded by" },
] as const;

export type TripOpsReportColumnKey = (typeof TRIP_OPS_REPORT_COLUMNS)[number]["key"];

export type TripOpsReportRow = Record<TripOpsReportColumnKey, string | number>;

export type TripOpsReportPartyMeta = {
  displaySupplierName?: string | null;
  displayDriverName?: string | null;
};

export type TripOpsReportEnrichment = {
  /** Earliest status timestamps from trip_status_audit (lowercase trip id). */
  statusTimesByTripId?: TripStatusTimesByTripId;
  /** LR numbers keyed by lowercase trip id. */
  lrNumberByTripId?: Record<string, string>;
  /** Driver phones keyed by trip id (as returned by get_trip_driver_phones). */
  driverPhoneByTripId?: Record<string, string>;
  /** Fallback phones keyed by lowercase driver id. */
  driverPhoneByDriverId?: Map<string, string> | Record<string, string>;
  partyMetaByTripId?: Map<string, TripOpsReportPartyMeta> | Record<string, TripOpsReportPartyMeta>;
  clientNameForTrip?: (trip: TripRow) => string;
  stageLabelForTrip?: (trip: TripRow) => string;
  /** Soft-copy (POD) uploader display name keyed by lowercase trip id. */
  softCopyUploaderByTripId?: Record<string, string>;
  /** Indent created_at ISO keyed by indent id. */
  indentCreatedAtByIndentId?: Record<string, string>;
  /**
   * Optional KM override keyed by lowercase trip id (fresh trips-table
   * distance fetch — fills gaps when hub/RPC rows omit km fields).
   */
  kmByTripId?: Record<string, number | string | null | undefined>;
};

function blank(value: string | null | undefined): string {
  return (value ?? "").trim();
}

/** Match the existing Trip Ops export timestamp style (local en-IN, no forced TZ). */
export function formatTripOpsReportDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function partyMetaFor(
  enrichment: TripOpsReportEnrichment | undefined,
  tripId: string,
): TripOpsReportPartyMeta | undefined {
  const map = enrichment?.partyMetaByTripId;
  if (!map) return undefined;
  if (map instanceof Map) return map.get(tripId);
  return map[tripId];
}

function phoneByDriverId(
  enrichment: TripOpsReportEnrichment | undefined,
  driverId: string,
): string {
  const key = blank(driverId).toLowerCase();
  if (!key) return "";
  const map = enrichment?.driverPhoneByDriverId;
  if (!map) return "";
  if (map instanceof Map) return blank(map.get(key));
  return blank(map[key]);
}

/** Parse km from numeric/string distance fields (e.g. `120`, `"120 km"`). */
export function parseTripOpsKmValue(
  value: string | number | null | undefined,
): number | null {
  if (value == null || value === "") return null;
  const n =
    typeof value === "number"
      ? value
      : Number.parseFloat(String(value).replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** End − start odometer when the computed odometer delta column is empty. */
export function resolveTripOpsOdometerDeltaKm(trip: TripRow): number | null {
  const start = parseTripOpsKmValue(trip.start_odometer_km);
  const end = parseTripOpsKmValue(trip.end_odometer_km);
  if (start == null || end == null) return null;
  const delta = end - start;
  return delta > 0 ? delta : null;
}

/**
 * Card-style km when `trips.distance` is empty: haversine(pickup → drop) × 1.3
 * from real stored pins or inferred / looked-up place names.
 * Never treat null lat/lon as 0 (Number(null) === 0 was wiping estimates).
 */
export function estimateTripOpsReportKmFromRoute(trip: TripRow): number | null {
  const origin =
    readTripOpsLatLon(trip.pickup_lat, trip.pickup_lon) ??
    resolveTripOpsPlaceCoords(trip.pickup_area);
  const destination =
    readTripOpsLatLon(trip.drop_lat, trip.drop_lon) ??
    resolveTripOpsPlaceCoords(trip.drop_location);
  if (!origin || !destination) return null;
  if (
    origin.latitude === destination.latitude &&
    origin.longitude === destination.longitude
  ) {
    return null;
  }
  const crow = haversineKmBetween(origin, destination);
  if (crow == null || crow <= 0) return null;
  return Math.round(crow * CARD_ROAD_KM_FACTOR * 10) / 10;
}

/** Build km from two resolved pins (after geocode). */
export function estimateTripOpsReportKmFromCoords(
  origin: { latitude: number; longitude: number } | null | undefined,
  destination: { latitude: number; longitude: number } | null | undefined,
): number | null {
  if (!origin || !destination) return null;
  if (
    !isUsablePlaceCoordinate(origin.latitude, origin.longitude) ||
    !isUsablePlaceCoordinate(destination.latitude, destination.longitude)
  ) {
    return null;
  }
  if (
    origin.latitude === destination.latitude &&
    origin.longitude === destination.longitude
  ) {
    return null;
  }
  const crow = haversineKmBetween(origin, destination);
  if (crow == null || crow <= 0) return null;
  return Math.round(crow * CARD_ROAD_KM_FACTOR * 10) / 10;
}

/**
 * KM already stored on the trip row (no map / estimate).
 * Matches Manifest Range when `trips.distance` (or odometer/GPS) is filled.
 */
export function resolveTripOpsReportKmFromStored(
  trip: TripRow,
  overrideKm?: string | number | null,
): number | null {
  const candidates: Array<string | number | null | undefined> = [
    overrideKm,
    trip.distance,
    trip.actual_distance_traveled_km,
    trip.odometer_distance_km,
    trip.gps_distance_km,
    resolveTripOpsOdometerDeltaKm(trip),
  ];
  for (const candidate of candidates) {
    const km = parseTripOpsKmValue(candidate);
    if (km != null) return Math.round(km * 10) / 10;
  }
  return null;
}

/**
 * Prefer stored distance, then card-style pickup→drop estimate.
 * Live map road km (Manifest Range via getOptimalRoute) is filled by
 * `loadTripOpsReportKmByTripId` and passed as overrideKm.
 */
export function resolveTripOpsReportKm(
  trip: TripRow,
  overrideKm?: string | number | null,
): number | "" {
  const stored = resolveTripOpsReportKmFromStored(trip, overrideKm);
  if (stored != null) return stored;
  const estimated = estimateTripOpsReportKmFromRoute(trip);
  return estimated != null ? estimated : "";
}

export function buildTripOpsReportRow(
  trip: TripRow,
  enrichment: TripOpsReportEnrichment = {},
): TripOpsReportRow {
  const key = blank(trip.id).toLowerCase();
  const times = enrichment.statusTimesByTripId?.[key] ?? {};
  const meta = partyMetaFor(enrichment, trip.id);
  const km = resolveTripOpsReportKm(trip, enrichment.kmByTripId?.[key]);
  const eta = buildManifestDeliveryPlan({
    tripDistance:
      trip.distance ??
      trip.actual_distance_traveled_km ??
      trip.odometer_distance_km ??
      enrichment.kmByTripId?.[key],
    startedAt: trip.started_at,
    pickupAt: trip.pickup_date,
    createdAt: trip.created_at,
  }).estimatedDeliveryAt;
  const indentId = blank(trip.indent_id) || blank(trip.source_indent_id);
  const indentCreatedAt = indentId
    ? enrichment.indentCreatedAtByIndentId?.[indentId]
    : undefined;

  return {
    id: blank(trip.indent_reference_code) || blank(trip.source_indent_code),
    tripId: blank(trip.display_trip_id) || blank(trip.trip_number) || blank(trip.id),
    lrNo: blank(enrichment.lrNumberByTripId?.[key]),
    client: blank(enrichment.clientNameForTrip?.(trip)),
    source: blank(trip.pickup_area),
    destination: blank(trip.drop_location),
    supplier: blank(meta?.displaySupplierName) || blank(trip.supplier_name),
    vehicleNo: blank(trip.vehicle_display_number),
    driverName: blank(meta?.displayDriverName) || blank(trip.driver_display_name),
    driverNo:
      blank(enrichment.driverPhoneByTripId?.[trip.id]) ||
      phoneByDriverId(enrichment, trip.driver_id ?? ""),
    tripStatus: blank(enrichment.stageLabelForTrip?.(trip)),
    km,
    indentDate: formatTripOpsReportDateTime(indentCreatedAt ?? trip.created_at),
    assignedDate: formatTripOpsReportDateTime(times.assigned ?? trip.created_at),
    pickup: formatTripOpsReportDateTime(times.in_progress ?? trip.started_at),
    inTransit: formatTripOpsReportDateTime(times.in_transit),
    eta: eta ? formatTripOpsReportDateTime(eta.toISOString()) : "",
    arrivedAtDrop: formatTripOpsReportDateTime(times.at_drop),
    delivered: formatTripOpsReportDateTime(trip.completed_at ?? times.completed),
    softCopyUploadedBy: blank(enrichment.softCopyUploaderByTripId?.[key]),
  };
}

export function buildTripOpsReportRows(
  trips: readonly TripRow[],
  enrichment: TripOpsReportEnrichment = {},
): TripOpsReportRow[] {
  return trips.map((trip) => buildTripOpsReportRow(trip, enrichment));
}

export function tripOpsReportFileName(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `Pulse_Trip_Report_${y}-${m}-${d}.xlsx`;
}
