/**
 * Loads enrichment for the Trip & Indent Excel report and builds downloadable rows.
 * Uses existing tables / RPCs — no dummy data.
 */
import {
  getIndentsByOrganization,
  type IndentRow,
} from "@/features/indents/services/indents.service";
import {
  getAllTripsForOrg,
  type TripRow,
} from "@/features/trips/services/trips.service";
import {
  buildTripIndentReportRows,
  type TripIndentReportEnrichment,
  type TripIndentReportPartyMeta,
  type TripIndentReportRow,
} from "@/features/trips/utils/tripIndentReport.model";
import { supabase } from "@/lib/supabase";

const CHUNK = 200;
const CHUNK_CONCURRENCY = 4;
/** Stay under PostgREST max_rows (1000) so hasMore can see the extra row. */
const INDENT_PAGE = 500;
const MAX_PAGES = 25;

/** Soft cap on indent pages pulled when the hub list is truncated. */
export const TRIP_INDENT_REPORT_MAX_ENTITY_ROWS = INDENT_PAGE * MAX_PAGES;

export type TripIndentReportCatalogResult = {
  error: Error | null;
  trips: TripRow[];
  indents: IndentRow[];
  /** True when either trips or indents hit the page cap (more may exist). */
  truncated: boolean;
};

export type TripIndentReportCatalogOptions = {
  /** Hub all-time list is already the full trip catalog. */
  tripsBootstrapped?: boolean;
  /** Hub indent list is already the full owner set. */
  indentsBootstrapped?: boolean;
};

/**
 * Use the hub catalog when it is already complete. Otherwise load trips
 * through get_trips_for_org (the same bootstrap as the hub) and page only
 * the indents that are not already on screen.
 */
async function loadMissingIndents(
  orgId: string,
  indentById: Map<string, IndentRow>,
): Promise<{ error: Error | null; truncated: boolean }> {
  let truncated = false;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const offset = page * INDENT_PAGE;
    const { error, indents, hasMore } = await getIndentsByOrganization(orgId, {
      limit: INDENT_PAGE,
      offset,
    });
    if (error) return { error, truncated };
    for (const indent of indents) {
      if (!indentById.has(indent.id)) indentById.set(indent.id, indent);
    }
    if (!hasMore || indents.length === 0) return { error: null, truncated };
    if (page === MAX_PAGES - 1 && hasMore) truncated = true;
  }
  return { error: null, truncated };
}

export async function loadTripIndentReportCatalog(
  orgId: string,
  seedTrips: readonly TripRow[],
  seedIndents: readonly IndentRow[],
  options?: TripIndentReportCatalogOptions,
): Promise<TripIndentReportCatalogResult> {
  const tripById = new Map<string, TripRow>();
  for (const t of seedTrips) tripById.set(t.id, t);
  const indentById = new Map<string, IndentRow>();
  for (const i of seedIndents) indentById.set(i.id, i);
  let tripsTruncated = false;
  let indentsTruncated = false;

  try {
    const tripsBootstrapped = options?.tripsBootstrapped === true;
    const indentsBootstrapped = options?.indentsBootstrapped === true;
    const [tripRes, indentRes] = await Promise.all([
      tripsBootstrapped
        ? Promise.resolve(null)
        : getAllTripsForOrg(orgId),
      indentsBootstrapped
        ? Promise.resolve(null)
        : loadMissingIndents(orgId, indentById),
    ]);
    if (tripRes?.error) {
      return {
        error: tripRes.error,
        trips: [...tripById.values()],
        indents: [...indentById.values()],
        truncated: false,
      };
    }
    if (tripRes) {
      for (const trip of tripRes.trips) {
        if (trip.id) tripById.set(trip.id, trip);
      }
    }
    if (indentRes?.error) {
      return {
        error: indentRes.error,
        trips: [...tripById.values()],
        indents: [...indentById.values()],
        truncated: tripsTruncated,
      };
    }
    if (indentRes?.truncated) indentsTruncated = true;
    return {
      error: null,
      trips: [...tripById.values()],
      indents: [...indentById.values()],
      truncated: tripsTruncated || indentsTruncated,
    };
  } catch (e) {
    return {
      error: e instanceof Error ? e : new Error(String(e)),
      trips: [...tripById.values()],
      indents: [...indentById.values()],
      truncated: tripsTruncated || indentsTruncated,
    };
  }
}

function chunkIds(ids: string[]): string[][] {
  const out: string[][] = [];
  for (let i = 0; i < ids.length; i += CHUNK) out.push(ids.slice(i, i + CHUNK));
  return out;
}

/** A few id-chunks at a time so enrichment does not wait on one round trip each. */
async function forEachChunk(
  ids: string[],
  run: (part: string[]) => Promise<void>,
): Promise<void> {
  const parts = chunkIds(ids);
  for (let i = 0; i < parts.length; i += CHUNK_CONCURRENCY) {
    await Promise.all(parts.slice(i, i + CHUNK_CONCURRENCY).map(run));
  }
}

function uniqueIds(values: Array<string | null | undefined>): string[] {
  const set = new Set<string>();
  for (const v of values) {
    const t = (v ?? "").trim();
    if (t) set.add(t);
  }
  return [...set];
}

type LoadMapResult<T> = { data: T; failed: boolean };

async function loadConfirmedAtByIndentId(
  indentIds: string[],
): Promise<LoadMapResult<Record<string, string>>> {
  const out: Record<string, string> = {};
  if (indentIds.length === 0) return { data: out, failed: false };
  let failed = false;
  await forEachChunk(indentIds, async (part) => {
    const { data, error } = await supabase()
      .from("market_bids")
      .select("indent_id, accepted_at")
      .in("indent_id", part)
      .eq("status", "accepted")
      .not("accepted_at", "is", null);
    if (error) {
      failed = true;
      return;
    }
    for (const row of data ?? []) {
      const id = String((row as { indent_id?: string }).indent_id ?? "").trim();
      const at = String((row as { accepted_at?: string }).accepted_at ?? "").trim();
      if (!id || !at) continue;
      const prev = out[id];
      if (!prev || at > prev) out[id] = at;
    }
  });
  return { data: out, failed };
}

async function loadVehiclesById(
  vehicleIds: string[],
): Promise<LoadMapResult<Record<string, { vehicleType: string; capacity: string }>>> {
  const out: Record<string, { vehicleType: string; capacity: string }> = {};
  if (vehicleIds.length === 0) return { data: out, failed: false };
  let failed = false;
  await forEachChunk(vehicleIds, async (part) => {
    const { data, error } = await supabase()
      .from("vehicles")
      .select("id, vehicle_type, capacity")
      .in("id", part);
    if (error) {
      failed = true;
      return;
    }
    for (const row of data ?? []) {
      const id = String((row as { id?: string }).id ?? "").trim();
      if (!id) continue;
      out[id] = {
        vehicleType: String((row as { vehicle_type?: string | null }).vehicle_type ?? "").trim(),
        capacity: String((row as { capacity?: string | null }).capacity ?? "").trim(),
      };
    }
  });
  return { data: out, failed };
}

async function loadCreatorNamesByUserId(
  userIds: string[],
): Promise<LoadMapResult<Record<string, string>>> {
  const out: Record<string, string> = {};
  if (userIds.length === 0) return { data: out, failed: false };
  let failed = false;
  await forEachChunk(userIds, async (part) => {
    const { data, error } = await supabase()
      .from("profiles")
      .select("id, full_name")
      .in("id", part);
    if (error) {
      failed = true;
      return;
    }
    for (const row of data ?? []) {
      const id = String((row as { id?: string }).id ?? "").trim();
      const name = String((row as { full_name?: string | null }).full_name ?? "").trim();
      if (id && name) out[id] = name;
    }
  });
  return { data: out, failed };
}

async function loadOrgNamesById(
  orgIds: string[],
): Promise<LoadMapResult<Record<string, string>>> {
  const out: Record<string, string> = {};
  if (orgIds.length === 0) return { data: out, failed: false };
  let failed = false;
  await forEachChunk(orgIds, async (part) => {
    const { data, error } = await supabase()
      .from("organizations")
      .select("id, name")
      .in("id", part);
    if (error) {
      failed = true;
      return;
    }
    for (const row of data ?? []) {
      const id = String((row as { id?: string }).id ?? "").trim();
      const name = String((row as { name?: string | null }).name ?? "").trim();
      if (id && name) out[id] = name;
    }
  });
  return { data: out, failed };
}

export type BuildTripIndentReportInput = {
  orgId: string;
  trips: readonly TripRow[];
  indents: readonly IndentRow[];
  partyMetaByTripId?: Map<string, TripIndentReportPartyMeta> | Record<string, TripIndentReportPartyMeta>;
  driverPhoneByTripId?:
    | Record<string, string>
    | Promise<Record<string, string>>;
  stageLabelForTrip?: (trip: TripRow) => string;
};

export type TripIndentReportBuildResult = {
  error: Error | null;
  rows: TripIndentReportRow[];
  /** Human-readable warnings (enrichment gaps, etc.). */
  warnings: string[];
};

/** Enrich + build report rows for the Trip Operations Excel download. */
export async function buildTripIndentReport(
  input: BuildTripIndentReportInput,
): Promise<TripIndentReportBuildResult> {
  try {
    const { orgId, trips, indents } = input;
    const indentById: Record<string, IndentRow> = {};
    for (const indent of indents) {
      if (indent.id) indentById[indent.id] = indent;
    }

    const indentIds = uniqueIds([
      ...trips.map((t) => t.indent_id),
      ...trips.map((t) => t.source_indent_id),
      ...indents.map((i) => i.id),
    ]);
    const vehicleIds = uniqueIds(trips.map((t) => t.vehicle_id));
    const creatorIds = uniqueIds([
      ...trips.map((t) => t.created_by_user_id ?? t.created_by),
      ...indents.map((i) => i.created_by_user_id),
    ]);
    const awardedSupplierOrgIds = uniqueIds(indents.map((i) => i.assigned_supplier_id));

    const [confirmedAt, vehicles, creators, orgs, driverPhoneByTripId] =
      await Promise.all([
        loadConfirmedAtByIndentId(indentIds),
        loadVehiclesById(vehicleIds),
        loadCreatorNamesByUserId(creatorIds),
        loadOrgNamesById(awardedSupplierOrgIds),
        Promise.resolve(input.driverPhoneByTripId ?? {}),
      ]);

    const warnings: string[] = [];
    if (confirmedAt.failed) {
      warnings.push("Some Confirmed Date values could not be loaded (accepted-bid lookup failed).");
    }
    if (vehicles.failed) {
      warnings.push("Some Truck Type / Tonnage values could not be loaded (vehicle lookup failed).");
    }
    if (creators.failed) {
      warnings.push("Some Created By names could not be loaded (profile lookup failed).");
    }
    if (orgs.failed) {
      warnings.push("Some Supplier Name values could not be loaded (organization lookup failed).");
    }

    const enrichment: TripIndentReportEnrichment = {
      confirmedAtByIndentId: confirmedAt.data,
      vehicleById: vehicles.data,
      creatorNameByUserId: creators.data,
      orgNameById: orgs.data,
      driverPhoneByTripId,
      partyMetaByTripId: input.partyMetaByTripId,
      indentById,
      stageLabelForTrip: input.stageLabelForTrip,
    };

    const rows = buildTripIndentReportRows(trips, indents, enrichment, orgId);
    return { error: null, rows, warnings };
  } catch (e) {
    return {
      error: e instanceof Error ? e : new Error(String(e)),
      rows: [],
      warnings: [],
    };
  }
}
