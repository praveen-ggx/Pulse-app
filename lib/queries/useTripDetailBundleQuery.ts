/**
 * Phase 3a: Trip Detail Bundle Query
 *
 * Replaces 18-24 serial DB round trips with one RPC call to get_trip_detail_bundle().
 * Feature-flagged: set ENABLE_TRIP_DETAIL_BUNDLE = false to roll back to the legacy path.
 *
 * Rollback: set flag to false — the hook returns undefined and callers fall back
 * to the existing direct-service code path. No schema changes required for rollback.
 */
import { useQuery, type QueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { throwIfCancelled, withAbortSignal } from '@/lib/supabaseAbort.util';
import { queryKeys } from '@/lib/queryKeys';
import { shouldRetryQuery } from '@/lib/queryClient';

// ── Feature flag ─────────────────────────────────────────────────────────────
// Globally enabled: replaces 18-24 serial DB round-trips with one RPC call.
export const ENABLE_TRIP_DETAIL_BUNDLE = true;

// Orgs enabled for staged bundle rollout before global flip.
// Add internal/test org IDs here; remove after global flag is on.
const BUNDLE_ENABLED_ORG_IDS = new Set<string>([
  'c481a15d-c488-4e26-aa03-d77681fb5835', // internal — vasanth/gogox primary test org
]);

/** Returns true if the bundle path should be active for the given org. */
export function isBundleEnabled(orgId: string | null): boolean {
  return ENABLE_TRIP_DETAIL_BUNDLE || (orgId != null && BUNDLE_ENABLED_ORG_IDS.has(orgId));
}

// ── Payload contract ─────────────────────────────────────────────────────────

export interface BundleTrip {
  id: string;
  organization_id: string;
  trip_number: string;
  display_trip_id: string | null;
  driver_display_trip_id: string | null;
  indent_id: string | null;
  source: string;
  pickup_area: string;
  drop_location: string;
  distance: number | null;
  estimated_duration: string | null;
  client_id: string | null;
  client_name: string;
  supplier_id: string | null;
  driver_id: string | null;
  vehicle_id: string | null;
  driver_display_name: string | null;
  vehicle_display_number: string | null;
  client_price: number;
  supplier_rate: number;
  margin: number | null;
  platform_fee: number;
  driver_commission: number;
  is_guaranteed: boolean;
  payment_status: string;
  amount_paid: number;
  advance_paid: number;
  status: string;
  pickup_date: string | null;
  started_at: string | null;
  completed_at: string | null;
  load_type: string | null;
  load_tons: number | null;
  notes: string | null;
  created_at: string | null;
  updated_at: string | null;
  pickup_lat: number | null;
  pickup_lon: number | null;
  drop_lat: number | null;
  drop_lon: number | null;
  owner_user_id: string | null;
  created_by_user_id: string | null;
  assigned_by_user_id: string | null;
  trip_payout_mode: string | null;
  operating_mode: string | null;
  dco_payee_id: string | null;
  last_location_at: string | null;
  actual_distance_traveled_km: number | null;
  last_location_chat_at: string | null;
}

export interface BundleAssignmentAuditRow {
  id: string;
  trip_id: string;
  event_type: string;
  driver_id_prev: string | null;
  driver_id_new: string | null;
  vehicle_id_prev: string | null;
  vehicle_id_new: string | null;
  changed_at: string;
  changed_by: string | null;
  driver_new_name: string | null;
  driver_prev_name: string | null;
  vehicle_new_label: string | null;
  vehicle_prev_label: string | null;
}

export interface BundleDriver {
  id: string;
  name: string | null;
  phone: string | null;
  avatar_url: string | null;
  avatar_seed: string | null;
  user_id: string | null;
  organization_id: string;
}

export interface BundleVehicle {
  id: string;
  vehicle_number: string;
  vehicle_type: string | null;
  capacity: string | null;
  vehicle_brand: string | null;
  vehicle_body_type: string | null;
  organization_id: string;
  supplier_id: string | null;
  status: string;
  documents: Record<string, unknown> | null;
}

export interface BundleLinkedOrg {
  id: string;
  logo_url: string | null;
  /** Org display name when included by get_trip_detail_bundle. */
  name?: string | null;
}

export interface BundleClient {
  id: string;
  name: string;
  phone: string | null;
  avatar_url: string | null;
  avatar_seed: string | null;
  linked_organization_id: string | null;
  organization_id: string;
  status: string | null;
}

export interface BundleSupplier {
  id: string;
  /** Canonical supplier display name (suppliers.name). */
  name?: string | null;
  company_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  avatar_seed: string | null;
  linked_organization_id: string | null;
  organization_id: string;
}

export interface BundleTransaction {
  id: string;
  organization_id: string;
  trip_id: string;
  party_name: string;
  description: string;
  amount_in: number;
  amount_out: number;
  transaction_date: string;
  created_at: string | null;
  contact_id: string | null;
  contact_type: string | null;
  ledger_entity_type: string | null;
  ledger_flow_type: string | null;
  ledger_category: string | null;
  created_by: string | null;
}

export interface BundleAdjustment {
  id: string;
  trip_id: string;
  organization_id: string;
  type: string;
  impact: string;
  amount: number;
  reason: string;
  mission_key: string | null;
  created_at: string;
  created_by: string | null;
  voided_at: string | null;
  void_reason: string | null;
}

export interface BundleDocument {
  id: string;
  trip_id: string;
  file_name: string;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  uploaded_at: string;
  uploaded_by: string | null;
  document_type: import('@/features/trips/services/tripDocuments.service').TripDocumentType;
  document_number?: string | null;
}

export interface BundleOtp {
  code: string;
  expires_at: string;
}

export interface BundleLatestLocation {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  recorded_at: string;
}

export interface TripDetailBundle {
  trip: BundleTrip;
  assignment_audit: BundleAssignmentAuditRow[];
  driver: BundleDriver | null;
  vehicle: BundleVehicle | null;
  client_detail: { client: BundleClient; linked_org: BundleLinkedOrg | null } | null;
  supplier_detail: { supplier: BundleSupplier; linked_org: BundleLinkedOrg | null } | null;
  transactions: BundleTransaction[];
  adjustments: BundleAdjustment[];
  documents: BundleDocument[];
  otp: BundleOtp | null;
  latest_driver_location: BundleLatestLocation | null;
}

// ── Fetcher ──────────────────────────────────────────────────────────────────

function emptyBundleFromTrip(trip: BundleTrip): TripDetailBundle {
  return {
    trip,
    assignment_audit: [],
    driver: null,
    vehicle: null,
    client_detail: null,
    supplier_detail: null,
    transactions: [],
    adjustments: [],
    documents: [],
    otp: null,
    latest_driver_location: null,
  };
}

async function fetchTripRowLight(
  tripId: string,
  signal?: AbortSignal,
): Promise<BundleTrip | null> {
  const { data, error } = await withAbortSignal(
    supabase().from('trips').select('*').eq('id', tripId),
    signal,
  ).maybeSingle();
  throwIfCancelled(signal, error);
  if (error || !data) return null;
  return data as BundleTrip;
}

/** Matches get_trip_detail_bundle documents[] LIMIT (Docs tab, not first paint). */
export const LIGHT_BUNDLE_DOC_LIMIT = 20;
/** Matches get_trip_detail_bundle transactions[] / adjustments[] LIMIT. */
export const LIGHT_BUNDLE_TX_LIMIT = 50;

const BUNDLE_TX_SELECT =
  "id, organization_id, trip_id, party_name, description, amount_in, amount_out, transaction_date, created_at, created_by, contact_id, contact_type, ledger_entity_type, ledger_flow_type, ledger_category";

const BUNDLE_ADJ_SELECT =
  "id, trip_id, organization_id, type, impact, amount, reason, mission_key, created_at, created_by, voided_at, void_reason";

async function fetchTripTransactionsForLightBundle(
  tripId: string,
  signal?: AbortSignal,
): Promise<BundleTransaction[]> {
  const { data, error } = await withAbortSignal(
    supabase()
      .from("transactions")
      .select(BUNDLE_TX_SELECT)
      .eq("trip_id", tripId)
      .order("transaction_date", { ascending: false })
      .limit(LIGHT_BUNDLE_TX_LIMIT),
    signal,
  );
  throwIfCancelled(signal, error);
  if (error || !data) return [];
  return data as BundleTransaction[];
}

async function fetchTripAdjustmentsForLightBundle(
  tripId: string,
  signal?: AbortSignal,
): Promise<BundleAdjustment[]> {
  const { data, error } = await withAbortSignal(
    supabase()
      .from("trip_finance_adjustments")
      .select(BUNDLE_ADJ_SELECT)
      .eq("trip_id", tripId)
      .order("created_at", { ascending: false })
      .limit(LIGHT_BUNDLE_TX_LIMIT),
    signal,
  );
  throwIfCancelled(signal, error);
  if (error || !data) return [];
  return data as BundleAdjustment[];
}

/** Table-only trip row. Documents wait until Docs; ledger until Finance. */
async function composeLightTripDetailBundle(
  tripId: string,
  signal?: AbortSignal,
): Promise<TripDetailBundle | null> {
  const light = await fetchTripRowLight(tripId, signal);
  if (!light) return null;
  return emptyBundleFromTrip(light);
}

export async function fetchLightTripDetailFinance(
  tripId: string,
  signal?: AbortSignal,
): Promise<{ transactions: BundleTransaction[]; adjustments: BundleAdjustment[] }> {
  const [transactions, adjustments] = await Promise.all([
    fetchTripTransactionsForLightBundle(tripId, signal),
    fetchTripAdjustmentsForLightBundle(tripId, signal),
  ]);
  return { transactions, adjustments };
}

/** Exported for focused tests: light vs RPC vs RPC-failure fallback. */
export async function fetchTripDetailBundle(
  tripId: string,
  viewerOrgId: string,
  signal?: AbortSignal,
  preferLight?: boolean,
): Promise<TripDetailBundle | null> {
  if (preferLight) {
    return composeLightTripDetailBundle(tripId, signal);
  }

  try {
    const { data, error } = await withAbortSignal(
      supabase().rpc('get_trip_detail_bundle', {
        p_trip_id: tripId,
        p_viewer_org_id: viewerOrgId,
      }),
      signal,
    );
    throwIfCancelled(signal, error);
    const bundle = (data as TripDetailBundle | null) ?? null;
    if (!error && bundle?.trip?.id) {
      return bundle;
    }
  } catch (err) {
    throwIfCancelled(
      signal,
      err && typeof err === 'object'
        ? (err as { message?: string; name?: string })
        : null,
    );
  }

  return composeLightTripDetailBundle(tripId, signal);
}

// ── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Fetches the trip detail bundle via RPC when ENABLE_TRIP_DETAIL_BUNDLE is true.
 * Returns undefined when the flag is off — callers fall through to legacy path.
 *
 * Stale time: 60s (matches org-level trip queries).
 * Does not auto-invalidate on realtime events — useTripDetail owns that via setTrip().
 * Invalidate manually via queryClient.invalidateQueries(queryKeys.trips.bundle(tripId))
 * after mutations (assignment, status change, finance entry).
 */
export function prefetchTripDetailBundle(
  queryClient: QueryClient,
  tripId: string,
  viewerOrgId: string,
): Promise<void> {
  const id = tripId.trim();
  const org = viewerOrgId.trim();
  if (!id || !org || !isBundleEnabled(org)) return Promise.resolve();
  return queryClient.prefetchQuery({
    queryKey: [...queryKeys.trips.bundle(id), "rpc"],
    queryFn: ({ signal }) => fetchTripDetailBundle(id, org, signal, false),
    staleTime: 60_000,
  });
}

export function peekTripDetailBundleCache(
  queryClient: QueryClient,
  tripId: string,
): TripDetailBundle | undefined {
  return (
    queryClient.getQueryData<TripDetailBundle>([
      ...queryKeys.trips.bundle(tripId),
      "light",
    ]) ??
    queryClient.getQueryData<TripDetailBundle>([
      ...queryKeys.trips.bundle(tripId),
      "rpc",
    ]) ??
    queryClient.getQueryData<TripDetailBundle>(queryKeys.trips.bundle(tripId))
  );
}

export function patchTripDetailBundleCache(
  queryClient: QueryClient,
  tripId: string,
  updater: (
    old: TripDetailBundle | null | undefined,
  ) => TripDetailBundle | null | undefined,
): void {
  const entries = queryClient.getQueriesData<TripDetailBundle>({
    queryKey: queryKeys.trips.bundle(tripId),
  });
  for (const [key] of entries) {
    queryClient.setQueryData(key, updater);
  }
}

export function useTripDetailBundleQuery(
  tripId: string | null,
  viewerOrgId: string | null,
  opts?: { preferLight?: boolean },
): { bundle: TripDetailBundle | null | undefined; isBundleLoading: boolean; bundleError: Error | null } {
  const preferLight = Boolean(opts?.preferLight);
  const { data, isLoading, error } = useQuery({
    queryKey: [...queryKeys.trips.bundle(tripId ?? ''), preferLight ? "light" : "rpc"],
    queryFn: ({ signal }) =>
      fetchTripDetailBundle(tripId!, viewerOrgId!, signal, preferLight),
    enabled: isBundleEnabled(viewerOrgId) && !!tripId && !!viewerOrgId,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    retry: shouldRetryQuery,
  });

  if (!isBundleEnabled(viewerOrgId)) {
    return { bundle: undefined, isBundleLoading: false, bundleError: null };
  }

  return {
    bundle: data ?? null,
    isBundleLoading: isLoading,
    bundleError: error as Error | null,
  };
}
