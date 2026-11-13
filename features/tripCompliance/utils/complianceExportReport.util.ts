import type { ComplianceTripSummary } from "@/features/tripCompliance/tripCompliance.types";
import {
  isComplianceVerifiedRejected,
  paymentStatusVisual,
  shouldShowPaymentStatusPill,
} from "@/features/tripCompliance/utils/complianceCardVisual.util";
import {
  isCompliancePaymentPending,
  isComplianceVerifiedQueue,
} from "@/features/tripCompliance/utils/complianceReadiness.util";

/** Export Report filter on the Advance Verification tab. */
export type AdvanceVerificationExportFilter = "all" | "verified" | "balance_pending";

/** Same rule as the Advance Verification tab list (useComplianceStageFilter). */
export function isAdvanceVerificationTabTrip(summary: ComplianceTripSummary): boolean {
  return (
    !summary.financeVerifiedAt &&
    (isComplianceVerifiedQueue(summary) || isCompliancePaymentPending(summary))
  );
}

/** Card's top-right pill reads "Balance Pending" (blue). */
export function showsBalancePendingPill(summary: ComplianceTripSummary): boolean {
  return shouldShowPaymentStatusPill(summary) && paymentStatusVisual(summary).label === "Balance Pending";
}

/** Advance Verification trips for the chosen export filter. */
export function advanceVerificationExportSummaries(
  summaries: ComplianceTripSummary[] | null | undefined,
  filter: AdvanceVerificationExportFilter,
): ComplianceTripSummary[] {
  const tab = (summaries ?? []).filter(isAdvanceVerificationTabTrip);
  if (filter === "balance_pending") return tab.filter(showsBalancePendingPill);
  if (filter === "verified") return tab.filter((summary) => !showsBalancePendingPill(summary));
  return tab;
}

/** Counts per export filter option. */
export function countAdvanceVerificationExport(
  summaries: ComplianceTripSummary[] | null | undefined,
): Record<AdvanceVerificationExportFilter, number> {
  const tab = (summaries ?? []).filter(isAdvanceVerificationTabTrip);
  const balancePending = tab.filter(showsBalancePendingPill).length;
  return { all: tab.length, verified: tab.length - balancePending, balance_pending: balancePending };
}

/** Trips currently sitting in the Verified stage chip. */
export function verifiedStageSummaries(summaries: ComplianceTripSummary[]): ComplianceTripSummary[] {
  return summaries.filter(isComplianceVerifiedQueue);
}

/** Present documents on Verified-stage trips — what Export Report can download. */
export function countVerifiedStageDocuments(summaries: ComplianceTripSummary[]): number {
  return verifiedStageSummaries(summaries).reduce(
    (total, summary) => total + (summary.documentCounts?.total ?? 0),
    0,
  );
}

/** Verified-stage trips split the same way as the card pill (Rejected = verified + Reject remark). */
export function countVerifiedStageTrips(summaries: ComplianceTripSummary[]): {
  verified: number;
  rejected: number;
  total: number;
} {
  const stage = verifiedStageSummaries(summaries);
  const rejected = stage.filter(isComplianceVerifiedRejected).length;
  return { verified: stage.length - rejected, rejected, total: stage.length };
}

export function formatVerifiedStageExportCopy(documentCount: number): string {
  const count = Math.max(0, Math.floor(documentCount));
  return `${count} document${count === 1 ? "" : "s"} ready to be downloaded`;
}
