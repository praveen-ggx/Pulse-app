import { createElement, useEffect, useMemo, useRef, useState } from "react";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { NativeHtmlWebView } from "@/components/NativeHtmlWebView";
import Theme from "@/constants/Theme";
import { ElrCompletionForm } from "@/features/trips/components/trip-detail/ElrCompletionForm";
import {
  alignElrDraftToTripRoute,
  applyElrCanonicalPrefill,
  buildCompletedElrSnapshot,
  draftFromTripSource,
  elrCompletionMessage,
  elrDetailPhase,
  elrPrefilledFields,
  elrTripStatusCopy,
  isCompleteElrSnapshot,
  mergeStoredElrIntoDraft,
  validateElrCompletion,
  type ElrCompletionDraft,
} from "@/features/trips/services/elrCompletion.util";
import { loadElrCanonicalPrefill } from "@/features/trips/services/elrPrefill.service";
import { clearElrDraft, readElrDraft, writeElrDraft } from "@/features/trips/services/elrDraft.storage";
import {
  buildElrPreviewEmbedHtml,
  buildElrPreviewHtml,
  generateElrPdfBytes,
  renderElrPreviewToPdfBlob,
} from "@/features/trips/services/elrPdf.util";
import { generateOrOpenElr, findStoredElr } from "@/features/trips/services/elrGenerate.service";
import {
  elrVehicleChangedSinceSnapshot,
  isElrAfterLoadingStage,
  isElrEligible,
  readStoredElrSnapshot,
  type ElrSnapshot,
  type ElrTripSource,
  type StoredElrDocument,
} from "@/features/trips/services/elrSnapshot.util";

export type ElrKnownDocument = {
  id?: string | null;
  storage_path?: string | null;
  document_number?: string | null;
  document_type?: string | null;
};

function storedElrFromKnownDocuments(
  rows: ElrKnownDocument[] | null | undefined,
): StoredElrDocument | null {
  for (const row of rows ?? []) {
    if (String(row.document_type ?? "").trim().toLowerCase() !== "lr") continue;
    const snapshot = readStoredElrSnapshot(row.document_number);
    const storagePath = (row.storage_path ?? "").trim();
    const id = (row.id ?? "").trim();
    if (!snapshot || !storagePath || !id) continue;
    return { id, storagePath, snapshot };
  }
  return null;
}

export type ElrTripDetailActionProps = {
  source: ElrTripSource;
  uploadedBy: string | null;
  onSaved?: () => void;
  /** Documents already loaded for this trip, so View E-LR does not wait on a second read. */
  knownDocuments?: ElrKnownDocument[] | null;
  /**
   * When the detail list failed, fall back to the stored-E-LR read.
   * A successful list already includes document_number, so the fallback stays off.
   */
  storedElrLookupEnabled?: boolean;
};

export function ElrTripDetailAction({
  source,
  uploadedBy,
  onSaved,
  knownDocuments,
  storedElrLookupEnabled = true,
}: ElrTripDetailActionProps) {
  const queryClient = useQueryClient();
  const tripId = source.tripId.trim();
  const afterLoading = isElrAfterLoadingStage(source.tripStatus);
  const seededStored = storedElrFromKnownDocuments(knownDocuments);
  const existingQuery = useQuery({
    queryKey: ["q", "trips", "elr", tripId],
    queryFn: () => findStoredElr(tripId),
    enabled:
      tripId.length > 0 &&
      afterLoading &&
      storedElrLookupEnabled &&
      seededStored == null,
    staleTime: 60_000,
  });
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<ElrSnapshot | null>(null);
  const [previewNeedsSave, setPreviewNeedsSave] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [draft, setDraft] = useState<ElrCompletionDraft | null>(null);
  const [draftSaved, setDraftSaved] = useState(false);
  const pdfBytesRef = useRef<{ lrNumber: string; bytes: ArrayBuffer } | null>(null);
  const insets = useSafeAreaInsets();
  const storedSnapshot = existingQuery.data?.snapshot ?? seededStored?.snapshot ?? null;
  const storedIsComplete = storedSnapshot != null && isCompleteElrSnapshot(storedSnapshot);
  const incompleteStored = storedSnapshot != null && !storedIsComplete;
  const hasExisting = storedIsComplete;
  const draftQuery = useQuery({
    queryKey: ["q", "trips", "elr-draft", tripId],
    queryFn: () => readElrDraft(tripId),
    enabled: tripId.length > 0 && afterLoading,
    staleTime: 30_000,
  });
  const hasDraft = draftQuery.data != null || incompleteStored;
  const vehicleAssigned = isElrEligible({
    vehicleId: source.vehicleId,
    vehicleRegistration: source.vehicleRegistration,
    driverId: source.driverId,
  });
  const eligible = vehicleAssigned && afterLoading;
  const prefillQuery = useQuery({
    queryKey: ["q", "trips", "elr-prefill", tripId, source.vehicleId ?? "", source.clientId ?? ""],
    queryFn: () => loadElrCanonicalPrefill(source),
    enabled: formOpen && eligible && !hasExisting && tripId.length > 0,
    staleTime: 60_000,
  });
  const preparedDraft = applyElrCanonicalPrefill(
    draftFromTripSource(source),
    prefillQuery.data ?? {},
  );
  const countedDraft = alignElrDraftToTripRoute(draftQuery.data ?? preparedDraft, source);
  const missingCount = hasExisting ? 0 : validateElrCompletion(countedDraft).length;
  const phase = elrDetailPhase({
    eligible: eligible || hasExisting,
    hasExisting,
    missingCount,
    hasDraft,
    afterLoading: afterLoading || hasExisting,
  });
  const vehicleChanged =
    storedSnapshot != null &&
    elrVehicleChangedSinceSnapshot(storedSnapshot, source.vehicleId);
  const status = elrTripStatusCopy(phase, storedSnapshot?.lrNumber);
  const label = status.action ?? "E-LR";
  const plate = (source.vehicleRegistration ?? "").trim();

  const openCompletion = () => {
    const prefill = prefillQuery.data ?? {};
    const base = applyElrCanonicalPrefill(draftFromTripSource(source), prefill);
    const seeded = storedSnapshot ? mergeStoredElrIntoDraft(base, storedSnapshot) : base;
    setDraft(alignElrDraftToTripRoute(draftQuery.data ?? seeded, source));
    setDraftSaved(draftQuery.data != null);
    setFormOpen(true);
  };

  useEffect(() => {
    if (!formOpen || hasExisting || !prefillQuery.data) return;
    setDraft((current) => {
      if (!current) return current;
      return alignElrDraftToTripRoute(
        applyElrCanonicalPrefill(current, prefillQuery.data ?? {}),
        source,
      );
    });
  }, [formOpen, hasExisting, prefillQuery.data]);

  const persistDraft = (value: ElrCompletionDraft) => {
    setDraftSaved(true);
    queryClient.setQueryData(["q", "trips", "elr-draft", tripId], value);
    void writeElrDraft(tripId, value);
  };

  const finishResult = async (
    result: Awaited<ReturnType<typeof generateOrOpenElr>>,
  ) => {
    if (!result.ok && result.reason === "unassigned") {
      Alert.alert("E-LR", "Available after vehicle assignment.");
      return;
    }
    if (!result.ok && result.reason === "too_early") {
      Alert.alert("E-LR", "Available after loading.");
      return;
    }
    if (!result.ok && result.reason === "missing") {
      Alert.alert("Cannot generate E-LR.", elrCompletionMessage(result.missing.map((label) => ({ label }))));
      return;
    }
    if (!result.ok && result.reason === "pdf") {
      Alert.alert("E-LR generation failed.", "No document was created.");
      return;
    }
    if (!result.ok) {
      Alert.alert("E-LR could not be saved.", result.message);
      return;
    }
    setFormOpen(false);
    setPreviewNeedsSave(false);
    setPreview(result.snapshot);
    if (!result.alreadyExisted) {
      queryClient.setQueryData(["q", "trips", "elr-draft", tripId], null);
      void clearElrDraft(tripId);
      void queryClient.invalidateQueries({ queryKey: ["q", "trips", "elr", tripId] });
      void queryClient.invalidateQueries({ queryKey: ["q", "trips", "hub"] });
      onSaved?.();
    }
  };

  const run = () => {
    if (busy) return;
    if (hasExisting && storedSnapshot) {
      setFormOpen(false);
      setPreviewNeedsSave(false);
      setPreview(storedSnapshot);
      return;
    }
    if (!afterLoading) {
      Alert.alert("E-LR", "Available after loading.");
      return;
    }
    if (!vehicleAssigned) {
      Alert.alert("E-LR", "Available after vehicle assignment.");
      return;
    }
    openCompletion();
  };

  const openPreview = () => {
    if (!draft) return;
    const built = buildCompletedElrSnapshot({
      source,
      draft,
      generatedBy: uploadedBy,
    });
    if (!built.ok) return;
    pdfBytesRef.current = null;
    try {
      pdfBytesRef.current = {
        lrNumber: built.snapshot.lrNumber,
        bytes: generateElrPdfBytes(built.snapshot),
      };
    } catch {
      pdfBytesRef.current = null;
    }
    setPreviewNeedsSave(true);
    setPreview(built.snapshot);
    setFormOpen(false);
  };

  const closePreview = () => {
    if (previewNeedsSave) {
      setPreview(null);
      setPreviewNeedsSave(false);
      setFormOpen(true);
      return;
    }
    setPreview(null);
  };

  const editFromPreview = () => {
    openCompletion();
    setPreview(null);
    setPreviewNeedsSave(false);
  };

  const generateFromPreview = async () => {
    if (busy || !draft || !previewNeedsSave) return;
    if (!afterLoading) {
      Alert.alert("E-LR", "Available after loading.");
      return;
    }
    if (!uploadedBy) {
      Alert.alert("Cannot generate E-LR.", "Sign in to generate this document.");
      return;
    }
    setBusy(true);
    try {
      await finishResult(
        await generateOrOpenElr({
          source,
          uploadedBy,
          completion: draft,
          existing: seededStored ?? (existingQuery.isFetched ? existingQuery.data ?? null : undefined),
          pdfBytes:
            preview &&
            pdfBytesRef.current?.lrNumber === preview.lrNumber
              ? pdfBytesRef.current.bytes
              : null,
        }),
      );
    } finally {
      setBusy(false);
    }
  };

  const previewHtml = useMemo(
    () => (preview && Platform.OS !== "web" ? buildElrPreviewHtml(preview) : ""),
    [preview],
  );
  const previewEmbedHtml = useMemo(
    () => (preview && Platform.OS === "web" ? buildElrPreviewEmbedHtml(preview) : ""),
    [preview],
  );
  const previewTitle = preview?.lrNumber ?? "E-LR";

  const presentFormattedPdf = async (
    mode: "open" | "download" | "share",
    snapshot: ElrSnapshot | null = preview,
  ) => {
    if (!snapshot) return;
    const html = buildElrPreviewHtml(snapshot);
    const title = snapshot.lrNumber;
    const fileName = `${snapshot.lrNumber}.pdf`;
    if (Platform.OS === "web") {
      let blob: Blob;
      try {
        blob = await renderElrPreviewToPdfBlob(html);
      } catch {
        blob = new Blob([generateElrPdfBytes(snapshot)], { type: "application/pdf" });
      }
      if (mode === "share" && typeof navigator !== "undefined" && navigator.share) {
        const file = new File([blob], fileName, { type: "application/pdf" });
        const canShare =
          typeof navigator.canShare !== "function" || navigator.canShare({ files: [file] });
        if (canShare) {
          try {
            await navigator.share({ files: [file], title });
            return;
          } catch (error) {
            if (error instanceof Error && error.name === "AbortError") return;
          }
        }
      }
      const url = URL.createObjectURL(blob);
      const revoke = () => {
        try {
          URL.revokeObjectURL(url);
        } catch {
          /* already revoked */
        }
      };
      if (mode === "open") {
        // noopener makes window.open return null, so the load event cannot
        // be observed. Keep a window handle, detach opener, and revoke on
        // load or after 60s — whichever comes first.
        const opened = window.open(url, "_blank");
        if (opened) opened.opener = null;
        if (opened) opened.addEventListener("load", revoke);
        window.setTimeout(revoke, 60_000);
        return;
      }
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
      return;
    }
    try {
      const { uri } = await Print.printToFileAsync({
        html,
        width: 595,
        height: 842,
      });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: "application/pdf",
          UTI: "com.adobe.pdf",
          dialogTitle: fileName,
        });
        return;
      }
      await Share.share({ url: uri, title });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
    }
  };

  if (tripId && existingQuery.isLoading && !existingQuery.data && !afterLoading) {
    return (
      <View style={styles.block}>
        <ActivityIndicator size="small" color={Theme.primary} />
      </View>
    );
  }

  if (!hasExisting && !afterLoading) {
    return (
      <View style={styles.block}>
        <Text style={styles.hint}>E-LR available after loading</Text>
      </View>
    );
  }

  if (!eligible && !hasExisting) {
    return (
      <View style={styles.block}>
        <Text style={styles.hint}>E-LR available after vehicle assignment</Text>
      </View>
    );
  }

  return (
    <>
      <View style={styles.block}>
        {hasExisting && storedSnapshot ? (
          <>
            <TouchableOpacity
              style={styles.btn}
              onPress={() => {
                setFormOpen(false);
                setPreviewNeedsSave(false);
                setPreview(storedSnapshot);
              }}
              accessibilityRole="button"
              accessibilityLabel="View E-LR"
            >
              <Text style={styles.btnText}>View E-LR</Text>
            </TouchableOpacity>
            <Text style={styles.hint}>{status.hint}</Text>
            <View style={styles.subActions}>
              <TouchableOpacity onPress={() => void openCompletion()} accessibilityRole="button">
                <Text style={styles.subActionText}>Edit E-LR</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => void presentFormattedPdf("share", storedSnapshot)}
                accessibilityRole="button"
              >
                <Text style={styles.subActionText}>Share E-LR</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <>
            <TouchableOpacity
              style={styles.btn}
              onPress={() => void run()}
              disabled={busy}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={label}
            >
              {busy ? (
                <ActivityIndicator size="small" color={Theme.primary} />
              ) : (
                <Text style={styles.btnText}>{label}</Text>
              )}
            </TouchableOpacity>
            <Text style={styles.hint}>{status.hint}</Text>
            {hasDraft && missingCount > 0 ? (
              <Text style={styles.hint}>{missingCount} required fields remaining</Text>
            ) : null}
          </>
        )}
        {vehicleChanged ? (
          <Text style={styles.hint}>
            Still shows the vehicle from when it was generated.
          </Text>
        ) : null}
      </View>
      <Modal
        visible={preview != null}
        animationType="slide"
        onRequestClose={closePreview}
      >
        <View style={[styles.modal, { paddingTop: insets.top + 8 }]}>
          <View style={styles.chrome}>
            <View style={styles.header}>
              <TouchableOpacity
                style={styles.closeBtn}
                onPress={closePreview}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <FontAwesome name="times" size={16} color={Theme.textPrimaryDark} />
              </TouchableOpacity>
              <View style={styles.headerText}>
                <Text style={styles.headerKicker}>ELECTRONIC LORRY RECEIPT</Text>
                <Text style={styles.headerTitle} numberOfLines={1}>
                  {previewTitle}
                </Text>
                <Text style={styles.headerMeta} numberOfLines={1}>
                  {preview?.transporter.name}
                </Text>
              </View>
              {!previewNeedsSave ? (
                <TouchableOpacity
                  style={styles.closeBtn}
                  onPress={editFromPreview}
                  accessibilityRole="button"
                  accessibilityLabel="Edit E-LR"
                >
                  <FontAwesome name="pencil" size={14} color={Theme.textPrimaryDark} />
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
          <ScrollView
            style={styles.previewScroll}
            contentContainerStyle={styles.previewScrollContent}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.sheetFrame}>
              {Platform.OS === "web"
                ? createElement("div", {
                    dangerouslySetInnerHTML: { __html: previewEmbedHtml },
                    style: { width: "100%" },
                  })
                : (
                  <NativeHtmlWebView
                    html={previewHtml}
                    docPreview
                    style={styles.webView}
                  />
                )}
            </View>
          </ScrollView>
          <View style={[styles.actionBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
            <View style={styles.actionBarInner}>
            {previewNeedsSave ? (
              <>
              <TouchableOpacity
                style={styles.actionBtn}
                disabled={busy}
                onPress={closePreview}
                accessibilityRole="button"
              >
                <Text style={styles.actionBtnText}>Back to Edit</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, styles.saveBtn]}
                disabled={busy}
                onPress={() => void generateFromPreview()}
                accessibilityRole="button"
              >
                {busy ? (
                  <ActivityIndicator size="small" color={Theme.textOnPrimary} />
                ) : (
                  <Text style={styles.saveBtnText}>
                    {hasExisting ? "Save E-LR" : "Generate E-LR"}
                  </Text>
                )}
              </TouchableOpacity>
              </>
            ) : (
              <>
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={editFromPreview}
              accessibilityRole="button"
              accessibilityLabel="Edit E-LR"
            >
              <FontAwesome name="pencil" size={14} color={Theme.textPrimaryDark} />
              <Text style={styles.actionBtnText}>Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => void presentFormattedPdf("open")}
            >
              <FontAwesome name="external-link" size={14} color={Theme.textPrimaryDark} />
              <Text style={styles.actionBtnText}>Open</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => void presentFormattedPdf("download")}
            >
              <FontAwesome name="download" size={14} color={Theme.textPrimaryDark} />
              <Text style={styles.actionBtnText}>Download</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => void presentFormattedPdf("share")}
            >
              <FontAwesome name="share-alt" size={14} color={Theme.textPrimaryDark} />
              <Text style={styles.actionBtnText}>Share</Text>
            </TouchableOpacity>
              </>
            )}
            </View>
          </View>
        </View>
      </Modal>
      {draft ? (
        <ElrCompletionForm
          visible={formOpen}
          tripNumber={(source.tripNumber ?? "").trim()}
          vehicleNumber={plate}
          draft={draft}
          prefilled={elrPrefilledFields(source, prefillQuery.data ?? {})}
          lockedFields={[]}
          editingExisting={hasExisting}
          busy={busy}
          draftSaved={draftSaved}
          onChange={(next) => {
            setDraft(next);
            setDraftSaved(false);
          }}
          onCancel={() => {
            if (draft) void persistDraft(draft);
            setFormOpen(false);
          }}
          onSaveDraft={() => {
            if (draft) void persistDraft(draft);
          }}
          onDiscardDraft={
            hasDraft
              ? () => {
                  void clearElrDraft(tripId).then(async () => {
                    setDraft(preparedDraft);
                    setDraftSaved(false);
                    await queryClient.invalidateQueries({
                      queryKey: ["q", "trips", "elr-draft", tripId],
                    });
                  });
                }
              : undefined
          }
          onPreview={() => {
            if (draft) void persistDraft(draft);
            openPreview();
          }}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  block: {
    alignItems: "flex-end",
    justifyContent: "center",
    maxWidth: 200,
    gap: 2,
  },
  hint: {
    color: Theme.textSecondary,
    fontSize: 10,
    textAlign: "right",
    letterSpacing: 0,
  },
  subActions: { flexDirection: "row", gap: 10, marginTop: 2 },
  subActionText: { color: Theme.textSecondary, fontSize: 10, fontWeight: "600" },
  btn: {
    minHeight: 32,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.surface,
  },
  btnText: {
    color: Theme.textPrimaryDark,
    fontSize: 11,
    fontWeight: "700",
  },
  modal: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
  },
  chrome: {
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    paddingHorizontal: 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingBottom: 8,
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Theme.surface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
    paddingTop: 2,
  },
  headerKicker: {
    fontSize: 9,
    fontWeight: "600",
    color: Theme.textMuted,
    letterSpacing: 0.6,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  headerMeta: {
    fontSize: 12,
    fontWeight: "500",
    color: Theme.textMuted,
  },
  previewScroll: {
    flex: 1,
    minHeight: 0,
  },
  previewScrollContent: {
    flexGrow: 1,
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    paddingBottom: 16,
  },
  sheetFrame: {
    width: "100%",
    maxWidth: 720,
    borderRadius: 12,
    overflow: "hidden",
    alignSelf: "center",
  },
  webView: {
    width: "100%",
    minHeight: 720,
    backgroundColor: Theme.surface,
  },
  actionBar: {
    borderTopWidth: 1,
    borderTopColor: Theme.borderLight,
    backgroundColor: Theme.screenBackground,
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  actionBarInner: {
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 10,
  },
  actionBtn: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 140,
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surface,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  actionBtnText: {
    color: Theme.textPrimaryDark,
    fontSize: 11,
    fontWeight: "600",
  },
  saveBtn: {
    backgroundColor: Theme.primary,
    borderColor: Theme.primary,
  },
  saveBtnText: {
    color: Theme.textOnPrimary,
    fontSize: 12,
    fontWeight: "600",
  },
});
