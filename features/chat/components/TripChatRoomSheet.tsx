/**
 * Unified trip chat room — first Phase 2 UI surface.
 *
 * Full-screen sheet on trip detail: one room per trip (dispatcher, driver,
 * linked client/supplier org members). Uses the platform `chat_*` store and
 * conversation-scoped realtime — not the legacy 3-lane trip chat UI.
 */
import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Feather from "@expo/vector-icons/Feather";

import { CenteredLoadingView } from "@/components/CenteredLoadingView";
import { Theme } from "@/constants/Theme";
import { useOrganization } from "@/contexts/OrganizationContext";
import { WEB_APP_VIEWPORT_STYLE } from "@/lib/webViewportHeight";

import type { TripForCompose } from "../services/chat.service";
import { useAssignmentAuditNameMaps } from "../hooks/useAssignmentAuditNameMaps";
import {
  TripChatRoomActionCard,
} from "./TripChatRoomActionCard";
import { useTripChatRoom } from "../hooks/useTripChatRoom";
import { useTripAssignmentAuditHistoryQuery } from "@/lib/queries/useTripsQuery";
import type { ChatPlatformMessageRow } from "../types/chatPlatform.types";
import { sanitizeTripRoomMessages, isTripRoomFeedbackMirror } from "../utils/sanitizeTripRoomMessages.util";

export interface TripChatRoomSheetProps {
  visible: boolean;
  tripId: string | null;
  tripLabel?: string;
  composeTrip?: TripForCompose | null;
  organizationId?: string | null;
  onClose: () => void;
  onViewTrip?: () => void;
  /** When true, renders inline (full tab/route) instead of a modal sheet. */
  embedded?: boolean;
  /** Hide sheet header — parent thread chrome owns title/tabs (detail Team tab). */
  chromeless?: boolean;
}

function MessageBubble({
  message,
}: {
  message: ChatPlatformMessageRow;
}) {
  const isSystem =
    message.sender_type === "system" || message.sender_type === "integration";
  const deleted = !!message.deleted_at;

  if (isSystem && message.message_type !== "text") {
    if (isTripRoomFeedbackMirror(message)) return null;
    return (
      <View style={styles.systemWrap}>
        <Text style={styles.systemText}>
          {deleted ? "Message removed" : message.content}
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.bubble, isSystem && styles.bubbleSystem]}>
      {!isSystem && message.sender_name ? (
        <Text style={styles.senderName}>{message.sender_name}</Text>
      ) : null}
      <Text style={styles.bubbleText}>
        {deleted ? "Message removed" : message.content}
      </Text>
    </View>
  );
}

function shellStyle(embedded: boolean): ViewStyle[] {
  const base: ViewStyle[] = [styles.root];
  if (Platform.OS === "web") {
    base.push(WEB_APP_VIEWPORT_STYLE as object as ViewStyle);
  }
  if (embedded) {
    base.push(styles.rootEmbedded);
  }
  return base;
}

export function TripChatRoomSheet({
  visible,
  tripId,
  tripLabel,
  composeTrip,
  organizationId,
  onClose,
  embedded = false,
  chromeless = false,
}: TripChatRoomSheetProps) {
  const insets = useSafeAreaInsets();
  const { currentOrganization } = useOrganization();
  const currentOrgId = organizationId ?? currentOrganization?.id ?? null;
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  // mentionUserIds is wired through to the RPC — team member picker is a future feature.
  const mentionUserIdsRef = useRef<string[]>([]);

  const { room, messages, isLoading, isError, sendMessage, openRoom, syncTeam, isSyncingTeam } =
    useTripChatRoom(visible ? tripId : null, { enabled: visible && !!tripId });

  const { data: assignmentAuditRows = [] } = useTripAssignmentAuditHistoryQuery(
    visible ? tripId : null,
  );
  const assignmentAuditMaps = useAssignmentAuditNameMaps(
    currentOrgId,
    assignmentAuditRows,
    {
      driver_display_name: composeTrip?.driver_display_name ?? null,
      // TripForCompose carries no vehicle number; always null here (never populated at runtime).
      vehicle_display_number: null,
    },
  );

  const displayMessages = useMemo(
    () => sanitizeTripRoomMessages(messages),
    [messages],
  );

  const handleSend = useCallback(async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    const mentions = mentionUserIdsRef.current.slice();
    setSendError(null);
    try {
      await sendMessage({ content: text, messageType: "text", mentionUserIds: mentions });
      setDraft("");
      mentionUserIdsRef.current = [];
    } catch (e) {
      // Keep the draft so the text is not lost, and say what happened —
      // previously a throw left the input full with no feedback at all, which
      // read as a dead Send button.
      setSendError(e instanceof Error ? e.message : "Could not send message.");
    } finally {
      setSending(false);
    }
  }, [draft, sendMessage, sending]);

  const title = tripLabel?.trim() || room?.title || "Trip chat";

  if (!visible) return null;

  const body = (
    <KeyboardAvoidingView
      style={[
        ...shellStyle(embedded),
        chromeless ? styles.rootChromeless : null,
        !chromeless ? { paddingTop: insets.top } : null,
      ]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={0}
    >
      {!chromeless ? (
        <View style={styles.header}>
          <Pressable
            onPress={onClose}
            style={styles.headerBtn}
            accessibilityRole="button"
            accessibilityLabel="Close trip chat"
          >
            <Feather
              name={embedded ? "chevron-left" : "x"}
              size={22}
              color={Theme.textPrimary}
            />
          </Pressable>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {title}
            </Text>
            <Text style={styles.headerSub}>Trip room · all parties</Text>
          </View>
          <View style={styles.headerBtn} />
        </View>
      ) : null}

      {isLoading ? (
        <CenteredLoadingView />
      ) : isError ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>Could not load trip chat.</Text>
          <Pressable
            style={styles.retryBtn}
            onPress={() => void openRoom.mutateAsync()}
          >
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <View style={styles.teamBar}>
            <Feather name="users" size={13} color={Theme.textSecondary} />
            <Text style={styles.teamBarLabel}>All trip parties · messages visible to everyone</Text>
            <Pressable
              style={({ pressed }) => [
                styles.teamSyncBtn,
                pressed && styles.teamSyncBtnPressed,
                isSyncingTeam && styles.teamSyncBtnDisabled,
              ]}
              onPress={() => void syncTeam()}
              disabled={isSyncingTeam}
              accessibilityRole="button"
              accessibilityLabel="Refresh team members from trip assignment"
            >
              <Feather
                name="refresh-cw"
                size={13}
                color={Theme.primary}
                style={isSyncingTeam ? styles.teamSyncSpin : undefined}
              />
              <Text style={styles.teamSyncText}>
                {isSyncingTeam ? "Syncing…" : "Sync team"}
              </Text>
            </Pressable>
          </View>
          <FlatList
            style={styles.list}
            data={displayMessages}
            inverted
            keyExtractor={(item) => item.id}
            contentContainerStyle={[
              styles.listContent,
              { paddingBottom: 8, paddingTop: insets.bottom + 72 },
            ]}
            renderItem={({ item }) =>
              item.message_type === "action_card" ? (
                <TripChatRoomActionCard
                  message={item}
                  tripId={tripId!}
                  composeTrip={composeTrip}
                  driverProfiles={assignmentAuditMaps.driverProfiles}
                  currentOrgId={currentOrgId}
                  tripHint={{
                    pickupArea: composeTrip?.pickup_area,
                    dropLocation: composeTrip?.drop_location,
                    status: composeTrip?.status ?? null,
                  }}
                  onClose={onClose}
                />
              ) : (
                <MessageBubble message={item} />
              )
            }
            ListEmptyComponent={
              <View style={[styles.empty, { transform: [{ scaleY: -1 }] }]}>
                <Text style={styles.emptyTitle}>No messages yet</Text>
                <Text style={styles.emptySub}>
                  Status updates, documents, and payments appear here automatically.
                </Text>
              </View>
            }
          />
        </>
      )}

      {sendError ? (
        <View style={styles.sendErrorBar}>
          <Feather name="alert-circle" size={13} color={Theme.warning} />
          <Text style={styles.sendErrorText} numberOfLines={2}>
            {sendError}
          </Text>
        </View>
      ) : null}

      <View
        style={[
          styles.composeBar,
          { paddingBottom: Math.max(insets.bottom, 12) },
        ]}
      >
        {/* @ stub — team member tagging UI wires here when ready */}
        <Pressable
          style={styles.mentionBtn}
          disabled
          accessibilityRole="button"
          accessibilityLabel="Tag a team member (coming soon)"
          accessibilityHint="Team member tagging is not yet available"
        >
          <Text style={styles.mentionBtnText}>@</Text>
        </Pressable>
        <TextInput
          style={styles.input}
          placeholder="Message the trip team…"
          placeholderTextColor={Theme.textSecondary}
          value={draft}
          onChangeText={setDraft}
          multiline
          maxLength={8000}
          editable={!isLoading && !isError}
        />
        <Pressable
          style={[
            styles.sendBtn,
            (!draft.trim() || sending) && styles.sendBtnDisabled,
          ]}
          onPress={() => void handleSend()}
          disabled={!draft.trim() || sending}
          accessibilityRole="button"
          accessibilityLabel="Send message"
        >
          {sending ? (
            <ActivityIndicator size="small" color={Theme.buttonPrimaryText} />
          ) : (
            <Feather name="send" size={18} color={Theme.buttonPrimaryText} />
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );

  if (embedded) {
    return <View style={styles.embeddedHost}>{body}</View>;
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      {body}
    </Modal>
  );
}

const styles = StyleSheet.create({
  embeddedHost: {
    flex: 1,
    minHeight: 0,
    width: "100%",
  },
  root: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
  },
  rootEmbedded: {
    width: "100%",
    minHeight: 0,
  },
  rootChromeless: {
    flex: 1,
    minHeight: 0,
    backgroundColor: "transparent",
  },
  list: {
    flex: 1,
    minHeight: 0,
  },
  teamBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.border,
    backgroundColor: Theme.cardWhite,
  },
  teamBarLabel: {
    flex: 1,
    fontSize: 12,
    color: Theme.textSecondary,
  },
  teamSyncBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: Theme.screenBackground,
  },
  teamSyncBtnPressed: {
    opacity: 0.85,
  },
  teamSyncBtnDisabled: {
    opacity: 0.55,
  },
  teamSyncText: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.primary,
  },
  teamSyncSpin: {
    opacity: 0.6,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.border,
    backgroundColor: Theme.cardWhite,
  },
  headerBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
    minWidth: 0,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: Theme.textPrimary,
  },
  headerSub: {
    fontSize: 12,
    color: Theme.textSecondary,
    marginTop: 2,
  },
  listContent: {
    paddingHorizontal: 8,
    flexGrow: 1,
    width: "100%",
  },
  bubble: {
    alignSelf: "flex-start",
    maxWidth: "85%",
    backgroundColor: Theme.cardWhite,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginVertical: 4,
  },
  bubbleSystem: {
    alignSelf: "center",
    backgroundColor: Theme.pulseIndigoWash,
  },
  senderName: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.primary,
    marginBottom: 2,
  },
  bubbleText: {
    fontSize: 15,
    lineHeight: 21,
    color: Theme.textPrimary,
  },
  systemWrap: {
    alignSelf: "center",
    marginVertical: 6,
    paddingHorizontal: 12,
  },
  systemText: {
    fontSize: 13,
    color: Theme.textSecondary,
    textAlign: "center",
  },
  sendErrorBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: Theme.cardWhite,
  },
  sendErrorText: {
    flex: 1,
    fontSize: 13,
    color: Theme.warning,
  },
  composeBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.border,
    backgroundColor: Theme.cardWhite,
  },
  mentionBtn: {
    width: 36,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    opacity: 0.35,
  },
  mentionBtnText: {
    fontSize: 18,
    fontWeight: "600",
    color: Theme.primary,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: Theme.textPrimary,
    backgroundColor: Theme.screenBackground,
  },
  sendBtn: {
    width: 44,
    height: 44,
    backgroundColor: Theme.buttonPrimary,
    borderWidth: Theme.buttonPrimaryBorderWidth,
    borderColor: Theme.buttonPrimaryBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnDisabled: {
    opacity: 0.45,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  errorText: {
    fontSize: 15,
    color: Theme.textSecondary,
    marginBottom: 12,
  },
  retryBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: Theme.pulseIndigoWash,
  },
  retryText: {
    fontSize: 14,
    fontWeight: "600",
    color: Theme.primary,
  },
  empty: {
    padding: 32,
    alignItems: "center",
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: Theme.textPrimary,
  },
  emptySub: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
    color: Theme.textSecondary,
    textAlign: "center",
  },
});
