import LottieView from "lottie-react-native";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Theme from "@/constants/Theme";
import { formatTime } from "@/lib/format";

const SUCCESS_ANIMATION = require("@/assets/Animated folder/delivery completed.json");

/** Lets the previous modal finish dismissing before this one presents (iOS drops overlapping presents). */
export const TRIP_COMPLETED_MODAL_HANDOFF_MS = 350;

type TripCompletedDetails = {
  tripLabel: string;
  pickupLabel?: string | null;
  dropLabel?: string | null;
  /** Shown only when a real amount is known. */
  earnings?: string | null;
  completedAt?: string | null;
  /** Overrides the default message, e.g. stop count on commerce routes. */
  message?: string | null;
};

type Props = TripCompletedDetails & {
  visible: boolean;
  onClose: () => void;
};

export type DriverTripCompletedPayload = TripCompletedDetails & {
  /** Runs after the driver closes the modal, e.g. to open the shipper rating. */
  onClosed?: () => void;
};

// The trip card unmounts the moment its trip turns completed (it drops out of
// the active mission), and DCO drivers switch to the Available surface, so the
// modal lives in one host under the driver layout instead of inside the card.
let pendingPayload: DriverTripCompletedPayload | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getPayload() {
  return pendingPayload;
}

export function showDriverTripCompleted(payload: DriverTripCompletedPayload) {
  pendingPayload = payload;
  for (const listener of listeners) listener();
}

function clearDriverTripCompleted() {
  pendingPayload = null;
  for (const listener of listeners) listener();
}

/** Mount once under the driver layout. */
export function DriverTripCompletedHost() {
  const payload = useSyncExternalStore(subscribe, getPayload, getPayload);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!payload) {
      setVisible(false);
      return;
    }
    // Let the POD / summary / verification modal finish dismissing first.
    const timer = setTimeout(() => setVisible(true), TRIP_COMPLETED_MODAL_HANDOFF_MS);
    return () => clearTimeout(timer);
  }, [payload]);

  const close = useCallback(() => {
    const onClosed = payload?.onClosed;
    clearDriverTripCompleted();
    onClosed?.();
  }, [payload]);

  if (!payload) return null;
  return <DriverTripCompletedModal {...payload} visible={visible} onClose={close} />;
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function cleanLabel(value: string | null | undefined): string | null {
  const v = String(value ?? "").trim();
  return v && v !== "—" ? v : null;
}

export function DriverTripCompletedModal({
  visible,
  tripLabel,
  pickupLabel,
  dropLabel,
  earnings,
  completedAt,
  message,
  onClose,
}: Props) {
  const insets = useSafeAreaInsets();
  const trip = cleanLabel(tripLabel) ?? "This trip";
  const from = cleanLabel(pickupLabel);
  const to = cleanLabel(dropLabel);
  const pay = cleanLabel(earnings);
  const at = completedAt ? formatTime(completedAt) : null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View
        style={[
          styles.overlay,
          { paddingTop: insets.top + 16, paddingBottom: Math.max(insets.bottom, 16) },
        ]}
      >
        <View style={styles.card} testID="driver-trip-completed-modal">
          <View style={styles.animationWrap}>
            {visible ? (
              <LottieView
                source={SUCCESS_ANIMATION}
                autoPlay
                loop={false}
                resizeMode="contain"
                style={styles.animation}
              />
            ) : null}
          </View>
          <Text style={styles.kicker}>Trip completed</Text>
          <Text style={styles.title}>Delivered successfully</Text>
          <Text style={styles.message}>
            {cleanLabel(message) ?? `Great work! ${trip} is delivered and marked complete.`}
          </Text>
          <View style={styles.summary}>
            <SummaryRow label="Trip" value={trip} />
            {from ? <SummaryRow label="From" value={from} /> : null}
            {to ? <SummaryRow label="To" value={to} /> : null}
            {at ? <SummaryRow label="Completed at" value={at} /> : null}
            {pay ? <SummaryRow label="Your earnings" value={pay} /> : null}
          </View>
          <Pressable
            style={styles.primaryBtn}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <Text style={styles.primaryText}>Close</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: Theme.overlayBackdrop,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  card: {
    width: "100%",
    maxWidth: 400,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.screenBackground,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
    alignItems: "center",
    gap: 8,
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.12,
    shadowRadius: 18,
    elevation: 12,
  },
  animationWrap: {
    width: 140,
    height: 140,
    alignItems: "center",
    justifyContent: "center",
  },
  animation: {
    width: "100%",
    height: "100%",
  },
  kicker: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: Theme.textMuted,
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    textAlign: "center",
    letterSpacing: -0.3,
  },
  message: {
    fontSize: 13,
    lineHeight: 19,
    color: Theme.textSecondary,
    textAlign: "center",
    paddingHorizontal: 4,
  },
  summary: {
    alignSelf: "stretch",
    marginTop: 4,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surface,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    minHeight: 36,
  },
  rowLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textMuted,
  },
  rowValue: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    textAlign: "right",
  },
  primaryBtn: {
    alignSelf: "stretch",
    minHeight: 44,
    marginTop: 6,
    borderRadius: 12,
    paddingHorizontal: 18,
    backgroundColor: Theme.buttonPrimary,
    borderWidth: Theme.buttonPrimaryBorderWidth,
    borderColor: Theme.buttonPrimaryBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryText: {
    fontSize: 14,
    fontWeight: "800",
    color: Theme.buttonPrimaryText,
  },
});
