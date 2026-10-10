/**
 * Preset reject reasons for verified Compliance trips (decision-bar Reject).
 * Multiple presets can be selected; free-text "Other" is allowed. The composed
 * reason is stored on trips.compliance_decline_reason via reject_trip_compliance.
 *
 * After Reject, the trip leaves Verified and lands on Pending Docs or Compliance
 * Pending by reason (see `complianceRejectQueueDestination`).
 */
export const COMPLIANCE_REJECT_REASON_OPTIONS = [
  { id: "memo_missing", label: "Memo missing" },
  { id: "truck_no_mismatch", label: "Truck No mismatch" },
  { id: "vendor_mismatch", label: "Vendor mismatch" },
  { id: "client_date_mismatch", label: "Client date mismatch" },
  { id: "vendor_rate_mismatch", label: "Vendor rate mismatch" },
  { id: "other", label: "Other" },
] as const;

export type ComplianceRejectReasonOptionId =
  (typeof COMPLIANCE_REJECT_REASON_OPTIONS)[number]["id"];

/** Presets that send a Verified reject back to Pending Docs (document / identity). */
export const COMPLIANCE_REJECT_PENDING_DOCS_OPTION_IDS = [
  "truck_no_mismatch",
  "client_date_mismatch",
] as const satisfies readonly ComplianceRejectReasonOptionId[];

/** Presets that send a Verified reject to Compliance Pending (memo / commercial). */
export const COMPLIANCE_REJECT_COMPLIANCE_PENDING_OPTION_IDS = [
  "memo_missing",
  "vendor_mismatch",
  "vendor_rate_mismatch",
] as const satisfies readonly ComplianceRejectReasonOptionId[];

export type ComplianceRejectQueueDestination = "pending_for_docs" | "compliance_pending";

const OPTION_ORDER = COMPLIANCE_REJECT_REASON_OPTIONS.map((item) => item.id);

const PENDING_DOCS_LABELS = new Set(
  COMPLIANCE_REJECT_PENDING_DOCS_OPTION_IDS.map(
    (id) => COMPLIANCE_REJECT_REASON_OPTIONS.find((item) => item.id === id)!.label.toLowerCase(),
  ),
);
const COMPLIANCE_PENDING_LABELS = new Set(
  COMPLIANCE_REJECT_COMPLIANCE_PENDING_OPTION_IDS.map(
    (id) => COMPLIANCE_REJECT_REASON_OPTIONS.find((item) => item.id === id)!.label.toLowerCase(),
  ),
);

const DOCS_OTHER_HINT =
  /\b(document|docs?|lr|invoice|e-?way|pod|upload|scan|blurry|photo|file|pending)\b/i;

/** Builds the stored reason string from one or more presets (+ Other text). */
export function composeComplianceRejectReason(
  optionIds: readonly ComplianceRejectReasonOptionId[],
  otherText: string,
): string | null {
  if (!optionIds.length) return null;
  const selected = new Set(optionIds);
  const parts: string[] = [];
  for (const id of OPTION_ORDER) {
    if (!selected.has(id)) continue;
    if (id === "other") {
      const trimmed = otherText.trim();
      if (!trimmed) return null;
      parts.push(trimmed);
      continue;
    }
    const option = COMPLIANCE_REJECT_REASON_OPTIONS.find((item) => item.id === id);
    if (option) parts.push(option.label);
  }
  if (!parts.length) return null;
  return parts.join("; ");
}

/**
 * Where a Verified-stage Reject should surface in the queue.
 * Document/identity presets → Pending Docs; memo/commercial → Compliance Pending.
 * Free-text "Other" uses keywords (document, LR, …) else Compliance Pending.
 * Mixed presets prefer Pending Docs when any docs preset is present.
 */
export function complianceRejectQueueDestination(
  reason: string | null | undefined,
): ComplianceRejectQueueDestination {
  const raw = (reason ?? "").trim();
  if (!raw) return "compliance_pending";
  const parts = raw.split(";").map((part) => part.trim()).filter(Boolean);
  let hasDocsPreset = false;
  let hasFinancePreset = false;
  const otherParts: string[] = [];
  for (const part of parts) {
    const key = part.toLowerCase();
    if (PENDING_DOCS_LABELS.has(key)) hasDocsPreset = true;
    else if (COMPLIANCE_PENDING_LABELS.has(key)) hasFinancePreset = true;
    else otherParts.push(part);
  }
  if (hasDocsPreset) return "pending_for_docs";
  if (otherParts.some((part) => DOCS_OTHER_HINT.test(part))) return "pending_for_docs";
  if (hasFinancePreset) return "compliance_pending";
  if (otherParts.length > 0) return "compliance_pending";
  return "compliance_pending";
}

/** User-facing queue path after a Verified-stage Reject. */
export function complianceRejectQueuePathLabel(reason: string | null | undefined): string {
  return complianceRejectQueueDestination(reason) === "pending_for_docs"
    ? "Pending Docs → Declined by finance"
    : "Ready to Verify → Declined by finance";
}
