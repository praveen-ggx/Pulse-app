/**
 * First time each trip reached a status, from trip_status_audit.
 * Used by the Trip Ops export (Assigned / Pickup / In-transit / At drop / Delivered).
 */
import { supabase } from "@/lib/supabase";

/** Keep PostgREST IN-lists bounded. */
const TRIP_ID_CHUNK = 80;
/** Stay under the PostgREST max-rows cap so later stages are never cut off. */
const PAGE_SIZE = 1000;

/** tripId (lowercase) → status_to → earliest changed_at (ISO). */
export type TripStatusTimesByTripId = Record<string, Record<string, string>>;

/** One status change for a single trip, oldest first. Used by the activity log. */
export type TripStatusAuditActivityRow = {
  id: string;
  status_from: string | null;
  status_to: string;
  changed_by: string | null;
  changed_at: string;
};

/**
 * Every status change for one trip. Pages until the history is exhausted so a
 * long journey is not cut off at the PostgREST row cap.
 */
export async function listTripStatusAudit(
  tripId: string,
): Promise<TripStatusAuditActivityRow[]> {
  const id = tripId.trim();
  if (!id) return [];
  const rows: TripStatusAuditActivityRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase()
      .from("trip_status_audit")
      .select("id, status_from, status_to, changed_by, changed_at")
      .eq("trip_id", id)
      .order("changed_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      const changedAt = String(row.changed_at ?? "").trim();
      const statusTo = String(row.status_to ?? "").trim();
      if (!changedAt || !statusTo) continue;
      rows.push({
        id: String(row.id),
        status_from: row.status_from ? String(row.status_from) : null,
        status_to: statusTo,
        changed_by: row.changed_by ? String(row.changed_by) : null,
        changed_at: changedAt,
      });
    }
    if ((data ?? []).length < PAGE_SIZE) break;
  }
  return rows;
}

export async function getTripStatusTimes(
  tripIds: string[],
): Promise<{ error: Error | null; times: TripStatusTimesByTripId }> {
  const ids = [...new Set(tripIds.map((id) => id.trim()).filter(Boolean))];
  const times: TripStatusTimesByTripId = {};
  for (let i = 0; i < ids.length; i += TRIP_ID_CHUNK) {
    const chunk = ids.slice(i, i + TRIP_ID_CHUNK);
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await supabase()
        .from("trip_status_audit")
        .select("trip_id, status_to, changed_at")
        .in("trip_id", chunk)
        .order("changed_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, from + PAGE_SIZE - 1);
      if (error) return { error: new Error(error.message), times };
      for (const row of data ?? []) {
        const tripKey = String(row.trip_id ?? "").trim().toLowerCase();
        const status = String(row.status_to ?? "").trim().toLowerCase();
        if (!tripKey || !status || !row.changed_at) continue;
        const byStatus = (times[tripKey] ??= {});
        if (!byStatus[status]) byStatus[status] = row.changed_at;
      }
      if ((data ?? []).length < PAGE_SIZE) break;
    }
  }
  return { error: null, times };
}
