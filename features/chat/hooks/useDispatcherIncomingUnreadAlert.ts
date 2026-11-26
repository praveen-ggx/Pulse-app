/**
 * Surfaces a compact in-hub toast when a trip lane gains unread while the
 * dispatcher is looking at chat (but not that conversation) — mirrors the
 * driver incoming-message alert without the full reply sheet.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import type { TripConversation } from "@/features/chat/types/chat.types";

export type DispatcherUnreadAlert = {
  conversationId: string;
  tripId: string;
  title: string;
  preview: string;
  unread: number;
  at: string;
};

function routeTitle(c: TripConversation): string {
  const pickup = String(c.pickup_area ?? "").trim();
  const drop = String(c.drop_location ?? "").trim();
  if (pickup && drop) return `${pickup} → ${drop}`;
  return (
    String(c.display_trip_id ?? c.trip_number ?? "").trim() || "Trip chat"
  );
}

export function useDispatcherIncomingUnreadAlert(opts: {
  conversations: TripConversation[];
  selectedConversationId: string | null;
  enabled?: boolean;
}) {
  const { conversations, selectedConversationId, enabled = true } = opts;
  const [alert, setAlert] = useState<DispatcherUnreadAlert | null>(null);
  const prevUnreadRef = useRef<Map<string, number>>(new Map());
  const baselinedRef = useRef(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearAlert = useCallback(() => {
    setAlert(null);
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      clearAlert();
      return;
    }

    const nextMap = new Map<string, number>();
    let newest: DispatcherUnreadAlert | null = null;

    for (const c of conversations) {
      const unread = Math.max(0, Number(c.unread_dispatcher_count ?? 0));
      nextMap.set(c.id, unread);
      if (!baselinedRef.current) continue;
      if (unread <= 0) continue;
      if (c.id === selectedConversationId) continue;
      const prev = prevUnreadRef.current.get(c.id) ?? 0;
      if (unread <= prev) continue;
      const preview = String(c.last_message_preview ?? "").trim() || "New message";
      const at = String(c.last_message_at ?? "").trim() || new Date().toISOString();
      const candidate: DispatcherUnreadAlert = {
        conversationId: c.id,
        tripId: String(c.trip_id ?? ""),
        title: routeTitle(c),
        preview,
        unread,
        at,
      };
      if (!newest || Date.parse(at) >= Date.parse(newest.at)) {
        newest = candidate;
      }
    }

    if (!baselinedRef.current) {
      baselinedRef.current = true;
      prevUnreadRef.current = nextMap;
      return;
    }

    prevUnreadRef.current = nextMap;

    if (newest) {
      setAlert(newest);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      hideTimerRef.current = setTimeout(() => {
        setAlert(null);
        hideTimerRef.current = null;
      }, 6_000);
    }
  }, [conversations, selectedConversationId, enabled, clearAlert]);

  useEffect(() => {
    if (!selectedConversationId) return;
    setAlert((cur) =>
      cur?.conversationId === selectedConversationId ? null : cur,
    );
  }, [selectedConversationId]);

  useEffect(
    () => () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    },
    [],
  );

  return { alert, clearAlert };
}
