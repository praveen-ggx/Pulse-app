/**
 * Ratings service — Client→Supplier, Supplier→Driver.
 * Uses public.ratings table (create via docs/RATINGS_MIGRATION.sql in pulse-unified-base).
 */
import { getClientsByOrganization } from '@/features/clients/services/clients.service';
import { mapWithConcurrency } from '@/lib/pagination';
import { supabase } from '@/lib/supabase';
import type { CreateRatingData, RatingRow } from '../types';
export type { RatingRow };

/** Minimal trip fields for resolving CRM client id when only `client_name` is set on trip. */
export type TripLikeForClientResolution = {
  client_id?: string | null;
  client_name?: string | null;
};

export async function createRating(
  organizationId: string,
  data: CreateRatingData & { existingRatingId?: string | null },
): Promise<{ error: Error | null; rating: RatingRow | null }> {
  try {
  const score = Math.min(5, Math.max(1, data.score));
  const comment = data.comment ?? null;
  const updatedAt = new Date().toISOString();
  const tripId = data.trip_id?.trim() ?? "";
  const raterId = data.rater_id?.trim() ?? "";
  const ratedId = data.rated_id?.trim() ?? "";
  if (!tripId || !raterId || !ratedId) {
    return {
      error: new Error("Missing trip or party for this rating. Refresh and try again."),
      rating: null,
    };
  }

  const updateById = async (id: string) => {
    const { data: row, error } = await supabase()
      .from("ratings")
      .update({
        score,
        comment,
        updated_at: updatedAt,
      })
      .eq("id", id)
      .select()
      .maybeSingle();

    if (error) return { error: new Error(error.message), rating: null as RatingRow | null };
    if (!row) {
      return {
        error: null,
        rating: {
          id,
          organization_id: organizationId,
          trip_id: tripId,
          rater_type: data.rater_type,
          rater_id: raterId,
          rated_type: data.rated_type,
          rated_id: ratedId,
          score,
          comment,
          created_at: updatedAt,
          updated_at: updatedAt,
        } as RatingRow,
      };
    }
    return { error: null, rating: row as RatingRow };
  };

  // Explicit edit path: update the row the UI already loaded (avoids rater-key drift).
  if (data.existingRatingId?.trim()) {
    return updateById(data.existingRatingId.trim());
  }

  // Prefer update-by-id when a row already exists for this trip+rater+rated key.
  // Blind upsert was rewriting organization_id and then failing RLS/.single() on edit.
  const { data: existingRows, error: lookupError } = await supabase()
    .from("ratings")
    .select("id, organization_id")
    .eq("trip_id", tripId)
    .eq("rater_type", data.rater_type)
    .eq("rater_id", raterId)
    .eq("rated_type", data.rated_type)
    .eq("rated_id", ratedId)
    .limit(1);

  if (lookupError) {
    return { error: new Error(lookupError.message), rating: null };
  }

  const existing = existingRows?.[0];
  if (existing?.id) {
    return updateById(existing.id);
  }

  const { data: row, error } = await supabase()
    .from("ratings")
    .insert({
      organization_id: organizationId,
      trip_id: tripId,
      rater_type: data.rater_type,
      rater_id: raterId,
      rated_type: data.rated_type,
      rated_id: ratedId,
      score,
      comment,
      updated_at: updatedAt,
    })
    .select()
    .maybeSingle();

  if (error) {
    // Race: another client inserted first — retry as update.
    const isConflict =
      error.code === "23505" ||
      error.message.toLowerCase().includes("duplicate") ||
      error.message.toLowerCase().includes("unique");
    if (isConflict) {
      const { data: raced, error: racedLookupError } = await supabase()
        .from("ratings")
        .select("id")
        .eq("trip_id", tripId)
        .eq("rater_type", data.rater_type)
        .eq("rater_id", raterId)
        .eq("rated_type", data.rated_type)
        .eq("rated_id", ratedId)
        .limit(1);
      if (!racedLookupError && raced?.[0]?.id) {
        return updateById(raced[0].id);
      }
    }
    return { error: new Error(error.message), rating: null };
  }

  if (!row) {
    return {
      error: null,
      rating: {
        id: "",
        organization_id: organizationId,
        trip_id: tripId,
        rater_type: data.rater_type,
        rater_id: raterId,
        rated_type: data.rated_type,
        rated_id: ratedId,
        score,
        comment,
        created_at: updatedAt,
        updated_at: updatedAt,
      } as RatingRow,
    };
  }
  return { error: null, rating: row as RatingRow };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not save this rating.";
    return { error: new Error(message), rating: null };
  }
}

/**
 * Assigned driver rates the shipper they operated for (client, else supplier).
 */
export async function submitDriverShipperFeedback(input: {
  tripId: string;
  messageId?: string | null;
  score: number;
  comment?: string | null;
}): Promise<{ error: Error | null; submittedAt: string | null; score: number | null }> {
  const messageId = (input.messageId ?? "").trim() || null;
  const { data, error } = await supabase().rpc("submit_driver_shipper_feedback", {
    p_trip_id: input.tripId,
    p_message_id: messageId,
    p_score: input.score,
    p_comment: (input.comment ?? "").trim() || null,
  });
  if (error) {
    const msg = error.message || "";
    if (/does not exist|could not find the function|42883/i.test(msg)) {
      return {
        error: new Error("Rating isn’t available on this environment yet."),
        submittedAt: null,
        score: null,
      };
    }
    return { error: new Error(msg), submittedAt: null, score: null };
  }
  const row = (data ?? {}) as {
    error?: string;
    ok?: boolean;
    submitted_at?: string;
    submitted_score?: number;
  };
  if (row.error) {
    const code = String(row.error);
    if (code === "already_submitted") {
      return {
        error: null,
        submittedAt: row.submitted_at ?? new Date().toISOString(),
        score: row.submitted_score ?? input.score,
      };
    }
    if (code === "shipper_not_linked") {
      return {
        error: new Error("This trip has no shipper linked yet, so it can't be rated."),
        submittedAt: null,
        score: null,
      };
    }
    if (code === "forbidden") {
      return {
        error: new Error("Only the driver who ran this trip can submit this rating."),
        submittedAt: null,
        score: null,
      };
    }
    return { error: new Error("Could not save your rating. Try again."), submittedAt: null, score: null };
  }
  return {
    error: null,
    submittedAt: row.submitted_at ?? new Date().toISOString(),
    score: row.submitted_score ?? input.score,
  };
}

export async function getRatingsForTrip(tripId: string): Promise<{
  error: Error | null;
  ratings: RatingRow[];
}> {
  const { data, error } = await supabase()
    .from('ratings')
    .select('*')
    .eq('trip_id', tripId)
    .order('created_at', { ascending: false });

  if (error) return { error: new Error(error.message), ratings: [] };
  return { error: null, ratings: (data ?? []) as RatingRow[] };
}

export async function getRatingsForSupplier(supplierId: string): Promise<{
  error: Error | null;
  ratings: RatingRow[];
}> {
  const { data, error } = await supabase()
    .from('ratings')
    .select('*')
    .eq('rated_type', 'supplier')
    .eq('rated_id', supplierId)
    .order('created_at', { ascending: false });

  if (error) return { error: new Error(error.message), ratings: [] };
  return { error: null, ratings: (data ?? []) as RatingRow[] };
}

export async function getRatingsForClient(clientId: string): Promise<{
  error: Error | null;
  ratings: RatingRow[];
}> {
  const { data, error } = await supabase()
    .from('ratings')
    .select('*')
    .eq('rated_type', 'client')
    .eq('rated_id', clientId)
    .order('created_at', { ascending: false });

  if (error) return { error: new Error(error.message), ratings: [] };
  return { error: null, ratings: (data ?? []) as RatingRow[] };
}

/** Keep PostgREST `IN` lists off the statement-timeout cliff (525 on /ratings). */
const RATINGS_IN_CHUNK = 40;
const RATINGS_IN_CONCURRENCY = 4;

async function fetchRatingsByRatedIds(
  ratedType: RatingRow['rated_type'],
  ratedIds: string[],
): Promise<{ error: Error | null; rows: RatingRow[] }> {
  const unique = [...new Set(ratedIds.filter(Boolean))];
  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += RATINGS_IN_CHUNK) {
    chunks.push(unique.slice(i, i + RATINGS_IN_CHUNK));
  }
  // Chunks in parallel (bounded); any failed chunk still fails the whole read.
  let firstError: Error | null = null;
  const pages = await mapWithConcurrency(chunks, RATINGS_IN_CONCURRENCY, async (chunk) => {
    if (firstError) return [];
    const { data, error } = await supabase()
      .from('ratings')
      // Bulk callers only use id (dedupe), rated_id (group), and score (avg/count).
      .select('id, rated_id, score')
      .eq('rated_type', ratedType)
      .in('rated_id', chunk)
      .order('created_at', { ascending: false });
    if (error) {
      firstError = firstError ?? new Error(error.message);
      return [];
    }
    return (data ?? []) as RatingRow[];
  });
  if (firstError) return { error: firstError, rows: [] };
  return { error: null, rows: pages.flat() };
}

/** Bulk fetch client ratings for many clients (chunked queries). */
export async function getRatingsForClients(clientIds: string[]): Promise<{
  error: Error | null;
  byClientId: Record<string, RatingRow[]>;
}> {
  if (clientIds.length === 0) {
    return { error: null, byClientId: {} };
  }
  const { error, rows } = await fetchRatingsByRatedIds('client', clientIds);
  if (error) return { error, byClientId: {} };
  const byClientId: Record<string, RatingRow[]> = {};
  for (const id of clientIds) {
    byClientId[id] = [];
  }
  for (const r of rows) {
    if (!byClientId[r.rated_id]) byClientId[r.rated_id] = [];
    byClientId[r.rated_id].push(r);
  }
  return { error: null, byClientId };
}

/** Bulk fetch supplier ratings for many suppliers (chunked queries). */
export async function getRatingsForSuppliers(supplierIds: string[]): Promise<{
  error: Error | null;
  bySupplierId: Record<string, RatingRow[]>;
}> {
  if (supplierIds.length === 0) {
    return { error: null, bySupplierId: {} };
  }
  const { error, rows } = await fetchRatingsByRatedIds('supplier', supplierIds);
  if (error) return { error, bySupplierId: {} };
  const bySupplierId: Record<string, RatingRow[]> = {};
  for (const id of supplierIds) {
    bySupplierId[id] = [];
  }
  for (const r of rows) {
    if (!bySupplierId[r.rated_id]) bySupplierId[r.rated_id] = [];
    bySupplierId[r.rated_id].push(r);
  }
  return { error: null, bySupplierId };
}

export async function getRatingsForDriver(
  driverId: string,
  signal?: AbortSignal,
): Promise<{
  error: Error | null;
  ratings: RatingRow[];
}> {
  const query = supabase()
    .from('ratings')
    .select('*')
    .eq('rated_type', 'driver')
    .eq('rated_id', driverId)
    .order('created_at', { ascending: false });
  const { data, error } = await (signal ? query.abortSignal(signal) : query);

  if (error) return { error: new Error(error.message), ratings: [] };
  return { error: null, ratings: (data ?? []) as RatingRow[] };
}

/** Bulk fetch driver ratings for many drivers (chunked). Used by Drivers tab so ratings show in the table. */
export async function getRatingsForDrivers(driverIds: string[]): Promise<{
  error: Error | null;
  byDriverId: Record<string, RatingRow[]>;
}> {
  if (driverIds.length === 0) {
    return { error: null, byDriverId: {} };
  }
  const { error, rows } = await fetchRatingsByRatedIds('driver', driverIds);
  if (error) return { error, byDriverId: {} };
  const byDriverId: Record<string, RatingRow[]> = {};
  for (const id of driverIds) {
    byDriverId[id] = [];
  }
  for (const r of rows) {
    if (!byDriverId[r.rated_id]) byDriverId[r.rated_id] = [];
    byDriverId[r.rated_id].push(r);
  }
  return { error: null, byDriverId };
}

export function averageScore(ratings: readonly { score: number }[]): number | null {
  if (ratings.length === 0) return null;
  const sum = ratings.reduce((s, r) => s + r.score, 0);
  return Math.round((sum / ratings.length) * 100) / 100;
}

function dedupeRatingRowsById(rows: RatingRow[]): RatingRow[] {
  const seen = new Set<string>();
  const out: RatingRow[] = [];
  for (const r of rows) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    out.push(r);
  }
  return out;
}

/**
 * Average rating for a party whose rows may be stored under either the finance row id
 * (e.g. clients.id / suppliers.id) or the linked platform organization id.
 */
export function averageRatingForRatedParty(
  byRatedId: Record<string, RatingRow[]>,
  primaryId: string,
  alternateId?: string | null,
): number | null {
  const fromPrimary = byRatedId[primaryId] ?? [];
  const fromAlt = alternateId ? (byRatedId[alternateId] ?? []) : [];
  return averageScore(dedupeRatingRowsById([...fromPrimary, ...fromAlt]));
}

/** Dedupe then average — use when merging buckets that may contain the same row twice. */
export function averageScoreDeduped(rows: RatingRow[]): number | null {
  return averageScore(dedupeRatingRowsById(rows));
}

/** First finite party score. Never invent a default (especially not 5.0). */
export function firstFiniteRating(
  ...values: Array<number | null | undefined>
): number | null {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return null;
}

/**
 * Resolve `clients.id` for storing rated_type=client. Trips often have display name only;
 * without this, UI allows submit but DB insert is skipped.
 */
export async function resolveRatedClientIdForTrip(
  trip: TripLikeForClientResolution,
  tripOwnerOrganizationId: string,
): Promise<string | null> {
  const direct = trip.client_id?.trim();
  if (direct) return direct;

  const rawName = trip.client_name?.trim();
  if (!rawName) return null;

  const { error, clients } = await getClientsByOrganization(tripOwnerOrganizationId);
  if (error || clients.length === 0) return null;

  const needle = rawName.toLowerCase();

  const byExactName = clients.find((c) => (c.name ?? '').trim().toLowerCase() === needle);
  if (byExactName) return byExactName.id;

  const byContact = clients.find(
    (c) => (c.contact_person ?? '').trim().toLowerCase() === needle,
  );
  if (byContact) return byContact.id;

  const byLoose = clients.find((c) => {
    const n = (c.name ?? '').trim().toLowerCase();
    const cp = (c.contact_person ?? '').trim().toLowerCase();
    if (n && (needle.includes(n) || n.includes(needle))) return true;
    if (cp && (needle.includes(cp) || cp.includes(needle))) return true;
    return false;
  });
  return byLoose?.id ?? null;
}

/**
 * Ratings where partner orgs scored a CRM client row linked to the viewer's organization.
 * Depends on RLS (see supabase migration ratings_select_linked_rated_client).
 */
export async function getRatingsReceivedAsLinkedOrganization(
  viewerOrganizationId: string,
): Promise<{ error: Error | null; ratings: RatingRow[] }> {
  const { data: linkedRows, error: e1 } = await supabase()
    .from('clients')
    .select('id')
    .eq('linked_organization_id', viewerOrganizationId);

  if (e1) return { error: new Error(e1.message), ratings: [] };
  const ids = (linkedRows ?? []).map((r: { id: string }) => r.id).filter(Boolean);
  if (ids.length === 0) return { error: null, ratings: [] };

  const { data, error } = await supabase()
    .from('ratings')
    .select('*')
    .eq('rated_type', 'client')
    .in('rated_id', ids)
    .order('created_at', { ascending: false });

  if (error) return { error: new Error(error.message), ratings: [] };
  return { error: null, ratings: (data ?? []) as RatingRow[] };
}
