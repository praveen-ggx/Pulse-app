/**
 * Server-side, unbounded ledger aggregation — replaces the client-side
 * aggregateDrivers/aggregateSuppliers/aggregateCustomers path, which silently
 * truncated at getTransactionsByOrganization's 400/500-row cap. See
 * get_driver_ledger_aggregation, get_supplier_ledger_aggregation, and
 * get_customer_ledger_inputs (supabase/migrations/2027031{3,4,5,7,8,9}0000_*.sql)
 * for the equivalence-tested SQL these call. Numeric columns come back from
 * PostgREST as strings (Postgres `numeric`); every field here is coerced to
 * number before returning.
 */
import {
  mergeCommerceProductSales,
  suppressCommercePlanFreight,
} from "@/features/finance/aggregation/commerceSelfFulfillment";
import { supabase } from "@/lib/supabase";

/** PostgREST `.in()` in the query string 400s past a few hundred UUIDs. */
const POSTGREST_IN_CHUNK = 40;

function chunkIds(ids: string[], size = POSTGREST_IN_CHUNK): string[][] {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += size) chunks.push(ids.slice(i, i + size));
  return chunks;
}

function n(v: unknown): number {
  const num = typeof v === "number" ? v : Number(v ?? 0);
  return Number.isFinite(num) ? num : 0;
}

export interface DriverLedgerAggregationRow {
  driver_id: string;
  trips_count: number;
  due: number;
  paid: number;
  pending: number;
}

export interface SupplierLedgerAggregationRow {
  supplier_id: string;
  trips_count: number;
  due: number;
  paid: number;
  unsettled: number;
}

export interface DcoLedgerAggregationRow {
  dco_payee_id: string;
  dco_user_id: string;
  trips_count: number;
  due: number;
  paid: number;
  outstanding: number;
}

export interface CustomerLedgerTripInput {
  client_id: string;
  trip_id: string;
  sales: number;
  initial_paid: number;
}

export interface CustomerLedgerUnlinkedPayment {
  client_id: string;
  transaction_id: string;
  amount_in: number;
}

export interface CustomerLedgerOnlyParty {
  party_name: string;
  received: number;
  pending: number;
}

export interface CustomerLedgerClientTotal {
  client_id: string;
  received: number;
  pending: number;
}

export interface CustomerLedgerInputs {
  trip_inputs: CustomerLedgerTripInput[];
  unlinked_payments: CustomerLedgerUnlinkedPayment[];
  ledger_only_parties: CustomerLedgerOnlyParty[];
  client_ledger_totals: CustomerLedgerClientTotal[];
}

export async function getDriverLedgerAggregation(
  orgId: string,
): Promise<DriverLedgerAggregationRow[]> {
  const { data, error } = await supabase().rpc("get_driver_ledger_aggregation", {
    p_org_id: orgId,
  });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    driver_id: String(r.driver_id),
    trips_count: n(r.trips_count),
    due: n(r.due),
    paid: n(r.paid),
    pending: n(r.pending),
  }));
}

export async function getSupplierLedgerAggregation(
  orgId: string,
  applyAdjustments: boolean,
): Promise<SupplierLedgerAggregationRow[]> {
  const { data, error } = await supabase().rpc("get_supplier_ledger_aggregation", {
    p_org_id: orgId,
    p_apply_adjustments: applyAdjustments,
  });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    supplier_id: String(r.supplier_id),
    trips_count: n(r.trips_count),
    due: n(r.due),
    paid: n(r.paid),
    unsettled: n(r.unsettled),
  }));
}

/**
 * DCO-6: unlike suppliers/drivers, there is no org-owned anchor table to
 * iterate — dco_payees has no organization_id (a DCO is a global,
 * person-owned identity). The RPC's own result set is already the full
 * list of DCO payees with at least one trip in this org; a payee with zero
 * trips here is correctly absent, not something the caller needs to add.
 */
export async function getDcoLedgerAggregation(
  orgId: string,
): Promise<DcoLedgerAggregationRow[]> {
  const { data, error } = await supabase().rpc("get_dco_ledger_aggregation", {
    p_org_id: orgId,
  });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    dco_payee_id: String(r.dco_payee_id),
    dco_user_id: String(r.dco_user_id),
    trips_count: n(r.trips_count),
    due: n(r.due),
    paid: n(r.paid),
    outstanding: n(r.outstanding),
  }));
}

/** Shipper trips created from a commerce execution plan, any status. */
async function fetchCommercePlanTripIds(orgId: string): Promise<string[]> {
  const { data: tripRows, error: tripError } = await supabase()
    .from("trips")
    .select("id, indent_id")
    .eq("organization_id", orgId)
    .is("deleted_at", null)
    .not("indent_id", "is", null);
  if (tripError || !tripRows?.length) return [];
  const indentIds = [
    ...new Set(
      tripRows
        .map((trip) => trip.indent_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const planIndents = new Set<string>();
  for (const chunk of chunkIds(indentIds)) {
    const { data: indents, error: indentError } = await supabase()
      .from("indents")
      .select("id")
      .in("id", chunk)
      .not("execution_plan_id", "is", null);
    if (indentError) return [];
    for (const indent of indents ?? []) {
      if (indent.id) planIndents.add(indent.id);
    }
  }
  if (planIndents.size === 0) return [];
  return tripRows
    .filter((trip) => trip.indent_id && planIndents.has(trip.indent_id))
    .map((trip) => trip.id);
}

async function fetchCommerceFulfillmentOrders(orgId: string) {
  const { data: tripRows, error: tripError } = await supabase()
    .from("trips")
    .select("id, indent_id, status")
    .eq("organization_id", orgId)
    .is("deleted_at", null)
    .not("indent_id", "is", null)
    .in("status", ["completed", "Completed"]);
  if (tripError || !tripRows?.length) return [];

  const indentIds = [
    ...new Set(
      tripRows
        .map((trip) => trip.indent_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const planByIndent = new Map<string, string>();
  for (const chunk of chunkIds(indentIds)) {
    const { data: indents, error: indentError } = await supabase()
      .from("indents")
      .select("id, execution_plan_id")
      .in("id", chunk)
      .not("execution_plan_id", "is", null);
    if (indentError) return [];
    for (const indent of indents ?? []) {
      if (indent.id && indent.execution_plan_id) {
        planByIndent.set(indent.id, indent.execution_plan_id);
      }
    }
  }
  const planIds = [...new Set(planByIndent.values())];
  if (planIds.length === 0) return [];

  const orders: Array<{
    id: string;
    customer_id: string | null;
    total_amount: unknown;
    execution_plan_id: string | null;
  }> = [];
  for (const chunk of chunkIds(planIds)) {
    const { data, error: orderError } = await supabase()
      .from("sales_orders")
      .select("id, customer_id, total_amount, execution_plan_id, status")
      .eq("organization_id", orgId)
      .in("execution_plan_id", chunk)
      .is("deleted_at", null)
      .in("status", ["Planned", "Pending Consolidation", "Fulfilled"]);
    if (orderError) return [];
    orders.push(...((data ?? []) as typeof orders));
  }
  if (orders.length === 0) return [];

  const tripByPlan = new Map<string, string>();
  for (const trip of tripRows) {
    if (!trip.indent_id) continue;
    const planId = planByIndent.get(trip.indent_id);
    if (planId) tripByPlan.set(planId, trip.id);
  }

  return orders.flatMap((order) => {
    const tripId = order.execution_plan_id
      ? tripByPlan.get(order.execution_plan_id)
      : undefined;
    if (!tripId || !order.customer_id) return [];
    return [
      {
        orderId: order.id,
        customerId: order.customer_id,
        tripId,
        amount: n(order.total_amount),
      },
    ];
  });
}

export async function getCustomerLedgerInputs(
  orgId: string,
  applyAdjustments: boolean,
): Promise<CustomerLedgerInputs> {
  const { data, error } = await supabase().rpc("get_customer_ledger_inputs", {
    p_org_id: orgId,
    p_apply_adjustments: applyAdjustments,
  });
  if (error) throw new Error(error.message);
  const raw = (data ?? {}) as {
    trip_inputs?: Record<string, unknown>[];
    unlinked_payments?: Record<string, unknown>[];
    ledger_only_parties?: Record<string, unknown>[];
    client_ledger_totals?: Record<string, unknown>[];
  };
  const freightInputs: CustomerLedgerInputs = {
    trip_inputs: (raw.trip_inputs ?? []).map((t) => ({
      client_id: String(t.client_id),
      trip_id: String(t.trip_id),
      sales: n(t.sales),
      initial_paid: n(t.initial_paid),
    })),
    unlinked_payments: (raw.unlinked_payments ?? []).map((p) => ({
      client_id: String(p.client_id),
      transaction_id: String(p.transaction_id),
      amount_in: n(p.amount_in),
    })),
    ledger_only_parties: (raw.ledger_only_parties ?? []).map((p) => ({
      party_name: String(p.party_name),
      received: n(p.received),
      pending: n(p.pending),
    })),
    client_ledger_totals: (raw.client_ledger_totals ?? []).map((c) => ({
      client_id: String(c.client_id),
      received: n(c.received),
      pending: n(c.pending),
    })),
  };
  const [commerceTripIds, commerceOrders] = await Promise.all([
    fetchCommercePlanTripIds(orgId),
    fetchCommerceFulfillmentOrders(orgId),
  ]);
  return mergeCommerceProductSales(
    suppressCommercePlanFreight(freightInputs, commerceTripIds),
    commerceOrders,
  );
}
