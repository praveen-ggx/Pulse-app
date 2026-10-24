import { supabase } from "@/lib/supabase";
import {
  lrNumberFromStoredDocumentNumber,
  normalizeOrgLrNumber,
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
const orgLrIndexInFlight = new Map<string, Promise<OrgLrIndex | null>>();
const tripOrgCache = new Map<string, string>();
/** Bumped on every invalidation so a build that started before an LR write is not cached. */
let orgLrIndexGeneration = 0;

async function buildOrgLrIndex(organizationId: string): Promise<OrgLrIndex | null> {
  const { data: tripRows, error: tripError } = await supabase()
    .from("trips")
    .select("id")
    .eq("organization_id", organizationId)
    .is("deleted_at", null);
  if (tripError) return null;

  const tripIds = (tripRows ?? [])
    .map((row) => String((row as { id?: string }).id ?? "").trim())
    .filter(Boolean);
  const index: OrgLrIndex = new Map();
  if (tripIds.length === 0) return index;

  const rows = await loadLrDocumentRowsByTripIds(tripIds);
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

async function getOrgLrIndex(organizationId: string): Promise<OrgLrIndex | null> {
  const cached = orgLrIndexCache.get(organizationId);
  if (cached && Date.now() - cached.builtAt < ORG_LR_INDEX_TTL_MS) return cached.index;

  const inFlight = orgLrIndexInFlight.get(organizationId);
  if (inFlight) return inFlight;

  const generation = orgLrIndexGeneration;
  const build = buildOrgLrIndex(organizationId)
    .then((index) => {
      if (index && generation === orgLrIndexGeneration) {
        orgLrIndexCache.set(organizationId, { builtAt: Date.now(), index });
      }
      return index;
    })
    .catch(() => null)
    .finally(() => {
      if (orgLrIndexInFlight.get(organizationId) === build) {
        orgLrIndexInFlight.delete(organizationId);
      }
    });
  orgLrIndexInFlight.set(organizationId, build);
  return build;
}

async function organizationIdForTrip(tripId: string): Promise<string | null> {
  const cached = tripOrgCache.get(tripId);
  if (cached) return cached;
  const { data, error } = await supabase()
    .from("trips")
    .select("organization_id")
    .eq("id", tripId)
    .maybeSingle();
  if (error) return null;
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

  const index = await getOrgLrIndex(organizationId);
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

/** Several LR numbers for one trip against a single org index (one sweep at most). */
export async function findOrgDuplicateLrNumbersForTrip(input: {
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
  if (!index) return null;
  for (const lrNumber of wanted) {
    const duplicate = findInIndex(index, lrNumber, tripId);
    if (duplicate) return { ...duplicate, lrNumber };
  }
  return null;
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
