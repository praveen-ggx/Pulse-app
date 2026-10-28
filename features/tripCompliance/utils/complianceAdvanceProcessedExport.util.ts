/**
 * Advance Processed stage — Export Report sheet. One row per trip, same values
 * as the Advance Processed payments table (supplier payout account, request ID, UTR).
 */
import type { AdvanceProcessedEnrichment } from "@/features/tripCompliance/services/complianceAdvanceProcessed.service";
import type { ComplianceTripSummary } from "@/features/tripCompliance/tripCompliance.types";
import { exportLrNumber } from "@/features/tripCompliance/utils/complianceVerifiedExport.util";
import { getTripDisplayNumber } from "@/features/trips/services/trips.service";
import { formatIndianVehicleNumber } from "@/lib/format";
import * as XLSX from "xlsx";

export const ADVANCE_PROCESSED_EXPORT_HEADERS = [
  "TRIP ID",
  "LR NO",
  "TRUCK NO",
  "PAYMENT TYPE",
  "REQUEST ID",
  "SUPPLIER NAME",
  "BENEFICIARY NAME",
  "BANK NAME",
  "IFSC",
  "ACCOUNT NUMBER",
  "ACCOUNT BRANCH",
  "MODE",
  "TRANSACTION DATE",
  "AMOUNT",
  "UTR",
] as const;

export type AdvanceProcessedExportHeader = (typeof ADVANCE_PROCESSED_EXPORT_HEADERS)[number];
export type AdvanceProcessedExportRow = Record<AdvanceProcessedExportHeader, string>;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatTransactionDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return `${String(date.getDate()).padStart(2, "0")} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

function amountCell(amount: number | null | undefined): string {
  return amount != null && Number.isFinite(amount) ? String(Math.round(amount * 100) / 100) : "";
}

export function buildAdvanceProcessedExportRow(
  summary: ComplianceTripSummary,
  info: AdvanceProcessedEnrichment | undefined,
): AdvanceProcessedExportRow {
  const trip = summary.trip;
  const advance = summary.advance;
  const payment = info?.payment ?? advance ?? null;
  const supplier = (info?.supplierName || trip.supplier_name || "").trim();
  return {
    "TRIP ID": getTripDisplayNumber(trip, trip.organization_id ?? null),
    "LR NO": exportLrNumber(summary),
    "TRUCK NO": formatIndianVehicleNumber(trip.vehicle_display_number?.trim() || "").trim(),
    "PAYMENT TYPE": "Advance",
    "REQUEST ID": (info?.requestId ?? "").trim(),
    "SUPPLIER NAME": supplier,
    "BENEFICIARY NAME": (info?.beneficiaryName ?? "").trim(),
    "BANK NAME": (info?.bankName ?? "").trim(),
    IFSC: (info?.ifsc ?? "").trim(),
    "ACCOUNT NUMBER": (info?.accountNumber ?? "").trim(),
    "ACCOUNT BRANCH": (info?.branch ?? "").trim(),
    MODE: (payment?.paymentMode ?? "").trim(),
    "TRANSACTION DATE": formatTransactionDate(payment?.paidAt),
    AMOUNT: amountCell(advance?.amount),
    UTR: (info?.payment?.utr ?? advance?.utr ?? "").trim(),
  };
}

/** Advance Payment export: same bank-sheet columns plus STATUS (Pending / Paid) at the end. */
export const ADVANCE_PAYMENT_EXPORT_HEADERS = [...ADVANCE_PROCESSED_EXPORT_HEADERS, "STATUS"] as const;
export type AdvancePaymentExportStatus = "Pending" | "Paid";
export type AdvancePaymentExportRow = AdvanceProcessedExportRow & { STATUS: AdvancePaymentExportStatus };

export type AdvancePayeeBank = {
  name: string;
  beneficiary: string;
  bankName: string;
  ifsc: string;
  accountNumber: string;
  branch: string;
};

/** Paid row: the posted advance, exactly as the Advance Processed export shows it. */
export function buildAdvancePaymentPaidRow(
  summary: ComplianceTripSummary,
  info: AdvanceProcessedEnrichment | undefined,
): AdvancePaymentExportRow {
  return { ...buildAdvanceProcessedExportRow(summary, info), STATUS: "Paid" };
}

/** Pending row: payee bank and the advance payable; mode / date / UTR stay blank until paid. */
export function buildAdvancePaymentPendingRow(
  summary: ComplianceTripSummary,
  bank: AdvancePayeeBank | undefined,
  payable: number | null,
  requestNo = "",
): AdvancePaymentExportRow {
  const trip = summary.trip;
  return {
    "TRIP ID": getTripDisplayNumber(trip, trip.organization_id ?? null),
    "LR NO": exportLrNumber(summary),
    "TRUCK NO": formatIndianVehicleNumber(trip.vehicle_display_number?.trim() || "").trim(),
    "PAYMENT TYPE": "Advance",
    "REQUEST ID": requestNo.trim(),
    "SUPPLIER NAME": (bank?.name || trip.supplier_name || "").trim(),
    "BENEFICIARY NAME": (bank?.beneficiary ?? "").trim(),
    "BANK NAME": (bank?.bankName ?? "").trim(),
    IFSC: (bank?.ifsc ?? "").trim(),
    "ACCOUNT NUMBER": (bank?.accountNumber ?? "").trim(),
    "ACCOUNT BRANCH": (bank?.branch ?? "").trim(),
    MODE: "",
    "TRANSACTION DATE": "",
    AMOUNT: amountCell(payable),
    UTR: "",
    STATUS: "Pending",
  };
}

export function countAdvancePaymentExport(rows: AdvancePaymentExportRow[]) {
  const paid = rows.filter((row) => row.STATUS === "Paid").length;
  return { total: rows.length, paid, pending: rows.length - paid };
}

export function countAdvanceProcessedExport(rows: AdvanceProcessedExportRow[]) {
  const withUtr = rows.filter((row) => row.UTR.length > 0).length;
  return { total: rows.length, withUtr, awaitingUtr: rows.length - withUtr };
}

/**
 * Supplier / beneficiary names and references are user-entered: a leading
 * = + - @ (or tab / CR) would run as a formula when the sheet is opened.
 */
export function neutralizeFormula(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

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

const AMOUNT_FORMAT = "#,##0.00";

/**
 * Text cells ("@") everywhere except AMOUNT, so account numbers / IFSC / UTR keep
 * leading zeros and full length; AMOUNT is numeric so Excel can total it.
 */
export function buildAdvanceProcessedExportWorksheet(rows: AdvanceProcessedExportRow[]): XLSX.WorkSheet {
  return buildPaymentSheet(ADVANCE_PROCESSED_EXPORT_HEADERS, rows);
}

function buildPaymentSheet<H extends string>(
  headers: readonly H[],
  rows: Record<H, string>[],
): XLSX.WorkSheet {
  const sheet: XLSX.WorkSheet = {};
  const widths: number[] = headers.map((header) => header.length);

  headers.forEach((header, c) => {
    sheet[`${excelColumnName(c)}1`] = { t: "s", v: header };
  });

  rows.forEach((row, r) => {
    headers.forEach((header, c) => {
      const raw = (row[header] ?? "").trim();
      if (!raw) return;
      const ref = `${excelColumnName(c)}${r + 2}`;
      const num = header === "AMOUNT" ? Number(raw) : Number.NaN;
      if (Number.isFinite(num)) {
        sheet[ref] = { t: "n", v: num, z: AMOUNT_FORMAT };
        widths[c] = Math.max(widths[c], num.toLocaleString("en-IN", { minimumFractionDigits: 2 }).length);
      } else {
        sheet[ref] = { t: "s", v: neutralizeFormula(raw), z: "@" };
        widths[c] = Math.max(widths[c], raw.length);
      }
    });
  });

  const lastCol = excelColumnName(headers.length - 1);
  const lastRow = Math.max(1, rows.length + 1);
  sheet["!ref"] = `A1:${lastCol}${lastRow}`;
  sheet["!autofilter"] = { ref: `A1:${lastCol}${lastRow}` };
  sheet["!cols"] = widths.map((w) => ({ wch: Math.min(44, Math.max(8, w + 2)) }));
  return sheet;
}

export function buildAdvanceProcessedExportWorkbook(rows: AdvanceProcessedExportRow[]): XLSX.WorkBook {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, buildAdvanceProcessedExportWorksheet(rows), "Advance Processed");
  return workbook;
}

export function buildAdvancePaymentExportWorkbook(rows: AdvancePaymentExportRow[]): XLSX.WorkBook {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, buildPaymentSheet(ADVANCE_PAYMENT_EXPORT_HEADERS, rows), "Advance Payment");
  return workbook;
}
