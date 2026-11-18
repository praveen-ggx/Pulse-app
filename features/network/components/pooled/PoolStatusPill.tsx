import Theme from "@/constants/Theme";
import {
  POOL_STATE_COPY,
  type PoolCommercialState,
} from "@/features/network/utils/pooledOpportunity.util";
import { Platform, StyleSheet, Text, View } from "react-native";

const TONE: Record<PoolCommercialState, { bg: string; fg: string }> = {
  open: { bg: Theme.brandBlueSoft, fg: Theme.primary },
  submitted: { bg: Theme.warningMuted, fg: Theme.warning },
  awarded: { bg: Theme.positiveMuted, fg: Theme.positive },
  not_selected: { bg: Theme.surface, fg: Theme.textSecondary },
  closed: { bg: Theme.surface, fg: Theme.textMuted },
};

export function PoolStatusPill({
  state,
  label,
  surface = "default",
  size = "default",
}: {
  state: PoolCommercialState;
  label?: string;
  /** Mint chip used on the Marketplace Loads board. */
  surface?: "default" | "mint";
  size?: "default" | "compact";
}) {
  const tone =
    surface === "mint" && state === "open"
      ? { bg: Theme.positiveMuted, fg: Theme.positive }
      : TONE[state];
  const text = label ?? POOL_STATE_COPY[state].label;
  return (
    <View
      style={[styles.pill, size === "compact" && styles.pillCompact, { backgroundColor: tone.bg }]}
      accessibilityLabel={`Pool status: ${text}`}
    >
      <Text style={[styles.text, size === "compact" && styles.textCompact, { color: tone.fg }]} numberOfLines={1}>
        {text.toUpperCase()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    flexShrink: 0,
    marginTop: 2,
  },
  pillCompact: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
    marginTop: 0,
  },
  text: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.15,
    ...Platform.select({
      web: { whiteSpace: "pre-wrap" } as object,
      default: {},
    }),
  },
  textCompact: {
    fontSize: 9,
    lineHeight: 12,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
});
