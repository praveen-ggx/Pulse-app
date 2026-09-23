/**
 * Mirrors features/invoicing/utils/commerceOrderInvoiceStatus.util.ts
 * Fulfilled-only. OMS cannot import Expo feature paths.
 */

export type OrderInvoiceAction = 'create' | 'view_draft' | 'view_invoice' | 'unavailable';

export type OrderInvoiceStatus = {
  action: OrderInvoiceAction;
  buttonLabel: string;
  reason: string | null;
  invoiceId: string | null;
  invoiceNumber: string | null;
  lifecycle: 'NOT_INVOICED' | 'DRAFT' | 'ISSUED' | 'UNAVAILABLE';
};

export function isSalesOrderInvoiceable(status: string | null | undefined): boolean {
  return (status ?? '').trim() === 'Fulfilled';
}

export function resolveOrderInvoiceStatus(input: {
  orderStatus: string | null | undefined;
  activeInvoice?: { id: string; status: string | null; invoice_number: string | null } | null;
}): OrderInvoiceStatus {
  const inv = input.activeInvoice;
  const invStatus = (inv?.status ?? '').trim().toLowerCase();
  if (inv && invStatus === 'draft') {
    return {
      action: 'view_draft',
      buttonLabel: 'Open Draft',
      reason: null,
      invoiceId: inv.id,
      invoiceNumber: inv.invoice_number,
      lifecycle: 'DRAFT',
    };
  }
  if (inv && invStatus && !['void', 'cancelled'].includes(invStatus)) {
    return {
      action: 'view_invoice',
      buttonLabel: 'View Invoice',
      reason: null,
      invoiceId: inv.id,
      invoiceNumber: inv.invoice_number,
      lifecycle: 'ISSUED',
    };
  }
  if (!isSalesOrderInvoiceable(input.orderStatus)) {
    const status = (input.orderStatus ?? '').trim();
    const reason =
      status === 'Pending Consolidation'
        ? 'Merged or consolidating orders are not independently billable.'
        : status === 'Cancelled'
          ? 'Cancelled orders cannot be invoiced.'
          : 'Complete the order (Fulfilled) before creating an invoice.';
    return {
      action: 'unavailable',
      buttonLabel: 'Invoice unavailable',
      reason,
      invoiceId: null,
      invoiceNumber: null,
      lifecycle: 'UNAVAILABLE',
    };
  }
  return {
    action: 'create',
    buttonLabel: 'Create Invoice',
    reason: null,
    invoiceId: null,
    invoiceNumber: null,
    lifecycle: 'NOT_INVOICED',
  };
}
