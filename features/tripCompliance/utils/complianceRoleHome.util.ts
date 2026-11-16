import type { ComplianceQueueFilter } from "@/features/tripCompliance/tripCompliance.types";

/**
 * Stage the Compliance desk opens on. All stays available, but it is not a home:
 * each grant lands on the queue that person works.
 */
const ROLE_STAGE_ORDER = [
  "pending_for_docs",
  "compliance_pending",
  "compliance_verified",
  "finance_verified",
  "advance_payment_processed",
  "hard_copy_pod_received",
  "pod_received",
  "balance_pending",
  "payment_settled",
] as const satisfies readonly ComplianceQueueFilter[];

export type ComplianceRoleHomeInput = {
  debitControlOnly: boolean;
  canVerifyDocuments: boolean;
  canMarkVerified: boolean;
  canViewDocuments: boolean;
  canResubmit: boolean;
  canTabAdvanceVerification: boolean;
  canTabAdvancePayment: boolean;
  canTabSettlementVerification: boolean;
  canTabFinalSettlement: boolean;
  canManagePod: boolean;
  visible: ReadonlySet<ComplianceQueueFilter>;
};

function firstOpenStage(visible: ReadonlySet<ComplianceQueueFilter>): ComplianceQueueFilter | null {
  for (const stage of ROLE_STAGE_ORDER) {
    if (visible.has(stage)) return stage;
  }
  return null;
}

function pick(
  visible: ReadonlySet<ComplianceQueueFilter>,
  stage: ComplianceQueueFilter,
): ComplianceQueueFilter | null {
  return visible.has(stage) ? stage : firstOpenStage(visible);
}

export function complianceRoleHomeStage(
  input: ComplianceRoleHomeInput,
): ComplianceQueueFilter | null {
  if (input.visible.size === 0) return null;
  if (input.debitControlOnly) return pick(input.visible, "hard_copy_pod_received");
  if (input.canVerifyDocuments || input.canMarkVerified) {
    return pick(input.visible, "compliance_pending");
  }
  if (input.canTabAdvanceVerification) return pick(input.visible, "compliance_verified");
  if (input.canTabAdvancePayment) return pick(input.visible, "finance_verified");
  if (input.canTabSettlementVerification) return pick(input.visible, "balance_pending");
  if (input.canTabFinalSettlement) return pick(input.visible, "payment_settled");
  if (input.canManagePod) return pick(input.visible, "hard_copy_pod_received");
  if (input.canViewDocuments || input.canResubmit) return pick(input.visible, "pending_for_docs");
  return firstOpenStage(input.visible);
}
