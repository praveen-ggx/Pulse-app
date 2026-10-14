/**
 * Advance Processed queue order: most recently posted advance first so the trip
 * Ops just confirmed rises to the top of Cards, Table, and Export Report.
 * Other Compliance stages keep their own date sort.
 */
import type { ComplianceTripSummary } from "@/features/tripCompliance/tripCompliance.types";

/** Prefer ledger `created_at` (when Compliance posted); fall back to Paid at day. */
export function advanceProcessedSortMs(
  summary: ComplianceTripSummary,
): number | null {
  const raw =
    summary.advance?.postedAt?.trim() ||
    summary.advance?.paidAt?.trim() ||
    null;
  if (!raw) return null;
  const ms = Date.parse(raw);
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Newest advance posting first. Trips without a usable advance timestamp stay last.
 * Stable tie-break on trip id.
 */
export function compareComplianceSummariesByAdvanceProcessed(
  a: ComplianceTripSummary,
  b: ComplianceTripSummary,
): number {
  const da = advanceProcessedSortMs(a);
  const db = advanceProcessedSortMs(b);
  if (da == null && db == null) {
    return a.trip.id.localeCompare(b.trip.id);
  }
  if (da == null) return 1;
  if (db == null) return -1;
  if (da !== db) return db - da;
  return a.trip.id.localeCompare(b.trip.id);
}

export function sortAdvanceProcessedSummaries(
  rows: ComplianceTripSummary[],
): ComplianceTripSummary[] {
  return [...rows].sort(compareComplianceSummariesByAdvanceProcessed);
}
