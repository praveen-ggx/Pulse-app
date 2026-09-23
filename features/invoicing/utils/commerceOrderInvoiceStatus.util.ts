/**
 * Commerce order invoice readiness — one order = one invoice unit.
 * Pure. No trip selection / merged-trip candidates.
 *
 * Billable status (canonical, shared with issue_sales_order_invoice):
 *   Draft                 → not billable (incomplete)
 *   Pending Consolidation → not billable (merge/ops candidate, not independent AR)
 *   Planned               → not billable (on execution plan; not delivered/closed)
 *   Fulfilled             → billable (Commerce terminal success ≈ delivered/closed)
 *   Cancelled             → not billable
 *
 * See oms/docs/PLATFORM_CANONICAL_MODEL.md prototype mapping:
 * Pending Consolidation → confirmed; Planned → planned; Fulfilled → delivered|closed.
 */

export type CommerceOrderInvoiceLifecycle =
  | "NOT_INVOICED"
  | "DRAFT"
  | "ISSUED"
  | "UNAVAILABLE";

export type CommerceOrderInvoiceAction =
  | "create"
  | "view_draft"
  | "view_invoice"
  | "unavailable";

export type CommerceOrderInvoiceStatusInput = {
  orderStatus: string | null | undefined;
  deletedAt?: string | null;
  activeInvoice?: {
    id: string;
    status: string | null;
    invoice_number: string | null;
  } | null;
};

export type CommerceOrderInvoiceStatus = {
  lifecycle: CommerceOrderInvoiceLifecycle;
  action: CommerceOrderInvoiceAction;
  buttonLabel: string;
  reason: string | null;
  invoiceId: string | null;
  invoiceNumber: string | null;
};

/** Only Fulfilled sales orders are invoiceable. */
const BILLABLE_STATUSES = new Set(["Fulfilled"]);

/** Canonical predicate reused by UI, draft, issue RPC contract tests. */
export function isSalesOrderInvoiceable(order: {
  status?: string | null;
  deleted_at?: string | null;
  deletedAt?: string | null;
}): boolean {
  if (order.deleted_at || order.deletedAt) return false;
  return isCommerceOrderBillableStatus(order.status);
}

export function isCommerceOrderBillableStatus(status: string | null | undefined): boolean {
  const trimmed = (status ?? "").trim();
  return BILLABLE_STATUSES.has(trimmed);
}

export function resolveCommerceOrderInvoiceStatus(
  input: CommerceOrderInvoiceStatusInput,
): CommerceOrderInvoiceStatus {
  if (input.deletedAt) {
    return {
      lifecycle: "UNAVAILABLE",
      action: "unavailable",
      buttonLabel: "Invoice unavailable",
      reason: "Order was deleted.",
      invoiceId: null,
      invoiceNumber: null,
    };
  }

  const status = (input.orderStatus ?? "").trim();
  const inv = input.activeInvoice;
  const invStatus = (inv?.status ?? "").trim().toLowerCase();

  if (inv && invStatus === "draft") {
    return {
      lifecycle: "DRAFT",
      action: "view_draft",
      buttonLabel: "Open Draft",
      reason: null,
      invoiceId: inv.id,
      invoiceNumber: inv.invoice_number,
    };
  }

  if (inv && invStatus && !["void", "cancelled"].includes(invStatus)) {
    return {
      lifecycle: "ISSUED",
      action: "view_invoice",
      buttonLabel: "View Invoice",
      reason: null,
      invoiceId: inv.id,
      invoiceNumber: inv.invoice_number,
    };
  }

  if (status === "Cancelled") {
    return {
      lifecycle: "UNAVAILABLE",
      action: "unavailable",
      buttonLabel: "Invoice unavailable",
      reason: "Cancelled orders cannot be invoiced.",
      invoiceId: null,
      invoiceNumber: null,
    };
  }

  if (status === "Draft" || status === "Planned") {
    return {
      lifecycle: "UNAVAILABLE",
      action: "unavailable",
      buttonLabel: "Invoice unavailable",
      reason: "Complete the order (Fulfilled) before creating an invoice.",
      invoiceId: null,
      invoiceNumber: null,
    };
  }

  if (status === "Pending Consolidation") {
    return {
      lifecycle: "UNAVAILABLE",
      action: "unavailable",
      buttonLabel: "Invoice unavailable",
      reason: "Merged or consolidating orders are not independently billable.",
      invoiceId: null,
      invoiceNumber: null,
    };
  }

  if (!isCommerceOrderBillableStatus(status)) {
    return {
      lifecycle: "UNAVAILABLE",
      action: "unavailable",
      buttonLabel: "Invoice unavailable",
      reason: "Order is not in a billable state (Fulfilled required).",
      invoiceId: null,
      invoiceNumber: null,
    };
  }

  return {
    lifecycle: "NOT_INVOICED",
    action: "create",
    buttonLabel: "Create Invoice",
    reason: null,
    invoiceId: null,
    invoiceNumber: null,
  };
}
