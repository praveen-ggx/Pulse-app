/**
 * Category document viewer — hero + sideways thumb strip (same as LR copies).
 */
import { DocumentDateCalendar } from "@/components/DocumentDateCalendar";
import Theme from "@/constants/Theme";
import { documentRequiresExpiry } from "@/features/tripCompliance/tripCompliance.types";
import {
  formatDocumentHeaderFacts,
  formatLrVaultNumberLabel,
} from "@/features/trips/components/trip-detail/tripDocTypes";
import {
  RegistryGhostButton,
  RegistryPrimaryButton,
} from "@/components/AlertRegistryCardActions";
import { ThemedAlertModal } from "@/components/ThemedAlertModal";
import { isPdfTripDoc } from "@/features/trips/components/trip-detail/tripDocTypes";
import { VaultDraftPreviewBlock } from "@/features/trips/components/trip-detail/VaultDraftPreviewBlock";
import { VaultFullDocumentModal } from "@/features/trips/components/trip-detail/VaultFullDocumentModal";
import type { VaultCategoryPreviewFile } from "@/features/trips/components/trip-detail/vaultCategoryPreview.types";
import { signCompliancePreviewUrl } from "@/features/tripCompliance/services/complianceDocumentView.service";
import { compliancePreviewSourceForVaultFile } from "@/features/tripCompliance/utils/compliancePreviewSource.util";

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
  ScrollView,
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
  onSaveExpiry?: (file: VaultCategoryPreviewFile, isoDate: string) => void;
  startEditingExpiry?: boolean;
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

function defaultExpiryIso(): string {
  const next = new Date();
  next.setMonth(next.getMonth() + 12);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`;
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
  onSaveExpiry,
  startEditingExpiry = false,
}: Props) {
  const insets = useSafeAreaInsets();
  const [urls, setUrls] = useState<Record<string, string | null>>({});
  const [deleteFile, setDeleteFile] = useState<VaultCategoryPreviewFile | null>(null);
  const [editingExpiry, setEditingExpiry] = useState(false);
  const [draftExpiry, setDraftExpiry] = useState("");
  const [fullOpen, setFullOpen] = useState(false);
  const safeIndex = Math.max(0, Math.min(index, Math.max(0, files.length - 1)));
  const current = files[safeIndex] ?? null;
  const category = current?.categoryLabel || "Document";
  const headerExpiryIso = current?.expiryDate?.trim() || "";
  const headerExpiry = prettyPreviewExpiry(headerExpiryIso);
  const showHeaderExpiry =
    Boolean(headerExpiry) ||
    documentRequiresExpiry(current?.complianceType ?? current?.driverKind ?? "");
  const headerNumber =
    current?.category === "invoice"
      ? current.documentNumber?.trim() || ""
      : formatLrVaultNumberLabel(current?.documentNumber) ||
        current?.documentNumber?.trim() ||
        "";
  const showHeaderFacts = Boolean(headerNumber) || showHeaderExpiry;
  const canEditExpiry =
    Boolean(onSaveExpiry) &&
    (documentRequiresExpiry(current?.complianceType ?? current?.driverKind ?? "") ||
      Boolean(headerExpiryIso));

  useEffect(() => {
    if (!visible) {
      setEditingExpiry(false);
      setFullOpen(false);
      return;
    }
    setDraftExpiry(headerExpiryIso || defaultExpiryIso());
    if (startEditingExpiry && canEditExpiry) setEditingExpiry(true);
  }, [canEditExpiry, startEditingExpiry, visible]);

  useEffect(() => {
    if (!visible || editingExpiry) return;
    setDraftExpiry(headerExpiryIso || defaultExpiryIso());
  }, [editingExpiry, headerExpiryIso, visible]);

  useEffect(() => {
    if (!visible || files.length === 0) {
      setUrls({});
      return;
    }
    const ordered = [
      current,
      ...files.filter((file) => file.id !== current?.id),
    ].filter((file): file is VaultCategoryPreviewFile => Boolean(file));
    let cancelled = false;
    const applyResolved = (
      file: VaultCategoryPreviewFile,
      next: string | null,
    ) => {
      if (!next) return;
      const path = String(file.storagePath ?? "").trim();
      setUrls((prev) => ({
        ...prev,
        ...(path ? { [path]: next } : {}),
        [file.id]: next,
      }));
    };
    void (async () => {
      const [first, ...rest] = ordered;
      if (first) {
        const firstUrl =
          first.previewUri?.trim() ||
          (await (onResolveUrl
            ? onResolveUrl(first)
            : signCompliancePreviewUrl({
                storagePath: first.storagePath,
                source: compliancePreviewSourceForVaultFile(first),
              })));
        if (cancelled) return;
        applyResolved(first, firstUrl ?? null);
      }
      if (rest.length === 0) return;
      const extras = await Promise.all(
        rest.map(async (file) => {
          const url =
            file.previewUri?.trim() ||
            (await (onResolveUrl
              ? onResolveUrl(file)
              : signCompliancePreviewUrl({
                  storagePath: file.storagePath,
                  source: compliancePreviewSourceForVaultFile(file),
                })));
          return [file, url] as const;
        }),
      );
      if (cancelled) return;
      for (const [file, url] of extras) applyResolved(file, url);
    })();
    return () => {
      cancelled = true;
    };
  }, [current, files, onResolveUrl, visible]);

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
  const selectedItem = items.find((item) => item.id === current?.id) ?? items[0] ?? null;
  const fullUri = selectedItem?.previewUri?.trim() || null;
  const fullIsPdf = isPdfTripDoc({
    fileName: selectedItem?.fileName,
    storagePath: selectedItem?.storagePath,
  });

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
              {showHeaderFacts ? (
                <View style={styles.headerFacts}>
                  {headerNumber ? (
                    <Text style={styles.headerNumber} numberOfLines={1}>
                      {headerNumber}
                    </Text>
                  ) : null}
                  {showHeaderExpiry ? (
                    <Pressable
                      onPress={
                        canEditExpiry
                          ? () => {
                              setDraftExpiry(headerExpiryIso || defaultExpiryIso());
                              setEditingExpiry(true);
                            }
                          : undefined
                      }
                      disabled={!canEditExpiry}
                      style={styles.headerExpiryRow}
                      accessibilityRole={canEditExpiry ? "button" : undefined}
                      accessibilityLabel="Valid till date, edit"
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
                      {canEditExpiry ? (
                        <Text style={styles.expiryEdit}>Edit</Text>
                      ) : null}
                    </Pressable>
                  ) : null}
                </View>
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

          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
          >
            {editingExpiry && canEditExpiry ? (
              <View style={styles.expiryEditor}>
                <Text style={styles.expiryEditorTitle}>
                  {prettyPreviewExpiry(draftExpiry) || "Pick expiry date"}
                </Text>
                <DocumentDateCalendar
                  selectedIso={draftExpiry || defaultExpiryIso()}
                  onSelect={setDraftExpiry}
                />
                <View style={styles.expiryEditorActions}>
                  <Pressable
                    onPress={() => setEditingExpiry(false)}
                    style={styles.expiryCancel}
                    accessibilityRole="button"
                    accessibilityLabel="Cancel date edit"
                  >
                    <Text style={styles.expiryCancelText}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      if (!current || !/^\d{4}-\d{2}-\d{2}$/.test(draftExpiry)) return;
                      onSaveExpiry?.(current, draftExpiry);
                      setEditingExpiry(false);
                    }}
                    style={styles.expirySave}
                    accessibilityRole="button"
                    accessibilityLabel="Save expiry date"
                  >
                    <Text style={styles.expirySaveText}>Save date</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}
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
                onOpenFull={() => {
                  if (fullUri) {
                    setFullOpen(true);
                    return;
                  }
                  const file = current;
                  if (!file || !onResolveUrl) return;
                  void onResolveUrl(file).then((url) => {
                    if (!url) return;
                    setUrls((prev) => ({
                      ...prev,
                      [file.storagePath?.trim() || file.id]: url,
                    }));
                    setFullOpen(true);
                  });
                }}
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
          </ScrollView>

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
    <VaultFullDocumentModal
      visible={visible && fullOpen}
      uri={fullUri}
      isPdf={fullIsPdf}
      title={selectedItem?.fileName || category}
      documentKey={selectedItem?.storagePath ?? selectedItem?.id}
      documentVersion={selectedItem?.id}
      headerFacts={formatDocumentHeaderFacts({
        documentNumber: current?.documentNumber,
        category: current?.category,
        expiryDate: current?.expiryDate,
      })}
      navLabel={
        files.length > 1 ? `${safeIndex + 1} of ${files.length}` : null
      }
      canNavigate={files.length > 1}
      onPrev={() =>
        onIndexChange((safeIndex - 1 + files.length) % files.length)
      }
      onNext={() => onIndexChange((safeIndex + 1) % files.length)}
      onClose={() => setFullOpen(false)}
    />
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
  headerFacts: {
    gap: 4,
    minWidth: 0,
  },
  headerNumber: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    ...WEB_COPY,
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
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    minWidth: 0,
    minHeight: 44,
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
    maxHeight: 420,
  },
  bodyContent: {
    paddingHorizontal: 14,
    paddingBottom: 8,
    gap: 10,
  },
  expiryEditor: {
    gap: 10,
    paddingBottom: 4,
  },
  expiryEditorTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: Theme.brandBlueInk,
  },
  expiryEditorActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 8,
  },
  expiryCancel: {
    minHeight: 44,
    paddingHorizontal: 12,
    justifyContent: "center",
  },
  expiryCancelText: {
    fontSize: 14,
    fontWeight: "600",
    color: Theme.textMuted,
  },
  expirySave: {
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 999,
    backgroundColor: Theme.brandBlueInk,
    alignItems: "center",
    justifyContent: "center",
  },
  expirySaveText: {
    fontSize: 14,
    fontWeight: "700",
    color: Theme.cardWhite,
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
  fullBackdrop: {
    flex: 1,
    backgroundColor: Theme.overlayBackdrop,
    paddingHorizontal: 12,
  },
  fullHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
    minHeight: 44,
  },
  fullTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: 15,
    fontWeight: "600",
    color: Theme.cardWhite,
    ...WEB_COPY,
  },
  fullBody: {
    flex: 1,
    minHeight: 0,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: Theme.cardWhite,
  },
});
