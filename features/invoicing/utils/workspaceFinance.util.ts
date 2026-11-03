/**
 * Customer finance drawn from the records that already exist: trip CN/DN,
 * issued invoices, and receipts. A note whose id is already on an invoice
 * line is part of that invoice total and is not applied a second time.
 */
import type { IssuedInvoiceListRow } from "@/features/invoicing/services/invoiceList.service";
import type { InvoicingTripView } from "@/features/invoicing/services/invoicing.service";
import type { TripAdjustment } from "@/features/trips/services/tripAdjustments";

export type WorkspaceNote = {
  id: string;
  kind: "credit" | "debit";
  side: "customer" | "supplier";
  date: string;
  tripId: string;
  tripLabel: string;
  invoiceNumber: string | null;
  reason: string;
  amount: number;
  voided: boolean;
};

export function noteIdsOnInvoices(invoices: readonly { line_items?: unknown }[]): Set<string> {
  const ids = new Set<string>();
  const pattern = /cndn:([A-Za-z0-9_-]+)/g;
  for (const invoice of invoices) {
    const text = JSON.stringify(invoice.line_items ?? "");
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text))) ids.add(match[1]);
  }
  return ids;
}

export function listWorkspaceNotes(
  adjustments: readonly TripAdjustment[],
  trips: readonly InvoicingTripView[],
): WorkspaceNote[] {
  const byTrip = new Map<string, InvoicingTripView>();
  for (const trip of trips) {
    if (trip.internal_id) byTrip.set(trip.internal_id, trip);
    if (trip.id) byTrip.set(trip.id, trip);
  }
  return adjustments
    .map((note) => {
      const trip = byTrip.get(note.trip_id);
      const amount = Math.round(Math.abs(Number(note.amount) || 0) * 100) / 100;
      return {
        id: note.id,
        kind: note.impact === "minus" ? ("credit" as const) : ("debit" as const),
        side: note.type === "cost" ? ("supplier" as const) : ("customer" as const),
        date: (note.created_at ?? "").slice(0, 10),
        tripId: note.trip_id,
        tripLabel: trip?.lr_number?.trim() || trip?.trip_number || trip?.id || note.trip_id,
        invoiceNumber: trip?.issuedInvoiceNumber ?? null,
        reason: note.reason?.trim() || (note.impact === "minus" ? "Credit note" : "Debit note"),
        amount,
        voided: Boolean(note.voided_at && String(note.voided_at).trim()),
      };
    })
    .filter((note) => note.amount > 0)
    .sort((a, b) => b.date.localeCompare(a.date));
}

/**
 * Signed rupee change still owed, per trip id. Credits are negative.
 * A note on a trip that already has an issued invoice is part of that invoice,
 * so it is not applied again. The same is true when the note id is on an invoice line.
 */
export function openNoteDeltaByTrip(
  notes: readonly WorkspaceNote[],
  invoicedTripIds: ReadonlySet<string>,
  alreadyOnInvoice: ReadonlySet<string> = new Set(),
): Map<string, number> {
  const deltas = new Map<string, number>();
  for (const note of notes) {
    if (note.voided || note.side !== "customer") continue;
    if (invoicedTripIds.has(note.tripId) || alreadyOnInvoice.has(note.id)) continue;
    const signed = note.kind === "credit" ? -note.amount : note.amount;
    deltas.set(note.tripId, Math.round(((deltas.get(note.tripId) ?? 0) + signed) * 100) / 100);
  }
  return deltas;
}

export function workspaceTripIds(trips: readonly InvoicingTripView[]): string[] {
  return [...new Set(trips.flatMap((trip) => [trip.internal_id, trip.id].filter((id): id is string => Boolean(id))))];
}

export function invoicesInPeriod(invoices: readonly IssuedInvoiceListRow[], from: string | null, to: string | null): IssuedInvoiceListRow[] {
  return invoices.filter((invoice) => {
    const day = (invoice.invoice_date ?? "").slice(0, 10);
    if (from && day < from) return false;
    if (to && day > to) return false;
    return true;
  });
}
