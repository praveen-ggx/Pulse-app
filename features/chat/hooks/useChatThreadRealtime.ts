/**
 * Conversation-scoped realtime for one open unified chat thread.
 *
 * Bootstrap model (aligns with driver chat and global TQ config):
 *   1. Bootstrap: getChatMessages RPC fetches the newest page once (staleTime: 60s).
 *   2. Patch: subscribeSharedPostgresChanges upserts each INSERT/UPDATE into the cache.
 *   3. Any Realtime events that arrive before the bootstrap cache is populated are
 *      buffered in a local ref and drained as soon as the query resolves.
 *
 * Only the device with the thread open receives message payloads; everyone else's
 * inbox updates via the cheap `chat_conversations` row stream (useChatInboxQuery).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { queryKeys } from "@/lib/queryKeys";
import { subscribeSharedPostgresChanges } from "@/lib/realtimeRegistry";

import { getChatMessages } from "../services/chatPlatform.service";
import type { ChatPlatformMessageRow } from "../types/chatPlatform.types";

function upsertMessage(
  old: ChatPlatformMessageRow[] | undefined,
  row: ChatPlatformMessageRow,
): ChatPlatformMessageRow[] {
  if (!Array.isArray(old)) {
    // Cache not yet populated (bootstrap in flight) — seed with this event.
    // The bootstrap result will merge via the drain effect below.
    return [row];
  }
  const idx = old.findIndex(
    (m) =>
      m.id === row.id ||
      (row.client_message_id != null &&
        m.client_message_id === row.client_message_id),
  );
  if (idx >= 0) {
    const next = old.slice();
    next[idx] = { ...next[idx], ...row };
    return next;
  }
  return [row, ...old];
}

const TEAM_THREAD_PAGE = 30;

/**
 * Loads the newest message page and keeps it live while the thread is open.
 * Pass `null` to park the hook (no subscription, no query).
 * Older pages load on demand via {@link loadOlder} (WhatsApp-style).
 */
export function useChatThreadRealtime(
  conversationId: string | null,
  organizationId?: string | null,
) {
  const qc = useQueryClient();
  // Buffer Realtime events that fire before the bootstrap cache exists.
  const pendingRef = useRef<ChatPlatformMessageRow[]>([]);
  const olderInFlightRef = useRef(false);
  const [hasMoreOlder, setHasMoreOlder] = useState(true);

  useEffect(() => {
    olderInFlightRef.current = false;
    setHasMoreOlder(true);
  }, [conversationId]);

  const query = useQuery({
    queryKey: queryKeys.chatPlatform.messages(conversationId ?? "_"),
    queryFn: async () => {
      const rows = await getChatMessages(conversationId!, {
        limit: TEAM_THREAD_PAGE,
      });
      setHasMoreOlder(rows.length >= TEAM_THREAD_PAGE);
      return rows;
    },
    enabled: !!conversationId,
    staleTime: 60_000,
    gcTime: 30 * 60_000,
    networkMode: "offlineFirst",
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
  });

  // Drain buffered events once the bootstrap cache is available.
  useEffect(() => {
    if (!conversationId || !query.isSuccess || !pendingRef.current.length) return;
    const pending = pendingRef.current.splice(0);
    for (const row of pending) {
      qc.setQueryData<ChatPlatformMessageRow[]>(
        queryKeys.chatPlatform.messages(conversationId),
        (old) => upsertMessage(old, row),
      );
    }
  }, [conversationId, query.isSuccess, qc]);

  useEffect(() => {
    if (!conversationId) {
      pendingRef.current = [];
      return;
    }
    // Org-scoped channel, conversation filtered client-side. A per-conversation
    // filter opened one server-side subscription per open thread, and Realtime
    // re-evaluates every active subscription's filter on each WAL poll — so poll
    // cost scaled with conversation count, not message volume. When no org id is
    // available yet, fall back to the conversation filter so the thread still works.
    const scopeKey = organizationId
      ? `chat_messages:org:${organizationId}`
      : `chat_messages:conv:${conversationId}`;
    const scopeFilter = organizationId
      ? `organization_id=eq.${organizationId}`
      : `conversation_id=eq.${conversationId}`;
    return subscribeSharedPostgresChanges(
      scopeKey,
      [
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
          filter: scopeFilter,
        },
        {
          event: "UPDATE",
          schema: "public",
          table: "chat_messages",
          filter: scopeFilter,
        },
      ],
      (payload) => {
        const row = payload.new as ChatPlatformMessageRow | null;
        if (!row?.id) return;
        // Shared org channel fans out every conversation — keep only this thread's.
        if (row.conversation_id !== conversationId) return;
        const current = qc.getQueryData<ChatPlatformMessageRow[]>(
          queryKeys.chatPlatform.messages(conversationId),
        );
        if (!Array.isArray(current)) {
          // Bootstrap in flight — buffer for drain.
          pendingRef.current.push(row);
          return;
        }
        qc.setQueryData<ChatPlatformMessageRow[]>(
          queryKeys.chatPlatform.messages(conversationId),
          (old) => upsertMessage(old, row),
        );
      },
    );
  }, [conversationId, organizationId, qc]);

  const loadOlder = useCallback(async () => {
    if (!conversationId || olderInFlightRef.current || !hasMoreOlder) return;
    const current =
      qc.getQueryData<ChatPlatformMessageRow[]>(
        queryKeys.chatPlatform.messages(conversationId),
      ) ?? [];
    if (current.length === 0) return;
    const oldest = [...current].sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    )[0];
    if (!oldest?.created_at) return;

    olderInFlightRef.current = true;
    try {
      const older = await getChatMessages(conversationId, {
        before: oldest.created_at,
        limit: TEAM_THREAD_PAGE,
      });
      setHasMoreOlder(older.length >= TEAM_THREAD_PAGE);
      if (older.length === 0) return;
      qc.setQueryData<ChatPlatformMessageRow[]>(
        queryKeys.chatPlatform.messages(conversationId),
        (prev) => {
          const base = Array.isArray(prev) ? prev : [];
          const byId = new Map(base.map((m) => [m.id, m]));
          for (const row of older) {
            if (!byId.has(row.id)) byId.set(row.id, row);
          }
          return Array.from(byId.values()).sort(
            (a, b) =>
              new Date(b.created_at).getTime() -
              new Date(a.created_at).getTime(),
          );
        },
      );
    } finally {
      olderInFlightRef.current = false;
    }
  }, [conversationId, hasMoreOlder, qc]);

  return {
    ...query,
    loadOlder,
    hasMoreOlder,
    isLoadingOlder: olderInFlightRef.current,
  };
}
