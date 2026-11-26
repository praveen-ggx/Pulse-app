import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";
import Theme from "@/constants/Theme";

function PulseBlock({
  width,
  height,
  radius = 8,
  style,
}: {
  width: number | `${number}%`;
  height: number;
  radius?: number;
  style?: object;
}) {
  const opacity = useRef(new Animated.Value(0.45)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.9,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.4,
          duration: 700,
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
        {
          width,
          height,
          borderRadius: radius,
          backgroundColor: Theme.borderLight ?? "#E8EEF5",
          opacity,
        },
        style,
      ]}
    />
  );
}

function ConversationRowSkeleton() {
  return (
    <View style={styles.row} accessibilityLabel="Loading conversation">
      <PulseBlock width={44} height={44} radius={22} />
      <View style={styles.rowBody}>
        <View style={styles.rowTop}>
          <PulseBlock width="42%" height={12} />
          <PulseBlock width={36} height={10} />
        </View>
        <PulseBlock width="72%" height={11} style={{ marginTop: 8 }} />
      </View>
      <PulseBlock width={18} height={18} radius={9} />
    </View>
  );
}

/** Sidebar / inbox skeleton rows — Stage 1–2 shell, not a full-screen spinner. */
export function ChatListSkeleton({ count = 8 }: { count?: number }) {
  return (
    <View style={styles.wrap} accessibilityRole="progressbar">
      {Array.from({ length: count }, (_, i) => (
        <ConversationRowSkeleton key={`chat-skel-${i}`} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingTop: 4,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
  },
  rowTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
});
