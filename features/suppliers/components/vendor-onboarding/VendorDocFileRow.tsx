/**
 * One document line inside a vault card. Same file row and actions as the
 * client agreement upload card: name, status, and compact primary/ghost buttons.
 */
import { Platform, Pressable, StyleSheet, Text, View, type PressableStateCallbackType } from "react-native";
import FontAwesome from "@expo/vector-icons/FontAwesome";

import { LoadingIndicator } from "@/components/LoadingIndicator";
import Theme from "@/constants/Theme";
import type { SupplierKycDocument } from "@/features/suppliers/types/supplierManagement.types";
import { formatTripTableDate } from "@/lib/format";

type Props = {
  title: string;
  doc: SupplierKycDocument | undefined;
  canEdit: boolean;
  busy: boolean;
  /** single sections replace the file; multi sections remove it. */
  kind: "single" | "multi";
  last?: boolean;
  onUpload?: () => void;
  onView: (doc: SupplierKycDocument) => void;
  onVerify: (doc: SupplierKycDocument) => void;
  onRemove?: (doc: SupplierKycDocument) => void;
};

function DocAction({
  label,
  onPress,
  tone,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  tone: "primary" | "ghost" | "danger";
  accessibilityLabel: string;
}) {
  const primary = tone === "primary";
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={(state) => {
        const hovered = Boolean((state as PressableStateCallbackType & { hovered?: boolean }).hovered);
        return [
          styles.actionBtn,
          primary ? styles.actionPrimary : styles.actionGhost,
          state.pressed && styles.actionPressed,
          hovered && (primary ? styles.actionPrimaryHover : styles.actionGhostHover),
          Platform.OS === "web" ? ({ cursor: "pointer" } as const) : null,
        ];
      }}
    >
      <Text style={[primary ? styles.actionPrimaryText : styles.actionGhostText, tone === "danger" && styles.actionDangerText]}>
        {label}
      </Text>
    </Pressable>
  );
}

export function VendorDocFileRow({
  title,
  doc,
  canEdit,
  busy,
  kind,
  last,
  onUpload,
  onView,
  onVerify,
  onRemove,
}: Props) {
  const hasFile = Boolean((doc?.storage_path ?? "").trim());
  const verified = hasFile && doc?.status === "verified";
  const when = doc?.updated_at || doc?.created_at;
  const status = !hasFile ? "Missing" : verified ? "Verified" : "Pending";
  return (
    <View style={[styles.row, last && styles.rowLast]}>
      <View style={styles.fileRow}>
        <FontAwesome name={hasFile ? "file-text-o" : "file-o"} size={15} color={Theme.analyticsHeroBg} />
        <View style={styles.body}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          <View style={styles.meta}>
            <View style={[styles.pill, verified ? styles.pillOk : hasFile ? styles.pillPending : styles.pillMissing]}>
              <Text
                style={[
                  styles.pillText,
                  verified ? styles.pillTextOk : hasFile ? styles.pillTextPending : styles.pillTextMissing,
                ]}
              >
                {status}
              </Text>
            </View>
            <Text style={styles.metaText} numberOfLines={1}>
              {hasFile ? `${doc?.file_name ?? "File"} · ${when ? formatTripTableDate(when) : "—"}` : "No file uploaded"}
            </Text>
          </View>
        </View>
      </View>
      <View style={styles.actions}>
        {busy ? (
          <LoadingIndicator size="small" color={Theme.analyticsHeroBg} />
        ) : (
          <>
            {hasFile && doc ? (
              <DocAction label="View" tone="ghost" onPress={() => onView(doc)} accessibilityLabel={`View ${title}`} />
            ) : null}
            {canEdit && hasFile && doc && !verified ? (
              <DocAction label="Verify" tone="ghost" onPress={() => onVerify(doc)} accessibilityLabel={`Verify ${title}`} />
            ) : null}
            {canEdit && kind === "single" && onUpload ? (
              <DocAction
                label={hasFile ? "Replace" : "Upload"}
                tone="primary"
                onPress={onUpload}
                accessibilityLabel={`${hasFile ? "Replace" : "Upload"} ${title}`}
              />
            ) : null}
            {canEdit && kind === "multi" && doc && onRemove ? (
              <DocAction label="Remove" tone="danger" onPress={() => onRemove(doc)} accessibilityLabel={`Remove ${title}`} />
            ) : null}
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: 8,
    paddingTop: 4,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderInput,
  },
  rowLast: { borderBottomWidth: 0, paddingBottom: 0 },
  fileRow: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 36 },
  body: { flex: 1, minWidth: 0, gap: 2 },
  title: { fontSize: 13, fontWeight: "600", color: Theme.textPrimaryDark },
  meta: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  metaText: { fontSize: 11, fontWeight: "500", color: Theme.textMuted, flexShrink: 1 },
  pill: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6 },
  pillOk: { backgroundColor: Theme.positiveMuted },
  pillPending: { backgroundColor: Theme.warningMuted },
  pillMissing: { backgroundColor: Theme.surface },
  pillText: { fontSize: 9, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.3 },
  pillTextOk: { color: Theme.positive },
  pillTextPending: { color: Theme.warning },
  pillTextMissing: { color: Theme.textMuted },
  actions: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 },
  actionBtn: {
    minHeight: 34,
    paddingHorizontal: 14,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  actionPrimary: { backgroundColor: Theme.analyticsHeroBg },
  actionGhost: {
    borderWidth: 1,
    borderColor: Theme.borderInput,
    backgroundColor: Theme.cardWhite,
  },
  actionPrimaryHover: { opacity: 0.9 },
  actionGhostHover: { backgroundColor: Theme.surface },
  actionPressed: { opacity: 0.82 },
  actionPrimaryText: { fontSize: 12, fontWeight: "800", color: Theme.textOnPrimary },
  actionGhostText: { fontSize: 12, fontWeight: "700", color: Theme.textPrimaryDark },
  actionDangerText: { color: Theme.negative },
});
