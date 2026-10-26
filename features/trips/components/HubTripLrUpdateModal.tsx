/**
 * Hub LR popup: number + multi-file vault copies.
 * Preview locally, add/remove, then one submit into trip_documents (same as
 * Document Upload / trip detail).
 */
import Theme from "@/constants/Theme";
import { pickComplianceVaultFiles } from "@/features/tripCompliance/services/complianceVaultUpload.service";
import { ElrTripDetailAction } from "@/features/trips/components/trip-detail/ElrTripDetailAction";
import {
  VaultDraftPreviewBlock,
  type VaultDraftPreviewItem,
} from "@/features/trips/components/trip-detail/VaultDraftPreviewBlock";
import { parseLrFieldValues, serializeLrFieldValues } from "@/features/trips/services/lrDocumentOcr.util";
import * as tripDocumentsService from "@/features/trips/services/tripDocuments.service";
import {
  findOrgDuplicateLrNumbersForTrip,
  invalidateOrgLrIndexForTrip,
} from "@/features/trips/services/orgLrDuplicate.service";
import { ORG_LR_DUPLICATE_MESSAGE } from "@/features/trips/services/orgLrNumber.util";
import type { ElrTripSource } from "@/features/trips/services/elrSnapshot.util";
import type { VaultCategoryPreviewFile } from "@/features/trips/components/trip-detail/vaultCategoryPreview.types";
import { showAppAlert } from "@/lib/appAlert";
import { queryKeys } from "@/lib/queryKeys";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

const WEB_COPY =
  Platform.OS === "web"
    ? ({ whiteSpace: "pre-wrap", letterSpacing: 0 } as const)
    : ({ letterSpacing: 0 } as const);

type DraftFile = {
  id: string;
  arrayBuffer: ArrayBuffer;
  fileName: string;
  mimeType: string;
  previewUri: string | null;
};

type ExistingLrMeta = {
  documentId: string;
  date: string;
  invoice: string;
};

function isImageMime(mimeType: string): boolean {
  return mimeType.toLowerCase().startsWith("image/");
}

function previewUriFor(file: { arrayBuffer: ArrayBuffer; mimeType: string }): string | null {
  if (typeof URL === "undefined" || typeof Blob === "undefined") return null;
  const mime = file.mimeType.toLowerCase();
  if (!isImageMime(file.mimeType) && !mime.includes("pdf")) return null;
  try {
    return URL.createObjectURL(new Blob([file.arrayBuffer], { type: file.mimeType || "application/pdf" }));
  } catch {
    return null;
  }
}

function revokePreview(uri: string | null): void {
  if (!uri || typeof URL === "undefined") return;
  URL.revokeObjectURL(uri);
}

export function HubTripLrUpdateModal({
  visible,
  tripId,
  organizationId,
  tripOrganizationId,
  actorId,
  existingLabel,
  elrSource = null,
  onClose,
  onSubmitted,
}: {
  visible: boolean;
  tripId: string;
  organizationId: string;
  tripOrganizationId?: string | null;
  actorId: string;
  existingLabel: string;
  elrSource?: ElrTripSource | null;
  onClose: () => void;
  onSubmitted?: (lrNumber: string, previewFiles: VaultCategoryPreviewFile[]) => void;
}) {
  const queryClient = useQueryClient();
  const [files, setFiles] = useState<DraftFile[]>([]);
  const [existingItems, setExistingItems] = useState<VaultDraftPreviewItem[]>([]);
  const [numberById, setNumberById] = useState<Record<string, string>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const filesRef = useRef<DraftFile[]>([]);
  const existingMetaRef = useRef<Record<string, ExistingLrMeta>>({});
  filesRef.current = files;

  const clearFiles = useCallback(() => {
    for (const file of filesRef.current) revokePreview(file.previewUri);
    filesRef.current = [];
    setFiles([]);
    setSelectedId(null);
  }, []);

  useEffect(() => {
    if (!visible) return;
    clearFiles();
    setExistingItems([]);
    setNumberById({});
    existingMetaRef.current = {};
    setBusy(false);
    if (!tripId) return;
    let cancelled = false;
    void (async () => {
      try {
        const { documents } = await tripDocumentsService.getDocumentsByTripId(tripId, {
          includeOcr: false,
          includeStorageFallback: false,
        });
        const lrDocs = (documents ?? []).filter(
          (doc) =>
            doc.document_type === "lr" &&
            !String(doc.id).startsWith("storage-") &&
            Boolean(doc.storage_path?.trim()),
        );
        if (lrDocs.length === 0 || cancelled) return;
        const urls = await tripDocumentsService.getDocumentViewUrls(
          lrDocs.map((doc) => doc.storage_path),
        );
        if (cancelled) return;
        const nextNumbers: Record<string, string> = {};
        const nextMeta: Record<string, ExistingLrMeta> = {};
        const items: VaultDraftPreviewItem[] = lrDocs.map((doc) => {
          const path = doc.storage_path;
          const name = doc.file_name?.trim() || "LR copy";
          const id = `vault-${doc.id}`;
          const fields = parseLrFieldValues(doc.document_number);
          nextNumbers[id] = fields.lrNumber;
          nextMeta[id] = {
            documentId: doc.id,
            date: fields.date,
            invoice: fields.invoice,
          };
          return {
            id,
            fileName: name,
            previewUri: urls[path] ?? null,
            storagePath: path,
            locked: true,
          };
        });
        existingMetaRef.current = nextMeta;
        setNumberById((current) => ({ ...nextNumbers, ...current }));
        setExistingItems(items);
        setSelectedId((current) => current ?? items[0]?.id ?? null);
      } catch {
        if (!cancelled) setExistingItems([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clearFiles, tripId, visible]);

  useEffect(() => () => {
    for (const file of filesRef.current) revokePreview(file.previewUri);
  }, []);

  const previewItems = useMemo<VaultDraftPreviewItem[]>(
    () => [
      ...existingItems,
      ...files.map((file) => ({
        id: file.id,
        fileName: file.fileName,
        previewUri: file.previewUri,
      })),
    ],
    [existingItems, files],
  );

  const addFiles = useCallback(async () => {
    try {
      const picked = await pickComplianceVaultFiles("lr");
      if (picked.length === 0) return;
      const next: DraftFile[] = picked.map((item, index) => ({
        id: `${Date.now()}-${index}-${item.fileName}`,
        arrayBuffer: item.arrayBuffer,
        fileName: item.fileName,
        mimeType: item.mimeType,
        previewUri: previewUriFor(item),
      }));
      setNumberById((current) => {
        const nextNumbers = { ...current };
        for (const file of next) nextNumbers[file.id] = "";
        return nextNumbers;
      });
      setFiles((current) => {
        const merged = [...current, ...next];
        setSelectedId(next[0]?.id ?? merged[0]?.id ?? null);
        return merged;
      });
    } catch (error) {
      showAppAlert(
        "File not accepted",
        error instanceof Error ? error.message : "Choose a PDF or image for the LR copy.",
      );
    }
  }, []);

  const removeFile = useCallback((id: string) => {
    setFiles((current) => {
      const target = current.find((file) => file.id === id);
      revokePreview(target?.previewUri ?? null);
      const next = current.filter((file) => file.id !== id);
      setNumberById((numbers) => {
        const { [id]: _removed, ...rest } = numbers;
        return rest;
      });
      setSelectedId((currentId) => {
        if (currentId && currentId !== id) return currentId;
        return next[0]?.id ?? existingItems[0]?.id ?? null;
      });
      return next;
    });
  }, [existingItems]);

  const selectedCopy = useMemo(() => {
    if (!selectedId) return null;
    return (
      existingItems.find((item) => item.id === selectedId) ??
      files.find((file) => file.id === selectedId) ??
      null
    );
  }, [existingItems, files, selectedId]);

  const selectedLrNumber = selectedId ? (numberById[selectedId] ?? "") : "";

  const save = useCallback(async () => {
    if (!tripId || !actorId) {
      showAppAlert("Upload failed", "Sign in again, then submit the LR.");
      return;
    }
    if (existingItems.length === 0 && files.length === 0) {
      showAppAlert(
        "LR copy required",
        "Upload an LR copy so it can be saved to the trip vault, the same way trip detail and the driver app do.",
      );
      return;
    }
    const copies: { id: string; label: string }[] = [
      ...existingItems.map((item) => ({ id: item.id, label: item.fileName })),
      ...files.map((file) => ({ id: file.id, label: file.fileName })),
    ];
    const missing = copies.find((copy) => !numberById[copy.id]?.trim());
    if (missing) {
      setSelectedId(missing.id);
      showAppAlert(
        "LR number required",
        `Enter an LR number for ${missing.label} before submitting.`,
      );
      return;
    }
    const lrNumbers = copies.map((copy) => numberById[copy.id].trim());
    setBusy(true);
    try {
      const duplicate = await findOrgDuplicateLrNumbersForTrip({
        tripId,
        lrNumbers,
      });
      if (duplicate) {
        showAppAlert("Duplicate LR number", ORG_LR_DUPLICATE_MESSAGE);
        return;
      }
      const vaultOrgId = (tripOrganizationId || organizationId || "").trim() || null;

      for (const item of existingItems) {
        const meta = existingMetaRef.current[item.id];
        if (!meta?.documentId) continue;
        const storedNumber = serializeLrFieldValues({
          lrNumber: numberById[item.id].trim(),
          date: meta.date,
          invoice: meta.invoice,
        });
        const updateError = await tripDocumentsService.updateTripDocumentNumber(
          meta.documentId,
          storedNumber,
        );
        if (updateError) throw updateError;
      }

      const uploadedPreview: VaultCategoryPreviewFile[] = [];
      for (const file of files) {
        const storedNumber = serializeLrFieldValues({
          lrNumber: numberById[file.id].trim(),
          date: "",
          invoice: "",
        });
        const { doc, error } = await tripDocumentsService.uploadTripDocument(
          tripId,
          actorId,
          {
            arrayBuffer: file.arrayBuffer,
            fileName: file.fileName,
            mimeType: file.mimeType,
          },
          "lr",
          storedNumber,
          { organizationId: vaultOrgId },
        );
        if (error) throw error;
        if (doc && storedNumber && !doc.document_number?.trim()) {
          await tripDocumentsService.updateTripDocumentNumber(doc.id, storedNumber);
        }
        if (doc?.storage_path) {
          uploadedPreview.push({
            id: doc.id,
            fileName: file.fileName,
            categoryLabel: "LR Document",
            storagePath: doc.storage_path,
            mimeHint: file.mimeType,
          });
        }
      }
      const previewFiles: VaultCategoryPreviewFile[] = [
        ...existingItems.map((item) => ({
          id: item.id,
          fileName: item.fileName,
          categoryLabel: "LR Document",
          storagePath: item.storagePath,
          previewUri: item.previewUri,
        })),
        ...uploadedPreview,
      ];
      invalidateOrgLrIndexForTrip(tripId);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["q", "trips", "hub", organizationId, "lr-labels"],
        }),
        queryClient.invalidateQueries({ queryKey: queryKeys.trips.detail(tripId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.trips.bundle(tripId) }),
      ]);
      const submittedLabel = Array.from(new Set(lrNumbers)).join(" / ");
      onSubmitted?.(submittedLabel, previewFiles);
      clearFiles();
      onClose();
    } catch (error) {
      showAppAlert(
        "Could not submit LR",
        error instanceof Error ? error.message : "Try again.",
      );
    } finally {
      setBusy(false);
    }
  }, [
    actorId,
    clearFiles,
    existingItems,
    files,
    numberById,
    onClose,
    onSubmitted,
    organizationId,
    queryClient,
    tripId,
    tripOrganizationId,
  ]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={busy ? undefined : onClose}
    >
      <Pressable style={styles.backdrop} onPress={busy ? undefined : onClose}>
        <Pressable style={styles.dialog} onPress={(event) => event.stopPropagation()}>
          <View style={styles.titleRow}>
            <View style={styles.titleCol}>
              <Text style={styles.title}>
                {existingLabel ? "Update LR" : "Add LR"}
              </Text>
              <Text style={styles.hint}>
                A trip can have several LR copies. Select a file and set its LR number.
              </Text>
            </View>
            {elrSource ? (
              <View style={styles.elrSlot}>
                <ElrTripDetailAction
                  source={elrSource}
                  uploadedBy={actorId || null}
                  onSaved={() => {
                    void queryClient.invalidateQueries({
                      queryKey: ["q", "trips", "hub", organizationId, "lr-labels"],
                    });
                    void queryClient.invalidateQueries({
                      queryKey: ["q", "trips", "elr", tripId],
                    });
                  }}
                />
              </View>
            ) : null}
          </View>
          <Text style={styles.label}>LR copies</Text>
          <VaultDraftPreviewBlock
            items={previewItems}
            selectedId={selectedId}
            busy={busy}
            emptyLabel="Upload LR copy"
            onSelect={setSelectedId}
            onRemove={removeFile}
            onAdd={() => void addFiles()}
          />

          {selectedCopy ? (
            <>
              <Text style={styles.label}>
                LR number for {selectedCopy.fileName}
              </Text>
              <TextInput
                value={selectedLrNumber}
                onChangeText={(value) => {
                  if (!selectedId) return;
                  setNumberById((current) => ({ ...current, [selectedId]: value }));
                }}
                placeholder="Enter LR number for this copy"
                placeholderTextColor={Theme.textMuted}
                autoCapitalize="characters"
                editable={!busy}
                style={styles.input}
              />
            </>
          ) : (
            <Text style={styles.hint}>
              Select a copy to edit its LR number, or add a new file.
            </Text>
          )}

          <View style={styles.actions}>
            <Pressable
              onPress={onClose}
              disabled={busy}
              style={({ pressed }) => [styles.ghostBtn, pressed && styles.pressed]}
            >
              <Text style={styles.ghostBtnText}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={() => void save()}
              disabled={busy}
              style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}
            >
              {busy ? (
                <ActivityIndicator size="small" color={Theme.buttonDarkText} />
              ) : (
                <Text style={styles.primaryBtnText}>Submit</Text>
              )}
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
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  dialog: {
    width: "100%",
    maxWidth: 440,
    backgroundColor: Theme.cardWhite,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.actionBtnGhostBorder,
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 8,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  titleCol: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  elrSlot: {
    flexShrink: 0,
    alignItems: "flex-end",
    maxWidth: 180,
  },
  title: {
    fontSize: 15,
    fontWeight: "600",
    color: Theme.actionBtnInk,
    ...WEB_COPY,
  },
  hint: {
    fontSize: 12,
    fontWeight: "400",
    color: Theme.textSecondary,
    lineHeight: 16,
    ...WEB_COPY,
  },
  label: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: "500",
    color: Theme.textMuted,
    ...WEB_COPY,
  },
  input: {
    height: 36,
    borderWidth: 1,
    borderColor: Theme.actionBtnGhostBorder,
    borderRadius: 6,
    paddingHorizontal: 10,
    fontSize: 13,
    letterSpacing: 0,
    color: Theme.actionBtnInk,
    backgroundColor: Theme.cardWhite,
  },
  dropzone: {
    minHeight: 72,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: Theme.actionBtnGhostBorder,
    borderRadius: 8,
    backgroundColor: Theme.surface,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  dropzoneText: {
    fontSize: 12,
    fontWeight: "500",
    color: Theme.actionBtnInk,
    ...WEB_COPY,
  },
  previewBlock: {
    gap: 8,
  },
  hero: {
    height: 168,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.actionBtnGhostBorder,
    backgroundColor: Theme.surface,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  heroImage: {
    width: "100%",
    height: "100%",
  },
  heroPdf: {
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 16,
  },
  heroPdfName: {
    fontSize: 12,
    fontWeight: "500",
    color: Theme.textSecondary,
    textAlign: "center",
    ...WEB_COPY,
  },
  thumbs: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 2,
    paddingRight: 4,
  },
  thumbWrap: {
    width: 48,
    height: 56,
  },
  thumb: {
    width: 48,
    height: 56,
    borderRadius: 6,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Theme.actionBtnGhostBorder,
    backgroundColor: Theme.cardWhite,
  },
  thumbActive: {
    borderColor: Theme.actionBtnInk,
    borderWidth: 2,
  },
  thumbFill: {
    width: "100%",
    height: "100%",
  },
  thumbPdf: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    backgroundColor: Theme.surface,
  },
  thumbPdfLabel: {
    fontSize: 8,
    fontWeight: "600",
    color: Theme.textMuted,
    ...WEB_COPY,
  },
  thumbRemove: {
    position: "absolute",
    top: -5,
    right: -5,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Theme.actionBtnInk,
    alignItems: "center",
    justifyContent: "center",
  },
  addThumb: {
    width: 48,
    height: 56,
    borderRadius: 6,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: Theme.actionBtnGhostBorder,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.surface,
    gap: 2,
  },
  addThumbText: {
    fontSize: 9,
    fontWeight: "500",
    color: Theme.actionBtnInk,
    ...WEB_COPY,
  },
  fileName: {
    fontSize: 11,
    fontWeight: "400",
    color: Theme.textSecondary,
    ...WEB_COPY,
  },
  fileHint: {
    fontSize: 10,
    fontWeight: "400",
    color: Theme.textMuted,
    ...WEB_COPY,
  },
  actions: {
    marginTop: 8,
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
  },
  ghostBtn: {
    height: 32,
    minWidth: 72,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Theme.actionBtnGhostBorder,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.cardWhite,
  },
  ghostBtnText: {
    fontSize: 12,
    fontWeight: "500",
    color: Theme.actionBtnInk,
    ...WEB_COPY,
  },
  primaryBtn: {
    height: 32,
    minWidth: 72,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: Theme.actionBtnInk,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnText: {
    fontSize: 12,
    fontWeight: "500",
    color: Theme.buttonDarkText,
    ...WEB_COPY,
  },
  pressed: { opacity: 0.85 },
});
