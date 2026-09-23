import type { InvoiceLineSnapshot } from "@/features/invoicing/services/invoiceDocumentSnapshot.service";
import type { InvoiceIssuerIdentity } from "@/features/invoicing/services/invoiceIssuerIdentity.service";
import type {
  InvoiceDraftClientView,
  InvoiceDraftModel,
} from "@/features/invoicing/services/invoicePreviewModel.service";
import type { InvoiceTaxResult } from "@/features/invoicing/services/invoiceTax.service";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function num(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function str(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t ? t : null;
}

export function parseSavedInvoiceLines(value: unknown): InvoiceLineSnapshot[] {
  if (!Array.isArray(value)) return [];
  const lines: InvoiceLineSnapshot[] = [];
  for (const raw of value) {
    const row = asRecord(raw);
    if (!row) continue;
    const description = str(row.description) ?? str(row.trip_ref) ?? "Line item";
    const lineType = str(row.line_type);
    lines.push({
      trip_id: str(row.trip_id),
      trip_ref: str(row.trip_ref),
      description,
      qty: num(row.qty, 1),
      unit: str(row.unit) ?? "ea",
      rate: num(row.rate),
      taxable_value: num(row.taxable_value, num(row.rate)),
      line_type:
        lineType === "freight" ||
        lineType === "fuel" ||
        lineType === "additional" ||
        lineType === "goods" ||
        lineType === "plan"
          ? lineType
          : "goods",
      hsn_sac: str(row.hsn_sac),
      tax_rate: typeof row.tax_rate === "number" ? row.tax_rate : null,
    });
  }
  return lines;
}

export function buildSavedInvoicePreviewModel(input: {
  issuer: InvoiceIssuerIdentity;
  invoiceNumber: string;
  invoiceDate: string;
  paymentTerms: string | null;
  notes: string | null;
  client: InvoiceDraftClientView;
  lines: InvoiceLineSnapshot[];
  subtotal: number;
  gstRate: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  totalAmount: number;
}): InvoiceDraftModel | null {
  if (input.lines.length === 0) return null;
  const tax: InvoiceTaxResult = {
    status: "ok",
    block_reason: null,
    taxable_base: input.subtotal,
    gst_rate: input.gstRate,
    cgst_amount: input.cgstAmount,
    sgst_amount: input.sgstAmount,
    igst_amount: input.igstAmount,
    total_amount: input.totalAmount,
    supply_type:
      input.igstAmount > 0 ? "inter" : input.cgstAmount + input.sgstAmount > 0 ? "intra" : null,
    snapshot: {
      supply_type: null,
      place_of_supply: input.client.state,
      hsn_sac: input.lines[0]?.hsn_sac ?? null,
      determination: "saved",
      gst_rate: input.gstRate,
      include_gst: input.cgstAmount + input.sgstAmount + input.igstAmount > 0,
    },
  };
  return {
    document_kind: "issued",
    invoice_number_label: input.invoiceNumber.trim() || "INV",
    preview_date: input.invoiceDate,
    indicative_due_date: null,
    payment_terms: input.paymentTerms,
    notes: input.notes,
    issuer: input.issuer,
    client: input.client,
    lines: input.lines,
    tax,
  };
}

export function manualLinesFromSavedItems(
  lines: InvoiceLineSnapshot[],
): Array<{
  id: string;
  description: string;
  sku: string;
  hsnSac: string;
  qty: string;
  rate: string;
  discount: string;
  taxRate: string;
}> {
  return lines.map((line, index) => ({
    id: `saved-${index + 1}`,
    description: line.description,
    sku: line.trip_ref ?? "",
    hsnSac: line.hsn_sac ?? "",
    qty: String(line.qty),
    rate: String(line.rate),
    discount: "0",
    taxRate: line.tax_rate != null ? String(line.tax_rate) : "18",
  }));
}
