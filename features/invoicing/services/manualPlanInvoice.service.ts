/**
 * DORMANT — Manual Plan Invoice is blocked in the UI
 * (`ManualInvoiceScreen` + `resolveClientPlanInvoiceAvailability`).
 * Do not wire this to client_contracts as a Client Plan.
 * Kept so schema/helpers and util tests stay available for a future plan entity.
 */
import { supabase } from "@/lib/supabase";
import type {
  InvoiceClientSnapshot,
  InvoiceIssuerSnapshot,
  InvoiceLineSnapshot,
  InvoiceTaxSnapshot,
} from "@/features/invoicing/services/invoiceDocumentSnapshot.service";
import { round2 } from "@/features/invoicing/services/invoiceTax.service";
import { draftInvoiceNumber } from "@/features/invoicing/utils/invoiceLifecycle.util";
import { invoiceHsnIssueBlock } from "@/features/invoicing/utils/invoiceLineHsn.util";
import type { ManualClientPlan } from "@/features/invoicing/utils/manualPlanInvoice.util";

function toAppError(e: unknown): Error {
  return e instanceof Error ? e : new Error(String(e));
}

export async function fetchManualClientPlans(
  orgId: string,
  clientId: string,
): Promise<{ plans: ManualClientPlan[]; error: Error | null }> {
  try {
    const { data, error } = await supabase()
      .from("client_contracts")
      .select(
        "id, client_id, pickup_area, drop_location, rate, rate_type, valid_from, valid_to, notes",
      )
      .eq("organization_id", orgId)
      .eq("client_id", clientId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (error) throw toAppError(error);
    return {
      error: null,
      plans: (data ?? []).map((row) => ({
        id: String(row.id),
        client_id: String(row.client_id),
        pickup_area: String(row.pickup_area ?? ""),
        drop_location: String(row.drop_location ?? ""),
        rate: row.rate == null ? null : Number(row.rate),
        rate_type: row.rate_type ?? null,
        valid_from: row.valid_from ?? null,
        valid_to: row.valid_to ?? null,
        notes: row.notes ?? null,
      })),
    };
  } catch (e) {
    return { plans: [], error: toAppError(e) };
  }
}

export async function saveManualPlanInvoiceDraft(args: {
  orgId: string;
  clientId: string;
  clientName: string;
  planId: string;
  billingPeriodStart: string;
  billingPeriodEnd: string;
  subtotal: number;
  gstRate: number;
  sgstAmount: number;
  cgstAmount: number;
  igstAmount: number;
  totalAmount: number;
  notes?: string | null;
  paymentTerms?: string | null;
  createdBy?: string | null;
  issuerSnapshot?: InvoiceIssuerSnapshot | null;
  clientSnapshot?: InvoiceClientSnapshot | null;
  lineItems?: InvoiceLineSnapshot[] | null;
  taxSnapshot?: InvoiceTaxSnapshot | null;
  manualPlanSnapshot?: Record<string, unknown> | null;
}): Promise<{ error: Error | null; draftId?: string }> {
  try {
    const invoiceNumber = draftInvoiceNumber();
    const { error, data } = await supabase()
      .from("invoices")
      .insert({
        org_id: args.orgId,
        invoice_number: invoiceNumber,
        financial_year: "DRAFT",
        client_id: args.clientId,
        client_name: args.clientName,
        invoice_date: new Date().toISOString().slice(0, 10),
        trip_ids: [],
        plan_id: args.planId,
        invoice_source: "manual_plan",
        billing_period_start: args.billingPeriodStart,
        billing_period_end: args.billingPeriodEnd,
        manual_plan_snapshot: args.manualPlanSnapshot ?? null,
        subtotal: round2(args.subtotal),
        gst_rate: args.gstRate,
        sgst_amount: round2(args.sgstAmount),
        cgst_amount: round2(args.cgstAmount),
        igst_amount: round2(args.igstAmount),
        total_amount: round2(args.totalAmount),
        notes: args.notes ?? null,
        payment_terms: args.paymentTerms ?? null,
        issuer_snapshot: args.issuerSnapshot ?? null,
        client_snapshot: args.clientSnapshot ?? null,
        line_items: args.lineItems ?? null,
        tax_snapshot: args.taxSnapshot ?? null,
        status: "draft",
        created_by: args.createdBy ?? null,
      } as never)
      .select("id")
      .maybeSingle();
    if (error) throw toAppError(error);
    return { error: null, draftId: data?.id ? String(data.id) : undefined };
  } catch (e) {
    return { error: toAppError(e) };
  }
}

export async function issueManualPlanInvoice(args: {
  orgId: string;
  clientId: string;
  clientName: string;
  planId: string;
  billingPeriodStart: string;
  billingPeriodEnd: string;
  subtotal: number;
  gstRate: number;
  sgstAmount: number;
  cgstAmount: number;
  igstAmount: number;
  totalAmount: number;
  notes?: string | null;
  paymentTerms?: string | null;
  draftId?: string | null;
  createdBy?: string | null;
  idempotencyKey: string;
  issuerSnapshot?: InvoiceIssuerSnapshot | null;
  clientSnapshot?: InvoiceClientSnapshot | null;
  lineItems?: InvoiceLineSnapshot[] | null;
  taxSnapshot?: InvoiceTaxSnapshot | null;
  manualPlanSnapshot?: Record<string, unknown> | null;
}): Promise<{ error: Error | null; invoiceNumber?: string }> {
  try {
    const hsnBlock = invoiceHsnIssueBlock(args.lineItems ?? []);
    if (hsnBlock) throw new Error(hsnBlock);
    const { data, error } = await supabase().rpc("issue_manual_plan_invoice", {
      p_org_id: args.orgId,
      p_client_id: args.clientId,
      p_client_name: args.clientName,
      p_plan_id: args.planId,
      p_billing_period_start: args.billingPeriodStart,
      p_billing_period_end: args.billingPeriodEnd,
      p_subtotal: args.subtotal,
      p_gst_rate: args.gstRate,
      p_sgst_amount: args.sgstAmount,
      p_cgst_amount: args.cgstAmount,
      p_igst_amount: args.igstAmount,
      p_total_amount: args.totalAmount,
      p_notes: args.notes ?? null,
      p_invoice_date: new Date().toISOString().slice(0, 10),
      p_due_date: null,
      p_created_by: args.createdBy ?? null,
      p_draft_id: args.draftId ?? null,
      p_idempotency_key: args.idempotencyKey,
      p_issuer_snapshot: args.issuerSnapshot ?? null,
      p_client_snapshot: args.clientSnapshot ?? null,
      p_line_items: args.lineItems ?? null,
      p_tax_snapshot: args.taxSnapshot ?? null,
      p_payment_terms: args.paymentTerms ?? null,
      p_manual_plan_snapshot: args.manualPlanSnapshot ?? null,
    } as never);
    if (error) throw toAppError(error);
    return { error: null, invoiceNumber: data ? String(data) : undefined };
  } catch (e) {
    return { error: toAppError(e) };
  }
}
