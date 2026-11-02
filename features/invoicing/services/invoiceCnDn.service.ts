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

export function isInvoiceNoteDescription(description: string): boolean {
  return /^(credit note|debit note)\b/i.test(description.trim());
}

type SplitLine = {
  description: string;
  trip_id: string | null;
  trip_ref: string | null;
  line_type: string;
  rate: number;
  taxable_value: number;
};

function noteMatchesFreight(note: SplitLine, freight: SplitLine): boolean {
  const ids = [freight.trip_id, freight.trip_ref].filter(Boolean);
  return ids.some((id) => id === note.trip_id || id === note.trip_ref);
}

/**
 * Split on: keep each credit and debit note.
 * Split off: drop those lines and show the freight amount after them, rounded to the rupee.
 */
export function invoiceLinesForNoteSplit<T extends SplitLine>(
  lines: T[],
  showSplit: boolean,
): T[] {
  if (showSplit) return lines;
  const notes = lines.filter((line) => isInvoiceNoteDescription(line.description));
  if (notes.length === 0) return lines;
  const freights = lines.filter((line) => line.line_type === 'freight');
  const used = new Set<T>();
  const netted = new Map<T, number>();
  for (const freight of freights) {
    const matched = notes.filter((note) => !used.has(note) && noteMatchesFreight(note, freight));
    matched.forEach((note) => used.add(note));
    const sum = matched.reduce((acc, note) => acc + note.taxable_value, 0);
    netted.set(freight, freight.taxable_value + sum);
  }
  const leftover = notes
    .filter((note) => !used.has(note))
    .reduce((acc, note) => acc + note.taxable_value, 0);
  const last = freights[freights.length - 1];
  if (last) netted.set(last, (netted.get(last) ?? last.taxable_value) + leftover);

  const presented = lines.flatMap((line) => {
    if (isInvoiceNoteDescription(line.description)) return [];
    if (line.line_type !== 'freight') return [line];
    const net = Math.round(netted.get(line) ?? line.taxable_value);
    return [{ ...line, rate: net, taxable_value: net }];
  });
  const exact = lines.reduce((acc, line) => acc + line.taxable_value, 0);
  const shown = presented.reduce((acc, line) => acc + line.taxable_value, 0);
  const roundOff = Math.round((exact - shown) * 100) / 100;
  if (Math.abs(roundOff) >= 0.01 && last) {
    presented.push({
      ...last,
      description: 'Round off',
      trip_id: null,
      trip_ref: null,
      line_type: 'additional',
      rate: roundOff,
      taxable_value: roundOff,
      qty: 1,
      unit: 'trip',
    } as T);
  }
  return presented;
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
      title: 'Revised freight',
      date: '',
      amount: invoiced,
      rate: invoiced,
      lineType: 'freight',
      tripKey: item.tripKey,
      nested: true,
      splitKind: null,
      rowRole: 'revised',
    });
  }
  return out;
}
