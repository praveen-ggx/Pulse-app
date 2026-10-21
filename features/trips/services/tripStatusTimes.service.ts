/**
 * First time each trip reached a status, from trip_status_audit.
 * Used by the Trip Ops export (Assigned / Pickup / In-transit / At drop / Delivered).
 */
import { supabase } from "@/lib/supabase";

/** Keep PostgREST IN-lists bounded. */
const TRIP_ID_CHUNK = 80;

/** tripId (lowercase) → status_to → earliest changed_at (ISO). */
export type TripStatusTimesByTripId = Record<string, Record<string, string>>;

export async function getTripStatusTimes(
  tripIds: string[],
): Promise<{ error: Error | null; times: TripStatusTimesByTripId }> {
  const ids = [...new Set(tripIds.map((id) => id.trim()).filter(Boolean))];
  const times: TripStatusTimesByTripId = {};
  for (let i = 0; i < ids.length; i += TRIP_ID_CHUNK) {
    const chunk = ids.slice(i, i + TRIP_ID_CHUNK);
    const { data, error } = await supabase()
      .from("trip_status_audit")
      .select("trip_id, status_to, changed_at")
      .in("trip_id", chunk)
      .order("changed_at", { ascending: true });
    if (error) return { error: new Error(error.message), times };
    for (const row of data ?? []) {
      const tripKey = String(row.trip_id ?? "").trim().toLowerCase();
      const status = String(row.status_to ?? "").trim().toLowerCase();
      if (!tripKey || !status || !row.changed_at) continue;
      const byStatus = (times[tripKey] ??= {});
      if (!byStatus[status]) byStatus[status] = row.changed_at;
    }
  }
  return { error: null, times };
}
