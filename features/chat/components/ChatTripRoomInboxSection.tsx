/**
 * Unified trip team rooms in the Chat hub sidebar (Phase 3).
 *
 * Surfaces `conversation_type = 'trip'` rows from `get_chat_inbox` above the
 * legacy 3-lane trip hub list.
 */
import React, { useMemo } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { ChatPartyAvatar } from "@/features/chat/components/ChatPartyAvatar";
import { ChatListPreviewText } from "@/features/chat/components/shared/ChatListPreviewText";
import { SLACK_CHAT_AVATAR } from "@/features/chat/components/shared/chatSlackAvatar.constants";
import type { TripForCompose } from "@/features/chat/services/chat.service";
import { resolveTripRoomDriverAvatar } from "@/features/chat/utils/chatAvatar.util";
import { Theme } from "@/constants/Theme";
import { useChatInboxQuery } from "@/lib/queries/useChatInboxQuery";

import type { ChatInboxItem } from "../types/chatPlatform.types";

export interface ChatTripRoomInboxSectionProps {
  organizationId: string | null;
  onOpenTripRoom: (tripId: string) => void;
  composeTripsById?: Map<string, TripForCompose>;
  activeTripId?: string | null;
  style?: StyleProp<ViewStyle>;
  maxRows?: number;
}

function TripRoomRow({
  item,
  composeTrip,
  active,
  onPress,
}: {
  item: ChatInboxItem;
  composeTrip?: TripForCompose | null;
  active?: boolean;
  onPress: () => void;
}) {
  const unread = item.unread_count > 0;
  const avatar = resolveTripRoomDriverAvatar({
    driverId: item.driver_id,
    title: item.title,
    composeTrip,
  });

  return (
    <Pressable
      style={({ pressed }) => [
        styles.row,
        active && styles.rowActive,
        pressed && styles.rowPressed,
      ]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Open team chat for ${item.title ?? "trip"}`}
    >
      <View style={styles.avatarWrap}>
        <ChatPartyAvatar identity={avatar} size={SLACK_CHAT_AVATAR.list} />
      </View>
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={1}>
          {item.title ?? "Trip team"}
        </Text>
        <ChatListPreviewText
          text={item.last_message_preview?.trim() || "Trip room · all parties"}
          style={styles.preview}
          numberOfLines={1}
        />
      </View>
      {unread ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>
            {item.unread_count > 99 ? "99+" : item.unread_count}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

export function ChatTripRoomInboxSection({
  organizationId,
  onOpenTripRoom,
  composeTripsById,
  activeTripId,
  style,
  maxRows = 12,
}: ChatTripRoomInboxSectionProps) {
  const { data: inbox = [] } = useChatInboxQuery(organizationId);

  const tripRooms = useMemo(
    () =>
      inbox
        .filter((item) => item.conversation_type === "trip" && item.trip_id)
        .slice(0, maxRows),
    [inbox, maxRows],
  );

  if (!organizationId || tripRooms.length === 0) return null;

  return (
    <View style={[styles.section, style]}>
      <Text style={styles.sectionLabel}>Trip rooms</Text>
      {tripRooms.map((item) => (
        <TripRoomRow
          key={item.id}
          item={item}
          composeTrip={
            item.trip_id ? composeTripsById?.get(item.trip_id) ?? null : null
          }
          active={!!item.trip_id && item.trip_id === activeTripId}
          onPress={() => {
            if (item.trip_id) onOpenTripRoom(item.trip_id);
          }}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 4,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: Theme.textSecondary,
    marginBottom: 6,
    paddingHorizontal: 4,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 10,
    marginBottom: 4,
    backgroundColor: Theme.cardWhite,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.border,
  },
  rowActive: {
    backgroundColor: Theme.pulseIndigoWash,
    borderColor: Theme.primary,
  },
  rowPressed: {
    backgroundColor: Theme.pulseIndigoWash,
  },
  avatarWrap: {
    borderRadius: 999,
    overflow: "hidden",
  },
  body: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 14,
    fontWeight: "600",
    color: Theme.textPrimary,
  },
  preview: {
    marginTop: 2,
    fontSize: 12,
    color: Theme.textSecondary,
  },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 6,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.buttonPrimary,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.buttonPrimaryText,
  },
});
