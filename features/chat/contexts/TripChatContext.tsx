import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useOptionalOrganization } from "@/contexts/OrganizationContext";
import { subscribeSharedPostgresChanges } from "@/lib/realtimeRegistry";
import { setTripUnreadCount } from "@/lib/chatUnreadSignal";
import { subscribeTripChatMessagesChanged } from "@/lib/tripChatInvalidate";
import { supabase } from "@/lib/supabase";

import { useActiveTripLaneRealtime } from "../hooks/useActiveTripLaneRealtime";
import { useChatOutboxSync } from "../hooks/useChatOutboxSync";
import { useTripStatusRealtimeSync } from "../hooks/useTripStatusRealtimeSync";
import * as chatService from "../services/chat.service";
import { useConversations, useTotalUnreadCount } from "../store/chatStore";
import {
  clearReadReceiptDebouncerForConversation,
  noteLocalTripSend,
  pruneModuleLevelDedupeState,
  registerMarkMessagesSeenRpc,
  useChatStore,
} from "../store/useChatStore";
import { tripHasPendingOrgFeedback } from "../utils/tripFeedbackPending.util";
import type {
  ConversationPartyType,
  MessageType,
  TripConversation,
  TripMessageRow,
  TripMeta,
} from "../types/chat.types";

export type {
  ConversationPartyType,
  MessageType,
  TripConversation,
  TripMessageRow,
  TripMeta,
};

// ── Quick message templates by party type ────────────────────────────────────

export const QUICK_MESSAGES: Record<ConversationPartyType, string[]> = {
  client: [
    "Your trip has been confirmed. The vehicle is en route.",
    "Driver has departed for pickup.",
    "Pickup completed. Delivery is in progress.",
    "Delivery completed successfully. Please confirm receipt.",
    "Please share the consignee contact details.",
    "We need your approval to proceed.",
  ],
  supplier: [
    "Please confirm driver and vehicle assignment.",
    "Trip has been assigned — driver must report by scheduled time.",
    "Rate confirmed as discussed. Kindly acknowledge.",
    "Please ensure all documents are ready before dispatch.",
    "Driver has been dispatched. Tracking is active.",
    "Kindly update the driver's current location.",
  ],
  driver: [
    "Please confirm your current location.",
    "Proceed to the pickup point immediately.",
    "Loading is authorized. Collect all documents.",
    "Deliver to the consignee and collect POD.",
    "OTP verification required — share your code.",
    "Contact the client at the drop location for directions.",
  ],
};

// ── Context types ─────────────────────────────────────────────────────────────

export interface InitiateConversationParams {
  tripId: string;
  tripNumber: string;
  pickupArea: string;
  dropLocation: string;
  partyType: ConversationPartyType;
  partyName: string;
  partyId: string;
}

export interface InitiateDriverConversationParams {
  tripId: string;
  fleetOrganizationId: string;
  driverId: string;
  driverDisplayName: string;
  tripNumber: string;
  pickupArea: string;
  dropLocation: string;
}

interface TripChatContextType {
  organizationId: string | null;
  conversations: TripConversation[];
  isLoading: boolean;
  sendMessage: (
    conversationId: string,
    content: string,
    messageType?: MessageType,
    replyToId?: string | null,
    replyToPreview?: Record<string, unknown> | null,
  ) => Promise<void>;
  /** Re-attempt a failed optimistic send without creating a second bubble. */
  retryFailedMessage: (conversationId: string, messageId: string) => Promise<void>;
  markAsRead: (conversationId: string) => Promise<void>;
  /** Marks every party-lane thread for this trip read (DB + store). */
  markTripThreadsRead: (tripId: string) => Promise<void>;
  totalUnreadCount: number;
  getTotalUnreadCount: () => number;
  refreshConversations: () => Promise<void>;
  /**
   * Deep-link helper: returns the conversation from the store if present, or
   * fetches it via getTripConversationById and upserts it.
   */
  hydrateConversationById: (conversationId: string) => Promise<TripConversation | null>;
  /** Optimistically changes trip status + notifies all trip conversations via RPC. */
  changeTripStatus: (tripId: string, newStatus: string) => Promise<boolean>;
  initiateConversation: (params: InitiateConversationParams) => Promise<string | null>;
  initiateDriverConversationForTrip: (
    params: InitiateDriverConversationParams
  ) => Promise<string | null>;
  /** Persist the active party type for a trip to the store. */
  switchParty: (tripId: string, partyType: ConversationPartyType) => void;
  /**
   * Read-only: whether the current org still owes an in-chat debrief for this trip
   * (`PartyConv.feedbackStatus` from bootstrap / Realtime — no RPC).
   */
  tripHasPendingFeedback: (tripId: string) => boolean;
}

const TripChatContext = createContext<TripChatContextType | undefined>(undefined);

export function useOptionalTripChat() {
  return useContext(TripChatContext);
}

export function useTripChat() {
  const ctx = useOptionalTripChat();
  if (!ctx) throw new Error("useTripChat must be used within a TripChatProvider");
  return ctx;
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function TripChatProvider({
  children,
  isActive = true,
}: {
  children: ReactNode;
  isActive?: boolean;
}) {
  const { profile } = useAuth();
  const selfUid = profile?.uid ?? null;
  const orgCtx = useOptionalOrganization();
  const organizationId = orgCtx?.currentOrganization?.id ?? null;

  // Offline-first: replay queued unified-platform sends on reconnect/foreground.
  useChatOutboxSync(!!selfUid);

  // ── State from Zustand ────────────────────────────────────────────────────
  const conversations    = useConversations();
  const totalUnreadCount = useTotalUnreadCount();
  const isLoading        = useChatStore(s => s.isLoading);

  // Collect host-org IDs where the viewer is a linked supplier/client.
  // These are orgs whose conversations appear in the store but belong to a
  // different org than the viewer's own org (e.g. Deepak's org for nihas).
  const linkedOrgIdsStr = useChatStore(s => {
    if (!organizationId) return '';
    const ids = new Set<string>();
    for (const entry of Object.values(s.trips)) {
      for (const party of Object.values(entry.parties)) {
        const orgId = party?.organizationId;
        if (orgId && orgId !== organizationId) ids.add(orgId);
      }
    }
    return [...ids].sort().join(',');
  });
  const linkedOrgIds = useMemo(
    () => (linkedOrgIdsStr ? linkedOrgIdsStr.split(',').filter(Boolean) : []),
    [linkedOrgIdsStr],
  );

  // Phase 3: trip row UPDATE → hub status patch (no status_change message fan-out).
  useTripStatusRealtimeSync(organizationId, linkedOrgIds);

  // Phase 3: open-thread INSERT only (conversation-scoped, not org-wide).
  useActiveTripLaneRealtime(organizationId, selfUid, isActive);

  const bootstrappedOrgRef = useRef<string | null>(null);
  const isActiveRef = useRef(isActive);
  isActiveRef.current = isActive;
  // Batch `trip_messages` UPDATE (read/delivery ticks) into one store write per frame
  // so bursty mark_messages_seen / Realtime does not max React update depth.
  const ackBatchRef = useRef<{ convId: string; msgId: string; patch: Partial<TripMessageRow> }[]>([]);
  const ackRafRef = useRef<number | null>(null);
  const flushAckBatch = useCallback(() => {
    ackRafRef.current = null;
    const batch = ackBatchRef.current;
    ackBatchRef.current = [];
    if (batch.length === 0) return;
    useChatStore.getState().onRealtimeAckBatch(batch);
  }, []);

  // ── Bootstrap: single RPC, populates Zustand store ───────────────────────
  const loadConversations = useCallback(async () => {
    if (!organizationId || !selfUid) return;
    await useChatStore.getState().bootstrap(organizationId);
  }, [organizationId, selfUid]);

  // Clear store on logout / org switch.
  useEffect(() => {
    if (organizationId && selfUid) return;
    useChatStore.getState().clear();
    bootstrappedOrgRef.current = null;
  }, [organizationId, selfUid]);

  // Initial bootstrap: once per org.
  useEffect(() => {
    if (!organizationId || !selfUid) return;
    if (bootstrappedOrgRef.current === organizationId) return;
    bootstrappedOrgRef.current = organizationId;
    void loadConversations();
  }, [organizationId, selfUid, loadConversations]);

  // Chat bootstrap is once per org-session (`useChatStore.bootstrap` no-ops when
  // `bootstrappedOrg` matches). Updates arrive via Realtime — no periodic full
  // refetch (reduces DB load; matches WhatsApp-style cold load + patch).

  // Bridge / ledger notify when Realtime publication lags — soft refresh open org.
  useEffect(() => {
    if (!organizationId || !selfUid) return;
    return subscribeTripChatMessagesChanged(() => {
      bootstrappedOrgRef.current = null;
      useChatStore.setState({ bootstrappedOrg: null });
      void loadConversations();
    });
  }, [organizationId, selfUid, loadConversations]);

  // Single mark-seen RPC path for all `useMarkSeen` instances (debounced in store).
  useEffect(() => {
    registerMarkMessagesSeenRpc((conversationId, messageIds) => {
      // Defense-in-depth: never send non-UUID sentinel ids (e.g. divider rows
      // like "__date__…") to the RPC — they cause 22P02 → 400.
      const ids = messageIds.filter(
        (id) => typeof id === "string" && !id.startsWith("__"),
      );
      if (ids.length === 0) return;
      void supabase()
        .rpc("mark_messages_seen", {
          p_conversation_id: conversationId,
          p_message_ids: ids,
        })
        .then(({ error }) => {
          if (error && __DEV__) console.warn("[mark_messages_seen]", error.message);
        });
    });
    return () => registerMarkMessagesSeenRpc(null);
  }, []);

  // ── Realtime: read-receipt UPDATEs (org-wide — lightweight row patches) ───
  // Phase 3: INSERT removed — hub preview/unread via `trip_conversations` rows;
  // open thread INSERT via `useActiveTripLaneRealtime` (conversation-scoped).
  useEffect(() => {
    if (!organizationId || !selfUid) return;
    const unsub = subscribeSharedPostgresChanges(
      `trip_messages:acks:org:${organizationId}`,
      [
        {
          event:  "UPDATE",
          schema: "public",
          table:  "trip_messages",
          filter: `organization_id=eq.${organizationId}`,
        },
      ],
      (payload) => {
        if (payload.eventType === "UPDATE") {
          const row = payload.new as TripMessageRow | null;
          if (!row?.id || !row.conversation_id) return;
          const patch: Partial<TripMessageRow> = {
            is_delivered: row.is_delivered,
            delivered_at: row.delivered_at,
            is_read:      row.is_read,
            read_at:      row.read_at,
          };
          if (row.metadata != null) patch.metadata = row.metadata;
          if (row.reactions != null) patch.reactions = row.reactions;
          if (row.edited_at != null) patch.edited_at = row.edited_at;
          if (row.content != null) patch.content = row.content;
          if (row.is_deleted != null) patch.is_deleted = row.is_deleted;
          ackBatchRef.current.push({
            convId: row.conversation_id,
            msgId:  row.id,
            patch,
          });
          if (ackRafRef.current == null) {
            ackRafRef.current = requestAnimationFrame(() => {
              flushAckBatch();
            });
          }
        }
      }
    );
    return () => {
      if (ackRafRef.current != null) {
        cancelAnimationFrame(ackRafRef.current);
        ackRafRef.current = null;
      }
      const pending = ackBatchRef.current;
      ackBatchRef.current = [];
      if (pending.length) useChatStore.getState().onRealtimeAckBatch(pending);
      unsub();
    };
  }, [organizationId, selfUid, flushAckBatch]);

  // ── Realtime: trip_conversations (DB denormalized unread + last preview) ─────
  useEffect(() => {
    if (!organizationId || !selfUid) return;
    const unsub = subscribeSharedPostgresChanges(
      `trip_conversations:org:${organizationId}`,
      [
        {
          event: "INSERT",
          schema: "public",
          table: "trip_conversations",
          filter: `organization_id=eq.${organizationId}`,
        },
        {
          event: "UPDATE",
          schema: "public",
          table: "trip_conversations",
          filter: `organization_id=eq.${organizationId}`,
        },
      ],
      (payload) => {
        const row = payload.new as Record<string, unknown> | null;
        if (!row?.id || !row.trip_id) return;
        const tripId = String(row.trip_id);
        const convId = String(row.id);

        if (payload.eventType === "INSERT") {
          const trips = useChatStore.getState().trips;
          if (!trips[tripId]) {
            void chatService.getTripConversationById(convId).then((conv) => {
              if (conv) useChatStore.getState().upsertConversation(conv);
            });
            return;
          }
        }

        useChatStore.getState().patchTripConversationFromRealtime(row);
      },
    );
    return () => {
      unsub();
    };
  }, [organizationId, selfUid]);

  // ── Linked-org read-receipt UPDATEs (INSERT → active lane subscription) ─────
  useEffect(() => {
    if (!organizationId || !selfUid || linkedOrgIds.length === 0) return;
    // One channel for ALL linked orgs via `in.(...)` — previously this opened one
    // server-side subscription per linked org, and Realtime re-evaluates every
    // subscription's filter on each WAL poll, so the poll cost scaled with the
    // number of linked orgs regardless of message volume.
    const unsubs = [
      subscribeSharedPostgresChanges(
        `trip_messages:acks:linked:for:${organizationId}`,
        [
          {
            event:  "UPDATE",
            schema: "public",
            table:  "trip_messages",
            filter: `organization_id=in.(${linkedOrgIds.join(',')})`,
          },
        ],
        (payload) => {
          if (payload.eventType !== "UPDATE") return;
          const row = payload.new as TripMessageRow | null;
          if (!row?.id || !row.conversation_id) return;
          const patch: Partial<TripMessageRow> = {
            is_delivered: row.is_delivered,
            delivered_at: row.delivered_at,
            is_read:      row.is_read,
            read_at:      row.read_at,
          };
          if (row.metadata != null) patch.metadata = row.metadata;
          if (row.reactions != null) patch.reactions = row.reactions;
          if (row.edited_at != null) patch.edited_at = row.edited_at;
          if (row.content != null) patch.content = row.content;
          if (row.is_deleted != null) patch.is_deleted = row.is_deleted;
          ackBatchRef.current.push({ convId: row.conversation_id, msgId: row.id, patch });
          if (ackRafRef.current == null) {
            ackRafRef.current = requestAnimationFrame(() => { flushAckBatch(); });
          }
        },
      ),
    ];
    return () => { unsubs.forEach(u => u()); };
  }, [organizationId, selfUid, linkedOrgIds, flushAckBatch]);

  // ── Prune module-level dedupe Maps (prevent unbounded growth in long sessions) ─
  useEffect(() => {
    const id = setInterval(pruneModuleLevelDedupeState, 30_000);
    return () => clearInterval(id);
  }, []);

  // ── sendMessage: optimistic + persist + rollback ───────────────────────────
  const sendMessage = useCallback(
    async (
      conversationId: string,
      content: string,
      messageType: MessageType = "text",
      replyToId: string | null = null,
      replyToPreview: Record<string, unknown> | null = null,
    ) => {
      if (!organizationId || !profile) return;

      const conv         = useChatStore.getState().getConversationByConvId(conversationId);
      const messageOrgId = conv?.organization_id ?? organizationId;
      const senderRole: TripMessageRow["sender_role"] = "dispatcher";
      const senderName =
        profile.full_name ||
        profile.displayName ||
        "Dispatcher";

      const optimisticId = `optimistic-${Date.now()}`;
      const optimisticMsg: TripMessageRow = {
        id:              optimisticId,
        client_key:      optimisticId,
        conversation_id: conversationId,
        organization_id: messageOrgId,
        sender_user_id:  profile.uid ?? null,
        sender_role:     senderRole,
        sender_name:     senderName,
        content,
        message_type:    messageType,
        is_read:         false,
        read_at:         null,
        delivery_status: "sending",
        created_at:      new Date().toISOString(),
        ...(replyToId ? { reply_to_id: replyToId, reply_to_preview: replyToPreview } : {}),
      } as TripMessageRow;

      useChatStore.getState().optimisticInsert(conversationId, optimisticMsg);
      // Prevent denorm UPDATE → heal refetch while send is in flight / settling.
      noteLocalTripSend(conversationId);

      try {
        const persisted = await chatService.sendChatMessage({
          conversationId,
          organizationId,
          content,
          senderRole,
          senderName,
          senderUserId: profile.uid ?? null,
          messageType,
          replyToId,
          replyToPreview,
        });
        useChatStore.getState().replaceOptimistic(conversationId, optimisticMsg.id, persisted);
        noteLocalTripSend(conversationId);
      } catch {
        // Keep the bubble so the user can retry — never silently discard.
        useChatStore.getState().markMessageFailed(conversationId, optimisticMsg.id);
      }
    },
    [organizationId, profile]
  );

  const retryFailedMessage = useCallback(
    async (conversationId: string, messageId: string) => {
      if (!organizationId || !profile) return;
      const conv = useChatStore.getState().getConversationByConvId(conversationId);
      if (!conv) return;
      const msg = conv.messages.find((m) => m.id === messageId);
      if (!msg || msg.delivery_status !== "failed") return;

      useChatStore.getState().patchMessage(conversationId, messageId, {
        delivery_status: "sending",
      });
      noteLocalTripSend(conversationId);

      try {
        const persisted = await chatService.sendChatMessage({
          conversationId,
          organizationId,
          content: msg.content,
          senderRole: "dispatcher",
          senderName: msg.sender_name,
          senderUserId: profile.uid ?? null,
          messageType: msg.message_type ?? "text",
          replyToId: msg.reply_to_id ?? null,
          replyToPreview: (msg.reply_to_preview as Record<string, unknown> | null) ?? null,
        });
        useChatStore.getState().replaceOptimistic(conversationId, messageId, persisted);
        noteLocalTripSend(conversationId);
      } catch {
        useChatStore.getState().markMessageFailed(conversationId, messageId);
      }
    },
    [organizationId, profile],
  );

  // ── changeTripStatus: optimistic + atomic RPC + rollback ──────────────────
  const changeTripStatus = useCallback(
    async (tripId: string, newStatus: string): Promise<boolean> => {
      if (!organizationId || !profile) return false;

      const prevStatus = useChatStore.getState().trips[tripId]?.status ?? null;

      // Optimistic: update trip status in the store immediately.
      useChatStore.getState().applySystemUpdate(tripId, { status: newStatus });

      try {
        await chatService.changeTripStatus({
          tripId,
          organizationId,
          newStatus,
          userId:   profile.uid ?? null,
          userName: profile.full_name || profile.displayName || "Dispatcher",
        });
        return true;
      } catch {
        // Rollback on failure.
        useChatStore.getState().applySystemUpdate(tripId, { status: prevStatus });
        return false;
      }
    },
    [organizationId, profile]
  );

  // ── markAsRead / markTripThreadsRead ───────────────────────────────────────
  const markAsRead = useCallback(async (conversationId: string) => {
    clearReadReceiptDebouncerForConversation(conversationId);
    useChatStore.getState().markRead(conversationId);
    try {
      await chatService.markConversationRead(conversationId);
    } catch (e) {
      if (__DEV__) console.warn("[TripChat] markConversationRead failed", conversationId, e);
    }
  }, []);

  const markTripThreadsRead = useCallback(async (tripId: string) => {
    const tid = (tripId ?? "").trim();
    if (!tid) return;
    const { trips, convToTrip, convToParty } = useChatStore.getState();
    const convIds = Object.keys(convToTrip).filter((cid) => convToTrip[cid] === tid);
    if (convIds.length === 0) {
      if (__DEV__) console.warn("[TripChat] markTripThreadsRead: no conv ids for trip", tid);
      return;
    }

    // Only hit the DB for lanes that still have unread — opening a trip used to
    // Promise.all mark_conversation_read across every lane (often 3+) even when
    // unread was already 0. That RPC was timing out (API 504s) and starving chat.
    const toMark = convIds.filter((cid) => {
      const partyType = convToParty[cid];
      if (!partyType) return false;
      const unread = trips[tid]?.parties[partyType]?.unreadCount ?? 0;
      return unread > 0;
    });

    for (const cid of convIds) {
      clearReadReceiptDebouncerForConversation(cid);
      useChatStore.getState().markRead(cid);
    }

    // Serialize — never fan out parallel UPDATEs for the same trip open.
    for (const cid of toMark) {
      try {
        await chatService.markConversationRead(cid);
      } catch (e) {
        if (__DEV__) console.warn("[TripChat] markConversationRead failed", cid, e);
      }
    }
  }, []);

  // ── hydrateConversationById (deep-link fallback) ───────────────────────────
  const hydrateConversationById = useCallback(
    async (conversationId: string): Promise<TripConversation | null> => {
      const existing = useChatStore.getState().getConversationByConvId(conversationId);
      if (existing) return existing;
      try {
        const conv = await chatService.getTripConversationById(conversationId);
        if (conv) {
          useChatStore.getState().upsertConversation(conv);
          return useChatStore.getState().getConversationByConvId(conversationId) ?? null;
        }
      } catch { /* silent */ }
      return null;
    },
    []
  );

  // ── Conversation management ────────────────────────────────────────────────
  const getTotalUnreadCount = useCallback(() => totalUnreadCount, [totalUnreadCount]);

  // Publish to the lightweight external signal so consumers like DemoTabBar
  // can subscribe without statically importing this context (keeps the chat
  // graph out of the startup chunk).
  useEffect(() => {
    setTripUnreadCount(totalUnreadCount);
  }, [totalUnreadCount]);

  const initiateConversation = useCallback(
    async (params: InitiateConversationParams): Promise<string | null> => {
      if (!organizationId) return null;
      try {
        const conv = await chatService.getOrCreateConversation({
          tripId:         params.tripId,
          partyType:      params.partyType,
          partyName:      params.partyName,
          organizationId,
          partyId:        params.partyId,
        });
        useChatStore.getState().upsertConversation({
          ...conv,
          trip_number:   params.tripNumber,
          pickup_area:   params.pickupArea,
          drop_location: params.dropLocation,
          messages:      [],
        } as TripConversation);
        return conv.id;
      } catch {
        return null;
      }
    },
    [organizationId]
  );

  const initiateDriverConversationForTrip = useCallback(
    async (params: InitiateDriverConversationParams): Promise<string | null> => {
      const fleetOrg = params.fleetOrganizationId?.trim();
      const driverId = params.driverId?.trim();
      if (!fleetOrg || !driverId) return null;
      try {
        const conv = await chatService.getOrCreateConversation({
          tripId:         params.tripId,
          partyType:      "driver",
          partyName:      params.driverDisplayName.trim() || "Driver",
          organizationId: fleetOrg,
          partyId:        driverId,
        });
        useChatStore.getState().upsertConversation({
          ...conv,
          trip_number:   params.tripNumber,
          pickup_area:   params.pickupArea,
          drop_location: params.dropLocation,
          messages:      [],
        } as TripConversation);
        return conv.id;
      } catch {
        return null;
      }
    },
    []
  );

  const switchParty = useCallback(
    (tripId: string, partyType: ConversationPartyType) => {
      useChatStore.getState().switchParty(tripId, partyType);
    },
    [],
  );

  const tripHasPendingFeedback = useCallback(
    (tripId: string) => {
      if (!organizationId) return false;
      return tripHasPendingOrgFeedback(useChatStore.getState().trips, tripId, organizationId);
    },
    [organizationId],
  );

  const contextValue = useMemo(
    (): TripChatContextType => ({
      organizationId,
      conversations,
      isLoading,
      sendMessage,
      retryFailedMessage,
      markAsRead,
      markTripThreadsRead,
      totalUnreadCount,
      getTotalUnreadCount,
      refreshConversations: loadConversations,
      hydrateConversationById,
      changeTripStatus,
      initiateConversation,
      initiateDriverConversationForTrip,
      switchParty,
      tripHasPendingFeedback,
    }),
    [
      organizationId,
      conversations,
      isLoading,
      sendMessage,
      retryFailedMessage,
      markAsRead,
      markTripThreadsRead,
      totalUnreadCount,
      getTotalUnreadCount,
      loadConversations,
      hydrateConversationById,
      changeTripStatus,
      initiateConversation,
      initiateDriverConversationForTrip,
      switchParty,
      tripHasPendingFeedback,
    ],
  );

  return (
    <TripChatContext.Provider value={contextValue}>
      {children}
    </TripChatContext.Provider>
  );
}
