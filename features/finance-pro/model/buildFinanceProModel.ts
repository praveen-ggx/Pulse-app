import { allocateAmountsToLargestDueTrips } from "@/features/finance/utils/allocateToLargestDue";
import { aggregateCustomersFromRpc } from "@/features/finance/aggregation/aggregateCustomersFromRpc";
import type { ClientLike } from "@/features/finance/aggregation/types";
import type { CustomerLedgerInputs } from "@/features/finance/services/ledgerAggregationRpc.service";
import { financeProTripCompleted, financeProTripPodReceived } from "./tripLens.util";
import type { IssuedInvoiceListRow } from "@/features/invoicing/services/invoiceList.service";
import { financeInvoiceHistoryFields } from "@/features/invoicing/utils/invoiceSource.util";
import { ratioPct } from "./collectionMath.util";
import { aggregatePipelineFromFacts } from "./pipelineAggregation.util";
import { buildVintageTrend } from "./vintageTrend.util";
import {
  emptyAgeMix,
  obligationAgeBucket,
  pickupAgeDays,
} from "./obligationAge.util";
import type {
  AttentionItem,
  ClientCollectionRow,
  FinanceProModel,
  OpenTripObligation,
  PipelineStage,
  TripFinancialFact,
  VintageMonthPoint,
} from "./financeProTypes";

export type TripLens = {
  id: string;
  client_id?: string | null;
  client_name?: string | null;
  pickup_date?: string | null;
  completed_at?: string | null;
  status?: string | null;
  pod_received_at?: string | null;
  pod_status?: unknown;
  client_price?: number | null;
  trip_number?: string | null;
  display_trip_id?: string | null;
  trip_code?: string | null;
};

function tripLabel(trip: TripLens | undefined, tripId: string): string {
  const label =
    trip?.display_trip_id?.trim() ||
    trip?.trip_code?.trim() ||
    trip?.trip_number?.trim() ||
    "";
  return label || tripId.slice(0, 8);
}

function daysInRange(iso: string, now: Date, days: number): boolean {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return false;
  return now.getTime() - d.getTime() <= days * 24 * 60 * 60 * 1000 && now.getTime() >= d.getTime();
}

function sameCalendarMonth(iso: string, now: Date): boolean {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return false;
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

function invoicedTripIdSet(
  invoices: readonly IssuedInvoiceListRow[] | undefined,
): Set<string> {
  const ids = new Set<string>();
  for (const inv of invoices ?? []) {
    for (const id of inv.trip_ids ?? []) {
      if (id) ids.add(id);
    }
  }
  return ids;
}

export function remainingDueByTripId(
  inputs: CustomerLedgerInputs,
): Map<string, number> {
  const tripInputsByClient = new Map<
    string,
    { tripId: string; sales: number; initialPaid: number }[]
  >();
  for (const ti of inputs.trip_inputs) {
    const list = tripInputsByClient.get(ti.client_id) ?? [];
    list.push({
      tripId: ti.trip_id,
      sales: ti.sales,
      initialPaid: ti.initial_paid,
    });
    tripInputsByClient.set(ti.client_id, list);
  }
  const unlinkedByClient = new Map<string, number[]>();
  for (const u of inputs.unlinked_payments) {
    const list = unlinkedByClient.get(u.client_id) ?? [];
    list.push(u.amount_in);
    unlinkedByClient.set(u.client_id, list);
  }

  const remaining = new Map<string, number>();
  for (const [clientId, clientTrips] of tripInputsByClient) {
    const allocated = allocateAmountsToLargestDueTrips(
      clientTrips.map((t) => ({
        tripId: t.tripId,
        sales: t.sales,
        paid: t.initialPaid,
      })),
      unlinkedByClient.get(clientId) ?? [],
    );
    for (const t of clientTrips) {
      remaining.set(t.tripId, Math.max(0, t.sales - (allocated[t.tripId] ?? 0)));
    }
  }
  return remaining;
}

function buildAttention(args: {
  podBlockedValue: number;
  podBlockedCount: number;
  readyValue: number;
  readyCount: number;
  concentration: ClientCollectionRow[];
  vintage: VintageMonthPoint[];
}): AttentionItem[] {
  const items: AttentionItem[] = [];
  if (args.podBlockedValue > 0) {
    items.push({
      id: "pod-blocked",
      title: "POD-blocked revenue",
      detail: `${args.podBlockedCount} completed trip${args.podBlockedCount === 1 ? "" : "s"} waiting on physical POD before billing.`,
      value: args.podBlockedValue,
      href: "pod",
    });
  }
  if (args.readyValue > 0) {
    items.push({
      id: "ready",
      title: "Ready to invoice",
      detail: `${args.readyCount} trip${args.readyCount === 1 ? "" : "s"} with physical POD received and not yet invoiced.`,
      value: args.readyValue,
      href: "invoice",
    });
  }
  const top = args.concentration[0];
  if (top && top.outstanding > 0) {
    items.push({
      id: "concentration",
      title: `${top.name} has the largest open balance`,
      detail: `${top.shareOfOutstanding.toFixed(0)}% of trip-linked outstanding.`,
      value: top.outstanding,
      href: "collections",
    });
  }
  const vintage = args.vintage.filter((v) => v.billed > 0 || v.attributedReceipts > 0);
  if (vintage.length >= 2) {
    const prev = vintage[vintage.length - 2];
    const last = vintage[vintage.length - 1];
    if (prev.attributedReceipts > 0) {
      const deltaPct = ratioPct(
        last.attributedReceipts - prev.attributedReceipts,
        prev.attributedReceipts,
      );
      if (deltaPct < -0.5) {
        items.push({
          id: "receipts-down",
          title: "Attributed receipts lower vs prior pickup month",
          detail: `${Math.abs(deltaPct).toFixed(0)}% lower on trips picked up in ${last.label} vs ${prev.label}. Vintage, not cash date.`,
          value: last.attributedReceipts,
          href: "intelligence",
        });
      }
    }
  }
  return items;
}

export function buildFinanceProModel(args: {
  clients: readonly ClientLike[];
  inputs: CustomerLedgerInputs | null | undefined;
  trips: readonly TripLens[];
  issuedInvoices?: readonly IssuedInvoiceListRow[];
  now?: Date;
  /** Digital POD (trip_documents) for completed trips missing physical stamp. */
  digitalPodTripIds?: ReadonlySet<string>;
}): FinanceProModel {
  const now = args.now ?? new Date();
  const emptyInputs: CustomerLedgerInputs = {
    trip_inputs: [],
    unlinked_payments: [],
    ledger_only_parties: [],
    client_ledger_totals: [],
  };
  const inputs = args.inputs ?? emptyInputs;
  const agg = aggregateCustomersFromRpc(args.clients, inputs);
  const remaining = remainingDueByTripId(inputs);
  const invoicedIds = invoicedTripIdSet(args.issuedInvoices);
  const digitalPodTripIds = args.digitalPodTripIds ?? new Set<string>();
  const tripById = new Map(args.trips.map((t) => [t.id, t]));

  const nameByClient = new Map(
    args.clients.map((c) => [
      c.id,
      (c.name || c.contact_person || "Unnamed").trim() || "Unnamed",
    ]),
  );

  const tripFacts: TripFinancialFact[] = [];
  const openTrips: OpenTripObligation[] = [];

  for (const ti of inputs.trip_inputs) {
    const trip = tripById.get(ti.trip_id);
    const rem = remaining.get(ti.trip_id) ?? 0;
    const daysOld = pickupAgeDays(trip?.pickup_date ?? null, now);
    const fact: TripFinancialFact = {
      tripId: ti.trip_id,
      clientId: ti.client_id,
      clientName:
        nameByClient.get(ti.client_id) ||
        trip?.client_name?.trim() ||
        "Unnamed",
      tripLabel: tripLabel(trip, ti.trip_id),
      status: trip?.status ?? "",
      sales: ti.sales,
      remainingDue: rem,
      pickupDate: trip?.pickup_date ?? null,
      daysOld,
      ageBucket: daysOld == null ? null : obligationAgeBucket(daysOld),
      physicalPodReceived: trip ? financeProTripPodReceived(trip) : false,
      podReceived: trip
        ? financeProTripPodReceived(trip, digitalPodTripIds)
        : digitalPodTripIds.has(ti.trip_id),
      invoiced: invoicedIds.has(ti.trip_id),
      completed: trip ? financeProTripCompleted(trip) : false,
    };
    tripFacts.push(fact);
    if (rem > 0) openTrips.push(fact);
  }

  const billed = agg.totals.totalIn;
  const outstanding = agg.totals.totalOut;
  const attributedReceipts = Math.max(0, billed - outstanding);

  const ageTotals = emptyAgeMix();
  let unagedOutstanding = 0;
  const mixByClient = new Map<string, ReturnType<typeof emptyAgeMix>>();
  const openCountByClient = new Map<string, number>();
  const oldestByClient = new Map<string, number>();
  for (const trip of openTrips) {
    if (trip.ageBucket) ageTotals[trip.ageBucket] += trip.remainingDue;
    else unagedOutstanding += trip.remainingDue;
    const mix = mixByClient.get(trip.clientId) ?? emptyAgeMix();
    if (trip.ageBucket) mix[trip.ageBucket] += trip.remainingDue;
    mixByClient.set(trip.clientId, mix);
    openCountByClient.set(
      trip.clientId,
      (openCountByClient.get(trip.clientId) ?? 0) + 1,
    );
    if (trip.daysOld != null) {
      const prev = oldestByClient.get(trip.clientId);
      oldestByClient.set(
        trip.clientId,
        prev == null ? trip.daysOld : Math.max(prev, trip.daysOld),
      );
    }
  }

  const clientRows: ClientCollectionRow[] = agg.rows.map((row) => ({
    id: row.id,
    name: row.name ?? "Unnamed",
    billed: row.billed ?? row.in ?? 0,
    attributedReceipts: row.received ?? 0,
    outstanding: row.pending ?? row.out ?? 0,
    openTrips: openCountByClient.get(row.id) ?? 0,
    oldestObligationDays: oldestByClient.get(row.id) ?? null,
    ageMix: mixByClient.get(row.id) ?? emptyAgeMix(),
    shareOfOutstanding: ratioPct(row.pending ?? row.out ?? 0, outstanding),
    isLedgerOnly: row.id.startsWith("ledger-party-"),
  }));

  const pipeline = aggregatePipelineFromFacts(
    tripFacts,
    attributedReceipts,
    clientRows,
  );
  const vintage = buildVintageTrend(tripFacts, now);
  const podPending = pipeline.find((s) => s.id === "pod_pending");
  const ready = pipeline.find((s) => s.id === "ready_to_invoice");
  const concentration = [...clientRows]
    .filter((r) => r.outstanding > 0)
    .sort((a, b) => b.outstanding - a.outstanding)
    .slice(0, 5);

  const issuedInvoiceDocuments = (args.issuedInvoices ?? []).map((inv) => {
    const history = financeInvoiceHistoryFields({
      invoice_source: inv.invoice_source,
      sales_order_number: inv.sales_order_number,
      trip_ids: inv.trip_ids ?? [],
    });
    return {
      id: inv.id,
      invoiceNumber: inv.invoice_number,
      invoiceDate: inv.invoice_date,
      clientName: inv.client_name,
      documentAmount: inv.total_amount,
      status: inv.status,
      tripIds: inv.trip_ids ?? [],
      sourceLabel: history.source,
      sourceReference: history.reference,
    };
  });
  const issuedThisMonth = issuedInvoiceDocuments.filter((d) =>
    sameCalendarMonth(d.invoiceDate, now),
  );
  const issuedLast30 = issuedInvoiceDocuments.filter((d) =>
    daysInRange(d.invoiceDate, now, 30),
  );

  return {
    billed,
    attributedReceipts,
    outstanding,
    collectionPct: ratioPct(attributedReceipts, billed),
    clientsWithBalance: clientRows.filter((r) => r.outstanding > 0).length,
    clientRows,
    tripFacts,
    openTrips,
    ageTotals,
    unagedOutstanding,
    pipeline,
    vintage,
    concentration,
    attention: buildAttention({
      podBlockedValue: podPending?.value ?? 0,
      podBlockedCount: podPending?.count ?? 0,
      readyValue: ready?.value ?? 0,
      readyCount: ready?.count ?? 0,
      concentration,
      vintage,
    }),
    issuedInvoiceDocuments,
    issuedThisMonthValue: issuedThisMonth.reduce((s, d) => s + d.documentAmount, 0),
    issuedThisMonthCount: issuedThisMonth.length,
    issuedLast30Value: issuedLast30.reduce((s, d) => s + d.documentAmount, 0),
    issuedLast30Count: issuedLast30.length,
  };
}

export function pipelineStageById(
  pipeline: PipelineStage[],
  id: PipelineStage["id"],
): PipelineStage {
  return pipeline.find((s) => s.id === id) ?? { id, count: 0, value: 0, customerCount: 0 };
}
