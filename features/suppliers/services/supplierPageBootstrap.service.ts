import { unwrapPartyBootstrapBundle } from "@/features/clients/utils/unwrapPartyBootstrap.util";
import type { ClientRow } from "@/features/clients/services/clients.service";
import type { DriverRow } from "@/features/drivers/services/drivers.service";
import {
  getTransactionsByOrganizationAndContactId,
  toLedgerRow,
  type LedgerRow,
} from "@/features/finance/services/finance.service";
import { getTripSubcontracts } from "@/features/finance/services/tripSubcontracts.service";
import {
  getSupplierById,
  getSupplierDetails,
  mergeSupplierDisplayFields,
  type SupplierRow,
} from "@/features/suppliers/services/suppliers.service";
import {
  getTripsWhereOrgIsClient,
  getTripsWhereOrgIsSupplier,
  supplierRowToTripRow,
  type TripRow,
} from "@/features/trips/services/trips.service";
import { isLoadBasedTrip } from "@/features/trips/visibility/tripVisibility";
import { supabase } from "@/lib/supabase";

export type SupplierPageBootstrap = {
  supplier: SupplierRow;
  trips: TripRow[];
  transactions: LedgerRow[];
  suppliers: SupplierRow[];
  drivers: DriverRow[];
  clients: ClientRow[];
  aggregateTripSalesById: Record<string, number>;
};

function isMissingRpc(error: { code?: string; message?: string } | null): boolean {
  const code = String(error?.code ?? "");
  const msg = (error?.message ?? "").toLowerCase();
  return (
    code === "PGRST202" ||
    code === "42883" ||
    msg.includes("could not find the function") ||
    msg.includes("get_supplier_page_bootstrap")
  );
}

function mapTx(raw: unknown): LedgerRow {
  const row = (raw ?? {}) as Record<string, unknown>;
  return toLedgerRow({
    id: String(row.id ?? ""),
    organization_id: String(row.organization_id ?? ""),
    trip_id: (row.trip_id as string | null) ?? null,
    party_name: (row.party_name as string | null) ?? null,
    description: (row.description as string | null) ?? null,
    amount_in: Number(row.amount_in ?? 0),
    amount_out: Number(row.amount_out ?? 0),
    transaction_date: String(row.transaction_date ?? ""),
    created_at: String(row.created_at ?? ""),
    contact_id: (row.contact_id as string | null) ?? null,
    contact_type: (row.contact_type as string | null) ?? null,
    ledger_entity_type: (row.ledger_entity_type as string | null) ?? null,
    ledger_flow_type: (row.ledger_flow_type as string | null) ?? null,
    ledger_category: (row.ledger_category as string | null) ?? null,
    payment_reference: (row.payment_ref as string | null) ?? (row.payment_reference as string | null) ?? null,
    created_by: (row.created_by as string | null) ?? null,
  });
}

function mapRpcBundle(payload: {
  supplier?: SupplierRow | null;
  trips?: Array<TripRow & { aggregate_sales?: number | null }>;
  transactions?: unknown[];
  suppliers?: SupplierRow[];
  drivers?: DriverRow[];
  clients?: ClientRow[];
} | null): SupplierPageBootstrap | null {
  if (!payload?.supplier?.id) return null;
  const aggregateTripSalesById: Record<string, number> = {};
  const trips = (payload.trips ?? []).map((trip) => {
    const sales = Number(trip.aggregate_sales ?? 0);
    if (sales > 0) aggregateTripSalesById[trip.id] = sales;
    const { aggregate_sales: _drop, ...rest } = trip;
    return rest as TripRow;
  });
  return {
    supplier: payload.supplier,
    trips,
    transactions: (payload.transactions ?? []).map(mapTx),
    suppliers: payload.suppliers ?? [payload.supplier],
    drivers: payload.drivers ?? [],
    clients: payload.clients ?? [],
    aggregateTripSalesById,
  };
}

async function fetchSupplierPageBootstrapScoped(
  orgId: string,
  supplierId: string,
): Promise<{ error: Error | null; bundle: SupplierPageBootstrap | null }> {
  const [detail, rowRes, peersRes, ownTripsRes, txRes, asClientRes, asSupplierRes] = await Promise.all([
    getSupplierDetails(supplierId),
    getSupplierById(orgId, supplierId),
    supabase()
      .from("suppliers")
      .select("id, linked_organization_id")
      .eq("organization_id", orgId),
    supabase()
      .from("trips")
      .select("*")
      .eq("organization_id", orgId)
      .eq("supplier_id", supplierId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(400),
    getTransactionsByOrganizationAndContactId(orgId, supplierId),
    getTripsWhereOrgIsClient(orgId),
    getTripsWhereOrgIsSupplier(orgId),
  ]);
  if (detail.error && rowRes.error) return { error: detail.error, bundle: null };
  const supplier = rowRes.supplier
    ? detail.supplier
      ? mergeSupplierDisplayFields(rowRes.supplier, detail.supplier)
      : rowRes.supplier
    : detail.supplier;
  if (!supplier) return { error: detail.error, bundle: null };
  if (ownTripsRes.error) return { error: new Error(ownTripsRes.error.message), bundle: null };
  if (txRes.error) return { error: txRes.error, bundle: null };

  const linkedOrgId = supplier.linked_organization_id ?? null;
  const linkedCount = (peersRes.data ?? []).filter(
    (row) => row.linked_organization_id === linkedOrgId,
  ).length;
  const uniqueLinked = Boolean(linkedOrgId) && linkedCount === 1;

  const extra: TripRow[] = [];
  const sharedTrips = (asSupplierRes.error ? [] : asSupplierRes.trips).map(
    supplierRowToTripRow,
  );
  const ownTrips = (ownTripsRes.data ?? []) as TripRow[];
  const candidateIds = [...ownTrips, ...extra, ...sharedTrips]
    .map((trip) => trip.id)
    .filter(Boolean);
  const subRes = await getTripSubcontracts({ viewerOrgId: orgId, tripIds: candidateIds });
  const subcontractTrips = (asClientRes.error ? [] : asClientRes.trips).filter(
    (trip) =>
      uniqueLinked &&
      linkedOrgId &&
      isLoadBasedTrip(trip) &&
      trip.organization_id === linkedOrgId,
  );

  const seen = new Set<string>();
  const trips: TripRow[] = [];
  const aggregateTripSalesById: Record<string, number> = {};
  const subByTrip = new Map((subRes.rows ?? []).map((row) => [row.trip_id, row]));
  for (const trip of [...ownTrips, ...extra, ...sharedTrips, ...subcontractTrips]) {
    if (!trip.id || seen.has(trip.id)) continue;
    seen.add(trip.id);
    const sub = subByTrip.get(trip.id);
    if (sub && sub.supplier_id === supplierId) {
      trips.push({ ...trip, supplier_rate: sub.rate });
      const sales = Number(trip.supplier_rate ?? trip.client_price ?? 0);
      if (sales > 0) aggregateTripSalesById[trip.id] = sales;
      continue;
    }
    trips.push(trip);
    if (trip.organization_id !== orgId) {
      const sales = Number(trip.client_price ?? trip.supplier_rate ?? 0);
      if (sales > 0) aggregateTripSalesById[trip.id] = sales;
    }
  }

  return {
    error: null,
    bundle: {
      supplier,
      trips,
      transactions: (txRes.transactions ?? []).filter(
        (tx) => tx.contact_type === "supplier" && tx.contact_id === supplierId,
      ),
      suppliers: [supplier],
      drivers: [],
      clients: [],
      aggregateTripSalesById,
    },
  };
}

export async function fetchSupplierPageBootstrap(
  orgId: string,
  supplierId: string,
): Promise<{ error: Error | null; missingRpc: boolean; bundle: SupplierPageBootstrap | null }> {
  const { data, error } = await supabase().rpc("get_supplier_page_bootstrap", {
    p_org_id: orgId,
    p_supplier_id: supplierId,
  });
  if (!error) {
    const bundle = mapRpcBundle(data as Parameters<typeof mapRpcBundle>[0]);
    if (bundle) return { error: null, missingRpc: false, bundle };
  }
  if (error && !isMissingRpc(error)) {
    return { error: new Error(error.message), missingRpc: false, bundle: null };
  }
  const scoped = await fetchSupplierPageBootstrapScoped(orgId, supplierId);
  return { error: scoped.error, missingRpc: Boolean(error && isMissingRpc(error)), bundle: scoped.bundle };
}

/** Keep the scoped fallback bundle. Never cache `null` just because the RPC is missing. */
export async function querySupplierPageBootstrap(
  orgId: string,
  supplierId: string,
): Promise<SupplierPageBootstrap | null> {
  return unwrapPartyBootstrapBundle(await fetchSupplierPageBootstrap(orgId, supplierId));
}
