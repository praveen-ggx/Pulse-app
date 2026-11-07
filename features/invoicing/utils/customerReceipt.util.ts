import { expectedAfterTds, tdsForBankCredit } from "@/features/invoicing/utils/clientTds.util";
import { arBucketForDays, type ArBucket } from "@/features/invoicing/utils/invoiceAr.util";

export type ReceiptTarget = {
  id: string;
  number: string;
  balance: number;
  dueDate: string | null;
  bucket: ArBucket;
};

export type ReceiptAllocationLine = ReceiptTarget & {
  applied: number;
  remaining: number;
  cleared: boolean;
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function dayKey(value: string | null): string {
  const raw = (value ?? "").trim();
  return raw ? raw.slice(0, 10) : "9999-12-31";
}

/**
 * Cash plus TDS clears the customer. Only invoices the user selected are eligible.
 * An empty invoice selection allocates nothing. Aging is the one explicit
 * multi-invoice mode, and it stays inside the chosen age bucket.
 * Oldest due invoices in that explicit scope are paid first, never above outstanding.
 */
export function allocateCustomerReceipt(args: {
  targets: readonly ReceiptTarget[];
  cash: number;
  tds: number;
  mode: "invoice" | "aging";
  invoiceIds: readonly string[];
  bucket: ArBucket | null;
}): { lines: ReceiptAllocationLine[]; unapplied: number; applied: number } {
  const pool = round2(Math.max(0, args.cash) + Math.max(0, args.tds));
  const chosen = new Set(args.invoiceIds);
  const scoped = args.targets.filter((target) => {
    if (target.balance <= 0) return false;
    if (args.mode === "aging") return args.bucket != null && target.bucket === args.bucket;
    return chosen.has(target.id);
  });
  const ordered = [...scoped].sort((a, b) => dayKey(a.dueDate).localeCompare(dayKey(b.dueDate)));
  let left = pool;
  const lines = ordered.map((target) => {
    const applied = round2(Math.min(target.balance, left));
    left = round2(left - applied);
    const remaining = round2(target.balance - applied);
    return {
      ...target,
      applied,
      remaining,
      cleared: remaining <= 0.009 && applied > 0,
    };
  });
  return { lines, unapplied: left, applied: round2(pool - left) };
}

export type ReceiptTripWeight = {
  id: string;
  sales: number;
};

export type TripReceiptSlice = {
  tripId: string;
  applied: number;
  cash: number;
  tds: number;
};

/** Bank and TDS share of one amount, using the receipt's cash-to-TDS ratio. */
export function splitReceiptAmount(
  amount: number,
  cash: number,
  tds: number,
): { cash: number; tds: number } {
  const applied = round2(Math.max(0, amount));
  const pool = round2(Math.max(0, cash) + Math.max(0, tds));
  if (applied <= 0) return { cash: 0, tds: 0 };
  const bank = round2(pool > 0 ? applied * (Math.max(0, cash) / pool) : 0);
  return { cash: bank, tds: round2(applied - bank) };
}

export type ReceiveStatus = "unpaid" | "partially_paid" | "paid" | "excess";

/** Short of the due amount is partially paid. More than the due amount is excess. */
export function receiveStatus(due: number, applied: number): ReceiveStatus {
  const open = round2(Math.max(0, due));
  const paid = round2(Math.max(0, applied));
  if (paid <= 0.009) return "unpaid";
  if (paid > open + 0.009) return "excess";
  if (paid + 0.009 < open) return "partially_paid";
  return "paid";
}

export function receiveStatusLabel(status: ReceiveStatus): string {
  if (status === "partially_paid") return "Partially paid";
  if (status === "excess") return "Excess paid";
  if (status === "paid") return "Paid";
  return "Unpaid";
}

export type TripReceiveRow = {
  tripId: string;
  label: string;
  due: number;
  tds: number;
  receive: number;
  fullReceive: number;
  applied: number;
  status: ReceiveStatus;
  edited: boolean;
};

/**
 * TDS is taken from the client percent first. The amount to receive is what remains.
 * A typed value replaces that trip's bank amount. Full uses the trip's own freight.
 */
export function planTripReceive(args: {
  invoiceId: string;
  applied: number;
  percent: number;
  trips: readonly (ReceiptTripWeight & { label: string })[];
  edits: Readonly<Record<string, string>>;
}): TripReceiveRow[] {
  const spread = spreadReceiptAcrossTrips({
    applied: args.applied,
    cash: args.applied,
    tds: 0,
    trips: args.trips,
  });
  return args.trips.map((trip) => {
    const due = round2(Math.max(0, trip.sales));
    const full = expectedAfterTds(due, args.percent);
    const key = `${args.invoiceId}:${trip.id}`;
    const typed = args.edits[key];
    const edited = typed != null && typed.trim() !== "";
    const suggestedGross = spread.slices.find((slice) => slice.tripId === trip.id)?.applied ?? 0;
    const suggested = expectedAfterTds(suggestedGross, args.percent).bank;
    const raw = edited ? Number(typed.replace(/,/g, "")) : suggested;
    const receive = round2(Number.isFinite(raw) ? Math.max(0, raw) : 0);
    const tds = args.percent > 0 ? tdsForBankCredit(receive, args.percent) : 0;
    const applied = round2(receive + tds);
    return {
      tripId: trip.id,
      label: trip.label,
      due,
      tds,
      receive,
      fullReceive: full.bank,
      applied,
      status: receiveStatus(due, applied),
      edited,
    };
  });
}

export type TripReceiptPreview = TripReceiptSlice & {
  label: string;
  edited: boolean;
};

/**
 * Suggested trip split, with a typed amount replacing that trip's share.
 * A trip cannot be marked above its own freight.
 */
export function previewTripReceipt(args: {
  invoiceId: string;
  applied: number;
  cash: number;
  tds: number;
  trips: readonly (ReceiptTripWeight & { label: string })[];
  edits: Readonly<Record<string, string>>;
}): TripReceiptPreview[] {
  const auto = spreadReceiptAcrossTrips({
    applied: args.applied,
    cash: args.cash,
    tds: args.tds,
    trips: args.trips,
  });
  return args.trips.flatMap((trip) => {
    const key = `${args.invoiceId}:${trip.id}`;
    const typed = args.edits[key];
    const edited = typed != null && typed.trim() !== "";
    const suggested = auto.slices.find((slice) => slice.tripId === trip.id)?.applied ?? 0;
    const raw = edited ? Number(typed.replace(/,/g, "")) : suggested;
    const sales = Math.max(0, trip.sales);
    const safe = Number.isFinite(raw) ? Math.max(0, raw) : 0;
    const applied = round2(sales > 0 ? Math.min(sales, safe) : safe);
    const split = splitReceiptAmount(applied, args.cash, args.tds);
    return [{
      tripId: trip.id,
      label: trip.label,
      applied,
      cash: split.cash,
      tds: split.tds,
      edited,
    }];
  });
}

function portions(total: number, weights: readonly number[]): number[] {
  if (weights.length === 0 || total <= 0) return weights.map(() => 0);
  const sum = weights.reduce((totalWeight, weight) => totalWeight + weight, 0);
  const rounded = weights.map((weight) =>
    round2(sum > 0 ? (weight / sum) * total : total / weights.length),
  );
  const drift = round2(total - rounded.reduce((sum, part) => sum + part, 0));
  rounded[rounded.length - 1] = round2((rounded[rounded.length - 1] ?? 0) + drift);
  return rounded;
}

/**
 * A grouped invoice shares one receipt across its trips by sales weight.
 * Anything above a trip's own sales stays on the customer ledger so the trip
 * received total cannot pass the billed freight.
 */
export function spreadReceiptAcrossTrips(args: {
  applied: number;
  cash: number;
  tds: number;
  trips: readonly ReceiptTripWeight[];
}): { slices: TripReceiptSlice[]; overflow: { cash: number; tds: number } } {
  const applied = round2(Math.max(0, args.applied));
  const pool = round2(Math.max(0, args.cash) + Math.max(0, args.tds));
  const cashOf = (amount: number) => round2(pool > 0 ? amount * (Math.max(0, args.cash) / pool) : 0);
  if (applied <= 0) return { slices: [], overflow: { cash: 0, tds: 0 } };
  if (args.trips.length === 0) {
    const cash = cashOf(applied);
    return { slices: [], overflow: { cash, tds: round2(applied - cash) } };
  }
  const parts = portions(applied, args.trips.map((trip) => Math.max(0, trip.sales)));
  const slices: TripReceiptSlice[] = [];
  let overflowCash = 0;
  let overflowTds = 0;
  parts.forEach((part, index) => {
    const trip = args.trips[index];
    if (!trip || part <= 0) return;
    const sales = Math.max(0, trip.sales);
    const onTrip = sales > 0 ? round2(Math.min(part, sales)) : part;
    const over = round2(part - onTrip);
    const cash = cashOf(onTrip);
    const tds = round2(onTrip - cash);
    const overCash = cashOf(over);
    overflowCash = round2(overflowCash + overCash);
    overflowTds = round2(overflowTds + round2(over - overCash));
    if (onTrip > 0) slices.push({ tripId: trip.id, applied: onTrip, cash, tds });
  });
  return { slices, overflow: { cash: overflowCash, tds: overflowTds } };
}

export function receiptAppliedFromSnapshot(snapshot: unknown): number {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return 0;
  const raw = (snapshot as { receipt_applied?: unknown }).receipt_applied;
  const amount = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(amount) ? round2(Math.max(0, amount)) : 0;
}

export function receiptTargetFromInvoice(invoice: {
  id: string;
  invoice_number: string;
  due_date: string | null;
  invoice_date: string;
  status: string;
  total_amount: number;
  receiptApplied?: number;
}, now = new Date()): ReceiptTarget | null {
  if ((invoice.status ?? "").toLowerCase() === "paid") return null;
  if ((invoice.status ?? "").toLowerCase() === "draft") return null;
  const balance = round2(Math.max(0, (Number(invoice.total_amount) || 0) - Math.max(0, invoice.receiptApplied ?? 0)));
  if (balance <= 0) return null;
  const anchor = invoice.due_date || invoice.invoice_date;
  const parsed = new Date(`${anchor.slice(0, 10)}T00:00:00`);
  const age = Number.isFinite(parsed.getTime())
    ? Math.max(0, Math.floor((now.getTime() - parsed.getTime()) / 86_400_000))
    : 0;
  return {
    id: invoice.id,
    number: invoice.invoice_number,
    balance,
    dueDate: invoice.due_date,
    bucket: arBucketForDays(age),
  };
}
