/**
 * Map Commerce sales_order_lines (+ product snapshot fields) → invoice line snapshots.
 * Pure. Does not query. SKU/HSN are line properties for historical integrity.
 */

import type { InvoiceLineSnapshot } from "@/features/invoicing/services/invoiceDocumentSnapshot.service";
import { round2 } from "@/features/invoicing/services/invoiceTax.service";

export type CommerceOrderLineForInvoice = {
  id: string;
  quantity: number;
  unit_price: number;
  tax_rate: number;
  line_total: number;
  product?: {
    id?: string;
    name?: string | null;
    sku?: string | null;
    hsn_code?: string | null;
    description?: string | null;
  } | null;
};

export type CommerceOrderInvoiceLine = InvoiceLineSnapshot & {
  sku: string | null;
  sales_order_line_id: string | null;
};

export function buildCommerceOrderInvoiceLines(
  lines: CommerceOrderLineForInvoice[],
): CommerceOrderInvoiceLine[] {
  return lines.map((line) => {
    const qty = Number.isFinite(line.quantity) ? Number(line.quantity) : 0;
    const rate = Number.isFinite(line.unit_price) ? Number(line.unit_price) : 0;
    const taxable =
      Number.isFinite(line.line_total) && line.line_total > 0
        ? round2(Number(line.line_total))
        : round2(qty * rate);
    const sku = (line.product?.sku ?? "").trim() || null;
    const hsn = (line.product?.hsn_code ?? "").trim() || null;
    const name = (line.product?.name ?? "").trim() || "Line item";
    const description =
      (line.product?.description ?? "").trim() || name;

    return {
      trip_id: null,
      trip_ref: null,
      description,
      qty,
      unit: "ea",
      rate,
      taxable_value: taxable,
      line_type: "goods",
      hsn_sac: hsn,
      tax_rate: Number.isFinite(line.tax_rate) ? Number(line.tax_rate) : null,
      sku,
      sales_order_line_id: line.id,
    };
  });
}
