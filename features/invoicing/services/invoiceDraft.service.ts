/**
 * Persist invoice drafts on public.invoices (status=draft).
 * Does not allocate INV/ serials. Drafts reserve trip_ids until cancelled or issued.
 */
import { supabase } from "@/lib/supabase";
import { draftInvoiceNumber } from "@/features/invoicing/utils/invoiceLifecycle.util";

function toAppError(e: unknown): Error {
  return e instanceof Error ? e : new Error(String(e));
}

export async function saveInvoiceDraft(args: {
  orgId: string;
  clientId: string;
  clientName: string | null;
  tripIds: string[];
  subtotal: number;
  gstRate: number;
  sgstAmount: number;
  cgstAmount: number;
  igstAmount: number;
  totalAmount: number;
  notes?: string | null;
  paymentTerms?: string | null;
  createdBy?: string | null;
}): Promise<{ error: Error | null; draftId?: string; draftNumber?: string }> {
  try {
    if (args.tripIds.length === 0) {
      throw new Error("Select at least one eligible trip to save a draft.");
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
        trip_ids: args.tripIds,
        subtotal: args.subtotal,
        gst_rate: args.gstRate,
        sgst_amount: args.sgstAmount,
        cgst_amount: args.cgstAmount,
        igst_amount: args.igstAmount,
        total_amount: args.totalAmount,
        notes: args.notes ?? null,
        payment_terms: args.paymentTerms ?? null,
        status: "draft",
        pdf_storage_path: null,
        created_by: args.createdBy ?? null,
      })
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

export async function updateInvoiceDraft(args: {
  orgId: string;
  draftId: string;
  invoiceDate?: string | null;
  dueDate?: string | null;
  paymentTerms?: string | null;
  notes?: string | null;
  tripIds?: string[];
  subtotal?: number;
  gstRate?: number;
  sgstAmount?: number;
  cgstAmount?: number;
  igstAmount?: number;
  totalAmount?: number;
}): Promise<{ error: Error | null }> {
  try {
    const patch: Record<string, unknown> = {};
    if (args.invoiceDate !== undefined) patch.invoice_date = args.invoiceDate;
    if (args.dueDate !== undefined) patch.due_date = args.dueDate;
    if (args.paymentTerms !== undefined) patch.payment_terms = args.paymentTerms;
    if (args.notes !== undefined) patch.notes = args.notes;
    if (args.tripIds !== undefined) patch.trip_ids = args.tripIds;
    if (args.subtotal !== undefined) patch.subtotal = args.subtotal;
    if (args.gstRate !== undefined) patch.gst_rate = args.gstRate;
    if (args.sgstAmount !== undefined) patch.sgst_amount = args.sgstAmount;
    if (args.cgstAmount !== undefined) patch.cgst_amount = args.cgstAmount;
    if (args.igstAmount !== undefined) patch.igst_amount = args.igstAmount;
    if (args.totalAmount !== undefined) patch.total_amount = args.totalAmount;
    if (Object.keys(patch).length === 0) return { error: null };
    const { error } = await supabase()
      .from("invoices")
      .update(patch)
      .eq("org_id", args.orgId)
      .eq("id", args.draftId)
      .eq("status", "draft");
    if (error) throw toAppError(error);
    return { error: null };
  } catch (e) {
    return { error: toAppError(e) };
  }
}

export async function discardInvoiceDraft(
  orgId: string,
  draftId: string,
): Promise<{ error: Error | null }> {
  try {
    const { error } = await supabase()
      .from("invoices")
      .update({ status: "cancelled" })
      .eq("org_id", orgId)
      .eq("id", draftId)
      .eq("status", "draft");
    if (error) throw toAppError(error);
    return { error: null };
  } catch (e) {
    return { error: toAppError(e) };
  }
}
