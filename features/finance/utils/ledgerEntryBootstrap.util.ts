/**
 * Ledger Entry open-path bootstrap.
 *
 * Hydrates from canonical TanStack keys (same as Finance / Trip Detail).
 * Fetches only missing required data. Does not change ledger write semantics.
 */
import type { QueryClient } from "@tanstack/react-query";
import type { PartyOption, TripOption, VehicleOption } from "@/components/AddTransactionModal";
import type { ClientRow } from "@/features/clients/services/clients.service";
import { getClientsByOrganization } from "@/features/clients/services/clients.service";
import {
  filterFinanceLedgerDrivers,
  getDriverOffersByOrganization,
  getDriversByOrganization,
  type DriverOffer,
  type DriverRow,
} from "@/features/drivers/services/drivers.service";
import {
  getTransactionsByOrganization,
  type LedgerRow,
} from "@/features/finance/services/finance.service";
import { getSuppliersByOrganization, type SupplierRow } from "@/features/suppliers/services/suppliers.service";
import {
  adjustedCost,
  adjustedRevenue,
  fetchTripFinanceAdjustmentsByTripIds,
  normTripFinanceAdjustmentKey,
  type TripAdjustment,
} from "@/features/trips/services/tripAdjustments";
import {
  getTripDisplayNumber,
  getTripsForOrg,
  getTripsWhereOrgIsClient,
  type TripRow,
} from "@/features/trips/services/trips.service";
import { formatLedgerDate } from "@/lib/format";
import { queryKeys } from "@/lib/queryKeys";
import {
  peekTripDetailBundleCache,
  type BundleAdjustment,
  type BundleTransaction,
  type TripDetailBundle,
} from "@/lib/queries/useTripDetailBundleQuery";
import { getVehiclesByOrganization, type VehicleRow } from "@/features/vehicles/services/vehicles.service";

export type TripDueMeta = {
  client_price: number;
  supplier_rate: number;
  organization_id: string | null;
  indent_id: string | null;
  isCrossOrgSupplier: boolean;
};

export type TripOptionWithOrg = TripOption & {
  organization_id?: string;
  driver_display_name?: string | null;
};

export type LedgerEntryBootstrapInput = {
  orgId: string;
  tripId?: string;
  entryId?: string;
  /** Locked counterparty already in the CTA (partyId / DRIVER|CLIENT|SUPPLIER entity). */
  partyKnown: boolean;
  /** Dues already passed on the query string — skip org-wide due recompute waits. */
  duesFromQuery: boolean;
};

export type LedgerEntryBootstrapResult = {
  clients: ClientRow[];
  suppliers: SupplierRow[];
  drivers: PartyOption[];
  vehicles: VehicleOption[];
  trips: TripOptionWithOrg[];
  tripDueMeta: Record<string, TripDueMeta>;
  adjustmentsRecord: Record<string, TripAdjustment[]>;
  transactions: LedgerRow[];
  driverOffers: Record<string, DriverOffer>;
};

const STALE_MODERATE_MS = 10 * 60_000;
const STALE_REALTIME_MS = 5 * 60_000;

function cacheFirst<T>(qc: QueryClient, key: readonly unknown[]): T | undefined {
  return qc.getQueryData<T>([...key]);
}

async function cacheFirstOrFetch<T>(
  qc: QueryClient,
  key: readonly unknown[],
  queryFn: () => Promise<T>,
  staleTime: number,
): Promise<T> {
  const hit = cacheFirst<T>(qc, key);
  if (hit !== undefined) return hit;
  return qc.fetchQuery({
    queryKey: [...key],
    queryFn,
    staleTime,
  });
}

export function bundleTransactionToLedgerRow(
  tx: BundleTransaction,
  tripNumber?: string | null,
): LedgerRow {
  const contactType = tx.contact_type;
  return {
    id: tx.id,
    organization_id: tx.organization_id,
    trip_id: tx.trip_id,
    trip_number: tripNumber ?? null,
    party_name: tx.party_name ?? "",
    description: tx.description ?? "",
    amount_in: Number(tx.amount_in ?? 0),
    amount_out: Number(tx.amount_out ?? 0),
    transaction_date: tx.transaction_date,
    created_at: tx.created_at ?? tx.transaction_date,
    contact_id: tx.contact_id,
    contact_type:
      contactType === "client" ||
      contactType === "supplier" ||
      contactType === "driver" ||
      contactType === "dco"
        ? contactType
        : null,
    ledger_entity_type: tx.ledger_entity_type,
    ledger_flow_type: tx.ledger_flow_type,
    ledger_category: tx.ledger_category,
  };
}

export function bundleAdjustmentToTripAdjustment(row: BundleAdjustment): TripAdjustment {
  const type = row.type === "cost" ? "cost" : "revenue";
  const impact = row.impact === "minus" ? "minus" : "plus";
  return {
    id: row.id,
    trip_id: row.trip_id,
    organization_id: row.organization_id,
    type,
    impact,
    amount: Number(row.amount ?? 0),
    reason: row.reason ?? "",
    mission_key: row.mission_key,
    created_at: row.created_at,
    voided_at: row.voided_at,
    void_reason: row.void_reason,
  };
}

export function tripRowToLedgerOption(
  t: TripRow,
  orgId: string,
  meta: TripDueMeta | undefined,
): TripOptionWithOrg {
  return {
    id: t.id,
    trip_number: getTripDisplayNumber(t, orgId),
    client_id: t.client_id ?? null,
    client_name: t.client_name ?? null,
    supplier_id: t.supplier_id ?? null,
    supplier_name: t.supplier_name ?? null,
    driver_id: t.driver_id ?? null,
    driver_display_name: t.driver_display_name ?? null,
    vehicle_id: t.vehicle_id ?? null,
    indent_id: t.indent_id ?? null,
    route_label: [t.pickup_area, t.drop_location].filter(Boolean).join(" → ") || null,
    trip_date: formatLedgerDate(t.pickup_date || t.created_at),
    organization_id: t.organization_id,
    client_price: meta?.client_price ?? t.client_price ?? null,
    supplier_rate: meta?.supplier_rate ?? t.supplier_rate ?? null,
    driver_commission: t.driver_commission ?? null,
    distance: t.distance ?? null,
    is_cross_org_supplier: meta?.isCrossOrgSupplier ?? false,
    trip_payout_mode: t.trip_payout_mode ?? null,
    status: t.status ?? null,
    completed_at: t.completed_at ?? null,
  };
}

function dueMetaForTrip(
  t: TripRow,
  orgId: string,
  asSupplierIds: Set<string>,
  adjustmentsByTripId: Map<string, TripAdjustment[]>,
): TripDueMeta {
  const adjustments = adjustmentsByTripId.get(normTripFinanceAdjustmentKey(t.id)) ?? [];
  const baseClient = Number(t.client_price ?? 0);
  const baseSupplier = Number(t.supplier_rate ?? 0);
  return {
    client_price: adjustedRevenue(baseClient, adjustments),
    supplier_rate: adjustedCost(baseSupplier, adjustments),
    organization_id: t.organization_id ?? null,
    indent_id: t.indent_id ?? null,
    isCrossOrgSupplier: asSupplierIds.has(t.id) && t.organization_id !== orgId,
  };
}

function mergeTripRows(owned: TripRow[], asClient: TripRow[], asSupplier: TripRow[]): TripRow[] {
  const seen = new Set<string>();
  const merged: TripRow[] = [];
  for (const list of [owned, asClient, asSupplier]) {
    for (const t of list) {
      if (!seen.has(t.id)) {
        merged.push(t);
        seen.add(t.id);
      }
    }
  }
  return merged;
}

function driversToPartyOptions(rows: DriverRow[]): PartyOption[] {
  return filterFinanceLedgerDrivers(rows).map((d) => ({
    id: d.id,
    name: d.name ?? d.phone ?? "Driver",
    avatar_url: d.avatar_url ?? null,
    avatar_seed: d.avatar_seed ?? null,
  }));
}

function vehiclesToOptions(rows: VehicleRow[]): VehicleOption[] {
  return rows.map((v) => ({ id: v.id, vehicle_number: v.vehicle_number ?? "" }));
}

function seedClientFromBundle(bundle: TripDetailBundle): ClientRow[] {
  const c = bundle.client_detail?.client;
  if (!c) return [];
  return [
    {
      id: c.id,
      organization_id: c.organization_id,
      name: c.name,
      contact_person: null,
      phone: c.phone ?? "",
      email: null,
      address: null,
      gstin: null,
      pan_number: null,
      status: c.status ?? "active",
      created_at: "",
      updated_at: "",
      linked_organization_id: c.linked_organization_id,
      avatar_url: c.avatar_url,
      avatar_seed: c.avatar_seed,
    },
  ];
}

function seedSupplierFromBundle(bundle: TripDetailBundle): SupplierRow[] {
  const s = bundle.supplier_detail?.supplier;
  if (!s) return [];
  return [
    {
      id: s.id,
      organization_id: s.organization_id,
      name: s.name ?? s.company_name,
      company_name: s.company_name,
      contact_person: null,
      phone: s.phone ?? "",
      linked_organization_id: s.linked_organization_id,
      avatar_url: s.avatar_url,
      avatar_seed: s.avatar_seed,
    } as SupplierRow,
  ];
}

function seedDriverFromBundle(bundle: TripDetailBundle): PartyOption[] {
  const d = bundle.driver;
  if (!d) return [];
  return [
    {
      id: d.id,
      name: d.name ?? d.phone ?? "Driver",
      avatar_url: d.avatar_url ?? null,
      avatar_seed: d.avatar_seed ?? null,
    },
  ];
}

function seedVehicleFromBundle(bundle: TripDetailBundle): VehicleOption[] {
  const v = bundle.vehicle;
  if (!v) return [];
  return [{ id: v.id, vehicle_number: v.vehicle_number ?? "" }];
}

function bundleTripToRow(bundle: TripDetailBundle): TripRow {
  const t = bundle.trip;
  return {
    id: t.id,
    organization_id: t.organization_id,
    trip_number: t.trip_number,
    display_trip_id: t.display_trip_id,
    driver_display_trip_id: t.driver_display_trip_id,
    indent_id: t.indent_id,
    pickup_area: t.pickup_area,
    drop_location: t.drop_location,
    client_id: t.client_id,
    client_name: t.client_name,
    supplier_id: t.supplier_id,
    driver_id: t.driver_id,
    vehicle_id: t.vehicle_id,
    driver_display_name: t.driver_display_name,
    client_price: t.client_price,
    supplier_rate: t.supplier_rate,
    driver_commission: t.driver_commission,
    pickup_date: t.pickup_date,
    created_at: t.created_at,
    completed_at: t.completed_at,
    status: t.status,
    trip_payout_mode: t.trip_payout_mode,
    distance: t.distance,
  } as TripRow;
}

async function ensureClients(qc: QueryClient, orgId: string): Promise<ClientRow[]> {
  return cacheFirstOrFetch(
    qc,
    queryKeys.clients.finite(orgId),
    async () => {
      const res = await getClientsByOrganization(orgId);
      if (res.error) throw res.error;
      return res.clients ?? [];
    },
    STALE_MODERATE_MS,
  );
}

async function ensureSuppliers(qc: QueryClient, orgId: string): Promise<SupplierRow[]> {
  return cacheFirstOrFetch(
    qc,
    queryKeys.suppliers.finite(orgId),
    async () => {
      const res = await getSuppliersByOrganization(orgId);
      if (res.error) throw res.error;
      return res.suppliers ?? [];
    },
    STALE_MODERATE_MS,
  );
}

async function ensureDrivers(qc: QueryClient, orgId: string): Promise<DriverRow[]> {
  return cacheFirstOrFetch(
    qc,
    queryKeys.drivers.finite(orgId),
    async () => {
      const res = await getDriversByOrganization(orgId);
      if (res.error) throw res.error;
      return res.drivers ?? [];
    },
    STALE_MODERATE_MS,
  );
}

async function ensureVehicles(qc: QueryClient, orgId: string): Promise<VehicleRow[]> {
  return cacheFirstOrFetch(
    qc,
    queryKeys.vehicles.finite(orgId),
    async () => {
      const res = await getVehiclesByOrganization(orgId);
      if (res.error) throw res.error;
      return res.vehicles ?? [];
    },
    STALE_MODERATE_MS,
  );
}

async function ensureOwnedTrips(qc: QueryClient, orgId: string): Promise<TripRow[]> {
  return cacheFirstOrFetch(
    qc,
    queryKeys.trips.finite(orgId),
    async () => {
      const res = await getTripsForOrg(orgId);
      if (res.error) throw res.error;
      return res.trips ?? [];
    },
    STALE_REALTIME_MS,
  );
}

async function ensureTripsWhereOrgIsClient(qc: QueryClient, orgId: string): Promise<TripRow[]> {
  return cacheFirstOrFetch(
    qc,
    queryKeys.trips.whereOrgIsClient(orgId),
    async () => {
      const res = await getTripsWhereOrgIsClient(orgId);
      if (res.error) throw res.error;
      return res.trips ?? [];
    },
    STALE_REALTIME_MS,
  );
}

async function ensureTransactions(qc: QueryClient, orgId: string): Promise<LedgerRow[]> {
  return cacheFirstOrFetch(
    qc,
    queryKeys.transactions.finite(orgId),
    async () => {
      const res = await getTransactionsByOrganization(orgId);
      if (res.error) throw res.error;
      return res.transactions ?? [];
    },
    STALE_REALTIME_MS,
  );
}

/** Splash path: reuse Trip Detail cache only. Never fetch the bundle here. */
function peekBundleForLedger(
  qc: QueryClient,
  tripId: string,
): TripDetailBundle | null {
  const peeked = peekTripDetailBundleCache(qc, tripId);
  return peeked?.trip?.id ? peeked : null;
}

/**
 * Coordinated Ledger Entry bootstrap. Cache hits are returned immediately
 * (no background refetch on the splash path).
 */
export async function loadLedgerEntryBootstrap(
  qc: QueryClient,
  input: LedgerEntryBootstrapInput,
): Promise<LedgerEntryBootstrapResult> {
  const { orgId, tripId, entryId, partyKnown, duesFromQuery } = input;
  const tripLocked = Boolean(tripId);

  const cachedOffers =
    cacheFirst<Record<string, DriverOffer>>(qc, queryKeys.driverOffers(orgId)) ?? {};

  if (tripLocked && tripId) {
    const bundle = peekBundleForLedger(qc, tripId);
    const cachedOwned = cacheFirst<TripRow[]>(qc, queryKeys.trips.finite(orgId));
    const cachedAsClient = cacheFirst<TripRow[]>(qc, queryKeys.trips.whereOrgIsClient(orgId));

    let mergedRows: TripRow[] = [];
    if (cachedOwned) {
      const asSupplier = cachedOwned.filter((t) => t.organization_id !== orgId);
      mergedRows = mergeTripRows(cachedOwned, cachedAsClient ?? [], asSupplier);
    } else if (bundle?.trip?.id) {
      mergedRows = [bundleTripToRow(bundle)];
    }

    const asSupplierIds = new Set(
      mergedRows.filter((t) => t.organization_id !== orgId).map((t) => t.id),
    );

    const adjustmentsRecord: Record<string, TripAdjustment[]> = {};
    const adjustmentsByTripId = new Map<string, TripAdjustment[]>();
    if (bundle?.adjustments?.length) {
      for (const row of bundle.adjustments) {
        const adj = bundleAdjustmentToTripAdjustment(row);
        const key = normTripFinanceAdjustmentKey(adj.trip_id);
        const list = adjustmentsByTripId.get(key) ?? [];
        list.push(adj);
        adjustmentsByTripId.set(key, list);
        adjustmentsRecord[key] = list;
      }
    }

    const tripDueMeta: Record<string, TripDueMeta> = {};
    for (const t of mergedRows) {
      tripDueMeta[t.id] = dueMetaForTrip(t, orgId, asSupplierIds, adjustmentsByTripId);
    }
    const options = mergedRows.map((t) => tripRowToLedgerOption(t, orgId, tripDueMeta[t.id]));

    const tripNumber = bundle?.trip
      ? getTripDisplayNumber(bundleTripToRow(bundle), orgId)
      : undefined;

    const cachedTx = cacheFirst<LedgerRow[]>(qc, queryKeys.transactions.finite(orgId));
    let transactions: LedgerRow[] = [];
    if (cachedTx) {
      transactions = cachedTx;
    } else if (bundle?.transactions?.length) {
      transactions = bundle.transactions.map((tx) =>
        bundleTransactionToLedgerRow(tx, tripNumber),
      );
    } else if (entryId) {
      transactions = await ensureTransactions(qc, orgId);
    }

    const needOrgParties = !partyKnown;
    const [clients, suppliers, driverRows, vehicleRows] = await Promise.all([
      needOrgParties
        ? ensureClients(qc, orgId)
        : Promise.resolve(
            cacheFirst<ClientRow[]>(qc, queryKeys.clients.finite(orgId)) ??
              (bundle ? seedClientFromBundle(bundle) : []),
          ),
      needOrgParties
        ? ensureSuppliers(qc, orgId)
        : Promise.resolve(
            cacheFirst<SupplierRow[]>(qc, queryKeys.suppliers.finite(orgId)) ??
              (bundle ? seedSupplierFromBundle(bundle) : []),
          ),
      needOrgParties
        ? ensureDrivers(qc, orgId)
        : Promise.resolve(
            cacheFirst<DriverRow[]>(qc, queryKeys.drivers.finite(orgId)) ?? [],
          ),
      needOrgParties
        ? ensureVehicles(qc, orgId)
        : Promise.resolve(
            cacheFirst<VehicleRow[]>(qc, queryKeys.vehicles.finite(orgId)) ?? [],
          ),
    ]);

    const drivers =
      driverRows.length > 0
        ? driversToPartyOptions(driverRows)
        : bundle
          ? seedDriverFromBundle(bundle)
          : [];
    const vehicles =
      vehicleRows.length > 0
        ? vehiclesToOptions(vehicleRows)
        : bundle
          ? seedVehicleFromBundle(bundle)
          : [];

    return {
      clients,
      suppliers,
      drivers,
      vehicles,
      trips: options,
      tripDueMeta,
      adjustmentsRecord,
      transactions,
      driverOffers: cachedOffers,
    };
  }

  const [clients, suppliers, driverRows, vehicleRows, owned, asClient, transactions] =
    await Promise.all([
      ensureClients(qc, orgId),
      ensureSuppliers(qc, orgId),
      ensureDrivers(qc, orgId),
      ensureVehicles(qc, orgId),
      ensureOwnedTrips(qc, orgId),
      ensureTripsWhereOrgIsClient(qc, orgId),
      ensureTransactions(qc, orgId),
    ]);

  const asSupplier = owned.filter((t) => t.organization_id !== orgId);
  const merged = mergeTripRows(owned, asClient, asSupplier);
  const asSupplierIds = new Set(asSupplier.map((t) => t.id));

  const adjustmentsByTripId = duesFromQuery
    ? new Map<string, TripAdjustment[]>()
    : await fetchTripFinanceAdjustmentsByTripIds(merged.map((t) => t.id));

  const adjustmentsRecord: Record<string, TripAdjustment[]> = {};
  adjustmentsByTripId.forEach((list, key) => {
    if (list.length > 0) adjustmentsRecord[key] = list;
  });

  const tripDueMeta: Record<string, TripDueMeta> = {};
  for (const t of merged) {
    tripDueMeta[t.id] = dueMetaForTrip(t, orgId, asSupplierIds, adjustmentsByTripId);
  }

  return {
    clients,
    suppliers,
    drivers: driversToPartyOptions(driverRows),
    vehicles: vehiclesToOptions(vehicleRows),
    trips: merged.map((t) => tripRowToLedgerOption(t, orgId, tripDueMeta[t.id])),
    tripDueMeta,
    adjustmentsRecord,
    transactions,
    driverOffers: cachedOffers,
  };
}

/** Non-blocking offers hydrate after first paint. Reuses drivers cache inside the service when possible. */
export async function hydrateLedgerDriverOffers(
  qc: QueryClient,
  orgId: string,
): Promise<Record<string, DriverOffer>> {
  const cached = cacheFirst<Record<string, DriverOffer>>(qc, queryKeys.driverOffers(orgId));
  if (cached !== undefined) return cached;
  return qc.fetchQuery({
    queryKey: queryKeys.driverOffers(orgId),
    queryFn: async () => {
      const res = await getDriverOffersByOrganization(orgId);
      if (res.error) throw res.error;
      return res.offersByDriverId ?? {};
    },
    staleTime: STALE_MODERATE_MS,
  });
}
