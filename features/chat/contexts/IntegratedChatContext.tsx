import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useOptionalOrganization } from "@/contexts/OrganizationContext";
import { subscribeSharedPostgresChanges } from "@/lib/realtimeRegistry";
import { setNetworkUnreadCount } from "@/lib/chatUnreadSignal";
import { networkMetadataToReplyPreview } from "@/features/network/utils/storyReplyPreview.util";
import * as chatService from "../services/chat.service";
import {
  loadNetworkChatBootstrap,
  persistNetworkChatBootstrap,
} from "../persist/networkChatBootstrapPersist";
import type {
  NetworkConversation,
  NetworkConversationRow,
  NetworkMessageRow,
  NetworkPartner,
} from "../types/chat.types";

export type { NetworkConversation, NetworkPartner };

// ── Backward-compatible shape for ChatScreen ──────────────────────────────────

export interface DirectMessage {
  id: string;
  senderId: string;
  content: string;
  timestamp: string;
  isRead: boolean;
  /** WhatsApp-style quoted preview (e.g. replied-to story). */
  replyPreview?: {
    messageId: string;
    senderName: string;
    content: string;
    messageType?: string | null;
  } | null;
}

export interface IntegratedChat {
  id: string;
  partnerId: string;
  partnerName: string;
  partnerPartyType?: "client" | "supplier";
  partnerLogoUrl?: string | null;
  partnerAvatarSeed?: string | null;
  partnerRole: "dispatcher" | "owner";
  organization: string;
  isOnline: boolean;
  messages: DirectMessage[];
  lastActivity: string;
  unreadCount: number;
}

export const INTEGRATED_QUICK_MESSAGES = [
  "Do you have availability this week?",
  "What vehicles do you have free?",
  "Can we discuss rates?",
  "Please share your updated rate card.",
  "I have a new requirement.",
  "Let's schedule a call.",
];

// ── Context type ──────────────────────────────────────────────────────────────

interface IntegratedChatContextType {
  chats: IntegratedChat[];
  partners: NetworkPartner[];
  isLoading: boolean;
  sendMessage: (chatId: string, content: string, viewerRole: "dispatcher" | "owner") => void;
  markAsRead: (chatId: string) => void;
  getUnreadCount: (chatId: string) => number;
  getTotalUnreadCount: () => number;
  initiateNetworkConversation: (partner: NetworkPartner) => Promise<string | null>;
  /** Load the newest page of DM history (replaces bootstrap slice). */
  hydrateNetworkThread: (chatId: string) => Promise<void>;
  /** Keyset page of older messages — prepends when more history exists. */
  loadOlderNetworkMessages: (chatId: string) => Promise<boolean>;
  networkThreadHasMore: (chatId: string) => boolean;
  /** Open DM thread id — enables conversation-scoped network_messages realtime. */
  setActiveNetworkConversationId: (chatId: string | null) => void;
}

const IntegratedChatContext = createContext<IntegratedChatContextType | undefined>(undefined);

export function useOptionalIntegratedChat() {
  return useContext(IntegratedChatContext);
}

export function useIntegratedChat() {
  const ctx = useOptionalIntegratedChat();
  if (!ctx) throw new Error("useIntegratedChat must be used within an IntegratedChatProvider");
  return ctx;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatRelativeTime(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours > 1 ? "s" : ""} ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "Yesterday" : `${days} days ago`;
}

/** Org-scoped Realtime specs — avoids full-table WAL on network_messages (no receiver column). */
function networkConversationsOrgSpecs(orgId: string) {
  return [
    {
      event: "INSERT" as const,
      schema: "public",
      table: "network_conversations",
      filter: `org_a_id=eq.${orgId}`,
    },
    {
      event: "INSERT" as const,
      schema: "public",
      table: "network_conversations",
      filter: `org_b_id=eq.${orgId}`,
    },
    {
      event: "UPDATE" as const,
      schema: "public",
      table: "network_conversations",
      filter: `org_a_id=eq.${orgId}`,
    },
    {
      event: "UPDATE" as const,
      schema: "public",
      table: "network_conversations",
      filter: `org_b_id=eq.${orgId}`,
    },
  ];
}

function toIntegratedChat(
  conv: NetworkConversation,
  currentOrgId: string,
  partners: NetworkPartner[],
): IntegratedChat {
  const partnerPartyType = partners.find((p) => p.org_id === conv.partner_org_id)?.party_type;
  return {
    id: conv.id,
    partnerId: conv.partner_org_id,
    partnerName: conv.partner_name,
    partnerPartyType,
    partnerLogoUrl: conv.partner_logo_url ?? null,
    partnerAvatarSeed: conv.partner_avatar_seed ?? null,
    partnerRole: "owner",
    organization: conv.partner_name,
    isOnline: false,
    messages: (conv.messages ?? []).map((m) => ({
      id: m.id,
      senderId: m.sender_org_id === currentOrgId ? "dispatcher-1" : "partner-1",
      content: m.content,
      timestamp: m.created_at,
      isRead: m.is_read_by_other,
      replyPreview: networkMetadataToReplyPreview(m.metadata),
    })),
    lastActivity: conv.last_message_at ? formatRelativeTime(conv.last_message_at) : "No messages",
    unreadCount: conv.unread_count,
  };
}

/** Keep in-flight optimistic bubbles when a server page would otherwise wipe them. */
function mergeNetworkMessagesPreservingOptimistic(
  local: NetworkMessageRow[],
  incoming: NetworkMessageRow[],
): NetworkMessageRow[] {
  const optimistic = local.filter((m) => String(m.id).startsWith("optimistic-"));
  if (optimistic.length === 0) {
    return [...incoming].sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );
  }
  const kept = optimistic.filter((o) => {
    const oTs = new Date(o.created_at).getTime();
    return !incoming.some(
      (p) =>
        p.sender_org_id === o.sender_org_id &&
        p.content === o.content &&
        Math.abs(new Date(p.created_at).getTime() - oTs) < 60_000,
    );
  });
  return [...incoming, ...kept].sort(
    (a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
}

/** Upsert one live message into a conversation (receiver path + own echo). */
function upsertNetworkMessageInConversation(
  conv: NetworkConversation,
  row: NetworkMessageRow,
): NetworkConversation {
  const withoutOptimisticMatch = conv.messages.filter((m) => {
    if (!String(m.id).startsWith("optimistic-")) return true;
    const mTs = new Date(m.created_at).getTime();
    const rTs = new Date(row.created_at).getTime();
    return !(
      m.sender_org_id === row.sender_org_id &&
      m.content === row.content &&
      Math.abs(mTs - rTs) < 60_000
    );
  });
  const idx = withoutOptimisticMatch.findIndex((m) => m.id === row.id);
  let messages: NetworkMessageRow[];
  if (idx >= 0) {
    messages = withoutOptimisticMatch.slice();
    messages[idx] = { ...messages[idx], ...row };
  } else {
    messages = [...withoutOptimisticMatch, row].sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );
  }
  return {
    ...conv,
    messages,
    last_message_at: row.created_at,
    last_message_preview: row.content.slice(0, 120),
  };
}

// ── Shared bootstrap fetch (cross-instance dedupe) ────────────────────────────

/**
 * `IntegratedChatProvider` is mounted more than once at a time (app-wide via
 * `LazyChatProviders`, and again inside `NetworkDesktopChatFlexPanel`), and
 * `bootstrappedOrgRef` below is local per instance — so two instances for the
 * same org could each independently call `getNetworkConversationsByOrg` +
 * `getIntegratedPartners`. Dedupe at the fetch-execution level instead, keyed
 * by org and shared module-wide, regardless of which instance/effect
 * triggers it — the same class of fix already applied to useChatStore's
 * TripChat bootstrap (2026-09-16) for the identical "multiple mounted
 * providers race the same bootstrap RPC" bug. A second, concurrent caller
 * joins the in-flight fetch; a caller shortly after joins the cached result
 * instead of re-fetching. Each instance still applies the result to its own
 * local state, so per-instance behavior (optimistic-message merge, loading
 * state) is unchanged.
 */
const networkChatFetchInFlight = new Map<
  string,
  Promise<{ conversations: NetworkConversation[]; partners: NetworkPartner[] }>
>();
const networkInboxFetchInFlight = new Map<string, Promise<NetworkConversation[]>>();
const networkChatFetchCache = new Map<
  string,
  { conversations: NetworkConversation[]; partners: NetworkPartner[]; fetchedAt: number }
>();
/** Matches the existing per-instance active-tab refresh staleness window below. */
const NETWORK_CHAT_FETCH_STALE_MS = 5 * 60_000;

/** Test-only: clears the shared bootstrap cache/in-flight state between tests. */
export function __resetNetworkChatBootstrapForTests(): void {
  networkChatFetchInFlight.clear();
  networkInboxFetchInFlight.clear();
  networkChatFetchCache.clear();
}

async function fetchNetworkChatInboxShared(orgId: string): Promise<NetworkConversation[]> {
  const cached = networkChatFetchCache.get(orgId);
  if (cached && Date.now() - cached.fetchedAt < NETWORK_CHAT_FETCH_STALE_MS) {
    return cached.conversations;
  }
  const inFlight = networkInboxFetchInFlight.get(orgId);
  if (inFlight) return inFlight;
  const promise = chatService.getNetworkConversationsByOrg(orgId);
  networkInboxFetchInFlight.set(orgId, promise);
  try {
    return await promise;
  } finally {
    networkInboxFetchInFlight.delete(orgId);
  }
}

async function fetchNetworkChatBootstrapShared(
  orgId: string,
  inbox?: NetworkConversation[],
): Promise<{ conversations: NetworkConversation[]; partners: NetworkPartner[] }> {
  const cached = networkChatFetchCache.get(orgId);
  if (cached && Date.now() - cached.fetchedAt < NETWORK_CHAT_FETCH_STALE_MS) {
    return { conversations: cached.conversations, partners: cached.partners };
  }
  const inFlight = networkChatFetchInFlight.get(orgId);
  if (inFlight) return inFlight;

  const promise = (async () => {
    const conversations = inbox ?? (await fetchNetworkChatInboxShared(orgId));
    const [branded, partners] = await Promise.all([
      chatService.enrichNetworkConversationsWithPartnerBranding(conversations),
      chatService.getIntegratedPartners(orgId),
    ]);
    networkChatFetchCache.set(orgId, {
      conversations: branded,
      partners,
      fetchedAt: Date.now(),
    });
    return { conversations: branded, partners };
  })();
  networkChatFetchInFlight.set(orgId, promise);
  try {
    return await promise;
  } finally {
    networkChatFetchInFlight.delete(orgId);
  }
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function IntegratedChatProvider({
  children,
  isActive = true,
}: {
  children: ReactNode;
  isActive?: boolean;
}) {
  const { profile, status } = useAuth();
  const selfUid = profile?.uid ?? null;
  const sessionReady = status === "authenticated";
  const org = useOptionalOrganization();
  const currentOrganization = org?.currentOrganization ?? null;
  const orgId = currentOrganization?.id ?? null;
  const orgName = currentOrganization?.name ?? "My Organization";

  const [conversations, setConversations] = useState<NetworkConversation[]>([]);
  const [partners, setPartners] = useState<NetworkPartner[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const loadDataRef = useRef<() => Promise<void>>(async () => {});
  const refreshDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const missingNetConvRefreshAtRef = useRef<Record<string, number>>({});
  const networkHasMoreRef = useRef<Record<string, boolean>>({});
  const networkHydrateInFlightRef = useRef<Record<string, boolean>>({});
  const networkOlderInFlightRef = useRef<Record<string, boolean>>({});
  const bootstrappedOrgRef = useRef<string | null>(null);
  const lastFetchedAtRef = useRef<number>(0);
  const [activeNetworkConversationId, setActiveNetworkConversationId] = useState<
    string | null
  >(null);
  const pullMessagesDebounceRef = useRef<
    Record<string, ReturnType<typeof setTimeout> | null>
  >({});
  const pullMessagesInFlightRef = useRef<Record<string, boolean>>({});
  const pullMessagesNeedsRerunRef = useRef<Record<string, boolean>>({});
  const conversationsRef = useRef<NetworkConversation[]>([]);
  const activeNetworkConversationIdRef = useRef<string | null>(null);
  activeNetworkConversationIdRef.current = activeNetworkConversationId;
  conversationsRef.current = conversations;

  const applyIncomingNetworkMessage = useCallback((row: NetworkMessageRow) => {
    if (!row?.id || !row.conversation_id) return;
    setConversations((prev) =>
      prev.map((conv) =>
        conv.id === row.conversation_id
          ? upsertNetworkMessageInConversation(conv, row)
          : conv,
      ),
    );
  }, []);

  const queuePullLatestNetworkMessages = useCallback((convId: string) => {
    if (!convId) return;
    const existing = pullMessagesDebounceRef.current[convId];
    if (existing) clearTimeout(existing);
    pullMessagesDebounceRef.current[convId] = setTimeout(() => {
      pullMessagesDebounceRef.current[convId] = null;
      const isActive = convId === activeNetworkConversationIdRef.current;
      const cached = conversationsRef.current.find((c) => c.id === convId);
      const hasCachedMessages = (cached?.messages?.length ?? 0) > 0;
      // Skip cold inbox rows — preview/unread already patched; body loads on open.
      if (!isActive && !hasCachedMessages) return;

      if (pullMessagesInFlightRef.current[convId]) {
        pullMessagesNeedsRerunRef.current[convId] = true;
        return;
      }
      pullMessagesInFlightRef.current[convId] = true;
      void chatService
        .getNetworkMessagesByConversation(convId, {
          limit: chatService.NETWORK_CHAT_HISTORY_PAGE,
        })
        .then((rows) => {
          setConversations((prev) =>
            prev.map((conv) =>
              conv.id === convId
                ? {
                    ...conv,
                    messages: mergeNetworkMessagesPreservingOptimistic(
                      conv.messages,
                      rows,
                    ),
                  }
                : conv,
            ),
          );
        })
        .catch(() => {
          // non-critical — preview metadata already patched
        })
        .finally(() => {
          pullMessagesInFlightRef.current[convId] = false;
          if (pullMessagesNeedsRerunRef.current[convId]) {
            pullMessagesNeedsRerunRef.current[convId] = false;
            queuePullLatestNetworkMessages(convId);
          }
        });
    }, 180);
  }, []);

  const applyConversations = useCallback((convs: NetworkConversation[]) => {
    setConversations((prev) => {
      const prevById = new Map(prev.map((c) => [c.id, c]));
      return convs.map((c) => {
        const local = prevById.get(c.id);
        if (!local?.messages?.length) return c;
        return {
          ...c,
          messages: mergeNetworkMessagesPreservingOptimistic(
            local.messages,
            c.messages ?? [],
          ),
        };
      });
    });
  }, []);

  const loadData = useCallback(async () => {
    if (!orgId || !selfUid || !sessionReady) return;
    const memory = networkChatFetchCache.get(orgId);
    if (memory && Date.now() - memory.fetchedAt < NETWORK_CHAT_FETCH_STALE_MS) {
      applyConversations(memory.conversations);
      setPartners(memory.partners);
      setIsLoading(false);
      lastFetchedAtRef.current = memory.fetchedAt;
      return;
    }

    if (conversationsRef.current.length === 0) {
      const disk = await loadNetworkChatBootstrap(orgId);
      if (disk) {
        applyConversations(disk.conversations);
        setPartners(disk.partners);
        setIsLoading(false);
      } else {
        setIsLoading(true);
      }
    }

    try {
      const inbox = await fetchNetworkChatInboxShared(orgId);
      applyConversations(inbox);
      setIsLoading(false);
      const { conversations: convs, partners: pts } =
        await fetchNetworkChatBootstrapShared(orgId, inbox);
      applyConversations(convs);
      setPartners(pts);
      lastFetchedAtRef.current = Date.now();
      void persistNetworkChatBootstrap(orgId, convs, pts);
    } catch {
      // Fail silently — tables may not be migrated yet
    } finally {
      setIsLoading(false);
    }
  }, [orgId, selfUid, sessionReady, applyConversations]);
  loadDataRef.current = loadData;

  useEffect(() => {
    if (orgId && selfUid && sessionReady) return;
    setConversations([]);
    setPartners([]);
    setIsLoading(false);
    bootstrappedOrgRef.current = null;
  }, [orgId, selfUid, sessionReady]);

  // Lightweight bootstrap load (for FAB preview/unread badges even when chat screen is not focused).
  useEffect(() => {
    if (!orgId || !selfUid || !sessionReady) return;
    if (bootstrappedOrgRef.current === orgId) return;
    bootstrappedOrgRef.current = orgId;
    void loadData();
  }, [orgId, selfUid, sessionReady, loadData]);

  useEffect(() => {
    if (!isActive || !selfUid || !sessionReady) return;
    if (Date.now() - lastFetchedAtRef.current < 5 * 60_000) return;
    loadData();
  }, [isActive, selfUid, sessionReady, loadData]);

  const queueRefreshData = useCallback(() => {
    if (refreshDebounceRef.current) clearTimeout(refreshDebounceRef.current);
    refreshDebounceRef.current = setTimeout(() => {
      void loadDataRef.current();
    }, 350);
  }, []);

  useEffect(() => {
    return () => {
      if (refreshDebounceRef.current) clearTimeout(refreshDebounceRef.current);
    };
  }, []);

  // Conversation-row realtime: patch unread/preview, then pull message bodies.
  // (Historically we only patched metadata — receivers never saw live bubbles.)
  useEffect(() => {
    if (!orgId || !selfUid) return;
    return subscribeSharedPostgresChanges(
      `network_conversations:org:${orgId}`,
      networkConversationsOrgSpecs(orgId),
      (payload) => {
        const row = payload.new as Partial<NetworkConversationRow> | null;
        if (!row?.id || row.org_a_id == null || row.org_b_id == null) return;
        const myUnread =
          row.org_a_id === orgId ? row.unread_count_a : row.unread_count_b;
        let found = false;
        setConversations((prev) =>
          prev.map((conv) => {
            if (conv.id !== row.id) return conv;
            found = true;
            return {
              ...conv,
              unread_count:
                typeof myUnread === "number" ? myUnread : conv.unread_count,
              last_message_at: row.last_message_at ?? conv.last_message_at,
              last_message_preview:
                row.last_message_preview ?? conv.last_message_preview,
            };
          }),
        );
        if (!found) {
          const now = Date.now();
          const last = missingNetConvRefreshAtRef.current[row.id] ?? 0;
          if (now - last > 10_000) {
            missingNetConvRefreshAtRef.current[row.id] = now;
            queueRefreshData();
          }
          return;
        }
        // Open thread bodies come from network_messages INSERT (no history RPC).
        // Skipping pull here avoids send flicker + connection-pool pressure.
      },
    );
  }, [orgId, selfUid, queueRefreshData]);

  // Open-thread realtime: direct network_messages INSERT/UPDATE (requires publication).
  useEffect(() => {
    if (!orgId || !selfUid || !activeNetworkConversationId) return;
    return subscribeSharedPostgresChanges(
      `network_messages:conv:${activeNetworkConversationId}`,
      [
        {
          event: "INSERT",
          schema: "public",
          table: "network_messages",
          filter: `conversation_id=eq.${activeNetworkConversationId}`,
        },
        {
          event: "UPDATE",
          schema: "public",
          table: "network_messages",
          filter: `conversation_id=eq.${activeNetworkConversationId}`,
        },
      ],
      (payload) => {
        const row = payload.new as NetworkMessageRow | null;
        if (!row?.id) return;
        applyIncomingNetworkMessage(row);
      },
    );
  }, [orgId, selfUid, activeNetworkConversationId, applyIncomingNetworkMessage]);

  useEffect(() => {
    return () => {
      for (const t of Object.values(pullMessagesDebounceRef.current)) {
        if (t) clearTimeout(t);
      }
      pullMessagesDebounceRef.current = {};
    };
  }, []);

  const chats = useMemo<IntegratedChat[]>(
    () => orgId ? conversations.map((c) => toIntegratedChat(c, orgId, partners)) : [],
    [orgId, conversations, partners],
  );

  const sendMessage = useCallback(
    (chatId: string, content: string, _viewerRole: "dispatcher" | "owner") => {
      if (!orgId || !profile) return;

      const senderName =
        profile.full_name || profile.displayName || orgName;

      const optimisticMsg: NetworkMessageRow = {
        id: `optimistic-${Date.now()}`,
        conversation_id: chatId,
        sender_org_id: orgId,
        sender_user_id: profile.uid ?? null,
        sender_name: senderName,
        content,
        is_read_by_other: false,
        read_at: null,
        created_at: new Date().toISOString(),
      };

      setConversations((prev) =>
        prev.map((conv) =>
          conv.id === chatId
            ? {
                ...conv,
                messages: [...conv.messages, optimisticMsg],
                last_message_at: optimisticMsg.created_at,
                last_message_preview: content.slice(0, 120),
              }
            : conv
        )
      );

      chatService
        .sendNetworkMessage({
          conversationId: chatId,
          senderOrgId: orgId,
          senderUserId: profile.uid ?? null,
          senderName,
          content,
        })
        .then((persisted) => {
          setConversations((prev) =>
            prev.map((conv) =>
              conv.id === chatId
                ? {
                    ...conv,
                    messages: conv.messages.map((m) =>
                      m.id === optimisticMsg.id ? persisted : m
                    ),
                  }
                : conv
            )
          );
        })
        .catch(() => {
          setConversations((prev) =>
            prev.map((conv) =>
              conv.id === chatId
                ? { ...conv, messages: conv.messages.filter((m) => m.id !== optimisticMsg.id) }
                : conv
            )
          );
        });
    },
    [orgId, orgName, profile]
  );

  const markAsRead = useCallback(
    (chatId: string) => {
      if (!orgId) return;
      setConversations((prev) =>
        prev.map((conv) => (conv.id === chatId ? { ...conv, unread_count: 0 } : conv))
      );
      chatService.markNetworkConversationRead(chatId, orgId).catch(() => {});
    },
    [orgId]
  );

  const getUnreadCount = useCallback(
    (chatId: string) => conversations.find((c) => c.id === chatId)?.unread_count ?? 0,
    [conversations]
  );

  const totalUnreadCount = useMemo(
    () => conversations.reduce((sum, c) => sum + c.unread_count, 0),
    [conversations]
  );
  const getTotalUnreadCount = useCallback(() => totalUnreadCount, [totalUnreadCount]);

  // Publish to the lightweight external signal so consumers like DemoTabBar
  // can subscribe without statically importing this context.
  useEffect(() => {
    setNetworkUnreadCount(totalUnreadCount);
  }, [totalUnreadCount]);

  const initiateNetworkConversation = useCallback(
    async (partner: NetworkPartner): Promise<string | null> => {
      if (!orgId) return null;
      try {
        const conv = await chatService.getOrCreateNetworkConversation({
          orgId,
          orgName,
          partnerOrgId: partner.org_id,
          partnerOrgName: partner.name,
        });

        setConversations((prev) => {
          if (prev.find((c) => c.id === conv.id)) return prev;
          const isA = conv.org_a_id === orgId;
          const newConv: NetworkConversation = {
            ...conv,
            partner_org_id: partner.org_id,
            partner_name: partner.name,
            partner_logo_url: partner.logo_url ?? null,
            partner_avatar_seed: partner.avatar_seed ?? null,
            unread_count: isA ? conv.unread_count_a : conv.unread_count_b,
            messages: [],
          };
          return [newConv, ...prev];
        });

        return conv.id;
      } catch {
        return null;
      }
    },
    [orgId, orgName]
  );

  const mergeNetworkMessages = useCallback(
    (
      chatId: string,
      incoming: NetworkMessageRow[],
      mode: "replace" | "prepend",
    ) => {
      setConversations((prev) =>
        prev.map((conv) => {
          if (conv.id !== chatId) return conv;
          if (mode === "replace") {
            return {
              ...conv,
              messages: mergeNetworkMessagesPreservingOptimistic(
                conv.messages,
                incoming,
              ),
            };
          }
          const existingIds = new Set(conv.messages.map((m) => m.id));
          const older = incoming.filter((m) => !existingIds.has(m.id));
          if (older.length === 0) return conv;
          return { ...conv, messages: [...older, ...conv.messages] };
        }),
      );
    },
    [],
  );

  const hydrateNetworkThread = useCallback(
    async (chatId: string) => {
      if (!chatId || networkHydrateInFlightRef.current[chatId]) return;
      networkHydrateInFlightRef.current[chatId] = true;
      try {
        const rows = await chatService.getNetworkMessagesByConversation(chatId, {
          limit: chatService.NETWORK_CHAT_HISTORY_PAGE,
        });
        networkHasMoreRef.current[chatId] =
          rows.length >= chatService.NETWORK_CHAT_HISTORY_PAGE;
        mergeNetworkMessages(chatId, rows, "replace");
      } catch {
        // non-critical — bootstrap slice still visible
      } finally {
        networkHydrateInFlightRef.current[chatId] = false;
      }
    },
    [mergeNetworkMessages],
  );

  const loadOlderNetworkMessages = useCallback(
    async (chatId: string): Promise<boolean> => {
      if (
        !chatId ||
        !networkHasMoreRef.current[chatId] ||
        networkOlderInFlightRef.current[chatId]
      ) {
        return false;
      }
      const conv = conversations.find((c) => c.id === chatId);
      const oldest = conv?.messages[0]?.created_at;
      if (!oldest) {
        networkHasMoreRef.current[chatId] = false;
        return false;
      }
      networkOlderInFlightRef.current[chatId] = true;
      try {
        const rows = await chatService.getNetworkMessagesByConversation(chatId, {
          before: oldest,
          limit: chatService.NETWORK_CHAT_HISTORY_PAGE,
        });
        if (rows.length === 0) {
          networkHasMoreRef.current[chatId] = false;
          return false;
        }
        if (rows.length < chatService.NETWORK_CHAT_HISTORY_PAGE) {
          networkHasMoreRef.current[chatId] = false;
        }
        mergeNetworkMessages(chatId, rows, "prepend");
        return networkHasMoreRef.current[chatId] ?? false;
      } catch {
        return false;
      } finally {
        networkOlderInFlightRef.current[chatId] = false;
      }
    },
    [conversations, mergeNetworkMessages],
  );

  const networkThreadHasMore = useCallback(
    (chatId: string) => networkHasMoreRef.current[chatId] ?? true,
    [],
  );

  const contextValue = useMemo(
    (): IntegratedChatContextType => ({
      chats,
      partners,
      isLoading,
      sendMessage,
      markAsRead,
      getUnreadCount,
      getTotalUnreadCount,
      initiateNetworkConversation,
      hydrateNetworkThread,
      loadOlderNetworkMessages,
      networkThreadHasMore,
      setActiveNetworkConversationId,
    }),
    [
      chats,
      partners,
      isLoading,
      sendMessage,
      markAsRead,
      getUnreadCount,
      getTotalUnreadCount,
      initiateNetworkConversation,
      hydrateNetworkThread,
      loadOlderNetworkMessages,
      networkThreadHasMore,
    ],
  );

  return (
    <IntegratedChatContext.Provider value={contextValue}>
      {children}
    </IntegratedChatContext.Provider>
  );
}
