/**
 * Indents service — Supabase only (mobile). Same DB as pulse-unified-base.
 * Service-layer validation: single pass over inputs before insert.
 */
import { getClientById } from "@/features/clients/services/clients.service";
import { findIndentInMarketList } from "@/features/indents/utils/findIndentInList.util";
import { createSharedIndentCopiesWithOps } from "@/features/indents/utils/indentShareCopies.util";
import {
  deactivatePostsForIndent,
  ensureIndentStory,
  isIndentTerminalForStory,
} from "@/features/network/services/indentStoryPosts.service";
import {
  getIndentOperationalDisplay,
  getTripOperationalDisplay,
} from "@/features/operations/display";
import type { CacheDomain, DeltaResponse } from "@/lib/cache/deltaTypes";
import { syncDomainRows } from "@/lib/cache/domainSync";
import { mergeDeltaRows } from "@/lib/cache/mergeDelta";
import { DEFAULT_PAGE_SIZE, FINITE_LIST_CAP, type PageOpts } from "@/lib/pagination";
import { isIndentWriteTimeout } from "@/features/indents/utils/indentCreateTimeout.util";
import { supabase } from "@/lib/supabase";
import {
  VALIDATION,
  dateISO,
  maxLength,
  nonNegativeAmount,
  positiveAmount,
  required,
  runValidators,
} from "@/lib/validation";

export { findIndentInMarketList } from "@/features/indents/utils/findIndentInList.util";

export type CirculationTarget =
  | "marketplace"
  | "integrated_supplier"
  | "offline"
  | "both";
export type IndentAction = "draft" | "share";

/** Input for creating an indent (UI → service). client_id only sent when valid UUID. */
export interface CreateIndentInput {
  pickup_area: string;
  drop_location: string;
  client_name: string;
  client_price: number;
  supplier_target: number;
  /** Optional: status is managed by DB default / backend logic. */
  status?: string | null;
  client_id?: string | null;
  lane_id?: string | null;
  sale_rate_basis?: "per_mt" | "per_trip" | null;
  /** Unit of supplier_target — independent of the client sale basis. */
  supplier_rate_basis?: "per_mt" | "per_trip" | null;
  sale_unit_rate?: number | null;
  /** Required: vehicle type (e.g. Truck). */
  vehicle_type: string;
  /** Required: load type (e.g. FMCG). */
  load_type: string;
  /**
   * Weight in kg (UI converts from tons). Null is allowed only for a per-MT
   * sale, where the rate carries the price and the real weight is measured at
   * loading — `createIndent` enforces that (see `perMtWeightOptional`).
   */
  weight: number | null;
  pickup_date?: string | null;
  circulation_target?: CirculationTarget | null;
  routeStops?: Array<{
    type: "pickup" | "drop";
    area: string;
    address?: string;
  }>;
  /** Sequential ID owner (auth.uid). Next IND001 is per this user. */
  owner_user_id?: string | null;
  /** User who created this row. */
  created_by_user_id?: string | null;
}

/** Single stop for insertIndentStops (ordered by array index). */
export interface IndentStopInput {
  type: "pickup" | "drop";
  area: string;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

export interface IndentRow {
  id: string;
  organization_id: string;
  /**
   * Commerce (multi-order e-commerce) execution plan this indent belongs to.
   * Not a column on `indents` — it is resolved at read time from the linked
   * commerce records and attached to the row, so it is optional. Consumers
   * (LoadCenterView, indentStoryPosts) read it to flag commerce loads.
   */
  execution_plan_id?: string | null;
  /** Operational identity code, e.g. GGV234-IND-001 */
  indent_code?: string | null;
  /** Enterprise operational identity code, e.g. GGV234ABCIND000001 */
  indent_operational_code?: string | null;
  /** User-facing ID; DB trigger sets from display_indent_id when null. */
  indent_number: string;
  /** Per-org sequence; set by DB trigger. Used for IND001 display. */
  sequence_number?: number | null;
  /** User-facing indent ID e.g. IND001. Set by trigger from sequence_number. */
  display_indent_id?: string | null;
  pickup_area: string;
  drop_location: string;
  client_name: string;
  client_price: number;
  supplier_target: number;
  status: string;
  client_id?: string | null;
  lane_id?: string | null;
  sale_rate_basis?: "per_mt" | "per_trip" | null;
  /** Unit of supplier_target — independent of the client sale basis. */
  supplier_rate_basis?: "per_mt" | "per_trip" | null;
  sale_unit_rate?: number | null;
  vehicle_type: string | null;
  load_type: string | null;
  pickup_date: string | null;
  circulation_target: string | null;
  shared_at?: string | null;
  last_saved_at?: string | null;
  weight?: number | null;
  created_at: string;
  /** Name of the organization that created the indent (who posted the load). For Find Work: show this to supplier. */
  creator_organization_name?: string | null;
  /** Sequential ID owner (auth.uid). Next IND001 is per this user. */
  owner_user_id?: string | null;
  /** User who created this row. */
  created_by_user_id?: string | null;
  trip_number?: string | null;
  assigned_supplier_id?: string | null;
  assigned_supplier_rate?: number | null;
  [key: string]: unknown;
}

type IndentTripJoin = {
  trip_operational_code?: string | null;
  trip_number: string | null;
  trip_code?: string | null;
};

function normalizeIndentRow(
  row: IndentRow & {
    active_trip?: IndentTripJoin[] | null;
    trips?: IndentTripJoin[] | null;
    trip_code?: string | null;
  },
): IndentRow {
  const tripRef =
    getTripOperationalDisplay({
      trip_operational_code:
        row.active_trip?.[0]?.trip_operational_code ??
        row.trips?.[0]?.trip_operational_code ??
        null,
      trip_code: row.active_trip?.[0]?.trip_code ?? row.trips?.[0]?.trip_code ?? null,
      trip_number:
        row.active_trip?.[0]?.trip_number ?? row.trips?.[0]?.trip_number ?? row.trip_number ?? null,
    }) ?? null;
  return {
    ...row,
    indent_operational_code: row.indent_operational_code ?? null,
    indent_number: getIndentOperationalDisplay(row),
    trip_number: tripRef === "—" ? null : tripRef,
  };
}

/** PostgREST can commit the insert after the client aborts; reuse that row. */
async function recoverCreatedIndentAfterTimeout(
  orgId: string,
  payload: Record<string, unknown>,
): Promise<IndentRow | null> {
  const pickup = String(payload.pickup_area ?? "").trim();
  const drop = String(payload.drop_location ?? "").trim();
  const clientName = String(payload.client_name ?? "").trim();
  if (!pickup || !drop || !clientName) return null;

  const since = new Date(Date.now() - 3 * 60 * 1000).toISOString();
  let query = supabase()
    .from("indents")
    .select("*")
    .eq("organization_id", orgId)
    .eq("pickup_area", pickup)
    .eq("drop_location", drop)
    .eq("client_name", clientName)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1);

  const createdBy =
    typeof payload.created_by_user_id === "string"
      ? payload.created_by_user_id
      : "";
  if (createdBy) {
    query = query.eq("created_by_user_id", createdBy);
  }

  const { data, error } = await query.maybeSingle();
  if (error || !data) return null;
  return data as IndentRow;
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
    // Keep backward compatibility with DBs that do not have this table
    // or block direct writes to it.
    if (
      msg.includes("relation") ||
      msg.includes("permission denied") ||
      msg.includes("policy")
    ) {
      return;
    }
    throw new Error(error.message);
  }
}

export async function getIndentsByOrganization(
  orgId: string,
  opts?: PageOpts,
): Promise<{
  error: Error | null;
  indents: IndentRow[];
  hasMore?: boolean;
  /** True when the unpaginated read hit FINITE_LIST_CAP and older rows were cut off. */
  truncated?: boolean;
}> {
  const base = () =>
    supabase()
      .from("indents")
      .select(
        "*, active_trip:trips!trips_indent_id_fkey(trip_operational_code, trip_number, trip_code)",
      )
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false });
  if (opts != null) {
    const limit = opts.limit ?? DEFAULT_PAGE_SIZE;
    const offset = opts.offset ?? 0;
    const { data, error } = await base().range(offset, offset + limit);
    if (error) return { error: new Error(error.message), indents: [] };
    const indents = (data ?? []).map((row) =>
      normalizeIndentRow(row as IndentRow & { trips?: IndentTripJoin[] | null }),
    ) as IndentRow[];
    const hasMore = indents.length > limit;
    return {
      error: null,
      indents: hasMore ? indents.slice(0, limit) : indents,
      hasMore,
    };
  }
  const { data, error } = await base().limit(FINITE_LIST_CAP);
  if (error) return { error: new Error(error.message), indents: [] };
  const indents = (data ?? []).map((row) =>
    normalizeIndentRow(row as IndentRow & { trips?: IndentTripJoin[] | null }),
  ) as IndentRow[];
  // Hitting the cap means older indents were cut off. The delta cursor is derived
  // from max(updated_at) of whatever came back, so a truncated page would advance
  // the cursor past rows that were never merged — making them permanently
  // invisible until the next scheduled full sync. Report truncation so the sync
  // layer can decline to trust this page as a cursor baseline.
  return { error: null, indents, truncated: indents.length >= FINITE_LIST_CAP };
}

export async function getIndentsDelta(
  orgId: string,
  since: { updatedAt: string; tieBreakerId?: string | null },
): Promise<{ error: Error | null; delta: DeltaResponse<IndentRow> }> {
  const { data, error } = await supabase().rpc("get_indents_delta", {
    p_org_id: orgId,
    p_since: since.updatedAt,
    p_limit: 1000,
  });
  if (error) return { error: new Error(error.message), delta: { changed: [], deletedIds: [], nextCursor: since } };
  const row = (Array.isArray(data) ? data[0] : data) as
    | { changed?: IndentRow[]; deleted_ids?: string[]; next_cursor?: string | null }
    | null;
  return {
    error: null,
    delta: {
      changed: ((row?.changed ?? []) as IndentRow[]).map((indent) =>
        normalizeIndentRow(indent as IndentRow & { trips?: IndentTripJoin[] | null }),
      ),
      deletedIds: (row?.deleted_ids ?? []) as string[],
      nextCursor: row?.next_cursor ? { updatedAt: row.next_cursor } : since,
    },
  };
}

/**
 * Cheap count of this org's LIVE indents — `head: true` sends no rows.
 *
 * Deliberately a *floor*, not an exact match for `getIndentsByOrganization`
 * (which also returns soft-deleted rows). The delta path prunes soft-deleted
 * rows via deletedIds, so a long-lived cache legitimately holds somewhere
 * between this count and the full-fetch count. Counting live rows makes it a
 * bound the cache can never fall below without genuinely missing data, so the
 * drift check needs no tuned tolerance.
 */
export async function getIndentsCountForOrganization(
  orgId: string,
): Promise<number | null> {
  const { count, error } = await supabase()
    .from("indents")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .is("deleted_at", null);
  if (error) return null;
  return count ?? null;
}

/** Domain key for the indents delta cache — exported so callers don't hardcode it. */
export const INDENTS_CACHE_DOMAIN = "indents" as const satisfies CacheDomain;

export async function syncIndentsWithCache(orgId: string, currentRows: IndentRow[]) {
  try {
    const indents = await syncDomainRows<IndentRow>({
      domain: INDENTS_CACHE_DOMAIN,
      orgId,
      // v2 invalidated legacy rows lacking operational identity fields.
      // v3 discards cursors written before the truncation guard below — those
      // may already point past rows the client never merged, so they cannot be
      // trusted even though the row shape is unchanged.
      schemaVersion: "3",
      // Was fullSyncEveryMs: 4h — a cursor that had drifted stayed authoritative
      // for a whole shift, so a user could create an indent and simply not see it.
      // 15m bounds the worst case; the count reconciliation below catches it sooner.
      policy: { maxDeltaLagMs: 3 * 60_000, fullSyncEveryMs: 15 * 60_000 },
      currentRows,
      fullFetchCap: FINITE_LIST_CAP,
      getServerCount: () => getIndentsCountForOrganization(orgId),
      getFull: async () => {
        const res = await getIndentsByOrganization(orgId);
        if (res.error) throw res.error;
        return { rows: res.indents, truncated: res.truncated };
      },
      getDelta: async (cursor) => {
        const res = await getIndentsDelta(orgId, cursor);
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
    return { error: null, indents };
  } catch (e) {
    return { error: e instanceof Error ? e : new Error(String(e)), indents: currentRows };
  }
}

/**
 * Partner shipper org → earliest ISO time the link became active (matches market_indents_for_org).
 * Precedence per shipper: organization_relations; else suppliers (caller = linked_organization_id);
 * else clients.linked_organization_id on caller's org.
 */
async function fetchPartnerShipperLinkSinceMap(
  orgId: string,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();

  const mergeMin = (shipperId: string, iso: string | null | undefined) => {
    if (!shipperId || !iso) return;
    const prev = map.get(shipperId);
    if (!prev || iso < prev) map.set(shipperId, iso);
  };

  const [
    { data: clientSupplier },
    { data: supplierClient },
    { data: suppliers },
    { data: linkedClients },
  ] = await Promise.all([
    supabase()
      .from("organization_relations")
      .select("from_organization_id, created_at")
      .eq("to_organization_id", orgId)
      .eq("relation_type", "client_supplier")
      .eq("status", "active"),
    supabase()
      .from("organization_relations")
      .select("to_organization_id, created_at")
      .eq("from_organization_id", orgId)
      .eq("relation_type", "supplier_client")
      .eq("status", "active"),
    supabase()
      .from("suppliers")
      .select("organization_id, updated_at")
      .eq("linked_organization_id", orgId),
    supabase()
      .from("clients")
      .select("linked_organization_id, created_at")
      .eq("organization_id", orgId)
      .eq("status", "active"),
  ]);

  for (const r of clientSupplier ?? []) {
    mergeMin(String(r.from_organization_id), r.created_at as string);
  }
  for (const r of supplierClient ?? []) {
    mergeMin(String(r.to_organization_id), r.created_at as string);
  }

  for (const s of suppliers ?? []) {
    const oid = s.organization_id as string | null;
    const ts = s.updated_at as string | null | undefined;
    if (!oid || oid === orgId || !ts) continue;
    if (map.has(oid)) continue;
    mergeMin(oid, ts);
  }

  for (const c of linkedClients ?? []) {
    const lid = c.linked_organization_id as string | null;
    if (!lid || lid === orgId) continue;
    if (map.has(lid)) continue;
    mergeMin(lid, c.created_at as string);
  }

  return map;
}

/**
 * Ensure integrated suppliers can see currently active loads from linked shippers,
 * including rows created before the connection timestamp.
 * This is a read-merge only safety net layered above RPC/fallback paths.
 */
function mergeIndentRowsById(...lists: IndentRow[][]): IndentRow[] {
  const existing = new Map<string, IndentRow>();
  const merged: IndentRow[] = [];
  for (const list of lists) {
    for (const row of list) {
      if (existing.has(row.id)) continue;
      existing.set(row.id, row);
      merged.push(row);
    }
  }
  return merged;
}

async function mergeLinkedShipperActiveIndents(
  orgId: string,
  baseIndents: IndentRow[],
): Promise<IndentRow[]> {
  const existing = new Map(baseIndents.map((i) => [i.id, i]));
  const linkMap = await fetchPartnerShipperLinkSinceMap(orgId);
  if (linkMap.size === 0) return baseIndents;

  const shipperIds = [...linkMap.keys()];
  const { data: rows, error } = await supabase()
    // indents has two FKs to organizations (organization_id, assigned_supplier_id),
    // so the embed must name the constraint or PostgREST returns PGRST201.
    .from("indents")
    .select("*, organizations!indents_organization_id_fkey(name)")
    .in("organization_id", shipperIds)
    // NULL fails an IN check — treat it as the createIndent default so a
    // missing circulation_target fails open instead of hiding the load.
    .or(
      "circulation_target.is.null,circulation_target.in.(integrated_supplier,both)",
    )
    .not("status", "in", '("completed","cancelled","closed","expired")')
    .neq("status", "draft")
    .order("created_at", { ascending: false });
  if (error || !rows?.length) return baseIndents;

  const merged = [...baseIndents];
  for (const row of rows as Array<
    IndentRow & { organizations?: { name: string | null } | null }
  >) {
    if (existing.has(row.id)) continue;
    const { organizations, ...rest } = row;
    const normalized: IndentRow = {
      ...rest,
      creator_organization_name: organizations?.name ?? null,
    } as IndentRow;
    existing.set(normalized.id, normalized);
    merged.push(normalized);
  }
  return merged;
}

/** Market-facing indents visible to the current organization (as integrated supplier). Uses RPC (SECURITY DEFINER) then direct table fallback. */
export async function getMarketIndentsForOrganization(
  orgId: string,
): Promise<{ error: Error | null; indents: IndentRow[] }> {
  if (!orgId) return { error: new Error("orgId is required"), indents: [] };

  // Param must be p_org_id — renamed from org_id in market_indents_via_reach.
  // Named-arg mismatch 404s the RPC and drops Claimed/Find Work for suppliers.
  const { data: rpcData, error: rpcError } = await supabase().rpc(
    "market_indents_for_org",
    {
      p_org_id: orgId,
    },
  );
  if (!rpcError && Array.isArray(rpcData)) {
    const indents = (rpcData as Record<string, unknown>[]).map((row) => {
      const { organizations, ...rest } = row;
      const name =
        (organizations as { name?: string | null } | null)?.name ??
        (row.creator_organization_name as string | null) ??
        null;
      return normalizeIndentRow({
        ...rest,
        creator_organization_name: name,
      } as IndentRow & { trips?: IndentTripJoin[] | null });
    });
    const [withActiveLinked, withQuoted] = await Promise.all([
      mergeLinkedShipperActiveIndents(orgId, indents),
      mergeQuotedIndentsForSupplier(orgId, indents),
    ]);
    return {
      error: null,
      indents: mergeIndentRowsById(indents, withActiveLinked, withQuoted).map((i) =>
        maskIndentRowForSupplierList(normalizeIndentRow(i), orgId),
      ),
    };
  }

  // Fallback when RPC is unavailable: partner-link indents (RLS-limited) plus
  // quoted/awarded indents via SECURITY DEFINER quoted_indents_for_org. Always
  // run the quoted merge — do not early-return on an empty link map, or an
  // awardee with only an accepted quote never sees Claimed.
  const linkMap = await fetchPartnerShipperLinkSinceMap(orgId);
  let indents: IndentRow[] = [];

  if (linkMap.size > 0) {
    const shipperIds = [...linkMap.keys()];
    const { data, error } = await supabase()
      .from("indents")
      .select("*, organizations!indents_organization_id_fkey(name)")
      .in("organization_id", shipperIds)
      // NULL fails an IN check — see fail-open note above.
      .or(
        "circulation_target.is.null,circulation_target.in.(integrated_supplier,both)",
      )
      .neq("status", "draft")
      .order("created_at", { ascending: false });

    if (error) return { error: new Error(error.message), indents: [] };

    const rows = (data ?? []).filter((row) => {
      const since = linkMap.get(String(row.organization_id ?? ""));
      if (!since) return false;
      const status = String(row.status ?? "").toLowerCase();
      const isActive =
        status !== "completed" &&
        status !== "cancelled" &&
        status !== "closed" &&
        status !== "expired";
      if (isActive) return true;
      return String(row.created_at ?? "") >= since;
    }) as (IndentRow & {
      organizations?: { name: string | null } | null;
    })[];
    indents = rows.map((row) => {
      const { organizations, ...rest } = row;
      return normalizeIndentRow({
        ...rest,
        creator_organization_name: organizations?.name ?? null,
      } as IndentRow & { trips?: IndentTripJoin[] | null });
    });
  }

  const merged = await mergeQuotedIndentsForSupplier(orgId, indents);
  return {
    error: null,
    indents: merged.map((i) =>
      maskIndentRowForSupplierList(normalizeIndentRow(i), orgId),
    ),
  };
}

/**
 * Safety net for supplier load pages:
 * if supplier has already quoted/bid on an indent (incl. story bid -> direct_quote),
 * ensure that indent appears in market loads even when partner-link/date filters exclude it.
 *
 * Uses the `quoted_indents_for_org` RPC (SECURITY DEFINER) rather than a plain
 * `.from("indents").select()` — indents RLS only allows SELECT by members of the
 * indent's own org, so a non-partner supplier's direct_quote-only access would
 * otherwise be silently filtered to zero rows here.
 */
async function mergeQuotedIndentsForSupplier(
  orgId: string,
  baseIndents: IndentRow[],
): Promise<IndentRow[]> {
  const existing = new Map(baseIndents.map((i) => [i.id, i]));

  const { data: extraRows, error: extraErr } = await supabase().rpc(
    "quoted_indents_for_org",
    { org_id: orgId },
  );
  if (extraErr || !extraRows?.length) return baseIndents;

  const extras = (extraRows as Array<IndentRow & { creator_organization_name?: string | null }>)
    .filter((row) => !existing.has(row.id))
    .map((row) =>
      normalizeIndentRow({
        ...row,
      } as IndentRow & { trips?: IndentTripJoin[] | null }),
    );

  const merged = [...baseIndents];
  for (const row of extras) {
    if (!existing.has(row.id)) {
      existing.set(row.id, row);
      merged.push(row);
    }
  }
  return merged;
}

async function resolveShipperOrganizationName(
  organizationId: string | null | undefined,
): Promise<string | null> {
  const oid = (organizationId ?? "").trim();
  if (!oid) return null;
  const { data, error } = await supabase()
    .from("organizations")
    .select("name")
    .eq("id", oid)
    .maybeSingle();
  if (error) return null;
  return (data?.name ?? null) as string | null;
}

/** Supplier viewers: show shipper org only; never expose shipper's end client on the row. */
function maskIndentRowForSupplierList(
  row: IndentRow,
  viewerOrgId: string,
): IndentRow {
  if (row.organization_id === viewerOrgId) return row;
  return {
    ...row,
    client_name: "",
    client_id: null,
  };
}

async function prepareIndentForSupplierViewer(
  row: IndentRow,
  viewerOrgId: string | null,
): Promise<IndentRow> {
  if (!viewerOrgId || row.organization_id === viewerOrgId) {
    return row;
  }
  let creatorName = (row.creator_organization_name ?? "").trim();
  if (!creatorName) {
    creatorName =
      (await resolveShipperOrganizationName(row.organization_id)) ?? "";
  }
  return maskIndentRowForSupplierList(
    {
      ...row,
      creator_organization_name: creatorName || null,
    },
    viewerOrgId,
  );
}

/** Fetch a single indent by id (for detail screen). */
export async function getIndentById(
  indentId: string,
): Promise<{ error: Error | null; indent: IndentRow | null }> {
  const { data, error } = await supabase()
    .from("indents")
    .select(
      "*, active_trip:trips!trips_indent_id_fkey(trip_operational_code, trip_number, trip_code)",
    )
    .eq("id", indentId)
    .maybeSingle();
  if (error) return { error: new Error(error.message), indent: null };
  const raw = data as (IndentRow & { trips?: IndentTripJoin[] | null }) | null;
  const indent: IndentRow | null = raw ? normalizeIndentRow(raw) : null;
  return { error: null, indent };
}

export type GetVisibleIndentByIdOptions = {
  /** Cached Find Work / Claimed rows — skips `market_indents_for_org` when the indent is present. */
  marketIndentsHint?: IndentRow[];
};

/**
 * Fetch a single indent visible to the current organization.
 * - First tries direct owner read (`indents` table).
 * - Then optional in-memory market cache.
 * - Falls back to market-visible data via RPC for integrated suppliers.
 * Also supports display IDs (e.g. IND007) as input.
 */
export async function getVisibleIndentById(
  orgId: string | null,
  indentIdOrDisplayId: string,
  options?: GetVisibleIndentByIdOptions,
): Promise<{ error: Error | null; indent: IndentRow | null }> {
  const raw = (indentIdOrDisplayId ?? "").trim();
  if (!raw) return { error: null, indent: null };

  const direct = await getIndentById(raw);
  if (direct.error) return direct;
  if (direct.indent) {
    const prepared = await prepareIndentForSupplierViewer(direct.indent, orgId);
    return { error: null, indent: prepared };
  }

  if (!orgId) return { error: null, indent: null };

  const cached = options?.marketIndentsHint
    ? findIndentInMarketList(options.marketIndentsHint, raw)
    : null;
  // Only trust the hint when it carries `weight`. The market RPCs gained that
  // column after release, so a persisted pre-upgrade Find Work list (6h maxAge,
  // no cache buster) yields rows with weight === undefined. Accepting one would
  // skip the RPC and leave the deploy Tons field blank for the whole cache
  // lifetime. Falling through costs one RPC call on a cold-shape cache.
  if (cached && cached.weight != null) {
    return { error: null, indent: cached };
  }

  const { error: marketErr, indents } =
    await getMarketIndentsForOrganization(orgId);
  if (marketErr) return { error: marketErr, indent: null };

  return { error: null, indent: findIndentInMarketList(indents, raw) };
}

/** Display label for an indent (IND001-style when present). */
export function getIndentDisplayNumber(row: IndentRow): string {
  return getIndentOperationalDisplay(row);
}

/**
 * Reference rate for a broadcast-linked indent, visible to any bidding org.
 * Falls back to this when the indent is not in the caller's market list
 * (e.g. broadcast not circulated to the supplier). Returns null on any miss.
 */
export async function getBroadcastIndentTarget(
  indentId: string | null | undefined,
): Promise<{
  supplier_target: number | null;
  supplier_rate_basis: "per_mt" | "per_trip" | null;
  weight: number | null;
} | null> {
  const id = (indentId ?? "").trim();
  if (!id) return null;
  const { data, error } = await supabase().rpc("indent_target_for_broadcast", {
    indent_id: id,
  });
  if (error || !Array.isArray(data) || data.length === 0) return null;
  const row = data[0] as {
    supplier_target: number | null;
    supplier_rate_basis?: "per_mt" | "per_trip" | null;
    weight?: number | null;
  };
  return {
    supplier_target: row.supplier_target ?? null,
    // Older deploys of indent_target_for_broadcast return neither column;
    // null degrades to per_trip, which is the pre-fix behaviour.
    supplier_rate_basis: row.supplier_rate_basis ?? null,
    weight: row.weight ?? null,
  };
}

/** Supplier-facing target rate (not load-giver client sales price). */
import { resolveCommercialPricing } from "@/features/marketplace/domain/commercialPricing";

export function resolveSupplierTargetDisplayRate(
  supplierTarget: number | null | undefined,
  clientPrice?: number | null | undefined,
  fallback?: number | null | undefined,
  options?: {
    saleRateBasis?: "per_mt" | "per_trip" | string | null;
    /** indents.weight, in KG. Required to expand a per-MT target. */
    weightKg?: number | null;
  },
): number | null {
  // Supplier-facing rate only — never client_price (load owner's client sales price).
  void clientPrice;
  return resolveCommercialPricing({
    supplierTarget,
    saleRateBasis: options?.saleRateBasis,
    weightKg: options?.weightKg,
    rateOffer: fallback,
    bidCount: 0,
  }).displayPrice;
}

/**
 * Create a new indent (RLS enforces org membership).
 * Resolves client_name from clients when client_id is set and client_name is empty.
 * indent_number is omitted so DB trigger sets display_indent_id.
 */
export async function createIndent(
  orgId: string,
  data: CreateIndentInput,
  options?: { action?: IndentAction },
): Promise<{ error: Error | null; indent: IndentRow | null }> {
  const action = options?.action ?? "share";
  const shouldValidateShare = action === "share";
  if (shouldValidateShare) {
    const clientNameErr = runValidators((data.client_name ?? "").trim(), [
      required(),
      maxLength(VALIDATION.CLIENT_SUPPLIER_NAME_MAX_LENGTH),
    ]);
    if (clientNameErr)
      return {
        error: new Error(`Client name: ${clientNameErr}`),
        indent: null,
      };
    const pickupErr = runValidators((data.pickup_area ?? "").trim(), [
      required(),
      maxLength(255),
    ]);
    if (pickupErr)
      return { error: new Error(`Pickup area: ${pickupErr}`), indent: null };
    const dropErr = runValidators((data.drop_location ?? "").trim(), [
      required(),
      maxLength(255),
    ]);
    if (dropErr)
      return { error: new Error(`Drop location: ${dropErr}`), indent: null };
    const perMt =
      data.sale_rate_basis === "per_mt" &&
      data.sale_unit_rate != null &&
      data.sale_unit_rate > 0;
    if (!perMt) {
      const priceErr = positiveAmount()(data.client_price);
      if (priceErr)
        return { error: new Error(`Client price: ${priceErr}`), indent: null };
    }
    const targetErr = nonNegativeAmount()(data.supplier_target);
    if (targetErr)
      return {
        error: new Error(`Supplier target: ${targetErr}`),
        indent: null,
      };
    const vehicleErr = runValidators((data.vehicle_type ?? "").trim(), [
      required("Vehicle is required"),
      maxLength(100),
    ]);
    if (vehicleErr)
      return { error: new Error(`Vehicle: ${vehicleErr}`), indent: null };
    const loadTypeErr = runValidators((data.load_type ?? "").trim(), [
      required("Load type is required"),
      maxLength(100),
    ]);
    if (loadTypeErr)
      return { error: new Error(`Load type: ${loadTypeErr}`), indent: null };
    const perMtWeightOptional =
      data.sale_rate_basis === "per_mt" &&
      data.sale_unit_rate != null &&
      data.sale_unit_rate > 0;
    if (
      !perMtWeightOptional &&
      (data.weight == null ||
        typeof data.weight !== "number" ||
        data.weight <= 0 ||
        data.weight > 999999)
    ) {
      return {
        error: new Error(
          "Weight is required and must be between 0.01 and 1,000 tons.",
        ),
        indent: null,
      };
    }
    if (
      perMtWeightOptional &&
      data.weight != null &&
      (typeof data.weight !== "number" || data.weight < 0 || data.weight > 999999)
    ) {
      return {
        error: new Error(
          "Weight must be between 0 and 1,000 tons.",
        ),
        indent: null,
      };
    }
    if (data.pickup_date?.trim()) {
      const dateErr = dateISO()(data.pickup_date);
      if (dateErr)
        return { error: new Error(`Pickup date: ${dateErr}`), indent: null };
    }
  }
  let client_name = (data.client_name ?? "").trim();
  if (data.client_id && !client_name) {
    const { client } = await getClientById(orgId, data.client_id);
    if (client?.name) client_name = client.name;
  }
  if (!client_name) client_name = data.client_name || "";

  const indent_number = null;
  // Insert only columns that exist on indents table. client_id is resolved to client_name above;
  // do not send client_id if the table does not have that column (avoids "could not find client_id column").
  // Omit status on insert so the DB default is used. Works with both schemas: older (default 'open',
  // check open/closed/cancelled) and consolidated (default 'pending', check pending/quoted/awarded/...).
  const payload: Record<string, unknown> = {
    indent_number,
    owner_user_id: data.owner_user_id ?? null,
    created_by_user_id: data.created_by_user_id ?? null,
    pickup_area: data.pickup_area?.trim() ?? "",
    drop_location: data.drop_location?.trim() ?? "",
    client_name: client_name?.trim() ?? "",
    client_id: data.client_id ?? null,
    lane_id: data.lane_id ?? null,
    sale_rate_basis:
      data.sale_rate_basis === "per_mt" || data.sale_rate_basis === "per_trip"
        ? data.sale_rate_basis
        : null,
    supplier_rate_basis:
      data.supplier_rate_basis === "per_mt" ||
      data.supplier_rate_basis === "per_trip"
        ? data.supplier_rate_basis
        : null,
    sale_unit_rate:
      data.sale_unit_rate != null && Number(data.sale_unit_rate) > 0
        ? data.sale_unit_rate
        : null,
    client_price: Number.isFinite(data.client_price) ? data.client_price : 0,
    supplier_target: Number.isFinite(data.supplier_target)
      ? data.supplier_target
      : 0,
    vehicle_type: data.vehicle_type?.trim() ?? "",
    load_type: data.load_type?.trim() ?? "",
    pickup_date: data.pickup_date ?? null,
    circulation_target: data.circulation_target ?? "integrated_supplier",
    weight: Number.isFinite(data.weight) ? data.weight : 0,
    status: action === "draft" ? "draft" : "broadcast",
    shared_at: action === "share" ? new Date().toISOString() : null,
    last_saved_at: action === "draft" ? new Date().toISOString() : null,
  };

  const ownerUserId =
    typeof payload.owner_user_id === "string" ? payload.owner_user_id : null;
  const creatorUserId =
    typeof payload.created_by_user_id === "string"
      ? payload.created_by_user_id
      : null;

  // Sequential indent trigger writes user_counters(user_id),
  // which references public.users(id).
  await Promise.all([
    ensurePublicUserRecord(ownerUserId),
    creatorUserId && creatorUserId !== ownerUserId
      ? ensurePublicUserRecord(creatorUserId)
      : Promise.resolve(),
  ]);

  const { data: row, error } = await supabase()
    .from("indents")
    .insert({ ...payload, organization_id: orgId })
    .select()
    .single();

  if (error) {
    if (isIndentWriteTimeout(error)) {
      const recovered = await recoverCreatedIndentAfterTimeout(orgId, payload);
      if (recovered) {
        const indent = recovered;
        if (action === "share") {
          void ensureIndentStory(orgId, indent).then(({ error: storyErr }) => {
            if (storyErr && __DEV__) {
              console.warn(
                "[indents] createIndent: default 24h story failed:",
                storyErr.message,
              );
            }
          });
        }
        return { error: null, indent };
      }
    }
    const msg =
      [error.message, error.details, error.hint].filter(Boolean).join(" — ") ||
      error.message;
    return { error: new Error(msg), indent: null };
  }
  const indent = row as IndentRow;
  if (action === "share") {
    void ensureIndentStory(orgId, indent).then(({ error: storyErr }) => {
      if (storyErr && __DEV__) {
        console.warn(
          "[indents] createIndent: default 24h story failed:",
          storyErr.message,
        );
      }
    });
  }
  return { error: null, indent };
}

/**
 * Insert indent_stops for an indent (multi pickup/drop). Call after createIndent when route has multiple stops.
 */
export async function insertIndentStops(
  indentId: string,
  stops: IndentStopInput[],
): Promise<{ error: Error | null }> {
  if (stops.length === 0) return { error: null };
  const rows = stops.map((s, i) => ({
    indent_id: indentId,
    stop_index: i,
    type: s.type,
    area: s.area,
    address: s.address ?? "",
    latitude: s.latitude ?? null,
    longitude: s.longitude ?? null,
  }));
  const { error } = await supabase().from("indent_stops").insert(rows);
  if (error) return { error: new Error(error.message) };
  return { error: null };
}

/**
 * Partially update an indent owned by the caller's organization.
 * Use for editing non-terminal loads (e.g. update price, route, vehicle, dates).
 */
export async function updateIndent(
  indentId: string,
  updates: Partial<
    Pick<
      IndentRow,
      | "pickup_area"
      | "drop_location"
      | "client_name"
      | "client_price"
      | "supplier_target"
      | "vehicle_type"
      | "load_type"
      | "pickup_date"
      | "circulation_target"
      | "weight"
      | "status"
      | "supplier_rate_basis"
    >
  >,
): Promise<{ error: Error | null; indent: IndentRow | null }> {
  const payload: Record<string, unknown> = {};
  if (updates.pickup_area !== undefined)
    payload.pickup_area = updates.pickup_area;
  if (updates.drop_location !== undefined)
    payload.drop_location = updates.drop_location;
  if (updates.client_name !== undefined)
    payload.client_name = updates.client_name;
  if (updates.client_price !== undefined)
    payload.client_price = updates.client_price;
  if (updates.supplier_target !== undefined)
    payload.supplier_target = updates.supplier_target;
  if (updates.supplier_rate_basis !== undefined)
    payload.supplier_rate_basis = updates.supplier_rate_basis;
  if (updates.vehicle_type !== undefined)
    payload.vehicle_type = updates.vehicle_type;
  if (updates.load_type !== undefined) payload.load_type = updates.load_type;
  if (updates.pickup_date !== undefined)
    payload.pickup_date = updates.pickup_date;
  if (updates.circulation_target !== undefined)
    payload.circulation_target = updates.circulation_target;
  if (updates.weight !== undefined) payload.weight = updates.weight;
  if (updates.status !== undefined) payload.status = updates.status;

  if (Object.keys(payload).length === 0) {
    return { error: null, indent: null };
  }

  const { data, error } = await supabase()
    .from("indents")
    .update(payload)
    .eq("id", indentId)
    .select()
    .maybeSingle();

  if (error) return { error: new Error(error.message), indent: null };
  // RLS / 0-row updates return no error and null data — treat as failure when
  // the caller asked to change status, otherwise awards look successful while
  // the indent stays broadcast/open.
  if (!data && updates.status !== undefined) {
    return {
      error: new Error(
        "Indent status could not be updated. Please refresh and try again.",
      ),
      indent: null,
    };
  }

  if (
    updates.status !== undefined &&
    isIndentTerminalForStory(updates.status)
  ) {
    const { error: storyErr } = await deactivatePostsForIndent(indentId);
    if (storyErr && __DEV__) {
      console.warn(
        '[indents] updateIndent: deactivate linked stories failed:',
        storyErr.message,
      );
    }
  }

  return { error: null, indent: (data ?? null) as IndentRow | null };
}

type DraftEditableFields = Partial<
  Pick<
    IndentRow,
    | "pickup_area"
    | "drop_location"
    | "client_name"
    | "client_id"
    | "client_price"
    | "lane_id"
    | "sale_rate_basis"
    | "sale_unit_rate"
    | "supplier_target"
    | "supplier_rate_basis"
    | "vehicle_type"
    | "load_type"
    | "pickup_date"
    | "circulation_target"
    | "weight"
    | "owner_user_id"
    | "created_by_user_id"
  >
>;

function toIndentUpdateError(message: string): Error {
  const lower = message.toLowerCase();
  if (lower.includes("cannot be edited"))
    return new Error("This indent has been shared and cannot be edited");
  if (lower.includes("cannot be reverted to draft"))
    return new Error("This indent has been shared and cannot be edited");
  return new Error(message);
}

export async function updateIndentDraft(
  indentId: string,
  updates: DraftEditableFields,
): Promise<{ error: Error | null; indent: IndentRow | null }> {
  const payload: Record<string, unknown> = {};
  if (updates.pickup_area !== undefined)
    payload.pickup_area = updates.pickup_area;
  if (updates.drop_location !== undefined)
    payload.drop_location = updates.drop_location;
  if (updates.client_name !== undefined)
    payload.client_name = updates.client_name;
  if (updates.client_id !== undefined) payload.client_id = updates.client_id;
  if (updates.client_price !== undefined)
    payload.client_price = updates.client_price;
  if (updates.lane_id !== undefined) payload.lane_id = updates.lane_id;
  if (updates.sale_rate_basis !== undefined)
    payload.sale_rate_basis = updates.sale_rate_basis;
  if (updates.sale_unit_rate !== undefined)
    payload.sale_unit_rate = updates.sale_unit_rate;
  if (updates.supplier_target !== undefined)
    payload.supplier_target = updates.supplier_target;
  if (updates.vehicle_type !== undefined)
    payload.vehicle_type = updates.vehicle_type;
  if (updates.load_type !== undefined) payload.load_type = updates.load_type;
  if (updates.pickup_date !== undefined)
    payload.pickup_date = updates.pickup_date;
  if (updates.circulation_target !== undefined)
    payload.circulation_target = updates.circulation_target;
  if (updates.weight !== undefined) payload.weight = updates.weight;
  if (updates.owner_user_id !== undefined)
    payload.owner_user_id = updates.owner_user_id;
  if (updates.created_by_user_id !== undefined)
    payload.created_by_user_id = updates.created_by_user_id;
  payload.last_saved_at = new Date().toISOString();

  const { data, error } = await supabase()
    .from("indents")
    .update(payload)
    .eq("id", indentId)
    .eq("status", "draft")
    .select()
    .maybeSingle();

  if (error) return { error: toIndentUpdateError(error.message), indent: null };
  if (!data)
    return {
      error: new Error("This indent has been shared and cannot be edited"),
      indent: null,
    };
  return { error: null, indent: data as IndentRow };
}

export async function shareDraftIndent(
  indentId: string,
): Promise<{ error: Error | null; indent: IndentRow | null }> {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase()
    .from("indents")
    .update({ status: "broadcast", shared_at: nowIso })
    .eq("id", indentId)
    .eq("status", "draft")
    .select()
    .maybeSingle();

  if (error) {
    if (isIndentWriteTimeout(error)) {
      const { data: existing } = await supabase()
        .from("indents")
        .select("*")
        .eq("id", indentId)
        .maybeSingle();
      if (existing && (existing as IndentRow).status === "broadcast") {
        const indent = existing as IndentRow;
        void ensureIndentStory(indent.organization_id, indent).then(
          ({ error: storyErr }) => {
            if (storyErr && __DEV__) {
              console.warn(
                "[indents] shareDraftIndent: default 24h story failed:",
                storyErr.message,
              );
            }
          },
        );
        return { error: null, indent };
      }
    }
    return { error: toIndentUpdateError(error.message), indent: null };
  }
  if (!data)
    return {
      error: new Error("This indent has already been shared"),
      indent: null,
    };
  const indent = data as IndentRow;
  void ensureIndentStory(indent.organization_id, indent).then(
    ({ error: storyErr }) => {
      if (storyErr && __DEV__) {
        console.warn(
          "[indents] shareDraftIndent: default 24h story failed:",
          storyErr.message,
        );
      }
    },
  );
  return { error: null, indent };
}

/**
 * Soft-cancel an indent by setting status to 'cancelled'.
 * Caller must have permission via RLS (indent owner org).
 */
export async function cancelIndent(
  indentId: string,
): Promise<{ error: Error | null }> {
  const { error } = await supabase()
    .from("indents")
    .update({ status: "cancelled" })
    .eq("id", indentId);

  if (error) return { error: new Error(error.message) };

  const { error: storyErr } = await deactivatePostsForIndent(indentId);
  if (storyErr && __DEV__) {
    console.warn(
      "[indents] cancelIndent: deactivate linked stories failed:",
      storyErr.message,
    );
  }

  return { error: null };
}

/**
 * Share N identical indent rows (one per vehicle). Invalid counts are rejected
 * (not clamped). Partial creates are cancelled so the result is N or 0.
 *
 * Each copy calls `ensureIndentStory` via `createIndent` / `shareDraftIndent`.
 * Stories are one live LOAD reel per indent (`ensureIndentStory` comment:
 * "One live 24h LOAD story per indent"). Bid visibility is indent-status based,
 * but Pulse/reel state is keyed per indent, so each copy keeps its own story.
 */
export async function createSharedIndentCopies(
  orgId: string,
  data: CreateIndentInput,
  count: number,
  options?: { existingDraftId?: string | null },
): Promise<{ error: Error | null; indents: IndentRow[] }> {
  return createSharedIndentCopiesWithOps(
    {
      createIndent,
      updateIndentDraft,
      shareDraftIndent,
      cancelIndent,
    },
    orgId,
    data,
    count,
    options,
  );
}
