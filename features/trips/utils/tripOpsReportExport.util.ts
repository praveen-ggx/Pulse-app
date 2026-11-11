/**
 * Download the Trip Ops Excel report (.xlsx) in the All Trips sample layout:
 * sheet name "All Trips", headers on row 1, blue header fill + bordered table.
 * Column contract lives in tripOpsReport.model — keep Sales tripIndentReport separate.
 */
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import * as XLSX from "xlsx-js-style";
import { Platform, Share } from "react-native";

import {
  TRIP_OPS_REPORT_COLUMNS,
  tripOpsReportFileName,
  type TripOpsReportColumnKey,
  type TripOpsReportRow,
} from "@/features/trips/utils/tripOpsReport.model";

export type TripOpsReportDownloadOptions = {
  companyName?: string;
  fileName?: string;
  notes?: string[];
  /** Kept for callers; All Trips sheet is header-only (sample format). */
  title?: string;
};

/** Sample header fill (light blue). */
const HEADER_FILL_RGB = "B4C6E7";
const FONT_NAME = "Calibri";
const HEADER_FONT_SIZE = 9;
const BODY_FONT_SIZE = 9;

const THIN_BLACK_BORDER = {
  top: { style: "thin" as const, color: { rgb: "000000" } },
  bottom: { style: "thin" as const, color: { rgb: "000000" } },
  left: { style: "thin" as const, color: { rgb: "000000" } },
  right: { style: "thin" as const, color: { rgb: "000000" } },
};

/** Approximate widths from the All Trips sample sheet. */
const COLUMN_WIDTHS = [
  20, 14, 45, 49, 19, 21, 46, 14, 22, 14, 16, 8, 20, 20, 20, 20, 20, 20, 20, 21,
];

const NUMERIC_KEYS = new Set<TripOpsReportColumnKey>(["km"]);

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

function safeCell(v: string | number | null | undefined): string | number {
  if (v == null) return "";
  if (typeof v === "number") return v;
  const s = String(v);
  if (s.length > 0 && "=+-@\t\r\n".includes(s[0])) return `'${s}`;
  return s;
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

/** Apply sample table look: blue header, Calibri 9, thin borders, centered. */
export function applyTripOpsReportSheetFormatting(
  sheet: XLSX.WorkSheet,
  rowCount: number,
): void {
  const colCount = TRIP_OPS_REPORT_COLUMNS.length;
  const lastRow = Math.max(0, rowCount); // header + body (0-based last index)
  for (let r = 0; r <= lastRow; r += 1) {
    const isHeader = r === 0;
    for (let c = 0; c < colCount; c += 1) {
      const addr = `${excelColumnName(c)}${r + 1}`;
      let cell = sheet[addr] as XLSX.CellObject | undefined;
      if (!cell) {
        cell = { t: "s", v: "" };
        sheet[addr] = cell;
      }
      const key = TRIP_OPS_REPORT_COLUMNS[c]?.key;
      const isNumeric = Boolean(key && NUMERIC_KEYS.has(key));
      if (!isHeader && isNumeric && cell.v !== "" && cell.v != null) {
        const num = typeof cell.v === "number" ? cell.v : Number(cell.v);
        if (Number.isFinite(num)) {
          cell.t = "n";
          cell.v = num;
        }
      }
      cell.s = {
        font: {
          name: FONT_NAME,
          sz: isHeader ? HEADER_FONT_SIZE : BODY_FONT_SIZE,
          bold: isHeader,
        },
        alignment: {
          horizontal: "center",
          vertical: "center",
          wrapText: isHeader,
        },
        border: THIN_BLACK_BORDER,
        ...(isHeader
          ? {
              fill: {
                patternType: "solid" as const,
                fgColor: { rgb: HEADER_FILL_RGB },
              },
            }
          : {}),
      };
    }
  }
  sheet["!cols"] = COLUMN_WIDTHS.map((wch) => ({ wch }));
  sheet["!rows"] = Array.from({ length: lastRow + 1 }, (_, r) =>
    r === 0 ? { hpt: 20 } : { hpt: 16 },
  );
  if (lastRow >= 0) {
    const endCol = excelColumnName(colCount - 1);
    sheet["!autofilter"] = { ref: `A1:${endCol}${lastRow + 1}` };
  }
}

export function buildTripOpsReportWorkbook(
  rows: TripOpsReportRow[],
  _options: TripOpsReportDownloadOptions = {},
): XLSX.WorkBook {
  const columns = TRIP_OPS_REPORT_COLUMNS;
  const header = columns.map((c) => c.label);
  const body = rows.map((row) => columns.map((c) => safeCell(row[c.key])));
  const sheet = XLSX.utils.aoa_to_sheet([header, ...body]);
  applyTripOpsReportSheetFormatting(sheet, body.length);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, "All Trips");
  return wb;
}

export async function downloadTripOpsReportExcel(
  rows: TripOpsReportRow[],
  options?: TripOpsReportDownloadOptions,
): Promise<void> {
  const workbook = buildTripOpsReportWorkbook(rows, options);
  const fileName = options?.fileName ?? tripOpsReportFileName();
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
