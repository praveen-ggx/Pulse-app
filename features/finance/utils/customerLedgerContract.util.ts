import type { CustomerLedgerInputs } from "@/features/finance/services/ledgerAggregationRpc.service";
import { aggregateCustomersFromRpc } from "@/features/finance/aggregation/aggregateCustomersFromRpc";
import { allocateAmountsToLargestDueTrips } from "@/features/finance/utils/allocateToLargestDue";

/** Keep in sync with useFinanceCustomerLedgerInputs. */
export const CUSTOMER_LEDGER_APPLY_ADJUSTMENTS = true;

export type CustomerLedgerLoadState = "pending" | "success" | "error";

export function customerLedgerLoadState(query: {
  isPending: boolean;
  isSuccess: boolean;
  isError: boolean;
}): CustomerLedgerLoadState {
  if (query.isSuccess) return "success";
  if (query.isError) return "error";
  return "pending";
}

export function formatCustomerLedgerFigure(
  amount: number | undefined,
  state: CustomerLedgerLoadState,
): string {
  if (state !== "success" || amount == null) return "—";
  return `₹${amount.toLocaleString("en-IN")}`;
}

export function shouldPublishCustomerTabTotals(
  state: CustomerLedgerLoadState,
): boolean {
  return state === "success";
}

export function filterCustomerRowsByDue<
  T extends { pending?: number },
>(
  rows: readonly T[],
  entityFilter: string,
  state: CustomerLedgerLoadState,
): T[] {
  if (state !== "success") return [...rows];
  if (entityFilter === "has_due") return rows.filter((row) => (row.pending ?? 0) > 0);
  if (entityFilter === "no_due") return rows.filter((row) => (row.pending ?? 0) === 0);
  return [...rows];
}

export function emptyCustomerLedgerInputs(): CustomerLedgerInputs {
  return {
    trip_inputs: [],
    unlinked_payments: [],
    ledger_only_parties: [],
    client_ledger_totals: [],
  };
}

export function sliceCustomerLedgerInputs(
  inputs: CustomerLedgerInputs,
  clientId: string,
): CustomerLedgerInputs {
  const clientKey = clientId.trim().toLowerCase();
  return {
    ...inputs,
    trip_inputs: inputs.trip_inputs.filter(
      (row) => row.client_id.trim().toLowerCase() === clientKey,
    ),
    unlinked_payments: inputs.unlinked_payments.filter(
      (row) => row.client_id.trim().toLowerCase() === clientKey,
    ),
    ledger_only_parties: [],
  };
}

export function deriveCustomerPartyLedger(
  clientId: string,
  inputs: CustomerLedgerInputs,
  catalogTrips: readonly { id: string }[] = [],
) {
  const scoped = sliceCustomerLedgerInputs(inputs, clientId);
  const { rows } = aggregateCustomersFromRpc([{ id: clientId, name: "" }], scoped);
  const summary = rows[0];
  const byId = new Map(catalogTrips.map((trip) => [trip.id, trip]));
  const trips = scoped.trip_inputs
    .map((row) => byId.get(row.trip_id))
    .filter((trip): trip is { id: string } => Boolean(trip));
  const allocated = allocateAmountsToLargestDueTrips(
    scoped.trip_inputs.map((row) => ({
      tripId: row.trip_id,
      sales: row.sales,
      paid: row.initial_paid,
    })),
    scoped.unlinked_payments.map((row) => row.amount_in),
  );
  const salesByTripId: Record<string, number> = {};
  for (const row of scoped.trip_inputs) salesByTripId[row.trip_id] = row.sales;
  return {
    billed: summary?.billed ?? 0,
    received: summary?.received ?? 0,
    pending: summary?.pending ?? 0,
    tripCount: summary?.trips ?? scoped.trip_inputs.length,
    tripIds: scoped.trip_inputs.map((row) => row.trip_id),
    trips,
    salesByTripId,
    paidByTripId: allocated,
  };
}
