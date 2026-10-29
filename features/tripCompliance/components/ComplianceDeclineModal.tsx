/**
 * Decline-reason modal for the Compliance table (web + native). Validates
 * the trimmed reason against COMPLIANCE_DECLINE_REASON_MIN/MAX, blocks double
 * submit, and shows the rejected promise's message inline. The parent closes
 * it when `onSubmit` resolves.
 */
import Theme from "@/constants/Theme";
import { COMPLIANCE_DECLINE_ACTION_LABEL } from "@/features/tripCompliance/complianceDecisionConfig";
import {
  COMPLIANCE_DECLINE_REASON_MAX,
  COMPLIANCE_DECLINE_REASON_MIN,
  complianceDeclineReasonLength,
} from "@/features/tripCompliance/tripCompliance.types";
import {
  composeComplianceDeclineReason,
  type ComplianceDeclineReasonSection,
} from "@/features/tripCompliance/utils/complianceDeclineReason.util";
import { composeResubmitComplianceNote } from "@/features/tripCompliance/utils/complianceResubmitChangeLog.util";
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

export type ComplianceDeclineChangeLogItem = {
  kind: "uploaded" | "deleted";
  text: string;
};

export type ComplianceDeclineModalProps = {
  visible: boolean;
  tripLabel: string;
  onCancel: () => void;
  onSubmit: (reason: string) => Promise<void>;
  /** Overrides for reuse (e.g. Resubmit note). Defaults keep the Decline copy. */
  title?: string;
  fieldLabel?: string;
  placeholder?: string;
  submitLabel?: string;
  /** Shown above the field, e.g. the hold / reject reason being answered. */
  context?: { label: string; text: string } | null;
  /**
   * Resubmit: files uploaded / deleted since the hold or reject.
   * When present, `onSubmit` receives the composed note (log + remark).
   */
  changeLog?: {
    title?: string;
    items: ComplianceDeclineChangeLogItem[];
    /** Full note prefix included with the remark on submit. */
    noteBlock: string;
  } | null;
  /** True while audits / live docs for `changeLog` are still loading. Blocks Resubmit. */
  changeLogLoading?: boolean;
  /** Preset reasons (multi-select). The text box becomes an optional note. */
  presets?: readonly ComplianceDeclineReasonSection[];
  /** Pre-ticked presets and note, applied each time the modal opens. */
  initialSelected?: readonly string[];
  initialNote?: string;
};

function errorMessage(err: unknown): string {
  if (err instanceof Error && err.message.trim()) return err.message;
  if (typeof err === "string" && err.trim()) return err;
  return "Could not decline. Please try again.";
}

export function ComplianceDeclineModal({
  visible,
  tripLabel,
  onCancel,
  onSubmit,
  title,
  fieldLabel,
  placeholder,
  submitLabel,
  context,
  changeLog,
  changeLogLoading = false,
  presets,
  initialSelected,
  initialNote,
}: ComplianceDeclineModalProps) {
  const insets = useSafeAreaInsets();
  const [reason, setReason] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submittingRef = useRef(false);
  // Read on open only, so a background refetch can't wipe what the user edited.
  const initialRef = useRef({ initialSelected, initialNote });
  initialRef.current = { initialSelected, initialNote };

  useEffect(() => {
    if (visible) {
      setReason(initialRef.current.initialNote ?? "");
      setSelected([...(initialRef.current.initialSelected ?? [])]);
      setError(null);
      setSubmitting(false);
      submittingRef.current = false;
    }
  }, [visible]);

  const changeBlock = changeLog?.noteBlock?.trim() ?? "";
  const hasChangeLog = Boolean(changeLog && changeLog.items.length > 0 && changeBlock);
  /** Resubmit change-log mode: 500 applies to the remark only, not the file list. */
  const countingRemarkOnly = changeLog != null || changeLogLoading;
  const baseComposed = presets ? composeComplianceDeclineReason(selected, reason) ?? "" : reason;
  const remarkText = baseComposed.trim();
  const composed = countingRemarkOnly
    ? composeResubmitComplianceNote({ changeBlock, remark: remarkText })
    : baseComposed;
  const trimmedLength = complianceDeclineReasonLength(
    countingRemarkOnly ? remarkText : composed,
  );
  const tooShort = countingRemarkOnly
    ? hasChangeLog
      ? false
      : trimmedLength < COMPLIANCE_DECLINE_REASON_MIN
    : trimmedLength < COMPLIANCE_DECLINE_REASON_MIN;
  const tooLong = trimmedLength > COMPLIANCE_DECLINE_REASON_MAX;
  const invalid = tooShort || tooLong;
  const submitDisabled = invalid || submitting || changeLogLoading;

  const hint = changeLogLoading
    ? "Loading file changes since the hold/reject…"
    : tooLong
      ? `Keep it under ${COMPLIANCE_DECLINE_REASON_MAX} characters`
      : tooShort
        ? presets
          ? "Pick at least one reason or write a note"
          : `At least ${COMPLIANCE_DECLINE_REASON_MIN} characters`
        : hasChangeLog
          ? "Only your remark counts toward 500 — change log is saved with it"
          : null;

  const togglePreset = (option: string) => {
    setSelected((prev) => (prev.includes(option) ? prev.filter((item) => item !== option) : [...prev, option]));
    if (error) setError(null);
  };

  const handleCancel = () => {
    if (submittingRef.current) return;
    onCancel();
  };

  const handleSubmit = async () => {
    if (submittingRef.current || invalid) return;
    submittingRef.current = true;
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(composed.trim());
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
        <View style={styles.sheet} testID="compliance-decline-modal" accessibilityViewIsModal>
          <Text style={styles.title} accessibilityRole="header">
            {title ?? `${COMPLIANCE_DECLINE_ACTION_LABEL} trip compliance`}
          </Text>
          <Text style={styles.tripLabel} numberOfLines={1}>
            {tripLabel}
          </Text>
          {context ? (
            <View style={styles.context}>
              <Text style={styles.contextLabel}>{context.label}</Text>
              <Text style={styles.contextText}>{context.text}</Text>
            </View>
          ) : null}
          {changeLogLoading ? (
            <View style={styles.changeLogEmpty}>
              <Text style={styles.changeLogEmptyText}>Loading file changes…</Text>
            </View>
          ) : changeLog && changeLog.items.length > 0 ? (
            <View
              style={styles.changeLog}
              accessibilityRole="summary"
              accessibilityLabel={changeLog.title ?? "Changes since hold or reject"}
            >
              <Text style={styles.changeLogTitle}>
                {changeLog.title ?? "Changes since hold / reject"}
              </Text>
              <ScrollView
                style={styles.changeLogScroll}
                contentContainerStyle={styles.changeLogContent}
                nestedScrollEnabled
              >
                {changeLog.items.map((item, index) => (
                  <View key={`${item.kind}-${item.text}-${index}`} style={styles.changeLogRow}>
                    <View
                      style={[
                        styles.changeLogBadge,
                        item.kind === "deleted"
                          ? styles.changeLogBadgeDeleted
                          : styles.changeLogBadgeUploaded,
                      ]}
                    >
                      <Text
                        style={[
                          styles.changeLogBadgeText,
                          item.kind === "deleted"
                            ? styles.changeLogBadgeTextDeleted
                            : styles.changeLogBadgeTextUploaded,
                        ]}
                      >
                        {item.kind === "deleted" ? "Deleted" : "Uploaded"}
                      </Text>
                    </View>
                    <Text style={styles.changeLogText} numberOfLines={2}>
                      {item.text.replace(/^(Uploaded|Deleted)\s+/i, "")}
                    </Text>
                  </View>
                ))}
              </ScrollView>
              <Text style={styles.changeLogHint}>
                This list is saved with your remark for Compliance / Finance.
              </Text>
            </View>
          ) : changeLog ? (
            <View style={styles.changeLogEmpty}>
              <Text style={styles.changeLogEmptyText}>
                No file uploads or deletions recorded since the hold/reject. Upload or replace the
                required documents first, or describe what you fixed below.
              </Text>
            </View>
          ) : null}
          {presets ? (
            <ScrollView
              style={styles.presetScroll}
              contentContainerStyle={styles.presetContent}
              keyboardShouldPersistTaps="handled"
            >
              {presets.map((section) => (
                <View key={section.title} style={styles.presetSection}>
                  <Text style={styles.presetTitle}>{section.title}</Text>
                  <View style={styles.presetWrap}>
                    {section.options.map((option) => {
                      const on = selected.includes(option);
                      return (
                        <Pressable
                          key={option}
                          style={[styles.presetChip, on && styles.presetChipOn]}
                          onPress={() => togglePreset(option)}
                          disabled={submitting}
                          hitSlop={{ top: 6, bottom: 6 }}
                          accessibilityRole="checkbox"
                          accessibilityState={{ checked: on, disabled: submitting }}
                          accessibilityLabel={option}
                        >
                          {on ? <Check size={12} color={Theme.cardWhite} strokeWidth={3} /> : null}
                          <Text style={[styles.presetText, on && styles.presetTextOn]}>{option}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              ))}
            </ScrollView>
          ) : null}
          <Text style={styles.label}>{fieldLabel ?? (presets ? "Note (optional)" : "Reason")}</Text>
          <TextInput
            testID="compliance-decline-reason-input"
            accessibilityLabel={fieldLabel ?? "Decline reason"}
            style={styles.input}
            value={reason}
            onChangeText={(text) => {
              setReason(text);
              if (error) setError(null);
            }}
            placeholder={placeholder ?? (presets ? "Anything else Ground Ops should know" : "Why is this trip being declined?")}
            placeholderTextColor={Theme.textMuted}
            multiline
            autoFocus={!presets}
            editable={!submitting}
            textAlignVertical="top"
          />
          <View style={styles.metaRow}>
            <Text style={[styles.hint, tooLong && styles.hintError]} numberOfLines={1}>
              {hint ?? " "}
            </Text>
            <Text style={[styles.counter, tooLong && styles.hintError]}>
              {`${trimmedLength}/${COMPLIANCE_DECLINE_REASON_MAX}`}
            </Text>
          </View>
          {error ? (
            <Text style={styles.error} accessibilityRole="alert" testID="compliance-decline-error">
              {error}
            </Text>
          ) : null}
          <View style={styles.actions}>
            <Pressable
              testID="compliance-decline-cancel"
              style={[styles.button, styles.cancelButton, submitting && styles.buttonDisabled]}
              onPress={handleCancel}
              disabled={submitting}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
              accessibilityState={{ disabled: submitting }}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              testID="compliance-decline-submit"
              style={[styles.button, styles.submitButton, submitDisabled && styles.submitDisabled]}
              onPress={() => void handleSubmit()}
              disabled={submitDisabled}
              accessibilityRole="button"
              accessibilityLabel={submitting ? "Submitting" : (submitLabel ?? COMPLIANCE_DECLINE_ACTION_LABEL)}
              accessibilityState={{ disabled: submitDisabled, busy: submitting }}
            >
              <Text style={[styles.submitText, submitDisabled && styles.submitTextDisabled]}>
                {submitting ? "Submitting…" : (submitLabel ?? COMPLIANCE_DECLINE_ACTION_LABEL)}
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
    maxWidth: 560,
    maxHeight: "92%",
    backgroundColor: Theme.cardWhite,
    borderRadius: 14,
    padding: 18,
    gap: 6,
  },
  title: { fontSize: 16, fontWeight: "700", color: Theme.textPrimary },
  tripLabel: { fontSize: 13, color: Theme.textMuted, marginBottom: 6 },
  context: {
    gap: 2,
    padding: 10,
    borderRadius: 8,
    backgroundColor: Theme.complianceGroupDangerBg,
  },
  contextLabel: { fontSize: 11, fontWeight: "600", color: Theme.textMuted },
  contextText: { fontSize: 13, fontWeight: "600", color: Theme.complianceGroupDangerFg },
  changeLog: {
    gap: 6,
    padding: 10,
    borderRadius: 8,
    backgroundColor: Theme.screenBackground,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.border,
  },
  changeLogTitle: { fontSize: 11, fontWeight: "700", color: Theme.textMuted, textTransform: "uppercase" },
  changeLogScroll: { maxHeight: 140 },
  changeLogContent: { gap: 6 },
  changeLogRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  changeLogBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  changeLogBadgeUploaded: {
    backgroundColor: Theme.positiveMuted,
  },
  changeLogBadgeDeleted: {
    backgroundColor: Theme.complianceGroupDangerBg,
  },
  changeLogBadgeText: { fontSize: 10, fontWeight: "700" },
  changeLogBadgeTextUploaded: { color: Theme.positive },
  changeLogBadgeTextDeleted: { color: Theme.complianceGroupDangerFg },
  changeLogText: { flex: 1, minWidth: 0, fontSize: 13, fontWeight: "600", color: Theme.textPrimaryDark, lineHeight: 18 },
  changeLogHint: { fontSize: 11, color: Theme.textMuted, lineHeight: 15 },
  changeLogEmpty: {
    padding: 10,
    borderRadius: 8,
    backgroundColor: Theme.warningMuted,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.warning,
  },
  changeLogEmptyText: { fontSize: 12, color: Theme.textPrimaryDark, lineHeight: 17 },
  label: { fontSize: 12, fontWeight: "600", color: Theme.textPrimary },
  presetScroll: { maxHeight: 320 },
  presetContent: { gap: 10, paddingBottom: 4 },
  presetSection: { gap: 6 },
  presetTitle: { fontSize: 11, fontWeight: "700", color: Theme.textMuted, textTransform: "uppercase" },
  presetWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  presetChip: {
    minHeight: 32,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    backgroundColor: Theme.cardWhite,
  },
  presetChipOn: { backgroundColor: Theme.buttonDark, borderColor: Theme.buttonDark },
  presetText: { fontSize: 12, color: Theme.textPrimaryDark },
  presetTextOn: { color: Theme.cardWhite, fontWeight: "600" },
  input: {
    minHeight: 96,
    maxHeight: 200,
    borderWidth: 1,
    borderColor: Theme.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: Theme.textPrimary,
    backgroundColor: Theme.cardWhite,
  },
  metaRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  hint: { flex: 1, fontSize: 11, color: Theme.textMuted },
  hintError: { color: Theme.complianceStageDocsFg },
  counter: { fontSize: 11, color: Theme.textMuted },
  error: { fontSize: 12, fontWeight: "600", color: Theme.complianceStageDocsFg },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 10 },
  button: {
    minHeight: 44,
    minWidth: 96,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonDisabled: { opacity: 0.5 },
  cancelButton: { borderWidth: 1, borderColor: Theme.border, backgroundColor: Theme.cardWhite },
  cancelText: { fontSize: 14, fontWeight: "600", color: Theme.textPrimary },
  submitButton: { backgroundColor: Theme.complianceStageDocsFg },
  submitDisabled: { backgroundColor: Theme.complianceStageDocsBg },
  submitText: { fontSize: 14, fontWeight: "700", color: Theme.textOnPrimary },
  submitTextDisabled: { color: Theme.complianceStageDocsFg },
});
