/**
 * Mobile message composer — Slack-style enterprise-grade layout.
 * Features: pill input, formatting bar, reply banner, emoji/script quick panel,
 * animated send button, char counter, typing callback.
 */
import { ChatPartyAvatar } from "@/features/chat/components/ChatPartyAvatar";
import {
  ChatReplyComposerBanner,
  type ReplyPreviewData,
} from "@/features/chat/components/shared/ChatReplyPreview";
import { useOptionalAuth } from "@/contexts/AuthContext";
import { useOptionalOrganization } from "@/contexts/OrganizationContext";
import {
  CHAT_ACCENT_BORDER,
  CHAT_SEND_BG,
  CHAT_SURFACE,
  CHAT_TEXT_MUTED,
  CHAT_TEXT_PRIMARY,
} from "@/features/chat/chatTheme";
import { CHAT_MOBILE } from "@/features/chat/chatMobileLayout";
import { ChatAnimatedEmoji } from "@/features/chat/components/shared/ChatAnimatedEmoji";
import { CHAT_QUICK_PANEL_EMOJIS } from "@/features/chat/utils/chatEmojiAnim.util";
import { ChatComposerMarkdownInput } from "@/features/chat/components/shared/ChatComposerMarkdownInput";
import {
  finalizeOutgoingMarkdown,
  toggleMarkdownFormat,
} from "@/features/chat/utils/chatMessageMarkdown.util";
import { Theme } from "@/constants/Theme";
import { withWebSafeShadows } from "@/lib/platformViewStyle.util";
import {
  Mic,
  Paperclip,
  Plus,
  Smile,
} from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type TextStyle,
} from "react-native";

const INPUT_WEB: TextStyle =
  Platform.OS === "web"
    ? ({ outlineStyle: "none" } as unknown as TextStyle)
    : {};

export type ChatMobileComposerProps = {
  value: string;
  onChangeText: (text: string) => void;
  onSend: (text?: string) => void;
  onOpenAttach?: () => void;
  quickMessages?: string[];
  hideQuickChips?: boolean;
  placeholder?: string;
  variant?: "default" | "slack";
  replyContext?: ReplyPreviewData | null;
  onCancelReply?: () => void;
  onUserTyping?: () => void;
  maxLength?: number;
};

export function ChatMobileComposer({
  value,
  onChangeText,
  onSend,
  onOpenAttach,
  quickMessages = [],
  hideQuickChips = false,
  placeholder = "Message",
  variant = "default",
  replyContext,
  onCancelReply,
  onUserTyping,
  maxLength = 4000,
}: ChatMobileComposerProps) {
  const auth = useOptionalAuth();
  const orgCtx = useOptionalOrganization();
  const profile = auth?.profile;
  const canSend = value.trim().length > 0 && value.length <= maxLength;
  const [showQuickPanel, setShowQuickPanel] = useState(false);
  const [quickPanelMode, setQuickPanelMode] = useState<"emoji" | "scripts">("emoji");
  const [boldActive, setBoldActive] = useState(false);
  const [italicActive, setItalicActive] = useState(false);

  const sendScale = useRef(new Animated.Value(1)).current;
  const sendRotate = useRef(new Animated.Value(canSend ? 1 : 0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(sendScale, {
        toValue: canSend ? 1 : 0.9,
        useNativeDriver: true,
        speed: 20,
        bounciness: 5,
      }),
      Animated.timing(sendRotate, {
        toValue: canSend ? 1 : 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
  }, [canSend, sendScale, sendRotate]);

  const charCount = value.length;
  const nearLimit = charCount >= maxLength * 0.85;
  const overLimit = charCount > maxLength;

  const submit = useCallback(() => {
    if (!canSend) return;
    setShowQuickPanel(false);
    const outgoing = finalizeOutgoingMarkdown(value.trim(), {
      bold: boldActive,
      italic: italicActive,
    });
    setBoldActive(false);
    setItalicActive(false);
    onSend(outgoing);
  }, [canSend, onSend, value, boldActive, italicActive]);

  const handleChangeText = useCallback(
    (text: string) => {
      onChangeText(text);
      onUserTyping?.();
    },
    [onChangeText, onUserTyping],
  );

  const applyFormat = useCallback(
    (fmt: "bold" | "italic") => {
      if (!value.trim()) {
        if (fmt === "bold") setBoldActive((v) => !v);
        else setItalicActive((v) => !v);
        return;
      }
      const { nextText, active } = toggleMarkdownFormat(value, fmt);
      onChangeText(nextText);
      if (fmt === "bold") setBoldActive(active);
      else setItalicActive(active);
    },
    [value, onChangeText],
  );

  const applyQuickScript = useCallback(
    (msg: string) => {
      onChangeText(msg);
      setShowQuickPanel(false);
    },
    [onChangeText],
  );

  const applyQuickEmoji = useCallback(
    (emoji: string) => {
      const next = value.trim().length > 0 ? `${value} ${emoji}` : emoji;
      onChangeText(next);
      setShowQuickPanel(false);
    },
    [onChangeText, value],
  );

  const toggleEmojiPanel = useCallback(() => {
    setQuickPanelMode("emoji");
    setShowQuickPanel((v) => !v);
  }, []);

  const toggleScriptPanel = useCallback(() => {
    setQuickPanelMode("scripts");
    setShowQuickPanel((v) => !v);
  }, []);

  // ── Slack variant ──────────────────────────────────────────────────────────
  if (variant === "slack") {
    return (
      <View style={sl.root}>
        {/* Reply banner */}
        {replyContext ? (
          <ChatReplyComposerBanner
            reply={replyContext}
            onCancel={() => onCancelReply?.()}
            variant="mobile"
          />
        ) : null}

        {/* Quick panel (emoji / scripts) */}
        {showQuickPanel ? (
          <View style={sl.quickPanel}>
            <View style={sl.quickTabs}>
              <TouchableOpacity
                style={[sl.quickTab, quickPanelMode === "emoji" && sl.quickTabActive]}
                onPress={() => setQuickPanelMode("emoji")}
                activeOpacity={0.8}
              >
                <Text style={[sl.quickTabText, quickPanelMode === "emoji" && sl.quickTabTextActive]}>
                  Emoji
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[sl.quickTab, quickPanelMode === "scripts" && sl.quickTabActive]}
                onPress={() => setQuickPanelMode("scripts")}
                activeOpacity={0.8}
              >
                <Text style={[sl.quickTabText, quickPanelMode === "scripts" && sl.quickTabTextActive]}>
                  Quick Reply
                </Text>
              </TouchableOpacity>
            </View>
            <View style={sl.quickContent}>
              {quickPanelMode === "emoji" ? (
                <View style={sl.emojiGrid}>
                  {CHAT_QUICK_PANEL_EMOJIS.map((emoji) => (
                    <TouchableOpacity
                      key={emoji}
                      style={sl.emojiBtn}
                      onPress={() => applyQuickEmoji(emoji)}
                      activeOpacity={0.75}
                    >
                      <ChatAnimatedEmoji emoji={emoji} size="lg" />
                    </TouchableOpacity>
                  ))}
                </View>
              ) : (
                <ScrollView
                  horizontal
                  keyboardShouldPersistTaps="handled"
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={sl.scriptRow}
                >
                  {quickMessages.length > 0 ? (
                    quickMessages.slice(0, 8).map((m, i) => (
                      <TouchableOpacity
                        key={`${i}-${m.slice(0, 12)}`}
                        style={sl.scriptChip}
                        onPress={() => applyQuickScript(m)}
                        activeOpacity={0.8}
                      >
                        <Text style={sl.scriptChipText} numberOfLines={2}>
                          {m}
                        </Text>
                      </TouchableOpacity>
                    ))
                  ) : (
                    <Text style={sl.scriptEmpty}>No quick replies yet.</Text>
                  )}
                </ScrollView>
              )}
            </View>
          </View>
        ) : null}

        {/* Main composer box — Slack-style bordered card */}
        <View style={sl.composerCard}>
          {/* Input row */}
          <View style={sl.inputRow}>
            <TouchableOpacity
              style={sl.sideBtn}
              onPress={onOpenAttach ? onOpenAttach : toggleScriptPanel}
              hitSlop={8}
              activeOpacity={0.72}
              accessibilityRole="button"
              accessibilityLabel="Add attachment or quick action"
            >
              <Plus size={18} color="#616061" strokeWidth={2} />
            </TouchableOpacity>

            <ChatComposerMarkdownInput
              style={[sl.input, INPUT_WEB]}
              value={value}
              onChangeText={handleChangeText}
              placeholder={placeholder}
              placeholderTextColor="#9CA3AF"
              pendingFormat={{ bold: boldActive, italic: italicActive }}
              multiline
              // Keep web textarea at 1 row until content grows — avoids tall
              // boxes with top-aligned text sitting above the side buttons.
              {...(Platform.OS === "web"
                ? ({ rows: Math.min(4, Math.max(1, value.split("\n").length)) } as object)
                : { numberOfLines: 1 })}
              scrollEnabled
              blurOnSubmit={false}
              returnKeyType="default"
              textAlignVertical="center"
              autoCorrect
              autoCapitalize="sentences"
              maxLength={maxLength + 50}
              submitOnEnter
              onSubmit={submit}
            />

            <TouchableOpacity
              style={sl.sideBtn}
              onPress={toggleEmojiPanel}
              hitSlop={8}
              activeOpacity={0.72}
              accessibilityRole="button"
              accessibilityLabel="Open emoji picker"
            >
              <Smile
                size={18}
                color={
                  showQuickPanel && quickPanelMode === "emoji"
                    ? Theme.primary
                    : "#616061"
                }
                strokeWidth={1.9}
              />
            </TouchableOpacity>

            <Animated.View style={{ transform: [{ scale: sendScale }] }}>
              <TouchableOpacity
                style={[sl.sendBtn, canSend && sl.sendBtnActive]}
                onPress={submit}
                disabled={!canSend}
                activeOpacity={0.82}
                accessibilityRole="button"
                accessibilityLabel={canSend ? "Send message" : "Voice note"}
              >
                {canSend ? (
                  <Text style={sl.sendArrow}>↑</Text>
                ) : (
                  <Mic size={16} color="#9CA3AF" strokeWidth={1.9} />
                )}
              </TouchableOpacity>
            </Animated.View>
          </View>

          {/* Formatting toolbar */}
          <View style={sl.fmtBar}>
            <TouchableOpacity
              style={[sl.fmtBtn, boldActive && sl.fmtBtnActive]}
              onPress={() => applyFormat("bold")}
              hitSlop={6}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityLabel="Bold"
            >
              <Text style={[sl.fmtGlyph, sl.fmtGlyphBold, boldActive && sl.fmtGlyphActive]}>B</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[sl.fmtBtn, italicActive && sl.fmtBtnActive]}
              onPress={() => applyFormat("italic")}
              hitSlop={6}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityLabel="Italic"
            >
              <Text style={[sl.fmtGlyph, sl.fmtGlyphItalic, italicActive && sl.fmtGlyphActive]}>I</Text>
            </TouchableOpacity>
            <View style={sl.fmtSep} />
            {onOpenAttach ? (
              <TouchableOpacity
                style={sl.fmtBtn}
                onPress={onOpenAttach}
                hitSlop={6}
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityLabel="Attach file"
              >
                <Paperclip size={14} color="#9CA3AF" strokeWidth={1.9} />
              </TouchableOpacity>
            ) : null}
            {nearLimit ? (
              <Text style={[sl.charCount, overLimit && sl.charCountOver]}>
                {charCount}/{maxLength}
              </Text>
            ) : null}
          </View>
        </View>
      </View>
    );
  }

  // ── Default variant (legacy) ───────────────────────────────────────────────
  return (
    <View style={styles.wrap}>
      {replyContext ? (
        <ChatReplyComposerBanner
          reply={replyContext}
          onCancel={() => onCancelReply?.()}
          variant="mobile"
        />
      ) : null}
      {!hideQuickChips && quickMessages.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.chipRow}
        >
          {quickMessages.map((m, i) => (
            <TouchableOpacity
              key={`${i}-${m.slice(0, 12)}`}
              style={styles.chip}
              onPress={() => onChangeText(m)}
              activeOpacity={0.75}
            >
              <Text style={styles.chipText} numberOfLines={1}>
                {m}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      ) : null}
      <View style={styles.shell}>
        <ChatPartyAvatar
          identity={{
            displayName: profile?.full_name || profile?.displayName || "You",
            entityType: "client",
          }}
          isOwnUser
          userName={profile?.full_name || profile?.displayName || "You"}
          userAvatarUrl={profile?.avatar_url ?? null}
          userAvatarSeed={profile?.avatar_seed ?? null}
          userOrgLogoUrl={orgCtx?.currentOrganization?.logo_url ?? null}
          userOrgOwnerAvatarSeed={profile?.avatar_seed ?? null}
          size={28}
        />
        <View style={styles.fieldRow}>
          <TextInput
            style={[styles.input, INPUT_WEB]}
            value={value}
            onChangeText={handleChangeText}
            placeholder={placeholder}
            placeholderTextColor={CHAT_TEXT_MUTED}
            multiline
            scrollEnabled
            blurOnSubmit={false}
            returnKeyType="default"
            textAlignVertical="top"
            autoCorrect
            autoCapitalize="sentences"
            maxLength={maxLength}
            onKeyPress={(e) => {
              if (Platform.OS !== "web") return;
              const key = e.nativeEvent.key;
              const shiftKey = Boolean(
                (e.nativeEvent as { shiftKey?: boolean }).shiftKey,
              );
              if (key === "Enter" && !shiftKey) {
                (e as unknown as { preventDefault?: () => void }).preventDefault?.();
                submit();
              }
            }}
            {...(Platform.OS === "web"
              ? ({
                  onKeyDown: (e: {
                    key: string;
                    shiftKey: boolean;
                    isComposing?: boolean;
                    preventDefault: () => void;
                  }) => {
                    if (e.isComposing) return;
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      submit();
                    }
                  },
                } as object)
              : null)}
          />
          {onOpenAttach ? (
            <TouchableOpacity
              style={styles.attachBtn}
              onPress={onOpenAttach}
              hitSlop={8}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityLabel="Attach file"
            >
              <Paperclip size={16} color={CHAT_TEXT_MUTED} strokeWidth={1.8} />
            </TouchableOpacity>
          ) : null}
        </View>
        <Animated.View style={{ transform: [{ scale: sendScale }] }}>
          <TouchableOpacity
            style={[styles.sendBtn, !canSend && styles.sendBtnOff]}
            onPress={submit}
            disabled={!canSend}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Send message"
          >
            <Text style={[styles.sendBtnText, !canSend && styles.sendBtnTextOff]}>
              Send
            </Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </View>
  );
}

// ── Slack variant styles ───────────────────────────────────────────────────────
const sl = withWebSafeShadows(
  StyleSheet.create({
  root: {
    backgroundColor: "#FFFFFF",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#DDDDDD",
  },
  quickPanel: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#EBEBEB",
    backgroundColor: "#FAFAFA",
    maxHeight: 160,
  },
  quickTabs: {
    flexDirection: "row",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#EBEBEB",
  },
  quickTab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
  },
  quickTabActive: {
    borderBottomWidth: 2,
    borderBottomColor: Theme.primary,
  },
  quickTabText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#9CA3AF",
    letterSpacing: 0.2,
  },
  quickTabTextActive: {
    color: Theme.primary,
  },
  quickContent: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  emojiGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  emojiBtn: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F3F4F6",
  },
  scriptRow: {
    gap: 8,
    alignItems: "center",
  },
  scriptChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(91, 94, 244, 0.3)",
    backgroundColor: "rgba(91, 94, 244, 0.06)",
    maxWidth: 240,
  },
  scriptChipText: {
    fontSize: 12,
    fontWeight: "500",
    color: CHAT_TEXT_PRIMARY,
  },
  scriptEmpty: {
    fontSize: 12,
    color: CHAT_TEXT_MUTED,
    paddingVertical: 4,
  },
  composerCard: {
    marginHorizontal: 12,
    marginTop: 6,
    marginBottom: 2,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#D4D4D8",
    backgroundColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
    overflow: "hidden",
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 6,
    paddingVertical: 6,
    gap: 2,
    minHeight: 44,
  },
  sideBtn: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    flexShrink: 0,
  },
  input: {
    // Width only — do not use flex:1 here. The markdown wrap is a column;
    // flex:1 on the TextInput stretches its height on web while textarea
    // text stays top-aligned, so the caret/text sit above + / send.
    width: "100%",
    minWidth: 0,
    minHeight: 32,
    maxHeight: CHAT_MOBILE.composerMaxHeight,
    paddingHorizontal: 4,
    // Optical vertical center for lineHeight 18 inside 32px row.
    paddingTop: 7,
    paddingBottom: 7,
    fontSize: 14,
    lineHeight: 18,
    color: CHAT_TEXT_PRIMARY,
    ...(Platform.OS === "android" ? { includeFontPadding: false } : {}),
    ...(Platform.OS === "web"
      ? ({
          resize: "none",
          boxSizing: "border-box",
          verticalAlign: "middle",
        } as object)
      : {}),
  },
  sendBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F3F4F6",
    flexShrink: 0,
  },
  sendBtnActive: {
    backgroundColor: Theme.buttonPrimary,
    borderWidth: Theme.buttonPrimaryBorderWidth,
    borderColor: Theme.buttonPrimaryBorder,
    borderRadius: Theme.buttonPrimaryRadius,
  },
  sendArrow: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
    lineHeight: 18,
    textAlign: "center",
    ...(Platform.OS === "android" ? { includeFontPadding: false } : {}),
  },
  fmtBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#EFEFEF",
    gap: 2,
    minHeight: 32,
  },
  fmtBtn: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 6,
    flexShrink: 0,
    ...(Platform.OS === "web" ? ({ display: "flex" } as object) : {}),
  },
  fmtBtnActive: {
    backgroundColor: "rgba(91, 94, 244, 0.1)",
  },
  fmtGlyph: {
    fontSize: 13,
    lineHeight: 16,
    color: "#9CA3AF",
    textAlign: "center",
    ...(Platform.OS === "android" ? { includeFontPadding: false } : {}),
  },
  fmtGlyphBold: {
    fontWeight: "700",
  },
  fmtGlyphItalic: {
    fontStyle: "italic",
    fontWeight: "600",
  },
  fmtGlyphActive: {
    color: Theme.primary,
  },
  fmtSep: {
    width: StyleSheet.hairlineWidth,
    height: 14,
    backgroundColor: "#E5E7EB",
    marginHorizontal: 4,
    alignSelf: "center",
  },
  charCount: {
    marginLeft: "auto",
    fontSize: 10,
    fontWeight: "500",
    color: "#9CA3AF",
    paddingRight: 4,
  },
  charCountOver: {
    color: "#EF4444",
    fontWeight: "700",
  },
  }),
);

// ── Default variant styles ─────────────────────────────────────────────────────
const styles = StyleSheet.create({
  wrap: {
    backgroundColor: CHAT_SURFACE,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: CHAT_ACCENT_BORDER,
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 6,
  },
  chipRow: {
    paddingBottom: 6,
    gap: 6,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: CHAT_SURFACE,
    borderWidth: 1,
    borderColor: CHAT_ACCENT_BORDER,
    maxWidth: 200,
  },
  chipText: {
    fontSize: 10,
    color: CHAT_TEXT_PRIMARY,
    fontWeight: "600",
  },
  shell: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    borderWidth: 1,
    borderColor: CHAT_ACCENT_BORDER,
    borderRadius: 10,
    backgroundColor: CHAT_SURFACE,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  fieldRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-end",
    minWidth: 0,
    gap: 4,
  },
  attachBtn: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  input: {
    flex: 1,
    minWidth: 0,
    minHeight: CHAT_MOBILE.composerMinHeight,
    maxHeight: CHAT_MOBILE.composerMaxHeight,
    paddingHorizontal: 4,
    paddingTop: Platform.OS === "ios" ? 7 : 6,
    paddingBottom: Platform.OS === "ios" ? 7 : 6,
    fontSize: CHAT_MOBILE.composerFontSize,
    lineHeight: CHAT_MOBILE.composerLineHeight,
    color: CHAT_TEXT_PRIMARY,
  },
  sendBtn: {
    minWidth: CHAT_MOBILE.sendBtnMinWidth,
    height: CHAT_MOBILE.sendBtnHeight,
    borderRadius: 8,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: CHAT_SEND_BG,
    marginBottom: 1,
  },
  sendBtnOff: {
    backgroundColor: "#E4E6EF",
  },
  sendBtnText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#FFFFFF",
    letterSpacing: 0.2,
  },
  sendBtnTextOff: {
    color: CHAT_TEXT_MUTED,
  },
});
