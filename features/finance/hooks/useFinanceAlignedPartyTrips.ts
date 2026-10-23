import { useMemo } from "react";
import { aggregateCustomersFromRpc } from "@/features/finance/aggregation/aggregateCustomersFromRpc";
import { allocateAmountsToLargestDueTrips } from "@/features/finance/utils/allocateToLargestDue";
import { useCustomerLedgerInputsQuery, useSupplierLedgerAggregationQuery } from "@/lib/queries/useLedgerAggregationQuery";
import type { TripRow } from "@/features/trips/services/trips.service";

/**
 * Finance-aligned client totals. Trip rows come from the scoped party-page
 * catalog — never `useTripsQuery` (full org). The org-wide ledger RPC is
 * deferred until that catalog is hydrated so it does not starve first paint.
 */
export function useFinanceAlignedClientLedger(
  orgId: string | null,
  clientId: string | null,
  catalogTrips: readonly TripRow[] = [],
  catalogReady = catalogTrips.length > 0,
) {
  const { data: inputs, isSuccess } = useCustomerLedgerInputsQuery(
    orgId && clientId && catalogReady ? orgId : null,
    true,
  );

  return useMemo(() => {
    if (!isSuccess || !inputs || !clientId) {
      return {
        ready: false as const,
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
    const clientKey = clientId.trim().toLowerCase();
    const tripInputs = inputs.trip_inputs.filter(
      (row) => row.client_id.trim().toLowerCase() === clientKey,
    );
    const unlinked = inputs.unlinked_payments.filter(
      (row) => row.client_id.trim().toLowerCase() === clientKey,
    );
    const { rows } = aggregateCustomersFromRpc(
      [{ id: clientId, name: "" }],
      {
        ...inputs,
        trip_inputs: tripInputs,
        unlinked_payments: unlinked,
        ledger_only_parties: [],
      },
    );
    const summary = rows[0];
    const byId = new Map(catalogTrips.map((trip) => [trip.id, trip]));
    const trips = tripInputs
      .map((row) => byId.get(row.trip_id))
      .filter((trip): trip is TripRow => Boolean(trip));
    const allocated = allocateAmountsToLargestDueTrips(
      tripInputs.map((row) => ({
        tripId: row.trip_id,
        sales: row.sales,
        paid: row.initial_paid,
      })),
      unlinked.map((row) => row.amount_in),
    );
    const salesByTripId: Record<string, number> = {};
    for (const row of tripInputs) salesByTripId[row.trip_id] = row.sales;
    return {
      ready: true as const,
      trips,
      tripIds: tripInputs.map((row) => row.trip_id),
      tripCount: summary?.trips ?? tripInputs.length,
      billed: summary?.billed ?? 0,
      received: summary?.received ?? 0,
      pending: summary?.pending ?? 0,
      salesByTripId,
      paidByTripId: allocated,
    };
  }, [isSuccess, inputs, catalogTrips, clientId]);
}

/**
 * Finance-aligned supplier totals. Same rule: scoped catalog only, no
 * org-wide trip / as-client / supplier list fetches on the party page.
 */
export function useFinanceAlignedSupplierLedger(
  orgId: string | null,
  supplierId: string | null,
  catalogTrips: readonly TripRow[] = [],
  catalogReady = catalogTrips.length > 0,
) {
  const { data: rpcRows = [], isSuccess } = useSupplierLedgerAggregationQuery(
    orgId && supplierId && catalogReady ? orgId : null,
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
