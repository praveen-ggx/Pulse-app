import type { ComplianceTripSummary } from "@/features/tripCompliance/tripCompliance.types";
import { isComplianceVerifiedRejected } from "@/features/tripCompliance/utils/complianceCardVisual.util";
import { isComplianceVerifiedQueue } from "@/features/tripCompliance/utils/complianceReadiness.util";

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
