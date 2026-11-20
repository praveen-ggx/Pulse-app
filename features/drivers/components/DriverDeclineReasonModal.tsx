import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import React from "react";
import { Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/** Reasons a driver can give when declining an assigned trip (stored on the audit row). */
export const DRIVER_DECLINE_REASONS = [
  { key: "not_available", label: "I'm not available" },
  { key: "vehicle_issue", label: "Vehicle problem" },
  { key: "too_far", label: "Pickup is too far" },
  { key: "other", label: "Other reason" },
] as const;

export type DriverDeclineReasonKey = (typeof DRIVER_DECLINE_REASONS)[number]["key"];

type Props = {
  visible: boolean;
  title: string;
  message: string;
  onCancel: () => void;
  onSelect: (reason: DriverDeclineReasonKey) => void;
};

/**
 * Decline confirmation that also asks why. Works on native and web (an
 * Alert with 4+ buttons drops buttons on Android and does nothing on web).
 */
export function DriverDeclineReasonModal({ visible, title, message, onCancel, onSelect }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} animationType="fade" transparent statusBarTranslucent onRequestClose={onCancel}>
      <View style={[styles.overlay, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>
          <Text style={styles.kicker}>Why are you declining?</Text>
          {DRIVER_DECLINE_REASONS.map((reason) => (
            <TouchableOpacity
              key={reason.key}
              onPress={() => onSelect(reason.key)}
              style={styles.reasonButton}
              activeOpacity={0.85}
              accessibilityRole="button"
            >
              <Text style={styles.reasonText}>{reason.label}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            onPress={onCancel}
            style={styles.cancelButton}
            activeOpacity={0.85}
            accessibilityRole="button"
          >
            <Text style={styles.cancelText}>Cancel — keep the trip</Text>
          </TouchableOpacity>
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
    paddingHorizontal: Layout.screenPaddingHorizontal,
  },
  card: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: Theme.cardWhite,
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingTop: 20,
    paddingBottom: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
  },
  title: {
    fontSize: 16,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    marginBottom: 6,
    textAlign: "center",
  },
  message: {
    fontSize: 12,
    color: Theme.textSecondary,
    marginBottom: 14,
    textAlign: "center",
    lineHeight: 17,
  },
  kicker: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    marginBottom: 8,
  },
  reasonButton: {
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surface,
    justifyContent: "center",
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  reasonText: {
    fontSize: 13,
    fontWeight: "500",
    color: Theme.textPrimaryDark,
  },
  cancelButton: {
    minHeight: 44,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  cancelText: {
    fontSize: 13,
    fontWeight: "600",
    color: Theme.textSecondary,
  },
});
