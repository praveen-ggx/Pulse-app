/** Group customer receipt ledger rows into one receipt with trip lines. */

export type ReceiptLedgerRow = {
  id: string;
  tripId: string | null;
  description: string;
  amount: number;
  date: string;
  createdAt: string | null;
  category: string | null;
  reference: string | null;
};

export type ReceiptTripLine = {
  tripId: string | null;
  label: string;
  bank: number;
  tds: number;
};

export type CustomerReceipt = {
  id: string;
  date: string;
  reference: string | null;
  invoiceNumber: string | null;
  bank: number;
  tds: number;
  total: number;
  trips: ReceiptTripLine[];
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function plainDescription(description: string): string {
  const marker = description.lastIndexOf("[[QMETA:");
  return (marker >= 0 ? description.slice(0, marker) : description).trim();
}

function parseLine(description: string): {
  kind: "bank" | "tds" | null;
  invoiceNumber: string | null;
  tripLabel: string | null;
} {
  const text = plainDescription(description);
  const kind = text.startsWith("Customer receipt")
    ? "bank"
    : text.startsWith("TDS deducted by customer")
      ? "tds"
      : null;
  const invoiceNumber = text.match(/·\s*([A-Za-z0-9][A-Za-z0-9/_-]*)/)?.[1] ?? null;
  const tripLabel = text.match(/·\s*trip\s+(.+)$/i)?.[1]?.trim() || null;
  return { kind, invoiceNumber, tripLabel };
}

function minuteKey(createdAt: string | null): string {
  if (!createdAt) return "";
  const parsed = new Date(createdAt);
  if (!Number.isFinite(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 16);
}

export function groupCustomerReceipts(rows: readonly ReceiptLedgerRow[]): CustomerReceipt[] {
  const groups = new Map<string, CustomerReceipt & { order: string }>();
  for (const row of rows) {
    const parsed = parseLine(row.description);
    if (!parsed.kind) continue;
    const amount = round2(Math.max(0, row.amount));
    if (amount <= 0) continue;
    const reference = row.reference?.trim() || null;
    const key = [
      row.date.slice(0, 10),
      reference ?? "",
      parsed.invoiceNumber ?? "",
      minuteKey(row.createdAt),
    ].join("|");
    const current = groups.get(key) ?? {
      id: key,
      date: row.date.slice(0, 10),
      reference,
      invoiceNumber: parsed.invoiceNumber,
      bank: 0,
      tds: 0,
      total: 0,
      trips: [],
      order: row.createdAt ?? row.date,
    };
    if (parsed.kind === "bank") current.bank = round2(current.bank + amount);
    else current.tds = round2(current.tds + amount);
    current.total = round2(current.bank + current.tds);
    if ((row.createdAt ?? row.date) > current.order) current.order = row.createdAt ?? row.date;
    const label = parsed.tripLabel || "Customer";
    const trip = current.trips.find((item) => item.label === label && item.tripId === row.tripId);
    if (trip) {
      if (parsed.kind === "bank") trip.bank = round2(trip.bank + amount);
      else trip.tds = round2(trip.tds + amount);
    } else {
      current.trips.push({
        tripId: row.tripId,
        label,
        bank: parsed.kind === "bank" ? amount : 0,
        tds: parsed.kind === "tds" ? amount : 0,
      });
    }
    groups.set(key, current);
  }
  return [...groups.values()]
    .sort((a, b) => b.order.localeCompare(a.order) || b.date.localeCompare(a.date))
    .map(({ order: _order, ...receipt }) => receipt);
}
