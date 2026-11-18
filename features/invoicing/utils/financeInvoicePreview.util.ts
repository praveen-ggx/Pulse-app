import type { InvoiceLineSnapshot } from "@/features/invoicing/services/invoiceDocumentSnapshot.service";
import { formatInvoicePreviewDate } from "@/features/invoicing/services/invoicePreviewModel.service";

/**
 * Saved invoice-date precedence.
 *
 * 1. A date on the draft wins. A real calendar day is the left-pane edit
 *    while composing, and the stored `invoices.invoice_date` after reopen.
 *    Text that is not a full day yet is still shown, so the paper follows
 *    the field as it is typed.
 * 2. The preview panel's own date (today, captured when the panel mounts)
 *    is used only when the draft has no date. Trip invoices take this path
 *    until their draft is built from that same panel date.
 * 3. Saving a manual invoice writes a valid edited day on create, update,
 *    and issue. An empty or invalid edit is stored as today.
 * 4. Reopening does not invent a date. A valid saved day replaces the form;
 *    a blank saved day leaves the form as it is.
 */
function calendarDay(value: string | null | undefined): string | null {
  const match = (value ?? "").trim().match(/^(\d{4}-\d{2}-\d{2})/);
  if (!match) return null;
  const parsed = new Date(`${match[1]}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  const formatted = formatInvoicePreviewDate(parsed);
  return formatted === match[1] ? formatted : null;
}

/** Date printed on the invoice paper. See the precedence note above. */
export function resolveInvoicePaperDate(args: {
  draftPreviewDate?: string | null;
  panelPreviewDate: string;
}): string {
  const raw = (args.draftPreviewDate ?? "").trim();
  if (!raw) return args.panelPreviewDate;
  return calendarDay(raw) ?? raw;
}

/** Day written to `invoices.invoice_date`. See the precedence note above. */
export function resolveSavedManualInvoiceDate(
  edited: string | null | undefined,
  now: Date = new Date(),
): string {
  return calendarDay(edited) ?? formatInvoicePreviewDate(now);
}

/** Saved day to put back in the left-pane field. Null when the row has none. */
export function manualInvoiceDateFromSaved(
  invoiceDate: string | null | undefined,
): string | null {
  return calendarDay(invoiceDate);
}

export type FinancePreviewKind =
  | "empty"
  | "manual"
  | "trip"
  | "issued"
  | "draft";

export function financeCreateInvoiceLabel(eligibleCount: number): string {
  return eligibleCount > 0
    ? `Create Invoice (${eligibleCount})`
    : "Create Invoice";
}

export function invoicePreviewCanSaveDraft(args: {
  hasExternalDraft: boolean;
  selectedTripCount: number;
}): boolean {
  return args.hasExternalDraft || args.selectedTripCount > 0;
}

/** Items source — the original defect rendered trips only, hiding manual/issued lines. */
export function resolveInvoicePreviewItemSource(args: {
  selectedTripCount: number;
  draftLineCount: number;
}): "draft-lines" | "selected-trips" | "empty" {
  if (args.selectedTripCount === 0 && args.draftLineCount > 0) return "draft-lines";
  if (args.selectedTripCount > 0) return "selected-trips";
  return "empty";
}

export function manualInvoicePersistIdentity(): {
  invoice_source: "manual";
  trip_ids: [];
} {
  return { invoice_source: "manual", trip_ids: [] };
}

export function invoicePreviewItemsFromDraft(
  lines: readonly InvoiceLineSnapshot[] | null | undefined,
): { count: number; descriptions: string[] } {
  const rows = (lines ?? []).filter(
    (line) => (line.description ?? "").trim().length > 0,
  );
  return {
    count: rows.length,
    descriptions: rows.map((line) => line.description),
  };
}

export function resolveFinancePreviewKind(args: {
  composeMode: "trips" | "manual";
  invoiceSurface?: "pending" | "drafts" | "issued" | "details";
  hasManualDraft: boolean;
  previewTripCount: number;
  hasIssuedInspect: boolean;
}): FinancePreviewKind {
  if (args.invoiceSurface === "issued" && args.hasIssuedInspect) return "issued";
  if (args.composeMode === "manual" && args.hasManualDraft) return "manual";
  if (args.previewTripCount > 0) return "trip";
  return "empty";
}

export function financeInvoiceNumberLabel(args: {
  issued: boolean;
  invoiceNumber?: string | null;
}): string {
  if (args.issued) {
    const n = (args.invoiceNumber ?? "").trim();
    return n || "INV";
  }
  return "DRAFT";
}

/** Authoritative route → screen. History/admin is never the Finance landing. */
export function financeRouteScreenOwner(pathname: string): {
  screen:
    | "InvoicingExecuteScreen"
    | "SourceInvoiceEditorScreen"
    | "other";
  compose?: "trips" | "manual" | "create";
} {
  const path = pathname.split("?")[0] ?? pathname;
  if (path.startsWith("/pulse-invoice/order/") || path.startsWith("/invoicing-execute/order/")) {
    return { screen: "SourceInvoiceEditorScreen" };
  }
  if (path === "/pulse-invoice/manual" || path === "/invoicing-execute/manual") {
    return { screen: "InvoicingExecuteScreen", compose: "manual" };
  }
  if (path === "/invoicing-execute/create") {
    return { screen: "InvoicingExecuteScreen", compose: "create" };
  }
  if (
    path === "/pulse-invoice" ||
    path === "/invoicing-execute" ||
    path === "/invoicing-execute/create"
  ) {
    return { screen: "InvoicingExecuteScreen", compose: "trips" };
  }
  return { screen: "other" };
}
