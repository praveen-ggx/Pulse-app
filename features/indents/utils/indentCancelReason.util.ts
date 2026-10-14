/**
 * Why an indent left the open pool. Stored on `indents.cancel_reason`.
 * "Indent expired" is recorded as status `expired`; the other three as `cancelled`.
 */
export const INDENT_CANCEL_REASONS = [
  { id: "client_cancelled", label: "Cancelled by client" },
  { id: "indent_expired", label: "Indent expired" },
  { id: "no_rates_available", label: "No rates available" },
  { id: "wrong_entry", label: "Wrong entry" },
] as const;

export type IndentCancelReasonId = (typeof INDENT_CANCEL_REASONS)[number]["id"];

/** Older rows may still carry this value; it is no longer offered when cancelling. */
const LEGACY_REASON_LABELS = {
  cost_does_not_match: "Cost doesn't match",
} as const;

/** Every value the Failed filter can bucket by, including legacy ones. */
export type IndentFailedCategory = IndentCancelReasonId | keyof typeof LEGACY_REASON_LABELS;

const REASON_IDS = new Set<string>(INDENT_CANCEL_REASONS.map((reason) => reason.id));

export function indentCancelReasonId(raw: unknown): IndentCancelReasonId | null {
  const value = String(raw ?? "").trim();
  return REASON_IDS.has(value) ? (value as IndentCancelReasonId) : null;
}

function isLegacyReason(value: string): value is keyof typeof LEGACY_REASON_LABELS {
  return value in LEGACY_REASON_LABELS;
}

export function indentCancelReasonLabel(raw: unknown): string | null {
  const id = indentCancelReasonId(raw);
  if (id) return INDENT_CANCEL_REASONS.find((reason) => reason.id === id)?.label ?? null;
  const value = String(raw ?? "").trim();
  return isLegacyReason(value) ? LEGACY_REASON_LABELS[value] : null;
}

/** Cancelled or expired indents. Completed and closed stays out of Failed. */
export function isIndentFailedStatus(status: string | null | undefined): boolean {
  const value = String(status ?? "").trim().toLowerCase();
  return value === "cancelled" || value === "expired";
}

export function indentStatusForCancelReason(
  reason: IndentCancelReasonId,
): "cancelled" | "expired" {
  return reason === "indent_expired" ? "expired" : "cancelled";
}

/** Failed-filter bucket. A stored reason wins; a bare expired status is Indent expired. */
export function indentFailedCategory(indent: {
  status?: string | null;
  cancel_reason?: string | null;
}): IndentFailedCategory | null {
  const id = indentCancelReasonId(indent.cancel_reason);
  if (id) return id;
  const raw = String(indent.cancel_reason ?? "").trim();
  if (isLegacyReason(raw)) return raw;
  const status = String(indent.status ?? "").trim().toLowerCase();
  if (status === "expired") return "indent_expired";
  return null;
}

const INACTIVE_INDENT_STATUSES = new Set(["cancelled", "closed", "expired"]);

/**
 * Award is only valid on an active indent. A cancelled, closed, or expired
 * load has to be reactivated before a bid can be accepted.
 */
export function indentAwardBlockedBecauseInactive(
  status: string | null | undefined,
): string | null {
  const normalized = String(status ?? "").trim().toLowerCase();
  if (!INACTIVE_INDENT_STATUSES.has(normalized)) return null;
  return "This indent is cancelled. Reactivate it before awarding a bid.";
}
