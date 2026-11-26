import FontAwesome from "@expo/vector-icons/FontAwesome";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { CHAT_TEXT_MUTED, CHAT_TICK_READ } from "@/features/chat/chatTheme";
import type { MessageDeliveryStatus } from "../types/chat.types";

export interface MessageTickProps {
  /** When undefined, outgoing bubble shows no tick rail (e.g. non-chat types). */
  status?: MessageDeliveryStatus;
  /** Smaller footprint inside dense meta rows. */
  compact?: boolean;
}

/**
 * Metronic-style delivery ticks for outgoing chat rows.
 */
export function MessageTick({ status, compact }: MessageTickProps) {
  const size = compact ? 8 : 9;
  const gap = compact ? 0 : 1;

  if (status === "failed") {
    return (
      <View style={styles.wrap} accessibilityLabel="Failed to send">
        <FontAwesome name="exclamation-circle" size={size + 1} color="#DC2626" />
      </View>
    );
  }

  if (!status || status === "sending") {
    return (
      <View style={styles.wrap} accessibilityLabel="Sending">
        <FontAwesome name="clock-o" size={size} color={CHAT_TEXT_MUTED} />
      </View>
    );
  }

  if (status === "sent") {
    return (
      <Text
        style={[styles.tick, { fontSize: size + 1, color: CHAT_TEXT_MUTED }]}
        accessibilityLabel="Sent"
      >
        ✓
      </Text>
    );
  }

  if (status === "delivered") {
    return (
      <Text
        style={[
          styles.tick,
          { fontSize: size + 1, color: CHAT_TEXT_MUTED, letterSpacing: gap },
        ]}
        accessibilityLabel="Delivered"
      >
        ✓✓
      </Text>
    );
  }

  return (
    <Text
      style={[
        styles.tick,
        { fontSize: size + 1, color: CHAT_TICK_READ, letterSpacing: gap },
      ]}
      accessibilityLabel="Read"
    >
      ✓✓
    </Text>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginLeft: 3,
    justifyContent: "center",
    alignItems: "center",
  },
  tick: {
    marginLeft: 3,
    fontWeight: "700",
  },
});
