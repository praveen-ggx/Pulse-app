/**
 * Toast shown when the driver answers a shipper location ping.
 */
import Theme from "@/constants/Theme";
import Layout from "@/constants/Layout";
import type { DriverLocationSharedToastState } from "@/features/driver/hooks/useDriverRespondToShipperLocationPing";
import { MapPin, Radar, X } from "lucide-react-native";
import { memo, useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Props = {
  toast: DriverLocationSharedToastState;
  onDismiss: () => void;
};

export const DriverLocationSharedToast = memo(function DriverLocationSharedToast({
  toast,
  onDismiss,
}: Props) {
  const insets = useSafeAreaInsets();
  const visible = useSharedValue(0);

  useEffect(() => {
    visible.value = withSpring(toast ? 1 : 0, {
      damping: 18,
      stiffness: 220,
      mass: 0.7,
    });
  }, [toast, visible]);

  const shellStyle = useAnimatedStyle(() => ({
    opacity: visible.value,
    transform: [
      { translateY: (1 - visible.value) * -18 },
      { scale: 0.96 + visible.value * 0.04 },
    ],
  }));

  if (!toast) return null;

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.host,
        {
          paddingTop: Math.max(insets.top, 12) + 8,
          paddingHorizontal: Layout.screenPaddingHorizontal ?? 16,
        },
      ]}
    >
      <Animated.View style={[styles.card, shellStyle]}>
        <View style={styles.accentBar} />
        <View style={styles.iconPlate}>
          <Radar size={16} color={Theme.textOnPrimary} strokeWidth={2.4} />
        </View>
        <View style={styles.copy}>
          <Text style={styles.title}>Your current location shared to shipper</Text>
          {toast.cityLabel ? (
            <View style={styles.cityRow}>
              <MapPin size={11} color={Theme.driverPrimary} strokeWidth={2.4} />
              <Text style={styles.city} numberOfLines={1}>
                {toast.cityLabel}
              </Text>
            </View>
          ) : null}
        </View>
        <Pressable
          onPress={onDismiss}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
          style={styles.dismiss}
        >
          <X size={16} color={Theme.driverDockIconMuted} strokeWidth={2.2} />
        </Pressable>
      </Animated.View>
    </View>
  );
});

const styles = StyleSheet.create({
  host: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1200,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: Theme.driverDock,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Theme.driverEmeraldBorder,
    paddingVertical: 12,
    paddingHorizontal: 12,
    overflow: "hidden",
  },
  accentBar: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    backgroundColor: Theme.driverPrimary,
  },
  iconPlate: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Theme.driverPrimary,
    alignItems: "center",
    justifyContent: "center",
  },
  copy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  title: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.driverOnForest,
    letterSpacing: -0.15,
  },
  cityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  city: {
    flexShrink: 1,
    fontSize: 11.5,
    fontWeight: "600",
    color: Theme.driverPrimary,
  },
  dismiss: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
});
