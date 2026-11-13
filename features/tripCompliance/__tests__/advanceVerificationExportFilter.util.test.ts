import {
  advanceVerificationExportSummaries,
  countAdvanceVerificationExport,
} from "@/features/tripCompliance/utils/complianceExportReport.util";
import type { ComplianceTripSummary } from "@/features/tripCompliance/tripCompliance.types";

const at = "2026-11-10T10:00:00Z";

function trip(id: string, extra: Partial<ComplianceTripSummary>): ComplianceTripSummary {
  return {
    trip: { id },
    stage: "compliance_verified",
    complianceVerifiedAt: at,
    complianceDeclinedAt: null,
    financeVerifiedAt: null,
    advance: null,
    balance: null,
    documentCounts: { total: 1, verified: 1, rejected: 0, pending: 0 },
    ...extra,
  } as unknown as ComplianceTripSummary;
}

describe("Advance Verification export filter", () => {
  const rows = [
    trip("verified", {}),
    // Verified, hard-copy POD in: card shows the blue "Balance Pending" pill.
    trip("balance", { stage: "balance_pending", hardCopyPod: { received: true } } as Partial<ComplianceTripSummary>),
    // Finance verified: left the tab.
    trip("finance", { financeVerifiedAt: at }),
  ];

  it("counts each option", () => {
    expect(countAdvanceVerificationExport(rows)).toEqual({ all: 2, verified: 1, balance_pending: 1 });
  });

  it("returns trips for the chosen option", () => {
    const ids = (filter: "all" | "verified" | "balance_pending") =>
      advanceVerificationExportSummaries(rows, filter).map((s) => s.trip.id);
    expect(ids("all")).toEqual(["verified", "balance"]);
    expect(ids("verified")).toEqual(["verified"]);
    expect(ids("balance_pending")).toEqual(["balance"]);
  });
});
