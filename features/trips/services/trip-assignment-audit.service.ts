/**
 * Trip assignment audit — optional. Used for Private Book vs Shared Network.
 * Table trip_assignment_audit lives in pulse-unified-base (consolidated schema); if missing, calls no-op.
 * changed_by references profiles(id); in pulse-unified-base profiles.id = auth.uid().
 */
import { supabase } from '@/lib/supabase';

/** After first confirmed "table missing" (PostgREST PGRST205 / 404), skip further HTTP calls this session. */
let tripAssignmentAuditTableUnavailable = false;

/** PostgREST 404 / PGRST205 when relation missing from API — same as trip_documents edge case. */
function isTripAssignmentAuditTableMissing(
  err: { message?: string; code?: string; status?: number } | null | undefined,
): boolean {
  if (!err) return false;
  const code = String(err.code ?? '').toUpperCase();
  if (code === '42P01' || code === 'PGRST205') return true;
  if (err.status === 404) return true;
  const m = String(err.message ?? '').toLowerCase();
  if (m.includes('schema cache')) return true;
  if (m.includes('could not find the table')) return true;
  if (m.includes('does not exist') && m.includes('trip_assignment_audit')) return true;
  if (m.includes('trip_assignment_audit') && m.includes('not found')) return true;
  return false;
}

/**
 * Errors that mean "this row is already recorded, or this deployment cannot record
 * it yet" — neither is a failure the caller should surface or retry.
 *
 *  - 23505 unique violation: the driver already accepted (double tap / offline replay).
 *  - 23514 check violation / 42501 RLS denial: the DB predates
 *    20270116000000_driver_accepted_assignment_audit, which widens the event_type
 *    CHECK and adds the driver INSERT policy. Native ships without OTA, so an older
 *    app may also hit a newer DB and vice versa; acceptance must degrade quietly
 *    rather than block the driver's trip.
 */
function isBenignAuditWriteError(
  err: { message?: string; code?: string } | null | undefined,
): boolean {
  if (!err) return false;
  const code = String(err.code ?? '');
  if (code === '23505' || code === '23514' || code === '42501') return true;
  const m = String(err.message ?? '').toLowerCase();
  return (
    m.includes('duplicate key value') ||
    m.includes('violates check constraint') ||
    m.includes('violates row-level security')
  );
}

function isLatestAssignmentAuditRpcMissing(
  err: { message?: string; code?: string } | null | undefined,
): boolean {
  if (!err) return false;
  const code = String(err.code ?? '');
  if (code === '42883' || code === 'PGRST202') return true;
  const m = String(err.message ?? '').toLowerCase();
  return (
    m.includes('could not find the function') ||
    (m.includes('function') && m.includes('does not exist'))
  );
}

export type AssignmentEventType =
  | 'assignment'
  | 'reassignment'
  /** Driver acted on the assignment themselves — see 20270116000000_driver_accepted_assignment_audit. */
  | 'driver_accepted'
  | 'completed';

export interface InsertTripAssignmentAuditParams {
  trip_id: string;
  event_type: AssignmentEventType;
  driver_id_prev: string | null;
  driver_id_new: string | null;
  vehicle_id_prev: string | null;
  vehicle_id_new: string | null;
  /** profiles.id (same as auth.uid() in pulse-unified-base) */
  changed_by: string | null;
}

/**
 * Insert one audit row. No-op if table does not exist or RLS denies.
 */
export async function insertTripAssignmentAudit(
  params: InsertTripAssignmentAuditParams
): Promise<{ error: Error | null; row: TripAssignmentAuditRow | null }> {
  if (tripAssignmentAuditTableUnavailable) return { error: null, row: null };

  try {
    const { data, error } = await supabase()
      .from('trip_assignment_audit')
      .insert({
        trip_id: params.trip_id,
        event_type: params.event_type,
        driver_id_prev: params.driver_id_prev ?? null,
        driver_id_new: params.driver_id_new ?? null,
        vehicle_id_prev: params.vehicle_id_prev ?? null,
        vehicle_id_new: params.vehicle_id_new ?? null,
        changed_by: params.changed_by ?? null,
      } as Record<string, unknown>)
      .select(
        "id, trip_id, event_type, driver_id_prev, driver_id_new, vehicle_id_prev, vehicle_id_new, changed_at, changed_by",
      )
      .single();

    if (error) {
      if (isTripAssignmentAuditTableMissing(error)) {
        tripAssignmentAuditTableUnavailable = true;
        return { error: null, row: null };
      }
      // Already recorded, or this DB cannot record it yet — not a caller-visible
      // failure, and deliberately does NOT latch the table-unavailable flag.
      if (isBenignAuditWriteError(error)) return { error: null, row: null };
      return { error: new Error(error.message), row: null };
    }
    return { error: null, row: (data ?? null) as TripAssignmentAuditRow | null };
  } catch (e) {
    return { error: e instanceof Error ? e : new Error(String(e)), row: null };
  }
}

export interface LatestAssignmentByTrip {
  trip_id: string;
  changed_by: string | null;
  changed_at: string;
}

export interface TripAssignmentAuditRow {
  id: string;
  trip_id: string;
  event_type: AssignmentEventType;
  driver_id_prev: string | null;
  driver_id_new: string | null;
  vehicle_id_prev: string | null;
  vehicle_id_new: string | null;
  driver_name_prev?: string | null;
  driver_name_new?: string | null;
  vehicle_number_prev?: string | null;
  vehicle_number_new?: string | null;
  changed_at: string;
  changed_by: string | null;
}

/**
 * Get latest assignment/reassignment event per trip. Returns map trip_id -> { changed_by, changed_at }.
 * If table does not exist, returns empty map (all trips treated as private).
 */
function mapLatestAssignmentAuditRows(
  rows: LatestAssignmentByTrip[],
): Map<string, { changed_by: string | null; changed_at: string }> {
  const byTripId = new Map<string, { changed_by: string | null; changed_at: string }>();
  for (const row of rows) {
    byTripId.set(row.trip_id, {
      changed_by: row.changed_by ?? null,
      changed_at: row.changed_at,
    });
  }
  return byTripId;
}

async function fetchLatestAssignmentAuditByTripIdsLegacy(
  tripIds: string[],
): Promise<{
  error: Error | null;
  byTripId: Map<string, { changed_by: string | null; changed_at: string }>;
}> {
  const byTripId = new Map<string, { changed_by: string | null; changed_at: string }>();
  const { data, error } = await supabase()
    .from('trip_assignment_audit')
    .select('trip_id, changed_by, changed_at')
    .in('trip_id', tripIds)
    .in('event_type', ['assignment', 'reassignment'])
    .order('changed_at', { ascending: false });

  if (error) {
    if (isTripAssignmentAuditTableMissing(error)) {
      tripAssignmentAuditTableUnavailable = true;
      return { error: null, byTripId };
    }
    return { error: new Error(error.message), byTripId };
  }

  const rows = (data ?? []) as LatestAssignmentByTrip[];
  for (const row of rows) {
    if (!byTripId.has(row.trip_id)) {
      byTripId.set(row.trip_id, { changed_by: row.changed_by ?? null, changed_at: row.changed_at });
    }
  }
  return { error: null, byTripId };
}

const ASSIGNMENT_AUDIT_TRIP_ID_CHUNK = 12;

async function fetchLatestAssignmentAuditChunk(
  tripIds: string[],
): Promise<{
  error: Error | null;
  byTripId: Map<string, { changed_by: string | null; changed_at: string }>;
}> {
  const byTripId = new Map<string, { changed_by: string | null; changed_at: string }>();
  try {
    const { data, error } = await supabase().rpc('get_latest_assignment_audit_by_trip_ids', {
      p_trip_ids: tripIds,
    });

    if (error) {
      if (isLatestAssignmentAuditRpcMissing(error)) {
        return fetchLatestAssignmentAuditByTripIdsLegacy(tripIds);
      }
      if (isTripAssignmentAuditTableMissing(error)) {
        tripAssignmentAuditTableUnavailable = true;
        return { error: null, byTripId };
      }
      return { error: new Error(error.message), byTripId };
    }

    return {
      error: null,
      byTripId: mapLatestAssignmentAuditRows((data ?? []) as LatestAssignmentByTrip[]),
    };
  } catch (e) {
    const err = e as { message?: string; code?: string; status?: number };
    if (isTripAssignmentAuditTableMissing(err)) return { error: null, byTripId };
    return { error: e instanceof Error ? e : new Error(String(e)), byTripId };
  }
}

export async function getLatestAssignmentAuditByTripIds(
  tripIds: string[],
): Promise<{
  error: Error | null;
  byTripId: Map<string, { changed_by: string | null; changed_at: string }>;
}> {
  const byTripId = new Map<string, { changed_by: string | null; changed_at: string }>();
  if (tripIds.length === 0) return { error: null, byTripId };
  if (tripAssignmentAuditTableUnavailable) return { error: null, byTripId };

  for (let i = 0; i < tripIds.length; i += ASSIGNMENT_AUDIT_TRIP_ID_CHUNK) {
    const chunk = tripIds.slice(i, i + ASSIGNMENT_AUDIT_TRIP_ID_CHUNK);
    const res = await fetchLatestAssignmentAuditChunk(chunk);
    if (res.error) return res;
    for (const [tripId, value] of res.byTripId) {
      byTripId.set(tripId, value);
    }
  }
  return { error: null, byTripId };
}

/**
 * Get full assignment / reassignment history for a trip (newest first).
 * If table does not exist, returns empty list.
 */
export async function getTripAssignmentAuditHistory(
  tripId: string,
  limit = 20,
): Promise<{ error: Error | null; rows: TripAssignmentAuditRow[] }> {
  if (tripAssignmentAuditTableUnavailable) return { error: null, rows: [] };

  try {
    const { data, error } = await supabase()
      .from("trip_assignment_audit")
      .select(
        "id, trip_id, event_type, driver_id_prev, driver_id_new, vehicle_id_prev, vehicle_id_new, changed_at, changed_by",
      )
      .eq("trip_id", tripId)
      .in("event_type", ["assignment", "reassignment"])
      .order("changed_at", { ascending: false })
      .limit(Math.max(1, Math.min(50, limit)));

    if (error) {
      if (isTripAssignmentAuditTableMissing(error)) {
        tripAssignmentAuditTableUnavailable = true;
        return { error: null, rows: [] };
      }
      return { error: new Error(error.message), rows: [] };
    }
    return { error: null, rows: (data ?? []) as TripAssignmentAuditRow[] };
  } catch {
    return { error: null, rows: [] };
  }
}
