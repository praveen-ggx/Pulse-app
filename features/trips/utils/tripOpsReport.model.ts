/**
 * Trip Ops Excel report — operational columns and field mapping.
 *
 * Used by Trip Ops members on the Trips hub Download button.
 * Sales members use `tripIndentReport` instead — do not mix those column sets.
 *
 * Column contract (12 columns, matching the ops reference sheet):
 * - SR ID ← indent_reference_code | source_indent_code (sales/sourcing reference)
 * - TRIP ID ← display_trip_id | trip_number | id
 * - LR NO ← trip_documents LR via loadHubPodReceiptFlags
 * - CLIENT ← hub client display name
 * - SOURCE ← pickup_area
 * - DESTINATION ← drop_location
 * - SUPPLIER ← hub party meta displaySupplierName | supplier_name
 * - TRIP STATUS ← hub stage label
 * - ASSIGNED DATE ← trip_status_audit status_to=assigned | created_at
 * - PICKUP ← trip_status_audit in_progress | started_at
 * - ARRIVED AT DROP ← trip_status_audit at_drop
 * - SOFT COPY UPLOADED BY ← trip_documents pod/soft_pod uploaded_by → profiles.full_name
 */

import type { TripRow } from "@/features/trips/services/trips.service";
import type { TripStatusTimesByTripId } from "@/features/trips/services/tripStatusTimes.service";

export const TRIP_OPS_REPORT_COLUMNS = [
  { key: "srId", label: "SR ID" },
  { key: "tripId", label: "TRIP ID" },
  { key: "lrNo", label: "LR NO" },
  { key: "client", label: "CLIENT" },
  { key: "source", label: "SOURCE" },
  { key: "destination", label: "DESTINATION" },
  { key: "supplier", label: "SUPPLIER" },
  { key: "tripStatus", label: "TRIP STATUS" },
  { key: "assignedDate", label: "ASSIGNED DATE" },
  { key: "pickup", label: "PICKUP" },
  { key: "arrivedAtDrop", label: "ARRIVED AT DROP" },
  { key: "softCopyUploadedBy", label: "SOFT COPY UPLOADED BY" },
] as const;

export type TripOpsReportColumnKey = (typeof TRIP_OPS_REPORT_COLUMNS)[number]["key"];

export type TripOpsReportRow = Record<TripOpsReportColumnKey, string | number>;

export type TripOpsReportPartyMeta = {
  displaySupplierName?: string | null;
  displayDriverName?: string | null;
};

export type TripOpsReportEnrichment = {
  statusTimesByTripId?: TripStatusTimesByTripId;
  lrNumberByTripId?: Record<string, string>;
  partyMetaByTripId?: Map<string, TripOpsReportPartyMeta> | Record<string, TripOpsReportPartyMeta>;
  clientNameForTrip?: (trip: TripRow) => string;
  stageLabelForTrip?: (trip: TripRow) => string;
  /** Soft-copy (POD) uploader display name keyed by lowercase trip id. */
  softCopyUploaderByTripId?: Record<string, string>;
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

export function buildTripOpsReportRow(
  trip: TripRow,
  enrichment: TripOpsReportEnrichment = {},
): TripOpsReportRow {
  const key = blank(trip.id).toLowerCase();
  const times = enrichment.statusTimesByTripId?.[key] ?? {};
  const meta = partyMetaFor(enrichment, trip.id);

  return {
    srId: blank(trip.indent_reference_code) || blank(trip.source_indent_code),
    tripId: blank(trip.display_trip_id) || blank(trip.trip_number) || blank(trip.id),
    lrNo: blank(enrichment.lrNumberByTripId?.[key]),
    client: blank(enrichment.clientNameForTrip?.(trip)),
    source: blank(trip.pickup_area),
    destination: blank(trip.drop_location),
    supplier:
      blank(meta?.displaySupplierName) || blank(trip.supplier_name),
    tripStatus: blank(enrichment.stageLabelForTrip?.(trip)),
    assignedDate: formatTripOpsReportDateTime(times.assigned ?? trip.created_at),
    pickup: formatTripOpsReportDateTime(times.in_progress ?? trip.started_at),
    arrivedAtDrop: formatTripOpsReportDateTime(times.at_drop),
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
