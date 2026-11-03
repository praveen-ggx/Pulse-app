/** Derived invoice payment status. Issued totals are never rewritten from here. */

export type InvoicePaymentStatus =
  | "unpaid"
  | "partially_paid"
  | "paid"
  | "overpaid"
  | "cancelled";

export type AgingBucket =
  | "current"
  | "days_1_30"
  | "days_31_60"
  | "days_61_90"
  | "days_over_90";

export function roundInr(amount: number): number {
  if (!Number.isFinite(amount)) return Number.NaN;
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

export function parseInrAmount(value: string): number | null {
  const cleaned = value.replace(/,/g, "").trim();
  if (!cleaned) return null;
  const amount = roundInr(Number(cleaned));
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return amount;
}

/** Same rules as invoice_payment_summaries. */
export function deriveInvoicePaymentStatus(
  total: number,
  received: number,
): InvoicePaymentStatus {
  const invoiceTotal = roundInr(total);
  const amountReceived = roundInr(received);
  if (!(amountReceived > 0) && invoiceTotal > 0) return "unpaid";
  if (amountReceived > invoiceTotal) return "overpaid";
  if (amountReceived < invoiceTotal) return "partially_paid";
  return "paid";
}

export function invoiceAmountOutstanding(total: number, received: number): number {
  return roundInr(roundInr(total) - roundInr(received));
}

export function paymentStatusLabel(status: InvoicePaymentStatus): string {
  if (status === "partially_paid") return "Partially Paid";
  if (status === "overpaid") return "Customer credit";
  if (status === "paid") return "Paid";
  if (status === "cancelled") return "Cancelled";
  return "Unpaid";
}

/** Days past due. Not yet due is current. A missing due date ages from the invoice date. */
export function agingBucket(anchorDate: string | null, today: Date): AgingBucket {
  if (!anchorDate) return "current";
  const anchor = new Date(`${anchorDate.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(anchor.getTime())) return "current";
  const start = new Date(today);
  start.setHours(0, 0, 0, 0);
  const days = Math.floor((start.getTime() - anchor.getTime()) / 86400000);
  if (days <= 0) return "current";
  if (days <= 30) return "days_1_30";
  if (days <= 60) return "days_31_60";
  if (days <= 90) return "days_61_90";
  return "days_over_90";
}

export function allocationFits(input: {
  paymentAmount: number;
  alreadyAllocated: number;
  invoiceTotal: number;
  alreadyReceived: number;
  nextAmount: number;
}): { ok: true } | { ok: false; reason: "payment" | "invoice" } {
  const next = roundInr(input.nextAmount);
  const paymentLeft = roundInr(input.paymentAmount - input.alreadyAllocated);
  const invoiceLeft = roundInr(input.invoiceTotal - input.alreadyReceived);
  if (next > paymentLeft) return { ok: false, reason: "payment" };
  if (next > invoiceLeft) return { ok: false, reason: "invoice" };
  return { ok: true };
}

export function paymentReceiptText(input: {
  invoiceNumber: string;
  paymentDate: string;
  amount: number;
  mode: string;
  reference: string | null;
  allocationAmount: number;
  status: string;
}): string {
  const lines = [
    `Receipt for invoice ${input.invoiceNumber}`,
    `Date: ${input.paymentDate}`,
    `Mode: ${input.mode}`,
    `Payment: ₹${input.amount.toFixed(2)}`,
    `Allocated to this invoice: ₹${input.allocationAmount.toFixed(2)}`,
    `Status: ${input.status}`,
  ];
  if (input.reference) lines.push(`Reference: ${input.reference}`);
  return lines.join("\n");
}
