/**
 * Persist invoice drafts on public.invoices (status=draft).
 * Does not allocate INV/ serials. Drafts reserve trip_ids until cancelled or issued.
 */
import { getSupabaseBaseUrl, supabase } from "@/lib/supabase";
import { refuseProductionInvoiceWrite } from "@/features/invoicing/utils/invoiceProductionWriteGuard.util";
import { draftInvoiceNumber } from "@/features/invoicing/utils/invoiceLifecycle.util";
import {
  alreadyInvoicedGuidance,
  planDraftSave,
  type GuardInvoice,
} from "@/features/invoicing/utils/invoiceDuplicateGuard.util";

function guardInvoiceWrite(): void {
  refuseProductionInvoiceWrite(getSupabaseBaseUrl());
}

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
  /** Frozen once inserted. Later sequence edits do not update this row. */
  invoiceNumber?: string | null;
}): Promise<{ error: Error | null; draftId?: string; draftNumber?: string }> {
  try {
    guardInvoiceWrite();
    if (args.tripIds.length === 0) {
      throw new Error("Select at least one eligible trip to save a draft.");
    }
    const requested = args.invoiceNumber?.trim() ?? "";
    const invoiceNumber = requested && !requested.startsWith("DRAFT/") ? requested : draftInvoiceNumber();
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

function invoiceRows(data: unknown): GuardInvoice[] {
  if (!Array.isArray(data)) return [];
  return data.flatMap((row) => {
    const record = row as { id?: unknown; invoice_number?: unknown; trip_ids?: unknown };
    const id = typeof record.id === "string" ? record.id : "";
    if (!id) return [];
    const tripIds = Array.isArray(record.trip_ids)
      ? record.trip_ids.filter((tripId): tripId is string => typeof tripId === "string" && tripId.length > 0)
      : [];
    return [{
      id,
      invoiceNumber: typeof record.invoice_number === "string" ? record.invoice_number : "",
      tripIds,
    }];
  });
}

/** Insert a draft, or update the draft that already holds these trips. */
export async function saveInvoiceDraftOnce(
  args: Parameters<typeof saveInvoiceDraft>[0] & { activeDraftId?: string | null },
): Promise<{ error: Error | null; draftId?: string; draftNumber?: string; reused?: boolean }> {
  try {
    guardInvoiceWrite();
    const { data, error } = await supabase()
      .from("invoices")
      .select("id, invoice_number, trip_ids, status")
      .eq("org_id", args.orgId)
      .in("status", ["draft", "sent", "paid"]);
    if (error) throw toAppError(error);
    const rows = Array.isArray(data) ? data : [];
    const issued = invoiceRows(rows.filter((row) => (row as { status?: unknown }).status !== "draft"));
    const guidance = alreadyInvoicedGuidance({ tripIds: args.tripIds, invoices: issued });
    if (guidance) return { error: new Error(guidance) };
    const plan = planDraftSave({
      tripIds: args.tripIds,
      drafts: invoiceRows(rows.filter((row) => (row as { status?: unknown }).status === "draft")),
      activeDraftId: args.activeDraftId,
    });
    if (plan.action === "blocked") return { error: new Error(plan.message) };
    if (plan.action === "update") {
      const updated = await updateInvoiceDraft({
        orgId: args.orgId,
        draftId: plan.draftId,
        tripIds: args.tripIds,
        subtotal: args.subtotal,
        gstRate: args.gstRate,
        sgstAmount: args.sgstAmount,
        cgstAmount: args.cgstAmount,
        igstAmount: args.igstAmount,
        totalAmount: args.totalAmount,
        notes: args.notes,
        paymentTerms: args.paymentTerms,
      });
      if (updated.error) return { error: updated.error };
      return {
        error: null,
        draftId: plan.draftId,
        draftNumber: plan.invoiceNumber,
        reused: true,
      };
    }
    const saved = await saveInvoiceDraft(args);
    return { ...saved, reused: false };
  } catch (e) {
    return { error: toAppError(e) };
  }
}

export type InvoiceDraftSaveSnapshot = {
  notes: string;
  paymentTerms: string;
  gstRate: number;
  subtotal: number;
  sgst: number;
  cgst: number;
  igst: number;
  totalAmount: number;
  tripIds: string[];
  invoiceNumber?: string;
};

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
    guardInvoiceWrite();
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
      .update(patch as never)
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
