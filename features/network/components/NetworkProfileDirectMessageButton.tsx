/**
 * Direct message CTA in the network profile modal.
 */
import Theme from "@/constants/Theme";
import { Mail } from "lucide-react-native";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";

export type NetworkProfileDirectMessageButtonProps = {
  onPress: () => void;
  /** Taller touch target on narrow viewports (profile modal mobile layout). */
  compact?: boolean;
  disabled?: boolean;
  /** Shown under the button when disabled, e.g. why messaging isn't available yet. */
  helperText?: string | null;
  label?: string;
};

export function NetworkProfileDirectMessageButton({
  onPress,
  compact = false,
  disabled = false,
  helperText = null,
  label = "Message",
}: NetworkProfileDirectMessageButtonProps) {
  return (
    <View style={styles.wrap}>
      <Pressable
        style={({ pressed }) => [
          styles.button,
          compact && styles.buttonCompact,
          disabled && styles.buttonDisabled,
          pressed && !disabled && { opacity: 0.88 },
        ]}
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={disabled && helperText ? helperText : undefined}
      >
        <Mail size={14} color={Theme.buttonDarkText} strokeWidth={2.2} />
        <Text style={[styles.label, compact && styles.labelCompact]}>{label}</Text>
      </Pressable>
      {disabled && helperText ? (
        <Text style={styles.helperText}>{helperText}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    minWidth: 0,
    alignSelf: "stretch",
  },
  helperText: {
    marginTop: 6,
    fontSize: 11,
    color: Theme.textSecondary,
    textAlign: "center",
  },
  button: {
    width: "100%",
    alignSelf: "stretch",
    minHeight: 42,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.actionBtnInk,
    backgroundColor: Theme.actionBtnInk,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  buttonCompact: {
    minHeight: 42,
    borderRadius: 10,
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  label: {
    fontSize: 12,
    fontWeight: "500",
    color: Theme.buttonDarkText,
    letterSpacing: 0,
    zIndex: 1,
    ...Platform.select({
      web: { whiteSpace: "pre-wrap" } as object,
      default: {},
    }),
  },
  labelCompact: {
    fontWeight: "500",
    letterSpacing: 0,
    textTransform: "none",
  },
});
