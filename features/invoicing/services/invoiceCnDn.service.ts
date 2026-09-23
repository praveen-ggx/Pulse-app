/**
 * Map trip finance CN/DN (sale/revenue) onto invoice draft amounts and lines.
 * Persistence stays in trip_finance_adjustments — same registry as Trip Detail.
 * Formula matches `adjustedRevenue` in tripAdjustments (kept local so this
 * module stays a pure invoice mapper).
 */

import type { InvoicePdfItem } from '@/components/InvoicePdf.types';
import type { AdditionalCharge, InvoicingTripView } from './invoicing.service';

export const INVOICE_CNDN_CHARGE_ID_PREFIX = 'cndn:';

export type InvoiceRevenueNote = {
  id: string;
  type: 'revenue' | 'cost';
  impact: 'plus' | 'minus';
  amount: number;
  reason?: string | null;
  voided_at?: string | null;
};

function isVoided(a: InvoiceRevenueNote): boolean {
  return String(a.voided_at ?? '').trim().length > 0;
}

function normTripId(id: string | null | undefined): string {
  return id == null ? '' : String(id).trim().toLowerCase();
}

export function isInvoiceCnDnCharge(charge: AdditionalCharge): boolean {
  return String(charge.id ?? '').startsWith(INVOICE_CNDN_CHARGE_ID_PREFIX);
}

export function invoiceOnlyCharges(charges: AdditionalCharge[]): AdditionalCharge[] {
  return charges.filter((c) => !isInvoiceCnDnCharge(c));
}

export function activeRevenueAdjustments(
  adjustments: InvoiceRevenueNote[] | null | undefined,
): InvoiceRevenueNote[] {
  const list = Array.isArray(adjustments) ? adjustments : [];
  return list.filter((a) => a.type === 'revenue' && !isVoided(a));
}

/**
 * Generic over the note type so richer inputs keep their shape: callers pass
 * `TripAdjustment` (a superset of InvoiceRevenueNote) and need the grouped
 * arrays to stay `TripAdjustment[]` — e.g. to hand a row to an edit callback
 * that requires `trip_id`. Narrowing to InvoiceRevenueNote here erased that.
 */
export function groupInvoiceRevenueCnDn<T extends InvoiceRevenueNote>(
  adjustments: T[] | null | undefined,
): {
  creditNotes: T[];
  debitNotes: T[];
  voided: T[];
  delta: number;
} {
  const list = Array.isArray(adjustments) ? adjustments : [];
  const revenue = list.filter((a) => a.type === 'revenue');
  const active = revenue.filter((a) => !isVoided(a));
  const creditNotes = active.filter((a) => a.impact === 'minus');
  const debitNotes = active.filter((a) => a.impact === 'plus');
  const delta = active.reduce(
    (sum, a) => sum + (a.impact === 'plus' ? a.amount : -a.amount),
    0,
  );
  return {
    creditNotes,
    debitNotes,
    voided: revenue.filter((a) => isVoided(a)),
    delta,
  };
}

export function invoiceTripAdjustedAmount(
  baseAmount: number,
  adjustments: InvoiceRevenueNote[] | null | undefined,
): number {
  const base = Number.isFinite(baseAmount) ? baseAmount : 0;
  return Math.max(0, base + groupInvoiceRevenueCnDn(adjustments).delta);
}

export function cnDnChargeFromAdjustment(
  tripKey: string,
  adj: InvoiceRevenueNote,
): AdditionalCharge {
  const isCredit = adj.impact === 'minus';
  const reason = (adj.reason ?? '').trim() || (isCredit ? 'Credit note' : 'Debit note');
  return {
    id: `${INVOICE_CNDN_CHARGE_ID_PREFIX}${adj.id}`,
    tripId: tripKey,
    description: isCredit ? `Credit note — ${reason}` : `Debit note — ${reason}`,
    amount: isCredit ? -Math.abs(adj.amount) : Math.abs(adj.amount),
  };
}

export function mergeInvoiceChargesWithTripCnDn(
  invoiceCharges: AdditionalCharge[],
  trips: InvoicingTripView[],
  adjustmentsByTripId: Record<string, InvoiceRevenueNote[]>,
): AdditionalCharge[] {
  const custom = invoiceOnlyCharges(invoiceCharges);
  const fromNotes: AdditionalCharge[] = [];
  for (const trip of trips) {
    const key = trip.internal_id || trip.id;
    const rows =
      adjustmentsByTripId[normTripId(trip.internal_id)] ??
      adjustmentsByTripId[String(trip.internal_id ?? '')] ??
      adjustmentsByTripId[normTripId(trip.id)] ??
      adjustmentsByTripId[String(trip.id ?? '')] ??
      [];
    for (const adj of activeRevenueAdjustments(rows)) {
      fromNotes.push(cnDnChargeFromAdjustment(key, adj));
    }
  }
  return [...custom, ...fromNotes];
}

export function chargeBelongsToTrip(
  charge: AdditionalCharge,
  trip: InvoicingTripView,
): boolean {
  const id = normTripId(charge.tripId);
  if (!id) return false;
  return id === normTripId(trip.internal_id) || id === normTripId(trip.id);
}

export function splitChargesForInvoiceTrips(
  charges: AdditionalCharge[],
  trips: InvoicingTripView[],
): { byTripKey: Map<string, AdditionalCharge[]>; unassigned: AdditionalCharge[] } {
  const byTripKey = new Map<string, AdditionalCharge[]>();
  const assigned = new Set<string>();
  for (const trip of trips) {
    const key = trip.internal_id || trip.id;
    const list = charges.filter((c) => chargeBelongsToTrip(c, trip));
    for (const c of list) assigned.add(c.id);
    byTripKey.set(key, list);
  }
  const unassigned = charges.filter((c) => !assigned.has(c.id));
  return { byTripKey, unassigned };
}

export type InvoicePdfTableRow = InvoicePdfItem & {
  rowRole: 'freight' | 'split' | 'revised' | 'other';
};

function freightParentKey(item: InvoicePdfItem): string {
  return item.tripKey || item.tripId;
}

function nestedParentKey(
  item: InvoicePdfItem,
  freights: InvoicePdfItem[],
): string | null {
  if (item.lineType === 'freight' || item.lineType === 'fuel') return null;
  if (item.tripKey) {
    const byKey = freights.find(
      (fr) => freightParentKey(fr) === item.tripKey || fr.tripKey === item.tripKey,
    );
    if (byKey) return freightParentKey(byKey);
  }
  if (item.tripId) {
    const byRef = freights.find((fr) => fr.tripId === item.tripId);
    if (byRef) return freightParentKey(byRef);
  }
  return null;
}

function revisedFreightAmount(base: number, nested: InvoicePdfItem[]): number {
  if (nested.length === 0) return base;
  return Math.max(
    0,
    base + nested.reduce((sum, n) => sum + (Number(n.amount) || 0), 0),
  );
}

/** Flatten snapshot lines into PDF rows: trip, nested CN/DN, then revised invoiced freight. */
export function buildInvoicePdfTableRows(
  items: InvoicePdfItem[],
  options: { showSplit?: boolean } = {},
): InvoicePdfTableRow[] {
  const showSplit = options.showSplit !== false;
  const freights = items.filter((item) => item.lineType === 'freight');
  const nestedByParent = new Map<string, InvoicePdfItem[]>();
  const nestedKeys = new Set<string>();
  for (const item of items) {
    const parent = nestedParentKey(item, freights);
    if (!parent) continue;
    const list = nestedByParent.get(parent) ?? [];
    list.push(item);
    nestedByParent.set(parent, list);
    nestedKeys.add(item.key);
  }

  const out: InvoicePdfTableRow[] = [];
  for (const item of items) {
    if (nestedKeys.has(item.key)) continue;
    if (item.lineType !== 'freight') {
      out.push({ ...item, rowRole: 'other' });
      continue;
    }
    const parentKey = freightParentKey(item);
    const nested = nestedByParent.get(parentKey) ?? [];
    const invoiced = revisedFreightAmount(item.amount, nested);
    if (!showSplit || nested.length === 0) {
      out.push({ ...item, amount: invoiced, rowRole: 'freight' });
      continue;
    }
    out.push({ ...item, rowRole: 'freight' });
    for (const note of nested) {
      out.push({
        ...note,
        nested: true,
        rowRole: 'split',
      });
    }
    out.push({
      key: `revised-${parentKey}`,
      tripId: 'Invoiced',
      route: 'Revised freight',
      date: '',
      amount: invoiced,
      lineType: 'freight',
      tripKey: item.tripKey,
      nested: true,
      splitKind: null,
      rowRole: 'revised',
    });
  }
  return out;
}
