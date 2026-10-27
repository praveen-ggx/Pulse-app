/**
 * Loads enrichment for the Trip & Indent Excel report and builds downloadable rows.
 * Uses existing tables / RPCs — no dummy data.
 */
import {
  getIndentsByOrganization,
  type IndentRow,
} from "@/features/indents/services/indents.service";
import {
  getTripsByOrganization,
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
const PAGE = 200;
const MAX_PAGES = 25;

/** Soft cap: PAGE * MAX_PAGES per entity (trips and indents each). */
export const TRIP_INDENT_REPORT_MAX_ENTITY_ROWS = PAGE * MAX_PAGES;

export type TripIndentReportCatalogResult = {
  error: Error | null;
  trips: TripRow[];
  indents: IndentRow[];
  /** True when either trips or indents hit the page cap (more may exist). */
  truncated: boolean;
};

/**
 * Merge the Trip Ops hub catalog with paged owner-org trips/indents so the
 * Excel file is not limited to the current table page or toolbar filter.
 */
export async function loadTripIndentReportCatalog(
  orgId: string,
  seedTrips: readonly TripRow[],
  seedIndents: readonly IndentRow[],
): Promise<TripIndentReportCatalogResult> {
  const tripById = new Map<string, TripRow>();
  for (const t of seedTrips) tripById.set(t.id, t);
  const indentById = new Map<string, IndentRow>();
  for (const i of seedIndents) indentById.set(i.id, i);
  let tripsTruncated = false;
  let indentsTruncated = false;

  try {
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const offset = page * PAGE;
      const { error, trips, hasMore } = await getTripsByOrganization(orgId, {
        limit: PAGE,
        offset,
      });
      if (error) {
        return {
          error,
          trips: [...tripById.values()],
          indents: [...indentById.values()],
          truncated: tripsTruncated || indentsTruncated,
        };
      }
      for (const t of trips) {
        if (!tripById.has(t.id)) tripById.set(t.id, t);
      }
      if (!hasMore || trips.length === 0) break;
      if (page === MAX_PAGES - 1 && hasMore) tripsTruncated = true;
    }
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const offset = page * PAGE;
      const { error, indents, hasMore } = await getIndentsByOrganization(orgId, {
        limit: PAGE,
        offset,
      });
      if (error) {
        return {
          error,
          trips: [...tripById.values()],
          indents: [...indentById.values()],
          truncated: tripsTruncated || indentsTruncated,
        };
      }
      for (const i of indents) {
        if (!indentById.has(i.id)) indentById.set(i.id, i);
      }
      if (!hasMore || indents.length === 0) break;
      if (page === MAX_PAGES - 1 && hasMore) indentsTruncated = true;
    }
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
  for (const part of chunkIds(indentIds)) {
    const { data, error } = await supabase()
      .from("market_bids")
      .select("indent_id, accepted_at")
      .in("indent_id", part)
      .eq("status", "accepted")
      .not("accepted_at", "is", null);
    if (error) {
      failed = true;
      continue;
    }
    for (const row of data ?? []) {
      const id = String((row as { indent_id?: string }).indent_id ?? "").trim();
      const at = String((row as { accepted_at?: string }).accepted_at ?? "").trim();
      if (!id || !at) continue;
      const prev = out[id];
      if (!prev || at > prev) out[id] = at;
    }
  }
  return { data: out, failed };
}

async function loadVehiclesById(
  vehicleIds: string[],
): Promise<LoadMapResult<Record<string, { vehicleType: string; capacity: string }>>> {
  const out: Record<string, { vehicleType: string; capacity: string }> = {};
  if (vehicleIds.length === 0) return { data: out, failed: false };
  let failed = false;
  for (const part of chunkIds(vehicleIds)) {
    const { data, error } = await supabase()
      .from("vehicles")
      .select("id, vehicle_type, capacity")
      .in("id", part);
    if (error) {
      failed = true;
      continue;
    }
    for (const row of data ?? []) {
      const id = String((row as { id?: string }).id ?? "").trim();
      if (!id) continue;
      out[id] = {
        vehicleType: String((row as { vehicle_type?: string | null }).vehicle_type ?? "").trim(),
        capacity: String((row as { capacity?: string | null }).capacity ?? "").trim(),
      };
    }
  }
  return { data: out, failed };
}

async function loadCreatorNamesByUserId(
  userIds: string[],
): Promise<LoadMapResult<Record<string, string>>> {
  const out: Record<string, string> = {};
  if (userIds.length === 0) return { data: out, failed: false };
  let failed = false;
  for (const part of chunkIds(userIds)) {
    const { data, error } = await supabase()
      .from("profiles")
      .select("id, full_name")
      .in("id", part);
    if (error) {
      failed = true;
      continue;
    }
    for (const row of data ?? []) {
      const id = String((row as { id?: string }).id ?? "").trim();
      const name = String((row as { full_name?: string | null }).full_name ?? "").trim();
      if (id && name) out[id] = name;
    }
  }
  return { data: out, failed };
}

async function loadOrgNamesById(
  orgIds: string[],
): Promise<LoadMapResult<Record<string, string>>> {
  const out: Record<string, string> = {};
  if (orgIds.length === 0) return { data: out, failed: false };
  let failed = false;
  for (const part of chunkIds(orgIds)) {
    const { data, error } = await supabase()
      .from("organizations")
      .select("id, name")
      .in("id", part);
    if (error) {
      failed = true;
      continue;
    }
    for (const row of data ?? []) {
      const id = String((row as { id?: string }).id ?? "").trim();
      const name = String((row as { name?: string | null }).name ?? "").trim();
      if (id && name) out[id] = name;
    }
  }
  return { data: out, failed };
}

export type BuildTripIndentReportInput = {
  orgId: string;
  trips: readonly TripRow[];
  indents: readonly IndentRow[];
  partyMetaByTripId?: Map<string, TripIndentReportPartyMeta> | Record<string, TripIndentReportPartyMeta>;
  driverPhoneByTripId?: Record<string, string>;
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

    const [confirmedAt, vehicles, creators, orgs] = await Promise.all([
      loadConfirmedAtByIndentId(indentIds),
      loadVehiclesById(vehicleIds),
      loadCreatorNamesByUserId(creatorIds),
      loadOrgNamesById(awardedSupplierOrgIds),
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
      driverPhoneByTripId: input.driverPhoneByTripId,
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
