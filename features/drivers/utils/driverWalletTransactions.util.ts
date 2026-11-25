import type { DriverLedgerRow } from "@/features/drivers/services/drivers.service";
import type { DriverBookCollection } from "@/features/drivers/services/driverCapturePayment.service";
import type { DriverTripExpenseRow } from "@/features/drivers/services/driverTripExpenses.service";
import type { TripRow } from "@/features/trips/services/trips.service";
import {
  resolveTripPartyDisplayName,
  tripReceivablePartyName,
} from "@/features/drivers/utils/driverPartyReceivables.util";

export type DriverWalletTxnKind = "in" | "out";

export type DriverWalletTxn = {
  id: string;
  kind: DriverWalletTxnKind;
  title: string;
  subtitle: string;
  amount: number;
  at: string;
  tripId: string | null;
  tripRef: string;
  ledger: DriverLedgerRow | null;
};

export function buildDriverWalletTransactions(input: {
  settlements: DriverLedgerRow[];
  expenses: DriverTripExpenseRow[];
  tripsById: Record<string, TripRow>;
  tripDisplay: (trip: TripRow | undefined, tripId: string | null) => string;
  partyNameForTrip: (trip: TripRow | undefined) => string;
  includeExpenses: boolean;
  /** Independent and Self book receipts. These are not ledger rows. */
  collections?: DriverBookCollection[];
}): DriverWalletTxn[] {
  const rows: DriverWalletTxn[] = [];
  const collections = input.collections ?? [];
  const collectedOnTrip = new Set(
    collections.map((row) => `${row.tripId ?? ""}:${Math.round(row.amount)}`),
  );

  for (const entry of input.settlements) {
    const amount = Math.round(Number(entry.amount) || 0);
    if (amount <= 0) continue;
    const tripId = entry.trip_id?.trim() || null;
    // A capture that landed in the book and also in the ledger is one payment.
    if (
      entry.reference_type === "dco_capture" &&
      collectedOnTrip.has(`${tripId ?? ""}:${amount}`)
    ) {
      continue;
    }
    const trip = tripId ? input.tripsById[tripId] : undefined;
    const tripRef = input.tripDisplay(trip, tripId);
    rows.push({
      id: `in:${entry.id}`,
      kind: "in",
      title: input.partyNameForTrip(trip),
      subtitle: tripRef,
      amount,
      at: entry.created_at,
      tripId,
      tripRef,
      ledger: entry,
    });
  }

  for (const collection of collections) {
    const trip = collection.tripId ? input.tripsById[collection.tripId] : undefined;
    const tripRef = input.tripDisplay(trip, collection.tripId);
    // Tagged trip name wins so older captures (AMzg) show as ADANI GROUPS.
    const party = resolveTripPartyDisplayName(trip, collection.partyName);
    rows.push({
      id: `in:${collection.id}`,
      kind: "in",
      title:
        party && party !== "Party" && party !== "Untagged"
          ? party
          : input.partyNameForTrip(trip),
      subtitle: tripRef,
      amount: collection.amount,
      at: collection.at,
      tripId: collection.tripId,
      tripRef,
      ledger: null,
    });
  }

  if (input.includeExpenses) {
    for (const expense of input.expenses) {
      if (expense.amount <= 0) continue;
      const trip = input.tripsById[expense.tripId];
      const tripRef = input.tripDisplay(trip, expense.tripId);
      rows.push({
        id: `out:${expense.id}`,
        kind: "out",
        title: expense.label,
        subtitle: tripRef,
        amount: expense.amount,
        at: expense.enteredAt,
        tripId: expense.tripId,
        tripRef,
        ledger: null,
      });
    }
  }

  rows.sort((a, b) => {
    const da = new Date(a.at).getTime();
    const db = new Date(b.at).getTime();
    return (Number.isFinite(db) ? db : 0) - (Number.isFinite(da) ? da : 0);
  });
  return rows;
}

export function filterDriverWalletTransactions(
  rows: DriverWalletTxn[],
  search: string,
): DriverWalletTxn[] {
  const q = search.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((row) =>
    `${row.title} ${row.subtitle} ${row.tripRef}`.toLowerCase().includes(q),
  );
}

export function groupDriverWalletTransactions<T extends { at: string }>(
  rows: T[],
  sectionLabel: (iso: string) => string,
): { sectionLabel: string; rows: T[] }[] {
  const bySection: { sectionLabel: string; rows: T[] }[] = [];
  let current = "";
  let bucket: T[] = [];
  for (const row of rows) {
    const label = sectionLabel(row.at);
    if (label !== current) {
      if (bucket.length) bySection.push({ sectionLabel: current, rows: bucket });
      current = label;
      bucket = [row];
    } else {
      bucket.push(row);
    }
  }
  if (bucket.length) bySection.push({ sectionLabel: current, rows: bucket });
  return bySection;
}

export function walletTxnPartyFallback(trip: TripRow | undefined, orgName: string): string {
  if (!trip) return orgName;
  const tagged = resolveTripPartyDisplayName(trip) || tripReceivablePartyName(trip);
  if (tagged && tagged !== "Untagged" && tagged !== "Shipper") return tagged;
  return orgName || "Party";
}
