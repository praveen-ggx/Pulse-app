import type { ComplianceDocRow } from "@/features/tripCompliance/utils/complianceDocumentRows.util";

/**
 * Replace-in-place is only valid for a rejected trip_documents row.
 * Entity / vault-only files and pending / verified / missing rows must not
 * use this path — Add still inserts, and Decline/Approve stay unchanged.
 */
export function singleComplianceRowReplaceId(row: ComplianceDocRow | null | undefined): string | null {
  if (!row || row.status !== "rejected") return null;
  const id = row.doc?.id?.trim() ?? "";
  return id || null;
}

/**
 * The only document this action may write. Siblings are listed so a caller
 * cannot silently expand the target set to bank / LR / invoice / memo.
 */
export function singleComplianceRowReplaceIds(
  selected: ComplianceDocRow,
  _siblings: readonly ComplianceDocRow[],
): string[] {
  const id = singleComplianceRowReplaceId(selected);
  return id ? [id] : [];
}

export function canShowSingleRowReplace(input: {
  canEditFiles: boolean;
  row: ComplianceDocRow | null | undefined;
}): boolean {
  if (!input.canEditFiles) return false;
  return Boolean(singleComplianceRowReplaceId(input.row));
}

/** Rejected trip docs must Replace, not Add — Add inserts a second row. */
export function mustReplaceRejectedTripDocument(row: ComplianceDocRow | null | undefined): boolean {
  return Boolean(singleComplianceRowReplaceId(row));
}

export function replaceTripFileOptions(row: ComplianceDocRow): { replaceDocumentId: string } | null {
  const id = singleComplianceRowReplaceId(row);
  if (!id) return null;
  return { replaceDocumentId: id };
}
