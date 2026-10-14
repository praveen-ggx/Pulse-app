import type { TripRow } from "@/features/trips/services/trips.service";

/**
 * Active Trips Control buckets (disjoint). Completed trips belong on the History tab only.
 *
 * End-of-run (drop-off) lane:
 * - `unloading`: explicit `unloading` / `arrived` / `at_destination` without doc, or `at_drop` without doc (drop-off, POD not on file yet).
 * - `delivered_docs_pending`: at destination with at least one `trip_documents` row (proof on file; trip still open / docs).
 */
/**
 * `indent` is the FIRST stage of this same lifecycle, not a separate branch:
 * a requirement starts as an INDENT, crosses the allocation boundary
 * (`trips.indent_id` gets set — see `isIndentUnallocated` in
 * `features/network/utils/loadCenter.model.ts`) and becomes an actual trip,
 * landing on UNASSIGNED, then progresses through the stages below exactly
 * as it always has. Because an indent record and a trip record are
 * different tables, `classifyTripMetric`/`countTripsByMetric` (which only
 * ever look at real trip rows) cannot themselves place something into
 * `"indent"` — the caller (TripsScreen) fills that one count in from the
 * indents list before this same lifecycle rail renders it as stage one.
 */
export type TripMetricId =
  | "indent"
  | "unassigned"
  | "assigned"
  | "loading"
  | "in_transit"
  | "unloading"
  | "delivered_docs_pending";

export const TRIP_METRIC_ORDER: TripMetricId[] = [
  "indent",
  "unassigned",
  "assigned",
  "loading",
  "in_transit",
  "unloading",
  "delivered_docs_pending",
];

function normStatus(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase();
}

export function isTripCancelledForHub(status: string | null | undefined): boolean {
  return normStatus(status) === "cancelled";
}

/** History / completed statuses that the Active Delivered tile always includes. */
export function isCompletedTripStatus(status: string | null | undefined): boolean {
  const s = normStatus(status);
  return s === "completed" || s === "delivered" || s === "done";
}

/**
 * Trip Operations → Delivered.
 * Completed/delivered/done trips, plus at-destination trips that already have a
 * soft POD on file. Compliance → Awaiting POD lists this set in parallel
 * with Pending Docs and Compliance Pending until hard-copy is marked.
 */
export function isOperationsDeliveredTrip(
  trip: Pick<TripRow, "id" | "status" | "driver_id">,
  hasSoftPod: boolean,
): boolean {
  if (isTripCancelledForHub(trip.status)) return false;
  if (isCompletedTripStatus(trip.status)) return true;
  if (!hasSoftPod) return false;
  return (
    classifyTripMetric(trip as TripRow, new Set([trip.id])) === "delivered_docs_pending"
  );
}

export function classifyTripMetric(
  trip: TripRow,
  tripIdsWithAnyDocument: Set<string>,
): TripMetricId {
  const s = normStatus(trip.status);
  const hasDriver = trip.driver_id != null && String(trip.driver_id).trim() !== "";

  if (!hasDriver || s === "cancelled") return "unassigned";

  if (s === "at_drop") {
    return tripIdsWithAnyDocument.has(trip.id)
      ? "delivered_docs_pending"
      : "unloading";
  }

  if (s === "unloading" || s === "arrived" || s === "at_destination") {
    return tripIdsWithAnyDocument.has(trip.id)
      ? "delivered_docs_pending"
      : "unloading";
  }

  if (
    s === "in_transit" ||
    s === "dispatched" ||
    s === "transit"
  ) {
    return "in_transit";
  }

  if (
    s === "picked_up" ||
    s === "pickup" ||
    s === "in_progress"
  ) {
    // `in_progress` means arrived at pickup / loading, even after started_at is
    // set — matches driver app's own step model (deriveDriverFlowStepFromTrip).
    // Only an explicit `in_transit` status means the driver has departed pickup.
    return "loading";
  }

  if (s === "assigned") {
    return "assigned";
  }

  if (s === "draft") return "unassigned";

  return "loading";
}

export function countTripsByMetric(
  trips: TripRow[],
  tripIdsWithAnyDocument: Set<string>,
): Record<TripMetricId, number> {
  const counts: Record<TripMetricId, number> = {
    // Populated by the caller from the indents list (see file-header note),
    // never by classifyTripMetric — an actual trip is never "indent".
    indent: 0,
    unassigned: 0,
    assigned: 0,
    loading: 0,
    in_transit: 0,
    unloading: 0,
    delivered_docs_pending: 0,
  };
  for (const t of trips) {
    const m = classifyTripMetric(t, tripIdsWithAnyDocument);
    counts[m] += 1;
  }
  return counts;
}
