/**
 * The customer ledger screen has two books.
 * Trip sales (Finance → Customers) do not include invoice receipts, credit notes,
 * or cancellations. Showing those totals above the invoice ledger lines makes
 * Billed / Received / Pending disagree with the rows underneath.
 * When the invoice ledger is available, the opening, debit, credit, and closing
 * figures from that ledger are the headline. Trip totals remain the fallback
 * only while the invoice ledger cannot be read.
 */
export function customerLedgerHeadlineSource(invoiceLedgerAvailable: boolean): "invoice" | "trip" {
  return invoiceLedgerAvailable ? "invoice" : "trip";
}
