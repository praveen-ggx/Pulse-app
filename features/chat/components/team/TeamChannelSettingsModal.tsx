/**
 * Slack-like channel details — topic, members, invite, leave, archive.
 */
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Hash, Lock, UserPlus, X } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Theme from "@/constants/Theme";
import { ChatPartyAvatar } from "@/features/chat/components/ChatPartyAvatar";
import { useTeamChannelMembers } from "@/features/chat/hooks/useTeamChannels";
import type { TeamMemberCandidate } from "@/features/chat/services/teamChat.service";
import type {
  TeamChannelListItem,
  TeamChannelVisibility,
} from "@/features/chat/services/teamChannel.service";
import {
  channelDisplayTitle,
  formatChannelHandle,
} from "@/features/chat/utils/teamChannelSlug.util";
import type { ResolvedPartyAvatarIdentity } from "@/lib/entityIdentity";

type Props = {
  visible: boolean;
  channel: TeamChannelListItem | null;
  roster: TeamMemberCandidate[];
  saving?: boolean;
  leaving?: boolean;
  inviting?: boolean;
  archiving?: boolean;
  onClose: () => void;
  onSave: (patch: {
    title?: string;
    topic?: string;
    visibility?: TeamChannelVisibility;
  }) => Promise<void>;
  onInvite: (memberIds: string[]) => Promise<void>;
  onLeave: () => Promise<void>;
  onArchive: () => Promise<void>;
};

function identityFrom(
  name: string,
  avatarUrl: string | null,
  avatarSeed: string | null,
  userId: string,
): ResolvedPartyAvatarIdentity {
  return {
    displayName: name,
    entityType: "client",
    avatarUrl,
    avatarSeed: avatarSeed || userId || name,
  };
}

export function TeamChannelSettingsModal({
  visible,
  channel,
  roster,
  saving = false,
  leaving = false,
  inviting = false,
  archiving = false,
  onClose,
  onSave,
  onInvite,
  onLeave,
  onArchive,
}: Props) {
  const insets = useSafeAreaInsets();
  const membersQuery = useTeamChannelMembers(channel?.id ?? null, visible);
  const [topic, setTopic] = useState("");
  const [title, setTitle] = useState("");
  const [visibility, setVisibility] =
    useState<TeamChannelVisibility>("public");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible || !channel) return;
    setTopic(channel.topic ?? "");
    setTitle(channel.title || channel.channelKey);
    setVisibility(channel.visibility);
    setInviteOpen(false);
    setPicked(new Set());
    setError(null);
  }, [visible, channel]);

  const memberIds = useMemo(
    () => new Set((membersQuery.data ?? []).map((m) => m.userId)),
    [membersQuery.data],
  );

  const inviteCandidates = useMemo(
    () => roster.filter((m) => !memberIds.has(m.userId)),
    [roster, memberIds],
  );

  if (!channel) return null;

  const Icon = channel.visibility === "private" ? Lock : Hash;

  const save = async () => {
    setError(null);
    try {
      await onSave({
        title: title.trim() || undefined,
        topic: topic.trim(),
        visibility,
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn’t save");
    }
  };

  const invite = async () => {
    if (picked.size === 0) return;
    setError(null);
    try {
      await onInvite(Array.from(picked));
      setInviteOpen(false);
      setPicked(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn’t invite");
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View
        style={[
          styles.root,
          { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 12 },
        ]}
      >
        <View style={styles.header}>
          <Pressable onPress={onClose} style={styles.iconBtn} hitSlop={10}>
            <X size={20} color={Theme.textPrimary} strokeWidth={2.2} />
          </Pressable>
          <Text style={styles.headerTitle}>Channel details</Text>
          {channel.isAdmin ? (
            <Pressable
              onPress={() => void save()}
              disabled={saving}
              style={[styles.saveBtn, saving && styles.disabled]}
            >
              {saving ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.saveText}>Save</Text>
              )}
            </Pressable>
          ) : (
            <View style={{ width: 64 }} />
          )}
        </View>

        <ScrollView contentContainerStyle={styles.body}>
          <View style={styles.hero}>
            <View style={styles.heroIcon}>
              <Icon size={22} color={Theme.primary} strokeWidth={2.4} />
            </View>
            <Text style={styles.heroTitle}>
              {formatChannelHandle(channel.channelKey)}
            </Text>
            <Text style={styles.heroSub}>
              {channel.memberCount} members ·{" "}
              {channel.visibility === "private" ? "Private" : "Public"}
            </Text>
          </View>

          {channel.isAdmin ? (
            <>
              <Text style={styles.label}>Display name</Text>
              <TextInput
                style={styles.input}
                value={title}
                onChangeText={setTitle}
                placeholder={channelDisplayTitle(null, channel.channelKey)}
                placeholderTextColor={Theme.textSecondary}
              />
              <Text style={styles.label}>Topic</Text>
              <TextInput
                style={styles.input}
                value={topic}
                onChangeText={setTopic}
                placeholder="Add a topic"
                placeholderTextColor={Theme.textSecondary}
              />
              <Text style={styles.label}>Visibility</Text>
              <View style={styles.visRow}>
                <Pressable
                  style={[
                    styles.chip,
                    visibility === "public" && styles.chipOn,
                  ]}
                  onPress={() => setVisibility("public")}
                >
                  <Text
                    style={[
                      styles.chipText,
                      visibility === "public" && styles.chipTextOn,
                    ]}
                  >
                    Public
                  </Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.chip,
                    visibility === "private" && styles.chipOn,
                  ]}
                  onPress={() => setVisibility("private")}
                >
                  <Text
                    style={[
                      styles.chipText,
                      visibility === "private" && styles.chipTextOn,
                    ]}
                  >
                    Private
                  </Text>
                </Pressable>
              </View>
            </>
          ) : (
            <>
              <Text style={styles.label}>Topic</Text>
              <Text style={styles.readonly}>
                {channel.topic?.trim() || "No topic set"}
              </Text>
            </>
          )}

          <View style={styles.sectionHead}>
            <Text style={styles.labelInline}>Members</Text>
            {channel.isAdmin ? (
              <Pressable
                onPress={() => setInviteOpen((v) => !v)}
                style={styles.inviteBtn}
              >
                <UserPlus size={14} color={Theme.primary} />
                <Text style={styles.inviteBtnText}>
                  {inviteOpen ? "Close" : "Invite"}
                </Text>
              </Pressable>
            ) : null}
          </View>

          {inviteOpen ? (
            <View style={styles.invitePanel}>
              {inviteCandidates.length === 0 ? (
                <Text style={styles.readonly}>Everyone is already here</Text>
              ) : (
                inviteCandidates.map((m) => {
                  const on = picked.has(m.userId);
                  return (
                    <Pressable
                      key={m.userId}
                      style={styles.memberRow}
                      onPress={() =>
                        setPicked((prev) => {
                          const next = new Set(prev);
                          if (next.has(m.userId)) next.delete(m.userId);
                          else next.add(m.userId);
                          return next;
                        })
                      }
                    >
                      <ChatPartyAvatar
                        identity={identityFrom(
                          m.fullName,
                          m.avatarUrl,
                          m.avatarSeed,
                          m.userId,
                        )}
                        size={34}
                      />
                      <Text style={styles.memberName} numberOfLines={1}>
                        {m.fullName}
                      </Text>
                      <View style={[styles.check, on && styles.checkOn]}>
                        {on ? <Text style={styles.checkMark}>✓</Text> : null}
                      </View>
                    </Pressable>
                  );
                })
              )}
              <Pressable
                style={[
                  styles.primaryBtn,
                  (picked.size === 0 || inviting) && styles.disabled,
                ]}
                disabled={picked.size === 0 || inviting}
                onPress={() => void invite()}
              >
                {inviting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryBtnText}>
                    Add {picked.size || ""} to channel
                  </Text>
                )}
              </Pressable>
            </View>
          ) : null}

          {membersQuery.isLoading ? (
            <ActivityIndicator style={{ marginVertical: 16 }} />
          ) : (
            (membersQuery.data ?? []).map((m) => (
              <View key={m.userId} style={styles.memberRow}>
                <ChatPartyAvatar
                  identity={identityFrom(
                    m.fullName,
                    m.avatarUrl,
                    m.avatarSeed,
                    m.userId,
                  )}
                  size={34}
                />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.memberName} numberOfLines={1}>
                    {m.fullName}
                  </Text>
                  <Text style={styles.memberRole}>
                    {m.participantRole === "admin" ? "Admin" : "Member"}
                    {m.orgRole ? ` · ${m.orgRole}` : ""}
                  </Text>
                </View>
              </View>
            ))
          )}

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable
            style={[styles.dangerBtn, leaving && styles.disabled]}
            disabled={leaving}
            onPress={() => void onLeave().catch((e) => setError(String(e?.message ?? e)))}
          >
            {leaving ? (
              <ActivityIndicator color="#B91C1C" />
            ) : (
              <Text style={styles.dangerText}>Leave channel</Text>
            )}
          </Pressable>

          {channel.isAdmin ? (
            <Pressable
              style={[styles.dangerBtn, archiving && styles.disabled]}
              disabled={archiving}
              onPress={() =>
                void onArchive().catch((e) =>
                  setError(String(e?.message ?? e)),
                )
              }
            >
              {archiving ? (
                <ActivityIndicator color="#B91C1C" />
              ) : (
                <Text style={styles.dangerText}>Archive channel</Text>
              )}
            </Pressable>
          ) : null}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Theme.screenBackground },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingBottom: 10,
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.surfaceBorder,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.surfaceGray,
  },
  headerTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: "700",
    color: Theme.textPrimary,
  },
  saveBtn: {
    minWidth: 64,
    height: 34,
    borderRadius: 10,
    backgroundColor: Theme.primary,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  saveText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  disabled: { opacity: 0.45 },
  body: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 40 },
  hero: { alignItems: "center", marginBottom: 18, gap: 6 },
  heroIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: Theme.brandBlueSoft ?? Theme.surfaceGray,
    alignItems: "center",
    justifyContent: "center",
  },
  heroTitle: { fontSize: 20, fontWeight: "800", color: Theme.textPrimary },
  heroSub: { fontSize: 13, color: Theme.textSecondary },
  label: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.3,
    textTransform: "uppercase",
    color: Theme.textSecondary,
    marginBottom: 8,
    marginTop: 10,
  },
  labelInline: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.3,
    textTransform: "uppercase",
    color: Theme.textSecondary,
  },
  input: {
    borderWidth: 1,
    borderColor: Theme.surfaceBorder,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
    color: Theme.textPrimary,
    backgroundColor: Theme.surface,
  },
  readonly: {
    fontSize: 14,
    color: Theme.textSecondary,
    lineHeight: 20,
    marginBottom: 8,
  },
  visRow: { flexDirection: "row", gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: Theme.surfaceGray,
  },
  chipOn: { backgroundColor: Theme.primary },
  chipText: { fontSize: 13, fontWeight: "700", color: Theme.textSecondary },
  chipTextOn: { color: "#fff" },
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 18,
    marginBottom: 8,
  },
  inviteBtn: { flexDirection: "row", alignItems: "center", gap: 6 },
  inviteBtnText: { color: Theme.primary, fontWeight: "700", fontSize: 13 },
  invitePanel: {
    borderWidth: 1,
    borderColor: Theme.surfaceBorder,
    borderRadius: 14,
    padding: 10,
    marginBottom: 10,
    backgroundColor: Theme.surface,
  },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
  },
  memberName: { flex: 1, fontSize: 14, fontWeight: "700", color: Theme.textPrimary },
  memberRole: { fontSize: 11, color: Theme.textSecondary, marginTop: 1 },
  check: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: Theme.surfaceBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  checkOn: { backgroundColor: Theme.primary, borderColor: Theme.primary },
  checkMark: { color: "#fff", fontSize: 11, fontWeight: "800" },
  primaryBtn: {
    marginTop: 8,
    height: 40,
    borderRadius: 12,
    backgroundColor: Theme.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  dangerBtn: {
    marginTop: 14,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#FECACA",
    backgroundColor: "#FEF2F2",
    alignItems: "center",
    justifyContent: "center",
  },
  dangerText: { color: "#B91C1C", fontWeight: "700", fontSize: 14 },
  error: { marginTop: 12, color: "#B91C1C", fontSize: 13, fontWeight: "600" },
});
