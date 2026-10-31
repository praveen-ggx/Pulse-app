/**
 * Download the classic Trip Ops Excel report (.xlsx).
 * Column contract lives in tripOpsReport.model — keep Sales tripIndentReport separate.
 */
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import * as XLSX from "xlsx-js-style";
import { Platform, Share } from "react-native";

import { prependPulseExcelBanner } from "@/lib/reportWatermark.util";
import {
  TRIP_OPS_REPORT_COLUMNS,
  tripOpsReportFileName,
  type TripOpsReportRow,
} from "@/features/trips/utils/tripOpsReport.model";

export type TripOpsReportDownloadOptions = {
  companyName?: string;
  fileName?: string;
  notes?: string[];
  /** Banner subtitle — defaults to "Trips Export". */
  title?: string;
};

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

export function buildTripOpsReportWorkbook(
  rows: TripOpsReportRow[],
  options: TripOpsReportDownloadOptions = {},
): XLSX.WorkBook {
  const columns = TRIP_OPS_REPORT_COLUMNS;
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
  const title = options.title ?? "Trips Export";
  const sheetRows: (string | number)[][] = [
    [title],
    ...(options.companyName ? [["Company", options.companyName]] : []),
    ["Generated", new Date().toLocaleString("en-IN")],
    ["Rows", rows.length],
    ...noteRows,
    [],
    header,
    ...body,
  ];
  const sheet = XLSX.utils.aoa_to_sheet(prependPulseExcelBanner(sheetRows));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, "Trips Export");
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
