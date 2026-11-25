import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";
import Theme from "@/constants/Theme";

function PulseBlock({
  width,
  height,
  align,
}: {
  width: number | `${number}%`;
  height: number;
  align: "left" | "right";
}) {
  const opacity = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.85,
          duration: 650,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.35,
          duration: 650,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        styles.bubble,
        align === "right" ? styles.bubbleOwn : styles.bubblePeer,
        {
          width,
          height,
          opacity,
          backgroundColor: Theme.borderLight ?? "#E8EEF5",
        },
      ]}
    />
  );
}

/** Active thread skeleton — header optional + bubble placeholders. */
export function ChatThreadSkeleton({
  showHeader = true,
  bubbleCount = 6,
}: {
  showHeader?: boolean;
  bubbleCount?: number;
}) {
  const pattern: Array<"left" | "right"> = [
    "left",
    "right",
    "right",
    "left",
    "left",
    "right",
  ];
  return (
    <View style={styles.wrap} accessibilityRole="progressbar" accessibilityLabel="Loading messages">
      {showHeader ? (
        <View style={styles.header}>
          <PulseBlock width={40} height={40} align="left" />
          <View style={{ flex: 1, gap: 8, marginLeft: 12 }}>
            <PulseBlock width="38%" height={12} align="left" />
            <PulseBlock width="55%" height={10} align="left" />
          </View>
        </View>
      ) : null}
      <View style={styles.thread}>
        {Array.from({ length: bubbleCount }, (_, i) => {
          const align = pattern[i % pattern.length]!;
          const width = align === "right" ? "58%" : "64%";
          const height = i % 3 === 0 ? 44 : 32;
          return (
            <View
              key={`thread-skel-${i}`}
              style={[styles.row, align === "right" ? styles.rowOwn : styles.rowPeer]}
            >
              <PulseBlock width={width} height={height} align={align} />
            </View>
          );
        })}
      </View>
    </View>
  );
}

/** Compact top-of-thread indicator while older pages load. */
export function ChatOlderHistoryLoading() {
  return (
    <View style={styles.older} accessibilityLabel="Loading earlier messages">
      <PulseBlock width={96} height={10} align="left" />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight ?? "#E5E7EB",
  },
  thread: {
    flex: 1,
    paddingHorizontal: 14,
    paddingTop: 16,
    gap: 10,
  },
  row: { width: "100%" },
  rowOwn: { alignItems: "flex-end" },
  rowPeer: { alignItems: "flex-start" },
  bubble: { borderRadius: 16 },
  bubbleOwn: { borderBottomRightRadius: 4 },
  bubblePeer: { borderBottomLeftRadius: 4 },
  older: {
    alignItems: "center",
    paddingVertical: 10,
  },
});
