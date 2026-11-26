/**
 * Driver trip thread — Slack-style layout aligned with business Command Hub chat.
 */
import { LoadingIndicator } from "@/components/LoadingIndicator";
import Theme from "@/constants/Theme";
import { useAuth } from "@/contexts/AuthContext";
import { useOptionalOrganization } from "@/contexts/OrganizationContext";
import { ChatPartyAvatar } from "@/features/chat/components/ChatPartyAvatar";
import { ChatMobileComposer } from "@/features/chat/components/ChatMobileComposer";
import { ChatLocationSystemCard } from "@/features/chat/components/ChatLocationSystemCard";
import { ChatStageRevokeCard } from "@/features/chat/components/ChatStageRevokeCard";
import { ChatSystemEventCard } from "@/features/chat/components/ChatEventCard";
import {
  isStageRevokeChatMessage,
  isStageRevokeStatusNote,
} from "@/features/chat/utils/stageRevokeChat.util";
import { ChatSlackThreadHeader } from "@/features/chat/components/mobile/ChatSlackMobileChrome";
import {
  SLACK_AVATAR,
  slackMobileStyles as slackSt,
} from "@/features/chat/components/mobile/chatSlackMobile.styles";
import { ChatFeedbackCard } from "@/features/chat/components/ChatFeedbackCard";
import { DriverShipperFeedbackModal } from "@/features/chat/components/driver/DriverShipperFeedbackModal";
import { ChatSlackMessageRow } from "@/features/chat/components/mobile/ChatSlackMessageRow";
import { DocumentShareCard } from "@/features/chat/components/DocumentShareCard";
import { SmartChatImage } from "@/features/chat/components/SmartChatImage";
import { ChatMediaBurstRow } from "@/features/chat/components/shared/ChatMediaBurstRow";
import { ChatHistoryExpiryNotice } from "@/features/chat/components/shared/ChatHistoryExpiryNotice";
import type { TripMessageRow } from "@/features/chat/types/chat.types";
import { resolveDriverChatFeedbackChrome } from "@/features/chat/utils/driverChatTripChrome.util";
import {
  buildChatMediaBurstIndex,
  tripChatMessageSenderKey,
} from "@/features/chat/utils/chatMediaBurst.util";
import { compressAndUploadChatImage } from "@/features/chat/utils/chatImageUpload.util";
import { isLocationPingMessage } from "@/features/chat/utils/locationPingChatDisplay.util";
import { parseSystemLogLocationData } from "@/features/chat/utils/locationLogPayload.util";
import * as chatService from "@/features/chat/services/chat.service";
import {
  appendDriverChatMessageToCache,
  driverChatMessagesQueryKey,
  removeDriverChatMessageFromCache,
  replaceDriverChatMessageInCache,
  type DriverChatMessagesPage,
} from "@/features/chat/utils/driverChatMessageCache.util";
import { stripChatPreviewEmojiPrefix } from "@/features/chat/utils/chatAvatar.util";
import {
  findLatestMissionDebriefMessage,
  isMissionDebriefMessage,
} from "@/features/chat/utils/missionDebrief.util";
import { formatChatPartyHandle } from "@/features/chat/utils/partyDisplay";
import { resolveDocumentShareDisplay } from "@/features/chat/utils/documentShareDisplay.util";
import {
  buildSlackMessageGroupMap,
  isSlackGroupableTripMessage,
  type SlackMessageGroupMeta,
} from "@/features/chat/utils/slackMessageGroup.util";
import { useDriverChatSystem } from "@/features/driver/communication";
import {
  appendDriverStatusNote,
  deriveDriverFlowStepFromTrip,
  DRIVER_PREDEFINED_STATUS_BY_STEP,
  parseDriverUpdatesFromNotes,
  type ParsedDriverStatusNote,
} from "@/features/driver/utils/driverTripStatusNotes.util";
import type { TripRow } from "@/features/trips/services/trips.service";
import * as tripsService from "@/features/trips/services/trips.service";
import {
  effectiveKeyboardInset,
  useKeyboardVisible,
} from "@/lib/hooks/useKeyboardVisible";
import type { ResolvedPartyAvatarIdentity } from "@/lib/entityIdentity";
import { useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useCallback, useEffect, useMemo, useRef, useState, memo } from "react";
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { FlashList, FlashListRef } from "@shopify/flash-list";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/** Matches `threadMsgsContent` horizontal padding — keep header/composer aligned. */
const DRIVER_CHAT_EDGE = 16;

const DRIVER_QUICK_MESSAGES = [
  "I have arrived at pickup.",
  "Loading in progress.",
  "Documents collected. Departing now.",
  "En route to delivery point.",
  "I have reached the destination.",
  "POD submitted. Trip complete.",
  "Need assistance — please call.",
  "Running 30 minutes behind schedule.",
];

function isStatusNoteRedundantWithChat(
  u: ParsedDriverStatusNote,
  messages: TripMessageRow[],
): boolean {
  const t = new Date(u.timestamp).getTime();
  // Stage revoke notes are mirrored as system chat cards — prefer the card.
  if (isStageRevokeStatusNote(u.message)) {
    return messages.some(
      (m) =>
        isStageRevokeChatMessage(m) &&
        Math.abs(new Date(m.created_at).getTime() - t) < 120_000,
    );
  }
  return messages.some(
    (m) =>
      m.sender_role === "driver" &&
      m.message_type === "text" &&
      m.content.trim() === u.message.trim() &&
      Math.abs(new Date(m.created_at).getTime() - t) < 120_000,
  );
}

function UploadingImagePreview({ localUri }: { localUri: string }) {
  return (
    <View style={localStyles.uploadShell}>
      <Image source={{ uri: localUri }} style={localStyles.uploadImg} contentFit="cover" />
      <View style={localStyles.uploadOverlay}>
        <ActivityIndicator color="#fff" size="small" />
      </View>
    </View>
  );
}

type ThreadRow =
  | { key: string; kind: "msg"; m: TripMessageRow }
  | { key: string; kind: "status"; u: ParsedDriverStatusNote };

type DriverSlackImageRowProps = {
  message: TripMessageRow;
  storagePath: string;
  own: boolean;
  selfName: string;
  ownAvatar: ResolvedPartyAvatarIdentity;
  fleetAvatar: ResolvedPartyAvatarIdentity;
  fleetName?: string | null;
  profile: ReturnType<typeof useAuth>["profile"];
  currentOrganization: { logo_url?: string | null } | null;
  group?: SlackMessageGroupMeta;
};

const DriverSlackImageRow = memo(function DriverSlackImageRow({
  message,
  storagePath,
  own,
  selfName,
  ownAvatar,
  fleetAvatar,
  fleetName,
  profile,
  currentOrganization,
  group,
}: DriverSlackImageRowProps) {
  const peerLabel = message.sender_name?.trim() || fleetName?.trim() || "Fleet";
  const showHeader = group?.showHeader ?? true;
  const showAvatar = group?.showAvatar ?? true;
  const isContinuation = group?.isContinuation ?? false;

  const avatarColumn = showAvatar ? (
    <View style={slackSt.threadMsgAvatarCircle}>
      <ChatPartyAvatar
        identity={own ? ownAvatar : fleetAvatar}
        size={SLACK_AVATAR.thread}
        isOwnUser={own}
        userName={selfName}
        userAvatarUrl={profile?.avatar_url ?? null}
        userAvatarSeed={profile?.avatar_seed ?? null}
        userOrgLogoUrl={currentOrganization?.logo_url ?? null}
      />
    </View>
  ) : (
    <View style={[slackSt.threadMsgAvatarSpacer, { width: SLACK_AVATAR.thread }]} />
  );

  return (
    <View
      style={[
        slackSt.threadMsgRow,
        isContinuation ? slackSt.threadMsgRowContinuation : slackSt.threadMsgRowLead,
        group?.partyBreak && slackSt.threadMsgRowPartyBreak,
      ]}
    >
      {avatarColumn}
      <View style={slackSt.threadMsgBody}>
        {showHeader ? (
          <View style={slackSt.threadMsgHeader}>
            <Text style={slackSt.threadMsgName} numberOfLines={1}>
              {own ? selfName : peerLabel}
            </Text>
            <Text style={slackSt.threadMsgTime} numberOfLines={1}>
              {new Date(message.created_at).toLocaleTimeString("en-IN", {
                hour: "numeric",
                minute: "2-digit",
                hour12: true,
              })}
            </Text>
          </View>
        ) : null}
        <View style={localStyles.imageBody}>
          <SmartChatImage
            storagePath={storagePath}
            message={message}
            isOwn={own}
          />
        </View>
      </View>
    </View>
  );
});

type DriverSlackDocumentRowProps = Omit<DriverSlackImageRowProps, "storagePath">;

const DriverSlackDocumentRow = memo(function DriverSlackDocumentRow({
  message,
  own,
  selfName,
  ownAvatar,
  fleetAvatar,
  fleetName,
  profile,
  currentOrganization,
  group,
}: DriverSlackDocumentRowProps) {
  const peerLabel = message.sender_name?.trim() || fleetName?.trim() || "Fleet";
  const showHeader = group?.showHeader ?? true;
  const showAvatar = group?.showAvatar ?? true;
  const isContinuation = group?.isContinuation ?? false;

  const avatarColumn = showAvatar ? (
    <View style={slackSt.threadMsgAvatarCircle}>
      <ChatPartyAvatar
        identity={own ? ownAvatar : fleetAvatar}
        size={SLACK_AVATAR.thread}
        isOwnUser={own}
        userName={selfName}
        userAvatarUrl={profile?.avatar_url ?? null}
        userAvatarSeed={profile?.avatar_seed ?? null}
        userOrgLogoUrl={currentOrganization?.logo_url ?? null}
      />
    </View>
  ) : (
    <View style={[slackSt.threadMsgAvatarSpacer, { width: SLACK_AVATAR.thread }]} />
  );

  return (
    <View
      style={[
        slackSt.threadMsgRow,
        isContinuation ? slackSt.threadMsgRowContinuation : slackSt.threadMsgRowLead,
        group?.partyBreak && slackSt.threadMsgRowPartyBreak,
      ]}
    >
      {avatarColumn}
      <View style={slackSt.threadMsgBody}>
        {showHeader ? (
          <View style={slackSt.threadMsgHeader}>
            <Text style={slackSt.threadMsgName} numberOfLines={1}>
              {own ? selfName : peerLabel}
            </Text>
            <Text style={slackSt.threadMsgTime} numberOfLines={1}>
              {new Date(message.created_at).toLocaleTimeString("en-IN", {
                hour: "numeric",
                minute: "2-digit",
                hour12: true,
              })}
            </Text>
          </View>
        ) : null}
        <DocumentShareCard message={message} isOwn={own} />
      </View>
    </View>
  );
});

const DriverSlackUploadingImageRow = memo(function DriverSlackUploadingImageRow({
  localUri,
  selfName,
  ownAvatar,
  profile,
  currentOrganization,
  group,
}: {
  localUri: string;
  selfName: string;
  ownAvatar: ResolvedPartyAvatarIdentity;
  profile: ReturnType<typeof useAuth>["profile"];
  currentOrganization: { logo_url?: string | null } | null;
  group?: SlackMessageGroupMeta;
}) {
  const showHeader = group?.showHeader ?? true;
  const showAvatar = group?.showAvatar ?? true;
  const isContinuation = group?.isContinuation ?? false;

  const avatarColumn = showAvatar ? (
    <View style={slackSt.threadMsgAvatarCircle}>
      <ChatPartyAvatar
        identity={ownAvatar}
        size={SLACK_AVATAR.thread}
        isOwnUser
        userName={selfName}
        userAvatarUrl={profile?.avatar_url ?? null}
        userAvatarSeed={profile?.avatar_seed ?? null}
        userOrgLogoUrl={currentOrganization?.logo_url ?? null}
      />
    </View>
  ) : (
    <View style={[slackSt.threadMsgAvatarSpacer, { width: SLACK_AVATAR.thread }]} />
  );

  return (
    <View
      style={[
        slackSt.threadMsgRow,
        isContinuation ? slackSt.threadMsgRowContinuation : slackSt.threadMsgRowLead,
        group?.partyBreak && slackSt.threadMsgRowPartyBreak,
      ]}
    >
      {avatarColumn}
      <View style={slackSt.threadMsgBody}>
        {showHeader ? (
          <View style={slackSt.threadMsgHeader}>
            <Text style={slackSt.threadMsgName} numberOfLines={1}>
              {selfName}
            </Text>
          </View>
        ) : null}
        <View style={localStyles.imageBody}>
          <UploadingImagePreview localUri={localUri} />
        </View>
      </View>
    </View>
  );
});

// Stable item-type key for FlashList recycling — puts each content shape in its
// own pool so cells of different heights never swap buffers (prevents layout jank).
function getThreadItemType(item: ThreadRow): string {
  if (item.kind === "status") return "status";
  const mt = item.m.message_type ?? "text";
  if (mt === "image" || mt === "document_share" || mt === "document_upload") return "media";
  if (mt === "system_log" || mt === "location_log") return "location";
  if (isMissionDebriefMessage(item.m)) return "feedback";
  return "text";
}

export type DriverChatSlackThreadProps = {
  conversationId: string;
  organizationId: string;
  tripId: string;
  tripNumber: string;
  pickupArea: string;
  dropLocation: string;
  fleetName?: string | null;
  messageInput: string;
  setMessageInput: (v: string) => void;
  onSend: () => void;
  onSendTripChat: (text: string) => Promise<void>;
  onBack: () => void;
  /** Bottom tab bar height clearance when thread is full-screen above driver tabs. */
  bottomTabClearance?: number;
  /** Pre-hydrated trip row from the caller — skips an extra network round trip on open. */
  initialTrip?: TripRow | null;
};

export function DriverChatSlackThread({
  conversationId,
  organizationId,
  tripId,
  tripNumber,
  pickupArea,
  dropLocation,
  fleetName,
  messageInput,
  setMessageInput,
  onSend,
  onSendTripChat,
  onBack,
  bottomTabClearance = 0,
  initialTrip = null,
}: DriverChatSlackThreadProps) {
  const { profile } = useAuth();
  const orgCtx = useOptionalOrganization();
  const currentOrganization = orgCtx?.currentOrganization ?? null;
  const selfUid = profile?.uid ?? null;
  const selfName = profile?.full_name || profile?.displayName || "You";
  const driverRoleTag = formatChatPartyHandle(selfName) ?? "Driver";
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const listRef = useRef<FlashListRef<ThreadRow>>(null);
  const mergedCountRef = useRef(0);
  const didInitialScrollRef = useRef(false);
  const { keyboardVisible: keyboardOpen, keyboardHeight } = useKeyboardVisible();
  const keyboardInset = effectiveKeyboardInset(keyboardOpen, keyboardHeight);
  // Use initialTrip so the thread renders immediately without waiting for a DB fetch.
  const [trip, setTrip] = useState<TripRow | null>(initialTrip);
  const [uploading, setUploading] = useState(false);
  const [statusSending, setStatusSending] = useState<string | null>(null);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const mountedAtMs = useRef(Date.now()).current;

  const {
    messages,
    isLoading: messagesLoading,
    hasOlder,
    isFetchingOlder,
    loadOlder,
  } = useDriverChatSystem({
    conversationId,
    organizationId,
    selfUid,
    enabled: true,
  });

  useEffect(() => {
    if (Platform.OS === "web") return;
    const showEvt = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const sub = Keyboard.addListener(showEvt, () => {
      // Use rAF instead of hard-coded timeouts — fires after the layout pass that
      // follows keyboard appearance, avoiding scroll position jumps on slow devices.
      requestAnimationFrame(() => {
        listRef.current?.scrollToEnd({ animated: true });
      });
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    // Reset to initialTrip when tripId changes so the previous trip's status
    // notes don't flash briefly before the fetch resolves.
    setTrip(initialTrip ?? null);
  }, [tripId]); // intentional: only reset on tripId change

  useEffect(() => {
    // Defer the trip fetch until the message list has loaded so the messages
    // query gets the network slot first (critical on low-bandwidth connections).
    if (messagesLoading) return;
    // If we already have the trip from initialTrip and it matches, skip re-fetch.
    if (trip?.id === tripId) return;
    let cancelled = false;
    void tripsService.getTripById(tripId).then(({ trip: t }) => {
      if (!cancelled) setTrip(t ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [tripId, messagesLoading]); // intentional: trip/initialTrip excluded to avoid re-fetch loops

  const statusNotes = useMemo(
    () => parseDriverUpdatesFromNotes(trip?.notes ?? null),
    [trip?.notes],
  );

  const displayMessages = useMemo(
    () =>
      messages.filter(
        (m) =>
          m.message_type !== "system" ||
          isLocationPingMessage(m) ||
          isStageRevokeChatMessage(m),
      ),
    [messages],
  );

  /**
   * Collapse consecutive auto location pings into one smart receipt —
   * driver chat should not spam “Driver is at…” rows.
   */
  const locationPingRunInfo = useMemo(() => {
    const info = new Map<string, { isLast: boolean; runCount: number }>();
    let runIds: string[] = [];
    const flushRun = () => {
      if (runIds.length === 0) return;
      const count = runIds.length;
      runIds.forEach((id, idx) =>
        info.set(id, { isLast: idx === count - 1, runCount: count }),
      );
      runIds = [];
    };
    for (const m of displayMessages) {
      if (isLocationPingMessage(m)) runIds.push(m.id);
      else flushRun();
    }
    flushRun();
    return info;
  }, [displayMessages]);

  const senderKey = useCallback(
    (m: TripMessageRow) =>
      m.sender_role === "driver" ? "__self__" : tripChatMessageSenderKey(m),
    [],
  );

  const mediaBurstIndex = useMemo(
    () =>
      buildChatMediaBurstIndex(displayMessages, {
        senderKey,
      }),
    [displayMessages, senderKey],
  );

  const slackGroupMeta = useMemo(
    () =>
      buildSlackMessageGroupMap(displayMessages, {
        isGroupable: isSlackGroupableTripMessage,
        senderKey,
        createdAt: (m) => m.created_at,
      }),
    [displayMessages, senderKey],
  );

  // Stable refs so renderTripMessage's useCallback doesn't re-create on every
  // message update (Maps are new instances each render but the callback only
  // needs to READ the current value, not capture it as a closure dep).
  const mediaBurstIndexRef = useRef(mediaBurstIndex);
  mediaBurstIndexRef.current = mediaBurstIndex;
  const slackGroupMetaRef = useRef(slackGroupMeta);
  slackGroupMetaRef.current = slackGroupMeta;

  const merged = useMemo((): ThreadRow[] => {
    const items: ThreadRow[] = [];
    for (const m of displayMessages) {
      if (mediaBurstIndex.skipIds.has(m.id)) continue;
      items.push({ key: `m-${m.id}`, kind: "msg", m });
    }
    statusNotes.forEach((u, i) => {
      if (isStatusNoteRedundantWithChat(u, messages)) return;
      items.push({
        key: `s-${u.timestamp}-${i}-${u.message.slice(0, 12)}`,
        kind: "status",
        u,
      });
    });
    items.sort((a, b) => {
      // Date.parse() avoids allocating a Date object on every comparison.
      const ta = a.kind === "msg" ? Date.parse(a.m.created_at) : Date.parse(a.u.timestamp);
      const tb = b.kind === "msg" ? Date.parse(b.m.created_at) : Date.parse(b.u.timestamp);
      return ta - tb;
    });
    return items;
  }, [displayMessages, mediaBurstIndex.skipIds, messages, statusNotes]);

  useEffect(() => {
    didInitialScrollRef.current = false;
    mergedCountRef.current = 0;
  }, [conversationId]);

  useEffect(() => {
    if (messagesLoading || merged.length === 0) return;
    const isNewMessage = merged.length > mergedCountRef.current;
    mergedCountRef.current = merged.length;
    if (!didInitialScrollRef.current || isNewMessage) {
      didInitialScrollRef.current = true;
      requestAnimationFrame(() => {
        listRef.current?.scrollToEnd({ animated: isNewMessage && merged.length > 1 });
      });
    }
  }, [messagesLoading, merged.length]);

  const flowStep = trip ? deriveDriverFlowStepFromTrip(trip) : "completed";
  const predefinedForStep = DRIVER_PREDEFINED_STATUS_BY_STEP[flowStep] ?? [];

  const sendStatusLine = async (label: string) => {
    if (!trip || flowStep === "completed") return;
    setStatusSending(label);
    const res = await appendDriverStatusNote(trip.id, flowStep, label);
    if (!res.error) {
      const { trip: next } = await tripsService.getTripById(tripId);
      if (next) setTrip(next);
      try {
        await onSendTripChat(label);
      } catch {
        // Notes updated; chat row may fail independently
      }
    }
    setStatusSending(null);
  };

  const handleOpenAttach = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Allow photo library access to share images in chat.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 1,
    });
    if (result.canceled || !result.assets?.[0]) return;

    const localUri = result.assets[0].uri;
    const senderName = profile?.full_name ?? "Driver";
    const tempId = `opt-${Date.now()}`;
    const optimistic: TripMessageRow = {
      id: tempId,
      conversation_id: conversationId,
      organization_id: organizationId,
      sender_user_id: selfUid ?? "",
      sender_role: "driver",
      sender_name: senderName,
      content: "Photo",
      message_type: "image",
      is_read: true,
      read_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      metadata: {
        local_uri: localUri,
        storage_path: "",
        mime_type: "image/jpeg",
      } as unknown as TripMessageRow["metadata"],
    };

    const msgKey = driverChatMessagesQueryKey(conversationId);
    queryClient.setQueryData<InfiniteData<DriverChatMessagesPage>>(
      msgKey,
      (old) => appendDriverChatMessageToCache(old, optimistic),
    );
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 60);

    setUploading(true);
    try {
      const { storagePath, thumbUrl } = await compressAndUploadChatImage(
        localUri,
        conversationId,
      );
      const persisted = await chatService.sendChatMessage({
        conversationId,
        organizationId,
        content: "Photo",
        senderRole: "driver",
        senderName,
        senderUserId: selfUid,
        messageType: "document_share",
        metadata: {
          document_name: "Photo",
          document_type: "Photo",
          storage_path: storagePath,
          mime_type: "image/jpeg",
          ...(thumbUrl ? { thumb_url: thumbUrl } : {}),
        },
      });
      queryClient.setQueryData<InfiniteData<DriverChatMessagesPage>>(
        msgKey,
        (old) => replaceDriverChatMessageInCache(old, tempId, persisted),
      );
      void queryClient.invalidateQueries({
        predicate: (q) =>
          Array.isArray(q.queryKey) &&
          q.queryKey[0] === "q" &&
          q.queryKey[1] === "driver-chat" &&
          q.queryKey[2] === "conversations",
      });
    } catch (err: unknown) {
      queryClient.setQueryData<InfiniteData<DriverChatMessagesPage>>(
        msgKey,
        (old) => removeDriverChatMessageFromCache(old, tempId),
      );
      Alert.alert(
        "Upload failed",
        err instanceof Error ? err.message : "Could not upload image.",
      );
    } finally {
      setUploading(false);
    }
  }, [conversationId, organizationId, profile, selfUid, queryClient]);

  const ownAvatar: ResolvedPartyAvatarIdentity = useMemo(
    () => ({
      displayName: selfName,
      entityType: "driver",
    }),
    [selfName],
  );

  const fleetAvatar: ResolvedPartyAvatarIdentity = useMemo(
    () => ({
      displayName: fleetName?.trim() || "Fleet",
      entityType: "client",
    }),
    [fleetName],
  );

  const renderTripMessage = useCallback(
    (m: TripMessageRow) => {
      if (m.is_deleted) {
        return (
          <View style={localStyles.deletedRow}>
            <Text style={localStyles.deletedText}>This message was deleted.</Text>
          </View>
        );
      }
      if (isStageRevokeChatMessage(m)) {
        return <ChatStageRevokeCard message={m} />;
      }
      if (
        m.message_type === "system" ||
        m.message_type === "update" ||
        m.message_type === "status_change"
      ) {
        if (!isLocationPingMessage(m)) {
          return <ChatSystemEventCard message={m} isMobile />;
        }
      }
      const own = m.sender_role === "driver";
      const burstLeader = mediaBurstIndexRef.current.leaders.get(m.id);
      if (burstLeader) {
        const burstIsNew = burstLeader.messages.some(
          (msg) => Date.parse(msg.created_at) > mountedAtMs,
        );
        return (
          <ChatMediaBurstRow
            burst={burstLeader}
            senderName={own ? selfName : m.sender_name?.trim() || "Fleet"}
            timestamp={m.created_at}
            avatar={own ? ownAvatar : fleetAvatar}
            isOwn={own}
            userName={selfName}
            userAvatarUrl={profile?.avatar_url ?? null}
            userAvatarSeed={profile?.avatar_seed ?? null}
            userOrgLogoUrl={currentOrganization?.logo_url ?? null}
            variant="mobile"
            group={slackGroupMetaRef.current.get(m.id)}
            isNew={burstIsNew}
          />
        );
      }

      if (isLocationPingMessage(m)) {
        const pingInfo = locationPingRunInfo.get(m.id);
        if (pingInfo && !pingInfo.isLast) return null;
        const loc = parseSystemLogLocationData(m);
        return (
          <ChatLocationSystemCard
            message={m}
            location={loc}
            isMobile
            isOwnDriverSend={own}
            driverAppPresentation
            consolidatedCount={pingInfo?.runCount ?? 1}
            tripHint={{
              pickupArea: trip?.pickup_area ?? null,
              dropLocation: trip?.drop_location ?? null,
              status: trip?.status ?? null,
            }}
          />
        );
      }

      if (m.message_type === "image") {
        const meta = m.metadata as { storage_path?: string; local_uri?: string } | null;
        const localUri = String(meta?.local_uri ?? "").trim();
        const storagePath =
          String(meta?.storage_path ?? "").trim() || (m.content ?? "").trim();
        if (localUri && !String(meta?.storage_path ?? "").trim()) {
          return (
            <DriverSlackUploadingImageRow
              localUri={localUri}
              selfName={selfName}
              ownAvatar={ownAvatar}
              profile={profile}
              currentOrganization={currentOrganization}
              group={slackGroupMetaRef.current.get(m.id)}
            />
          );
        }
        if (storagePath) {
          return (
            <DriverSlackImageRow
              message={m}
              storagePath={storagePath}
              own={own}
              selfName={selfName}
              ownAvatar={ownAvatar}
              fleetAvatar={fleetAvatar}
              fleetName={fleetName}
              profile={profile}
              currentOrganization={currentOrganization}
              group={slackGroupMetaRef.current.get(m.id)}
            />
          );
        }
      }

      if (m.message_type === "document_share") {
        const doc = resolveDocumentShareDisplay(m);
        if (doc?.isImage && doc.storagePath) {
          return (
            <DriverSlackImageRow
              message={m}
              storagePath={doc.storagePath}
              own={own}
              selfName={selfName}
              ownAvatar={ownAvatar}
              fleetAvatar={fleetAvatar}
              fleetName={fleetName}
              profile={profile}
              currentOrganization={currentOrganization}
              group={slackGroupMetaRef.current.get(m.id)}
            />
          );
        }
        return (
          <DriverSlackDocumentRow
            message={m}
            own={own}
            selfName={selfName}
            ownAvatar={ownAvatar}
            fleetAvatar={fleetAvatar}
            fleetName={fleetName}
            profile={profile}
            currentOrganization={currentOrganization}
            group={slackGroupMetaRef.current.get(m.id)}
          />
        );
      }

      if (m.message_type === "ledger_event") return null;

      if (isMissionDebriefMessage(m)) {
        const shipperName =
          (trip?.client_name ?? "").trim() ||
          (trip?.supplier_name ?? "").trim() ||
          (fleetName ?? "").trim() ||
          "this shipper";
        return (
          <ChatFeedbackCard
            message={m}
            tripId={tripId}
            audience="driver"
            targetNameOverride={shipperName}
            onSubmitted={() => {
              void queryClient.invalidateQueries({
                queryKey: driverChatMessagesQueryKey(conversationId),
              });
              void queryClient.invalidateQueries({
                queryKey: ["q", "driver-chat", "conversations"],
              });
            }}
          />
        );
      }

      const peerLabel = m.sender_name?.trim() || fleetName?.trim() || "Fleet";
      const peerAvatar = fleetAvatar;

      return (
        <ChatSlackMessageRow
          senderName={own ? selfName : peerLabel}
          content={stripChatPreviewEmojiPrefix(m.content)}
          timestamp={m.created_at}
          avatar={own ? ownAvatar : peerAvatar}
          isOwn={own}
          userName={selfName}
          userAvatarUrl={profile?.avatar_url ?? null}
          userAvatarSeed={profile?.avatar_seed ?? null}
          userOrgLogoUrl={currentOrganization?.logo_url ?? null}
          variant="mobile"
          group={slackGroupMetaRef.current.get(m.id)}
          isNew={Date.parse(m.created_at) > mountedAtMs}
        />
      );
    },
    // mediaBurstIndexRef and slackGroupMetaRef are stable refs — omit from deps.
    [
      mountedAtMs,
      selfName,
      ownAvatar,
      fleetAvatar,
      profile,
      currentOrganization,
      fleetName,
      trip,
      tripId,
      conversationId,
      queryClient,
      locationPingRunInfo,
    ],
  );

  const renderThreadRow = useCallback(
    ({ item }: { item: ThreadRow }) => {
      if (item.kind === "status") {
        if (isStageRevokeStatusNote(item.u.message)) {
          return (
            <ChatStageRevokeCard
              message={
                {
                  id: `note-revoke-${item.u.timestamp}-${item.u.message}`,
                  content: item.u.message,
                  created_at: item.u.timestamp,
                  message_type: "system",
                  metadata: null,
                } as TripMessageRow
              }
              noteFallback={{
                message: item.u.message,
                at: item.u.timestamp,
                driverName: selfName,
              }}
            />
          );
        }
        return (
          <View style={slackSt.threadSysMsg}>
            <Text style={slackSt.threadSysMsgText}>{item.u.message}</Text>
          </View>
        );
      }
      return renderTripMessage(item.m);
    },
    [renderTripMessage, selfName],
  );

  const threadListFooter = useMemo(
    () => <ChatHistoryExpiryNotice slackLayout />,
    [],
  );

  const routeSubtitle = `${pickupArea || trip?.pickup_area || ""}${
    dropLocation || trip?.drop_location ? ` → ${dropLocation || trip?.drop_location}` : ""
  }`.trim();
  const tripDateLabel = (() => {
    const raw = String(trip?.pickup_date ?? trip?.created_at ?? "").trim();
    if (!raw) return "";
    try {
      const d = new Date(raw);
      if (Number.isNaN(d.getTime())) return "";
      return d.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    } catch {
      return "";
    }
  })();
  const idLine = [tripNumber || trip?.trip_number, tripDateLabel].filter(Boolean).join(" · ");

  const tripChrome = useMemo(
    () =>
      resolveDriverChatFeedbackChrome({
        trip_status: trip?.status ?? null,
        trip_feedback_status: undefined,
        messages,
        last_message_preview: null,
      }),
    [trip?.status, messages],
  );
  const headerFeedbackMessage = useMemo(
    () => findLatestMissionDebriefMessage(messages),
    [messages],
  );
  const feedbackTargetName =
    (trip?.client_name ?? "").trim() ||
    (trip?.supplier_name ?? "").trim() ||
    (fleetName ?? "").trim() ||
    "this shipper";

  const composerBottomPad = keyboardOpen
    ? 8
    : Math.max(insets.bottom + bottomTabClearance, 12);

  const composerDock = (
    <View
      style={[
        localStyles.composerDock,
        { paddingBottom: composerBottomPad },
        Platform.OS === "android" &&
          keyboardInset > 0 && {
            paddingBottom: Math.max(keyboardInset, 8),
          },
      ]}
    >
      {predefinedForStep.length > 0 ? (
        <View style={localStyles.quickStatusBlock}>
          <Text style={localStyles.quickStatusLabel}>Quick status</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={localStyles.quickStatusChipRow}
            keyboardShouldPersistTaps="handled"
          >
            {predefinedForStep.map((label) => (
              <TouchableOpacity
                key={label}
                style={[
                  localStyles.quickStatusChip,
                  statusSending === label && localStyles.quickStatusChipBusy,
                ]}
                onPress={() => void sendStatusLine(label)}
                disabled={!!statusSending || !trip}
                activeOpacity={0.75}
              >
                {statusSending === label ? (
                  <ActivityIndicator size="small" color={Theme.primary} />
                ) : (
                  <Text style={localStyles.quickStatusChipText} numberOfLines={2}>
                    {label}
                  </Text>
                )}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      ) : null}
      <ChatMobileComposer
        variant="slack"
        value={messageInput}
        onChangeText={setMessageInput}
        onSend={onSend}
        onOpenAttach={uploading ? undefined : handleOpenAttach}
        quickMessages={DRIVER_QUICK_MESSAGES}
        hideQuickChips={keyboardOpen}
        placeholder={uploading ? "Uploading image…" : `Message ${fleetName?.trim() || "fleet"}`}
      />
    </View>
  );

  const threadBody = (
    <View style={localStyles.threadShell}>
      <ChatSlackThreadHeader
        title={routeSubtitle || tripNumber || trip?.trip_number || "Trip"}
        subtitle={routeSubtitle ? idLine || undefined : undefined}
        avatarIdentity={fleetAvatar}
        onBack={onBack}
        compactRoleTag={driverRoleTag}
        topInset={insets.top}
        contentPaddingHorizontal={DRIVER_CHAT_EDGE}
        tripKind={tripChrome.tripKind}
        showFeedbackStar={tripChrome.showStar}
        feedbackStarFilled={tripChrome.starFilled}
        feedbackStarScore={tripChrome.starScore}
        onPressFeedbackStar={() => setFeedbackOpen(true)}
      />
      {uploading ? (
        <View style={localStyles.uploadBar}>
          <ActivityIndicator size="small" color={Theme.primary} />
          <Text style={localStyles.uploadBarText}>Uploading photo…</Text>
        </View>
      ) : null}

      <FlashList
        ref={listRef}
        data={merged}
        keyExtractor={(row) => row.key}
        renderItem={renderThreadRow}
        getItemType={getThreadItemType}
        drawDistance={400}
        style={localStyles.threadScroll}
        contentContainerStyle={slackSt.threadMsgsContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        onScroll={(e) => {
          if (!hasOlder || isFetchingOlder) return;
          if (e.nativeEvent.contentOffset.y < 80) void loadOlder();
        }}
        scrollEventThrottle={200}
        ListHeaderComponent={
          isFetchingOlder ? (
            <View style={localStyles.centeredCompact}>
              <LoadingIndicator size="small" color="#94a3b8" />
            </View>
          ) : null
        }
        ListEmptyComponent={
          messagesLoading && merged.length === 0 ? (
            <View style={localStyles.centered}>
              <LoadingIndicator size="small" color={Theme.primary} />
            </View>
          ) : (
            <View style={slackSt.threadSysMsg}>
              <Text style={slackSt.threadSysMsgText}>
                No messages yet — use quick status or reply below.
              </Text>
            </View>
          )
        }
        ListFooterComponent={merged.length > 0 ? threadListFooter : null}
      />
      {composerDock}
    </View>
  );

  const feedbackModal = (
    <DriverShipperFeedbackModal
      visible={feedbackOpen}
      onClose={() => setFeedbackOpen(false)}
      tripId={tripId}
      message={headerFeedbackMessage}
      targetName={feedbackTargetName}
      onSubmitted={() => {
        void queryClient.invalidateQueries({
          queryKey: driverChatMessagesQueryKey(conversationId),
        });
        void queryClient.invalidateQueries({
          queryKey: ["q", "driver-chat", "conversations"],
        });
      }}
    />
  );

  if (Platform.OS === "ios") {
    return (
      <KeyboardAvoidingView
        style={localStyles.root}
        behavior="padding"
        keyboardVerticalOffset={insets.top}
      >
        {threadBody}
        {feedbackModal}
      </KeyboardAvoidingView>
    );
  }

  return (
    <View style={localStyles.root}>
      {threadBody}
      {feedbackModal}
    </View>
  );
}

const localStyles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  threadShell: {
    flex: 1,
    minHeight: 0,
    backgroundColor: "#FFFFFF",
  },
  threadScroll: {
    flex: 1,
    minHeight: 0,
  },
  composerDock: {
    backgroundColor: "#FFFFFF",
    flexShrink: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(24, 28, 50, 0.08)",
    paddingTop: 4,
  },
  centered: { paddingVertical: 24, alignItems: "center" },
  centeredCompact: { paddingVertical: 8, alignItems: "center" },
  quickStatusBlock: {
    paddingHorizontal: DRIVER_CHAT_EDGE,
    paddingTop: 6,
    paddingBottom: 2,
    backgroundColor: "#FFFFFF",
  },
  quickStatusLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: "#94a3b8",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  quickStatusChipRow: { gap: 8, paddingBottom: 4 },
  quickStatusChip: {
    maxWidth: 200,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: "rgba(91, 94, 244, 0.06)",
    borderWidth: 1,
    borderColor: "rgba(91, 94, 244, 0.2)",
    minHeight: 40,
    justifyContent: "center",
  },
  quickStatusChipBusy: { opacity: 0.7 },
  quickStatusChipText: {
    fontSize: 11,
    color: "#4B4ACF",
    fontWeight: "600",
  },
  uploadBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: DRIVER_CHAT_EDGE,
    paddingVertical: 6,
    backgroundColor: "rgba(91, 94, 244, 0.06)",
  },
  uploadBarText: { fontSize: 12, color: "#64748b", fontWeight: "500" },
  imageBody: {
    alignSelf: "flex-start",
    width: "100%",
    maxWidth: "100%",
  },
  uploadShell: {
    width: "100%",
    maxWidth: 280,
    aspectRatio: 4 / 3,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: "#e5e7eb",
  },
  uploadImg: { width: "100%", height: "100%" },
  uploadOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  deletedRow: {
    paddingHorizontal: DRIVER_CHAT_EDGE,
    paddingVertical: 8,
  },
  deletedText: {
    fontSize: 12,
    fontStyle: "italic",
    color: "#94a3b8",
    fontWeight: "500",
  },
});
