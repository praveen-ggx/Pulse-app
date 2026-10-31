/**
 * Trip Ops Excel report — classic operational columns and field mapping.
 *
 * Used by Trip Ops members on the Trips hub Download button (and the Trips
 * Export modal). Sales members use `tripIndentReport` instead — do not mix
 * those column sets.
 *
 * Field sources (DB / derived):
 * - TRIP ID ← display_trip_id | trip_number | id
 * - LR NO ← trip_documents LR via loadHubPodReceiptFlags
 * - CLIENT ← hub client display name
 * - SOURCE ← pickup_area
 * - DESTINATION ← drop_location
 * - SUPPLIER ← hub party meta displaySupplierName | supplier_name
 * - VEHICLE NO ← vehicle_display_number
 * - DRIVER ← hub party meta displayDriverName | driver_display_name
 * - DRIVER NO ← get_trip_driver_phones | drivers.phone fallback
 * - STATUS ← hub stage label
 * - Km ← distance | actual_distance_traveled_km
 * - Indent ← indent_reference_code | source_indent_code
 * - ASSIGNED ← trip_status_audit status_to=assigned | created_at
 * - PICKUP ← trip_status_audit in_progress | started_at
 * - IN-TRANSIT ← trip_status_audit in_transit
 * - ETA ← manifest delivery plan estimate
 * - ARRIVED AT DROP OFF ← trip_status_audit at_drop
 * - DELIVERED ← completed_at | trip_status_audit completed
 */

import type { TripRow } from "@/features/trips/services/trips.service";
import type { TripStatusTimesByTripId } from "@/features/trips/services/tripStatusTimes.service";
import { buildManifestDeliveryPlan } from "@/features/trips/utils/manifestDeliveryPlan.util";

export const TRIP_OPS_REPORT_COLUMNS = [
  { key: "tripId", label: "TRIP ID" },
  { key: "lrNo", label: "LR NO" },
  { key: "client", label: "CLIENT" },
  { key: "source", label: "SOURCE" },
  { key: "destination", label: "DESTINATION" },
  { key: "supplier", label: "SUPPLIER" },
  { key: "vehicleNo", label: "VEHICLE NO" },
  { key: "driver", label: "DRIVER" },
  { key: "driverNo", label: "DRIVER NO" },
  { key: "status", label: "STATUS" },
  { key: "km", label: "Km" },
  { key: "indent", label: "Indent" },
  { key: "assigned", label: "ASSIGNED" },
  { key: "pickup", label: "PICKUP" },
  { key: "inTransit", label: "IN-TRANSIT" },
  { key: "eta", label: "ETA" },
  { key: "arrivedAtDrop", label: "ARRIVED AT DROP OFF" },
  { key: "delivered", label: "DELIVERED" },
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

export function buildTripOpsReportRow(
  trip: TripRow,
  enrichment: TripOpsReportEnrichment = {},
): TripOpsReportRow {
  const key = blank(trip.id).toLowerCase();
  const times = enrichment.statusTimesByTripId?.[key] ?? {};
  const meta = partyMetaFor(enrichment, trip.id);
  const km = Number(trip.distance ?? trip.actual_distance_traveled_km);
  const eta = buildManifestDeliveryPlan({
    tripDistance: trip.distance,
    startedAt: trip.started_at,
    pickupAt: trip.pickup_date,
    createdAt: trip.created_at,
  }).estimatedDeliveryAt;

  return {
    tripId: blank(trip.display_trip_id) || blank(trip.trip_number) || blank(trip.id),
    lrNo: blank(enrichment.lrNumberByTripId?.[key]),
    client: blank(enrichment.clientNameForTrip?.(trip)),
    source: blank(trip.pickup_area),
    destination: blank(trip.drop_location),
    supplier:
      blank(meta?.displaySupplierName) || blank(trip.supplier_name),
    vehicleNo: blank(trip.vehicle_display_number),
    driver:
      blank(meta?.displayDriverName) || blank(trip.driver_display_name),
    driverNo:
      blank(enrichment.driverPhoneByTripId?.[trip.id]) ||
      phoneByDriverId(enrichment, trip.driver_id ?? ""),
    status: blank(enrichment.stageLabelForTrip?.(trip)),
    km: Number.isFinite(km) && km > 0 ? km : "",
    indent:
      blank(trip.indent_reference_code) || blank(trip.source_indent_code),
    assigned: formatTripOpsReportDateTime(times.assigned ?? trip.created_at),
    pickup: formatTripOpsReportDateTime(times.in_progress ?? trip.started_at),
    inTransit: formatTripOpsReportDateTime(times.in_transit),
    eta: eta ? formatTripOpsReportDateTime(eta.toISOString()) : "",
    arrivedAtDrop: formatTripOpsReportDateTime(times.at_drop),
    delivered: formatTripOpsReportDateTime(trip.completed_at ?? times.completed),
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
