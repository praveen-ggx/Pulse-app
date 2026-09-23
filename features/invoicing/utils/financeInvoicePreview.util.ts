import type { InvoiceLineSnapshot } from "@/features/invoicing/services/invoiceDocumentSnapshot.service";

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
