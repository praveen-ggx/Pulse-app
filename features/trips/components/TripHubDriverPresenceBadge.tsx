import Theme from "@/constants/Theme";
import type { TripHubInTransitPingMeta } from "@/features/trips/hooks/useTripHubInTransitPings";
import { useEffect, useRef, type ReactNode } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";

type Props = {
  ping: TripHubInTransitPingMeta | null | undefined;
  variant?: "belowName" | "inline";
  alignEnd?: boolean;
};

/** Soft red ring around the driver avatar while offline. */
export function DriverOfflineGlow({
  active,
  size,
  children,
}: {
  active: boolean;
  size: number;
  children: ReactNode;
}) {
  const pulse = useRef(new Animated.Value(0.32)).current;

  useEffect(() => {
    if (!active) {
      pulse.stopAnimation();
      pulse.setValue(0.32);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 0.92,
          duration: 1200,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.28,
          duration: 1200,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => {
      loop.stop();
    };
  }, [active, pulse]);

  if (!active) return <>{children}</>;

  const ring = size + 8;
  return (
    <View
      style={{
        width: ring,
        height: ring,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          styles.glowRing,
          {
            width: ring,
            height: ring,
            borderRadius: ring / 2,
            opacity: pulse,
          },
        ]}
      />
      {children}
    </View>
  );
}

/** Driver online / offline — compact status under the driver name. */
export function TripHubDriverPresenceBadge({
  ping,
  variant = "inline",
  alignEnd = false,
}: Props) {
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!ping || ping.isOnline) {
      pulse.stopAnimation();
      pulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 0.72,
          duration: 1200,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1200,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => {
      loop.stop();
    };
  }, [ping, pulse]);

  if (!ping) return null;

  const online = ping.isOnline;
  const statusText = online ? "Online" : ping.offlineLabel ?? "Offline";

  const row = (
    <Animated.View
      style={[
        styles.chip,
        online ? styles.chipOnline : styles.chipOffline,
        alignEnd && styles.chipEnd,
        !online ? { opacity: pulse } : null,
      ]}
    >
      <View
        style={[styles.dot, online ? styles.dotOnline : styles.dotOffline]}
      />
      <Text
        style={[styles.label, online ? styles.labelOnline : styles.labelOffline]}
        numberOfLines={1}
      >
        {statusText}
      </Text>
    </Animated.View>
  );

  if (variant === "belowName") {
    return (
      <View style={[styles.belowWrap, alignEnd && styles.belowWrapEnd]}>
        {row}
      </View>
    );
  }

  return row;
}

const styles = StyleSheet.create({
  glowRing: {
    position: "absolute",
    borderWidth: 1.5,
    borderColor: Theme.destructive,
    backgroundColor: Theme.destructiveWash,
    shadowColor: Theme.destructive,
    shadowOpacity: 0.85,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 0 },
  },
  belowWrap: {
    alignSelf: "flex-start",
    marginTop: 3,
  },
  belowWrapEnd: {
    alignSelf: "flex-end",
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 999,
    maxWidth: "100%",
  },
  chipEnd: {
    justifyContent: "flex-end",
  },
  chipOnline: {
    backgroundColor: Theme.positive,
  },
  chipOffline: {
    backgroundColor: Theme.destructive,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    flexShrink: 0,
  },
  dotOnline: {
    backgroundColor: Theme.cardWhite,
  },
  dotOffline: {
    backgroundColor: Theme.cardWhite,
  },
  label: {
    fontSize: 8,
    lineHeight: 10,
    fontWeight: "700",
    letterSpacing: 0.15,
    flexShrink: 1,
  },
  labelOnline: {
    color: Theme.cardWhite,
  },
  labelOffline: {
    color: Theme.cardWhite,
  },
});
