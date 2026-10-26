import { useMemo } from "react";
import {
  customerLedgerLoadState,
  deriveCustomerPartyLedger,
} from "@/features/finance/utils/customerLedgerContract.util";
import { useFinanceCustomerLedgerInputs, useSupplierLedgerAggregationQuery } from "@/lib/queries/useLedgerAggregationQuery";
import type { TripRow } from "@/features/trips/services/trips.service";

/**
 * Finance-aligned client totals from the same org-wide customer ledger
 * query as the Customers list. Opening detail reuses the cached query key
 * and does not start a second contract.
 */
export function useFinanceAlignedClientLedger(
  orgId: string | null,
  clientId: string | null,
  catalogTrips: readonly TripRow[] = [],
  _catalogReady?: boolean,
) {
  const query = useFinanceCustomerLedgerInputs(
    orgId && clientId ? orgId : null,
  );
  const { data: inputs, isSuccess, refetch } = query;
  const loadState = customerLedgerLoadState(query);

  return useMemo(() => {
    if (!isSuccess || !inputs || !clientId) {
      return {
        ready: false as const,
        loadState,
        refetch,
        trips: [] as TripRow[],
        tripIds: [] as string[],
        tripCount: 0,
        billed: 0,
        received: 0,
        pending: 0,
        salesByTripId: {} as Record<string, number>,
        paidByTripId: {} as Record<string, number>,
      };
    }
    const derived = deriveCustomerPartyLedger(clientId, inputs, catalogTrips);
    return {
      ready: true as const,
      loadState,
      refetch,
      trips: derived.trips as TripRow[],
      tripIds: derived.tripIds,
      tripCount: derived.tripCount,
      billed: derived.billed,
      received: derived.received,
      pending: derived.pending,
      salesByTripId: derived.salesByTripId,
      paidByTripId: derived.paidByTripId,
    };
  }, [isSuccess, inputs, catalogTrips, clientId, loadState, refetch]);
}

/**
 * Finance-aligned supplier totals. Scoped catalog only; org-wide supplier
 * RPC stays on the Finance suppliers tab, not the party page.
 */
export function useFinanceAlignedSupplierLedger(
  orgId: string | null,
  supplierId: string | null,
  catalogTrips: readonly TripRow[] = [],
  _catalogReady?: boolean,
) {
  const { data: rpcRows = [], isSuccess } = useSupplierLedgerAggregationQuery(
    null,
    true,
  );

  return useMemo(() => {
    if (!isSuccess || !supplierId || !orgId) {
      return {
        ready: false as const,
        trips: [] as TripRow[],
        tripCount: 0,
        due: 0,
        paid: 0,
        unsettled: 0,
      };
    }
    const financials = rpcRows.find((row) => row.supplier_id === supplierId);
    return {
      ready: true as const,
      trips: catalogTrips as TripRow[],
      tripCount: financials?.trips_count ?? catalogTrips.length,
      due: financials?.due ?? 0,
      paid: financials?.paid ?? 0,
      unsettled: financials?.unsettled ?? 0,
    };
  }, [isSuccess, rpcRows, supplierId, orgId, catalogTrips]);
}
