/**
 * Loads enrichment for the Trip & Indent Excel report and builds downloadable rows.
 * Uses existing tables / RPCs — no dummy data.
 */
import {
  getIndentsByOrganization,
  type IndentRow,
} from "@/features/indents/services/indents.service";
import {
  loadHubTripKeysetRange,
  type TripRow,
} from "@/features/trips/services/trips.service";
import { getOrganizationMembers } from "@/features/organization/services/members.service";
import { indentMatchesHubDateFilter } from "@/features/trips/utils/indentHubToolbarFilter";
import {
  salesReportDayBounds,
  salesReportIndentOrFilter,
} from "@/features/trips/utils/salesReportWindow.util";
import { HUB_ALL_TIME_BOUNDS } from "@/features/trips/utils/tripOrgFetch.util";
import {
  buildTripIndentReportRows,
  type TripIndentReportEnrichment,
  type TripIndentReportPartyMeta,
  type TripIndentReportRow,
} from "@/features/trips/utils/tripIndentReport.model";
import {
  tripDayMatchesHubDateFilter,
  type TripHubDateFilter,
} from "@/lib/dateRangePresets";
import { readAllPages } from "@/lib/pagination";
import { supabase } from "@/lib/supabase";

const CHUNK = 200;
const CHUNK_CONCURRENCY = 4;
/** Stay under PostgREST max_rows (1000) so hasMore can see the extra row. */
const INDENT_PAGE = 500;
const MAX_PAGES = 25;

/** Soft cap for paged indent scans (owner org). Trip rows use get_trips_for_org. */
export const TRIP_INDENT_REPORT_MAX_ENTITY_ROWS = INDENT_PAGE * MAX_PAGES;

export type TripIndentReportCatalogOptions = {
  /** Inclusive Asia/Kolkata day bounds — same as Trips hub pills. */
  dateBounds?: { from: string; to: string } | null;
  dateFilter?: TripHubDateFilter;
  customFrom?: string | null;
  customTo?: string | null;
};

export type TripIndentReportCatalogResult = {
  error: Error | null;
  trips: TripRow[];
  indents: IndentRow[];
  /** True when trips or indents hit a known safety cap (more may exist). */
  truncated: boolean;
  /** Human notes for the sheet banner (cap warnings). */
  notes: string[];
};

function tripMatchesReportDate(
  trip: TripRow,
  dateFilter: TripHubDateFilter,
  opts?: { customFrom?: string | null; customTo?: string | null },
): boolean {
  return tripDayMatchesHubDateFilter(
    { pickup_date: trip.pickup_date, created_at: trip.created_at },
    dateFilter,
    opts,
  );
}

/**
 * Full Trip Ops export catalog:
 * - Trips from the hub keyset with the same date bounds as the hub
 *   (All time → HUB_ALL_TIME_BOUNDS), merged with seed rows, deduped by id.
 *   A failed trip page returns no trip rows.
 * - Indents from paged owner-org scan, then the same hub date matcher.
 * Export is not limited to the current table page.
 */
export async function loadTripIndentReportCatalog(
  orgId: string,
  seedTrips: readonly TripRow[],
  seedIndents: readonly IndentRow[],
  options: TripIndentReportCatalogOptions = {},
): Promise<TripIndentReportCatalogResult> {
  const dateFilter: TripHubDateFilter = options.dateFilter ?? "all";
  const dateOpts = {
    customFrom: options.customFrom,
    customTo: options.customTo,
  };
  const bounds = options.dateBounds ?? HUB_ALL_TIME_BOUNDS;
  const notes: string[] = [];
  const tripById = new Map<string, TripRow>();
  const indentById = new Map<string, IndentRow>();
  let indentsTruncated = false;

  const acceptTrip = (t: TripRow) => {
    if (!tripMatchesReportDate(t, dateFilter, dateOpts)) return;
    if (!tripById.has(t.id)) tripById.set(t.id, t);
  };
  const acceptIndent = (i: IndentRow) => {
    if (!indentMatchesHubDateFilter(i, dateFilter, dateOpts)) return;
    if (!indentById.has(i.id)) indentById.set(i.id, i);
  };

  for (const t of seedTrips) acceptTrip(t);
  for (const i of seedIndents) acceptIndent(i);

  try {
    const { error: tripsError, trips: rpcTrips } = await loadHubTripKeysetRange(orgId, {
      from: bounds.from,
      to: bounds.to,
    });
    if (tripsError) {
      return {
        error: tripsError,
        trips: [],
        indents: [...indentById.values()],
        truncated: true,
        notes: [...notes, "Trip export stopped because a page did not finish."],
      };
    }
    for (const t of rpcTrips) acceptTrip(t);

    for (let page = 0; page < MAX_PAGES; page += 1) {
      const offset = page * INDENT_PAGE;
      const { error, indents, hasMore } = await getIndentsByOrganization(orgId, {
        limit: INDENT_PAGE,
        offset,
      });
      if (error) {
        return {
          error,
          trips: [...tripById.values()],
          indents: [...indentById.values()],
          truncated: indentsTruncated,
          notes,
        };
      }
      for (const i of indents) acceptIndent(i);
      if (!hasMore || indents.length === 0) break;
      if (page === MAX_PAGES - 1 && hasMore) {
        indentsTruncated = true;
        notes.push(
          `Indent export capped at ${TRIP_INDENT_REPORT_MAX_ENTITY_ROWS.toLocaleString("en-IN")} rows. Additional indents were not included.`,
        );
      }
    }

    return {
      error: null,
      trips: [...tripById.values()],
      indents: [...indentById.values()],
      truncated: indentsTruncated,
      notes,
    };
  } catch (e) {
    return {
      error: e instanceof Error ? e : new Error(String(e)),
      trips: [...tripById.values()],
      indents: [...indentById.values()],
      truncated: indentsTruncated,
      notes,
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
): Promise<
  LoadMapResult<
    Record<string, { vehicleType: string; capacity: string; vehicleNumber: string }>
  >
> {
  const out: Record<
    string,
    { vehicleType: string; capacity: string; vehicleNumber: string }
  > = {};
  if (vehicleIds.length === 0) return { data: out, failed: false };
  let failed = false;
  await forEachChunk(vehicleIds, async (part) => {
    const { data, error } = await supabase()
      .from("vehicles")
      .select("id, vehicle_type, capacity, vehicle_number")
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
        vehicleNumber: String(
          (row as { vehicle_number?: string | null }).vehicle_number ?? "",
        ).trim(),
      };
    }
  });
  return { data: out, failed };
}

async function loadCreatorNamesByUserId(
  orgId: string,
  userIds: string[],
): Promise<LoadMapResult<Record<string, string>>> {
  const out: Record<string, string> = {};
  if (userIds.length === 0) return { data: out, failed: false };
  let failed = false;
  const wanted = new Set(userIds);
  // profiles SELECT is own-row only, so a teammate's name is blank there.
  // The org roster returns each member's own full_name.
  const trimmedOrgId = orgId.trim();
  if (trimmedOrgId) {
    const { members, error } = await getOrganizationMembers(trimmedOrgId);
    if (error) {
      failed = true;
    } else {
      for (const member of members) {
        const id = String(member.user_id ?? "").trim();
        if (!id || !wanted.has(id)) continue;
        const name = String(member.full_name ?? "").trim();
        if (name) out[id] = name;
      }
    }
  }
  const missing = userIds.filter((id) => !out[id]);
  await forEachChunk(missing, async (part) => {
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

/** Direct-quote awards have no accepted_at. updated_at is set when the quote is accepted. */
async function loadAcceptedQuoteAtByIndentId(
  indentIds: string[],
): Promise<LoadMapResult<Record<string, string>>> {
  const out: Record<string, string> = {};
  if (indentIds.length === 0) return { data: out, failed: false };
  let failed = false;
  await forEachChunk(indentIds, async (part) => {
    const { data, error } = await supabase()
      .from("direct_quotes")
      .select("indent_id, updated_at")
      .in("indent_id", part)
      .eq("status", "accepted")
      .not("updated_at", "is", null);
    if (error) {
      failed = true;
      return;
    }
    for (const row of data ?? []) {
      const id = String((row as { indent_id?: string }).indent_id ?? "").trim();
      const at = String((row as { updated_at?: string }).updated_at ?? "").trim();
      if (!id || !at) continue;
      const prev = out[id];
      if (!prev || at > prev) out[id] = at;
    }
  });
  return { data: out, failed };
}

type TripSheetFact = { laneId: string; cancelReason: string; cancelNote: string };

/** Lane and cancel category. get_trips_for_org does not return either. */
async function loadTripSheetFacts(
  tripIds: string[],
): Promise<LoadMapResult<Record<string, TripSheetFact>>> {
  const out: Record<string, TripSheetFact> = {};
  if (tripIds.length === 0) return { data: out, failed: false };
  let failed = false;
  await forEachChunk(tripIds, async (part) => {
    const { data, error } = await supabase()
      .from("trips")
      .select("id, lane_id, cancel_reason, cancel_reason_note")
      .in("id", part);
    if (error) {
      failed = true;
      return;
    }
    for (const row of data ?? []) {
      const id = String((row as { id?: string }).id ?? "").trim();
      if (!id) continue;
      out[id] = {
        laneId: String((row as { lane_id?: string | null }).lane_id ?? "").trim(),
        cancelReason: String(
          (row as { cancel_reason?: string | null }).cancel_reason ?? "",
        ).trim(),
        cancelNote: String(
          (row as { cancel_reason_note?: string | null }).cancel_reason_note ?? "",
        ).trim(),
      };
    }
  });
  return { data: out, failed };
}

async function loadSupplierNamesById(
  supplierIds: string[],
): Promise<LoadMapResult<Record<string, string>>> {
  const out: Record<string, string> = {};
  if (supplierIds.length === 0) return { data: out, failed: false };
  let failed = false;
  await forEachChunk(supplierIds, async (part) => {
    const { data, error } = await supabase()
      .from("suppliers")
      .select("id, name, company_name, contact_person")
      .in("id", part);
    if (error) {
      failed = true;
      return;
    }
    for (const row of data ?? []) {
      const id = String((row as { id?: string }).id ?? "").trim();
      const name =
        String((row as { name?: string | null }).name ?? "").trim() ||
        String((row as { company_name?: string | null }).company_name ?? "").trim() ||
        String((row as { contact_person?: string | null }).contact_person ?? "").trim();
      if (id && name) out[id] = name;
    }
  });
  return { data: out, failed };
}

async function loadDriverNamesById(
  driverIds: string[],
): Promise<LoadMapResult<Record<string, string>>> {
  const out: Record<string, string> = {};
  if (driverIds.length === 0) return { data: out, failed: false };
  let failed = false;
  await forEachChunk(driverIds, async (part) => {
    const { data, error } = await supabase()
      .from("drivers")
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

/**
 * Indents in the date window whose trip pickup/created day is outside that window
 * still belong in the report. Load the org's trip so the row keeps the Trip ID.
 */
async function loadOrgTripsForIndents(
  orgId: string,
  indentIds: string[],
): Promise<{ trips: TripRow[]; failed: boolean }> {
  const trips: TripRow[] = [];
  const seen = new Set<string>();
  if (indentIds.length === 0) return { trips, failed: false };
  let failed = false;
  const absorb = (rows: TripRow[] | null) => {
    for (const row of rows ?? []) {
      const id = String(row.id ?? "").trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      trips.push(row);
    }
  };
  await forEachChunk(indentIds, async (part) => {
    const byIndent = await supabase()
      .from("trips")
      .select("*")
      .eq("organization_id", orgId)
      .is("deleted_at", null)
      .in("indent_id", part);
    const bySource = await supabase()
      .from("trips")
      .select("*")
      .eq("organization_id", orgId)
      .is("deleted_at", null)
      .in("source_indent_id", part);
    if (byIndent.error || bySource.error) {
      failed = true;
      return;
    }
    absorb((byIndent.data ?? null) as TripRow[] | null);
    absorb((bySource.data ?? null) as TripRow[] | null);
  });
  return { trips, failed };
}

/**
 * Sales report only. Includes an indent when its own created_at day
 * (Asia/Kolkata) is inside the selected range. Award, assignment, pickup,
 * and cancel dates are not used for inclusion. Linked trips are loaded only
 * so the row can show that indent's trip id and assignment facts.
 */
export async function loadSalesReportWindow(
  orgId: string,
  from: string,
  to: string,
): Promise<{
  error: Error | null;
  indents: IndentRow[];
  trips: TripRow[];
  notes: string[];
}> {
  const bounds = salesReportDayBounds(from, to);
  if (!bounds) {
    return {
      error: new Error("Select a valid date range before downloading the report."),
      indents: [],
      trips: [],
      notes: [],
    };
  }
  const notes: string[] = [];
  const indentById = new Map<string, IndentRow>();

  const { data, error } = await readAllPages<IndentRow, { message: string }>((afterId, limit) => {
    let query = supabase()
      .from("indents")
      .select("*")
      .eq("organization_id", orgId)
      .is("deleted_at", null)
      .or(salesReportIndentOrFilter(bounds));
    if (afterId) query = query.gt("id", afterId);
    return query.order("id", { ascending: true }).limit(limit);
  });
  if (error) {
    return {
      error: new Error(error.message || "Could not load indents for the selected date range."),
      indents: [],
      trips: [],
      notes,
    };
  }
  for (const indent of data) {
    if (indent.id) indentById.set(indent.id, indent);
  }

  const linked = await loadOrgTripsForIndents(orgId, [...indentById.keys()]);
  if (linked.failed) {
    notes.push(
      "Some trips linked to indents in this date range could not be loaded. Their Trip ID may be blank.",
    );
  }

  const tripById = new Map<string, TripRow>();
  for (const trip of linked.trips) {
    if (trip.id) tripById.set(trip.id, trip);
  }

  return {
    error: null,
    indents: [...indentById.values()],
    trips: [...tripById.values()],
    notes,
  };
}

async function loadIndentLaneIds(
  ids: string[],
): Promise<LoadMapResult<Record<string, string>>> {
  const out: Record<string, string> = {};
  if (ids.length === 0) return { data: out, failed: false };
  let failed = false;
  await forEachChunk(ids, async (part) => {
    const { data, error } = await supabase()
      .from("indents")
      .select("id, lane_id")
      .in("id", part);
    if (error) {
      failed = true;
      return;
    }
    for (const row of data ?? []) {
      const id = String((row as { id?: string }).id ?? "").trim();
      const laneId = String((row as { lane_id?: string | null }).lane_id ?? "").trim();
      if (id && laneId) out[id] = laneId;
    }
  });
  return { data: out, failed };
}

/** Indent facts the trip RPC does not return, used only to fill trip rows. */
async function loadIndentFacts(
  indentIds: string[],
): Promise<LoadMapResult<Record<string, IndentRow>>> {
  const out: Record<string, IndentRow> = {};
  if (indentIds.length === 0) return { data: out, failed: false };
  let failed = false;
  await forEachChunk(indentIds, async (part) => {
    const { data, error } = await supabase()
      .from("indents")
      .select(
        "id, lane_id, created_at, cancel_reason, status, created_by_user_id, indent_operational_code, indent_code, indent_number, display_indent_id, vehicle_type, weight, client_name, pickup_area, drop_location, client_price, assigned_supplier_rate, assigned_supplier_id, organization_id, supplier_target, circulation_target",
      )
      .in("id", part);
    if (error) {
      failed = true;
      return;
    }
    for (const row of data ?? []) {
      const indent = row as IndentRow;
      const id = String(indent.id ?? "").trim();
      if (id) out[id] = indent;
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
    const tripIds = uniqueIds(trips.map((t) => t.id));
    const vehicleIds = uniqueIds(trips.map((t) => t.vehicle_id));
    const supplierIds = uniqueIds(trips.map((t) => t.supplier_id));
    const driverIds = uniqueIds(trips.map((t) => t.driver_id));
    const creatorIds = uniqueIds(indents.map((i) => i.created_by_user_id));
    const awardedSupplierOrgIds = uniqueIds(indents.map((i) => i.assigned_supplier_id));

    const [
      confirmedAt,
      acceptedQuotes,
      vehicles,
      creators,
      orgs,
      suppliers,
      drivers,
      driverPhoneByTripId,
      tripFacts,
      indentLanes,
      indentFacts,
    ] = await Promise.all([
      loadConfirmedAtByIndentId(indentIds),
      loadAcceptedQuoteAtByIndentId(indentIds),
      loadVehiclesById(vehicleIds),
      loadCreatorNamesByUserId(orgId, creatorIds),
      loadOrgNamesById(awardedSupplierOrgIds),
      loadSupplierNamesById(supplierIds),
      loadDriverNamesById(driverIds),
      Promise.resolve(input.driverPhoneByTripId ?? {}),
      loadTripSheetFacts(tripIds),
      loadIndentLaneIds(indentIds),
      loadIndentFacts(indentIds.filter((id) => !indentById[id])),
    ]);

    for (const [id, indent] of Object.entries(indentFacts.data)) {
      if (!indentById[id]) indentById[id] = indent;
    }
    const extraCreatorIds = uniqueIds(
      Object.values(indentById).map((indent) => indent.created_by_user_id),
    ).filter((id) => !creators.data[id]);
    if (extraCreatorIds.length > 0) {
      const extraCreators = await loadCreatorNamesByUserId(orgId, extraCreatorIds);
      Object.assign(creators.data, extraCreators.data);
      if (extraCreators.failed) creators.failed = true;
    }

    const warnings: string[] = [];
    if (confirmedAt.failed || acceptedQuotes.failed) {
      warnings.push("Some Indent Awarded Date values could not be loaded (award lookup failed).");
    }
    if (vehicles.failed) {
      warnings.push("Some Truck Type / Ton / Truck Number values could not be loaded (vehicle lookup failed).");
    }
    if (creators.failed) {
      warnings.push("Some Created By names could not be loaded (profile lookup failed).");
    }
    if (orgs.failed || suppliers.failed) {
      warnings.push("Some Supplier Name values could not be loaded (supplier lookup failed).");
    }
    if (drivers.failed) {
      warnings.push("Some Driver Name values could not be loaded (driver lookup failed).");
    }
    if (tripFacts.failed || indentLanes.failed || indentFacts.failed) {
      warnings.push("Some Adhoc / Contract values could not be loaded (lane lookup failed).");
    }

    const awardedAt: Record<string, string> = { ...acceptedQuotes.data };
    for (const [id, at] of Object.entries(confirmedAt.data)) awardedAt[id] = at;
    const laneIdByTripId: Record<string, string> = {};
    const tripCancelByTripId: Record<string, { reason: string; note: string }> = {};
    for (const [id, fact] of Object.entries(tripFacts.data)) {
      if (fact.laneId) laneIdByTripId[id] = fact.laneId;
      if (fact.cancelReason || fact.cancelNote) {
        tripCancelByTripId[id] = { reason: fact.cancelReason, note: fact.cancelNote };
      }
    }

    const enrichment: TripIndentReportEnrichment = {
      confirmedAtByIndentId: awardedAt,
      vehicleById: vehicles.data,
      creatorNameByUserId: creators.data,
      orgNameById: orgs.data,
      supplierNameBySupplierId: suppliers.data,
      driverNameByDriverId: drivers.data,
      driverPhoneByTripId,
      tripCancelByTripId,
      partyMetaByTripId: input.partyMetaByTripId,
      indentById,
      laneIdByTripId,
      laneIdByIndentId: indentLanes.data,
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
