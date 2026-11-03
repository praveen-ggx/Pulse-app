/**
 * Batch-load soft-copy (POD) uploader display names for a set of trip IDs.
 * Returns Record<lowercase trip_id, uploader full_name>.
 */
import { supabase } from "@/lib/supabase";

const CHUNK = 80;

export async function loadSoftCopyUploadersByTripId(
  tripIds: string[],
): Promise<Record<string, string>> {
  const ids = [...new Set(tripIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) return {};

  const uploaderByTrip: Record<string, string> = {};
  const userIdSet = new Set<string>();
  const tripToUserId: Record<string, string> = {};

  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const { data, error } = await supabase()
      .from("trip_documents")
      .select("trip_id, uploaded_by")
      .in("trip_id", chunk)
      .in("document_type", ["pod", "soft_pod", "pod_soft"])
      .not("uploaded_by", "is", null)
      .order("uploaded_at", { ascending: false });
    if (error) {
      console.warn("[tripSoftCopyUploader] fetch:", error.message);
      continue;
    }
    for (const row of data ?? []) {
      const key = String(row.trip_id ?? "").trim().toLowerCase();
      if (!key || tripToUserId[key]) continue;
      const uid = String(row.uploaded_by ?? "").trim();
      if (!uid) continue;
      tripToUserId[key] = uid;
      userIdSet.add(uid);
    }
  }

  const userIds = [...userIdSet];
  if (userIds.length === 0) return {};

  const nameById: Record<string, string> = {};
  for (let i = 0; i < userIds.length; i += CHUNK) {
    const chunk = userIds.slice(i, i + CHUNK);
    const { data, error } = await supabase()
      .from("profiles")
      .select("id, full_name")
      .in("id", chunk);
    if (error) {
      console.warn("[tripSoftCopyUploader] profiles fetch:", error.message);
      continue;
    }
    for (const row of data ?? []) {
      const name = (row.full_name ?? "").trim();
      if (name) nameById[row.id] = name;
    }
  }

  for (const [tripKey, userId] of Object.entries(tripToUserId)) {
    const name = nameById[userId];
    if (name) uploaderByTrip[tripKey] = name;
  }

  return uploaderByTrip;
}
