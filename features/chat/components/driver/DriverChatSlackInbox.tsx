import { DriverShipperFeedbackModal } from "@/features/chat/components/driver/DriverShipperFeedbackModal";
import {
  ChatSlackListHeader,
  ChatSlackListRow,
} from "@/features/chat/components/mobile/ChatSlackMobileChrome";
import { stripChatPreviewEmojiPrefix } from "@/features/chat/utils/chatAvatar.util";
import { resolveDriverInboxListPreview } from "@/features/chat/utils/driverChatInboxPreview.util";
import { resolveDriverChatFeedbackChrome } from "@/features/chat/utils/driverChatTripChrome.util";
import { findLatestMissionDebriefMessage } from "@/features/chat/utils/missionDebrief.util";
import { driverChatMessagesQueryKey } from "@/features/chat/utils/driverChatMessageCache.util";
import type { TripConversation, TripMessageRow } from "@/features/chat/types/chat.types";
import type { ResolvedPartyAvatarIdentity } from "@/lib/entityIdentity";
import { useQueryClient } from "@tanstack/react-query";
import { MessageSquare } from "lucide-react-native";
import { FlashList } from "@shopify/flash-list";
import { memo, useCallback, useState } from "react";
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { driverConversationUnreadCount } from "@/features/chat/utils/driverChatUnread.util";
import { resolveDriverFacingShipperName } from "@/features/chat/utils/driverIncomingShipperMessage.util";
import { formatChatInboxTime } from "@/features/chat/utils/formatChatInboxTime.util";

function formatTripDate(iso: string | null | undefined): string {
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

function convListIdentity(conv: TripConversation): ResolvedPartyAvatarIdentity {
  return {
    displayName: resolveDriverFacingShipperName(conv),
    entityType: "client",
  };
}

function DriverChatSlackInboxInner({
  conversations,
  isLoading,
  selectedId,
  profileName,
  profileAvatarUrl,
  profileAvatarSeed,
  onBack,
  onOpenConv,
  bottomInset = 0,
}: {
  conversations: TripConversation[];
  isLoading: boolean;
  selectedId: string | null;
  profileName?: string;
  profileAvatarUrl?: string | null;
  profileAvatarSeed?: string | null;
  onBack: () => void;
  onOpenConv: (conv: TripConversation) => void;
  bottomInset?: number;
}) {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [feedbackConv, setFeedbackConv] = useState<TripConversation | null>(null);

  const renderConvItem = useCallback(
    ({ item }: { item: TripConversation }) => {
      const time = formatChatInboxTime(item.last_message_at) ?? "";
      const routeLine = [item.pickup_area, item.drop_location]
        .filter(Boolean)
        .join(" → ");
      const tripDate = formatTripDate(item.pickup_date ?? item.trip_created_at);
      const listPreview = resolveDriverInboxListPreview(item);
      const preview =
        listPreview.preview ||
        stripChatPreviewEmojiPrefix(item.last_message_preview?.trim() ?? "") ||
        null;
      const chrome = resolveDriverChatFeedbackChrome(item);
      return (
        <ChatSlackListRow
          identity={convListIdentity(item)}
          title={routeLine || item.trip_number || "Trip"}
          titleMeta={tripDate || null}
          time={time}
          partyLine={item.trip_number || "Driver"}
          preview={preview}
          previewKind={listPreview.previewKind}
          previewImagePreviews={listPreview.previewImagePreviews}
          active={selectedId === item.id}
          unread={driverConversationUnreadCount(item)}
          tripKind={chrome.tripKind}
          showPreviewStar={chrome.showStar}
          previewStarFilled={chrome.starFilled}
          previewStarScore={chrome.starScore}
          onPressPreviewStar={() => setFeedbackConv(item)}
          onPress={() => onOpenConv(item)}
        />
      );
    },
    [selectedId, onOpenConv],
  );

  const feedbackMessage: TripMessageRow | null = feedbackConv
    ? findLatestMissionDebriefMessage(feedbackConv.messages)
    : null;
  const feedbackTarget = feedbackConv
    ? resolveDriverFacingShipperName(feedbackConv)
    : "this shipper";

  return (
    <View style={{ flex: 1, backgroundColor: "#FFFFFF" }}>
      <ChatSlackListHeader
        streamLabel="Trip messages"
        topInset={insets.top}
        onBack={onBack}
        profileIdentity={{
          displayName: profileName?.trim() || "Driver",
          entityType: "driver",
        }}
        profileName={profileName}
        profileAvatarUrl={profileAvatarUrl}
        profileAvatarSeed={profileAvatarSeed}
      />

      {isLoading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontSize: 13, color: "#94a3b8" }}>Loading conversations…</Text>
        </View>
      ) : conversations.length === 0 ? (
        <View style={{ alignItems: "center", paddingTop: 64, gap: 12, paddingHorizontal: 32 }}>
          <MessageSquare size={36} color="#e2e8f0" />
          <Text style={{ fontSize: 14, color: "#94a3b8", textAlign: "center" }}>
            No trip messages yet
          </Text>
          <Text
            style={{
              fontSize: 12,
              color: "#94a3b8",
              textAlign: "center",
              lineHeight: 18,
            }}
          >
            Open messages from an active trip or trip history — chats are tied to each trip.
          </Text>
        </View>
      ) : (
        <FlashList
          data={conversations}
          keyExtractor={(c) => c.id}
          extraData={`${feedbackConv?.id}:${conversations
            .map((c) => `${c.id}:${c.trip_feedback_status}:${c.trip_status}`)
            .join("|")}`}
          contentContainerStyle={{ paddingBottom: Math.max(bottomInset, 12) }}
          renderItem={renderConvItem}
        />
      )}
      <DriverShipperFeedbackModal
        visible={Boolean(feedbackConv)}
        onClose={() => setFeedbackConv(null)}
        tripId={feedbackConv?.trip_id ?? ""}
        message={feedbackMessage}
        targetName={feedbackTarget}
        onSubmitted={() => {
          const convId = feedbackConv?.id;
          if (convId) {
            void queryClient.invalidateQueries({
              queryKey: driverChatMessagesQueryKey(convId),
            });
          }
          void queryClient.invalidateQueries({
            queryKey: ["q", "driver-chat", "conversations"],
          });
          setFeedbackConv(null);
        }}
      />
    </View>
  );
}

export const DriverChatSlackInbox = memo(DriverChatSlackInboxInner);
