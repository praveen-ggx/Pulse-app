/**
 * Pure CSV reading and row classification for bulk UTR / payment-detail updates.
 * Matching against trips and writing the ledger happen in the service.
 */
import { toComplianceTransactionDateInput } from "@/features/tripCompliance/utils/compliancePaymentDate.util";
import {
  normalizeComplianceUtr,
  validateComplianceUtr,
} from "@/features/tripCompliance/utils/compliancePaymentReference.util";

export type BulkUpdateTag = "ready" | "unchanged" | "no_payment" | "cash" | "invalid" | "duplicate";

export type BulkSheetRow = {
  rowIndex: number;
  tripKey: string;
  amount: number | null;
  mode: string;
  date: string;
  utr: string;
  remarks: string;
};

export type BulkUpdateTripMatch = {
  id: string;
  label: string;
  keys: string[];
  clientPrice?: number | null;
};

export type BulkUpdatePaymentMatch = {
  tripId: string;
  transactionId: string;
  utr: string;
  /** YYYY-MM-DD, or empty when the ledger has no usable day. */
  date: string;
  mode: string;
  cash: boolean;
  requestId?: string;
  /** Posted `amount_out` for this payment, when the preview loaded it. */
  postedAmount?: number | null;
};

export type BulkUpdatePreviewRow = {
  rowIndex: number;
  tripKey: string;
  tripId: string | null;
  tripLabel: string;
  transactionId: string | null;
  currentUtr: string;
  nextUtr: string;
  currentDate: string;
  nextDate: string;
  requestId: string;
  mode: string;
  amount: number | null;
  postedAmount: number | null;
  clientPrice: number | null;
  tag: BulkUpdateTag;
  detail: string;
  included: boolean;
};

const MONTH_INDEX: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Bank dates from an export (`08 Sep 2026`, `08/09/2026`) or an ISO day. */
export function parseBulkPaymentDate(raw: string | undefined): string {
  const text = (raw ?? "").trim();
  if (!text) return "";
  const iso = toComplianceTransactionDateInput(text);
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso) && iso === text.slice(0, 10)) return iso;

  const named = text.match(/^(\d{1,2})[\s/-]+([A-Za-z]{3,})[\s/-]+(\d{4})$/);
  if (named) {
    const month = MONTH_INDEX[named[2].slice(0, 3).toLowerCase()];
    const day = Number(named[1]);
    const year = Number(named[3]);
    if (month && day >= 1 && day <= 31) return `${year}-${pad(month)}-${pad(day)}`;
  }

  const numeric = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (numeric) {
    const a = Number(numeric[1]);
    const b = Number(numeric[2]);
    const year = Number(numeric[3]);
    const day = a > 12 ? a : b > 12 ? b : a;
    const month = a > 12 ? b : b > 12 ? a : b;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) return `${year}-${pad(month)}-${pad(day)}`;
  }

  const parsed = toComplianceTransactionDateInput(text);
  return /^\d{4}-\d{2}-\d{2}$/.test(parsed) ? parsed : text;
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (char === "," && !quoted) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(current.trim());
  return cells;
}

function headerField(label: string): keyof Omit<BulkSheetRow, "rowIndex"> | null {
  const key = label.toLowerCase().replace(/[_/]+/g, " ").replace(/\s+/g, " ").trim();
  if (key === "trip id" || key === "trip" || key === "tripid" || key === "trip no") return "tripKey";
  if (key === "amount") return "amount";
  if (key === "mode" || key === "payment mode") return "mode";
  if (key === "date" || key === "transaction date" || key === "txn date" || key === "paid at") return "date";
  if (key === "utr" || key === "reference" || key === "payment reference" || key === "utr reference") return "utr";
  if (key === "remarks" || key === "notes" || key === "note") return "remarks";
  return null;
}

function sheetRow(rowIndex: number, cells: string[], columns: Array<keyof Omit<BulkSheetRow, "rowIndex"> | null>): BulkSheetRow {
  const pick = (field: keyof Omit<BulkSheetRow, "rowIndex">) => {
    const index = columns.indexOf(field);
    return index >= 0 ? (cells[index] ?? "").trim() : "";
  };
  const amountText = pick("amount");
  const amount = amountText === "" ? null : Number(amountText.replace(/[₹,\s]/g, ""));
  return {
    rowIndex,
    tripKey: pick("tripKey"),
    amount: amountText === "" ? null : Number.isFinite(amount) ? amount : Number.NaN,
    mode: pick("mode").toUpperCase(),
    date: parseBulkPaymentDate(pick("date")),
    utr: pick("utr"),
    remarks: pick("remarks"),
  };
}

/**
 * Reads a headered CSV. Accepts the short template and the Advance Payment
 * export (TRIP ID, AMOUNT, MODE, TRANSACTION DATE, UTR, …).
 */
export function parseBulkUpdateCsv(csvText: string): BulkSheetRow[] {
  const lines = csvText
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);
  if (lines.length <= 1) return [];
  const headerCells = splitCsvLine(lines[0]);
  let columns = headerCells.map(headerField);
  if (!columns.includes("tripKey")) {
    columns = ["tripKey", "amount", "mode", "date", "utr", "remarks"];
  }
  return lines.slice(1).map((line, index) => sheetRow(index + 2, splitCsvLine(line), columns));
}

function normKey(value: string): string {
  return value.trim().toUpperCase();
}

function changeDetail(utrChanges: boolean, dateChanges: boolean): string {
  if (utrChanges && dateChanges) return "UTR and transaction date will change.";
  if (dateChanges) return "Transaction date will change.";
  return "UTR will change.";
}

export function classifyBulkUpdateRows(params: {
  rows: BulkSheetRow[];
  trips: BulkUpdateTripMatch[];
  payments: BulkUpdatePaymentMatch[];
}): BulkUpdatePreviewRow[] {
  const tripsByKey = new Map<string, BulkUpdateTripMatch[]>();
  for (const trip of params.trips) {
    for (const key of trip.keys) {
      const norm = normKey(key);
      if (!norm) continue;
      const list = tripsByKey.get(norm) ?? [];
      if (!list.some((item) => item.id === trip.id)) list.push(trip);
      tripsByKey.set(norm, list);
    }
  }
  const paymentByTrip = new Map(params.payments.map((payment) => [payment.tripId, payment]));
  const claimedUtr = new Set<string>();

  return params.rows.map((row) => {
    const base = {
      rowIndex: row.rowIndex,
      tripKey: row.tripKey,
      tripId: null as string | null,
      tripLabel: row.tripKey || "—",
      transactionId: null as string | null,
      currentUtr: "",
      nextUtr: row.utr ? normalizeComplianceUtr(row.utr) : "",
      currentDate: "",
      nextDate: row.date,
      requestId: "",
      mode: row.mode,
      amount: row.amount,
      postedAmount: null,
      clientPrice: null,
      included: false,
    };

    if (!row.tripKey.trim()) {
      return { ...base, tag: "invalid" as const, detail: "Trip ID is missing." };
    }
    const matches = tripsByKey.get(normKey(row.tripKey)) ?? [];
    if (matches.length === 0) {
      return { ...base, tag: "invalid" as const, detail: "No trip in this workspace matches this Trip ID." };
    }
    if (matches.length > 1) {
      return { ...base, tag: "invalid" as const, detail: "More than one trip matches this Trip ID." };
    }
    const trip = matches[0];
    const payment = paymentByTrip.get(trip.id);
    const located = {
      ...base,
      tripId: trip.id,
      tripLabel: trip.label,
      transactionId: payment?.transactionId ?? null,
      currentUtr: payment?.utr ? normalizeComplianceUtr(payment.utr) : "",
      currentDate: payment?.date ?? "",
      requestId: payment?.requestId ?? "",
      mode: payment?.mode || row.mode,
      postedAmount: payment?.postedAmount ?? null,
      clientPrice: trip.clientPrice ?? null,
    };
    if (!payment) {
      return { ...located, tag: "no_payment" as const, detail: "No posted payment to update." };
    }
    if (payment.cash) {
      return { ...located, tag: "cash" as const, detail: "Cash payments don't carry a UTR." };
    }
    if (!located.nextUtr && !located.nextDate) {
      return { ...located, tag: "invalid" as const, detail: "Add a UTR or a transaction date." };
    }
    if (located.nextUtr) {
      const invalid = validateComplianceUtr(located.nextUtr);
      if (invalid) return { ...located, tag: "invalid" as const, detail: invalid };
      if (claimedUtr.has(located.nextUtr) && located.nextUtr !== located.currentUtr) {
        return { ...located, tag: "duplicate" as const, detail: `UTR ${located.nextUtr} is already used in this file.` };
      }
    }
    if (located.nextDate && !/^\d{4}-\d{2}-\d{2}$/.test(located.nextDate)) {
      return { ...located, tag: "invalid" as const, detail: "Transaction date is not a real date." };
    }
    const utrChanges = Boolean(located.nextUtr) && located.nextUtr !== located.currentUtr;
    const dateChanges = Boolean(located.nextDate) && located.nextDate !== located.currentDate;
    if (located.nextUtr && utrChanges) claimedUtr.add(located.nextUtr);
    if (!utrChanges && !dateChanges) {
      return { ...located, tag: "unchanged" as const, detail: "Already matches the posted payment." };
    }
    return {
      ...located,
      tag: "ready" as const,
      included: true,
      detail: changeDetail(utrChanges, dateChanges),
    };
  });
}

/** Re-check one row after the user edits the UTR in the preview. */
export function reviseBulkUpdateUtr(rows: BulkUpdatePreviewRow[], rowIndex: number, utr: string): BulkUpdatePreviewRow[] {
  const nextUtr = utr.trim() ? normalizeComplianceUtr(utr) : "";
  const claimed = new Set(
    rows
      .filter((row) => row.rowIndex !== rowIndex && row.tag === "ready" && row.included && row.nextUtr && row.nextUtr !== row.currentUtr)
      .map((row) => row.nextUtr),
  );
  return rows.map((row) => {
    if (row.rowIndex !== rowIndex || !row.tripId || !row.transactionId) return row;
    if (row.tag === "cash" || row.tag === "no_payment") return row;
    const draft = { ...row, nextUtr };
    if (nextUtr) {
      const invalid = validateComplianceUtr(nextUtr);
      if (invalid) return { ...draft, tag: "invalid" as const, included: false, detail: invalid };
      if (claimed.has(nextUtr) && nextUtr !== row.currentUtr) {
        return { ...draft, tag: "duplicate" as const, included: false, detail: `UTR ${nextUtr} is already used in this file.` };
      }
    } else if (!row.nextDate) {
      return { ...draft, tag: "invalid" as const, included: false, detail: "Add a UTR or a transaction date." };
    }
    const utrChanges = Boolean(nextUtr) && nextUtr !== row.currentUtr;
    const dateChanges = Boolean(row.nextDate) && row.nextDate !== row.currentDate;
    if (!utrChanges && !dateChanges) {
      return { ...draft, tag: "unchanged" as const, included: false, detail: "Already matches the posted payment." };
    }
    return { ...draft, tag: "ready" as const, included: true, detail: changeDetail(utrChanges, dateChanges) };
  });
}

export function bulkUpdateTagLabel(tag: BulkUpdateTag): string {
  switch (tag) {
    case "ready":
      return "Will update";
    case "unchanged":
      return "Already set";
    case "no_payment":
      return "No payment";
    case "cash":
      return "Cash";
    case "duplicate":
      return "Duplicate UTR";
    default:
      return "Needs a fix";
  }
}
