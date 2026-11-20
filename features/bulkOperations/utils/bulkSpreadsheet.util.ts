/**
 * Bulk payment files are CSV or Excel. Excel is converted to CSV before the
 * existing header mapper runs, so both formats share one column match.
 */
import * as XLSX from "xlsx";

const SPREADSHEET = /\.(xlsx|xls)$/i;

export function isSpreadsheetName(name: string): boolean {
  return SPREADSHEET.test(name.trim());
}

export async function spreadsheetToCsv(
  name: string,
  data: Uint8Array | string,
  type: "array" | "base64",
): Promise<string> {
  const excel = isSpreadsheetName(name) || looksLikeWorkbook(data, type);
  if (!excel) {
    if (typeof data === "string") return decodeBase64(data);
    return new TextDecoder("utf-8").decode(data);
  }
  const book = XLSX.read(data, { type });
  const sheet = book.Sheets[book.SheetNames[0] ?? ""];
  if (!sheet) return "";
  return XLSX.utils.sheet_to_csv(sheet);
}

function looksLikeWorkbook(data: Uint8Array | string, type: "array" | "base64"): boolean {
  if (type === "array" && data instanceof Uint8Array) {
    return data.length > 2 && data[0] === 0x50 && data[1] === 0x4b;
  }
  return typeof data === "string" && data.startsWith("UEs");
}

function decodeBase64(value: string): string {
  if (typeof atob !== "function") return value;
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder("utf-8").decode(bytes);
}
