/**
 * Credit notes, cancellation, ledger, bank matching, and invoice email history.
 * Balances stay on the payment RPCs. This file does not write invoice totals.
 */
import { getSupabaseBaseUrl, supabase } from "@/lib/supabase";
import { refuseProductionInvoiceWrite } from "@/features/invoicing/utils/invoiceProductionWriteGuard.util";
import {
  invoicePaymentErrorMessage,
  invoicePaymentUnavailable,
} from "@/features/invoicing/services/invoicePayment.service";

type RpcError = { message?: string; code?: string } | null;

function db() {
  return supabase() as unknown as {
    rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: RpcError }>;
  };
}

export type LedgerEntry = {
  date: string;
  number: string;
  type: string;
  reference: string;
  debit: number;
  credit: number;
};

function money(value: unknown): number {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
}

export async function fetchCustomerLedger(orgId: string, clientId: string, offset = 0) {
  const { data, error } = await db().rpc("customer_finance_ledger", {
    p_org_id: orgId,
    p_client_id: clientId,
    p_limit: 50,
    p_offset: offset,
  });
  if (error) {
    return {
      error: invoicePaymentErrorMessage(error),
      unavailable: invoicePaymentUnavailable(error),
      rows: [] as LedgerEntry[],
    };
  }
  const rows = (Array.isArray(data) ? data : []).map((row) => {
    const item = row as Record<string, unknown>;
    return {
      date: String(item.entry_date ?? ""),
      number: String(item.entry_number ?? ""),
      type: String(item.entry_type ?? ""),
      reference: String(item.reference ?? ""),
      debit: money(item.debit),
      credit: money(item.credit),
    };
  });
  return { error: null, unavailable: false, rows };
}

export async function issueCreditNote(input: {
  orgId: string;
  invoiceId: string;
  reason: string;
  amount: number;
  idempotencyKey: string;
}) {
  try {
    refuseProductionInvoiceWrite(getSupabaseBaseUrl());
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error), result: null };
  }
  const { data, error } = await db().rpc("issue_invoice_credit_note", {
    p_org_id: input.orgId,
    p_invoice_id: input.invoiceId,
    p_credit_date: new Date().toISOString().slice(0, 10),
    p_reason: input.reason,
    p_lines: [{ description: input.reason, amount: input.amount, tax_amount: 0 }],
    p_idempotency_key: input.idempotencyKey,
  });
  if (error) return { error: invoicePaymentErrorMessage(error), result: null };
  return { error: null, result: data };
}

export async function cancelIssuedInvoice(input: {
  orgId: string;
  invoiceId: string;
  reason: string;
  idempotencyKey: string;
}) {
  try {
    refuseProductionInvoiceWrite(getSupabaseBaseUrl());
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error), result: null };
  }
  const { data, error } = await db().rpc("cancel_customer_invoice", {
    p_org_id: input.orgId,
    p_invoice_id: input.invoiceId,
    p_reason: input.reason,
    p_idempotency_key: input.idempotencyKey,
  });
  if (error) return { error: invoicePaymentErrorMessage(error), result: null };
  return { error: null, result: data };
}

export async function importBankRows(orgId: string, rows: Record<string, string>[], key: string) {
  try {
    refuseProductionInvoiceWrite(getSupabaseBaseUrl());
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error), result: null };
  }
  const { data, error } = await db().rpc("import_bank_statement", {
    p_org_id: orgId,
    p_rows: rows,
    p_idempotency_key: key,
  });
  if (error) return { error: invoicePaymentErrorMessage(error), result: null };
  return { error: null, result: data as { inserted?: number; duplicates?: number } };
}

export async function recordInvoiceEmailRequest(input: {
  orgId: string;
  invoiceId: string;
  recipients: string[];
  subject: string;
  idempotencyKey: string;
}) {
  const { data, error } = await db().rpc("record_invoice_email", {
    p_org_id: input.orgId,
    p_invoice_id: input.invoiceId,
    p_recipients: input.recipients,
    p_subject: input.subject,
    p_body: "",
    p_idempotency_key: input.idempotencyKey,
  });
  if (error) return { error: invoicePaymentErrorMessage(error), result: null };
  return { error: null, result: data as { recorded?: boolean; duplicate?: boolean } };
}

export async function saveReminderRule(orgId: string, enabled: boolean) {
  try {
    refuseProductionInvoiceWrite(getSupabaseBaseUrl());
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
  const { error } = await db().rpc("save_invoice_reminder_rule", {
    p_org_id: orgId,
    p_enabled: enabled,
    p_days_before: 3,
    p_days_after: 7,
  });
  if (error) return { error: invoicePaymentErrorMessage(error) };
  return { error: null };
}
