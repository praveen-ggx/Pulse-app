import Theme from "@/constants/Theme";
import {
  COMPLIANCE_UTR_MAX_LENGTH,
  normalizeComplianceUtr,
  validateComplianceUtr,
} from "@/features/tripCompliance/utils/compliancePaymentReference.util";
import { Check, Pencil, X } from "lucide-react-native";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type TextStyle,
} from "react-native";

/**
 * UTR row of a posted payment. Read-only value with an Edit control; editing
 * swaps in an inline input with Save / Cancel. Only the UTR is editable.
 */
export function ComplianceUtrEditRow({
  utr,
  canEdit,
  disabledReason,
  onSave,
}: {
  utr: string | null;
  canEdit: boolean;
  /** Shown under the value when editing is not possible (e.g. cash payment). */
  disabledReason?: string | null;
  onSave: (utr: string) => Promise<void>;
}) {
  const posted = utr?.trim() ?? "";
  /** Saved value shown until the refetched payment catches up. */
  const [optimistic, setOptimistic] = useState<string | null>(null);
  const current = optimistic ?? posted;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(current);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    setOptimistic(null);
  }, [posted]);

  useEffect(() => {
    if (!editing) setDraft(current);
  }, [current, editing]);

  const startEdit = () => {
    setDraft(current);
    setError(null);
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const cancel = () => {
    if (saving) return;
    setEditing(false);
    setError(null);
  };

  const save = async () => {
    if (saving) return;
    const next = normalizeComplianceUtr(draft);
    const invalid = validateComplianceUtr(next);
    if (invalid) {
      setError(invalid);
      return;
    }
    if (next === current.toUpperCase()) {
      setEditing(false);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(next);
      setOptimistic(next);
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't update UTR. Try again.");
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <View style={styles.row}>
        <Text style={styles.label}>UTR</Text>
        <View style={styles.valueCol}>
          <View style={styles.valueLine}>
            <Text
              style={[styles.value, !current && styles.valueEmpty]}
              numberOfLines={1}
              selectable
            >
              {current || "Not added"}
            </Text>
            {canEdit ? (
              <TouchableOpacity
                style={styles.editBtn}
                onPress={startEdit}
                activeOpacity={0.75}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel={current ? "Edit UTR" : "Add UTR"}
              >
                <Pencil size={11} color={Theme.textPrimaryDark} strokeWidth={2.2} />
                <Text style={styles.editBtnText}>{current ? "Edit" : "Add UTR"}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
          {!canEdit && disabledReason ? <Text style={styles.hint}>{disabledReason}</Text> : null}
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.row, styles.rowEditing]}>
      <Text style={styles.label}>UTR</Text>
      <View style={styles.valueCol}>
        <View style={styles.editLine}>
          <TextInput
            ref={inputRef}
            value={draft}
            onChangeText={(text) => {
              setDraft(text.toUpperCase());
              if (error) setError(null);
            }}
            onSubmitEditing={() => void save()}
            placeholder="Enter UTR / bank reference"
            placeholderTextColor={Theme.textMuted}
            autoCapitalize="characters"
            autoCorrect={false}
            spellCheck={false}
            maxLength={COMPLIANCE_UTR_MAX_LENGTH}
            editable={!saving}
            returnKeyType="done"
            style={[styles.input, error ? styles.inputError : null] as TextStyle[]}
            accessibilityLabel="UTR number"
          />
          <TouchableOpacity
            style={[styles.iconBtn, styles.cancelBtn]}
            onPress={cancel}
            disabled={saving}
            activeOpacity={0.75}
            hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
            accessibilityRole="button"
            accessibilityLabel="Cancel UTR edit"
          >
            <X size={14} color={Theme.textPrimaryDark} strokeWidth={2.4} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.iconBtn, styles.saveBtn, saving && styles.saveBtnBusy]}
            onPress={() => void save()}
            disabled={saving}
            activeOpacity={0.85}
            hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
            accessibilityRole="button"
            accessibilityLabel="Save UTR"
          >
            {saving ? (
              <ActivityIndicator size="small" color={Theme.cardWhite} />
            ) : (
              <Check size={14} color={Theme.cardWhite} strokeWidth={2.6} />
            )}
          </TouchableOpacity>
        </View>
        {error ? (
          <Text style={styles.error}>{error}</Text>
        ) : (
          <Text style={styles.hint}>Only the UTR changes — amount, mode and date stay as posted.</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 40,
  },
  rowEditing: { alignItems: "flex-start", backgroundColor: Theme.compliancePageBg },
  label: {
    width: 128,
    flexShrink: 0,
    fontSize: 8,
    fontWeight: "600",
    letterSpacing: 0.3,
    textTransform: "uppercase",
    color: Theme.textMuted,
    paddingTop: 4,
  },
  valueCol: { flex: 1, minWidth: 0, alignItems: "flex-end", gap: 4 },
  valueLine: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 8,
    minWidth: 0,
    maxWidth: "100%",
  },
  value: {
    flexShrink: 1,
    minWidth: 0,
    textAlign: "right",
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    lineHeight: 15,
    letterSpacing: 0.4,
    fontVariant: ["tabular-nums"],
  },
  valueEmpty: { color: Theme.textMuted, fontWeight: "500", letterSpacing: 0 },
  editBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    height: 24,
    paddingHorizontal: 9,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.complianceTripCardBorder,
    backgroundColor: Theme.cardWhite,
  },
  editBtnText: { fontSize: 10, fontWeight: "700", color: Theme.textPrimaryDark },
  editLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    width: "100%",
    maxWidth: 340,
  },
  input: {
    flex: 1,
    minWidth: 0,
    height: 32,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.textPrimaryDark,
    backgroundColor: Theme.cardWhite,
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.5,
    color: Theme.textPrimaryDark,
    textAlign: "right",
    ...(Platform.OS === "web" ? { outlineStyle: "none" } : null),
  },
  inputError: { borderColor: Theme.complianceStageDocsFg },
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelBtn: {
    borderWidth: 1,
    borderColor: Theme.complianceTripCardBorder,
    backgroundColor: Theme.cardWhite,
  },
  saveBtn: { backgroundColor: Theme.positive },
  saveBtnBusy: { opacity: 0.75 },
  hint: { fontSize: 9, fontWeight: "500", color: Theme.textMuted, textAlign: "right" },
  error: { fontSize: 9, fontWeight: "600", color: Theme.complianceStageDocsFg, textAlign: "right" },
});
