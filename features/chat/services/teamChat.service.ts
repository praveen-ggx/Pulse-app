/**
 * Workspace Team chat — Phase A client helpers.
 *
 * Uses existing identity / membership + `ensure_direct_chat` / `chat_conversations`.
 * No schema changes. Authorization remains server-side; UI filters are not a security boundary.
 */
import { supabase } from "@/lib/supabase";
import { getOrganizationMembersShared } from "@/features/organization/services/members.service";
import type { OrgMember } from "@/types/organization";

import { ensureDirectChat } from "./chatPlatform.service";
import type { ChatConversationRow } from "../types/chatPlatform.types";

export type TeamMemberCandidate = {
  userId: string;
  fullName: string;
  role: OrgMember["role"];
  avatarUrl: string | null;
  avatarSeed: string | null;
};

export type TeamDirectConversation = {
  id: string;
  organizationId: string;
  channelKey: string | null;
  peerUserId: string | null;
  title: string | null;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  metadata: Record<string, unknown>;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isActiveNonDriverMember(m: OrgMember, selfUserId: string): boolean {
  if (!m.user_id || m.user_id === selfUserId) return false;
  if (m.status !== "active") return false;
  if (String(m.role).toLowerCase() === "driver") return false;
  return true;
}

/**
 * `ensure_direct_chat` stores peers as `dm:<uuidA>:<uuidB>` (sorted), not in metadata.
 * Resolve the other participant relative to the signed-in user.
 */
export function peerUserIdFromDirectChannelKey(
  channelKey: string | null | undefined,
  selfUserId: string,
): string | null {
  const key = String(channelKey ?? "").trim();
  const self = String(selfUserId ?? "").trim();
  if (!key || !self) return null;
  const m = /^dm:([^:]+):([^:]+)$/i.exec(key);
  if (!m) return null;
  const a = String(m[1] ?? "").trim();
  const b = String(m[2] ?? "").trim();
  if (!UUID_RE.test(a) || !UUID_RE.test(b)) return null;
  if (a === self) return b;
  if (b === self) return a;
  return null;
}

/**
 * Active workspace members eligible for Team 1:1 (excludes self + drivers).
 * Prefers `list_team_chat_eligible_user_ids` so roster matches chat_participants
 * FK (auth.users). Falls back to org roster when the RPC is not deployed yet.
 */
export async function listTeamChatMembers(
  organizationId: string,
  selfUserId: string,
): Promise<TeamMemberCandidate[]> {
  const { error, members } = await getOrganizationMembersShared(organizationId);
  if (error) throw error;

  const base = (members ?? [])
    .filter((m) => isActiveNonDriverMember(m, selfUserId))
    .map((m) => ({
      userId: m.user_id,
      fullName: (m.full_name || m.email || "Teammate").trim(),
      role: m.role,
      avatarUrl: m.avatar_url ?? null,
      avatarSeed: m.avatar_seed ?? null,
    }))
    .sort((a, b) => a.fullName.localeCompare(b.fullName));

  const { data: eligibleIds, error: eligibleErr } = await supabase().rpc(
    "list_team_chat_eligible_user_ids",
    { p_organization_id: organizationId },
  );

  if (eligibleErr || !Array.isArray(eligibleIds)) {
    return base;
  }

  // SETOF uuid → string[]; legacy uuid[] scalar also arrives as string[].
  const allow = new Set(
    (eligibleIds as unknown[])
      .map((id) => {
        if (id == null) return "";
        if (typeof id === "string" || typeof id === "number") return String(id);
        if (typeof id === "object" && "user_id" in (id as object)) {
          return String((id as { user_id: unknown }).user_id ?? "");
        }
        return String(id);
      })
      .filter(Boolean),
  );
  return base.filter((m) => allow.has(m.userId));
}

/**
 * Workspace direct conversations only (`conversation_type = direct`, no trip).
 * Deliberately avoids raw `get_chat_inbox` (mixes trip rooms).
 */
export async function listTeamDirectConversations(
  organizationId: string,
  selfUserId: string,
  options?: { limit?: number; before?: string },
): Promise<TeamDirectConversation[]> {
  const limit = Math.min(Math.max(options?.limit ?? 40, 1), 50);
  let q = supabase()
    .from("chat_conversations")
    .select(
      "id, organization_id, conversation_type, channel_key, title, trip_id, last_message_at, last_message_preview, metadata, created_at",
    )
    .eq("organization_id", organizationId)
    .eq("conversation_type", "direct")
    .is("trip_id", null)
    .eq("is_archived", false)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(limit);

  if (options?.before) {
    q = q.lt("last_message_at", options.before);
  }

  const { data, error } = await q;
  if (error) throw new Error(`Failed to load team conversations: ${error.message}`);

  return (data ?? []).map((row) => {
    const meta = (row.metadata ?? {}) as Record<string, unknown>;
    const channelKey =
      row.channel_key != null ? String(row.channel_key) : null;
    const peerFromMeta = meta.peer_user_id ?? meta.peerUserId ?? null;
    const peerFromKey = peerUserIdFromDirectChannelKey(channelKey, selfUserId);
    const peerUserId =
      peerFromKey ||
      (peerFromMeta != null ? String(peerFromMeta) : null);

    return {
      id: String(row.id),
      organizationId: String(row.organization_id),
      channelKey,
      peerUserId,
      title: row.title != null ? String(row.title) : null,
      lastMessageAt: row.last_message_at != null ? String(row.last_message_at) : null,
      lastMessagePreview:
        row.last_message_preview != null ? String(row.last_message_preview) : null,
      metadata: meta,
    };
  });
}

export async function openTeamDirectChat(
  organizationId: string,
  peerUserId: string,
): Promise<ChatConversationRow> {
  return ensureDirectChat(organizationId, peerUserId);
}
