/**
 * Verified-stage Compliance Export Report — spreadsheet columns (CSV).
 * One row per verified trip; money as plain numbers for clean Excel use.
 */
import type { ComplianceTripSummary } from "@/features/tripCompliance/tripCompliance.types";
import { COMPLIANCE_STAGE_FILTER_LABEL } from "@/features/tripCompliance/tripCompliance.types";
import {
  COMPLIANCE_DEFAULT_ADVANCE_PERCENT,
  computeCompliancePaymentAmount,
  computeComplianceTdsAmount,
  resolveComplianceDocumentationCharge,
  type ComplianceDocumentChargeConfig,
} from "@/features/tripCompliance/utils/compliancePaymentAmount.util";
import { formatComplianceTimestamp } from "@/features/tripCompliance/utils/complianceCardVisual.util";
import { splitHubRouteLocationDisplay } from "@/features/trips/utils/tripLocationDisplay.util";
import { getTripDisplayNumber } from "@/features/trips/services/trips.service";
import { formatIndianVehicleNumber } from "@/lib/format";
import { parseLrFieldValues } from "@/features/trips/services/lrDocumentOcr.util";
import { readStoredElrSnapshot } from "@/features/trips/services/elrSnapshot.util";
import { readStoredInvoiceNumber } from "@/features/trips/components/trip-detail/tripDocTypes";
import { isComplianceVerifiedRejected } from "@/features/tripCompliance/utils/complianceCardVisual.util";
import * as XLSX from "xlsx";

export const VERIFIED_EXPORT_CSV_HEADERS = [
  "TRIP ID",
  "Verification status",
  "Loading date",
  "Intransit date",
  "Client sales invoice No",
  "Account No",
  "Beneficiary Name",
  "IFSC No",
  "Branch Name",
  "LR No",
  "Customer",
  "Supplier",
  "Source",
  "Destination",
  "Truck No",
  "Truck Type",
  "Driver name",
  "Driver No.",
  "C Price",
  "S Price",
  "Advance",
  "Documentation charges",
  "TDS",
  "Final Advance",
  "Margin",
  "Margin %",
] as const;

export type VerifiedExportCsvHeader = (typeof VERIFIED_EXPORT_CSV_HEADERS)[number];

export type VerifiedExportCsvRow = Record<VerifiedExportCsvHeader, string>;

export type VerifiedExportEnrichment = {
  supplierName?: string | null;
  /** Account holder from supplier Banking. Blank when the supplier has no holder name. */
  beneficiaryName?: string | null;
  truckType?: string | null;
  driverPhone?: string | null;
  accountNumber?: string | null;
  ifsc?: string | null;
  branchName?: string | null;
  /** Vendor vault advance %; falls back to default when null. */
  advancePercent?: number | null;
  /** Supplier TDS rate % for current (or prior) FY. */
  tdsRatePercent?: number | null;
  /** Trip org's Document Charge Slabs; charge is looked up on S Price (base freight). */
  documentChargeConfig?: ComplianceDocumentChargeConfig | null;
};

type CommercialTrip = {
  client_price?: number | null;
  supplier_rate?: number | null;
  margin?: number | null;
  load_tons?: number | null;
  supplier_rate_basis?: string | null;
};

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function blank(value: string | null | undefined): string {
  const trimmed = (value ?? "").trim();
  return trimmed || "";
}

/** Indian mobiles as "+91XXXXXXXXXX" (Driver Profile → Phone); anything else kept as stored. */
export function formatExportPhone(raw: string | null | undefined): string {
  const value = (raw ?? "").trim();
  if (!value) return "";
  const digits = value.replace(/\D/g, "");
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
  if (digits.length === 11 && digits.startsWith("0")) return `+91${digits.slice(1)}`;
  return value;
}

function formatMoney(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "";
  return String(Math.round(value * 100) / 100);
}

function formatPercent(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "";
  return String(Math.round(value * 10) / 10);
}

function formatLoadingDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    // Date-only strings (YYYY-MM-DD) — avoid UTC shift by parsing parts.
    const m = iso.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return blank(iso);
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${Number(m[3])} ${months[Number(m[2]) - 1]} ${m[1]}`;
  }
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

function matchesExportDocType(documentType: string | null | undefined, type: "lr" | "invoice"): boolean {
  const raw = (documentType ?? "").toLowerCase().replace(/[\s-]+/g, "_");
  if (type === "lr") return raw === "lr" || raw === "lorry" || raw === "lorry_receipt";
  return raw === "invoice" || raw === "sales_invoice" || raw === "client_invoice";
}

function numberFromDocument(
  documents: ComplianceTripSummary["documents"][number],
  type: "lr" | "invoice",
): string {
  const raw = (documents.document_number ?? "").trim();
  if (!raw) return "";
  if (type === "lr") {
    const elr = readStoredElrSnapshot(raw)?.lrNumber?.trim();
    if (elr) return elr;
    if (raw.startsWith("{")) return parseLrFieldValues(raw).lrNumber?.trim() ?? "";
    return parseLrFieldValues(raw).lrNumber?.trim() || raw.replace(/^lr\s*no\.?\s*/i, "").trim();
  }
  return readStoredInvoiceNumber(raw) || raw.replace(/^invoice\s*no\.?\s*/i, "").trim();
}

export function latestDocNumber(
  documents: ComplianceTripSummary["documents"],
  type: "lr" | "invoice",
): string {
  const matches = documents.filter((doc) => matchesExportDocType(doc.document_type, type));
  if (matches.length === 0) return "";
  const withNumber = matches
    .map((doc) => ({
      at: doc.uploaded_at ?? "",
      number: numberFromDocument(doc, type),
    }))
    .filter((row) => row.number.length > 0)
    .sort((a, b) => b.at.localeCompare(a.at));
  return withNumber[0]?.number ?? "";
}

export function exportLrNumber(summary: ComplianceTripSummary): string {
  const fromDocs = latestDocNumber(summary.documents, "lr");
  if (fromDocs) return fromDocs;
  return (summary.hardCopyPod.lrNumbers ?? []).map((value) => value.trim()).find(Boolean) ?? "";
}

function supplierCostTotal(trip: CommercialTrip): number | null {
  const rate = Number(trip.supplier_rate);
  if (!Number.isFinite(rate)) return null;
  if (trip.supplier_rate_basis === "per_mt") {
    const tons = Number(trip.load_tons);
    if (Number.isFinite(tons) && tons > 0) return rate * tons;
    return null;
  }
  return rate;
}

function marginValues(trip: CommercialTrip): { margin: number | null; percent: number | null } {
  const client = Number(trip.client_price);
  const cost = supplierCostTotal(trip);
  const stored = Number(trip.margin);
  const margin =
    Number.isFinite(client) && cost != null
      ? client - cost
      : Number.isFinite(stored)
        ? stored
        : null;
  if (margin == null || !Number.isFinite(margin)) return { margin: null, percent: null };
  const percent = Number.isFinite(client) && client > 0 ? (margin / client) * 100 : null;
  return { margin, percent };
}

function placeLabel(raw: string | null | undefined): string {
  const split = splitHubRouteLocationDisplay(raw ?? "");
  const city = split.city?.trim() || "";
  const state = split.state?.trim() || "";
  if (city && state) return `${city}, ${state}`;
  return city || state || blank(raw);
}

/**
 * Build one CSV row for a Verified-stage trip.
 * Enrichment is optional — missing bank/vendor data leaves cells empty.
 */
export function buildVerifiedExportCsvRow(
  summary: ComplianceTripSummary,
  enrichment: VerifiedExportEnrichment = {},
): VerifiedExportCsvRow {
  const trip = summary.trip as typeof summary.trip & CommercialTrip;
  const commercial = trip;
  const supplierLabel =
    blank(enrichment.supplierName) ||
    blank(trip.supplier_name) ||
    "";
  const customer = blank(trip.client_name);
  const source = placeLabel(trip.pickup_area);
  const destination = placeLabel(trip.drop_location ?? trip.drop_area);
  const truckNo =
    formatIndianVehicleNumber(trip.vehicle_display_number?.trim() || "").trim() ||
    blank(trip.vehicle_display_number);
  const driverName = blank(trip.driver_display_name);
  const cPrice = Number(commercial.client_price);
  const sPrice = supplierCostTotal(commercial);
  const advancePercent =
    enrichment.advancePercent != null && Number.isFinite(Number(enrichment.advancePercent))
      ? Number(enrichment.advancePercent)
      : COMPLIANCE_DEFAULT_ADVANCE_PERCENT;
  const documentationCharges = resolveComplianceDocumentationCharge(
    enrichment.documentChargeConfig,
    sPrice,
  ).amount;
  const tdsAmount = computeComplianceTdsAmount(sPrice ?? 0, enrichment.tdsRatePercent);
  const finalAdvance =
    sPrice != null
      ? computeCompliancePaymentAmount({
          baseFreight: sPrice,
          advancePercent,
          documentationCharges,
          tdsAmount,
        })
      : 0;
  const { margin, percent: marginPercent } = marginValues(commercial);

  return {
    "TRIP ID": getTripDisplayNumber(trip, trip.organization_id ?? null),
    "Verification status": isComplianceVerifiedRejected(summary)
      ? "Rejected"
      : summary.financeFlaggedAt
        ? "Flagged for Compliance"
        : COMPLIANCE_STAGE_FILTER_LABEL.compliance_verified,
    "Loading date": formatLoadingDate(trip.pickup_date),
    "Intransit date":
      formatComplianceTimestamp(trip.started_at) === "—"
        ? ""
        : formatComplianceTimestamp(trip.started_at),
    "Client sales invoice No": latestDocNumber(summary.documents, "invoice"),
    "Account No": blank(enrichment.accountNumber),
    "Beneficiary Name": enrichment.beneficiaryName?.trim() || "",
    "IFSC No": blank(enrichment.ifsc),
    "Branch Name": blank(enrichment.branchName),
    "LR No": exportLrNumber(summary),
    Customer: customer,
    Supplier: supplierLabel,
    Source: source,
    Destination: destination,
    "Truck No": truckNo,
    "Truck Type": blank(enrichment.truckType),
    "Driver name": driverName,
    "Driver No.": formatExportPhone(enrichment.driverPhone),
    "C Price": Number.isFinite(cPrice) && cPrice > 0 ? formatMoney(cPrice) : "",
    "S Price": formatMoney(sPrice),
    Advance: formatMoney(sPrice != null ? (sPrice * advancePercent) / 100 : null),
    "Documentation charges": formatMoney(documentationCharges),
    TDS: formatMoney(tdsAmount),
    "Final Advance": formatMoney(finalAdvance),
    Margin: formatMoney(margin),
    "Margin %": formatPercent(marginPercent),
  };
}

/** Money / percent columns stay real numbers so Excel can sum and sort them. */
const VERIFIED_EXPORT_NUMERIC_COLUMNS: Partial<Record<VerifiedExportCsvHeader, string>> = {
  "C Price": "#,##0.00",
  "S Price": "#,##0.00",
  Advance: "#,##0.00",
  "Documentation charges": "#,##0.00",
  TDS: "#,##0.00",
  "Final Advance": "#,##0.00",
  Margin: "#,##0.00",
  "Margin %": "0.0",
};

function excelColumnName(index: number): string {
  let n = index + 1;
  let name = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    name = String.fromCharCode(65 + rem) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
}

/**
 * Sheet heading for the Advance column: "90% Advance" when every row uses the
 * same advance %, otherwise plain "Advance".
 */
export function verifiedAdvanceColumnLabel(advancePercents: readonly number[] = []): string {
  const unique = [...new Set(advancePercents.filter((p) => Number.isFinite(p)))];
  return unique.length === 1 ? `${formatPercent(unique[0])}% Advance` : "Advance";
}

function headerLabel(header: VerifiedExportCsvHeader, advancePercents?: readonly number[]): string {
  return header === "Advance" ? verifiedAdvanceColumnLabel(advancePercents) : header;
}

/**
 * Excel sheet for the Verified report. Every non-money column is written as a
 * text cell ("@"), so Account No / IFSC / phone / LR keep leading zeros and
 * full length instead of turning into 1.23E+15.
 */
export function buildVerifiedExportWorksheet(
  rows: VerifiedExportCsvRow[],
  advancePercents?: readonly number[],
): XLSX.WorkSheet {
  const sheet: XLSX.WorkSheet = {};
  const labels = VERIFIED_EXPORT_CSV_HEADERS.map((header) => headerLabel(header, advancePercents));
  const widths = labels.map((label) => label.length);

  labels.forEach((label, c) => {
    sheet[`${excelColumnName(c)}1`] = { t: "s", v: label };
  });

  rows.forEach((row, r) => {
    VERIFIED_EXPORT_CSV_HEADERS.forEach((header, c) => {
      const raw = (row[header] ?? "").trim();
      if (!raw) return;
      const ref = `${excelColumnName(c)}${r + 2}`;
      const numberFormat = VERIFIED_EXPORT_NUMERIC_COLUMNS[header];
      const num = numberFormat ? Number(raw) : Number.NaN;
      if (numberFormat && Number.isFinite(num)) {
        sheet[ref] = { t: "n", v: num, z: numberFormat };
        widths[c] = Math.max(widths[c], num.toLocaleString("en-IN").length + 3);
      } else {
        sheet[ref] = { t: "s", v: raw, z: "@" };
        widths[c] = Math.max(widths[c], raw.length);
      }
    });
  });

  const lastCol = excelColumnName(VERIFIED_EXPORT_CSV_HEADERS.length - 1);
  const lastRow = Math.max(1, rows.length + 1);
  sheet["!ref"] = `A1:${lastCol}${lastRow}`;
  sheet["!autofilter"] = { ref: `A1:${lastCol}${lastRow}` };
  sheet["!cols"] = widths.map((w) => ({ wch: Math.min(48, Math.max(10, w + 2)) }));
  return sheet;
}

export function buildVerifiedExportWorkbook(
  rows: VerifiedExportCsvRow[],
  advancePercents?: readonly number[],
): XLSX.WorkBook {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    buildVerifiedExportWorksheet(rows, advancePercents),
    "Verified Report",
  );
  return workbook;
}

export function verifiedExportRowsToCsv(
  rows: VerifiedExportCsvRow[],
  advancePercents?: readonly number[],
): string {
  const headerLine = VERIFIED_EXPORT_CSV_HEADERS.map((key) =>
    csvEscape(headerLabel(key, advancePercents)),
  ).join(",");
  const lines = rows.map((row) =>
    VERIFIED_EXPORT_CSV_HEADERS.map((key) => csvEscape(row[key] ?? "")).join(","),
  );
  return [headerLine, ...lines].join("\n");
}
