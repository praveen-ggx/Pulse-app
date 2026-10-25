import Theme from "@/constants/Theme";
import { formatINR } from "@/lib/format";
import { Pressable, StyleSheet, Text } from "react-native";

export function MatchTargetLink({
  amount,
  label = "Match target",
  onPress,
  disabled = false,
}: {
  amount: number;
  label?: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={8}
      style={({ pressed }) => [
        styles.hit,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${label} ${formatINR(amount)} and submit`}
    >
      <Text style={styles.text} numberOfLines={1}>
        {label} · {formatINR(amount)}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hit: {
    alignSelf: "center",
    paddingVertical: 4,
    paddingHorizontal: 8,
    minHeight: 28,
    justifyContent: "center",
  },
  pressed: { opacity: 0.65 },
  disabled: { opacity: 0.4 },
  text: {
    fontSize: 11,
    fontWeight: "600",
    lineHeight: 14,
    letterSpacing: 0,
    color: Theme.primary,
    textAlign: "center",
  },
});
