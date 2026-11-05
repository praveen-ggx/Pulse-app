import { useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Theme } from "@/constants/Theme";
import { cancelIntegratedTrip } from "@/features/trips/services/integratedTripCancel.service";
import {
  INTEGRATED_TRIP_CANCEL_REASONS,
  type IntegratedTripCancelReasonId,
} from "@/features/trips/utils/integratedTripCancel.util";

type Props = {
  visible: boolean;
  tripId: string;
  onClose: () => void;
  onCancelled: () => void;
};

export function CancelIntegratedTripSheet({ visible, tripId, onClose, onCancelled }: Props) {
  const insets = useSafeAreaInsets();
  const [reasonId, setReasonId] = useState<IntegratedTripCancelReasonId | null>(null);
  const [otherText, setOtherText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setReasonId(null);
    setOtherText("");
    setError(null);
    setSubmitting(false);
  };

  const close = () => {
    if (submitting) return;
    reset();
    onClose();
  };

  const confirm = async () => {
    if (!reasonId || submitting) {
      setError("Choose a cancel reason. Other needs a short note.");
      return;
    }
    if (reasonId === "other" && !otherText.trim()) {
      setError("Choose a cancel reason. Other needs a short note.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const result = await cancelIntegratedTrip({ tripId, reasonId, otherText });
    setSubmitting(false);
    if (result.error) {
      setError(result.error.message);
      if (result.error.message.startsWith("This trip was cancelled")) onCancelled();
      return;
    }
    reset();
    onCancelled();
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close}>
        <Pressable
          style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}
          onPress={() => undefined}
        >
          <Text style={styles.title}>Cancel this trip</Text>
          <Text style={styles.lead}>
            The trip is cancelled before pickup and the indent opens again for a new award.
          </Text>
          <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
            {INTEGRATED_TRIP_CANCEL_REASONS.map((reason) => {
              const selected = reasonId === reason.id;
              return (
                <Pressable
                  key={reason.id}
                  style={[styles.reason, selected && styles.reasonSelected]}
                  onPress={() => setReasonId(reason.id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                >
                  <Text style={[styles.reasonText, selected && styles.reasonTextSelected]}>
                    {reason.label}
                  </Text>
                </Pressable>
              );
            })}
            {reasonId === "other" ? (
              <TextInput
                value={otherText}
                onChangeText={setOtherText}
                placeholder="Short note"
                placeholderTextColor={Theme.textSecondary}
                style={styles.note}
                multiline
              />
            ) : null}
          </ScrollView>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <View style={styles.actions}>
            <Pressable style={styles.secondary} onPress={close} accessibilityRole="button">
              <Text style={styles.secondaryText}>Keep trip</Text>
            </Pressable>
            <Pressable
              style={[styles.primary, submitting && styles.primaryBusy]}
              onPress={() => void confirm()}
              disabled={submitting}
              accessibilityRole="button"
              accessibilityLabel="Confirm cancel trip"
            >
              <Text style={styles.primaryText}>{submitting ? "Cancelling…" : "Cancel trip"}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: Theme.overlayBackdrop,
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: Theme.cardWhite,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 20,
    maxHeight: "86%",
  },
  title: {
    color: Theme.textPrimaryDark,
    fontSize: 18,
    fontWeight: "700",
  },
  lead: {
    color: Theme.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 6,
    marginBottom: 12,
  },
  list: { flexGrow: 0 },
  reason: {
    minHeight: 44,
    justifyContent: "center",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.border,
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  reasonSelected: {
    borderColor: Theme.buttonDark,
    backgroundColor: Theme.compliancePageBg,
  },
  reasonText: { color: Theme.textPrimaryDark, fontSize: 15 },
  reasonTextSelected: { fontWeight: "700" },
  note: {
    minHeight: 72,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.border,
    padding: 12,
    color: Theme.textPrimaryDark,
    fontSize: 15,
    textAlignVertical: "top",
  },
  error: {
    color: Theme.destructive,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 8,
  },
  actions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 16,
  },
  secondary: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.compliancePageBg,
  },
  secondaryText: { color: Theme.textPrimaryDark, fontSize: 15, fontWeight: "600" },
  primary: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.buttonDark,
  },
  primaryBusy: { opacity: 0.7 },
  primaryText: { color: Theme.buttonDarkText, fontSize: 15, fontWeight: "700" },
});
