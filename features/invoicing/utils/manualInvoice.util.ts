import type { InvoiceLineSnapshot } from "@/features/invoicing/services/invoiceDocumentSnapshot.service";
import { round2 } from "@/features/invoicing/services/invoiceTax.service";
import { normalizeHsnSac } from "@/features/invoicing/utils/invoiceLineHsn.util";

export type ManualInvoiceLineDraft = {
  id: string;
  description: string;
  sku: string;
  hsnSac: string;
  qty: string;
  rate: string;
  discount: string;
  taxRate: string;
};

export function emptyManualInvoiceLine(id?: string): ManualInvoiceLineDraft {
  return {
    id: id ?? `line-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    description: "",
    sku: "",
    hsnSac: "",
    qty: "1",
    rate: "",
    discount: "0",
    taxRate: "18",
  };
}

export function buildManualInvoiceLines(
  drafts: ManualInvoiceLineDraft[],
): InvoiceLineSnapshot[] {
  return drafts
    .map((draft) => {
      const qty = Number(draft.qty);
      const rate = Number(draft.rate);
      const discount = Number(draft.discount || 0);
      const taxRate = Number(draft.taxRate);
      const description =
        draft.description.trim() || draft.sku.trim() || "Line item";
      if (!Number.isFinite(qty) || qty <= 0) return null;
      if (!Number.isFinite(rate) || rate < 0) return null;
      const taxable = round2(Math.max(0, qty * rate - (Number.isFinite(discount) ? discount : 0)));
      return {
        trip_id: null,
        trip_ref: draft.sku.trim() || null,
        description,
        qty,
        unit: "ea",
        rate,
        taxable_value: taxable,
        line_type: "goods" as const,
        hsn_sac: normalizeHsnSac(draft.hsnSac),
        tax_rate: Number.isFinite(taxRate) ? taxRate : null,
      };
    })
    .filter((line): line is InvoiceLineSnapshot => line != null);
}
