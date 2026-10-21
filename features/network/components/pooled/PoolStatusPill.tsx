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
}: {
  state: PoolCommercialState;
  label?: string;
}) {
  const tone = TONE[state];
  const text = label ?? POOL_STATE_COPY[state].label;
  return (
    <View
      style={[styles.pill, { backgroundColor: tone.bg }]}
      accessibilityLabel={`Pool status: ${text}`}
    >
      <Text style={[styles.text, { color: tone.fg }]} numberOfLines={1}>
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
  text: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.15,
    ...Platform.select({
      web: { whiteSpace: "pre-wrap" } as object,
      default: {},
    }),
  },
});
