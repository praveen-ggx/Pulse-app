/**
 * Editor for org-wise document charge slabs (freight range → flat charge).
 * Works on a local draft; `onSave` receives the validated slabs.
 */
import { LoadingIndicator } from "@/components/LoadingIndicator";
import Theme from "@/constants/Theme";
import {
  defaultDocumentChargeSlabs,
  newSlabId,
  validateDocumentChargeSlabs,
  type DocumentChargeSlab,
} from "@/features/organization/utils/documentChargeSlabs.util";
import { Plus, RotateCcw, Trash2 } from "lucide-react-native";
import { useEffect, useState } from "react";
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

type DraftRow = { id: string; from: string; to: string; charge: string };

type Props = {
  visible: boolean;
  slabs: DocumentChargeSlab[];
  saving?: boolean;
  onSave: (slabs: DocumentChargeSlab[]) => void;
  onClose: () => void;
};

const toDraft = (slabs: DocumentChargeSlab[]): DraftRow[] =>
  slabs.map((s) => ({
    id: s.id,
    from: String(s.from),
    to: s.to === null ? "" : String(s.to),
    charge: String(s.charge),
  }));

const digits = (v: string) => v.replace(/[^0-9]/g, "");

function fromDraft(rows: DraftRow[]): DocumentChargeSlab[] {
  return rows.map((r) => ({
    id: r.id,
    from: r.from === "" ? NaN : Number(r.from),
    to: r.to === "" ? null : Number(r.to),
    charge: r.charge === "" ? NaN : Number(r.charge),
  }));
}

export function DocumentChargeSlabsModal({
  visible,
  slabs,
  saving = false,
  onSave,
  onClose,
}: Props) {
  const [rows, setRows] = useState<DraftRow[]>(() => toDraft(slabs));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setRows(toDraft(slabs));
      setError(null);
    }
  }, [visible, slabs]);

  const update = (id: string, key: keyof Omit<DraftRow, "id">, value: string) => {
    setError(null);
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [key]: digits(value) } : r)));
  };

  const addRow = () => {
    setError(null);
    setRows((prev) => {
      const last = prev[prev.length - 1];
      const lastTo = last && last.to !== "" ? Number(last.to) : null;
      const nextFrom = lastTo !== null ? String(lastTo + 1) : "";
      return [...prev, { id: newSlabId(), from: nextFrom, to: "", charge: "" }];
    });
  };

  const removeRow = (id: string) => {
    setError(null);
    setRows((prev) => prev.filter((r) => r.id !== id));
  };

  const resetDefaults = () => {
    setError(null);
    setRows(toDraft(defaultDocumentChargeSlabs()));
  };

  const handleSave = () => {
    if (saving) return;
    const parsed = fromDraft(rows);
    const err = validateDocumentChargeSlabs(parsed);
    if (err) {
      setError(err);
      return;
    }
    onSave(parsed);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.card}>
          <View style={styles.headRow}>
            <View style={styles.headText}>
              <Text style={styles.title}>Document Charge Slabs</Text>
              <Text style={styles.subtitle}>
                Set a flat document charge for each freight cost range. Leave the last
                &quot;To&quot; empty for &quot;and above&quot;.
              </Text>
            </View>
            <Pressable
              onPress={resetDefaults}
              style={({ pressed }) => [styles.resetBtn, pressed && { opacity: 0.7 }]}
              accessibilityRole="button"
              accessibilityLabel="Reset to default slabs"
            >
              <RotateCcw size={12} color={Theme.textSecondary} strokeWidth={2.2} />
              <Text style={styles.resetText}>Defaults</Text>
            </Pressable>
          </View>

          <View style={styles.tableHead}>
            <Text style={[styles.th, styles.colIdx]}>#</Text>
            <Text style={[styles.th, styles.colNum]}>From (₹)</Text>
            <Text style={[styles.th, styles.colNum]}>To (₹)</Text>
            <Text style={[styles.th, styles.colNum]}>Charge (₹)</Text>
            <View style={styles.colAction} />
          </View>

          <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
            {rows.map((r, i) => {
              const isLast = i === rows.length - 1;
              return (
                <View key={r.id} style={styles.row}>
                  <Text style={[styles.idx, styles.colIdx]}>{i + 1}</Text>
                  <TextInput
                    style={[styles.input, styles.colNum]}
                    value={r.from}
                    onChangeText={(v) => update(r.id, "from", v)}
                    keyboardType="number-pad"
                    placeholder="0"
                    placeholderTextColor={Theme.textMuted}
                  />
                  <TextInput
                    style={[styles.input, styles.colNum]}
                    value={r.to}
                    onChangeText={(v) => update(r.id, "to", v)}
                    keyboardType="number-pad"
                    placeholder={isLast ? "Above" : "0"}
                    placeholderTextColor={Theme.textMuted}
                  />
                  <TextInput
                    style={[styles.input, styles.colNum]}
                    value={r.charge}
                    onChangeText={(v) => update(r.id, "charge", v)}
                    keyboardType="number-pad"
                    placeholder="0"
                    placeholderTextColor={Theme.textMuted}
                  />
                  <Pressable
                    onPress={() => removeRow(r.id)}
                    disabled={rows.length <= 1}
                    style={({ pressed }) => [
                      styles.colAction,
                      styles.deleteBtn,
                      rows.length <= 1 && styles.btnDisabled,
                      pressed && { opacity: 0.7 },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove slab ${i + 1}`}
                  >
                    <Trash2 size={14} color={Theme.destructive} strokeWidth={2.2} />
                  </Pressable>
                </View>
              );
            })}

            <Pressable
              onPress={addRow}
              style={({ pressed }) => [styles.addBtn, pressed && { opacity: 0.8 }]}
              accessibilityRole="button"
              accessibilityLabel="Add slab"
            >
              <Plus size={14} color={Theme.primary} strokeWidth={2.4} />
              <Text style={styles.addText}>Add slab</Text>
            </Pressable>
          </ScrollView>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <View style={styles.actions}>
            <Pressable
              onPress={onClose}
              style={({ pressed }) => [styles.btn, styles.btnGhost, pressed && { opacity: 0.85 }]}
              accessibilityRole="button"
            >
              <Text style={styles.btnGhostText}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={handleSave}
              disabled={saving}
              style={({ pressed }) => [
                styles.btn,
                styles.btnPrimary,
                saving && styles.btnDisabled,
                pressed && !saving && { opacity: 0.9 },
              ]}
              accessibilityRole="button"
            >
              {saving ? (
                <LoadingIndicator size="small" color={Theme.textOnDark} />
              ) : (
                <Text style={styles.btnPrimaryText}>Save Slabs</Text>
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: Theme.overlayBackdrop,
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  card: {
    width: "100%",
    maxWidth: 520,
    maxHeight: "90%",
    backgroundColor: Theme.surface,
    borderRadius: 16,
    padding: 20,
  },
  headRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  headText: { flex: 1, minWidth: 0 },
  title: { fontSize: 17, fontWeight: "700", color: Theme.textPrimary },
  subtitle: { marginTop: 6, fontSize: 12, lineHeight: 17, color: Theme.textSecondary },
  resetBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    minHeight: 32,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderMedium,
  },
  resetText: { fontSize: 11, fontWeight: "600", color: Theme.textSecondary },
  tableHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 16,
    paddingBottom: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
  },
  th: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textMuted,
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  colIdx: { width: 18 },
  colNum: { flex: 1, minWidth: 0 },
  colAction: { width: 36 },
  list: { marginTop: 6, flexGrow: 0 },
  row: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 5 },
  idx: { fontSize: 12, fontWeight: "600", color: Theme.textSecondary },
  input: {
    height: 40,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.border,
    paddingHorizontal: 10,
    fontSize: 13,
    color: Theme.textPrimary,
    backgroundColor: Theme.cardWhite,
  },
  deleteBtn: { height: 44, alignItems: "center", justifyContent: "center" },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 8,
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: Theme.primary,
  },
  addText: { fontSize: 13, fontWeight: "600", color: Theme.primary },
  error: { marginTop: 10, fontSize: 12, color: Theme.destructive, fontWeight: "500" },
  actions: { flexDirection: "row", gap: 10, marginTop: 16 },
  btn: { flex: 1, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  btnGhost: { backgroundColor: Theme.surfaceLight },
  btnGhostText: { fontSize: 14, fontWeight: "600", color: Theme.textPrimary },
  btnPrimary: { backgroundColor: Theme.primary },
  btnPrimaryText: { fontSize: 14, fontWeight: "700", color: Theme.textOnDark },
  btnDisabled: { opacity: 0.4 },
});
