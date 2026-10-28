import { readAllPages } from "@/lib/pagination";
import { supabase } from "@/lib/supabase";
import {
  lrNumberFromStoredDocumentNumber,
  normalizeOrgLrNumber,
  ORG_LR_CHECK_UNAVAILABLE_MESSAGE,
} from "@/features/trips/services/orgLrNumber.util";
import { loadLrDocumentRowsByTripIds } from "@/features/trips/services/tripDocumentLrPod.service";

/**
 * One org-wide LR sweep (all org trip ids + their LR rows) is expensive, and the
 * vault flow checks the same number several times in a few seconds (typing,
 * confirm, upload, number write-back). Build the index once per org, share it
 * for a short window, and join concurrent builds.
 */
const ORG_LR_INDEX_TTL_MS = 30_000;

/** Normalized LR number → trip ids that store it. */
type OrgLrIndex = Map<string, Set<string>>;

const orgLrIndexCache = new Map<string, { builtAt: number; index: OrgLrIndex }>();
const orgLrIndexInFlight = new Map<string, Promise<OrgLrIndex>>();
const tripOrgCache = new Map<string, string>();
/** Bumped on every invalidation so a build that started before an LR write is not cached. */
let orgLrIndexGeneration = 0;

/**
 * The org LR index could not be read completely. Write paths must not treat
 * this as "no duplicate" — see `checkOrgDuplicateLrNumbersForTrip`.
 */
export class OrgLrIndexUnavailableError extends Error {
  constructor(cause?: unknown) {
    super(ORG_LR_CHECK_UNAVAILABLE_MESSAGE);
    this.name = "OrgLrIndexUnavailableError";
    if (cause !== undefined) (this as { cause?: unknown }).cause = cause;
  }
}

/** Throws OrgLrIndexUnavailableError when any trip page or LR chunk fails. */
async function buildOrgLrIndex(organizationId: string): Promise<OrgLrIndex> {
  // Paged: an unpaged select stops at PostgREST max_rows (1000) and older trips' LRs were never checked.
  const { data: tripRows, error: tripError } = await readAllPages((afterId, limit) => {
    let q = supabase()
      .from("trips")
      .select("id")
      .eq("organization_id", organizationId)
      .is("deleted_at", null);
    if (afterId) q = q.gt("id", afterId);
    return q.order("id", { ascending: true }).limit(limit);
  });
  if (tripError) throw new OrgLrIndexUnavailableError(tripError);

  const tripIds = (tripRows ?? [])
    .map((row) => String((row as { id?: string }).id ?? "").trim())
    .filter(Boolean);
  const index: OrgLrIndex = new Map();
  if (tripIds.length === 0) return index;

  let rows: Awaited<ReturnType<typeof loadLrDocumentRowsByTripIds>>;
  try {
    rows = await loadLrDocumentRowsByTripIds(tripIds);
  } catch (e) {
    throw new OrgLrIndexUnavailableError(e);
  }
  for (const row of rows) {
    const tripId = String(row.trip_id ?? "").trim();
    const stored = lrNumberFromStoredDocumentNumber(row.document_number);
    if (!tripId || !stored) continue;
    const trips = index.get(stored) ?? new Set<string>();
    trips.add(tripId);
    index.set(stored, trips);
  }
  return index;
}

/** Cached org index. Rejects (OrgLrIndexUnavailableError) when it cannot be built; failures are not cached. */
async function getOrgLrIndex(organizationId: string): Promise<OrgLrIndex> {
  const cached = orgLrIndexCache.get(organizationId);
  if (cached && Date.now() - cached.builtAt < ORG_LR_INDEX_TTL_MS) return cached.index;

  const inFlight = orgLrIndexInFlight.get(organizationId);
  if (inFlight) return inFlight;

  const generation = orgLrIndexGeneration;
  const build = buildOrgLrIndex(organizationId)
    .then((index) => {
      if (generation === orgLrIndexGeneration) {
        orgLrIndexCache.set(organizationId, { builtAt: Date.now(), index });
      }
      return index;
    })
    .finally(() => {
      if (orgLrIndexInFlight.get(organizationId) === build) {
        orgLrIndexInFlight.delete(organizationId);
      }
    });
  orgLrIndexInFlight.set(organizationId, build);
  return build;
}

/** null = trip not visible to this user (no check possible, as before); a read error throws. */
async function organizationIdForTrip(tripId: string): Promise<string | null> {
  const cached = tripOrgCache.get(tripId);
  if (cached) return cached;
  const { data, error } = await supabase()
    .from("trips")
    .select("organization_id")
    .eq("id", tripId)
    .maybeSingle();
  if (error) throw new OrgLrIndexUnavailableError(error);
  const organizationId = String(
    (data as { organization_id?: string | null } | null)?.organization_id ?? "",
  ).trim();
  if (!organizationId) return null;
  tripOrgCache.set(tripId, organizationId);
  return organizationId;
}

function findInIndex(
  index: OrgLrIndex,
  wanted: string,
  excludeTripId: string,
): { tripId: string } | null {
  for (const tripId of index.get(wanted) ?? []) {
    if (tripId !== excludeTripId) return { tripId };
  }
  return null;
}

/**
 * Same LR number on another trip in this organization. Same trip is allowed
 * (replace / extra files). Other organizations may reuse the number.
 */
export async function findOrgDuplicateLrNumber(input: {
  organizationId: string;
  lrNumber: string;
  excludeTripId?: string | null;
}): Promise<{ tripId: string } | null> {
  const organizationId = input.organizationId.trim();
  const wanted = normalizeOrgLrNumber(input.lrNumber);
  const excludeTripId = (input.excludeTripId ?? "").trim();
  if (!organizationId || !wanted) return null;

  // Advisory: a failed index read reports no duplicate. Write paths use the check* variant.
  const index = await getOrgLrIndex(organizationId).catch(() => null);
  if (!index) return null;
  return findInIndex(index, wanted, excludeTripId);
}

export async function findOrgDuplicateLrNumberForTrip(input: {
  tripId: string;
  lrNumber: string;
}): Promise<{ tripId: string } | null> {
  return findOrgDuplicateLrNumbersForTrip({
    tripId: input.tripId,
    lrNumbers: [input.lrNumber],
  });
}

/**
 * Fail-closed: several LR numbers for one trip against a single org index (one
 * sweep at most). Throws OrgLrIndexUnavailableError when the index cannot be
 * read completely, so a save never proceeds on an unchecked LR number.
 */
export async function checkOrgDuplicateLrNumbersForTrip(input: {
  tripId: string;
  lrNumbers: string[];
}): Promise<{ tripId: string; lrNumber: string } | null> {
  const tripId = input.tripId.trim();
  const wanted = Array.from(
    new Set(input.lrNumbers.map((value) => normalizeOrgLrNumber(value)).filter(Boolean)),
  );
  if (!tripId || wanted.length === 0) return null;
  const organizationId = await organizationIdForTrip(tripId);
  if (!organizationId) return null;
  const index = await getOrgLrIndex(organizationId);
  for (const lrNumber of wanted) {
    const duplicate = findInIndex(index, lrNumber, tripId);
    if (duplicate) return { ...duplicate, lrNumber };
  }
  return null;
}

/**
 * Advisory (typing hints, pre-checks before a service save): a failed index
 * read reports no duplicate. The service save re-checks with the fail-closed
 * `checkOrgDuplicateLrNumbersForTrip`.
 */
export async function findOrgDuplicateLrNumbersForTrip(input: {
  tripId: string;
  lrNumbers: string[];
}): Promise<{ tripId: string; lrNumber: string } | null> {
  return checkOrgDuplicateLrNumbersForTrip(input).catch(() => null);
}

/**
 * Call after any LR number write on a trip. The next check rebuilds the org
 * index, so a number saved here is never missed by a later duplicate check.
 */
export function invalidateOrgLrIndexForTrip(tripId: string): void {
  orgLrIndexGeneration += 1;
  const organizationId = tripOrgCache.get(tripId.trim());
  if (organizationId) {
    orgLrIndexCache.delete(organizationId);
    orgLrIndexInFlight.delete(organizationId);
  } else {
    orgLrIndexCache.clear();
    orgLrIndexInFlight.clear();
  }
}

/** @internal — Jest only. */
export function __resetOrgLrDuplicateCacheForTests(): void {
  orgLrIndexCache.clear();
  orgLrIndexInFlight.clear();
  tripOrgCache.clear();
  orgLrIndexGeneration = 0;
}
