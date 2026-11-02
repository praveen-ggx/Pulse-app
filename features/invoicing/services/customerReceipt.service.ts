import { createLedgerEntry } from "@/features/finance/services/finance.service";
import {
  receiptAppliedFromSnapshot,
  splitReceiptAmount,
  spreadReceiptAcrossTrips,
  type ReceiptAllocationLine,
  type ReceiptTripWeight,
  type TripReceiptSlice,
} from "@/features/invoicing/utils/customerReceipt.util";
import { supabase } from "@/lib/supabase";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export type ReceiptTripAnchor = ReceiptTripWeight & {
  tripNumber: string | null;
};

async function postReceipt(args: {
  orgId: string;
  party: string;
  contactId: string | null;
  date: string;
  reference: string;
  invoiceNumber: string;
  cash: number;
  tds: number;
  tripId?: string | null;
  tripNumber?: string | null;
}): Promise<Error | null> {
  const reference = args.reference.trim();
  const tripBit = args.tripId ? ` · trip ${args.tripNumber || args.tripId}` : "";
  if (args.cash > 0) {
    const posted = await createLedgerEntry(args.orgId, {
      party_name: args.party,
      contact_id: args.contactId,
      contact_type: args.contactId ? "client" : null,
      trip_id: args.tripId ?? null,
      trip_number: args.tripNumber ?? null,
      description: `Customer receipt${reference ? ` ${reference}` : ""} · ${args.invoiceNumber}${tripBit}`,
      amount_in: args.cash,
      amount_out: 0,
      transaction_date: args.date,
      payment_reference: reference || null,
      ledger_category: "customer_receipt",
    });
    if (posted.error) return posted.error;
  }
  if (args.tds > 0) {
    const posted = await createLedgerEntry(args.orgId, {
      party_name: args.party,
      contact_id: args.contactId,
      contact_type: args.contactId ? "client" : null,
      trip_id: args.tripId ?? null,
      trip_number: args.tripNumber ?? null,
      description: `TDS deducted by customer${reference ? ` ${reference}` : ""} · ${args.invoiceNumber}${tripBit}`,
      amount_in: args.tds,
      amount_out: 0,
      transaction_date: args.date,
      payment_reference: reference || null,
      ledger_category: "tds_receivable",
    });
    if (posted.error) return posted.error;
  }
  return null;
}

export async function captureCustomerReceipt(args: {
  orgId: string;
  clientId: string | null;
  clientName: string;
  cash: number;
  tds: number;
  reference: string;
  date: string;
  lines: readonly ReceiptAllocationLine[];
  /** Trips on each invoice, keyed by invoice id. Empty means a customer-level receipt. */
  tripsByInvoice?: Readonly<Record<string, readonly ReceiptTripAnchor[]>>;
  /** Edited trip shares. When set for an invoice, those amounts are posted instead of the sales-weight split. */
  slicesByInvoice?: Readonly<Record<string, readonly TripReceiptSlice[]>>;
}): Promise<{ error: Error | null; cleared: number; trips: number }> {
  const cash = round2(Math.max(0, args.cash));
  const tds = round2(Math.max(0, args.tds));
  const applied = args.lines.filter((line) => line.applied > 0);
  if (cash + tds <= 0 || applied.length === 0) {
    return { error: new Error("Enter an amount and choose invoices that are still open."), cleared: 0, trips: 0 };
  }
  const reference = args.reference.trim();
  const date = args.date.trim() || today();
  const party = args.clientName.trim() || "Customer";
  const contactId = args.clientId && !args.clientId.startsWith("name:") ? args.clientId : null;
  let tripPosts = 0;

  for (const line of applied) {
    const anchors = args.tripsByInvoice?.[line.id] ?? [];
    const edited = args.slicesByInvoice?.[line.id];
    const spread = edited
      ? {
          slices: edited.filter((slice) => slice.applied > 0),
          overflow: splitReceiptAmount(
            round2(line.applied - edited.reduce((sum, slice) => sum + slice.applied, 0)),
            cash,
            tds,
          ),
        }
      : spreadReceiptAcrossTrips({
          applied: line.applied,
          cash,
          tds,
          trips: anchors,
        });
    for (const slice of spread.slices) {
      const anchor = anchors.find((trip) => trip.id === slice.tripId);
      const posted = await postReceipt({
        orgId: args.orgId,
        party,
        contactId,
        date,
        reference,
        invoiceNumber: line.number,
        cash: slice.cash,
        tds: slice.tds,
        tripId: slice.tripId,
        tripNumber: anchor?.tripNumber ?? null,
      });
      if (posted) return { error: posted, cleared: 0, trips: tripPosts };
      tripPosts += 1;
    }
    if (spread.overflow.cash > 0 || spread.overflow.tds > 0 || spread.slices.length === 0) {
      const posted = await postReceipt({
        orgId: args.orgId,
        party,
        contactId,
        date,
        reference,
        invoiceNumber: line.number,
        cash: spread.slices.length === 0 ? round2(spread.overflow.cash) : spread.overflow.cash,
        tds: spread.slices.length === 0 ? round2(spread.overflow.tds) : spread.overflow.tds,
      });
      if (posted) return { error: posted, cleared: 0, trips: tripPosts };
    }
  }

  const ids = applied.map((line) => line.id);
  const { data, error: readError } = await supabase()
    .from("invoices")
    .select("id, tax_snapshot, status")
    .eq("org_id", args.orgId)
    .in("id", ids);
  if (readError) return { error: new Error(readError.message), cleared: 0, trips: tripPosts };

  const snapshots = new Map<string, unknown>();
  for (const row of data ?? []) {
    const id = String((row as { id?: unknown }).id ?? "");
    if (id) snapshots.set(id, (row as { tax_snapshot?: unknown }).tax_snapshot ?? null);
  }
  let cleared = 0;
  for (const line of applied) {
    const nextReceived = round2(receiptAppliedFromSnapshot(snapshots.get(line.id)) + line.applied);
    const patch: { tax_snapshot: Record<string, unknown>; status?: string } = {
      tax_snapshot: {
        ...(snapshots.get(line.id) && typeof snapshots.get(line.id) === "object" && !Array.isArray(snapshots.get(line.id))
          ? (snapshots.get(line.id) as Record<string, unknown>)
          : {}),
        receipt_applied: nextReceived,
      },
    };
    if (line.cleared) {
      patch.status = "paid";
      cleared += 1;
    }
    const { error } = await supabase()
      .from("invoices")
      .update(patch)
      .eq("org_id", args.orgId)
      .eq("id", line.id)
      .in("status", ["sent", "paid"]);
    if (error) return { error: new Error(error.message), cleared: 0, trips: tripPosts };
  }
  return { error: null, cleared, trips: tripPosts };
}
