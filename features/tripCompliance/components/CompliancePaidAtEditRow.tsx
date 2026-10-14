import Theme from "@/constants/Theme";
import {
  formatComplianceTxnDate,
  normalizeComplianceTransactionDate,
  toComplianceTransactionDateInput,
  validateComplianceTransactionDate,
} from "@/features/tripCompliance/utils/compliancePaymentDate.util";
import { Calendar, Check, Pencil, X } from "lucide-react-native";
import React, { createElement, useEffect, useRef, useState } from "react";
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
 * Paid at row of a posted advance. Blank until Ops sets a date; then shows the
 * confirmed day with Edit. Calendar date control — only
 * `transactions.transaction_date` (+ confirmation marker) changes.
 */
export function CompliancePaidAtEditRow({
  paidAt,
  canEdit,
  onSave,
}: {
  paidAt: string | null;
  canEdit: boolean;
  onSave: (transactionDate: string) => Promise<void>;
}) {
  const posted = toComplianceTransactionDateInput(paidAt);
  const [optimistic, setOptimistic] = useState<string | null>(null);
  const current = optimistic ?? posted;
  const display = formatComplianceTxnDate(current);
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
    setDraft(current || toComplianceTransactionDateInput(new Date().toISOString()));
    setError(null);
    setEditing(true);
    if (Platform.OS !== "web") setTimeout(() => inputRef.current?.focus(), 0);
  };

  const cancel = () => {
    if (saving) return;
    setEditing(false);
    setError(null);
  };

  const save = async (raw?: string) => {
    if (saving) return;
    const next = normalizeComplianceTransactionDate(raw ?? draft);
    const invalid = validateComplianceTransactionDate(next);
    if (invalid) {
      setError(invalid);
      return;
    }
    if (next === current && current) {
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
      setError(e instanceof Error ? e.message : "Couldn't update Paid at. Try again.");
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <View style={styles.row}>
        <Text style={styles.label}>Paid at</Text>
        <View style={styles.valueCol}>
          <View style={styles.valueLine}>
            {current ? (
              <Text style={styles.value} numberOfLines={1} selectable>
                {display}
              </Text>
            ) : null}
            {canEdit ? (
              <TouchableOpacity
                style={styles.editBtn}
                onPress={startEdit}
                activeOpacity={0.75}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel={current ? "Edit paid at date" : "Add paid at date"}
              >
                <Pencil size={11} color={Theme.textPrimaryDark} strokeWidth={2.2} />
                <Text style={styles.editBtnText}>Edit</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      </View>
    );
  }

  const isoDraft = /^\d{4}-\d{2}-\d{2}$/.test(draft) ? draft : "";

  return (
    <View style={[styles.row, styles.rowEditing]}>
      <Text style={styles.label}>Paid at</Text>
      <View style={styles.valueCol}>
        <View style={styles.editLine}>
          {Platform.OS === "web" ? (
            <View style={[styles.dateShell, error ? styles.dateShellError : null]}>
              {createElement("input", {
                type: "date",
                value: isoDraft,
                disabled: saving,
                lang: "en-IN",
                "aria-label": "Paid at date",
                onChange: (e: { target?: { value?: string } }) => {
                  const next = String(e?.target?.value ?? "");
                  setDraft(next);
                  if (error) setError(null);
                  if (next) void save(next);
                },
                style: {
                  flex: 1,
                  width: "100%",
                  minWidth: 0,
                  boxSizing: "border-box",
                  border: "none",
                  outline: "none",
                  background: "transparent",
                  fontSize: 12,
                  fontWeight: 600,
                  lineHeight: "18px",
                  color: Theme.textPrimaryDark,
                  fontFamily:
                    'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                  padding: 0,
                  margin: 0,
                  minHeight: 20,
                  cursor: saving ? "default" : "pointer",
                },
              })}
              {saving ? (
                <ActivityIndicator size="small" color={Theme.textMuted} />
              ) : (
                <Calendar size={13} color={Theme.textMuted} strokeWidth={2.2} />
              )}
            </View>
          ) : (
            <TextInput
              ref={inputRef}
              value={draft}
              onChangeText={(text) => {
                setDraft(text);
                if (error) setError(null);
              }}
              onSubmitEditing={() => void save()}
              placeholder="dd/mm/yyyy"
              placeholderTextColor={Theme.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              maxLength={10}
              editable={!saving}
              returnKeyType="done"
              keyboardType={Platform.OS === "ios" ? "numbers-and-punctuation" : "default"}
              style={[styles.nativeInput, error ? styles.dateShellError : null] as TextStyle[]}
              accessibilityLabel="Paid at date"
            />
          )}
          <TouchableOpacity
            style={[styles.iconBtn, styles.cancelBtn]}
            onPress={cancel}
            disabled={saving}
            activeOpacity={0.75}
            hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
            accessibilityRole="button"
            accessibilityLabel="Cancel paid at edit"
          >
            <X size={14} color={Theme.textPrimaryDark} strokeWidth={2.4} />
          </TouchableOpacity>
          {Platform.OS !== "web" ? (
            <TouchableOpacity
              style={[styles.iconBtn, styles.saveBtn, saving && styles.saveBtnBusy]}
              onPress={() => void save()}
              disabled={saving}
              activeOpacity={0.85}
              hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
              accessibilityRole="button"
              accessibilityLabel="Save paid at"
            >
              {saving ? (
                <ActivityIndicator size="small" color={Theme.cardWhite} />
              ) : (
                <Check size={14} color={Theme.cardWhite} strokeWidth={2.6} />
              )}
            </TouchableOpacity>
          ) : null}
        </View>
        {error ? (
          <Text style={styles.error}>{error}</Text>
        ) : (
          <Text style={styles.hint}>Pick a date — amount, mode and UTR stay as posted.</Text>
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
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.3,
    textTransform: "uppercase",
    color: Theme.textMuted,
    paddingTop: 0,
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
  },
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
    maxWidth: 300,
  },
  dateShell: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 32,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.complianceTripCardBorder,
    backgroundColor: Theme.cardWhite,
  },
  dateShellError: { borderColor: Theme.complianceStageDocsFg },
  nativeInput: {
    flex: 1,
    minWidth: 0,
    height: 32,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.complianceTripCardBorder,
    backgroundColor: Theme.cardWhite,
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    textAlign: "right",
  },
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
