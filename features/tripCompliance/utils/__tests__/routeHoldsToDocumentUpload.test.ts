import type { ComplianceTripSummary } from "@/features/tripCompliance/tripCompliance.types";
import { routeHoldsToDocumentUpload } from "@/features/tripCompliance/utils/complianceTableStatus.util";

const trip = (over: Partial<ComplianceTripSummary>): ComplianceTripSummary =>
  ({
    tripId: "t",
    stage: "compliance_pending",
    complianceVerifiedAt: null,
    complianceDeclinedAt: null,
    complianceResubmittedAt: null,
    ...over,
  }) as unknown as ComplianceTripSummary;

describe("routeHoldsToDocumentUpload (Ground Ops view)", () => {
  it("moves a compliance hold with every file on it into Document Upload", () => {
    const [out] = routeHoldsToDocumentUpload([
      trip({ complianceDeclinedAt: "2026-10-12T07:55:20Z" }),
    ]);
    expect(out.stage).toBe("pending_for_docs");
  });

  it("moves an active Finance reject out of the Finance lanes", () => {
    const [out] = routeHoldsToDocumentUpload([
      trip({
        stage: "compliance_verified",
        complianceVerifiedAt: "2026-10-10T10:00:00Z",
        complianceDeclinedAt: "2026-10-11T10:00:00Z",
      }),
    ]);
    expect(out.stage).toBe("pending_for_docs");
  });

  it("leaves resubmitted holds and normal trips where they are", () => {
    const input = [
      trip({ complianceDeclinedAt: "2026-10-12T07:00:00Z", complianceResubmittedAt: "2026-10-12T09:00:00Z" }),
      trip({ stage: "compliance_verified", complianceVerifiedAt: "2026-10-10T10:00:00Z" }),
      trip({}),
    ];
    const out = routeHoldsToDocumentUpload(input);
    expect(out.map((s) => s.stage)).toEqual(["compliance_pending", "compliance_verified", "compliance_pending"]);
    expect(out).toBe(input);
  });
});
