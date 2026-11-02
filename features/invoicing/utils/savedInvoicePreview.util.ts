import type { InvoiceLineSnapshot } from "@/features/invoicing/services/invoiceDocumentSnapshot.service";
import type { InvoiceIssuerIdentity } from "@/features/invoicing/services/invoiceIssuerIdentity.service";
import type { InvoiceStyleDetails } from "@/features/invoicing/services/invoiceStyleTemplate.service";
import type {
  InvoiceDraftClientView,
  InvoiceDraftModel,
} from "@/features/invoicing/services/invoicePreviewModel.service";
import { buildShipmentView } from "@/features/invoicing/services/invoicePreviewModel.service";
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
  dueDate?: string | null;
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
    // Saved invoices are rebuilt from stored lines, not trips — shipment block is empty.
    shipment: buildShipmentView([]),
    preview_date: input.invoiceDate,
    indicative_due_date: input.dueDate ?? null,
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

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseStyleDetails(value: unknown): InvoiceStyleDetails | null {
  const row = asRecord(value);
  if (!row) return null;
  const gst = text(row.gstRate);
  return {
    bankName: text(row.bankName),
    accountNumber: text(row.accountNumber),
    ifsc: text(row.ifsc),
    branch: text(row.branch),
    upi: text(row.upi),
    terms: text(row.terms),
    signatory: text(row.signatory),
    signatureUrl: text(row.signatureUrl).slice(0, 2000),
    gstRate: gst === "0" || gst === "5" || gst === "12" || gst === "18" ? gst : "",
    reverseCharge: row.reverseCharge === true,
    splitNotes: row.splitNotes !== false,
  };
}

export type IssuedInvoicePresentation = {
  format: string | null;
  accent: string | null;
  splitNotes: boolean;
  reverseCharge: boolean;
  logoUrl: string | null;
  issuerLines: string[];
  details: InvoiceStyleDetails | null;
};

export function parseIssuedPresentation(snapshots: {
  tax?: unknown;
  issuer?: unknown;
}): IssuedInvoicePresentation {
  const tax = asRecord(snapshots.tax);
  const presentation = asRecord(tax?.presentation);
  const issuer = asRecord(snapshots.issuer);
  const detail = issuer?.detail;
  const issuerLines = Array.isArray(detail)
    ? detail.filter((line): line is string => typeof line === "string" && line.trim().length > 0)
    : [];
  const hasPresentation = presentation != null;
  return {
    format: str(presentation?.format),
    accent: str(presentation?.accent),
    splitNotes: hasPresentation ? presentation.splitNotes === true : false,
    reverseCharge: presentation?.reverseCharge === true,
    logoUrl: str(presentation?.logoUrl),
    issuerLines,
    details: parseStyleDetails(presentation?.details),
  };
}
