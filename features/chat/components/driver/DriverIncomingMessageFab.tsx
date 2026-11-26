/**
 * Floating unread chip after the driver taps “Later” on an inbound toast.
 * Mild pulse + bob — tap restores the message card.
 */
import Theme from "@/constants/Theme";
import Layout from "@/constants/Layout";
import type { DriverIncomingAlert } from "@/features/chat/hooks/useDriverIncomingMessageAlerts";
import { MessageCircle } from "lucide-react-native";
import { memo, useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Props = {
  count: number;
  preview?: DriverIncomingAlert | null;
  onPress: () => void;
};

export const DriverIncomingMessageFab = memo(function DriverIncomingMessageFab({
  count,
  preview,
  onPress,
}: Props) {
  const insets = useSafeAreaInsets();
  const bob = useSharedValue(0);
  const glow = useSharedValue(0.55);
  const pop = useSharedValue(0);

  useEffect(() => {
    pop.value = withSequence(
      withTiming(1, { duration: 280, easing: Easing.out(Easing.back(1.4)) }),
    );
    bob.value = withRepeat(
      withSequence(
        withTiming(-5, { duration: 900, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 900, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      false,
    );
    glow.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.quad) }),
        withDelay(
          120,
          withTiming(0.5, { duration: 1100, easing: Easing.inOut(Easing.quad) }),
        ),
      ),
      -1,
      false,
    );
  }, [bob, glow, pop]);

  const shellStyle = useAnimatedStyle(() => ({
    opacity: pop.value,
    transform: [
      { translateY: bob.value },
      { scale: 0.86 + pop.value * 0.14 },
    ],
  }));

  const ringStyle = useAnimatedStyle(() => ({
    opacity: glow.value * 0.55,
    transform: [{ scale: 1 + glow.value * 0.18 }],
  }));

  if (count <= 0) return null;

  const label =
    count > 1
      ? `${count} unread`
      : (preview?.partyName?.trim() || "Unread");

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.host,
        {
          bottom:
            Math.max(insets.bottom, 8) +
            (Layout.tabBarHeight ?? 64) +
            18,
          right: Layout.screenPaddingHorizontal ?? 16,
        },
      ]}
    >
      <Animated.View style={shellStyle}>
        <Animated.View pointerEvents="none" style={[styles.ring, ringStyle]} />
        <Pressable
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={`Unread message from ${label}. Tap to read`}
          style={({ pressed }) => [
            styles.fab,
            pressed && styles.fabPressed,
          ]}
        >
          <View style={styles.iconWell}>
            <MessageCircle
              size={18}
              color={Theme.driverLimeInk}
              strokeWidth={2.6}
            />
            <View style={styles.badge}>
              <Text style={styles.badgeText}>
                {count > 9 ? "9+" : String(count)}
              </Text>
            </View>
          </View>
          <View style={styles.copy}>
            <Text style={styles.kicker} numberOfLines={1}>
              New message
            </Text>
            <Text style={styles.title} numberOfLines={1}>
              {label}
            </Text>
          </View>
        </Pressable>
      </Animated.View>
    </View>
  );
});

const styles = StyleSheet.create({
  host: {
    position: "absolute",
    zIndex: 1180,
    elevation: 22,
  },
  ring: {
    position: "absolute",
    top: -6,
    left: -6,
    right: -6,
    bottom: -6,
    borderRadius: 28,
    borderWidth: 1.5,
    borderColor: Theme.driverLime,
    backgroundColor: "rgba(198,240,53,0.12)",
  },
  fab: {
    minWidth: 148,
    maxWidth: 220,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingLeft: 10,
    paddingRight: 14,
    borderRadius: 22,
    backgroundColor: Theme.driverDock,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(198,240,53,0.45)",
    shadowColor: Theme.driverLime,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 12,
    elevation: 12,
  },
  fabPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.98 }],
  },
  iconWell: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.driverLime,
    flexShrink: 0,
  },
  badge: {
    position: "absolute",
    top: -3,
    right: -3,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 3,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.negative,
    borderWidth: 1.5,
    borderColor: Theme.driverDock,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: "800",
    color: "#fff",
    lineHeight: 11,
  },
  copy: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  kicker: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: Theme.driverLime,
  },
  title: {
    fontSize: 13,
    fontWeight: "700",
    color: "#fff",
    letterSpacing: -0.2,
  },
});
