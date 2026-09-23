/**
 * Invoice document lifecycle. Allocation uses invoices.trip_ids.
 * Drafts reserve trips; only sent/paid are issued history.
 */

export const INVOICE_ISSUED_STATUSES = ["sent", "paid"] as const;
export const INVOICE_DRAFT_STATUSES = ["draft"] as const;
export const INVOICE_TERMINAL_STATUSES = ["void", "cancelled"] as const;

export type InvoiceLifecycleStatus =
  | "draft"
  | "sent"
  | "paid"
  | "void"
  | "cancelled";

export function normalizeInvoiceStatus(
  raw: string | null | undefined,
): string {
  return (raw ?? "").trim().toLowerCase();
}

export function invoiceStatusIsIssued(raw: string | null | undefined): boolean {
  const status = normalizeInvoiceStatus(raw);
  return status === "sent" || status === "paid";
}

export function invoiceStatusIsDraft(raw: string | null | undefined): boolean {
  return normalizeInvoiceStatus(raw) === "draft";
}

export function invoiceStatusIsTerminal(raw: string | null | undefined): boolean {
  const status = normalizeInvoiceStatus(raw);
  return status === "void" || status === "cancelled";
}

/** Active allocation: draft + issued. Terminal statuses release trips. */
export function invoiceStatusHoldsTrips(raw: string | null | undefined): boolean {
  return !invoiceStatusIsTerminal(raw) && normalizeInvoiceStatus(raw).length > 0;
}

export function draftInvoiceNumber(): string {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `draft-${Date.now()}`;
  return `DRAFT/${id}`;
}

export function issueIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `issue-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
