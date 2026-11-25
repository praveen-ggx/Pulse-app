/**
 * Pulse Chat Platform service — unified chat_* schema (Phase 0 foundation).
 *
 * All access goes through the platform RPCs deployed in
 * `20260917000000_pulse_chat_platform_foundation.sql`:
 *
 *   • send_chat_message            — idempotent send (client_message_id dedupe)
 *   • get_chat_inbox               — cursor-paged conversation summaries + unread
 *   • get_chat_messages            — keyset-paginated thread history
 *   • ensure_direct_chat           — user ↔ user DM (deterministic per pair)
 *   • ensure_chat_channel          — named group channel
 *   • toggle_chat_reaction         — normalized reactions
 *   • mark_chat_conversation_read  — per-participant read cursor
 *   • search_chat_messages         — org-scoped full-text search
 *
 * Offline-first: failed sends are queued in the chat outbox and replayed
 * idempotently. Legacy trip/network sends keep using `chat.service.ts`; the
 * DB mirrors them into `chat_messages` automatically (dual-write triggers).
 */
import { supabase } from "@/lib/supabase";

import type {
  ChatConversationRow,
  ChatInboxItem,
  ChatOutboxEntry,
  ChatPlatformMessageRow,
  ChatReactionMap,
  SendChatMessageParams,
} from "../types/chatPlatform.types";
import {
  drainChatOutbox,
  enqueueChatOutbox,
  generateClientMessageId,
} from "../utils/chatOutbox.util";

const NETWORK_ERROR_RE = /network|fetch|timeout|abort|offline/i;

function isNetworkError(error: unknown): boolean {
  const message =
    error instanceof Error ? error.message : String(error ?? "");
  return NETWORK_ERROR_RE.test(message);
}

// ─── Inbox & history ──────────────────────────────────────────────────────────

export async function getChatInbox(
  organizationId: string,
  options?: { limit?: number; before?: string },
): Promise<ChatInboxItem[]> {
  const { data, error } = await supabase().rpc("get_chat_inbox", {
    p_organization_id: organizationId,
    p_limit: Math.min(Math.max(options?.limit ?? 30, 1), 50),
    p_before: options?.before ?? null,
  });
  if (error) throw new Error(`Failed to load chat inbox: ${error.message}`);
  return (data ?? []) as ChatInboxItem[];
}

/**
 * Newest page when `before` is omitted; pass the oldest loaded message's
 * `created_at` as the cursor for infinite scroll. Rows return newest-first.
 */
export async function getChatMessages(
  conversationId: string,
  options?: { before?: string; limit?: number },
): Promise<ChatPlatformMessageRow[]> {
  const { data, error } = await supabase().rpc("get_chat_messages", {
    p_conversation_id: conversationId,
    p_before: options?.before ?? null,
    p_limit: Math.min(Math.max(options?.limit ?? 30, 1), 50),
  });
  if (error) throw new Error(`Failed to load messages: ${error.message}`);
  return (data ?? []) as ChatPlatformMessageRow[];
}

// ─── Sending (offline-first, idempotent) ──────────────────────────────────────

async function rpcSendChatMessage(params: {
  conversationId: string;
  content: string;
  messageType: string;
  metadata: Record<string, unknown>;
  clientMessageId: string;
  replyToId: string | null;
  mentionUserIds: string[];
}): Promise<ChatPlatformMessageRow> {
  const { data, error } = await supabase().rpc("send_chat_message", {
    p_conversation_id: params.conversationId,
    p_content: params.content,
    p_message_type: params.messageType,
    p_metadata: params.metadata,
    p_client_message_id: params.clientMessageId,
    p_reply_to_id: params.replyToId,
    p_mentions:
      params.mentionUserIds.length > 0 ? params.mentionUserIds : null,
  });
  if (error) throw new Error(error.message);
  return data as ChatPlatformMessageRow;
}

export interface SendChatMessageResult {
  message: ChatPlatformMessageRow | null;
  /** True when the send was persisted to the offline outbox instead. */
  queuedOffline: boolean;
  clientMessageId: string;
}

/**
 * Send a message on the unified platform. On network failure the payload is
 * queued in the offline outbox and replayed later (idempotent server-side).
 * Non-network errors (auth, validation) are thrown to the caller.
 */
export async function sendPlatformChatMessage(
  params: SendChatMessageParams,
): Promise<SendChatMessageResult> {
  const clientMessageId =
    params.clientMessageId ?? generateClientMessageId();
  const payload = {
    conversationId: params.conversationId,
    content: params.content,
    messageType: params.messageType ?? ("text" as const),
    metadata: params.metadata ?? {},
    clientMessageId,
    replyToId: params.replyToId ?? null,
    mentionUserIds: params.mentionUserIds ?? [],
  };

  try {
    const message = await rpcSendChatMessage(payload);
    // Opportunistic flush of anything stuck from a previous offline window.
    void flushChatOutbox();
    return { message, queuedOffline: false, clientMessageId };
  } catch (error) {
    if (!isNetworkError(error)) throw error;
    await enqueueChatOutbox({
      clientMessageId,
      conversationId: payload.conversationId,
      content: payload.content,
      messageType: payload.messageType,
      metadata: payload.metadata,
      replyToId: payload.replyToId,
      mentionUserIds: payload.mentionUserIds,
      queuedAt: new Date().toISOString(),
      attempts: 0,
    });
    return { message: null, queuedOffline: true, clientMessageId };
  }
}

/** Replay queued offline sends. Call on reconnect (NetworkContext) or app focus. */
export async function flushChatOutbox(): Promise<{
  sent: number;
  remaining: number;
}> {
  return drainChatOutbox(async (entry: ChatOutboxEntry) => {
    await rpcSendChatMessage({
      conversationId: entry.conversationId,
      content: entry.content,
      messageType: entry.messageType,
      metadata: entry.metadata,
      clientMessageId: entry.clientMessageId,
      replyToId: entry.replyToId,
      mentionUserIds: entry.mentionUserIds,
    });
  });
}

// ─── Unified trip room (Phase 2) ─────────────────────────────────────────────

export async function refreshTripChatRoomTeam(
  tripId: string,
): Promise<ChatConversationRow> {
  const { data, error } = await supabase().rpc("refresh_trip_chat_room_team", {
    p_trip_id: tripId,
  });
  if (error) throw new Error(`Failed to sync trip team: ${error.message}`);
  return data as ChatConversationRow;
}

export async function ensureTripChatRoom(
  tripId: string,
): Promise<ChatConversationRow> {
  const { data, error } = await supabase().rpc("ensure_trip_chat_room", {
    p_trip_id: tripId,
  });
  if (error) throw new Error(`Failed to open trip chat room: ${error.message}`);
  return data as ChatConversationRow;
}

export async function getTripChatRoom(
  tripId: string,
): Promise<ChatConversationRow | null> {
  const { data, error } = await supabase().rpc("get_trip_chat_room", {
    p_trip_id: tripId,
  });
  if (error) throw new Error(`Failed to load trip chat room: ${error.message}`);
  return (data as ChatConversationRow | null) ?? null;
}

// ─── Conversation management ──────────────────────────────────────────────────

export async function ensureDirectChat(
  organizationId: string,
  peerUserId: string,
): Promise<ChatConversationRow> {
  const { data, error } = await supabase().rpc("ensure_direct_chat", {
    p_organization_id: organizationId,
    p_peer_user_id: peerUserId,
  });
  if (error) {
    const msg = String(error.message || "");
    if (
      /chat_participants_user_id_fkey/i.test(msg) ||
      /not an eligible active workspace member/i.test(msg)
    ) {
      throw new Error(
        "This teammate can’t receive chat yet (account is missing a login). Try someone else.",
      );
    }
    throw new Error(`Failed to open direct chat: ${msg}`);
  }
  return data as ChatConversationRow;
}

export async function ensureChatChannel(
  organizationId: string,
  channelKey: string,
  title?: string,
): Promise<ChatConversationRow> {
  const { data, error } = await supabase().rpc("ensure_chat_channel", {
    p_organization_id: organizationId,
    p_channel_key: channelKey,
    p_title: title ?? null,
  });
  if (error) throw new Error(`Failed to open channel: ${error.message}`);
  return data as ChatConversationRow;
}

// ─── Reactions / read state / search ─────────────────────────────────────────

export async function toggleChatReaction(
  messageId: string,
  emoji: string,
): Promise<ChatReactionMap> {
  const { data, error } = await supabase().rpc("toggle_chat_reaction", {
    p_message_id: messageId,
    p_emoji: emoji,
  });
  if (error) throw new Error(`Failed to toggle reaction: ${error.message}`);
  return (data ?? {}) as ChatReactionMap;
}

export async function markChatConversationRead(
  conversationId: string,
  upTo?: string,
): Promise<void> {
  const { error } = await supabase().rpc("mark_chat_conversation_read", {
    p_conversation_id: conversationId,
    p_up_to: upTo ?? null,
  });
  if (error) throw new Error(`Failed to mark read: ${error.message}`);
}

export async function searchChatMessages(
  organizationId: string,
  query: string,
  limit = 25,
): Promise<ChatPlatformMessageRow[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const { data, error } = await supabase().rpc("search_chat_messages", {
    p_organization_id: organizationId,
    p_query: trimmed,
    p_limit: limit,
  });
  if (error) throw new Error(`Search failed: ${error.message}`);
  return (data ?? []) as ChatPlatformMessageRow[];
}
