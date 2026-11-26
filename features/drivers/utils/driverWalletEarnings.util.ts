import type { TripRow } from "@/features/trips/services/trips.service";
import {
  offlineTripAmount,
  parseDcoPartyTagFromNotes,
} from "@/features/drivers/utils/dcoTripPartyTag.util";
import { driverHistoryLane } from "@/features/drivers/domain/driverOperatingMode";
import {
  tripEarningsDetailForDriver,
  tripEarningsForDriver,
  type DriverTripPayoutTerms,
} from "@/features/drivers/utils/driverUtils.util";

export type DriverWalletEarningsContext = {
  /** The driver's connected fleet dispatched this trip. */
  isFleetDispatched: boolean;
  /** Real agreed payout terms exist for this trip's driver and org. */
  hasAgreedPayoutTerms: boolean;
  payoutTerms?: DriverTripPayoutTerms | null;
  /** Orgs the driver works for. Scopes earnings so a broker's copy earns nothing. */
  driverOrgIds: readonly string[];
  /**
   * Amount captured for this trip. When given, the driver's own offline trip
   * earns what the driver typed at tagging or what was captured (whichever is
   * more) — never a calculated figure. Same rule as the Receivables screen.
   */
  received?: number;
};

/**
 * The amount shown as the driver's earnings for one trip on the Wallet Earnings tab.
 *
 * - Fleet trip: the agreed payout only, and ₹0 without agreed terms (unchanged).
 * - Any other trip: the billed amount the driver tagged on their own trip; otherwise
 *   the guarded earnings figure (DCO `supplier_rate`, an explicit `driver_commission`,
 *   or agreed terms), with `driverOrgIds` applied.
 *
 * Never the trip's `client_price`. That is the shipper's (or a broker's client's)
 * price, not the driver's pay. The broker's money row of an awarded load
 * (docs/TRIP_VARIANTS.md §4) also carries the driver; `driverOrgIds` keeps it at ₹0.
 */
export function driverWalletTripEarnings(
  trip: TripRow,
  ctx: DriverWalletEarningsContext,
): number {
  if (ctx.isFleetDispatched) {
    return ctx.hasAgreedPayoutTerms
      ? tripEarningsForDriver(trip, ctx.payoutTerms ?? undefined, ctx.driverOrgIds)
      : 0;
  }
  if (ctx.received != null && driverHistoryLane(trip, false) === "offline") {
    return offlineTripAmount(trip.notes, ctx.received, [
      tripEarningsDetailForDriver(trip).amount,
      Number(trip.client_price ?? 0),
    ]);
  }
  const tagged = parseDcoPartyTagFromNotes(trip.notes)?.billed;
  if (tagged != null && tagged > 0) return Math.round(tagged);
  // tripEarningsForDriver returns 0 for the estimated basis, which is the only
  // path that reads client_price directly.
  return tripEarningsForDriver(trip, ctx.payoutTerms ?? undefined, ctx.driverOrgIds);
}
