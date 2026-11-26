/**
 * Business / shipper chat action — ping the driver's latest / live location.
 * Reflects online / offline / GPS-needed so the shipper knows what to expect.
 */
import Theme from "@/constants/Theme";
import type { ChatPingPhase } from "@/features/chat/hooks/useChatPingDriverLocation";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { MapPinOff, Radar, WifiOff } from "lucide-react-native";

export type ChatPingLocationActionProps = {
  onPress: () => void;
  isPinging: boolean;
  pingTimedOut: boolean;
  lastCityLabel?: string | null;
  pingPhase?: ChatPingPhase;
  disabled?: boolean;
};

function phaseCopy(
  phase: ChatPingPhase,
  lastCityLabel?: string | null,
): { label: string; tone: "default" | "busy" | "offline" | "warn" | "gps" } {
  switch (phase) {
    case "pinging_online":
      return { label: "Updating live location…", tone: "busy" };
    case "pinging_offline":
      return { label: "Driver offline · request sent", tone: "offline" };
    case "gps_needed":
      return { label: "Ask driver to enable GPS", tone: "gps" };
    case "timed_out_offline":
      return { label: "Driver offline — request sent", tone: "offline" };
    case "timed_out":
      return { label: "No live fix — try again", tone: "warn" };
    case "idle":
    default:
      return {
        label: lastCityLabel
          ? `Ping location · ${lastCityLabel}`
          : "Ping location",
        tone: "default",
      };
  }
}

export function ChatPingLocationAction({
  onPress,
  isPinging,
  pingTimedOut,
  lastCityLabel,
  pingPhase,
  disabled = false,
}: ChatPingLocationActionProps) {
  const phase: ChatPingPhase =
    pingPhase ??
    (isPinging ? "pinging_online" : pingTimedOut ? "timed_out" : "idle");
  const { label, tone } = phaseCopy(phase, lastCityLabel);

  return (
    <View style={styles.wrap}>
      <TouchableOpacity
        style={[
          styles.chip,
          tone === "busy" && styles.chipBusy,
          tone === "offline" && styles.chipOffline,
          tone === "warn" && styles.chipTimedOut,
          tone === "gps" && styles.chipGps,
          disabled && styles.chipDisabled,
        ]}
        onPress={onPress}
        disabled={disabled || isPinging}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        <View
          style={[
            styles.iconPlate,
            tone === "offline" && styles.iconPlateOffline,
            tone === "gps" && styles.iconPlateGps,
            tone === "warn" && styles.iconPlateWarn,
          ]}
        >
          {tone === "busy" ? (
            <ActivityIndicator size="small" color={Theme.primary} />
          ) : tone === "offline" ? (
            <WifiOff size={14} color={Theme.textSecondary} strokeWidth={2.4} />
          ) : tone === "gps" ? (
            <MapPinOff size={14} color={Theme.warning} strokeWidth={2.4} />
          ) : (
            <Radar
              size={14}
              color={tone === "warn" ? Theme.warning : Theme.primary}
              strokeWidth={2.4}
            />
          )}
        </View>
        <Text
          style={[
            styles.label,
            tone === "offline" && styles.labelOffline,
            tone === "warn" && styles.labelTimedOut,
            tone === "gps" && styles.labelGps,
          ]}
          numberOfLines={1}
        >
          {label}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 12,
    paddingTop: 6,
    paddingBottom: 2,
  },
  chip: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    maxWidth: "100%",
    backgroundColor: Theme.brandBlueSoft,
    borderWidth: 1,
    borderColor: Theme.brandBlueRing,
    borderRadius: 999,
    paddingVertical: 7,
    paddingHorizontal: 10,
    paddingRight: 14,
  },
  chipBusy: {
    opacity: 0.95,
  },
  chipOffline: {
    backgroundColor: Theme.surface,
    borderColor: Theme.borderLight,
  },
  chipTimedOut: {
    backgroundColor: Theme.warningMuted,
    borderColor: "rgba(180, 83, 9, 0.35)",
  },
  chipGps: {
    backgroundColor: Theme.warningMuted,
    borderColor: "rgba(180, 83, 9, 0.4)",
  },
  chipDisabled: {
    opacity: 0.45,
  },
  iconPlate: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: Theme.cardWhite,
    alignItems: "center",
    justifyContent: "center",
  },
  iconPlateOffline: {
    backgroundColor: Theme.border,
  },
  iconPlateGps: {
    backgroundColor: Theme.cardWhite,
  },
  iconPlateWarn: {
    backgroundColor: Theme.cardWhite,
  },
  label: {
    flexShrink: 1,
    fontSize: 12.5,
    fontWeight: "700",
    color: Theme.primary,
    letterSpacing: -0.1,
  },
  labelOffline: {
    color: Theme.textSecondary,
  },
  labelTimedOut: {
    color: Theme.warning,
  },
  labelGps: {
    color: Theme.warning,
  },
});
