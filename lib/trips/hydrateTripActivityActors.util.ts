import type { LedgerRow } from "@/features/finance/services/finance.service";
import type { TripAuditMilestone, TripActivityUserProfile } from "@/lib/trips/buildTripAuditLog.util";
import { supabase } from "@/lib/supabase";

export type TripActivityDocumentActor = {
  uploadedBy?: string | null;
  verifiedBy?: string | null;
};

export type TripActivityActorHydration = {
  createdByByTxId: Record<string, string>;
  uploadedByByDocId: Record<string, string>;
  verifiedByByDocId: Record<string, string>;
  profiles: Record<string, TripActivityUserProfile>;
};

function trimId(value: string | null | undefined): string {
  return String(value ?? "").trim();
}

export function mergeLedgerCreatedBy(
  rows: LedgerRow[],
  createdByByTxId: Record<string, string>,
): LedgerRow[] {
  return rows.map((row) => ({
    ...row,
    created_by: trimId(row.created_by) || createdByByTxId[row.id] || null,
  }));
}

export function applyDocumentActorsToMilestones(
  miles: TripAuditMilestone[],
  uploadedByByDocId: Record<string, string>,
  verifiedByByDocId: Record<string, string>,
): TripAuditMilestone[] {
  return miles.map((mile) => {
    if (trimId(mile.actorUserId)) return mile;
    const id = mile.id;
    const uploadMatch = id.match(/^(?:vault|doc|entity)-upload-(.+)$/);
    if (uploadMatch) {
      const userId = uploadedByByDocId[uploadMatch[1]];
      return userId ? { ...mile, actorUserId: userId } : mile;
    }
    const verifyMatch = id.match(/^(?:vault|doc|entity)-(?:verified|rejected)-(.+)$/);
    if (verifyMatch) {
      const userId = verifiedByByDocId[verifyMatch[1]];
      return userId ? { ...mile, actorUserId: userId } : mile;
    }
    return mile;
  });
}

export function collectHydrationUserIds(
  hydration: TripActivityActorHydration,
  extraIds: Array<string | null | undefined> = [],
): string[] {
  const ids = new Set<string>();
  const add = (id: string | null | undefined) => {
    const value = trimId(id);
    if (value) ids.add(value);
  };
  for (const id of extraIds) add(id);
  for (const id of Object.values(hydration.createdByByTxId)) add(id);
  for (const id of Object.values(hydration.uploadedByByDocId)) add(id);
  for (const id of Object.values(hydration.verifiedByByDocId)) add(id);
  return Array.from(ids);
}

function rememberProfile(
  into: Record<string, TripActivityUserProfile>,
  userId: string,
  profile: TripActivityUserProfile,
) {
  const prev = into[userId];
  into[userId] = {
    full_name: profile.full_name?.trim() || prev?.full_name || null,
    email: profile.email?.trim() || prev?.email || null,
    phone: profile.phone?.trim() || prev?.phone || null,
    avatar_url: profile.avatar_url?.trim() || prev?.avatar_url || null,
    avatar_seed: profile.avatar_seed?.trim() || prev?.avatar_seed || null,
  };
}

function profileHasDisplayName(profile?: TripActivityUserProfile | null): boolean {
  if (!profile) return false;
  return Boolean(
    profile.full_name?.trim() ||
      profile.phone?.trim() ||
      profile.email?.trim(),
  );
}

export async function fetchActivityUserProfiles(
  userIds: string[],
): Promise<Record<string, TripActivityUserProfile>> {
  const unique = [...new Set(userIds.map(trimId).filter(Boolean))];
  if (unique.length === 0) return {};
  const profiles: Record<string, TripActivityUserProfile> = {};
  const { data, error } = await supabase()
    .from("profiles")
    .select("id, full_name, phone, email, avatar_url, avatar_seed")
    .in("id", unique);
  if (error || !data) return profiles;
  for (const row of data) {
    const id = trimId(row.id);
    if (!id) continue;
    rememberProfile(profiles, id, {
      full_name: row.full_name,
      phone: row.phone,
      email: row.email,
      avatar_url: row.avatar_url,
      avatar_seed: row.avatar_seed,
    });
  }
  return profiles;
}

/**
 * Same name/avatar resolution Activity uses: profiles table, then org-members RPC
 * (SECURITY DEFINER — often has names when direct profile reads are sparse under RLS).
 */
export async function resolveActivityUserProfiles(input: {
  userIds: Array<string | null | undefined>;
  organizationId?: string | null;
  seedProfiles?: Record<string, TripActivityUserProfile>;
}): Promise<Record<string, TripActivityUserProfile>> {
  const unique = [...new Set(input.userIds.map(trimId).filter(Boolean))];
  const profiles: Record<string, TripActivityUserProfile> = {};
  for (const [id, profile] of Object.entries(input.seedProfiles ?? {})) {
    const uid = trimId(id);
    if (!uid) continue;
    rememberProfile(profiles, uid, profile);
  }
  if (unique.length === 0) return profiles;

  const fromTable = await fetchActivityUserProfiles(unique);
  for (const [id, profile] of Object.entries(fromTable)) {
    rememberProfile(profiles, id, profile);
  }

  const orgId = trimId(input.organizationId);
  if (orgId) {
    const { data } = await supabase().rpc("get_org_members_with_profiles", {
      p_org_id: orgId,
    });
    for (const row of data ?? []) {
      const uid = trimId(
        typeof row?.user_id === "string"
          ? row.user_id
          : typeof row?.id === "string"
            ? row.id
            : "",
      );
      if (!uid || !unique.includes(uid)) continue;
      rememberProfile(profiles, uid, {
        full_name: typeof row?.full_name === "string" ? row.full_name : null,
        phone: typeof row?.phone === "string" ? row.phone : null,
        email: typeof row?.email === "string" ? row.email : null,
        avatar_url: typeof row?.avatar_url === "string" ? row.avatar_url : null,
        avatar_seed: typeof row?.avatar_seed === "string" ? row.avatar_seed : null,
      });
    }
  }

  const stillMissing = unique.filter((id) => !profileHasDisplayName(profiles[id]));
  if (stillMissing.length === 0) return profiles;

  // Last pass: profiles again for ids the org roster did not cover (cross-org actors).
  const retry = await fetchActivityUserProfiles(stillMissing);
  for (const [id, profile] of Object.entries(retry)) {
    rememberProfile(profiles, id, profile);
  }
  return profiles;
}

/** Load every trip payment / vault-doc actor, then resolve workspace names. */
export async function loadTripActivityActorHydration(input: {
  tripId: string;
  organizationId?: string | null;
  extraUserIds?: Array<string | null | undefined>;
}): Promise<TripActivityActorHydration> {
  const tripId = trimId(input.tripId);
  const empty: TripActivityActorHydration = {
    createdByByTxId: {},
    uploadedByByDocId: {},
    verifiedByByDocId: {},
    profiles: {},
  };
  if (!tripId) return empty;

  const [tx, docs] = await Promise.all([
    supabase()
      .from("transactions")
      .select("id, created_by")
      .eq("trip_id", tripId)
      .limit(200),
    supabase()
      .from("trip_documents")
      .select("id, uploaded_by, verified_by")
      .eq("trip_id", tripId)
      .limit(200),
  ]);

  const createdByByTxId: Record<string, string> = {};
  for (const row of tx.data ?? []) {
    const id = trimId(row.id);
    const userId = trimId(row.created_by);
    if (id && userId) createdByByTxId[id] = userId;
  }

  const uploadedByByDocId: Record<string, string> = {};
  const verifiedByByDocId: Record<string, string> = {};
  for (const row of docs.data ?? []) {
    const id = trimId(row.id);
    if (!id) continue;
    const uploadedBy = trimId(row.uploaded_by);
    const verifiedBy = trimId(row.verified_by);
    if (uploadedBy) uploadedByByDocId[id] = uploadedBy;
    if (verifiedBy) verifiedByByDocId[id] = verifiedBy;
  }

  const hydration: TripActivityActorHydration = {
    createdByByTxId,
    uploadedByByDocId,
    verifiedByByDocId,
    profiles: {},
  };
  hydration.profiles = await resolveActivityUserProfiles({
    userIds: collectHydrationUserIds(hydration, input.extraUserIds),
    organizationId: input.organizationId,
  });
  return hydration;
}

export function displayMapFromProfiles(
  profiles: Record<string, TripActivityUserProfile>,
): Record<string, string> {
  const display: Record<string, string> = {};
  for (const [id, profile] of Object.entries(profiles)) {
    const name =
      profile.full_name?.trim() ||
      profile.phone?.trim() ||
      profile.email?.trim() ||
      "";
    if (name) display[id] = name;
  }
  return display;
}
