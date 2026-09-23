/**
 * Create paths:
 * - Commerce Order → one Fulfilled order = one invoice (canonical)
 * - Manual / Client Plan → blocked until a Client Plan entity exists
 *
 * Finance Pro trip multi-select create is retired. Historical trip invoices
 * remain readable under Issued.
 */

export const FINANCE_PRO_TRIP_INVOICE_CREATION = false;

export function isFinanceProTripInvoiceCreationEnabled(): boolean {
  return FINANCE_PRO_TRIP_INVOICE_CREATION;
}

/** @deprecated Trip bulk create is retired — always false. */
export function isLegacyTripBulkInvoiceCreationEnabled(): boolean {
  return isFinanceProTripInvoiceCreationEnabled();
}

export {
  invoiceSourceLabel,
  invoiceSourceReference,
  type InvoiceBillingSource,
} from "@/features/invoicing/utils/invoiceSource.util";
