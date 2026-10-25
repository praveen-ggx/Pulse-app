import { memo } from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import Theme from "@/constants/Theme";
import { PULSE_BRAND_MARK_TYPO } from "@/lib/brand/pulseBrandMark.tokens";

type PulseStoryWatermarkProps = {
  size?: number;
  /** Soft stamp — 1 is the reference lockup, lower is more watermark. */
  opacity?: number;
  style?: StyleProp<ViewStyle>;
};

/** Stacked pulse / story. stamp — same lockup as the Pulse Story mark. */
export const PulseStoryWatermark = memo(function PulseStoryWatermark({
  size = 36,
  opacity = 0.55,
  style,
}: PulseStoryWatermarkProps) {
  const line = {
    fontSize: size,
    lineHeight: Math.round(size * 1.05),
    letterSpacing: -1,
  };

  return (
    <View
      style={[styles.wrap, { opacity }, style]}
      pointerEvents="none"
      accessibilityElementsHidden
    >
      <Text style={[styles.word, line]}>pulse</Text>
      <Text style={[styles.word, line]}>
        story
        <Text style={styles.dot}>.</Text>
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    alignItems: "flex-start",
  },
  word: {
    ...PULSE_BRAND_MARK_TYPO,
    color: Theme.textSection,
  },
  dot: {
    ...PULSE_BRAND_MARK_TYPO,
    color: Theme.accentGold,
  },
});
