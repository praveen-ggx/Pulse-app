import { complianceRoleHomeStage } from "@/features/tripCompliance/utils/complianceRoleHome.util";
import type { ComplianceQueueFilter } from "@/features/tripCompliance/tripCompliance.types";

const ALL = new Set<ComplianceQueueFilter>([
  "all",
  "pending_for_docs",
  "compliance_pending",
  "compliance_verified",
  "finance_verified",
  "hard_copy_pod_received",
  "pod_received",
  "balance_pending",
  "payment_settled",
]);

const base = {
  debitControlOnly: false,
  canVerifyDocuments: false,
  canMarkVerified: false,
  canViewDocuments: false,
  canResubmit: false,
  canTabAdvanceVerification: false,
  canTabAdvancePayment: false,
  canTabSettlementVerification: false,
  canTabFinalSettlement: false,
  canManagePod: false,
  visible: ALL,
};

describe("complianceRoleHomeStage", () => {
  it("opens Compliance Verification for a verifier, not All", () => {
    expect(
      complianceRoleHomeStage({
        ...base,
        canVerifyDocuments: true,
        canViewDocuments: true,
        canMarkVerified: true,
      }),
    ).toBe("compliance_pending");
  });

  it("opens Document Upload for ground ops", () => {
    expect(
      complianceRoleHomeStage({
        ...base,
        canViewDocuments: true,
        canResubmit: true,
        visible: new Set(["all", "pending_for_docs"]),
      }),
    ).toBe("pending_for_docs");
  });

  it("opens Advance Verification for finance, even when they can view documents", () => {
    expect(
      complianceRoleHomeStage({
        ...base,
        canViewDocuments: true,
        canTabAdvanceVerification: true,
        canTabAdvancePayment: true,
      }),
    ).toBe("compliance_verified");
  });

  it("opens Awaiting POD for debit control", () => {
    expect(
      complianceRoleHomeStage({
        ...base,
        debitControlOnly: true,
        canManagePod: true,
        visible: new Set(["hard_copy_pod_received", "pod_received"]),
      }),
    ).toBe("hard_copy_pod_received");
  });
});
