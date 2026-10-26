import type { ClientContract } from "@/features/clients/services/clientContracts.service";
import type { ClientWarehouse } from "@/features/clients/services/clientWarehouses.service";
import {
  getClientDetailBundle,
  type ClientRow,
} from "@/features/clients/services/clients.service";
import type { DriverRow } from "@/features/drivers/services/drivers.service";
import { toLedgerRow, type LedgerRow } from "@/features/finance/services/finance.service";
import { toRange } from "@/lib/pagination";
import type { RatingRow } from "@/features/ratings";
import type { SupplierRow } from "@/features/suppliers/services/suppliers.service";
import { CLIENT_PAGE_TRIP_COLUMNS } from "@/features/clients/utils/clientPageTripColumns.util";
import {
  CLIENT_PAGE_TX_PAGE_SIZE,
  mapClientPageTripIdRows,
  shouldFailClosedWithoutTripIdRpc,
  shouldFetchNextTransactionPage,
} from "@/features/clients/utils/clientPageFallback.util";
import { unwrapPartyBootstrapBundle } from "@/features/clients/utils/unwrapPartyBootstrap.util";
import { viewerOwnedClientTrips } from "@/features/clients/utils/viewerClientTrips.util";
import type { TripRow } from "@/features/trips/services/trips.service";
import { supabase } from "@/lib/supabase";

export type ClientPageBootstrap = {
  client: ClientRow;
  ratings: RatingRow[];
  warehouses: ClientWarehouse[];
  contracts: ClientContract[];
  trips: TripRow[];
  transactions: LedgerRow[];
  suppliers: SupplierRow[];
  drivers: DriverRow[];
  clients: ClientRow[];
};

const CLIENT_PAGE_TX_COLUMNS =
  "id, organization_id, trip_id, party_name, description, amount_in, amount_out, transaction_date, created_at, contact_id, contact_type, ledger_entity_type, ledger_flow_type, ledger_category, payment_ref, created_by, booking_ref, is_opening_balance";

const TRIP_ID_CHUNK = 100;

function isMissingRpc(
  error: { code?: string; message?: string } | null,
  fnName?: string,
): boolean {
  const code = String(error?.code ?? "");
  const msg = (error?.message ?? "").toLowerCase();
  return (
    code === "PGRST202" ||
    code === "42883" ||
    msg.includes("could not find the function") ||
    Boolean(fnName && msg.includes(fnName))
  );
}

export async function fetchClientPageTripIds(
  orgId: string,
  clientId: string,
): Promise<{ error: Error | null; ids: string[]; missingRpc: boolean }> {
  const { data, error } = await supabase().rpc("client_page_trip_ids", {
    p_org_id: orgId,
    p_client_id: clientId,
  });
  if (error) {
    return {
      error: new Error(error.message),
      ids: [],
      missingRpc: isMissingRpc(error, "client_page_trip_ids"),
    };
  }
  return { error: null, ids: mapClientPageTripIdRows(data), missingRpc: false };
}

export async function fetchClientPageTransactionsUncapped(
  orgId: string,
  clientId: string,
): Promise<{ error: Error | null; transactions: LedgerRow[] }> {
  const transactions: LedgerRow[] = [];
  let offset = 0;
  for (;;) {
    const { from, to } = toRange(offset, CLIENT_PAGE_TX_PAGE_SIZE);
    const { data, error } = await supabase()
      .from("transactions")
      .select(CLIENT_PAGE_TX_COLUMNS)
      .eq("organization_id", orgId)
      .eq("contact_id", clientId)
      .eq("contact_type", "client")
      .order("transaction_date", { ascending: false })
      .order("created_at", { ascending: false })
      .range(from, to);
    if (error) return { error: new Error(error.message), transactions: [] };
    const page = ((data ?? []) as unknown[]).map(mapTx);
    transactions.push(...page);
    if (!shouldFetchNextTransactionPage(page.length, CLIENT_PAGE_TX_PAGE_SIZE)) break;
    offset += CLIENT_PAGE_TX_PAGE_SIZE;
  }
  return { error: null, transactions };
}

async function fetchTripsByIds(
  orgId: string,
  ids: string[],
): Promise<{ error: Error | null; trips: TripRow[] }> {
  if (ids.length === 0) return { error: null, trips: [] };
  const trips: TripRow[] = [];
  for (let i = 0; i < ids.length; i += TRIP_ID_CHUNK) {
    const chunk = ids.slice(i, i + TRIP_ID_CHUNK);
    const { data, error } = await supabase()
      .from("trips")
      .select(CLIENT_PAGE_TRIP_COLUMNS)
      .eq("organization_id", orgId)
      .in("id", chunk)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (error) return { error: new Error(error.message), trips: [] };
    trips.push(...((data ?? []) as TripRow[]));
  }
  return { error: null, trips };
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

function mapRpcBundle(payload: Partial<ClientPageBootstrap>): ClientPageBootstrap | null {
  if (!payload.client?.id) return null;
  return {
    client: payload.client,
    ratings: payload.ratings ?? [],
    warehouses: payload.warehouses ?? [],
    contracts: payload.contracts ?? [],
    trips: (payload.trips ?? []) as TripRow[],
    transactions: ((payload.transactions as unknown[]) ?? []).map(mapTx),
    suppliers: payload.suppliers ?? [],
    drivers: payload.drivers ?? [],
    clients: payload.clients ?? [payload.client],
  };
}

async function fetchClientPageBootstrapScoped(
  orgId: string,
  clientId: string,
): Promise<{ error: Error | null; bundle: ClientPageBootstrap | null }> {
  const [detail, tripIdsRes, txRes] = await Promise.all([
    getClientDetailBundle(orgId, clientId),
    fetchClientPageTripIds(orgId, clientId),
    fetchClientPageTransactionsUncapped(orgId, clientId),
  ]);
  if (detail.error) return { error: detail.error, bundle: null };
  if (!detail.client) return { error: null, bundle: null };
  if (shouldFailClosedWithoutTripIdRpc(tripIdsRes.missingRpc)) {
    return {
      error: new Error("client_page_trip_ids is required for the client page fallback"),
      bundle: null,
    };
  }
  if (tripIdsRes.error) return { error: tripIdsRes.error, bundle: null };
  if (txRes.error) return { error: txRes.error, bundle: null };

  const tripsRes = await fetchTripsByIds(orgId, tripIdsRes.ids);
  if (tripsRes.error) return { error: tripsRes.error, bundle: null };

  const seen = new Set<string>();
  const trips: TripRow[] = [];
  for (const trip of viewerOwnedClientTrips(tripsRes.trips, orgId, detail.client)) {
    if (!trip.id || seen.has(trip.id)) continue;
    seen.add(trip.id);
    trips.push(trip);
  }

  return {
    error: null,
    bundle: {
      client: detail.client,
      ratings: detail.ratings,
      warehouses: detail.warehouses,
      contracts: detail.contracts,
      trips,
      transactions: txRes.transactions,
      suppliers: [],
      drivers: [],
      clients: [detail.client],
    },
  };
}

export async function fetchClientPageBootstrap(
  orgId: string,
  clientId: string,
): Promise<{ error: Error | null; missingRpc: boolean; bundle: ClientPageBootstrap | null }> {
  const { data, error } = await supabase().rpc("get_client_page_bootstrap", {
    p_org_id: orgId,
    p_client_id: clientId,
  });
  if (!error) {
    const bundle = mapRpcBundle((data as Partial<ClientPageBootstrap> | null) ?? {});
    if (bundle) {
      bundle.trips = viewerOwnedClientTrips(bundle.trips, orgId, bundle.client);
      return { error: null, missingRpc: false, bundle };
    }
  }
  if (error && !isMissingRpc(error, "get_client_page_bootstrap")) {
    return { error: new Error(error.message), missingRpc: false, bundle: null };
  }
  const scoped = await fetchClientPageBootstrapScoped(orgId, clientId);
  return { error: scoped.error, missingRpc: Boolean(error && isMissingRpc(error)), bundle: scoped.bundle };
}

/** Keep the scoped fallback bundle. Never cache `null` just because the RPC is missing. */
export async function queryClientPageBootstrap(
  orgId: string,
  clientId: string,
): Promise<ClientPageBootstrap | null> {
  return unwrapPartyBootstrapBundle(await fetchClientPageBootstrap(orgId, clientId));
}
