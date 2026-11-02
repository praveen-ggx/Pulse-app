import LottieView from "lottie-react-native";
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Theme from "@/constants/Theme";

const CONFIRM_ANIMATION = require("@/assets/Animated folder/payment.json");
const SUCCESS_ANIMATION = require("@/assets/Animated folder/check-mark.json");

type Props = {
  visible: boolean;
  phase: "confirm" | "success";
  amountLabel: string;
  partyName: string;
  tripDisplay: string;
  modeLabel: string;
  reference?: string | null;
  paidOn: string;
  confirming?: boolean;
  successTitle: string;
  successMessage: string;
  onCancel: () => void;
  onConfirm: () => void;
  onDone: () => void;
};

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

export function DriverCaptureConfirmModal({
  visible,
  phase,
  amountLabel,
  partyName,
  tripDisplay,
  modeLabel,
  reference,
  paidOn,
  confirming = false,
  successTitle,
  successMessage,
  onCancel,
  onConfirm,
  onDone,
}: Props) {
  const insets = useSafeAreaInsets();
  const success = phase === "success";
  const ref = String(reference ?? "").trim();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={success ? onDone : confirming ? undefined : onCancel}
    >
      <View
        style={[
          styles.overlay,
          { paddingTop: insets.top + 16, paddingBottom: Math.max(insets.bottom, 16) },
        ]}
      >
        <View style={styles.card}>
          <View style={styles.animationWrap}>
            <LottieView
              key={phase}
              source={success ? SUCCESS_ANIMATION : CONFIRM_ANIMATION}
              autoPlay
              loop={false}
              resizeMode="contain"
              style={styles.animation}
            />
          </View>
          <Text style={styles.kicker}>{success ? "Recorded" : "Confirm collection"}</Text>
          <Text style={styles.title}>{success ? successTitle : amountLabel}</Text>
          <Text style={styles.message}>
            {success
              ? successMessage
              : `Collect ${amountLabel} from ${partyName} for ${tripDisplay}.`}
          </Text>
          {success ? null : (
            <View style={styles.summary}>
              <SummaryRow label="Party" value={partyName} />
              <SummaryRow label="Trip" value={tripDisplay} />
              <SummaryRow label="Mode" value={modeLabel} />
              <SummaryRow label="Reference" value={ref || "—"} />
              <SummaryRow label="Paid on" value={paidOn} />
            </View>
          )}
          {success ? (
            <Pressable
              style={styles.primaryBtn}
              onPress={onDone}
              accessibilityRole="button"
              accessibilityLabel="Done"
            >
              <Text style={styles.primaryText}>Done</Text>
            </Pressable>
          ) : (
            <View style={styles.actions}>
              <Pressable
                style={styles.secondaryBtn}
                onPress={confirming ? undefined : onCancel}
                disabled={confirming}
                accessibilityRole="button"
                accessibilityLabel="Cancel"
              >
                <Text style={styles.secondaryText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.primaryBtn, styles.primaryGrow, confirming && styles.primaryBusy]}
                onPress={confirming ? undefined : onConfirm}
                disabled={confirming}
                accessibilityRole="button"
                accessibilityLabel="Confirm collection"
              >
                {confirming ? (
                  <ActivityIndicator size="small" color={Theme.buttonPrimaryText} />
                ) : (
                  <Text style={styles.primaryText}>Confirm</Text>
                )}
              </Pressable>
            </View>
          )}
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
    width: 120,
    height: 120,
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
  actions: {
    alignSelf: "stretch",
    flexDirection: "row",
    gap: 10,
    marginTop: 6,
  },
  secondaryBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.border,
    backgroundColor: Theme.screenBackground,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  secondaryText: {
    fontSize: 14,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  primaryBtn: {
    minHeight: 44,
    minWidth: 120,
    borderRadius: 12,
    paddingHorizontal: 18,
    backgroundColor: Theme.buttonPrimary,
    borderWidth: Theme.buttonPrimaryBorderWidth,
    borderColor: Theme.buttonPrimaryBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryGrow: {
    flex: 1.4,
  },
  primaryBusy: {
    opacity: 0.85,
  },
  primaryText: {
    fontSize: 14,
    fontWeight: "800",
    color: Theme.buttonPrimaryText,
  },
});
