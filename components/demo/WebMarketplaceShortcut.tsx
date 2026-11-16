/**
 * Desktop header shortcut — Marketplace sits beside Chat, outside the nav group.
 * The gold rule draws in when the page is open; the pill presses down slightly.
 */
import { WEB_TOP_NAV_ICON } from "@/components/demo/webTopNavIcon.tokens";
import Theme from "@/constants/Theme";
import { Truck } from "lucide-react-native";
import { useEffect } from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

const MOTION = { duration: 220, easing: Easing.out(Easing.cubic) } as const;

type Props = {
  active: boolean;
  onPress: () => void;
  onPressIn?: () => void;
};

export function WebMarketplaceShortcut({ active, onPress, onPressIn }: Props) {
  const progress = useSharedValue(active ? 1 : 0);
  const pressed = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(active ? 1 : 0, MOTION);
  }, [active, progress]);

  const pillStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      progress.value,
      [0, 1],
      [Theme.surface, Theme.buttonDark],
    ),
    borderColor: interpolateColor(
      progress.value,
      [0, 1],
      ["rgba(226,232,240,0.9)", "rgba(15,23,42,0.65)"],
    ),
    transform: [{ scale: 1 - pressed.value * 0.02 }],
  }));

  const titleStyle = useAnimatedStyle(() => ({
    color: interpolateColor(
      progress.value,
      [0, 1],
      [WEB_TOP_NAV_ICON.muted, Theme.buttonDarkText],
    ),
  }));

  const iconShift = useAnimatedStyle(() => ({
    transform: [{ translateX: (1 - progress.value) * -3 }],
  }));

  const ruleStyle = useAnimatedStyle(() => ({
    width: progress.value * 76,
    opacity: progress.value,
  }));

  const iconColor = active ? WEB_TOP_NAV_ICON.onDark : WEB_TOP_NAV_ICON.muted;

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => {
        pressed.value = withTiming(1, { duration: 80 });
        onPressIn?.();
      }}
      onPressOut={() => {
        pressed.value = withTiming(0, { duration: 140 });
      }}
      accessibilityRole="button"
      accessibilityLabel="Marketplace"
      accessibilityState={{ selected: active }}
      style={styles.hit}
    >
      <Animated.View style={[styles.pill, pillStyle]}>
        <Animated.View style={iconShift}>
          <Truck
            size={WEB_TOP_NAV_ICON.size}
            color={iconColor}
            strokeWidth={WEB_TOP_NAV_ICON.stroke}
          />
        </Animated.View>
        <View style={styles.copy}>
          <Animated.Text style={[styles.title, titleStyle]} numberOfLines={1}>
            Marketplace
          </Animated.Text>
          <Animated.View style={[styles.rule, ruleStyle]} />
        </View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hit: {
    flexShrink: 0,
    ...Platform.select({ web: { cursor: "pointer" as const } }),
  },
  pill: {
    height: 40,
    borderRadius: 999,
    borderWidth: 1,
    paddingLeft: 12,
    paddingRight: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  copy: {
    justifyContent: "center",
    height: 18,
  },
  title: {
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.2,
    lineHeight: 16,
    ...(Platform.OS === "web" ? { whiteSpace: "nowrap" as const } : null),
  },
  rule: {
    position: "absolute",
    left: 0,
    bottom: 0,
    height: 2,
    borderRadius: 1,
    backgroundColor: Theme.accentGold,
  },
});
