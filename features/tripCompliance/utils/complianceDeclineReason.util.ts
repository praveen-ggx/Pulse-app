/**
 * Preset reasons for a Compliance Decline (documents or the whole trip).
 * Multi-select; an optional free-text note is appended. The composed text is
 * stored as the decline / rejection reason, e.g.
 * "E-way bill expired; Vehicle number mismatch; Note: LR shows TN12L1137".
 */

export type ComplianceDeclineReasonSection = {
  title: string;
  options: readonly string[];
};

export const COMPLIANCE_DECLINE_REASON_SECTIONS: readonly ComplianceDeclineReasonSection[] = [
  {
    title: "Missing",
    options: [
      "LR missing",
      "E-way bill missing",
      "Invoice missing",
      "Memo missing",
      "Pages missing / incomplete",
      "Vehicle documents missing (RC / Insurance / FC)",
      "Driver licence missing",
    ],
  },
  {
    title: "File quality",
    options: [
      "Blurry / unreadable",
      "Cropped / cut off",
      "Wrong document type",
      "Belongs to another trip",
      "Duplicate upload",
      "Signature / stamp missing",
      "Edited / tampered",
    ],
  },
  {
    title: "Mismatch",
    options: [
      "Vehicle number mismatch",
      "LR number mismatch",
      "Invoice number / amount mismatch",
      "E-way bill number mismatch",
      "Consignor / consignee mismatch",
      "Route (from / to) mismatch",
      "Date mismatch",
      "Weight / quantity mismatch",
      "Vendor / supplier mismatch",
    ],
  },
  {
    title: "Validity",
    options: [
      "E-way bill expired",
      "Vehicle document expired (RC / Insurance / FC)",
      "Driver licence expired",
      "GST details invalid",
    ],
  },
];

/** Reasons Finance can give when flagging a trip for Compliance review. */
export const FINANCE_FLAG_REASON_SECTIONS: readonly ComplianceDeclineReasonSection[] = [
  {
    title: "Finance check",
    options: [
      "Memo missing",
      "Truck No mismatch",
      "Vendor mismatch",
      "Client date mismatch",
      "Vendor rate mismatch",
      "Freight / amount mismatch",
      "Bank details mismatch",
      "Duplicate trip / payment",
    ],
  },
];

/** Selected presets (in list order) plus an optional note. Null when nothing is chosen. */
export function composeComplianceDeclineReason(
  selected: readonly string[],
  note: string,
): string | null {
  const chosen = new Set(selected);
  const ordered = [...COMPLIANCE_DECLINE_REASON_SECTIONS, ...FINANCE_FLAG_REASON_SECTIONS].flatMap(
    (section) => section.options,
  );
  const parts = Array.from(new Set(ordered)).filter((option) => chosen.has(option));
  const trimmedNote = note.trim();
  if (trimmedNote) parts.push(parts.length > 0 ? `Note: ${trimmedNote}` : trimmedNote);
  return parts.length > 0 ? parts.join("; ") : null;
}
