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
