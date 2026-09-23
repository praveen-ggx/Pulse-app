import type { ComplianceDocRow } from "@/features/tripCompliance/utils/complianceDocumentRows.util";

export function canModerateComplianceRow(row: ComplianceDocRow, scope: "trip" | "vehicle" | "driver"): boolean {
  if (row.status === "missing") return false;
  if (scope === "trip") return Boolean(row.doc);
  // Driver KYC is moderated elsewhere; vehicle vault can Approve (set expiry) but not Decline.
  if (row.entityDoc?.source === "driver-kyc") return false;
  return Boolean(row.entityDoc);
}

/** Approve/Decline on uploaded docs. Missing files must be uploaded first. */
export function complianceReviewDecisionActions(row: ComplianceDocRow): { canApprove: boolean; canDecline: boolean } {
  if (row.status === "missing") return { canApprove: false, canDecline: false };
  const vaultOnly = row.entityDoc?.source === "vehicle-vault";
  return {
    canApprove: row.status !== "verified",
    canDecline: !vaultOnly && row.status !== "rejected",
  };
}
