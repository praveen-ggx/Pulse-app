/**
 * Finance books: ledger, statements, receipts, registers, aging, credit notes and
 * bank reconciliation. Every figure comes from a database RPC; nothing here derives
 * a balance from invoice totals or from the trip ledger.
 */
import type { CreditTreatment, InvoiceTaxProfile } from "@/features/invoicing/utils/creditNoteTax.util";
import { getSupabaseBaseUrl, supabase } from "@/lib/supabase";
import { refuseProductionInvoiceWrite } from "@/features/invoicing/utils/invoiceProductionWriteGuard.util";
import {
  invoicePaymentErrorMessage,
  invoicePaymentUnavailable,
} from "@/features/invoicing/services/invoicePayment.service";

type RpcError = { message?: string; code?: string } | null;
type RpcResult = { data: unknown; error: RpcError };

function db() {
  return supabase() as unknown as {
    rpc: (fn: string, args: Record<string, unknown>) => Promise<RpcResult>;
  };
}

/** Cache keys. Every key starts with ["finance-books", orgId] so one invalidation refreshes all books. */
export const financeBooksKeys = {
  all: (orgId: string) => ["finance-books", orgId] as const,
  ledger: (orgId: string, clientId: string, from: string | null, to: string | null, offset: number) =>
    ["finance-books", orgId, "ledger", clientId, from, to, offset] as const,
  aging: (orgId: string, offset: number) => ["finance-books", orgId, "aging", offset] as const,
  invoiceRegister: (orgId: string, clientId: string | null, from: string | null, to: string | null, offset: number, openOnly = false) =>
    ["finance-books", orgId, "invoice-register", clientId, from, to, offset, openOnly] as const,
  paymentRegister: (orgId: string, clientId: string | null, from: string | null, to: string | null, search: string, offset: number) =>
    ["finance-books", orgId, "payment-register", clientId, from, to, search, offset] as const,
  collections: (orgId: string, from: string, to: string) => ["finance-books", orgId, "collections", from, to] as const,
  receipt: (orgId: string, paymentId: string) => ["finance-books", orgId, "receipt", paymentId] as const,
  creditNotes: (orgId: string, clientId: string | null, offset: number) =>
    ["finance-books", orgId, "credit-notes", clientId, offset] as const,
  invoiceHistory: (orgId: string, invoiceId: string) => ["finance-books", orgId, "invoice-history", invoiceId] as const,
  bankLines: (orgId: string, status: BankLineFilter, offset: number) =>
    ["finance-books", orgId, "bank-lines", status, offset] as const,
  bankHistory: (orgId: string, offset: number) => ["finance-books", orgId, "bank-history", offset] as const,
  tripLedgerReceipts: (orgId: string, clientId: string, onlyUnlinked: boolean, offset: number) =>
    ["finance-books", orgId, "trip-ledger-receipts", clientId, onlyUnlinked, offset] as const,
  customerCredit: (orgId: string, clientId: string) => ["finance-books", orgId, "customer-credit", clientId] as const,
  refundSources: (orgId: string, clientId: string) => ["finance-books", orgId, "refund-sources", clientId] as const,
  refunds: (orgId: string, clientId: string | null, offset: number) => ["finance-books", orgId, "refunds", clientId, offset] as const,
  creditableInvoice: (orgId: string, invoiceId: string) => ["finance-books", orgId, "creditable-invoice", invoiceId] as const,
  dashboard: (orgId: string, from: string, to: string) => ["finance-books", orgId, "dashboard", from, to] as const,
};

/** Query keys outside the finance books that read the same balances. */
export const FINANCE_BALANCE_KEY_PREFIXES = [
  "invoice-payment-summaries",
  "customer-invoice-receivables",
  "customer-finance-ledger",
  "customer-receipts",
] as const;

export type Page<T> = { rows: T[]; total: number };
export type BookResult<T> = { error: string | null; unavailable: boolean; data: T };

const MESSAGES: [string, string][] = [
  ["not authenticated", "Sign in again to continue."],
  ["not authorized", "You do not have permission for this finance action."],
  ["duplicate transaction reference", "A receipt with this transaction reference is already recorded."],
  ["allocation exceeds invoice balance", "That amount is more than the invoice's open balance."],
  ["allocation exceeds payment balance", "That is more than the receipt has left to apply."],
  ["allocations must belong to one client", "A receipt can only be applied to one customer's invoices."],
  ["duplicate invoice in allocation", "Each invoice can appear once in a receipt."],
  ["draft invoice cannot receive a payment", "A draft invoice cannot take a payment. Issue it first."],
  ["invoice is not issued", "Only issued invoices can take a payment."],
  ["payment date cannot be in the future", "The payment date cannot be in the future."],
  ["tds must be less than the receipt amount", "TDS must be less than the receipt amount."],
  ["client is required", "Choose the customer first."],
  ["payment amount must be positive", "Enter an amount greater than zero."],
  ["allocation amount must be positive", "Every applied amount must be greater than zero."],
  ["payment is reversed", "This receipt has been reversed."],
  ["reversal reason is required", "Enter why the receipt is being reversed."],
  ["credit exceeds remaining invoice value", "The credit is more than the part of the invoice not yet credited."],
  ["credit exceeds the invoice taxable value", "The taxable value is more than the invoice still carries."],
  ["credit exceeds the invoice tax", "The credit is more than the tax left on the invoice."],
  ["tax components do not match the invoice gst", "The GST figures changed on the server. Reload the invoice and review the credit note again."],
  ["carries no gst", "This invoice carries no GST. Issue the credit note without GST."],
  ["mixes igst", "This invoice mixes IGST with CGST/SGST, so its tax cannot be credited automatically."],
  ["more than one gst rate", "This invoice has more than one GST rate. GST credit notes support single-rate invoices only."],
  ["gst rate is unavailable", "This invoice's GST rate is not available."],
  ["earlier credit note without a gst breakup", "This invoice has an earlier credit note without a GST breakup."],
  ["without gst cannot carry tax", "A credit note without GST cannot carry tax."],
  ["credit tax cannot be split", "The tax cannot be split across these lines. Credit it as one line."],
  ["at most two decimals", "Amounts have at most two decimals."],
  ["credit note date cannot be before the invoice date", "The credit note date cannot be before the invoice date."],
  ["credit note date cannot be in the future", "The credit note date cannot be in the future."],
  ["refund exceeds the refundable balance", "That is more than can be refunded from this receipt or credit note."],
  ["nothing is refundable from this source", "Nothing is left to refund from this receipt or credit note."],
  ["a reversed receipt cannot be refunded", "A reversed receipt cannot be refunded."],
  ["tds is not cash", "TDS is not cash and cannot be refunded."],
  ["refund date cannot be before", "The refund date cannot be before the receipt or credit note date."],
  ["refund date cannot be in the future", "The refund date cannot be in the future."],
  ["choose how the refund was paid", "Choose how the refund was paid."],
  ["refund is already reversed", "This refund is already reversed."],
  ["reverse the refunds first", "This receipt has refunds. Reverse them before reversing the receipt."],
  ["refund not found in this organization", "That refund is not available."],
  ["credit note not found in this organization", "That credit note is not available."],
  ["receipt not found in this organization", "That receipt is not available."],
  ["credit note reason is required", "Enter the reason for the credit note."],
  ["credit note requires an issued invoice", "Credit notes can only be raised on issued invoices."],
  ["tax_within_amount", "The tax part cannot be more than the credit amount."],
  ["cancellation reason is required", "Enter why the invoice is being cancelled."],
  ["invoice is already cancelled", "This invoice is already cancelled."],
  ["only an issued invoice can be cancelled", "Only issued invoices can be cancelled."],
  ["invoice has payments or credits", "This invoice has receipts or credit notes. Reverse them before cancelling."],
  ["only a bank credit can be matched", "Only a bank credit can be matched to a receipt."],
  ["a tds receipt has no bank credit", "A TDS-only receipt has no bank credit to match."],
  ["receipt is already matched to another bank line", "This receipt is already matched to another bank line."],
  ["bank line is not open", "This bank line is already matched."],
  ["bank line is not matched", "This bank line is not matched."],
  ["a reason is required to unmatch", "Enter why the match is being removed."],
  ["exactly one of credit or debit", "Each bank row needs either a credit or a debit amount."],
  ["has an invalid date or amount", "A bank row has a date or amount that could not be read."],
  ["too many bank rows", "Import at most 500 bank rows at a time."],
  ["bank rows are required", "Add at least one bank row."],
  ["trip ledger receipt is already linked", "This trip-ledger receipt is already linked to an invoice payment."],
  ["belongs to another party", "This trip-ledger entry belongs to another party."],
  ["trip ledger entry is not a receipt", "This trip-ledger entry is not money received."],
  ["statement end is before its start", "The end date is before the start date."],
  ["client not found in this organization", "This customer is not in your workspace."],
  ["invoice not found in this organization", "That invoice is not in your workspace."],
  ["payment not found in this organization", "That receipt is not available."],
];

export function financeBooksErrorMessage(error: RpcError): string {
  if (invoicePaymentUnavailable(error)) return "Finance books are not available on this database yet.";
  const raw = (error?.message ?? "").toLowerCase();
  for (const [needle, copy] of MESSAGES) {
    if (raw.includes(needle)) return copy;
  }
  return invoicePaymentErrorMessage(error);
}

function money(value: unknown): number {
  const amount = typeof value === "number" ? value : Number(value);
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : 0;
}

function maybeMoney(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : null;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function rows(data: unknown): Record<string, unknown>[] {
  return Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
}

function totalOf(list: Record<string, unknown>[]): number {
  return list.length ? Number(list[0]!.total_count) || 0 : 0;
}

async function call<T>(fn: string, args: Record<string, unknown>, map: (data: unknown) => T, empty: T): Promise<BookResult<T>> {
  const { data, error } = await db().rpc(fn, args);
  if (error) {
    return { error: financeBooksErrorMessage(error), unavailable: invoicePaymentUnavailable(error), data: empty };
  }
  return { error: null, unavailable: false, data: map(data) };
}

// ---------------------------------------------------------------------------
// Customer ledger and statement
// ---------------------------------------------------------------------------

export type LedgerEntryType =
  | "invoice"
  | "credit_note"
  | "payment"
  | "allocation"
  | "reversal"
  | "cancellation"
  | "refund"
  | "refund_reversal";

export type CustomerLedgerEntry = {
  key: string;
  date: string;
  type: LedgerEntryType;
  number: string | null;
  reference: string | null;
  description: string | null;
  invoiceId: string | null;
  paymentId: string | null;
  creditNoteId: string | null;
  debit: number;
  credit: number;
  runningBalance: number;
};

export type CustomerLedgerPage = Page<CustomerLedgerEntry> & {
  openingBalance: number;
  closingBalance: number;
  periodDebit: number;
  periodCredit: number;
};

export const EMPTY_LEDGER_PAGE: CustomerLedgerPage = {
  rows: [],
  total: 0,
  openingBalance: 0,
  closingBalance: 0,
  periodDebit: 0,
  periodCredit: 0,
};

export const LEDGER_PAGE_SIZE = 50;

function mapLedger(data: unknown): CustomerLedgerPage {
  const list = rows(data);
  const first = list[0];
  return {
    rows: list.map((item) => ({
      key: String(item.entry_key ?? ""),
      date: String(item.entry_date ?? ""),
      type: String(item.entry_type ?? "invoice") as LedgerEntryType,
      number: str(item.entry_number),
      reference: str(item.reference),
      description: str(item.description),
      invoiceId: str(item.invoice_id),
      paymentId: str(item.payment_id),
      creditNoteId: str(item.credit_note_id),
      debit: money(item.debit),
      credit: money(item.credit),
      runningBalance: money(item.running_balance),
    })),
    total: totalOf(list),
    openingBalance: money(first?.opening_balance),
    closingBalance: money(first?.closing_balance),
    periodDebit: money(first?.period_debit),
    periodCredit: money(first?.period_credit),
  };
}

export function fetchCustomerLedgerPage(args: {
  orgId: string;
  clientId: string;
  from: string | null;
  to: string | null;
  offset: number;
  limit?: number;
}) {
  return call(
    "customer_ledger_entries",
    {
      p_org_id: args.orgId,
      p_client_id: args.clientId,
      p_from: args.from,
      p_to: args.to,
      p_limit: args.limit ?? LEDGER_PAGE_SIZE,
      p_offset: args.offset,
    },
    mapLedger,
    EMPTY_LEDGER_PAGE,
  );
}

/** Upper bound for a statement or full export, in rows. */
export const STATEMENT_ROW_LIMIT = 5000;

/** Every entry in the period, in pages of 500, with the period totals from the server. */
export async function fetchCustomerStatement(args: {
  orgId: string;
  clientId: string;
  from: string | null;
  to: string | null;
}): Promise<BookResult<CustomerLedgerPage & { truncated: boolean }>> {
  const all: CustomerLedgerEntry[] = [];
  let header: CustomerLedgerPage | null = null;
  for (let offset = 0; offset < STATEMENT_ROW_LIMIT; offset += 500) {
    const page = await fetchCustomerLedgerPage({ ...args, offset, limit: 500 });
    if (page.error) return { ...page, data: { ...EMPTY_LEDGER_PAGE, truncated: false } };
    header = header ?? page.data;
    all.push(...page.data.rows);
    if (page.data.rows.length < 500) break;
  }
  const base = header ?? EMPTY_LEDGER_PAGE;
  return {
    error: null,
    unavailable: false,
    data: { ...base, rows: all, truncated: base.total > all.length },
  };
}

// ---------------------------------------------------------------------------
// Receipts
// ---------------------------------------------------------------------------

export type PaymentMode = "neft" | "rtgs" | "imps" | "upi" | "bank" | "cheque" | "cash" | "tds" | "other";

export const PAYMENT_MODE_LABELS: Record<PaymentMode, string> = {
  neft: "NEFT",
  rtgs: "RTGS",
  imps: "IMPS",
  upi: "UPI",
  bank: "Bank transfer",
  cheque: "Cheque",
  cash: "Cash",
  tds: "TDS",
  other: "Other",
};

export function paymentModeLabel(mode: string | null | undefined): string {
  return PAYMENT_MODE_LABELS[(mode ?? "") as PaymentMode] ?? (mode || "—");
}

export type ReceiptAllocation = {
  invoiceId: string;
  invoiceNumber: string;
  invoiceDate: string | null;
  invoiceTotal: number;
  amount: number;
  status: "confirmed" | "reversed";
};

export type ReceiptParty = {
  legalName: string | null;
  addressLines: string[];
  gstin: string | null;
  pan: string | null;
  phone: string | null;
  email: string | null;
  logoUrl: string | null;
};

export type PaymentReceipt = {
  paymentId: string;
  receiptNumber: string;
  status: "recorded" | "reversed";
  paymentDate: string;
  paymentMode: string;
  transactionReference: string | null;
  depositAccountLabel: string | null;
  notes: string | null;
  amount: number;
  tdsAmount: number;
  bankAmount: number;
  allocated: number;
  unallocated: number;
  /** Recorded refunds paid out of this receipt's unapplied money. */
  refunded: number;
  refunds: { refundNumber: string; refundDate: string; amount: number; status: "recorded" | "reversed"; mode: string }[];
  allocations: ReceiptAllocation[];
  recordedBy: string | null;
  recordedAt: string | null;
  reversedAt: string | null;
  reversedBy: string | null;
  reversalReason: string | null;
  issuer: ReceiptParty;
  customer: ReceiptParty | null;
};

function party(value: unknown, kind: "issuer" | "customer"): ReceiptParty | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const addressLines =
    kind === "issuer"
      ? [
          str(item.address_line),
          str(item.locality),
          [str(item.city), str(item.state), str(item.pincode)].filter(Boolean).join(", ") || null,
        ].filter((line): line is string => Boolean(line))
      : [str(item.billing_address), str(item.state)].filter((line): line is string => Boolean(line));
  return {
    legalName: str(item.legal_name),
    addressLines,
    gstin: str(item.gstin),
    pan: str(item.business_pan) ?? str(item.pan),
    phone: str(item.phone),
    email: str(item.email),
    logoUrl: str(item.logo_url),
  };
}

export function mapPaymentReceipt(data: unknown): PaymentReceipt | null {
  if (!data || typeof data !== "object") return null;
  const item = data as Record<string, unknown>;
  const allocations = Array.isArray(item.allocations) ? (item.allocations as Record<string, unknown>[]) : [];
  return {
    paymentId: String(item.payment_id ?? ""),
    receiptNumber: String(item.receipt_number ?? ""),
    status: item.status === "reversed" ? "reversed" : "recorded",
    paymentDate: String(item.payment_date ?? ""),
    paymentMode: String(item.payment_mode ?? ""),
    transactionReference: str(item.transaction_reference),
    depositAccountLabel: str(item.deposit_account_label),
    notes: str(item.notes),
    amount: money(item.amount),
    tdsAmount: money(item.tds_amount),
    bankAmount: money(item.bank_amount),
    allocated: money(item.allocated),
    unallocated: money(item.unallocated),
    refunded: money(item.refunded),
    refunds: (Array.isArray(item.refunds) ? (item.refunds as Record<string, unknown>[]) : []).map((row) => ({
      refundNumber: String(row.refund_number ?? ""),
      refundDate: String(row.refund_date ?? ""),
      amount: money(row.amount),
      status: row.status === "reversed" ? "reversed" : "recorded",
      mode: String(row.refund_mode ?? ""),
    })),
    allocations: allocations.map((row) => ({
      invoiceId: String(row.invoice_id ?? ""),
      invoiceNumber: String(row.invoice_number ?? ""),
      invoiceDate: str(row.invoice_date),
      invoiceTotal: money(row.invoice_total),
      amount: money(row.amount),
      status: row.status === "reversed" ? "reversed" : "confirmed",
    })),
    recordedBy: str(item.recorded_by),
    recordedAt: str(item.recorded_at),
    reversedAt: str(item.reversed_at),
    reversedBy: str(item.reversed_by),
    reversalReason: str(item.reversal_reason),
    issuer: party(item.issuer, "issuer") ?? {
      legalName: null,
      addressLines: [],
      gstin: null,
      pan: null,
      phone: null,
      email: null,
      logoUrl: null,
    },
    customer: party(item.customer, "customer"),
  };
}

export function fetchPaymentReceipt(orgId: string, paymentId: string) {
  return call(
    "invoice_payment_receipt",
    { p_org_id: orgId, p_payment_id: paymentId },
    mapPaymentReceipt,
    null as PaymentReceipt | null,
  );
}

export type CustomerReceiptInput = {
  orgId: string;
  clientId: string;
  paymentDate: string;
  bankAmount: number;
  tdsAmount: number;
  paymentMode: PaymentMode;
  reference: string;
  depositAccountLabel: string;
  notes: string;
  idempotencyKey: string;
  allocations: { invoiceId: string; amount: number }[];
};

export type RecordedReceipt = {
  paymentId: string;
  receiptNumber: string;
  amount: number;
  allocated: number;
  unallocated: number;
  replayed: boolean;
};

export async function recordCustomerReceipt(input: CustomerReceiptInput): Promise<{ error: string | null; receipt: RecordedReceipt | null }> {
  try {
    refuseProductionInvoiceWrite(getSupabaseBaseUrl());
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error), receipt: null };
  }
  const { data, error } = await db().rpc("record_customer_receipt", {
    p_org_id: input.orgId,
    p_client_id: input.clientId,
    p_payment_date: input.paymentDate,
    p_bank_amount: input.bankAmount,
    p_tds_amount: input.tdsAmount,
    p_payment_mode: input.paymentMode,
    p_transaction_reference: input.reference.trim() || null,
    p_deposit_account_id: null,
    p_deposit_account_label: input.depositAccountLabel.trim() || null,
    p_notes: input.notes.trim() || null,
    p_idempotency_key: input.idempotencyKey,
    p_allocations: input.allocations
      .filter((row) => row.amount > 0)
      .map((row) => ({ invoice_id: row.invoiceId, amount: row.amount })),
  });
  if (error) return { error: financeBooksErrorMessage(error), receipt: null };
  const row = (data ?? {}) as Record<string, unknown>;
  return {
    error: null,
    receipt: {
      paymentId: String(row.payment_id ?? ""),
      receiptNumber: String(row.receipt_number ?? ""),
      amount: money(row.amount),
      allocated: money(row.allocated),
      unallocated: money(row.unallocated),
      replayed: row.replayed === true,
    },
  };
}

export async function allocateReceipt(input: {
  orgId: string;
  paymentId: string;
  allocations: { invoiceId: string; amount: number }[];
  idempotencyKey: string;
}): Promise<{ error: string | null }> {
  const { error } = await db().rpc("allocate_invoice_payment", {
    p_org_id: input.orgId,
    p_payment_id: input.paymentId,
    p_allocations: input.allocations.map((row) => ({ invoice_id: row.invoiceId, amount: row.amount })),
    p_idempotency_key: input.idempotencyKey,
  });
  return { error: error ? financeBooksErrorMessage(error) : null };
}

export async function reverseReceipt(input: {
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
  return { error: error ? financeBooksErrorMessage(error) : null };
}

// ---------------------------------------------------------------------------
// Registers, aging, collections
// ---------------------------------------------------------------------------

export type PaymentRegisterRow = {
  paymentId: string;
  receiptNumber: string;
  paymentDate: string;
  clientId: string | null;
  clientName: string | null;
  amount: number;
  tdsAmount: number;
  bankAmount: number;
  allocated: number;
  unallocated: number;
  paymentMode: string;
  reference: string | null;
  status: "recorded" | "reversed";
  bankLineId: string | null;
  refunded: number;
};

export const REGISTER_PAGE_SIZE = 50;

export function fetchPaymentRegister(args: {
  orgId: string;
  clientId?: string | null;
  from?: string | null;
  to?: string | null;
  search?: string;
  offset: number;
  limit?: number;
}) {
  return call(
    "invoice_payment_register",
    {
      p_org_id: args.orgId,
      p_client_id: args.clientId ?? null,
      p_from: args.from ?? null,
      p_to: args.to ?? null,
      p_search: args.search?.trim() || null,
      p_limit: args.limit ?? REGISTER_PAGE_SIZE,
      p_offset: args.offset,
    },
    (data): Page<PaymentRegisterRow> => {
      const list = rows(data);
      return {
        total: totalOf(list),
        rows: list.map((item) => ({
          paymentId: String(item.payment_id ?? ""),
          receiptNumber: String(item.receipt_number ?? ""),
          paymentDate: String(item.payment_date ?? ""),
          clientId: str(item.client_id),
          clientName: str(item.client_name),
          amount: money(item.amount),
          tdsAmount: money(item.tds_amount),
          bankAmount: money(item.bank_amount),
          allocated: money(item.allocated),
          unallocated: money(item.unallocated),
          paymentMode: String(item.payment_mode ?? ""),
          reference: str(item.transaction_reference),
          status: item.status === "reversed" ? "reversed" : "recorded",
          bankLineId: str(item.bank_line_id),
          refunded: money(item.refunded),
        })),
      };
    },
    { rows: [], total: 0 },
  );
}

export type InvoiceRegisterRow = {
  invoiceId: string;
  invoiceNumber: string;
  invoiceDate: string | null;
  dueDate: string | null;
  clientId: string | null;
  clientName: string | null;
  status: string;
  total: number;
  received: number;
  credited: number;
  outstanding: number;
};

export function fetchInvoiceRegister(args: {
  orgId: string;
  clientId?: string | null;
  from?: string | null;
  to?: string | null;
  offset: number;
  limit?: number;
  /** Only issued invoices with an open balance, oldest due first. */
  openOnly?: boolean;
}) {
  return call(
    "invoice_register",
    {
      p_org_id: args.orgId,
      p_client_id: args.clientId ?? null,
      p_from: args.from ?? null,
      p_to: args.to ?? null,
      p_limit: args.limit ?? REGISTER_PAGE_SIZE,
      p_offset: args.offset,
      p_open_only: args.openOnly ?? false,
    },
    (data): Page<InvoiceRegisterRow> => {
      const list = rows(data);
      return {
        total: totalOf(list),
        rows: list.map((item) => ({
          invoiceId: String(item.invoice_id ?? ""),
          invoiceNumber: String(item.invoice_number ?? ""),
          invoiceDate: str(item.invoice_date),
          dueDate: str(item.due_date),
          clientId: str(item.client_id),
          clientName: str(item.client_name),
          status: String(item.status ?? ""),
          total: money(item.invoice_total),
          received: money(item.amount_received),
          credited: money(item.amount_credited),
          outstanding: money(item.amount_outstanding),
        })),
      };
    },
    { rows: [], total: 0 },
  );
}

/** Every open invoice for one customer, oldest due first (for applying a receipt). */
export async function fetchOpenInvoicesForClient(orgId: string, clientId: string): Promise<BookResult<InvoiceRegisterRow[]>> {
  const all: InvoiceRegisterRow[] = [];
  for (let offset = 0; offset < 2000; offset += 200) {
    const page = await fetchInvoiceRegister({ orgId, clientId, offset, limit: 200, openOnly: true });
    if (page.error) return { ...page, data: [] };
    all.push(...page.data.rows);
    if (page.data.rows.length < 200) break;
  }
  return { error: null, unavailable: false, data: all };
}

export type AgingRow = {
  clientId: string;
  clientName: string;
  invoiceCount: number;
  invoiceTotal: number;
  received: number;
  credited: number;
  outstanding: number;
  current: number;
  days1To30: number;
  days31To60: number;
  days61To90: number;
  daysOver90: number;
  oldestDue: string | null;
};

export function fetchOrgAging(orgId: string, offset: number, limit = 100) {
  return call(
    "org_receivables_aging",
    { p_org_id: orgId, p_limit: limit, p_offset: offset },
    (data): Page<AgingRow> => {
      const list = rows(data);
      return {
        total: totalOf(list),
        rows: list.map((item) => ({
          clientId: String(item.client_id ?? ""),
          clientName: String(item.client_name ?? "Customer"),
          invoiceCount: Number(item.invoice_count) || 0,
          invoiceTotal: money(item.invoice_total),
          received: money(item.amount_received),
          credited: money(item.amount_credited),
          outstanding: money(item.amount_outstanding),
          current: money(item.current_amount),
          days1To30: money(item.days_1_30),
          days31To60: money(item.days_31_60),
          days61To90: money(item.days_61_90),
          daysOver90: money(item.days_over_90),
          oldestDue: str(item.oldest_due),
        })),
      };
    },
    { rows: [], total: 0 },
  );
}

export type CollectionsRow = {
  month: string;
  paymentMode: string;
  receiptCount: number;
  bankAmount: number;
  tdsAmount: number;
  settledAmount: number;
};

export function fetchCollections(orgId: string, from: string, to: string) {
  return call(
    "invoice_collections_summary",
    { p_org_id: orgId, p_from: from, p_to: to },
    (data): CollectionsRow[] =>
      rows(data).map((item) => ({
        month: String(item.month ?? ""),
        paymentMode: String(item.payment_mode ?? ""),
        receiptCount: Number(item.receipt_count) || 0,
        bankAmount: money(item.bank_amount),
        tdsAmount: money(item.tds_amount),
        settledAmount: money(item.settled_amount),
      })),
    [] as CollectionsRow[],
  );
}

// ---------------------------------------------------------------------------
// Credit notes
// ---------------------------------------------------------------------------

export type CreditNoteRow = {
  id: string;
  creditNumber: string;
  creditDate: string;
  status: "issued" | "void";
  reason: string;
  amount: number;
  taxAmount: number;
  /** gst: breakup derived from the invoice; no_gst: value only; legacy: issued before the breakup existed. */
  taxTreatment: "gst" | "no_gst" | "legacy";
  supplyType: "intra" | "inter" | null;
  gstRate: number | null;
  taxableAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  refunded: number;
  invoiceId: string;
  invoiceNumber: string;
  invoiceDate: string | null;
  invoiceTotal: number;
  clientId: string;
  clientName: string | null;
  issuedBy: string | null;
  createdAt: string | null;
  lines: { description: string; amount: number; taxAmount: number; cgstAmount: number; sgstAmount: number; igstAmount: number }[];
};

export function fetchCreditNotes(args: { orgId: string; clientId?: string | null; offset: number; limit?: number }) {
  return call(
    "invoice_credit_note_register",
    {
      p_org_id: args.orgId,
      p_client_id: args.clientId ?? null,
      p_limit: args.limit ?? REGISTER_PAGE_SIZE,
      p_offset: args.offset,
    },
    (data): Page<CreditNoteRow> => {
      const list = rows(data);
      return {
        total: totalOf(list),
        rows: list.map((item) => ({
          id: String(item.credit_note_id ?? ""),
          creditNumber: String(item.credit_number ?? ""),
          creditDate: String(item.credit_date ?? ""),
          status: item.status === "void" ? "void" : "issued",
          reason: String(item.reason ?? ""),
          amount: money(item.amount),
          taxAmount: money(item.tax_amount),
          taxTreatment: item.tax_treatment === "gst" ? "gst" : item.tax_treatment === "no_gst" ? "no_gst" : "legacy",
          supplyType: item.supply_type === "intra" || item.supply_type === "inter" ? item.supply_type : null,
          gstRate: maybeMoney(item.gst_rate),
          taxableAmount: maybeMoney(item.taxable_amount) ?? money(item.amount) - money(item.tax_amount),
          cgstAmount: money(item.cgst_amount),
          sgstAmount: money(item.sgst_amount),
          igstAmount: money(item.igst_amount),
          refunded: money(item.refunded),
          invoiceId: String(item.invoice_id ?? ""),
          invoiceNumber: String(item.invoice_number ?? ""),
          invoiceDate: str(item.invoice_date),
          invoiceTotal: money(item.invoice_total),
          clientId: String(item.client_id ?? ""),
          clientName: str(item.client_name),
          issuedBy: str(item.issued_by),
          createdAt: str(item.created_at),
          lines: (Array.isArray(item.lines) ? (item.lines as Record<string, unknown>[]) : []).map((line) => ({
            description: String(line.description ?? ""),
            amount: money(line.amount),
            taxAmount: money(line.tax_amount),
            cgstAmount: money(line.cgst_amount),
            sgstAmount: money(line.sgst_amount),
            igstAmount: money(line.igst_amount),
          })),
        })),
      };
    },
    { rows: [], total: 0 },
  );
}

export type InvoiceHistoryEvent = {
  at: string;
  type: string;
  amount: number | null;
  reference: string | null;
  reason: string | null;
  actor: string | null;
};

export function fetchInvoiceFinanceHistory(orgId: string, invoiceId: string) {
  return call(
    "invoice_finance_history",
    { p_org_id: orgId, p_invoice_id: invoiceId },
    (data): InvoiceHistoryEvent[] =>
      rows(data).map((item) => ({
        at: String(item.event_at ?? ""),
        type: String(item.event_type ?? ""),
        amount: maybeMoney(item.amount),
        reference: str(item.reference),
        reason: str(item.reason),
        actor: str(item.actor_name),
      })),
    [] as InvoiceHistoryEvent[],
  );
}

// ---------------------------------------------------------------------------
// Bank reconciliation
// ---------------------------------------------------------------------------

export type BankLineFilter = "all" | "unmatched" | "matched" | "attention";

export type BankLine = {
  id: string;
  txnDate: string;
  reference: string | null;
  description: string | null;
  debit: number;
  credit: number;
  status: "matched" | "unmatched";
  matchedPaymentId: string | null;
  receiptNumber: string | null;
  receiptDate: string | null;
  receiptBankAmount: number | null;
  receiptStatus: string | null;
  clientName: string | null;
  difference: number | null;
  warning: string | null;
  matchedAt: string | null;
};

export function fetchBankLines(orgId: string, filter: BankLineFilter, offset: number, limit = REGISTER_PAGE_SIZE) {
  return call(
    "bank_reconciliation_lines",
    { p_org_id: orgId, p_status: filter === "all" ? null : filter, p_limit: limit, p_offset: offset },
    (data): Page<BankLine> => {
      const list = rows(data);
      return {
        total: totalOf(list),
        rows: list.map((item) => ({
          id: String(item.line_id ?? ""),
          txnDate: String(item.txn_date ?? ""),
          reference: str(item.reference),
          description: str(item.description),
          debit: money(item.debit),
          credit: money(item.credit),
          status: item.status === "matched" ? "matched" : "unmatched",
          matchedPaymentId: str(item.matched_payment_id),
          receiptNumber: str(item.receipt_number),
          receiptDate: str(item.receipt_date),
          receiptBankAmount: maybeMoney(item.receipt_bank_amount),
          receiptStatus: str(item.receipt_status),
          clientName: str(item.client_name),
          difference: maybeMoney(item.difference),
          warning: str(item.warning),
          matchedAt: str(item.matched_at),
        })),
      };
    },
    { rows: [], total: 0 },
  );
}

export type BankHistoryEvent = {
  id: string;
  type: "bank_import" | "bank_matched" | "bank_unmatched" | string;
  reason: string | null;
  payload: Record<string, unknown>;
  actor: string | null;
  at: string;
};

export function fetchBankHistory(orgId: string, offset: number, limit = 20) {
  return call(
    "bank_reconciliation_history",
    { p_org_id: orgId, p_limit: limit, p_offset: offset },
    (data): Page<BankHistoryEvent> => {
      const list = rows(data);
      return {
        total: totalOf(list),
        rows: list.map((item) => ({
          id: String(item.event_id ?? ""),
          type: String(item.event_type ?? ""),
          reason: str(item.reason),
          payload: item.payload && typeof item.payload === "object" ? (item.payload as Record<string, unknown>) : {},
          actor: str(item.actor_name),
          at: String(item.created_at ?? ""),
        })),
      };
    },
    { rows: [], total: 0 },
  );
}

export type BankImportRow = {
  txn_date: string;
  reference: string;
  description: string;
  credit: string;
  debit: string;
};

export async function importBankStatement(orgId: string, rowsIn: BankImportRow[], idempotencyKey: string) {
  const { data, error } = await db().rpc("import_bank_statement", {
    p_org_id: orgId,
    p_rows: rowsIn,
    p_idempotency_key: idempotencyKey,
  });
  if (error) return { error: financeBooksErrorMessage(error), inserted: 0, duplicates: 0, replayed: false };
  const row = (data ?? {}) as Record<string, unknown>;
  return {
    error: null,
    inserted: Number(row.inserted) || 0,
    duplicates: Number(row.duplicates) || 0,
    replayed: row.replayed === true,
  };
}

export async function matchBankLine(orgId: string, lineId: string, paymentId: string) {
  const { data, error } = await db().rpc("match_bank_line", {
    p_org_id: orgId,
    p_line_id: lineId,
    p_payment_id: paymentId,
  });
  if (error) return { error: financeBooksErrorMessage(error), difference: null as number | null };
  return { error: null, difference: maybeMoney((data as Record<string, unknown> | null)?.difference) };
}

export async function unmatchBankLine(orgId: string, lineId: string, reason: string) {
  const { error } = await db().rpc("unmatch_bank_line", {
    p_org_id: orgId,
    p_line_id: lineId,
    p_reason: reason,
  });
  return { error: error ? financeBooksErrorMessage(error) : null };
}

// ---------------------------------------------------------------------------
// Trip-ledger receipts (legacy capture) and the explicit link
// ---------------------------------------------------------------------------

export type TripLedgerReceipt = {
  transactionId: string;
  date: string;
  amount: number;
  category: string | null;
  reference: string | null;
  description: string | null;
  tripId: string | null;
  linkedPaymentId: string | null;
  linkedReceiptNumber: string | null;
};

export function fetchTripLedgerReceipts(args: {
  orgId: string;
  clientId: string;
  onlyUnlinked: boolean;
  offset: number;
  limit?: number;
}) {
  return call(
    "trip_ledger_receipts_for_invoicing",
    {
      p_org_id: args.orgId,
      p_client_id: args.clientId,
      p_only_unlinked: args.onlyUnlinked,
      p_limit: args.limit ?? REGISTER_PAGE_SIZE,
      p_offset: args.offset,
    },
    (data): Page<TripLedgerReceipt> => {
      const list = rows(data);
      return {
        total: totalOf(list),
        rows: list.map((item) => ({
          transactionId: String(item.transaction_id ?? ""),
          date: String(item.transaction_date ?? ""),
          amount: money(item.amount),
          category: str(item.ledger_category),
          reference: str(item.payment_reference),
          description: str(item.description),
          tripId: str(item.trip_id),
          linkedPaymentId: str(item.linked_payment_id),
          linkedReceiptNumber: str(item.linked_receipt_number),
        })),
      };
    },
    { rows: [], total: 0 },
  );
}

export async function linkTripLedgerReceipt(input: {
  orgId: string;
  transactionId: string;
  clientId: string;
  allocations: { invoiceId: string; amount: number }[];
  idempotencyKey: string;
}): Promise<{ error: string | null; receiptNumber: string | null }> {
  const { data, error } = await db().rpc("link_trip_receipt_to_invoice_payment", {
    p_org_id: input.orgId,
    p_transaction_id: input.transactionId,
    p_client_id: input.clientId,
    p_allocations: input.allocations
      .filter((row) => row.amount > 0)
      .map((row) => ({ invoice_id: row.invoiceId, amount: row.amount })),
    p_idempotency_key: input.idempotencyKey,
  });
  if (error) return { error: financeBooksErrorMessage(error), receiptNumber: null };
  return { error: null, receiptNumber: str((data as Record<string, unknown> | null)?.receipt_number) };
}

/** Client-generated idempotency key; one per user intent, reused on retry. */
export function newFinanceKey(prefix: string): string {
  const random =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  return `${prefix}-${random}`;
}

// ---------------------------------------------------------------------------
// Statement header parties (organization + client rows; RLS-scoped reads)
// ---------------------------------------------------------------------------

export async function fetchStatementParties(
  orgId: string,
  clientId: string,
): Promise<BookResult<{ issuer: ReceiptParty; customer: ReceiptParty } | null>> {
  const client = supabase();
  const [org, customer] = await Promise.all([
    client
      .from("organizations")
      .select("name, address_line, locality, city, state, pincode, gstin, gst_not_applicable, business_pan, logo_url")
      .eq("id", orgId)
      .maybeSingle(),
    client
      .from("clients")
      .select("name, legal_name, gstin, pan_number, billing_address, registered_address, address, state, phone, email, billing_contact_phone, billing_contact_email")
      .eq("id", clientId)
      .eq("organization_id", orgId)
      .maybeSingle(),
  ]);
  const error = org.error ?? customer.error;
  if (error) return { error: financeBooksErrorMessage(error), unavailable: false, data: null };
  const o = (org.data ?? {}) as Record<string, unknown>;
  const c = (customer.data ?? {}) as Record<string, unknown>;
  if (!customer.data) return { error: "This customer is not in your workspace.", unavailable: false, data: null };
  const issuer = party(
    {
      legal_name: o.name,
      address_line: o.address_line,
      locality: o.locality,
      city: o.city,
      state: o.state,
      pincode: o.pincode,
      gstin: o.gst_not_applicable ? null : o.gstin,
      business_pan: o.business_pan,
      logo_url: o.logo_url,
    },
    "issuer",
  )!;
  const customerParty = party(
    {
      legal_name: str(c.legal_name) ?? c.name,
      gstin: c.gstin,
      pan: c.pan_number,
      billing_address: str(c.billing_address) ?? str(c.registered_address) ?? str(c.address),
      state: c.state,
      phone: str(c.billing_contact_phone) ?? c.phone,
      email: str(c.billing_contact_email) ?? c.email,
    },
    "customer",
  )!;
  return { error: null, unavailable: false, data: { issuer, customer: customerParty } };
}

// ---------------------------------------------------------------------------
// Credit notes with a GST breakup (20271103234500)
// ---------------------------------------------------------------------------

type LooseQuery = PromiseLike<{ data: unknown; error: RpcError }> & {
  select: (columns: string) => LooseQuery;
  eq: (column: string, value: unknown) => LooseQuery;
};

/** The invoice figures the credit-note preview needs. RLS-scoped reads plus the summary RPC. */
export async function fetchCreditableInvoice(orgId: string, invoiceId: string): Promise<BookResult<InvoiceTaxProfile | null>> {
  const client = supabase();
  const [invoice, notes, summary] = await Promise.all([
    client
      .from("invoices")
      .select("id, invoice_number, invoice_date, status, subtotal, gst_rate, cgst_amount, sgst_amount, igst_amount, total_amount, line_items, tax_snapshot")
      .eq("org_id", orgId)
      .eq("id", invoiceId)
      .maybeSingle(),
    // Not in database.types.ts until types are regenerated after 20271103234500.
    (client as unknown as { from: (table: string) => LooseQuery })
      .from("invoice_credit_notes")
      .select("amount, tax_amount, taxable_amount, cgst_amount, sgst_amount, igst_amount, tax_treatment")
      .eq("org_id", orgId)
      .eq("invoice_id", invoiceId)
      .eq("status", "issued"),
    db().rpc("invoice_payment_summaries", { p_org_id: orgId, p_invoice_ids: [invoiceId] }),
  ]);
  const error = invoice.error ?? notes.error ?? summary.error;
  if (error) {
    return { error: financeBooksErrorMessage(error), unavailable: invoicePaymentUnavailable(error), data: null };
  }
  if (!invoice.data) return { error: "That invoice is not in your workspace.", unavailable: false, data: null };
  const row = invoice.data as Record<string, unknown>;
  const lineItems = Array.isArray(row.line_items) ? (row.line_items as Record<string, unknown>[]) : [];
  const lineRates = Array.from(
    new Set(
      lineItems
        .map((line) => line.tax_rate)
        .filter((rate) => rate !== null && rate !== undefined && rate !== "" && Number.isFinite(Number(rate)))
        .map((rate) => Number(rate)),
    ),
  );
  const prior = { total: 0, gstTaxable: 0, cgst: 0, sgst: 0, igst: 0, legacyTaxed: 0 };
  for (const note of rows(notes.data)) {
    prior.total += money(note.amount);
    if (note.tax_treatment === "gst") prior.gstTaxable += money(note.taxable_amount);
    prior.cgst += money(note.cgst_amount);
    prior.sgst += money(note.sgst_amount);
    prior.igst += money(note.igst_amount);
    if (note.tax_treatment === "legacy" && money(note.tax_amount) > 0) prior.legacyTaxed += 1;
  }
  const settled = rows(summary.data)[0] ?? {};
  const snapshot = row.tax_snapshot && typeof row.tax_snapshot === "object" ? (row.tax_snapshot as Record<string, unknown>) : {};
  return {
    error: null,
    unavailable: false,
    data: {
      invoiceId: String(row.id ?? ""),
      invoiceNumber: String(row.invoice_number ?? ""),
      invoiceDate: str(row.invoice_date),
      status: String(row.status ?? ""),
      subtotal: maybeMoney(row.subtotal),
      gstRate: Number(row.gst_rate) || 0,
      cgst: money(row.cgst_amount),
      sgst: money(row.sgst_amount),
      igst: money(row.igst_amount),
      total: money(row.total_amount),
      lineRates,
      snapshotSupply: str(snapshot.supply_type),
      prior: {
        total: Math.round(prior.total * 100) / 100,
        gstTaxable: Math.round(prior.gstTaxable * 100) / 100,
        cgst: Math.round(prior.cgst * 100) / 100,
        sgst: Math.round(prior.sgst * 100) / 100,
        igst: Math.round(prior.igst * 100) / 100,
        legacyTaxed: prior.legacyTaxed,
      },
      received: money(settled.amount_received),
      creditRefunded: money(settled.amount_refunded),
    },
  };
}

export type IssuedCreditNote = {
  creditNoteId: string;
  creditNumber: string;
  amount: number;
  taxAmount: number;
  customerCredit: number;
  replayed: boolean;
};

/** Issue a credit note. GST lines send the previewed components; the server refuses any difference. */
export async function issueInvoiceCreditNote(input: {
  orgId: string;
  invoiceId: string;
  creditDate: string;
  reason: string;
  treatment: CreditTreatment;
  lines: { description: string; value: number; cgst?: number; sgst?: number; igst?: number }[];
  idempotencyKey: string;
}): Promise<{ error: string | null; note: IssuedCreditNote | null }> {
  try {
    refuseProductionInvoiceWrite(getSupabaseBaseUrl());
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error), note: null };
  }
  const { data, error } = await db().rpc("issue_invoice_credit_note", {
    p_org_id: input.orgId,
    p_invoice_id: input.invoiceId,
    p_credit_date: input.creditDate,
    p_reason: input.reason,
    p_tax_treatment: input.treatment,
    p_lines: input.lines.map((line) =>
      input.treatment === "gst"
        ? {
            description: line.description,
            taxable_amount: line.value,
            cgst_amount: line.cgst ?? 0,
            sgst_amount: line.sgst ?? 0,
            igst_amount: line.igst ?? 0,
          }
        : { description: line.description, amount: line.value },
    ),
    p_idempotency_key: input.idempotencyKey,
  });
  if (error) return { error: financeBooksErrorMessage(error), note: null };
  const row = (data ?? {}) as Record<string, unknown>;
  return {
    error: null,
    note: {
      creditNoteId: String(row.credit_note_id ?? ""),
      creditNumber: String(row.credit_number ?? ""),
      amount: money(row.amount),
      taxAmount: money(row.tax_amount),
      customerCredit: money(row.customer_credit),
      replayed: row.replayed === true,
    },
  };
}

// ---------------------------------------------------------------------------
// Customer credit and refunds (20271103234500)
// ---------------------------------------------------------------------------

export type CustomerCreditBalance = {
  openReceivables: number;
  unappliedReceipts: number;
  creditNoteCredit: number;
  customerCredit: number;
  refundsRecorded: number;
  refundableNow: number;
  ledgerBalance: number;
};

export function fetchCustomerCreditBalance(orgId: string, clientId: string) {
  return call(
    "customer_credit_balance",
    { p_org_id: orgId, p_client_id: clientId },
    (data): CustomerCreditBalance | null => {
      const item = rows(data)[0];
      if (!item) return null;
      return {
        openReceivables: money(item.open_receivables),
        unappliedReceipts: money(item.unapplied_receipts),
        creditNoteCredit: money(item.credit_note_credit),
        customerCredit: money(item.customer_credit),
        refundsRecorded: money(item.refunds_recorded),
        refundableNow: money(item.refundable_now),
        ledgerBalance: money(item.ledger_balance),
      };
    },
    null as CustomerCreditBalance | null,
  );
}

export type RefundSourceType = "payment" | "credit_note";

export type RefundableSource = {
  sourceType: RefundSourceType;
  sourceId: string;
  sourceNumber: string;
  sourceDate: string;
  invoiceNumber: string | null;
  sourceAmount: number;
  refunded: number;
  refundable: number;
};

export function fetchRefundableSources(orgId: string, clientId: string) {
  return call(
    "customer_refundable_sources",
    { p_org_id: orgId, p_client_id: clientId },
    (data): RefundableSource[] =>
      rows(data).map((item) => ({
        sourceType: item.source_type === "credit_note" ? "credit_note" : "payment",
        sourceId: String(item.source_id ?? ""),
        sourceNumber: String(item.source_number ?? ""),
        sourceDate: String(item.source_date ?? ""),
        invoiceNumber: str(item.invoice_number),
        sourceAmount: money(item.source_amount),
        refunded: money(item.refunded),
        refundable: money(item.refundable),
      })),
    [] as RefundableSource[],
  );
}

export type RefundRow = {
  refundId: string;
  refundNumber: string;
  refundDate: string;
  clientId: string;
  clientName: string | null;
  amount: number;
  sourceType: RefundSourceType;
  sourceNumber: string | null;
  invoiceNumber: string | null;
  mode: string;
  reference: string | null;
  notes: string | null;
  status: "recorded" | "reversed";
  reversalReason: string | null;
  recordedBy: string | null;
};

export function fetchRefundRegister(args: { orgId: string; clientId?: string | null; from?: string | null; to?: string | null; offset: number; limit?: number }) {
  return call(
    "invoice_refund_register",
    {
      p_org_id: args.orgId,
      p_client_id: args.clientId ?? null,
      p_from: args.from ?? null,
      p_to: args.to ?? null,
      p_limit: args.limit ?? REGISTER_PAGE_SIZE,
      p_offset: args.offset,
    },
    (data): Page<RefundRow> => {
      const list = rows(data);
      return {
        total: totalOf(list),
        rows: list.map((item) => ({
          refundId: String(item.refund_id ?? ""),
          refundNumber: String(item.refund_number ?? ""),
          refundDate: String(item.refund_date ?? ""),
          clientId: String(item.client_id ?? ""),
          clientName: str(item.client_name),
          amount: money(item.amount),
          sourceType: item.source_type === "credit_note" ? "credit_note" : "payment",
          sourceNumber: str(item.source_number),
          invoiceNumber: str(item.invoice_number),
          mode: String(item.refund_mode ?? ""),
          reference: str(item.transaction_reference),
          notes: str(item.notes),
          status: item.status === "reversed" ? "reversed" : "recorded",
          reversalReason: str(item.reversal_reason),
          recordedBy: str(item.recorded_by),
        })),
      };
    },
    { rows: [], total: 0 },
  );
}

export type RefundMode = Exclude<PaymentMode, "tds">;

export async function recordCustomerRefund(input: {
  orgId: string;
  sourceType: RefundSourceType;
  sourceId: string;
  refundDate: string;
  amount: number;
  mode: RefundMode;
  reference: string;
  notes: string;
  idempotencyKey: string;
}): Promise<{ error: string | null; refund: { refundId: string; refundNumber: string; amount: number; replayed: boolean } | null }> {
  const { data, error } = await db().rpc("record_customer_refund", {
    p_org_id: input.orgId,
    p_source_type: input.sourceType,
    p_source_id: input.sourceId,
    p_refund_date: input.refundDate,
    p_amount: input.amount,
    p_refund_mode: input.mode,
    p_transaction_reference: input.reference.trim() || null,
    p_notes: input.notes.trim() || null,
    p_idempotency_key: input.idempotencyKey,
  });
  if (error) return { error: financeBooksErrorMessage(error), refund: null };
  const row = (data ?? {}) as Record<string, unknown>;
  return {
    error: null,
    refund: {
      refundId: String(row.refund_id ?? ""),
      refundNumber: String(row.refund_number ?? ""),
      amount: money(row.amount),
      replayed: row.replayed === true,
    },
  };
}

export async function reverseCustomerRefund(input: {
  orgId: string;
  refundId: string;
  reason: string;
  idempotencyKey: string;
}): Promise<{ error: string | null }> {
  const { error } = await db().rpc("reverse_customer_refund", {
    p_org_id: input.orgId,
    p_refund_id: input.refundId,
    p_reason: input.reason,
    p_idempotency_key: input.idempotencyKey,
  });
  return { error: error ? financeBooksErrorMessage(error) : null };
}

// ---------------------------------------------------------------------------
// Finance overview (20271103235000)
// ---------------------------------------------------------------------------

export type FinanceDashboardMonth = {
  month: string;
  invoiced: number;
  invoiceCount: number;
  collectedBank: number;
  collectedTds: number;
  receiptCount: number;
  creditNotes: number;
  refunds: number;
};

export type FinanceDashboard = {
  asOf: string;
  receivables: {
    outstanding: number;
    current: number;
    days1To30: number;
    days31To60: number;
    days61To90: number;
    daysOver90: number;
    openInvoices: number;
    customersOwing: number;
    creditNoteCredit: number;
  };
  unappliedReceipts: number;
  months: FinanceDashboardMonth[];
  bank: { unmatchedCredits: number; unmatchedAmount: number; matched: number; matchedToReversed: number; debits: number };
};

export function mapFinanceDashboard(data: unknown): FinanceDashboard | null {
  if (!data || typeof data !== "object") return null;
  const item = data as Record<string, unknown>;
  const r = (item.receivables ?? {}) as Record<string, unknown>;
  const b = (item.bank ?? {}) as Record<string, unknown>;
  return {
    asOf: String(item.as_of ?? ""),
    receivables: {
      outstanding: money(r.outstanding),
      current: money(r.current),
      days1To30: money(r.days_1_30),
      days31To60: money(r.days_31_60),
      days61To90: money(r.days_61_90),
      daysOver90: money(r.days_over_90),
      openInvoices: Number(r.open_invoices) || 0,
      customersOwing: Number(r.customers_owing) || 0,
      creditNoteCredit: money(r.credit_note_credit),
    },
    unappliedReceipts: money(item.unapplied_receipts),
    months: rows(item.months).map((m) => ({
      month: String(m.month ?? ""),
      invoiced: money(m.invoiced),
      invoiceCount: Number(m.invoice_count) || 0,
      collectedBank: money(m.collected_bank),
      collectedTds: money(m.collected_tds),
      receiptCount: Number(m.receipt_count) || 0,
      creditNotes: money(m.credit_notes),
      refunds: money(m.refunds),
    })),
    bank: {
      unmatchedCredits: Number(b.unmatched_credits) || 0,
      unmatchedAmount: money(b.unmatched_amount),
      matched: Number(b.matched) || 0,
      matchedToReversed: Number(b.matched_to_reversed) || 0,
      debits: Number(b.debits) || 0,
    },
  };
}

export function fetchFinanceDashboard(orgId: string, from: string, to: string) {
  return call("invoice_finance_dashboard", { p_org_id: orgId, p_from: from, p_to: to }, mapFinanceDashboard, null as FinanceDashboard | null);
}
