import type { DriverLedgerRow } from "@/features/drivers/services/drivers.service";
import type { DriverBookCollection } from "@/features/drivers/services/driverCapturePayment.service";
import type { DriverTripExpenseRow } from "@/features/drivers/services/driverTripExpenses.service";
import type { TripRow } from "@/features/trips/services/trips.service";
import {
  resolveTripPartyDisplayName,
  tripReceivablePartyName,
} from "@/features/drivers/utils/driverPartyReceivables.util";
import { driverJobSource } from "@/features/drivers/domain/driverOperatingMode";

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
  /** Book receipts only (no ledger row): mode and reference typed at capture. */
  paymentMode?: string | null;
  reference?: string | null;
};

export function buildDriverWalletTransactions(input: {
  settlements: DriverLedgerRow[];
  expenses: DriverTripExpenseRow[];
  tripsById: Record<string, TripRow>;
  tripDisplay: (trip: TripRow | undefined, tripId: string | null) => string;
  partyNameForTrip: (trip: TripRow | undefined) => string;
  /** Company that assigned the trip (and so pays the driver); null for the driver's own trips. */
  assignerNameForTrip?: (trip: TripRow) => string | null;
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
    // A company-assigned trip is paid by that company. The label saved at the
    // first capture (e.g. the company's own customer) must not override it.
    const assigner = trip ? String(input.assignerNameForTrip?.(trip) ?? "").trim() : "";
    // Otherwise the tagged trip name wins so older captures (AMzg) show as ADANI GROUPS.
    const party = resolveTripPartyDisplayName(trip, collection.partyName);
    const title = assigner
      ? assigner
      : party && party !== "Party" && party !== "Untagged"
        ? party
        : input.partyNameForTrip(trip);
    rows.push({
      id: `in:${collection.id}`,
      kind: "in",
      title,
      subtitle: tripRef,
      amount: collection.amount,
      at: collection.at,
      tripId: collection.tripId,
      tripRef,
      ledger: null,
      paymentMode: collection.paymentMode,
      reference: collection.reference,
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

/**
 * Who pays the driver for this trip.
 * - Assigned by a company (OTP / fleet / supplier): that company. Its own
 *   customer (e.g. Godrej) pays the company, never the driver.
 * - Driver's own DCO trip and marketplace: unchanged (tagged party / listing shipper).
 */
export function walletTxnPayerName(
  trip: TripRow | undefined,
  orgName: string,
  assignerOrgName: string | null | undefined,
): string {
  return walletTxnAssignerPayer(trip, assignerOrgName) ?? walletTxnPartyFallback(trip, orgName);
}

/** The assigning company when it pays the driver; null for DCO-own and marketplace trips. */
export function walletTxnAssignerPayer(
  trip: TripRow | undefined,
  assignerOrgName: string | null | undefined,
): string | null {
  const assigner = String(assignerOrgName ?? "").trim();
  if (trip && assigner && driverJobSource(trip) === "business_assigned") return assigner;
  return null;
}
