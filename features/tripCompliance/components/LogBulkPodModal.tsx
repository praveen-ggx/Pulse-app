import {
  RegistryGhostButton,
  RegistryPrimaryButton,
} from "@/components/AlertRegistryCardActions";
import { ThemedConfirmModal } from "@/components/ThemedConfirmModal";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { useAuth } from "@/contexts/AuthContext";
import {
  listBulkPodParties,
  listBulkPodTripsForParty,
  type BulkPodPartyKind,
  type BulkPodTripRow,
} from "@/features/tripCompliance/utils/bulkHardCopyPod.util";
import { COMPLIANCE_TRIP_DOC_PICKER_TYPES } from "@/features/tripCompliance/utils/complianceTripDocumentFormat.util";
import { pulseHardCopyFileName } from "@/features/tripCompliance/utils/podVerificationDocuments.util";
import { HardCopyPodDateField } from "@/features/trips/components/trip-detail/HardCopyPodDateField";
import { HardCopyPodTimeField } from "@/features/trips/components/trip-detail/HardCopyPodTimeField";
import {
  hardCopyPodPhotoRejectionMessage,
  isHardCopyPodPhoto,
} from "@/features/trips/components/trip-detail/hardCopyPodPhotos.util";
import {
  VaultDraftPreviewBlock,
  type VaultDraftPreviewItem,
} from "@/features/trips/components/trip-detail/VaultDraftPreviewBlock";
import { VAULT_DOC_MAX_BYTES, VAULT_DOC_MAX_MB } from "@/features/trips/components/trip-detail/tripDocTypes";
import type { ComplianceTripSummary } from "@/features/tripCompliance/tripCompliance.types";
import {
  courierDispatchDateError,
  encodeHardCopyPodComment,
  logTripHardCopyPodCourier,
  markTripHardCopyPodReceived,
  type HardCopyPodReceiptMethod,
} from "@/features/trips/services/tripDocumentLrPod.service";
import { uploadTripDocument } from "@/features/trips/services/tripDocuments.service";
import { getTripDisplayNumber } from "@/features/trips/services/trips.service";
import { syncHardCopyPodRecord } from "@/lib/queries/invalidateHardCopyPodCaches";
import { captureOrPickImage } from "@/lib/media/captureImage.util";
import { useQueryClient } from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { Camera, Package, Upload, X } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const COURIERS = [
  "BlueDart",
  "DHL",
  "DTDC",
  "Delhivery",
  "FedEx",
  "Ecom Express",
  "Professional Couriers",
  "India Post",
] as const;

type Step = "method" | "details" | "party" | "trips" | "capture";
type ConfirmKind = "log" | "validate" | null;
type PendingDelete =
  | { scope: "shared"; id: string; fileName: string }
  | { scope: "trip"; tripId: string; id: string; fileName: string }
  | null;
type DraftFile = { id: string; uri: string; fileName: string; mimeType: string };

function todayIsoDate(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function newDraftId(): string {
  return `draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function toPreviewItems(files: DraftFile[]): VaultDraftPreviewItem[] {
  return files.map((file) => ({
    id: file.id,
    fileName: file.fileName,
    previewUri: file.uri,
  }));
}

function draftFromAsset(asset: {
  uri: string;
  name?: string | null;
  mimeType?: string | null;
}): DraftFile {
  return {
    id: newDraftId(),
    uri: asset.uri,
    fileName: asset.name?.trim() || "pod.jpg",
    mimeType: asset.mimeType || "image/jpeg",
  };
}

async function pickDraftsFromDocuments(): Promise<DraftFile[]> {
  const res = await DocumentPicker.getDocumentAsync({
    multiple: true,
    copyToCacheDirectory: true,
    type: [...COMPLIANCE_TRIP_DOC_PICKER_TYPES],
  });
  if (res.canceled || !res.assets?.length) return [];
  const accepted: DraftFile[] = [];
  for (const asset of res.assets) {
    const rejection = hardCopyPodPhotoRejectionMessage([asset]);
    if (rejection || !isHardCopyPodPhoto(asset)) {
      Alert.alert("Hard copy POD", rejection ?? "Use a PDF or image up to the vault size limit.");
      continue;
    }
    if (typeof asset.size === "number" && asset.size > VAULT_DOC_MAX_BYTES) {
      Alert.alert("Hard copy POD", `Each file must be ${VAULT_DOC_MAX_MB} MB or smaller.`);
      continue;
    }
    accepted.push(draftFromAsset(asset));
  }
  return accepted;
}

async function pickDraftFromCamera(): Promise<DraftFile | null> {
  const captured = await captureOrPickImage({
    preferCamera: true,
    permissionTitle: "Camera required",
    permissionMessage: "Allow camera to photograph the hard-copy POD.",
  });
  if (!captured?.uri) return null;
  return draftFromAsset({
    uri: captured.uri,
    name: `pod-${Date.now()}.jpg`,
    mimeType: "image/jpeg",
  });
}

function chooseDraftFiles(): Promise<DraftFile[]> {
  if (Platform.OS === "web") return pickDraftsFromDocuments();
  return new Promise((resolve) => {
    Alert.alert("Trip POD", "Attach the hard-copy for this trip.", [
      {
        text: "Take photo",
        onPress: () => {
          void pickDraftFromCamera().then((file) => resolve(file ? [file] : []));
        },
      },
      {
        text: "Upload file",
        onPress: () => {
          void pickDraftsFromDocuments().then(resolve);
        },
      },
      { text: "Cancel", style: "cancel", onPress: () => resolve([]) },
    ]);
  });
}

function appendDrafts(current: DraftFile[], next: DraftFile[]): DraftFile[] {
  return next.length === 0 ? current : [...current, ...next];
}

function removeDraft(current: DraftFile[], id: string): DraftFile[] {
  return current.filter((file) => file.id !== id);
}

async function readFileAsArrayBuffer(uri: string): Promise<ArrayBuffer> {
  if (Platform.OS === "web") {
    const response = await fetch(uri);
    return response.arrayBuffer();
  }
  const base64 = await FileSystem.readAsStringAsync(uri, { encoding: "base64" as const });
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)).buffer;
}

export function LogBulkPodModal({
  visible,
  onClose,
  summaries,
  organizationId,
  supplierNameByTripId,
  canManage,
  onChanged,
}: {
  visible: boolean;
  onClose: () => void;
  summaries: ComplianceTripSummary[];
  organizationId: string | null;
  supplierNameByTripId: Record<string, string>;
  canManage: boolean;
  onChanged: (tripIds: string[], validated: boolean) => void | Promise<void>;
}) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const compact = width < 560;
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>("method");
  const [method, setMethod] = useState<HardCopyPodReceiptMethod | null>(null);
  const [kind, setKind] = useState<BulkPodPartyKind>("supplier");
  const [partyId, setPartyId] = useState<string | null>(null);
  const [partyQuery, setPartyQuery] = useState("");
  const [courierName, setCourierName] = useState("");
  const [awbNumber, setAwbNumber] = useState("");
  const [dispatchDate, setDispatchDate] = useState("");
  const [receivedBy, setReceivedBy] = useState("");
  const [receivedDate, setReceivedDate] = useState(todayIsoDate());
  const [receivedTime, setReceivedTime] = useState("");
  const [remarks, setRemarks] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [captureIndex, setCaptureIndex] = useState(0);
  const [sharedFiles, setSharedFiles] = useState<DraftFile[]>([]);
  const [sharedSelectedId, setSharedSelectedId] = useState<string | null>(null);
  const [filesByTrip, setFilesByTrip] = useState<Record<string, DraftFile[]>>({});
  const [tripSelectedId, setTripSelectedId] = useState<Record<string, string | null>>({});
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmKind>(null);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete>(null);

  useEffect(() => {
    if (visible) return;
    setStep("method");
    setMethod(null);
    setKind("supplier");
    setPartyId(null);
    setPartyQuery("");
    setCourierName("");
    setAwbNumber("");
    setDispatchDate("");
    setReceivedBy("");
    setReceivedDate(todayIsoDate());
    setReceivedTime("");
    setRemarks("");
    setSelectedIds([]);
    setCaptureIndex(0);
    setSharedFiles([]);
    setSharedSelectedId(null);
    setFilesByTrip({});
    setTripSelectedId({});
    setSaving(false);
    setConfirm(null);
    setPendingDelete(null);
  }, [visible]);

  const parties = useMemo(
    () => listBulkPodParties(summaries, kind, supplierNameByTripId),
    [kind, summaries, supplierNameByTripId],
  );
  const visibleParties = useMemo(() => {
    const q = partyQuery.trim().toLowerCase();
    if (!q) return parties;
    return parties.filter((party) => party.name.toLowerCase().includes(q));
  }, [parties, partyQuery]);
  const selectedParty = parties.find((party) => party.id === partyId) ?? null;

  const trips = useMemo(
    () =>
      listBulkPodTripsForParty(
        summaries,
        kind,
        partyId ?? "",
        supplierNameByTripId,
        (summary) => getTripDisplayNumber(summary.trip, organizationId),
      ),
    [kind, organizationId, partyId, summaries, supplierNameByTripId],
  );

  const tripIdsKey = trips.map((row) => row.tripId).join(",");
  useEffect(() => {
    setSelectedIds(tripIdsKey ? tripIdsKey.split(",") : []);
  }, [partyId, tripIdsKey]);

  const courierReady =
    Boolean(courierName.trim()) &&
    Boolean(awbNumber.trim()) &&
    !courierDispatchDateError(dispatchDate) &&
    Boolean(receivedDate.trim());
  const personReady = Boolean(receivedBy.trim() && receivedDate.trim());
  const detailsReady = method === "person" ? personReady : method === "courier" ? courierReady : false;
  const filesForTrip = useCallback(
    (tripId: string) => filesByTrip[tripId] ?? [],
    [filesByTrip],
  );
  const canSubmit =
    canManage &&
    !saving &&
    detailsReady &&
    selectedIds.length > 0 &&
    selectedIds.every((tripId) => filesForTrip(tripId).length > 0);
  const captureTrips = useMemo(
    () => trips.filter((row) => selectedIds.includes(row.tripId)),
    [selectedIds, trips],
  );
  const captureTrip = captureTrips[Math.min(captureIndex, Math.max(captureTrips.length - 1, 0))] ?? null;
  const captureHasFile = captureTrip ? filesForTrip(captureTrip.tripId).length > 0 : false;

  const removeSharedFile = useCallback((id: string) => {
    setSharedFiles((current) => {
      const next = removeDraft(current, id);
      setSharedSelectedId((selected) =>
        selected && selected !== id ? selected : next[0]?.id ?? null,
      );
      return next;
    });
  }, []);

  const pickTripFile = useCallback(async (tripId: string) => {
    const next = await chooseDraftFiles();
    if (next.length === 0) return;
    setFilesByTrip((current) => ({
      ...current,
      [tripId]: appendDrafts(current[tripId] ?? [], next),
    }));
    setTripSelectedId((current) => ({
      ...current,
      [tripId]: next[next.length - 1]?.id ?? current[tripId] ?? null,
    }));
    setSelectedIds((current) => (current.includes(tripId) ? current : [...current, tripId]));
  }, []);

  const removeTripFile = useCallback((tripId: string, id: string) => {
    setFilesByTrip((current) => {
      const nextFiles = removeDraft(current[tripId] ?? [], id);
      setTripSelectedId((selected) => ({
        ...selected,
        [tripId]: selected[tripId] === id ? nextFiles[0]?.id ?? null : selected[tripId] ?? null,
      }));
      const next = { ...current };
      if (nextFiles.length === 0) delete next[tripId];
      else next[tripId] = nextFiles;
      return next;
    });
  }, []);

  const applyBulk = useCallback(
    async (validate: boolean) => {
      if (!canSubmit) return;
      const uploaderId = user?.uid;
      if (!uploaderId) {
        Alert.alert("Hard copy POD", "Sign in to upload the POD photo.");
        return;
      }
      setSaving(true);
      const comment = encodeHardCopyPodComment(
        method === "person"
          ? {
              remarks,
              receivedDate,
              receivedTime,
              receiptMethod: "person",
            }
          : {
              remarks,
              receiptMethod: "courier",
              dispatchDate,
              expectedDeliveryDate: receivedDate,
              receivedDate,
            },
      );
      const saved: string[] = [];
      let firstError: string | null = null;
      const buffers = new Map<string, ArrayBuffer>();
      try {
        for (const tripId of selectedIds) {
          const tripFiles = filesForTrip(tripId);
          if (tripFiles.length === 0) {
            firstError = firstError ?? `Add a hard-copy POD for ${tripId}.`;
            continue;
          }
          if (method === "courier") {
            const logged = await logTripHardCopyPodCourier(tripId, {
              courier: courierName.trim(),
              awbNumber: awbNumber.trim(),
              dispatchDate,
              expectedDeliveryDate: receivedDate || null,
              remarks,
            });
            if (logged.error) {
              firstError = firstError ?? logged.error.message;
              continue;
            }
          }
          let uploadedOk = true;
          for (const tripFile of tripFiles) {
            let arrayBuffer = buffers.get(tripFile.uri);
            if (!arrayBuffer) {
              arrayBuffer = await readFileAsArrayBuffer(tripFile.uri);
              if (!arrayBuffer || arrayBuffer.byteLength === 0) {
                firstError = firstError ?? `Could not read ${tripFile.fileName}.`;
                uploadedOk = false;
                break;
              }
              buffers.set(tripFile.uri, arrayBuffer);
            }
            const uploaded = await uploadTripDocument(
              tripId,
              uploaderId,
              {
                arrayBuffer,
                fileName: pulseHardCopyFileName(tripFile.fileName),
                mimeType: tripFile.mimeType,
              },
              "pod",
            );
            if (uploaded.error) {
              firstError = firstError ?? uploaded.error.message;
              uploadedOk = false;
              break;
            }
          }
          if (!uploadedOk) continue;
          if (method === "person" || validate) {
            const recorded = await markTripHardCopyPodReceived(tripId, {
              courier: method === "courier" ? courierName.trim() : null,
              awbNumber: method === "courier" ? awbNumber.trim() : null,
              receivedBy: method === "person" ? receivedBy.trim() : null,
              comment,
            });
            if (recorded.error) {
              firstError = firstError ?? recorded.error.message;
              continue;
            }
          }
          saved.push(tripId);
        }
      } catch (error) {
        firstError = error instanceof Error ? error.message : "Could not log bulk POD.";
      }
      setSaving(false);
      if (saved.length === 0) {
        Alert.alert("Log Bulk POD", firstError ?? "Could not update the selected trips.");
        return;
      }
      await Promise.all(
        saved.map((tripId) =>
          syncHardCopyPodRecord(queryClient, { tripId, organizationId }),
        ),
      );
      await onChanged(saved, validate);
      if (firstError) {
        Alert.alert("Log Bulk POD", `Updated ${saved.length} of ${selectedIds.length} trips. ${firstError}`);
      }
      onClose();
    },
    [
      awbNumber,
      canSubmit,
      courierName,
      dispatchDate,
      filesForTrip,
      method,
      onChanged,
      onClose,
      organizationId,
      queryClient,
      receivedBy,
      receivedDate,
      receivedTime,
      remarks,
      selectedIds,
      user?.uid,
    ],
  );

  const toggleTrip = (tripId: string) => {
    setSelectedIds((current) =>
      current.includes(tripId) ? current.filter((id) => id !== tripId) : [...current, tripId],
    );
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View
        style={[
          styles.backdrop,
          {
            paddingTop: compact ? insets.top : insets.top + 12,
            paddingBottom: compact ? insets.bottom : insets.bottom + 12,
            paddingHorizontal: compact ? 0 : 16,
          },
        ]}
      >
        <View style={[styles.card, compact && styles.cardCompact]}>
          <View style={styles.head}>
            <View style={styles.headCopy}>
              <Text style={styles.kicker}>Awaiting POD</Text>
              <Text style={styles.title}>Log Bulk POD</Text>
              <Text style={styles.meta}>
                {step === "method"
                  ? "Was the hard copy handed in person or sent by courier?"
                  : step === "details"
                    ? method === "person"
                      ? "Who received the POD and when."
                      : "Shared courier, AWB, and dates for this batch."
                    : step === "party"
                      ? "Choose the supplier or driver."
                      : step === "trips"
                        ? "Select trips, then upload a hard-copy POD on each trip — one at a time."
                        : `Photograph the POD for trip ${Math.min(captureIndex + 1, captureTrips.length)} of ${captureTrips.length}, then move to the next.`}
              </Text>
            </View>
            <Pressable onPress={onClose} style={styles.close} accessibilityRole="button" accessibilityLabel="Close">
              <X size={16} color={Theme.actionBtnInk} />
            </Pressable>
          </View>

          {step === "method" ? (
            <View style={styles.body}>
              <Text style={styles.section}>How was the hard copy received?</Text>
              <View style={styles.kindRow}>
                <Pressable
                  onPress={() => setMethod("person")}
                  style={[styles.kindChip, method === "person" && styles.kindChipOn]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: method === "person" }}
                >
                  <Text style={[styles.kindText, method === "person" && styles.kindTextOn]}>
                    In person
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setMethod("courier")}
                  style={[styles.kindChip, method === "courier" && styles.kindChipOn]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: method === "courier" }}
                >
                  <Text style={[styles.kindText, method === "courier" && styles.kindTextOn]}>
                    Courier
                  </Text>
                </Pressable>
              </View>
              <Text style={styles.empty}>
                Next you will pick the supplier or driver, select the trips, then capture a POD on each trip.
              </Text>
            </View>
          ) : null}

          {step === "party" ? (
            <View style={styles.body}>
              <View style={styles.kindRow}>
                {(["supplier", "driver"] as const).map((next) => (
                  <Pressable
                    key={next}
                    onPress={() => {
                      setKind(next);
                      setPartyId(null);
                    }}
                    style={[styles.kindChip, kind === next && styles.kindChipOn]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: kind === next }}
                  >
                    <Text style={[styles.kindText, kind === next && styles.kindTextOn]}>
                      {next === "supplier" ? "Supplier" : "Driver"}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <TextInput
                value={partyQuery}
                onChangeText={setPartyQuery}
                placeholder={kind === "supplier" ? "Search supplier" : "Search driver"}
                placeholderTextColor={Theme.textMuted}
                style={styles.search}
              />
              <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
                {visibleParties.length === 0 ? (
                  <Text style={styles.empty}>No parties with trips still missing a hard-copy POD.</Text>
                ) : (
                  visibleParties.map((party) => {
                    const selected = party.id === partyId;
                    return (
                      <Pressable
                        key={party.id}
                        onPress={() => setPartyId(party.id)}
                        style={[styles.row, selected && styles.rowOn]}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                      >
                        <View style={styles.rowCopy}>
                          <Text style={styles.rowTitle}>{party.name}</Text>
                          <Text style={styles.rowMeta}>
                            {party.tripCount} trip{party.tripCount === 1 ? "" : "s"} without hard-copy POD
                          </Text>
                        </View>
                        <View style={[styles.tick, selected && styles.tickOn]} />
                      </Pressable>
                    );
                  })
                )}
              </ScrollView>
            </View>
          ) : null}

          {step === "details" ? (
            <ScrollView style={styles.body} contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
              <Text style={styles.section}>
                {method === "person" ? "Received at the desk" : "Courier dispatch"}
              </Text>
              {method === "person" ? (
                <>
                  <View style={styles.field}>
                    <Text style={styles.label}>Received by *</Text>
                    <TextInput
                      value={receivedBy}
                      onChangeText={setReceivedBy}
                      placeholder="Person name"
                      placeholderTextColor={Theme.textMuted}
                      style={styles.input}
                    />
                  </View>
                  <View style={[styles.dateRow, compact && styles.dateRowStacked]}>
                    <View style={styles.dateCol}>
                      <HardCopyPodDateField
                        label="Received date"
                        required
                        value={receivedDate}
                        onChange={setReceivedDate}
                      />
                    </View>
                    <View style={styles.dateCol}>
                      <HardCopyPodTimeField
                        label="Received time"
                        value={receivedTime}
                        onChange={setReceivedTime}
                        placeholder="HH:MM"
                      />
                    </View>
                  </View>
                </>
              ) : null}
              {method === "courier" ? (
                <>
              <Text style={styles.section}>{selectedParty?.name ?? "Courier"}</Text>
              <View style={styles.field}>
                <Text style={styles.label}>Courier name *</Text>
                <View style={styles.courierWrap}>
                  {COURIERS.map((name) => (
                    <Pressable
                      key={name}
                      onPress={() => setCourierName(name)}
                      style={[styles.courierChip, courierName === name && styles.kindChipOn]}
                    >
                      <Text style={[styles.kindText, courierName === name && styles.kindTextOn]}>{name}</Text>
                    </Pressable>
                  ))}
                </View>
                <TextInput
                  value={courierName}
                  onChangeText={setCourierName}
                  placeholder="Or type courier"
                  placeholderTextColor={Theme.textMuted}
                  style={styles.input}
                />
              </View>
              <View style={styles.field}>
                <Text style={styles.label}>Tracking / AWB *</Text>
                <TextInput
                  value={awbNumber}
                  onChangeText={setAwbNumber}
                  placeholder="Primary courier reference"
                  placeholderTextColor={Theme.textMuted}
                  style={styles.input}
                />
              </View>
              <View style={[styles.dateRow, compact && styles.dateRowStacked]}>
                <View style={styles.dateCol}>
                  <HardCopyPodDateField
                    label="Dispatch date"
                    required
                    value={dispatchDate}
                    onChange={setDispatchDate}
                    error={dispatchDate ? courierDispatchDateError(dispatchDate) ?? undefined : undefined}
                  />
                </View>
                <View style={styles.dateCol}>
                  <HardCopyPodDateField
                    label="Received date"
                    required
                    value={receivedDate}
                    onChange={setReceivedDate}
                  />
                </View>
              </View>
                </>
              ) : null}
              <View style={styles.field}>
                <Text style={styles.label}>Remarks</Text>
                <TextInput
                  value={remarks}
                  onChangeText={setRemarks}
                  placeholder="Optional remarks"
                  placeholderTextColor={Theme.textMuted}
                  style={[styles.input, styles.remarks]}
                  multiline
                />
              </View>
            </ScrollView>
          ) : null}

          {step === "trips" ? (
            <View style={styles.body}>
              <View style={[styles.tripHead, compact && styles.tripHeadCompact]}>
                <Text style={styles.section}>
                  {selectedIds.length} of {trips.length} selected
                </Text>
                <Pressable
                  onPress={() =>
                    setSelectedIds((current) =>
                      current.length === trips.length ? [] : trips.map((row) => row.tripId),
                    )
                  }
                  accessibilityRole="button"
                >
                  <Text style={styles.link}>
                    {selectedIds.length === trips.length ? "Clear" : "Select all"}
                  </Text>
                </Pressable>
              </View>
              <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
                {trips.map((row) => {
                  const files = filesByTrip[row.tripId] ?? [];
                  const selected = selectedIds.includes(row.tripId);
                  return (
                  <TripPickRow
                    key={row.tripId}
                    row={row}
                    selected={selected}
                    files={files}
                    selectedFileId={tripSelectedId[row.tripId] ?? null}
                    busy={saving}
                    compact={compact}
                    onToggle={() => toggleTrip(row.tripId)}
                    onUpload={() => {
                      if (!selected) toggleTrip(row.tripId);
                      void pickTripFile(row.tripId);
                    }}
                    onCamera={
                      Platform.OS === "web"
                        ? undefined
                        : () => {
                            if (!selected) toggleTrip(row.tripId);
                            void pickDraftFromCamera().then((file) => {
                              if (!file) return;
                              setFilesByTrip((current) => ({
                                ...current,
                                [row.tripId]: appendDrafts(current[row.tripId] ?? [], [file]),
                              }));
                              setTripSelectedId((current) => ({
                                ...current,
                                [row.tripId]: file.id,
                              }));
                            });
                          }
                    }
                    onSelectFile={(id) =>
                      setTripSelectedId((current) => ({ ...current, [row.tripId]: id }))
                    }
                    onRemoveFile={(id) => {
                      const file = files.find((item) => item.id === id);
                      if (!file) return;
                      setPendingDelete({
                        scope: "trip",
                        tripId: row.tripId,
                        id,
                        fileName: file.fileName,
                      });
                    }}
                  />
                  );
                })}
              </ScrollView>
            </View>
          ) : null}

          {step === "capture" && captureTrip ? (
            <View style={styles.body}>
              <Text style={styles.section}>
                {captureIndex + 1} of {captureTrips.length} · {captureTrip.tripNumber}
              </Text>
              <Text style={styles.rowMeta}>
                {captureTrip.clientName} · {captureTrip.route}
              </Text>
              <Text style={styles.rowMeta}>
                {captureTrip.vehicle} · LR {captureTrip.lrLabel}
              </Text>
              <View style={styles.uploadBox}>
                <Text style={styles.section}>Hard-copy POD</Text>
                <View style={styles.kindRow}>
                  {Platform.OS !== "web" ? (
                    <RegistryPrimaryButton
                      label="Take photo"
                      onPress={() => {
                        void pickDraftFromCamera().then((file) => {
                          if (!file) return;
                          setFilesByTrip((current) => ({
                            ...current,
                            [captureTrip.tripId]: appendDrafts(current[captureTrip.tripId] ?? [], [file]),
                          }));
                          setTripSelectedId((current) => ({
                            ...current,
                            [captureTrip.tripId]: file.id,
                          }));
                        });
                      }}
                      style={compact ? styles.footerBtn : undefined}
                    />
                  ) : null}
                  <RegistryGhostButton
                    label={Platform.OS === "web" ? "Upload POD" : "Upload file"}
                    onPress={() => void pickTripFile(captureTrip.tripId)}
                    style={compact ? styles.footerBtn : undefined}
                  />
                </View>
                <VaultDraftPreviewBlock
                  items={toPreviewItems(filesByTrip[captureTrip.tripId] ?? [])}
                  selectedId={tripSelectedId[captureTrip.tripId] ?? null}
                  busy={saving}
                  density="card"
                  emptyLabel={
                    Platform.OS === "web"
                      ? "Upload the hard-copy POD for this trip"
                      : "Take a photo or upload the hard-copy POD"
                  }
                  onSelect={(id) =>
                    setTripSelectedId((current) => ({ ...current, [captureTrip.tripId]: id }))
                  }
                  onRemove={(id) => {
                    const file = (filesByTrip[captureTrip.tripId] ?? []).find((item) => item.id === id);
                    if (!file) return;
                    setPendingDelete({
                      scope: "trip",
                      tripId: captureTrip.tripId,
                      id,
                      fileName: file.fileName,
                    });
                  }}
                  onAdd={() => void pickTripFile(captureTrip.tripId)}
                />
              </View>
            </View>
          ) : null}

          <View style={[styles.footer, compact && styles.footerCompact]}>
            {step === "method" ? (
              <>
                <RegistryGhostButton
                  label="Cancel"
                  onPress={onClose}
                  style={compact ? styles.footerBtn : undefined}
                />
                <RegistryPrimaryButton
                  label="Next"
                  disabled={!method}
                  onPress={() => setStep("details")}
                  style={compact ? styles.footerBtn : undefined}
                />
              </>
            ) : null}
            {step === "details" ? (
              <>
                <RegistryGhostButton
                  label="Back"
                  onPress={() => setStep("method")}
                  style={compact ? styles.footerBtn : undefined}
                />
                <RegistryPrimaryButton
                  label="Next"
                  disabled={!detailsReady}
                  onPress={() => setStep("party")}
                  style={compact ? styles.footerBtn : undefined}
                />
              </>
            ) : null}
            {step === "party" ? (
              <>
                <RegistryGhostButton
                  label="Back"
                  onPress={() => setStep("details")}
                  style={compact ? styles.footerBtn : undefined}
                />
                <RegistryPrimaryButton
                  label="Next"
                  disabled={!partyId}
                  onPress={() => setStep("trips")}
                  style={compact ? styles.footerBtn : undefined}
                />
              </>
            ) : null}
            {step === "trips" ? (
              <>
                <RegistryGhostButton
                  label="Back"
                  onPress={() => setStep("party")}
                  style={compact ? styles.footerBtn : undefined}
                />
                {method === "person" ? (
                  <RegistryPrimaryButton
                    label={saving ? "Saving…" : "Submit"}
                    disabled={!canSubmit}
                    onPress={() => setConfirm("validate")}
                    style={compact ? styles.footerBtn : undefined}
                  />
                ) : (
                  <>
                    <RegistryGhostButton
                      label={saving ? "Saving…" : "Log POD"}
                      disabled={!canSubmit}
                      onPress={() => setConfirm("log")}
                      style={compact ? styles.footerBtn : undefined}
                    />
                    <RegistryPrimaryButton
                      label={saving ? "Saving…" : "Submit"}
                      disabled={!canSubmit}
                      onPress={() => setConfirm("validate")}
                      style={compact ? styles.footerBtn : undefined}
                    />
                  </>
                )}
              </>
            ) : null}
            {step === "capture" ? (
              <>
                <RegistryGhostButton
                  label="Back"
                  onPress={() => {
                    if (captureIndex > 0) setCaptureIndex((index) => index - 1);
                    else setStep("trips");
                  }}
                  disabled={saving}
                  style={compact ? styles.footerBtn : undefined}
                />
                {captureIndex < captureTrips.length - 1 ? (
                  <RegistryPrimaryButton
                    label="Next trip"
                    disabled={!captureHasFile}
                    onPress={() => setCaptureIndex((index) => index + 1)}
                    style={compact ? styles.footerBtn : undefined}
                  />
                ) : method === "person" ? (
                  <RegistryPrimaryButton
                    label={saving ? "Saving…" : "Submit"}
                    disabled={!canSubmit}
                    onPress={() => setConfirm("validate")}
                    style={compact ? styles.footerBtn : undefined}
                  />
                ) : (
                  <>
                    <RegistryGhostButton
                      label={saving ? "Saving…" : "Log POD"}
                      disabled={!canSubmit}
                      onPress={() => setConfirm("log")}
                      style={compact ? styles.footerBtn : undefined}
                    />
                    <RegistryPrimaryButton
                      label={saving ? "Saving…" : "Submit"}
                      disabled={!canSubmit}
                      onPress={() => setConfirm("validate")}
                      style={compact ? styles.footerBtn : undefined}
                    />
                  </>
                )}
              </>
            ) : null}
            {saving ? <ActivityIndicator color={Theme.textPrimaryDark} /> : null}
          </View>
        </View>
      </View>
      <ThemedConfirmModal
        visible={confirm != null}
        title={confirm === "validate" ? "Submit these hard-copy PODs?" : "Log bulk hard-copy POD?"}
        message={
          confirm === "validate"
            ? `Save the ${method === "person" ? "in-person" : "courier"} details and photo on ${selectedIds.length} trip${selectedIds.length === 1 ? "" : "s"} and move them to POD Verification.`
            : `Log the courier details and attach the hard-copy scan to ${selectedIds.length} trip${selectedIds.length === 1 ? "" : "s"}.`
        }
        confirmText={confirm === "validate" ? "Validate" : "Log POD"}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          const next = confirm;
          setConfirm(null);
          if (next) void applyBulk(next === "validate");
        }}
      />
      <ThemedConfirmModal
        visible={pendingDelete != null}
        title="Delete this POD?"
        message={`${pendingDelete?.fileName ?? "This file"} will be deleted and will not be attached to the trip.`}
        cancelText="Keep"
        confirmText="Delete"
        variant="warning"
        confirmVariant="destructive"
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          const next = pendingDelete;
          setPendingDelete(null);
          if (!next) return;
          if (next.scope === "shared") removeSharedFile(next.id);
          else removeTripFile(next.tripId, next.id);
        }}
      />
    </Modal>
  );
}

function TripPickRow({
  row,
  selected,
  files,
  selectedFileId,
  busy,
  compact,
  onToggle,
  onUpload,
  onCamera,
  onSelectFile,
  onRemoveFile,
}: {
  row: BulkPodTripRow;
  selected: boolean;
  files: DraftFile[];
  selectedFileId: string | null;
  busy: boolean;
  compact: boolean;
  onToggle: () => void;
  onUpload: () => void;
  onCamera?: () => void;
  onSelectFile: (id: string) => void;
  onRemoveFile: (id: string) => void;
}) {
  const captured = files.length > 0;
  return (
    <View style={[styles.tripCard, selected && styles.rowOn]}>
      <Pressable
        onPress={onToggle}
        style={styles.rowMain}
        accessibilityRole="button"
        accessibilityState={{ selected }}
      >
        <View style={[styles.tick, selected && styles.tickOn]} />
        <View style={styles.rowCopy}>
          <Text style={styles.rowTitle}>{row.tripNumber}</Text>
          <Text style={styles.rowMeta}>
            {row.clientName} · {row.route}
          </Text>
          <Text style={styles.rowMeta}>
            {row.vehicle} · LR {row.lrLabel}
            {captured ? " · POD captured" : " · Upload this trip"}
          </Text>
        </View>
        {onCamera ? (
          <Pressable
            onPress={onCamera}
            style={[styles.rowIconBtn, captured && styles.rowIconBtnOn]}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`Take POD photo for ${row.tripNumber}`}
          >
            <Camera size={14} color={captured ? Theme.buttonDarkText : Theme.textPrimaryDark} />
          </Pressable>
        ) : null}
        <Pressable
          onPress={onUpload}
          style={[styles.rowIconBtn, captured && styles.rowIconBtnOn]}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`Upload hard-copy POD for ${row.tripNumber}`}
        >
          <Upload size={14} color={captured ? Theme.buttonDarkText : Theme.textPrimaryDark} />
        </Pressable>
        <View style={styles.rowIconBtn} accessibilityElementsHidden>
          <Package size={14} color={Theme.textMuted} />
        </View>
      </Pressable>
      {selected ? (
        <VaultDraftPreviewBlock
          items={toPreviewItems(files)}
          selectedId={selectedFileId}
          busy={busy}
          density="card"
          emptyLabel={
            compact && onCamera
              ? "Take a photo or upload the POD for this trip only"
              : "Upload the hard-copy POD for this trip only"
          }
          onSelect={onSelectFile}
          onRemove={onRemoveFile}
          onAdd={onUpload}
        />
      ) : null}
    </View>
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
    maxWidth: 720,
    maxHeight: "100%",
    flex: 1,
    backgroundColor: Theme.cardWhite,
    borderRadius: 16,
    overflow: "hidden",
  },
  cardCompact: {
    maxWidth: "100%",
    borderRadius: 0,
  },
  head: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Theme.complianceTripCardBorder,
  },
  headCopy: { flex: 1, minWidth: 0, gap: 4 },
  kicker: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.6,
    color: Theme.textMuted,
    textTransform: "uppercase",
  },
  title: { fontSize: 18, fontWeight: "700", color: Theme.textPrimaryDark },
  meta: { fontSize: 13, lineHeight: 18, color: Theme.textSecondary },
  close: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.complianceIconWash,
  },
  body: { flex: 1, minHeight: 0, padding: 16, gap: 10 },
  form: { gap: 12, paddingBottom: 12 },
  kindRow: { flexDirection: "row", gap: 8 },
  kindChip: {
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Theme.complianceTripCardBorder,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.cardWhite,
  },
  kindChipOn: {
    backgroundColor: Theme.buttonDark,
    borderColor: Theme.buttonDark,
  },
  kindText: { fontSize: 12, fontWeight: "700", color: Theme.textPrimaryDark },
  kindTextOn: { color: Theme.buttonDarkText },
  search: {
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.complianceTripCardBorder,
    paddingHorizontal: 12,
    color: Theme.textPrimaryDark,
    backgroundColor: Theme.compliancePageBg,
  },
  list: { flex: 1, minHeight: 0 },
  empty: { fontSize: 13, color: Theme.textMuted, lineHeight: 18 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.complianceTripCardBorder,
    marginBottom: 8,
    minHeight: 44,
  },
  tripCard: {
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.complianceTripCardBorder,
    marginBottom: 8,
    minHeight: 44,
  },
  rowOn: { borderColor: Theme.complianceTripCardSelectedBorder, backgroundColor: Theme.complianceSelectedWash },
  rowMain: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 44,
  },
  rowCopy: { flex: 1, minWidth: 0, gap: 2 },
  rowTitle: { fontSize: 14, fontWeight: "700", color: Theme.textPrimaryDark },
  rowMeta: { fontSize: 12, color: Theme.textSecondary },
  tick: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.complianceTripCardBorder,
    backgroundColor: Theme.cardWhite,
  },
  tickOn: { backgroundColor: Theme.buttonDark, borderColor: Theme.buttonDark },
  rowIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.complianceIconWash,
  },
  rowIconBtnOn: {
    backgroundColor: Theme.buttonDark,
  },
  section: { fontSize: 13, fontWeight: "700", color: Theme.textPrimaryDark },
  field: { gap: 6 },
  label: { fontSize: 12, fontWeight: "600", color: Theme.textSecondary },
  input: {
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.complianceTripCardBorder,
    paddingHorizontal: 12,
    color: Theme.textPrimaryDark,
  },
  remarks: { minHeight: 72, textAlignVertical: "top", paddingTop: 10 },
  courierWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  courierChip: {
    minHeight: 32,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Theme.complianceTripCardBorder,
    justifyContent: "center",
  },
  dateRow: { flexDirection: "row", gap: 10 },
  dateRowStacked: { flexDirection: "column" },
  dateCol: { flex: 1, minWidth: 0 },
  tripHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  tripHeadCompact: { flexWrap: "wrap", gap: 8 },
  link: { fontSize: 13, fontWeight: "700", color: Theme.actionBtnInk },
  uploadBox: {
    gap: 10,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.complianceTripCardBorder,
    backgroundColor: Theme.compliancePageBg,
  },
  footer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    alignItems: "center",
    justifyContent: "flex-end",
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: Theme.complianceTripCardBorder,
    paddingBottom: Math.max(16, Layout.screenPaddingHorizontal),
  },
  footerCompact: {
    flexDirection: "column",
    alignItems: "stretch",
    justifyContent: "flex-end",
  },
  footerBtn: {
    width: "100%",
    minHeight: 44,
    height: 44,
  },
});
