/**
 * Workspace Team scope — Slack-like channels + 1:1 member chats.
 *
 * `inbox`  — channels + DMs + member strip
 * `thread` — conversation detail (desktop main / mobile push)
 * `full`   — mobile self-contained (inbox until a chat is opened)
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import {
  ArrowLeft,
  Hash,
  Lock,
  Plus,
  Settings,
  Users,
} from "lucide-react-native";
import Theme from "@/constants/Theme";
import { useAuth } from "@/contexts/AuthContext";
import { ChatPartyAvatar } from "@/features/chat/components/ChatPartyAvatar";
import { ChatMobileComposer } from "@/features/chat/components/ChatMobileComposer";
import { ChatSlackDesktopComposer } from "@/features/chat/components/desktop/ChatSlackDesktopComposer";
import { ChatSlackDesktopThreadHeader } from "@/features/chat/components/desktop/ChatSlackDesktopChrome";
import {
  ChatSlackPeopleStrip,
  type SlackPeopleItem,
} from "@/features/chat/components/mobile/ChatSlackMobileChrome";
import { ChatSlackMessageRow } from "@/features/chat/components/mobile/ChatSlackMessageRow";
import { ChatDateDivider } from "@/features/chat/components/shared/ChatDateDivider";
import { ChatHistoryExpiryNotice } from "@/features/chat/components/shared/ChatHistoryExpiryNotice";
import { ChatListSkeleton } from "@/features/chat/components/shared/ChatListSkeleton";
import { ChatThreadSkeleton } from "@/features/chat/components/shared/ChatThreadSkeleton";
import { BrowseTeamChannelsModal } from "@/features/chat/components/team/BrowseTeamChannelsModal";
import { CreateTeamChannelModal } from "@/features/chat/components/team/CreateTeamChannelModal";
import { TeamChannelSettingsModal } from "@/features/chat/components/team/TeamChannelSettingsModal";
import { useChatThreadRealtime } from "@/features/chat/hooks/useChatThreadRealtime";
import { useTeamChannels } from "@/features/chat/hooks/useTeamChannels";
import { useTeamConversations } from "@/features/chat/hooks/useTeamConversations";
import {
  markChatConversationRead,
  sendPlatformChatMessage,
} from "@/features/chat/services/chatPlatform.service";
import type { TeamMemberCandidate } from "@/features/chat/services/teamChat.service";
import type { TeamChannelListItem } from "@/features/chat/services/teamChannel.service";
import type { ChatPlatformMessageRow } from "@/features/chat/types/chatPlatform.types";
import { generateClientMessageId } from "@/features/chat/utils/chatOutbox.util";
import { formatChatInboxTime } from "@/features/chat/utils/formatChatInboxTime.util";
import { formatChatPartyHandle } from "@/features/chat/utils/partyDisplay";
import { buildSlackMessageGroupMap } from "@/features/chat/utils/slackMessageGroup.util";
import {
  channelDisplayTitle,
  formatChannelHandle,
} from "@/features/chat/utils/teamChannelSlug.util";
import type { ResolvedPartyAvatarIdentity } from "@/lib/entityIdentity";

export type TeamChatScopeVariant = "full" | "inbox" | "thread";

type Props = {
  bottomPad?: number;
  /** `inbox` = list only; `thread` = detail only; `full` = mobile list↔thread. */
  variant?: TeamChatScopeVariant;
  selectedId?: string | null;
  onSelectConversation?: (conversationId: string | null) => void;
  /** Shown on thread variant (e.g. mobile detail back). */
  onBack?: () => void;
  onComposeOpenChange?: (open: boolean) => void;
};

type OptimisticRow = ChatPlatformMessageRow & { _failed?: boolean };

type TeamThreadListItem =
  | OptimisticRow
  | { __dateDivider: true; dateStr: string; id: string };

function isTeamDateDivider(
  item: TeamThreadListItem,
): item is { __dateDivider: true; dateStr: string; id: string } {
  return "__dateDivider" in item && item.__dateDivider === true;
}

function memberIdentity(m: TeamMemberCandidate): ResolvedPartyAvatarIdentity {
  return {
    displayName: m.fullName,
    entityType: "client",
    avatarUrl: m.avatarUrl,
    // Stable seed so Memoji shows even when org member has no avatar_seed.
    avatarSeed: m.avatarSeed || m.userId || m.fullName,
  };
}

function shortDisplayName(fullName: string): string {
  const t = fullName.trim();
  if (!t) return "Teammate";
  return t.split(/\s+/)[0] || t;
}

function teamPartyLine(fullName: string, role?: string | null): string {
  const handle = formatChatPartyHandle(fullName);
  const roleLabel =
    String(role ?? "teammate")
      .replace(/_/g, " ")
      .trim()
      .toUpperCase() || "TEAM";
  if (handle) return `${roleLabel} · ${handle}`;
  return roleLabel;
}

function formatTeamTime(iso: string | null | undefined): string {
  return formatChatInboxTime(iso) ?? "";
}

function teamLocalDateKey(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "unknown";
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export function TeamChatScope({
  bottomPad = 24,
  variant = "full",
  selectedId: controlledSelectedId,
  onSelectConversation,
  onBack,
  onComposeOpenChange,
}: Props) {
  const { width: windowWidth } = useWindowDimensions();
  const isDesktopSlack = windowWidth >= 900;
  const { profile } = useAuth();
  const selfUid = profile?.uid ?? "";
  const {
    enabled,
    orgId,
    members,
    rows,
    isLoading,
    isError,
    refetch,
    openWithPeer,
    isOpening,
  } = useTeamConversations();

  const {
    channels,
    joinedChannels,
    isLoading: channelsLoading,
    isError: channelsError,
    refetch: refetchChannels,
    createChannel,
    isCreating,
    joinChannel,
    leaveChannel,
    isLeaving,
    inviteMembers,
    isInviting,
    updateChannel,
    isUpdating,
    archiveChannel,
    isArchiving,
  } = useTeamChannels();

  const [uncontrolledSelectedId, setUncontrolledSelectedId] = useState<
    string | null
  >(null);
  const selectedId =
    controlledSelectedId !== undefined
      ? controlledSelectedId
      : uncontrolledSelectedId;

  const setSelectedId = useCallback(
    (id: string | null) => {
      if (controlledSelectedId === undefined) {
        setUncontrolledSelectedId(id);
      }
      onSelectConversation?.(id);
    },
    [controlledSelectedId, onSelectConversation],
  );

  const [composeOpen, setComposeOpen] = useState(false);
  const [createChannelOpen, setCreateChannelOpen] = useState(false);
  const [browseChannelsOpen, setBrowseChannelsOpen] = useState(false);
  const [channelSettingsOpen, setChannelSettingsOpen] = useState(false);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [optimistic, setOptimistic] = useState<OptimisticRow[]>([]);
  const stickToBottomRef = useRef(true);
  const listRef = useRef<FlatList>(null);

  const selectedRow = rows.find((r) => r.conversation.id === selectedId) ?? null;
  const selectedChannel =
    joinedChannels.find((c) => c.id === selectedId) ??
    channels.find((c) => c.id === selectedId && c.isMember) ??
    null;
  const isChannelThread = Boolean(selectedChannel);
  const thread = useChatThreadRealtime(
    variant === "inbox" ? null : selectedId,
    orgId || null,
  );

  const openChannel = useCallback(
    (channel: TeamChannelListItem) => {
      setComposeOpen(false);
      setBrowseChannelsOpen(false);
      setSelectedId(channel.id);
      setOptimistic([]);
    },
    [setSelectedId],
  );

  useEffect(() => {
    onComposeOpenChange?.(composeOpen);
  }, [composeOpen, onComposeOpenChange]);

  useEffect(() => {
    if (!selectedId || variant === "inbox") return;
    void markChatConversationRead(selectedId).catch(() => {});
  }, [selectedId, thread.data?.length, variant]);

  const serverMessages = useMemo(() => {
    const rowsAsc = [...(thread.data ?? [])].sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );
    return rowsAsc;
  }, [thread.data]);

  const displayMessages = useMemo(() => {
    const byKey = new Map<string, OptimisticRow>();
    for (const m of serverMessages) {
      byKey.set(m.client_message_id || m.id, m);
    }
    for (const o of optimistic) {
      const key = o.client_message_id || o.id;
      if (!byKey.has(key)) byKey.set(key, o);
    }
    return [...byKey.values()].sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );
  }, [serverMessages, optimistic]);

  useEffect(() => {
    if (optimistic.length === 0) return;
    setOptimistic((prev) =>
      prev.filter((o) => {
        if (o._failed) return true;
        return !serverMessages.some(
          (s) =>
            s.id === o.id ||
            (o.client_message_id != null &&
              s.client_message_id === o.client_message_id),
        );
      }),
    );
  }, [serverMessages, optimistic.length]);

  const openPeer = useCallback(
    async (peerUserId: string) => {
      try {
        const conv = await openWithPeer(peerUserId);
        setComposeOpen(false);
        setSelectedId(conv.id);
        setOptimistic([]);
        setDraft("");
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : "Couldn’t open this chat. Try another teammate.";
        // Avoid Alert.alert on web (known stuck confirm sheets).
        if (Platform.OS === "web" && typeof window !== "undefined") {
          window.alert(message);
        } else {
          Alert.alert("Can’t open chat", message);
        }
      }
    },
    [openWithPeer, setSelectedId],
  );

  const memberStripItems = useMemo((): SlackPeopleItem[] => {
    return members.slice(0, 24).map((m) => ({
      id: m.userId,
      name:
        formatChatPartyHandle(m.fullName)?.replace(/^@/, "") ||
        shortDisplayName(m.fullName).toLowerCase(),
      identity: memberIdentity(m),
      onPress: () => {
        void openPeer(m.userId);
      },
    }));
  }, [members, openPeer]);

  const send = useCallback(
    async (overrideText?: string) => {
      const text = (overrideText ?? draft).trim();
      if (!text || !selectedId || sending) return;
      const clientMessageId = generateClientMessageId();
      const optimisticRow: OptimisticRow = {
        id: `optimistic-${clientMessageId}`,
        conversation_id: selectedId,
        organization_id: orgId,
        sender_user_id: selfUid || null,
        sender_type: "user",
        sender_name: profile?.full_name || profile?.displayName || "You",
        sender_role: null,
        message_type: "text",
        content: text,
        metadata: {},
        reply_to_id: null,
        client_message_id: clientMessageId,
        edited_at: null,
        deleted_at: null,
        legacy_source: null,
        created_at: new Date().toISOString(),
      };
      setDraft("");
      setOptimistic((prev) => [...prev, optimisticRow]);
      stickToBottomRef.current = true;
      setSending(true);
      try {
        await sendPlatformChatMessage({
          conversationId: selectedId,
          content: text,
          clientMessageId,
        });
      } catch {
        setOptimistic((prev) =>
          prev.map((m) =>
            m.client_message_id === clientMessageId
              ? { ...m, _failed: true }
              : m,
          ),
        );
      } finally {
        setSending(false);
      }
    },
    [draft, selectedId, sending, orgId, selfUid, profile],
  );

  const teamSlackGroupMap = useMemo(
    () =>
      buildSlackMessageGroupMap(displayMessages, {
        isGroupable: (m) =>
          !m.deleted_at &&
          (m.message_type === "text" || !m.message_type) &&
          Boolean(m.sender_user_id || m.sender_name),
        senderKey: (m) =>
          m.sender_user_id || m.sender_name || m.id,
        createdAt: (m) => m.created_at,
      }),
    [displayMessages],
  );

  const teamThreadListItems = useMemo((): TeamThreadListItem[] => {
    const out: TeamThreadListItem[] = [];
    let lastKey = "";
    for (const m of displayMessages) {
      const key = teamLocalDateKey(m.created_at);
      if (key !== lastKey) {
        lastKey = key;
        out.push({
          __dateDivider: true,
          dateStr: m.created_at,
          id: `date-${key}`,
        });
      }
      out.push(m);
    }
    return out;
  }, [displayMessages]);

  const retryFailed = useCallback(
    async (row: OptimisticRow) => {
      if (!selectedId || !row.client_message_id) return;
      setOptimistic((prev) =>
        prev.map((m) =>
          m.client_message_id === row.client_message_id
            ? { ...m, _failed: false }
            : m,
        ),
      );
      try {
        await sendPlatformChatMessage({
          conversationId: selectedId,
          content: row.content,
          clientMessageId: row.client_message_id,
        });
      } catch {
        setOptimistic((prev) =>
          prev.map((m) =>
            m.client_message_id === row.client_message_id
              ? { ...m, _failed: true }
              : m,
          ),
        );
      }
    },
    [selectedId],
  );

  if (!enabled) {
    return (
      <View style={[styles.empty, { paddingBottom: bottomPad }]}>
        <Users size={28} color={Theme.textSecondary} />
        <Text style={styles.emptyTitle}>Team chat is unavailable</Text>
        <Text style={styles.emptySub}>
          Turn on workspace Team messaging to chat with teammates.
        </Text>
      </View>
    );
  }

  const showThread =
    variant === "thread" ||
    (variant === "full" &&
      Boolean(selectedId && (selectedRow || selectedChannel)));
  const showInbox = variant === "inbox" || (variant === "full" && !showThread);

  if (showThread) {
    if (!selectedId || (!selectedRow && !selectedChannel)) {
      return (
        <View style={[styles.empty, { paddingBottom: bottomPad }]}>
          <Users size={32} color="#CBD5E1" strokeWidth={1.6} />
          <Text style={styles.emptyTitle}>Select a channel or teammate</Text>
          <Text style={styles.emptySub}>
            Open a channel to track the plan — or start a 1:1 with a teammate.
          </Text>
        </View>
      );
    }

    const peer = selectedRow?.peer ?? null;
    const peerName = selectedRow?.title ?? selectedChannel?.title ?? "Teammate";
    const peerIdentity: ResolvedPartyAvatarIdentity = peer
      ? memberIdentity(peer)
      : {
          displayName: peerName,
          entityType: "client",
          avatarSeed: selectedId,
        };
    const composerHint = isChannelThread
      ? `Message ${formatChannelHandle(selectedChannel?.channelKey)}`
      : `Message ${shortDisplayName(peerName)}`;
    const showBack = variant === "full" || Boolean(onBack);
    const ChannelIcon =
      selectedChannel?.visibility === "private" ? Lock : Hash;

    const threadTitle = isChannelThread
      ? formatChannelHandle(selectedChannel?.channelKey)
      : peerName;
    const threadSubtitle = isChannelThread
      ? selectedChannel?.topic?.trim() ||
        `${selectedChannel?.memberCount ?? 0} members`
      : formatChatPartyHandle(peerName) || undefined;
    const compactRoleTag = isChannelThread
      ? selectedChannel?.visibility === "private"
        ? "PRIVATE"
        : "CHANNEL"
      : String(peer?.role ?? "teammate")
          .replace(/_/g, " ")
          .trim()
          .toUpperCase() || "TEAM";
    const channelHeaderIdentity: ResolvedPartyAvatarIdentity = {
      displayName: threadTitle,
      entityType: "client",
      avatarSeed: selectedChannel?.channelKey || selectedId || threadTitle,
    };

    const goBack = () => {
      setOptimistic([]);
      setChannelSettingsOpen(false);
      if (onBack) {
        onBack();
        return;
      }
      setSelectedId(null);
    };

    return (
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
      >
        {isDesktopSlack && !showBack ? (
          <View>
            <ChatSlackDesktopThreadHeader
              title={threadTitle}
              subtitle={threadSubtitle}
              avatarIdentity={
                isChannelThread ? channelHeaderIdentity : peerIdentity
              }
              compactRoleTag={compactRoleTag}
            />
            {isChannelThread ? (
              <Pressable
                onPress={() => setChannelSettingsOpen(true)}
                style={styles.threadSettingsAbs}
                hitSlop={8}
                accessibilityLabel="Channel settings"
              >
                <Settings
                  size={18}
                  color={Theme.textSecondary}
                  strokeWidth={2.2}
                />
              </Pressable>
            ) : null}
          </View>
        ) : (
          <View style={styles.threadHeader}>
            {showBack ? (
              <Pressable
                onPress={goBack}
                hitSlop={10}
                style={styles.backBtn}
                accessibilityRole="button"
                accessibilityLabel="Back to team list"
              >
                <ArrowLeft
                  size={18}
                  color={Theme.textPrimary}
                  strokeWidth={2.2}
                />
              </Pressable>
            ) : null}
            {isChannelThread ? (
              <View style={styles.channelAvatar}>
                <ChannelIcon size={18} color={Theme.primary} strokeWidth={2.4} />
              </View>
            ) : (
              <ChatPartyAvatar identity={peerIdentity} size={36} />
            )}
            <Pressable
              style={styles.threadHeaderText}
              onPress={() => {
                if (isChannelThread) setChannelSettingsOpen(true);
              }}
              disabled={!isChannelThread}
            >
              <Text style={styles.threadTitle} numberOfLines={1}>
                {threadTitle}
              </Text>
              <Text style={styles.threadSub} numberOfLines={1}>
                {isChannelThread
                  ? selectedChannel?.topic?.trim() ||
                    `${selectedChannel?.memberCount ?? 0} members · tap for details`
                  : teamPartyLine(peerName, peer?.role)}
              </Text>
            </Pressable>
            {isChannelThread ? (
              <Pressable
                onPress={() => setChannelSettingsOpen(true)}
                style={styles.backBtn}
                hitSlop={8}
                accessibilityLabel="Channel settings"
              >
                <Settings
                  size={18}
                  color={Theme.textSecondary}
                  strokeWidth={2.2}
                />
              </Pressable>
            ) : null}
          </View>
        )}

        {selectedChannel ? (
          <TeamChannelSettingsModal
            visible={channelSettingsOpen}
            channel={selectedChannel}
            roster={members}
            saving={isUpdating}
            leaving={isLeaving}
            inviting={isInviting}
            archiving={isArchiving}
            onClose={() => setChannelSettingsOpen(false)}
            onSave={async (patch) => {
              await updateChannel({
                conversationId: selectedChannel.id,
                ...patch,
              });
            }}
            onInvite={async (memberIds) => {
              await inviteMembers({
                conversationId: selectedChannel.id,
                memberIds,
              });
            }}
            onLeave={async () => {
              await leaveChannel(selectedChannel.id);
              setChannelSettingsOpen(false);
              setSelectedId(null);
            }}
            onArchive={async () => {
              await archiveChannel(selectedChannel.id);
              setChannelSettingsOpen(false);
              setSelectedId(null);
            }}
          />
        ) : null}

        {thread.isLoading && displayMessages.length === 0 ? (
          <ChatThreadSkeleton showHeader={false} />
        ) : thread.isError && displayMessages.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Couldn’t load messages</Text>
            <Pressable onPress={() => void thread.refetch()}>
              <Text style={styles.retry}>Retry</Text>
            </Pressable>
          </View>
        ) : (
          <FlatList
            ref={listRef}
            style={styles.flex}
            contentContainerStyle={[
              styles.msgsSlack,
              displayMessages.length === 0 && styles.msgsSlackEmpty,
            ]}
            data={teamThreadListItems}
            keyExtractor={(item) =>
              isTeamDateDivider(item)
                ? item.id
                : item.client_message_id || item.id
            }
            onContentSizeChange={() => {
              if (stickToBottomRef.current) {
                listRef.current?.scrollToEnd({ animated: false });
              }
            }}
            onScroll={(e) => {
              const { contentOffset, contentSize, layoutMeasurement } =
                e.nativeEvent;
              stickToBottomRef.current =
                contentSize.height -
                  layoutMeasurement.height -
                  contentOffset.y <
                80;
              if (contentOffset.y < 72 && thread.hasMoreOlder) {
                void thread.loadOlder();
              }
            }}
            scrollEventThrottle={16}
            ListFooterComponent={
              displayMessages.length > 0 ? (
                <ChatHistoryExpiryNotice
                  variant={isDesktopSlack ? "desktop" : "mobile"}
                  slackLayout
                  persistent={!isChannelThread}
                />
              ) : null
            }
            renderItem={({ item }) => {
              if (isTeamDateDivider(item)) {
                return (
                  <ChatDateDivider
                    dateStr={item.dateStr}
                    variant={isDesktopSlack ? "desktop" : "mobile"}
                  />
                );
              }
              const own = item.sender_user_id === selfUid;
              const senderName = item.sender_name || (own ? "You" : peerName);
              const senderMember = item.sender_user_id
                ? members.find((m) => m.userId === item.sender_user_id)
                : null;
              const avatar: ResolvedPartyAvatarIdentity = senderMember
                ? memberIdentity(senderMember)
                : {
                    displayName: senderName,
                    entityType: "client",
                    avatarSeed:
                      item.sender_user_id || item.sender_name || item.id,
                  };
              const group = teamSlackGroupMap.get(item.id);
              return (
                <View>
                  <ChatSlackMessageRow
                    messageId={item.id}
                    senderName={senderName}
                    content={item.content}
                    timestamp={item.created_at}
                    avatar={avatar}
                    isOwn={own}
                    variant={isDesktopSlack ? "desktop" : "mobile"}
                    group={group}
                    selfUserId={selfUid || null}
                    isEdited={Boolean(item.edited_at)}
                  />
                  {item._failed ? (
                    <Pressable
                      onPress={() => void retryFailed(item)}
                      style={styles.failedRow}
                    >
                      <Text style={styles.failed}>Failed · Tap to retry</Text>
                    </Pressable>
                  ) : null}
                </View>
              );
            }}
            ListEmptyComponent={
              <View style={styles.threadEmpty}>
                {isChannelThread ? (
                  <View
                    style={[
                      styles.channelAvatar,
                      { width: 64, height: 64, borderRadius: 18 },
                    ]}
                  >
                    <ChannelIcon
                      size={28}
                      color={Theme.primary}
                      strokeWidth={2.2}
                    />
                  </View>
                ) : (
                  <ChatPartyAvatar identity={peerIdentity} size={64} />
                )}
                <Text style={styles.emptyTitle}>{threadTitle}</Text>
                <Text style={styles.emptySub}>
                  {isChannelThread
                    ? selectedChannel?.topic?.trim() ||
                      "This is the start of the channel. Share the plan, drop updates, and keep everyone aligned."
                    : "This is the beginning of your conversation. Share updates, docs, or say hello."}
                </Text>
              </View>
            }
          />
        )}

        {isDesktopSlack ? (
          <ChatSlackDesktopComposer
            value={draft}
            onChangeText={setDraft}
            onSend={(text) => void send(text)}
            placeholder={composerHint}
          />
        ) : (
          <ChatMobileComposer
            value={draft}
            onChangeText={setDraft}
            onSend={(text) => void send(text)}
            placeholder={composerHint}
            hideQuickChips
          />
        )}
      </KeyboardAvoidingView>
    );
  }

  if (!showInbox) return null;

  return (
    <View style={[styles.flex, { paddingBottom: bottomPad }]}>
      {memberStripItems.length > 0 ? (
        <ChatSlackPeopleStrip
          items={memberStripItems}
          selectedId={
            selectedRow?.peer?.userId ??
            (selectedId
              ? rows.find((r) => r.conversation.id === selectedId)?.peer
                  ?.userId ?? null
              : null)
          }
          sectionLabel="Team members"
          onCompose={() => setComposeOpen(true)}
        />
      ) : null}

      {composeOpen ? (
        <View style={styles.composePanel}>
          <View style={styles.composePanelHeader}>
            <Text style={styles.composeHint}>Start a direct message</Text>
            <Pressable onPress={() => setComposeOpen(false)} hitSlop={8}>
              <Text style={styles.sectionAction}>Close</Text>
            </Pressable>
          </View>
          {isOpening ? <Text style={styles.emptySub}>Opening…</Text> : null}
          <FlatList
            data={members}
            keyExtractor={(m) => m.userId}
            style={{ maxHeight: 220 }}
            renderItem={({ item }) => (
              <Pressable
                style={styles.memberRow}
                onPress={() => void openPeer(item.userId)}
                accessibilityRole="button"
                accessibilityLabel={`Message ${item.fullName}`}
              >
                <ChatPartyAvatar identity={memberIdentity(item)} size={36} />
                <View style={styles.memberTextCol}>
                  <Text style={styles.dmName} numberOfLines={1}>
                    {item.fullName}
                  </Text>
                  <Text style={styles.dmMeta} numberOfLines={1}>
                    {teamPartyLine(item.fullName, item.role)}
                  </Text>
                </View>
              </Pressable>
            )}
            ListEmptyComponent={
              <Text style={styles.emptySub}>
                No eligible teammates in this workspace
              </Text>
            }
          />
        </View>
      ) : null}

      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.sidebarScroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ── Channels (Slack sidebar) ─────────────────────────────── */}
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>Channels</Text>
          <View style={styles.headerActions}>
            <Pressable
              onPress={() => setBrowseChannelsOpen(true)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Browse channels"
            >
              <Text style={styles.sectionAction}>Browse</Text>
            </Pressable>
            <Pressable
              onPress={() => setCreateChannelOpen(true)}
              style={styles.addChannelBtn}
              accessibilityRole="button"
              accessibilityLabel="Create channel"
            >
              <Plus size={12} color="#fff" strokeWidth={2.8} />
              <Text style={styles.addChannelText}>New</Text>
            </Pressable>
          </View>
        </View>

        {channelsLoading && joinedChannels.length === 0 ? (
          <ChatListSkeleton count={3} />
        ) : channelsError && joinedChannels.length === 0 ? (
          <View style={styles.sectionError}>
            <Text style={styles.sectionErrorText}>Couldn’t load channels</Text>
            <Pressable onPress={() => void refetchChannels()}>
              <Text style={styles.retry}>Retry</Text>
            </Pressable>
          </View>
        ) : joinedChannels.length === 0 ? (
          <Pressable
            style={styles.channelEmptyInline}
            onPress={() => setCreateChannelOpen(true)}
          >
            <Hash size={14} color={Theme.primary} strokeWidth={2.2} />
            <Text style={styles.channelEmptyInlineText}>
              Create a channel to track the plan
            </Text>
          </Pressable>
        ) : (
          joinedChannels.map((ch) => {
            const Icon = ch.visibility === "private" ? Lock : Hash;
            const active = selectedId === ch.id;
            return (
              <Pressable
                key={ch.id}
                style={[styles.slackChannelRow, active && styles.slackRowActive]}
                onPress={() => openChannel(ch)}
                accessibilityRole="button"
                accessibilityLabel={`Open ${formatChannelHandle(ch.channelKey)}`}
              >
                <Icon
                  size={14}
                  color={active ? Theme.primary : Theme.textSecondary}
                  strokeWidth={2.4}
                />
                <Text
                  style={[
                    styles.slackChannelName,
                    active && styles.slackChannelNameActive,
                  ]}
                  numberOfLines={1}
                >
                  {ch.channelKey || channelDisplayTitle(ch.title, ch.channelKey)}
                </Text>
                {ch.topic ? (
                  <Text style={styles.slackChannelTopic} numberOfLines={1}>
                    {ch.topic}
                  </Text>
                ) : null}
              </Pressable>
            );
          })
        )}

        {/* ── Direct messages ──────────────────────────────────────── */}
        <View style={[styles.sectionHead, styles.sectionHeadSpaced]}>
          <Text style={styles.sectionTitle}>Direct messages</Text>
          <Pressable
            onPress={() => setComposeOpen((v) => !v)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="New direct message"
          >
            <Text style={styles.sectionAction}>
              {composeOpen ? "Close" : "New"}
            </Text>
          </Pressable>
        </View>

        {isLoading && rows.length === 0 ? (
          <ChatListSkeleton count={4} />
        ) : isError && rows.length === 0 ? (
          <View style={styles.sectionError}>
            <Text style={styles.sectionErrorText}>Couldn’t load messages</Text>
            <Pressable onPress={refetch}>
              <Text style={styles.retry}>Retry</Text>
            </Pressable>
          </View>
        ) : rows.length === 0 ? (
          <Pressable
            style={styles.channelEmptyInline}
            onPress={() => setComposeOpen(true)}
          >
            <Users size={14} color={Theme.primary} strokeWidth={2.2} />
            <Text style={styles.channelEmptyInlineText}>
              Message a teammate
            </Text>
          </Pressable>
        ) : (
          rows.map((item) => {
            const peer = item.peer;
            const title = item.title;
            const identity: ResolvedPartyAvatarIdentity = peer
              ? memberIdentity(peer)
              : {
                  displayName: title,
                  entityType: "client",
                  avatarSeed: item.conversation.peerUserId || title,
                };
            const preview = item.conversation.lastMessagePreview?.trim() || "";
            const stamp = formatTeamTime(item.conversation.lastMessageAt);
            const active = selectedId === item.conversation.id;
            const roleLine = peer?.role
              ? String(peer.role).replace(/_/g, " ").trim()
              : "Teammate";
            return (
              <Pressable
                key={item.conversation.id}
                style={[styles.slackDmRow, active && styles.slackRowActive]}
                onPress={() => {
                  setSelectedId(item.conversation.id);
                  setOptimistic([]);
                }}
                accessibilityRole="button"
                accessibilityLabel={`Open chat with ${title}`}
              >
                <ChatPartyAvatar identity={identity} size={28} />
                <View style={styles.dmBody}>
                  <View style={styles.dmTop}>
                    <Text
                      style={[styles.dmName, active && styles.dmNameActive]}
                      numberOfLines={1}
                    >
                      {title}
                    </Text>
                    {stamp ? (
                      <Text style={styles.dmTime}>{stamp}</Text>
                    ) : null}
                  </View>
                  <Text style={styles.dmPreview} numberOfLines={1}>
                    {preview || roleLine}
                  </Text>
                </View>
              </Pressable>
            );
          })
        )}
      </ScrollView>

      <CreateTeamChannelModal
        visible={createChannelOpen}
        members={members}
        creating={isCreating}
        onClose={() => setCreateChannelOpen(false)}
        onCreate={async (input) => {
          const conv = await createChannel(input);
          await refetchChannels();
          setCreateChannelOpen(false);
          setSelectedId(conv.id);
          setOptimistic([]);
        }}
      />

      <BrowseTeamChannelsModal
        visible={browseChannelsOpen}
        channels={channels}
        joiningId={joiningId}
        onClose={() => setBrowseChannelsOpen(false)}
        onOpen={(ch) => openChannel(ch)}
        onJoin={async (ch) => {
          setJoiningId(ch.id);
          try {
            const conv = await joinChannel(ch.id);
            openChannel({ ...ch, id: conv.id, isMember: true });
          } finally {
            setJoiningId(null);
          }
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: "#FFFFFF" },
  sidebarScroll: { paddingBottom: 28 },
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 4,
  },
  sectionHeadSpaced: { paddingTop: 18 },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: Theme.textSecondary,
  },
  sectionAction: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.primary,
  },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 10 },
  addChannelBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: Theme.primary,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  addChannelText: { color: "#fff", fontWeight: "700", fontSize: 11 },
  slackChannelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 6,
    minHeight: 32,
  },
  slackRowActive: {
    backgroundColor: "rgba(77, 54, 54, 0.07)",
    borderRadius: 8,
    marginHorizontal: 8,
    paddingHorizontal: 6,
  },
  slackChannelName: {
    flexShrink: 1,
    fontSize: 14,
    fontWeight: "500",
    color: Theme.textPrimary,
    letterSpacing: -0.1,
  },
  slackChannelNameActive: { fontWeight: "700" },
  slackChannelTopic: {
    flex: 1,
    minWidth: 0,
    fontSize: 11,
    color: Theme.textSecondary,
    textAlign: "right",
  },
  channelEmptyInline: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 14,
    marginVertical: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: Theme.surface,
  },
  channelEmptyInlineText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    color: Theme.primary,
  },
  sectionError: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 4,
  },
  sectionErrorText: {
    fontSize: 13,
    fontWeight: "600",
    color: Theme.textSecondary,
  },
  slackDmRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 7,
    minHeight: 44,
  },
  dmBody: { flex: 1, minWidth: 0 },
  dmTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  dmName: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: Theme.textPrimary,
    letterSpacing: -0.1,
  },
  dmNameActive: { fontWeight: "700" },
  dmTime: { fontSize: 11, color: Theme.textSecondary, flexShrink: 0 },
  dmPreview: {
    marginTop: 1,
    fontSize: 12,
    color: Theme.textSecondary,
    lineHeight: 16,
  },
  dmMeta: {
    marginTop: 1,
    fontSize: 11,
    color: Theme.textSecondary,
  },
  composePanel: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E8E8E8",
    backgroundColor: "#FAFBFC",
    paddingBottom: 8,
  },
  composePanelHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 4,
  },
  composeHint: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textSecondary,
  },
  memberRow: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  memberTextCol: { flex: 1, minWidth: 0 },
  empty: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
    paddingVertical: 48,
    gap: 8,
  },
  threadEmpty: {
    alignItems: "center",
    paddingTop: 56,
    paddingHorizontal: 28,
    gap: 10,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: Theme.textPrimary,
    textAlign: "center",
  },
  emptySub: {
    fontSize: 13,
    color: Theme.textSecondary,
    textAlign: "center",
    lineHeight: 18,
  },
  emptyCta: {
    marginTop: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: Theme.primary,
  },
  emptyCtaText: { color: "#FFFFFF", fontWeight: "700", fontSize: 14 },
  retry: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: "700",
    color: Theme.primary,
  },
  threadHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E8E8E8",
    backgroundColor: "#FFFFFF",
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F3F4F6",
  },
  threadHeaderText: { flex: 1, minWidth: 0 },
  threadTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: Theme.textPrimary,
  },
  threadSub: {
    marginTop: 1,
    fontSize: 12,
    color: Theme.textSecondary,
  },
  channelAvatar: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Theme.brandBlueSoft ?? Theme.surfaceGray,
    alignItems: "center",
    justifyContent: "center",
  },
  msgsSlack: {
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 16,
    flexGrow: 1,
  },
  msgsSlackEmpty: {
    justifyContent: "center",
  },
  threadSettingsAbs: {
    position: "absolute",
    top: 18,
    right: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F3F4F6",
  },
  failedRow: {
    paddingHorizontal: 56,
    marginTop: -4,
    marginBottom: 8,
  },
  failed: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.destructive,
  },
});
