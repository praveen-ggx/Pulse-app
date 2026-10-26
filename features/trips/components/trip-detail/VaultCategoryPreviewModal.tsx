/**
 * Category document viewer — hero + sideways thumb strip (same as LR copies).
 */
import Theme from "@/constants/Theme";
import { documentRequiresExpiry } from "@/features/tripCompliance/tripCompliance.types";
import {
  RegistryGhostButton,
  RegistryPrimaryButton,
} from "@/components/AlertRegistryCardActions";
import { ThemedAlertModal } from "@/components/ThemedAlertModal";
import { VaultDraftPreviewBlock } from "@/features/trips/components/trip-detail/VaultDraftPreviewBlock";
import type { VaultCategoryPreviewFile } from "@/features/trips/components/trip-detail/vaultCategoryPreview.types";
import { getDocumentViewUrls } from "@/features/trips/services/tripDocuments.service";

/** A trip-bucket miss must not erase a URL already signed from another bucket. */
export function mergeCategoryPreviewUrls(
  prev: Record<string, string | null>,
  next: Record<string, string | null>,
): Record<string, string | null> {
  const merged = { ...prev };
  for (const [key, value] of Object.entries(next)) {
    if (value) merged[key] = value;
    else if (!merged[key]) merged[key] = value;
  }
  return merged;
}
import Feather from "@expo/vector-icons/Feather";
import { useEffect, useMemo, useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const WEB_COPY =
  Platform.OS === "web"
    ? ({ whiteSpace: "pre-wrap", letterSpacing: 0 } as const)
    : ({ letterSpacing: 0 } as const);

const HUG: ViewStyle = {
  alignSelf: "flex-start",
  flexGrow: 0,
  minWidth: 0,
  width: "auto",
};

type Props = {
  visible: boolean;
  files: VaultCategoryPreviewFile[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  onAdd?: () => void;
  onDelete?: (file: VaultCategoryPreviewFile) => void;
  onResolveUrl?: (file: VaultCategoryPreviewFile) => Promise<string | null>;
  onEditExpiry?: (file: VaultCategoryPreviewFile) => void;
};

function prettyPreviewExpiry(iso?: string | null): string {
  const day = iso?.trim().slice(0, 10) ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return "";
  return new Date(`${day}T12:00:00`).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function VaultCategoryPreviewModal({
  visible,
  files,
  index,
  onIndexChange,
  onClose,
  onAdd,
  onDelete,
  onResolveUrl,
  onEditExpiry,
}: Props) {
  const insets = useSafeAreaInsets();
  const [urls, setUrls] = useState<Record<string, string | null>>({});
  const [deleteFile, setDeleteFile] = useState<VaultCategoryPreviewFile | null>(null);
  const safeIndex = Math.max(0, Math.min(index, Math.max(0, files.length - 1)));
  const current = files[safeIndex] ?? null;
  const category = current?.categoryLabel || "Document";
  const headerExpiryIso =
    current?.expiryDate?.trim() ||
    files.find((file) => file.expiryDate?.trim())?.expiryDate ||
    "";
  const headerExpiry = prettyPreviewExpiry(headerExpiryIso);
  const showHeaderExpiry =
    Boolean(headerExpiry) ||
    documentRequiresExpiry(current?.complianceType ?? current?.driverKind ?? "");

  const paths = useMemo(
    () =>
      [...new Set(files.map((file) => String(file.storagePath ?? "").trim()).filter(Boolean))],
    [files],
  );

  useEffect(() => {
    if (!visible || paths.length === 0) {
      setUrls({});
      return;
    }
    let cancelled = false;
    void getDocumentViewUrls(paths).then((next) => {
      if (cancelled) return;
      setUrls((prev) => mergeCategoryPreviewUrls(prev, next));
    });
    return () => {
      cancelled = true;
    };
  }, [paths, visible]);

  useEffect(() => {
    if (!visible || !onResolveUrl || files.length === 0) return;
    let cancelled = false;
    void Promise.all(
      files.map(async (file) => {
        if (file.previewUri?.trim()) {
          return [file.id, file.previewUri.trim()] as const;
        }
        const path = String(file.storagePath ?? "").trim();
        const next = await onResolveUrl(file);
        return [path || file.id, next] as const;
      }),
    ).then((entries) => {
      if (cancelled) return;
      setUrls((prev) => {
        const merged = { ...prev };
        for (const [key, value] of entries) {
          if (value) merged[key] = value;
        }
        return merged;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [files, onResolveUrl, visible]);

  const items = useMemo(
    () =>
      files.map((file) => ({
        id: file.id,
        fileName: file.fileName,
        storagePath: file.storagePath,
        locked: !onDelete || !file.deleteKind,
        previewUri:
          file.previewUri?.trim() ||
          (file.storagePath ? urls[file.storagePath] ?? null : null) ||
          (urls[file.id] ?? null),
      })),
    [files, urls],
  );

  return (
    <>
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
      {...(Platform.OS === "web" ? { style: { zIndex: 20000 } } : {})}
    >
      <View style={[styles.backdrop, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 }]}>
        <View style={styles.card}>
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <View style={styles.headerTitleRow}>
                <Text style={styles.category} numberOfLines={1}>
                  {category}
                </Text>
                <Text style={styles.meta} numberOfLines={1}>
                  {files.length > 0
                    ? `${safeIndex + 1} of ${files.length}`
                    : "No document"}
                </Text>
              </View>
              {showHeaderExpiry ? (
                <Pressable
                  onPress={
                    onEditExpiry && current
                      ? () => onEditExpiry(current)
                      : undefined
                  }
                  disabled={!onEditExpiry}
                  style={styles.headerExpiryRow}
                  accessibilityRole={onEditExpiry ? "button" : undefined}
                  accessibilityLabel="Valid till date"
                >
                  <Text style={styles.expiryLabel}>Valid till</Text>
                  <Text
                    style={[
                      styles.headerExpiryValue,
                      !headerExpiry && styles.expiryEmpty,
                    ]}
                    numberOfLines={1}
                  >
                    {headerExpiry || "Add date"}
                  </Text>
                  {onEditExpiry ? (
                    <Text style={styles.expiryEdit}>Edit</Text>
                  ) : null}
                </Pressable>
              ) : null}
            </View>
            <Pressable
              onPress={onClose}
              style={styles.close}
              accessibilityRole="button"
              accessibilityLabel="Close preview"
            >
              <Feather name="x" size={16} color={Theme.actionBtnInk} />
            </Pressable>
          </View>

          <View style={styles.body}>
            {items.length === 0 ? (
              <Text style={styles.empty}>No files to preview</Text>
            ) : (
              <VaultDraftPreviewBlock
                items={items}
                selectedId={current?.id ?? null}
                showHint={Boolean(onAdd)}
                showAddThumb={Boolean(onAdd)}
                onSelect={(id) => {
                  const next = files.findIndex((file) => file.id === id);
                  if (next >= 0) onIndexChange(next);
                }}
                onAdd={onAdd ?? (() => undefined)}
                onRemove={
                  onDelete
                    ? (id) => {
                        const file = files.find((item) => item.id === id);
                        if (file?.deleteKind) setDeleteFile(file);
                      }
                    : undefined
                }
              />
            )}
          </View>

          <View style={styles.footer}>
            <RegistryGhostButton label="Close" onPress={onClose} style={HUG} />
            {onDelete && current?.deleteKind ? (
              <RegistryGhostButton
                label="Delete"
                onPress={() => setDeleteFile(current)}
                style={HUG}
              />
            ) : null}
            {onAdd ? (
              <RegistryPrimaryButton label="Add" onPress={onAdd} style={HUG} />
            ) : null}
          </View>
        </View>
      </View>
    </Modal>
      <ThemedAlertModal
        visible={deleteFile != null}
        title="Delete document?"
        message={`Remove “${deleteFile?.fileName ?? "this file"}” from the vault? This cannot be undone.`}
        okText="Delete"
        okVariant="primary"
        variant="warning"
        secondaryText="Cancel"
        onOk={() => {
          const file = deleteFile;
          setDeleteFile(null);
          if (file) onDelete?.(file);
        }}
        onSecondary={() => setDeleteFile(null)}
        onRequestClose={() => setDeleteFile(null)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: Theme.overlayBackdrop,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  card: {
    width: "100%",
    maxWidth: 440,
    maxHeight: "92%",
    backgroundColor: Theme.cardWhite,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.actionBtnGhostBorder,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  headerCopy: { flex: 1, minWidth: 0, gap: 6 },
  headerTitleRow: {
    gap: 2,
    minWidth: 0,
  },
  category: {
    fontSize: 15,
    fontWeight: "600",
    color: Theme.actionBtnInk,
    ...WEB_COPY,
  },
  meta: {
    fontSize: 12,
    fontWeight: "400",
    color: Theme.textSecondary,
    ...WEB_COPY,
  },
  headerExpiryRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 10,
    minWidth: 0,
  },
  headerExpiryValue: {
    flex: 1,
    minWidth: 0,
    textAlign: "right",
    fontSize: 13,
    lineHeight: 16,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
    color: Theme.textPrimaryDark,
  },
  close: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.surface,
  },
  body: {
    paddingHorizontal: 14,
    paddingBottom: 4,
  },
  empty: {
    fontSize: 13,
    color: Theme.textMuted,
    paddingVertical: 24,
    textAlign: "center",
    ...WEB_COPY,
  },
  expiryLabel: {
    flexShrink: 0,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "600",
    letterSpacing: 0.2,
    color: Theme.textMuted,
  },
  expiryEmpty: {
    fontWeight: "600",
    color: Theme.complianceStagePendingFg,
  },
  expiryEdit: {
    flexShrink: 0,
    fontSize: 12,
    fontWeight: "800",
    color: Theme.brandBlueInk,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
});
