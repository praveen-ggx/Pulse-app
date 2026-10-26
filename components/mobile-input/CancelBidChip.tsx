import Theme from "@/constants/Theme";
import { ChevronRight } from "lucide-react-native";
import { Pressable, StyleSheet, Text } from "react-native";

/** Text + chevron chip — same language as trip “View all”, not a filled CTA. */
export function CancelBidChip({
  onPress,
  disabled = false,
  label = "Cancel bid",
}: {
  onPress: () => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={8}
      style={({ pressed }) => [
        styles.chip,
        pressed && !disabled && styles.pressed,
        disabled && styles.disabled,
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
    >
      <Text style={styles.text}>{label}</Text>
      <ChevronRight size={14} color={Theme.textPrimaryDark} strokeWidth={2.4} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 2,
    paddingVertical: 6,
    paddingHorizontal: 12,
    minHeight: 32,
    borderRadius: 999,
    backgroundColor: Theme.cardWhite,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
  },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.4 },
  text: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0,
    color: Theme.textPrimaryDark,
  },
});
