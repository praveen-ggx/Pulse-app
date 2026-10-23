/**
 * Hub LR popup: number + multi-file vault copies.
 * Preview locally, add/remove, then one submit into trip_documents (same as
 * Document Upload / trip detail).
 */
import Theme from "@/constants/Theme";
import { pickComplianceVaultFiles } from "@/features/tripCompliance/services/complianceVaultUpload.service";
import { VAULT_DOC_LIMIT_HINT } from "@/features/trips/components/trip-detail/tripDocTypes";
import { ElrTripDetailAction } from "@/features/trips/components/trip-detail/ElrTripDetailAction";
import { serializeLrFieldValues } from "@/features/trips/services/lrDocumentOcr.util";
import * as tripDocumentsService from "@/features/trips/services/tripDocuments.service";
import { findOrgDuplicateLrNumberForTrip } from "@/features/trips/services/orgLrDuplicate.service";
import { ORG_LR_DUPLICATE_MESSAGE } from "@/features/trips/services/orgLrNumber.util";
import type { ElrTripSource } from "@/features/trips/services/elrSnapshot.util";
import { showAppAlert } from "@/lib/appAlert";
import { queryKeys } from "@/lib/queryKeys";
import Feather from "@expo/vector-icons/Feather";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
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

function isImageMime(mimeType: string): boolean {
  return mimeType.toLowerCase().startsWith("image/");
}

function previewUriFor(file: { arrayBuffer: ArrayBuffer; mimeType: string }): string | null {
  if (typeof URL === "undefined" || typeof Blob === "undefined") return null;
  if (!isImageMime(file.mimeType)) return null;
  try {
    return URL.createObjectURL(new Blob([file.arrayBuffer], { type: file.mimeType }));
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
  onSubmitted?: (lrNumber: string) => void;
}) {
  const queryClient = useQueryClient();
  const [lrNumber, setLrNumber] = useState(existingLabel);
  const [files, setFiles] = useState<DraftFile[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const filesRef = useRef<DraftFile[]>([]);
  filesRef.current = files;

  const clearFiles = useCallback(() => {
    for (const file of filesRef.current) revokePreview(file.previewUri);
    filesRef.current = [];
    setFiles([]);
    setSelectedId(null);
  }, []);

  useEffect(() => {
    if (!visible) return;
    setLrNumber(existingLabel);
    clearFiles();
    setBusy(false);
  }, [clearFiles, existingLabel, visible]);

  useEffect(() => () => {
    for (const file of filesRef.current) revokePreview(file.previewUri);
  }, []);

  const selected = useMemo(
    () => files.find((file) => file.id === selectedId) ?? files[0] ?? null,
    [files, selectedId],
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
      setFiles((current) => {
        const merged = [...current, ...next];
        setSelectedId((currentId) => currentId ?? merged[0]?.id ?? null);
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
      setSelectedId((currentId) => {
        if (currentId && currentId !== id) return currentId;
        return next[0]?.id ?? null;
      });
      return next;
    });
  }, []);

  const save = useCallback(async () => {
    const number = lrNumber.trim();
    if (!number) {
      showAppAlert("LR number required", "Enter the LR number before submitting.");
      return;
    }
    if (!tripId || !actorId) {
      showAppAlert("Upload failed", "Sign in again, then submit the LR.");
      return;
    }
    setBusy(true);
    try {
      // Same org-wide rule as trip detail: one LR number per trip.
      const duplicate = await findOrgDuplicateLrNumberForTrip({ tripId, lrNumber: number });
      if (duplicate) {
        showAppAlert("LR already exists", ORG_LR_DUPLICATE_MESSAGE);
        return;
      }
      const vaultOrgId = (tripOrganizationId || organizationId || "").trim() || null;
      const storedNumber = serializeLrFieldValues({
        lrNumber: number,
        date: "",
        invoice: "",
      });

      if (files.length === 0) {
        const { documents, error: listError } =
          await tripDocumentsService.getDocumentsByTripId(tripId, {
            includeOcr: false,
            includeStorageFallback: false,
          });
        if (listError) throw listError;
        const existing = (documents ?? []).find(
          (doc) => doc.document_type === "lr" && !String(doc.id).startsWith("storage-"),
        );
        if (!existing) {
          showAppAlert(
            "LR copy required",
            "Upload an LR copy so it can be saved to the trip vault, the same way trip detail and the driver app do.",
          );
          return;
        }
        const updateError = await tripDocumentsService.updateTripDocumentNumber(
          existing.id,
          storedNumber,
        );
        if (updateError) throw updateError;
      } else {
        for (const file of files) {
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
        }
      }
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["q", "trips", "hub", organizationId, "lr-labels"],
        }),
        queryClient.invalidateQueries({ queryKey: queryKeys.trips.detail(tripId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.trips.bundle(tripId) }),
      ]);
      onSubmitted?.(number);
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
    files,
    lrNumber,
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
                Saves to the trip vault. Same LR document Compliance and trip detail use.
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
          <Text style={styles.label}>LR number</Text>
          <TextInput
            value={lrNumber}
            onChangeText={setLrNumber}
            placeholder="Enter LR number"
            placeholderTextColor={Theme.textMuted}
            autoCapitalize="characters"
            editable={!busy}
            style={styles.input}
          />

          <Text style={styles.label}>LR copies</Text>
          {files.length === 0 ? (
            <Pressable
              onPress={() => void addFiles()}
              disabled={busy}
              style={({ pressed }) => [styles.dropzone, pressed && styles.pressed]}
            >
              <Feather name="upload" size={16} color={Theme.textMuted} />
              <Text style={styles.dropzoneText}>Upload LR copy</Text>
            </Pressable>
          ) : (
            <View style={styles.previewBlock}>
              <View style={styles.hero}>
                {selected?.previewUri ? (
                  <Image
                    source={{ uri: selected.previewUri }}
                    style={styles.heroImage}
                    resizeMode="contain"
                    accessibilityLabel={selected.fileName}
                  />
                ) : (
                  <View style={styles.heroPdf}>
                    <Feather name="file-text" size={22} color={Theme.textSecondary} />
                    <Text style={styles.heroPdfName} numberOfLines={2}>
                      {selected?.fileName || "PDF"}
                    </Text>
                  </View>
                )}
              </View>
              <ScrollView
                horizontal
                nestedScrollEnabled
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.thumbs}
              >
                {files.map((file) => {
                  const active = file.id === selected?.id;
                  return (
                    <View key={file.id} style={styles.thumbWrap}>
                      <Pressable
                        onPress={() => setSelectedId(file.id)}
                        style={[styles.thumb, active && styles.thumbActive]}
                        accessibilityRole="button"
                        accessibilityLabel={`Preview ${file.fileName}`}
                        accessibilityState={{ selected: active }}
                      >
                        {file.previewUri ? (
                          <Image
                            source={{ uri: file.previewUri }}
                            style={styles.thumbFill}
                            resizeMode="cover"
                          />
                        ) : (
                          <View style={styles.thumbPdf}>
                            <Feather name="file-text" size={14} color={Theme.textSecondary} />
                            <Text style={styles.thumbPdfLabel}>PDF</Text>
                          </View>
                        )}
                      </Pressable>
                      <Pressable
                        onPress={() => removeFile(file.id)}
                        disabled={busy}
                        style={styles.thumbRemove}
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        accessibilityRole="button"
                        accessibilityLabel={`Remove ${file.fileName}`}
                      >
                        <Feather name="x" size={11} color={Theme.buttonDarkText} />
                      </Pressable>
                    </View>
                  );
                })}
                <Pressable
                  onPress={() => void addFiles()}
                  disabled={busy}
                  style={({ pressed }) => [styles.addThumb, pressed && styles.pressed]}
                  accessibilityRole="button"
                  accessibilityLabel="Add more LR copies"
                >
                  <Feather name="plus" size={16} color={Theme.actionBtnInk} />
                  <Text style={styles.addThumbText}>Add</Text>
                </Pressable>
              </ScrollView>
              {selected ? (
                <Text style={styles.fileName} numberOfLines={1}>
                  {selected.fileName}
                </Text>
              ) : null}
            </View>
          )}
          <Text style={styles.fileHint}>{VAULT_DOC_LIMIT_HINT}</Text>

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
