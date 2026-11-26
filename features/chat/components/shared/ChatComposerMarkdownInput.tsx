import { Theme } from "@/constants/Theme";
import type { ChatPendingFormat } from "@/features/chat/utils/chatMessageMarkdown.util";
import {
  getComposerMarkdownPreviewSource,
  shouldShowComposerMarkdownPreview,
} from "@/features/chat/utils/chatMessageMarkdown.util";
import {
  renderChatComposerPendingPreview,
  renderChatComposerPreview,
} from "@/features/chat/utils/chatInlineMarkdown.util";
import React, { useCallback, useMemo } from "react";
import {
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
} from "react-native";

const TRANSPARENT_INPUT: TextStyle =
  Platform.OS === "web"
    ? ({
        color: "transparent",
        WebkitTextFillColor: "transparent",
      } as TextStyle)
    : { color: "transparent" };

// `caretColor` is a web-only prop RN Web forwards to the input; not present in RN TextInput types.
const CARET_PROP: Record<string, unknown> = { caretColor: Theme.primary };

type ChatComposerMarkdownInputProps = {
  value: string;
  onChangeText: (text: string) => void;
  style?: StyleProp<TextStyle>;
  pendingFormat?: ChatPendingFormat;
  /** Web: Enter sends; Shift+Enter inserts a newline. */
  submitOnEnter?: boolean;
  onSubmit?: () => void;
} & Omit<TextInputProps, "value" | "onChangeText" | "style">;

export const ChatComposerMarkdownInput = React.forwardRef<
  TextInput,
  ChatComposerMarkdownInputProps
>(function ChatComposerMarkdownInput(
  {
    value,
    onChangeText,
    style,
    pendingFormat = {},
    placeholderTextColor,
    submitOnEnter = false,
    onSubmit,
    onKeyPress,
    ...rest
  },
  ref,
) {
  const flatStyle = StyleSheet.flatten(style) ?? {};
  const showPreview = shouldShowComposerMarkdownPreview(value, pendingFormat);

  const previewSource = useMemo(
    () => getComposerMarkdownPreviewSource(value, pendingFormat),
    [value, pendingFormat],
  );

  const hasLiteralMarkers = /\*\*|_|`/.test(value);
  const previewNodes = useMemo(() => {
    if (!showPreview) return null;
    if (!hasLiteralMarkers && (pendingFormat.bold || pendingFormat.italic || pendingFormat.code)) {
      return renderChatComposerPendingPreview(value, pendingFormat);
    }
    return renderChatComposerPreview(previewSource);
  }, [showPreview, hasLiteralMarkers, pendingFormat, value, previewSource]);

  const handleKeyPress = useCallback(
    (e: Parameters<NonNullable<TextInputProps["onKeyPress"]>>[0]) => {
      onKeyPress?.(e);
      if (!submitOnEnter || !onSubmit) return;
      if (Platform.OS !== "web") return;
      const key = e.nativeEvent.key;
      const shiftKey = Boolean(
        (e.nativeEvent as { shiftKey?: boolean }).shiftKey,
      );
      if (key === "Enter" && !shiftKey) {
        // Prevent newline; send instead.
        (
          e as unknown as { preventDefault?: () => void }
        ).preventDefault?.();
        onSubmit();
      }
    },
    [onKeyPress, onSubmit, submitOnEnter],
  );

  // RN-web: onKeyPress sometimes misses preventDefault for Enter; also handle onKeyDown.
  const webEnterProps =
    submitOnEnter && onSubmit && Platform.OS === "web"
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
              onSubmit();
            }
          },
        } as Record<string, unknown>)
      : null;

  return (
    <View style={styles.wrap}>
      {previewNodes ? (
        <Text
          style={[flatStyle, styles.previewLayer]}
          pointerEvents="none"
          accessible={false}
          importantForAccessibility="no-hide-descendants"
        >
          {previewNodes}
        </Text>
      ) : null}
      <TextInput
        ref={ref}
        {...rest}
        {...(webEnterProps as object)}
        value={value}
        onChangeText={onChangeText}
        onKeyPress={handleKeyPress}
        style={[flatStyle, showPreview && styles.inputLayer, showPreview && TRANSPARENT_INPUT]}
        placeholderTextColor={placeholderTextColor}
        // caretColor is a web-only CSS prop RN Web forwards via TextInput; not in RN types.
        {...(CARET_PROP as object)}
        selectionColor={Theme.brandBlueWash}
        underlineColorAndroid="transparent"
      />
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    minWidth: 0,
    width: "100%",
    position: "relative",
    // Top-left typing — never vertically/horizontally center short drafts.
    justifyContent: "flex-start",
    alignSelf: "stretch",
  },
  previewLayer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 0,
    textAlign: "left",
  },
  inputLayer: {
    position: "relative",
    zIndex: 1,
    backgroundColor: "transparent",
  },
});
