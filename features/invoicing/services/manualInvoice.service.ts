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

function toAppError(e: unknown): Error {
  return e instanceof Error ? e : new Error(String(e));
}

export type ManualInvoicePersistArgs = {
  orgId: string;
  clientId: string;
  clientName: string;
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
  lineItems: InvoiceLineSnapshot[];
  taxSnapshot?: InvoiceTaxSnapshot | null;
  draftId?: string | null;
};

export async function saveManualInvoiceDraft(
  args: ManualInvoicePersistArgs,
): Promise<{ error: Error | null; draftId?: string; draftNumber?: string }> {
  try {
    if (args.lineItems.length === 0) {
      throw new Error("Add at least one invoice line.");
    }
    if (args.draftId) {
      const { error } = await supabase()
        .from("invoices")
        .update({
          client_id: args.clientId,
          client_name: args.clientName,
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
          line_items: args.lineItems,
          tax_snapshot: args.taxSnapshot ?? null,
          invoice_source: "manual",
          trip_ids: [],
        } as never)
        .eq("org_id", args.orgId)
        .eq("id", args.draftId)
        .eq("status", "draft");
      if (error) throw toAppError(error);
      return { error: null, draftId: args.draftId };
    }
    const invoiceNumber = draftInvoiceNumber();
    const invoiceDate = new Date().toISOString().slice(0, 10);
    const { data, error } = await supabase()
      .from("invoices")
      .insert({
        org_id: args.orgId,
        invoice_number: invoiceNumber,
        financial_year: "DRAFT",
        client_id: args.clientId,
        client_name: args.clientName,
        invoice_date: invoiceDate,
        trip_ids: [],
        invoice_source: "manual",
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
        line_items: args.lineItems,
        tax_snapshot: args.taxSnapshot ?? null,
        status: "draft",
        created_by: args.createdBy ?? null,
      } as never)
      .select("id, invoice_number")
      .maybeSingle();
    if (error) throw toAppError(error);
    return {
      error: null,
      draftId: data?.id ? String(data.id) : undefined,
      draftNumber: data?.invoice_number
        ? String(data.invoice_number)
        : invoiceNumber,
    };
  } catch (e) {
    return { error: toAppError(e) };
  }
}

export async function issueManualInvoice(
  args: ManualInvoicePersistArgs & { idempotencyKey: string },
): Promise<{ error: Error | null; invoiceNumber?: string }> {
  try {
    const hsnBlock = invoiceHsnIssueBlock(args.lineItems);
    if (hsnBlock) throw new Error(hsnBlock);
    if (args.lineItems.length === 0) {
      throw new Error("Add at least one invoice line.");
    }
    const invoiceDate = new Date().toISOString().slice(0, 10);
    const { data, error } = await supabase().rpc("issue_manual_invoice", {
      p_org_id: args.orgId,
      p_client_id: args.clientId,
      p_client_name: args.clientName,
      p_subtotal: round2(args.subtotal),
      p_gst_rate: args.gstRate,
      p_sgst_amount: round2(args.sgstAmount),
      p_cgst_amount: round2(args.cgstAmount),
      p_igst_amount: round2(args.igstAmount),
      p_total_amount: round2(args.totalAmount),
      p_notes: args.notes ?? null,
      p_invoice_date: invoiceDate,
      p_due_date: null,
      p_created_by: args.createdBy ?? null,
      p_draft_id: args.draftId ?? null,
      p_idempotency_key: args.idempotencyKey,
      p_issuer_snapshot: args.issuerSnapshot ?? null,
      p_client_snapshot: args.clientSnapshot ?? null,
      p_line_items: args.lineItems,
      p_tax_snapshot: args.taxSnapshot ?? null,
      p_payment_terms: args.paymentTerms ?? null,
    });
    if (error) throw toAppError(error);
    return { error: null, invoiceNumber: data ? String(data) : undefined };
  } catch (e) {
    return { error: toAppError(e) };
  }
}
