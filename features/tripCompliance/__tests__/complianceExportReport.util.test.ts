import {
  countVerifiedStageDocuments,
  countVerifiedStageTrips,
  formatVerifiedStageExportCopy,
  verifiedStageSummaries,
} from "@/features/tripCompliance/utils/complianceExportReport.util";
import type { ComplianceTripSummary } from "@/features/tripCompliance/tripCompliance.types";

function summary(
  stage: ComplianceTripSummary["stage"],
  total: number,
): ComplianceTripSummary {
  return {
    stage,
    documentCounts: { total, verified: total, rejected: 0, pending: 0 },
  } as ComplianceTripSummary;
}

describe("complianceExportReport.util", () => {
  it("filters Verified-stage trips only", () => {
    const rows = [
      summary("compliance_verified", 4),
      summary("compliance_pending", 2),
      summary("pending_for_docs", 1),
    ];
    expect(verifiedStageSummaries(rows)).toHaveLength(1);
    expect(countVerifiedStageDocuments(rows)).toBe(4);
  });

  it("counts verified and rejected trips in the Verified stage only", () => {
    const at = "2026-09-28T10:00:00Z";
    const later = "2026-09-28T12:00:00Z";
    const rows = [
      { stage: "compliance_verified", complianceVerifiedAt: at, complianceDeclinedAt: null },
      { stage: "compliance_verified", complianceVerifiedAt: at, complianceDeclinedAt: null },
      // Post-verify finance decline leaves Verified (Declined chip / PD·CP subtabs).
      { stage: "compliance_verified", complianceVerifiedAt: at, complianceDeclinedAt: later },
      { stage: "compliance_pending", complianceVerifiedAt: null, complianceDeclinedAt: at },
    ] as ComplianceTripSummary[];
    expect(countVerifiedStageTrips(rows)).toEqual({ verified: 2, rejected: 0, total: 2 });
    expect(countVerifiedStageTrips([])).toEqual({ verified: 0, rejected: 0, total: 0 });
  });

  it("sums present documents across verified trips", () => {
    const rows = [summary("compliance_verified", 5), summary("compliance_verified", 2)];
    expect(countVerifiedStageDocuments(rows)).toBe(7);
    expect(formatVerifiedStageExportCopy(7)).toBe("7 documents ready to be downloaded");
    expect(formatVerifiedStageExportCopy(1)).toBe("1 document ready to be downloaded");
  });
});
