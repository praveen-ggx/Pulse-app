/**
 * Commerce Order → Invoice read/write.
 * One sales_order = one invoice. Never selects trips / merged trips.
 */
import { supabase } from "@/lib/supabase";
import type {
  InvoiceClientSnapshot,
  InvoiceIssuerSnapshot,
  InvoiceLineSnapshot,
  InvoiceTaxSnapshot,
} from "@/features/invoicing/services/invoiceDocumentSnapshot.service";
import {
  INVOICE_DRAFT_NUMBER_LABEL,
  type InvoiceDraftModel,
} from "@/features/invoicing/services/invoicePreviewModel.service";
import { resolveInvoiceIssuerIdentity } from "@/features/invoicing/services/invoiceIssuerIdentity.service";
import { computeInvoiceTax, round2 } from "@/features/invoicing/services/invoiceTax.service";
import { draftInvoiceNumber } from "@/features/invoicing/utils/invoiceLifecycle.util";
import {
  buildCommerceOrderInvoiceLines,
  type CommerceOrderLineForInvoice,
} from "@/features/invoicing/utils/commerceOrderInvoiceLines.util";
import {
  isSalesOrderInvoiceable,
  resolveCommerceOrderInvoiceStatus,
  type CommerceOrderInvoiceStatus,
} from "@/features/invoicing/utils/commerceOrderInvoiceStatus.util";
import { invoiceHsnIssueBlock } from "@/features/invoicing/utils/invoiceLineHsn.util";
import { discardInvoiceDraft } from "@/features/invoicing/services/invoiceDraft.service";
import type { InvoiceIssuerWorkspace } from "@/features/invoicing/services/invoiceIssuerIdentity.service";
import { isCommerceDataQueryEnabled } from "@/lib/suite/productLock";

const COMMERCE_LOCKED_ERROR = new Error("Pulse Commerce is locked.");

function toAppError(e: unknown): Error {
  return e instanceof Error ? e : new Error(String(e));
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export type CommerceOrderInvoiceBundle = {
  order: {
    id: string;
    order_number: string;
    organization_id: string;
    customer_id: string;
    status: string;
    subtotal: number;
    tax_amount: number;
    total_amount: number;
    currency: string;
    notes: string | null;
    deleted_at: string | null;
  };
  customer: {
    id: string;
    display_name: string;
    legal_name: string | null;
    gstin: string | null;
    pan: string | null;
    billing_address: string | null;
    state: string | null;
    email: string | null;
  };
  lines: CommerceOrderLineForInvoice[];
  invoiceStatus: CommerceOrderInvoiceStatus;
  activeInvoice: {
    id: string;
    status: string | null;
    invoice_number: string | null;
  } | null;
};

export async function fetchCommerceOrderInvoiceBundle(args: {
  orgId: string;
  salesOrderId: string;
}): Promise<{ data: CommerceOrderInvoiceBundle | null; error: Error | null }> {
  try {
    if (!isCommerceDataQueryEnabled()) {
      return { data: null, error: COMMERCE_LOCKED_ERROR };
    }
    if (!isUuid(args.orgId) || !isUuid(args.salesOrderId)) {
      throw new Error("Invalid organization or order id.");
    }

    const { data: order, error: orderError } = await supabase()
      .from("sales_orders")
      .select(
        "id, order_number, organization_id, customer_id, status, subtotal, tax_amount, total_amount, currency, notes, deleted_at",
      )
      .eq("id", args.salesOrderId)
      .eq("organization_id", args.orgId)
      .maybeSingle();
    if (orderError) throw toAppError(orderError);
    if (!order) return { data: null, error: null };

    const { data: lineRows, error: lineError } = await supabase()
      .from("sales_order_lines")
      .select(
        "id, quantity, unit_price, tax_rate, line_total, product:products!product_id(id, name, sku, hsn_code, description)",
      )
      .eq("sales_order_id", args.salesOrderId)
      .eq("organization_id", args.orgId);
    if (lineError) throw toAppError(lineError);

    const { data: client, error: clientError } = await supabase()
      .from("clients")
      .select(
        "id, name, legal_name, trade_name, gstin, pan_number, billing_address, registered_address, state, email",
      )
      .eq("id", order.customer_id)
      .eq("organization_id", args.orgId)
      .maybeSingle();
    if (clientError) throw toAppError(clientError);
    if (!client) throw new Error("Order customer was not found in this workspace.");

    const { data: invRows, error: invError } = await supabase()
      .from("invoices")
      .select("id, status, invoice_number")
      .eq("org_id", args.orgId)
      .eq("sales_order_id", args.salesOrderId)
      .not("status", "in", "(void,cancelled)")
      .order("created_at", { ascending: false })
      .limit(1);
    if (invError) throw toAppError(invError);

    const activeInvoice = invRows?.[0]
      ? {
          id: String(invRows[0].id),
          status: invRows[0].status ?? null,
          invoice_number: invRows[0].invoice_number ?? null,
        }
      : null;

    const lines = (lineRows ?? []).map((row) => {
      const productRaw = (row as { product?: unknown }).product;
      const product = Array.isArray(productRaw) ? productRaw[0] : productRaw;
      return {
        id: String(row.id),
        quantity: Number(row.quantity) || 0,
        unit_price: Number(row.unit_price) || 0,
        tax_rate: Number(row.tax_rate) || 0,
        line_total: Number(row.line_total) || 0,
        product: product
          ? {
              id: String((product as { id?: string }).id ?? ""),
              name: (product as { name?: string | null }).name ?? null,
              sku: (product as { sku?: string | null }).sku ?? null,
              hsn_code: (product as { hsn_code?: string | null }).hsn_code ?? null,
              description:
                (product as { description?: string | null }).description ?? null,
            }
          : null,
      } satisfies CommerceOrderLineForInvoice;
    });

    const displayName =
      (client.legal_name ?? "").trim() ||
      (client.trade_name ?? "").trim() ||
      (client.name ?? "").trim() ||
      "Customer";

    const invoiceStatus = resolveCommerceOrderInvoiceStatus({
      orderStatus: order.status,
      deletedAt: order.deleted_at,
      activeInvoice,
    });

    return {
      data: {
        order: {
          id: String(order.id),
          order_number: String(order.order_number),
          organization_id: String(order.organization_id),
          customer_id: String(order.customer_id),
          status: String(order.status),
          subtotal: Number(order.subtotal) || 0,
          tax_amount: Number(order.tax_amount) || 0,
          total_amount: Number(order.total_amount) || 0,
          currency: String(order.currency ?? "INR"),
          notes: order.notes ?? null,
          deleted_at: order.deleted_at ?? null,
        },
        customer: {
          id: String(client.id),
          display_name: displayName,
          legal_name: client.legal_name ?? null,
          gstin: client.gstin ?? null,
          pan: client.pan_number ?? null,
          billing_address:
            (client.billing_address ?? "").trim() ||
            (client.registered_address ?? "").trim() ||
            null,
          state: client.state ?? null,
          email: client.email ?? null,
        },
        lines,
        invoiceStatus,
        activeInvoice,
      },
      error: null,
    };
  } catch (e) {
    return { data: null, error: toAppError(e) };
  }
}

export function buildCommerceOrderInvoiceDraft(args: {
  bundle: CommerceOrderInvoiceBundle;
  issuerWorkspace: InvoiceIssuerWorkspace;
  includeGst?: boolean;
  previewDate?: string;
  paymentTerms?: string | null;
  notes?: string | null;
}): InvoiceDraftModel {
  const invoiceLines = buildCommerceOrderInvoiceLines(args.bundle.lines);
  const lineTaxables = invoiceLines.map((l) => l.taxable_value);
  const avgRate =
    invoiceLines.length > 0
      ? invoiceLines.reduce((sum, l) => sum + (l.tax_rate ?? 18), 0) /
        invoiceLines.length
      : 18;

  const issuerIdentity = resolveInvoiceIssuerIdentity({
    workspace: args.issuerWorkspace,
  });
  if (!issuerIdentity) {
    throw new Error("Workspace issuer identity is incomplete.");
  }
  const includeGst = args.includeGst !== false;

  const tax = computeInvoiceTax({
    issuer: {
      org_id: args.issuerWorkspace.id,
      gstin: args.issuerWorkspace.gstin ?? null,
      gst_not_applicable: Boolean(args.issuerWorkspace.gst_not_applicable),
      state: args.issuerWorkspace.state ?? null,
    },
    clients: [
      {
        client_id: args.bundle.customer.id,
        gstin: args.bundle.customer.gstin,
        state: args.bundle.customer.state,
        organization_id: args.bundle.order.organization_id,
      },
    ],
    includeGst,
    gstRate: avgRate,
    tripAmounts: lineTaxables,
    includeFuel: false,
    fuelRate: 0,
    additionalCharges: [],
    invoiceOrgId: args.bundle.order.organization_id,
    tripOrgIds: [args.bundle.order.organization_id],
    hsn_sac: invoiceLines.find((l) => l.hsn_sac)?.hsn_sac ?? null,
  });

  const preview_date = (args.previewDate ?? new Date().toISOString().slice(0, 10)).trim();
  const issued =
    args.bundle.invoiceStatus.action === "view_invoice" &&
    Boolean(args.bundle.invoiceStatus.invoiceNumber?.trim());
  const invoiceNumber = issued
    ? String(args.bundle.invoiceStatus.invoiceNumber).trim()
    : INVOICE_DRAFT_NUMBER_LABEL;

  return {
    document_kind: issued ? "issued" : "draft",
    invoice_number_label: invoiceNumber,
    preview_date,
    indicative_due_date: null,
    payment_terms: args.paymentTerms ?? null,
    notes: args.notes ?? `Order ${args.bundle.order.order_number}`,
    issuer: issuerIdentity,
    client: {
      client_id: args.bundle.customer.id,
      legal_name: args.bundle.customer.legal_name,
      display_name: args.bundle.customer.display_name,
      gstin: args.bundle.customer.gstin,
      pan: args.bundle.customer.pan,
      billing_address: args.bundle.customer.billing_address,
      state: args.bundle.customer.state,
      email: args.bundle.customer.email,
    },
    lines: invoiceLines.map((l) => ({
      trip_id: null,
      trip_ref: l.sku,
      description: [l.sku, l.hsn_sac ? `HSN ${l.hsn_sac}` : "HSN incomplete", l.description]
        .filter(Boolean)
        .join(" — "),
      qty: l.qty,
      unit: l.unit,
      rate: l.rate,
      taxable_value: l.taxable_value,
      line_type: l.line_type,
      hsn_sac: l.hsn_sac,
      tax_rate: l.tax_rate,
    })),
    tax,
  };
}

export async function saveCommerceOrderInvoiceDraft(args: {
  orgId: string;
  bundle: CommerceOrderInvoiceBundle;
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
}): Promise<{ error: Error | null; draftId?: string; draftNumber?: string }> {
  try {
    if (!isCommerceDataQueryEnabled()) throw COMMERCE_LOCKED_ERROR;
    if (args.bundle.invoiceStatus.action === "view_invoice") {
      throw new Error("This order already has an issued invoice.");
    }
    if (!isSalesOrderInvoiceable(args.bundle.order)) {
      throw new Error(
        args.bundle.invoiceStatus.reason ??
          "Only Fulfilled Commerce orders can be invoiced.",
      );
    }

    const existingDraftId =
      args.bundle.activeInvoice?.status === "draft"
        ? args.bundle.activeInvoice.id
        : null;
    if (existingDraftId) {
      const { error } = await supabase()
        .from("invoices")
        .update({
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
        } as never)
        .eq("org_id", args.orgId)
        .eq("id", existingDraftId)
        .eq("status", "draft");
      if (error) throw toAppError(error);
      return { error: null, draftId: existingDraftId };
    }

    const invoiceNumber = draftInvoiceNumber();
    const invoiceDate = new Date().toISOString().slice(0, 10);
    const { data, error } = await supabase()
      .from("invoices")
      .insert({
        org_id: args.orgId,
        invoice_number: invoiceNumber,
        financial_year: "DRAFT",
        client_id: args.bundle.customer.id,
        client_name: args.bundle.customer.display_name,
        invoice_date: invoiceDate,
        trip_ids: [],
        sales_order_id: args.bundle.order.id,
        invoice_source: "order",
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

export async function issueCommerceOrderInvoice(args: {
  orgId: string;
  salesOrderId: string;
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
  draftId?: string | null;
  createdBy?: string | null;
  idempotencyKey: string;
  issuerSnapshot?: InvoiceIssuerSnapshot | null;
  clientSnapshot?: InvoiceClientSnapshot | null;
  lineItems?: InvoiceLineSnapshot[] | null;
  taxSnapshot?: InvoiceTaxSnapshot | null;
}): Promise<{ error: Error | null; invoiceNumber?: string }> {
  try {
    if (!isCommerceDataQueryEnabled()) throw COMMERCE_LOCKED_ERROR;
    const hsnBlock = invoiceHsnIssueBlock(args.lineItems ?? []);
    if (hsnBlock) throw new Error(hsnBlock);
    const invoiceDate = new Date().toISOString().slice(0, 10);
    const { data, error } = await supabase().rpc("issue_sales_order_invoice", {
      p_org_id: args.orgId,
      p_client_id: args.clientId,
      p_client_name: args.clientName,
      p_sales_order_id: args.salesOrderId,
      p_subtotal: args.subtotal,
      p_gst_rate: args.gstRate,
      p_sgst_amount: args.sgstAmount,
      p_cgst_amount: args.cgstAmount,
      p_igst_amount: args.igstAmount,
      p_total_amount: args.totalAmount,
      p_notes: args.notes ?? null,
      p_invoice_date: invoiceDate,
      p_due_date: null,
      p_created_by: args.createdBy ?? null,
      p_draft_id: args.draftId ?? null,
      p_idempotency_key: args.idempotencyKey,
      p_issuer_snapshot: args.issuerSnapshot ?? null,
      p_client_snapshot: args.clientSnapshot ?? null,
      p_line_items: args.lineItems ?? null,
      p_tax_snapshot: args.taxSnapshot ?? null,
      p_payment_terms: args.paymentTerms ?? null,
    } as never);
    if (error) throw toAppError(error);
    return {
      error: null,
      invoiceNumber: data ? String(data) : undefined,
    };
  } catch (e) {
    return { error: toAppError(e) };
  }
}

export async function cancelCommerceOrderInvoiceDraft(args: {
  orgId: string;
  draftId: string;
}): Promise<{ error: Error | null }> {
  return discardInvoiceDraft(args.orgId, args.draftId);
}
