import type { TripRow } from "@/features/trips/services/trips.service";
import type { TripMoneySnapshot } from "@/lib/alertRegistry/paymentAmountFormat.util";
import { queryKeys } from "@/lib/queryKeys";
import { useCachedQueryRows } from "@/lib/queries/useCachedQueryRows";
import { useMemo } from "react";

function snapshot(trip: TripRow): TripMoneySnapshot {
  return {
    clientTotal: Number(trip.client_price) || 0,
    clientPaid: Number(trip.amount_paid) || 0,
    supplierTotal: Number(trip.supplier_rate) || 0,
    supplierPaid: Number(trip.advance_paid) || 0,
  };
}

function worth(money: TripMoneySnapshot): number {
  return money.clientTotal + money.supplierTotal;
}

/** Trip totals already in the trips cache. No extra fetch. */
export function useTripMoneyById(orgId: string | null): Map<string, TripMoneySnapshot> {
  const finite = useCachedQueryRows<TripRow>(queryKeys.trips.finite(orgId ?? ""));
  const complete = useCachedQueryRows<TripRow>(queryKeys.trips.complete(orgId ?? ""));
  return useMemo(() => {
    const map = new Map<string, TripMoneySnapshot>();
    for (const trip of [...finite, ...complete]) {
      const next = snapshot(trip);
      const prev = map.get(trip.id);
      if (!prev || worth(prev) === 0) map.set(trip.id, next);
    }
    return map;
  }, [finite, complete]);
}
