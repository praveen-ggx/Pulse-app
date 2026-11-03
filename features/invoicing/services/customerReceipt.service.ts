/**
 * Invoice Book "Capture payment": one invoice receipt through the payment RPCs.
 *
 * Fails closed. When the invoice payment tables/RPCs are not on this database the
 * capture is refused with an actionable message; nothing is written to the trip
 * ledger (transactions) and no invoice row is touched. Trip-level money keeps its
 * own path (trip ledger / finance screens) and is not affected by this module.
 */
import {
  recordCustomerReceipt,
  type PaymentMode,
} from "@/features/invoicing/services/financeBooks.service";
import { recordInvoicePayment } from "@/features/invoicing/services/invoicePayment.service";
import {
  type ReceiptAllocationLine,
  type ReceiptTripWeight,
  type TripReceiptSlice,
} from "@/features/invoicing/utils/customerReceipt.util";

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function today(): string {
  const now = new Date();
  return new Date(now.getTime() + (330 + now.getTimezoneOffset()) * 60000).toISOString().slice(0, 10);
}

export type ReceiptTripAnchor = ReceiptTripWeight & {
  tripNumber: string | null;
};

export async function captureCustomerReceipt(args: {
  orgId: string;
  clientId: string | null;
  clientName: string;
  cash: number;
  tds: number;
  reference: string;
  date: string;
  lines: readonly ReceiptAllocationLine[];
  /** One key per capture intent; reuse it when retrying the same receipt. */
  idempotencyKey: string;
  paymentMode?: PaymentMode;
  /** Kept for the capture sheet's trip guide; trip shares are not stored. */
  tripsByInvoice?: Readonly<Record<string, readonly ReceiptTripAnchor[]>>;
  slicesByInvoice?: Readonly<Record<string, readonly TripReceiptSlice[]>>;
}): Promise<{ error: Error | null; cleared: number; trips: number; receiptNumber: string | null }> {
  const cash = round2(Math.max(0, args.cash));
  const tds = round2(Math.max(0, args.tds));
  const applied = args.lines.filter((line) => line.applied > 0);
  if (cash + tds <= 0 || applied.length === 0) {
    return { error: new Error("Enter an amount and choose invoices that are still open."), cleared: 0, trips: 0, receiptNumber: null };
  }
  const clientId = args.clientId && !args.clientId.startsWith("name:") ? args.clientId : null;
  if (!clientId) {
    return {
      error: new Error("This customer is not linked to a client record. Link the client on its trips before recording receipts."),
      cleared: 0,
      trips: 0,
      receiptNumber: null,
    };
  }
  const allocations = applied.map((line) => ({ invoiceId: line.id, amount: round2(line.applied) }));
  const date = args.date.trim() || today();

  let error: string | null;
  let receiptNumber: string | null = null;
  if (cash > 0) {
    const result = await recordCustomerReceipt({
      orgId: args.orgId,
      clientId,
      paymentDate: date,
      bankAmount: cash,
      tdsAmount: tds,
      paymentMode: args.paymentMode ?? "neft",
      reference: args.reference,
      depositAccountLabel: "",
      notes: "",
      idempotencyKey: args.idempotencyKey,
      allocations,
    });
    error = result.error;
    receiptNumber = result.receipt?.receiptNumber ?? null;
  } else {
    // TDS certificate only: no bank credit, so the receipt is the TDS itself.
    const result = await recordInvoicePayment({
      orgId: args.orgId,
      clientId,
      paymentDate: date,
      amount: tds,
      paymentMode: "tds",
      transactionReference: args.reference,
      depositAccountLabel: "",
      notes: "TDS deducted by customer",
      idempotencyKey: args.idempotencyKey,
      allocations,
    });
    error = result.error;
  }
  if (error && paymentBookMissing(error)) {
    return { error: new Error(FINANCE_PAYMENTS_UNAVAILABLE), cleared: 0, trips: 0, receiptNumber: null };
  }
  if (error) return { error: new Error(error), cleared: 0, trips: 0, receiptNumber: null };
  return {
    error: null,
    cleared: applied.filter((line) => line.cleared).length,
    trips: 0,
    receiptNumber,
  };
}

/** Shown when the invoice payment tables/RPCs are missing. Nothing was written. */
export const FINANCE_PAYMENTS_UNAVAILABLE =
  "Invoice payments can't be recorded on this workspace yet: the Finance payment tables are not installed on its database. " +
  "Nothing was recorded. Ask your administrator to apply the Finance migrations (invoice payment tracking). " +
  "Trip payments can still be recorded on the trip ledger as before.";

function paymentBookMissing(error: string): boolean {
  return /not available on this database/i.test(error);
}
