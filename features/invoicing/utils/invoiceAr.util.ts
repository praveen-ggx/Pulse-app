/**
 * Client accounts-receivable picture for the invoice workspace.
 * Sales come from trip freight. Invoiced, received, and pending come from issued invoices.
 */
import { expectedAfterTds } from "@/features/invoicing/utils/clientTds.util";

export type ArBucket = "b0" | "b30" | "b60" | "b90";
export type ArPod = "received" | "digital" | "pending";
export type ArKpi = "sales" | "invoiced" | "received" | "pending" | "uninvoiced";
export type ArAgingScope = "open" | "uninvoiced";

export type ArTripInput = {
  id: string;
  internalId: string;
  lr: string | null;
  route: string;
  date: string;
  sales: number;
  invoicedFlag: boolean;
  physicalPod: boolean;
  digitalPod: boolean;
};

export type ArInvoiceInput = {
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string | null;
  status: string;
  totalAmount: number;
  /** Cash and TDS already applied. A paid invoice counts as fully received. */
  amountReceived?: number;
  tripIds: string[];
};

export type ArLine = {
  id: string;
  internalId: string;
  lr: string;
  route: string;
  dateLabel: string;
  ageDays: number;
  bucket: ArBucket;
  sales: number;
  invoiced: number;
  received: number;
  pending: number;
  /** Bank credit still expected after the client's TDS percent. */
  expectedBank: number;
  expectedTds: number;
  pod: ArPod;
  uninvoiced: boolean;
};

export type ArFilter = {
  kpi: ArKpi | null;
  bucket: ArBucket | null;
  pod: ArPod | null;
  agingScope: ArAgingScope | null;
};

export type ArBucketTotals = Record<ArBucket, number>;

export type ArBook = {
  lines: ArLine[];
  sales: number;
  invoiced: number;
  received: number;
  pending: number;
  uninvoiced: number;
  openAging: ArBucketTotals;
  uninvoicedAging: ArBucketTotals;
  uninvoicedPod: Record<ArPod, { count: number; amount: number }>;
};

const EMPTY_BUCKETS = (): ArBucketTotals => ({ b0: 0, b30: 0, b60: 0, b90: 0 });

export function arBucketForDays(days: number): ArBucket {
  if (days <= 30) return "b0";
  if (days <= 60) return "b30";
  if (days <= 90) return "b60";
  return "b90";
}

export const AR_BUCKETS: { key: ArBucket; label: string }[] = [
  { key: "b0", label: "0–30 days" },
  { key: "b30", label: "31–60 days" },
  { key: "b60", label: "61–90 days" },
  { key: "b90", label: "90+ days" },
];

function parseDay(value: string | null | undefined): Date | null {
  const raw = (value ?? "").trim();
  if (!raw) return null;
  const day = raw.slice(0, 10);
  const parsed = new Date(`${day}T00:00:00`);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function ageDays(from: Date | null, now: Date): number {
  if (!from) return 0;
  return Math.max(0, Math.floor((now.getTime() - from.getTime()) / 86_400_000));
}

function formatDay(value: string): string {
  const parsed = parseDay(value);
  if (!parsed) return value || "—";
  return parsed.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function podOf(trip: ArTripInput): ArPod {
  if (trip.physicalPod) return "received";
  if (trip.digitalPod) return "digital";
  return "pending";
}

export function buildArBook(
  trips: readonly ArTripInput[],
  invoices: readonly ArInvoiceInput[],
  now = new Date(),
  tdsPercent = 0,
): ArBook {
  const byTrip = new Map<string, ArInvoiceInput>();
  for (const invoice of invoices) {
    for (const tripId of invoice.tripIds) {
      const key = tripId.trim();
      if (!key) continue;
      const current = byTrip.get(key);
      if (!current || invoice.invoiceDate >= current.invoiceDate) {
        byTrip.set(key, invoice);
      }
    }
  }

  const shareByTrip = new Map<string, number>();
  const receivedByTrip = new Map<string, number>();
  const grouped = new Map<ArInvoiceInput, ArTripInput[]>();
  for (const trip of trips) {
    const invoice =
      byTrip.get(trip.internalId) ?? byTrip.get(trip.id) ?? null;
    if (!invoice) continue;
    const list = grouped.get(invoice) ?? [];
    list.push(trip);
    grouped.set(invoice, list);
  }
  for (const [invoice, members] of grouped) {
    const weight = members.reduce((sum, trip) => sum + Math.max(0, trip.sales), 0);
    const paid = (invoice.status ?? "").toLowerCase() === "paid";
    const receivedBase = paid
      ? invoice.totalAmount
      : Math.min(invoice.totalAmount, Math.max(0, invoice.amountReceived ?? 0));
    members.forEach((trip, index) => {
      const ratio =
        weight > 0
          ? Math.max(0, trip.sales) / weight
          : 1 / members.length;
      const last = index === members.length - 1;
      const priorInvoiced = members
        .slice(0, index)
        .reduce((sum, row) => sum + (shareByTrip.get(row.id) ?? 0), 0);
      const priorReceived = members
        .slice(0, index)
        .reduce((sum, row) => sum + (receivedByTrip.get(row.id) ?? 0), 0);
      shareByTrip.set(
        trip.id,
        last
          ? Math.round((invoice.totalAmount - priorInvoiced) * 100) / 100
          : Math.round(ratio * invoice.totalAmount * 100) / 100,
      );
      receivedByTrip.set(
        trip.id,
        last
          ? Math.round((receivedBase - priorReceived) * 100) / 100
          : Math.round(ratio * receivedBase * 100) / 100,
      );
    });
  }

  const lines: ArLine[] = trips.map((trip) => {
    const invoice = byTrip.get(trip.internalId) ?? byTrip.get(trip.id) ?? null;
    const sales = Math.max(0, trip.sales);
    const linked = invoice != null || trip.invoicedFlag;
    const invoiced = invoice
      ? Math.max(0, shareByTrip.get(trip.id) ?? 0)
      : linked
        ? sales
        : 0;
    const received = invoice ? Math.max(0, receivedByTrip.get(trip.id) ?? 0) : 0;
    const pending = Math.max(0, invoiced - received);
    const uninvoiced = invoiced <= 0;
    const expectedBase = pending > 0 ? pending : uninvoiced ? sales : 0;
    const expected = expectedAfterTds(expectedBase, tdsPercent);
    const anchor = uninvoiced
      ? parseDay(trip.date)
      : parseDay(invoice?.dueDate) ?? parseDay(invoice?.invoiceDate) ?? parseDay(trip.date);
    const age = ageDays(anchor, now);
    return {
      id: trip.id,
      internalId: trip.internalId || trip.id,
      lr: trip.lr?.trim() || "—",
      route: trip.route?.trim() || "—",
      dateLabel: formatDay(uninvoiced ? trip.date : invoice?.invoiceDate || trip.date),
      ageDays: age,
      bucket: arBucketForDays(age),
      sales,
      invoiced,
      received,
      pending,
      expectedBank: expected.bank,
      expectedTds: expected.tds,
      pod: podOf(trip),
      uninvoiced,
    };
  });

  return tallyArLines(lines);
}

/** Credit notes reduce what is still owed; debit notes increase it. A note already inside the invoice total is not applied again. */
export function applyNoteDeltas(book: ArBook, deltas: ReadonlyMap<string, number>): ArBook {
  if (deltas.size === 0) return book;
  const lines = book.lines.map((line) => {
    const delta = deltas.get(line.internalId) ?? deltas.get(line.id) ?? 0;
    if (!delta) return line;
    if (line.uninvoiced) {
      const sales = Math.max(0, Math.round((line.sales + delta) * 100) / 100);
      const ratio = line.sales > 0 ? sales / line.sales : 0;
      return {
        ...line,
        sales,
        expectedBank: Math.round(line.expectedBank * ratio * 100) / 100,
        expectedTds: Math.round(line.expectedTds * ratio * 100) / 100,
      };
    }
    const pending = Math.max(0, Math.round((line.pending + delta) * 100) / 100);
    const ratio = line.pending > 0 ? pending / line.pending : pending > 0 ? 1 : 0;
    return {
      ...line,
      pending,
      expectedBank: Math.round(line.expectedBank * ratio * 100) / 100,
      expectedTds: Math.round(line.expectedTds * ratio * 100) / 100,
    };
  });
  return tallyArLines(lines);
}

export function tallyArLines(lines: ArLine[]): ArBook {
  const book: ArBook = {
    lines,
    sales: 0,
    invoiced: 0,
    received: 0,
    pending: 0,
    uninvoiced: 0,
    openAging: EMPTY_BUCKETS(),
    uninvoicedAging: EMPTY_BUCKETS(),
    uninvoicedPod: {
      received: { count: 0, amount: 0 },
      digital: { count: 0, amount: 0 },
      pending: { count: 0, amount: 0 },
    },
  };
  for (const line of lines) {
    book.sales += line.sales;
    book.invoiced += line.invoiced;
    book.received += line.received;
    book.pending += line.pending;
    if (line.uninvoiced) {
      book.uninvoiced += line.sales;
      book.uninvoicedAging[line.bucket] += line.sales;
      book.uninvoicedPod[line.pod].count += 1;
      book.uninvoicedPod[line.pod].amount += line.sales;
    }
    if (line.pending > 0) book.openAging[line.bucket] += line.pending;
  }
  return book;
}

export const AR_SHEET_COLUMNS = [
  "lr",
  "date",
  "age",
  "route",
  "sales",
  "invoiced",
  "received",
  "pending",
  "pod",
] as const;

export type ArSheetColumn = (typeof AR_SHEET_COLUMNS)[number];

/** Checked values for a column. Missing means every value is visible. */
export type ArSheetFilters = Partial<Record<ArSheetColumn, readonly string[]>>;

export type ArSheetSort = { column: ArSheetColumn; direction: "asc" | "desc" } | null;

const SHEET_BLANK = "(Blank)";

function sheetText(value: string): string {
  const text = value.trim();
  if (!text || text === "—") return SHEET_BLANK;
  return text;
}

function sheetRupee(amount: number): string {
  return `₹${Math.round(amount).toLocaleString("en-IN")}`;
}

function sheetPod(pod: ArPod): string {
  if (pod === "received") return "POD received";
  if (pod === "digital") return "Digital POD";
  return "POD pending";
}

export function arSheetCell(line: ArLine, column: ArSheetColumn): string {
  switch (column) {
    case "lr":
      return sheetText(line.lr);
    case "date":
      return sheetText(line.dateLabel);
    case "age":
      return `${line.ageDays}d`;
    case "route":
      return sheetText(line.route);
    case "sales":
      return sheetRupee(line.sales);
    case "invoiced":
      return sheetRupee(line.invoiced);
    case "received":
      return sheetRupee(line.received);
    case "pending":
      return sheetRupee(line.pending);
    case "pod":
      return sheetPod(line.pod);
    default:
      return SHEET_BLANK;
  }
}

export function applyArSheetFilters(lines: readonly ArLine[], filters: ArSheetFilters): ArLine[] {
  const active = AR_SHEET_COLUMNS.flatMap((column) => {
    const picked = filters[column];
    return picked ? [[column, new Set(picked)] as const] : [];
  });
  if (active.length === 0) return [...lines];
  return lines.filter((line) => active.every(([column, picked]) => picked.has(arSheetCell(line, column))));
}

export function arSheetChoices(
  lines: readonly ArLine[],
  column: ArSheetColumn,
  filters: ArSheetFilters,
): { value: string; count: number }[] {
  const rest = { ...filters };
  delete rest[column];
  const rows = applyArSheetFilters(lines, rest);
  const counts = new Map<string, number>();
  rows.forEach((line) => {
    const value = arSheetCell(line, column);
    counts.set(value, (counts.get(value) ?? 0) + 1);
  });
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => {
      if (a.value === SHEET_BLANK) return 1;
      if (b.value === SHEET_BLANK) return -1;
      return a.value.localeCompare(b.value, undefined, { numeric: true, sensitivity: "base" });
    });
}

export function sortArSheet(lines: readonly ArLine[], sort: ArSheetSort): ArLine[] {
  if (!sort) return [...lines];
  const direction = sort.direction === "asc" ? 1 : -1;
  const numeric: Partial<Record<ArSheetColumn, (line: ArLine) => number>> = {
    age: (line) => line.ageDays,
    sales: (line) => line.sales,
    invoiced: (line) => line.invoiced,
    received: (line) => line.received,
    pending: (line) => line.pending,
  };
  const amount = numeric[sort.column];
  return [...lines].sort((a, b) => {
    if (amount) return (amount(a) - amount(b)) * direction;
    return (
      arSheetCell(a, sort.column).localeCompare(arSheetCell(b, sort.column), undefined, {
        numeric: true,
        sensitivity: "base",
      }) * direction
    );
  });
}

export function applyArFilter(lines: readonly ArLine[], filter: ArFilter): ArLine[] {
  return lines.filter((line) => {
    if (filter.kpi === "invoiced" && line.invoiced <= 0) return false;
    if (filter.kpi === "received" && line.received <= 0) return false;
    if (filter.kpi === "pending" && line.pending <= 0) return false;
    if (filter.kpi === "uninvoiced" && !line.uninvoiced) return false;
    if (filter.bucket && line.bucket !== filter.bucket) return false;
    if (filter.pod && line.pod !== filter.pod) return false;
    if (filter.agingScope === "open" && line.pending <= 0) return false;
    if (filter.agingScope === "uninvoiced" && !line.uninvoiced) return false;
    return true;
  });
}
