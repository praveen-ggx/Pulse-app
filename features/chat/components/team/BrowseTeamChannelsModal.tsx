/**
 * Slack "Browse channels" — chat-chrome aligned for desktop + mobile.
 */
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { Hash, Lock, Search, X } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Theme from "@/constants/Theme";
import { CHAT_ACCENT, CHAT_ACCENT_SOFT } from "@/features/chat/chatTheme";
import type { TeamChannelListItem } from "@/features/chat/services/teamChannel.service";
import {
  channelDisplayTitle,
  formatChannelHandle,
} from "@/features/chat/utils/teamChannelSlug.util";

type Props = {
  visible: boolean;
  channels: TeamChannelListItem[];
  joiningId?: string | null;
  onClose: () => void;
  onJoin: (channel: TeamChannelListItem) => Promise<void>;
  onOpen: (channel: TeamChannelListItem) => void;
};

export function BrowseTeamChannelsModal({
  visible,
  channels,
  joiningId = null,
  onClose,
  onJoin,
  onOpen,
}: Props) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === "web" && width >= 900;
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = channels.filter((c) => !c.isArchived);
    if (!needle) return list;
    return list.filter((c) => {
      const hay = `${c.channelKey} ${c.title} ${c.topic ?? ""}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [channels, q]);

  const sheet = (
    <View
      style={[
        styles.sheet,
        isDesktop ? styles.sheetDesktop : styles.sheetMobile,
        {
          paddingTop: isDesktop ? 0 : insets.top + 6,
          paddingBottom: Math.max(insets.bottom, 12),
        },
      ]}
    >
      <View style={styles.header}>
        <Pressable onPress={onClose} style={styles.iconBtn} hitSlop={10}>
          <X size={18} color={Theme.textPrimary} strokeWidth={2.4} />
        </Pressable>
        <Text style={styles.headerTitle}>Browse channels</Text>
        <View style={{ width: 36 }} />
      </View>

      <View style={styles.searchWrap}>
        <View style={styles.searchRow}>
          <Search size={15} color={Theme.textSecondary} strokeWidth={2.2} />
          <TextInput
            style={styles.search}
            value={q}
            onChangeText={setQ}
            placeholder="Search by name or topic"
            placeholderTextColor={Theme.textSecondary}
            autoCapitalize="none"
          />
        </View>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(c) => c.id}
        contentContainerStyle={
          filtered.length === 0 ? styles.emptyPad : styles.listPad
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <Hash size={22} color={CHAT_ACCENT} strokeWidth={2.2} />
            </View>
            <Text style={styles.emptyTitle}>No channels to browse</Text>
            <Text style={styles.emptySub}>
              Create a public channel so the team can track plans together.
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const Icon = item.visibility === "private" ? Lock : Hash;
          const busy = joiningId === item.id;
          return (
            <View style={styles.row}>
              <Pressable
                style={styles.rowMain}
                onPress={() => {
                  if (item.isMember) onOpen(item);
                }}
                disabled={!item.isMember}
              >
                <View style={styles.hashBubble}>
                  <Icon size={16} color={CHAT_ACCENT} strokeWidth={2.4} />
                </View>
                <View style={styles.rowText}>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {formatChannelHandle(item.channelKey)}
                  </Text>
                  <Text style={styles.rowSub} numberOfLines={2}>
                    {item.topic?.trim() ||
                      channelDisplayTitle(item.title, item.channelKey)}{" "}
                    · {item.memberCount}{" "}
                    {item.memberCount === 1 ? "member" : "members"}
                  </Text>
                </View>
              </Pressable>
              {item.isMember ? (
                <Pressable style={styles.openBtn} onPress={() => onOpen(item)}>
                  <Text style={styles.openBtnText}>Open</Text>
                </Pressable>
              ) : (
                <Pressable
                  style={[styles.joinBtn, busy && styles.joinDisabled]}
                  disabled={busy || item.visibility === "private"}
                  onPress={() => void onJoin(item)}
                >
                  {busy ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.joinBtnText}>
                      {item.visibility === "private" ? "Private" : "Join"}
                    </Text>
                  )}
                </Pressable>
              )}
            </View>
          );
        }}
      />
    </View>
  );

  return (
    <Modal
      visible={visible}
      animationType={isDesktop ? "fade" : "slide"}
      transparent={isDesktop}
      presentationStyle={isDesktop ? "overFullScreen" : "pageSheet"}
      onRequestClose={onClose}
    >
      {isDesktop ? (
        <View style={styles.desktopBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
          {sheet}
        </View>
      ) : (
        sheet
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  desktopBackdrop: {
    flex: 1,
    backgroundColor: Theme.overlayBackdrop,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  sheet: { backgroundColor: Theme.screenBackground, overflow: "hidden" },
  sheetMobile: { flex: 1 },
  sheetDesktop: {
    width: "100%",
    maxWidth: 520,
    maxHeight: 640,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Theme.surfaceBorder,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 10,
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.surfaceBorder,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.surfaceGray,
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 17,
    fontWeight: "800",
    color: Theme.textPrimary,
  },
  searchWrap: { paddingHorizontal: 14, paddingVertical: 10 },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: Theme.surfaceBorder,
    borderRadius: 12,
    paddingHorizontal: 12,
    backgroundColor: Theme.surface,
    minHeight: 42,
  },
  search: {
    flex: 1,
    fontSize: 14,
    color: Theme.textPrimary,
    paddingVertical: 10,
  },
  listPad: { paddingBottom: 24 },
  emptyPad: { flexGrow: 1, justifyContent: "center" },
  empty: { alignItems: "center", paddingHorizontal: 28, gap: 8 },
  emptyIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: CHAT_ACCENT_SOFT,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
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
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.surfaceBorder,
    gap: 10,
  },
  rowMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minWidth: 0,
  },
  hashBubble: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: CHAT_ACCENT_SOFT,
    alignItems: "center",
    justifyContent: "center",
  },
  rowText: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 15, fontWeight: "700", color: Theme.textPrimary },
  rowSub: {
    marginTop: 2,
    fontSize: 12,
    color: Theme.textSecondary,
    lineHeight: 16,
  },
  joinBtn: {
    minWidth: 72,
    height: 34,
    borderRadius: 10,
    backgroundColor: CHAT_ACCENT,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  joinDisabled: { opacity: 0.5 },
  joinBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  openBtn: {
    minWidth: 64,
    height: 34,
    borderRadius: 10,
    backgroundColor: Theme.surfaceGray,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  openBtnText: { color: CHAT_ACCENT, fontWeight: "700", fontSize: 13 },
});
