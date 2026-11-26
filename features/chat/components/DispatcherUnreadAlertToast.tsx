/**
 * Compact in-hub unread toast — driver-app style alert without the full reply UI.
 */
import React, { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Bell, X } from "lucide-react-native";
import Animated, { FadeInDown, FadeOutUp } from "react-native-reanimated";

import Theme from "@/constants/Theme";
import type { DispatcherUnreadAlert } from "@/features/chat/hooks/useDispatcherIncomingUnreadAlert";

type Props = {
  alert: DispatcherUnreadAlert | null;
  onOpen: (alert: DispatcherUnreadAlert) => void;
  onDismiss: () => void;
};

export const DispatcherUnreadAlertToast = memo(
  function DispatcherUnreadAlertToast({ alert, onOpen, onDismiss }: Props) {
    if (!alert) return null;
    const countLabel = alert.unread > 9 ? "9+" : String(alert.unread);

    return (
      <Animated.View
        entering={FadeInDown.duration(220)}
        exiting={FadeOutUp.duration(160)}
        style={styles.wrap}
        pointerEvents="box-none"
      >
        <Pressable
          style={styles.card}
          onPress={() => onOpen(alert)}
          accessibilityRole="button"
          accessibilityLabel={`Open unread chat from ${alert.title}`}
        >
          <View style={styles.iconWrap}>
            <Bell size={16} color="#fff" strokeWidth={2.4} />
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{countLabel}</Text>
            </View>
          </View>
          <View style={styles.body}>
            <Text style={styles.title} numberOfLines={1}>
              {alert.title}
            </Text>
            <Text style={styles.preview} numberOfLines={2}>
              {alert.preview}
            </Text>
          </View>
          <Pressable
            onPress={onDismiss}
            hitSlop={10}
            style={styles.close}
            accessibilityLabel="Dismiss notification"
          >
            <X size={16} color={Theme.textSecondary} strokeWidth={2.2} />
          </Pressable>
        </Pressable>
      </Animated.View>
    );
  },
);

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 12,
    right: 12,
    top: 8,
    zIndex: 40,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: Theme.surfaceBorder,
    shadowColor: "#0F172A",
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Theme.brandBlueInk,
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    position: "absolute",
    right: -4,
    top: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: Theme.destructive,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "#fff",
  },
  badgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "800",
  },
  body: { flex: 1, minWidth: 0 },
  title: {
    fontSize: 14,
    fontWeight: "700",
    color: Theme.textPrimary,
  },
  preview: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 16,
    color: Theme.textSecondary,
  },
  close: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.surfaceGray,
  },
});
