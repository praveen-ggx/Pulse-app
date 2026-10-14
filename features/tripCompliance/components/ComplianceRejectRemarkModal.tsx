/**
 * Remark box for rejecting a verified Compliance trip.
 * Multi-select presets + Other (free text) + Okay.
 */
import Theme from "@/constants/Theme";
import {
  COMPLIANCE_REJECT_REASON_OPTIONS,
  composeComplianceRejectReason,
  type ComplianceRejectReasonOptionId,
} from "@/features/tripCompliance/utils/complianceRejectReason.util";
import {
  COMPLIANCE_DECLINE_REASON_MAX,
  COMPLIANCE_DECLINE_REASON_MIN,
  complianceDeclineReasonLength,
} from "@/features/tripCompliance/tripCompliance.types";
import { Check } from "lucide-react-native";
import React, { useEffect, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export type ComplianceRejectRemarkModalProps = {
  visible: boolean;
  tripLabel: string;
  onCancel: () => void;
  onSubmit: (reason: string) => Promise<void>;
};

function errorMessage(err: unknown): string {
  if (err instanceof Error && err.message.trim()) return err.message;
  if (typeof err === "string" && err.trim()) return err;
  return "Could not reject. Please try again.";
}

export function ComplianceRejectRemarkModal({
  visible,
  tripLabel,
  onCancel,
  onSubmit,
}: ComplianceRejectRemarkModalProps) {
  const insets = useSafeAreaInsets();
  const [selectedIds, setSelectedIds] = useState<ComplianceRejectReasonOptionId[]>([]);
  const [otherText, setOtherText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submittingRef = useRef(false);

  useEffect(() => {
    if (visible) {
      setSelectedIds([]);
      setOtherText("");
      setError(null);
      setSubmitting(false);
      submittingRef.current = false;
    }
  }, [visible]);

  const otherSelected = selectedIds.includes("other");
  const composed = composeComplianceRejectReason(selectedIds, otherText);
  const length = complianceDeclineReasonLength(composed ?? "");
  const invalid =
    !composed ||
    length < COMPLIANCE_DECLINE_REASON_MIN ||
    length > COMPLIANCE_DECLINE_REASON_MAX;
  const submitDisabled = invalid || submitting;

  const toggleOption = (id: ComplianceRejectReasonOptionId) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
    if (error) setError(null);
  };

  const handleCancel = () => {
    if (submittingRef.current) return;
    onCancel();
  };

  const handleSubmit = async () => {
    if (submittingRef.current || !composed || invalid) return;
    submittingRef.current = true;
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(composed);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleCancel}>
      <KeyboardAvoidingView
        style={[
          styles.overlay,
          {
            paddingTop: insets.top + 16,
            paddingBottom: insets.bottom + 16,
            paddingLeft: insets.left + 16,
            paddingRight: insets.right + 16,
          },
        ]}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={handleCancel}
          accessibilityRole="button"
          accessibilityLabel="Close"
        />
        <View style={styles.sheet} accessibilityViewIsModal>
          <Text style={styles.title} accessibilityRole="header">
            Reject trip
          </Text>
          <Text style={styles.tripLabel} numberOfLines={1}>
            {tripLabel}
          </Text>
          <Text style={styles.subtitle}>Select one or more remarks</Text>

          <ScrollView
            style={styles.optionsScroll}
            contentContainerStyle={styles.optionsContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {COMPLIANCE_REJECT_REASON_OPTIONS.map((option) => {
              const selected = selectedIds.includes(option.id);
              return (
                <Pressable
                  key={option.id}
                  style={[styles.optionRow, selected && styles.optionRowOn]}
                  onPress={() => toggleOption(option.id)}
                  disabled={submitting}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: selected, disabled: submitting }}
                  accessibilityLabel={option.label}
                >
                  <View style={[styles.checkbox, selected && styles.checkboxOn]}>
                    {selected ? (
                      <Check size={12} color={Theme.cardWhite} strokeWidth={3} />
                    ) : null}
                  </View>
                  <Text style={[styles.optionLabel, selected && styles.optionLabelOn]}>
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}

            {otherSelected ? (
              <TextInput
                style={styles.otherInput}
                value={otherText}
                onChangeText={(text) => {
                  setOtherText(text);
                  if (error) setError(null);
                }}
                placeholder="Enter other reason"
                placeholderTextColor={Theme.textMuted}
                multiline
                editable={!submitting}
                textAlignVertical="top"
                accessibilityLabel="Other reject reason"
              />
            ) : null}
          </ScrollView>

          {error ? (
            <Text style={styles.error} accessibilityRole="alert">
              {error}
            </Text>
          ) : null}

          <View style={styles.actions}>
            <Pressable
              style={[styles.button, styles.cancelButton, submitting && styles.buttonDisabled]}
              onPress={handleCancel}
              disabled={submitting}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.button, styles.okayButton, submitDisabled && styles.okayDisabled]}
              onPress={() => void handleSubmit()}
              disabled={submitDisabled}
              accessibilityRole="button"
              accessibilityLabel={submitting ? "Submitting" : "Okay"}
              accessibilityState={{ disabled: submitDisabled, busy: submitting }}
            >
              <Text style={[styles.okayText, submitDisabled && styles.okayTextDisabled]}>
                {submitting ? "Saving…" : "Okay"}
              </Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: Theme.overlayBackdrop,
    justifyContent: "center",
    alignItems: "center",
  },
  sheet: {
    width: "100%",
    maxWidth: 420,
    maxHeight: "88%",
    backgroundColor: Theme.cardWhite,
    borderRadius: 14,
    padding: 18,
    gap: 8,
  },
  title: { fontSize: 16, fontWeight: "700", color: Theme.textPrimaryDark },
  tripLabel: { fontSize: 12, color: Theme.textMuted, marginBottom: 2 },
  subtitle: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.3,
    textTransform: "uppercase",
    color: Theme.textMuted,
    marginTop: 4,
  },
  optionsScroll: { maxHeight: 320 },
  optionsContent: { gap: 6, paddingVertical: 4 },
  optionRow: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.complianceCardBorder,
    backgroundColor: Theme.cardWhite,
  },
  optionRowOn: {
    borderColor: Theme.complianceStageDocsFg,
    backgroundColor: Theme.complianceStageDocsBg,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: Theme.complianceCardBorder,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.cardWhite,
  },
  checkboxOn: {
    borderColor: Theme.complianceStageDocsFg,
    backgroundColor: Theme.complianceStageDocsFg,
  },
  optionLabel: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    fontWeight: "500",
    color: Theme.textPrimaryDark,
  },
  optionLabelOn: { fontWeight: "700", color: Theme.complianceStageDocsFg },
  otherInput: {
    minHeight: 72,
    maxHeight: 120,
    marginTop: 2,
    borderWidth: 1,
    borderColor: Theme.complianceCardBorder,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: Theme.textPrimaryDark,
    backgroundColor: Theme.compliancePageBg,
  },
  error: { fontSize: 12, fontWeight: "600", color: Theme.complianceStageDocsFg },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 8 },
  button: {
    minHeight: 44,
    minWidth: 96,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonDisabled: { opacity: 0.5 },
  cancelButton: {
    borderWidth: 1,
    borderColor: Theme.complianceCardBorder,
    backgroundColor: Theme.cardWhite,
  },
  cancelText: { fontSize: 14, fontWeight: "600", color: Theme.textPrimaryDark },
  okayButton: { backgroundColor: Theme.buttonDark },
  okayDisabled: { backgroundColor: Theme.compliancePageBg },
  okayText: { fontSize: 14, fontWeight: "700", color: Theme.buttonDarkText },
  okayTextDisabled: { color: Theme.textMuted },
});
