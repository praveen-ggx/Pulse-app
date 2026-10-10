/**
 * Files of one document type (e.g. every Invoice on a trip). Opened from the
 * eye on a grouped checklist row: preview a file, replace or remove it, or
 * add another. The parent owns the actions; this only renders.
 */
import Theme from "@/constants/Theme";
import { Eye, Plus, RefreshCw, Trash2, X } from "lucide-react-native";
import React from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export type ComplianceDocTypeFile = {
  key: string;
  label: string;
  fileName: string;
  statusLabel: string;
  statusColor: string;
  canPreview: boolean;
  canReplace: boolean;
  canRemove: boolean;
  /** Why Replace / Remove are off, e.g. "Approved files are locked". */
  lockedReason?: string | null;
};

export function ComplianceDocTypeFilesModal({
  visible,
  title,
  files,
  busyKey,
  adding,
  canAdd,
  footnote,
  onPreview,
  onReplace,
  onRemove,
  onAdd,
  onClose,
}: {
  visible: boolean;
  title: string;
  files: ComplianceDocTypeFile[];
  /** File key whose Replace / Remove is running. */
  busyKey: string | null;
  adding: boolean;
  canAdd: boolean;
  footnote?: string | null;
  onPreview: (key: string) => void;
  onReplace: (key: string) => void;
  onRemove: (key: string) => void;
  onAdd: () => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const busy = Boolean(busyKey) || adding;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={busy ? undefined : onClose}>
      <View
        style={[
          styles.overlay,
          {
            paddingTop: insets.top + 16,
            paddingBottom: insets.bottom + 16,
            paddingLeft: insets.left + 16,
            paddingRight: insets.right + 16,
          },
        ]}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={busy ? undefined : onClose}
          accessibilityRole="button"
          accessibilityLabel="Close"
        />
        <View style={styles.sheet} accessibilityViewIsModal testID="compliance-doc-type-files-modal">
          <View style={styles.header}>
            <Text style={styles.title} accessibilityRole="header" numberOfLines={1}>
              {title}
            </Text>
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={onClose}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <X size={18} color={Theme.textMuted} strokeWidth={2.2} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
            {files.length === 0 ? <Text style={styles.empty}>No files yet.</Text> : null}
            {files.map((file) => {
              const rowBusy = busyKey === file.key;
              return (
                <View key={file.key} style={styles.fileRow}>
                  <View style={styles.fileCopy}>
                    <Text style={styles.fileLabel} numberOfLines={1}>
                      {file.label}
                    </Text>
                    <Text style={styles.fileName} numberOfLines={1}>
                      {file.fileName || "—"}
                    </Text>
                    <Text style={[styles.fileStatus, { color: file.statusColor }]} numberOfLines={1}>
                      {file.statusLabel}
                      {file.lockedReason ? ` · ${file.lockedReason}` : ""}
                    </Text>
                  </View>
                  <View style={styles.fileActions}>
                    <TouchableOpacity
                      style={[styles.actionBtn, !file.canPreview && styles.actionBtnOff]}
                      onPress={() => onPreview(file.key)}
                      disabled={!file.canPreview || busy}
                      accessibilityRole="button"
                      accessibilityLabel={`Open ${file.label} full screen`}
                    >
                      <Eye size={14} color={Theme.textPrimaryDark} strokeWidth={2.2} />
                    </TouchableOpacity>
                    {file.canReplace ? (
                      <TouchableOpacity
                        style={[styles.actionBtn, busy && styles.actionBtnOff]}
                        onPress={() => onReplace(file.key)}
                        disabled={busy}
                        accessibilityRole="button"
                        accessibilityLabel={`Replace ${file.label}`}
                      >
                        {rowBusy ? (
                          <ActivityIndicator size="small" color={Theme.textPrimaryDark} />
                        ) : (
                          <RefreshCw size={14} color={Theme.textPrimaryDark} strokeWidth={2.2} />
                        )}
                      </TouchableOpacity>
                    ) : null}
                    {file.canRemove ? (
                      <TouchableOpacity
                        style={[styles.actionBtn, styles.removeBtn, busy && styles.actionBtnOff]}
                        onPress={() => onRemove(file.key)}
                        disabled={busy}
                        accessibilityRole="button"
                        accessibilityLabel={`Remove ${file.label}`}
                      >
                        <Trash2 size={14} color={Theme.destructive} strokeWidth={2.2} />
                      </TouchableOpacity>
                    ) : null}
                  </View>
                </View>
              );
            })}
          </ScrollView>

          {footnote ? <Text style={styles.footnote}>{footnote}</Text> : null}

          {canAdd ? (
            <TouchableOpacity
              style={[styles.addBtn, busy && styles.actionBtnOff]}
              onPress={onAdd}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="Add document"
            >
              {adding ? (
                <ActivityIndicator size="small" color={Theme.cardWhite} />
              ) : (
                <Plus size={14} color={Theme.cardWhite} strokeWidth={2.4} />
              )}
              <Text style={styles.addBtnText}>{adding ? "Uploading…" : "Add document"}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
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
    maxWidth: 480,
    maxHeight: "90%",
    backgroundColor: Theme.cardWhite,
    borderRadius: 14,
    padding: 18,
    gap: 10,
  },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  title: { flex: 1, fontSize: 16, fontWeight: "700", color: Theme.textPrimary },
  iconBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  list: { flexGrow: 0 },
  listContent: { gap: 8 },
  empty: { fontSize: 13, color: Theme.textMuted },
  fileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
  },
  fileCopy: { flex: 1, minWidth: 0, gap: 2 },
  fileLabel: { fontSize: 13, fontWeight: "700", color: Theme.textPrimaryDark },
  fileName: { fontSize: 12, color: Theme.textMuted },
  fileStatus: { fontSize: 11, fontWeight: "600" },
  fileActions: { flexDirection: "row", gap: 6 },
  actionBtn: {
    width: 44,
    height: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    alignItems: "center",
    justifyContent: "center",
  },
  removeBtn: { borderColor: Theme.complianceGroupDangerDot },
  actionBtnOff: { opacity: 0.45 },
  footnote: { fontSize: 11, color: Theme.textMuted },
  addBtn: {
    minHeight: 44,
    borderRadius: 10,
    backgroundColor: Theme.buttonDark,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  addBtnText: { fontSize: 14, fontWeight: "700", color: Theme.cardWhite },
});
