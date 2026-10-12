import type { ComplianceDocRow } from "@/features/tripCompliance/utils/complianceDocumentRows.util";

export function canModerateComplianceRow(row: ComplianceDocRow, scope: "trip" | "vehicle" | "driver"): boolean {
  if (row.status === "missing") return false;
  if (scope === "trip") return Boolean(row.doc);
  // Driver KYC / supplier bank proof is moderated elsewhere; vehicle vault can Approve but not Decline.
  if (row.entityDoc?.source === "driver-kyc" || row.entityDoc?.source === "supplier-kyc") return false;
  return Boolean(row.entityDoc);
}

/**
 * Approve/Decline on uploaded docs.
 * Missing files must be uploaded first.
 * After a decision the footer reflects it: verified → Approve locked as “Approved”
 * (Decline still reverses); rejected → Decline locked as “Declined” (Approve reopens).
 */
export function complianceReviewDecisionActions(row: ComplianceDocRow): { canApprove: boolean; canDecline: boolean } {
  if (row.status === "missing") {
    return { canApprove: false, canDecline: false };
  }
  const vaultOnly = row.entityDoc?.source === "vehicle-vault";
  if (row.status === "verified") {
    return { canApprove: false, canDecline: !vaultOnly };
  }
  if (row.status === "rejected") {
    return { canApprove: true, canDecline: false };
  }
  return {
    canApprove: true,
    canDecline: !vaultOnly,
  };
}

/** Footer labels/styles for the active preview doc (includes optimistic overlay). */
export function complianceDecisionButtonState(row: ComplianceDocRow | null | undefined): {
  approveLabel: "Approve" | "Approved";
  declineLabel: "Decline" | "Declined";
  approveActive: boolean;
  declineActive: boolean;
} {
  const status = row?.status;
  if (status === "verified") {
    return {
      approveLabel: "Approved",
      declineLabel: "Decline",
      approveActive: true,
      declineActive: false,
    };
  }
  if (status === "rejected") {
    return {
      approveLabel: "Approve",
      declineLabel: "Declined",
      approveActive: false,
      declineActive: true,
    };
  }
  return {
    approveLabel: "Approve",
    declineLabel: "Decline",
    approveActive: false,
    declineActive: false,
  };
}

/**
 * Group Approve/Decline appears only after every doc in the group is uploaded,
 * and at least one still needs a decision (pending / rejected / expired).
 */
export function complianceGroupDecisionActions(
  groupRows: ComplianceDocRow[],
  scope: "trip" | "vehicle" | "driver",
): { ready: boolean; canApprove: boolean; canDecline: boolean; actionable: ComplianceDocRow[] } {
  if (groupRows.length === 0) {
    return { ready: false, canApprove: false, canDecline: false, actionable: [] };
  }
  const allUploaded = groupRows.every((row) => row.status !== "missing");
  if (!allUploaded) {
    return { ready: false, canApprove: false, canDecline: false, actionable: [] };
  }
  // Bulk group actions are first-pass only — already-verified docs are re-reviewed
  // from the per-document preview footer instead.
  const actionable = groupRows.filter((row) => {
    if (row.status === "verified") return false;
    if (!canModerateComplianceRow(row, scope)) return false;
    const decisions = complianceReviewDecisionActions(row);
    return decisions.canApprove || decisions.canDecline;
  });
  if (actionable.length === 0) {
    return { ready: false, canApprove: false, canDecline: false, actionable: [] };
  }
  return {
    ready: true,
    canApprove: actionable.some((row) => complianceReviewDecisionActions(row).canApprove),
    canDecline: actionable.some((row) => complianceReviewDecisionActions(row).canDecline),
    actionable,
  };
}

export type ComplianceGroupReviewPhase = "awaiting_uploads" | "review" | "approved" | "declined";

export type ComplianceGroupReviewState = {
  phase: ComplianceGroupReviewPhase;
  total: number;
  missing: number;
  canApprove: boolean;
  canDecline: boolean;
  actionable: ComplianceDocRow[];
};

/**
 * One Approve/Decline pair per Required / Optional group in the vault list.
 * `null` when the group is empty or none of its docs can be moderated here
 * (e.g. driver KYC, which is reviewed elsewhere).
 */
export function complianceGroupReviewState(
  groupRows: ComplianceDocRow[],
  scope: "trip" | "vehicle" | "driver",
): ComplianceGroupReviewState | null {
  if (groupRows.length === 0) return null;
  const total = groupRows.length;
  const missing = groupRows.filter((row) => row.status === "missing").length;
  const idle = { total, missing, canApprove: false, canDecline: false, actionable: [] };
  if (!groupRows.some((row) => row.status === "missing" || canModerateComplianceRow(row, scope))) {
    return null;
  }
  if (missing > 0) return { phase: "awaiting_uploads", ...idle };
  if (groupRows.every((row) => row.status === "verified")) return { phase: "approved", ...idle };

  const actions = complianceGroupDecisionActions(groupRows, scope);
  if (!actions.ready) return null;
  const allDeclined = actions.actionable.every((row) => row.status === "rejected");
  return {
    phase: allDeclined ? "declined" : "review",
    total,
    missing,
    canApprove: actions.canApprove,
    canDecline: actions.canDecline,
    actionable: actions.actionable,
  };
}

/**
 * A tab is marked approved once its required-group Approve is done.
 * Optional documents (permit, pollution, tax, aadhaar) do not block it.
 */
export function complianceTabMarkedApproved(
  rows: ComplianceDocRow[],
  scope: "trip" | "vehicle" | "driver",
): boolean {
  const required = complianceGroupReviewState(
    rows.filter((row) => row.required),
    scope,
  );
  return required?.phase === "approved";
}

/** Optimistic Approve/Decline recorded against the exact row version it was made on. */
export type OptimisticComplianceDecision = {
  decision: "verified" | "rejected";
  /** `complianceRowVersion` at decision time — a re-upload changes it. */
  version: string;
  /** Server status at decision time — any server-side move away from it wins. */
  fromStatus: ComplianceDocRow["status"];
  /** Decline reason, until the refetch carries the stored one. */
  reason?: string;
};

/** Identity of the file behind a row: `key` is only the doc type, so it survives re-uploads. */
export function complianceRowVersion(row: ComplianceDocRow): string {
  if (row.doc) return `trip:${row.doc.id}:${row.doc.storage_path}:${row.doc.uploaded_at}`;
  if (row.entityDoc) return `entity:${row.entityDoc.id}:${row.entityDoc.storage_path ?? ""}:${row.entityDoc.created_at}`;
  return "none";
}

export function recordOptimisticDecision(
  row: ComplianceDocRow,
  decision: OptimisticComplianceDecision["decision"],
  reason?: string,
): OptimisticComplianceDecision {
  return { decision, version: complianceRowVersion(row), fromStatus: row.status, ...(reason ? { reason } : {}) };
}

/** Stored decline reason of a declined row (trip doc `rejection_reason`, entity doc `notes`), else the local one. */
export function complianceRowDeclineReason(
  row: ComplianceDocRow,
  local?: OptimisticComplianceDecision,
): string | null {
  const shown = applyOptimisticDecision(row, local);
  if (shown.status !== "rejected") return null;
  if (shown !== row) return local?.reason?.trim() || null;
  return (row.doc ? row.doc.rejection_reason : row.entityDoc?.notes)?.trim() || null;
}

/**
 * Overlay a local decision only while the server still shows the same file in the
 * same status it had when the decision was made. Once a refetch reflects the
 * decision, a re-upload lands, or someone else changes the status, the server row wins.
 */
export function applyOptimisticDecision(
  row: ComplianceDocRow,
  local: OptimisticComplianceDecision | undefined,
): ComplianceDocRow {
  if (!local) return row;
  if (local.version !== complianceRowVersion(row) || local.fromStatus !== row.status) return row;
  return { ...row, status: local.decision };
}
