import {
  CHARGE_FIELDS,
  EMPTY_CHARGE_LINES,
  EXCLUDED_CHARGE_KEYS,
  IBOND_DEDUCTIBLE_COST,
  INCLUDED_CHARGE_KEYS,
  type ChargeDraft,
  type DebitControlReceivedTrip,
  type IndentType,
  type PodChargeLines,
} from "@/features/debit-control/utils/debitControlPod.model";

export function resolveIndentType(input: {
  laneId?: string | null;
  isSpotRate?: boolean | null;
}): IndentType {
  if (!String(input.laneId ?? "").trim()) return "Adhoc";
  return input.isSpotRate ? "Spot" : "Contract";
}

export function includedChargeTotal(lines: PodChargeLines): number {
  const sum = INCLUDED_CHARGE_KEYS.reduce((total, key) => total + (Number(lines[key]) || 0), 0);
  return Math.round(sum * 100) / 100;
}

export function excludedChargeTotal(lines: PodChargeLines): number {
  return EXCLUDED_CHARGE_KEYS.reduce((sum, key) => sum + (Number(lines[key]) || 0), 0);
}

/** Delay, damage, product missing, document cost, POD delay, and the IBond deductible are deducted from the side's total. */
export function netChargeTotal(lines: PodChargeLines): number {
  return Math.round((includedChargeTotal(lines) - excludedChargeTotal(lines)) * 100) / 100;
}

/**
 * Vendor cost after the IBond deductible. The same original and flag always
 * return the same amount, so refresh and a repeated save do not deduct again.
 */
/**
 * Vendor Document Cost shown on the trip. Only the amount recorded when the
 * advance was processed. A missing record is ₹0, including a value typed on this screen.
 */
export function advanceDocumentCostAmount(stored: number | null): number {
  if (stored != null && Number.isFinite(stored) && stored >= 0) {
    return Math.round(stored * 100) / 100;
  }
  return 0;
}

export function vendorCostAfterIbond(originalVendorCost: number, ibond: boolean): number {
  const original = Number.isFinite(originalVendorCost) ? originalVendorCost : 0;
  if (!ibond) return Math.round(original * 100) / 100;
  return Math.round(Math.max(0, original - IBOND_DEDUCTIBLE_COST) * 100) / 100;
}

export function chargeLinesFromBase(cost: number): PodChargeLines {
  const safe = Number.isFinite(cost) && cost > 0 ? cost : 0;
  return { ...EMPTY_CHARGE_LINES, cost: safe };
}

export function chargeDraftFromLines(lines: PodChargeLines): ChargeDraft {
  const draft = {} as ChargeDraft;
  for (const field of CHARGE_FIELDS) {
    const value = Number(lines[field.key]) || 0;
    draft[field.key] = value > 0 ? String(Math.round(value * 100) / 100) : "";
  }
  return draft;
}

/** Empty is zero. Anything else must be a non-negative amount with at most 2 decimals. */
export function parseChargeInput(raw: string): number | null {
  const text = raw.trim();
  if (!text) return 0;
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
  const value = Number(text);
  if (!Number.isFinite(value) || value < 0) return null;
  return value;
}

export function chargeLinesFromDraft(
  draft: ChargeDraft,
): { lines: PodChargeLines } | { lines: null; invalidKeys: (keyof PodChargeLines)[] } {
  const lines = { ...EMPTY_CHARGE_LINES };
  const invalidKeys: (keyof PodChargeLines)[] = [];
  for (const field of CHARGE_FIELDS) {
    const parsed = parseChargeInput(draft[field.key] ?? "");
    if (parsed == null) invalidKeys.push(field.key);
    else lines[field.key] = parsed;
  }
  if (invalidKeys.length > 0) return { lines: null, invalidKeys };
  return { lines };
}

export function isTripOpenForValidation(trip: {
  validatedAt?: string | null;
}): boolean {
  return !String(trip.validatedAt ?? "").trim();
}

export function selectableReceivedTripIds(
  trips: readonly { id: string; validatedAt?: string | null }[],
): string[] {
  return trips.filter(isTripOpenForValidation).map((trip) => trip.id);
}

export function displayedClientValue(trip: DebitControlReceivedTrip): number {
  if (trip.totalClientValue != null) return trip.totalClientValue;
  return trip.clientPrice;
}

export function displayedVendorValue(trip: DebitControlReceivedTrip): number {
  if (trip.totalVendorValue != null) return trip.totalVendorValue;
  return trip.supplierRate;
}

export function formatInr(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number.isFinite(amount) ? amount : 0);
}

export function tripMatchesReceivedSearch(
  trip: DebitControlReceivedTrip,
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    trip.displayId,
    trip.from,
    trip.to,
    trip.clientName,
    trip.clientHub,
    trip.vendorName,
    trip.vehicleType,
    trip.vehicleNumber,
    trip.indentType,
    trip.clientInvoiceNumber,
    trip.remarks,
    ...trip.lrNumbers,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
}

type ValidationPayload = {
  v?: number;
  remarks?: string | null;
  client_invoice_number?: string | null;
  total_client_value?: number | null;
  total_vendor_value?: number | null;
  client?: Partial<PodChargeLines> | null;
  vendor?: Partial<PodChargeLines> | null;
  trip_start_date?: string | null;
  delivery_date?: string | null;
  dispatch_date?: string | null;
};

function readLines(raw: Partial<PodChargeLines> | null | undefined): PodChargeLines | null {
  if (!raw || typeof raw !== "object") return null;
  const lines = { ...EMPTY_CHARGE_LINES };
  for (const field of CHARGE_FIELDS) {
    const value = Number(raw[field.key]);
    lines[field.key] = Number.isFinite(value) && value > 0 ? value : 0;
  }
  return lines;
}

export function readPodValidationPayload(payload: unknown): {
  remarks: string | null;
  clientInvoiceNumber: string | null;
  totalClientValue: number;
  totalVendorValue: number;
  clientCharges: PodChargeLines;
  vendorCharges: PodChargeLines;
  tripStartDate: string | null;
  deliveryDate: string | null;
  dispatchDate: string | null;
} | null {
  if (!payload || typeof payload !== "object") return null;
  const row = payload as ValidationPayload;
  const clientCharges = readLines(row.client);
  const vendorCharges = readLines(row.vendor);
  if (!clientCharges || !vendorCharges) return null;
  return {
    remarks: String(row.remarks ?? "").trim() || null,
    clientInvoiceNumber: String(row.client_invoice_number ?? "").trim() || null,
    totalClientValue: netChargeTotal(clientCharges),
    totalVendorValue: netChargeTotal(vendorCharges),
    clientCharges,
    vendorCharges,
    tripStartDate: isoOrNull(row.trip_start_date),
    deliveryDate: isoOrNull(row.delivery_date),
    dispatchDate: isoOrNull(row.dispatch_date),
  };
}

function isoOrNull(value: unknown): string | null {
  const day = String(value ?? "").trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
}
