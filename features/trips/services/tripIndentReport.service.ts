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

/**
 * Merge the Trip Ops hub catalog with paged owner-org trips/indents so the
 * Excel file is not limited to the current table page or toolbar filter.
 */
export async function loadTripIndentReportCatalog(
  orgId: string,
  seedTrips: readonly TripRow[],
  seedIndents: readonly IndentRow[],
): Promise<{
  error: Error | null;
  trips: TripRow[];
  indents: IndentRow[];
}> {
  const tripById = new Map<string, TripRow>();
  for (const t of seedTrips) tripById.set(t.id, t);
  const indentById = new Map<string, IndentRow>();
  for (const i of seedIndents) indentById.set(i.id, i);

  try {
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const offset = page * PAGE;
      const { error, trips, hasMore } = await getTripsByOrganization(orgId, {
        limit: PAGE,
        offset,
      });
      if (error) return { error, trips: [...tripById.values()], indents: [...indentById.values()] };
      for (const t of trips) {
        if (!tripById.has(t.id)) tripById.set(t.id, t);
      }
      if (!hasMore || trips.length === 0) break;
    }
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const offset = page * PAGE;
      const { error, indents, hasMore } = await getIndentsByOrganization(orgId, {
        limit: PAGE,
        offset,
      });
      if (error) return { error, trips: [...tripById.values()], indents: [...indentById.values()] };
      for (const i of indents) {
        if (!indentById.has(i.id)) indentById.set(i.id, i);
      }
      if (!hasMore || indents.length === 0) break;
    }
    return {
      error: null,
      trips: [...tripById.values()],
      indents: [...indentById.values()],
    };
  } catch (e) {
    return {
      error: e instanceof Error ? e : new Error(String(e)),
      trips: [...tripById.values()],
      indents: [...indentById.values()],
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

async function loadConfirmedAtByIndentId(
  indentIds: string[],
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  if (indentIds.length === 0) return out;
  for (const part of chunkIds(indentIds)) {
    const { data, error } = await supabase()
      .from("market_bids")
      .select("indent_id, accepted_at")
      .in("indent_id", part)
      .eq("status", "accepted")
      .not("accepted_at", "is", null);
    if (error) continue;
    for (const row of data ?? []) {
      const id = String((row as { indent_id?: string }).indent_id ?? "").trim();
      const at = String((row as { accepted_at?: string }).accepted_at ?? "").trim();
      if (!id || !at) continue;
      const prev = out[id];
      if (!prev || at > prev) out[id] = at;
    }
  }
  return out;
}

async function loadVehiclesById(
  vehicleIds: string[],
): Promise<Record<string, { vehicleType: string; capacity: string }>> {
  const out: Record<string, { vehicleType: string; capacity: string }> = {};
  if (vehicleIds.length === 0) return out;
  for (const part of chunkIds(vehicleIds)) {
    const { data, error } = await supabase()
      .from("vehicles")
      .select("id, vehicle_type, capacity")
      .in("id", part);
    if (error) continue;
    for (const row of data ?? []) {
      const id = String((row as { id?: string }).id ?? "").trim();
      if (!id) continue;
      out[id] = {
        vehicleType: String((row as { vehicle_type?: string | null }).vehicle_type ?? "").trim(),
        capacity: String((row as { capacity?: string | null }).capacity ?? "").trim(),
      };
    }
  }
  return out;
}

async function loadCreatorNamesByUserId(
  userIds: string[],
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  if (userIds.length === 0) return out;
  for (const part of chunkIds(userIds)) {
    const { data, error } = await supabase()
      .from("profiles")
      .select("id, full_name")
      .in("id", part);
    if (error) continue;
    for (const row of data ?? []) {
      const id = String((row as { id?: string }).id ?? "").trim();
      const name = String((row as { full_name?: string | null }).full_name ?? "").trim();
      if (id && name) out[id] = name;
    }
  }
  return out;
}

async function loadOrgNamesById(orgIds: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  if (orgIds.length === 0) return out;
  for (const part of chunkIds(orgIds)) {
    const { data, error } = await supabase()
      .from("organizations")
      .select("id, name")
      .in("id", part);
    if (error) continue;
    for (const row of data ?? []) {
      const id = String((row as { id?: string }).id ?? "").trim();
      const name = String((row as { name?: string | null }).name ?? "").trim();
      if (id && name) out[id] = name;
    }
  }
  return out;
}

export type BuildTripIndentReportInput = {
  orgId: string;
  trips: readonly TripRow[];
  indents: readonly IndentRow[];
  partyMetaByTripId?: Map<string, TripIndentReportPartyMeta> | Record<string, TripIndentReportPartyMeta>;
  driverPhoneByTripId?: Record<string, string>;
  stageLabelForTrip?: (trip: TripRow) => string;
};

/** Enrich + build report rows for the Trip Operations Excel download. */
export async function buildTripIndentReport(
  input: BuildTripIndentReportInput,
): Promise<{ error: Error | null; rows: TripIndentReportRow[] }> {
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

    const [confirmedAtByIndentId, vehicleById, creatorNameByUserId, orgNameById] =
      await Promise.all([
        loadConfirmedAtByIndentId(indentIds),
        loadVehiclesById(vehicleIds),
        loadCreatorNamesByUserId(creatorIds),
        loadOrgNamesById(awardedSupplierOrgIds),
      ]);

    const enrichment: TripIndentReportEnrichment = {
      confirmedAtByIndentId,
      vehicleById,
      creatorNameByUserId,
      orgNameById,
      driverPhoneByTripId: input.driverPhoneByTripId,
      partyMetaByTripId: input.partyMetaByTripId,
      indentById,
      stageLabelForTrip: input.stageLabelForTrip,
    };

    const rows = buildTripIndentReportRows(trips, indents, enrichment, orgId);
    return { error: null, rows };
  } catch (e) {
    return {
      error: e instanceof Error ? e : new Error(String(e)),
      rows: [],
    };
  }
}
