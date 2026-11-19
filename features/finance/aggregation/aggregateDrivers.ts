/**
 * O(n) driver aggregation. due = from trips (commission); paid = from ledger only (amount_out).
 * Commission: see computeDriverCommissionForTrip — saved trip amount first, else
 * commission % + per km from the agreed terms. No agreed terms → 0, never a guess.
 */
import type { FinancialRowData, AggregationTotals } from './types';
import type { LedgerTx, TripForDriver, DriverLike, DriverOfferForAggregation, TripPartyMap } from './types';
import { isDcoOperatingTrip } from '@/features/trips/domain/tripDcoOperating';
import { isDriverLedgerContactType } from '@/features/finance/domain/financeCounterpartyLane';
import {
  tripEarningsForDriver,
  type TripWithSupplier,
} from '@/features/drivers/utils/driverUtils.util';

/**
 * Driver pay for one trip, as the FLEET sees it — the SAME rule as the driver
 * app (tripEarningsForDriver), so both sides always show the same number:
 * 1) the amount already saved on the trip (driver_commission) — old trips
 *    never change when the driver's terms change later;
 * 2) else agreed commission % of the trip amount + agreed per-km × km (added);
 * 3) no agreed terms and nothing saved → 0 (never a guess).
 * DCO trips are settled with the DCO, not as employee pay → 0 here.
 * Monthly salary is separate (not per trip).
 */
export function computeDriverCommissionForTrip(
  trip: Omit<TripForDriver, 'distance'> & { distance?: string | number | null },
  offer: DriverOfferForAggregation | null | undefined
): number {
  if (isDcoOperatingTrip(trip)) return 0;
  return tripEarningsForDriver(trip as TripWithSupplier, offer ?? null);
}

export function aggregateDrivers(
  drivers: readonly DriverLike[],
  trips: readonly TripForDriver[],
  transactions: readonly LedgerTx[],
  offersByDriverId?: Record<string, DriverOfferForAggregation> | null,
  _tripPartyMap?: TripPartyMap | null
): { rows: FinancialRowData[]; totals: AggregationTotals } {
  const dueFromTrips: Record<string, number> = {};
  const paidFromLedger: Record<string, number> = {};
  const tripCountByDriver: Record<string, number> = {};
  const offers = offersByDriverId ?? {};

  const driverIds = new Set<string>();
  for (let i = 0; i < drivers.length; i++) {
    const id = drivers[i].id;
    driverIds.add(id);
    dueFromTrips[id] = 0;
    paidFromLedger[id] = 0;
    tripCountByDriver[id] = 0;
  }

  // Trips whose driver_id isn't in the loaded `drivers` list (e.g. removed/reassigned driver) —
  // tracked so a row can still be synthesized for them below instead of the commission being
  // computed into dueFromTrips and then never read by the row-building loop, which only reads
  // dueFromTrips for ids already in `drivers`.
  const unresolvedDriverIds = new Set<string>();

  for (let i = 0; i < trips.length; i++) {
    const t = trips[i];
    if (!t.driver_id) continue;
    // DCO settlement is dco_payee / contact_type=dco — never Finance → Drivers.
    if (isDcoOperatingTrip(t)) continue;
    if (!driverIds.has(t.driver_id)) unresolvedDriverIds.add(t.driver_id);
    const offer = offers[t.driver_id] ?? null;
    const commission = computeDriverCommissionForTrip(t, offer);
    dueFromTrips[t.driver_id] = (dueFromTrips[t.driver_id] ?? 0) + commission;
    tripCountByDriver[t.driver_id] = (tripCountByDriver[t.driver_id] ?? 0) + 1;
  }

  for (let i = 0; i < transactions.length; i++) {
    const tx = transactions[i];
    const amtOut = Number(tx.amount_out ?? 0);
    if (!amtOut) continue;

    if (isDriverLedgerContactType(tx.contact_type) && tx.contact_id) {
      paidFromLedger[tx.contact_id] =
        (paidFromLedger[tx.contact_id] ?? 0) + amtOut;
      continue;
    }

    // Intentionally do not infer driver payments from generic trip-linked cash-out rows.
    // Only explicit driver-linked ledger rows (contact_type=driver) should reduce due,
    // otherwise supplier/vehicle/other expenses can incorrectly zero-out driver pending.
  }

  const rows: FinancialRowData[] = [];
  let totalIn = 0;
  let totalOut = 0;

  for (let i = 0; i < drivers.length; i++) {
    const d = drivers[i];
    const id = d.id;
    const due = dueFromTrips[id] ?? 0;
    const paid = paidFromLedger[id] ?? 0;
    const pending = Math.max(0, due - paid);
    totalIn += paid + pending;
    totalOut += pending;
    const leftAt = d.left_at ?? null;
    const isDisconnected = leftAt != null && leftAt !== '';
    const isIntegrated =
      !isDisconnected &&
      (d.tracking_only !== true) &&
      d.user_id != null &&
      d.user_id !== '';
    const leftAtFormatted =
      leftAt != null && leftAt !== ''
        ? (() => {
            try {
              const date = new Date(leftAt);
              return isNaN(date.getTime()) ? leftAt : date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
            } catch {
              return leftAt;
            }
          })()
        : null;
    const displayName = d.name ?? (d as { full_name?: string | null }).full_name ?? undefined;
    const rawAvatar = (d.avatar_url ?? "").trim();
    const rawSeed = (d.avatar_seed ?? "").trim();
    rows.push({
      id,
      name: displayName ?? undefined,
      subline: leftAtFormatted ? `Disconnected · Left on ${leftAtFormatted}` : (d.status ?? undefined),
      status: isDisconnected ? 'DISCONNECTED' : (d.status ?? 'offline'),
      trips: tripCountByDriver[id] ?? 0,
      paid,
      pending,
      due,
      is_integrated: isIntegrated,
      left_at: leftAt ?? undefined,
      profileImageUrl: rawAvatar || undefined,
      avatarSeed: rawSeed || undefined,
    });
  }

  // Trips whose driver_id fell outside the loaded `drivers` list — synthesized here so their
  // commission still shows up somewhere, instead of being computed and never emitted.
  for (const id of unresolvedDriverIds) {
    const due = dueFromTrips[id] ?? 0;
    const paid = paidFromLedger[id] ?? 0;
    const pending = Math.max(0, due - paid);
    totalIn += paid + pending;
    totalOut += pending;
    rows.push({
      id,
      name: 'Unknown Driver',
      subline: 'UNLINKED',
      status: 'offline',
      trips: tripCountByDriver[id] ?? 0,
      paid,
      pending,
      due,
      is_integrated: false,
    });
  }

  return {
    rows,
    totals: { totalIn, totalOut },
  };
}
