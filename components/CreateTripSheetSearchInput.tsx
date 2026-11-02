/**
 * Shared search field for Create Trip sheet modals (fleet picker, client, locations).
 * Prominent height, icon chip, focus ring, optional clear — keep in sync across flows.
 */
import Theme from "@/constants/Theme";
import { Search, X } from "lucide-react-native";
import { forwardRef, useState } from "react";
import {
  Platform,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from "react-native";

export interface CreateTripSheetSearchInputProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  autoFocus?: boolean;
  /** Margins / placement (e.g. `{ marginHorizontal: 20 }` for centered sheets). */
  shellStyle?: ViewStyle;
  showClearButton?: boolean;
  accessibilityLabel?: string;
  autoCapitalize?: TextInputProps["autoCapitalize"];
  autoCorrect?: boolean;
  spellCheck?: boolean;
  autoComplete?: TextInputProps["autoComplete"];
  selectTextOnFocus?: boolean;
  /**
   * Dense strip matching Chat trip sidebar search (`ChatScreen` tripSearchScopeSearchWrap).
   */
  compactChat?: boolean;
  /** When `compactChat`, `sm` uses smaller type (location picker modal). */
  compactChatSize?: "md" | "sm";
}

export const CreateTripSheetSearchInput = forwardRef<
  TextInput,
  CreateTripSheetSearchInputProps
>(function CreateTripSheetSearchInput(
  {
    value,
    onChangeText,
    placeholder,
    autoFocus,
    shellStyle,
    showClearButton = true,
    accessibilityLabel,
    autoCapitalize = "none",
    autoCorrect = false,
    spellCheck = false,
    autoComplete = "off",
    selectTextOnFocus = false,
    compactChat = false,
    compactChatSize = "md",
  },
  ref,
) {
  const chatSm = compactChat && compactChatSize === "sm";
  const [focused, setFocused] = useState(false);
  const webCursor =
    Platform.OS === "web"
      ? ({ cursor: "text" } as TextStyle)
      : undefined;

  return (
    <View
      style={[
        compactChat ? styles.shellChat : styles.shell,
        !compactChat && focused && styles.shellFocused,
        compactChat && focused && styles.shellChatFocused,
        shellStyle,
      ]}
    >
      {compactChat ? (
        <Search
          size={chatSm ? 11 : 12}
          color={Theme.textMuted}
          strokeWidth={2}
          style={styles.chatSearchIcon}
        />
      ) : (
        <View style={styles.iconChip}>
          <Search size={18} color={Theme.iconSlate} strokeWidth={2} />
        </View>
      )}
      <TextInput
        ref={ref}
        style={[
          compactChat ? (chatSm ? styles.inputChatSm : styles.inputChat) : styles.input,
          webCursor,
        ]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={compactChat ? Theme.textMuted : Theme.placeholder}
        autoFocus={autoFocus}
        autoCapitalize={autoCapitalize}
        autoCorrect={autoCorrect}
        spellCheck={spellCheck}
        autoComplete={autoComplete}
        selectTextOnFocus={selectTextOnFocus}
        accessibilityLabel={accessibilityLabel ?? placeholder}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        returnKeyType="search"
        clearButtonMode="never"
      />
      {showClearButton && value.trim().length > 0 ? (
        <TouchableOpacity
          onPress={() => onChangeText("")}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={styles.clearHit}
          accessibilityRole="button"
          accessibilityLabel="Clear search"
        >
          {compactChat ? (
            <X size={12} color={Theme.textMuted} strokeWidth={2.5} />
          ) : (
            <View style={styles.clearCircle}>
              <X size={14} color={Theme.iconSlate} strokeWidth={2.5} />
            </View>
          )}
        </TouchableOpacity>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  shell: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 52,
    paddingLeft: 10,
    paddingRight: 10,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 0,
    backgroundColor: Theme.surface,
    gap: 10,
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 1,
  },
  shellFocused: {
    shadowOpacity: 0.12,
    shadowRadius: 10,
  },
  iconChip: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Theme.surfaceGray,
    alignItems: "center",
    justifyContent: "center",
  },
  input: {
    flex: 1,
    minWidth: 0,
    fontSize: 16,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    paddingVertical: Platform.OS === "android" ? 4 : 6,
    borderWidth: 0,
    ...Platform.select({
      web: { outlineStyle: "none" } as unknown as TextStyle,
    }),
  },
  clearHit: {
    justifyContent: "center",
    alignItems: "center",
  },
  clearCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Theme.surfaceBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  shellChat: {
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 10,
    paddingRight: 10,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
    gap: 6,
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  shellChatFocused: {
    borderColor: Theme.borderMedium,
    ...Platform.select({
      web: {
        boxShadow: "0 1px 4px rgba(15,23,42,0.06)",
      } as object,
      default: {},
    }),
  },
  chatSearchIcon: {
    marginRight: 0,
  },
  inputChat: {
    flex: 1,
    minWidth: 0,
    fontSize: 11,
    fontWeight: "500",
    color: Theme.textPrimaryDark,
    paddingVertical: Platform.OS === "android" ? 2 : 0,
    borderWidth: 0,
    ...Platform.select({
      web: { outlineStyle: "none" } as unknown as TextStyle,
    }),
  },
  inputChatSm: {
    flex: 1,
    minWidth: 0,
    fontSize: 10,
    fontWeight: "500",
    color: Theme.textPrimaryDark,
    paddingVertical: Platform.OS === "android" ? 2 : 0,
    borderWidth: 0,
    ...Platform.select({
      web: { outlineStyle: "none" } as unknown as TextStyle,
    }),
  },
});
