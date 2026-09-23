/**
 * Read-only list of issued invoices (public.invoices).
 * Does not allocate numbers, compute GST, or write AR.
 */
import { supabase } from "@/lib/supabase";
import { applySalesOrderNumbers } from "@/features/invoicing/utils/invoiceSource.util";
import { isCommerceDataQueryEnabled } from "@/lib/suite/productLock";

export type IssuedInvoiceListRow = {
  id: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string | null;
  client_id: string | null;
  client_name: string | null;
  total_amount: number;
  status: string;
  trip_ids: string[];
  invoice_source?: string | null;
  sales_order_id?: string | null;
  sales_order_number?: string | null;
  plan_id?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  notes?: string | null;
  payment_terms?: string | null;
  line_items?: unknown;
  subtotal?: number | null;
  gst_rate?: number | null;
  cgst_amount?: number | null;
  sgst_amount?: number | null;
  igst_amount?: number | null;
};

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

async function attachSalesOrderNumbers(
  invoices: IssuedInvoiceListRow[],
): Promise<IssuedInvoiceListRow[]> {
  const ids = [
    ...new Set(
      invoices
        .map((row) => (row.sales_order_id ?? "").trim())
        .filter(Boolean),
    ),
  ];
  if (ids.length === 0 || !isCommerceDataQueryEnabled()) return invoices;
  const { data, error } = await supabase()
    .from("sales_orders")
    .select("id, order_number")
    .in("id", ids);
  if (error || !data) return invoices;
  const numbersById: Record<string, string> = {};
  for (const row of data) {
    const id = str((row as { id?: unknown }).id);
    const number = str((row as { order_number?: unknown }).order_number);
    if (id && number) numbersById[id] = number;
  }
  return applySalesOrderNumbers(invoices, numbersById);
}

export async function fetchIssuedInvoicesForOrg(
  orgId: string,
): Promise<{ error: Error | null; invoices: IssuedInvoiceListRow[] }> {
  try {
    const { data, error } = await supabase()
      .from("invoices")
      .select(
        "id, invoice_number, invoice_date, due_date, client_id, client_name, total_amount, status, trip_ids, invoice_source, sales_order_id, line_items, subtotal, gst_rate, cgst_amount, sgst_amount, igst_amount, notes, payment_terms",
      )
      .eq("org_id", orgId)
      .in("status", ["sent", "paid"])
      .order("invoice_date", { ascending: false });

    if (error) throw error;

    const invoices: IssuedInvoiceListRow[] = (data ?? []).map((row) => {
      const tripIds = Array.isArray(
        (row as { trip_ids?: unknown }).trip_ids,
      )
        ? ((row as { trip_ids: unknown[] }).trip_ids.filter(
            (id): id is string => typeof id === "string" && id.length > 0,
          ))
        : [];
      const totalRaw = (row as { total_amount?: unknown }).total_amount;
      const total =
        typeof totalRaw === "number" && Number.isFinite(totalRaw)
          ? totalRaw
          : Number(totalRaw) || 0;
      return {
        id: str((row as { id?: unknown }).id),
        invoice_number: str((row as { invoice_number?: unknown }).invoice_number),
        invoice_date: str((row as { invoice_date?: unknown }).invoice_date),
        due_date: str((row as { due_date?: unknown }).due_date) || null,
        client_id: str((row as { client_id?: unknown }).client_id) || null,
        client_name: str((row as { client_name?: unknown }).client_name) || null,
        total_amount: total,
        status: str((row as { status?: unknown }).status) || "sent",
        trip_ids: tripIds,
        invoice_source:
          str((row as { invoice_source?: unknown }).invoice_source) || "trip",
        sales_order_id:
          str((row as { sales_order_id?: unknown }).sales_order_id) || null,
        sales_order_number: null,
        line_items: (row as { line_items?: unknown }).line_items ?? null,
        subtotal: Number((row as { subtotal?: unknown }).subtotal) || 0,
        gst_rate: Number((row as { gst_rate?: unknown }).gst_rate) || 0,
        cgst_amount: Number((row as { cgst_amount?: unknown }).cgst_amount) || 0,
        sgst_amount: Number((row as { sgst_amount?: unknown }).sgst_amount) || 0,
        igst_amount: Number((row as { igst_amount?: unknown }).igst_amount) || 0,
        notes: str((row as { notes?: unknown }).notes) || null,
        payment_terms: str((row as { payment_terms?: unknown }).payment_terms) || null,
      };
    });

    return { error: null, invoices: await attachSalesOrderNumbers(invoices) };
  } catch (e) {
    return {
      error: e instanceof Error ? e : new Error(String(e)),
      invoices: [],
    };
  }
}

export async function fetchDraftInvoicesForOrg(
  orgId: string,
): Promise<{ error: Error | null; invoices: IssuedInvoiceListRow[] }> {
  try {
    const { data, error } = await supabase()
      .from("invoices")
      .select(
        "id, invoice_number, invoice_date, due_date, client_id, client_name, total_amount, status, trip_ids, created_at, updated_at, notes, payment_terms, invoice_source, sales_order_id, line_items, subtotal, gst_rate, cgst_amount, sgst_amount, igst_amount",
      )
      .eq("org_id", orgId)
      .eq("status", "draft")
      .order("created_at", { ascending: false });

    if (error) throw error;

    const invoices: IssuedInvoiceListRow[] = (data ?? []).map((row) => {
      const tripIds = Array.isArray(
        (row as { trip_ids?: unknown }).trip_ids,
      )
        ? ((row as { trip_ids: unknown[] }).trip_ids.filter(
            (id): id is string => typeof id === "string" && id.length > 0,
          ))
        : [];
      const totalRaw = (row as { total_amount?: unknown }).total_amount;
      const total =
        typeof totalRaw === "number" && Number.isFinite(totalRaw)
          ? totalRaw
          : Number(totalRaw) || 0;
      return {
        id: str((row as { id?: unknown }).id),
        invoice_number: str((row as { invoice_number?: unknown }).invoice_number),
        invoice_date: str((row as { invoice_date?: unknown }).invoice_date),
        due_date: str((row as { due_date?: unknown }).due_date) || null,
        client_id: str((row as { client_id?: unknown }).client_id) || null,
        client_name: str((row as { client_name?: unknown }).client_name) || null,
        total_amount: total,
        status: "draft",
        trip_ids: tripIds,
        created_at: str((row as { created_at?: unknown }).created_at) || null,
        updated_at: str((row as { updated_at?: unknown }).updated_at) || null,
        notes: str((row as { notes?: unknown }).notes) || null,
        payment_terms: str((row as { payment_terms?: unknown }).payment_terms) || null,
        invoice_source:
          str((row as { invoice_source?: unknown }).invoice_source) || "trip",
        sales_order_id:
          str((row as { sales_order_id?: unknown }).sales_order_id) || null,
        sales_order_number: null,
        line_items: (row as { line_items?: unknown }).line_items ?? null,
        subtotal: Number((row as { subtotal?: unknown }).subtotal) || 0,
        gst_rate: Number((row as { gst_rate?: unknown }).gst_rate) || 0,
        cgst_amount: Number((row as { cgst_amount?: unknown }).cgst_amount) || 0,
        sgst_amount: Number((row as { sgst_amount?: unknown }).sgst_amount) || 0,
        igst_amount: Number((row as { igst_amount?: unknown }).igst_amount) || 0,
      };
    });

    return { error: null, invoices: await attachSalesOrderNumbers(invoices) };
  } catch (e) {
    return {
      error: e instanceof Error ? e : new Error(String(e)),
      invoices: [],
    };
  }
}
