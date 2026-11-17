export type ReportCell = string | number | null | undefined;
export type ReportRow = Record<string, ReportCell>;

export type LedgerReportViewState = {
  search: string;
  dateFrom: string | null;
  dateTo: string | null;
  typeValues: string[];
  statusValues: string[];
  columnContains: Record<string, string>;
  columnEquals: Record<string, string[]>;
  sortKey: string | null;
  sortDir: "asc" | "desc";
};

export const EMPTY_LEDGER_REPORT_VIEW: LedgerReportViewState = {
  search: "",
  dateFrom: null,
  dateTo: null,
  typeValues: [],
  statusValues: [],
  columnContains: {},
  columnEquals: {},
  sortKey: null,
  sortDir: "asc",
};

export function toReportIsoDate(raw: unknown): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  const match = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function cellDisplay(value: ReportCell): string {
  if (value == null || value === "") return "";
  return String(value);
}

export function parseReportNumber(value: ReportCell): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const s = cellDisplay(value)
    .replace(/₹/g, "")
    .replace(/,/g, "")
    .replace(/%/g, "")
    .trim();
  if (!s || s === "—" || s === "-") return null;
  const n = Number(s.replace(/^\((.*)\)$/, "-$1"));
  return Number.isFinite(n) ? n : null;
}

export function uniqueColumnValues(rows: ReportRow[], key: string): string[] {
  const seen = new Set<string>();
  for (const row of rows) {
    const v = cellDisplay(row[key]).trim();
    if (!v) continue;
    seen.add(v);
  }
  return [...seen].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

export type ReportValueCount = { value: string; count: number };

export type ReportStatusFacet = {
  key: string;
  label: string;
  options: ReportValueCount[];
};

function normColumnName(value: string): string {
  return value.toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

const EXACT_STATUS_NAMES = new Set([
  "status",
  "trip status",
  "verification status",
  "payment status",
]);

export function columnValueCounts(rows: ReportRow[], key: string): ReportValueCount[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const value = cellDisplay(row[key]).trim();
    if (!value) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value, undefined, { numeric: true }));
}

/**
 * One status-like column for the preview chips. Skips columns that are really
 * identifiers (too many distinct values) and falls back to UTR presence when
 * a payment sheet has no status column.
 */
export function pickReportStatusFacet(
  columns: Array<{ key: string; label: string }>,
  rows: ReportRow[],
): ReportStatusFacet | null {
  const ranked = columns
    .map((col) => {
      const label = normColumnName(col.label || col.key);
      const key = normColumnName(col.key);
      const rank = EXACT_STATUS_NAMES.has(label) || EXACT_STATUS_NAMES.has(key)
        ? 3
        : label.includes("status") || key.includes("status")
          ? 2
          : 0;
      return { col, rank };
    })
    .filter((item) => item.rank > 0)
    .sort((a, b) => b.rank - a.rank || a.col.label.localeCompare(b.col.label));

  for (const item of ranked) {
    const options = columnValueCounts(rows, item.col.key);
    const blank = rows.length - options.reduce((sum, option) => sum + option.count, 0);
    if (blank > 0 && options.length > 0) options.push({ value: "Blank", count: blank });
    if (options.length >= 2) {
      return { key: item.col.key, label: "Status", options };
    }
  }

  const utr = columns.find((col) => normColumnName(col.key) === "utr" || normColumnName(col.label) === "utr");
  if (!utr || rows.length === 0) return null;
  let withUtr = 0;
  for (const row of rows) {
    if (cellDisplay(row[utr.key]).trim()) withUtr += 1;
  }
  const options = [
    { value: "With UTR", count: withUtr },
    { value: "No UTR", count: rows.length - withUtr },
  ].filter((option) => option.count > 0);
  return options.length >= 2 ? { key: utr.key, label: "UTR", options } : null;
}

function matchesStatusFacet(row: ReportRow, key: string, selected: string[]): boolean {
  if (!selected.length || !key) return true;
  if (normColumnName(key) === "utr" && selected.some((value) => value === "With UTR" || value === "No UTR")) {
    const label = cellDisplay(row[key]).trim() ? "With UTR" : "No UTR";
    return selected.includes(label);
  }
  const value = cellDisplay(row[key]).trim() || "Blank";
  return selected.includes(value);
}

function rowDateIso(row: ReportRow): string {
  const iso = toReportIsoDate(row.dateIso);
  if (iso) return iso;
  return toReportIsoDate(row.date);
}

function matchesEquals(selected: string[] | undefined, value: string): boolean {
  if (!selected || selected.length === 0) return true;
  return selected.includes(value);
}

function matchesContains(needle: string | undefined, haystack: string): boolean {
  const q = (needle ?? "").trim().toLowerCase();
  if (!q) return true;
  return haystack.toLowerCase().includes(q);
}

export function rowMatchesLedgerReportView(
  row: ReportRow,
  state: LedgerReportViewState,
  columnKeys: string[],
  statusKey = "status",
): boolean {
  const search = state.search.trim().toLowerCase();
  if (search) {
    const hay = columnKeys.map((key) => cellDisplay(row[key])).join(" ").toLowerCase();
    if (!hay.includes(search)) return false;
  }

  const iso = rowDateIso(row);
  if (state.dateFrom && iso && iso < state.dateFrom) return false;
  if (state.dateTo && iso && iso > state.dateTo) return false;
  if ((state.dateFrom || state.dateTo) && !iso) return false;

  if (!matchesEquals(state.typeValues, cellDisplay(row.rowType).trim())) return false;
  if (!matchesStatusFacet(row, statusKey, state.statusValues)) return false;

  for (const [key, selected] of Object.entries(state.columnEquals)) {
    if (!matchesEquals(selected, cellDisplay(row[key]).trim())) return false;
  }
  for (const [key, needle] of Object.entries(state.columnContains)) {
    if (!matchesContains(needle, cellDisplay(row[key]))) return false;
  }
  return true;
}

function compareRows(
  a: ReportRow,
  b: ReportRow,
  key: string,
  dir: "asc" | "desc",
): number {
  const av = a[key];
  const bv = b[key];
  const aEmpty = av == null || av === "";
  const bEmpty = bv == null || bv === "";
  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return 1;
  if (bEmpty) return -1;

  if (key === "date" || key === "dateIso") {
    const cmp = rowDateIso(a).localeCompare(rowDateIso(b));
    return dir === "asc" ? cmp : -cmp;
  }

  const an = parseReportNumber(av);
  const bn = parseReportNumber(bv);
  if (an != null && bn != null) {
    const cmp = an - bn;
    return dir === "asc" ? cmp : -cmp;
  }

  const cmp = cellDisplay(av).localeCompare(cellDisplay(bv), undefined, {
    numeric: true,
    sensitivity: "base",
  });
  return dir === "asc" ? cmp : -cmp;
}

export function applyLedgerReportView(
  rows: ReportRow[],
  state: LedgerReportViewState,
  columnKeys: string[],
  statusKey = "status",
): ReportRow[] {
  const filtered = rows.filter((row) =>
    rowMatchesLedgerReportView(row, state, columnKeys, statusKey),
  );
  if (!state.sortKey) return filtered;
  const key = state.sortKey;
  const dir = state.sortDir;
  return [...filtered].sort((a, b) => compareRows(a, b, key, dir));
}

export function ledgerReportViewIsActive(state: LedgerReportViewState): boolean {
  return Boolean(
    state.search.trim() ||
      state.dateFrom ||
      state.dateTo ||
      state.typeValues.length ||
      state.statusValues.length ||
      state.sortKey ||
      Object.values(state.columnContains).some((v) => v.trim()) ||
      Object.values(state.columnEquals).some((v) => v.length),
  );
}
