import { LoadingIndicator } from "@/components/LoadingIndicator";
import { ChatPartyAvatar } from "@/features/chat/components/ChatPartyAvatar";
import { useNetworkStoryStrip } from "@/features/network/hooks/useNetworkStoryStrip";
import {
  isDriverSwapPreviewMessage,
  resolveDriverSwapAvatars,
  resolveNetworkPartnerAvatar,
  resolveTripConversationAvatar,
  resolveTripRoomDriverAvatar,
  resolveTripMessagePeerAvatar,
  stripChatPreviewEmojiPrefix,
  viewerIsLinkedTripClientViewer,
  viewerIsLinkedTripSupplierViewer,
  type ChatOrgBranding,
  type TripConversationAvatarViewerContext,
  type DriverSwapPair,
  type SystemUpdateDriverContext,
} from "@/features/chat/utils/chatAvatar.util";
import type { ResolvedPartyAvatarIdentity } from "@/lib/entityIdentity";
import { chatFilterChromeStyles } from "@/constants/ChatFilterChrome";
import Theme from "@/constants/Theme";
import { ROUTES } from "@/lib/routes";
import { WEB_APP_VIEWPORT_STYLE } from "@/lib/webViewportHeight";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import {
  CHAT_ACCENT,
  CHAT_ACCENT_BORDER,
  CHAT_ACCENT_SOFT,
  CHAT_ICON_MUTED,
  CHAT_INCOMING_BUBBLE,
  CHAT_SEND_BG,
  CHAT_TEXT_MUTED,
  CHAT_TEXT_PRIMARY,
  CHAT_TEXT_SECONDARY,
  CHAT_THREAD_BG,
} from "@/features/chat/chatTheme";
import {
  CHAT_MOBILE,
  isChatMobileLayout,
  isChatNativeMobile,
  mobileWebComposerReservePx,
} from "@/features/chat/chatMobileLayout";
import {
  dockPaddingBottom,
  effectiveKeyboardInset,
  useKeyboardVisible,
} from "@/lib/hooks/useKeyboardVisible";
import { ChatMobileComposer } from "@/features/chat/components/ChatMobileComposer";
import { ChatSlackMirrorToggle } from "@/features/chat/components/shared/ChatSlackMirrorToggle";
import { SLACK_STREAM_TABS } from "@/features/chat/components/shared/chatSlackStreamTabs";
import {
  buildSlackMessageGroupMap,
  isSlackGroupableTripMessage,
  type SlackMessageGroupMeta,
} from "@/features/chat/utils/slackMessageGroup.util";
import {
  buildChatMediaBurstIndex,
  resolveTrailingMediaBurstSummary,
  tripChatMessageSenderKey,
} from "@/features/chat/utils/chatMediaBurst.util";
import { ChatAnimatedEmoji } from "@/features/chat/components/shared/ChatAnimatedEmoji";
import { ChatListPreviewText } from "@/features/chat/components/shared/ChatListPreviewText";
import { ChatMediaBurstRow } from "@/features/chat/components/shared/ChatMediaBurstRow";
import { CHAT_DESKTOP_COMPOSER_EMOJIS } from "@/features/chat/utils/chatEmojiAnim.util";
import {
  collectTrailingImagePreviews,
  type ConversationImagePreview,
} from "@/features/chat/utils/conversationImagePreview.util";
import { chatListThumbFetch } from "@/features/chat/utils/chatPreviewTransform.util";
import { peekChatImageThumbnailUrl } from "@/features/chat/utils/resolveChatDocumentUrl.util";
import {
  ChatSlackInboxToolbar,
  ChatSlackListHeader,
  ChatSlackListRow,
  ChatSlackBottomNav,
  CHAT_SLACK_BOTTOM_NAV_BAR,
  ChatSlackPartyRecommendedDivider,
  ChatSlackPartyRecommendedHeader,
  ChatSlackPeopleStrip,
  ChatSlackThreadHeader,
  type SlackFilterChipDef,
  type SlackPeopleItem,
  type SlackStreamTabId,
} from "@/features/chat/components/mobile/ChatSlackMobileChrome";
import { StoryReel } from "@/features/network/components/StoryReel";
import { ChatSlackMessageRow } from "@/features/chat/components/mobile/ChatSlackMessageRow";
import {
  SLACK_CHAT_LIST_PROPS,
  slackMobileStyles as slackSt,
} from "@/features/chat/components/mobile/chatSlackMobile.styles";
import { ChatSlackDesktopComposer } from "@/features/chat/components/desktop/ChatSlackDesktopComposer";
import {
  ChatSlackDesktopSidebarChrome,
  ChatSlackDesktopSidebarRow,
  ChatSlackDesktopThreadHeader,
} from "@/features/chat/components/desktop/ChatSlackDesktopChrome";
import {
  slackDesktopStyles as deskSt,
  SLACK_DESKTOP,
} from "@/features/chat/components/desktop/chatSlackDesktop.styles";
import { ChatDateDivider } from "@/features/chat/components/shared/ChatDateDivider";
import { ChatHistoryExpiryNotice } from "@/features/chat/components/shared/ChatHistoryExpiryNotice";
import { ChatUnreadDivider } from "@/features/chat/components/shared/ChatUnreadDivider";
import { ChatTypingIndicator } from "@/features/chat/components/shared/ChatTypingIndicator";
import type { ReplyPreviewData } from "@/features/chat/components/shared/ChatReplyPreview";
import type { ChatReactions } from "@/features/chat/components/shared/ChatReactionsRow";
import { useChatTypingPresence } from "@/features/chat/hooks/useChatTypingPresence";
import { toggleMessageReaction, updateChatMessageContent, deleteChatMessage } from "@/features/chat/services/chat.service";
import { toggleReactionOptimistic } from "@/features/chat/utils/toggleReactionOptimistic.util";
import { MessageTick } from "@/features/chat/components/MessageTick";
import { CHAT_TEAM_ROOMS_SIDEBAR_ENABLED } from "@/features/chat/constants/chatPlatform.flags";
import { ChatTripRoomInboxSection } from "@/features/chat/components/ChatTripRoomInboxSection";
import { TripChatRoomSheet } from "@/features/chat/components/TripChatRoomSheet";
import {
  isTripDetailTeamTab,
  isTripTeamRoomTabEligible,
  TRIP_DETAIL_TEAM_TAB_ID,
} from "@/features/chat/utils/tripTeamRoomTab.util";
import { SystemEventCard } from "@/features/chat/components/SystemEventCard";
import {
  INTEGRATED_QUICK_MESSAGES,
  IntegratedChat,
  useOptionalIntegratedChat,
  type NetworkPartner,
} from "@/features/chat/contexts/IntegratedChatContext";
import {
  QUICK_MESSAGES,
  TripConversation,
  useTripChat,
} from "@/features/chat/contexts/TripChatContext";
import { useMarkSeen } from "@/features/chat/hooks/useMarkSeen";
import {
  getMessagesByConversation,
  getTripsForCompose,
  getTripsForComposeByIds,
  sendDocumentShareMessage,
  TRIP_CHAT_HISTORY_PAGE,
  type TripForCompose,
} from "@/features/chat/services/chat.service";
import {
  confirmLedgerToAccountingBooks,
  disputeLedgerEventMessage,
} from "@/features/chat/services/chatLedgerBridge.service";
import { chatStore, useConversation, useConversationsByTrip, useTripMeta } from "@/features/chat/store/chatStore";
import {
  resolveCounterpartyPartyTypeForViewer,
  resolveOutgoingDeliveryStatus,
  useChatStore,
  type TripEntry,
} from "@/features/chat/store/useChatStore";
import { setActiveTripMessageConversationId } from "@/features/chat/realtime/activeTripMessageScope";
import { useAssignmentAuditNameMaps } from "@/features/chat/hooks/useAssignmentAuditNameMaps";
import { mergeAssignmentAuditIntoTripMessages } from "@/features/chat/utils/assignmentAuditChatMessages.util";
import { buildThreadListLayoutMeta } from "@/features/chat/utils/chatMessageListLayout";
import { applyContractualHubPartyIsolation } from "@/features/chat/utils/contractHubPartyIsolation.util";
import { dedupeTripStatusBroadcastsForLane } from "@/features/chat/utils/dedupeTripStatusBroadcastForLane.util";
import {
  formatChatPartyInboxLine,
  formatChatPartyName,
  formatChatPartyStripLabel,
  formatChatPartyTypeLabel,
  resolveChatPartyDisplayName,
} from "@/features/chat/utils/partyDisplay";
import {
  isHubActiveTripStatus,
  isOperationalTripChatStatus,
  isTerminalTripStatus,
  isTripFeedbackEligibleStatus,
} from "@/features/chat/utils/tripConversationSort";
import {
  buildMobileTripInboxRows,
  conversationMatchesPartyPeopleKey,
  partitionTripConversationsByPartyFocus,
  pickRecommendedTripConversation,
  tripPartyPeopleKey,
  type MobileTripInboxRow,
} from "@/features/chat/utils/tripPartyPeopleKey.util";
import {
  getTripDisplayNumber,
  type TripRow,
} from "@/features/trips/services/trips.service";
import { getTripOperationalDisplay } from "@/features/operations/display";
import { useTripAssignmentAuditHistoryQuery } from "@/lib/queries/useTripsQuery";
import { useNetworkFeedQuery } from "@/lib/queries/usePostsQuery";
import { useLinkedOrgDisplayMap } from "@/lib/queries/useLinkedOrgDisplayQuery";
import { isAggregateTrip } from "@/features/drivers/utils/driverUtils.util";
import type { ActiveTripSummary } from "@/lib/globalSync/types";
import { useGlobalSyncStore } from "@/lib/globalSync/useGlobalSyncStore";
import {
  clearLedgerBookPending,
  markLedgerBookPending,
} from "@/lib/ledgerBookPendingStore";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import LottieView from "lottie-react-native";
import type { LottieSource } from "@/lib/lottieSource";
import {
  ArrowLeft,
  Briefcase,
  ChevronDown,
  ChevronRight,
  FileType,
  Hash,
  MessageSquare,
  MoreVertical,
  Plus,
  Search,
  Smile,
  Truck,
  User,
  Users,
  X,
} from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { NativeScrollEvent, NativeSyntheticEvent } from "react-native";
import {
  Alert,
  Animated,
  Easing,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type {
  ConversationPartyType,
  LedgerEventMetadata,
  MessageDeliveryStatus,
  TripMessageRow,
} from "../types/chat.types";
import { isMessageVisibleInTab } from "../types/chat.types";
import { pe } from "@/lib/platformViewStyle.util";
import { commandPriorityScore } from "../utils/commandPriority.util";
import { ledgerEventInvolvesOrg } from "../utils/ledgerVisibility.util";
import {
  parseMessageLocationData,
  parseSystemLogLocationData,
} from "../utils/locationLogPayload.util";
import { resolveDocumentShareDisplay } from "../utils/documentShareDisplay.util";
import { normalizeTripDocumentsStoragePath } from "../utils/resolveChatDocumentUrl.util";
import {
  buildLocationPingInboxPreviewText,
  isLocationPingMessage,
  isSimulatedLocationPing,
  type LocationPingTripHint,
} from "../utils/locationPingChatDisplay.util";
import { ChatLedgerEventCard, ChatSystemEventCard, buildChatRouteContextLabel } from "./ChatEventCard";
import { ChatLocationSystemCard } from "./ChatLocationSystemCard";
import { DocumentShareCard } from "./DocumentShareCard";
import {
  DocumentShareSheet,
  type DocumentSharePayload,
} from "./DocumentShareSheet";
import { getTripAssetsForChatHub } from "../services/chatDocumentHub.service";
import { isLongHaulLateChatMessage, LateAlertCard } from "./LateAlertCard";
import { TripCard } from "./TripCard";

type TabId = "trips" | "indent" | "network";

/** Hub/mission-bar party tab: rowType finds the conversation row; displayType drives icon + label. */
type HubPartyTab = {
  rowType: ConversationPartyType;
  displayType: ConversationPartyType;
};

function isTripStreamTab(tab: TabId): boolean {
  return tab === "trips" || tab === "indent";
}

const TRIP_PARTY_FILTERS: ConversationPartyType[] = ["client", "driver", "supplier"];

function Badge({ count }: { count: number }) {
  if (!count) return null;
  return (
    <View style={b.wrap}>
      <Text style={b.text}>{count > 9 ? "9+" : String(count)}</Text>
    </View>
  );
}
const b = StyleSheet.create({
  wrap: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: CHAT_ACCENT,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  text: { fontSize: 10, fontWeight: "800", color: "#fff" },
});

function PartyIcon({
  partyType,
  active,
  size = 16,
  tone = "list",
  inactiveOnDarkCard,
}: {
  partyType: ConversationPartyType;
  active?: boolean;
  size?: number;
  /** `hub`: selected party = dark icon on light chip. `list`: selected = white on dark list row. */
  tone?: "list" | "hub";
  /** Hub row selected (dark card) but this party tab not selected — icon on slate chip. */
  inactiveOnDarkCard?: boolean;
}) {
  const color = active
    ? tone === "hub"
      ? "#0b1220"
      : "#fff"
    : inactiveOnDarkCard
      ? "rgba(248,250,252,0.88)"
      : CHAT_ICON_MUTED;
  if (partyType === "client") return <Briefcase size={size} color={color} />;
  if (partyType === "supplier") return <Truck size={size} color={color} />;
  return <User size={size} color={color} />;
}

function partyLabel(type: ConversationPartyType) {
  return type === "client" ? "CLIENT" : type === "supplier" ? "SUPPLIER" : "DRIVER";
}

function trimPreviewText(raw: string | null | undefined): string {
  return String(raw ?? "").trim();
}

type ConversationPreviewKind =
  | "default"
  | "system"
  | "image"
  | "document"
  | "data"
  | "html"
  | "driver_swap"
  | "location";

type ConversationPreviewModel = {
  text: string;
  kind: ConversationPreviewKind;
  imageUrl?: string | null;
  imagePreviews?: ConversationImagePreview[];
  documentName?: string | null;
  documentExtension?: string | null;
  documentIsImage?: boolean;
  driverSwap?: DriverSwapPair | null;
};

function compactPreviewText(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

function stripHtmlForPreview(raw: string): string {
  return compactPreviewText(raw.replace(/<[^>]*>/g, " "));
}

function isLikelyHtml(raw: string): boolean {
  return /<\/?[a-z][\s\S]*>/i.test(raw);
}

function normalizePreviewText(raw: string): string {
  const clean = trimPreviewText(raw);
  if (!clean) return "";
  return isLikelyHtml(clean) ? stripHtmlForPreview(clean) : compactPreviewText(clean);
}

function isLikelyDataPayload(raw: string): boolean {
  const value = trimPreviewText(raw);
  if (!value) return false;
  if (value.startsWith("{") || value.startsWith("[")) return true;
  return false;
}

function summarizeDataPayload(raw: string): string {
  const value = trimPreviewText(raw);
  if (!value) return "Data update";
  try {
    const parsed = JSON.parse(value) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const keys = Object.keys(parsed as Record<string, unknown>).slice(0, 3);
      if (keys.length > 0) return `Data update · ${keys.join(" · ")}`;
      return "Data update";
    }
    if (Array.isArray(parsed)) return `Data update · ${parsed.length} items`;
  } catch {
    // Keep non-fatal: raw text fallback is used below.
  }
  const normalized = normalizePreviewText(value);
  return normalized || "Data update";
}

function resolveTripImagePreviewUrl(message: TripMessageRow | null | undefined): string | null {
  if (!message || message.message_type !== "image") return null;
  const metadata =
    message.metadata && typeof message.metadata === "object"
      ? (message.metadata as Record<string, unknown>)
      : null;
  const storagePath = typeof metadata?.["storage_path"] === "string" ? metadata.storage_path : "";
  if (storagePath && !/^https?:\/\//i.test(storagePath)) {
    const fetch = chatListThumbFetch(112);
    return peekChatImageThumbnailUrl(
      storagePath,
      fetch.width,
      fetch.height,
      fetch.quality,
      "cover",
    );
  }
  const rawContent = trimPreviewText(message.content);
  if (/^https?:\/\//i.test(rawContent)) return rawContent;
  return null;
}

function resolveLocationPingPreviewModel(
  message: TripMessageRow,
  tripHint?: LocationPingTripHint,
  consolidatedCount?: number,
): ConversationPreviewModel {
  const location =
    parseSystemLogLocationData(message) ?? parseMessageLocationData(message);
  return {
    text: buildLocationPingInboxPreviewText({
      location,
      message,
      tripHint,
      simulated: isSimulatedLocationPing(message),
      consolidatedCount,
    }),
    kind: "location",
  };
}

function previewFromTripMessage(
  message: TripMessageRow | null | undefined,
  tripHint?: LocationPingTripHint,
): ConversationPreviewModel {
  if (!message) return { text: "", kind: "default" };
  if (isLocationPingMessage(message)) {
    return resolveLocationPingPreviewModel(message, tripHint);
  }
  const fallback = normalizePreviewText(message.content);
  switch (message.message_type) {
    case "image":
      return {
        text: fallback || "Photo preview",
        kind: "image",
        imageUrl: resolveTripImagePreviewUrl(message),
      };
    case "document_share":
    case "document_upload": {
      const doc = resolveDocumentShareDisplay(message);
      const name = doc?.documentName || fallback.replace(/^Shared document:\s*/i, "").trim();
      const imageUrl =
        doc?.isImage && doc.storagePath
          ? (() => {
              const fetch = chatListThumbFetch(112);
              return peekChatImageThumbnailUrl(
                doc.storagePath,
                fetch.width,
                fetch.height,
                fetch.quality,
                "cover",
              );
            })()
          : null;
      return {
        text: name || "Document",
        kind: doc?.isImage ? "image" : "document",
        imageUrl,
        documentName: name || null,
        documentExtension: doc?.extension ?? null,
        documentIsImage: doc?.isImage ?? false,
      };
    }
    case "ledger_event":
    case "ledger":
    case "ledger_update":
    case "payment":
      return { text: fallback || "Payment data updated", kind: "data" };
    case "tracking":
    case "location_log":
      return resolveLocationPingPreviewModel(message, tripHint);
    case "assignment_update":
      return {
        text: stripChatPreviewEmojiPrefix(fallback) || "Assignment update",
        kind: "data",
      };
    case "status_change":
    case "system":
    case "update":
    case "system_log":
      if (fallback && isLikelyHtml(message.content)) {
        return { text: fallback, kind: "html" };
      }
      return { text: fallback || "System update", kind: "system" };
    default:
      if (fallback && isLikelyHtml(message.content)) return { text: fallback, kind: "html" };
      if (isLikelyDataPayload(message.content)) {
        return { text: summarizeDataPayload(message.content), kind: "data" };
      }
      return { text: fallback, kind: "default" };
  }
}

function isManualDriverSummaryMessage(message: TripMessageRow): boolean {
  const mt = String(message.message_type ?? "").toLowerCase();
  if (
    mt === "feedback_request" ||
    mt === "feedback" ||
    mt === "status_change" ||
    mt === "assignment_update" ||
    mt === "system" ||
    mt === "update" ||
    mt === "system_log" ||
    mt === "location_log" ||
    mt === "tracking" ||
    mt === "ledger_event" ||
    mt === "ledger" ||
    mt === "payment" ||
    mt === "ledger_update"
  ) {
    return false;
  }
  const senderRole = String(message.sender_role ?? "").toLowerCase();
  if (senderRole === "client" || senderRole === "supplier") return false;
  return true;
}

function resolveDriverSwapListPreview(
  message: TripMessageRow | null,
  composeTrip: { driver_id?: string | null; driver_display_name?: string | null; driver_avatar_url?: string | null; driver_avatar_seed?: string | null } | null | undefined,
  fallbackText?: string | null,
  driverProfiles?: SystemUpdateDriverContext["driverProfiles"],
): ConversationPreviewModel | null {
  const content = stripChatPreviewEmojiPrefix(
    (message?.content ?? fallbackText ?? "").trim(),
  );
  if (!content && !message) return null;

  const probe: Pick<TripMessageRow, "content" | "metadata" | "message_type"> = message ?? {
    content,
    metadata: null,
    message_type: "assignment_update",
  };
  if (!isDriverSwapPreviewMessage(probe)) return null;

  const driverSwap = resolveDriverSwapAvatars(probe, {
    composeTrip: composeTrip
      ? {
          driver_id: composeTrip.driver_id ?? null,
          driver_display_name: composeTrip.driver_display_name ?? null,
          driver_avatar_url: composeTrip.driver_avatar_url,
          driver_avatar_seed: composeTrip.driver_avatar_seed,
        }
      : composeTrip,
    driverProfiles,
  });
  if (!driverSwap) return null;

  return {
    text: content,
    kind: "driver_swap",
    driverSwap,
  };
}

function latestTripConversationPreview(
  item: TripConversation,
  options?: {
    manualDriverOnly?: boolean;
    composeTrip?: {
      driver_id?: string | null;
      driver_display_name?: string | null;
      driver_avatar_url?: string | null;
      driver_avatar_seed?: string | null;
    } | null;
    driverProfiles?: SystemUpdateDriverContext["driverProfiles"];
    tripHint?: LocationPingTripHint;
  },
): ConversationPreviewModel {
  const manualDriverOnly = options?.manualDriverOnly === true;
  let latest: TripMessageRow | null = null;
  for (let i = item.messages.length - 1; i >= 0; i -= 1) {
    const candidate = item.messages[i] as TripMessageRow;
    if (!candidate) continue;
    if (candidate.message_type === "feedback_request" || candidate.message_type === "feedback") {
      continue;
    }
    if (!isMessageVisibleInTab(candidate.message_type, item.party_type)) continue;
    if (manualDriverOnly && !isManualDriverSummaryMessage(candidate)) continue;
    latest = candidate;
    break;
  }
  const tripHint = options?.tripHint;
  const fromMessage = previewFromTripMessage(latest, tripHint);
  const burstSummary = resolveTrailingMediaBurstSummary(item.messages, {
    senderKey: tripChatMessageSenderKey,
    filterMessage: (candidate) => {
      if (
        candidate.message_type === "feedback_request" ||
        candidate.message_type === "feedback"
      ) {
        return false;
      }
      if (!isMessageVisibleInTab(candidate.message_type, item.party_type)) return false;
      if (manualDriverOnly && !isManualDriverSummaryMessage(candidate)) return false;
      return true;
    },
    maxSummaryLines: 3,
  });
  if (burstSummary && burstSummary.imagePreviews.length > 0) {
    const summaryText =
      burstSummary.summaryText ||
      fromMessage.text ||
      trimPreviewText(item.last_message_preview) ||
      "Photo";
    return {
      text: summaryText,
      kind: "image",
      imageUrl:
        burstSummary.imagePreviews[burstSummary.imagePreviews.length - 1]?.url ??
        fromMessage.imageUrl,
      imagePreviews: burstSummary.imagePreviews,
    };
  }
  const imagePreviews = collectTrailingImagePreviews(item.messages, {
    partyType: item.party_type,
    manualDriverOnly,
    isMessageVisible: isMessageVisibleInTab,
    isManualDriverMessage: isManualDriverSummaryMessage,
  });
  if (imagePreviews.length > 0) {
    return {
      ...fromMessage,
      text: fromMessage.text || "Photo",
      kind: "image",
      imageUrl: imagePreviews[imagePreviews.length - 1]?.url ?? fromMessage.imageUrl,
      imagePreviews,
    };
  }

  const driverSwapPreview = resolveDriverSwapListPreview(
    latest,
    options?.composeTrip,
    fromMessage.text || item.last_message_preview,
    options?.driverProfiles,
  );
  if (driverSwapPreview) return driverSwapPreview;

  if (fromMessage.text) {
    return fromMessage;
  }
  const fallback = trimPreviewText(item.last_message_preview);
  if (!manualDriverOnly) {
    const swapFromFallback = resolveDriverSwapListPreview(
      null,
      options?.composeTrip,
      fallback,
      options?.driverProfiles,
    );
    if (swapFromFallback) return swapFromFallback;
    if (/^Location ping\b/i.test(fallback)) {
      return {
        text: buildLocationPingInboxPreviewText({
          location: null,
          message: {
            content: fallback,
            created_at: item.last_message_at ?? new Date().toISOString(),
          },
          tripHint,
        }),
        kind: "location",
      };
    }
    if (isLikelyHtml(fallback)) return { text: stripHtmlForPreview(fallback), kind: "html" };
    if (isLikelyDataPayload(fallback)) return { text: summarizeDataPayload(fallback), kind: "data" };
    return { text: fallback, kind: "default" };
  }
  if (!fallback) return { text: "Driver chat", kind: "default" };
  const startsWithOrgRole = /^(client|supplier)\b[:\s·-]/i.test(fallback);
  const safeFallback = startsWithOrgRole ? "Driver chat" : fallback;
  return { text: normalizePreviewText(safeFallback), kind: "default" };
}

function previewFromNetworkContent(content: string | null | undefined): ConversationPreviewModel {
  const raw = trimPreviewText(content);
  if (!raw) return { text: "", kind: "default" };
  if (/\.(png|jpe?g|webp|gif)(\?.*)?$/i.test(raw) || /^https?:\/\/.+\.(png|jpe?g|webp|gif)(\?.*)?$/i.test(raw)) {
    return { text: "Photo preview", kind: "image", imageUrl: raw };
  }
  if (isLikelyHtml(raw)) return { text: stripHtmlForPreview(raw), kind: "html" };
  if (isLikelyDataPayload(raw)) return { text: summarizeDataPayload(raw), kind: "data" };
  return { text: normalizePreviewText(raw), kind: "default" };
}

function partyLabelReadable(type: ConversationPartyType) {
  return type === "client" ? "Client" : type === "supplier" ? "Supplier" : "Driver";
}

function partyFilterSheetLabel(type: ConversationPartyType): string {
  return type === "client" ? "Client" : type === "supplier" ? "Supplier" : "Driver";
}

function getConversationTripLabel(conversation: Pick<TripConversation, "trip_number" | "display_trip_id">): string {
  return getTripOperationalDisplay({
    trip_number: conversation["trip_number"],
    display_trip_id: conversation["display_trip_id"] ?? null,
  });
}

function formatTripStatusLabel(status: string | null | undefined): string {
  const raw = String(status ?? "").trim();
  if (!raw) return "ACTIVE";
  return raw.replace(/_/g, " ").toUpperCase();
}

/** Hub Active tab — same lifecycle window as DB bootstrap `active` bucket. */
function isTripCurrentlyActiveStatus(status: string | null | undefined): boolean {
  return isHubActiveTripStatus(status);
}

/** Trip `created_at` for hub + detail chrome (e.g. `3 May 2026`). */
function formatTripRouteDate(iso: string | null | undefined): string {
  const raw = String(iso ?? "").trim();
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
}


/** Manual hub: trip has an assigned driver (same trip / driver lane as detail). */
function manualHubTripHasAssignedDriver(
  conv: TripConversation,
  trips: Record<string, TripEntry>,
): boolean {
  const status = String(conv.trip_status ?? trips[conv.trip_id]?.status ?? "")
    .trim()
    .toLowerCase();
  if (!isOperationalTripChatStatus(status)) return false;
  const hasDriver =
    Boolean(String(conv.trip_driver_id ?? "").trim()) ||
    Boolean(String(trips[conv.trip_id]?.driverId ?? "").trim());
  // Manual trips chat lane is driver-only.
  return hasDriver && conv.party_type === "driver";
}

const HUB_PARTY_ORDER: ConversationPartyType[] = ["client", "supplier", "driver"];

function partyConversationMapFromHubRows(
  rows: TripConversation[],
): Record<ConversationPartyType, TripConversation | null> {
  return HUB_PARTY_ORDER.reduce(
    (acc, partyType) => {
      acc[partyType] = rows.find((r) => r.party_type === partyType) ?? null;
      return acc;
    },
    {} as Record<ConversationPartyType, TripConversation | null>,
  );
}

/**
 * Trip hub card party shortcuts — contractual give/get + integrated lanes:
 * - Client org sees supplier + driver (not a redundant client icon).
 * - Supplier org sees client + driver.
 * - {@link applyContractualHubPartyIsolation} enforces lane org match; linked-org suppressions apply on top.
 * - Supplier tab only when aggregate (awarded supplier) exists; driver when assigned.
 */
function hubCardPartyTypesForTripHub(args: {
  hubTrip: TripForCompose | undefined;
  /** Loaded conversation lanes for this trip in the hub list (same `trip_id`). */
  hubRows: TripConversation[];
  tripDriverId: string | null | undefined;
  tripSupplierId: string | null | undefined;
  viewerOrgId: string;
  viewerOrgName: string | null | undefined;
  tripHostOrgId: string | null | undefined;
  tripIntegrated: boolean;
}): HubPartyTab[] {
  const {
    hubTrip,
    hubRows,
    tripDriverId,
    tripSupplierId,
    viewerOrgId,
    viewerOrgName,
    tripHostOrgId,
    tripIntegrated,
  } = args;
  if (!tripIntegrated) {
    return [{ rowType: "driver" as ConversationPartyType, displayType: "driver" as ConversationPartyType }];
  }

  const map = partyConversationMapFromHubRows(hubRows);
  const clientId = map.client?.client_id ?? hubTrip?.client_id ?? null;
  const supplierId =
    map.supplier?.supplier_id ?? hubTrip?.supplier_id ?? tripSupplierId ?? null;
  const driverId = map.driver?.driver_id ?? hubTrip?.driver_id ?? tripDriverId ?? null;
  const aggregateTrip = isAggregateTrip({ supplier_id: supplierId });

  let rawVisible = HUB_PARTY_ORDER.filter((p) => {
    if (p === "client") {
      return Boolean(String(clientId ?? "").trim()) || Boolean(map.client);
    }
    if (p === "supplier") {
      return (
        aggregateTrip &&
        (Boolean(String(supplierId ?? "").trim()) || Boolean(map.supplier))
      );
    }
    return Boolean(String(driverId ?? "").trim()) || Boolean(map.driver);
  });

  let isLinkedClient = false;
  let isLinkedSupplier = false;
  if (hubTrip && viewerOrgId.trim()) {
    isLinkedClient = viewerIsLinkedTripClientViewer({
      clientLanePartyName: map.client?.party_name ?? hubTrip.client_name,
      viewerOrgId,
      viewerOrgName,
      tripHostOrgId,
      composeClientLinkedOrgId: hubTrip.client_linked_organization_id ?? null,
    });
    isLinkedSupplier = viewerIsLinkedTripSupplierViewer({
      supplierLanePartyName: map.supplier?.party_name ?? hubTrip.supplier_name,
      viewerOrgId,
      viewerOrgName,
      tripHostOrgId,
      composeSupplierLinkedOrgId: hubTrip.supplier_linked_organization_id ?? null,
    });
  }

  // Client viewer: hide their own "client" tab (they ARE the client — no need to show self).
  if (isLinkedClient) rawVisible = rawVisible.filter((p) => p !== "client");

  const isolated = applyContractualHubPartyIsolation(rawVisible, {
    viewerOrgId,
    lanes: hubRows,
    tripIntegrated,
    viewerIsLinkedSupplier: isLinkedSupplier,
  });

  // Supplier viewer: relabel the "supplier" tab as "CLIENT" — from the carrier's perspective
  // the supplier lane is their communication channel with the indent owner (their client).
  return isolated.map((p): HubPartyTab => {
    if (p === "supplier" && isLinkedSupplier) return { rowType: "supplier", displayType: "client" };
    return { rowType: p, displayType: p };
  });
}

type TripLabelDisambiguationRow = {
  tripId: string;
  tripLabel: string;
  tripCreatedAt: string | null;
};

/**
 * Multiple trip rows can share the same `display_trip_id` / `trip_number` (data or trigger gaps).
 * Hub and list UIs key by `trip_id` but label collisions read as duplicates (e.g. two "TRP003").
 */
function disambiguateTripLabelsForList(rows: TripLabelDisambiguationRow[]): Map<string, string> {
  const buckets = new Map<string, TripLabelDisambiguationRow[]>();
  for (const r of rows) {
    const key = r.tripLabel.trim() || r.tripId;
    const arr = buckets.get(key) ?? [];
    arr.push(r);
    buckets.set(key, arr);
  }
  const out = new Map<string, string>();
  for (const [, group] of buckets) {
    if (group.length === 1) {
      const t = group[0];
      out.set(t.tripId, t.tripLabel.trim() || t.tripId);
      continue;
    }
    const used = new Set<string>();
    for (const t of group) {
      const base = t.tripLabel.trim() || "Trip";
      const date = formatTripRouteDate(t.tripCreatedAt);
      let label = date
        ? `${base} · ${date}`
        : `${base} · ${t.tripId.replace(/-/g, "").slice(0, 8)}`;
      if (used.has(label)) {
        label = `${base} · ${date || "—"} · ${t.tripId.replace(/-/g, "").slice(0, 8)}`;
      }
      used.add(label);
      out.set(t.tripId, label);
    }
  }
  return out;
}

type GroupedTripHubRowData = {
  tripId: string;
  tripLabel: string;
  pickup: string;
  drop: string;
  tripCreatedAt: string | null;
  rows: TripConversation[];
  totalUnread: number;
  lastAt: number;
  tripDriverId: string | null;
  tripSupplierId: string | null;
  tripStatus: string | null;
  indentId: string | null;
  lastActivityConv: TripConversation | null;
};

/** Integrated hub tab: `indent_id` set on the trip (strict; not aggregate-supplier alone). */
function tripHubHasIntegratedPartition(
  conv: Pick<TripConversation, "trip_id" | "indent_id">,
  trips: Record<string, TripEntry>,
): boolean {
  if (Boolean(String(conv.indent_id ?? "").trim())) return true;
  const e = trips[conv.trip_id];
  return Boolean(e?.indentId && String(e.indentId).trim());
}

function buildGroupedTripHubRows(args: {
  sourceConversations: TripConversation[];
  hubComposeTrips: TripForCompose[];
  includeAggregateComposePlaceholders: boolean;
  tripSidebarSearch: string;
  tripChatScope: "active" | "history";
  isDesktop: boolean;
  webCommandPriorityFilter: boolean;
  activeTripsForCommandPriority: ActiveTripSummary[];
  tripTrackingByTripId: Record<string, string | null>;
}): GroupedTripHubRowData[] {
  const {
    sourceConversations,
    hubComposeTrips,
    includeAggregateComposePlaceholders,
    tripSidebarSearch,
    tripChatScope,
    isDesktop,
    webCommandPriorityFilter,
    activeTripsForCommandPriority,
  } = args;
  const tripTrackingByTripId = args.tripTrackingByTripId;
  const q = tripSidebarSearch.trim().toLowerCase();
  const byTrip = new Map<string, GroupedTripHubRowData>();
  for (const conv of sourceConversations) {
    const tripKey = conv.trip_id;
    const tripLabel = getConversationTripLabel(conv);
    if (!byTrip.has(tripKey)) {
      byTrip.set(tripKey, {
        tripId: tripKey,
        tripLabel,
        pickup: conv.pickup_area,
        drop: conv.drop_location,
        tripCreatedAt: conv.trip_created_at ?? null,
        rows: [],
        totalUnread: 0,
        lastAt: 0,
        tripDriverId: conv.trip_driver_id ?? null,
        tripSupplierId: conv.trip_supplier_id ?? null,
        tripStatus: conv.trip_status ?? null,
        indentId: conv.indent_id ?? null,
        lastActivityConv: null,
      });
    }
    const row = byTrip.get(tripKey)!;
    row.rows.push(conv);
    row.totalUnread += conv.unread_dispatcher_count ?? 0;
    const convLastAt = new Date(conv.last_message_at ?? 0).getTime();
    if (convLastAt > row.lastAt) {
      row.lastAt = convLastAt;
      row.lastActivityConv = conv;
    }
    row.tripDriverId = conv.trip_driver_id ?? row.tripDriverId ?? null;
    row.tripSupplierId = conv.trip_supplier_id ?? row.tripSupplierId ?? null;
    row.tripStatus = conv.trip_status ?? row.tripStatus ?? null;
    row.tripCreatedAt = row.tripCreatedAt ?? conv.trip_created_at ?? null;
    row.indentId = conv.indent_id ?? row.indentId ?? null;
  }

  if (includeAggregateComposePlaceholders) {
    for (const t of hubComposeTrips) {
      if (!isAggregateTrip(t)) continue;
      // Only show placeholder for indent-backed trips (marketplace flow).
      // Manually created trips with a supplier are not integrated trips.
      if (!String(t.indent_id ?? "").trim()) continue;
      if (String(t.driver_id ?? "").trim()) continue;
      if (isTerminalTripStatus(t.status)) continue;
      if (byTrip.has(t.id)) continue;
      const tripLabel = getTripDisplayNumber({
        trip_number: t["trip_number"],
        display_trip_id: t["display_trip_id"] ?? null,
      } as TripRow);
      const createdMs = t.created_at ? new Date(t.created_at).getTime() : 0;
      byTrip.set(t.id, {
        tripId: t.id,
        tripLabel,
        pickup: t.pickup_area,
        drop: t.drop_location,
        tripCreatedAt: t.created_at ?? null,
        rows: [],
        totalUnread: 0,
        lastAt: createdMs,
        tripDriverId: null,
        tripSupplierId: t.supplier_id ?? null,
        tripStatus: t.status ?? null,
        indentId: null,
        lastActivityConv: null,
      });
    }
  }

  let list = [...byTrip.values()];
  if (q) {
    list = list.filter((trip) => {
      const hay = `${trip.tripLabel} ${trip.pickup} ${trip.drop} ${formatTripRouteDate(trip.tripCreatedAt)} ${trip.rows
        .map((r) => `${r.party_name} ${r.party_type}`)
        .join(" ")}`.toLowerCase();
      return hay.includes(q);
    });
  }

  list = list.filter((trip) => {
    const st = trip.rows[0]?.trip_status;
    const terminal = !isHubActiveTripStatus(st);
    return tripChatScope === "history" ? terminal : !terminal;
  });

  const labelByTripId = disambiguateTripLabelsForList(
    list.map((t) => ({
      tripId: t.tripId,
      tripLabel: t.tripLabel,
      tripCreatedAt: t.tripCreatedAt,
    })),
  );
  list = list.map((t) => ({
    ...t,
    tripLabel: labelByTripId.get(t.tripId) ?? t.tripLabel,
  }));

  return list.sort((a, b) => {
    const au = a.totalUnread > 0 ? 0 : 1;
    const bu = b.totalUnread > 0 ? 0 : 1;
    if (au !== bu) return au - bu;
    const la =
      (tripTrackingByTripId[a.tripId] ?? "") === "RUNNING_LATE" ? 0 : 1;
    const lb =
      (tripTrackingByTripId[b.tripId] ?? "") === "RUNNING_LATE" ? 0 : 1;
    if (la !== lb) return la - lb;
    if (Platform.OS === "web" && isDesktop && webCommandPriorityFilter) {
      const sa = commandPriorityScore(
        {
          tripId: a.tripId,
          totalUnread: a.totalUnread,
          tripStatus: a.tripStatus,
          indentId: a.indentId,
        },
        activeTripsForCommandPriority,
      );
      const sb = commandPriorityScore(
        {
          tripId: b.tripId,
          totalUnread: b.totalUnread,
          tripStatus: b.tripStatus,
          indentId: b.indentId,
        },
        activeTripsForCommandPriority,
      );
      if (sb !== sa) return sb - sa;
    }
    return b.lastAt - a.lastAt;
  });
}

/** Hub badge: UNASSIGNED only for aggregate (integrated) trips with no driver; else status label. */
function formatTripHubStatusLabel(
  tripStatus: string | null | undefined,
  tripDriverId: string | null | undefined,
  tripSupplierId: string | null | undefined,
): string {
  const integrated = isAggregateTrip({ supplier_id: tripSupplierId ?? null });
  if (integrated && !String(tripDriverId ?? "").trim()) return "UNASSIGNED";
  return formatTripStatusLabel(tripStatus);
}

type ComposePartyRow =
  | {
      kind: "selectable";
      partyType: ConversationPartyType;
      name: string;
      id: string;
    }
  /** Asset / own fleet: show driver slot dulled until assigned. */
  | { kind: "unassigned_driver" };

/** Compose list rows: supplier only for aggregate (integrated) trips; driver shows Not assigned when empty. */
function isPartyLinkedForTripChat(
  trip: TripForCompose,
  partyType: ConversationPartyType,
): boolean {
  if (partyType === "client")
    return Boolean(trip.client_id && trip.client_linked_organization_id);
  if (partyType === "supplier")
    return Boolean(trip.supplier_id && trip.supplier_linked_organization_id);
  return Boolean(trip.driver_id);
}

function getComposePartyRows(trip: TripForCompose): ComposePartyRow[] {
  const rows: ComposePartyRow[] = [];
  const aggregate = isAggregateTrip(trip);

  if (isPartyLinkedForTripChat(trip, "client"))
    rows.push({
      kind: "selectable",
      partyType: "client",
      name: trip.client_name?.trim() || "Client",
      id: trip.client_id!,
    });

  if (aggregate && isPartyLinkedForTripChat(trip, "supplier"))
    rows.push({
      kind: "selectable",
      partyType: "supplier",
      name: trip.supplier_name?.trim() || "Supplier",
      id: trip.supplier_id!,
    });

  const hasSelectableOther = rows.some((r) => r.kind === "selectable");
  if (trip.driver_id) {
    rows.push({
      kind: "selectable",
      partyType: "driver",
      name: trip.driver_display_name?.trim() || "Driver",
      id: trip.driver_id,
    });
  } else if (hasSelectableOther) rows.push({ kind: "unassigned_driver" });

  return rows;
}

function manualTripDriverAccepted(status: string | null | undefined): boolean {
  return isOperationalTripChatStatus(status);
}

function tripHasSelectableComposeParty(trip: TripForCompose): boolean {
  return getComposePartyRows(trip).some((r) => r.kind === "selectable");
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function ChatScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    tab?: string | string[];
    conversationId?: string | string[];
    partnerOrgId?: string | string[];
    partnerOrgName?: string | string[];
    openDetail?: string | string[];
    ts?: string | string[];
  }>();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1024;
  const isMobileChatUi = isChatMobileLayout(isDesktop);
  const { keyboardVisible: mobileKeyboardOpen } = useKeyboardVisible();
  /** Trip hub cards (alerts + party row) on every viewport — one list UX for native + web. */
  const useGroupedTripHub = true;
  const allowNewTripConversation = false;
  /** Web: anchored compose/search UX from tablet width up (avoids sheet on iPad / large phones in browser). */
  const isWebAnchoredPanels = Platform.OS === "web" && (isDesktop || width >= 900);
  const { profile } = useAuth();
  const { currentOrganization } = useOrganization();
  const currentOrgId = currentOrganization?.id ?? "";
  const tripAvatarViewerBase = useMemo<TripConversationAvatarViewerContext>(
    () => ({
      viewerOrgId: currentOrgId,
      viewerOrgName: currentOrganization?.name ?? null,
    }),
    [currentOrgId, currentOrganization?.name],
  );

  const [activeTab, setActiveTab] = useState<TabId>("trips");
  const [isMobileDetail, setIsMobileDetail] = useState(false);
  const [messageInput, setMessageInput] = useState("");
  const messagesRef = useRef<FlatList>(null);
  const tripInboxListRef = useRef<FlatList<MobileTripInboxRow>>(null);
  const tripHubMobileAutoPageGateRef = useRef(false);
  const [focusedTripPartyKey, setFocusedTripPartyKey] = useState<string | null>(null);
  const [focusedNetPartnerId, setFocusedNetPartnerId] = useState<string | null>(null);

  // ── Slack-style: reply context ─────────────────────────────────────────
  const [replyContext, setReplyContext] = useState<ReplyPreviewData | null>(null);
  const clearReply = useCallback(() => setReplyContext(null), []);

  const [showEmoji, setShowEmoji] = useState(false);
  const [showScripts, setShowScripts] = useState(false);

  // Document hub (in-thread)
  const [showDocShare, setShowDocShare] = useState(false);
  const [tripHubAssets, setTripHubAssets] = useState<{
    vehicle_id: string | null;
    driver_id: string | null;
    organization_id: string | null;
  } | null>(null);
  const [ledgerWebToast, setLedgerWebToast] = useState(false);
  /** Sync guard: React state can lag one frame — blocks double-tap duplicate mirrors. */
  const addToBookInFlightRef = useRef(new Set<string>());

  // Compose modal state
  const [showCompose, setShowCompose] = useState(false);
  const [composeSearch, setComposeSearch] = useState("");
  const [composeTrips, setComposeTrips] = useState<TripForCompose[]>([]);
  const [composeLoading, setComposeLoading] = useState(false);
  /** Why the trip list might be empty (avoid "No trips" when org missing or fetch failed). */
  const [composeTripListIssue, setComposeTripListIssue] = useState<"no_org" | "fetch_failed" | null>(
    null
  );
  const [expandedTripId, setExpandedTripId] = useState<string | null>(null);
  /** Trips from fleet (incl. no driver) to merge into hub cards that have no conversation row yet. */
  const [hubComposeTrips, setHubComposeTrips] = useState<TripForCompose[]>([]);
  const hubComposeTripsLoadedAtRef = useRef<number>(0);

  const tripComposeById = useMemo(() => {
    const map = new Map<string, TripForCompose>();
    for (const t of [...hubComposeTrips, ...composeTrips]) {
      if (t.id) map.set(t.id, t);
    }
    return map;
  }, [hubComposeTrips, composeTrips]);

  const mergedComposeTrips = useMemo(
    () => Array.from(tripComposeById.values()),
    [tripComposeById],
  );

  const hubComposeTripIdsRef = useRef(new Set<string>());
  useEffect(() => {
    hubComposeTripIdsRef.current = new Set(
      hubComposeTrips.map((trip) => trip.id).filter(Boolean),
    );
  }, [hubComposeTrips]);

  const tripLinkedOrgIds = useMemo(() => {
    const ids = new Set<string>();
    for (const t of [...composeTrips, ...hubComposeTrips]) {
      const clientOrg = (t.client_linked_organization_id ?? "").trim();
      const supplierOrg = (t.supplier_linked_organization_id ?? "").trim();
      if (clientOrg) ids.add(clientOrg);
      if (supplierOrg) ids.add(supplierOrg);
    }
    return Array.from(ids).sort();
  }, [composeTrips, hubComposeTrips]);

  const tripLinkedOrgBranding = useLinkedOrgDisplayMap(tripLinkedOrgIds);
  const [initiating, setInitiating] = useState(false);
  const [showNetCompose, setShowNetCompose] = useState(false);
  const [netComposeSearch, setNetComposeSearch] = useState("");
  const [tripChatScope, setTripChatScope] = useState<"active" | "history">("active");
  const [slackUnreadOnly, setSlackUnreadOnly] = useState(false);
  const [desktopActiveShowAll, setDesktopActiveShowAll] = useState(false);
  const [desktopHistoryShowAll, setDesktopHistoryShowAll] = useState(false);
  const [desktopDmCollapsed, setDesktopDmCollapsed] = useState(false);
  const [desktopDmShowAll, setDesktopDmShowAll] = useState(false);
  /** Web desktop: bubble LATE_RISK / indent-linked trips in the hub list. */
  const [webCommandPriorityFilter, _setWebCommandPriorityFilter] = useState(false);
  const activeTripsForCommandPriority = useGlobalSyncStore((s) => s.activeTrips);
  const [visibleTripCount, setVisibleTripCount] = useState(10);
  const [tripSidebarSearch, setTripSidebarSearch] = useState("");
  const [netSidebarSearch, setNetSidebarSearch] = useState("");
  const [showStoriesSheet, setShowStoriesSheet] = useState(false);
  const [tripStartNoticeMode, setTripStartNoticeMode] = useState<
    "integrated" | "driver" | null
  >(null);
  const [hubSearchOpen, setHubSearchOpen] = useState(false);
  const tripSearchInputRef = useRef<TextInput>(null);
  const netSearchInputRef = useRef<TextInput>(null);
  const desktopSidebarScrollRef = useRef<ScrollView>(null);
  const desktopActiveRowRef = useRef<View>(null);
  const [showTripFilterModal, setShowTripFilterModal] = useState(false);
  const [platformTripRoomId, setPlatformTripRoomId] = useState<string | null>(null);
  const detailEnterProgress = useRef(new Animated.Value(1)).current;
  const [tripPartyFilters, setTripPartyFilters] = useState<ConversationPartyType[]>([
    ...TRIP_PARTY_FILTERS,
  ]);
  const deepLinkAppliedRef = useRef<string | null>(null);
  /** Avoid repeating hydrate when RLS returns null for the same URL. */
  const deeplinkHydrateFailedForKeyRef = useRef<string | null>(null);

  const {
    organizationId,
    conversations,
    isLoading,
    sendMessage,
    markTripThreadsRead,
    initiateConversation,
  } = useTripChat();

  const conversationTripIdsKey = useMemo(() => {
    const ids = new Set<string>();
    for (const conv of conversations) {
      if (conv.trip_id) ids.add(conv.trip_id);
    }
    return [...ids].sort().join("|");
  }, [conversations]);

  useEffect(() => {
    if (!organizationId || !conversationTripIdsKey) return;
    const tripIds = conversationTripIdsKey.split("|").filter(Boolean);
    const missing = tripIds.filter((id) => !hubComposeTripIdsRef.current.has(id));
    if (missing.length === 0) return;

    let cancelled = false;
    void getTripsForComposeByIds(organizationId, missing).then((extra) => {
      if (cancelled || extra.length === 0) return;
      setHubComposeTrips((prev) => {
        const byId = new Map(prev.map((trip) => [trip.id, trip]));
        for (const trip of extra) byId.set(trip.id, trip);
        return [...byId.values()];
      });
    });
    return () => {
      cancelled = true;
    };
  }, [organizationId, conversationTripIdsKey]);

  // True once bootstrap has completed at least once for this org.
  // Used to distinguish "first load" (show full-area spinner) from
  // "background refresh" (keep list visible, skip spinner).
  const bootstrapDone = useChatStore(s => s.bootstrappedOrg !== null);
  const chatTrips = useChatStore((s) => s.trips);
  const chatBootstrapHasMoreTrips = useChatStore((s) => s.chatBootstrapHasMoreTrips);
  const appendBootstrapTripPage = useChatStore((s) => s.appendBootstrapTripPage);
  const isAppendingBootstrap = useChatStore((s) => s.isAppendingBootstrap);
  const ensureHubHistoryBootstrap = useChatStore((s) => s.ensureHubHistoryBootstrap);

  const integratedChatCtx = useOptionalIntegratedChat();
  const netChats = integratedChatCtx?.chats ?? [];
  const netPartners = integratedChatCtx?.partners ?? [];
  const netLoading = integratedChatCtx?.isLoading ?? false;
  const sendNet =
    integratedChatCtx?.sendMessage ??
    (() => {
      // No provider mounted; ignore DM send attempts in this host.
    });
  const markNetRead = integratedChatCtx?.markAsRead ?? (() => {});
  const netTotal = integratedChatCtx?.getTotalUnreadCount ?? (() => 0);
  const initiateNetworkConversation =
    integratedChatCtx?.initiateNetworkConversation ??
    (async () => null);
  const setActiveNetworkConversationId =
    integratedChatCtx?.setActiveNetworkConversationId;

  const netUnread = netTotal();

  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [selectedNetId, setSelectedNetId] = useState<string | null>(null);

  // Keep open Network DM subscribed for live INSERT (receiver WhatsApp-style).
  useEffect(() => {
    if (!setActiveNetworkConversationId) return;
    const openId = activeTab === "network" ? selectedNetId : null;
    setActiveNetworkConversationId(openId);
    return () => setActiveNetworkConversationId(null);
  }, [activeTab, selectedNetId, setActiveNetworkConversationId]);

  // useConversation subscribes directly to this one conversation in the singleton
  // store — re-renders only when THIS conversation changes (not the full list).
  const selectedConv = useConversation(selectedConvId);
  const selectedNet = netChats.find((c) => c.id === selectedNetId) ?? null;
  const feedbackComposeTrip = useMemo(
    () =>
      selectedConv
        ? tripComposeById.get(selectedConv.trip_id) ?? null
        : null,
    [tripComposeById, selectedConv?.trip_id],
  );
  const feedbackShownTripsRef = useRef(new Set<string>());
  const [feedbackOverlayTripId, setFeedbackOverlayTripId] = useState<string | null>(
    null,
  );

  useEffect(() => {
    if (!selectedConv || profile?.role === "driver") {
      setFeedbackOverlayTripId(null);
      return;
    }
    const tripId = selectedConv.trip_id;
    const tripOrg = (
      selectedConv.trip_organization_id ??
      selectedConv.organization_id ??
      ""
    ).trim();
    if (!tripOrg || tripOrg !== currentOrgId.trim()) {
      setFeedbackOverlayTripId(null);
      return;
    }
    const status =
      selectedConv.trip_status ?? feedbackComposeTrip?.status ?? null;
    if (!isTripFeedbackEligibleStatus(status)) {
      setFeedbackOverlayTripId(null);
      return;
    }
    if (feedbackShownTripsRef.current.has(tripId)) return;
    feedbackShownTripsRef.current.add(tripId);
    setFeedbackOverlayTripId(tripId);
  }, [
    selectedConv,
    selectedConv?.id,
    selectedConv?.trip_id,
    selectedConv?.trip_status,
    selectedConv?.trip_organization_id,
    selectedConv?.organization_id,
    feedbackComposeTrip?.status,
    currentOrgId,
    profile?.role,
  ]);

  const [FeedbackOverlay, setFeedbackOverlay] = useState<
    React.ComponentType<import("./ChatTripFeedbackOverlay").ChatTripFeedbackOverlayProps> | null
  >(null);

  useEffect(() => {
    if (!feedbackOverlayTripId) return;
    let cancelled = false;
    void import("./ChatTripFeedbackOverlay").then((mod) => {
      if (!cancelled) setFeedbackOverlay(() => mod.ChatTripFeedbackOverlay);
    });
    return () => {
      cancelled = true;
    };
  }, [feedbackOverlayTripId]);

  const tripFeedbackOverlay =
    feedbackOverlayTripId && currentOrgId && FeedbackOverlay ? (
      <FeedbackOverlay
        tripId={feedbackOverlayTripId}
        organizationId={currentOrgId}
        partnerName={
          feedbackComposeTrip?.supplier_name ??
          (selectedConv?.party_type === "supplier"
            ? selectedConv.party_name
            : null)
        }
        driverName={feedbackComposeTrip?.driver_display_name ?? null}
        clientName={feedbackComposeTrip?.client_name ?? null}
      />
    ) : null;

  const closePlatformTripRoom = useCallback(() => {
    setPlatformTripRoomId(null);
  }, []);

  const platformTripRoomSheet =
    CHAT_TEAM_ROOMS_SIDEBAR_ENABLED && platformTripRoomId ? (
    <TripChatRoomSheet
      visible
      tripId={platformTripRoomId}
      tripLabel={
        tripComposeById.get(platformTripRoomId)?.trip_number ?? undefined
      }
      composeTrip={tripComposeById.get(platformTripRoomId) ?? null}
      organizationId={currentOrgId || organizationId}
      onClose={closePlatformTripRoom}
    />
  ) : null;

  useEffect(() => {
    if (!isTripStreamTab(activeTab)) {
      setActiveTripMessageConversationId(null);
      return;
    }
    if (selectedConvId) {
      setActiveTripMessageConversationId(selectedConvId);
      return () => setActiveTripMessageConversationId(null);
    }
    setActiveTripMessageConversationId(null);
  }, [activeTab, selectedConvId]);

  useEffect(() => {
    let cancelled = false;
    if (!organizationId) {
      setHubComposeTrips([]);
      hubComposeTripsLoadedAtRef.current = 0;
      return;
    }
    (async () => {
      try {
        const trips = await getTripsForCompose(organizationId);
        if (!cancelled) {
          setHubComposeTrips(trips);
          hubComposeTripsLoadedAtRef.current = Date.now();
        }
      } catch {
        if (!cancelled) setHubComposeTrips([]);
      }
    })();
    return () => {
      cancelled = true;
    };
    // conversations.length removed: trips do not change when messages arrive.
    // Re-fetch only when the organisation switches.
  }, [organizationId]);

  const effectiveConversationTripStatus = useCallback(
    (conv: Pick<TripConversation, "trip_id" | "trip_status">): string | null => {
      const fromConv = String(conv.trip_status ?? "").trim();
      if (fromConv) return fromConv;
      const fromStore = String(chatTrips[conv.trip_id]?.status ?? "").trim();
      return fromStore || null;
    },
    [chatTrips],
  );

  const baseFilteredSortedTripConversations = useMemo(() => {
    const trimmedSearch = tripSidebarSearch.trim().toLowerCase();
    const hasSearch = trimmedSearch.length > 0;
    const normalizedFilters = tripPartyFilters.length
      ? tripPartyFilters
      : TRIP_PARTY_FILTERS;
    const filterSet = new Set<ConversationPartyType>(normalizedFilters);

    return conversations
      .filter((conv) => filterSet.has(conv.party_type))
      .filter((conv) => {
        if (!hasSearch) return true;
        const displayId = getConversationTripLabel(conv);
        const haystack = `${displayId}`.toLowerCase();
        return haystack.includes(trimmedSearch);
      })
      .sort((a, b) => {
        // Active trips always above terminal (hard boundary, like WhatsApp pinned groups)
        const aTerminal = isTerminalTripStatus(effectiveConversationTripStatus(a)) ? 1 : 0;
        const bTerminal = isTerminalTripStatus(effectiveConversationTripStatus(b)) ? 1 : 0;
        if (aTerminal !== bTerminal) return aTerminal - bTerminal;

        // Within each group: unread conversations first (WhatsApp style)
        const aUnread = (a.unread_dispatcher_count ?? 0) > 0 ? 0 : 1;
        const bUnread = (b.unread_dispatcher_count ?? 0) > 0 ? 0 : 1;
        if (aUnread !== bUnread) return aUnread - bUnread;

        // Most recent activity first
        return (
          new Date(b.last_message_at ?? 0).getTime() -
          new Date(a.last_message_at ?? 0).getTime()
        );
      });
  }, [conversations, tripPartyFilters, tripSidebarSearch, effectiveConversationTripStatus]);

  const tripStreamConversations = useMemo(
    () =>
      baseFilteredSortedTripConversations.filter(
        (c) =>
          !tripHubHasIntegratedPartition(c, chatTrips) &&
          manualHubTripHasAssignedDriver(c, chatTrips),
      ),
    [baseFilteredSortedTripConversations, chatTrips],
  );

  const indentStreamConversations = useMemo(
    () =>
      baseFilteredSortedTripConversations.filter((c) =>
        tripHubHasIntegratedPartition(c, chatTrips),
      ),
    [baseFilteredSortedTripConversations, chatTrips],
  );

  const tripsChatUnread = useMemo(
    () =>
      tripStreamConversations.reduce((s, c) => s + (c.unread_dispatcher_count ?? 0), 0),
    [tripStreamConversations],
  );
  const indentChatUnread = useMemo(
    () =>
      indentStreamConversations.reduce((s, c) => s + (c.unread_dispatcher_count ?? 0), 0),
    [indentStreamConversations],
  );

  const manualRunningLateActiveCount = useMemo(() => {
    const seen = new Set<string>();
    let n = 0;
    for (const c of tripStreamConversations) {
      if (isTerminalTripStatus(effectiveConversationTripStatus(c))) continue;
      if (seen.has(c.trip_id)) continue;
      seen.add(c.trip_id);
      if (chatTrips[c.trip_id]?.trackingStatus === "RUNNING_LATE") n += 1;
    }
    return n;
  }, [tripStreamConversations, chatTrips, effectiveConversationTripStatus]);

  const integratedRunningLateActiveCount = useMemo(() => {
    const seen = new Set<string>();
    let n = 0;
    for (const c of indentStreamConversations) {
      if (isTerminalTripStatus(effectiveConversationTripStatus(c))) continue;
      if (seen.has(c.trip_id)) continue;
      seen.add(c.trip_id);
      if (chatTrips[c.trip_id]?.trackingStatus === "RUNNING_LATE") n += 1;
    }
    return n;
  }, [indentStreamConversations, chatTrips, effectiveConversationTripStatus]);

  const sortedNetChats = useMemo(() => {
    return [...netChats]
      .filter((c) => c.messages.length > 0)
      .sort((a, b) => {
      const unreadDiff = (b.unreadCount ?? 0) - (a.unreadCount ?? 0);
      if (unreadDiff !== 0) return unreadDiff;
      const aLast = a.messages[a.messages.length - 1]?.timestamp ?? "";
      const bLast = b.messages[b.messages.length - 1]?.timestamp ?? "";
      return new Date(bLast || 0).getTime() - new Date(aLast || 0).getTime();
      });
  }, [netChats]);
  const shouldLoadStoryFeed =
    Boolean(currentOrgId) && (activeTab === "network" || showStoriesSheet);
  const {
    posts: networkStoryPosts,
    indentCountByPostId: networkStoryIndentCounts,
    isLoading: storiesLoading,
  } = useNetworkStoryStrip(shouldLoadStoryFeed ? currentOrgId : null);
  const chatNetworkPartnerOrgIds = useMemo(() => {
    const ids = new Set<string>();
    for (const partner of netPartners) {
      // Twin Ad + organic only for shippers (clients) — supplier LOAD is filtered out.
      if (partner.party_type === "client" && partner.org_id) ids.add(partner.org_id);
    }
    return ids;
  }, [netPartners]);

  const tripHubTrackingByTripId = useMemo(() => {
    const m: Record<string, string | null> = {};
    for (const [id, e] of Object.entries(chatTrips)) {
      m[id] = e?.trackingStatus ?? null;
    }
    return m;
  }, [chatTrips]);

  const groupedManualTripHubRows = useMemo(
    () =>
      buildGroupedTripHubRows({
        sourceConversations: tripStreamConversations,
        hubComposeTrips,
        includeAggregateComposePlaceholders: false,
        tripSidebarSearch,
        tripChatScope,
        isDesktop,
        webCommandPriorityFilter,
        activeTripsForCommandPriority,
        tripTrackingByTripId: tripHubTrackingByTripId,
      }),
    [
      tripStreamConversations,
      hubComposeTrips,
      tripSidebarSearch,
      tripChatScope,
      isDesktop,
      webCommandPriorityFilter,
      activeTripsForCommandPriority,
      tripHubTrackingByTripId,
    ],
  );

  const groupedIndentTripHubRows = useMemo(
    () =>
      buildGroupedTripHubRows({
        sourceConversations: indentStreamConversations,
        hubComposeTrips,
        includeAggregateComposePlaceholders: true,
        tripSidebarSearch,
        tripChatScope,
        isDesktop,
        webCommandPriorityFilter,
        activeTripsForCommandPriority,
        tripTrackingByTripId: tripHubTrackingByTripId,
      }),
    [
      indentStreamConversations,
      hubComposeTrips,
      tripSidebarSearch,
      tripChatScope,
      isDesktop,
      webCommandPriorityFilter,
      activeTripsForCommandPriority,
      tripHubTrackingByTripId,
    ],
  );

  const groupedTripRows =
    activeTab === "indent" ? groupedIndentTripHubRows : groupedManualTripHubRows;

  const tripStreamForActiveHubTab = useMemo(
    () => (activeTab === "indent" ? indentStreamConversations : tripStreamConversations),
    [activeTab, indentStreamConversations, tripStreamConversations],
  );

  const tripChatFilteredConversations = useMemo(() => {
    return tripStreamForActiveHubTab.filter((conv) => {
      const status = effectiveConversationTripStatus(conv);
      const terminal = isTerminalTripStatus(status);
      return tripChatScope === "history"
        ? terminal
        : isTripCurrentlyActiveStatus(status);
    });
  }, [tripStreamForActiveHubTab, tripChatScope, effectiveConversationTripStatus]);

  const desktopActiveTripConversations = useMemo(() => {
    const rows = tripStreamForActiveHubTab.filter((conv) =>
      isTripCurrentlyActiveStatus(effectiveConversationTripStatus(conv)),
    );
    if (!focusedTripPartyKey) return rows;
    const { recommended, rest } = partitionTripConversationsByPartyFocus(
      rows,
      focusedTripPartyKey,
      {
        tripStatus: effectiveConversationTripStatus,
        isTerminal: isTerminalTripStatus,
      },
    );
    return [...recommended, ...rest];
  }, [
    tripStreamForActiveHubTab,
    effectiveConversationTripStatus,
    focusedTripPartyKey,
  ]);
  const desktopHistoryTripConversations = useMemo(() => {
    const rows = tripStreamForActiveHubTab.filter((conv) =>
      isTerminalTripStatus(effectiveConversationTripStatus(conv)),
    );
    if (!focusedTripPartyKey) return rows;
    const { recommended, rest } = partitionTripConversationsByPartyFocus(
      rows,
      focusedTripPartyKey,
      {
        tripStatus: effectiveConversationTripStatus,
        isTerminal: isTerminalTripStatus,
      },
    );
    return [...recommended, ...rest];
  }, [
    tripStreamForActiveHubTab,
    effectiveConversationTripStatus,
    focusedTripPartyKey,
  ]);

  useEffect(() => {
    if (!isDesktop || !selectedConvId) return;
    const activeIndex = desktopActiveTripConversations.findIndex((c) => c.id === selectedConvId);
    if (activeIndex >= 0) {
      setTripChatScope("active");
      if (activeIndex >= 5 && !desktopActiveShowAll) setDesktopActiveShowAll(true);
      return;
    }
    const historyIndex = desktopHistoryTripConversations.findIndex((c) => c.id === selectedConvId);
    if (historyIndex >= 0) {
      setTripChatScope("history");
      if (historyIndex >= 5 && !desktopHistoryShowAll) setDesktopHistoryShowAll(true);
    }
  }, [
    isDesktop,
    selectedConvId,
    desktopActiveTripConversations,
    desktopHistoryTripConversations,
    desktopActiveShowAll,
    desktopHistoryShowAll,
  ]);

  const scrollDesktopActiveRowIntoView = useCallback(() => {
    if (!isDesktop) return;
    const row = desktopActiveRowRef.current;
    if (!row) return;

    if (Platform.OS === "web") {
      (row as unknown as { scrollIntoView?: (opts?: ScrollIntoViewOptions) => void }).scrollIntoView?.(
        { block: "nearest", behavior: "smooth" },
      );
      return;
    }

    const scroll = desktopSidebarScrollRef.current;
    if (!scroll) return;

    const scrollNative = scroll as ScrollView & { getInnerViewNode?: () => number };
    const parent = scrollNative.getInnerViewNode?.();
    if (parent == null) return;
    row.measureLayout(
      parent,
      (_x, y) => {
        scroll.scrollTo({ y: Math.max(0, y - 48), animated: true });
      },
      () => {},
    );
  }, [isDesktop]);

  useEffect(() => {
    if (!isDesktop) return;
    if (!selectedConvId && !selectedNetId) return;
    const timer = setTimeout(scrollDesktopActiveRowIntoView, 180);
    return () => clearTimeout(timer);
  }, [
    isDesktop,
    selectedConvId,
    selectedNetId,
    activeTab,
    desktopActiveShowAll,
    desktopHistoryShowAll,
    desktopDmShowAll,
    desktopDmCollapsed,
    tripChatScope,
    scrollDesktopActiveRowIntoView,
  ]);

  const slackFilteredTripConversations = useMemo(() => {
    if (!slackUnreadOnly) return tripChatFilteredConversations;
    return tripChatFilteredConversations.filter((c) => (c.unread_dispatcher_count ?? 0) > 0);
  }, [tripChatFilteredConversations, slackUnreadOnly]);

  const slackFilteredNetChats = useMemo(() => {
    let rows = slackUnreadOnly
      ? sortedNetChats.filter((c) => (c.unreadCount ?? 0) > 0)
      : sortedNetChats;
    const q = netSidebarSearch.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (c) =>
        c.partnerName.toLowerCase().includes(q) ||
        (c.organization ?? "").toLowerCase().includes(q),
    );
  }, [sortedNetChats, slackUnreadOnly, netSidebarSearch]);

  useEffect(() => {
    if (!isDesktop || !selectedNetId) return;
    const idx = slackFilteredNetChats.findIndex((c) => c.id === selectedNetId);
    if (idx < 0) return;
    if (desktopDmCollapsed) setDesktopDmCollapsed(false);
    if (idx >= 8 && !desktopDmShowAll) setDesktopDmShowAll(true);
  }, [isDesktop, selectedNetId, slackFilteredNetChats, desktopDmCollapsed, desktopDmShowAll]);

  const slackFilterChips = useMemo((): SlackFilterChipDef[] => {
    if (activeTab === "network") {
      return [
        {
          id: "all",
          label: "All",
          active: !slackUnreadOnly,
          onPress: () => setSlackUnreadOnly(false),
        },
        {
          id: "unreads",
          label: "Unreads",
          active: slackUnreadOnly,
          onPress: () => setSlackUnreadOnly(true),
        },
      ];
    }
    const tripMirrorId = slackUnreadOnly
      ? "unreads"
      : tripChatScope === "history"
        ? "history"
        : "active";
    return [
      {
        id: "active",
        label: "Active",
        active: tripMirrorId === "active",
        onPress: () => {
          setSlackUnreadOnly(false);
          setTripChatScope("active");
        },
      },
      {
        id: "unreads",
        label: "Unreads",
        active: tripMirrorId === "unreads",
        onPress: () => setSlackUnreadOnly(true),
      },
      {
        id: "history",
        label: "History",
        active: tripMirrorId === "history",
        onPress: () => {
          setSlackUnreadOnly(false);
          setTripChatScope("history");
        },
      },
    ];
  }, [activeTab, slackUnreadOnly, tripChatScope]);

  const tripListDisambiguatedLabels = useMemo(() => {
    const byTrip = new Map<string, TripLabelDisambiguationRow>();
    for (const conv of tripChatFilteredConversations) {
      if (byTrip.has(conv.trip_id)) continue;
      byTrip.set(conv.trip_id, {
        tripId: conv.trip_id,
        tripLabel: getConversationTripLabel(conv),
        tripCreatedAt: conv.trip_created_at ?? null,
      });
    }
    return disambiguateTripLabelsForList([...byTrip.values()]);
  }, [tripChatFilteredConversations]);

  const onTripStreamListScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (tripChatScope !== "active") return;
      if (!organizationId) return;
      const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
      const contentH = contentSize.height;
      const viewH = layoutMeasurement.height;
      if (contentH <= viewH + 24) return;
      const scrollDepth = (contentOffset.y + viewH) / contentH;
      if (scrollDepth < 0.9) return;
      if (tripHubMobileAutoPageGateRef.current) return;

      if (useGroupedTripHub) {
        if (visibleTripCount < groupedTripRows.length) {
          tripHubMobileAutoPageGateRef.current = true;
          setVisibleTripCount((c) => c + 20);
          setTimeout(() => {
            tripHubMobileAutoPageGateRef.current = false;
          }, 450);
          return;
        }
        if (!chatBootstrapHasMoreTrips || isAppendingBootstrap) return;
        tripHubMobileAutoPageGateRef.current = true;
        void appendBootstrapTripPage(organizationId).finally(() => {
          setVisibleTripCount((c) => c + 20);
          setTimeout(() => {
            tripHubMobileAutoPageGateRef.current = false;
          }, 900);
        });
        return;
      }

      if (!chatBootstrapHasMoreTrips || isAppendingBootstrap) return;
      tripHubMobileAutoPageGateRef.current = true;
      void appendBootstrapTripPage(organizationId).finally(() => {
        setTimeout(() => {
          tripHubMobileAutoPageGateRef.current = false;
        }, 900);
      });
    },
    [
      useGroupedTripHub,
      tripChatScope,
      organizationId,
      chatBootstrapHasMoreTrips,
      isAppendingBootstrap,
      appendBootstrapTripPage,
      visibleTripCount,
      groupedTripRows.length,
    ],
  );

  useEffect(() => {
    setVisibleTripCount(10);
  }, [tripChatScope, activeTab]);

  useEffect(() => {
    setFocusedTripPartyKey(null);
    setFocusedNetPartnerId(null);
  }, [activeTab]);

  const partyFocusSortOptions = useMemo(
    () => ({
      tripStatus: effectiveConversationTripStatus,
      isTerminal: isTerminalTripStatus,
    }),
    [effectiveConversationTripStatus],
  );

  const focusedPartyDisplayName = useMemo(() => {
    if (!focusedTripPartyKey) return null;
    const conv = tripStreamForActiveHubTab.find(
      (c) => tripPartyPeopleKey(c) === focusedTripPartyKey,
    );
    if (!conv) return null;
    const composeTrip = tripComposeById.get(conv.trip_id) ?? null;
    return (
      formatChatPartyInboxLine(
        conv.party_type,
        resolveChatPartyDisplayName(conv.party_type, conv.party_name, composeTrip),
      ) ??
      formatChatPartyName(conv.party_name) ??
      partyLabelReadable(conv.party_type)
    );
  }, [focusedTripPartyKey, tripStreamForActiveHubTab, tripComposeById]);

  const mobileTripInboxRows = useMemo((): MobileTripInboxRow[] => {
    if (!isMobileChatUi) return [];
    return buildMobileTripInboxRows(
      slackFilteredTripConversations,
      focusedTripPartyKey,
      focusedPartyDisplayName,
      partyFocusSortOptions,
    );
  }, [
    isMobileChatUi,
    slackFilteredTripConversations,
    focusedTripPartyKey,
    focusedPartyDisplayName,
    partyFocusSortOptions,
  ]);

  const netChatsForInbox = useMemo(() => {
    const partnerId = (focusedNetPartnerId ?? "").trim();
    if (!partnerId) return slackFilteredNetChats;
    const matched = slackFilteredNetChats.filter((c) => c.partnerId === partnerId);
    const rest = slackFilteredNetChats.filter((c) => c.partnerId !== partnerId);
    return [...matched, ...rest];
  }, [slackFilteredNetChats, focusedNetPartnerId]);

  useEffect(() => {
    if (tripSidebarSearch.trim().length > 0) setHubSearchOpen(true);
  }, [tripSidebarSearch]);

  useEffect(() => {
    if (!organizationId || !bootstrapDone) return;
    // Mobile: lazy-load when user switches to History scope.
    // Desktop: sidebar shows Active + History together — always bootstrap history on trip tabs.
    const needsHistoryBootstrap =
      tripChatScope === "history" || (isDesktop && isTripStreamTab(activeTab));
    if (!needsHistoryBootstrap) return;
    void ensureHubHistoryBootstrap(organizationId);
  }, [
    tripChatScope,
    organizationId,
    bootstrapDone,
    ensureHubHistoryBootstrap,
    isDesktop,
    activeTab,
  ]);

  useEffect(() => {
    if (!isTripStreamTab(activeTab)) return;
    if (!selectedConvId) return;
    const stream =
      activeTab === "indent" ? indentStreamConversations : tripStreamConversations;
    if (stream.some((c) => c.id === selectedConvId)) return;
    // Hub streams exclude rows (party filters, manual vs integrated split). Selection is still valid
    // if the conversation exists in the org store — do not clear (fixes CLIENT tab snapping back to driver).
    if (conversations.some((c) => c.id === selectedConvId)) return;
    setSelectedConvId(null);
  }, [
    activeTab,
    indentStreamConversations,
    tripStreamConversations,
    conversations,
    selectedConvId,
  ]);

  useEffect(() => {
    const tabParamRaw = Array.isArray(params.tab) ? params.tab[0] : params.tab;
    const convIdParam = Array.isArray(params.conversationId)
      ? params.conversationId[0]
      : params.conversationId;
    const openDetailParam = Array.isArray(params.openDetail)
      ? params.openDetail[0]
      : params.openDetail;
    const tsParam = Array.isArray(params.ts) ? params.ts[0] : params.ts;

    if (!convIdParam) return;

    const tabParamRawNorm = String(tabParamRaw ?? "").toLowerCase();
    if (tabParamRawNorm === "network") {
      const netHit = netChats.find((c) => c.id === convIdParam);
      if (!netHit) return;
      const deepLinkKey = `network:${convIdParam}:${tsParam ?? "no-ts"}`;
      if (deepLinkAppliedRef.current === deepLinkKey) return;
      const shouldOpenDetail = openDetailParam === "1";
      setActiveTab("network");
      setSelectedNetId(convIdParam);
      setSelectedConvId(null);
      markNetRead(convIdParam);
      if (shouldOpenDetail && !isDesktop) setIsMobileDetail(true);
      deepLinkAppliedRef.current = deepLinkKey;
      return;
    }

    const deepLinkKey = `${tabParamRawNorm || "trips"}:${convIdParam}:${tsParam ?? "no-ts"}`;
    if (deepLinkAppliedRef.current === deepLinkKey) return;

    const shouldOpenDetail = openDetailParam === "1";
    const hydrateAttemptKey = `${convIdParam}:${tsParam ?? ""}`;

    const hit = conversations.find((c) => c.id === convIdParam);
    if (hit) {
      deepLinkAppliedRef.current = deepLinkKey;
      const tripsSnap = useChatStore.getState().trips;
      const inferred = tripHubHasIntegratedPartition(hit, tripsSnap) ? "indent" : "trips";
      const targetTab: TabId =
        tabParamRawNorm === "indent" ? "indent" : tabParamRawNorm === "trips" ? "trips" : inferred;
      const resolvedTab: TabId =
        targetTab === "trips" && inferred === "indent" ? "indent" : targetTab;
      setActiveTab(resolvedTab);
      setSelectedConvId(convIdParam);
      setSelectedNetId(null);
      void markTripThreadsRead(hit.trip_id);
      if (shouldOpenDetail && !isDesktop) setIsMobileDetail(true);
      return;
    }
    // Wait for bootstrap; once conversations update this effect re-runs.
    if (isLoading) return;
    deeplinkHydrateFailedForKeyRef.current = hydrateAttemptKey;
  }, [
    conversations,
    isDesktop,
    isLoading,
    markTripThreadsRead,
    markNetRead,
    netChats,
    params.conversationId,
    params.openDetail,
    params.ts,
    params.tab,
  ]);

  // Story / Network DM entry: open (or create) by partner org without waiting
  // on conversation create before navigation.
  useEffect(() => {
    const tabParamRaw = Array.isArray(params.tab) ? params.tab[0] : params.tab;
    const partnerOrgIdParam = Array.isArray(params.partnerOrgId)
      ? params.partnerOrgId[0]
      : params.partnerOrgId;
    const partnerOrgNameParam = Array.isArray(params.partnerOrgName)
      ? params.partnerOrgName[0]
      : params.partnerOrgName;
    const openDetailParam = Array.isArray(params.openDetail)
      ? params.openDetail[0]
      : params.openDetail;
    const tsParam = Array.isArray(params.ts) ? params.ts[0] : params.ts;
    const convIdParam = Array.isArray(params.conversationId)
      ? params.conversationId[0]
      : params.conversationId;

    if (convIdParam) return;
    if (String(tabParamRaw ?? "").toLowerCase() !== "network") return;
    const partnerOrgId = (partnerOrgIdParam ?? "").trim();
    if (!partnerOrgId) return;

    const deepLinkKey = `network-partner:${partnerOrgId}:${tsParam ?? "no-ts"}`;
    if (deepLinkAppliedRef.current === deepLinkKey) return;

    const existing = netChats.find((c) => c.partnerId === partnerOrgId);
    if (existing) {
      deepLinkAppliedRef.current = deepLinkKey;
      setActiveTab("network");
      setSelectedNetId(existing.id);
      setSelectedConvId(null);
      markNetRead(existing.id);
      if (openDetailParam === "1" && !isDesktop) setIsMobileDetail(true);
      return;
    }

    if (netLoading) return;

    deepLinkAppliedRef.current = deepLinkKey;
    const partnerName =
      (partnerOrgNameParam ?? "").trim() ||
      netPartners.find((p) => p.org_id === partnerOrgId)?.name ||
      "Partner";
    const partyType =
      netPartners.find((p) => p.org_id === partnerOrgId)?.party_type ?? "client";

    void (async () => {
      setInitiating(true);
      try {
        const convId = await initiateNetworkConversation({
          org_id: partnerOrgId,
          name: partnerName,
          party_type: partyType,
        });
        if (!convId) return;
        setActiveTab("network");
        setSelectedNetId(convId);
        setSelectedConvId(null);
        if (openDetailParam === "1" && !isDesktop) setIsMobileDetail(true);
      } finally {
        setInitiating(false);
      }
    })();
  }, [
    initiateNetworkConversation,
    isDesktop,
    markNetRead,
    netChats,
    netLoading,
    netPartners,
    params.conversationId,
    params.openDetail,
    params.partnerOrgId,
    params.partnerOrgName,
    params.tab,
    params.ts,
  ]);

  useEffect(() => {
    if (isDesktop) setIsMobileDetail(false);
  }, [isDesktop]);

  const inputOverlayMaxWidth = Math.max(220, Math.min(320, width - 24));

  const openDetail = () => {
    if (!isDesktop) setIsMobileDetail(true);
  };

  const closeDetail = () => {
    setIsMobileDetail(false);
    setSelectedConvId(null);
    setSelectedNetId(null);
    setPlatformTripRoomId(null);
    setMessageInput("");
    setShowEmoji(false);
    setShowScripts(false);
    setShowDocShare(false);
  };

  const handleSlackTabSelect = useCallback(
    (tab: SlackStreamTabId) => {
      setActiveTab(tab);
      setPlatformTripRoomId(null);
      if (isMobileDetail) closeDetail();
    },
    [isMobileDetail],
  );

  const handleSlackBottomStories = useCallback(() => {
    if (isMobileDetail) closeDetail();
    setShowStoriesSheet(true);
  }, [isMobileDetail]);

  const openConversation = useCallback(
    async (conv: TripConversation) => {
      setPlatformTripRoomId(null);
      // Paint the known conversation shell immediately. DetailPanel loads the
      // newest message page once on open — do not await hydration here (that
      // blocked first paint and duplicated the same getMessagesByConversation).
      chatStore.switchParty(conv.trip_id, conv.party_type);
      setSelectedConvId(conv.id);
      setFocusedTripPartyKey(tripPartyPeopleKey(conv));
      void markTripThreadsRead(conv.trip_id);
      openDetail();
    },
    [markTripThreadsRead],
  );

  const handleTripPartyPeoplePress = useCallback(
    (partyKey: string, partyConversations: TripConversation[]) => {
      if (focusedTripPartyKey === partyKey) {
        setFocusedTripPartyKey(null);
        return;
      }

      setFocusedTripPartyKey(partyKey);

      if (partyConversations.length === 1) {
        void openConversation(partyConversations[0]!);
        return;
      }

      if (isMobileChatUi) {
        setIsMobileDetail(false);
        setSelectedConvId(null);
        requestAnimationFrame(() => {
          tripInboxListRef.current?.scrollToOffset({ offset: 0, animated: true });
        });
        return;
      }

      const best = pickRecommendedTripConversation(partyConversations);
      if (best) void openConversation(best);
    },
    [focusedTripPartyKey, openConversation, isMobileChatUi],
  );

  useEffect(() => {
    const activeDetailId = isTripStreamTab(activeTab) ? selectedConvId : selectedNetId;
    const detailVisible = isDesktop || isMobileDetail;
    if (!detailVisible || !activeDetailId) return;

    detailEnterProgress.setValue(0);
    Animated.timing(detailEnterProgress, {
      toValue: 1,
      duration: 240,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [
    activeTab,
    detailEnterProgress,
    isDesktop,
    isMobileDetail,
    selectedConvId,
    selectedNetId,
  ]);

  const isSendingRef = useRef(false);
  const handleSend = async (overrideText?: string) => {
    if (isSendingRef.current) return;
    const text = (overrideText ?? messageInput).trim();
    if (!text) return;
    isSendingRef.current = true;
    const pendingReply = replyContext;
    setMessageInput("");
    setShowEmoji(false);
    setShowScripts(false);
    clearReply();
    try {
      if (isTripStreamTab(activeTab) && selectedConvId) {
        await sendMessage(
          selectedConvId,
          text,
          "text",
          pendingReply?.messageId ?? null,
          pendingReply
            ? { senderName: pendingReply.senderName, content: pendingReply.content, messageType: pendingReply.messageType ?? null }
            : null,
        );
        // Scroll is handled once by the thread tail effect (no post-send scrollToEnd —
        // that raced replaceOptimistic / contentSize and flickered from the bottom).
      } else if (activeTab === "network" && selectedNetId) {
        sendNet(selectedNetId, text, "dispatcher");
        // One pin after optimistic insert; avoid multi-timeout scroll storms.
        requestAnimationFrame(() => {
          try {
            messagesRef.current?.scrollToEnd({ animated: false });
          } catch {
            // ignore
          }
        });
      }
    } finally {
      isSendingRef.current = false;
    }
  };

  useEffect(() => {
    const tripId = selectedConv?.trip_id;
    if (!tripId) {
      setTripHubAssets(null);
      return;
    }
    let cancelled = false;
    void getTripAssetsForChatHub(tripId).then((assets) => {
      if (!cancelled) setTripHubAssets(assets);
    });
    return () => {
      cancelled = true;
    };
  }, [selectedConv?.trip_id]);

  const docShareInFlightRef = useRef<string | null>(null);

  const handleDocShare = async (doc: DocumentSharePayload) => {
    if (!selectedConv || !organizationId) return;
    const pathKey = normalizeTripDocumentsStoragePath(doc.storage_path);
    if (!pathKey || docShareInFlightRef.current === pathKey) return;
    docShareInFlightRef.current = pathKey;
    const senderProfile = profile as {
      full_name?: string | null;
      displayName?: string | null;
      uid?: string | null;
    } | null;
    const senderRole =
      selectedConv.organization_id &&
      selectedConv.organization_id !== organizationId
        ? "supplier"
        : "dispatcher";
    const senderName =
      senderProfile?.full_name ||
      senderProfile?.displayName ||
      (senderRole === "supplier" ? "Supplier" : "Dispatcher");
    const docMessageOrgId = selectedConv.organization_id ?? organizationId;
    try {
      await sendDocumentShareMessage({
        conversationId: selectedConv.id,
        organizationId: docMessageOrgId,
        senderRole,
        senderName,
        senderUserId: senderProfile?.uid ?? null,
        metadata: {
          document_type: doc.document_type ?? doc.label,
          storage_path: doc.storage_path,
          document_name: doc.label,
          mime_type: doc.mime_type ?? null,
          entity_type: doc.entity_type,
          entity_id: doc.entity_id,
        },
      });
      setTimeout(() => messagesRef.current?.scrollToEnd({ animated: true }), 80);
    } catch {
      // fail silently
    } finally {
      docShareInFlightRef.current = null;
    }
  };

  const handleAddToBook = async (message: TripMessageRow) => {
    const meta = message.metadata as LedgerEventMetadata | null;
    if (!meta || !currentOrgId || !selectedConv) return;
    if (meta.acknowledged_at || meta.is_booked) return;
    if (addToBookInFlightRef.current.has(message.id)) return;
    const txId = String(meta.transaction_id ?? "").trim();
    if (!txId) {
      Alert.alert("Error", "This ledger entry cannot be booked.");
      return;
    }

    addToBookInFlightRef.current.add(message.id);
    markLedgerBookPending(message.id);
    chatStore.applyLedgerBookOptimistic(selectedConv.id, txId);

    try {
      const { error } = await confirmLedgerToAccountingBooks(message.id, currentOrgId);
      if (error) {
        chatStore.revertLedgerBookOptimistic(selectedConv.id, txId);
        Alert.alert("Error", error.message);
        return;
      }
      if (Platform.OS === "web" && isDesktop) {
        setLedgerWebToast(true);
        setTimeout(() => setLedgerWebToast(false), 2600);
      } else if (Platform.OS !== "web") {
        useGlobalSyncStore.getState().pulseLedgerBookSuccess();
      }
    } catch {
      chatStore.revertLedgerBookOptimistic(selectedConv.id, txId);
      Alert.alert("Error", "Could not add to book. Please try again.");
    } finally {
      addToBookInFlightRef.current.delete(message.id);
      clearLedgerBookPending(message.id);
    }
  };

  const handleDispute = async (message: TripMessageRow) => {
    if (!selectedConv) return;
    await disputeLedgerEventMessage(message.id);
    // Pre-fill the reply input with a dispute notice
    const meta = message.metadata as LedgerEventMetadata | null;
    if (meta) {
      const amount = new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 0,
      }).format(meta.amount);
      setMessageInput(`Raising dispute on ${amount} — ${meta.category}. `);
    }
  };

  const openCompose = async (prefillTripId?: string | null) => {
    if (!allowNewTripConversation) {
      Alert.alert(
        "New conversations disabled",
        "Only existing conversations are available right now.",
      );
      return;
    }
    setShowTripFilterModal(false);
    setShowCompose(true);
    setComposeSearch("");
    setComposeTripListIssue(null);
    setExpandedTripId(prefillTripId ?? null);
    if (!organizationId) {
      setComposeTrips([]);
      setComposeTripListIssue("no_org");
      return;
    }
    // Reuse the already-fetched trip list if it was loaded within the last 2 minutes.
    // The mount effect populates hubComposeTrips; re-fetching on every compose open
    // was generating 3 duplicate DB calls (trips + clients + suppliers) per click.
    const COMPOSE_TRIPS_STALE_MS = 2 * 60_000;
    if (
      hubComposeTrips.length > 0 &&
      Date.now() - hubComposeTripsLoadedAtRef.current < COMPOSE_TRIPS_STALE_MS
    ) {
      setComposeTrips(hubComposeTrips);
      return;
    }
    setComposeLoading(true);
    try {
      const trips = await getTripsForCompose(organizationId);
      setComposeTrips(trips);
      setHubComposeTrips(trips);
      hubComposeTripsLoadedAtRef.current = Date.now();
    } catch {
      setComposeTrips(hubComposeTrips.length > 0 ? hubComposeTrips : []);
      if (hubComposeTrips.length === 0) setComposeTripListIssue("fetch_failed");
    } finally {
      setComposeLoading(false);
    }
  };

  const handleTripEmptyStartConversation = useCallback(() => {
    setTripStartNoticeMode(activeTab === "indent" ? "integrated" : "driver");
  }, [activeTab]);

  const handleInitiate = async (
    trip: TripForCompose,
    partyType: ConversationPartyType,
    partyName: string,
    partyId: string
  ) => {
    if (!isPartyLinkedForTripChat(trip, partyType)) {
      Alert.alert(
        "Chat unavailable",
        "This party is not linked to an app organization yet. Link both sides first, then start chat.",
      );
      return;
    }
    setInitiating(true);
    const convId = await initiateConversation({
      tripId: trip.id,
      tripNumber: getTripOperationalDisplay({
        trip_operational_code: trip.trip_operational_code ?? null,
        trip_code: trip.trip_code ?? null,
          display_trip_id: trip["display_trip_id"] ?? null,
          trip_number: trip["trip_number"] ?? null,
      }),
      pickupArea: trip.pickup_area,
      dropLocation: trip.drop_location,
      partyType,
      partyName,
      partyId,
    });
    setInitiating(false);
    if (!convId) return;
    setShowCompose(false);
    setActiveTab(isAggregateTrip(trip) && Boolean(String(trip.indent_id ?? "").trim()) ? "indent" : "trips");
    setSelectedConvId(convId);
    if (!isDesktop) setIsMobileDetail(true);
  };

  const filteredComposeTrips = useMemo(() => {
    const q = composeSearch.trim().toLowerCase();
    if (!q) return composeTrips;
    return composeTrips.filter(
      (t) =>
        getTripOperationalDisplay({
          trip_operational_code: t.trip_operational_code ?? null,
          trip_code: t.trip_code ?? null,
          display_trip_id: t["display_trip_id"] ?? null,
          trip_number: t["trip_number"] ?? null,
        })
          .toLowerCase()
          .includes(q) ||
        (t.client_name ?? "").toLowerCase().includes(q) ||
        (t.supplier_name ?? "").toLowerCase().includes(q) ||
        (t.pickup_area ?? "").toLowerCase().includes(q) ||
        (t.drop_location ?? "").toLowerCase().includes(q),
    );
  }, [composeSearch, composeTrips]);

  const composeTripsWithChatParties = useMemo(() => {
    let list = filteredComposeTrips.filter((t) => tripHasSelectableComposeParty(t));
    if (activeTab === "indent") {
      list = list.filter((t) => isAggregateTrip(t) && Boolean(String(t.indent_id ?? "").trim()));
    } else if (activeTab === "trips") {
      list = list.filter(
        (t) =>
          (!isAggregateTrip(t) || !String(t.indent_id ?? "").trim()) &&
          Boolean(String(t.driver_id ?? "").trim()) &&
          manualTripDriverAccepted(t.status),
      );
    }
    return list;
  }, [filteredComposeTrips, activeTab]);

  const filteredNetPartners = netComposeSearch.trim()
    ? netPartners.filter((p) =>
        p.name.toLowerCase().includes(netComposeSearch.toLowerCase())
      )
    : netPartners;

  const toggleTripPartyFilter = (partyType: ConversationPartyType) => {
    setTripPartyFilters((prev) =>
      prev.includes(partyType)
        ? prev.filter((type) => type !== partyType)
        : [...prev, partyType],
    );
  };

  // Partners that don't yet have a conversation
  const existingPartnerOrgIds = new Set(netChats.map((c) => c.partnerId));
  const newPartners = filteredNetPartners.filter((p) => !existingPartnerOrgIds.has(p.org_id));

  const resolveNetChatPartyType = useCallback(
    (chat: IntegratedChat): "client" | "supplier" | undefined =>
      chat.partnerPartyType ??
      netPartners.find((p) => p.org_id === chat.partnerId)?.party_type,
    [netPartners],
  );

  const handleNetworkInitiate = async (partner: NetworkPartner) => {
    setInitiating(true);
    const convId = await initiateNetworkConversation(partner);
    setInitiating(false);
    if (!convId) return;
    setShowNetCompose(false);
    setActiveTab("network");
    setSelectedNetId(convId);
    if (!isDesktop) setIsMobileDetail(true);
  };

  const slackPeopleItems = useMemo((): SlackPeopleItem[] => {
    if (activeTab === "network") {
      const items: SlackPeopleItem[] = [];
      const seen = new Set<string>();
      for (const chat of sortedNetChats) {
        if (seen.has(chat.partnerId) || items.length >= 14) continue;
        seen.add(chat.partnerId);
        const shortName =
          chat.partnerName.trim().split(/\s+/)[0] ?? chat.partnerName;
        items.push({
          id: chat.partnerId,
          name: shortName,
          identity: resolveNetworkPartnerAvatar(chat),
          unread: chat.unreadCount,
          online: chat.unreadCount > 0,
          onPress: () => {
            setFocusedNetPartnerId((prev) =>
              prev === chat.partnerId ? null : chat.partnerId,
            );
            setSelectedNetId(chat.id);
            markNetRead(chat.id);
            openDetail();
          },
        });
      }
      for (const partner of netPartners) {
        if (seen.has(partner.org_id) || items.length >= 14) continue;
        const shortName = partner.name.trim().split(/\s+/)[0] ?? partner.name;
        items.push({
          id: partner.org_id,
          name: shortName,
          identity: {
            displayName: partner.name,
            entityType: "client",
          },
          onPress: () => {
            const existing = netChats.find((c) => c.partnerId === partner.org_id);
            if (existing) {
              setSelectedNetId(existing.id);
              markNetRead(existing.id);
              openDetail();
              return;
            }
            void handleNetworkInitiate(partner);
          },
        });
      }
      return items;
    }

    type PartyBucket = {
      key: string;
      convs: TripConversation[];
      unread: number;
      latestAt: number;
      sample: TripConversation;
    };
    const buckets = new Map<string, PartyBucket>();
    for (const conv of tripStreamForActiveHubTab) {
      const key = tripPartyPeopleKey(conv);
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = {
          key,
          convs: [],
          unread: 0,
          latestAt: 0,
          sample: conv,
        };
        buckets.set(key, bucket);
      }
      bucket.convs.push(conv);
      bucket.unread += conv.unread_dispatcher_count ?? 0;
      const at = new Date(conv.last_message_at ?? 0).getTime();
      if (at >= bucket.latestAt) {
        bucket.latestAt = at;
        bucket.sample = conv;
      }
    }

    return [...buckets.values()]
      .sort((a, b) => b.latestAt - a.latestAt)
      .slice(0, 14)
      .map((bucket) => {
        const conv = bucket.sample;
        const composeTrip = tripComposeById.get(conv.trip_id) ?? null;
        const identity = resolveTripConversationAvatar(
          conv,
          composeTrip,
          tripLinkedOrgBranding as Record<string, ChatOrgBranding>,
          {
            ...tripAvatarViewerBase,
            tripHostOrgId:
              conv.trip_organization_id ?? conv.organization_id ?? null,
          },
        );
        const resolvedName = resolveChatPartyDisplayName(
          conv.party_type,
          conv.party_name,
          composeTrip,
        );
        const shortName = formatChatPartyStripLabel(conv.party_type, resolvedName);
        return {
          id: bucket.key,
          name: shortName,
          identity,
          unread: bucket.unread,
          onPress: () => {
            handleTripPartyPeoplePress(bucket.key, bucket.convs);
          },
        };
      });
  }, [
    activeTab,
    sortedNetChats,
    netPartners,
    netChats,
    tripStreamForActiveHubTab,
    tripComposeById,
    tripLinkedOrgBranding,
    tripAvatarViewerBase,
    markNetRead,
    handleTripPartyPeoplePress,
    openDetail,
  ]);

  // ── List items ───────────────────────────────────────────────────────────────

  const openTeamTripRoom = useCallback((tripId: string) => {
    setSelectedConvId(null);
    setSelectedNetId(null);
    setIsMobileDetail(false);
    setPlatformTripRoomId(tripId);
  }, []);

  const renderConvItem = useCallback(({ item }: { item: TripConversation }) => {
    const active = selectedConvId === item.id;
    const displayTripId =
      tripListDisambiguatedLabels.get(item.trip_id) ?? getConversationTripLabel(item);
    const isActiveTrip = !isTerminalTripStatus(item.trip_status);
    const time = item.last_message_at
      ? new Date(item.last_message_at).toLocaleTimeString("en-IN", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
        })
      : "";

    const composeTrip = tripComposeById.get(item.trip_id) ?? null;
    const laneAvatar = resolveTripConversationAvatar(
      item,
      composeTrip,
      tripLinkedOrgBranding as Record<string, ChatOrgBranding>,
      {
        ...tripAvatarViewerBase,
        tripHostOrgId: item.trip_organization_id ?? item.organization_id ?? null,
      },
    );
    const partyLine = formatChatPartyInboxLine(
      item.party_type,
      resolveChatPartyDisplayName(item.party_type, item.party_name, composeTrip),
    );
    const latestPreview = latestTripConversationPreview(item, {
        manualDriverOnly: activeTab === "trips" && item.party_type === "driver",
        composeTrip,
        tripHint: composeTrip
          ? {
              pickupArea: composeTrip.pickup_area,
              dropLocation: composeTrip.drop_location,
              status: composeTrip.status ?? null,
            }
          : {
              pickupArea: item.pickup_area,
              dropLocation: item.drop_location,
              status: item.trip_status ?? null,
            },
      });
    const latestPreviewText = latestPreview.text || null;
    const mobilePreviewKind =
      latestPreview.kind === "data" || latestPreview.kind === "html" ? "system" : latestPreview.kind;
    const partyRecommended =
      Boolean(focusedTripPartyKey) &&
      conversationMatchesPartyPeopleKey(item, focusedTripPartyKey);

    if (isMobileChatUi) {
      return (
        <ChatSlackListRow
          identity={laneAvatar}
          title={displayTripId}
          time={time}
          partyLine={partyLine}
          preview={latestPreviewText}
          previewKind={mobilePreviewKind}
          previewImagePreviews={latestPreview.imagePreviews}
          previewDriverSwap={latestPreview.driverSwap}
          documentExtension={latestPreview.documentExtension}
          documentIsImage={latestPreview.documentIsImage}
          active={active}
          recommended={partyRecommended}
          unread={item.unread_dispatcher_count}
          onPress={() => void openConversation(item)}
        />
      );
    }

    if (isDesktop) {
      return (
        <ChatSlackDesktopSidebarRow
          identity={laneAvatar}
          title={displayTripId}
          time={time}
          partyLine={partyLine}
          preview={latestPreviewText}
          previewKind={latestPreview.kind}
          previewImageUrl={latestPreview.imageUrl}
          previewImagePreviews={latestPreview.imagePreviews}
          previewDriverSwap={latestPreview.driverSwap}
          documentExtension={latestPreview.documentExtension}
          documentIsImage={latestPreview.documentIsImage}
          active={active}
          anchorRef={active ? desktopActiveRowRef : undefined}
          onPress={() => void openConversation(item)}
        />
      );
    }

    return (
      <TouchableOpacity
        style={[s.chatItem, active && s.chatItemActive]}
        onPress={() => void openConversation(item)}
        activeOpacity={0.8}
      >
        <View style={s.chatAvatarWrap}>
          <ChatPartyAvatar identity={laneAvatar} size={56} />
          {item.unread_dispatcher_count > 0 && !active && (
            <View style={s.chatAvatarUnreadDot} />
          )}
        </View>
        <View style={s.chatBody}>
          <View style={s.chatRow}>
            <View style={s.chatTitleRow}>
              <Text style={[s.chatTitle, active && s.chatTitleActive]} numberOfLines={1}>
                {displayTripId}
              </Text>
              {isActiveTrip ? <View style={[s.activeTripDot, active && s.activeTripDotActive]} /> : null}
            </View>
            <Text style={[s.chatTime, active && s.chatTimeActive]}>{time}</Text>
          </View>
          <Text style={[s.chatPartyLabel, active && s.chatPartyLabelActive]}>
            {partyLine}
          </Text>
          {latestPreviewText ? (
            <ChatListPreviewText
              text={latestPreviewText}
              style={[s.chatSub, active && s.chatSubActive]}
              numberOfLines={1}
            />
          ) : null}
        </View>
        {item.unread_dispatcher_count > 0 && !active && (
          <Badge count={item.unread_dispatcher_count} />
        )}
      </TouchableOpacity>
    );
  }, [
    selectedConvId,
    openConversation,
    activeTab,
    isDesktop,
    isMobileChatUi,
    focusedTripPartyKey,
    tripListDisambiguatedLabels,
    tripComposeById,
    tripLinkedOrgBranding,
    tripAvatarViewerBase,
  ]);

  const renderTripInboxRow = useCallback(
    ({ item }: { item: MobileTripInboxRow }) => {
      if (item.kind === "party_recommended_header") {
        return (
          <ChatSlackPartyRecommendedHeader
            partyName={item.partyName}
            count={item.count}
          />
        );
      }
      if (item.kind === "party_recommended_divider") {
        return <ChatSlackPartyRecommendedDivider />;
      }
      return renderConvItem({ item: item.conversation });
    },
    [renderConvItem],
  );

  const renderNetItem = useCallback(({ item }: { item: IntegratedChat }) => {
    const partnerAvatar = resolveNetworkPartnerAvatar(item);
    const last = item.messages[item.messages.length - 1];
    const networkPreview = previewFromNetworkContent(last?.content);
    const netPartyLine = formatChatPartyTypeLabel(resolveNetChatPartyType(item));
    const active = selectedNetId === item.id;
    const openNet = () => {
      setSelectedNetId(item.id);
      markNetRead(item.id);
      openDetail();
    };

    if (isMobileChatUi) {
      return (
        <ChatSlackListRow
          identity={partnerAvatar}
          title={item.partnerName}
          time={item.lastActivity}
          partyLine={netPartyLine}
          preview={networkPreview.text}
          previewKind={networkPreview.kind === "data" || networkPreview.kind === "html" ? "system" : networkPreview.kind}
          active={active}
          unread={item.unreadCount}
          onPress={openNet}
        />
      );
    }

    if (isDesktop) {
      return (
        <ChatSlackDesktopSidebarRow
          identity={partnerAvatar}
          title={item.partnerName}
          time={item.lastActivity}
          partyLine={netPartyLine}
          preview={networkPreview.text}
          previewKind={networkPreview.kind}
          previewImageUrl={networkPreview.imageUrl}
          active={active}
          anchorRef={active ? desktopActiveRowRef : undefined}
          onPress={openNet}
        />
      );
    }

    return (
      <TouchableOpacity
        style={[s.chatItem, active && s.chatItemActive]}
        onPress={openNet}
        activeOpacity={0.8}
      >
        <ChatPartyAvatar identity={partnerAvatar} size={56} />
        <View style={s.chatBody}>
          <View style={s.chatRow}>
            <Text style={[s.chatTitle, active && s.chatTitleActive]} numberOfLines={1}>
              {item.partnerName}
            </Text>
            <Text style={[s.chatTime, active && s.chatTimeActive]}>{item.lastActivity}</Text>
          </View>
          {netPartyLine ? (
            <Text style={[s.chatPartyLabel, active && s.chatPartyLabelActive]} numberOfLines={1}>
              {netPartyLine}
            </Text>
          ) : null}
          <ChatListPreviewText
            text={last?.content ?? ""}
            style={[s.chatSub, active && s.chatSubActive]}
            numberOfLines={1}
          />
        </View>
        {item.unreadCount > 0 && !active && <Badge count={item.unreadCount} />}
      </TouchableOpacity>
    );
  }, [
    selectedNetId,
    markNetRead,
    openDetail,
    isMobileChatUi,
    isDesktop,
    resolveNetChatPartyType,
  ]);

  // ── Panels ───────────────────────────────────────────────────────────────────

  function ChatList() {
    const TABS: {
      id: TabId;
      label: string;
      lateCount: number;
      unread: number;
      Icon: React.ComponentType<{ size: number; color: string; strokeWidth?: number }>;
    }[] = [
      { id: "trips", label: "MANUAL", lateCount: manualRunningLateActiveCount, unread: tripsChatUnread, Icon: Hash },
      {
        id: "indent",
        label: "INTEGRATED",
        lateCount: integratedRunningLateActiveCount,
        unread: indentChatUnread,
        Icon: Briefcase,
      },
      { id: "network", label: "NETWORK DM", lateCount: 0, unread: netUnread, Icon: Users },
    ];

    const slackListTitle =
      activeTab === "network" ? "DMs" : activeTab === "indent" ? "Integrated" : "Trips";
    const slackListBottomPad = mobileKeyboardOpen
      ? Math.max(insets.bottom, 12)
      : CHAT_SLACK_BOTTOM_NAV_BAR + Math.max(insets.bottom, 6) + 16;
    const slackFabOnPress = () => {
      if (activeTab === "network") {
        setShowNetCompose(true);
        return;
      }
      void openCompose();
    };

    const slackInboxToolbar = isMobileChatUi ? (
      <ChatSlackInboxToolbar
        peopleItems={slackPeopleItems}
        selectedPeopleId={
          activeTab === "network"
            ? (focusedNetPartnerId ?? selectedNet?.partnerId ?? null)
            : focusedTripPartyKey
        }
        peopleSectionLabel={
          activeTab === "network"
            ? "Partners"
            : activeTab === "indent"
              ? "Integrated"
              : "On trip"
        }
        networkStoryStrip={
          activeTab === "network" ? (
            <View style={s.chatStoryInlineWrap}>
                posts={networkStoryPosts}
                orgId={currentOrgId || undefined}
                orgName={currentOrganization?.name ?? undefined}
                onCreatePost={() => router.push("/(modals)/create-post")}
                networkPartnerOrgIds={chatNetworkPartnerOrgIds}
                indentCountByPostId={networkStoryIndentCounts}
                embedded
              />
              {storiesLoading && networkStoryPosts.length === 0 ? (
                <View style={s.chatStoryLoadingRow}>
                  <LoadingIndicator size="small" color={CHAT_ACCENT} />
                  <Text style={s.chatStoryLoadingText}>Syncing stories…</Text>
                </View>
              ) : null}
            </View>
          ) : undefined
        }
        onCompose={slackFabOnPress}
        filterChips={slackFilterChips}
        showSearch={isTripStreamTab(activeTab) || activeTab === "network"}
        searchValue={isTripStreamTab(activeTab) ? tripSidebarSearch : netSidebarSearch}
        onSearchChange={
          isTripStreamTab(activeTab) ? setTripSidebarSearch : setNetSidebarSearch
        }
        onSearchClear={() => {
          if (isTripStreamTab(activeTab)) setTripSidebarSearch("");
          else setNetSidebarSearch("");
        }}
        searchPlaceholder={
          isTripStreamTab(activeTab)
            ? "Search trips, routes…"
            : "Search direct messages…"
        }
        searchInputRef={
          isTripStreamTab(activeTab) ? tripSearchInputRef : netSearchInputRef
        }
      />
    ) : null;

    const tripRoomInboxSection =
      CHAT_TEAM_ROOMS_SIDEBAR_ENABLED && isTripStreamTab(activeTab) ? (
        <ChatTripRoomInboxSection
          organizationId={currentOrgId || organizationId}
          onOpenTripRoom={openTeamTripRoom}
          composeTripsById={tripComposeById}
          activeTripId={platformTripRoomId}
        />
      ) : null;

    const tripStreamMobileHeader =
      isTripStreamTab(activeTab) && isMobileChatUi ? (
        <>
          {slackInboxToolbar}
          {tripRoomInboxSection}
        </>
      ) : (
        slackInboxToolbar
      );

    const desktopPeopleStrip =
      isDesktop && (slackPeopleItems.length > 0 || activeTab === "network") ? (
        <View style={deskSt.sidebarPeopleStrip}>
          <ChatSlackPeopleStrip
            items={slackPeopleItems}
            selectedId={
              activeTab === "network"
                ? (focusedNetPartnerId ?? selectedNet?.partnerId ?? null)
                : focusedTripPartyKey
            }
            sectionLabel={
              activeTab === "network"
                ? "Partners"
                : activeTab === "indent"
                  ? "Integrated"
                  : "On trip"
            }
            onCompose={() => {
              if (activeTab === "network") setShowNetCompose(true);
              else void openCompose();
            }}
          />
        </View>
      ) : null;

    return (
      <View style={[s.listPanel, isMobileChatUi && s.listPanelMobile]}>
        {isMobileChatUi ? (
          <>
            <ChatSlackListHeader
              streamLabel={slackListTitle}
              orgName={currentOrganization?.name ?? undefined}
              topInset={insets.top}
              onBack={() =>
                router.canGoBack() ? router.back() : router.replace(ROUTES.TABS.TRIPS)
              }
              onCompose={slackFabOnPress}
              profileName={profile?.full_name ?? profile?.displayName ?? undefined}
              profileAvatarUrl={profile?.avatar_url}
              profileAvatarSeed={profile?.avatar_seed}
              profileOrgLogoUrl={currentOrganization?.logo_url}
            />
          </>
        ) : isDesktop ? (
          <>
          <ChatSlackDesktopSidebarChrome
            workspaceName={currentOrganization?.name ?? "Pulse Chat"}
            organizationId={currentOrganization?.id ?? null}
            organizationLogoUrl={currentOrganization?.logo_url ?? null}
            organizationOwnerAvatarSeed={profile?.avatar_seed ?? null}
            searchValue={activeTab === "network" ? netSidebarSearch : tripSidebarSearch}
            onSearchChange={activeTab === "network" ? setNetSidebarSearch : setTripSidebarSearch}
            onClearSearch={() => {
              if (activeTab === "network") setNetSidebarSearch("");
              else setTripSidebarSearch("");
            }}
            onCompose={() => {
              if (activeTab === "network") setShowNetCompose(true);
              else void openCompose();
            }}
            onClose={() =>
              router.canGoBack() ? router.back() : router.replace(ROUTES.TABS.TRIPS)
            }
          />
          </>
        ) : (
          <>
            <View style={[s.listHeader, isMobileChatUi && s.listHeaderMobile]}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
                <TouchableOpacity
                  onPress={() =>
                    router.canGoBack() ? router.back() : router.replace(ROUTES.TABS.TRIPS)
                  }
                  hitSlop={10}
                  style={s.backBtn}
                >
                  <ArrowLeft size={18} color="#fff" />
                </TouchableOpacity>
                <Text style={s.brandTitle} numberOfLines={1}>
                  pulse business chat
                  <Text style={s.brandDot}>.</Text>
                </Text>
              </View>
              {!isDesktop && isTripStreamTab(activeTab) ? (
                <TouchableOpacity
                  onPress={() => {
                    if (hubSearchOpen) {
                      setHubSearchOpen(false);
                      setTripSidebarSearch("");
                    } else {
                      setHubSearchOpen(true);
                    }
                  }}
                  hitSlop={10}
                  style={[
                    s.headerSearchBtn,
                    (hubSearchOpen || tripSidebarSearch.length > 0) && s.headerSearchBtnActive,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={hubSearchOpen ? "Close search" : "Search trips"}
                >
                  {hubSearchOpen ? (
                    <X size={16} color="#fff" />
                  ) : (
                    <Search size={16} color="#94a3b8" />
                  )}
                </TouchableOpacity>
              ) : (
                <View />
              )}
            </View>

            <View style={s.tabRow}>
              {TABS.map((t) => {
                const active = activeTab === t.id;
                return (
                  <TouchableOpacity
                    key={t.id}
                    style={[s.tabPill, active && s.tabPillActive]}
                    onPress={() => setActiveTab(t.id)}
                    activeOpacity={0.75}
                  >
                    <t.Icon size={12} color={active ? "#ffffff" : CHAT_ICON_MUTED} strokeWidth={active ? 2.25 : 2} />
                    <View style={s.tabPillLabelWrap}>
                      <Text
                        style={[s.tabPillLabel, active && s.tabPillLabelActive]}
                        numberOfLines={1}
                        ellipsizeMode="tail"
                      >
                        {t.lateCount > 0 ? `${t.label} (${t.lateCount})` : t.label}
                      </Text>
                    </View>
                    {t.unread > 0 && (
                      <View style={[s.tabUnreadBadge, active && s.tabUnreadBadgeActive]}>
                        <Text style={[s.tabUnreadText, active && s.tabUnreadTextActive]}>
                          {t.unread > 9 ? "9+" : String(t.unread)}
                        </Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        )}

        {isTripStreamTab(activeTab) && !isMobileChatUi && !isDesktop ? (
            <View style={s.tripSearchScopeBlock}>
              {hubSearchOpen ? (
                <View style={[chatFilterChromeStyles.searchWrap, s.tripSearchScopeSearchMobile]}>
                  <Search size={12} color="#94a3b8" style={{ marginRight: 5 }} />
                  <TextInput
                    style={chatFilterChromeStyles.searchInput}
                    value={tripSidebarSearch}
                    onChangeText={setTripSidebarSearch}
                    placeholder="Search trip, route…"
                    placeholderTextColor="#94a3b8"
                    autoCapitalize="none"
                    autoFocus
                  />
                  {tripSidebarSearch.length > 0 && (
                    <TouchableOpacity onPress={() => setTripSidebarSearch("")} hitSlop={8}>
                      <X size={12} color="#94a3b8" />
                    </TouchableOpacity>
                  )}
                </View>
              ) : null}
              <View style={s.tripSearchScopeStripMobile}>
                <TouchableOpacity
                  style={[
                    s.tripChatScopePillStrip,
                    s.tripChatScopePillStripMobile,
                    tripChatScope === "active" && s.tripChatScopePillOn,
                  ]}
                  onPress={() => setTripChatScope("active")}
                  activeOpacity={0.82}
                >
                  <Text
                    style={[
                      s.tripChatScopePillTextStrip,
                      tripChatScope === "active" && s.tripChatScopePillTextOn,
                    ]}
                    numberOfLines={1}
                  >
                    Active
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    s.tripChatScopePillStrip,
                    s.tripChatScopePillStripMobile,
                    tripChatScope === "history" && s.tripChatScopePillOn,
                  ]}
                  onPress={() => setTripChatScope("history")}
                  activeOpacity={0.82}
                >
                  <Text
                    style={[
                      s.tripChatScopePillTextStrip,
                      tripChatScope === "history" && s.tripChatScopePillTextOn,
                    ]}
                    numberOfLines={1}
                  >
                    History
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
        ) : null}

        {isTripStreamTab(activeTab) && isWebAnchoredPanels && showCompose && (
          <View style={[s.composePopoverLayer, pe("box-none")]}>
            <TouchableOpacity
              style={s.tripFilterPopoverBackdrop}
              onPress={() => setShowCompose(false)}
              activeOpacity={1}
            />
            <View style={s.composePopoverCard}>
              <ComposePanelBody tripListScrollStyle={{ maxHeight: 520 }} />
            </View>
          </View>
        )}

        {isTripStreamTab(activeTab) && isDesktop && showTripFilterModal && (
          <View style={[s.tripFilterPopoverLayer, pe("box-none")]}>
            <TouchableOpacity
              style={s.tripFilterPopoverBackdrop}
              onPress={() => setShowTripFilterModal(false)}
              activeOpacity={1}
            />
            <View style={s.tripFilterPopoverCard}>
              <View style={s.tripFilterPopoverHeader}>
                <Text style={s.tripFilterPopoverTitle}>Trip Filters</Text>
                <TouchableOpacity onPress={() => setShowTripFilterModal(false)} hitSlop={8}>
                  <X size={16} color="#94a3b8" />
                </TouchableOpacity>
              </View>
              <Text style={s.tripFilterPopoverSub}>Filter by conversation party</Text>
              <View style={s.filterChipWrap}>
                {TRIP_PARTY_FILTERS.map((partyType, index) => {
                  const selected = tripPartyFilters.includes(partyType);
                  const isLast = index === TRIP_PARTY_FILTERS.length - 1;
                  return (
                    <TouchableOpacity
                      key={partyType}
                      style={[s.filterChip, isLast && s.filterChipLast, selected && s.filterChipActive]}
                      onPress={() => toggleTripPartyFilter(partyType)}
                      activeOpacity={0.75}
                    >
                      <Text style={[s.filterChipText, selected && s.filterChipTextActive]}>
                        {partyFilterSheetLabel(partyType)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <TouchableOpacity
                style={s.filterResetBtn}
                onPress={() => setTripPartyFilters([...TRIP_PARTY_FILTERS])}
                activeOpacity={0.8}
              >
                <Text style={s.filterResetText}>Reset to all parties</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {isTripStreamTab(activeTab) &&
          (isLoading && !bootstrapDone ? (
            // First-ever bootstrap in progress: full-area spinner.
            // After bootstrap has run once, the list is always rendered from
            // in-memory Zustand state — no spinner on subsequent refreshes.
            <View style={{ paddingTop: 40, alignItems: "center" }}>
              <LoadingIndicator color={CHAT_ACCENT} />
            </View>
          ) : isMobileChatUi ? (
            <FlatList
              ref={tripInboxListRef}
              style={slackSt.listScroll}
              data={mobileTripInboxRows}
              keyExtractor={(i) => i.id}
              renderItem={renderTripInboxRow}
              {...SLACK_CHAT_LIST_PROPS}
              ListHeaderComponent={tripStreamMobileHeader}
              ListEmptyComponent={
                <EmptyList
                  label={
                    tripChatScope === "history"
                      ? activeTab === "indent"
                        ? "No integrated trips in history"
                        : "No manual trips in history"
                      : activeTab === "indent"
                        ? "No active integrated trip conversations"
                        : "No active manual trip conversations"
                  }
                  variant={activeTab === "indent" ? "trip_integrated" : "trip_driver"}
                  subtitle={
                    activeTab === "indent"
                      ? CHAT_EMPTY_COPY.tripIntegratedSubtitle
                      : CHAT_EMPTY_COPY.tripDriverSubtitle
                  }
                  actionLabel={tripChatScope === "active" ? "Start a conversation" : undefined}
                  onAction={
                    tripChatScope === "active"
                      ? handleTripEmptyStartConversation
                      : undefined
                  }
                />
              }
              ItemSeparatorComponent={undefined}
              contentContainerStyle={{
                paddingBottom: isMobileChatUi ? slackListBottomPad : 12,
              }}
              scrollEventThrottle={16}
              onScroll={onTripStreamListScroll}
            />
          ) : isDesktop ? (
            <ScrollView
              ref={desktopSidebarScrollRef}
              style={deskSt.listScroll}
              contentContainerStyle={deskSt.sidebarCategoriesContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              scrollEventThrottle={16}
              onScroll={onTripStreamListScroll}
            >
              {desktopPeopleStrip}
              {tripRoomInboxSection}
              <View style={deskSt.sidebarScopeToggleWrap}>
                <View style={deskSt.sidebarScopeToggleRow}>
                  <TouchableOpacity
                    style={[
                      deskSt.sidebarScopePill,
                      tripChatScope === "active" && deskSt.sidebarScopePillOn,
                    ]}
                    onPress={() => setTripChatScope("active")}
                    activeOpacity={0.82}
                    accessibilityRole="button"
                    accessibilityState={{ selected: tripChatScope === "active" }}
                  >
                    <Text
                      style={[
                        deskSt.sidebarScopePillText,
                        tripChatScope === "active" && deskSt.sidebarScopePillTextOn,
                      ]}
                      numberOfLines={1}
                    >
                      Active
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      deskSt.sidebarScopePill,
                      tripChatScope === "history" && deskSt.sidebarScopePillOn,
                    ]}
                    onPress={() => setTripChatScope("history")}
                    activeOpacity={0.82}
                    accessibilityRole="button"
                    accessibilityState={{ selected: tripChatScope === "history" }}
                  >
                    <Text
                      style={[
                        deskSt.sidebarScopePillText,
                        tripChatScope === "history" && deskSt.sidebarScopePillTextOn,
                      ]}
                      numberOfLines={1}
                    >
                      History
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
              <View style={deskSt.sidebarCategoryWrap}>
                {(tripChatScope === "active"
                  ? desktopActiveShowAll
                    ? desktopActiveTripConversations
                    : desktopActiveTripConversations.slice(0, 5)
                  : desktopHistoryShowAll
                    ? desktopHistoryTripConversations
                    : desktopHistoryTripConversations.slice(0, 5)
                ).map((conv) => (
                  <View key={conv.id}>{renderConvItem({ item: conv })}</View>
                ))}
                {(tripChatScope === "active"
                  ? desktopActiveTripConversations.length
                  : desktopHistoryTripConversations.length) > 5 ? (
                  <TouchableOpacity
                    style={deskSt.sidebarCategoryMoreBtn}
                    onPress={() =>
                      tripChatScope === "active"
                        ? setDesktopActiveShowAll((v) => !v)
                        : setDesktopHistoryShowAll((v) => !v)
                    }
                    activeOpacity={0.82}
                  >
                    <Text style={deskSt.sidebarCategoryMoreText}>
                      {(
                        tripChatScope === "active"
                          ? desktopActiveShowAll
                          : desktopHistoryShowAll
                      )
                        ? "Collapse"
                        : "View more"}
                    </Text>
                  </TouchableOpacity>
                ) : null}
                {(tripChatScope === "active"
                  ? desktopActiveTripConversations.length
                  : desktopHistoryTripConversations.length) === 0 ? (
                  <View
                    style={{
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 5,
                      paddingVertical: 12,
                      width: "100%",
                      maxWidth: 300,
                      alignSelf: "center",
                    }}
                  >
                    <CompactChatAnimation
                      size={activeTab === "indent" ? 84 : 112}
                      source={
                        activeTab === "indent"
                          ? NEW_TRIP_INTEGRATED_EMPTY_ANIMATION
                          : NEW_TRIP_DRIVER_EMPTY_ANIMATION
                      }
                    />
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <View
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: 12,
                          backgroundColor: "#EEF2FF",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <MessageSquare size={12} color={CHAT_ACCENT} />
                      </View>
                      <View
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: 12,
                          backgroundColor: "#ECFDF5",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Users size={12} color="#059669" />
                      </View>
                      <View
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: 12,
                          backgroundColor: "#FFF7ED",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Truck size={12} color="#EA580C" />
                      </View>
                    </View>
                    <Text style={deskSt.sidebarCategoryEmptyText}>
                      {tripChatScope === "active"
                        ? "No active conversations"
                        : "No conversations in history"}
                    </Text>
                    {activeTab === "indent" ? (
                      <View style={{ width: "100%", gap: 4 }}>
                        {CHAT_EMPTY_COPY.tripIntegratedFeatures.map((feature) => (
                          <Text
                            key={feature}
                            style={{
                              fontSize: 11,
                              color: SLACK_DESKTOP.textTertiary,
                              textAlign: "center",
                              lineHeight: 16,
                              paddingHorizontal: 16,
                            }}
                          >
                            • {feature}
                          </Text>
                        ))}
                      </View>
                    ) : (
                      <Text
                        style={{
                          fontSize: 11,
                          color: SLACK_DESKTOP.textTertiary,
                          textAlign: "center",
                          lineHeight: 16,
                          paddingHorizontal: 16,
                        }}
                      >
                        {CHAT_EMPTY_COPY.tripDriverSubtitle}
                      </Text>
                    )}
                    {tripChatScope === "active" ? (
                      <TouchableOpacity
                        style={{
                          marginTop: 6,
                          flexDirection: "row",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 6,
                          borderRadius: 999,
                          backgroundColor: CHAT_ACCENT,
                          paddingHorizontal: 16,
                          paddingVertical: 9,
                          alignSelf: "center",
                        }}
                        onPress={handleTripEmptyStartConversation}
                        activeOpacity={0.85}
                      >
                        <LottieView
                          source={START_CHAT_CTA_ANIMATION}
                          autoPlay
                          loop
                          speed={0.9}
                          resizeMode="contain"
                          style={{ width: 18, height: 18 }}
                        />
                        <Text
                          style={{
                            color: "#fff",
                            fontSize: 13,
                            fontWeight: "800",
                            lineHeight: 18,
                          }}
                        >
                          Start a conversation
                        </Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                ) : null}
              </View>
            </ScrollView>
          ) : useGroupedTripHub ? (
            <ScrollView
              style={{ flex: 1, minHeight: 0 }}
              contentContainerStyle={s.tripHubScrollContent}
              showsVerticalScrollIndicator={false}
              scrollEventThrottle={16}
              onScroll={!isDesktop ? onTripStreamListScroll : undefined}
            >
              {groupedTripRows.length === 0 ? (
                <EmptyList
                  label={
                    tripChatScope === "history"
                      ? activeTab === "indent"
                        ? "No integrated trips in history"
                        : "No manual trips in history"
                      : activeTab === "indent"
                        ? "No active integrated trip conversations"
                        : "No active manual trip conversations"
                  }
                  variant={activeTab === "indent" ? "trip_integrated" : "trip_driver"}
                  subtitle={
                    activeTab === "indent"
                      ? CHAT_EMPTY_COPY.tripIntegratedSubtitle
                      : CHAT_EMPTY_COPY.tripDriverSubtitle
                  }
                  actionLabel={tripChatScope === "active" ? "Start a conversation" : undefined}
                  onAction={
                    tripChatScope === "active"
                      ? handleTripEmptyStartConversation
                      : undefined
                  }
                />
              ) : (
                (() => {
                  const visibleRows = groupedTripRows.slice(0, visibleTripCount);
                  let shownUnreadHeader = false;
                  let shownReadHeader = false;
                  const items: React.ReactNode[] = [];
                  visibleRows.forEach((trip) => {
                  const isUnreadTrip = trip.totalUnread > 0;
                  if (isUnreadTrip && !shownUnreadHeader) {
                    shownUnreadHeader = true;
                    items.push(
                      <View key="__unread_header__" style={s.sectionHeaderRow}>
                        <View style={s.sectionHeaderDot} />
                        <Text style={s.sectionHeaderText}>UNREAD</Text>
                      </View>
                    );
                  }
                  if (!isUnreadTrip && !shownReadHeader) {
                    shownReadHeader = true;
                    items.push(
                      <View key="__read_header__" style={s.sectionHeaderRow}>
                        <Text style={[s.sectionHeaderText, s.sectionHeaderTextMuted]}>ALL TRIPS</Text>
                      </View>
                    );
                  }
                  const hubDateLabel = formatTripRouteDate(trip.tripCreatedAt);
                  const tripActive =
                    selectedConv?.trip_id === trip.tripId ||
                    (CHAT_TEAM_ROOMS_SIDEBAR_ENABLED &&
                      platformTripRoomId === trip.tripId);
                  const statusLabel = formatTripHubStatusLabel(
                    trip.tripStatus,
                    trip.tripDriverId,
                    trip.tripSupplierId,
                  );
                  const isUnassignedBadge = statusLabel === "UNASSIGNED";
                  const hubTripForIcons =
                    tripComposeById.get(trip.tripId) ??
                    hubComposeTrips.find((t) => t.id === trip.tripId) ??
                    null;
                  const clientRowForHub = trip.rows.find((r) => r.party_type === "client");
                  const supplierRowForHub = trip.rows.find((r) => r.party_type === "supplier");
                  const hubTripForPartyFilter: TripForCompose | undefined =
                    hubTripForIcons ??
                    (clientRowForHub || supplierRowForHub
                      ? {
                          id: trip.tripId,
                          trip_number: trip.tripLabel,
                          display_trip_id: null,
                          status: trip.tripStatus,
                          created_at: trip.tripCreatedAt,
                          pickup_area: trip.pickup,
                          drop_location: trip.drop,
                          client_id: clientRowForHub?.client_id ?? null,
                          client_name: clientRowForHub?.party_name ?? null,
                          supplier_id: supplierRowForHub?.supplier_id ?? null,
                          supplier_name: supplierRowForHub?.party_name ?? null,
                          driver_id: trip.tripDriverId ?? null,
                          driver_display_name: null,
                          client_linked_organization_id: null,
                          supplier_linked_organization_id: null,
                        }
                      : undefined);
                  const tripHostOrgIdForHub =
                    trip.rows[0]?.trip_organization_id ?? trip.rows[0]?.organization_id ?? null;
                  const tripIntegratedForHub = tripHubHasIntegratedPartition(
                    { trip_id: trip.tripId, indent_id: trip.indentId },
                    chatTrips,
                  );
                  const hubPartyTypesRow = hubCardPartyTypesForTripHub({
                    hubTrip: hubTripForPartyFilter,
                    hubRows: trip.rows,
                    tripDriverId: trip.tripDriverId,
                    tripSupplierId: trip.tripSupplierId,
                    viewerOrgId: organizationId ?? "",
                    viewerOrgName: currentOrganization?.name ?? null,
                    tripHostOrgId: tripHostOrgIdForHub,
                    tripIntegrated: tripIntegratedForHub,
                  });
                  const openFallback = async () => {
                    if (trip.rows.length === 0) {
                      void openCompose(trip.tripId);
                      return;
                    }
                    const storedParty = chatStore.getActivePartyType(trip.tripId);
                    const preferred = storedParty
                      ? (trip.rows.find((r) => r.party_type === storedParty) ??
                        trip.rows[0])
                      : trip.rows[0];
                    await openConversation(preferred!);
                  };
                  const chatEntry = chatTrips[trip.tripId];
                  const partyIconRow = (
                    <>
                      {hubPartyTypesRow.map((tab) => {
                        const row = trip.rows.find((r) => r.party_type === tab.rowType);
                        const on = Boolean(row && selectedConvId === row.id);
                        const entityExists = hubTripForIcons
                          ? isPartyLinkedForTripChat(hubTripForIcons, tab.rowType)
                          : Boolean(row);
                        const isMissing = !row && !entityExists;
                        return (
                          <TouchableOpacity
                            key={`${trip.tripId}-viewer-${tab.displayType}`}
                            style={[
                              s.tripHubPartyIconBtn,
                              tripActive && !on && s.tripHubPartyIconBtnOnDarkCard,
                              on && s.tripHubPartyIconBtnOn,
                              isMissing && s.tripHubPartyIconBtnOff,
                            ]}
                            disabled={isMissing}
                            onPress={async () => {
                              if (row) {
                                await openConversation(row);
                                return;
                              }
                              if (!hubTripForIcons || !entityExists) return;
                              const pr = getComposePartyRows(hubTripForIcons).find(
                                (r) => r.kind === "selectable" && r.partyType === tab.rowType,
                              );
                              if (!pr || pr.kind !== "selectable") return;
                              setInitiating(true);
                              const convId = await initiateConversation({
                                tripId: hubTripForIcons.id,
                                tripNumber: getTripOperationalDisplay({
                                  trip_operational_code:
                                    (hubTripForIcons as { trip_operational_code?: string | null })
                                      .trip_operational_code ?? null,
                                  trip_code:
                                    (hubTripForIcons as { trip_code?: string | null }).trip_code ??
                                    null,
                                  display_trip_id: hubTripForIcons["display_trip_id"] ?? null,
                                  trip_number: hubTripForIcons["trip_number"] ?? null,
                                }),
                                pickupArea: hubTripForIcons.pickup_area,
                                dropLocation: hubTripForIcons.drop_location,
                                partyType: tab.rowType,
                                partyName: pr.name,
                                partyId: pr.id,
                              });
                              setInitiating(false);
                              if (convId) {
                                const created = chatStore.getConversation(convId);
                                if (created) void openConversation(created);
                              }
                            }}
                            activeOpacity={0.82}
                          >
                            <PartyIcon
                              partyType={tab.displayType}
                              active={on}
                              tone="hub"
                              size={14}
                              inactiveOnDarkCard={tripActive && !on}
                            />
                            {(row?.unread_dispatcher_count ?? 0) > 0 ? (
                              <View style={s.tripHubPartyUnreadDot} />
                            ) : null}
                          </TouchableOpacity>
                        );
                      })}
                    </>
                  );
                  const card = (
                    <TripCard
                      key={trip.tripId}
                      tripActive={tripActive}
                      totalUnread={trip.totalUnread}
                      onPressHero={() => void openFallback()}
                      tripLabel={trip.tripLabel}
                      pickup={trip.pickup}
                      drop={trip.drop}
                      hubDateLabel={hubDateLabel}
                      statusLabel={statusLabel}
                      isUnassignedBadge={isUnassignedBadge}
                      chatFlow={chatEntry?.chatFlow ?? "private_trip"}
                      indentId={chatEntry?.indentId ?? null}
                      trackingStatus={chatEntry?.trackingStatus ?? null}
                      partyIconRow={partyIconRow}
                      lastActivityPartyLabel={
                        trip.lastActivityConv ? partyLabel(trip.lastActivityConv.party_type) : null
                      }
                      lastMessagePreview={trip.lastActivityConv?.last_message_preview ?? null}
                    />
                  );
                  items.push(card);
                  });
                  const showLoadMoreFooter =
                    groupedTripRows.length > 0 &&
                    (visibleTripCount < groupedTripRows.length || chatBootstrapHasMoreTrips);
                  if (showLoadMoreFooter) {
                    const sliceRemaining = Math.max(0, groupedTripRows.length - visibleTripCount);
                    const batch =
                      sliceRemaining > 0 ? Math.min(20, sliceRemaining) : 20;
                    items.push(
                      <View key="__load_more__" style={s.loadMoreLinkWrap}>
                        <TouchableOpacity
                          style={s.loadMoreLinkTouchable}
                          disabled={isAppendingBootstrap}
                          onPress={() => {
                            if (visibleTripCount < groupedTripRows.length) {
                              setVisibleTripCount((c) => c + 20);
                              return;
                            }
                            if (!organizationId) return;
                            void appendBootstrapTripPage(organizationId).then(() => {
                              setVisibleTripCount((c) => c + 20);
                            });
                          }}
                          activeOpacity={0.65}
                        >
                          <View style={s.loadMoreLinkInner}>
                            {isAppendingBootstrap ? (
                              <LoadingIndicator size="small" color="#94a3b8" />
                            ) : null}
                            <Text style={s.loadMoreLinkText}>
                              {isAppendingBootstrap
                                ? "Loading…"
                                : sliceRemaining > 0
                                  ? `Load ${batch} more`
                                  : "Load more trips"}
                            </Text>
                          </View>
                        </TouchableOpacity>
                      </View>,
                    );
                  }
                  return items;
                })()
              )}
            </ScrollView>
          ) : (
            <FlatList
              data={tripChatFilteredConversations}
              keyExtractor={(i) => i.id}
              renderItem={renderConvItem}
              ListEmptyComponent={
                <EmptyList
                  label={
                    tripChatScope === "history"
                      ? activeTab === "indent"
                        ? "No integrated trips in history"
                        : "No manual trips in history"
                      : activeTab === "indent"
                        ? "No active integrated trip conversations"
                        : "No active manual trip conversations"
                  }
                  variant={activeTab === "indent" ? "trip_integrated" : "trip_driver"}
                  subtitle={
                    activeTab === "indent"
                      ? CHAT_EMPTY_COPY.tripIntegratedSubtitle
                      : CHAT_EMPTY_COPY.tripDriverSubtitle
                  }
                  actionLabel={tripChatScope === "active" ? "Start a conversation" : undefined}
                  onAction={
                    tripChatScope === "active"
                      ? handleTripEmptyStartConversation
                      : undefined
                  }
                />
              }
              contentContainerStyle={{ padding: 10, paddingBottom: 24, gap: 4 }}
              scrollEventThrottle={16}
              onScroll={onTripStreamListScroll}
            />
          ))}

        {activeTab === "network" &&
          (netLoading && netChats.length === 0 ? (
            <View style={{ paddingTop: 40, alignItems: "center" }}>
              <LoadingIndicator color={CHAT_ACCENT} />
            </View>
          ) : isDesktop ? (
            <ScrollView
              ref={desktopSidebarScrollRef}
              style={deskSt.listScroll}
              contentContainerStyle={deskSt.sidebarCategoriesContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {desktopPeopleStrip}
              {activeTab === "network" ? (
                <View style={s.chatStoryInlineWrap}>
                  <StoryReel
                    posts={networkStoryPosts}
                    orgId={currentOrgId || undefined}
                    orgName={currentOrganization?.name ?? undefined}
                    onCreatePost={() => router.push("/(modals)/create-post")}
                    networkPartnerOrgIds={chatNetworkPartnerOrgIds}
                    indentCountByPostId={networkStoryIndentCounts}
                    embedded
                  />
                  {storiesLoading && networkStoryPosts.length === 0 ? (
                    <View style={s.chatStoryLoadingRow}>
                      <LoadingIndicator size="small" color={CHAT_ACCENT} />
                      <Text style={s.chatStoryLoadingText}>Syncing stories…</Text>
                    </View>
                  ) : null}
                </View>
              ) : null}
              <View style={deskSt.sidebarCategoryWrap}>
                <TouchableOpacity
                  style={deskSt.sidebarCategoryHeader}
                  onPress={() => setDesktopDmCollapsed((v) => !v)}
                  activeOpacity={0.82}
                >
                  <Text style={deskSt.sidebarCategoryTitle}>Direct messages</Text>
                  <View style={deskSt.sidebarCategoryHeaderRight}>
                    <Text style={deskSt.sidebarCategoryCount}>
                      {slackFilteredNetChats.length}
                    </Text>
                    {desktopDmCollapsed ? (
                      <ChevronRight size={14} color="#9CA3AF" />
                    ) : (
                      <ChevronDown size={14} color="#9CA3AF" />
                    )}
                  </View>
                </TouchableOpacity>
                {!desktopDmCollapsed ? (
                  <>
                    {(desktopDmShowAll
                      ? slackFilteredNetChats
                      : slackFilteredNetChats.slice(0, 8)
                    ).map((chat) => (
                      <View key={chat.id}>{renderNetItem({ item: chat })}</View>
                    ))}
                    {slackFilteredNetChats.length > 8 ? (
                      <TouchableOpacity
                        style={deskSt.sidebarCategoryMoreBtn}
                        onPress={() => setDesktopDmShowAll((v) => !v)}
                        activeOpacity={0.82}
                      >
                        <Text style={deskSt.sidebarCategoryMoreText}>
                          {desktopDmShowAll ? "Collapse" : "View more"}
                        </Text>
                      </TouchableOpacity>
                    ) : null}
                    {slackFilteredNetChats.length === 0 ? (
                      <View style={{ alignItems: "center", gap: 6, paddingVertical: 10 }}>
                        <CompactChatAnimation size={84} source={NEW_DM_EMPTY_ANIMATION} />
                        <Text style={deskSt.sidebarCategoryEmptyText}>
                          No direct messages found
                        </Text>
                        <Text
                          style={{
                            fontSize: 11,
                            color: SLACK_DESKTOP.textTertiary,
                            textAlign: "center",
                            lineHeight: 15,
                            paddingHorizontal: 18,
                          }}
                        >
                          {CHAT_EMPTY_COPY.dmSubtitle}
                        </Text>
                      </View>
                    ) : null}
                  </>
                ) : null}
              </View>
            </ScrollView>
          ) : (
            <FlatList
              style={isMobileChatUi ? slackSt.listScroll : isDesktop ? deskSt.listScroll : undefined}
              data={isMobileChatUi ? netChatsForInbox : sortedNetChats}
              keyExtractor={(i) => i.id}
              renderItem={renderNetItem}
              {...(isMobileChatUi ? SLACK_CHAT_LIST_PROPS : isDesktop ? {
                initialNumToRender: 18,
                maxToRenderPerBatch: 10,
                windowSize: 7,
                keyboardShouldPersistTaps: "handled" as const,
                showsVerticalScrollIndicator: false,
              } : {})}
              ListEmptyComponent={
                <EmptyList
                  label="No network conversations"
                  variant={isMobileChatUi ? "dm" : "network"}
                  subtitle={CHAT_EMPTY_COPY.networkSubtitle}
                  iconSizeOverride={isMobileChatUi ? 72 : undefined}
                  actionLabel={netPartners.length > 0 ? "Message a partner" : undefined}
                  onAction={netPartners.length > 0 ? () => setShowNetCompose(true) : undefined}
                />
              }
              ItemSeparatorComponent={undefined}
              ListHeaderComponent={isMobileChatUi ? slackInboxToolbar : undefined}
              contentContainerStyle={
                isMobileChatUi
                  ? { paddingBottom: slackListBottomPad }
                  : { paddingBottom: 24 }
              }
            />
          ))}

        {isDesktop ? (
          <View style={deskSt.sidebarBottomTabsWrap}>
            <ChatSlackMirrorToggle
              variant="bottomNav"
              style={deskSt.sidebarBottomMirrorToggle}
              activeId={activeTab as SlackStreamTabId}
              onSelect={(id) => setActiveTab(id as TabId)}
              items={SLACK_STREAM_TABS.map((tab) => ({
                id: tab.id,
                label: tab.shortLabel,
                Icon: tab.Icon,
                badge:
                  tab.id === "network"
                    ? netUnread
                    : tab.id === "trips"
                      ? tripsChatUnread
                      : indentChatUnread,
              }))}
            />
          </View>
        ) : null}

      </View>
    );
  }

  // ── Network compose modal ─────────────────────────────────────────────────────

  function NetworkComposeModal() {
    return (
      <Modal
        visible={showNetCompose}
        transparent
        animationType="slide"
        onRequestClose={() => setShowNetCompose(false)}
      >
        <View style={cm.backdrop}>
          <View style={[cm.sheet, cm.netSheet]}>
            <View style={[cm.header, cm.netHeader]}>
              <View>
                <Text style={cm.netTitle}>Message a Partner</Text>
                <Text style={cm.netSubtitle}>Select a connected organization to start a conversation.</Text>
              </View>
              <TouchableOpacity onPress={() => setShowNetCompose(false)} hitSlop={8} style={cm.netCloseBtn}>
                <X size={18} color="#8EA0C2" />
              </TouchableOpacity>
            </View>

            <View style={cm.netSearchRow}>
              <Search size={15} color="#8EA0C2" style={{ marginRight: 8 }} />
              <TextInput
                style={cm.netSearchInput}
                value={netComposeSearch}
                onChangeText={setNetComposeSearch}
                placeholder="Search partners…"
                placeholderTextColor="#8EA0C2"
                autoFocus
              />
              {netComposeSearch.length > 0 && (
                <TouchableOpacity onPress={() => setNetComposeSearch("")} hitSlop={8}>
                  <X size={14} color="#8EA0C2" />
                </TouchableOpacity>
              )}
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Existing conversations */}
              {filteredNetPartners.filter((p) => existingPartnerOrgIds.has(p.org_id)).map((p) => (
                <TouchableOpacity
                  key={p.org_id}
                  style={cm.netPartnerRow}
                  onPress={() => {
                    const conv = netChats.find((c) => c.partnerId === p.org_id);
                    if (conv) {
                      setShowNetCompose(false);
                      setSelectedNetId(conv.id);
                      if (!isDesktop) setIsMobileDetail(true);
                    }
                  }}
                  activeOpacity={0.75}
                >
                  <View style={cm.netPartnerRowMain}>
                    <View style={cm.netPartnerIdentityWrap}>
                      <View style={cm.netPartnerAvatarWrap}>
                        <ChatPartyAvatar
                          identity={{ displayName: p.name, entityType: p.party_type }}
                          size={30}
                        />
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={cm.netPartnerName} numberOfLines={1}>{p.name}</Text>
                        <Text style={cm.netPartnerPartyType} numberOfLines={1}>
                          {formatChatPartyTypeLabel(p.party_type)}
                        </Text>
                      </View>
                    </View>
                    <Text style={cm.netPartnerAction} numberOfLines={1}>Open chat</Text>
                  </View>
                </TouchableOpacity>
              ))}

              {/* New partners (no conversation yet) */}
              {newPartners.length > 0 && (
                <>
                  {filteredNetPartners.filter((p) => existingPartnerOrgIds.has(p.org_id)).length > 0 && (
                    <Text style={cm.netSectionLabel}>
                      NEW CONVERSATION
                    </Text>
                  )}
                  {newPartners.map((p) => (
                    <TouchableOpacity
                      key={p.org_id}
                      style={cm.netPartnerRow}
                      onPress={() => handleNetworkInitiate(p)}
                      disabled={initiating}
                      activeOpacity={0.75}
                    >
                      <View style={cm.netPartnerRowMain}>
                        <View style={cm.netPartnerIdentityWrap}>
                          <View style={cm.netPartnerAvatarWrap}>
                            <ChatPartyAvatar
                              identity={{ displayName: p.name, entityType: p.party_type }}
                              size={30}
                            />
                          </View>
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={cm.netPartnerName} numberOfLines={1}>{p.name}</Text>
                            <Text style={cm.netPartnerPartyType} numberOfLines={1}>
                              {formatChatPartyTypeLabel(p.party_type)}
                            </Text>
                          </View>
                        </View>
                        {initiating ? (
                          <LoadingIndicator size="small" color={CHAT_ACCENT} />
                        ) : (
                          <Plus size={15} color={CHAT_ACCENT} />
                        )}
                      </View>
                    </TouchableOpacity>
                  ))}
                </>
              )}

              {filteredNetPartners.length === 0 && (
                <View style={cm.netEmptyWrap}>
                  <Users size={28} color="#e2e8f0" />
                  <Text style={cm.netEmptyTitle}>
                    {netComposeSearch ? "No matching partners" : "No connected partners found"}
                  </Text>
                  {!netComposeSearch && (
                    <Text style={cm.netEmptySubtitle}>
                      Connect with suppliers or clients on the platform to message them here.
                    </Text>
                  )}
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    );
  }

  function TripFilterModal() {
    if (isDesktop) return null;
    return (
      <Modal
        visible={showTripFilterModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowTripFilterModal(false)}
      >
        <View style={cm.backdrop}>
          <View style={cm.sheet}>
            <View style={cm.header}>
              <View>
                <Text style={cm.title}>Trip Filters</Text>
                <Text style={cm.subtitle}>Filter trip chats by conversation party.</Text>
              </View>
              <TouchableOpacity onPress={() => setShowTripFilterModal(false)} hitSlop={8} style={cm.closeBtn}>
                <X size={20} color="#94a3b8" />
              </TouchableOpacity>
            </View>

            <View style={s.filterChipWrap}>
              {TRIP_PARTY_FILTERS.map((partyType, index) => {
                const selected = tripPartyFilters.includes(partyType);
                const isLast = index === TRIP_PARTY_FILTERS.length - 1;
                return (
                  <TouchableOpacity
                    key={partyType}
                    style={[s.filterChip, isLast && s.filterChipLast, selected && s.filterChipActive]}
                    onPress={() => toggleTripPartyFilter(partyType)}
                    activeOpacity={0.75}
                  >
                    <Text style={[s.filterChipText, selected && s.filterChipTextActive]}>
                      {partyFilterSheetLabel(partyType)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity
              style={s.filterResetBtn}
              onPress={() => setTripPartyFilters([...TRIP_PARTY_FILTERS])}
              activeOpacity={0.8}
            >
              <Text style={s.filterResetText}>Reset to all parties</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  }

  function StoriesModal() {
    return (
      <Modal
        visible={showStoriesSheet}
        transparent
        animationType="slide"
        onRequestClose={() => setShowStoriesSheet(false)}
      >
        <View style={cm.backdrop}>
          <View style={cm.sheet}>
            <View style={cm.header}>
              <View>
                <Text style={cm.title}>Stories</Text>
                <Text style={cm.subtitle}>Network and Pulse Boost stories</Text>
              </View>
              <TouchableOpacity onPress={() => setShowStoriesSheet(false)} hitSlop={8} style={cm.closeBtn}>
                <X size={20} color="#94a3b8" />
              </TouchableOpacity>
            </View>
            {storiesLoading && networkStoryPosts.length === 0 ? (
              <View style={s.chatStoriesModalLoading}>
                <LoadingIndicator color={CHAT_ACCENT} />
                <Text style={s.chatStoriesModalLoadingText}>Syncing stories…</Text>
              </View>
            ) : networkStoryPosts.length === 0 ? (
              <View style={s.chatStoriesModalLoading}>
                <Text style={s.chatStoriesModalLoadingText}>
                  No active stories from your network yet.
                </Text>
              </View>
            ) : (
              <StoryReel
                posts={networkStoryPosts}
                orgId={currentOrgId || undefined}
                orgName={currentOrganization?.name ?? undefined}
                onCreatePost={() => router.push("/(modals)/create-post")}
                networkPartnerOrgIds={chatNetworkPartnerOrgIds}
                indentCountByPostId={networkStoryIndentCounts}
                fetchLiveOwnLoads={false}
              />
            )}
          </View>
        </View>
      </Modal>
    );
  }

  function TripStartNoticeModal() {
    if (!tripStartNoticeMode) return null;
    const isIntegrated = tripStartNoticeMode === "integrated";
    const title = isIntegrated
      ? "No integrated trip to begin chat"
      : "Driver is not on Pulse Pilot yet";
    const message = isIntegrated
      ? "Add an integrated trip to begin chat. Driver and Partner tabs will appear with payment and tracking system updates."
      : "No driver is using the Pulse Pilot app for this trip. Invite your driver to Pulse app to begin the chat.";
    const iconSource = isIntegrated
      ? NEW_TRIP_INTEGRATED_EMPTY_ANIMATION
      : NEW_TRIP_DRIVER_EMPTY_ANIMATION;
    return (
      <Modal
        visible
        transparent
        animationType="fade"
        onRequestClose={() => setTripStartNoticeMode(null)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(2, 6, 23, 0.42)",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
        >
          <View
            style={{
              width: "100%",
              maxWidth: 420,
              borderRadius: 18,
              borderWidth: 1,
              borderColor: "rgba(148,163,184,0.35)",
              backgroundColor: "#fff",
              paddingHorizontal: 16,
              paddingVertical: 16,
              alignItems: "center",
              gap: 10,
            }}
          >
            <CompactChatAnimation size={isIntegrated ? 72 : 96} source={iconSource} />
            <Text
              style={{
                fontSize: 16,
                fontWeight: "800",
                color: "#0f172a",
                textAlign: "center",
              }}
            >
              {title}
            </Text>
            <Text
              style={{
                fontSize: 12,
                lineHeight: 18,
                color: "#64748b",
                textAlign: "center",
                paddingHorizontal: 4,
              }}
            >
              {message}
            </Text>
            <TouchableOpacity
              style={{
                marginTop: 4,
                paddingHorizontal: 18,
                paddingVertical: 10,
                borderRadius: 999,
                backgroundColor: CHAT_ACCENT,
              }}
              onPress={() => setTripStartNoticeMode(null)}
              activeOpacity={0.82}
            >
              <Text style={{ color: "#fff", fontSize: 13, fontWeight: "800" }}>
                Got it
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  }

  // ── New conversation (compose) ───────────────────────────────────────────────

  function ComposePanelBody({
    tripListScrollStyle,
  }: {
    tripListScrollStyle?: { maxHeight?: number; flex?: number };
  }) {
    const scrollStyle = tripListScrollStyle ?? { flex: 1 };
    return (
      <>
        <View style={cm.header}>
          <View>
            <Text style={cm.title}>New Conversation</Text>
            <Text style={cm.subtitle}>Select a trip and a party to chat with.</Text>
          </View>
          <TouchableOpacity onPress={() => setShowCompose(false)} hitSlop={8} style={cm.closeBtn}>
            <X size={20} color="#94a3b8" />
          </TouchableOpacity>
        </View>

        <View style={cm.searchRow}>
          <Search size={15} color="#94a3b8" style={{ marginRight: 8 }} />
          <TextInput
            style={cm.searchInput}
            value={composeSearch}
            onChangeText={setComposeSearch}
            placeholder="Search trips, clients, routes…"
            placeholderTextColor="#94a3b8"
            autoFocus={!isWebAnchoredPanels}
          />
          {composeSearch.length > 0 && (
            <TouchableOpacity onPress={() => setComposeSearch("")} hitSlop={8}>
              <X size={14} color="#94a3b8" />
            </TouchableOpacity>
          )}
        </View>

        {composeLoading ? (
          <View style={{ paddingTop: 48, alignItems: "center" }}>
            <LoadingIndicator color={CHAT_ACCENT} />
          </View>
        ) : composeTripListIssue === "no_org" ? (
          <View style={{ paddingTop: 48, alignItems: "center", gap: 8, paddingHorizontal: 24 }}>
            <MessageSquare size={28} color="#e2e8f0" />
            <Text style={{ fontSize: 13, color: "#94a3b8", textAlign: "center" }}>
              No organization selected. Open the workspace switcher and pick your company, then try again.
            </Text>
          </View>
        ) : composeTripListIssue === "fetch_failed" ? (
          <View style={{ paddingTop: 48, alignItems: "center", gap: 8, paddingHorizontal: 24 }}>
            <MessageSquare size={28} color="#e2e8f0" />
            <Text style={{ fontSize: 13, color: "#94a3b8", textAlign: "center" }}>
              Could not load trips. Check your connection and open this screen again.
            </Text>
          </View>
        ) : filteredComposeTrips.length === 0 ? (
          <View style={{ paddingTop: 48, alignItems: "center", gap: 8 }}>
            <MessageSquare size={28} color="#e2e8f0" />
            <Text style={{ fontSize: 13, color: "#94a3b8" }}>
              {composeSearch.trim() ? "No matching trips" : "No active trips found"}
            </Text>
          </View>
        ) : composeTripsWithChatParties.length === 0 ? (
          <View style={{ paddingTop: 48, alignItems: "center", gap: 8, paddingHorizontal: 24 }}>
            <MessageSquare size={28} color="#e2e8f0" />
            <Text style={{ fontSize: 13, color: "#94a3b8", textAlign: "center", lineHeight: 20 }}>
              Trips matched your filters, but none have a chat-ready linked party. Clients/suppliers
              must be connected to an app organization, and drivers must be assigned on the trip.
            </Text>
          </View>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} style={scrollStyle}>
            {composeTripsWithChatParties.map((trip) => {
              const isExpanded = expandedTripId === trip.id;
              const tripLabel = getTripOperationalDisplay({
                trip_operational_code: trip.trip_operational_code ?? null,
                trip_code: trip.trip_code ?? null,
                display_trip_id: trip["display_trip_id"] ?? null,
                trip_number: trip["trip_number"] ?? null,
              });

              const partyRows = getComposePartyRows(trip).filter((row) => {
                if (activeTab !== "trips") return true;
                return row.kind === "selectable" ? row.partyType === "driver" : false;
              });
              const selectablePartyCount = partyRows.filter((row) => row.kind === "selectable").length;

              return (
                <View key={trip.id} style={cm.tripCard}>
                  <TouchableOpacity
                    style={cm.tripRow}
                    onPress={() => setExpandedTripId(isExpanded ? null : trip.id)}
                    activeOpacity={0.7}
                  >
                    <View style={cm.tripInfo}>
                      <View style={cm.tripMetaRow}>
                        <Text style={cm.tripNumber}>{tripLabel}</Text>
                        <View style={cm.tripMetaPill}>
                          <Text style={cm.tripMetaPillText}>
                            {selectablePartyCount} party{selectablePartyCount > 1 ? "s" : ""}
                          </Text>
                        </View>
                      </View>
                      <Text style={cm.tripRoute} numberOfLines={1}>
                        {trip.pickup_area} → {trip.drop_location}
                      </Text>
                    </View>
                    {isExpanded ? (
                      <ChevronDown size={16} color="#94a3b8" />
                    ) : (
                      <ChevronRight size={16} color="#94a3b8" />
                    )}
                  </TouchableOpacity>

                  {isExpanded && (
                    <View style={cm.partyList}>
                      {partyRows.map((row) => {
                        if (row.kind === "unassigned_driver") {
                          return (
                            <View
                              key="driver-unassigned"
                              style={[cm.partyRow, cm.partyRowDisabled]}
                            >
                              <View
                                style={[cm.partyRowDisabledOverlay, pe("none")]}
                              />
                              <View style={[cm.partyIconWrap, cm.partyIconWrapMuted]}>
                                <PartyIcon partyType="driver" size={14} />
                              </View>
                              <View style={{ flex: 1, minWidth: 0 }}>
                                <Text style={[cm.partyType, cm.partyTypeMuted]}>DRIVER</Text>
                              </View>
                              <Text style={cm.partyDisabledHint}>—</Text>
                            </View>
                          );
                        }
                        const composePartyLine = formatChatPartyName(row.name);
                        return (
                          <TouchableOpacity
                            key={`${row.partyType}-${row.id}`}
                            style={cm.partyRow}
                            onPress={() =>
                              handleInitiate(trip, row.partyType, row.name, row.id)
                            }
                            disabled={initiating}
                            activeOpacity={0.7}
                          >
                            <View style={cm.partyIconWrap}>
                              <PartyIcon partyType={row.partyType} size={14} />
                            </View>
                            <View style={{ flex: 1, minWidth: 0 }}>
                              <Text style={cm.partyType}>{partyLabel(row.partyType)}</Text>
                              {composePartyLine ? (
                                <Text style={cm.partyName} numberOfLines={1}>
                                  {composePartyLine}
                                </Text>
                              ) : null}
                            </View>
                            {initiating ? (
                              <LoadingIndicator size="small" color={CHAT_ACCENT} />
                            ) : (
                              <Plus size={14} color={CHAT_ACCENT} />
                            )}
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}
                </View>
              );
            })}
          </ScrollView>
        )}
      </>
    );
  }

  function ComposeModal() {
    if (isWebAnchoredPanels) return null;
    return (
      <Modal
        visible={showCompose}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCompose(false)}
      >
        <View style={cm.backdrop}>
          <View style={cm.sheet}>
            <ComposePanelBody />
          </View>
        </View>
      </Modal>
    );
  }

  const detailPanel =
    isTripStreamTab(activeTab) ? (
      <TripConversationDetailPanel
        selectedConv={selectedConv}
        conversations={conversations}
        composeTrips={mergedComposeTrips}
        linkedOrgBranding={tripLinkedOrgBranding as Record<string, ChatOrgBranding>}
        messagesRef={messagesRef}
        messageInput={messageInput}
        setMessageInput={setMessageInput}
        showEmoji={showEmoji}
        setShowEmoji={setShowEmoji}
        showScripts={showScripts}
        setShowScripts={setShowScripts}
        onSend={handleSend}
        onOpenDocShare={() => setShowDocShare(true)}
        showDocShare={showDocShare}
        onCloseDocShare={() => setShowDocShare(false)}
        onDocShare={handleDocShare}
        docHubTripId={selectedConv?.trip_id ?? null}
        docHubVehicleId={tripHubAssets?.vehicle_id ?? null}
        docHubDriverId={
          tripHubAssets?.driver_id ??
          selectedConv?.driver_id ??
          null
        }
        docHubOrgId={
          tripHubAssets?.organization_id ??
          selectedConv?.organization_id ??
          organizationId ??
          null
        }
        docHubUserId={
          (profile as { uid?: string | null } | null)?.uid ?? null
        }
        isDesktop={isDesktop}
        inputOverlayMaxWidth={inputOverlayMaxWidth}
        onCloseDetail={closeDetail}
        currentOrgId={currentOrgId}
        onAddToBook={handleAddToBook}
        onDispute={handleDispute}
        onSelectConversation={setSelectedConvId}
        onOpenCompose={openCompose}
        replyContext={replyContext}
        onCancelReply={clearReply}
        onSetReply={setReplyContext}
      />
    ) : (
      <NetworkDetailPanel
        selectedNet={selectedNet}
        resolveNetPartyType={resolveNetChatPartyType}
        messagesRef={messagesRef}
        messageInput={messageInput}
        setMessageInput={setMessageInput}
        showEmoji={showEmoji}
        setShowEmoji={setShowEmoji}
        showScripts={showScripts}
        setShowScripts={setShowScripts}
        onSend={handleSend}
        isDesktop={isDesktop}
        inputOverlayMaxWidth={inputOverlayMaxWidth}
        onCloseDetail={closeDetail}
      />
    );

  const detailEnterStyle = {
    opacity: detailEnterProgress.interpolate({
      inputRange: [0, 1],
      outputRange: [0.42, 1],
    }),
    transform: [
      {
        translateX: detailEnterProgress.interpolate({
          inputRange: [0, 1],
          outputRange: [20, 0],
        }),
      },
      {
        scale: detailEnterProgress.interpolate({
          inputRange: [0, 1],
          outputRange: [0.985, 1],
        }),
      },
    ],
  } as const;

  // ── Layout ────────────────────────────────────────────────────────────────────

  if (isDesktop) {
    return (
      <View style={[deskSt.root, s.root, { paddingTop: insets.top }]}>
        <View style={deskSt.shell}>
          <View style={deskSt.sidebar}>
            {ChatList()}
          </View>
          <View style={deskSt.main}>{detailPanel}</View>
        </View>
        <ComposeModal />
        <NetworkComposeModal />
        <TripFilterModal />
        <StoriesModal />
        <TripStartNoticeModal />
        {Platform.OS === "web" && isDesktop && ledgerWebToast ? (
          <View style={[s.ledgerWebToast, pe("none")]}>
            <Text style={s.ledgerWebToastText}>Added to Ledger</Text>
          </View>
        ) : null}
        {tripFeedbackOverlay}
        {platformTripRoomSheet}
      </View>
    );
  }

  const mobileShell = isMobileChatUi ? (
    <View
      style={[
        s.root,
        s.mobileSlackRoot,
        Platform.OS === "web" ? (WEB_APP_VIEWPORT_STYLE as object) : null,
        {
          paddingTop: !isMobileDetail ? 0 : insets.top,
          paddingBottom: isMobileDetail ? 0 : 0,
        },
      ]}
    >
      <View style={s.mobileRootFill}>
        {!isMobileDetail ? (
          ChatList()
        ) : (
          <Animated.View
            style={[s.detailTransitionShell, detailEnterStyle]}
            collapsable={false}
          >
            {detailPanel}
          </Animated.View>
        )}
      </View>
      {!isMobileDetail && !mobileKeyboardOpen ? (
        <ChatSlackBottomNav
          activeTab={activeTab as SlackStreamTabId}
          unreadByTab={{
            network: netUnread,
            trips: tripsChatUnread,
            indent: indentChatUnread,
          }}
          onSelect={handleSlackTabSelect}
          bottomInset={insets.bottom}
          onOpenStories={handleSlackBottomStories}
        />
      ) : null}
      <ComposeModal />
      <NetworkComposeModal />
      <TripFilterModal />
      <StoriesModal />
      <TripStartNoticeModal />
      {tripFeedbackOverlay}
      {platformTripRoomSheet}
    </View>
  ) : null;

  if (mobileShell) return mobileShell;

  return (
    <LinearGradient
      colors={["#FFFFFF", "#F9F9F9", "#F5F8FA"]}
        locations={[0, 0.5, 1]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[
        s.root,
        {
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
        },
      ]}
    >
      <View style={s.mobileRootFill}>
        {!isMobileDetail ? (
          ChatList()
        ) : (
          <Animated.View
            style={[s.detailTransitionShell, detailEnterStyle]}
            collapsable={false}
          >
            {detailPanel}
          </Animated.View>
        )}
      </View>
      <ComposeModal />
      <NetworkComposeModal />
      <TripFilterModal />
      <StoriesModal />
      <TripStartNoticeModal />
      {tripFeedbackOverlay}
      {platformTripRoomSheet}
    </LinearGradient>
  );
}

// ── Shared empty states ───────────────────────────────────────────────────────

const NEW_DETAIL_EMPTY_ANIMATION = require("@/assets/Animated folder/People doing Group Chat.json");
const NEW_TRIP_DRIVER_EMPTY_ANIMATION = require("@/assets/Animated folder/drunk-driver.json");
const NEW_TRIP_INTEGRATED_EMPTY_ANIMATION = require("@/assets/Animated folder/truck-2.json");
const NEW_DM_EMPTY_ANIMATION = require("@/assets/Animated folder/Chat.json");
const NEW_NETWORK_EMPTY_ANIMATION = require("@/assets/Animated folder/conversation-verified.json");
const START_CHAT_CTA_ANIMATION = require("@/assets/Animated folder/next-button.json");
const CHAT_EMPTY_COPY = {
  startTitle: "Start a new conversation",
  startSubtitle: "Add more integrated network partners and trips to begin chat updates.",
  tripDriverSubtitle:
    "Chat with your assigned driver using the app and get system updates on trip activity, including live location updates.",
  tripIntegratedSubtitle:
    "Integrated chat lets you chat with driver and partner in separate tabs, with system updates for payment activity and tracking.",
  tripIntegratedFeatures: [
    "Separate tabs for Driver and Partner chat",
    "System updates for payment activity",
    "Live tracking and trip activity updates",
  ],
  dmSubtitle: "Add integrated partners to start direct messages.",
  networkSubtitle: "Connect with integrated partners to start network chats.",
} as const;

function CompactChatAnimation({
  size = 44,
  source = NEW_DETAIL_EMPTY_ANIMATION,
}: {
  size?: number;
  source?: LottieSource;
}) {
  return (
    <View
      style={{
        width: size,
        height: size,
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      <LottieView
        source={source}
        autoPlay
        loop
        speed={0.8}
        resizeMode="contain"
        style={{ width: size, height: size }}
      />
    </View>
  );
}

function EmptyList({
  label,
  // Default "detail" resolves to the same illustration/size as the prior "trip" fallthrough; all call sites pass variant explicitly.
  variant = "detail",
  subtitle,
  iconSizeOverride,
  actionLabel,
  onAction,
}: {
  label: string;
  variant?:
    | "trip_driver"
    | "trip_integrated"
    | "dm"
    | "network"
    | "detail";
  subtitle?: string;
  iconSizeOverride?: number;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const illustration =
    variant === "dm"
      ? NEW_DM_EMPTY_ANIMATION
      : variant === "network"
        ? NEW_NETWORK_EMPTY_ANIMATION
        : variant === "trip_integrated"
          ? NEW_TRIP_INTEGRATED_EMPTY_ANIMATION
          : variant === "trip_driver"
            ? NEW_TRIP_DRIVER_EMPTY_ANIMATION
          : NEW_DETAIL_EMPTY_ANIMATION;
  const iconSize =
    variant === "trip_driver"
      ? 84
      : variant === "trip_integrated"
        ? 72
        : 42;
  const resolvedIconSize = iconSizeOverride ?? iconSize;
  return (
    <View
      style={{
        alignItems: "center",
        paddingTop: 40,
        gap: 10,
        width: "100%",
        maxWidth: 280,
        alignSelf: "center",
      }}
    >
      <CompactChatAnimation size={resolvedIconSize} source={illustration} />
      <Text
        style={{
          fontSize: 12,
          color: "#94a3b8",
          textAlign: "center",
          paddingHorizontal: 16,
        }}
      >
        {label}
      </Text>
      {subtitle && variant !== "trip_integrated" ? (
        <Text
          style={{
            fontSize: 11,
            color: "#94a3b8",
            textAlign: "center",
            lineHeight: 16,
            paddingHorizontal: 18,
            marginTop: -2,
          }}
        >
          {subtitle}
        </Text>
      ) : null}
      {variant === "trip_integrated" ? (
        <View style={{ width: "100%", gap: 4, marginTop: -2 }}>
          {CHAT_EMPTY_COPY.tripIntegratedFeatures.map((feature) => (
            <Text
              key={feature}
              style={{
                fontSize: 11,
                color: "#94a3b8",
                textAlign: "center",
                lineHeight: 16,
                paddingHorizontal: 18,
              }}
            >
              • {feature}
            </Text>
          ))}
        </View>
      ) : null}
      {actionLabel && onAction && (
        <TouchableOpacity
          onPress={onAction}
          style={{
            paddingHorizontal: 18,
            paddingVertical: 9,
            borderRadius: 20,
            backgroundColor: CHAT_ACCENT,
          }}
          activeOpacity={0.8}
        >
          <Text style={{ fontSize: 12, fontWeight: "700", color: "#fff" }}>{actionLabel}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function EmptyDetail({ isDesktop = false }: { isDesktop?: boolean }) {
  if (isDesktop) {
    return (
      <View style={deskSt.emptyWrap}>
        <CompactChatAnimation size={44} source={NEW_DETAIL_EMPTY_ANIMATION} />
        <Text style={[deskSt.emptyTitle, { fontSize: 13 }]}>{CHAT_EMPTY_COPY.startTitle}</Text>
        <Text style={[deskSt.emptySub, { fontSize: 11, lineHeight: 16 }]}>
          {CHAT_EMPTY_COPY.startSubtitle}
        </Text>
      </View>
    );
  }
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 14 }}>
      <CompactChatAnimation size={46} source={NEW_DETAIL_EMPTY_ANIMATION} />
      <Text style={{ fontSize: 15, fontWeight: "700", color: "#1e293b", letterSpacing: -0.2 }}>
        {CHAT_EMPTY_COPY.startTitle}
      </Text>
      <Text
        style={{
          fontSize: 11,
          color: "#94a3b8",
          textAlign: "center",
          paddingHorizontal: 40,
          lineHeight: 16,
        }}
      >
        {CHAT_EMPTY_COPY.startSubtitle}
      </Text>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1 },
  mobileSlackRoot: {
    backgroundColor: "#FFFFFF",
    flexDirection: "column",
  },
  /** Web flex + RN web: keep list/detail from growing past viewport. */
  mobileRootFill: { flex: 1, minHeight: 0, width: "100%" },
  desktop: { flex: 1, flexDirection: "row" },
  desktopList: {
    width: 420,
    borderRightWidth: 1,
    borderRightColor: CHAT_ACCENT_BORDER,
    backgroundColor: "rgba(255,255,255,0.82)",
  },
  desktopDetail: { flex: 1, backgroundColor: "transparent" },

  listPanel: { flex: 1, backgroundColor: "transparent" },
  listHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 10,
    backgroundColor: "#181C32",
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  brandTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#fff",
    letterSpacing: -0.2,
    fontStyle: "normal",
  },
  brandDot: {
    color: CHAT_ACCENT,
    fontWeight: "900",
  },
  filterBtn: { position: "relative" },
  filterActiveDot: {
    position: "absolute",
    top: -1,
    right: -3,
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: CHAT_ACCENT,
    borderWidth: 1,
    borderColor: "#0f172a",
  },

  tabRow: {
    flexDirection: "row",
    flexWrap: "nowrap",
    alignItems: "stretch",
    gap: 6,
    marginHorizontal: 12,
    marginTop: 8,
    marginBottom: 6,
    paddingVertical: 3,
    paddingHorizontal: 3,
    borderRadius: 10,
    backgroundColor: "#F5F8FA",
    borderWidth: 1,
    borderColor: "#EFF2F5",
  },
  tripHubScrollContent: {
    paddingHorizontal: 14,
    paddingBottom: 22,
    gap: 8,
  },
  tripHubCard: {
    borderRadius: 14,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#EFF2F5",
    padding: 10,
    shadowColor: "#181C32",
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  tripHubCardOn: {
    backgroundColor: "#181C32",
    borderColor: "#181C32",
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  tripHubAlertBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: "#fff1f2",
    borderWidth: 1,
    borderColor: "#fecdd3",
    borderLeftWidth: 3,
    borderLeftColor: "#f43f5e",
  },
  tripHubAlertBarOn: {
    backgroundColor: "rgba(244,63,94,0.12)",
    borderColor: "rgba(244,63,94,0.35)",
    borderLeftColor: "#fb7185",
  },
  tripHubAlertBarText: {
    flex: 1,
    fontSize: 10,
    fontWeight: "900",
    color: "#be123c",
    textTransform: "uppercase",
    letterSpacing: 0.55,
  },
  tripHubAlertBarTextOn: {
    color: "#fecdd3",
  },
  tripHubHeroTouchable: {
    marginBottom: 10,
  },
  tripHubHeroRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  tripHubHeroMain: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  tripHubHeroTextCol: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
    gap: 2,
  },
  tripHubHeroTrail: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 0,
  },
  tripHubTruckPill: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: "#0f172a",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#0f172a",
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  tripHubTruckPillOn: {
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  tripHubStatusPill: {
    flexShrink: 0,
    maxWidth: 108,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 999,
    fontSize: 7,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    overflow: "hidden",
  },
  tripHubStatusPillAssigned: {
    backgroundColor: "#059669",
    color: "#ffffff",
  },
  tripHubStatusPillAssignedOn: {
    backgroundColor: "#059669",
    color: "#ffffff",
  },
  tripHubStatusPillUnassigned: {
    backgroundColor: "#64748b",
    color: "#ffffff",
  },
  tripHubStatusPillUnassignedOn: {
    backgroundColor: "#64748b",
    color: "#ffffff",
  },
  tripHubTripTitle: {
    fontSize: 11,
    fontWeight: "800",
    color: CHAT_TEXT_PRIMARY,
    textTransform: "uppercase",
    fontStyle: "normal",
    letterSpacing: 0.2,
    lineHeight: 14,
  },
  tripHubTripTitleOn: {
    color: "#ffffff",
  },
  tripHubRouteLarge: {
    fontSize: 8,
    fontWeight: "800",
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    lineHeight: 11,
  },
  tripHubRouteLargeOn: {
    color: "rgba(248,250,252,0.52)",
  },
  tripHubRouteRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minWidth: 0,
    width: "100%",
  },
  tripHubRouteTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  tripHubRouteDate: {
    fontSize: 8,
    fontWeight: "700",
    color: "#94a3b8",
    letterSpacing: 0.25,
    flexShrink: 0,
  },
  tripHubRouteDateOn: {
    color: "rgba(248,250,252,0.45)",
  },
  tripHubTotalUnread: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: CHAT_ACCENT,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
  },
  tripHubTotalUnreadText: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 9,
  },
  tripHubPartyIconBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    shadowColor: "#0f172a",
    shadowOpacity: 0.07,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  tripHubPartyIconBtnOnDarkCard: {
    backgroundColor: "#0f172a",
    borderColor: "rgba(255,255,255,0.2)",
    shadowOpacity: 0.12,
    shadowRadius: 6,
  },
  tripHubPartyIconBtnOn: {
    backgroundColor: "#e2e8f0",
    borderColor: "#cbd5e1",
    shadowColor: "#0f172a",
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  tripHubPartyIconBtnOff: {
    opacity: 0.34,
  },
  tripHubPartyUnreadDot: {
    position: "absolute",
    top: -2,
    right: -2,
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: "#f43f5e",
    borderWidth: 1.5,
    borderColor: "#fff",
    shadowColor: "#f43f5e",
    shadowOpacity: 0.45,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 1 },
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 4,
    paddingTop: 12,
    paddingBottom: 4,
  },
  sectionHeaderDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: CHAT_ACCENT,
  },
  sectionHeaderText: {
    fontSize: 9,
    fontWeight: "800",
    color: CHAT_ACCENT,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  sectionHeaderTextMuted: {
    color: "#94a3b8",
  },
  loadMoreLinkWrap: {
    marginTop: 8,
    marginBottom: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  loadMoreLinkTouchable: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  loadMoreLinkInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  loadMoreLinkText: {
    fontSize: 12,
    fontWeight: "500",
    color: "#94a3b8",
    textDecorationLine: "underline",
  },
  commandMetricCard: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: CHAT_ACCENT_BORDER,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#ffffff",
  },
  commandMetricCardPrimary: {
    backgroundColor: "#0f172a",
    borderColor: "#0f172a",
  },
  commandMetricLabel: {
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: "#94a3b8",
  },
  commandMetricValue: {
    marginTop: 5,
    fontSize: 20,
    fontWeight: "900",
    color: "#0f172a",
    letterSpacing: -0.4,
    fontStyle: "italic",
  },
  headerSearchBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  headerSearchBtnActive: {
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  tripSearchScopeBlock: {
    marginHorizontal: 18,
    marginBottom: 12,
    gap: 8,
  },
  tripSearchScopeSearchMobile: {
    width: "100%",
  },
  tripSearchScopeStripMobile: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 8,
    width: "100%",
  },
  tripChatScopePillStripMobile: {
    flex: 1,
    minWidth: 0,
  },
  /** Single row: search (flex) + Active / History — inset matches tabRow padding so edges line up. */
  tripSearchScopeStrip: {
    flexDirection: "row",
    flexWrap: "nowrap",
    alignItems: "stretch",
    gap: 6,
    marginHorizontal: 18,
    marginBottom: 12,
  },
  tripSearchScopeSearchWrap: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f8fafc",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e8ecf1",
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  sidebarSearchInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 11,
    color: "#334155",
    fontWeight: "500",
    paddingVertical: 0,
  },
  tripSearchScopeSegment: {
    flexDirection: "row",
    flexWrap: "nowrap",
    alignItems: "stretch",
    gap: 5,
    flexShrink: 0,
  },
  tripChatScopePillStrip: {
    minWidth: 58,
    maxWidth: 84,
    paddingVertical: 7,
    paddingHorizontal: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#e8ecf1",
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
  },
  tripChatScopePillOn: {
    backgroundColor: "#0f172a",
    borderColor: "#0f172a",
  },
  tripChatScopePillTextStrip: {
    fontSize: 8,
    fontWeight: "600",
    color: "#64748b",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  tripChatScopePillTextOn: {
    color: "#ffffff",
  },
  tabPill: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#e8ecf1",
    backgroundColor: "#ffffff",
    minHeight: 34,
  },
  tabPillLabelWrap: {
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  tabPillActive: {
    borderColor: "#0f172a",
    backgroundColor: "#0f172a",
    shadowColor: "#0f172a",
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  tabPillLabel: {
    fontSize: 8,
    fontWeight: "600",
    color: "#64748b",
    letterSpacing: 0.55,
    textTransform: "uppercase",
    textAlign: "center",
  },
  tabPillLabelActive: { color: "#ffffff" },
  tabUnreadBadge: {
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 3,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: CHAT_ACCENT,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
  },
  tabUnreadBadgeActive: {
    backgroundColor: "#ffffff",
    borderColor: "rgba(255,255,255,0.5)",
  },
  tabUnreadText: { fontSize: 8, fontWeight: "700", color: "#fff" },
  tabUnreadTextActive: { color: "#0f172a" },

  chatItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    padding: 11,
    borderRadius: 20,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e9edf5",
    shadowColor: "#0f172a",
    shadowOpacity: 0.045,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  registryWrap: {
    flex: 1,
    paddingHorizontal: 12,
    paddingTop: 14,
    paddingBottom: 12,
  },
  registryHeadBlock: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: CHAT_ACCENT_BORDER,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: "#ffffff",
  },
  registryTitle: {
    fontSize: 14,
    fontWeight: "900",
    color: "#0f172a",
    textTransform: "uppercase",
    fontStyle: "italic",
    letterSpacing: -0.2,
  },
  registrySub: {
    marginTop: 4,
    fontSize: 10,
    fontWeight: "700",
    color: "#64748b",
    lineHeight: 14,
  },
  registrySwitchRow: {
    flexDirection: "row",
    marginTop: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: CHAT_ACCENT_BORDER,
    padding: 4,
    gap: 4,
    backgroundColor: "#f8fafc",
  },
  registrySwitchBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  registrySwitchBtnOn: {
    backgroundColor: "#0f172a",
  },
  registrySwitchBtnOff: {
    opacity: 0.6,
  },
  registrySwitchText: {
    fontSize: 9,
    fontWeight: "900",
    color: "#475569",
    textTransform: "uppercase",
    letterSpacing: 0.7,
  },
  registrySwitchTextOn: {
    color: "#fff",
  },
  registrySwitchTextOff: {
    color: "#94a3b8",
  },
  registryList: {
    flex: 1,
    marginTop: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: CHAT_ACCENT_BORDER,
    backgroundColor: "#ffffff",
    padding: 10,
  },
  registryListTitle: {
    fontSize: 10,
    fontWeight: "900",
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  registryTripBlock: {
    marginBottom: 8,
  },
  registryTripBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#f8fafc",
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  registryTripBtnOn: {
    backgroundColor: "#0f172a",
    borderColor: "#0f172a",
  },
  registryTripId: {
    fontSize: 12,
    fontWeight: "900",
    color: "#0f172a",
    textTransform: "uppercase",
    fontStyle: "italic",
  },
  registryTripIdOn: {
    color: "#fff",
  },
  registryTripRoute: {
    marginTop: 2,
    fontSize: 10,
    fontWeight: "700",
    color: "#64748b",
  },
  registryTripRouteOn: {
    color: "rgba(255,255,255,0.68)",
  },
  registryPartyList: {
    marginTop: 6,
    paddingLeft: 8,
    gap: 6,
  },
  registryPartyRow: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#fff",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  registryPartyRowOn: {
    borderColor: CHAT_ACCENT,
    backgroundColor: "#eef2ff",
  },
  registryPartyType: {
    fontSize: 8,
    fontWeight: "900",
    color: CHAT_ACCENT,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  registryPartyTypeOn: {
    color: CHAT_ACCENT,
  },
  registryPartyName: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: "700",
    color: "#0f172a",
  },
  registryPartyNameOn: {
    color: "#1e293b",
  },
  registryUnreadPill: {
    marginTop: 4,
    alignSelf: "flex-start",
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 5,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: CHAT_ACCENT,
  },
  registryUnreadPillText: {
    fontSize: 9,
    fontWeight: "900",
    color: "#fff",
  },
  registryPartyActiveDot: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#22c55e",
  },
  chatItemActive: { backgroundColor: "#0f172a", borderColor: "#0f172a" },
  chatIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: "#0f172a",
    alignItems: "center",
    justifyContent: "center",
  },
  chatIconActive: { backgroundColor: "rgba(255,255,255,0.14)" },
  chatAvatarWrap: {
    position: "relative",
    flexShrink: 0,
  },
  chatAvatarUnreadDot: {
    position: "absolute",
    top: -2,
    right: -2,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: CHAT_ACCENT,
    borderWidth: 2,
    borderColor: "#fff",
  },
  chatBody: { flex: 1, minWidth: 0 },
  chatRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 2,
  },
  chatTitleRow: { flexDirection: "row", alignItems: "center", gap: 6, flex: 1, minWidth: 0 },
  chatTitle: { fontSize: 12, fontWeight: "900", color: "#0f172a", flex: 1, textTransform: "uppercase", fontStyle: "italic" },
  chatTitleActive: { color: "#fff" },
  activeTripDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: CHAT_ACCENT,
    flexShrink: 0,
  },
  activeTripDotActive: { backgroundColor: "#fff" },
  chatTime: { fontSize: 9, color: "#94a3b8", marginLeft: 8, flexShrink: 0, textTransform: "uppercase", fontWeight: "700" },
  chatTimeActive: { color: "rgba(255,255,255,0.55)" },
  chatPartyLabel: {
    fontSize: 11,
    fontWeight: "300",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    letterSpacing: 0.15,
    marginBottom: 2,
  },
  chatPartyLabelActive: { color: "rgba(255,255,255,0.88)" },
  chatSub: { fontSize: 12, color: "#94a3b8", lineHeight: 16 },
  chatSubActive: { color: "rgba(255,255,255,0.65)" },

  detailHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: CHAT_ACCENT_BORDER,
    backgroundColor: CHAT_THREAD_BG,
    flexShrink: 0,
  },
  detailHeaderMiddle: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 8,
    minWidth: 0,
  },
  detailHeaderTripCol: {
    flexShrink: 1,
    flexGrow: 0,
    minWidth: 72,
    maxWidth: 240,
  },
  detailHeaderTripColMobile: {
    flexShrink: 1,
    flexGrow: 0,
    minWidth: 64,
    maxWidth: 148,
  },
  detailHeaderActions: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 0,
    gap: 4,
  },
  listHeaderMobile: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 10,
  },
  chatItemMobile: {
    paddingVertical: CHAT_MOBILE.listRowPad,
    paddingHorizontal: 12,
    marginHorizontal: 0,
    borderRadius: 0,
    borderWidth: 0,
    shadowOpacity: 0,
    elevation: 0,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E9EDEF",
  },
  chatItemActiveMobile: {
    backgroundColor: "#F0F2F5",
    borderBottomColor: "#E9EDEF",
  },
  listPanelMobile: {
    flex: 1,
    minHeight: 0,
    backgroundColor: "#FFFFFF",
    position: "relative",
  },
  chatTitleMobile: {
    fontSize: CHAT_MOBILE.listTitleSize,
    fontWeight: "600",
    fontStyle: "normal",
    letterSpacing: 0,
    textTransform: "none",
  },
  chatTitleActiveMobile: { color: "#111B21" },
  chatTimeMobile: {
    fontSize: CHAT_MOBILE.listTimeSize,
    textTransform: "none",
    fontWeight: "400",
  },
  chatTimeActiveMobile: { color: "#667781" },
  chatPartyLabelMobile: {
    fontSize: CHAT_MOBILE.listPreviewSize,
    fontStyle: "normal",
    fontWeight: "400",
    color: "#667781",
  },
  chatPartyActiveMobile: { color: "#667781" },
  chatSubMobile: {
    fontSize: CHAT_MOBILE.listPreviewSize,
    lineHeight: 17,
    color: "#667781",
  },
  chatSubActiveMobile: { color: "#667781" },
  detailHeaderMobile: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: CHAT_MOBILE.headerBg,
    borderBottomColor: CHAT_MOBILE.headerBorder,
  },
  detailBackBtn: {
    marginRight: 2,
    padding: 2,
  },
  detailIconWrap: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: CHAT_ACCENT_SOFT,
    borderWidth: 1,
    borderColor: CHAT_ACCENT_BORDER,
  },
  detailTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: CHAT_TEXT_PRIMARY,
    letterSpacing: -0.1,
    fontStyle: "normal",
  },
  detailIconWrapMobile: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  detailTitleMobile: {
    fontSize: CHAT_MOBILE.headerTitleSize,
    fontWeight: "700",
    fontStyle: "normal",
    letterSpacing: -0.1,
  },
  detailPartySubtitleMobile: {
    fontSize: CHAT_MOBILE.headerSubtitleSize,
    marginTop: 1,
    color: CHAT_TEXT_MUTED,
    fontStyle: "italic",
    fontWeight: "400",
  },
  /** Party / org subtitle under trip title */
  detailPartySubtitle: {
    marginTop: 1,
    fontSize: 10,
    fontWeight: "400",
    fontStyle: "italic",
    color: CHAT_TEXT_MUTED,
    letterSpacing: 0.1,
  },
  detailMissionBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: "#fdfefe",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#eef2f7",
    flexShrink: 0,
  },
  detailMissionBarMobile: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: CHAT_MOBILE.headerBg,
    borderBottomColor: CHAT_MOBILE.headerBorder,
  },
  detailMissionRoute: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
    minWidth: 0,
    flexShrink: 1,
    paddingRight: 6,
  },
  detailMissionRouteTextBlock: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
  },
  detailMissionRouteLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minWidth: 0,
  },
  detailMissionRouteTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  detailMissionRouteText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#334155",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  detailMissionDate: {
    fontSize: 11,
    fontWeight: "600",
    color: "#94a3b8",
    letterSpacing: 0.1,
    flexShrink: 0,
  },
  detailMissionTabsScroller: {
    flex: 1,
    minWidth: 0,
    maxWidth: 420,
    minHeight: 36,
  },
  detailMissionTabsScrollerMobile: {
    flex: 1,
    minWidth: 0,
    maxWidth: 280,
    minHeight: 34,
  },
  detailMissionUnread: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "#eef2ff",
    borderWidth: 1,
    borderColor: CHAT_ACCENT_BORDER,
  },
  detailMissionUnreadText: {
    fontSize: 9,
    fontWeight: "900",
    color: CHAT_ACCENT,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  detailSwitchBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
    backgroundColor: "#ffffff",
  },
  detailSwitchBarCompact: {
    flexDirection: "column",
    alignItems: "stretch",
  },
  detailTripSelectorBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  detailTripSelectorText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#1e293b",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  detailPartyTabs: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    flexGrow: 1,
    gap: 6,
    paddingLeft: 4,
    paddingRight: 2,
    minHeight: 36,
  },
  detailPartyTab: {
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#e8ecf1",
    backgroundColor: "#ffffff",
    maxWidth: 136,
    minHeight: 34,
    flexShrink: 0,
  },
  detailPartyTabSingle: {
    alignItems: "center",
  },
  detailPartyTabStacked: {
    alignItems: "flex-start",
  },
  detailPartyTabOn: {
    borderColor: "#0f172a",
    backgroundColor: "#0f172a",
  },
  detailPartyTabOff: {
    borderStyle: "dashed",
    opacity: 0.92,
  },
  detailPartyTabTextCol: {
    flex: 1,
    minWidth: 0,
  },
  detailPartyTabTextColSingle: {
    gap: 0,
    justifyContent: "center",
  },
  detailPartyTabTextColStacked: {
    gap: 2,
    justifyContent: "flex-start",
  },
  detailPartyTabName: {
    fontSize: 10,
    fontWeight: "300",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    letterSpacing: 0.12,
    textTransform: "uppercase",
  },
  detailPartyTabNameOn: {
    color: "rgba(255,255,255,0.92)",
  },
  detailPartyTabText: {
    fontSize: 8,
    fontWeight: "600",
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: 0.65,
  },
  detailPartyTabTextOn: {
    color: "rgba(248,250,252,0.82)",
  },
  detailPartyTabTextOff: {
    color: "#94a3b8",
  },
  /** Mission bar party chips: role glyph (briefcase / truck / user), not initials. */
  detailPartyTabIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#f1f5f9",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  detailPartyTabIconWrapOn: {
    backgroundColor: "rgba(255,255,255,0.14)",
    borderColor: "rgba(255,255,255,0.22)",
  },

  detailPanel: { flex: 1, minHeight: 0, backgroundColor: "transparent", overflow: "hidden" },
  detailTransitionShell: { flex: 1, minHeight: 0, width: "100%" },
  detailDocHubShell: { flex: 1, minHeight: 0, width: "100%", position: "relative" },
  conversationBody: { flex: 1, minHeight: 0 },
  chatMessagesFlex: { flex: 1, minHeight: 0 },
  chatInputDock: {
    flexShrink: 0,
    backgroundColor: "#fff",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#e2e8f0",
  },
  chatInputDockMobile: {
    backgroundColor: "transparent",
    borderTopWidth: 0,
  },
  chatInputDockWebFixed: {
    position: "fixed",
    left: 0,
    right: 0,
    zIndex: 40,
    backgroundColor: CHAT_MOBILE.composerBar,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: CHAT_MOBILE.headerBorder,
    maxWidth: "100%",
  },
  msgs: { flex: 1, backgroundColor: "transparent" },
  msgsContent: { paddingHorizontal: 12, paddingTop: 10, gap: 8, paddingBottom: 10 },
  msgsContentMobile: {
    paddingHorizontal: 10,
    paddingTop: 8,
    gap: CHAT_MOBILE.eventCardGap,
    paddingBottom: 10,
  },

  sysMsg: {
    alignSelf: "center",
    backgroundColor: "#f1f5f9",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 5,
    marginVertical: 4,
  },
  sysMsgMobile: {
    alignSelf: "stretch",
    backgroundColor: "#FFFFFF",
    borderRadius: CHAT_MOBILE.eventCardRadius,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E9EDEF",
    paddingHorizontal: CHAT_MOBILE.eventCardPadH,
    paddingVertical: 10,
    marginVertical: CHAT_MOBILE.eventCardGap / 2,
    shadowColor: "#0f172a",
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  sysMsgText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#94a3b8",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    textAlign: "center",
  },
  sysMsgTextMobile: {
    fontSize: CHAT_MOBILE.eventMetaSize,
    fontWeight: "600",
    color: "#667781",
    letterSpacing: 0.2,
    textTransform: "none",
    lineHeight: CHAT_MOBILE.eventMetaLine,
  },

  bubbleWrap: { flexDirection: "row", alignItems: "flex-end", gap: 6 },
  bubbleWrapOwn: { justifyContent: "flex-end" },
  bubbleWrapOther: { justifyContent: "flex-start" },
  bubble: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  bubbleMobile: {
    borderRadius: CHAT_MOBILE.bubbleRadius,
    paddingHorizontal: CHAT_MOBILE.bubblePadH,
    paddingVertical: CHAT_MOBILE.bubblePadV,
  },
  bubbleOwn: {
    backgroundColor: CHAT_ACCENT,
    borderBottomRightRadius: 12,
    shadowOpacity: 0,
    elevation: 0,
  },
  bubbleOther: {
    backgroundColor: CHAT_INCOMING_BUBBLE,
    borderBottomLeftRadius: 12,
    borderWidth: 0,
    shadowOpacity: 0,
    elevation: 0,
  },
  bubbleOwnMobile: {
    borderBottomRightRadius: CHAT_MOBILE.bubbleRadius,
  },
  bubbleOtherMobile: {
    backgroundColor: CHAT_INCOMING_BUBBLE,
    borderBottomLeftRadius: CHAT_MOBILE.bubbleRadius,
  },
  bubbleText: { fontSize: 13, lineHeight: 18 },
  bubbleTextMobile: {
    fontSize: CHAT_MOBILE.bubbleFontSize,
    lineHeight: CHAT_MOBILE.bubbleLineHeight,
  },
  bubbleTextOwn: { color: "#fff", fontWeight: "500" },
  bubbleTextOther: { color: CHAT_TEXT_PRIMARY, fontWeight: "500" },
  bubbleMeta: { fontSize: 9, color: CHAT_TEXT_MUTED, letterSpacing: 0.1 },
  bubbleMetaMobile: {
    fontSize: CHAT_MOBILE.metaFontSize,
    marginTop: 2,
    color: CHAT_TEXT_MUTED,
  },
  bubbleMetaRow: { flexDirection: "row", alignItems: "center", gap: 2, marginTop: 3 },
  bubbleMetaRowOwn: { justifyContent: "flex-end" },

  inputWrap: {
    position: "relative",
    backgroundColor: CHAT_THREAD_BG,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: CHAT_ACCENT_BORDER,
    paddingHorizontal: 10,
    paddingTop: 8,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    paddingHorizontal: 4,
    paddingBottom: 6,
    minHeight: 44,
    borderWidth: 1,
    borderColor: CHAT_ACCENT_BORDER,
    borderRadius: 10,
    paddingTop: 6,
  },
  plusBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
  input: {
    flex: 1,
    minWidth: 0,
    backgroundColor: "transparent",
    borderRadius: 0,
    borderWidth: 0,
    paddingHorizontal: 4,
    paddingTop: Platform.OS === "ios" ? 7 : 6,
    paddingBottom: Platform.OS === "ios" ? 7 : 6,
    fontSize: 13,
    lineHeight: 18,
    color: CHAT_TEXT_PRIMARY,
    maxHeight: 120,
    minHeight: 34,
  },
  inputWeb: Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : {},
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e9edf5",
  },
  sendBtn: {
    minWidth: 64,
    height: 34,
    borderRadius: 8,
    paddingHorizontal: 14,
    backgroundColor: CHAT_SEND_BG,
    alignItems: "center",
    justifyContent: "center",
    shadowOpacity: 0,
    elevation: 0,
  },
  sendBtnOff: {
    backgroundColor: "#E4E6EF",
  },

  chipRow: { paddingHorizontal: 10, paddingBottom: 8, paddingTop: 2, gap: 6 },
  chip: {
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e8eaf6",
  },
  chipText: { fontSize: 12, color: "#475569", fontWeight: "500" },

  emojiPopup: {
    position: "absolute",
    bottom: "100%",
    left: 14,
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: "#f1f5f9",
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: -4 },
    elevation: 8,
    maxWidth: "100%",
    zIndex: 50,
  },
  emojiBtn: { width: 48, height: 48, alignItems: "center", justifyContent: "center", borderRadius: 12 },

  scriptPopup: {
    position: "absolute",
    bottom: "100%",
    left: 14,
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: "#f1f5f9",
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: -4 },
    elevation: 8,
    maxWidth: "100%",
    zIndex: 50,
  },
  scriptPopupHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  scriptPopupTitle: {
    fontSize: 9,
    fontWeight: "800",
    color: "#94a3b8",
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
  scriptItem: {
    paddingHorizontal: 4,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: "#f8fafc",
  },
  scriptItemText: { fontSize: 13, color: "#334155" },

  composeBtn: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: CHAT_ACCENT,
    alignItems: "center",
    justifyContent: "center",
  },
  backBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
  },

  /** Trip filter sheet (used inside `cm.sheet`; styles live on `s` with list chrome). */
  filterChipWrap: {
    width: "100%",
    flexDirection: "column",
    marginBottom: 16,
  },
  filterChip: {
    width: "100%",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 10,
    backgroundColor: "#f8fafc",
    alignItems: "center",
    justifyContent: "center",
  },
  filterChipLast: { marginBottom: 0 },
  filterChipActive: { borderColor: CHAT_ACCENT, backgroundColor: CHAT_ACCENT },
  filterChipText: {
    color: "#475569",
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  filterChipTextActive: { color: "#fff" },
  filterResetBtn: {
    width: "100%",
    marginTop: 4,
    borderRadius: 14,
    backgroundColor: "#f1f5f9",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  filterResetText: { color: "#334155", fontSize: 14, fontWeight: "700" },
  chatStoryInlineWrap: {
    paddingVertical: 2,
  },
  chatStoryLoadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingBottom: 10,
  },
  chatStoryLoadingText: {
    fontSize: 11,
    color: CHAT_TEXT_SECONDARY,
    fontWeight: "500",
  },
  chatStoriesModalLoading: {
    paddingVertical: 36,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  chatStoriesModalLoadingText: {
    fontSize: 12,
    color: CHAT_TEXT_SECONDARY,
    fontWeight: "500",
    textAlign: "center",
  },
  tripFilterPopoverLayer: {
    position: "absolute",
    top: 0,
    right: 0,
    left: 0,
    bottom: 0,
    zIndex: 80,
  },
  tripFilterPopoverBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "transparent",
  },
  tripFilterPopoverCard: {
    position: "absolute",
    top: 96,
    left: 10,
    right: 10,
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 14,
    shadowColor: "#0f172a",
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  tripFilterPopoverHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 2,
  },
  tripFilterPopoverTitle: { fontSize: 14, color: "#0f172a", fontWeight: "800" },
  tripFilterPopoverSub: { fontSize: 11, color: "#94a3b8", marginBottom: 12 },

  composePopoverLayer: {
    position: "absolute",
    top: 0,
    right: 0,
    left: 0,
    bottom: 0,
    zIndex: 90,
  },
  composePopoverCard: {
    position: "absolute",
    top: 88,
    left: 10,
    right: 10,
    maxHeight: "78%",
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 14,
    shadowColor: "#0f172a",
    shadowOpacity: 0.14,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  ledgerWebToast: {
    position: "absolute",
    top: 72,
    alignSelf: "center",
    zIndex: 400,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "rgba(15,23,42,0.92)",
    shadowColor: "#0f172a",
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 12,
  },
  ledgerWebToastText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#f8fafc",
  },
  deletedMsgWrap: {
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  deletedMsgText: {
    fontSize: 13,
    color: "#94a3b8",
    fontStyle: "italic",
  },
});

// ── Compose modal styles ──────────────────────────────────────────────────────

const cm = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 28,
    paddingHorizontal: 20,
    paddingBottom: 40,
    maxHeight: "82%",
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 40,
    shadowOffset: { width: 0, height: -10 },
    elevation: 20,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: "900",
    color: "#0f172a",
    letterSpacing: -0.6,
    fontStyle: "italic",
  },
  subtitle: { fontSize: 13, color: "#94a3b8", marginTop: 3 },
  closeBtn: { padding: 4 },
  netSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 18,
    paddingHorizontal: 14,
    paddingBottom: 18,
    maxHeight: "78%",
  },
  netHeader: {
    marginBottom: 12,
    paddingHorizontal: 2,
  },
  netTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: SLACK_DESKTOP.textPrimary,
    letterSpacing: -0.2,
  },
  netSubtitle: {
    fontSize: 12,
    fontWeight: "500",
    color: SLACK_DESKTOP.textTertiary,
    marginTop: 2,
  },
  netCloseBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  netSearchRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: SLACK_DESKTOP.searchBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E8E8E8",
    paddingHorizontal: 12,
    minHeight: 38,
    marginBottom: 10,
  },
  netSearchInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    lineHeight: 18,
    color: SLACK_DESKTOP.textPrimary,
    paddingVertical: 8,
  },
  netSectionLabel: {
    fontSize: 9,
    fontWeight: "800",
    color: "#94a3b8",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginTop: 8,
    marginBottom: 6,
    paddingHorizontal: 4,
  },
  netPartnerRow: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E8E8E8",
    backgroundColor: "#FFFFFF",
    marginBottom: 8,
    overflow: "hidden",
  },
  netPartnerRowMain: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  netPartnerIdentityWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  netPartnerAvatarWrap: {
    borderRadius: 999,
    overflow: "hidden",
  },
  netPartnerPartyType: {
    fontSize: 10,
    fontWeight: "600",
    color: "#94a3b8",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    marginTop: 1,
  },
  netPartnerName: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    fontWeight: "600",
    color: SLACK_DESKTOP.textPrimary,
  },
  netPartnerAction: {
    fontSize: 11,
    color: "#94a3b8",
    fontWeight: "700",
    letterSpacing: 0.25,
    textTransform: "uppercase",
  },
  netEmptyWrap: {
    paddingTop: 28,
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
  },
  netEmptyTitle: {
    fontSize: 13,
    color: "#94a3b8",
    fontWeight: "500",
  },
  netEmptySubtitle: {
    fontSize: 12,
    color: "#94a3b8",
    textAlign: "center",
    paddingHorizontal: 20,
    lineHeight: 18,
  },

  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f1f5f9",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 16,
  },
  searchInput: { flex: 1, fontSize: 16, color: "#1e293b" },

  tripCard: {
    borderRadius: 16,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    marginBottom: 8,
    overflow: "hidden",
    shadowColor: "#0f172a",
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  tripRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  tripInfo: { flex: 1, minWidth: 0 },
  tripMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  tripNumber: { fontSize: 13, fontWeight: "800", color: "#0f172a" },
  tripMetaPill: {
    backgroundColor: "#eef2ff",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: CHAT_ACCENT_BORDER,
  },
  tripMetaPillText: {
    fontSize: 9,
    fontWeight: "800",
    color: CHAT_ACCENT,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  tripRoute: { fontSize: 11, color: "#94a3b8", marginTop: 3, lineHeight: 15 },

  partyList: {
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
  },
  partyRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 13,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
  },
  partyIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: "#e8eaf6",
    alignItems: "center",
    justifyContent: "center",
  },
  partyType: {
    fontSize: 9,
    fontWeight: "800",
    color: CHAT_ACCENT,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  partyName: {
    fontSize: 11,
    fontWeight: "300",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    marginTop: 1,
  },

  partyRowDisabled: {
    position: "relative",
    overflow: "hidden",
    opacity: 0.72,
    shadowColor: "#64748b",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  partyRowDisabledOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(248, 250, 252, 0.82)",
  },
  partyIconWrapMuted: { opacity: 0.55 },
  partyTypeMuted: { color: "#94a3b8" },
  partyDisabledHint: { fontSize: 14, color: "#cbd5e1", fontWeight: "600", paddingHorizontal: 4 },
});

// ── Conversation detail (module scope: stable component identity so TextInput keeps focus) ─

function ChatConversationLayout({
  isDesktop,
  header,
  messages,
  inputBar,
}: {
  isDesktop: boolean;
  header: React.ReactNode;
  messages: React.ReactNode;
  inputBar: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const nativeMobile = isChatNativeMobile(isDesktop);
  const mobileWeb = Platform.OS === "web" && !isDesktop;
  const { keyboardVisible, keyboardHeight } = useKeyboardVisible();
  const keyboardInset = effectiveKeyboardInset(keyboardVisible, keyboardHeight);
  const dockBottomPad = isDesktop
    ? 10
    : dockPaddingBottom(insets.bottom, keyboardVisible);
  const webComposerReserveFallback = mobileWebComposerReservePx();
  const [composerDockHeight, setComposerDockHeight] = useState(
    webComposerReserveFallback,
  );

  const onComposerLayout = useCallback((e: LayoutChangeEvent) => {
    const h = Math.ceil(e.nativeEvent.layout.height);
    if (h > 0) setComposerDockHeight(h);
  }, []);

  const messagesPane = (
    <>
      {header}
      <View style={s.chatMessagesFlex}>{messages}</View>
    </>
  );

  const composerDock = (
    <View
      onLayout={mobileWeb ? onComposerLayout : undefined}
      style={[
        s.chatInputDock,
        isDesktop && { borderTopWidth: 0, backgroundColor: SLACK_DESKTOP.mainBg, paddingBottom: 0 },
        nativeMobile && s.chatInputDockMobile,
        !isDesktop && { paddingBottom: dockBottomPad },
      ]}
    >
      {inputBar}
    </View>
  );

  const conversationBody = (
    <View
      style={[
        s.conversationBody,
        isDesktop && { backgroundColor: SLACK_DESKTOP.mainBg },
        nativeMobile && { backgroundColor: CHAT_MOBILE.wallpaper },
      ]}
    >
      {messagesPane}
      {composerDock}
    </View>
  );

  if (isDesktop) {
    return (
      <View style={[s.detailPanel, { backgroundColor: SLACK_DESKTOP.mainBg }]}>
        {conversationBody}
      </View>
    );
  }

  if (mobileWeb) {
    const webMsgsPad =
      composerDockHeight + dockBottomPad + keyboardInset;
    return (
      <View style={s.detailPanel}>
        <View
          style={[
            s.conversationBody,
            {
              flex: 1,
              minHeight: 0,
              backgroundColor: CHAT_MOBILE.wallpaper,
              paddingBottom: webMsgsPad,
            },
          ]}
        >
          {messagesPane}
        </View>
        <View
          onLayout={onComposerLayout}
          style={[
            s.chatInputDockWebFixed,
            s.chatInputDock,
            s.chatInputDockMobile,
            {
              bottom: keyboardInset,
              paddingBottom: dockBottomPad,
            },
          ]}
        >
          {inputBar}
        </View>
      </View>
    );
  }

  return Platform.OS === "ios" ? (
    <KeyboardAvoidingView
      style={s.detailPanel}
      behavior="padding"
      keyboardVerticalOffset={0}
    >
      {conversationBody}
    </KeyboardAvoidingView>
  ) : (
    <View
      style={[
        s.detailPanel,
        keyboardInset > 0 && { paddingBottom: keyboardInset },
      ]}
    >
      {conversationBody}
    </View>
  );
}

function ChatDetailHeader({
  title,
  subtitle,
  partyType,
  counterpartyType,
  isDesktop,
  onCloseDetail,
  middleContent,
  slackAvatarIdentity,
  slackPartyTabsRow,
  slackCompactRoleTag,
  slackPartyDetailLabel,
  onOpenFilters,
}: {
  title: string;
  subtitle?: string;
  partyType?: ConversationPartyType;
  /** Integrated B2B counterparty (client or supplier), shown beside the active lane icon. */
  counterpartyType?: "client" | "supplier" | null;
  isDesktop: boolean;
  onCloseDetail: () => void;
  /** Route, date, party tabs — rendered inline between title and actions (trip detail). */
  middleContent?: React.ReactNode;
  slackAvatarIdentity?: ResolvedPartyAvatarIdentity;
  slackPartyTabsRow?: React.ReactNode;
  slackCompactRoleTag?: string;
  slackPartyDetailLabel?: string;
  onOpenFilters?: () => void;
}) {
  const mobileChatUi = isChatMobileLayout(isDesktop);
  const nativeMobile = isChatNativeMobile(isDesktop);
  const dualLane = Boolean(partyType && counterpartyType);

  if (isDesktop && slackAvatarIdentity) {
    const tabSubtitle = slackPartyDetailLabel || subtitle;
    return (
      <ChatSlackDesktopThreadHeader
        title={title}
        subtitle={tabSubtitle}
        avatarIdentity={slackAvatarIdentity}
        partyTabsRow={slackPartyTabsRow}
        compactRoleTag={slackCompactRoleTag}
      />
    );
  }

  if (mobileChatUi && slackAvatarIdentity) {
    const tabSubtitle = slackPartyDetailLabel || subtitle;
    return (
      <ChatSlackThreadHeader
        title={title}
        subtitle={tabSubtitle}
        avatarIdentity={slackAvatarIdentity}
        onBack={onCloseDetail}
        partyTabsRow={slackPartyTabsRow}
        compactRoleTag={slackCompactRoleTag}
        onOpenFilters={onOpenFilters}
      />
    );
  }

  return (
    <View
      style={[
        s.detailHeader,
        nativeMobile && s.detailHeaderMobile,
      ]}
    >
      {!isDesktop && (
        <TouchableOpacity onPress={onCloseDetail} hitSlop={10} style={s.detailBackBtn}>
          <ArrowLeft size={nativeMobile ? 22 : 20} color="#111B21" />
        </TouchableOpacity>
      )}
      <View style={[s.detailIconWrap, nativeMobile && s.detailIconWrapMobile]}>
        {partyType ? (
          <>
            <PartyIcon partyType={partyType} active tone="hub" size={dualLane ? 13 : nativeMobile ? 14 : 15} />
            {counterpartyType ? (
              <PartyIcon partyType={counterpartyType} active tone="hub" size={13} />
            ) : null}
          </>
        ) : (
          <MessageSquare size={nativeMobile ? 14 : 16} color={CHAT_TEXT_PRIMARY} />
        )}
      </View>
      <View
        style={[
          middleContent ? s.detailHeaderTripCol : { flex: 1, minWidth: 0 },
          middleContent != null && nativeMobile ? s.detailHeaderTripColMobile : null,
        ]}
      >
        <Text
          style={[s.detailTitle, nativeMobile && s.detailTitleMobile]}
          numberOfLines={1}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text
            style={[s.detailPartySubtitle, nativeMobile && s.detailPartySubtitleMobile]}
            numberOfLines={1}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
      {middleContent ? (
        <View style={s.detailHeaderMiddle}>{middleContent}</View>
      ) : null}
      <View style={s.detailHeaderActions}>
        {!isDesktop ? null : (
          <TouchableOpacity hitSlop={10}>
            <Search size={16} color={CHAT_TEXT_SECONDARY} />
          </TouchableOpacity>
        )}
        <TouchableOpacity hitSlop={10}>
          <MoreVertical size={16} color={CHAT_TEXT_SECONDARY} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

function ChatSystemMsg({
  label,
  isMobile = false,
  slackLayout = false,
  isDesktop = false,
}: {
  label: string;
  isMobile?: boolean;
  slackLayout?: boolean;
  isDesktop?: boolean;
}) {
  if (slackLayout && isDesktop) {
    return (
      <View style={deskSt.threadSysMsg}>
        <Text style={deskSt.threadSysMsgText} numberOfLines={4}>
          {label}
        </Text>
      </View>
    );
  }
  if (slackLayout) {
    return (
      <View style={slackSt.threadSysMsg}>
        <Text style={slackSt.threadSysMsgText} numberOfLines={4}>
          {label}
        </Text>
      </View>
    );
  }
  return (
    <View style={[s.sysMsg, isMobile && s.sysMsgMobile]}>
      <Text style={[s.sysMsgText, isMobile && s.sysMsgTextMobile]} numberOfLines={3}>
        {label}
      </Text>
    </View>
  );
}

function ChatBubble({
  isOwn,
  content,
  timestamp,
  senderName,
  peerAvatar,
  deliveryStatus,
  isNew,
  isMobile,
  slackLayout = false,
  slackVariant = "mobile",
  slackGroup,
  onAvatarPress,
  reactions,
  selfUserId,
  onReact,
  replyPreview,
  onReply,
  isEdited,
  onEdit,
  onDelete,
}: {
  isOwn: boolean;
  content: string;
  timestamp: string;
  senderName?: string;
  peerAvatar?: ResolvedPartyAvatarIdentity | null;
  /** WhatsApp-style ticks for outgoing rows (from `resolveOutgoingDeliveryStatus`). */
  deliveryStatus?: MessageDeliveryStatus;
  /** True only for messages that arrived via Realtime after this screen mounted.
   *  Bootstrap messages start fully visible to avoid the "flash of invisible" blink. */
  isNew?: boolean;
  isMobile?: boolean;
  slackLayout?: boolean;
  slackVariant?: "mobile" | "desktop";
  slackGroup?: SlackMessageGroupMeta;
  onAvatarPress?: () => void;
  reactions?: ChatReactions | null;
  selfUserId?: string | null;
  onReact?: (emoji: string) => void;
  replyPreview?: ReplyPreviewData | null;
  onReply?: () => void;
  isEdited?: boolean;
  onEdit?: (newContent: string) => void;
  onDelete?: () => void;
}) {
  const { profile } = useAuth();
  const { currentOrganization } = useOrganization();

  // Capture isNew at first mount only — never re-animate on re-renders.
  const wasNewRef = useRef(isNew === true);
  const wasNew    = wasNewRef.current;

  // Bootstrap messages start at opacity=1 / translateY=0 / scale=1 (no animation).
  // Only brand-new Realtime messages slide in from below.
  const enterOpacity = useRef(new Animated.Value(wasNew ? 0 : 1)).current;
  const enterY       = useRef(new Animated.Value(wasNew ? 8 : 0)).current;
  const enterScale   = useRef(new Animated.Value(wasNew ? 0.97 : 1)).current;

  useEffect(() => {
    if (!wasNew) return;
    Animated.parallel([
      Animated.timing(enterOpacity, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
        easing: Easing.out(Easing.cubic),
      }),
      Animated.timing(enterY, {
        toValue: 0,
        duration: 260,
        useNativeDriver: true,
        easing: Easing.out(Easing.cubic),
      }),
      Animated.spring(enterScale, {
        toValue: 1,
        useNativeDriver: true,
        speed: 20,
        bounciness: 3,
      }),
    ]).start();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally empty — runs once on mount

  if (slackLayout) {
    const ownAvatar: ResolvedPartyAvatarIdentity = {
      displayName: profile?.full_name || profile?.displayName || "You",
      entityType: "client",
    };
    const rowAvatar = isOwn
      ? ownAvatar
      : peerAvatar ?? { displayName: senderName ?? "User", entityType: "client" };
    return (
      <ChatSlackMessageRow
        senderName={isOwn ? (profile?.full_name || profile?.displayName || "You") : senderName ?? "User"}
        content={content}
        timestamp={timestamp}
        avatar={rowAvatar}
        isOwn={isOwn}
        userName={profile?.full_name || profile?.displayName || "You"}
        userAvatarUrl={profile?.avatar_url ?? null}
        userAvatarSeed={profile?.avatar_seed ?? null}
        userOrgLogoUrl={currentOrganization?.logo_url ?? null}
        onAvatarPress={onAvatarPress}
        variant={slackVariant}
        group={slackGroup}
        isNew={isNew}
        reactions={reactions}
        selfUserId={selfUserId}
        onReact={onReact}
        replyPreview={replyPreview}
        onReply={onReply}
        isEdited={isEdited}
        onEdit={isOwn ? onEdit : undefined}
        onDelete={isOwn ? onDelete : undefined}
      />
    );
  }

  const avatarSize = isMobile ? CHAT_MOBILE.avatarSize : 44;
  const bubbleMaxWidth = isMobile ? CHAT_MOBILE.bubbleMaxWidthPct : "72%";
  let displayTime = timestamp;
  try {
    displayTime = new Date(timestamp).toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    // keep raw
  }


  return (
    <Animated.View
      style={[
        s.bubbleWrap,
        isOwn ? s.bubbleWrapOwn : s.bubbleWrapOther,
        {
          opacity: enterOpacity,
          transform: [{ translateY: enterY }, { scale: enterScale }],
        },
      ]}
    >
      {!isOwn && peerAvatar ? (
        onAvatarPress ? (
          <Pressable onPress={onAvatarPress} hitSlop={6}>
            <ChatPartyAvatar identity={peerAvatar} size={avatarSize} />
          </Pressable>
        ) : (
          <ChatPartyAvatar identity={peerAvatar} size={avatarSize} />
        )
      ) : null}
      <View style={{ maxWidth: bubbleMaxWidth }}>
        <View
          style={[
            s.bubble,
            isMobile && s.bubbleMobile,
            isOwn ? s.bubbleOwn : s.bubbleOther,
            isMobile && isOwn && s.bubbleOwnMobile,
            isMobile && !isOwn && s.bubbleOtherMobile,
          ]}
        >
          <Text
            style={[
              s.bubbleText,
              isMobile && s.bubbleTextMobile,
              isOwn ? s.bubbleTextOwn : s.bubbleTextOther,
            ]}
          >
            {content}
          </Text>
        </View>
        <View style={[s.bubbleMetaRow, isOwn && s.bubbleMetaRowOwn]}>
          <Text style={[s.bubbleMeta, isMobile && s.bubbleMetaMobile]}>
            {displayTime}
            {!isOwn && senderName ? ` · ${senderName}` : ""}
          </Text>
          {isOwn ? <MessageTick status={deliveryStatus} compact /> : null}
        </View>
      </View>
      {isOwn ? (
        <ChatPartyAvatar
          identity={{
            displayName: profile?.full_name || profile?.displayName || "You",
            entityType: "client",
          }}
          isOwnUser
          userName={profile?.full_name || profile?.displayName || "You"}
          userAvatarUrl={profile?.avatar_url ?? null}
          userAvatarSeed={profile?.avatar_seed ?? null}
          userOrgLogoUrl={currentOrganization?.logo_url ?? null}
          userOrgOwnerAvatarSeed={profile?.avatar_seed ?? null}
          size={avatarSize}
        />
      ) : null}
    </Animated.View>
  );
}

function ChatInputBar({
  quickMsgs,
  messageInput,
  onChangeMessage,
  showEmoji,
  setShowEmoji,
  showScripts,
  setShowScripts,
  onSend,
  onOpenDocShare,
  inputOverlayMaxWidth,
  compact,
  minimalChrome,
  isDesktop = true,
  composerPlaceholder,
  replyContext,
  onCancelReply,
  onUserTyping,
}: {
  quickMsgs: string[];
  messageInput: string;
  onChangeMessage: React.Dispatch<React.SetStateAction<string>>;
  showEmoji: boolean;
  setShowEmoji: React.Dispatch<React.SetStateAction<boolean>>;
  showScripts: boolean;
  setShowScripts: React.Dispatch<React.SetStateAction<boolean>>;
  onSend: (text?: string) => void;
  onOpenDocShare?: () => void;
  /** Caps emoji / quick-message popovers on narrow viewports (mobile web). */
  inputOverlayMaxWidth?: number;
  /** Hide quick chips when the keyboard is open (mobile). */
  compact?: boolean;
  /** Mobile: hide emoji/scripts row buttons (WhatsApp-style composer). */
  minimalChrome?: boolean;
  isDesktop?: boolean;
  composerPlaceholder?: string;
  replyContext?: ReplyPreviewData | null;
  onCancelReply?: () => void;
  onUserTyping?: () => void;
}) {
  const overlayW = inputOverlayMaxWidth ?? 300;
  const canSend = messageInput.trim().length > 0;
  const sendScale = useRef(new Animated.Value(canSend ? 1 : 0.92)).current;

  useEffect(() => {
    Animated.spring(sendScale, {
      toValue: canSend ? 1 : 0.92,
      useNativeDriver: true,
      speed: 16,
      bounciness: 6,
    }).start();
  }, [canSend, sendScale]);

  const submitMessage = useCallback(() => {
    if (!messageInput.trim()) return;
    onSend();
  }, [messageInput, onSend]);

  if (isDesktop) {
    return (
      <ChatSlackDesktopComposer
        value={messageInput}
        onChangeText={onChangeMessage}
        onSend={onSend}
        onOpenAttach={onOpenDocShare}
        quickMessages={quickMsgs}
        placeholder={composerPlaceholder ?? "Message"}
        replyContext={replyContext}
        onCancelReply={onCancelReply}
        onUserTyping={onUserTyping}
      />
    );
  }

  if (minimalChrome) {
    return (
      <ChatMobileComposer
        value={messageInput}
        onChangeText={onChangeMessage}
        onSend={onSend}
        onOpenAttach={onOpenDocShare}
        quickMessages={quickMsgs}
        hideQuickChips={compact}
        placeholder={composerPlaceholder ?? "Message"}
        variant={isChatMobileLayout(isDesktop) ? "slack" : "default"}
        replyContext={replyContext}
        onCancelReply={onCancelReply}
        onUserTyping={onUserTyping}
      />
    );
  }

  return (
    <View style={s.inputWrap}>
      {showEmoji ? (
        <View style={[s.emojiPopup, { width: Math.min(240, overlayW) }]}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 2 }}>
            {CHAT_DESKTOP_COMPOSER_EMOJIS.map((e) => (
              <TouchableOpacity
                key={e}
                style={s.emojiBtn}
                onPress={() => {
                  onChangeMessage((p) => p + e);
                  setShowEmoji(false);
                }}
                activeOpacity={0.7}
              >
                <ChatAnimatedEmoji emoji={e} size="lg" />
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ) : null}
      {showScripts ? (
        <View style={[s.scriptPopup, { width: Math.min(300, overlayW) }]}>
          <View style={s.scriptPopupHeader}>
            <Text style={s.scriptPopupTitle}>QUICK MESSAGES</Text>
            <TouchableOpacity onPress={() => setShowScripts(false)} hitSlop={8}>
              <X size={15} color="#94a3b8" />
            </TouchableOpacity>
          </View>
          <ScrollView style={{ maxHeight: 220 }}>
            {quickMsgs.map((m, i) => (
              <TouchableOpacity
                key={i}
                style={s.scriptItem}
                onPress={() => {
                  onChangeMessage(m);
                  setShowScripts(false);
                }}
                activeOpacity={0.7}
              >
                <Text style={s.scriptItemText}>{m}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      ) : null}
      <View style={s.inputRow}>
        <TouchableOpacity
          style={s.plusBtn}
          hitSlop={6}
          onPress={onOpenDocShare}
          activeOpacity={0.75}
        >
          <Plus size={16} color={onOpenDocShare ? CHAT_ACCENT : "#94a3b8"} />
        </TouchableOpacity>
        <TextInput
          style={[s.input, s.inputWeb]}
          value={messageInput}
          onChangeText={onChangeMessage}
          placeholder="Message"
          placeholderTextColor="#94a3b8"
          multiline
          editable
          scrollEnabled
          blurOnSubmit={false}
          returnKeyType="send"
          enablesReturnKeyAutomatically
          onSubmitEditing={submitMessage}
          textAlignVertical="center"
          autoCorrect
          autoCapitalize="sentences"
        />
        {!minimalChrome ? (
          <TouchableOpacity
            style={s.iconBtn}
            onPress={() => {
              setShowEmoji((v) => !v);
              setShowScripts(false);
            }}
            hitSlop={6}
          >
            <Smile size={19} color={showEmoji ? CHAT_ACCENT : "#94a3b8"} />
          </TouchableOpacity>
        ) : null}
        {!minimalChrome ? (
          <TouchableOpacity
            style={s.iconBtn}
            onPress={() => {
              setShowScripts((v) => !v);
              setShowEmoji(false);
            }}
            hitSlop={6}
          >
            <FileType size={19} color={showScripts ? CHAT_ACCENT : "#94a3b8"} />
          </TouchableOpacity>
        ) : null}
        <Animated.View style={{ transform: [{ scale: sendScale }] }}>
          <TouchableOpacity
            style={[s.sendBtn, !canSend && s.sendBtnOff]}
            onPress={() => onSend()}
            disabled={!canSend}
            activeOpacity={0.85}
            onPressIn={() => {
              if (!canSend) return;
              Animated.spring(sendScale, {
                toValue: 0.93,
                useNativeDriver: true,
                speed: 24,
                bounciness: 0,
              }).start();
            }}
            onPressOut={() => {
              if (!canSend) return;
              Animated.spring(sendScale, {
                toValue: 1,
                useNativeDriver: true,
                speed: 24,
                bounciness: 5,
              }).start();
            }}
          >
            <Text
              style={{
                fontSize: 11,
                fontWeight: "700",
                color: canSend ? "#fff" : CHAT_TEXT_MUTED,
              }}
            >
              Send
            </Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
      {!compact ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          style={{ flexShrink: 0 }}
          contentContainerStyle={s.chipRow}
        >
          {quickMsgs.map((m, i) => (
            <TouchableOpacity
              key={i}
              style={s.chip}
              onPress={() => onChangeMessage(m)}
              activeOpacity={0.7}
            >
              <Text style={s.chipText} numberOfLines={1}>
                {m}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}

function TripConversationDetailPanel({
  selectedConv,
  conversations,
  composeTrips,
  linkedOrgBranding,
  messagesRef,
  messageInput,
  setMessageInput,
  showEmoji,
  setShowEmoji,
  showScripts,
  setShowScripts,
  onSend,
  onOpenDocShare,
  showDocShare,
  onCloseDocShare,
  onDocShare,
  docHubTripId,
  docHubVehicleId,
  docHubDriverId,
  docHubOrgId,
  docHubUserId,
  isDesktop,
  inputOverlayMaxWidth,
  onCloseDetail,
  currentOrgId,
  onAddToBook,
  onDispute,
  onSelectConversation,
  onOpenCompose,
  replyContext,
  onCancelReply,
  onSetReply,
}: {
  selectedConv: TripConversation | null;
  conversations: TripConversation[];
  composeTrips: TripForCompose[];
  linkedOrgBranding: Record<string, ChatOrgBranding>;
  messagesRef: React.RefObject<FlatList | null>;
  messageInput: string;
  setMessageInput: React.Dispatch<React.SetStateAction<string>>;
  showEmoji: boolean;
  setShowEmoji: React.Dispatch<React.SetStateAction<boolean>>;
  showScripts: boolean;
  setShowScripts: React.Dispatch<React.SetStateAction<boolean>>;
  onSend: (text?: string) => void;
  onOpenDocShare: () => void;
  showDocShare: boolean;
  onCloseDocShare: () => void;
  onDocShare: (doc: DocumentSharePayload) => void;
  docHubTripId: string | null;
  docHubVehicleId: string | null;
  docHubDriverId: string | null;
  docHubOrgId: string | null;
  docHubUserId: string | null;
  isDesktop: boolean;
  inputOverlayMaxWidth: number;
  onCloseDetail: () => void;
  currentOrgId: string;
  onAddToBook: (message: TripMessageRow) => void;
  onDispute: (message: TripMessageRow) => void;
  onSelectConversation: (id: string) => void;
  onOpenCompose: () => void | Promise<void>;
  replyContext?: ReplyPreviewData | null;
  onCancelReply?: () => void;
  onSetReply?: (reply: ReplyPreviewData) => void;
}) {
  if (!selectedConv) return <EmptyDetail isDesktop={isDesktop} />;
  return (
    <TripConversationDetailLoaded
      selectedConv={selectedConv}
      conversations={conversations}
      composeTrips={composeTrips}
      linkedOrgBranding={linkedOrgBranding}
      messagesRef={messagesRef}
      messageInput={messageInput}
      setMessageInput={setMessageInput}
      showEmoji={showEmoji}
      setShowEmoji={setShowEmoji}
      showScripts={showScripts}
      setShowScripts={setShowScripts}
      onSend={onSend}
      onOpenDocShare={onOpenDocShare}
      showDocShare={showDocShare}
      onCloseDocShare={onCloseDocShare}
      onDocShare={onDocShare}
      docHubTripId={docHubTripId}
      docHubVehicleId={docHubVehicleId}
      docHubDriverId={docHubDriverId}
      docHubOrgId={docHubOrgId}
      docHubUserId={docHubUserId}
      isDesktop={isDesktop}
      inputOverlayMaxWidth={inputOverlayMaxWidth}
      onCloseDetail={onCloseDetail}
      currentOrgId={currentOrgId}
      onAddToBook={onAddToBook}
      onDispute={onDispute}
      onSelectConversation={onSelectConversation}
      onOpenCompose={onOpenCompose}
      replyContext={replyContext}
      onCancelReply={onCancelReply}
      onSetReply={onSetReply}
    />
  );
}

function TripConversationDetailLoaded({
  selectedConv,
  composeTrips,
  linkedOrgBranding,
  messagesRef,
  messageInput,
  setMessageInput,
  showEmoji,
  setShowEmoji,
  showScripts,
  setShowScripts,
  onSend,
  onOpenDocShare,
  showDocShare,
  onCloseDocShare,
  onDocShare,
  docHubTripId,
  docHubVehicleId,
  docHubDriverId,
  docHubOrgId,
  docHubUserId,
  isDesktop,
  inputOverlayMaxWidth,
  onCloseDetail,
  currentOrgId,
  onAddToBook,
  onDispute,
  onSelectConversation,
  onOpenCompose: _onOpenCompose,
  replyContext,
  onCancelReply,
  onSetReply,
}: {
  selectedConv: TripConversation;
  conversations: TripConversation[];
  composeTrips: TripForCompose[];
  linkedOrgBranding: Record<string, ChatOrgBranding>;
  messagesRef: React.RefObject<FlatList | null>;
  messageInput: string;
  setMessageInput: React.Dispatch<React.SetStateAction<string>>;
  showEmoji: boolean;
  setShowEmoji: React.Dispatch<React.SetStateAction<boolean>>;
  showScripts: boolean;
  setShowScripts: React.Dispatch<React.SetStateAction<boolean>>;
  onSend: (text?: string) => void;
  onOpenDocShare: () => void;
  showDocShare: boolean;
  onCloseDocShare: () => void;
  onDocShare: (doc: DocumentSharePayload) => void;
  docHubTripId: string | null;
  docHubVehicleId: string | null;
  docHubDriverId: string | null;
  docHubOrgId: string | null;
  docHubUserId: string | null;
  isDesktop: boolean;
  inputOverlayMaxWidth: number;
  replyContext?: ReplyPreviewData | null;
  onCancelReply?: () => void;
  onSetReply?: (reply: ReplyPreviewData) => void;
  onCloseDetail: () => void;
  currentOrgId: string;
  onAddToBook: (message: TripMessageRow) => void;
  onDispute: (message: TripMessageRow) => void;
  onSelectConversation: (id: string) => void;
  onOpenCompose: () => void | Promise<void>;
}) {
  const router = useRouter();
  const { profile } = useAuth();
  const selfUid = profile?.uid ?? null;
  const selfName =
    profile?.full_name ?? profile?.displayName ?? "You";
  const { currentOrganization } = useOrganization();
  /** Outgoing bubble side / "YOU" — must use auth uid, not sender_role (linked clients see dispatcher messages as incoming). */
  const isMessageFromSelf = useCallback(
    (m: TripMessageRow) =>
      Boolean(selfUid && m.sender_user_id && m.sender_user_id === selfUid),
    [selfUid],
  );
  const { markTripThreadsRead, initiateConversation } = useTripChat();

  // Subscribe directly to this conversation for live message updates.
  // Re-renders only when THIS conversation changes, not the full list.
  const liveConv = useConversation(selectedConv.id) ?? selectedConv;

  // ── Slack-style: typing indicator ────────────────────────────────────
  const { typingNames, onUserTyping } = useChatTypingPresence(
    liveConv.id,
    selfUid,
    selfName,
  );
  const liveTripEntry = useChatStore((s) =>
    liveConv.trip_id ? s.trips[liveConv.trip_id] ?? null : null,
  );
  const liveConvRef = useRef(liveConv);
  liveConvRef.current = liveConv;

  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMoreOlder, setHasMoreOlder] = useState(false);
  const olderInFlightRef = useRef(false);
  /** One newest-page fetch at a time (auto + manual share) — avoids duplicate `trip_messages` hits. */
  const latestHistoryInFlightRef = useRef(false);
  /** Increment when `liveConv.id` changes so stale fetches never merge or touch loading UI. */
  const historyFetchGenerationRef = useRef(0);
  const olderStartDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const mergeHistoryPage = useCallback((rows: TripMessageRow[]) => {
    const id = liveConvRef.current.id;
    const ok = chatStore.mergeConversationHistory(id, rows);
    setHasMoreOlder(rows.length === TRIP_CHAT_HISTORY_PAGE);
    return ok;
  }, []);

  /** Newest page: single-flight; shared by auto-backfill and "Load history". */
  const runLatestHistoryPage = useCallback(async () => {
    if (latestHistoryInFlightRef.current) return;
    latestHistoryInFlightRef.current = true;
    const generation = historyFetchGenerationRef.current;
    const convId = liveConvRef.current.id;
    const partyType = liveConvRef.current.party_type ?? null;
    const alreadyHasMessages = (liveConvRef.current.messages?.length ?? 0) > 0;
    setHistoryError(null);
    // Don't flash the empty-state spinner when the lane already has bubbles.
    if (!alreadyHasMessages) setHistoryLoading(true);
    try {
      const rows = await getMessagesByConversation(convId, {
        limit: TRIP_CHAT_HISTORY_PAGE,
        partyType,
      });
      if (generation !== historyFetchGenerationRef.current) return;

      const ok = mergeHistoryPage(rows);

      if (rows.length > 0 && !ok) {
        setHistoryError(
          "Thread is not synced in the app yet. Return to the inbox and open the trip again, or wait a moment and tap Load history once.",
        );
        return;
      }

      queueMicrotask(() => {
        if (generation !== historyFetchGenerationRef.current) return;
        const c = chatStore.getConversation(convId);
        if (rows.length > 0 && (c?.messages?.length ?? 0) === 0) {
          setHistoryError(
            "Messages were fetched but none are visible on this party tab. Try Client, Supplier, or Driver.",
          );
        }
      });
    } catch {
      if (generation === historyFetchGenerationRef.current) {
        setHistoryError("Could not load messages. Wait a moment and try once.");
      }
    } finally {
      latestHistoryInFlightRef.current = false;
      if (generation === historyFetchGenerationRef.current) {
        setHistoryLoading(false);
      }
    }
  }, [mergeHistoryPage]);

  const _loadLatestHistoryPage = useCallback(() => {
    void runLatestHistoryPage();
  }, [runLatestHistoryPage]);

  /** Older messages than the current oldest row in this lane. */
  const loadOlderHistoryPage = useCallback(async () => {
    if (!hasMoreOlder || olderInFlightRef.current) return;
    const msgs = liveConvRef.current.messages;
    if (msgs.length === 0) return;
    olderInFlightRef.current = true;
    setLoadingOlder(true);
    try {
      const oldest = msgs[0].created_at;
      const rows = await getMessagesByConversation(liveConvRef.current.id, {
        before: oldest,
        limit: TRIP_CHAT_HISTORY_PAGE,
        partyType: liveConvRef.current.party_type ?? null,
      });
      if (rows.length === 0) {
        setHasMoreOlder(false);
        return;
      }
      const ok = mergeHistoryPage(rows);
      if (!ok) setHasMoreOlder(false);
    } catch {
      // non-critical
    } finally {
      olderInFlightRef.current = false;
      setLoadingOlder(false);
    }
  }, [hasMoreOlder, mergeHistoryPage]);

  const latestHistoryFetchedForRef = useRef<string | null>(null);
  /** After open/history fetch, keep pinning to end until layout settles. */
  const needsOpenPinRef = useRef(true);
  const prevThreadTailIdRef = useRef<string | null>(null);
  /** After local send, briefly ignore duplicate tail scrolls (not open-pin). */
  const stickSuppressUntilRef = useRef(0);
  /**
   * RN-web fires onStartReached on mount/send/layout. Only allow older-history
   * RPC after the user scrolls up from the bottom toward the top.
   */
  const allowLoadOlderRef = useRef(false);
  const sawBottomRef = useRef(false);
  const runLatestHistoryPageRef = useRef(runLatestHistoryPage);
  runLatestHistoryPageRef.current = runLatestHistoryPage;
  const pinThreadToEndRef = useRef<(animated?: boolean) => void>(() => {});

  const onStartReachedLoadOlder = useCallback(() => {
    if (needsOpenPinRef.current) return;
    if (Date.now() < stickSuppressUntilRef.current) return;
    if (!allowLoadOlderRef.current) return;
    if (olderStartDebounceRef.current) return;
    const convIdWhenScheduled = liveConvRef.current.id;
    olderStartDebounceRef.current = setTimeout(() => {
      olderStartDebounceRef.current = null;
      if (liveConvRef.current.id !== convIdWhenScheduled) return;
      if (!allowLoadOlderRef.current) return;
      void loadOlderHistoryPage();
    }, 400);
  }, [loadOlderHistoryPage]);

  const onThreadScroll = useCallback(
    (e: {
      nativeEvent: {
        contentOffset: { y: number };
        contentSize: { height: number };
        layoutMeasurement: { height: number };
      };
    }) => {
      if (needsOpenPinRef.current) return;
      const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
      const y = contentOffset.y;
      const distanceFromBottom =
        contentSize.height - layoutMeasurement.height - y;
      if (distanceFromBottom < 180) {
        sawBottomRef.current = true;
        return;
      }
      // User moved up from the bottom toward older messages.
      if (sawBottomRef.current && y <= 160) {
        allowLoadOlderRef.current = true;
      }
    },
    [],
  );

  useEffect(
    () => () => {
      historyFetchGenerationRef.current += 1;
      latestHistoryInFlightRef.current = false;
      if (olderStartDebounceRef.current) {
        clearTimeout(olderStartDebounceRef.current);
        olderStartDebounceRef.current = null;
      }
    },
    [],
  );

  useEffect(() => {
    historyFetchGenerationRef.current += 1;
    latestHistoryInFlightRef.current = false;
    latestHistoryFetchedForRef.current = null;
    needsOpenPinRef.current = true;
    prevThreadTailIdRef.current = null;
    stickSuppressUntilRef.current = 0;
    allowLoadOlderRef.current = false;
    sawBottomRef.current = false;
    setHistoryLoading(false);
    setHistoryError(null);
    setHasMoreOlder((liveConv.messages?.length ?? 0) >= TRIP_CHAT_HISTORY_PAGE);
    olderInFlightRef.current = false;
    if (olderStartDebounceRef.current) {
      clearTimeout(olderStartDebounceRef.current);
      olderStartDebounceRef.current = null;
    }
  }, [liveConv.id]);

  const pinThreadToEnd = useCallback((animated = false) => {
    const list = messagesRef.current;
    if (!list) return;
    try {
      list.scrollToEnd({ animated });
      // RN-web often ignores the first scrollToEnd before layout finishes.
      list.scrollToOffset?.({ offset: 1_000_000, animated });
    } catch {
      // ignore
    }
  }, []);
  pinThreadToEndRef.current = pinThreadToEnd;

  // Always pull the newest page once per open conversation id.
  // Deps: only liveConv.id — do NOT re-run when send updates messages.
  useEffect(() => {
    if (latestHistoryFetchedForRef.current === liveConv.id) return;
    latestHistoryFetchedForRef.current = liveConv.id;
    const openedId = liveConv.id;
    void (async () => {
      await runLatestHistoryPageRef.current();
      if (liveConvRef.current.id !== openedId) return;
      const conv = chatStore.getConversation(openedId);
      if (!conv) {
        needsOpenPinRef.current = true;
        requestAnimationFrame(() => pinThreadToEndRef.current(false));
        return;
      }
      const denormMs = conv.last_message_at
        ? Date.parse(conv.last_message_at)
        : 0;
      const last = conv.messages[conv.messages.length - 1];
      const laneMs = last?.created_at ? Date.parse(last.created_at) : 0;
      if (Number.isFinite(denormMs) && denormMs > laneMs + 1_500) {
        latestHistoryInFlightRef.current = false;
        await runLatestHistoryPageRef.current();
      }
      if (liveConvRef.current.id !== openedId) return;
      needsOpenPinRef.current = true;
      requestAnimationFrame(() => {
        pinThreadToEndRef.current(false);
        setTimeout(() => pinThreadToEndRef.current(false), 64);
        setTimeout(() => {
          pinThreadToEndRef.current(false);
          needsOpenPinRef.current = false;
          sawBottomRef.current = true;
        }, 180);
      });
    })();
  }, [liveConv.id]);

  // ── useMarkSeen: viewport-based per-message seen tracking ─────────────────
  const { onViewableItemsChanged, viewabilityConfig } = useMarkSeen({
    conversationId: liveConv.id,
    selfUid,
  });

  const hasTripIndent =
    Boolean(String(liveConv.indent_id ?? "").trim()) ||
    Boolean(liveTripEntry?.indentId && String(liveTripEntry.indentId).trim());
  const tripIsIntegrated =
    liveTripEntry?.chatFlow === "integrated_group" ||
    liveConv.conversation_type === "integrated_group" ||
    hasTripIndent;

  const viewerIsDriver = profile?.role === "driver";
  const allowFinancialCards = !viewerIsDriver;
  const integratedIndentCommercialLane = useMemo(
    () =>
      hasTripIndent &&
      tripIsIntegrated &&
      (liveConv.party_type === "client" || liveConv.party_type === "supplier"),
    [
      hasTripIndent,
      tripIsIntegrated,
      liveConv.party_type,
      liveTripEntry?.chatFlow,
      liveConv.conversation_type,
    ],
  );
  const allowLedgerActions = allowFinancialCards && integratedIndentCommercialLane;

  const tripCompose = useMemo(
    () => composeTrips.find((t) => t.id === liveConv.trip_id) ?? null,
    [composeTrips, liveConv.trip_id],
  );

  const { data: assignmentAuditRows = [] } = useTripAssignmentAuditHistoryQuery(
    liveConv.trip_id,
  );
  const assignmentAuditMaps = useAssignmentAuditNameMaps(
    liveConv.trip_organization_id ?? liveConv.organization_id ?? currentOrgId,
    assignmentAuditRows,
    {
      driver_display_name:
        tripCompose?.driver_display_name ?? liveTripEntry?.driverDisplayName ?? null,
      vehicle_display_number: liveTripEntry?.vehicleDisplayNumber ?? null,
    },
  );

  const displayMessages = useMemo(
    () => {
      const base = dedupeTripStatusBroadcastsForLane(
        liveConv.messages,
        liveConv.id,
      )
        .filter(
          (m) =>
            m.message_type !== "feedback_request" && m.message_type !== "feedback",
        )
        .filter((m) => String(m.conversation_id ?? "") === liveConv.id);
      return mergeAssignmentAuditIntoTripMessages(
        base,
        assignmentAuditRows,
        liveConv.id,
        liveConv.organization_id,
        assignmentAuditMaps,
        {
          driver_display_name:
            tripCompose?.driver_display_name ?? liveTripEntry?.driverDisplayName ?? null,
          vehicle_display_number: liveTripEntry?.vehicleDisplayNumber ?? null,
        },
      );
    },
    [
      liveConv.trip_id,
      liveConv.id,
      liveConv.messages,
      liveConv.organization_id,
      assignmentAuditRows,
      assignmentAuditMaps,
      tripCompose?.driver_display_name,
      liveTripEntry?.driverDisplayName,
      liveTripEntry?.vehicleDisplayNumber,
    ],
  );

  const alreadySentPaths = useMemo(
    () =>
      displayMessages
        .filter((m) => m.message_type === "document_share")
        .map((m) => (m.metadata as { storage_path?: string } | undefined)?.storage_path ?? "")
        .filter(Boolean),
    [displayMessages],
  );

  /**
   * WhatsApp-style ping collapsing: consecutive location pings in a run are collapsed into ONE card.
   * Maps each message ID → { isLast: whether it's the last ping in a consecutive run, runCount: total in run }.
   * Non-last pings are hidden; the last one shows the consolidated count.
   */
  const locationPingRunInfo = useMemo(() => {
    const info = new Map<string, { isLast: boolean; runCount: number }>();
    const isLocationPing = (m: TripMessageRow) => isLocationPingMessage(m);

    let runIds: string[] = [];
    const flushRun = () => {
      if (runIds.length === 0) return;
      const count = runIds.length;
      runIds.forEach((id, idx) => info.set(id, { isLast: idx === count - 1, runCount: count }));
      runIds = [];
    };
    for (const m of displayMessages) {
      if (isLocationPing(m)) {
        runIds.push(m.id);
      } else {
        flushRun();
      }
    }
    flushRun();
    return info;
  }, [displayMessages]);

  const slackTripGroupMeta = useMemo(
    () =>
      buildSlackMessageGroupMap(displayMessages, {
        isGroupable: (m) =>
          isSlackGroupableTripMessage(m) &&
          isMessageVisibleInTab(m.message_type, liveConv.party_type),
        senderKey: (m) =>
          isMessageFromSelf(m)
            ? "__self__"
            : `${m.sender_role ?? ""}:${m.sender_user_id ?? ""}:${m.sender_name ?? ""}`,
        createdAt: (m) => m.created_at,
      }),
    [displayMessages, liveConv.party_type, isMessageFromSelf],
  );

  const mediaBurstIndex = useMemo(
    () =>
      buildChatMediaBurstIndex(displayMessages, {
        senderKey: (m) =>
          isMessageFromSelf(m)
            ? "__self__"
            : `${m.sender_role ?? ""}:${m.sender_user_id ?? ""}:${m.sender_name ?? ""}`,
      }),
    [displayMessages, isMessageFromSelf],
  );

  const threadStreamFingerprint = useMemo(() => {
    const last = displayMessages[displayMessages.length - 1];
    // Prefer client_key so optimistic→persisted id swap does not thrash FlatList.
    const stable =
      (last as { client_key?: string | null } | undefined)?.client_key ??
      last?.id ??
      "";
    return `${liveConv.id}:${displayMessages.length}:${stable}:${last?.delivery_status ?? ""}`;
  }, [liveConv.id, displayMessages]);

  // ── Slack-style: emoji reactions ─────────────────────────────────────
  const handleToggleReaction = useCallback(
    async (message: TripMessageRow, emoji: string) => {
      if (!selfUid) return;
      const messageOrgId = String(message.organization_id ?? "").trim();
      if (!messageOrgId) return;

      const convId = String(message.conversation_id ?? liveConv.id).trim();
      if (!convId) return;

      const prevReactions = message.reactions ?? {};
      const optimistic = toggleReactionOptimistic(prevReactions, emoji, selfUid);
      chatStore.patchMessage(convId, message.id, { reactions: optimistic });

      try {
        const updated = await toggleMessageReaction({
          messageId:      message.id,
          userId:         selfUid,
          organizationId: messageOrgId,
          emoji,
        });
        chatStore.patchMessage(convId, message.id, {
          reactions: updated as Record<string, string[]>,
        });
      } catch {
        chatStore.patchMessage(convId, message.id, { reactions: prevReactions });
      }
    },
    [selfUid, liveConv.id],
  );

  const handleEditMessage = useCallback(
    async (messageId: string, newContent: string) => {
      try {
        await updateChatMessageContent(messageId, newContent);
      } catch {
        // Non-critical
      }
    },
    [],
  );

  const handleDeleteMessage = useCallback(
    async (messageId: string) => {
      try {
        await deleteChatMessage(messageId);
      } catch {
        // Non-critical
      }
    },
    [],
  );

  // ── Slack-style: date dividers in message list ──────────────────────
  type ThreadListItem =
    | TripMessageRow
    | { __dateDivider: true; dateStr: string; id: string }
    | { __unreadDivider: true; id: string };

  const threadListItems = useMemo((): ThreadListItem[] => {
    const items: ThreadListItem[] = [];
    let lastDateStr = "";
    const mountMs = Date.now() - 5_000; // treat messages < 5s old as "new"
    let unreadInserted = false;

    for (const m of displayMessages) {
      const msgDate = m.created_at ? m.created_at.slice(0, 10) : "";

      // Date divider
      if (msgDate && msgDate !== lastDateStr) {
        items.push({
          __dateDivider: true,
          dateStr: m.created_at,
          id: `__date__${msgDate}`,
        });
        lastDateStr = msgDate;
      }

      // Unread divider: insert before first unread message we haven't seen
      if (
        !unreadInserted &&
        !m.is_read &&
        !isMessageFromSelf(m) &&
        Date.parse(m.created_at) > mountMs
      ) {
        items.push({ __unreadDivider: true, id: "__unread__" });
        unreadInserted = true;
      }

      if (mediaBurstIndex.skipIds.has(m.id)) continue;

      items.push(m);
    }
    return items;
  }, [displayMessages, isMessageFromSelf, mediaBurstIndex.skipIds]);

  // During open pin, follow content-size growth so newest rows aren't left below the fold.
  const onMessagesContentSizeChange = useCallback(() => {
    if (!needsOpenPinRef.current) return;
    pinThreadToEnd(false);
  }, [pinThreadToEnd]);

  // Stable across optimistic→persisted so id swap does not re-trigger scroll.
  const threadTailStableKey = (() => {
    const last = displayMessages[displayMessages.length - 1];
    if (!last) return null;
    return (
      (last as { client_key?: string | null }).client_key ?? last.id ?? null
    );
  })();

  useEffect(() => {
    const prevTail = prevThreadTailIdRef.current;
    prevThreadTailIdRef.current = threadTailStableKey;
    if (!threadTailStableKey || threadTailStableKey === prevTail) {
      return;
    }
    // Open / history catch-up: always pin (do not let send-suppress block this).
    if (needsOpenPinRef.current || prevTail == null) {
      requestAnimationFrame(() => pinThreadToEnd(false));
      return;
    }
    if (Date.now() < stickSuppressUntilRef.current) return;

    const isOptimistic = String(threadTailStableKey).startsWith("optimistic-");
    if (isOptimistic) {
      stickSuppressUntilRef.current = Date.now() + 2_000;
      allowLoadOlderRef.current = false;
      // Already at bottom while composing — skip scroll to avoid bottom flicker.
      return;
    }
    // Inbound (driver / other user): gentle pin once.
    const frame = requestAnimationFrame(() => {
      pinThreadToEnd(true);
    });
    return () => cancelAnimationFrame(frame);
  }, [threadTailStableKey, pinThreadToEnd]);

  const messageListLayout = useMemo(
    () => buildThreadListLayoutMeta(threadListItems, liveConv.party_type),
    [threadListItems, liveConv.party_type],
  );

  const getMessageItemLayout = useCallback(
    (_data: ArrayLike<ThreadListItem> | null | undefined, index: number) =>
      messageListLayout.getItemLayout(index),
    [messageListLayout],
  );

  const quickMsgs = QUICK_MESSAGES[liveConv.party_type];
  const PARTY_ORDER: ConversationPartyType[] = ["client", "supplier", "driver"];
  // useConversationsByTrip returns all lanes for this trip from the singleton store.
  const sameTripConversations = useConversationsByTrip(liveConv.trip_id);
  const partyConversationMap = PARTY_ORDER.reduce((acc, partyType) => {
    acc[partyType] = sameTripConversations.find((conv) => conv.party_type === partyType) ?? null;
    return acc;
  }, {} as Record<ConversationPartyType, TripConversation | null>);

  const clientId =
    partyConversationMap.client?.client_id ?? tripCompose?.client_id ?? null;
  const supplierId =
    partyConversationMap.supplier?.supplier_id ??
    tripCompose?.supplier_id ??
    liveConv.trip_supplier_id ??
    null;
  const driverId =
    partyConversationMap.driver?.driver_id ??
    liveConv.trip_driver_id ??
    tripCompose?.driver_id ??
    null;

  const detailVisiblePartyTypes = useMemo(
    () => {
      const hasClient = Boolean(String(clientId ?? "").trim()) || Boolean(partyConversationMap.client);
      const hasSupplier =
        Boolean(String(supplierId ?? "").trim()) || Boolean(partyConversationMap.supplier);
      const hasDriver = Boolean(String(driverId ?? "").trim()) || Boolean(partyConversationMap.driver);

      if (!tripIsIntegrated) {
        return hasDriver ? (["driver"] as ConversationPartyType[]) : [];
      }

      // Integrated trips: driver + exactly 1 commercial party (max 2 tabs total).
      const isDetailLinkedSupplier =
        Boolean(partyConversationMap.supplier) &&
        viewerIsLinkedTripSupplierViewer({
          supplierLanePartyName: partyConversationMap.supplier?.party_name,
          viewerOrgId: currentOrgId,
          viewerOrgName: currentOrganization?.name ?? null,
          tripHostOrgId: liveConv.trip_organization_id ?? liveConv.organization_id,
          composeSupplierLinkedOrgId: tripCompose?.supplier_linked_organization_id ?? null,
        });
      const isDetailLinkedClient =
        Boolean(partyConversationMap.client) &&
        viewerIsLinkedTripClientViewer({
          clientLanePartyName: partyConversationMap.client?.party_name,
          viewerOrgId: currentOrgId,
          viewerOrgName: currentOrganization?.name ?? null,
          tripHostOrgId: liveConv.trip_organization_id ?? liveConv.organization_id,
          composeClientLinkedOrgId: tripCompose?.client_linked_organization_id ?? null,
        });

      // Linked supplier (external carrier) → their own lane.
      // Linked client (shipper) → supplier lane (sees carrier, not themselves).
      // Fleet owner (trip creator) → client lane (the shipper who originated the load).
      // applyContractualHubPartyIsolation strips "client" entry for client-org viewers.
      const commercial: ConversationPartyType | null = isDetailLinkedSupplier
        ? (hasSupplier ? "supplier" : null)
        : isDetailLinkedClient
          ? (hasSupplier ? "supplier" : null)
          : (hasClient ? "client" : hasSupplier ? "supplier" : null);

      const base: ConversationPartyType[] = [
        ...(commercial ? [commercial] : []),
        ...(hasDriver ? (["driver"] as ConversationPartyType[]) : []),
      ];

      return applyContractualHubPartyIsolation(base, {
        viewerOrgId: currentOrgId,
        lanes: sameTripConversations,
        tripIntegrated: tripIsIntegrated,
        viewerIsLinkedSupplier: isDetailLinkedSupplier,
      });
    },
    [
      tripIsIntegrated,
      clientId,
      supplierId,
      driverId,
      partyConversationMap.client,
      partyConversationMap.supplier,
      partyConversationMap.driver,
      currentOrgId,
      currentOrganization?.name,
      liveConv.trip_organization_id,
      liveConv.organization_id,
      tripCompose?.supplier_linked_organization_id,
      tripCompose?.client_linked_organization_id,
      sameTripConversations,
    ],
  );

  const linkedClientSuppressClientTab = useMemo(
    () =>
      Boolean(partyConversationMap.client) &&
      viewerIsLinkedTripClientViewer({
        clientLanePartyName: partyConversationMap.client?.party_name,
        viewerOrgId: currentOrgId,
        viewerOrgName: currentOrganization?.name ?? null,
        tripHostOrgId: liveConv.trip_organization_id ?? liveConv.organization_id,
        composeClientLinkedOrgId: tripCompose?.client_linked_organization_id ?? null,
      }),
    [
      partyConversationMap.client,
      currentOrgId,
      currentOrganization?.name,
      liveConv.trip_organization_id,
      liveConv.organization_id,
      tripCompose?.client_linked_organization_id,
    ],
  );

  const linkedSupplierSuppressSupplierTab = useMemo(
    () =>
      Boolean(partyConversationMap.supplier) &&
      viewerIsLinkedTripSupplierViewer({
        supplierLanePartyName: partyConversationMap.supplier?.party_name,
        viewerOrgId: currentOrgId,
        viewerOrgName: currentOrganization?.name ?? null,
        tripHostOrgId: liveConv.trip_organization_id ?? liveConv.organization_id,
        composeSupplierLinkedOrgId: tripCompose?.supplier_linked_organization_id ?? null,
      }),
    [
      partyConversationMap.supplier,
      currentOrgId,
      currentOrganization?.name,
      liveConv.trip_organization_id,
      liveConv.organization_id,
      tripCompose?.supplier_linked_organization_id,
    ],
  );

  const missionBarPartyTypes = useMemo((): HubPartyTab[] => {
    let rows = detailVisiblePartyTypes;
    // Client viewer hides their own "client" tab (they are the client — redundant self).
    if (linkedClientSuppressClientTab) rows = rows.filter((p) => p !== "client");
    // Supplier viewer: keep "supplier" tab but relabel it as "CLIENT" — from the carrier's
    // perspective this lane is communication with the indent owner (their client).
    return rows.map((p): HubPartyTab => {
      if (p === "supplier" && linkedSupplierSuppressSupplierTab) return { rowType: "supplier", displayType: "client" };
      return { rowType: p, displayType: p };
    });
  }, [
    linkedClientSuppressClientTab,
    linkedSupplierSuppressSupplierTab,
    detailVisiblePartyTypes,
  ]);
  const _partyToggleTabs = useMemo((): HubPartyTab[] => {
    const deduped = missionBarPartyTypes.filter(
      (tab, idx, arr) => arr.findIndex((p) => p.rowType === tab.rowType) === idx,
    );
    if (deduped.length <= 2) return deduped;

    const active = deduped.find((tab) => tab.rowType === liveConv.party_type);
    const driver = deduped.find((tab) => tab.rowType === "driver");
    const commercial = deduped.find((tab) => tab.rowType !== "driver");

    // Integrated detail should remain a compact two-party toggle.
    if (active && driver && commercial) {
      if (active.rowType === "driver") return [commercial, driver];
      return [active, driver];
    }
    if (active) {
      const secondary = deduped.find((tab) => tab.rowType !== active.rowType);
      return secondary ? [active, secondary] : [active];
    }
    return deduped.slice(0, 2);
  }, [missionBarPartyTypes, liveConv.party_type]);

  const teamTabEligible = isTripTeamRoomTabEligible(missionBarPartyTypes);
  const [activeDetailTab, setActiveDetailTab] = useState<string>(liveConv.party_type);

  useEffect(() => {
    setActiveDetailTab(liveConv.party_type);
  }, [liveConv.trip_id, liveConv.party_type]);

  useEffect(() => {
    if (isTripDetailTeamTab(activeDetailTab) && !teamTabEligible) {
      setActiveDetailTab(liveConv.party_type);
    }
  }, [teamTabEligible, activeDetailTab, liveConv.party_type]);

  const isTeamDetailTab = isTripDetailTeamTab(activeDetailTab);

  const displayPartyName = useCallback(
    (partyType: ConversationPartyType): string => {
      const conv = partyConversationMap[partyType];
      return (
        resolveChatPartyDisplayName(partyType, conv?.party_name, tripCompose) ?? ""
      );
    },
    [partyConversationMap, tripCompose],
  );


  const switchConversation = async (partyType: ConversationPartyType) => {
    setActiveDetailTab(partyType);
    // Always persist the active party selection immediately.
    chatStore.switchParty(liveConv.trip_id, partyType);

    const target = partyConversationMap[partyType];
    if (target) {
      onSelectConversation(target.id);
      void markTripThreadsRead(liveConv.trip_id);
      return;
    }

    // Create-on-demand: party entity known but conversation not yet started.
    const partyRow = getComposePartyRows(
      tripCompose ?? {
        id: liveConv.trip_id,
        trip_number: liveConv["trip_number"],
        display_trip_id: liveConv["display_trip_id"] ?? null,
        pickup_area: liveConv.pickup_area,
        drop_location: liveConv.drop_location,
        status: liveConv.trip_status ?? "active",
        client_id: clientId ?? null,
        client_name: null,
        client_linked_organization_id: null,
        supplier_id: supplierId ?? null,
        supplier_name: null,
        supplier_linked_organization_id: null,
        driver_id: driverId ?? null,
        driver_display_name: null,
        created_at: liveConv.trip_created_at ?? null,
      } as TripForCompose,
    ).find((r) => r.kind === "selectable" && r.partyType === partyType);

    if (!partyRow || partyRow.kind !== "selectable") return;

    const convId = await initiateConversation({
      tripId: liveConv.trip_id,
      tripNumber: getTripOperationalDisplay({
        display_trip_id: liveConv["display_trip_id"] ?? null,
        trip_number: liveConv["trip_number"] ?? null,
      }),
      pickupArea: liveConv.pickup_area,
      dropLocation: liveConv.drop_location,
      partyType,
      partyName: partyRow.name,
      partyId: partyRow.id,
    });
    if (convId) {
      onSelectConversation(convId);
      void markTripThreadsRead(liveConv.trip_id);
    }
  };

  const selectDetailTab = useCallback(
    (tabId: string) => {
      if (tabId === TRIP_DETAIL_TEAM_TAB_ID) {
        if (!teamTabEligible) return;
        setActiveDetailTab(TRIP_DETAIL_TEAM_TAB_ID);
        return;
      }
      void switchConversation(tabId as ConversationPartyType);
    },
    [teamTabEligible, switchConversation],
  );

  useEffect(() => {
    const clientLaneInMissionBar = missionBarPartyTypes.some((t) => t.rowType === "client");
    if (
      linkedClientSuppressClientTab &&
      liveConv.party_type === "client" &&
      !clientLaneInMissionBar
    ) {
      const s = partyConversationMap.supplier;
      const d = partyConversationMap.driver;
      const target = s ?? d;
      const targetParty = s ? "supplier" : "driver";
      if (target?.id) {
        chatStore.switchParty(liveConv.trip_id, targetParty);
        onSelectConversation(target.id);
        void markTripThreadsRead(liveConv.trip_id);
      }
      return;
    }
    const supplierLaneInMissionBar = missionBarPartyTypes.some((t) => t.rowType === "supplier");
    if (
      linkedSupplierSuppressSupplierTab &&
      liveConv.party_type === "supplier" &&
      !supplierLaneInMissionBar
    ) {
      const c = partyConversationMap.client;
      const d = partyConversationMap.driver;
      const target = c ?? d;
      const targetParty = c ? "client" : "driver";
      if (target?.id) {
        chatStore.switchParty(liveConv.trip_id, targetParty);
        onSelectConversation(target.id);
        void markTripThreadsRead(liveConv.trip_id);
      }
    }
  }, [
    linkedClientSuppressClientTab,
    linkedSupplierSuppressSupplierTab,
    missionBarPartyTypes,
    liveConv.trip_id,
    liveConv.party_type,
    partyConversationMap.supplier?.id,
    partyConversationMap.client?.id,
    partyConversationMap.driver?.id,
    onSelectConversation,
    markTripThreadsRead,
  ]);

  const missionDateLabel = formatTripRouteDate(liveConv.trip_created_at);

  const tripMeta = useTripMeta(liveConv.trip_id, currentOrgId, {
    partyType:        liveConv.party_type,
    conversationId: liveConv.id,
  });
  const paymentBalance = tripMeta?.payment_balance ?? null;

  const longHaulLiveEta = useChatStore((s) => s.trips[liveConv.trip_id]?.longHaulRevisedEta ?? null);
  const longHaulLiveHealth = useChatStore((s) => s.trips[liveConv.trip_id]?.longHaulHealthStatus ?? null);

  const primaryLateMessageId = useMemo(() => {
    for (const row of displayMessages) {
      if (isLongHaulLateChatMessage(row)) return row.id;
    }
    return null;
  }, [displayMessages]);

  // Timestamp captured once at mount. Messages created after this instant
  // arrived via Realtime and get the slide-in animation; bootstrap messages do not.
  const mountedAtMs = useRef(Date.now()).current;

  // FlatList requires onViewableItemsChanged to be stable after mount.
  // This ref-backed wrapper lets us always call the latest version without
  // triggering the "changing onViewableItemsChanged after mount" warning.
  const _viewableRef = useRef(onViewableItemsChanged);
  _viewableRef.current = onViewableItemsChanged;
  const stableOnViewableItemsChanged = useRef(
    (info: Parameters<typeof onViewableItemsChanged>[0]) => _viewableRef.current(info)
  ).current;

  const renderMessage = useCallback(({ item }: { item: ThreadListItem }) => {
    // ── Virtual dividers ─────────────────────────────────────────────
    if ("__dateDivider" in item && item.__dateDivider) {
      return (
        <ChatDateDivider
          dateStr={item.dateStr}
          variant={isDesktop ? "desktop" : "mobile"}
        />
      );
    }
    if ("__unreadDivider" in item && item.__unreadDivider) {
      return <ChatUnreadDivider />;
    }

    const m = item as TripMessageRow;
    if (String(m.conversation_id ?? "") !== liveConv.id) return null;
    // Tab visibility filter — zero DB calls; pure memory filter on party_type.
    // Ledger events only appear in Client/Supplier tabs; tracking in Driver tab.
    if (!isMessageVisibleInTab(m.message_type, liveConv.party_type)) return null;

    const routeContext = buildChatRouteContextLabel(
      liveConv.pickup_area,
      liveConv.drop_location,
      m.created_at,
    );

    const burstLeader = mediaBurstIndex.leaders.get(m.id);
    if (burstLeader) {
      const own = isMessageFromSelf(m);
      const peerLabel =
        m.sender_name?.trim() ||
        (m.sender_role === "dispatcher"
          ? "Dispatcher"
          : m.sender_role === "client"
            ? "Client"
            : m.sender_role === "supplier"
              ? "Supplier"
              : m.sender_role === "driver"
                ? "Driver"
                : partyLabelReadable(liveConv.party_type));
      let onAvatarPress: (() => void) | undefined;
      if (!own) {
        if (m.sender_role === "client" && clientId) {
          onAvatarPress = () => router.push(`/public-profile/client/${clientId}`);
        } else if (m.sender_role === "supplier" && supplierId) {
          onAvatarPress = () => router.push(`/public-profile/supplier/${supplierId}`);
        } else if (m.sender_role === "driver" && driverId) {
          onAvatarPress = () => router.push(`/public-profile/driver/${driverId}`);
        }
      }
      const peerAvatar = own
        ? null
        : resolveTripMessagePeerAvatar({
            message: m,
            conversationPartyType: liveConv.party_type,
            composeTrip: tripCompose,
            brandingMap: linkedOrgBranding,
            fallbackName: peerLabel,
            driverId,
            clientId,
            supplierId,
          });
      const tailMessage = burstLeader.messages[burstLeader.messages.length - 1] ?? m;
      const msgReactions = (tailMessage as { reactions?: ChatReactions | null }).reactions;
      const msgReplyPreview = (tailMessage as { reply_to_preview?: ReplyPreviewData | null })
        .reply_to_preview;
      const burstIsNew = burstLeader.messages.some(
        (msg) => Date.parse(msg.created_at) > mountedAtMs,
      );

      return (
        <ChatMediaBurstRow
          burst={burstLeader}
          senderName={own ? selfName : peerLabel}
          timestamp={m.created_at}
          avatar={
            own
              ? { displayName: selfName, entityType: "client" }
              : peerAvatar ?? { displayName: peerLabel, entityType: "client" }
          }
          isOwn={own}
          userName={selfName}
          onAvatarPress={onAvatarPress}
          variant={isDesktop ? "desktop" : "mobile"}
          group={slackTripGroupMeta.get(m.id)}
          reactions={msgReactions}
          selfUserId={selfUid}
          onReact={(emoji) => handleToggleReaction(tailMessage, emoji)}
          replyPreview={msgReplyPreview}
          isNew={burstIsNew}
        />
      );
    }

    if (m.message_type === "tracking") {
      const trackLoc = parseMessageLocationData(m);
      if (trackLoc) {
        return (
          <ChatLocationSystemCard
            message={m}
            location={trackLoc}
            isMobile={!isDesktop}
            tripHint={{
              pickupArea: liveConv.pickup_area,
              dropLocation: liveConv.drop_location,
              status: liveConv.trip_status,
            }}
            composeTrip={tripCompose}
            conversationDriverId={
              liveConv.driver_id ?? tripCompose?.driver_id ?? null
            }
          />
        );
      }
    }
    if (m.message_type === "status_change" || m.message_type === "image") {
      return (
        <SystemEventCard
          message={m}
          isOwn={isMessageFromSelf(m)}
          currentOrgId={currentOrgId}
          conversationPartyName={liveConv.party_name}
          onAddToBook={onAddToBook}
          onDispute={onDispute}
          financialViewerBlocked={!allowFinancialCards}
          hideLedgerActions={!allowLedgerActions}
          isMobile={!isDesktop}
          routeContext={routeContext}
          composeTrip={tripCompose}
        />
      );
    }
    if (m.message_type === "assignment_update") {
      return (
        <ChatSystemEventCard
          message={m}
          isMobile={!isDesktop}
          routeContext={routeContext}
          composeTrip={tripCompose}
          driverProfiles={assignmentAuditMaps.driverProfiles}
        />
      );
    }
    if (
      m.message_type === "system" ||
      m.message_type === "update" ||
      m.message_type === "system_log" ||
      m.message_type === "location_log"
    ) {
      if (isLongHaulLateChatMessage(m)) {
        if (primaryLateMessageId != null && m.id !== primaryLateMessageId) return null;
        return (
          <LateAlertCard
            message={m}
            liveRevisedEta={longHaulLiveEta}
            liveHealthStatus={longHaulLiveHealth}
            tripPlan={{
              distance: tripCompose?.distance ?? null,
              startedAt: tripCompose?.started_at ?? null,
              pickupAt: tripCompose?.pickup_date ?? null,
              createdAt:
                tripCompose?.created_at ?? liveConv.trip_created_at ?? null,
            }}
          />
        );
      }
      const locData = parseMessageLocationData(m);
      if (locData) {
        // Driver sees their own pings as system updates on the business side — hide from their view.
        if (viewerIsDriver) return null;
        // Collapse consecutive ping runs: skip non-last pings; show last with count badge.
        const pingInfo = locationPingRunInfo.get(m.id);
        if (pingInfo && !pingInfo.isLast) return null;
        return (
          <ChatLocationSystemCard
            message={m}
            location={locData}
            isMobile={!isDesktop}
            consolidatedCount={pingInfo?.runCount ?? 1}
            tripHint={{
              pickupArea: liveConv.pickup_area,
              dropLocation: liveConv.drop_location,
              status: liveConv.trip_status,
            }}
            composeTrip={tripCompose}
            conversationDriverId={
              liveConv.driver_id ?? tripCompose?.driver_id ?? null
            }
          />
        );
      }
      return (
        <ChatSystemEventCard
          message={m}
          isMobile={!isDesktop}
          routeContext={routeContext}
          composeTrip={tripCompose}
        />
      );
    }
    if (
      m.message_type === "ledger_event" ||
      m.message_type === "ledger" ||
      m.message_type === "payment" ||
      m.message_type === "ledger_update"
    ) {
      if (!allowFinancialCards) return null;
      if (!ledgerEventInvolvesOrg(m, currentOrgId)) return null;
      return (
        <ChatLedgerEventCard
          message={m}
          currentOrgId={currentOrgId}
          conversationPartyName={liveConv.party_name}
          onAddToBook={onAddToBook}
          onDispute={onDispute}
          hideLedgerActions={!allowLedgerActions}
          isMobile={!isDesktop}
        />
      );
    }
    if (m.is_deleted) {
      return (
        <View style={s.deletedMsgWrap}>
          <Text style={s.deletedMsgText}>This message was deleted.</Text>
        </View>
      );
    }
    if (m.message_type === "document_share") {
      return <DocumentShareCard message={m} isOwn={isMessageFromSelf(m)} />;
    }
    const own = isMessageFromSelf(m);
    const peerLabel =
      m.sender_name?.trim() ||
      (m.sender_role === "dispatcher"
        ? "Dispatcher"
        : m.sender_role === "client"
          ? "Client"
          : m.sender_role === "supplier"
            ? "Supplier"
            : m.sender_role === "driver"
              ? "Driver"
              : partyLabelReadable(liveConv.party_type));
    let onAvatarPress: (() => void) | undefined;
    if (!own) {
      if (m.sender_role === "client" && clientId) {
        onAvatarPress = () => router.push(`/public-profile/client/${clientId}`);
      } else if (m.sender_role === "supplier" && supplierId) {
        onAvatarPress = () => router.push(`/public-profile/supplier/${supplierId}`);
      } else if (m.sender_role === "driver" && driverId) {
        onAvatarPress = () => router.push(`/public-profile/driver/${driverId}`);
      }
    }
    const peerAvatar = own
      ? null
      : resolveTripMessagePeerAvatar({
          message: m,
          conversationPartyType: liveConv.party_type,
          composeTrip: tripCompose,
          brandingMap: linkedOrgBranding,
          fallbackName: peerLabel,
          driverId,
          clientId,
          supplierId,
        });

    const msgReactions = (m as { reactions?: ChatReactions | null }).reactions;
    const msgReplyPreview = (m as { reply_to_preview?: ReplyPreviewData | null }).reply_to_preview;

    return (
      <ChatBubble
        isOwn={own}
        content={m.content}
        timestamp={m.created_at}
        senderName={own ? undefined : peerLabel}
        peerAvatar={peerAvatar}
        deliveryStatus={own ? resolveOutgoingDeliveryStatus(m) : undefined}
        isNew={!own && Date.parse(m.created_at) > mountedAtMs}
        isMobile={!isDesktop}
        slackLayout={isDesktop || isChatMobileLayout(isDesktop)}
        slackVariant={isDesktop ? "desktop" : "mobile"}
        slackGroup={slackTripGroupMeta.get(m.id)}
        onAvatarPress={onAvatarPress}
        reactions={msgReactions}
        selfUserId={selfUid}
        onReact={(emoji) => handleToggleReaction(m, emoji)}
        replyPreview={msgReplyPreview}
        onReply={() =>
          onSetReply?.({
            messageId: m.id,
            senderName: own ? selfName : peerLabel,
            content: m.content,
            messageType: m.message_type,
          })
        }
        isEdited={Boolean(m.edited_at)}
        onEdit={own ? (newContent) => handleEditMessage(m.id, newContent) : undefined}
        onDelete={own ? () => handleDeleteMessage(m.id) : undefined}
      />
    );
  }, [
    router,
    selfUid,
    selfName,
    handleToggleReaction,
    handleEditMessage,
    handleDeleteMessage,
    onSetReply,
    currentOrgId,
    liveConv,
    isDesktop,
    slackTripGroupMeta,
    viewerIsDriver,
    allowFinancialCards,
    allowLedgerActions,
    onAddToBook,
    onDispute,
    mountedAtMs,
    isMessageFromSelf,
    longHaulLiveEta,
    longHaulLiveHealth,
    primaryLateMessageId,
    displayMessages,
    clientId,
    supplierId,
    driverId,
    locationPingRunInfo,
    tripCompose,
    linkedOrgBranding,
    mediaBurstIndex.leaders,
    selfName,
    assignmentAuditMaps.driverProfiles,
  ]);

  const indentShipperDisplayName = useMemo(() => {
    const fromConv = (liveConv.indent_creator_organization_name ?? "").trim();
    if (fromConv) return fromConv;
    return (liveTripEntry?.indentCreatorOrganizationName ?? "").trim();
  }, [
    liveConv.indent_creator_organization_name,
    liveTripEntry?.indentCreatorOrganizationName,
  ]);
  const supplierFleetOwnsTrip =
    String(currentOrgId ?? "").trim() === String(liveConv.trip_organization_id ?? "").trim();

  // When viewer is linked supplier viewing the supplier lane, that lane IS their CLIENT
  // channel (with the indent owner / shipper). Prefer bootstrap indent_creator_organization_name
  // (same trip_number peer with indent) when mirror trip omits indent_id.
  const chatDetailSubtitle =
    linkedSupplierSuppressSupplierTab && liveConv.party_type === "supplier"
      ? (formatChatPartyName(
          indentShipperDisplayName || liveConv.trip_organization_name || null,
        ) ?? undefined)
      : formatChatPartyName(liveConv.party_name) ?? undefined;

  const viewerRelativeConvPartyLabel =
    linkedSupplierSuppressSupplierTab && liveConv.party_type === "supplier"
      ? "CLIENT"
      : partyLabel(liveConv.party_type);

  const partyTabIcon = (partyType: ConversationPartyType, selected: boolean) => (
    <View
      style={[s.detailPartyTabIconWrap, selected && s.detailPartyTabIconWrapOn]}
    >
      <PartyIcon
        partyType={partyType}
        active={selected}
        size={16}
        tone={selected ? "list" : "hub"}
      />
    </View>
  );

  const headerCounterparty = resolveCounterpartyPartyTypeForViewer(
    liveTripEntry,
    currentOrgId,
    liveConv.party_type,
  );

  const { keyboardVisible: keyboardOpen } = useKeyboardVisible();
  useEffect(() => {
    if (isDesktop || !keyboardOpen) return;
    const delay = Platform.OS === "ios" ? 80 : Platform.OS === "web" ? 50 : 120;
    const t = setTimeout(
      () => messagesRef.current?.scrollToEnd({ animated: true }),
      delay,
    );
    return () => clearTimeout(t);
  }, [isDesktop, keyboardOpen, messagesRef]);

  const nativeMobileDetail = isChatMobileLayout(isDesktop);
  const slackThreadUi = isDesktop || nativeMobileDetail;

  const detailMirrorTabItems = useMemo(() => {
    const partyItems = missionBarPartyTypes.map((tab) => {
      const relabeledClientTab = tab.displayType !== tab.rowType;
      const tabConversation = partyConversationMap[tab.rowType];
      const resolvedPartyName = resolveChatPartyDisplayName(
        tab.rowType,
        tabConversation?.party_name,
        tripCompose,
      );
      const partyLine = relabeledClientTab
        ? formatChatPartyName(
            indentShipperDisplayName || liveConv.trip_organization_name || null,
          )
        : tab.rowType === "client" &&
            supplierFleetOwnsTrip &&
            indentShipperDisplayName
          ? formatChatPartyName(indentShipperDisplayName)
          : formatChatPartyName(resolvedPartyName ?? displayPartyName(tab.rowType));
      const roleLabel =
        formatChatPartyInboxLine(tab.displayType, resolvedPartyName) ??
        partyLabelReadable(tab.displayType);
      const partyName = partyLine ?? roleLabel;
      const tabAvatarIdentity = resolveTripConversationAvatar(
        {
          party_type: tab.rowType,
          party_name: (tabConversation?.party_name ?? "").trim() || partyName,
          client_id: tabConversation?.client_id ?? liveConv.client_id ?? null,
          supplier_id: tabConversation?.supplier_id ?? liveConv.supplier_id ?? null,
          driver_id: tabConversation?.driver_id ?? liveConv.driver_id ?? null,
        },
        tripCompose,
        linkedOrgBranding,
        {
          viewerOrgId: currentOrgId,
          viewerOrgName: currentOrganization?.name ?? null,
          tripHostOrgId:
            liveConv.trip_organization_id ?? liveConv.organization_id ?? null,
        },
      );
      return {
        id: tab.rowType,
        label: partyName,
        avatarIdentity: tabAvatarIdentity,
        disabled: !partyConversationMap[tab.rowType],
      };
    });

    if (!teamTabEligible) return partyItems;

    return [
      ...partyItems,
      {
        id: TRIP_DETAIL_TEAM_TAB_ID,
        label: "Team",
        subLabel: "All parties",
        Icon: Users,
        disabled: false,
      },
    ];
  }, [
    missionBarPartyTypes,
    teamTabEligible,
    indentShipperDisplayName,
    liveConv.trip_organization_name,
    liveConv.client_id,
    liveConv.supplier_id,
    liveConv.driver_id,
    supplierFleetOwnsTrip,
    displayPartyName,
    partyConversationMap,
    tripCompose,
    linkedOrgBranding,
    currentOrgId,
    currentOrganization?.name,
  ]);

  const showDetailTabs = detailMirrorTabItems.length > 1;

  const tripPartyTabsScroller = showDetailTabs ? (
    slackThreadUi ? (
      <ChatSlackMirrorToggle
        variant="party"
        activeId={activeDetailTab}
        onSelect={selectDetailTab}
        items={detailMirrorTabItems}
        style={slackThreadUi && isDesktop ? deskSt.threadPartyToggle : undefined}
      />
    ) : (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={[
          s.detailMissionTabsScroller,
          !isDesktop && s.detailMissionTabsScrollerMobile,
        ]}
        contentContainerStyle={s.detailPartyTabs}
      >
        {detailMirrorTabItems.map((tab) => {
          const on = activeDetailTab === tab.id;
          const isTeam = tab.id === TRIP_DETAIL_TEAM_TAB_ID;
          const partyType = isTeam ? null : (tab.id as ConversationPartyType);
          const hasConversation = isTeam
            ? true
            : Boolean(partyConversationMap[partyType!]);
          const relabeledClientTab =
            partyType != null &&
            missionBarPartyTypes.find((t) => t.rowType === partyType)?.displayType !==
              partyType;
          const tabConversation =
            partyType != null ? partyConversationMap[partyType] : null;
          const resolvedPartyName =
            partyType != null
              ? resolveChatPartyDisplayName(
                  partyType,
                  tabConversation?.party_name,
                  tripCompose,
                )
              : null;
          const partyLine =
            partyType == null
              ? null
              : relabeledClientTab
                ? formatChatPartyName(
                    indentShipperDisplayName || liveConv.trip_organization_name || null,
                  )
                : partyType === "client" &&
                    supplierFleetOwnsTrip &&
                    indentShipperDisplayName
                  ? formatChatPartyName(indentShipperDisplayName)
                  : formatChatPartyName(
                      resolvedPartyName ?? displayPartyName(partyType),
                    );
          const partySecondLine = isTeam
            ? (tab.subLabel ?? "").trim() || null
            : null;
          const partyNameText = isTeam ? tab.label : partyLine;
          return (
            <TouchableOpacity
              key={tab.id}
              style={[
                s.detailPartyTab,
                partySecondLine ? s.detailPartyTabStacked : s.detailPartyTabSingle,
                on && s.detailPartyTabOn,
                !hasConversation && s.detailPartyTabOff,
              ]}
              onPress={() => selectDetailTab(tab.id)}
              activeOpacity={0.82}
            >
              {isTeam ? (
                <View
                  style={[s.detailPartyTabIconWrap, on && s.detailPartyTabIconWrapOn]}
                >
                  <Users size={16} color={on ? "#fff" : CHAT_ICON_MUTED} strokeWidth={2.2} />
                </View>
              ) : (
                partyTabIcon(partyType!, on)
              )}
              <View
                style={[
                  s.detailPartyTabTextCol,
                  partySecondLine
                    ? s.detailPartyTabTextColStacked
                    : s.detailPartyTabTextColSingle,
                ]}
              >
                {partyLine || isTeam ? (
                  <Text
                    style={[s.detailPartyTabName, on && s.detailPartyTabNameOn]}
                    numberOfLines={1}
                    ellipsizeMode="tail"
                  >
                    {partyNameText}
                  </Text>
                ) : null}
                {partySecondLine ? (
                  <Text
                    style={[
                      s.detailPartyTabText,
                      on && s.detailPartyTabTextOn,
                      !hasConversation && s.detailPartyTabTextOff,
                    ]}
                    numberOfLines={1}
                  >
                    {partySecondLine}
                  </Text>
                ) : null}
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    )
  ) : null;

  const tripHeaderMiddle = (
    <>
      {missionDateLabel ? (
        <Text style={s.detailMissionDate} numberOfLines={1}>
          {missionDateLabel}
        </Text>
      ) : null}
      {allowFinancialCards &&
      paymentBalance != null &&
      (liveConv.party_type === "client" || liveConv.party_type === "supplier") ? (
        <View style={s.detailMissionUnread}>
          <Text style={s.detailMissionUnreadText}>
            {paymentBalance >= 0 ? "+" : "−"}₹{Math.abs(paymentBalance).toLocaleString("en-IN")}
          </Text>
        </View>
      ) : null}
      {tripPartyTabsScroller}
    </>
  );

  const slackThreadTitle = isTeamDetailTab
    ? getConversationTripLabel(liveConv)
    : formatChatPartyName(liveConv.party_name) ||
      formatChatPartyName(displayPartyName(liveConv.party_type)) ||
      viewerRelativeConvPartyLabel;
  const activeLaneDisplayType =
    missionBarPartyTypes.find((tab) => tab.rowType === liveConv.party_type)?.displayType ??
    liveConv.party_type;
  const chatDetailPartyTypeLabel = isTeamDetailTab
    ? "Team room · all parties"
    : formatChatPartyInboxLine(
        activeLaneDisplayType,
        resolveChatPartyDisplayName(
          liveConv.party_type,
          liveConv.party_name,
          tripCompose,
        ),
      ) ?? chatDetailSubtitle;
  const slackThreadAvatarResolved = isTeamDetailTab
    ? resolveTripRoomDriverAvatar({
        driverId,
        title: getConversationTripLabel(liveConv),
        composeTrip: tripCompose,
      })
    : resolveTripConversationAvatar(liveConv, tripCompose, linkedOrgBranding, {
        viewerOrgId: currentOrgId,
        viewerOrgName: currentOrganization?.name ?? null,
        tripHostOrgId:
          liveConv.trip_organization_id ?? liveConv.organization_id ?? null,
      });
  const slackThreadAvatar = slackThreadAvatarResolved;

  return (
    <View style={s.detailDocHubShell}>
    <ChatConversationLayout
      isDesktop={isDesktop}
      header={
        <ChatDetailHeader
          title={
            slackThreadUi
              ? slackThreadTitle
              : `${getConversationTripLabel(liveConv)} · ${viewerRelativeConvPartyLabel}`
          }
          subtitle={chatDetailPartyTypeLabel}
          partyType={liveConv.party_type}
          counterpartyType={headerCounterparty}
          isDesktop={isDesktop}
          onCloseDetail={onCloseDetail}
          middleContent={slackThreadUi ? undefined : tripHeaderMiddle}
          slackAvatarIdentity={slackThreadUi ? slackThreadAvatar : undefined}
          slackPartyTabsRow={slackThreadUi ? tripPartyTabsScroller : undefined}
          slackCompactRoleTag={undefined}
          slackPartyDetailLabel={
            slackThreadUi ? chatDetailPartyTypeLabel : undefined
          }
        />
      }
      messages={
        isTeamDetailTab ? (
          <TripChatRoomSheet
            embedded
            chromeless
            visible
            tripId={liveConv.trip_id}
            tripLabel={getConversationTripLabel(liveConv)}
            composeTrip={tripCompose}
            organizationId={currentOrgId}
            onClose={() => setActiveDetailTab(liveConv.party_type)}
          />
        ) : (
          <FlatList<ThreadListItem>
            ref={messagesRef as React.RefObject<FlatList<ThreadListItem> | null>}
            style={s.msgs}
            contentContainerStyle={
              isDesktop
                ? deskSt.threadMsgsContent
                : [s.msgsContent, slackSt.threadMsgsContent]
            }
            data={threadListItems}
            keyExtractor={(item) => {
              if ("__dateDivider" in item || "__unreadDivider" in item) {
                return String(item.id);
              }
              const m = item as TripMessageRow & { client_key?: string | null };
              return String(m.client_key ?? m.id);
            }}
            renderItem={renderMessage}
            extraData={threadStreamFingerprint}
            // Desktop web: getItemLayout was previously keyed off displayMessages
            // while data included date dividers — wrong offsets hid newest bubbles.
            // Keep estimates only when lengths match data 1:1 (now threadListItems).
            getItemLayout={
              Platform.OS !== "web"
                ? (getMessageItemLayout as NonNullable<
                    React.ComponentProps<typeof FlatList<ThreadListItem>>["getItemLayout"]
                  >)
                : undefined
            }
            removeClippedSubviews={Platform.OS !== "web"}
            windowSize={!isDesktop ? 7 : 21}
            maxToRenderPerBatch={!isDesktop ? 10 : 24}
            initialNumToRender={!isDesktop ? 16 : 40}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            showsVerticalScrollIndicator={false}
            onViewableItemsChanged={stableOnViewableItemsChanged}
            viewabilityConfig={viewabilityConfig}
            onContentSizeChange={onMessagesContentSizeChange}
            onScroll={onThreadScroll}
            scrollEventThrottle={100}
            onStartReached={displayMessages.length > 0 ? onStartReachedLoadOlder : undefined}
            onStartReachedThreshold={0.05}
            ListHeaderComponent={
              <>
                <ChatSystemMsg
                  label={`${liveConv.pickup_area} → ${liveConv.drop_location} · Today`}
                  isMobile={!isDesktop}
                  slackLayout={slackThreadUi}
                  isDesktop={isDesktop}
                />
                {loadingOlder ? (
                  <View style={{ paddingVertical: 10, alignItems: "center" }}>
                    <LoadingIndicator size="small" color={CHAT_ACCENT} />
                    <Text style={{ marginTop: 6, fontSize: 11, color: "#94a3b8" }}>
                      Loading earlier messages…
                    </Text>
                  </View>
                ) : hasMoreOlder && displayMessages.length > 0 ? (
                  <View style={{ paddingVertical: 8, alignItems: "center" }}>
                    <TouchableOpacity
                      onPress={() => {
                        void loadOlderHistoryPage();
                      }}
                      hitSlop={{ top: 8, bottom: 8 }}
                      activeOpacity={0.75}
                    >
                      <Text style={{ fontSize: 12, color: CHAT_ACCENT, fontWeight: "600" }}>
                        Load earlier messages
                      </Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
                {displayMessages.length === 0 &&
                  (historyLoading ? (
                    <View style={{ alignItems: "center", paddingVertical: 32 }}>
                      <LoadingIndicator size="small" color={CHAT_ACCENT} />
                    </View>
                  ) : (
                    <View style={{ alignItems: "center", paddingVertical: 32, gap: 8 }}>
                      <Text style={{ fontSize: 13, color: "#94a3b8", fontStyle: "italic" }}>
                        No messages yet
                      </Text>
                      {historyError ? (
                        <Text
                          style={{
                            fontSize: 12,
                            color: "#b91c1c",
                            textAlign: "center",
                            paddingHorizontal: 20,
                            lineHeight: 17,
                            fontWeight: "600",
                          }}
                        >
                          {historyError}
                        </Text>
                      ) : null}
                    </View>
                  ))}
              </>
            }
            ListFooterComponent={
              <ChatHistoryExpiryNotice
                variant={isDesktop ? "desktop" : "mobile"}
                slackLayout={slackThreadUi}
              />
            }
          />
        )
      }
      inputBar={
        isTeamDetailTab ? null : (
        <>
          {/* Typing indicator — shown above the composer */}
          <ChatTypingIndicator
            typingNames={typingNames}
            variant={isDesktop ? "desktop" : "mobile"}
          />
          <ChatInputBar
            quickMsgs={quickMsgs}
            messageInput={messageInput}
            onChangeMessage={setMessageInput}
            showEmoji={showEmoji}
            setShowEmoji={setShowEmoji}
            showScripts={showScripts}
            setShowScripts={setShowScripts}
            onSend={onSend}
            onOpenDocShare={onOpenDocShare}
            inputOverlayMaxWidth={inputOverlayMaxWidth}
            compact={keyboardOpen}
            minimalChrome={!isDesktop}
            isDesktop={isDesktop}
            composerPlaceholder={`Message ${slackThreadTitle}`}
            replyContext={replyContext}
            onCancelReply={onCancelReply}
            onUserTyping={onUserTyping}
          />
        </>
        )
      }
    />
    <DocumentShareSheet
      visible={showDocShare}
      tripId={docHubTripId}
      vehicleId={docHubVehicleId}
      driverId={docHubDriverId}
      orgId={docHubOrgId}
      userId={docHubUserId}
      onClose={onCloseDocShare}
      onShare={onDocShare}
      alreadySentPaths={alreadySentPaths}
    />
    </View>
  );
}

function NetworkDetailPanel({
  selectedNet,
  resolveNetPartyType,
  messagesRef,
  messageInput,
  setMessageInput,
  showEmoji,
  setShowEmoji,
  showScripts,
  setShowScripts,
  onSend,
  isDesktop,
  inputOverlayMaxWidth,
  onCloseDetail,
}: {
  selectedNet: IntegratedChat | null;
  resolveNetPartyType: (chat: IntegratedChat) => "client" | "supplier" | undefined;
  messagesRef: React.RefObject<FlatList | null>;
  messageInput: string;
  setMessageInput: React.Dispatch<React.SetStateAction<string>>;
  showEmoji: boolean;
  setShowEmoji: React.Dispatch<React.SetStateAction<boolean>>;
  showScripts: boolean;
  setShowScripts: React.Dispatch<React.SetStateAction<boolean>>;
  onSend: () => void;
  isDesktop: boolean;
  inputOverlayMaxWidth: number;
  onCloseDetail: () => void;
}) {
  const { keyboardVisible: keyboardOpen } = useKeyboardVisible();
  useEffect(() => {
    if (isDesktop || !keyboardOpen) return;
    const delay = Platform.OS === "ios" ? 80 : Platform.OS === "web" ? 50 : 120;
    const t = setTimeout(
      () => messagesRef.current?.scrollToEnd({ animated: true }),
      delay,
    );
    return () => clearTimeout(t);
  }, [isDesktop, keyboardOpen, messagesRef]);
  const { profile } = useAuth();
  const selfUid = profile?.uid ?? null;
  const selfName = profile?.full_name ?? profile?.displayName ?? "You";
  const nativeMobileDetail = isChatMobileLayout(isDesktop);
  const slackThreadUi = isDesktop || nativeMobileDetail;

  const [netReplyContext, setNetReplyContext] = useState<ReplyPreviewData | null>(null);
  const clearNetReply = useCallback(() => setNetReplyContext(null), []);
  const [netReactionsByMessageId, setNetReactionsByMessageId] = useState<
    Record<string, ChatReactions>
  >({});

  const { typingNames: netTypingNames, onUserTyping: netOnUserTyping } = useChatTypingPresence(
    selectedNet?.id ?? null,
    selfUid,
    selfName,
  );

  const slackNetGroupMeta = useMemo(
    () =>
      selectedNet
        ? buildSlackMessageGroupMap(selectedNet.messages, {
            isGroupable: () => true,
            senderKey: (m) =>
              m.senderId === "dispatcher-1" ? "__self__" : selectedNet.partnerId,
            createdAt: (m) => m.timestamp,
          })
        : new Map(),
    [selectedNet],
  );
  type NetThreadListItem =
    | IntegratedChat["messages"][number]
    | { __dateDivider: true; dateStr: string; id: string };
  const netThreadListItems = useMemo((): NetThreadListItem[] => {
    if (!selectedNet) return [];
    const items: NetThreadListItem[] = [];
    let lastDateStr = "";
    for (const m of selectedNet.messages) {
      const msgDate = m.timestamp ? m.timestamp.slice(0, 10) : "";
      if (msgDate && msgDate !== lastDateStr) {
        items.push({
          __dateDivider: true,
          dateStr: m.timestamp,
          id: `__net_date__${msgDate}`,
        });
        lastDateStr = msgDate;
      }
      items.push(m);
    }
    return items;
  }, [selectedNet]);

  const integratedChat = useOptionalIntegratedChat();
  const [loadingOlderNet, setLoadingOlderNet] = useState(false);
  const netOlderStartDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!selectedNet?.id || !integratedChat?.hydrateNetworkThread) return;
    void integratedChat.hydrateNetworkThread(selectedNet.id);
  }, [selectedNet?.id, integratedChat?.hydrateNetworkThread]);

  const onNetStartReached = useCallback(() => {
    if (!selectedNet?.id || !integratedChat?.loadOlderNetworkMessages) return;
    if (!integratedChat.networkThreadHasMore(selectedNet.id)) return;
    if (loadingOlderNet) return;
    // RN-web fires onStartReached during send/layout; debounce like trip threads.
    if (netOlderStartDebounceRef.current) return;
    netOlderStartDebounceRef.current = setTimeout(() => {
      netOlderStartDebounceRef.current = null;
      if (!selectedNet?.id || !integratedChat?.loadOlderNetworkMessages) return;
      if (!integratedChat.networkThreadHasMore(selectedNet.id)) return;
      setLoadingOlderNet(true);
      void integratedChat
        .loadOlderNetworkMessages(selectedNet.id)
        .finally(() => setLoadingOlderNet(false));
    }, 400);
  }, [selectedNet?.id, integratedChat, loadingOlderNet]);

  useEffect(() => {
    return () => {
      if (netOlderStartDebounceRef.current) {
        clearTimeout(netOlderStartDebounceRef.current);
        netOlderStartDebounceRef.current = null;
      }
    };
  }, []);

  const netTailMessageId =
    selectedNet?.messages[selectedNet.messages.length - 1]?.id ?? null;
  const prevNetTailIdRef = useRef<string | null>(null);
  const netContentHeightRef = useRef(0);
  const stickNetToBottomRef = useRef(true);

  const scrollNetToBottom = useCallback(
    (animated = false) => {
      stickNetToBottomRef.current = true;
      const list = messagesRef.current;
      if (!list) return;
      const run = () => {
        try {
          list.scrollToEnd({ animated });
        } catch {
          // ignore
        }
        // RN-web FlatList often ignores scrollToEnd; force with content height / large offset.
        try {
          const offset = Math.max(netContentHeightRef.current, 1_000_000);
          list.scrollToOffset({ offset, animated });
        } catch {
          // ignore
        }
      };
      run();
      requestAnimationFrame(run);
      setTimeout(run, 48);
      setTimeout(run, 140);
    },
    [messagesRef],
  );

  // New message at the tail (optimistic or persisted) → keep composer pinned above last bubble.
  useEffect(() => {
    const prevTail = prevNetTailIdRef.current;
    prevNetTailIdRef.current = netTailMessageId;
    if (!netTailMessageId) return;
    if (prevTail === netTailMessageId) return;
    scrollNetToBottom(prevTail != null);
  }, [netTailMessageId, scrollNetToBottom]);

  const onNetContentSizeChange = useCallback(
    (_w: number, h: number) => {
      netContentHeightRef.current = h;
      if (!stickNetToBottomRef.current) return;
      try {
        messagesRef.current?.scrollToOffset({ offset: h, animated: false });
      } catch {
        messagesRef.current?.scrollToEnd({ animated: false });
      }
    },
    [messagesRef],
  );

  useEffect(() => {
    setNetReactionsByMessageId({});
    prevNetTailIdRef.current = null;
    stickNetToBottomRef.current = true;
  }, [selectedNet?.id]);

  const toggleNetReaction = useCallback(
    (messageId: string, emoji: string) => {
      const reactorId = selfUid || "__self__";
      setNetReactionsByMessageId((prev) => {
        const byMsg = prev[messageId] ?? {};
        const current = byMsg[emoji] ?? [];
        const hasMine = current.includes(reactorId);
        const nextEmojiUsers = hasMine
          ? current.filter((u) => u !== reactorId)
          : [...current, reactorId];
        const nextByMsg: ChatReactions = { ...byMsg };
        if (nextEmojiUsers.length > 0) nextByMsg[emoji] = nextEmojiUsers;
        else delete nextByMsg[emoji];

        const out = { ...prev };
        if (Object.keys(nextByMsg).length > 0) out[messageId] = nextByMsg;
        else delete out[messageId];
        return out;
      });
    },
    [selfUid],
  );

  if (!selectedNet) return <EmptyDetail isDesktop={isDesktop} />;
  const netThreadAvatar = resolveNetworkPartnerAvatar(selectedNet);
  return (
    <ChatConversationLayout
      isDesktop={isDesktop}
      header={
        <ChatDetailHeader
          title={selectedNet.partnerName}
          subtitle={formatChatPartyTypeLabel(resolveNetPartyType(selectedNet)) ?? undefined}
          isDesktop={isDesktop}
          onCloseDetail={onCloseDetail}
          slackAvatarIdentity={slackThreadUi ? netThreadAvatar : undefined}
        />
      }
      messages={
        <FlatList
          ref={messagesRef}
          style={s.msgs}
          contentContainerStyle={
            isDesktop
              ? [deskSt.threadMsgsContent, { paddingBottom: 28 }]
              : [s.msgsContent, slackSt.threadMsgsContent]
          }
          data={netThreadListItems}
          extraData={`${selectedNet.messages.length}:${selectedNet.messages[selectedNet.messages.length - 1]?.id ?? ""}`}
          keyExtractor={(m) => ("__dateDivider" in m ? m.id : m.id)}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          removeClippedSubviews={false}
          windowSize={!isDesktop ? 7 : undefined}
          maxToRenderPerBatch={!isDesktop ? 10 : undefined}
          initialNumToRender={!isDesktop ? 16 : undefined}
          showsVerticalScrollIndicator={!isDesktop ? false : undefined}
          onStartReached={
            selectedNet.messages.length > 0 ? onNetStartReached : undefined
          }
          onStartReachedThreshold={0.15}
          onScroll={(e) => {
            const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
            const distanceFromBottom =
              contentSize.height - layoutMeasurement.height - contentOffset.y;
            stickNetToBottomRef.current = distanceFromBottom < 80;
          }}
          scrollEventThrottle={16}
          renderItem={({ item }) => {
            if ("__dateDivider" in item && item.__dateDivider) {
              return (
                <ChatDateDivider
                  dateStr={item.dateStr}
                  variant={isDesktop ? "desktop" : "mobile"}
                />
              );
            }
            const m = item;
            return (
              <ChatBubble
                isOwn={m.senderId === "dispatcher-1"}
                content={m.content}
                timestamp={m.timestamp}
                senderName={m.senderId !== "dispatcher-1" ? selectedNet.partnerName : undefined}
                peerAvatar={
                  m.senderId !== "dispatcher-1"
                    ? resolveNetworkPartnerAvatar(selectedNet)
                    : null
                }
                isMobile={!isDesktop}
                slackLayout={slackThreadUi}
                slackVariant={isDesktop ? "desktop" : "mobile"}
                slackGroup={slackNetGroupMeta.get(m.id)}
                selfUserId={selfUid}
                reactions={netReactionsByMessageId[m.id] ?? null}
                onReact={(emoji) => toggleNetReaction(m.id, emoji)}
                replyPreview={m.replyPreview ?? null}
                onReply={() =>
                  setNetReplyContext({
                    messageId: m.id,
                    senderName:
                      m.senderId !== "dispatcher-1" ? selectedNet.partnerName : selfName,
                    content: m.content,
                  })
                }
              />
            );
          }}
          ListHeaderComponent={
            <>
              {loadingOlderNet ? (
                <View style={{ alignItems: "center", paddingVertical: 8 }}>
                  <LoadingIndicator size="small" color="#94a3b8" />
                </View>
              ) : null}
              <ChatSystemMsg
                label="Secure channel · Today"
                isMobile={!isDesktop}
                slackLayout={slackThreadUi}
                isDesktop={isDesktop}
              />
            </>
          }
          onContentSizeChange={onNetContentSizeChange}
        />
      }
      inputBar={
        <>
          <ChatTypingIndicator
            typingNames={netTypingNames}
            variant={isDesktop ? "desktop" : "mobile"}
          />
          <ChatInputBar
            quickMsgs={INTEGRATED_QUICK_MESSAGES}
            messageInput={messageInput}
            onChangeMessage={setMessageInput}
            showEmoji={showEmoji}
            setShowEmoji={setShowEmoji}
            showScripts={showScripts}
            setShowScripts={setShowScripts}
            onSend={() => { clearNetReply(); onSend(); }}
            inputOverlayMaxWidth={inputOverlayMaxWidth}
            compact={keyboardOpen}
            minimalChrome={!isDesktop}
            isDesktop={isDesktop}
            composerPlaceholder={`Message ${selectedNet.partnerName}`}
            replyContext={netReplyContext}
            onCancelReply={clearNetReply}
            onUserTyping={netOnUserTyping}
          />
        </>
      }
    />
  );
}
