import type { TripRow } from "@/features/trips/services/trips.service";
import { isDcoOperatingTrip } from "@/features/trips/domain/tripDcoOperating";

export type TripExecutionModel = "asset" | "aggregate";

function normalizePayoutMode(mode: TripRow["trip_payout_mode"]): string {
  return String(mode ?? "")
    .trim()
    .toLowerCase();
}

/**
 * Canonical execution model for trip accounting and UX branching.
 * This is the single source of truth for asset vs aggregate **fleet** behavior.
 *
 * DCO trips (`operating_mode = 'DCO'`) may still resolve to `"asset"` or
 * `"aggregate"` here (e.g. DCO-4 stamps trip_payout_mode = 'market'). Callers
 * that own expenses, vehicle P&L, commission, or settlement MUST check
 * {@link isDcoOperatingTrip} first and apply DCO overrides. Do not treat DCO as
 * organisation Asset economics or supplier Aggregate economics.
 */
export function getTripExecutionModel(trip: TripRow): TripExecutionModel {
  // Explicit, dispatcher-captured signal (Issue B) — highest priority.
  // Distinguishes a supplier's own-asset deploy from a third-party/outsourced
  // driver on a manual/Aggregate-assigned trip, which trip_payout_mode/source
  // alone cannot do (see the legacy heuristic below). NULL falls through to
  // that legacy heuristic unchanged — existing trips are never affected.
  const explicitExecutionType = String(trip.execution_type ?? "")
    .trim()
    .toUpperCase();
  if (explicitExecutionType === "ASSET") return "asset";
  if (explicitExecutionType === "AGGREGATE") return "aggregate";

  // A mover's own execution trip (created when a mover deploys an awarded load
  // with its own driver + vehicle) is ALWAYS asset — the mover pays its driver
  // and books truck expenses on it. Force asset here so its finance UI (driver
  // payout + fuel/toll) can never fall back to the supplier/aggregate layout,
  // regardless of how trip_payout_mode was persisted.
  if (String(trip.source ?? "").trim().toLowerCase() === "mover_asset") {
    return "asset";
  }
  const payoutMode = normalizePayoutMode(trip.trip_payout_mode);
  if (payoutMode === "asset") return "asset";
  if (payoutMode === "market") return "aggregate";
  /**
   * Unset mode. `supplier_id` alone cannot decide this in general — but the
   * two real scenarios that reach here are distinguished by `trip.source`:
   *
   *   source = 'direct_quote', own driver + own vehicle:
   *     supplier_id is bookkeeping only (the shipper's supplier row for the
   *     winning bidder) and is present on BOTH models. create_trip_from_direct_quote
   *     does not stamp trip_payout_mode, so without this check every
   *     first-supplier asset deploy rendered the aggregate trip-detail UI
   *     (no Expense Hub, no driver payout). -> asset
   *
   *   anything else with a supplier_id (e.g. a manually-created trip handed
   *   to a subcontractor):
   *     supplier_id means the load was handed to a sub-supplier. Assigning
   *     that sub-supplier's own driver/vehicle for tracking does not change
   *     who the financial counterparty is. -> aggregate
   *
   * These two rules previously conflicted (the direct-quote fix was applied
   * unconditionally instead of scoped to source = 'direct_quote'), which
   * silently reclassified subcontractor-driver-assign trips as asset. Keep
   * the source check when touching this — that's the one thing distinguishing
   * the two cases.
   */
  const isDirectQuoteDeploy = String(trip.source ?? "").trim().toLowerCase() === "direct_quote";
  const hasOwnDriver = String(trip.driver_id ?? "").trim().length > 0;
  const hasOwnVehicle = String(trip.vehicle_id ?? "").trim().length > 0;
  if (isDirectQuoteDeploy && hasOwnDriver && hasOwnVehicle) return "asset";
  if (String(trip.supplier_id ?? "").trim()) return "aggregate";
  return "asset";
}

export function isAssetExecutionTrip(trip: TripRow): boolean {
  return getTripExecutionModel(trip) === "asset";
}

export function isAggregateExecutionTrip(trip: TripRow): boolean {
  return getTripExecutionModel(trip) === "aggregate";
}

/**
 * Awarded carrier on a shipper-owned trip (not the trip owner).
 * The shipper still books this as aggregate/supplier; the carrier must not.
 */
export function isPartnerAwardedSupplierView(
  trip: Pick<TripRow, "organization_id" | "supplier_id">,
  viewerOrgId?: string | null,
): boolean {
  const viewer = String(viewerOrgId ?? "").trim();
  const owner = String(trip.organization_id ?? "").trim();
  const hasSupplier = String(trip.supplier_id ?? "").trim().length > 0;
  if (!viewer || !hasSupplier) return false;
  if (owner && viewer === owner) return false;
  return true;
}

/**
 * Carrier assigned its own roster driver on the shipper trip.
 * Shipper classification stays aggregate (`getTripExecutionModel`); the
 * carrier's finance/UX must follow asset (driver cost, not self-as-supplier).
 */
export function isPartnerOwnRosterHaul(
  trip: Pick<TripRow, "organization_id" | "supplier_id" | "driver_id">,
  viewerOrgId?: string | null,
): boolean {
  if (!isPartnerAwardedSupplierView(trip, viewerOrgId)) return false;
  return String(trip.driver_id ?? "").trim().length > 0;
}

/** Asset finance for this viewer — includes partner own-roster haul. */
export function isAssetFinanceForViewer(
  trip: TripRow,
  viewerOrgId?: string | null,
): boolean {
  if (isDcoOperatingTrip(trip)) return false;
  if (isAssetExecutionTrip(trip)) return true;
  return isPartnerOwnRosterHaul(trip, viewerOrgId);
}

/**
 * Expense Hub is reachable for asset execution, and for DCO / Commerce
 * multi-order trips that already have a vehicle (fuel/toll book on this trip).
 */
export function shouldShowTripExpenseHub(trip: TripRow): boolean {
  if (isAssetExecutionTrip(trip)) return true;
  const hasVehicle = String(trip.vehicle_id ?? "").trim().length > 0;
  if (!hasVehicle) return false;
  if (isDcoOperatingTrip(trip)) return true;
  if (trip.is_commerce) return true;
  return false;
}
