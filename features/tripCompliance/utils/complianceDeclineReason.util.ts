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

const FILE_QUALITY_ENTITY = [
  "Blurry / unreadable",
  "Cropped / cut off",
  "Wrong document type",
  "Duplicate upload",
  "Edited / tampered",
];

/** Options per tab, picked from the full list so the stored text stays identical. */
const DECLINE_OPTIONS_BY_SCOPE: Record<"trip" | "vehicle" | "driver", readonly string[]> = {
  trip: [
    "LR missing",
    "E-way bill missing",
    "Invoice missing",
    "Memo missing",
    "Pages missing / incomplete",
    "Blurry / unreadable",
    "Cropped / cut off",
    "Wrong document type",
    "Belongs to another trip",
    "Duplicate upload",
    "Signature / stamp missing",
    "Edited / tampered",
    "Vehicle number mismatch",
    "LR number mismatch",
    "Invoice number / amount mismatch",
    "E-way bill number mismatch",
    "Consignor / consignee mismatch",
    "Route (from / to) mismatch",
    "Date mismatch",
    "Weight / quantity mismatch",
    "Vendor / supplier mismatch",
    "E-way bill expired",
    "GST details invalid",
  ],
  vehicle: [
    "Vehicle documents missing (RC / Insurance / FC)",
    "Pages missing / incomplete",
    ...FILE_QUALITY_ENTITY,
    "Vehicle number mismatch",
    "Vehicle document expired (RC / Insurance / FC)",
  ],
  driver: [
    "Driver licence missing",
    "Pages missing / incomplete",
    ...FILE_QUALITY_ENTITY,
    "Driver licence expired",
  ],
};

/** Decline presets for one document tab (Trip / Vehicle / Driver). */
export function complianceDeclineSectionsForScope(
  scope: "trip" | "vehicle" | "driver",
): ComplianceDeclineReasonSection[] {
  const allowed = new Set(DECLINE_OPTIONS_BY_SCOPE[scope]);
  return COMPLIANCE_DECLINE_REASON_SECTIONS.map((section) => ({
    title: section.title,
    options: section.options.filter((option) => allowed.has(option)),
  })).filter((section) => section.options.length > 0);
}

/** Reasons Finance can give when flagging a trip for Compliance review. */
export const FINANCE_FLAG_REASON_SECTIONS: readonly ComplianceDeclineReasonSection[] = [
  {
    title: "Finance check",
    options: [
      "Memo missing",
      "Truck No mismatch",
      "Vendor mismatch",
      "Client rate mismatch",
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

const KNOWN_DECLINE_OPTIONS = new Set(
  [...COMPLIANCE_DECLINE_REASON_SECTIONS, ...FINANCE_FLAG_REASON_SECTIONS].flatMap((section) => section.options),
);

/** Reverse of compose: preset parts become selections, anything else is the note. */
export function parseComplianceDeclineReason(text: string | null | undefined): {
  selected: string[];
  note: string;
} {
  const selected: string[] = [];
  const notes: string[] = [];
  for (const raw of (text ?? "").split(";")) {
    const part = raw.trim();
    if (!part) continue;
    if (KNOWN_DECLINE_OPTIONS.has(part)) {
      if (!selected.includes(part)) selected.push(part);
    } else {
      notes.push(part.replace(/^Note:\s*/i, ""));
    }
  }
  return { selected, note: notes.join("; ") };
}

/**
 * Prefill for the trip Decline from the documents already declined on the
 * Trip / Vehicle / Driver tabs: presets are merged, free-text notes keep the
 * document label so Ground Ops knows which file it is about.
 */
/** One line per distinct reason: "Driver licence missing — LR, E-way Bill, Invoice". */
export function groupDeclinedReasonLines(items: readonly { label: string; reason: string }[]): string[] {
  const labelsByReason = new Map<string, string[]>();
  for (const item of items) {
    const labels = labelsByReason.get(item.reason) ?? [];
    if (!labels.includes(item.label)) labels.push(item.label);
    labelsByReason.set(item.reason, labels);
  }
  return Array.from(labelsByReason, ([reason, labels]) => `${reason} — ${labels.join(", ")}`);
}

export function mergeDeclinedDocumentReasons(
  items: readonly { label: string; reason: string }[],
): { selected: string[]; note: string } {
  const selected = new Set<string>();
  const notes: string[] = [];
  for (const item of items) {
    const parsed = parseComplianceDeclineReason(item.reason);
    for (const option of parsed.selected) selected.add(option);
    const line = parsed.note ? `${item.label}: ${parsed.note}` : "";
    if (line && !notes.includes(line)) notes.push(line);
  }
  return { selected: Array.from(selected), note: notes.join("; ") };
}
