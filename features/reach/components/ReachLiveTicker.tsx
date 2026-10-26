/**
 * Top live-corridor ticker for Pulse Boost studio. Decorative feed strip —
 * copy is illustrative corridor activity, not live RPC events.
 */
import Theme from "@/constants/Theme";
import { useEffect, useRef } from "react";
import { Animated, Easing, Platform, StyleSheet, Text, View } from "react-native";

const TICKER_ITEMS = [
  "Driver placed a bid on an active Reach story",
  "Load story boosted on interstate lane",
  "Fleet owner viewed a sponsored story in feed",
  "Campaign reach delivered to verified orgs",
];

export function ReachLiveTicker() {
  const offset = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(offset, {
        toValue: 1,
        duration: 28000,
        easing: Easing.linear,
        useNativeDriver: Platform.OS !== "web",
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [offset]);

  const translateX = offset.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -600],
  });

  const line = TICKER_ITEMS.join("  ·  ");

  return (
    <View style={styles.bar}>
      <View style={styles.liveBadge}>
        <View style={styles.liveDot} />
        <Text style={styles.liveText}>Live Feed</Text>
      </View>
      <View style={styles.track}>
        <Animated.Text style={[styles.tickerText, { transform: [{ translateX }] }]} numberOfLines={1}>
          {line}  ·  {line}
        </Animated.Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Theme.cardWhite,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
    paddingVertical: 5,
    overflow: "hidden",
  },
  liveBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: Theme.positiveMuted,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderTopRightRadius: 4,
    borderBottomRightRadius: 4,
    zIndex: 2,
  },
  liveDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: Theme.success,
  },
  liveText: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.success,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  track: { flex: 1, overflow: "hidden", paddingLeft: 10 },
  tickerText: {
    fontSize: 11,
    fontWeight: "500",
    color: Theme.textMuted,
    fontVariant: ["tabular-nums"],
  },
});
