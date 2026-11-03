/**
 * Bank statement CSV → import rows. Pure. Rows that cannot be read are reported
 * with their line number and never sent; the server validates again.
 */
import type { BankImportRow } from "@/features/invoicing/services/financeBooks.service";

export type ParsedBankStatement = {
  rows: BankImportRow[];
  errors: { line: number; message: string }[];
  /** Detected column for each field, or null when absent. */
  columns: Record<"date" | "reference" | "description" | "credit" | "debit" | "amount", number | null>;
};

/** RFC 4180-style split; handles quotes, escaped quotes, CRLF. */
export function splitCsv(text: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      row.push(cell);
      out.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    out.push(row);
  }
  return out.map((cells) => cells.map((value) => value.trim())).filter((cells) => cells.some((value) => value !== ""));
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

function validDate(y: number, m: number, d: number): string | null {
  if (!(y >= 1900 && y <= 2200 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** ISO, or Indian day-first (DD/MM/YYYY, DD-MM-YY, DD-Mon-YYYY). Never month-first. */
export function parseStatementDate(value: string): string | null {
  const raw = value.trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(raw);
  if (m) return validDate(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(raw);
  if (m) {
    const year = m[3]!.length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return validDate(year, Number(m[2]), Number(m[1]));
  }
  m = /^(\d{1,2})[\s/-]([A-Za-z]{3,4})[\s/-](\d{2}|\d{4})$/.exec(raw);
  if (m) {
    const month = MONTHS[m[2]!.toLowerCase()];
    const year = m[3]!.length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return month ? validDate(year, month, Number(m[1])) : null;
  }
  return null;
}

/** "1,23,456.70", "₹ 500", "(250.00)", "250 Cr" → number; blank → 0; unreadable → null. */
export function parseStatementAmount(value: string): number | null {
  let raw = value.trim();
  if (!raw || raw === "-") return 0;
  let negative = false;
  if (/^\(.*\)$/.test(raw)) {
    negative = true;
    raw = raw.slice(1, -1);
  }
  if (/\bdr\.?$/i.test(raw)) {
    negative = true;
    raw = raw.replace(/\bdr\.?$/i, "");
  }
  raw = raw.replace(/\bcr\.?$/i, "").replace(/[₹,\s]|INR|Rs\.?/gi, "");
  if (raw.startsWith("-")) {
    negative = !negative;
    raw = raw.slice(1);
  }
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) return null;
  const amount = Math.round(Number(raw) * 100) / 100;
  return negative ? -amount : amount;
}

const HEADER_HINTS: Record<keyof ParsedBankStatement["columns"], RegExp> = {
  date: /^(txn |transaction |value |posting )?date$|^date$/i,
  reference: /ref|utr|cheque|chq|instrument/i,
  description: /desc|narration|particular|remark|details/i,
  credit: /^(credit|deposit|cr)( amount| amt)?$|deposits?/i,
  debit: /^(debit|withdrawal|dr)( amount| amt)?$|withdrawals?/i,
  amount: /^amount$|^amt$/i,
};

function detectColumns(header: string[]): ParsedBankStatement["columns"] {
  const find = (key: keyof ParsedBankStatement["columns"]) => {
    const index = header.findIndex((cell) => HEADER_HINTS[key].test(cell.trim()));
    return index >= 0 ? index : null;
  };
  return {
    date: find("date"),
    reference: find("reference"),
    description: find("description"),
    credit: find("credit"),
    debit: find("debit"),
    amount: find("amount"),
  };
}

/**
 * With a header row, columns are matched by name. Without one, the order is
 * date, reference, description, credit[, debit] — the format shown in the import box.
 */
export function parseBankStatementCsv(text: string): ParsedBankStatement {
  const table = splitCsv(text);
  const errors: ParsedBankStatement["errors"] = [];
  const rowsOut: BankImportRow[] = [];
  if (table.length === 0) {
    return { rows: [], errors: [], columns: { date: null, reference: null, description: null, credit: null, debit: null, amount: null } };
  }
  const first = table[0]!;
  // A first row that does not start with a date is a header (named columns).
  const hasHeader = parseStatementDate(first[0] ?? "") === null;
  const columns = hasHeader
    ? detectColumns(first)
    : { date: 0, reference: 1, description: 2, credit: 3, debit: first.length > 4 ? 4 : null, amount: null };
  if (columns.date === null || (columns.credit === null && columns.amount === null)) {
    return {
      rows: [],
      errors: [{ line: 1, message: "Could not find the date and credit (or amount) columns." }],
      columns,
    };
  }
  const start = hasHeader ? 1 : 0;
  for (let i = start; i < table.length; i += 1) {
    const cells = table[i]!;
    const line = i + 1;
    const get = (index: number | null) => (index === null ? "" : cells[index] ?? "");
    const date = parseStatementDate(get(columns.date));
    if (!date) {
      errors.push({ line, message: `Date "${get(columns.date)}" is not a date (use YYYY-MM-DD or DD/MM/YYYY).` });
      continue;
    }
    let credit: number | null;
    let debit: number | null;
    if (columns.credit !== null || columns.debit !== null) {
      credit = parseStatementAmount(get(columns.credit));
      debit = parseStatementAmount(get(columns.debit));
    } else {
      const amount = parseStatementAmount(get(columns.amount));
      credit = amount === null ? null : Math.max(amount, 0);
      debit = amount === null ? null : Math.max(-amount, 0);
    }
    if (credit === null || debit === null) {
      errors.push({ line, message: "Amount could not be read." });
      continue;
    }
    credit = Math.abs(credit);
    debit = Math.abs(debit);
    if ((credit > 0) === (debit > 0)) {
      errors.push({ line, message: credit > 0 ? "Row has both a credit and a debit." : "Row has no amount." });
      continue;
    }
    rowsOut.push({
      txn_date: date,
      reference: get(columns.reference).slice(0, 120),
      description: get(columns.description).slice(0, 500),
      credit: credit > 0 ? credit.toFixed(2) : "0",
      debit: debit > 0 ? debit.toFixed(2) : "0",
    });
  }
  return { rows: rowsOut, errors, columns };
}
