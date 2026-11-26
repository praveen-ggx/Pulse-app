/**
 * Workspace Team channels — Slack-like create / browse / join / invite / leave.
 * Backed by SECURITY DEFINER RPCs in `team_chat_channel_management` migration.
 */
import { supabase } from "@/lib/supabase";

import type { ChatConversationRow } from "../types/chatPlatform.types";
import { normalizeTeamChannelKey } from "../utils/teamChannelSlug.util";

export type TeamChannelVisibility = "public" | "private";

export type TeamChannelListItem = {
  id: string;
  organizationId: string;
  channelKey: string;
  title: string;
  topic: string | null;
  visibility: TeamChannelVisibility;
  isArchived: boolean;
  isMember: boolean;
  isAdmin: boolean;
  memberCount: number;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  createdAt: string | null;
  createdBy: string | null;
};

export type TeamChannelMember = {
  userId: string;
  participantRole: string;
  joinedAt: string | null;
  fullName: string;
  avatarUrl: string | null;
  avatarSeed: string | null;
  orgRole: string | null;
};

export type CreateTeamChannelInput = {
  organizationId: string;
  name: string;
  title?: string;
  topic?: string;
  visibility?: TeamChannelVisibility;
  memberIds?: string[];
};

function mapChannelRow(row: Record<string, unknown>): TeamChannelListItem {
  const visRaw = String(row.visibility ?? "public").toLowerCase();
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    channelKey: String(row.channel_key ?? ""),
    title: String(row.title ?? row.channel_key ?? "channel"),
    topic: row.topic != null ? String(row.topic) : null,
    visibility: visRaw === "private" ? "private" : "public",
    isArchived: Boolean(row.is_archived),
    isMember: Boolean(row.is_member),
    isAdmin: Boolean(row.is_admin),
    memberCount: Number(row.member_count ?? 0),
    lastMessageAt:
      row.last_message_at != null ? String(row.last_message_at) : null,
    lastMessagePreview:
      row.last_message_preview != null
        ? String(row.last_message_preview)
        : null,
    createdAt: row.created_at != null ? String(row.created_at) : null,
    createdBy: row.created_by != null ? String(row.created_by) : null,
  };
}

function isMissingRpcError(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;
  const code = String(error.code ?? "");
  const msg = String(error.message ?? "").toLowerCase();
  return (
    code === "PGRST202" ||
    code === "42883" ||
    msg.includes("could not find the function") ||
    msg.includes("schema cache")
  );
}

export async function listTeamChannels(
  organizationId: string,
  options?: { limit?: number },
): Promise<TeamChannelListItem[]> {
  const { data, error } = await supabase().rpc("list_team_chat_channels", {
    p_organization_id: organizationId,
    p_limit: Math.min(Math.max(options?.limit ?? 50, 1), 100),
  });
  if (error) {
    // Soft-empty when RPC not deployed yet (avoids Team tab hard-fail).
    if (isMissingRpcError(error)) return [];
    throw new Error(`Failed to load channels: ${error.message}`);
  }
  return ((data ?? []) as Record<string, unknown>[]).map(mapChannelRow);
}

export async function createTeamChannel(
  input: CreateTeamChannelInput,
): Promise<ChatConversationRow> {
  const key = normalizeTeamChannelKey(input.name);
  if (!key) throw new Error("Enter a channel name");
  const visibility = input.visibility === "private" ? "private" : "public";
  const title = input.title?.trim() || input.name.trim() || null;
  const topic = input.topic?.trim() || null;
  const memberIds =
    input.memberIds && input.memberIds.length > 0 ? input.memberIds : null;

  const { data, error } = await supabase().rpc("create_team_chat_channel", {
    p_organization_id: input.organizationId,
    p_channel_key: key,
    p_title: title,
    p_topic: topic,
    p_visibility: visibility,
    p_member_ids: memberIds,
  });

  if (!error) return data as ChatConversationRow;

  const msg = String(error.message ?? "");
  if (/already exists|23505/i.test(msg)) {
    throw new Error(`#${key} is taken — try another name`);
  }

  // Legacy ensure_chat_channel has no visibility metadata — never silently
  // downgrade an explicit private create. Refuse until team RPCs are live.
  if (isMissingRpcError(error)) {
    if (visibility === "private") {
      throw new Error(
        "Private channels require the team channel API. Try again after sync, or create a public channel.",
      );
    }
    const { ensureChatChannel } = await import("./chatPlatform.service");
    const row = await ensureChatChannel(
      input.organizationId,
      key,
      title ?? undefined,
    );
    if (memberIds && memberIds.length > 0) {
      try {
        await inviteTeamChannelMembers(row.id, memberIds);
      } catch {
        // Invite RPC may also be missing — channel still created for self.
      }
    }
    return row;
  }

  throw new Error(msg || "Failed to create channel");
}

export async function joinTeamChannel(
  conversationId: string,
): Promise<ChatConversationRow> {
  const { data, error } = await supabase().rpc("join_team_chat_channel", {
    p_conversation_id: conversationId,
  });
  if (error) throw new Error(error.message || "Failed to join channel");
  return data as ChatConversationRow;
}

export async function leaveTeamChannel(conversationId: string): Promise<void> {
  const { error } = await supabase().rpc("leave_team_chat_channel", {
    p_conversation_id: conversationId,
  });
  if (error) throw new Error(error.message || "Failed to leave channel");
}

export async function inviteTeamChannelMembers(
  conversationId: string,
  memberIds: string[],
): Promise<number> {
  if (memberIds.length === 0) return 0;
  const { data, error } = await supabase().rpc(
    "invite_team_chat_channel_members",
    {
      p_conversation_id: conversationId,
      p_member_ids: memberIds,
    },
  );
  if (error) throw new Error(error.message || "Failed to invite members");
  return Number(data ?? 0);
}

export async function listTeamChannelMembers(
  conversationId: string,
): Promise<TeamChannelMember[]> {
  const { data, error } = await supabase().rpc(
    "list_team_chat_channel_members",
    {
      p_conversation_id: conversationId,
    },
  );
  if (error) throw new Error(error.message || "Failed to load members");
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    userId: String(row.user_id),
    participantRole: String(row.participant_role ?? "member"),
    joinedAt: row.joined_at != null ? String(row.joined_at) : null,
    fullName: String(row.full_name ?? "Member"),
    avatarUrl: row.avatar_url != null ? String(row.avatar_url) : null,
    avatarSeed: row.avatar_seed != null ? String(row.avatar_seed) : null,
    orgRole: row.org_role != null ? String(row.org_role) : null,
  }));
}

export async function updateTeamChannel(
  conversationId: string,
  patch: {
    title?: string;
    topic?: string;
    visibility?: TeamChannelVisibility;
  },
): Promise<ChatConversationRow> {
  const { data, error } = await supabase().rpc("update_team_chat_channel", {
    p_conversation_id: conversationId,
    p_title: patch.title?.trim() || null,
    p_topic: patch.topic?.trim() || null,
    p_visibility: patch.visibility ?? null,
  });
  if (error) throw new Error(error.message || "Failed to update channel");
  return data as ChatConversationRow;
}

export async function archiveTeamChannel(
  conversationId: string,
): Promise<void> {
  const { error } = await supabase().rpc("archive_team_chat_channel", {
    p_conversation_id: conversationId,
  });
  if (error) throw new Error(error.message || "Failed to archive channel");
}
