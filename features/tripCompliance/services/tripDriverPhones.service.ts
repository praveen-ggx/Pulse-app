/**
 * Driver mobile per trip, in one call. Vendor drivers are hidden by drivers
 * RLS, so this goes through get_trip_driver_phones (only trips the caller can
 * already see). Falls back to the RLS-scoped drivers read until that function
 * is deployed.
 */
import { getDriverPhonesByIds } from "@/features/drivers/services/drivers.service";
import { supabase } from "@/lib/supabase";

export async function getTripDriverPhones(
  trips: { id: string; driver_id: string | null }[],
): Promise<Map<string, string>> {
  const byTrip = new Map<string, string>();
  if (trips.length === 0) return byTrip;

  const { data, error } = await supabase().rpc("get_trip_driver_phones", {
    p_trip_ids: trips.map((t) => t.id),
  });
  if (!error) {
    for (const row of (data ?? []) as { trip_id: string; phone: string | null }[]) {
      if (row.phone) byTrip.set(row.trip_id, row.phone);
    }
    return byTrip;
  }

  const driverIds = Array.from(new Set(trips.map((t) => t.driver_id).filter((id): id is string => !!id)));
  const { phoneByDriverId } = await getDriverPhonesByIds(driverIds);
  for (const t of trips) {
    const phone = t.driver_id ? phoneByDriverId.get(t.driver_id) : undefined;
    if (phone) byTrip.set(t.id, phone);
  }
  return byTrip;
}
