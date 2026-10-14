/**
 * Ops → Compliance queue membership.
 *
 * Same trip catalog as `/trips` (`getTripsForOrg` / `useTripsQuery`), then keep
 * only Loading → In Transit → Unloading → Delivered/Completed.
 * Indent / Unassigned / Assigned / cancelled stay out.
 *
 * Uses an explicit status allowlist (no classifyTripMetric fallback) so unknown
 * statuses cannot silently inflate the queue.
 */
import type { TripRow } from "@/features/trips/services/trips.service";
import { isTripCancelledForHub } from "@/features/trips/utils/tripHubMetrics";

const LOADING_STATUSES = new Set(["in_progress", "picked_up", "pickup", "loading"]);
const IN_TRANSIT_STATUSES = new Set(["in_transit", "transit", "dispatched"]);
const UNLOADING_OR_DELIVERED_DOCS_STATUSES = new Set([
  "at_drop",
  "unloading",
  "arrived",
  "at_destination",
]);
const COMPLETED_STATUSES = new Set(["delivered", "completed", "done"]);

function normStatus(status: string | null | undefined): string {
  return String(status ?? "")
    .trim()
    .toLowerCase();
}

export function isCompletedDeliveredStatus(status: string | null | undefined): boolean {
  return COMPLETED_STATUSES.has(normStatus(status));
}

/**
 * Pending Docs transit subtabs — ops `trips.status` only (no writes).
 * Delivered = completed/delivered/done; everything else in the queue is In-transit.
 */
export function isPendingDocsDeliveredTrip(summary: {
  trip: { status?: string | null };
}): boolean {
  return isCompletedDeliveredStatus(summary.trip.status);
}

export function isPendingDocsInTransitTrip(summary: {
  trip: { status?: string | null };
}): boolean {
  return !isPendingDocsDeliveredTrip(summary);
}

export function isComplianceOpsPipelineTrip(trip: TripRow): boolean {
  if (isTripCancelledForHub(trip.status)) return false;

  const status = normStatus(trip.status);

  // Ops Delivered tile includes History completed/delivered (driver optional).
  if (COMPLETED_STATUSES.has(status)) return true;

  const hasDriver = trip.driver_id != null && String(trip.driver_id).trim() !== "";
  if (!hasDriver) return false;

  return (
    LOADING_STATUSES.has(status) ||
    IN_TRANSIT_STATUSES.has(status) ||
    UNLOADING_OR_DELIVERED_DOCS_STATUSES.has(status)
  );
}

/** Filter the `/trips` catalog down to the compliance document queue. */
export function selectCompliancePipelineTrips(trips: readonly TripRow[]): TripRow[] {
  return trips.filter(isComplianceOpsPipelineTrip);
}
