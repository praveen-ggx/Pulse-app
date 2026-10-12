/**
 * Organization members service — Supabase only (mobile).
 * Handles team member invite, list, role change, and removal.
 */
import { supabase } from "@/lib/supabase";
import { subscribeSharedPostgresChanges } from "@/lib/realtimeRegistry";
import type {
  OrgMember,
  OrgTeamRoster,
  PendingPhoneTeamInvite,
  TeamInvite,
  UserProfileForInvite,
} from "@/types/organization";
import {
  precheckTeamInviteContact,
  precheckToProfile,
} from "@/features/organization/services/teamInvitePrecheck.service";
import {
  buildMemberPermissions,
  buildTeamInvitePermissions,
  orgMemberRoleForPlatformRole,
  type PlatformTeamRole,
  type TeamInvitePermissions,
} from "@/features/organization/utils/teamInviteRoles.util";
import type { MemberSurfaceMap } from "@/lib/memberSurfaces";
import { setMemberWarehouseIds } from "@/features/organization/services/memberWarehouses.service";
import { getCapabilitiesFromProfile, type Capability } from "@/lib/capabilities";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizePhone(phone: string): string {
  return phone.replace(/\s+/g, "").trim();
}

/** Derive org capabilities from organization record operating model. */
async function getOrgCapabilities(orgId: string): Promise<Capability[]> {
  try {
    const { data, error } = await supabase()
      .from("organizations")
      .select("operating_model")
      .eq("id", orgId)
      .maybeSingle();
    if (error || !data) return [];
    return getCapabilitiesFromProfile({ role: "user" }, data.operating_model || "HYBRID");
  } catch {
    return [];
  }
}

/** Hide raw Postgres error text (e.g. constraint violations) behind a friendly message. */
function friendlyMemberWriteError(message: string): Error {
  if (/violates.*constraint/i.test(message)) {
    return new Error("Couldn't send the invitation. Please try again.");
  }
  return new Error(message);
}

// ─── List members + pending phone invites ─────────────────────────────────────

export async function getOrgTeamRoster(orgId: string): Promise<{
  error: Error | null;
  roster: OrgTeamRoster;
}> {
  const empty: OrgTeamRoster = { members: [], pendingPhoneInvites: [] };
  try {
    const [membersRes, pendingRes] = await Promise.all([
      getOrganizationMembers(orgId),
      getPendingPhoneTeamInvites(orgId),
    ]);
    if (membersRes.error) return { error: membersRes.error, roster: empty };
    if (pendingRes.error) return { error: pendingRes.error, roster: empty };
    return {
      error: null,
      roster: {
        members: membersRes.members,
        pendingPhoneInvites: pendingRes.invites,
      },
    };
  } catch (e) {
    return { error: e instanceof Error ? e : new Error(String(e)), roster: empty };
  }
}

export async function getPendingPhoneTeamInvites(orgId: string): Promise<{
  error: Error | null;
  invites: PendingPhoneTeamInvite[];
}> {
  try {
    const { data, error } = await supabase().rpc("get_org_team_pending_invites", {
      p_org_id: orgId,
    });
    if (error) return { error: new Error(error.message), invites: [] };
    return { error: null, invites: (data ?? []) as PendingPhoneTeamInvite[] };
  } catch (e) {
    return { error: e instanceof Error ? e : new Error(String(e)), invites: [] };
  }
}

// ─── Domain join requests (Team → Action needed) ───────────────────────────

export type OrgDomainJoinRequest = {
  id: string;
  organization_id: string;
  user_id: string;
  email: string;
  requester_name: string | null;
  status: string;
  created_at: string;
};

export async function getOrgDomainJoinRequests(orgId: string): Promise<{
  error: Error | null;
  requests: OrgDomainJoinRequest[];
}> {
  try {
    const { data, error } = await supabase().rpc("get_org_domain_join_requests", {
      p_org_id: orgId,
    });
    if (error) return { error: new Error(error.message), requests: [] };
    return { error: null, requests: (data ?? []) as OrgDomainJoinRequest[] };
  } catch (e) {
    return { error: e instanceof Error ? e : new Error(String(e)), requests: [] };
  }
}

export async function approveOrgDomainJoinRequest(
  requestId: string,
): Promise<{ error: Error | null }> {
  try {
    const { error } = await supabase().rpc("approve_org_domain_join_request", {
      p_request_id: requestId,
    });
    if (error) return { error: new Error(error.message) };
    return { error: null };
  } catch (e) {
    return { error: e instanceof Error ? e : new Error(String(e)) };
  }
}

export async function declineOrgDomainJoinRequest(
  requestId: string,
): Promise<{ error: Error | null }> {
  try {
    const { error } = await supabase().rpc("decline_org_domain_join_request", {
      p_request_id: requestId,
    });
    if (error) return { error: new Error(error.message) };
    return { error: null };
  } catch (e) {
    return { error: e instanceof Error ? e : new Error(String(e)) };
  }
}

export function subscribeToOrgTeamRoster(
  orgId: string,
  onChange: () => void,
): () => void {
  // Shared ref-counted channel via the registry — same two-table invalidation,
  // reuses one server channel and inherits cap/grace/prune lifecycle.
  return subscribeSharedPostgresChanges(
    `org-team:${orgId}`,
    [
      {
        event: "*",
        schema: "public",
        table: "organization_members",
        filter: `organization_id=eq.${orgId}`,
      },
      {
        event: "*",
        schema: "public",
        table: "organization_team_invites",
        filter: `organization_id=eq.${orgId}`,
      },
    ],
    () => onChange(),
  );
}

// ─── List members ──────────────────────────────────────────────────────────────

export async function getOrganizationMembers(orgId: string): Promise<{
  error: Error | null;
  members: OrgMember[];
}> {
  try {
    const { data, error } = await supabase().rpc(
      "get_org_members_with_profiles",
      { p_org_id: orgId },
    );
    if (!error && data) {
      return { error: null, members: data as OrgMember[] };
    }
    if (error) {
      // Fallback: direct join if RPC not yet deployed
      const { data: fallback, error: fallbackErr } = await supabase()
        .from("organization_members")
        .select("id, organization_id, user_id, role, status, permissions, joined_at")
        .eq("organization_id", orgId)
        .neq("status", "inactive")
        .order("joined_at", { ascending: true });
      if (fallbackErr) return { error: new Error(fallbackErr.message), members: [] };
      return { error: null, members: (fallback ?? []) as OrgMember[] };
    }
    return { error: null, members: [] };
  } catch (e) {
    return { error: e instanceof Error ? e : new Error(String(e)), members: [] };
  }
}

// ─── Phone lookup ──────────────────────────────────────────────────────────────

export async function lookupUserByPhone(phone: string): Promise<{
  error: Error | null;
  profile: UserProfileForInvite | null;
}> {
  const normalized = normalizePhone(phone);
  if (!normalized) return { error: new Error("Phone is required"), profile: null };

  try {
    const { data, error } = await supabase().rpc("get_user_profile_by_phone", {
      p_phone: normalized,
    });
    if (error) {
      // Fallback: direct query
      const { data: fb, error: fbErr } = await supabase()
        .from("profiles")
        .select("id, full_name, phone, email, avatar_url, role")
        .ilike("phone", normalized)
        .limit(1)
        .maybeSingle();
      if (fbErr) return { error: new Error(fbErr.message), profile: null };
      if (!fb) return { error: null, profile: null };
      return {
        error: null,
        profile: {
          user_id: fb.id,
          full_name: fb.full_name,
          phone: fb.phone,
          email: fb.email,
          avatar_url: fb.avatar_url,
          role: fb.role,
        },
      };
    }
    const rows = Array.isArray(data) ? data : data ? [data] : [];
    if (!rows.length) return { error: null, profile: null };
    const row = rows[0] as {
      user_id: string;
      full_name: string | null;
      phone: string | null;
      email: string | null;
      avatar_url: string | null;
      role: string | null;
    };
    return {
      error: null,
      profile: {
        user_id: row.user_id,
        full_name: row.full_name,
        phone: row.phone,
        email: row.email,
        avatar_url: row.avatar_url,
        role: row.role,
      },
    };
  } catch (e) {
    return { error: e instanceof Error ? e : new Error(String(e)), profile: null };
  }
}

// ─── Invite member (existing Pulse user) ─────────────────────────────────────

/** Access chosen in the invite editor; absent = the role's default preset. */
export type TeamInviteAccess = {
  surfaces: MemberSurfaceMap;
  isDepartmentManager?: boolean;
  /** Ground Ops only — which warehouses' trips they see. */
  warehouseIds?: string[];
};

/** Same write shape as Edit member (buildMemberPermissions) when access is given. */
function invitePermissions(
  platformRole: PlatformTeamRole,
  orgCaps: Capability[],
  access?: TeamInviteAccess,
): TeamInvitePermissions {
  return access
    ? buildMemberPermissions({
        platformRole,
        orgCaps,
        surfaces: access.surfaces,
        isDepartmentManager: access.isDepartmentManager,
      })
    : buildTeamInvitePermissions(platformRole, undefined, orgCaps);
}

/** Ground Ops warehouses chosen on the invite (empty for every other role). */
function inviteWarehouseIds(platformRole: PlatformTeamRole, access?: TeamInviteAccess): string[] {
  return platformRole === "ground_ops" ? (access?.warehouseIds ?? []) : [];
}

export async function inviteTeamMember(
  orgId: string,
  userId: string,
  platformRole: PlatformTeamRole,
  access?: TeamInviteAccess,
): Promise<{
  error: Error | null;
  member: OrgMember | null;
  alreadyMember?: boolean;
  alreadyInvited?: boolean;
  belongsToOtherOrg?: boolean;
}> {
  const orgCaps = await getOrgCapabilities(orgId);
  const permissions = invitePermissions(platformRole, orgCaps, access);
  const role = orgMemberRoleForPlatformRole(permissions.platformRole);
  try {
    const { data, error } = await supabase().rpc("invite_existing_user_to_org", {
      p_org_id: orgId,
      p_user_id: userId,
      p_role: role,
      p_permissions: permissions,
    });

    if (error) {
      if (error.message.includes("already_member")) {
        return { error: null, member: null, alreadyMember: true };
      }
      if (error.message.includes("already_invited")) {
        return { error: null, member: null, alreadyInvited: true };
      }
      if (error.message.includes("belongs_to_other_org")) {
        return {
          error: new Error(
            "This person already belongs to another organization on Pulse and cannot be added here.",
          ),
          member: null,
          belongsToOtherOrg: true,
        };
      }
      return { error: friendlyMemberWriteError(error.message), member: null };
    }
    const member = data as OrgMember;
    const warehouseIds = inviteWarehouseIds(permissions.platformRole, access);
    if (member?.id && warehouseIds.length > 0) {
      const { error: whError } = await setMemberWarehouseIds(member.id, warehouseIds);
      if (whError) {
        return {
          error: new Error(`Invite sent, but warehouses didn't save: ${whError.message}`),
          member,
        };
      }
    }
    return { error: null, member };
  } catch (e) {
    return { error: e instanceof Error ? e : new Error(String(e)), member: null };
  }
}

// ─── Invite employee without Pulse account (phone pending) ───────────────────

export async function createPendingTeamInvite(
  orgId: string,
  params: {
    phone: string;
    name: string;
    email?: string | null;
    platformRole: PlatformTeamRole;
    access?: TeamInviteAccess;
  },
): Promise<{
  error: Error | null;
  invite: PendingPhoneTeamInvite | null;
  alreadyPending?: boolean;
}> {
  const orgCaps = await getOrgCapabilities(orgId);
  const basePermissions = invitePermissions(params.platformRole, orgCaps, params.access);
  const pendingWarehouseIds = inviteWarehouseIds(basePermissions.platformRole, params.access);
  const permissions =
    pendingWarehouseIds.length > 0
      ? { ...basePermissions, warehouseIds: pendingWarehouseIds }
      : basePermissions;
  const role = orgMemberRoleForPlatformRole(permissions.platformRole);
  try {
    const { data, error } = await supabase().rpc("create_team_invite_pending", {
      p_org_id: orgId,
      p_phone: normalizePhone(params.phone),
      p_name: params.name.trim(),
      p_email: params.email?.trim() || null,
      p_role: role,
      p_permissions: permissions,
    });
    if (error) {
      if (error.message.includes("already has a Pulse account")) {
        return { error: new Error(error.message), invite: null };
      }
      if (error.message.includes("idx_org_team_invites_pending_phone") || error.message.includes("duplicate")) {
        return { error: null, invite: null, alreadyPending: true };
      }
      return { error: new Error(error.message), invite: null };
    }
    return { error: null, invite: data as PendingPhoneTeamInvite };
  } catch (e) {
    return { error: e instanceof Error ? e : new Error(String(e)), invite: null };
  }
}

export async function cancelPendingTeamInvite(
  inviteId: string,
): Promise<{ error: Error | null }> {
  try {
    const { error } = await supabase().rpc("cancel_team_invite_pending", {
      p_invite_id: inviteId,
    });
    if (error) return { error: new Error(error.message) };
    return { error: null };
  } catch (e) {
    return { error: e instanceof Error ? e : new Error(String(e)) };
  }
}

/**
 * Unified invite: existing Pulse user → membership row;
 * new employee → pending phone invite (claimed on signup).
 */
export async function inviteTeamMemberByContact(
  orgId: string,
  params: {
    phone: string;
    name: string;
    email?: string | null;
    platformRole: PlatformTeamRole;
    access?: TeamInviteAccess;
    existingUserId?: string | null;
  },
): Promise<{
  error: Error | null;
  kind: "member" | "pending" | null;
  member: OrgMember | null;
  pendingInvite: PendingPhoneTeamInvite | null;
  alreadyMember?: boolean;
  alreadyInvited?: boolean;
  precheckAction?: string;
}> {
  if (!params.existingUserId) {
    const pre = await precheckTeamInviteContact(orgId, params.phone, params.email);
    if (pre.error) return { error: pre.error, kind: null, member: null, pendingInvite: null };
    const check = pre.result;
    if (check) {
      if (check.recommendedAction === "already_member") {
        return {
          error: null,
          kind: null,
          member: null,
          pendingInvite: null,
          alreadyMember: true,
          precheckAction: check.recommendedAction,
        };
      }
      if (check.recommendedAction === "already_invited") {
        return {
          error: null,
          kind: null,
          member: null,
          pendingInvite: null,
          alreadyInvited: true,
          precheckAction: check.recommendedAction,
        };
      }
      if (check.recommendedAction === "belongs_to_other_org") {
        return {
          error: new Error(
            check.message ??
              "This person already belongs to another organization on Pulse and cannot be added here.",
          ),
          kind: null,
          member: null,
          pendingInvite: null,
          precheckAction: check.recommendedAction,
        };
      }
      if (
        check.recommendedAction === "invite_existing_user" ||
        check.recommendedAction === "email_registered"
      ) {
        const profile = precheckToProfile(check);
        if (profile?.user_id) {
          const res = await inviteTeamMember(orgId, profile.user_id, params.platformRole, params.access);
          return {
            error: res.error,
            kind: res.member ? "member" : null,
            member: res.member,
            pendingInvite: null,
            alreadyMember: res.alreadyMember,
            alreadyInvited: res.alreadyInvited,
            precheckAction: res.belongsToOtherOrg ? "belongs_to_other_org" : check.recommendedAction,
          };
        }
        if (check.recommendedAction === "email_registered") {
          return {
            error: new Error(
              check.message ??
                "This email already has a Pulse account. They must sign in to accept — not sign up again.",
            ),
            kind: null,
            member: null,
            pendingInvite: null,
            precheckAction: check.recommendedAction,
          };
        }
      }
    }
  }

  if (params.existingUserId) {
    const res = await inviteTeamMember(orgId, params.existingUserId, params.platformRole, params.access);
    return {
      error: res.error,
      kind: res.member ? "member" : null,
      member: res.member,
      pendingInvite: null,
      alreadyMember: res.alreadyMember,
      alreadyInvited: res.alreadyInvited,
    };
  }
  const res = await createPendingTeamInvite(orgId, params);
  return {
    error: res.error,
    kind: res.invite ? "pending" : null,
    member: null,
    pendingInvite: res.invite,
  };
}

// ─── Update role ──────────────────────────────────────────────────────────────

/** Detect the set_member_role RPC's owner-only rejection for a friendly message. */
export function looksLikeNotOwnerError(message: string): boolean {
  return /not_org_owner/i.test(message);
}

/**
 * Change a member's role/permissions via the owner-only, atomic, audited RPC.
 * The DB is the authority — RLS blocks off-RPC role/permission writes for
 * non-owners. Owner-row reassignment is rejected (use transferOwnership).
 *
 * Note: orgId must be passed to fetch org capabilities for surface calculation.
 * Without it, surfaces default to undefined (pre-existing bug, now required).
 */
export async function updateMemberRole(
  memberId: string,
  platformRole: PlatformTeamRole,
  orgId?: string,
): Promise<{ error: Error | null }> {
  const orgCaps = orgId ? await getOrgCapabilities(orgId) : [];
  return updateMemberPermissions(memberId, buildTeamInvitePermissions(platformRole, undefined, orgCaps));
}

/**
 * Persist a full permissions object (platformRole + grants + domains) via the
 * owner-only set_member_role RPC. Used by the per-member permission detail page
 * when domain toggles diverge from a single role preset.
 */
export async function updateMemberPermissions(
  memberId: string,
  permissions: TeamInvitePermissions,
): Promise<{ error: Error | null }> {
  const role = orgMemberRoleForPlatformRole(permissions.platformRole);
  try {
    const { error } = await supabase().rpc("set_member_role", {
      p_member_id: memberId,
      p_role: role,
      p_permissions: permissions,
    });
    if (error) {
      if (looksLikeNotOwnerError(error.message)) {
        return { error: new Error("Only the organization owner can change member roles.") };
      }
      return { error: new Error(error.message) };
    }
    return { error: null };
  } catch (e) {
    return { error: e instanceof Error ? e : new Error(String(e)) };
  }
}

/** Detect the set_member_surfaces_as_manager RPC's scope rejections for a friendly message. */
export function looksLikeNotDepartmentManagerError(message: string): boolean {
  return /not_department_manager|cross_department|cannot_edit_admin|cannot_edit_self/i.test(
    message,
  );
}

/**
 * Merge surface toggles for a member in the caller's own department, via the
 * department-manager-scoped RPC. Caller must have permissions.isDepartmentManager
 * = true; only the `surfaces` key is written, never role/platformRole/domains.
 * The owner should keep using `updateMemberPermissions` for everything else,
 * including assigning/removing the manager flag itself.
 */
export async function updateMemberSurfacesAsManager(
  memberId: string,
  surfaces: MemberSurfaceMap,
): Promise<{ error: Error | null }> {
  try {
    const { error } = await supabase().rpc("set_member_surfaces_as_manager", {
      p_member_id: memberId,
      p_surfaces: surfaces,
    });
    if (error) {
      if (looksLikeNotDepartmentManagerError(error.message)) {
        return {
          error: new Error("You can only edit permissions for members in your own department."),
        };
      }
      return { error: new Error(error.message) };
    }
    return { error: null };
  } catch (e) {
    return { error: e instanceof Error ? e : new Error(String(e)) };
  }
}

/**
 * Apply one role + permissions object to many members in a single write.
 *
 * Unlike `updateMemberPermissions`, this goes direct to the table rather than
 * the `set_member_role` RPC (which is one-member-per-call). RLS is still the
 * authority — the owner-only UPDATE policy rejects the whole statement for a
 * non-owner, and owner rows are excluded here so ownership can never be
 * reassigned by a bulk edit (use `transferOwnership`).
 */
export async function updateBulkMemberPermissions(
  memberIds: string[],
  platformRole: PlatformTeamRole,
  permissions: TeamInvitePermissions,
): Promise<{ error: Error | null; updated: number }> {
  const ids = [...new Set(memberIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) return { error: null, updated: 0 };

  const role = orgMemberRoleForPlatformRole(platformRole);
  try {
    const { data, error } = await supabase()
      .from("organization_members")
      .update({ role, permissions })
      .in("id", ids)
      .neq("role", "owner")
      .select("id");
    if (error) {
      if (looksLikeNotOwnerError(error.message)) {
        return {
          error: new Error("Only the organization owner can change member roles."),
          updated: 0,
        };
      }
      return { error: new Error(error.message), updated: 0 };
    }
    return { error: null, updated: (data ?? []).length };
  } catch (e) {
    return {
      error: e instanceof Error ? e : new Error(String(e)),
      updated: 0,
    };
  }
}

// ─── Transfer ownership ─────────────────────────────────────────────────────────

/** Detect the RPC's "target must be an active member" rejection for a friendly message. */
export function looksLikeTransferTargetError(message: string): boolean {
  return /transfer_target_not_member/i.test(message);
}

/**
 * Transfer org ownership to an active member via the owner-only, atomic,
 * audited RPC. The current owner steps down to admin and the target becomes
 * owner in one transaction (owner_id + role rows flipped together). The DB is
 * the authority — UI gating is convenience only.
 */
export async function transferOwnership(
  orgId: string,
  newOwnerUserId: string,
): Promise<{ error: Error | null }> {
  try {
    const { error } = await supabase().rpc("transfer_organization_ownership", {
      p_org_id: orgId,
      p_new_owner_user_id: newOwnerUserId,
    });
    if (error) return { error: new Error(error.message) };
    return { error: null };
  } catch (e) {
    return { error: e instanceof Error ? e : new Error(String(e)) };
  }
}

// ─── Remove member ─────────────────────────────────────────────────────────────

export async function removeMember(memberId: string): Promise<{ error: Error | null }> {
  try {
    const { data, error } = await supabase()
      .from("organization_members")
      .update({ status: "inactive" })
      .eq("id", memberId)
      .select("id");
    if (error) return { error: new Error(error.message) };
    // RLS blocks the write silently (0 rows, no PostgREST error) rather than
    // rejecting it — without this check the caller sees `error: null` and
    // treats a no-op as success.
    if (!data || data.length === 0) {
      return {
        error: new Error(
          "Couldn't remove this member — you may not have permission.",
        ),
      };
    }
    return { error: null };
  } catch (e) {
    return { error: e instanceof Error ? e : new Error(String(e)) };
  }
}

// ─── Cancel invite (by admin) ──────────────────────────────────────────────────

export async function cancelTeamInvite(
  memberOrInviteId: string,
  kind: "member" | "phone_pending" = "member",
): Promise<{ error: Error | null }> {
  if (kind === "phone_pending") {
    return cancelPendingTeamInvite(memberOrInviteId);
  }
  return removeMember(memberOrInviteId);
}

// ─── Invitee: accept ────────────────────────────────────────────────────────────

export async function acceptTeamInvite(orgId: string): Promise<{ error: Error | null }> {
  try {
    const { error } = await supabase().rpc("accept_team_invite", { p_org_id: orgId });
    if (error) {
      // Fallback: direct update
      const { data: { user } } = await supabase().auth.getUser();
      if (!user) return { error: new Error("Not signed in") };
      const { error: updErr } = await supabase()
        .from("organization_members")
        .update({ status: "active" })
        .eq("organization_id", orgId)
        .eq("user_id", user.id)
        .eq("status", "pending");
      if (updErr) return { error: new Error(updErr.message) };
    }
    return { error: null };
  } catch (e) {
    return { error: e instanceof Error ? e : new Error(String(e)) };
  }
}

// ─── Invitee: reject ────────────────────────────────────────────────────────────

export async function rejectTeamInvite(orgId: string): Promise<{ error: Error | null }> {
  try {
    const { error } = await supabase().rpc("reject_team_invite", { p_org_id: orgId });
    if (error) {
      const { data: { user } } = await supabase().auth.getUser();
      if (!user) return { error: new Error("Not signed in") };
      const { error: updErr } = await supabase()
        .from("organization_members")
        .update({ status: "inactive" })
        .eq("organization_id", orgId)
        .eq("user_id", user.id)
        .eq("status", "pending");
      if (updErr) return { error: new Error(updErr.message) };
    }
    return { error: null };
  } catch (e) {
    return { error: e instanceof Error ? e : new Error(String(e)) };
  }
}

// ─── Get pending invites for current user ─────────────────────────────────────

export async function getMyTeamInvites(): Promise<{
  error: Error | null;
  invites: TeamInvite[];
}> {
  try {
    const { data, error } = await supabase().rpc("get_my_team_invites");
    if (!error && data) {
      return { error: null, invites: data as TeamInvite[] };
    }
    if (error) {
      // Fallback
      const { data: { user } } = await supabase().auth.getUser();
      if (!user) return { error: null, invites: [] };
      const { data: fb, error: fbErr } = await supabase()
        .from("organization_members")
        .select("id, organization_id, role, joined_at")
        .eq("user_id", user.id)
        .eq("status", "pending");
      if (fbErr) return { error: new Error(fbErr.message), invites: [] };
      return { error: null, invites: (fb ?? []).map((r) => ({ ...r, org_name: "" })) as TeamInvite[] };
    }
    return { error: null, invites: [] };
  } catch (e) {
    return { error: e instanceof Error ? e : new Error(String(e)), invites: [] };
  }
}
