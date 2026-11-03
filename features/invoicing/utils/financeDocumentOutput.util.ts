/**
 * Print, PDF, share and CSV for finance documents, following the platform
 * conventions already used by reports and provision notes:
 * - web: the browser print dialog (Save as PDF), Blob downloads, Web Share when present
 * - native: expo-print to a PDF file, then the system share sheet
 */
import * as FileSystem from "expo-file-system/legacy";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { Platform, Share } from "react-native";

import { printHtmlOnWeb } from "@/lib/webPrint.util";

const A4 = { width: 595, height: 842 };

function webDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

async function pdfFile(html: string): Promise<string> {
  const { uri } = await Print.printToFileAsync({ html, width: A4.width, height: A4.height });
  return uri;
}

/** Opens the print dialog. On web this is also how a PDF is saved. */
export async function printFinanceDocument(html: string, title: string): Promise<void> {
  if (Platform.OS === "web") {
    const ok = await printHtmlOnWeb(html, { title });
    if (!ok) throw new Error("The print dialog could not be opened in this browser.");
    return;
  }
  await Print.printAsync({ html });
}

/** Native: writes a PDF and opens the share sheet to save it. Web: print dialog → Save as PDF. */
export async function downloadFinancePdf(html: string, title: string): Promise<void> {
  if (Platform.OS === "web") {
    await printFinanceDocument(html, title);
    return;
  }
  const uri = await pdfFile(html);
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: title, UTI: "com.adobe.pdf" });
    return;
  }
  await Share.share({ url: uri, title });
}

/** Shares the PDF on native; on web shares the text summary, or copies it when sharing is unavailable. */
export async function shareFinanceDocument(args: { html: string; title: string; text: string }): Promise<"shared" | "copied"> {
  if (Platform.OS === "web") {
    const nav = typeof navigator !== "undefined" ? navigator : undefined;
    if (nav?.share) {
      await nav.share({ title: args.title, text: args.text });
      return "shared";
    }
    if (nav?.clipboard?.writeText) {
      await nav.clipboard.writeText(args.text);
      return "copied";
    }
    throw new Error("Sharing is not available in this browser.");
  }
  const uri = await pdfFile(args.html);
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: args.title, UTI: "com.adobe.pdf" });
  } else {
    await Share.share({ url: uri, title: args.title, message: args.text });
  }
  return "shared";
}

export async function exportFinanceCsv(csv: string, fileName: string): Promise<void> {
  const name = fileName.endsWith(".csv") ? fileName : `${fileName}.csv`;
  // BOM so spreadsheet apps read ₹ and names correctly.
  const content = `﻿${csv}`;
  if (Platform.OS === "web") {
    webDownload(new Blob([content], { type: "text/csv;charset=utf-8" }), name);
    return;
  }
  const cacheDirectory = (FileSystem as { cacheDirectory?: string }).cacheDirectory;
  if (!cacheDirectory) throw new Error("No cache directory available");
  const uri = `${cacheDirectory}${name}`;
  await FileSystem.writeAsStringAsync(uri, content, { encoding: "utf8" });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: "text/csv", dialogTitle: name });
    return;
  }
  await Share.share({ url: uri, title: name });
}
