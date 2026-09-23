/**
 * Trips service — Supabase only (mobile). Same DB as pulse-unified-base.
 */
import {
    DEFAULT_PAGE_SIZE,
    DRIVER_TRIPS_PAGE_SIZE,
    type PageOpts,
} from "@/lib/pagination";
import { syncDomainRows } from "@/lib/cache/domainSync";
import { mergeDeltaRows } from "@/lib/cache/mergeDelta";
import type { DeltaResponse } from "@/lib/cache/deltaTypes";
import { supabase } from "@/lib/supabase";
import { TimeoutError, withTimeout } from "@/lib/authEngine";
import { getPlatformEventBus } from "@/lib/platform/events/InProcessEventBus";
import { uuidv7 } from "@/lib/uuidv7";
import { TRIP_REASSIGN_STALE_ERROR } from "@/features/trips/utils/tripReassignConflict.util";
import { shouldMarkAssignedOnFirstAssign } from "@/features/trips/utils/tripReassign.util";
import {
  applyIndentCommerceOrigin,
  indentIdsForCommerceLookup,
} from "@/features/trips/utils/applyIndentCommerceOrigin";
import {
  selectTripIndentLineageLabel,
  selectTripOperationalReference,
} from "@/features/operations/numbering";
import { getTripOperationalDisplayCode } from "@/features/operations/display";
import type { DriverTripRow, SupplierTripRow } from "@/types/trip-views";
import {
  driverRowToTripRow,
  tripRowToDriverTripRow,
} from "@/types/trip-views";
import { isDcoOperatingTrip } from "@/features/trips/domain/tripDcoOperating";
import { runSingleflight } from "@/lib/cache/singleflight";
import { shouldFallbackTripsTableScan } from "@/features/trips/utils/tripOrgFetch.util";

export type { DriverTripRow, SupplierTripRow } from "@/types/trip-views";
export { driverRowToTripRow, supplierRowToTripRow } from "@/types/trip-views";

export interface TripRow {
  id: string;
  organization_id: string;
  /**
   * Dispatching org's display name. Only populated on driver-side reads
   * (trips_driver_view resolves it because `organizations` RLS blocks drivers).
   */
  organization_name?: string | null;
  /** Operational identity code, e.g. GGV234-TRP-001 */
  trip_code?: string | null;
  /** Enterprise operational identity code, e.g. GGV234ABCTRIP000001 */
  trip_operational_code?: string | null;
  /** User-facing ID; DB trigger sets from display_trip_id when null. */
  trip_number: string;
  /** Per-org sequence; set by DB trigger. Used for TRP001 display. */
  sequence_number?: number | null;
  /** User-facing trip ID e.g. TRP001. Set by trigger from sequence_number. */
  display_trip_id?: string | null;
  /**
   * Per-driver sequential label (TRP### format, independent counter per driver).
   * Populated when `driver_id` is set; distinct from org-scoped `trip_number`.
   */
  driver_display_trip_id?: string | null;
  indent_id: string | null;
  source_indent_id?: string | null;
  source_indent_code?: string | null;
  indent_reference_code?: string | null;
  converted_from_indent_at?: string | null;
  converted_by?: string | null;
  source: string;
  pickup_area: string;
  drop_location: string;
  /** Optional legacy / synced column; UI may fall back when drop_location is empty. */
  drop_area?: string | null;
  /** From place search; optional. */
  pickup_lat?: number | null;
  pickup_lon?: number | null;
  drop_lat?: number | null;
  drop_lon?: number | null;
  /** Pre-calculated distance in km. Can come back from DB as numeric or string depending on serialization. */
  distance: string | number | null;
  estimated_duration: string | null;
  client_id: string | null;
  client_name: string;
  supplier_id: string | null;
  /** Ledger lane: `market` = supplier payable; `asset` = driver + vehicle. NULL = infer from supplier_id. */
  trip_payout_mode?: "market" | "asset" | string | null;
  /**
   * Who operates commercially: FLEET (org/supplier) or DCO (independent owner-operator).
   * Independent of execution_type and trip_payout_mode. See isDcoOperatingTrip().
   */
  operating_mode?: "FLEET" | "DCO" | string | null;
  /** DCO payee when operating_mode is DCO. Mutually exclusive with supplier_id. */
  dco_payee_id?: string | null;
  /** Explicit, dispatcher-captured execution model for a subcontracted trip. NULL = infer via getTripExecutionModel()'s legacy heuristic. Immutable once started_at is set. */
  execution_type?: "ASSET" | "AGGREGATE" | null;
  /** Optional; when set without supplier_id, used for supplier due/name matching (e.g. synced trips). */
  supplier_name?: string | null;
  driver_id: string | null;
  vehicle_id: string | null;
  /** Display name for driver when not resolved from drivers table (e.g. OTP-claimed trip, or cached at assignment). Fallback when associated driver fetch fails or is missing. */
  driver_display_name?: string | null;
  /** Cached vehicle number for display. Synced from vehicles when vehicle_id set; can be set ad-hoc when vehicle_id is null (aggregate trips). */
  vehicle_display_number?: string | null;
  /** Explicit Fleet Owner / Driver-cum-Owner vehicle link. Nullable until set via set_trip_owner_vehicle() — never inferred from ownership or vehicle count. */
  owner_vehicle_id?: string | null;
  client_price: number;
  supplier_rate: number;
  margin: number;
  platform_fee: number;
  driver_commission: number;
  is_guaranteed: boolean;
  payment_status: string;
  amount_paid: number;
  status: string;
  pickup_date: string | null;
  started_at: string | null;
  completed_at: string | null;
  load_type: string | null;
  /** Optional load weight in tons from Add Trip form. */
  load_tons?: number | null;
  /** Optional advance amount paid to supplier for this trip. */
  advance_paid?: number | null;
  /** Optional start odometer captured during operational verification. */
  start_odometer_km?: number | null;
  /** Optional end odometer captured during operational verification. */
  end_odometer_km?: number | null;
  /** Computed delta between start/end odometer. */
  odometer_distance_km?: number | null;
  /** GPS/route derived distance for comparison (non-blocking). */
  gps_distance_km?: number | null;
  /** Absolute discrepancy between odometer and GPS distance. */
  distance_discrepancy_km?: number | null;
  /** Source preference for distance (odometer/gps/hybrid/estimated). */
  distance_source?: string | null;
  /** Visual verification state, no workflow blocking. */
  odometer_verification_state?: string | null;
  /** Optional operational verification notes. */
  odometer_notes?: string | null;
  /** Audit fields for odometer updates. */
  odometer_updated_by?: string | null;
  odometer_updated_at?: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  /** Trip creator (auth.uid) when available. May be null for legacy rows. */
  created_by?: string | null;
  /** Sequential ID owner (auth.uid). Next TRP001 is per this user. */
  owner_user_id?: string | null;
  /** User who created this row. */
  created_by_user_id?: string | null;
  /** Dispatcher / user who assigned the driver (when set in DB). */
  assigned_by_user_id?: string | null;
  /** Optimistic revision for status/progress updates (monotonic). */
  status_revision?: number | null;
  /** Last actor who advanced status (auth.uid). */
  status_updated_by?: string | null;
  /** Last actor role who advanced status. */
  status_updated_role?: "driver" | "creator" | "system" | null;
  indent_number?: string | null;
  /** Originated from a Commerce (multi-order e-commerce) execution plan. Derived from the joined indent's execution_plan_id — no new column. */
  is_commerce?: boolean;
  /**
   * Resolved Commerce execution plan id. Like `is_commerce`, this is DERIVED at
   * read time from the joined indent (`source_indent` / `active_indent` /
   * `indents`) and normalized onto the row — `trips` itself has no such column.
   * Optional because only normalizeTripRowWithIndent() populates it.
   */
  execution_plan_id?: string | null;
  /** Globally unique booking reference assigned when a trip is created from an indent award (BKG-XXXXXX). */
  booking_ref?: string | null;
  /** Per-supplier-org sequence for indent-awarded trips (Job #N in supplier UI). */
  supplier_trip_sequence?: number | null;
  /**
   * Physical / hard-copy POD received timestamp.
   * Independent of digital `trip_documents` with document_type = pod.
   */
  pod_received_at?: string | null;
  /** Trip Compliance parallel workflow — see migration 20260915162440. */
  compliance_verified_at?: string | null;
  compliance_verified_by?: string | null;
  pod_hard_copy_courier?: string | null;
  pod_hard_copy_awb_number?: string | null;
  pod_hard_copy_received_by?: string | null;
}

type TripIndentJoin = {
  indent_operational_code?: string | null;
  indent_number: string | null;
  indent_code?: string | null;
  /** Set when the indent originated from a Commerce execution plan — see is_commerce below. */
  execution_plan_id?: string | null;
};

/** Nested indent embeds hit per-row RLS and time out with the 12s client fetch. */
const TRIP_SELECT_LIGHT = "*";

function normalizeTripRowWithIndent(
  row: TripRow & {
    active_indent?: TripIndentJoin | null;
    source_indent?: TripIndentJoin | null;
    indents?: TripIndentJoin | null;
  },
): TripRow {
  const indentDisplay =
    selectTripIndentLineageLabel(row) ??
    row.source_indent?.indent_operational_code ??
    row.source_indent?.indent_code ??
    row.source_indent?.indent_number ??
    row.active_indent?.indent_operational_code ??
    row.active_indent?.indent_code ??
    row.active_indent?.indent_number ??
    row.indents?.indent_operational_code ??
    row.indents?.indent_code ??
    row.indents?.indent_number ??
    row.indent_number ??
    null;
  const tripDisplay = selectTripOperationalReference(row);
  /** Originated from a Commerce (multi-order e-commerce) execution plan — no new column, existing FK. */
  const isCommerce = Boolean(
    row.execution_plan_id ??
      row.source_indent?.execution_plan_id ??
      row.active_indent?.execution_plan_id ??
      row.indents?.execution_plan_id,
  );
  const executionPlanId =
    (row.execution_plan_id ?? "").trim() ||
    (row.source_indent?.execution_plan_id ?? "").trim() ||
    (row.active_indent?.execution_plan_id ?? "").trim() ||
    (row.indents?.execution_plan_id ?? "").trim() ||
    null;
  return {
    ...row,
    trip_operational_code: row.trip_operational_code ?? null,
    trip_code: row.trip_code ?? null,
    trip_number: tripDisplay ?? row.trip_number,
    indent_number: indentDisplay,
    source_indent_code: indentDisplay,
    indent_reference_code: indentDisplay,
    execution_plan_id: executionPlanId,
    is_commerce: isCommerce,
  };
}

/** Fetch all trips visible to an org via RPC — includes cross-org supplier trips. Mirrors useTripsQuery. */
export async function getTripsForOrg(
  orgId: string,
): Promise<{ error: Error | null; trips: TripRow[] }> {
  return runSingleflight(`get_trips_for_org:${orgId}`, async () => {
    try {
      const { data, error } = await supabase().rpc("get_trips_for_org", {
        p_org_id: orgId,
      });
      if (!error) {
        const trips = ((data ?? []) as TripRow[]).map((row) =>
          normalizeTripRowWithIndent(row as TripRow & { indents?: TripIndentJoin | null }),
        );
        return { error: null, trips };
      }
      if (!shouldFallbackTripsTableScan(error)) {
        return { error: new Error(error.message), trips: [] };
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (!shouldFallbackTripsTableScan({ message })) {
        return { error: e instanceof Error ? e : new Error(message), trips: [] };
      }
    }
    return getTripsByOrganization(orgId);
  });
}

export type TripPartyCounts = {
  byClientId: Record<string, number>;
  bySupplierId: Record<string, number>;
  byDriverId: Record<string, number>;
};

/** Owner-org trip counts only — do not use `get_trips_for_org` for Network card badges. */
export async function getTripPartyCountsForOrg(
  orgId: string,
): Promise<{ error: Error | null; counts: TripPartyCounts }> {
  const empty: TripPartyCounts = {
    byClientId: {},
    bySupplierId: {},
    byDriverId: {},
  };
  if (!orgId) return { error: null, counts: empty };
  const { data, error } = await supabase()
    .from("trips")
    .select("client_id, supplier_id, driver_id")
    .eq("organization_id", orgId)
    .is("deleted_at", null)
    .limit(2000);
  if (error) return { error: new Error(error.message), counts: empty };
  const counts: TripPartyCounts = {
    byClientId: {},
    bySupplierId: {},
    byDriverId: {},
  };
  for (const row of data ?? []) {
    const clientId = (row as { client_id?: string | null }).client_id?.trim();
    const supplierId = (row as { supplier_id?: string | null }).supplier_id?.trim();
    const driverId = (row as { driver_id?: string | null }).driver_id?.trim();
    if (clientId) counts.byClientId[clientId] = (counts.byClientId[clientId] ?? 0) + 1;
    if (supplierId) {
      counts.bySupplierId[supplierId] = (counts.bySupplierId[supplierId] ?? 0) + 1;
    }
    if (driverId) counts.byDriverId[driverId] = (counts.byDriverId[driverId] ?? 0) + 1;
  }
  return { error: null, counts };
}

export async function getTripsByOrganization(
  orgId: string,
  opts?: PageOpts,
): Promise<{ error: Error | null; trips: TripRow[]; hasMore?: boolean }> {
  const q = supabase()
    .from("trips")
    .select(TRIP_SELECT_LIGHT)
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false });

  const processData = (data: unknown[] | null) => {
    return (data ?? []).map((row) =>
      normalizeTripRowWithIndent(
        row as TripRow & {
          active_indent?: TripIndentJoin | null;
          source_indent?: TripIndentJoin | null;
        },
      ),
    ) as TripRow[];
  };

  if (opts != null) {
    const limit = opts.limit ?? DEFAULT_PAGE_SIZE;
    const offset = opts.offset ?? 0;
    const from = offset;
    const to = offset + limit;
    const { data, error } = await q.range(from, to);
    if (error) return { error: new Error(error.message), trips: [] };
    const trips = processData(data);
    const hasMore = trips.length > limit;
    const resultTrips = hasMore ? trips.slice(0, limit) : trips;
    return { error: null, trips: resultTrips, hasMore };
  }

  const { data, error } = await q.limit(200);
  if (error) return { error: new Error(error.message), trips: [] };
  return { error: null, trips: processData(data) };
}

export async function getTripsDelta(
  orgId: string,
  since: { updatedAt: string; tieBreakerId?: string | null },
): Promise<{ error: Error | null; delta: DeltaResponse<TripRow> }> {
  const { data, error } = await supabase().rpc("get_trips_delta", {
    p_org_id: orgId,
    p_since: since.updatedAt,
    p_limit: 1000,
  });
  if (error) {
    return {
      error: new Error(error.message),
      delta: { changed: [], deletedIds: [], nextCursor: since },
    };
  }
  const row = (Array.isArray(data) ? data[0] : data) as
    | { changed?: TripRow[]; deleted_ids?: string[]; next_cursor?: string | null }
    | null;
  return {
    error: null,
    delta: {
      changed: ((row?.changed ?? []) as TripRow[]).map((trip) =>
        normalizeTripRowWithIndent(trip as TripRow & { indents?: TripIndentJoin | null }),
      ),
      deletedIds: (row?.deleted_ids ?? []) as string[],
      nextCursor: row?.next_cursor ? { updatedAt: row.next_cursor } : since,
    },
  };
}

export async function syncTripsWithCache(
  orgId: string,
  currentRows: TripRow[],
): Promise<{ error: Error | null; trips: TripRow[] }> {
  try {
    const trips = await syncDomainRows<TripRow>({
      domain: "trips",
      orgId,
      schemaVersion: "1",
      policy: { maxDeltaLagMs: 2 * 60_000, fullSyncEveryMs: 6 * 60 * 60_000 },
      currentRows,
      getFull: async () => {
        const res = await getTripsByOrganization(orgId);
        if (res.error) throw res.error;
        return res.trips;
      },
      getDelta: async (cursor) => {
        const res = await getTripsDelta(orgId, cursor);
        if (res.error) throw res.error;
        return res.delta;
      },
      merge: (existing, delta) =>
        mergeDeltaRows({
          existing,
          changed: delta.changed,
          deletedIds: delta.deletedIds,
          compare: (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        }),
    });
    return { error: null, trips };
  } catch (e) {
    return { error: e instanceof Error ? e : new Error(String(e)), trips: currentRows };
  }
}

/**
 * Load-based trips where the given org is the client (via clients.linked_organization_id).
 * Used when the logged-in org is the client so they can see shared load trips in Compare & Verify with the supplier (trip owner).
 * Uses RPC get_trips_where_org_is_client because clients RLS only shows clients in the caller's org; the client row
 * that represents "us" may live in the supplier's org, so we must not rely on reading clients first.
 */
export async function getTripsWhereOrgIsClient(orgId: string): Promise<{
  error: Error | null;
  trips: TripRow[];
}> {
  const { data, error } = await supabase().rpc(
    "get_trips_where_org_is_client",
    {
      p_org_id: orgId,
    },
  );
  if (error) return { error: new Error(error.message), trips: [] };
  const trips = ((data ?? []) as TripRow[]).map((row) =>
    normalizeTripRowWithIndent(row as TripRow & { indents?: TripIndentJoin | null }),
  );
  return { error: null, trips };
}

/**
 * Load-based trips where the given org is the supplier (via suppliers.linked_organization_id).
 * Used when the logged-in org is the supplier (Load Hub / Staff Handshake) so they see
 * only shared load trips they supply in Trips Control and can open trip detail.
 */
export async function getTripsWhereOrgIsSupplier(orgId: string): Promise<{
  error: Error | null;
  trips: SupplierTripRow[];
}> {
  const { data, error } = await supabase().rpc(
    "get_trips_where_org_is_supplier",
    { p_org_id: orgId },
  );
  if (error) return { error: new Error(error.message), trips: [] };
  const trips = (data ?? []) as SupplierTripRow[];
  return { error: null, trips };
}

/**
 * For Trips Control when org is the supplier: map trip_id -> shipper (trip owner) display name.
 * So the supplier sees their client (e.g. Mukunt) as "Client", not the end customer (Mukunt's client).
 */
export async function getShipperDisplayNamesForSupplierTrips(
  orgId: string,
): Promise<{
  error: Error | null;
  shipperNameByTripId: Record<string, string>;
}> {
  const { data, error } = await supabase().rpc(
    "get_shipper_display_names_for_supplier_trips",
    { p_org_id: orgId },
  );
  if (error)
    return { error: new Error(error.message), shipperNameByTripId: {} };
  const rows = (data ?? []) as {
    trip_id: string;
    shipper_display_name: string | null;
  }[];
  const shipperNameByTripId: Record<string, string> = {};
  for (const r of rows) {
    if (r?.trip_id)
      shipperNameByTripId[r.trip_id] =
        (r.shipper_display_name ?? "").trim() || "Client";
  }
  return { error: null, shipperNameByTripId };
}

/** Display label for a trip (TRP001-style when present). */
/**
 * Returns the human-readable trip identifier.
 * For cross-org supplier trips (trip owned by another org), returns the globally-unique
 * booking_ref (BKG-XXXXXX) to avoid org-local trip_number/indent_number collisions.
 * Every org's first trip = TRP001, every org's first indent = IND001 — only booking_ref is global.
 */
export function getTripDisplayNumber(
  row: TripRow | SupplierTripRow,
  viewerOrgId?: string | null,
): string {
  if (!("trip_number" in row)) {
    return row.booking_ref?.trim() || row.id;
  }
  if (
    viewerOrgId &&
    row.organization_id &&
    row.organization_id !== viewerOrgId &&
    row.booking_ref
  ) {
    return row.booking_ref;
  }
  return getTripOperationalDisplayCode(row);
}

/**
 * Optional secondary label under the trip number on hub tiles.
 * Distinguishes the mover's own asset job from the aggregator's settlement tile
 * when both appear in the mover's list (same TRP display code).
 */
export function getTripDisplayMeta(
  row: TripRow | SupplierTripRow,
  viewerOrgId?: string | null,
): { secondaryLabelKey?: "tripHubLabelMoverAsset" | "tripHubLabelSettlement" | "tripHubLabelJob"; secondaryLabel?: string } {
  if (!("organization_id" in row)) {
    if (row.supplier_trip_sequence != null && row.supplier_trip_sequence > 0) {
      return {
        secondaryLabelKey: "tripHubLabelJob",
        secondaryLabel: `Job #${row.supplier_trip_sequence}`,
      };
    }
    return {};
  }
  const source = String((row as TripRow).source ?? "").trim().toLowerCase();
  if (source === "mover_asset") {
    return { secondaryLabelKey: "tripHubLabelMoverAsset" };
  }
  if (
    viewerOrgId &&
    row.organization_id &&
    row.organization_id !== viewerOrgId
  ) {
    if (row.supplier_trip_sequence != null && row.supplier_trip_sequence > 0) {
      return {
        secondaryLabelKey: "tripHubLabelJob",
        secondaryLabel: `Job #${row.supplier_trip_sequence}`,
      };
    }
    return { secondaryLabelKey: "tripHubLabelSettlement" };
  }
  return {};
}

/**
 * For a mover viewing an aggregator's shared trip: find the mover's own
 * `mover_asset` trip for the same load, so the detail screen can redirect to
 * the trip that actually carries the Expense Hub. Mirrors the hide-clause in
 * get_trips_for_org (m.source='mover_asset' AND m.source_indent_id=tr.indent_id).
 * Returns null when none exists (e.g. asset trip not created yet).
 */
export async function getMoverAssetTripIdForIndent(
  moverOrgId: string,
  indentId: string,
  signal?: AbortSignal,
): Promise<string | null> {
  if (!moverOrgId || !indentId) return null;
  const query = supabase()
    .from("trips")
    .select("id")
    .eq("organization_id", moverOrgId)
    .eq("source", "mover_asset")
    .eq("source_indent_id", indentId)
    .is("deleted_at", null)
    .limit(1);
  const { data, error } = await (signal ? query.abortSignal(signal) : query).maybeSingle();
  if (error || !data) return null;
  return (data as { id: string }).id ?? null;
}

/**
 * Replace this trip's UUID in Postgres/RPC error strings with TRP-style labels so users never see raw IDs.
 */
export function humanizeTripIdInRpcError(message: string, trip: TripRow): string {
  const id = trip.id?.trim();
  if (!id || !message) return message;
  const label = getTripDisplayNumber(trip);
  const re = new RegExp(id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
  return message.replace(re, label);
}

/**
 * Driver-facing label: per-driver TRP### from `driver_display_trip_id` when set.
 * Falls back to org trip_number only if not yet assigned (e.g. unassigned trip).
 */
export function resolveDriverFacingTripLabel(row: TripRow): string {
  const perDriver = row.driver_display_trip_id?.trim();
  if (perDriver) return perDriver;
  return getTripOperationalDisplayCode(row);
}

export async function getTripById(
  tripId: string,
): Promise<{ error: Error | null; trip: TripRow | null }> {
  const { data, error } = await supabase()
    .from("trips")
    .select(TRIP_SELECT_LIGHT)
    .eq("id", tripId)
    .maybeSingle();
  if (error) return { error: new Error(error.message), trip: null };
  const raw = data as
    | (TripRow & {
        active_indent?: TripIndentJoin | null;
        source_indent?: TripIndentJoin | null;
      })
    | null;
  const trip: TripRow | null = raw ? normalizeTripRowWithIndent(raw) : null;
  return { error: null, trip };
}

/** Batched form of getTripById — one round trip for N trips instead of N. */
export async function getTripsByIds(
  tripIds: string[],
): Promise<{ error: Error | null; trips: TripRow[] }> {
  if (tripIds.length === 0) return { error: null, trips: [] };
  const { data, error } = await supabase()
    .from("trips")
    .select(TRIP_SELECT_LIGHT)
    .in("id", tripIds);
  if (error) return { error: new Error(error.message), trips: [] };
  const raw = (data ?? []) as (TripRow & {
    active_indent?: TripIndentJoin | null;
    source_indent?: TripIndentJoin | null;
  })[];
  return { error: null, trips: raw.map((row) => normalizeTripRowWithIndent(row)) };
}

/** Driver-safe trip fetch (trips_driver_view). */
export async function getDriverTripById(
  tripId: string,
): Promise<{ error: Error | null; trip: DriverTripRow | null }> {
  const { data, error } = await supabase()
    .from("trips_driver_view")
    .select("*")
    .eq("id", tripId)
    .maybeSingle();
  if (error) return { error: new Error(error.message), trip: null };
  return { error: null, trip: (data as DriverTripRow | null) ?? null };
}

/** Trip row without indent embeds — safe for driver operations summaries under indent RLS. */
export async function getTripRowByIdLight(
  tripId: string,
  signal?: AbortSignal,
): Promise<{ error: Error | null; trip: TripRow | null }> {
  const query = supabase().from("trips").select("*").eq("id", tripId);
  const { data, error } = await (signal ? query.abortSignal(signal) : query).maybeSingle();
  if (error) return { error: new Error(error.message), trip: null };
  // 0 rows is not an error: the row may be RLS-invisible (expired/anon session,
  // cross-org). Callers distinguish transport error (throw + report) from a
  // null trip (empty state); collapsing "not found" into .error threw a false
  // "Trip not found" into Sentry (GX-PULSE-7). Return null trip, no error.
  if (!data) return { error: null, trip: null };
  return { error: null, trip: normalizeTripRowWithIndent(data as TripRow) };
}

/**
 * Trip load for shared ops/verification routes used by both office and drivers.
 *
 * Prefer the light `trips` select (no indent embeds — those fail under driver
 * indent RLS and surface as "Trip not found"). Fall back to `trips_driver_view`
 * when the row is invisible on `trips`.
 */
export async function getAccessibleTripById(
  tripId: string,
): Promise<{ error: Error | null; trip: TripRow | null }> {
  const light = await getTripRowByIdLight(tripId);
  if (light.error) return light;
  if (light.trip) return light;

  const driver = await getDriverTripById(tripId);
  if (driver.error) return { error: driver.error, trip: null };
  if (driver.trip) return { error: null, trip: driverRowToTripRow(driver.trip) };
  return { error: null, trip: null };
}

/** Latest trip row for an indent (direct-quote / Staff Handshake recovery). */
export async function getTripByIndentId(
  indentId: string,
): Promise<{ error: Error | null; trip: TripRow | null }> {
  const { data, error } = await supabase()
    .from("trips")
    .select(TRIP_SELECT_LIGHT)
    .eq("indent_id", indentId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return { error: new Error(error.message), trip: null };
  const raw = data as
    | (TripRow & {
        active_indent?: TripIndentJoin | null;
        source_indent?: TripIndentJoin | null;
      })
    | null;
  const trip: TripRow | null = raw ? normalizeTripRowWithIndent(raw) : null;
  return { error: null, trip };
}

/**
 * Driver rejects/declines an assigned trip.
 *
 * Backend contract: RPC `driver_reject_trip(p_trip_id uuid)` that:
 * - verifies current user owns the assigned driver row
 * - sets trips.driver_id = null (unassign)
 * - records an assignment-audit row so the fleet can see the decline
 */
export async function driverRejectTrip(
  tripId: string,
): Promise<{ error: Error | null; trip: TripRow | null }> {
  const { error } = await supabase().rpc("driver_reject_trip", {
    p_trip_id: tripId,
  });
  if (error) return { error: new Error(error.message), trip: null };
  // Fetch updated row for local UI consistency (RPC may not return the trip row).
  const refreshed = await getDriverTripById(tripId);
  return {
    error: null,
    trip: refreshed.trip ? driverRowToTripRow(refreshed.trip) : null,
  };
}

/**
 * Decline a phone-assigned trip before OTP claim (drivers.user_id IS NULL).
 * driver_reject_trip() cannot authorize this state (d.user_id = auth.uid()
 * never matches while unclaimed) — this RPC authorizes via the caller's own
 * registered phone matching the assigned driver's phone_normalised instead,
 * the same identity model claim_trip_by_otp() already uses. Do not call this
 * for an already-claimed driver; the RPC itself refuses that case.
 */
export async function driverDeclinePendingAssignment(
  tripId: string,
): Promise<{ error: Error | null; trip: TripRow | null }> {
  const { data, error } = await supabase().rpc(
    "driver_decline_pending_assignment",
    { p_trip_id: tripId },
  );
  if (error) return { error: new Error(error.message), trip: null };
  const obj = data as { ok?: boolean; error?: string } | null;
  if (!obj || obj.ok !== true) {
    return {
      error: new Error(obj?.error ?? "Could not decline. Try again."),
      trip: null,
    };
  }
  const refreshed = await getDriverTripById(tripId);
  return {
    error: null,
    trip: refreshed.trip ? driverRowToTripRow(refreshed.trip) : null,
  };
}

/** Trips assigned to a driver (driver app). RLS must allow driver to SELECT where driver_id = self. */
export async function getTripsByDriver(
  driverId: string,
  opts?: PageOpts,
): Promise<{ error: Error | null; trips: TripRow[]; hasMore?: boolean }> {
  const base = () =>
    supabase()
      .from("trips")
      .select("*")
      .eq("driver_id", driverId)
      .order("created_at", { ascending: false });
  if (opts != null) {
    const limit = opts.limit ?? DRIVER_TRIPS_PAGE_SIZE;
    const offset = opts.offset ?? 0;
    const { data, error } = await base().range(offset, offset + limit);
    if (error) return { error: new Error(error.message), trips: [] };
    const raw = ((data ?? []) as TripRow[]).map((row) =>
      normalizeTripRowWithIndent(row as TripRow & { indents?: TripIndentJoin | null }),
    );
    const hasMore = raw.length > limit;
    return { error: null, trips: hasMore ? raw.slice(0, limit) : raw, hasMore };
  }
  const { data, error } = await base();
  if (error) return { error: new Error(error.message), trips: [] };
  const trips = ((data ?? []) as TripRow[]).map((row) =>
    normalizeTripRowWithIndent(row as TripRow & { indents?: TripIndentJoin | null }),
  );
  return { error: null, trips };
}

const DRIVER_TRIP_FALLBACK_COLUMNS = [
  "id",
  "driver_id",
  "driver_display_trip_id",
  "trip_number",
  "status",
  "source",
  "pickup_area",
  "drop_location",
  "pickup_date",
  "pickup_lat",
  "pickup_lon",
  "drop_lat",
  "drop_lon",
  "notes",
  "vehicle_id",
  "started_at",
  "created_at",
  "updated_at",
  "client_price",
  "supplier_rate",
  "driver_commission",
  "distance",
  "supplier_id",
  // Required by the driver wallet's fleet-vs-open classification. Keep in sync
  // with trips_driver_view — see 20270118000000_driver_view_expose_org_and_source.
  "organization_id",
  "completed_at",
  "indent_id",
  // Needed to pair an awarded load's two rows so the driver's list shows the job
  // once — see dedupeDriverTripsForDriverOrgs.
  "source_indent_id",
  "owner_vehicle_id",
  "operating_mode",
  "dco_payee_id",
  // NOTE: organization_name is deliberately NOT fetched here. `trips` has no such
  // column and embedding `organizations(name)` fails outright for drivers
  // ("permission denied for function is_org_member"), which would break the whole
  // query. Only trips_driver_view can supply the name — this fallback leaves it
  // null and the wallet falls back to a generic label.
].join(",");

async function getTripsByDriverIdsFromTripsTable(
  driverIds: string[],
  opts?: PageOpts,
  driverOrgIds?: Set<string>,
): Promise<{ error: Error | null; trips: DriverTripRow[]; hasMore?: boolean }> {
  const orgIds = driverOrgIds ?? new Set<string>();
  const base = () =>
    supabase()
      .from("trips")
      .select(DRIVER_TRIP_FALLBACK_COLUMNS)
      .in("driver_id", driverIds)
      .order("created_at", { ascending: false });
  if (opts != null) {
    const limit = opts.limit ?? DRIVER_TRIPS_PAGE_SIZE;
    const offset = opts.offset ?? 0;
    const { data, error } = await base().range(offset, offset + limit);
    if (error) return { error: new Error(error.message), trips: [] };
    const raw = ((data ?? []) as unknown as TripRow[]).map(tripRowToDriverTripRow);
    const hasMore = raw.length > limit;
    const page = hasMore ? raw.slice(0, limit) : raw;
    return {
      error: null,
      trips: dedupeDriverTripsForDriverOrgs(page, orgIds),
      hasMore,
    };
  }
  const { data, error } = await base();
  if (error) return { error: new Error(error.message), trips: [] };
  const raw = ((data ?? []) as unknown as TripRow[]).map(tripRowToDriverTripRow);
  return { error: null, trips: dedupeDriverTripsForDriverOrgs(raw, orgIds) };
}

/**
 * Collapse an awarded load's two rows down to the one the DRIVER should see.
 *
 * An awarded load creates two trips (docs/TRIP_VARIANTS.md §4): the middleman's
 * money row (`source = 'direct_quote'`, linked via `indent_id`) and the mover's
 * work row (`source = 'mover_asset'`, linked via `source_indent_id`). The mover's
 * driver is stamped on BOTH — on the middleman's row purely so the broker can
 * track who is carrying its client's goods.
 *
 * Querying by `driver_id` alone therefore returns the same physical job twice,
 * and the driver's history listed it as two trips (and would count it twice in
 * any per-row earnings sum). Keep only rows owned by an org the driver actually
 * belongs to; if a pair still survives (driver legitimately has rows in both
 * orgs), prefer the `mover_asset` half — that's the one carrying their payout.
 *
 * Rows with no `organization_id` (the fallback cannot always supply one) are kept
 * rather than dropped: losing a real trip is worse than showing an extra one.
 *
 * The org filter is applied PER LOAD, not globally, for the same reason. Some
 * awarded loads have only the broker's row and no `mover_asset` half (verified:
 * 2 drivers platform-wide are in exactly this state — their trip sits in an org
 * they don't belong to). Filtering globally would erase their only trip. So a
 * load falls back to its own rows when the org filter would leave it empty, and
 * a driver never ends up with fewer loads than before — only fewer duplicates.
 */
function dedupeDriverTripsForDriverOrgs<
  T extends {
    organization_id?: string | null;
    source?: string | null;
    indent_id?: string | null;
    source_indent_id?: string | null;
  },
>(rows: T[], driverOrgIds: Set<string>): T[] {
  const isOwnOrg = (r: T): boolean => {
    if (driverOrgIds.size === 0) return true;
    const org = String(r.organization_id ?? "").trim();
    return org === "" || driverOrgIds.has(org);
  };
  const isMover = (r: T): boolean =>
    String(r.source ?? "").trim().toLowerCase() === "mover_asset";

  // Group by load so the choice is made within a load, never across loads.
  const byLoad = new Map<string, T[]>();
  const kept = new Set<T>();
  for (const row of rows) {
    const loadKey = String(row.source_indent_id ?? row.indent_id ?? "").trim();
    if (loadKey === "") {
      // Standalone trip (manual/local). Only the org filter applies.
      if (isOwnOrg(row)) kept.add(row);
      continue;
    }
    const bucket = byLoad.get(loadKey);
    if (bucket == null) byLoad.set(loadKey, [row]);
    else bucket.push(row);
  }

  for (const bucket of byLoad.values()) {
    // Prefer rows in the driver's own org; if that leaves nothing, keep the
    // load's rows anyway so the trip never disappears from the driver's history.
    const own = bucket.filter(isOwnOrg);
    const pool = own.length > 0 ? own : bucket;
    // Within the surviving rows, the mover_asset half is the driver's own record.
    kept.add(pool.find(isMover) ?? pool[0]);
  }

  // Rebuild in the caller's original order (created_at DESC).
  return rows.filter((r) => kept.has(r));
}

/** Trips assigned to any of the given driver ids (driver app: user may have multiple driver rows across orgs). */
export async function getTripsByDriverIds(
  driverIds: string[],
  opts?: PageOpts,
): Promise<{ error: Error | null; trips: DriverTripRow[]; hasMore?: boolean }> {
  if (driverIds.length === 0) return { error: null, trips: [] };
  // Orgs these driver rows belong to — used to drop other orgs' copies of the
  // same load (see dedupeDriverTripsForDriverOrgs). Best-effort: if this read
  // fails the set stays empty and no org filtering is applied, which is the
  // pre-existing behavior.
  const driverOrgIds = new Set<string>();
  try {
    const { data: driverRows } = await supabase()
      .from("drivers")
      .select("organization_id")
      .in("id", driverIds);
    for (const r of (driverRows ?? []) as { organization_id?: string | null }[]) {
      const org = String(r.organization_id ?? "").trim();
      if (org !== "") driverOrgIds.add(org);
    }
  } catch {
    // leave driverOrgIds empty
  }
  const base = () =>
    supabase()
      .from("trips_driver_view")
      .select("*")
      .in("driver_id", driverIds)
      .order("created_at", { ascending: false });
  if (opts != null) {
    const limit = opts.limit ?? DRIVER_TRIPS_PAGE_SIZE;
    const offset = opts.offset ?? 0;
    const { data, error } = await base().range(offset, offset + limit);
    if (error) {
      const fallback = await getTripsByDriverIdsFromTripsTable(driverIds, opts);
      return fallback.error ? { error: new Error(error.message), trips: [] } : fallback;
    }
    const raw = (data ?? []) as DriverTripRow[];
    if (raw.length === 0) {
      return getTripsByDriverIdsFromTripsTable(driverIds, opts, driverOrgIds);
    }
    // hasMore is computed from the RAW page (what the server had) so paging still
    // advances correctly when dedupe removes rows from this page.
    const hasMore = raw.length > limit;
    const page = hasMore ? raw.slice(0, limit) : raw;
    return {
      error: null,
      trips: dedupeDriverTripsForDriverOrgs(page, driverOrgIds),
      hasMore,
    };
  }
  const { data, error } = await base();
  if (error) {
    const fallback = await getTripsByDriverIdsFromTripsTable(driverIds, opts, driverOrgIds);
    return fallback.error ? { error: new Error(error.message), trips: [] } : fallback;
  }
  const raw = (data ?? []) as DriverTripRow[];
  if (raw.length === 0) {
    return getTripsByDriverIdsFromTripsTable(driverIds, opts, driverOrgIds);
  }
  return { error: null, trips: dedupeDriverTripsForDriverOrgs(raw, driverOrgIds) };
}

/** Cheap indent.execution_plan_id lookup — never Primitive A. */
async function stampCommerceOriginOnTripRows(trips: TripRow[]): Promise<TripRow[]> {
  const indentIds = indentIdsForCommerceLookup(trips);
  if (indentIds.length === 0) {
    return applyIndentCommerceOrigin(trips, []);
  }
  const { data, error } = await supabase()
    .from("indents")
    .select("id, execution_plan_id")
    .in("id", indentIds);
  if (error || !data) {
    return applyIndentCommerceOrigin(trips, []);
  }
  return applyIndentCommerceOrigin(
    trips,
    data as Array<{ id: string; execution_plan_id?: string | null }>,
  );
}

/** Legacy driver screens: safe read via view, mapped to TripRow for UI. */
export async function getDriverUiTripsByDriverIds(
  driverIds: string[],
  opts?: PageOpts,
): Promise<{ error: Error | null; trips: TripRow[]; hasMore?: boolean }> {
  const res = await getTripsByDriverIds(driverIds, opts);
  if (res.error) return { error: res.error, trips: [] };
  const trips = await stampCommerceOriginOnTripRows(
    res.trips.map(driverRowToTripRow),
  );
  return {
    error: null,
    trips,
    hasMore: res.hasMore,
  };
}

/** Create trip payload. Manual trip: pickup, drop, client, prices. */
export interface CreateTripData {
  /**
   * When set (valid UUID), inserted row uses this id so shared-ledger `reference_id`
   * and local `trips.id` stay aligned (e.g. partner-only / ghost trip sync).
   */
  id?: string;
  pickup_area: string;
  drop_location: string;
  /** From place search; optional. */
  pickup_lat?: number | null;
  pickup_lon?: number | null;
  drop_lat?: number | null;
  drop_lon?: number | null;
  /** Pre-calculated route distance (km) for `trips.distance` (numeric). */
  distance?: number | null;
  /** Pre-calculated ETA for `trips.estimated_duration` (interval-compatible string). */
  estimated_duration?: string | null;
  client_name: string;
  client_id?: string | null;
  client_price?: number;
  sale_rate_basis?: "per_mt" | "per_trip" | null;
  sale_unit_rate?: number | null;
  lane_id?: string | null;
  indent_id?: string | null;
  supplier_rate?: number;
  notes?: string | null;
  pickup_date?: string | null;
  /** Optional load weight in tons (stored in trips.load_tons). */
  load_tons?: number | null;
  /** Cargo / product type (trips.load_type). */
  load_type?: string | null;
  /** Optional advance paid to supplier (stored in trips.advance_paid). */
  advance_paid?: number | null;
  supplier_id?: string | null;
  /** Denormalized label for UI (trips.supplier_name); optional but improves lists/detail. */
  supplier_name?: string | null;
  /** When omitted, set from supplier_id (aggregate → market, asset → asset). */
  trip_payout_mode?: "market" | "asset" | null;
  driver_id?: string | null;
  vehicle_id?: string | null;
  /** Ad-hoc vehicle number for aggregate trips (when vehicle_id is null). */
  vehicle_display_number?: string | null;
  /** Sequential ID owner (auth.uid). Next TRP001 is per this user. */
  owner_user_id?: string | null;
  /** User who created this row. */
  created_by_user_id?: string | null;
  /** When set, used instead of default `assigned` (e.g. completed historical attribution). */
  status?: string;
  started_at?: string | null;
  completed_at?: string | null;
  /**
   * Skip driver/vehicle single-active-trip preflight.
   * Used when recording a past trip that should not block live assignments.
   */
  skipAssignmentConflictCheck?: boolean;
  /** Driver's commission % (e.g. 10 = 10%). Stamped onto trips.driver_commission at creation. */
  driver_commission_percent?: number | null;
  /** Driver's per-km rate. Used only when commission_percent is absent. */
  driver_commission_per_km?: number | null;
}

type PostgrestLikeError = {
  message: string;
  details?: string | null;
  hint?: string | null;
  code?: string | null;
};

function buildPostgrestErrorMessage(error: PostgrestLikeError): string {
  const parts = [error.message, error.details ?? "", error.hint ?? ""].filter(
    Boolean,
  );
  const joined = parts.join(" — ");
  const code = (error.code ?? "").trim();
  return code ? `${joined} [${code}]` : joined;
}

async function ensurePublicUserRecord(userId?: string | null): Promise<void> {
  const id = (userId ?? "").trim();
  if (!id) return;

  const { error } = await supabase().from("users").upsert(
    {
      id,
      name: "User",
    },
    { onConflict: "id" },
  );

  if (error) {
    const msg = (error.message ?? "").toLowerCase();
    // Keep compatibility with DBs where users table is not writable/readable from client.
    if (
      msg.includes("relation") ||
      msg.includes("permission denied") ||
      msg.includes("policy")
    ) {
      return;
    }
    // Never block trip creation: insert uses FK fallbacks; upsert can fail on transient/network quirks.
    if (__DEV__) {
      console.warn(
        "[ensurePublicUserRecord] users upsert skipped:",
        error.message,
      );
    }
  }
}

const ONGOING_TRIP_TERMINAL_STATUSES = [
  "completed",
  "cancelled",
  "done",
  "delivered",
] as const;

/**
 * Any trip for this driver that is not in a terminal status counts as blocking further assignment.
 * excludeTripId skips the trip being edited so reassignment/unassign workflows keep working.
 */
export async function getDriverOngoingTrip(
  driverId: string,
  excludeTripId?: string,
): Promise<{
  error: Error | null;
  trip: Pick<TripRow, "id" | "trip_number" | "trip_code" | "status" | "started_at"> | null;
}> {
  let q = supabase()
    .from("trips")
    // Keep this select compatible with DBs that do not expose display_trip_id yet.
    .select("id, trip_number, trip_code, status, started_at")
    .eq("driver_id", driverId)
    .not("status", "in", `("${ONGOING_TRIP_TERMINAL_STATUSES.join('","')}")`)
    .order("updated_at", { ascending: false })
    .limit(20);
  if (excludeTripId != null && excludeTripId.trim() !== "") {
    q = q.neq("id", excludeTripId);
  }
  const { data, error } = await q;
  if (error) return { error: new Error(error.message), trip: null };
  const rows = (data ?? []) as Pick<
    TripRow,
    "id" | "trip_number" | "trip_code" | "status" | "started_at"
  >[];
  // Single-active-trip rule: any non-terminal trip blocks a new assignment immediately.
  return { error: null, trip: rows[0] ?? null };
}

/**
 * First non-terminal trip for this driver (includes `assigned`, `draft`, etc.).
 * Used for create-trip preflight: dispatcher should not assign a number that already
 * has an open trip, even if the driver has not started it yet.
 */
async function getDriverAnyOpenTrip(
  driverId: string,
  excludeTripId?: string,
): Promise<{
  error: Error | null;
  trip: Pick<TripRow, "id" | "trip_number" | "trip_code" | "status" | "started_at"> | null;
}> {
  let q = supabase()
    .from("trips")
    .select("id, trip_number, trip_code, status, started_at")
    .eq("driver_id", driverId)
    .not("status", "in", `("${ONGOING_TRIP_TERMINAL_STATUSES.join('","')}")`)
    .order("updated_at", { ascending: false })
    .limit(20);
  if (excludeTripId != null && excludeTripId.trim() !== "") {
    q = q.neq("id", excludeTripId);
  }
  const { data, error } = await q;
  if (error) return { error: new Error(error.message), trip: null };
  const rows = (data ?? []) as Pick<
    TripRow,
    "id" | "trip_number" | "trip_code" | "status" | "started_at"
  >[];
  return { error: null, trip: rows[0] ?? null };
}

/** Same terminal rule as {@link getDriverOngoingTrip}, for roster vehicle UUIDs. */
export async function getVehicleOngoingTrip(
  vehicleId: string,
  excludeTripId?: string,
): Promise<{
  error: Error | null;
  trip: Pick<TripRow, "id" | "trip_number" | "trip_code" | "trip_operational_code"> | null;
}> {
  let q = supabase()
    .from("trips")
    .select("id, trip_number, trip_code, trip_operational_code")
    .eq("vehicle_id", vehicleId)
    .not("status", "in", `("${ONGOING_TRIP_TERMINAL_STATUSES.join('","')}")`)
    .order("updated_at", { ascending: false })
    .limit(10);
  if (excludeTripId != null && excludeTripId.trim() !== "") {
    q = q.neq("id", excludeTripId);
  }
  const { data, error } = await q;
  if (error) return { error: new Error(error.message), trip: null };
  const rows = (data ?? []) as Pick<
    TripRow,
    "id" | "trip_number" | "trip_code" | "trip_operational_code"
  >[];
  return { error: null, trip: rows[0] ?? null };
}

/** Trip count for a single driver, scoped by org — for profile screens that only need a count. */
export async function getDriverTripCount(
  orgId: string,
  driverId: string,
): Promise<{ error: Error | null; count: number }> {
  const { count, error } = await supabase()
    .from("trips")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .eq("driver_id", driverId);
  if (error) return { error: new Error(error.message), count: 0 };
  return { error: null, count: count ?? 0 };
}

/** Trip count for a single vehicle, scoped by org — for profile screens that only need a count. */
export async function getVehicleTripCount(
  orgId: string,
  vehicleId: string,
): Promise<{ error: Error | null; count: number }> {
  const { count, error } = await supabase()
    .from("trips")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .eq("vehicle_id", vehicleId);
  if (error) return { error: new Error(error.message), count: 0 };
  return { error: null, count: count ?? 0 };
}

/** Trip rows for a single supplier, scoped by org — for profile screens that only need spend/volume. */
export async function getTripsBySupplierForOrg(
  orgId: string,
  supplierId: string,
): Promise<{ error: Error | null; trips: Pick<TripRow, "id" | "supplier_rate" | "status">[] }> {
  const { data, error } = await supabase()
    .from("trips")
    .select("id, supplier_rate, status")
    .eq("organization_id", orgId)
    .eq("supplier_id", supplierId);
  if (error) return { error: new Error(error.message), trips: [] };
  return {
    error: null,
    trips: (data ?? []) as Pick<TripRow, "id" | "supplier_rate" | "status">[],
  };
}

/** Human-readable trip id for assignment conflict messages. */
export function formatTripAssignmentLabel(
  trip:
    | {
        trip_number?: string | null;
        trip_code?: string | null;
        trip_operational_code?: string | null;
      }
    | null
    | undefined,
): string {
  return getTripIdentifierLabel(trip);
}

/** All driver/vehicle ids on non-terminal trips for an org (not limited to recent trip pages). */
export async function getActiveTripAssignmentIds(orgId: string): Promise<{
  error: Error | null;
  driverIds: string[];
  vehicleIds: string[];
}> {
  const { data, error } = await supabase()
    .from("trips")
    .select("driver_id, vehicle_id")
    .eq("organization_id", orgId)
    .not("status", "in", `("${ONGOING_TRIP_TERMINAL_STATUSES.join('","')}")`);
  if (error) {
    return { error: new Error(error.message), driverIds: [], vehicleIds: [] };
  }
  const driverIds = new Set<string>();
  const vehicleIds = new Set<string>();
  for (const row of data ?? []) {
    const d = (row as { driver_id?: string | null }).driver_id;
    const v = (row as { vehicle_id?: string | null }).vehicle_id;
    if (d) driverIds.add(d);
    if (v) vehicleIds.add(v);
  }
  return {
    error: null,
    driverIds: Array.from(driverIds),
    vehicleIds: Array.from(vehicleIds),
  };
}

function getTripIdentifierLabel(
  trip:
    | {
        trip_number?: string | null;
        trip_code?: string | null;
        trip_operational_code?: string | null;
      }
    | null
    | undefined,
): string {
  return (
    trip?.trip_operational_code ??
    trip?.trip_code ??
    trip?.trip_number ??
    "another ongoing trip"
  );
}

export interface DriverAvailabilityByPhoneResult {
  isBusy: boolean;
  driverId: string | null;
  ongoingTripId: string | null;
  ongoingTripLabel: string | null;
}

function normalizePhoneLast10(value: string): string {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/\D/g, "")
    .slice(-10);
}

/**
 * Check if a phone maps to a driver in this org who already has an active trip.
 * Used as preflight validation for OTP/aggregate assignment flows.
 *
 * Single-active-trip rule: any non-terminal trip (including `assigned`) blocks
 * additional assignment.
 */
export async function getDriverAvailabilityByPhone(
  orgId: string,
  phone: string,
  opts?: { excludeTripId?: string | null; anyOpenTripBlocks?: boolean },
): Promise<{ error: Error | null; result: DriverAvailabilityByPhoneResult }> {
  const normalized = (phone ?? "").trim().replace(/\s+/g, "");
  if (!normalized) {
    return {
      error: null,
      result: {
        isBusy: false,
        driverId: null,
        ongoingTripId: null,
        ongoingTripLabel: null,
      },
    };
  }

  const last10 = normalized.replace(/\D/g, "").slice(-10);
  // Filter by phone suffix in DB (ILIKE '%<last10>') instead of fetching all org drivers.
  const { data: orgDrivers, error: driverError } = await supabase()
    .from("drivers")
    .select("id, phone")
    .eq("organization_id", orgId)
    .ilike("phone", `%${last10}`)
    .limit(10);
  if (driverError) {
    return {
      error: new Error(driverError.message),
      result: {
        isBusy: false,
        driverId: null,
        ongoingTripId: null,
        ongoingTripLabel: null,
      },
    };
  }

  const match = (
    (orgDrivers ?? []) as { id: string; phone: string | null }[]
  ).find((d) => {
    const p = (d.phone ?? "").replace(/\s+/g, "");
    if (!p) return false;
    if (p === normalized) return true;
    if (last10.length < 10) return false;
    return p.replace(/\D/g, "").slice(-10) === last10;
  });
  if (!match) {
    return {
      error: null,
      result: {
        isBusy: false,
        driverId: null,
        ongoingTripId: null,
        ongoingTripLabel: null,
      },
    };
  }

  const { error: ongoingError, trip } = opts?.anyOpenTripBlocks
    ? await getDriverAnyOpenTrip(match.id, opts?.excludeTripId ?? undefined)
    : await getDriverOngoingTrip(match.id, opts?.excludeTripId ?? undefined);
  if (ongoingError) {
    return {
      error: ongoingError,
      result: {
        isBusy: false,
        driverId: match.id,
        ongoingTripId: null,
        ongoingTripLabel: null,
      },
    };
  }
  return {
    error: null,
    result: {
      isBusy: trip != null,
      driverId: match.id,
      ongoingTripId: trip?.id ?? null,
      ongoingTripLabel: trip ? getTripIdentifierLabel(trip) : null,
    },
  };
}

/**
 * Global phone-level availability check (cross-org).
 * Use for aggregate assign-by-phone so one real driver (same phone) cannot
 * be assigned on overlapping trips across different driver rows/orgs.
 */
export async function getDriverAvailabilityByPhoneGlobal(
  phone: string,
  opts?: {
    excludeTripId?: string | null;
    anyOpenTripBlocks?: boolean;
    /**
     * Fail closed for aggregate assignment flows.
     * When true, this check must use the SECURITY DEFINER RPC result only.
     */
    requireAuthoritativeRpc?: boolean;
  },
): Promise<{ error: Error | null; result: DriverAvailabilityByPhoneResult }> {
  const rpcCheck = await supabase().rpc("get_driver_phone_active_trip", {
    p_phone: phone,
    p_exclude_trip_id: opts?.excludeTripId ?? null,
  });
  if (!rpcCheck.error) {
    const obj = (rpcCheck.data ?? {}) as {
      is_busy?: boolean;
      trip_id?: string | null;
      trip_label?: string | null;
    };
    if (obj.is_busy === true) {
      return {
        error: null,
        result: {
          isBusy: true,
          driverId: null,
          ongoingTripId: obj.trip_id ?? null,
          ongoingTripLabel: obj.trip_label ?? "another active trip",
        },
      };
    }
    // RPC is authoritative and already phone-global.
    if (opts?.requireAuthoritativeRpc) {
      return {
        error: null,
        result: {
          isBusy: false,
          driverId: null,
          ongoingTripId: null,
          ongoingTripLabel: null,
        },
      };
    }
  } else if (opts?.requireAuthoritativeRpc) {
    return {
      error: new Error(rpcCheck.error.message),
      result: {
        isBusy: true,
        driverId: null,
        ongoingTripId: null,
        ongoingTripLabel: null,
      },
    };
  }

  const normalized = (phone ?? "").trim().replace(/\s+/g, "");
  const last10 = normalizePhoneLast10(normalized);
  if (last10.length < 10) {
    return {
      error: null,
      result: {
        isBusy: false,
        driverId: null,
        ongoingTripId: null,
        ongoingTripLabel: null,
      },
    };
  }

  // Search by last-10 digits using ILIKE to avoid full table scan on drivers.
  // Two passes: exact suffix match first, then a broader ILIKE for country-prefix variants.
  const phonePattern = `%${last10}`;
  const { data: allDrivers, error: driverError } = await supabase()
    .from("drivers")
    .select("id, phone")
    .ilike("phone", phonePattern)
    .limit(20);
  if (driverError) {
    return {
      error: new Error(driverError.message),
      result: {
        isBusy: false,
        driverId: null,
        ongoingTripId: null,
        ongoingTripLabel: null,
      },
    };
  }

  const matchingDriverIds = ((allDrivers ?? []) as { id: string; phone: string | null }[])
    .filter((d) => normalizePhoneLast10(d.phone ?? "") === last10)
    .map((d) => d.id);
  if (matchingDriverIds.length === 0) {
    return {
      error: null,
      result: {
        isBusy: false,
        driverId: null,
        ongoingTripId: null,
        ongoingTripLabel: null,
      },
    };
  }

  const terminal = ONGOING_TRIP_TERMINAL_STATUSES.join('","');
  let q = supabase()
    .from("trips")
    .select("id, trip_number, trip_code, status, started_at, driver_id")
    .in("driver_id", matchingDriverIds)
    .not("status", "in", `("${terminal}")`)
    .order("updated_at", { ascending: false })
    .limit(25);
  const excludeTripId = opts?.excludeTripId ?? "";
  if (excludeTripId.trim()) q = q.neq("id", excludeTripId.trim());
  const { data: tripRows, error: tripError } = await q;
  if (tripError) {
    return {
      error: new Error(tripError.message),
      result: {
        isBusy: false,
        driverId: null,
        ongoingTripId: null,
        ongoingTripLabel: null,
      },
    };
  }

  const rows = (tripRows ?? []) as Array<
    Pick<TripRow, "id" | "trip_number" | "trip_code" | "status" | "started_at"> & {
      driver_id?: string | null;
    }
  >;
  const busyTrip = opts?.anyOpenTripBlocks
    ? rows[0] ?? null
    : rows.find((row) => {
        const status = String(row.status ?? "")
          .trim()
          .toLowerCase();
        const isAcceptedStatus =
          status === "in_progress" ||
          status === "in_transit" ||
          status === "picked_up" ||
          status === "at_drop";
        return isAcceptedStatus || row.started_at != null;
      }) ?? null;

  return {
    error: null,
    result: {
      isBusy: busyTrip != null,
      driverId: (busyTrip?.driver_id as string | null) ?? null,
      ongoingTripId: busyTrip?.id ?? null,
      ongoingTripLabel: busyTrip ? getTripIdentifierLabel(busyTrip) : null,
    },
  };
}

function isUuidString(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value.trim(),
  );
}

function normalizeNullableUuid(
  value: string | null | undefined,
): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  return isUuidString(raw) ? raw : null;
}

function shouldRetryCreateWithFallbackTripNumber(
  errorMessage: string,
  errorCode?: string | null,
): boolean {
  const msg = (errorMessage ?? "").toLowerCase();
  const code = (errorCode ?? "").trim();
  const mentionsTripIdentity =
    msg.includes("trip_number") ||
    msg.includes("display_trip_id") ||
    msg.includes("sequence_number");
  const isIdentityGenerationFailure =
    msg.includes("null value") ||
    msg.includes("not-null") ||
    msg.includes("violates not-null constraint");
  const isIdentityConflict =
    msg.includes("duplicate key") ||
    msg.includes("unique constraint") ||
    msg.includes("already exists") ||
    msg.includes("conflict");
  const isPgUniqueViolation = code === "23505";
  return (
    isPgUniqueViolation ||
    (mentionsTripIdentity &&
      (isIdentityGenerationFailure || isIdentityConflict))
  );
}

function isTripIdentityUniqueConflict(
  errorMessage: string,
  errorCode?: string | null,
): boolean {
  const msg = (errorMessage ?? "").toLowerCase();
  const code = (errorCode ?? "").trim();
  const mentionsTripIdentity =
    msg.includes("trip_number") ||
    msg.includes("display_trip_id") ||
    msg.includes("sequence_number");
  const isIdentityConflict =
    msg.includes("duplicate key") ||
    msg.includes("unique constraint") ||
    msg.includes("already exists") ||
    msg.includes("conflict");
  return code === "23505" || (mentionsTripIdentity && isIdentityConflict);
}

function isMissingColumnError(
  errorMessage: string,
  errorCode?: string | null,
): boolean {
  const msg = (errorMessage ?? "").toLowerCase();
  const code = (errorCode ?? "").trim();
  // PostgREST/PG can surface missing columns with different codes/messages.
  return (
    code === "42703" ||
    msg.includes("column") ||
    msg.includes("does not exist") ||
    msg.includes("schema cache")
  );
}

/**
 * DB-backed fallback: calls get_safe_fallback_trip_number() which uses a
 * global Postgres SEQUENCE — zero collision probability.
 *
 * Falls back to a crypto-random local ID only when the DB call itself fails
 * (e.g. completely offline).  The 'FTRP-' prefix distinguishes fallback IDs
 * from canonical trip numbers so they are never confused in reports.
 */
async function buildFallbackTripNumber(): Promise<string> {
  try {
    const { data, error } = await supabase().rpc('get_safe_fallback_trip_number');
    if (!error && data) return String(data);
  } catch {
    // DB unreachable — use crypto-safe local fallback below
  }
  // Crypto-safe local emergency fallback (offline / DB completely down)
  const buf = new Uint32Array(2);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(buf);
  } else {
    // Node.js fallback
    buf[0] = Math.floor(Math.random() * 0xFFFFFFFF);
    buf[1] = Math.floor(Math.random() * 0xFFFFFFFF);
  }
  const hex = (buf[0] * 0x100000000 + buf[1]).toString(16).padStart(16, '0');
  return `FTRP-${hex}`;
}

function isTripUserForeignKeyError(
  errorMessage: string,
  errorCode?: string | null,
): boolean {
  const msg = (errorMessage ?? "").toLowerCase();
  const code = (errorCode ?? "").trim();
  if (code !== "23503") return false;
  return (
    msg.includes("owner_user_id") ||
    msg.includes("created_by_user_id") ||
    msg.includes("public.users") ||
    msg.includes("users")
  );
}

async function getOrganizationOwnerId(orgId: string): Promise<string | null> {
  const { data, error } = await supabase()
    .from("organizations")
    .select("owner_id")
    .eq("id", orgId)
    .maybeSingle();
  if (error) return null;
  const row = data as { owner_id?: string | null } | null;
  return normalizeNullableUuid(row?.owner_id);
}

function parseTripNumberSequence(
  value: string | null | undefined,
): number | null {
  const raw = String(value ?? "")
    .trim()
    .toUpperCase();
  const m = /^TRP(\d+)$/.exec(raw);
  if (!m) return null;
  // Ignore legacy/random fallback ids like TRP66831046490792; keep only canonical sequence widths.
  if (m[1].length < 3 || m[1].length > 6) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function formatTripNumberFromSequence(seq: number): string {
  const safe = Math.max(1, Math.floor(seq));
  const digits = String(safe);
  return `TRP${digits.padStart(Math.max(3, digits.length), "0")}`;
}

/**
 * Returns the next trip sequence number for an org.
 *
 * Uses the authoritative DB counter (operational_sequences / organization_counters)
 * via the get_next_trip_sequence_for_org() RPC — never limited to recent rows.
 *
 * The old 500-row client-side scan is kept only as a last resort when the RPC
 * itself is unavailable (schema not yet migrated).
 */
async function getNextOrgTripSequence(orgId: string): Promise<number> {
  // Primary: authoritative counter from DB (reads the actual sequence rows)
  try {
    const { data, error } = await supabase().rpc(
      'get_next_trip_sequence_for_org',
      { p_org_id: orgId },
    );
    if (!error && data != null) {
      const next = Number(data);
      if (Number.isFinite(next) && next > 0) return next;
    }
  } catch {
    // RPC not yet deployed — fall through to legacy path
  }

  // Legacy fallback: read the org counter table directly
  try {
    const { data: counterRow, error: counterErr } = await supabase()
      .from('organization_counters')
      .select('trip_seq')
      .eq('organization_id', orgId)
      .maybeSingle();
    if (!counterErr && counterRow) {
      const seq = Number((counterRow as { trip_seq?: number | null }).trip_seq ?? 0);
      if (Number.isFinite(seq) && seq > 0) return seq + 1;
    }
  } catch {
    // table not available
  }

  // Last resort: scan recent trips (bounded, only when counters unavailable)
  const tripRes = await supabase()
    .from('trips')
    .select('trip_number, display_trip_id')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })
    .limit(500);

  let maxSeq = 0;
  for (const row of ((tripRes.data ?? []) as { trip_number?: string | null; display_trip_id?: string | null }[])) {
    const s =
      parseTripNumberSequence(row.display_trip_id) ??
      parseTripNumberSequence(row.trip_number);
    if (s != null && s > maxSeq) maxSeq = s;
  }
  return maxSeq + 1;
}

function isTerminalTripStatusForAssignment(status: string | null | undefined): boolean {
  const normalized = String(status ?? "").trim().toLowerCase();
  if (!normalized) return false;
  return (ONGOING_TRIP_TERMINAL_STATUSES as readonly string[]).includes(normalized);
}

export async function createTrip(
  orgId: string,
  userId: string,
  data: CreateTripData,
): Promise<{ error: Error | null; trip: TripRow | null }> {
  const initialStatus = String(data.status ?? "assigned").trim() || "assigned";
  const skipAssignmentConflictCheck =
    data.skipAssignmentConflictCheck === true ||
    isTerminalTripStatusForAssignment(initialStatus);

  if (!skipAssignmentConflictCheck && data.driver_id != null) {
    const { error: conflictCheckError, trip: ongoingTrip } =
      await getDriverOngoingTrip(data.driver_id);
    if (conflictCheckError) return { error: conflictCheckError, trip: null };
    if (ongoingTrip != null) {
      return {
        error: new Error(
          `Driver is already assigned to ${getTripIdentifierLabel(ongoingTrip)}. Complete or unassign that trip first.`,
        ),
        trip: null,
      };
    }
  }

  const createVehicleId = normalizeNullableUuid(data.vehicle_id);
  if (!skipAssignmentConflictCheck && createVehicleId != null) {
    const { error: vErr, trip: vehicleTrip } =
      await getVehicleOngoingTrip(createVehicleId);
    if (vErr) return { error: vErr, trip: null };
    if (vehicleTrip != null) {
      return {
        error: new Error(
          `Vehicle is already assigned to ${getTripIdentifierLabel(vehicleTrip)}. Complete or unassign that trip first.`,
        ),
        trip: null,
      };
    }
  }

  const clientPrice = Number(data.client_price) || 0;
  const supplierRate = Number(data.supplier_rate) || 0;
  const distanceKm = data.distance != null && Number.isFinite(Number(data.distance)) ? Number(data.distance) : null;
  const driverCommissionPct = Number(data.driver_commission_percent ?? 0) || 0;
  const driverCommissionPerKm = Number(data.driver_commission_per_km ?? 0) || 0;
  // Commission basis. On market (aggregate) trips the driver belongs to the
  // supplier, so commission is charged against supplier_rate — client_price
  // carries our margin and charging against it would eat that margin. Asset
  // trips keep the historical client_price basis even when a supplier rate is
  // present. Mirrors resolveDriverTripPayoutTerms in driverUtils.util.ts so the
  // stamped amount and the driver app agree.
  const isMarketPayout = data.trip_payout_mode === "market";
  const commissionBasis =
    isMarketPayout && supplierRate > 0 ? supplierRate : clientPrice;
  const computedDriverCommission =
    driverCommissionPct > 0 && commissionBasis > 0
      ? Math.round((commissionBasis * driverCommissionPct) / 100)
      : driverCommissionPerKm > 0 && distanceKm != null && distanceKm > 0
        ? Math.round(distanceKm * driverCommissionPerKm)
        : 0;
  const loadTonsRaw = Number(data.load_tons);
  const loadTons =
    Number.isFinite(loadTonsRaw) && loadTonsRaw >= 0 ? loadTonsRaw : null;
  const advancePaidRaw = Number(data.advance_paid);
  const advancePaid =
    Number.isFinite(advancePaidRaw) && advancePaidRaw >= 0 ? advancePaidRaw : 0;
  const explicitId = normalizeNullableUuid(data.id) ?? undefined;
  const ownerUserId =
    normalizeNullableUuid(data.owner_user_id) ?? normalizeNullableUuid(userId);
  const creatorUserId =
    normalizeNullableUuid(data.created_by_user_id) ??
    normalizeNullableUuid(userId);
  const normalizedSupplierId = normalizeNullableUuid(data.supplier_id);
  const normalizedDriverId = normalizeNullableUuid(data.driver_id);
  const normalizedVehicleId = normalizeNullableUuid(data.vehicle_id);
  const inferredTripPayoutMode =
    data.trip_payout_mode ??
    (normalizedSupplierId
      ? "market"
      : normalizedDriverId || normalizedVehicleId
        ? "asset"
        : "asset");

  // Sequential trip trigger writes user_counters(user_id) with FK -> public.users(id).
  // Ensure referenced users exist to avoid 400/409 on environments with stricter FK checks.
  await ensurePublicUserRecord(ownerUserId);
  if (creatorUserId && creatorUserId !== ownerUserId) {
    await ensurePublicUserRecord(creatorUserId);
  }

  const insertData = {
    ...(explicitId ? { id: explicitId } : {}),
    organization_id: orgId,
    owner_user_id: ownerUserId,
    created_by_user_id: creatorUserId,
    trip_number: null as string | null,
    pickup_area: (data.pickup_area ?? "").trim(),
    drop_location: (data.drop_location ?? "").trim(),
    pickup_lat:
      data.pickup_lat != null && Number.isFinite(data.pickup_lat)
        ? data.pickup_lat
        : null,
    pickup_lon:
      data.pickup_lon != null && Number.isFinite(data.pickup_lon)
        ? data.pickup_lon
        : null,
    drop_lat:
      data.drop_lat != null && Number.isFinite(data.drop_lat)
        ? data.drop_lat
        : null,
    drop_lon:
      data.drop_lon != null && Number.isFinite(data.drop_lon)
        ? data.drop_lon
        : null,
    distance:
      data.distance != null && Number.isFinite(data.distance)
        ? data.distance
        : null,
    estimated_duration:
      data.estimated_duration != null ? data.estimated_duration : null,
    client_name: (data.client_name ?? "").trim() || "—",
    client_id: normalizeNullableUuid(data.client_id),
    client_price: clientPrice,
    sale_rate_basis: data.sale_rate_basis === "per_mt" ? "per_mt" : data.sale_rate_basis === "per_trip" ? "per_trip" : null,
    sale_unit_rate:
      data.sale_unit_rate != null && Number(data.sale_unit_rate) > 0
        ? Number(data.sale_unit_rate)
        : null,
    lane_id: normalizeNullableUuid(data.lane_id),
    indent_id: normalizeNullableUuid(data.indent_id),
    source: normalizeNullableUuid(data.indent_id) ? "indent" : "manual",
    supplier_rate: supplierRate,
    platform_fee: 0,
    driver_commission: computedDriverCommission,
    payment_status: "pending",
    amount_paid: 0,
    // Cross-schema compatibility:
    // - legacy DB allows: draft/assigned/in_progress/completed/cancelled
    // - newer DB allows: pending_acceptance/assigned/in_progress/... etc
    // "assigned" is accepted in both and hub metrics still bucket rows without driver as "unassigned".
    status: initialStatus,
    started_at: data.started_at ?? null,
    completed_at: data.completed_at ?? null,
    notes: (data.notes ?? "").trim() || null,
    pickup_date: data.pickup_date ?? null,
    load_tons: loadTons,
    load_type: (data.load_type ?? "").trim() || null,
    advance_paid: advancePaid,
    supplier_id: normalizedSupplierId,
    // Not all DBs have trips.supplier_name; resolve name via supplier_id + suppliers / views.
    trip_payout_mode: inferredTripPayoutMode,
    driver_id: normalizedDriverId,
    vehicle_id: normalizedVehicleId,
    vehicle_display_number: (data.vehicle_display_number ?? "").trim() || null,
  };
  let { data: row, error } = await supabase()
    .from("trips")
    .insert(insertData as Record<string, unknown>)
    .select()
    .single();
  if (error && isTripUserForeignKeyError(error.message, error.code)) {
    // Fallback for environments where public.users is read-only from client and auth user
    // was not backfilled yet. Use org owner (usually seeded) to keep sequential numbering safe.
    const orgOwnerId = await getOrganizationOwnerId(orgId);
    if (orgOwnerId != null) {
      await ensurePublicUserRecord(orgOwnerId);
      const retryPayload = {
        ...insertData,
        owner_user_id: orgOwnerId,
        created_by_user_id: creatorUserId,
      };
      const retry = await supabase()
        .from("trips")
        .insert(retryPayload as Record<string, unknown>)
        .select()
        .single();
      row = retry.data;
      error = retry.error;
    }
  }
  if (error) {
    if (__DEV__) {
      console.error("[createTrip] insert failed", {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
        payload: insertData,
      });
    }
    if (isTripIdentityUniqueConflict(error.message, error.code)) {
      // Keep sequential IDs DB-generated: retry with trip_number=NULL and let trigger assign next sequence.
      let lastError: Error | null = null;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const { data: retryRow, error: retryError } = await supabase()
          .from("trips")
          .insert(insertData as Record<string, unknown>)
          .select()
          .single();
        if (!retryError) return { error: null, trip: retryRow as TripRow };
        lastError = new Error(buildPostgrestErrorMessage(retryError));
        if (
          !isTripIdentityUniqueConflict(retryError.message, retryError.code)
        ) {
          return { error: lastError, trip: null };
        }
      }
      // Fallback for environments where trigger uses a per-user counter while uniqueness is per-org.
      let candidateSeq = await getNextOrgTripSequence(orgId);
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const candidate = formatTripNumberFromSequence(candidateSeq);
        const explicitInsertData = {
          ...insertData,
          trip_number: candidate,
          sequence_number: candidateSeq,
          display_trip_id: candidate,
        };
        const { data: explicitRow, error: explicitError } = await supabase()
          .from("trips")
          .insert(explicitInsertData as Record<string, unknown>)
          .select()
          .single();
        if (!explicitError)
          return { error: null, trip: explicitRow as TripRow };
        if (isMissingColumnError(explicitError.message, explicitError.code)) {
          const minimalInsertData = {
            ...insertData,
            trip_number: candidate,
          };
          const { data: minimalRow, error: minimalError } = await supabase()
            .from("trips")
            .insert(minimalInsertData as Record<string, unknown>)
            .select()
            .single();
          if (!minimalError)
            return { error: null, trip: minimalRow as TripRow };
          lastError = new Error(buildPostgrestErrorMessage(minimalError));
          if (
            !isTripIdentityUniqueConflict(
              minimalError.message,
              minimalError.code,
            )
          ) {
            return { error: lastError, trip: null };
          }
          candidateSeq += 1;
          continue;
        }
        lastError = new Error(buildPostgrestErrorMessage(explicitError));
        if (
          !isTripIdentityUniqueConflict(
            explicitError.message,
            explicitError.code,
          )
        ) {
          return { error: lastError, trip: null };
        }
        candidateSeq += 1;
      }
      return {
        error:
          lastError ??
          new Error("Trip number sequence conflict. Please try again."),
        trip: null,
      };
    }

    if (!shouldRetryCreateWithFallbackTripNumber(error.message, error.code)) {
      return {
        error: new Error(buildPostgrestErrorMessage(error)),
        trip: null,
      };
    }

    let lastError: Error | null = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const fallbackInsertData = {
        ...insertData,
        trip_number: await buildFallbackTripNumber(),
      };
      const { data: retryRow, error: retryError } = await supabase()
        .from("trips")
        .insert(fallbackInsertData as Record<string, unknown>)
        .select()
        .single();
      if (!retryError) return { error: null, trip: retryRow as TripRow };
      lastError = new Error(buildPostgrestErrorMessage(retryError));
      if (
        !shouldRetryCreateWithFallbackTripNumber(
          retryError.message,
          retryError.code,
        )
      ) {
        return { error: lastError, trip: null };
      }
    }
    return {
      error:
        lastError ??
        new Error("Trip creation conflict. Please retry in a moment."),
      trip: null,
    };
  }
  return { error: null, trip: row as TripRow };
}

/** OTP result when creating an aggregate trip (for driver claim-by-OTP flow). */
export interface TripOtpInfo {
  code: string;
  expires_at: string;
}

/**
 * Create trip and, for aggregate trips (supplier_id set), generate OTP and return it.
 * Call this when the add-trip form submits with supply_source === 'aggregate' so the UI can show the OTP.
 * O(1): one insert + one RPC for OTP when aggregate.
 */
export async function createTripWithOtp(
  orgId: string,
  userId: string,
  data: CreateTripData,
  options?: { skipOtpGeneration?: boolean },
): Promise<{
  error: Error | null;
  trip: TripRow | null;
  otp: TripOtpInfo | null;
}> {
  const { error, trip } = await createTrip(orgId, userId, data);
  if (error || !trip)
    return {
      error: error ?? new Error("No trip returned"),
      trip: null,
      otp: null,
    };
  const isAggregate = !!data.supplier_id;
  const hasAssignment =
    !!data.driver_id || !!data.vehicle_id || !!data.vehicle_display_number;
  if (
    options?.skipOtpGeneration ||
    !isAggregate ||
    !hasAssignment
  ) {
    return { error: null, trip, otp: null };
  }

  const { generateTripOtp } =
    await import("@/features/trips/services/tripOtp.service");
  const { error: otpError, code, expires_at } = await generateTripOtp(trip.id);
  if (otpError || !code || !expires_at) {
    return { error: null, trip, otp: null };
  }
  return { error: null, trip, otp: { code, expires_at } };
}

/** Update only driver and/or vehicle assignment (e.g. assign after create). */
export interface UpdateTripAssignmentData {
  driver_id?: string | null;
  vehicle_id?: string | null;
  /** Ad-hoc vehicle number when vehicle_id is null (e.g. aggregate trip). */
  vehicle_display_number?: string | null;
}

export interface UpdateTripSupplierData {
  supplier_id?: string | null;
  supplier_rate?: number;
}

/** Optional audit context for Private Book vs Shared Network (who last assigned). */
export interface UpdateTripAssignmentOptions {
  /** Current user id (profiles.id / auth.uid()). When set, an audit row is written so this trip is "Private" for this user. */
  changedBy?: string | null;
  /** Previous driver_id (for audit prev/new). Required when changedBy is set. */
  driverIdPrev?: string | null;
  /** Previous vehicle_id (for audit prev/new). Required when changedBy is set. */
  vehicleIdPrev?: string | null;
  /** When true, created driver is one-time for aggregate trip tracking; excluded from Drivers tab. */
  trackingOnly?: boolean;
  /** When true (reassignment), ensure driver row is unlinked so trip must be claimed via OTP. */
  forceOtpClaim?: boolean;
  /** Optimistic lock: PATCH only if trip.updated_at still matches (concurrent dispatcher guard). */
  expectedUpdatedAt?: string | null;
  /** Dispatcher-entered driver name for assign-by-phone (stored on drivers.name). */
  driverName?: string | null;
  /**
   * Dispatcher-agreed commission %. Forwarded to ensureDriverRowByPhone and
   * written only when that call inserts a brand-new driver row.
   */
  commissionPercent?: number | null;
}

export async function updateTripAssignment(
  tripId: string,
  data: UpdateTripAssignmentData,
  options?: UpdateTripAssignmentOptions,
): Promise<{ error: Error | null; trip: TripRow | null }> {
  const { data: tripGate, error: tripGateError } = await supabase()
    .from("trips")
    .select("id, status, completed_at, started_at")
    .eq("id", tripId)
    .maybeSingle();
  if (tripGateError) return { error: new Error(tripGateError.message), trip: null };
  if (!tripGate) return { error: new Error("Trip not found"), trip: null };
  if (isTripCompleted(tripGate as Pick<TripRow, "status" | "completed_at">)) {
    return {
      error: new Error("Cannot change driver or vehicle after the trip is completed."),
      trip: null,
    };
  }

  if (data.driver_id != null) {
    const { error: conflictCheckError, trip: ongoingTrip } =
      await getDriverOngoingTrip(data.driver_id, tripId);
    if (conflictCheckError) return { error: conflictCheckError, trip: null };
    if (ongoingTrip != null) {
      return {
        error: new Error(
          `Driver is already assigned to ${getTripIdentifierLabel(ongoingTrip)}. Complete or unassign that trip first.`,
        ),
        trip: null,
      };
    }
  }

  if (data.vehicle_id != null) {
    const { error: vehicleConflictError, trip: vehicleBusyTrip } =
      await getVehicleOngoingTrip(data.vehicle_id, tripId);
    if (vehicleConflictError) return { error: vehicleConflictError, trip: null };
    if (vehicleBusyTrip != null) {
      return {
        error: new Error(
          `Vehicle is already assigned to ${getTripIdentifierLabel(vehicleBusyTrip)}. Complete or unassign that trip first.`,
        ),
        trip: null,
      };
    }
  }

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (data.driver_id !== undefined) updates.driver_id = data.driver_id;
  if (data.vehicle_id !== undefined) updates.vehicle_id = data.vehicle_id;
  if (data.vehicle_display_number !== undefined)
    updates.vehicle_display_number = data.vehicle_display_number;
  // Reassign preserves trip stage — only driver_id and vehicle_id change.
  // Only push status → 'assigned' on first assign before the trip has started.
  if (
    data.driver_id != null &&
    shouldMarkAssignedOnFirstAssign(
      tripGate as Pick<TripRow, "status" | "started_at" | "completed_at">,
    )
  ) {
    updates.status = "assigned";
  }
  let updateQ = supabase().from("trips").update(updates).eq("id", tripId);
  if (options?.expectedUpdatedAt != null && options.expectedUpdatedAt.trim() !== "") {
    updateQ = updateQ.eq("updated_at", options.expectedUpdatedAt);
  }
  const { data: row, error } = await updateQ.select().maybeSingle();
  if (error) return { error: new Error(error.message), trip: null };
  if (
    options?.expectedUpdatedAt != null &&
    options.expectedUpdatedAt.trim() !== "" &&
    !row
  ) {
    return { error: new Error(TRIP_REASSIGN_STALE_ERROR), trip: null };
  }

  const updatedTrip = row as TripRow | null;

  // TripAssigned (docs/architecture/10-platform-event-catalog.md) — the single point where a
  // driver assignment on this trip becomes authoritative. Fires once per successful commit;
  // a stale-expectedUpdatedAt retry never reaches here (the update above returns early with
  // TRIP_REASSIGN_STALE_ERROR), which is what makes retries idempotent for this event.
  if (data.driver_id != null && updatedTrip) {
    void getPlatformEventBus()
      .publish({
        name: "TripAssigned",
        workspaceId: updatedTrip.organization_id,
        correlationId: uuidv7(),
        occurredAt: new Date().toISOString(),
        payload: {
          tripId: updatedTrip.id,
          indentId: updatedTrip.indent_id ?? null,
          driverId: updatedTrip.driver_id,
          vehicleId: updatedTrip.vehicle_id ?? null,
        },
      })
      .catch((err) => {
        if (__DEV__) console.warn("[trips] TripAssigned publish failed:", err);
      });
  }

  if (options?.changedBy != null && updatedTrip) {
    const changedBy = options.changedBy;
    const { insertTripAssignmentAudit } =
      await import("./trip-assignment-audit.service");
    const hadPrev =
      (options?.driverIdPrev != null && options.driverIdPrev !== "") ||
      (options?.vehicleIdPrev != null && options.vehicleIdPrev !== "");
    const { error: auditError, row: auditRow } = await insertTripAssignmentAudit({
      trip_id: tripId,
      event_type: hadPrev ? "reassignment" : "assignment",
      driver_id_prev: options?.driverIdPrev ?? null,
      driver_id_new: updatedTrip.driver_id ?? null,
      vehicle_id_prev: options?.vehicleIdPrev ?? null,
      vehicle_id_new: updatedTrip.vehicle_id ?? null,
      changed_by: changedBy,
    });
    if (auditError && __DEV__) {
      console.warn(
        "[trips] Assignment change log not recorded:",
        auditError.message,
      );
    }
    if (auditRow) {
      const { postAssignmentUpdateAfterTripSave } = await import(
        "@/features/chat/services/chatAssignmentBridge.service"
      );
      void postAssignmentUpdateAfterTripSave({
        trip: updatedTrip,
        updateData: data,
        auditRow,
      }).catch((e) => {
        if (__DEV__) {
          console.warn("[trips] Assignment chat broadcast failed:", e);
        }
      });
    }
  }

  return { error: null, trip: updatedTrip };
}

/**
 * Update trip supplier link and/or supplier rate.
 * Used when load-based aggregate flow re-assigns the supplying partner at deploy time.
 */
export async function updateTripSupplier(
  tripId: string,
  data: UpdateTripSupplierData,
): Promise<{ error: Error | null; trip: TripRow | null }> {
  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (data.supplier_id !== undefined) updates.supplier_id = data.supplier_id;
  if (data.supplier_rate !== undefined) {
    const n = Number(data.supplier_rate ?? 0);
    updates.supplier_rate = Number.isFinite(n) ? n : 0;
  }
  const { data: row, error } = await supabase()
    .from("trips")
    .update(updates)
    .eq("id", tripId)
    .select()
    .maybeSingle();
  if (error) return { error: new Error(error.message), trip: null };
  return { error: null, trip: (row ?? null) as TripRow | null };
}

export async function updateTripDriverCommission(
  tripId: string,
  amount: number,
): Promise<{ error: Error | null; trip: TripRow | null }> {
  const normalizedAmount = Math.max(0, Math.round(Number(amount) || 0));
  const { data: row, error } = await supabase()
    .from("trips")
    .update({
      driver_commission: normalizedAmount,
      updated_at: new Date().toISOString(),
    })
    .eq("id", tripId)
    .select()
    .maybeSingle();
  if (error) return { error: new Error(error.message), trip: null };
  return { error: null, trip: (row ?? null) as TripRow | null };
}

/**
 * Freeze the driver's pay onto a trip at assignment time.
 *
 * Without this, `driver_commission` stays 0 and the earnings resolver falls
 * through to the driver's live commission_percent on every render — so editing
 * a driver's terms retroactively re-prices trips they already ran (set 12% ->
 * 15% and a finished trip silently changes from ₹588 to ₹735). Stamping the
 * figure at assignment makes later term changes apply to new trips only.
 *
 * The amount is computed with the SAME resolver the UI reads
 * (tripEarningsDetailForDriver), so the frozen number always equals what was
 * displayed — no second pricing implementation to drift.
 *
 * Only stamps when the amount is backed by agreed terms. An `estimated` basis
 * is the 10% legacy guess that nobody agreed to; writing that to the trip would
 * turn a guess into a payable, so it is deliberately left unstamped.
 * Best-effort: a failure here must not fail the trip, which already exists and
 * is assigned. Callers get the error and can surface it without rolling back.
 */
export async function stampTripDriverPayFromTerms(
  tripId: string,
  driverId: string,
  orgId: string,
): Promise<{ error: Error | null; amount: number | null }> {
  const { tripEarningsDetailForDriver } = await import(
    "@/features/drivers/utils/driverUtils.util"
  );

  const { data: trip, error: tripErr } = await supabase()
    .from("trips")
    .select(
      "id, driver_commission, supplier_rate, client_price, distance, odometer_distance_km, gps_distance_km, supplier_id",
    )
    .eq("id", tripId)
    .maybeSingle();
  if (tripErr) return { error: new Error(tripErr.message), amount: null };
  if (!trip) return { error: new Error("Trip not found"), amount: null };

  // Never overwrite a figure that is already frozen.
  if (Number(trip.driver_commission ?? 0) > 0) {
    return { error: null, amount: Number(trip.driver_commission) };
  }

  const { data: driver, error: driverErr } = await supabase()
    .from("drivers")
    .select("commission_percent, commission_per_km")
    .eq("id", driverId)
    .maybeSingle();
  if (driverErr) return { error: new Error(driverErr.message), amount: null };

  // Accepted invite terms win over the driver row (same precedence the wallet
  // uses); fall back to the driver record when no invite is present.
  const { data: invite } = await supabase()
    .from("driver_invites")
    .select("commission_percent, commission_per_km")
    .eq("driver_id", driverId)
    .eq("from_organization_id", orgId)
    .eq("status", "accepted")
    .maybeSingle();

  const terms = {
    commissionPercent:
      invite?.commission_percent ?? driver?.commission_percent ?? null,
    commissionPerKm:
      invite?.commission_per_km ?? driver?.commission_per_km ?? null,
  };

  const detail = tripEarningsDetailForDriver(trip as never, terms);
  if (detail.isEstimated || detail.amount <= 0) {
    return { error: null, amount: null };
  }

  const { error: updErr } = await updateTripDriverCommission(
    tripId,
    detail.amount,
  );
  if (updErr) return { error: updErr, amount: null };
  return { error: null, amount: detail.amount };
}

/**
 * Assign a trip to a driver by phone (ensure driver row in org, then set trip.driver_id).
 * Used for aggregate trips or post-create assign-by-phone. O(1).
 */
export async function assignTripDriverByPhone(
  tripId: string,
  orgId: string,
  phone: string,
  options?: UpdateTripAssignmentOptions,
): Promise<{
  error: Error | null;
  trip: TripRow | null;
  otp: TripOtpInfo | null;
}> {
  const normalized = (phone ?? "").trim().replace(/\s+/g, "");
  if (!normalized) {
    return { error: new Error("Phone is required"), trip: null, otp: null };
  }
  const { error: availabilityError, result: availability } =
    await getDriverAvailabilityByPhoneGlobal(normalized, {
      excludeTripId: tripId,
      anyOpenTripBlocks: true,
      requireAuthoritativeRpc: true,
    });
  if (availabilityError) {
    return { error: availabilityError, trip: null, otp: null };
  }
  if (availability.isBusy) {
    return {
      error: new Error(
        `Driver is already assigned to ${availability.ongoingTripLabel ?? "another ongoing trip"}. Complete or unassign that trip first.`,
      ),
      trip: null,
      otp: null,
    };
  }

  const { ensureDriverRowByPhone } =
    await import("@/features/drivers/services/drivers.service");
  const { error: driverError, driver } = await ensureDriverRowByPhone(
    orgId,
    normalized,
    options?.driverName ?? undefined,
    {
      trackingOnly: options?.trackingOnly ?? false,
      forceUnlinkedForOtp: options?.forceOtpClaim ?? false,
      commissionPercent: options?.commissionPercent ?? null,
    },
  );
  if (driverError || !driver)
    return {
      error: driverError ?? new Error("Could not resolve driver"),
      trip: null,
      otp: null,
    };
  const assignment = await updateTripAssignment(
    tripId,
    { driver_id: driver.id },
    options,
  );
  if (assignment.error || !assignment.trip) {
    return { ...assignment, otp: null };
  }

  // OTP only for drivers without app access (no user_id). Fleet drivers (user_id set)
  // see the trip directly via driver_id without needing an OTP claim step.
  const needsTripOtp = driver.user_id == null;
  let otp: TripOtpInfo | null = null;
  if (needsTripOtp) {
    const { generateTripOtp } = await import("./tripOtp.service");
    const { error: otpErr, code, expires_at } = await generateTripOtp(tripId);
    if (otpErr && __DEV__) {
      console.warn(
        "[trips] assignTripDriverByPhone: ensure OTP failed:",
        otpErr.message,
      );
    } else if (code && expires_at) {
      otp = { code, expires_at };
    }
  }

  return { error: null, trip: assignment.trip, otp };
}

/**
 * Assign driver to an aggregate trip by phone via RPC (SECURITY DEFINER).
 * Use this when driverAssignOrgId is set (aggregate flow) so assignment always persists
 * regardless of RLS on drivers/trips.
 */
export async function assignAggregateTripDriverByPhone(
  tripId: string,
  driverOrgId: string,
  phone: string,
  vehicleDisplayNumber?: string | null,
  vehicleId?: string | null,
  previousDriverId?: string | null,
  /** Dispatcher-entered name — stored on drivers.name so hub does not show UNASSIGNED. */
  driverName?: string | null,
  /** Explicit own-asset vs third-party choice (Issue B). Omitted/undefined = NULL, preserving legacy AGGREGATE-default behavior. */
  executionType?: "ASSET" | "AGGREGATE" | null,
): Promise<{ error: Error | null; trip: TripRow | null; driverLinked: boolean }> {
  const normalized = (phone ?? "").trim().replace(/\s+/g, "");
  if (!normalized) {
    return { error: new Error("Phone is required"), trip: null, driverLinked: false };
  }
  const { error: availabilityError, result: availability } =
    await getDriverAvailabilityByPhoneGlobal(normalized, {
      excludeTripId: tripId,
      anyOpenTripBlocks: true,
      requireAuthoritativeRpc: true,
    });
  if (availabilityError) return { error: availabilityError, trip: null, driverLinked: false };
  if (availability.isBusy) {
    return {
      error: new Error(
        `Driver is already assigned to ${availability.ongoingTripLabel ?? "another ongoing trip"}. Complete or unassign that trip first.`,
      ),
      trip: null,
      driverLinked: false,
    };
  }

  const trimmedVehicleDisplay =
    vehicleDisplayNumber != null && String(vehicleDisplayNumber).trim() !== ""
      ? String(vehicleDisplayNumber).trim()
      : null;
  const trimmedDriverName =
    driverName != null && String(driverName).trim() !== ""
      ? String(driverName).trim()
      : null;
  const usableDriverName =
    trimmedDriverName && !/^driver$/i.test(trimmedDriverName)
      ? trimmedDriverName
      : null;

  const rpcArgs: Record<string, unknown> = {
    p_trip_id: tripId,
    p_driver_org_id: driverOrgId,
    p_driver_phone: normalized,
    p_vehicle_display_number: trimmedVehicleDisplay,
  };
  if (usableDriverName) {
    rpcArgs.p_driver_name = usableDriverName;
  }
  const fleetVehicleId =
    vehicleId != null && String(vehicleId).trim() !== "" ? vehicleId : null;
  if (fleetVehicleId) {
    rpcArgs.p_vehicle_id = fleetVehicleId;
  }
  if (executionType) {
    rpcArgs.p_execution_type = executionType;
  }

  let { data, error } = await supabase().rpc(
    "assign_aggregate_trip_driver",
    rpcArgs,
  );
  if (
    error &&
    executionType &&
    /p_execution_type|Could not find the function/i.test(String(error.message ?? ""))
  ) {
    const withoutExecutionType = { ...rpcArgs };
    delete withoutExecutionType.p_execution_type;
    ({ data, error } = await supabase().rpc(
      "assign_aggregate_trip_driver",
      withoutExecutionType,
    ));
  }
  if (
    error &&
    usableDriverName &&
    /p_driver_name|Could not find the function/i.test(String(error.message ?? ""))
  ) {
    const withoutName = { ...rpcArgs };
    delete withoutName.p_driver_name;
    delete withoutName.p_execution_type;
    ({ data, error } = await supabase().rpc(
      "assign_aggregate_trip_driver",
      withoutName,
    ));
  }
  if (
    error &&
    fleetVehicleId &&
    /p_vehicle_id|Could not find the function/i.test(String(error.message ?? ""))
  ) {
    // Stale RPC (pre-name / pre-vehicle-id / pre-execution-type signature): retry without the newer args.
    const legacyArgs = { ...rpcArgs };
    delete legacyArgs.p_vehicle_id;
    delete legacyArgs.p_driver_name;
    delete legacyArgs.p_execution_type;
    ({ data, error } = await supabase().rpc(
      "assign_aggregate_trip_driver",
      legacyArgs,
    ));
  }
  if (error) {
    const msg = String(error.message ?? "");
    const missingDisplayColumn =
      /column\s+trip_display_trip_id\s+does\s+not\s+exist/i.test(msg) ||
      /trip_display_trip_id/i.test(msg);

    // Backward-compatible fallback for environments with stale RPC definition.
    if (!missingDisplayColumn) return { error: new Error(msg), trip: null, driverLinked: false };

    const { error: assignError, trip } = await assignTripDriverByPhone(
      tripId,
      driverOrgId,
      normalized,
      {
        trackingOnly: true,
        forceOtpClaim: true,
        driverName: usableDriverName,
      },
    );
    if (assignError || !trip) {
      return {
        error:
          assignError ??
          new Error(
            "Assignment failed via RPC and fallback. Please contact support.",
          ),
        trip: null,
        driverLinked: false,
      };
    }
    // Stale-RPC fallback path forces an OTP claim (forceOtpClaim: true above),
    // so treat the driver as unlinked here regardless of its real state.
    if (trimmedVehicleDisplay) {
      const { error: vehicleError, trip: updatedTrip } =
        await updateTripAssignment(tripId, {
          vehicle_display_number: trimmedVehicleDisplay,
        });
      if (vehicleError) return { error: vehicleError, trip: null, driverLinked: false };
      return { error: null, trip: updatedTrip ?? trip, driverLinked: false };
    }
    return { error: null, trip, driverLinked: false };
  }
  const obj = data as { ok?: boolean; error?: string; trip?: TripRow; driver_linked?: boolean } | null;
  if (!obj || obj.ok !== true) {
    return {
      error: new Error(obj?.error ?? "Assignment failed"),
      trip: null,
      driverLinked: false,
    };
  }
  const driverLinked = obj.driver_linked === true;
  const resultTrip = (obj.trip ?? null) as TripRow | null;
  if (resultTrip && usableDriverName) {
    resultTrip.driver_display_name = usableDriverName;
  }
  if (resultTrip) {
    const { postAggregateAssignmentMessage } = await import(
      "@/features/chat/services/chatAssignmentBridge.service"
    );
    void postAggregateAssignmentMessage(resultTrip, previousDriverId ?? null).catch(
      (e) => {
        if (__DEV__) {
          console.warn("[trips] aggregate assign chat broadcast failed:", e);
        }
      },
    );
  }
  return { error: null, trip: resultTrip, driverLinked };
}

/** Trip status values allowed by DB (public.trips.status CHECK). */
const TRIP_STATUS_VALUES = [
  "draft",
  "assigned",
  "in_progress",
  "picked_up",
  "in_transit",
  "at_drop",
  "completed",
  "cancelled",
] as const;

/**
 * Returns true when the trip is completed (no reassignment or editing allowed).
 * Uses status (completed/delivered/done) or completed_at for consistency with driver app.
 */
export function isTripCompleted(
  // Widened from Pick<TripRow, ...>: callers pass rows from views and partial
  // projections where `status` is `string | null`, which TripRow types as
  // `string | undefined`. The body already normalizes null via `?? ""`, so this
  // matches what the function actually accepts at runtime.
  trip:
    | { status?: string | null; completed_at?: string | null }
    | null
    | undefined,
): boolean {
  if (!trip) return false;
  const s = (trip.status ?? "").toLowerCase();
  if (s === "completed" || s === "delivered" || s === "done") return true;
  return trip.completed_at != null && String(trip.completed_at).trim() !== "";
}

/**
 * Update trip status and optional timestamps (driver app: assigned → in_progress → completed).
 * Only DB-allowed status values are accepted. RLS "Drivers can update own trips" allows driver to UPDATE.
 */
export interface UpdateTripStatusData {
  status: string;
  started_at?: string | null;
  completed_at?: string | null;
  /** Ephemeral marker read by status→chat DB trigger (e.g. business_simulated). */
  status_change_origin?: string | null;
}

const COMPLETED_STATUS_SET = new Set(["completed", "delivered", "done"]);

// Statuses that mean the trip is physically underway; entering any of these
// requires a started_at. Used to auto-stamp it when a caller omits it.
const MOVING_STATUS_SET = new Set([
  "in_progress",
  "picked_up",
  "in_transit",
  "at_drop",
]);

function resolveTripPayoutModeForCompletion(
  trip:
    | Pick<TripRow, "trip_payout_mode" | "supplier_id" | "driver_id" | "vehicle_id">
    | null
    | undefined,
): "market" | "asset" {
  const raw = String(trip?.trip_payout_mode ?? "")
    .trim()
    .toLowerCase();
  if (raw === "market" || raw === "asset") return raw;
  if (String(trip?.supplier_id ?? "").trim()) return "market";
  return "asset";
}

async function ensureAssetCompletionAutoEntries(
  trip: TripRow | null | undefined,
): Promise<void> {
  if (!trip?.id || !trip.organization_id) return;
  // DCO settlement is dco_payee / supplier_rate — never employee DRIVER_COMMISSION.
  if (isDcoOperatingTrip(trip)) return;
  if (resolveTripPayoutModeForCompletion(trip) !== "asset") return;

  const existingRes = await supabase()
    .from("transactions")
    .select("id, contact_type, amount_in, amount_out, ledger_category")
    .eq("organization_id", trip.organization_id)
    .eq("trip_id", trip.id);

  if (existingRes.error) {
    // A8.4.1: was console.warn-only -- a failure here silently skipped the
    // whole function (no TRIP_REVENUE/DRIVER_COMMISSION row ever written)
    // with nothing surfacing beyond a dev-console line nobody monitored.
    // Upgraded to console.error (searchable/alertable in log aggregation,
    // unlike warn) without changing control flow -- trip completion itself
    // must not block on this. A real Sentry-backed logger was tried here
    // but pulls @sentry/react-native into trips.service.ts's module graph,
    // which several existing jest suites can't load (no RN native modules
    // in the test env) -- reverted rather than widen this fix into a test-
    // infra change.
    console.error("[trip completion] failed to inspect existing entries", {
      tripId: trip.id,
      organizationId: trip.organization_id,
      error: existingRes.error,
    });
    return;
  }

  const existing = (existingRes.data ??
    []) as Array<{
    id: string;
    contact_type: string | null;
    amount_in: number | null;
    amount_out: number | null;
    ledger_category: string | null;
  }>;
  const hasClientIn = existing.some(
    (r) =>
      String(r.contact_type ?? "").toLowerCase() === "client" &&
      Number(r.amount_in ?? 0) > 0,
  );
  const hasDriverOut = existing.some(
    (r) =>
      String(r.contact_type ?? "").toLowerCase() === "driver" &&
      Number(r.amount_out ?? 0) > 0,
  );

  const transactionDate =
    String(trip.completed_at ?? "").slice(0, 10) ||
    new Date().toISOString().slice(0, 10);
  const clientAmount = Math.max(0, Number(trip.client_price ?? 0) || 0);
  const driverTargetAmount = Math.max(
    0,
    Number(trip.driver_commission ?? 0) || Number(trip.supplier_rate ?? 0) || 0,
  );

  const pendingInserts: Array<Record<string, unknown>> = [];
  if (!hasClientIn && clientAmount > 0) {
    pendingInserts.push({
      organization_id: trip.organization_id,
      trip_id: trip.id,
      party_name: String(trip.client_name ?? "").trim() || "Client",
      description: "TRIP REVENUE AUTO | Mode: System",
      amount_in: clientAmount,
      amount_out: 0,
      transaction_date: transactionDate,
      contact_id: trip.client_id ?? null,
      contact_type: "client",
      ledger_entity_type: "client",
      ledger_flow_type: "receivable",
      ledger_category: "TRIP_REVENUE",
    });
  }
  if (!hasDriverOut && driverTargetAmount > 0 && String(trip.driver_id ?? "").trim()) {
    pendingInserts.push({
      organization_id: trip.organization_id,
      trip_id: trip.id,
      party_name: String(trip.driver_display_name ?? "").trim() || "Driver",
      description: "DRIVER COMMISSION AUTO | Mode: System",
      amount_in: 0,
      amount_out: driverTargetAmount,
      transaction_date: transactionDate,
      contact_id: trip.driver_id,
      contact_type: "driver",
      ledger_entity_type: "driver",
      ledger_flow_type: "payable",
      ledger_category: "DRIVER_COMMISSION",
    });
  }

  if (pendingInserts.length > 0) {
    const { error: insertError } = await supabase()
      .from("transactions")
      .insert(pendingInserts);
    if (insertError) {
      // A8.4.1: this insert wrote ledger_entity_type "CLIENT"/"DRIVER"
      // (uppercase) from 2026-05-02 until this fix -- transactions_ledger_
      // entity_type_check only ever allowed lowercase, so it failed on
      // every single call, silently, via console.warn-only handling below.
      // Fixed at the two literals above; upgraded to console.error (see the
      // comment on the earlier console.error in this function for why a
      // Sentry-backed logger was tried and reverted here). See A8.4/A8.4.1
      // for the historical-repair migration that backfills the rows this
      // bug prevented from ever being written.
      console.error("[trip completion] failed to auto-create asset entries", {
        tripId: trip.id,
        organizationId: trip.organization_id,
        error: insertError,
        count: pendingInserts.length,
      });
    }
  }

  // A8.3 -- Marketplace platform fee, Marketplace DCO trips only
  // (source='market_bid', platform_fee already resolved and locked in by
  // accept_market_bid() at award time -- this reads that stored value, it
  // never recomputes the fee). Deliberately a separate insert from the
  // client/driver rows above rather than appended to the same batch: those
  // two rows failed their own CHECK constraint before A8.4.1's fix above,
  // and a single multi-row INSERT is all-or-nothing, so bundling this row
  // with them would have made it inherit that unrelated failure.
  if (
    !hasPlatformFeeEntry(existing) &&
    trip.source === "market_bid" &&
    Number(trip.platform_fee ?? 0) > 0
  ) {
    const { error: feeInsertError } = await supabase()
      .from("transactions")
      .insert({
        organization_id: trip.organization_id,
        trip_id: trip.id,
        party_name: "Pulse Marketplace",
        description: "MARKETPLACE PLATFORM FEE AUTO | Mode: System",
        amount_out: Number(trip.platform_fee),
        amount_in: 0,
        transaction_date: transactionDate,
        contact_id: null,
        contact_type: null,
        ledger_entity_type: "platform",
        ledger_flow_type: "expense",
        ledger_category: "MARKETPLACE_PLATFORM_FEE",
      });
    if (feeInsertError) {
      console.error("[trip completion] failed to auto-create platform fee entry", {
        tripId: trip.id,
        organizationId: trip.organization_id,
        error: feeInsertError,
      });
    }
  }
}

function hasPlatformFeeEntry(rows: Array<{ ledger_category: string | null }>): boolean {
  return rows.some((r) => r.ledger_category === "MARKETPLACE_PLATFORM_FEE");
}

async function validateSupplierLinkForCompletion(
  tripId: string,
): Promise<{ error: Error | null }> {
  const { data: trip, error: tripError } = await supabase()
    .from("trips")
    .select("id, source, supplier_id, trip_payout_mode, driver_id, vehicle_id, operating_mode")
    .eq("id", tripId)
    .maybeSingle();
  if (tripError) return { error: new Error(tripError.message) };
  if (!trip) return { error: new Error("Trip not found.") };

  const supplierId = String(trip.supplier_id ?? "").trim();
  const payoutMode = String(trip.trip_payout_mode ?? "")
    .trim()
    .toLowerCase();
  const hasOwnDriver = String(trip.driver_id ?? "").trim().length > 0;
  const hasOwnVehicle = String(trip.vehicle_id ?? "").trim().length > 0;

  // Asset execution needs no supplier linkage — the executing org drives the load
  // itself, so there is no counterparty to reconcile against. Winning the load via a
  // direct quote says nothing about WHO drives it: an org can quote on someone's
  // indent (or its own) and then deploy its own driver + vehicle. Keying the guard on
  // source === 'direct_quote' therefore trapped legitimate asset trips in a supplier
  // check they can never satisfy, and the driver could not complete the delivery.
  // Mirrors getTripExecutionModel() (features/trips/domain/tripExecutionModel.ts):
  // source 'mover_asset' is always asset, then explicit mode wins, then own driver
  // AND vehicle means asset. Deliberately inlined rather than imported: that module
  // imports TripRow from this file, so calling it here would create a circular
  // import. Keep the two in sync if the execution rule changes.
  const source = String(trip.source ?? "")
    .trim()
    .toLowerCase();
  if (isDcoOperatingTrip(trip)) return { error: null };
  if (source === "mover_asset") return { error: null };
  if (payoutMode === "asset") return { error: null };
  if (!payoutMode && hasOwnDriver && hasOwnVehicle) return { error: null };

  const requiresSupplierLink = payoutMode === "market" || supplierId.length > 0;
  if (!requiresSupplierLink) return { error: null };

  if (!supplierId) {
    return {
      error: new Error(
        "Cannot complete aggregate trip without a supplier. Assign a supplier first.",
      ),
    };
  }

  const { data: supplierRow, error: supplierError } = await supabase()
    .from("suppliers")
    .select("id")
    .eq("id", supplierId)
    .maybeSingle();
  if (!supplierError && supplierRow) return { error: null };

  const { data: supplierTxnRow, error: supplierTxnError } = await supabase()
    .from("transactions")
    .select("id")
    .eq("trip_id", tripId)
    .eq("contact_type", "supplier")
    .limit(1)
    .maybeSingle();
  if (!supplierTxnError && supplierTxnRow) return { error: null };

  return {
    error: new Error(
      "Cannot complete aggregate trip because supplier linkage is unresolved.",
    ),
  };
}

export async function updateTripStatus(
  tripId: string,
  data: UpdateTripStatusData,
): Promise<{ error: Error | null; trip: TripRow | null }> {
  const status = (data.status ?? "").trim().toLowerCase();
  if (
    !TRIP_STATUS_VALUES.includes(status as (typeof TRIP_STATUS_VALUES)[number])
  ) {
    return {
      error: new Error(
        `Invalid trip status "${data.status}". Allowed: ${TRIP_STATUS_VALUES.join(", ")}`,
      ),
      trip: null,
    };
  }
  if (COMPLETED_STATUS_SET.has(status)) {
    const validation = await validateSupplierLinkForCompletion(tripId);
    if (validation.error) return { error: validation.error, trip: null };
  }
  let wasAlreadyCompleted = false;
  if (COMPLETED_STATUS_SET.has(status)) {
    const before = await supabase()
      .from("trips")
      .select("status, completed_at")
      .eq("id", tripId)
      .maybeSingle();
    if (!before.error && before.data) {
      const beforeStatus = String((before.data as { status?: string | null }).status ?? "")
        .trim()
        .toLowerCase();
      const beforeCompletedAt = String(
        (before.data as { completed_at?: string | null }).completed_at ?? "",
      ).trim();
      wasAlreadyCompleted =
        COMPLETED_STATUS_SET.has(beforeStatus) || beforeCompletedAt.length > 0;
    }
  }
  // TripStarted (docs/architecture/10-platform-event-catalog.md) fires only the first time
  // started_at transitions from empty to set — same idempotency shape as TripAssigned, just
  // via an explicit before/after check instead of an optimistic-concurrency parameter, since
  // this function has none. A retry that re-sends the same started_at after it's already set
  // must not re-publish.
  let wasAlreadyStarted = true;
  const settingStartedAt = Boolean(data.started_at != null && String(data.started_at).trim() !== "");
  if (settingStartedAt) {
    const before = await supabase()
      .from("trips")
      .select("started_at")
      .eq("id", tripId)
      .maybeSingle();
    wasAlreadyStarted = Boolean(
      !before.error &&
        before.data &&
        String((before.data as { started_at?: string | null }).started_at ?? "").trim() !== "",
    );
  }
  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    status,
  };
  if (data.started_at !== undefined)
    updates.started_at = data.started_at ?? null;
  // Guard: a trip cannot enter a moving state without a start timestamp.
  // If the caller transitions into transit but never passes started_at, stamp
  // it now so status and started_at can't diverge (e.g. in_transit with null
  // started_at, which breaks duration/SLA and the driver timeline).
  else if (MOVING_STATUS_SET.has(status)) {
    const before = await supabase()
      .from("trips")
      .select("started_at")
      .eq("id", tripId)
      .maybeSingle();
    const existingStartedAt = String(
      (before.data as { started_at?: string | null } | null)?.started_at ?? "",
    ).trim();
    if (!before.error && existingStartedAt === "")
      updates.started_at = updates.updated_at;
  }
  if (data.completed_at !== undefined)
    updates.completed_at = data.completed_at ?? null;
  if (data.status_change_origin !== undefined)
    updates.status_change_origin = data.status_change_origin ?? null;
  const { data: row, error } = await supabase()
    .from("trips")
    .update(updates)
    .eq("id", tripId)
    .select()
    .maybeSingle();
  if (error) return { error: new Error(error.message), trip: null };
  // UPDATE can succeed while RETURNING is empty (SELECT RLS). Verify before failing.
  let updatedTrip = row as TripRow | null;
  if (updatedTrip == null) {
    const verified = await supabase()
      .from("trips")
      .select("*")
      .eq("id", tripId)
      .maybeSingle();
    const verifiedStatus = String(
      (verified.data as { status?: string | null } | null)?.status ?? "",
    )
      .trim()
      .toLowerCase();
    if (!verified.error && verified.data && verifiedStatus === status) {
      updatedTrip = verified.data as TripRow;
    } else {
      const driverView = await supabase()
        .from("trips_driver_view")
        .select("*")
        .eq("id", tripId)
        .maybeSingle();
      const viewStatus = String(
        (driverView.data as { status?: string | null } | null)?.status ?? "",
      )
        .trim()
        .toLowerCase();
      if (!driverView.error && driverView.data && viewStatus === status) {
        updatedTrip = driverRowToTripRow(driverView.data as DriverTripRow);
      } else {
        return {
          error: new Error(
            'Trip could not be updated. You may not have permission to update this trip, or the trip was not found. Ensure the "Drivers can update own trips" RLS policy is applied (run migrations).',
          ),
          trip: null,
        };
      }
    }
  }
  if (COMPLETED_STATUS_SET.has(status) && !wasAlreadyCompleted) {
    await ensureAssetCompletionAutoEntries(updatedTrip);
    // TripDelivered (docs/architecture/10-platform-event-catalog.md) — reuses the same
    // wasAlreadyCompleted before-fetch already computed above for ensureAssetCompletionAutoEntries,
    // so a retry that re-sends the same completed/delivered/done status never re-publishes.
    void getPlatformEventBus()
      .publish({
        name: "TripDelivered",
        workspaceId: updatedTrip.organization_id,
        correlationId: uuidv7(),
        occurredAt: new Date().toISOString(),
        payload: {
          tripId: updatedTrip.id,
          indentId: updatedTrip.indent_id ?? null,
          driverId: updatedTrip.driver_id ?? null,
          vehicleId: updatedTrip.vehicle_id ?? null,
          deliveredAt: updatedTrip.completed_at ?? String(data.completed_at ?? ""),
        },
      })
      .catch((err) => {
        if (__DEV__) console.warn("[trips] TripDelivered publish failed:", err);
      });
  }
  if (settingStartedAt && !wasAlreadyStarted) {
    void getPlatformEventBus()
      .publish({
        name: "TripStarted",
        workspaceId: updatedTrip.organization_id,
        correlationId: uuidv7(),
        occurredAt: new Date().toISOString(),
        payload: {
          tripId: updatedTrip.id,
          indentId: updatedTrip.indent_id ?? null,
          driverId: updatedTrip.driver_id ?? null,
          vehicleId: updatedTrip.vehicle_id ?? null,
          startedAt: updatedTrip.started_at ?? String(data.started_at),
        },
      })
      .catch((err) => {
        if (__DEV__) console.warn("[trips] TripStarted publish failed:", err);
      });
  }
  return { error: null, trip: updatedTrip };
}

export interface ForceSetTripStatusSimulatedData {
  status: string;
  startedAt?: string | null;
  completedAt?: string | null;
  statusChangeOrigin: string;
  notes?: string | null;
}

const SIMULATE_TRIP_WRITE_TIMEOUT_MS = 12_000;

/**
 * Business-simulation-only escape hatch for the admin "Simulate"/"Revoke simulation"
 * UI (TripDetailScreen): unconditionally sets trip status, bypassing updateTripStatus()'s
 * extra preflight SELECTs (those hang when PostgREST is saturated). One UPDATE.
 */
export async function forceSetTripStatusSimulated(
  tripId: string,
  data: ForceSetTripStatusSimulatedData,
  signal?: AbortSignal,
): Promise<{ error: Error | null; trip: TripRow | null }> {
  const updates: Record<string, unknown> = {
    status: data.status,
    status_change_origin: data.statusChangeOrigin,
    updated_at: new Date().toISOString(),
  };
  if (data.startedAt !== undefined) updates.started_at = data.startedAt ?? null;
  if (data.completedAt !== undefined) updates.completed_at = data.completedAt ?? null;
  if (data.notes !== undefined) updates.notes = data.notes;
  let query = supabase()
    .from("trips")
    .update(updates)
    .eq("id", tripId)
    .select();
  if (signal) query = query.abortSignal(signal);
  const { data: row, error } = await query.maybeSingle();
  if (error) return { error: new Error(error.message), trip: null };
  return { error: null, trip: row as TripRow | null };
}

/**
 * Ops simulate: one timed write (status + BISIM note). Skips updateTripStatus
 * preflights so "Driver arrived at drop-off" cannot spin forever on a 503.
 */
export async function simulateBusinessTripStage(params: {
  tripId: string;
  targetStatus: string;
  fromStatus: string;
  notes: string;
  startedAt?: string;
  completedAt?: string;
  signal?: AbortSignal;
}): Promise<{ error: Error | null; trip: TripRow | null; cancelled?: boolean }> {
  const mergeSignals = (timeoutSignal: AbortSignal) => {
    if (!params.signal) return timeoutSignal;
    const merged = new AbortController();
    const abort = () => merged.abort();
    if (timeoutSignal.aborted || params.signal.aborted) {
      abort();
      return merged.signal;
    }
    timeoutSignal.addEventListener("abort", abort, { once: true });
    params.signal.addEventListener("abort", abort, { once: true });
    return merged.signal;
  };
  try {
    const result = await withTimeout(
      (timeoutSignal) =>
        forceSetTripStatusSimulated(
          params.tripId,
          {
            status: params.targetStatus,
            startedAt: params.startedAt,
            completedAt: params.completedAt,
            statusChangeOrigin: "business_simulated",
            notes: params.notes,
          },
          mergeSignals(timeoutSignal),
        ),
      SIMULATE_TRIP_WRITE_TIMEOUT_MS,
      { jitter: false },
    );
    if (params.signal?.aborted) {
      return { error: null, trip: null, cancelled: true };
    }
    return result;
  } catch (e) {
    const name = e instanceof Error ? e.name : "";
    if (params.signal?.aborted || name === "AbortError") {
      return { error: null, trip: null, cancelled: true };
    }
    if (e instanceof TimeoutError) {
      return {
        error: new Error(
          "Simulation timed out. The database is busy — try Confirm Simulate again.",
        ),
        trip: null,
      };
    }
    return {
      error: e instanceof Error ? e : new Error("Simulation failed"),
      trip: null,
    };
  }
}

export interface TripDriverOnlineState {
  isOnline: boolean;
  lastSeen: string | null;
}

/**
 * Returns driver online/offline state for a trip using latest driver location timestamp.
 * Backend is authoritative (SECURITY DEFINER) and uses org membership to authorize reads.
 */
export async function getTripDriverOnlineState(
  tripId: string,
  offlineAfterSeconds = 90,
): Promise<{ error: Error | null; state: TripDriverOnlineState | null }> {
  const { data, error } = await supabase().rpc("get_trip_driver_online_state", {
    p_trip_id: tripId,
    p_offline_after_seconds: offlineAfterSeconds,
  });
  if (error) return { error: new Error(error.message), state: null };

  // PostgREST returns set-returning functions as arrays
  const row = Array.isArray(data) ? (data[0] ?? null) : (data ?? null);
  if (!row) return { error: null, state: { isOnline: false, lastSeen: null } };

  const obj = row as { is_online?: boolean; last_seen?: string | null };
  return {
    error: null,
    state: {
      isOnline: obj.is_online === true,
      lastSeen: obj.last_seen ?? null,
    },
  };
}

export type ManualAdvanceTripAction =
  | "confirm_arrival"
  | "start_transit"
  | "reach_drop"
  | "complete";

/**
 * Creator-only manual trip progression while driver is offline.
 * Uses optimistic revisioning + idempotency on the backend.
 */
export async function manualAdvanceTrip(
  tripId: string,
  params: {
    action: ManualAdvanceTripAction;
    expectedRevision: number;
    idempotencyKey: string;
  },
): Promise<{ error: Error | null; trip: TripRow | null }> {
  if (params.action === "complete") {
    const validation = await validateSupplierLinkForCompletion(tripId);
    if (validation.error) return { error: validation.error, trip: null };
  }
  const { data, error } = await supabase().rpc("manual_advance_trip", {
    p_trip_id: tripId,
    p_action: params.action,
    p_expected_revision: params.expectedRevision,
    p_idempotency_key: params.idempotencyKey,
  });
  if (error) return { error: new Error(error.message), trip: null };
  const trip = (data ?? null) as TripRow | null;
  if (params.action === "complete" && trip) {
    await ensureAssetCompletionAutoEntries(trip);
  }
  return { error: null, trip };
}

/**
 * Claim trip creator for legacy trips where `created_by` is null.
 * Backend enforces: caller must be org member; only first claimant wins.
 */
export async function claimTripCreator(
  tripId: string,
): Promise<{ error: Error | null; createdBy: string | null }> {
  const { data, error } = await supabase().rpc("claim_trip_creator", {
    p_trip_id: tripId,
  });
  if (error) return { error: new Error(error.message), createdBy: null };
  const obj = data as {
    ok?: boolean;
    error?: string;
    created_by?: string;
  } | null;
  if (!obj || obj.ok !== true) {
    return {
      error: new Error(obj?.error ?? "Could not claim creator"),
      createdBy: null,
    };
  }
  return { error: null, createdBy: obj.created_by ?? null };
}

/** Update client payment received (amount_paid). */
export interface UpdateTripPaymentData {
  amount_paid: number;
}

export interface UpdateTripRouteMetricsData {
  /** Route distance in km (stored in trips.distance). */
  distance?: number | null;
  /** ETA as interval-compatible string, e.g. "02:15:00". */
  estimated_duration?: string | null;
}

/**
 * Persist route metrics when they were missing at assignment time.
 * Keeps ETA/distance available across active flow and trip history.
 */
export async function updateTripRouteMetrics(
  tripId: string,
  data: UpdateTripRouteMetricsData,
): Promise<{ error: Error | null; trip: TripRow | null }> {
  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (data.distance !== undefined) {
    const n = Number(data.distance);
    updates.distance = Number.isFinite(n) && n >= 0 ? n : null;
  }
  if (data.estimated_duration !== undefined) {
    const eta = String(data.estimated_duration ?? "").trim();
    updates.estimated_duration = eta || null;
  }
  const hasRouteField =
    data.distance !== undefined || data.estimated_duration !== undefined;
  if (!hasRouteField) return { error: null, trip: null };
  const { data: row, error } = await supabase()
    .from("trips")
    .update(updates)
    .eq("id", tripId)
    .select()
    .maybeSingle();
  if (error) return { error: new Error(error.message), trip: null };
  return { error: null, trip: (row ?? null) as TripRow | null };
}

export async function updateTripPayment(
  tripId: string,
  data: UpdateTripPaymentData,
): Promise<{ error: Error | null; trip: TripRow | null }> {
  const amountPaid = Math.max(0, Number(data.amount_paid) ?? 0);
  const { data: row, error } = await supabase()
    .from("trips")
    .update({
      amount_paid: amountPaid,
      updated_at: new Date().toISOString(),
    })
    .eq("id", tripId)
    .select()
    .maybeSingle();
  if (error) return { error: new Error(error.message), trip: null };
  return { error: null, trip: row as TripRow | null };
}

export type ActiveDriverAssignmentMap = {
  busyDriverIds: Set<string>;
  tripLabelByDriverId: Record<string, string>;
};

/**
 * Driver IDs on any non-terminal trip for this org, with trip label for display.
 * Mirrors the shape of {@link getActiveVehicleAssignments} so the reassign UI
 * can show "On Trip #TR-001" instead of a generic "On another trip".
 */
export async function getActiveDriverAssignments(
  orgId: string,
  excludeTripId?: string,
): Promise<{ error: Error | null; map: ActiveDriverAssignmentMap }> {
  let q = supabase()
    .from("trips")
    .select("id, driver_id, trip_number, trip_code, trip_operational_code, status")
    .eq("organization_id", orgId)
    .not("driver_id", "is", null)
    .not("status", "in", `("${ONGOING_TRIP_TERMINAL_STATUSES.join('","')}")`)
    .limit(500);
  if (excludeTripId != null && excludeTripId.trim() !== "") {
    q = q.neq("id", excludeTripId);
  }
  const { data, error } = await q;
  if (error) {
    return {
      error: new Error(error.message),
      map: { busyDriverIds: new Set(), tripLabelByDriverId: {} },
    };
  }
  const busyDriverIds = new Set<string>();
  const tripLabelByDriverId: Record<string, string> = {};
  for (const row of data ?? []) {
    const r = row as {
      driver_id?: string | null;
      trip_number?: string | null;
      trip_code?: string | null;
      trip_operational_code?: string | null;
      status?: string | null;
    };
    const did = r.driver_id;
    if (!did || busyDriverIds.has(did)) continue;
    busyDriverIds.add(did);
    const tripDisplay = getTripOperationalDisplayCode({
      trip_operational_code: r.trip_operational_code ?? null,
      trip_code: r.trip_code ?? null,
      trip_number: r.trip_number ?? null,
    });
    tripLabelByDriverId[did] =
      tripDisplay !== "—" ? `Trip #${tripDisplay}` : "another trip";
  }
  return { error: null, map: { busyDriverIds, tripLabelByDriverId } };
}

/** @deprecated Use {@link getActiveDriverAssignments} for trip-label context. */
export async function getActiveDriverIds(orgId: string): Promise<Set<string>> {
  const { map } = await getActiveDriverAssignments(orgId);
  return map.busyDriverIds;
}

export type ActiveVehicleAssignmentMap = {
  busyVehicleIds: Set<string>;
  tripLabelByVehicleId: Record<string, string>;
};

/**
 * Batch load vehicles on non-terminal trips for this org (one query).
 * excludeTripId allows reassignment on the current trip.
 */
export async function getActiveVehicleAssignments(
  orgId: string,
  excludeTripId?: string,
): Promise<{ error: Error | null; map: ActiveVehicleAssignmentMap }> {
  let q = supabase()
    .from("trips")
    .select("id, vehicle_id, trip_number, trip_code, trip_operational_code")
    .eq("organization_id", orgId)
    .not("vehicle_id", "is", null)
    .not("status", "in", `("${ONGOING_TRIP_TERMINAL_STATUSES.join('","')}")`)
    .limit(500);
  if (excludeTripId != null && excludeTripId.trim() !== "") {
    q = q.neq("id", excludeTripId);
  }
  const { data, error } = await q;
  if (error) {
    return {
      error: new Error(error.message),
      map: { busyVehicleIds: new Set(), tripLabelByVehicleId: {} },
    };
  }
  const busyVehicleIds = new Set<string>();
  const tripLabelByVehicleId: Record<string, string> = {};
  for (const row of data ?? []) {
    const r = row as {
      vehicle_id?: string | null;
      trip_number?: string | null;
      trip_code?: string | null;
      trip_operational_code?: string | null;
    };
    const vid = r.vehicle_id;
    if (!vid || busyVehicleIds.has(vid)) continue;
    busyVehicleIds.add(vid);
    const tripDisplay = getTripOperationalDisplayCode({
      trip_operational_code: r.trip_operational_code ?? null,
      trip_code: r.trip_code ?? null,
      trip_number: r.trip_number ?? null,
    });
    tripLabelByVehicleId[vid] = tripDisplay !== "—" ? tripDisplay : "another trip";
  }
  return { error: null, map: { busyVehicleIds, tripLabelByVehicleId } };
}

/** Read trip.updated_at for client-side stale guard before reassign. */
export async function getTripUpdatedAt(
  tripId: string,
): Promise<{ error: Error | null; updatedAt: string | null }> {
  const { data, error } = await supabase()
    .from("trips")
    .select("updated_at")
    .eq("id", tripId)
    .maybeSingle();
  if (error) return { error: new Error(error.message), updatedAt: null };
  const row = data as { updated_at?: string | null } | null;
  return { error: null, updatedAt: row?.updated_at ?? null };
}
