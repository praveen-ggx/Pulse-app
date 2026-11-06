/**
 * Map client contract lanes → trip / indent form prefill.
 */
import type { ClientLaneRate } from "@/features/clients/types/clientManagement.types";
import { formatINR } from "@/lib/format";
import { formatCityStateLabel } from "@/lib/placeCityState.util";
import {
  formatSaleAmount,
  type SaleRateBasis,
} from "@/features/clients/utils/saleRateSnapshot.util";

export type ClientLanePrefill = {
  pickup: string;
  drop: string;
  vehicleType: string | null;
  /** Default load/commodity type from the lane, if set. */
  loadType: string | null;
  /** Default load weight in TONS (as a form-ready string), if set. */
  tons: string | null;
  /** Digits-only amount string for form fields (no ₹ / commas). */
  clientPrice: string | null;
  originWarehouseId: string | null;
  agreementId: string | null;
  laneId: string;
  saleRateBasis: SaleRateBasis;
  saleUnitRate: number | null;
};

function todayISO(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function isLaneCurrentlyValid(
  lane: ClientLaneRate,
  onDate = todayISO(),
): boolean {
  if (lane.valid_from && lane.valid_from > onDate) return false;
  if (lane.valid_to && lane.valid_to < onDate) return false;
  return true;
}

function positive(n: number | null | undefined): number | null {
  return n != null && Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * How a lane's stored rate scales into a total sale amount.
 *
 * `per_ton` / `per_kg` are quoted per unit of WEIGHT — the stored rate must be
 * multiplied by the load before it is a trip price. `per_km` is quoted per unit
 * of DISTANCE. Everything else (`per_trip`, `fixed`, `spot`) is already a total.
 *
 * Keep the weight-based branch in sync with the `perTon` check in
 * ClientProfileScreen — both must agree on which rate types scale.
 */
type LaneRateBasis = "weight" | "distance" | "total";

export function laneRateBasis(lane: ClientLaneRate): LaneRateBasis {
  const type = lane.rate_type;
  if (type === "per_ton" || type === "per_kg") return "weight";
  if (type === "per_km") return "distance";
  const model = lane.pricing_model;
  if (model === "per_ton" || model === "per_mt_km") return "weight";
  if (model === "per_km") return "distance";
  // per_mt_rate with no flat trip rate is a weight quote even if rate_type
  // was left at the form default (`per_trip`).
  if (positive(lane.per_mt_rate) != null && positive(lane.rate) == null && positive(lane.base_rate) == null) {
    return "weight";
  }
  return "total";
}

export function isWeightBasedLane(lane: ClientLaneRate): boolean {
  return laneRateBasis(lane) === "weight";
}

/** ₹ per metric ton for a weight lane. `per_kg` rates are scaled ×1000. */
export function laneUnitRatePerMt(lane: ClientLaneRate): number | null {
  if (laneRateBasis(lane) !== "weight") return null;
  const perMt = positive(lane.per_mt_rate);
  if (perMt != null) return perMt;
  const raw = positive(lane.rate) ?? positive(lane.base_rate);
  if (raw == null) return null;
  return lane.rate_type === "per_kg" ? raw * 1000 : raw;
}

/**
 * Quantity the stored rate is multiplied by. Weight lanes bill per TON, so a
 * `per_kg` rate is scaled to tonnes (×1000) to stay in the same unit as
 * `default_load_tons` — the only weight the lane carries.
 */
function laneMultiplier(lane: ClientLaneRate, basis: LaneRateBasis): number | null {
  if (basis === "weight") {
    const tons = positive(lane.default_load_tons);
    if (tons == null) return null;
    return lane.rate_type === "per_kg" ? tons * 1000 : tons;
  }
  if (basis === "distance") return positive(lane.distance_km);
  return 1;
}

/**
 * Total sale amount for a lane, scaled by weight or distance where the rate
 * type demands it. Returns null when no usable rate exists.
 *
 * A weight lane with no load returns null — never stamp ₹/MT as the trip total.
 */
export function resolveLaneSaleAmount(lane: ClientLaneRate): number | null {
  const basis = laneRateBasis(lane);
  const multiplier = laneMultiplier(lane, basis);

  if (basis === "weight") {
    const unit = laneUnitRatePerMt(lane);
    if (unit == null || multiplier == null) return null;
    return applyMinBilling(lane, unit * multiplier);
  }

  const unitRate =
    positive(lane.rate) ??
    positive(lane.base_rate) ??
    (basis === "distance" ? positive(lane.per_km_rate) : null);

  if (unitRate != null) {
    return applyMinBilling(lane, unitRate * (multiplier ?? 1));
  }

  // No flat rate: fall back to the composite per-MT / per-KM columns.
  const perMt = positive(lane.per_mt_rate);
  const perKm = positive(lane.per_km_rate);
  const tons = positive(lane.default_load_tons);
  const km = positive(lane.distance_km);

  const weightLeg = perMt != null && tons != null ? perMt * tons : null;
  const distanceLeg = perKm != null && km != null ? perKm * km : null;

  if (weightLeg != null || distanceLeg != null) {
    return applyMinBilling(lane, (weightLeg ?? 0) + (distanceLeg ?? 0));
  }
  return null;
}

/** Contracted floor price — a scaled amount below it still bills at the floor. */
function applyMinBilling(lane: ClientLaneRate, amount: number): number | null {
  if (amount <= 0) return null;
  const floor = positive(lane.min_billing);
  return floor != null && floor > amount ? floor : amount;
}

export function buildClientLanePrefill(lane: ClientLaneRate): ClientLanePrefill {
  const amount = resolveLaneSaleAmount(lane);
  // Destination label is the named destination (e.g. "Bangalore") — never let
  // destination_address (often a state/street) override it.
  const tons =
    lane.default_load_tons != null && Number.isFinite(lane.default_load_tons)
      ? String(lane.default_load_tons)
      : null;
  return {
    pickup: formatCityStateLabel(lane.origin_label) || lane.origin_label?.trim() || "",
    drop:
      formatCityStateLabel(lane.destination_label) ||
      lane.destination_label?.trim() ||
      lane.destination_address?.trim() ||
      "",
    vehicleType: lane.vehicle_type?.trim() || null,
    loadType: lane.default_load_type?.trim() || null,
    tons,
    clientPrice: formatSaleAmount(amount),
    originWarehouseId: lane.origin_warehouse_id,
    agreementId: lane.agreement_id,
    laneId: lane.id,
    saleRateBasis: isWeightBasedLane(lane) ? "per_mt" : "per_trip",
    saleUnitRate: laneUnitRatePerMt(lane),
  };
}

/**
 * Client price for a weight-based lane at a user-entered tonnage, for when the
 * load is changed after the lane was picked. Returns null when the lane is not
 * weight-based (nothing to recompute) or the tonnage is unusable — callers keep
 * the existing price in that case rather than clearing it.
 */
export function repriceLaneForTons(
  lane: ClientLaneRate,
  tonsInput: string | number | null | undefined,
): string | null {
  if (laneRateBasis(lane) !== "weight") return null;
  const tons =
    typeof tonsInput === "number"
      ? tonsInput
      : parseFloat(String(tonsInput ?? "").replace(/,/g, ""));
  if (!Number.isFinite(tons) || tons <= 0) return null;
  const amount = resolveLaneSaleAmount({ ...lane, default_load_tons: tons });
  return amount != null ? formatSaleAmount(amount) || null : null;
}

export function lanePrimaryRateLabel(lane: ClientLaneRate): string {
  const type = lane.rate_type?.replace(/_/g, " ") ?? "rate";
  // Show the stored UNIT rate here — pairing the weight-scaled total with a
  // "per ton" suffix would read as a far higher per-ton price than contracted.
  const unit = laneUnitRatePerMt(lane) ?? positive(lane.rate) ?? positive(lane.base_rate);
  if (unit != null) return `${formatINR(unit)} · ${type}`;
  const amount = resolveLaneSaleAmount(lane);
  if (amount == null) return "Rate TBD";
  return `${formatINR(amount)} · ${type}`;
}

/**
 * Human-readable breakdown of how the sale amount was derived, e.g.
 * "₹3,140 × 30 t = ₹94,200". Null when the rate needs no scaling.
 */
export function laneSaleBreakdownLabel(lane: ClientLaneRate): string | null {
  const basis = laneRateBasis(lane);
  if (basis === "total") return null;
  const multiplier = laneMultiplier(lane, basis);
  const unit = laneUnitRatePerMt(lane) ?? positive(lane.rate) ?? positive(lane.base_rate);
  const total = resolveLaneSaleAmount(lane);
  if (multiplier == null || unit == null || total == null) return null;
  const suffix = basis === "distance" ? "km" : lane.rate_type === "per_kg" ? "kg" : "t";
  return `${formatINR(unit)} × ${multiplier}${suffix} = ${formatINR(total)}`;
}

export function laneValidityLabel(lane: ClientLaneRate): string {
  if (!lane.valid_from && !lane.valid_to) return "Open validity";
  return `${lane.valid_from ?? "—"} → ${lane.valid_to ?? "open"}`;
}

export function filterClientLanes(
  lanes: readonly ClientLaneRate[],
  query: string,
): ClientLaneRate[] {
  const q = query.trim().toLowerCase();
  const sorted = [...lanes].sort((a, b) => {
    const av = isLaneCurrentlyValid(a) ? 0 : 1;
    const bv = isLaneCurrentlyValid(b) ? 0 : 1;
    if (av !== bv) return av - bv;
    return (a.origin_label + a.destination_label).localeCompare(
      b.origin_label + b.destination_label,
    );
  });
  if (!q) return sorted;
  return sorted.filter((lane) => {
    const hay = [
      lane.origin_label,
      lane.destination_label,
      lane.destination_address,
      lane.vehicle_type,
      lane.warehouse_zone,
      lane.rate != null ? String(lane.rate) : "",
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  });
}
