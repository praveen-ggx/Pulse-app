/**
 * Slack-like "Create a channel" — chat-chrome aligned for desktop + mobile.
 */
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { Hash, Lock, Search, Users, X } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Theme from "@/constants/Theme";
import { CHAT_ACCENT, CHAT_ACCENT_SOFT } from "@/features/chat/chatTheme";
import { ChatPartyAvatar } from "@/features/chat/components/ChatPartyAvatar";
import type { TeamMemberCandidate } from "@/features/chat/services/teamChat.service";
import type { TeamChannelVisibility } from "@/features/chat/services/teamChannel.service";
import {
  formatChannelHandle,
  normalizeTeamChannelKey,
} from "@/features/chat/utils/teamChannelSlug.util";
import type { ResolvedPartyAvatarIdentity } from "@/lib/entityIdentity";

type Props = {
  visible: boolean;
  members: TeamMemberCandidate[];
  creating?: boolean;
  onClose: () => void;
  onCreate: (input: {
    name: string;
    title?: string;
    topic?: string;
    visibility: TeamChannelVisibility;
    memberIds: string[];
  }) => Promise<void>;
};

function memberIdentity(m: TeamMemberCandidate): ResolvedPartyAvatarIdentity {
  return {
    displayName: m.fullName,
    entityType: "client",
    avatarUrl: m.avatarUrl,
    avatarSeed: m.avatarSeed || m.userId || m.fullName,
  };
}

export function CreateTeamChannelModal({
  visible,
  members,
  creating = false,
  onClose,
  onCreate,
}: Props) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === "web" && width >= 900;

  const [name, setName] = useState("");
  const [topic, setTopic] = useState("");
  const [visibility, setVisibility] =
    useState<TeamChannelVisibility>("public");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [memberSearch, setMemberSearch] = useState("");

  useEffect(() => {
    if (!visible) return;
    setName("");
    setTopic("");
    setVisibility("public");
    setSelected(new Set());
    setError(null);
    setMemberSearch("");
  }, [visible]);

  const slug = useMemo(() => normalizeTeamChannelKey(name), [name]);
  const filteredMembers = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    if (!q) return members;
    return members.filter(
      (m) =>
        m.fullName.toLowerCase().includes(q) ||
        String(m.role).toLowerCase().includes(q),
    );
  }, [members, memberSearch]);

  const toggleMember = (userId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const submit = async () => {
    if (!slug) {
      setError("Enter a channel name");
      return;
    }
    setError(null);
    try {
      await onCreate({
        name: slug,
        title: name.trim() || slug,
        topic: topic.trim() || undefined,
        visibility,
        memberIds: Array.from(selected),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn’t create channel");
    }
  };

  const sheet = (
    <View
      style={[
        styles.sheet,
        isDesktop ? styles.sheetDesktop : styles.sheetMobile,
        {
          paddingTop: isDesktop ? 0 : insets.top + 6,
          paddingBottom: Math.max(insets.bottom, 12) + (isDesktop ? 8 : 4),
          maxHeight: isDesktop ? Math.min(720, width > 0 ? 720 : 720) : undefined,
        },
      ]}
    >
      <View style={styles.header}>
        <Pressable
          onPress={onClose}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Close"
          style={styles.iconBtn}
        >
          <X size={18} color={Theme.textPrimary} strokeWidth={2.4} />
        </Pressable>
        <View style={styles.headerTextCol}>
          <Text style={styles.headerTitle}>Create a channel</Text>
          <Text style={styles.headerSub} numberOfLines={2}>
            Organize plans with your team — ops, finance, lanes, or any project.
          </Text>
        </View>
        <Pressable
          onPress={() => void submit()}
          disabled={creating || !slug}
          style={[styles.createBtn, (!slug || creating) && styles.createDisabled]}
          accessibilityRole="button"
          accessibilityLabel="Create channel"
        >
          {creating ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.createBtnText}>Create</Text>
          )}
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.label}>Name</Text>
        <View style={styles.nameRow}>
          <View style={styles.hashPlate}>
            <Hash size={16} color={CHAT_ACCENT} strokeWidth={2.4} />
          </View>
          <TextInput
            style={styles.nameInput}
            value={name}
            onChangeText={setName}
            placeholder="e.g. plan-tracker"
            placeholderTextColor={Theme.textSecondary}
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus={isDesktop}
            maxLength={80}
          />
        </View>
        <Text style={styles.hint}>
          Channel handle {formatChannelHandle(slug || "name")} · lowercase, no
          spaces
        </Text>

        <Text style={styles.label}>Topic</Text>
        <TextInput
          style={styles.topicInput}
          value={topic}
          onChangeText={setTopic}
          placeholder="What is this channel about? (optional)"
          placeholderTextColor={Theme.textSecondary}
          maxLength={200}
        />

        <Text style={styles.label}>Visibility</Text>
        <View style={[styles.visRow, isDesktop && styles.visRowDesktop]}>
          <Pressable
            style={[
              styles.visCard,
              visibility === "public" && styles.visCardActive,
            ]}
            onPress={() => setVisibility("public")}
          >
            <View
              style={[
                styles.visIcon,
                visibility === "public" && styles.visIconActive,
              ]}
            >
              <Hash
                size={16}
                color={visibility === "public" ? "#fff" : Theme.textSecondary}
                strokeWidth={2.4}
              />
            </View>
            <View style={styles.visTextCol}>
              <Text style={styles.visTitle}>Public</Text>
              <Text style={styles.visSub}>
                Anyone in the workspace can find and join
              </Text>
            </View>
          </Pressable>
          <Pressable
            style={[
              styles.visCard,
              visibility === "private" && styles.visCardActive,
            ]}
            onPress={() => setVisibility("private")}
          >
            <View
              style={[
                styles.visIcon,
                visibility === "private" && styles.visIconActive,
              ]}
            >
              <Lock
                size={16}
                color={visibility === "private" ? "#fff" : Theme.textSecondary}
                strokeWidth={2.4}
              />
            </View>
            <View style={styles.visTextCol}>
              <Text style={styles.visTitle}>Private</Text>
              <Text style={styles.visSub}>
                Invite-only — hidden from Browse
              </Text>
            </View>
          </Pressable>
        </View>

        <View style={styles.inviteHeader}>
          <Users size={15} color={Theme.textSecondary} strokeWidth={2.2} />
          <Text style={styles.labelInline}>
            Add people{selected.size > 0 ? ` · ${selected.size}` : ""}
          </Text>
        </View>
        <View style={styles.searchRow}>
          <Search size={15} color={Theme.textSecondary} strokeWidth={2.2} />
          <TextInput
            style={styles.searchInput}
            value={memberSearch}
            onChangeText={setMemberSearch}
            placeholder="Search teammates"
            placeholderTextColor={Theme.textSecondary}
          />
        </View>

        <View style={styles.memberList}>
          {filteredMembers.map((m) => {
            const on = selected.has(m.userId);
            return (
              <Pressable
                key={m.userId}
                style={[styles.memberRow, on && styles.memberRowOn]}
                onPress={() => toggleMember(m.userId)}
              >
                <ChatPartyAvatar identity={memberIdentity(m)} size={36} />
                <View style={styles.memberText}>
                  <Text style={styles.memberName} numberOfLines={1}>
                    {m.fullName}
                  </Text>
                  <Text style={styles.memberRole} numberOfLines={1}>
                    {String(m.role).replace(/_/g, " ")}
                  </Text>
                </View>
                <View style={[styles.check, on && styles.checkOn]}>
                  {on ? <Text style={styles.checkMark}>✓</Text> : null}
                </View>
              </Pressable>
            );
          })}
          {filteredMembers.length === 0 ? (
            <Text style={styles.emptyMembers}>No teammates match</Text>
          ) : null}
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>
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
  sheet: {
    backgroundColor: Theme.screenBackground,
    overflow: "hidden",
  },
  sheetMobile: {
    flex: 1,
  },
  sheetDesktop: {
    width: "100%",
    maxWidth: 520,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Theme.surfaceBorder,
    shadowColor: "#0F172A",
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 12,
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.surfaceBorder,
    backgroundColor: "#FFFFFF",
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.surfaceGray,
  },
  headerTextCol: { flex: 1, minWidth: 0, paddingTop: 2 },
  headerTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: Theme.textPrimary,
    letterSpacing: -0.2,
  },
  headerSub: {
    marginTop: 3,
    fontSize: 12,
    lineHeight: 16,
    color: Theme.textSecondary,
  },
  createBtn: {
    minWidth: 76,
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: CHAT_ACCENT,
    alignItems: "center",
    justifyContent: "center",
  },
  createDisabled: { opacity: 0.4 },
  createBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  body: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 28 },
  label: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.45,
    textTransform: "uppercase",
    color: Theme.textSecondary,
    marginBottom: 8,
    marginTop: 10,
  },
  labelInline: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.45,
    textTransform: "uppercase",
    color: Theme.textSecondary,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: Theme.surfaceBorder,
    borderRadius: 12,
    paddingLeft: 8,
    paddingRight: 12,
    backgroundColor: Theme.surface,
    minHeight: 48,
  },
  hashPlate: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: CHAT_ACCENT_SOFT,
    alignItems: "center",
    justifyContent: "center",
  },
  nameInput: {
    flex: 1,
    fontSize: 16,
    fontWeight: "600",
    color: Theme.textPrimary,
    paddingVertical: 12,
  },
  hint: {
    marginTop: 6,
    marginBottom: 4,
    fontSize: 12,
    color: Theme.textSecondary,
  },
  topicInput: {
    borderWidth: 1,
    borderColor: Theme.surfaceBorder,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
    color: Theme.textPrimary,
    backgroundColor: Theme.surface,
    minHeight: 46,
  },
  visRow: { gap: 8, marginBottom: 4 },
  visRowDesktop: {
    flexDirection: "row",
    alignItems: "stretch",
  },
  visCard: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.surfaceBorder,
    backgroundColor: Theme.surface,
  },
  visCardActive: {
    borderColor: CHAT_ACCENT,
    backgroundColor: CHAT_ACCENT_SOFT,
  },
  visIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: Theme.surfaceGray,
    alignItems: "center",
    justifyContent: "center",
  },
  visIconActive: { backgroundColor: CHAT_ACCENT },
  visTextCol: { flex: 1, minWidth: 0 },
  visTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: Theme.textPrimary,
  },
  visSub: {
    marginTop: 2,
    fontSize: 11,
    lineHeight: 15,
    color: Theme.textSecondary,
  },
  inviteHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 16,
    marginBottom: 8,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: Theme.surfaceBorder,
    borderRadius: 12,
    paddingHorizontal: 12,
    backgroundColor: Theme.surface,
    marginBottom: 8,
    minHeight: 42,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: Theme.textPrimary,
    paddingVertical: 10,
  },
  memberList: {
    borderWidth: 1,
    borderColor: Theme.surfaceBorder,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#FFFFFF",
  },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.surfaceBorder,
  },
  memberRowOn: { backgroundColor: Theme.brandBlueWashSubtle },
  memberText: { flex: 1, minWidth: 0 },
  memberName: { fontSize: 14, fontWeight: "700", color: Theme.textPrimary },
  memberRole: { marginTop: 1, fontSize: 11, color: Theme.textSecondary },
  check: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: Theme.surfaceBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  checkOn: {
    backgroundColor: CHAT_ACCENT,
    borderColor: CHAT_ACCENT,
  },
  checkMark: { color: "#fff", fontSize: 12, fontWeight: "800" },
  emptyMembers: {
    padding: 16,
    textAlign: "center",
    color: Theme.textSecondary,
    fontSize: 13,
  },
  error: {
    marginTop: 14,
    color: Theme.destructive,
    fontSize: 13,
    fontWeight: "600",
  },
});
