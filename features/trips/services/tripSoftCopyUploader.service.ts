/**
 * Batch-load soft-copy (POD) uploader display names for a set of trip IDs.
 * Returns Record<lowercase trip_id, uploader full_name>.
 *
 * Names are resolved via get_org_members_with_profiles (SECURITY DEFINER) so
 * org teammates can see each other's uploader names. Direct `profiles` SELECT
 * is own-row RLS only — that made Asik see only himself and Rithvik only himself.
 */
import { getOrganizationMembers } from "@/features/organization/services/members.service";
import { supabase } from "@/lib/supabase";

const CHUNK = 80;

export async function loadSoftCopyUploadersByTripId(
  tripIds: string[],
  orgId?: string | null,
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

  // Prefer org-member RPC so teammate names are visible under profiles RLS.
  const trimmedOrgId = (orgId ?? "").trim();
  if (trimmedOrgId) {
    const { members, error } = await getOrganizationMembers(trimmedOrgId);
    if (error) {
      console.warn("[tripSoftCopyUploader] org members:", error.message);
    } else {
      for (const member of members) {
        const uid = String(member.user_id ?? "").trim();
        if (!uid || !userIdSet.has(uid)) continue;
        const name = (member.full_name ?? "").trim();
        if (name) nameById[uid] = name;
      }
    }
  }

  // Fill any remaining ids (e.g. missing orgId) — own profile still resolves.
  const missing = userIds.filter((id) => !nameById[id]);
  for (let i = 0; i < missing.length; i += CHUNK) {
    const chunk = missing.slice(i, i + CHUNK);
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
