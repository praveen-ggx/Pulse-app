/**
 * Desktop Slack-style composer.
 * Features: reply preview banner, character counter, formatting shortcuts,
 * typing callback, attach + emoji picker + send toolbar.
 */
import { Theme } from "@/constants/Theme";
import {
  ChatReplyComposerBanner,
  type ReplyPreviewData,
} from "@/features/chat/components/shared/ChatReplyPreview";
import {
  Mic,
  Paperclip,
  Send,
  Smile,
} from "lucide-react-native";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type TextStyle,
} from "react-native";
import { ChatAnimatedEmoji } from "@/features/chat/components/shared/ChatAnimatedEmoji";
import { ChatComposerMarkdownInput } from "@/features/chat/components/shared/ChatComposerMarkdownInput";
import { CHAT_DESKTOP_COMPOSER_EMOJIS } from "@/features/chat/utils/chatEmojiAnim.util";
import {
  finalizeOutgoingMarkdown,
  toggleMarkdownFormat,
} from "@/features/chat/utils/chatMessageMarkdown.util";
import { SLACK_DESKTOP, slackDesktopStyles as st } from "./chatSlackDesktop.styles";

const INPUT_WEB: TextStyle = Platform.OS === "web" ? {} : {};
const MAX_LENGTH = 4_000;
const TOOLBAR_ICON_SIZE = 15;

function ComposerToolbarIcon({
  children,
}: {
  children: React.ReactNode;
}) {
  return <View style={styles.toolIconSlot}>{children}</View>;
}

export function ChatSlackDesktopComposer({
  value,
  onChangeText,
  onSend,
  onOpenAttach,
  quickMessages = [],
  placeholder = "Message",
  replyContext,
  onCancelReply,
  onUserTyping,
}: {
  value: string;
  onChangeText: (v: string) => void;
  onSend: (text?: string) => void;
  onOpenAttach?: () => void;
  quickMessages?: string[];
  placeholder?: string;
  /** Reply context — shows reply banner above the composer box. */
  replyContext?: ReplyPreviewData | null;
  /** Called when user cancels the pending reply. */
  onCancelReply?: () => void;
  /** Called on every keystroke for typing indicator. */
  onUserTyping?: () => void;
}) {
  const canSend = value.trim().length > 0 && value.length <= MAX_LENGTH;
  const charCount = value.length;
  const nearLimit = charCount >= MAX_LENGTH * 0.85;
  const overLimit = charCount > MAX_LENGTH;

  const quickCursor = useRef(0);
  const inputRef = useRef<TextInput | null>(null);
  const [formatActive, setFormatActive] = useState<"bold" | "italic" | "code" | null>(null);
  const [showEmojiPanel, setShowEmojiPanel] = useState(false);

  useEffect(() => {
    if (!replyContext) return;
    // Move focus to the composer when Reply is selected from hover actions.
    inputRef.current?.focus();
  }, [replyContext]);

  const handleChangeText = useCallback(
    (text: string) => {
      onChangeText(text);
      onUserTyping?.();
    },
    [onChangeText, onUserTyping],
  );

  const applySuggestion = () => {
    setShowEmojiPanel(false);
    const fallback = "On it. Sharing an update shortly.";
    const suggestion =
      quickMessages.length > 0
        ? quickMessages[quickCursor.current % quickMessages.length] ?? fallback
        : fallback;
    quickCursor.current += 1;
    onChangeText(suggestion);
  };

  const toggleEmojiPanel = useCallback(() => {
    setShowEmojiPanel((open) => !open);
  }, []);

  const applyQuickEmoji = useCallback(
    (emoji: string) => {
      const next = value.trim().length > 0 ? `${value} ${emoji}` : emoji;
      handleChangeText(next);
      setShowEmojiPanel(false);
      inputRef.current?.focus();
    },
    [handleChangeText, value],
  );

  const submitMessage = useCallback(() => {
    const raw = value.trim();
    if (!raw || raw.length > MAX_LENGTH) return;
    const outgoing = finalizeOutgoingMarkdown(raw, {
      bold: formatActive === "bold",
      italic: formatActive === "italic",
      code: formatActive === "code",
    });
    setFormatActive(null);
    setShowEmojiPanel(false);
    onSend(outgoing);
  }, [value, formatActive, onSend]);

  /** Toggle markdown format — highlight for next send, or wrap existing text. */
  const applyFormat = (fmt: "bold" | "italic" | "code") => {
    if (!value.trim()) {
      setFormatActive((v) => (v === fmt ? null : fmt));
      return;
    }
    const { nextText, active } = toggleMarkdownFormat(value, fmt);
    handleChangeText(nextText);
    setFormatActive(active ? fmt : null);
  };

  const hasDraft = value.trim().length > 0;

  return (
    <View>
      {replyContext ? (
        <ChatReplyComposerBanner
          reply={replyContext}
          onCancel={() => onCancelReply?.()}
          variant="desktop"
        />
      ) : null}
      <View style={st.composerWrap}>
        <View style={[st.composerBox, hasDraft && st.composerBoxActive]}>
          <ChatComposerMarkdownInput
            ref={inputRef}
            style={[st.composerInput, INPUT_WEB]}
            value={value}
            onChangeText={handleChangeText}
            placeholder={placeholder}
            placeholderTextColor={SLACK_DESKTOP.textTertiary}
            pendingFormat={{
              bold: formatActive === "bold",
              italic: formatActive === "italic",
              code: formatActive === "code",
            }}
            multiline
            scrollEnabled
            blurOnSubmit={false}
            textAlign="left"
            textAlignVertical="top"
            maxLength={MAX_LENGTH + 50}
            submitOnEnter
            onSubmit={submitMessage}
          />
          {showEmojiPanel ? (
            <View style={styles.emojiPanel}>
              <View style={styles.emojiGrid}>
                {CHAT_DESKTOP_COMPOSER_EMOJIS.map((emoji) => (
                  <TouchableOpacity
                    key={emoji}
                    style={styles.emojiBtn}
                    onPress={() => applyQuickEmoji(emoji)}
                    activeOpacity={0.75}
                    accessibilityRole="button"
                    accessibilityLabel={`Insert ${emoji}`}
                  >
                    <ChatAnimatedEmoji emoji={emoji} size="md" />
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ) : null}
          <View style={styles.toolbar}>
            <View style={styles.toolbarLeft}>
              <TouchableOpacity
                style={[styles.toolBtn, formatActive === "bold" && styles.toolBtnActive]}
                hitSlop={6}
                onPress={() => applyFormat("bold")}
                accessibilityRole="button"
                accessibilityLabel="Bold"
              >
                <Text
                  style={[
                    styles.fmtGlyph,
                    styles.fmtGlyphBold,
                    formatActive === "bold" && styles.fmtGlyphActive,
                  ]}
                >
                  B
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.toolBtn, formatActive === "italic" && styles.toolBtnActive]}
                hitSlop={6}
                onPress={() => applyFormat("italic")}
                accessibilityRole="button"
                accessibilityLabel="Italic"
              >
                <Text
                  style={[
                    styles.fmtGlyph,
                    styles.fmtGlyphItalic,
                    formatActive === "italic" && styles.fmtGlyphActive,
                  ]}
                >
                  I
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.toolBtn, formatActive === "code" && styles.toolBtnActive]}
                hitSlop={6}
                onPress={() => applyFormat("code")}
                accessibilityRole="button"
                accessibilityLabel="Code"
              >
                <Text
                  style={[
                    styles.fmtGlyph,
                    styles.fmtGlyphCode,
                    formatActive === "code" && styles.fmtGlyphActive,
                  ]}
                >
                  {"</>"}
                </Text>
              </TouchableOpacity>

              <View style={styles.toolSep} />

              {onOpenAttach ? (
                <TouchableOpacity onPress={onOpenAttach} style={styles.toolBtn} hitSlop={6} accessibilityRole="button" accessibilityLabel="Attach file">
                  <ComposerToolbarIcon>
                    <Paperclip size={TOOLBAR_ICON_SIZE} color={SLACK_DESKTOP.textTertiary} strokeWidth={2} />
                  </ComposerToolbarIcon>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                style={[styles.toolBtn, showEmojiPanel && styles.toolBtnActive]}
                hitSlop={6}
                onPress={toggleEmojiPanel}
                accessibilityRole="button"
                accessibilityLabel="Open emoji picker"
              >
                <ComposerToolbarIcon>
                  <Smile
                    size={TOOLBAR_ICON_SIZE}
                    color={showEmojiPanel ? Theme.primary : SLACK_DESKTOP.textTertiary}
                    strokeWidth={2}
                  />
                </ComposerToolbarIcon>
              </TouchableOpacity>
              <TouchableOpacity style={styles.toolBtn} hitSlop={6} onPress={applySuggestion} accessibilityRole="button" accessibilityLabel="Quick send suggestion">
                <ComposerToolbarIcon>
                  <Mic size={TOOLBAR_ICON_SIZE} color={SLACK_DESKTOP.textTertiary} strokeWidth={2} />
                </ComposerToolbarIcon>
              </TouchableOpacity>
            </View>

            <View style={styles.toolbarRight}>
              {nearLimit ? (
                <Text style={[styles.charCount, overLimit && styles.charCountOver]}>
                  {charCount}/{MAX_LENGTH}
                </Text>
              ) : null}
              <TouchableOpacity
                onPress={submitMessage}
                disabled={!canSend}
                style={[styles.sendBtn, canSend && styles.sendBtnReady, !canSend && styles.sendBtnOff]}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel="Send message"
              >
                <ComposerToolbarIcon>
                  <Send
                    size={TOOLBAR_ICON_SIZE}
                    color={canSend ? Theme.buttonPrimaryText : SLACK_DESKTOP.textTertiary}
                    strokeWidth={2.25}
                  />
                </ComposerToolbarIcon>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  emojiPanel: {
    marginTop: 4,
    marginBottom: 2,
    paddingVertical: 8,
    paddingHorizontal: 2,
    backgroundColor: "#FAFAFA",
  },
  emojiGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    justifyContent: "flex-start",
  },
  emojiBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    ...(Platform.OS === "web" ? ({ cursor: "pointer" } as object) : {}),
  },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: SLACK_DESKTOP.border,
  },
  toolbarLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    minHeight: 32,
  },
  toolbarRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 32,
  },
  toolBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    ...(Platform.OS === "web" ? ({ display: "flex", cursor: "pointer" } as object) : {}),
  },
  toolIconSlot: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    ...(Platform.OS === "web" ? ({ display: "flex" } as object) : {}),
  },
  toolBtnActive: {
    backgroundColor: Theme.brandBlueWash,
  },
  fmtGlyph: {
    fontSize: 14,
    lineHeight: 16,
    color: SLACK_DESKTOP.textTertiary,
    textAlign: "center",
    ...(Platform.OS === "android" ? { includeFontPadding: false } : {}),
    ...(Platform.OS === "web"
      ? ({ userSelect: "none", lineHeight: "16px" } as unknown as TextStyle)
      : {}),
  },
  fmtGlyphBold: {
    fontWeight: "700",
  },
  fmtGlyphItalic: {
    fontStyle: "italic",
    fontWeight: "600",
  },
  fmtGlyphCode: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: -0.3,
    fontFamily: Platform.select({
      web: "ui-monospace, SFMono-Regular, Menlo, monospace",
      ios: "Menlo",
      android: "monospace",
      default: "monospace",
    }),
  },
  fmtGlyphActive: {
    color: Theme.primary,
  },
  toolSep: {
    width: StyleSheet.hairlineWidth,
    height: 18,
    backgroundColor: SLACK_DESKTOP.border,
    marginHorizontal: 6,
    alignSelf: "center",
  },
  charCount: {
    fontSize: 10,
    fontWeight: "500",
    color: SLACK_DESKTOP.textTertiary,
  },
  charCountOver: {
    color: "#EF4444",
    fontWeight: "700",
  },
  sendBtn: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.surfaceGray,
    borderWidth: 1,
    borderColor: SLACK_DESKTOP.border,
    borderRadius: Theme.buttonPrimaryRadius,
    ...(Platform.OS === "web" ? ({ cursor: "pointer" } as object) : {}),
  },
  sendBtnReady: {
    backgroundColor: Theme.buttonPrimary,
    borderWidth: Theme.buttonPrimaryBorderWidth,
    borderColor: Theme.buttonPrimaryBorder,
  },
  sendBtnOff: {
    opacity: 0.72,
  },
});
