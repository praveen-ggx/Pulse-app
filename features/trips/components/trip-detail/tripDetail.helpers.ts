/**
 * Pure helpers for TripDetailScreen (finance adjustment classification, provision
 * labels, location parsing, distance estimation). Extracted verbatim — no behavior
 * change. Kept framework-free so they stay unit-testable and off the screen file.
 */
import {
  COST_REASON_OPTIONS,
  isAdjustmentVoided,
  type TripAdjustment,
  type TripAdjustmentImpact,
  type TripAdjustmentType,
} from "../../services/tripAdjustments";

/** Minimal ledger shape for supplier party-name fallback (Finance Hub payable label). */
export type TripSupplierNameLedgerEntry = {
  contact_type?: string | null;
  party_name?: string | null;
  amount_out?: number | null;
};

function isUsableSupplierDisplayName(
  value: string | null | undefined,
  clientName?: string | null,
  viewerOrganizationName?: string | null,
): value is string {
  const v = (value ?? "").trim();
  if (!v || v === "—" || v === "-") return false;
  const lc = v.toLowerCase();
  if (
    lc === "supplier" ||
    lc === "partner" ||
    lc === "awaiting data" ||
    lc === "connected" ||
    lc === "aggregate supplier" ||
    lc === "asset / own vehicle" ||
    lc === "own vehicle"
  ) {
    return false;
  }
  const clientLc = (clientName ?? "").trim().toLowerCase();
  if (clientLc && lc === clientLc) return false;
  const viewerLc = (viewerOrganizationName ?? "").trim().toLowerCase();
  if (viewerLc && lc === viewerLc) return false;
  return true;
}

/**
 * Resolve supplier display name for Finance Hub / Journey Log.
 * Prefer trip/party fields, then supplier ledger `party_name` (same idea as
 * Trips Hub + TripDetailFinanceView) so payable does not show "Awaiting data"
 * after a supplier payout was already recorded.
 */
export function resolveTripSupplierDisplayName(opts: {
  partnerName?: string | null;
  supplierPartyName?: string | null;
  tripSupplierName?: string | null;
  /** Linked org profile name (e.g. from get_connection_partner_display). */
  linkedOrganizationName?: string | null;
  clientName?: string | null;
  /** When the viewer is the awarded carrier, reject their own org name. */
  viewerOrganizationName?: string | null;
  ledgerEntries?: TripSupplierNameLedgerEntry[] | null;
}): string | null {
  const clientName = opts.clientName ?? null;
  const viewerOrganizationName = opts.viewerOrganizationName ?? null;
  for (const candidate of [
    opts.partnerName,
    opts.supplierPartyName,
    opts.tripSupplierName,
    opts.linkedOrganizationName,
  ]) {
    if (isUsableSupplierDisplayName(candidate, clientName, viewerOrganizationName)) {
      return candidate.trim();
    }
  }
  for (const tx of opts.ledgerEntries ?? []) {
    if (tx.contact_type !== "supplier") continue;
    if (isUsableSupplierDisplayName(tx.party_name, clientName, viewerOrganizationName)) {
      return String(tx.party_name).trim();
    }
  }
  return null;
}

/** Revenue additions + supplier credits (cost −) improve simplified net. */
export function adjustmentsCountingAsIncome(
  adjustments: TripAdjustment[] | null | undefined,
) {
  return (Array.isArray(adjustments) ? adjustments : []).filter(
    (a) =>
      !isAdjustmentVoided(a) &&
      ((a.type === "revenue" && a.impact === "plus") ||
        (a.type === "cost" && a.impact === "minus")),
  );
}

/** Revenue deductions + supplier add-ons (cost +) reduce simplified net. */
export function adjustmentsCountingAsDeductions(
  adjustments: TripAdjustment[] | null | undefined,
) {
  return (Array.isArray(adjustments) ? adjustments : []).filter(
    (a) =>
      !isAdjustmentVoided(a) &&
      ((a.type === "revenue" && a.impact === "minus") ||
        (a.type === "cost" && a.impact === "plus")),
  );
}

export const FINANCE_PROTOCOL_CHIPS = [
  "Loading",
  "Unloading",
  "Detention",
  "Damage",
  "Toll",
  "RTO",
] as const;

/** Labels for embedded provision rows (aligned with adjustment registry copy). */
export function provisionLineMetaLabel(adj: TripAdjustment): string {
  if (adj.type === "revenue") {
    return adj.impact === "plus" ? "SALE · ADD-ON" : "SALE · DEDUCTION";
  }
  return adj.impact === "plus" ? "COST · ADD-ON" : "COST · DEDUCTION";
}

export function protocolSupplierChipAdjustment(
  chip: (typeof FINANCE_PROTOCOL_CHIPS)[number],
): {
  type: TripAdjustmentType;
  impact: TripAdjustmentImpact;
  reasonSeed: string;
} {
  if (chip === "Loading")
    return { type: "cost", impact: "plus", reasonSeed: "Loading Charges" };
  if (chip === "Unloading")
    return { type: "cost", impact: "plus", reasonSeed: "Unloading Charges" };
  if (chip === "Detention")
    return { type: "cost", impact: "plus", reasonSeed: "Detention" };
  if (chip === "Damage")
    return { type: "cost", impact: "plus", reasonSeed: "Damages / Missing" };
  if (chip === "Toll")
    return { type: "cost", impact: "plus", reasonSeed: "Pass Debit" };
  return { type: "cost", impact: "plus", reasonSeed: "Other" };
}

export function getInlineReasonOptions(
  type: TripAdjustmentType,
  impact: TripAdjustmentImpact,
): readonly string[] {
  if (type === "revenue" && impact === "plus") {
    return ["Loading Charges", "Unloading Charges", "Other"];
  }
  if (type === "revenue" && impact === "minus") {
    return ["Late Delivery", "Damages / Missing", "Other"];
  }
  if (type === "cost" && impact === "plus") {
    return COST_REASON_OPTIONS;
  }
  return ["Damages / Missing", "Other"];
}

export function splitLocationPrimarySecondary(
  location: string | null | undefined,
): {
  primary: string;
  secondary: string | null;
} {
  const raw = (location ?? "").trim();
  if (!raw) return { primary: "—", secondary: null };
  const commaIndex = raw.indexOf(",");
  if (commaIndex === -1) return { primary: raw, secondary: null };
  const primary = raw.slice(0, commaIndex).trim() || raw;
  const secondary = raw.slice(commaIndex + 1).trim() || null;
  return { primary, secondary };
}

/** Straight-line km between coordinates; ~×1.3 used as rough road distance when DB/map omit km. */
export function haversineKmBetween(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number | null {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  if (
    !Number.isFinite(a.latitude) ||
    !Number.isFinite(a.longitude) ||
    !Number.isFinite(b.latitude) ||
    !Number.isFinite(b.longitude)
  )
    return null;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  const km = R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return Number.isFinite(km) && km > 0 ? km : null;
}

const DISTANCE_CITY_COORDS: Record<string, [number, number]> = {
  mumbai: [19.076, 72.8777],
  delhi: [28.6139, 77.209],
  bangalore: [12.9716, 77.5946],
  bengaluru: [12.9716, 77.5946],
  chennai: [13.0827, 80.2707],
  kolkata: [22.5726, 88.3639],
  hyderabad: [17.385, 78.4867],
  ahmedabad: [23.0225, 72.5714],
  pune: [18.5204, 73.8567],
  shimla: [31.1048, 77.1734],
};

export function inferCoordsFromLocationName(
  location: string | null | undefined,
): { latitude: number; longitude: number } | null {
  const raw = (location ?? "").trim().toLowerCase();
  if (!raw) return null;
  const firstPart = raw.split(",")[0]?.trim() ?? raw;
  const direct = DISTANCE_CITY_COORDS[firstPart];
  if (direct) return { latitude: direct[0], longitude: direct[1] };
  for (const [city, coords] of Object.entries(DISTANCE_CITY_COORDS)) {
    if (firstPart.includes(city) || raw.includes(city)) {
      return { latitude: coords[0], longitude: coords[1] };
    }
  }
  return null;
}
