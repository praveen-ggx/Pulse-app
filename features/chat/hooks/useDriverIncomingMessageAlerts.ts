/**
 * Detects new trip-chat previews for the driver and surfaces one popup at a
 * time — only when the latest message is from the shipper / commercial side.
 * Uses a local last-seen map (no driver unread column yet).
 */
import { useOptionalDriverChat } from "@/features/chat/contexts/DriverChatContext";
import { isMissionDebriefPreviewText } from "@/features/chat/utils/missionDebrief.util";
import { stripChatPreviewEmojiPrefix } from "@/features/chat/utils/chatAvatar.util";
import {
  baselineDriverChatSeen,
  isDriverChatMessageNewer,
  loadDriverChatSeenMap,
  markDriverChatConversationSeen,
  type DriverChatSeenMap,
} from "@/features/chat/utils/driverIncomingMessageSeen.util";
import {
  fetchLastMessageSenderRoles,
  isDriverOwnChatSender,
  isShipperSideChatSender,
  resolveDriverFacingShipperName,
} from "@/features/chat/utils/driverIncomingShipperMessage.util";
import type {
  MessageSenderRole,
  TripConversation,
} from "@/features/chat/types/chat.types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type DriverIncomingAlert = {
  conversationId: string;
  organizationId: string;
  tripId: string;
  partyName: string;
  partyLogoUrl?: string | null;
  partyAvatarSeed?: string | null;
  routeLabel: string;
  tripNumber: string;
  preview: string;
  at: string;
  unreadInQueue: number;
};

function cleanPreview(raw: string | null | undefined): string {
  const text = stripChatPreviewEmojiPrefix(String(raw ?? "").trim());
  if (!text) return "";
  if (isMissionDebriefPreviewText(text)) return "";
  // Skip pure system / empty placeholders.
  if (/^trip completed/i.test(text)) return "";
  return text;
}

function buildAlert(
  conv: TripConversation,
  unreadInQueue: number,
): DriverIncomingAlert | null {
  const preview = cleanPreview(conv.last_message_preview);
  const at = (conv.last_message_at ?? "").trim();
  if (!preview || !at || !conv.id) return null;
  const pickup = (conv.pickup_area ?? "").trim();
  const drop = (conv.drop_location ?? "").trim();
  const routeLabel =
    pickup && drop ? `${pickup} → ${drop}` : pickup || drop || "Trip chat";
  return {
    conversationId: conv.id,
    organizationId: String(
      conv.trip_organization_id ?? conv.organization_id ?? "",
    ).trim(),
    tripId: String(conv.trip_id ?? "").trim(),
    partyName: resolveDriverFacingShipperName(conv),
    partyLogoUrl: conv.peer_logo_url ?? null,
    partyAvatarSeed: conv.peer_avatar_seed ?? null,
    routeLabel,
    tripNumber: (conv.trip_number ?? "").trim(),
    preview,
    at,
    unreadInQueue,
  };
}

export function useDriverIncomingMessageAlerts() {
  const chat = useOptionalDriverChat();
  const conversations = chat?.conversations ?? [];
  const [seen, setSeen] = useState<DriverChatSeenMap | null>(null);
  const [alert, setAlert] = useState<DriverIncomingAlert | null>(null);
  /** Resolved last-message roles for conversations that looked “new”. */
  const [senderRoles, setSenderRoles] = useState<
    Record<string, MessageSenderRole>
  >({});
  const baselinedRef = useRef(false);
  const dismissedIdsRef = useRef<Set<string>>(new Set());
  const roleFetchKeyRef = useRef("");

  useEffect(() => {
    let cancelled = false;
    void loadDriverChatSeenMap().then((map) => {
      if (!cancelled) setSeen(map);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // First conversation hydrate: baseline so we only alert on *new* mail.
  useEffect(() => {
    if (baselinedRef.current || seen == null) return;
    if (conversations.length === 0) return;
    baselinedRef.current = true;
    void baselineDriverChatSeen(
      conversations.map((c) => ({
        id: c.id,
        last_message_at: c.last_message_at,
      })),
    ).then(setSeen);
  }, [conversations, seen]);

  const candidateConvs = useMemo(() => {
    if (seen == null || !baselinedRef.current) return [] as TripConversation[];
    const rows: TripConversation[] = [];
    for (const conv of conversations) {
      if (dismissedIdsRef.current.has(conv.id)) continue;
      if (!isDriverChatMessageNewer(conv.last_message_at, seen[conv.id])) continue;
      if (!cleanPreview(conv.last_message_preview)) continue;
      // Optimistic / local send — never toast the driver’s own preview.
      if (isDriverOwnChatSender(conv.last_message_sender_role)) continue;
      rows.push(conv);
    }
    rows.sort(
      (a, b) =>
        Date.parse(b.last_message_at ?? "") - Date.parse(a.last_message_at ?? ""),
    );
    return rows;
  }, [conversations, seen]);

  // Resolve sender roles for candidates that don’t already carry one locally.
  useEffect(() => {
    const needsFetch = candidateConvs.filter(
      (c) =>
        !isShipperSideChatSender(c.last_message_sender_role) &&
        !isDriverOwnChatSender(c.last_message_sender_role) &&
        !senderRoles[c.id],
    );
    if (needsFetch.length === 0) return;
    const key = needsFetch
      .map((c) => `${c.id}:${c.last_message_at ?? ""}`)
      .join("|");
    if (key === roleFetchKeyRef.current) return;
    roleFetchKeyRef.current = key;
    let cancelled = false;
    void fetchLastMessageSenderRoles(needsFetch.map((c) => c.id)).then(
      (map) => {
        if (cancelled) return;
        if (map.size === 0) return;
        setSenderRoles((prev) => {
          const next = { ...prev };
          for (const [id, role] of map) next[id] = role;
          return next;
        });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [candidateConvs, senderRoles]);

  // Auto-ack driver/system last messages so they don’t keep re-checking.
  useEffect(() => {
    if (seen == null) return;
    let cancelled = false;
    const ownSide = candidateConvs.filter((c) => {
      const role = c.last_message_sender_role ?? senderRoles[c.id];
      if (!role) return false;
      return isDriverOwnChatSender(role) || !isShipperSideChatSender(role);
    });
    if (ownSide.length === 0) return;
    void (async () => {
      let next = seen;
      for (const conv of ownSide) {
        const at = (conv.last_message_at ?? "").trim();
        if (!at) continue;
        dismissedIdsRef.current.add(conv.id);
        next = await markDriverChatConversationSeen(conv.id, at, next);
      }
      if (!cancelled) setSeen(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [candidateConvs, seen, senderRoles]);

  const pendingAlerts = useMemo(() => {
    const shipperRows = candidateConvs.filter((conv) => {
      const role = conv.last_message_sender_role ?? senderRoles[conv.id];
      return isShipperSideChatSender(role);
    });
    return shipperRows
      .map((conv, index, all) => buildAlert(conv, all.length - index))
      .filter((row): row is DriverIncomingAlert => row != null);
  }, [candidateConvs, senderRoles]);

  /** Conversations parked via “Later” — stay unread, toast hidden until restored. */
  const [snoozedIds, setSnoozedIds] = useState<Set<string>>(() => new Set());
  const [parkedAlert, setParkedAlert] = useState<DriverIncomingAlert | null>(
    null,
  );

  useEffect(() => {
    if (alert) return;
    const next = pendingAlerts.find((row) => !snoozedIds.has(row.conversationId));
    if (next) setAlert(next);
  }, [alert, pendingAlerts, snoozedIds]);

  // Drop park state when the inbound is no longer pending (replied / opened elsewhere).
  useEffect(() => {
    const pendingIds = new Set(pendingAlerts.map((row) => row.conversationId));
    setSnoozedIds((prev) => {
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (pendingIds.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : prev;
    });
    if (parkedAlert && !pendingIds.has(parkedAlert.conversationId)) {
      setParkedAlert(null);
    }
  }, [pendingAlerts, parkedAlert]);

  // Soft poll so home catches messages without an open thread subscription.
  useEffect(() => {
    if (!chat?.refreshConversations) return;
    const tick = () => {
      void chat.refreshConversations();
    };
    const id = setInterval(tick, 20_000);
    return () => clearInterval(id);
  }, [chat]);

  const acknowledge = useCallback(
    async (conversationId: string, at: string) => {
      dismissedIdsRef.current.add(conversationId);
      setSnoozedIds((prev) => {
        if (!prev.has(conversationId)) return prev;
        const next = new Set(prev);
        next.delete(conversationId);
        return next;
      });
      if (parkedAlert?.conversationId === conversationId) {
        setParkedAlert(null);
      }
      const next = await markDriverChatConversationSeen(
        conversationId,
        at,
        seen ?? undefined,
      );
      setSeen(next);
      setAlert(null);
    },
    [parkedAlert, seen],
  );

  /** Full dismiss = mark seen (legacy). Prefer `snooze` for Later. */
  const dismiss = useCallback(() => {
    if (!alert) return;
    void acknowledge(alert.conversationId, alert.at);
  }, [acknowledge, alert]);

  /** Hide toast, keep unread — floating chip can restore it. */
  const snooze = useCallback(() => {
    if (!alert) return;
    const parked = alert;
    setParkedAlert(parked);
    setSnoozedIds((prev) => {
      const next = new Set(prev);
      next.add(parked.conversationId);
      return next;
    });
    setAlert(null);
  }, [alert]);

  /** Re-open the parked toast (newest snoozed if park cleared). */
  const restoreSnoozed = useCallback(() => {
    const target =
      parkedAlert &&
      pendingAlerts.some((row) => row.conversationId === parkedAlert.conversationId)
        ? parkedAlert
        : pendingAlerts.find((row) => snoozedIds.has(row.conversationId)) ??
          null;
    if (!target) return;
    setSnoozedIds((prev) => {
      if (!prev.has(target.conversationId)) return prev;
      const next = new Set(prev);
      next.delete(target.conversationId);
      return next;
    });
    setParkedAlert(null);
    setAlert(target);
  }, [parkedAlert, pendingAlerts, snoozedIds]);

  const snoozedCount = useMemo(() => {
    if (snoozedIds.size === 0) return 0;
    return pendingAlerts.filter((row) => snoozedIds.has(row.conversationId))
      .length;
  }, [pendingAlerts, snoozedIds]);

  return {
    alert,
    unreadTotal: pendingAlerts.length,
    snoozedCount,
    parkedAlert,
    dismiss,
    snooze,
    restoreSnoozed,
    acknowledge,
  };
}
