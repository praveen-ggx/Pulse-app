/**
 * Download Trip & Indent report as .xlsx (web download / native share).
 * Uses xlsx-js-style so fonts / borders / fills survive write (community xlsx strips them).
 */
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import * as XLSX from "xlsx-js-style";
import { Platform, Share } from "react-native";

import { prependPulseExcelBanner } from "@/lib/reportWatermark.util";
import {
  TRIP_INDENT_REPORT_COLUMNS,
  tripIndentReportColumnsForAccess,
  tripIndentReportFileName,
  type TripIndentReportColumnKey,
  type TripIndentReportRow,
} from "@/features/trips/utils/tripIndentReport.model";

type ReportColumn = { key: TripIndentReportColumnKey; label: string };

const FONT_NAME = "Calibri";
const FONT_SIZE = 10;

const THIN_BORDER = {
  top: { style: "thin" as const, color: { rgb: "D0D5DD" } },
  bottom: { style: "thin" as const, color: { rgb: "D0D5DD" } },
  left: { style: "thin" as const, color: { rgb: "D0D5DD" } },
  right: { style: "thin" as const, color: { rgb: "D0D5DD" } },
};

const BASE_FONT = { name: FONT_NAME, sz: FONT_SIZE, color: { rgb: "1F2937" } };

/** Columns written as Excel numbers with consistent money format. */
const NUMERIC_COLUMN_KEYS = new Set<TripIndentReportColumnKey>([
  "clientCost",
  "supplierCost",
]);

const MONEY_NUM_FMT = "#,##0.00";

function triggerWebDownload(blob: Blob, fileName: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(objectUrl);
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

function findHeaderRowIndex(sheet: XLSX.WorkSheet): number {
  const range = XLSX.utils.decode_range(sheet["!ref"] ?? "A1");
  for (let r = range.s.r; r <= range.e.r; r += 1) {
    const cell = sheet[`A${r + 1}`] as XLSX.CellObject | undefined;
    if (cell && String(cell.v ?? "") === "Customer Name") return r;
  }
  return -1;
}

/** Apply Calibri 10, bold headers, borders, alignment, money formats, widths, autofilter. */
export function applyTripIndentReportSheetFormatting(
  sheet: XLSX.WorkSheet,
  columns: readonly ReportColumn[] = TRIP_INDENT_REPORT_COLUMNS,
): void {
  const ref = sheet["!ref"];
  if (!ref) return;
  const range = XLSX.utils.decode_range(ref);
  const headerRow = findHeaderRowIndex(sheet);
  const lastCol = range.e.c;
  const lastRow = range.e.r;
  const colCount = columns.length;
  const widths = columns.map((col) =>
    Math.max(10, Math.min(28, col.label.length + 2)),
  );

  for (let r = range.s.r; r <= lastRow; r += 1) {
    const isHeader = r === headerRow;
    const isData = headerRow >= 0 && r > headerRow;
    const isMeta = headerRow < 0 || r < headerRow;

    for (let c = 0; c <= lastCol; c += 1) {
      const addr = `${excelColumnName(c)}${r + 1}`;
      let cell = sheet[addr] as XLSX.CellObject | undefined;
      if (!cell) {
        if (!isHeader && !isData) continue;
        cell = { t: "s", v: "" };
        sheet[addr] = cell;
      }

      const colKey = c < colCount ? columns[c]?.key : undefined;
      const isNumericCol = Boolean(colKey && NUMERIC_COLUMN_KEYS.has(colKey));

      if (isData && isNumericCol && cell.v !== "" && cell.v != null) {
        const num = typeof cell.v === "number" ? cell.v : Number(cell.v);
        if (Number.isFinite(num)) {
          cell.t = "n";
          cell.v = num;
        }
      }

      const horizontal: "left" | "center" | "right" =
        isHeader ? "center" : isNumericCol && isData ? "right" : "left";

      cell.s = {
        font: {
          ...BASE_FONT,
          bold: isHeader || (isMeta && c === 0 && r === range.s.r),
        },
        alignment: {
          horizontal,
          vertical: "center",
          wrapText: isHeader,
        },
        ...(isHeader || isData
          ? {
              border: THIN_BORDER,
              ...(isHeader
                ? {
                    fill: {
                      patternType: "solid" as const,
                      fgColor: { rgb: "EEF2F6" },
                    },
                  }
                : {}),
            }
          : {}),
        ...(isData && isNumericCol && cell.t === "n"
          ? { numFmt: MONEY_NUM_FMT }
          : {}),
      };

      const display =
        cell.t === "n" && typeof cell.v === "number"
          ? cell.v.toLocaleString("en-IN", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })
          : String(cell.v ?? "");
      if (c < widths.length) {
        widths[c] = Math.max(widths[c] ?? 10, Math.min(48, display.length + 2));
      }
    }
  }

  sheet["!cols"] = widths.map((wch) => ({ wch }));
  sheet["!rows"] = Array.from({ length: lastRow + 1 }, (_, r) =>
    r === headerRow ? { hpt: 22 } : { hpt: 16 },
  );

  if (headerRow >= 0) {
    const endCol = excelColumnName(Math.min(lastCol, colCount - 1));
    sheet["!autofilter"] = {
      ref: `A${headerRow + 1}:${endCol}${lastRow + 1}`,
    };
  }
}

export type TripIndentReportDownloadOptions = {
  companyName?: string;
  fileName?: string;
  /** Include Client Cost / Supplier Cost (finance members only). */
  includeCosts?: boolean;
  /** Notes shown in the sheet banner (truncation, enrichment gaps). */
  notes?: string[];
};

export function buildTripIndentReportWorkbook(
  rows: TripIndentReportRow[],
  companyNameOrOptions?: string | TripIndentReportDownloadOptions,
): XLSX.WorkBook {
  const options: TripIndentReportDownloadOptions =
    typeof companyNameOrOptions === "string"
      ? { companyName: companyNameOrOptions }
      : companyNameOrOptions ?? {};
  /** Opt-in only — never include costs unless the caller explicitly sets true. */
  const includeCosts = options.includeCosts === true;
  const columns = tripIndentReportColumnsForAccess(includeCosts);
  const header = columns.map((c) => c.label);
  const body = rows.map((row) =>
    columns.map((c) => {
      const v = row[c.key];
      return v == null ? "" : v;
    }),
  );
  const noteRows = (options.notes ?? [])
    .map((n) => n.trim())
    .filter(Boolean)
    .map((n) => ["Note", n] as (string | number)[]);
  const sheetRows: (string | number)[][] = [
    ["Pulse Trip Report"],
    ...(options.companyName ? [["Company", options.companyName]] : []),
    ["Generated", new Date().toLocaleString("en-IN")],
    ["Rows", rows.length],
    ...noteRows,
    [],
    header,
    ...body,
  ];
  const sheet = XLSX.utils.aoa_to_sheet(prependPulseExcelBanner(sheetRows));
  applyTripIndentReportSheetFormatting(sheet, columns);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, "Trip Report");
  return wb;
}

export async function downloadTripIndentReportExcel(
  rows: TripIndentReportRow[],
  options?: TripIndentReportDownloadOptions,
): Promise<void> {
  const workbook = buildTripIndentReportWorkbook(rows, options);
  const fileName = options?.fileName ?? tripIndentReportFileName();
  if (Platform.OS === "web") {
    const arrayBuffer = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
    const blob = new Blob([arrayBuffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    triggerWebDownload(blob, fileName);
    return;
  }
  const cacheDirectory = (FileSystem as { cacheDirectory?: string }).cacheDirectory;
  if (!cacheDirectory) throw new Error("No cache directory");
  const base64 = XLSX.write(workbook, { type: "base64", bookType: "xlsx" });
  const uri = `${cacheDirectory}${fileName}`;
  await FileSystem.writeAsStringAsync(uri, base64, { encoding: "base64" });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      dialogTitle: "Trip Report",
      UTI: "org.openxmlformats.spreadsheetml.sheet",
    });
    return;
  }
  await Share.share({ url: uri, title: fileName });
}
