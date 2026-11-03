/**
 * Invoice payment RPCs. Balances are returned by the database.
 * This service does not write invoices.status or invoices.total_amount.
 */
import { supabase } from "@/lib/supabase";
import type { InvoicePaymentStatus } from "@/features/invoicing/utils/invoicePayment.util";

export type InvoicePaymentSummary = {
  invoiceId: string;
  invoiceTotal: number;
  amountReceived: number;
  amountOutstanding: number;
  paymentStatus: InvoicePaymentStatus;
  lastPaymentDate: string | null;
  lastReference: string | null;
  /** Issued credit notes on the invoice (0 when the database predates credit notes). */
  amountCredited: number;
};

export type InvoicePaymentHistoryRow = {
  paymentId: string;
  allocationId: string;
  paymentDate: string;
  allocationAmount: number;
  paymentAmount: number;
  paymentMode: string;
  transactionReference: string | null;
  depositAccountLabel: string | null;
  notes: string | null;
  status: string;
  reversedAt: string | null;
  reversalReason: string | null;
};

export type CustomerReceivables = {
  invoiceCount: number;
  invoiceTotal: number;
  amountReceived: number;
  amountOutstanding: number;
  currentAmount: number;
  days1To30: number;
  days31To60: number;
  days61To90: number;
  daysOver90: number;
};

export type RecordedPayment = {
  paymentId: string;
  amount: number;
  allocated: number;
  unallocated: number;
  status: string;
  replayed: boolean;
};

type RpcError = { message?: string; code?: string } | null;

type RpcClient = {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: RpcError }>;
};

function db(): RpcClient {
  return supabase() as unknown as RpcClient;
}

export function invoicePaymentUnavailable(error: RpcError): boolean {
  const message = error?.message ?? "";
  return (
    error?.code === "PGRST202" ||
    message.includes("Could not find the function") ||
    message.includes("schema cache")
  );
}

export function invoicePaymentErrorMessage(error: RpcError): string {
  if (invoicePaymentUnavailable(error)) {
    return "Payment tracking is not available on this database yet";
  }
  const raw = error?.message ?? "Payment request failed";
  const known = [
    "not authorized",
    "not authenticated",
    "duplicate transaction reference",
    "allocation exceeds invoice balance",
    "allocation exceeds payment balance",
    "draft invoice cannot receive a payment",
    "invoice is not issued",
    "invoice not found in this organization",
    "payment not found in this organization",
    "payment is reversed",
    "reversal reason is required",
    "idempotency key is required",
    "credit note reason is required",
    "credit note lines are required",
    "credit note requires an issued invoice",
    "credit exceeds remaining invoice value",
    "credit line amount must be positive",
    "cancellation reason is required",
    "invoice is already cancelled",
    "only an issued invoice can be cancelled",
    "invoice has payments or credits",
    "a recipient is required",
    "bank rows are required",
    "bank line is not open",
    "too many bank rows",
  ];
  const lower = raw.toLowerCase();
  for (const item of known) {
    if (lower.includes(item)) return item;
  }
  return "Payment request failed";
}

function money(value: unknown): number {
  const amount = typeof value === "number" ? value : Number(value);
  return Number.isFinite(amount) ? amount : 0;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

export async function fetchInvoicePaymentSummaries(
  orgId: string,
  invoiceIds: string[],
): Promise<{ error: string | null; unavailable: boolean; summaries: InvoicePaymentSummary[] }> {
  if (invoiceIds.length === 0) return { error: null, unavailable: false, summaries: [] };
  const { data, error } = await db().rpc("invoice_payment_summaries", {
    p_org_id: orgId,
    p_invoice_ids: invoiceIds,
  });
  if (error) {
    return {
      error: invoicePaymentErrorMessage(error),
      unavailable: invoicePaymentUnavailable(error),
      summaries: [],
    };
  }
  const rows = Array.isArray(data) ? data : [];
  return {
    error: null,
    unavailable: false,
    summaries: rows.map((row) => {
      const item = row as Record<string, unknown>;
      return {
        invoiceId: String(item.invoice_id ?? ""),
        invoiceTotal: money(item.invoice_total),
        amountReceived: money(item.amount_received),
        amountOutstanding: money(item.amount_outstanding),
        paymentStatus: String(item.payment_status ?? "unpaid") as InvoicePaymentStatus,
        lastPaymentDate: text(item.last_payment_date),
        lastReference: text(item.last_reference),
        amountCredited: money(item.amount_credited),
      };
    }),
  };
}

export async function fetchInvoicePaymentHistory(
  orgId: string,
  invoiceId: string,
): Promise<{ error: string | null; unavailable: boolean; rows: InvoicePaymentHistoryRow[] }> {
  const { data, error } = await db().rpc("invoice_payment_history", {
    p_org_id: orgId,
    p_invoice_id: invoiceId,
  });
  if (error) {
    return {
      error: invoicePaymentErrorMessage(error),
      unavailable: invoicePaymentUnavailable(error),
      rows: [],
    };
  }
  const rows = Array.isArray(data) ? data : [];
  return {
    error: null,
    unavailable: false,
    rows: rows.map((row) => {
      const item = row as Record<string, unknown>;
      return {
        paymentId: String(item.payment_id ?? ""),
        allocationId: String(item.allocation_id ?? ""),
        paymentDate: String(item.payment_date ?? ""),
        allocationAmount: money(item.allocation_amount),
        paymentAmount: money(item.payment_amount),
        paymentMode: String(item.payment_mode ?? ""),
        transactionReference: text(item.transaction_reference),
        depositAccountLabel: text(item.deposit_account_label),
        notes: text(item.notes),
        status: String(item.status ?? ""),
        reversedAt: text(item.reversed_at),
        reversalReason: text(item.reversal_reason),
      };
    }),
  };
}

export async function fetchCustomerReceivables(
  orgId: string,
  clientId: string,
): Promise<{ error: string | null; unavailable: boolean; receivables: CustomerReceivables | null }> {
  const { data, error } = await db().rpc("customer_invoice_receivables", {
    p_org_id: orgId,
    p_client_id: clientId,
  });
  if (error) {
    return {
      error: invoicePaymentErrorMessage(error),
      unavailable: invoicePaymentUnavailable(error),
      receivables: null,
    };
  }
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | undefined;
  if (!row) return { error: null, unavailable: false, receivables: null };
  return {
    error: null,
    unavailable: false,
    receivables: {
      invoiceCount: Number(row.invoice_count) || 0,
      invoiceTotal: money(row.invoice_total),
      amountReceived: money(row.amount_received),
      amountOutstanding: money(row.amount_outstanding),
      currentAmount: money(row.current_amount),
      days1To30: money(row.days_1_30),
      days31To60: money(row.days_31_60),
      days61To90: money(row.days_61_90),
      daysOver90: money(row.days_over_90),
    },
  };
}

export async function recordInvoicePayment(input: {
  orgId: string;
  clientId: string | null;
  paymentDate: string;
  amount: number;
  paymentMode: string;
  transactionReference: string;
  depositAccountLabel: string;
  notes: string;
  idempotencyKey: string;
  allocations: { invoiceId: string; amount: number }[];
}): Promise<{ error: string | null; payment: RecordedPayment | null }> {
  const { data, error } = await db().rpc("record_invoice_payment", {
    p_org_id: input.orgId,
    p_client_id: input.clientId,
    p_payment_date: input.paymentDate,
    p_amount: input.amount,
    p_payment_mode: input.paymentMode,
    p_transaction_reference: input.transactionReference || null,
    p_deposit_account_id: null,
    p_deposit_account_label: input.depositAccountLabel || null,
    p_notes: input.notes || null,
    p_idempotency_key: input.idempotencyKey,
    p_allocations: input.allocations.map((row) => ({
      invoice_id: row.invoiceId,
      amount: row.amount,
    })),
  });
  if (error) return { error: invoicePaymentErrorMessage(error), payment: null };
  const row = (data ?? {}) as Record<string, unknown>;
  return {
    error: null,
    payment: {
      paymentId: String(row.payment_id ?? ""),
      amount: money(row.amount),
      allocated: money(row.allocated),
      unallocated: money(row.unallocated),
      status: String(row.status ?? ""),
      replayed: row.replayed === true,
    },
  };
}

export async function reverseInvoicePayment(input: {
  orgId: string;
  paymentId: string;
  reason: string;
  idempotencyKey: string;
}): Promise<{ error: string | null }> {
  const { error } = await db().rpc("reverse_invoice_payment", {
    p_org_id: input.orgId,
    p_payment_id: input.paymentId,
    p_reason: input.reason,
    p_idempotency_key: input.idempotencyKey,
  });
  return { error: error ? invoicePaymentErrorMessage(error) : null };
}
