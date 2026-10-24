/**
 * "Existing vehicle documents" — reuse a workspace vehicle's already-verified
 * RC/Insurance as this trip's own compliance evidence instead of
 * re-uploading. Shared, single implementation used from both the Trip
 * Compliance panel (ComplianceSection, embedded in Trip Detail) and Trip
 * Detail's own Vehicle Compliance summary — per the explicit rule that Trip
 * Detail must not implement a separate document-association mechanism.
 *
 * Data: `getReusableVehicleDocuments`/`useVehicleDocumentForTrip`
 * (features/tripCompliance/services/vehicleDocumentReuse.service.ts).
 * Preview: reuses the existing `ComplianceDocumentPreviewModal` — not a new
 * preview implementation. The trip's own current rc/insurance attachment is
 * read directly here (id, status, source_entity_document_id) — a small
 * trip-scoped query, same pattern ComplianceSection already uses for its own
 * verification-columns read, not folded into the generic
 * getDocumentsByTripId() path used by 24+ other call sites.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import Theme from "@/constants/Theme";
import { supabase } from "@/lib/supabase";
import { VEHICLE_DOC_TYPES } from "@/features/compliance/utils/docTypes.util";
import { getComplianceDocumentSignedUrl } from "@/features/compliance/services/documents.service";
import { releaseStoragePreviewUrl } from "@/features/trips/utils/storagePreviewObjectUrl.util";
import { ComplianceDocumentPreviewModal } from "@/features/tripCompliance/components/ComplianceDocumentPreviewModal";
import { uploadTripDocument, type TripDocumentType } from "@/features/trips/services/tripDocuments.service";
import {
  COMPLIANCE_TRIP_DOC_PICKER_TYPES,
  validateComplianceTripDocumentFile,
} from "@/features/tripCompliance/utils/complianceTripDocumentFormat.util";
import {
  REUSABLE_VEHICLE_DOCUMENT_TYPES,
  getReusableVehicleDocuments,
  resolvePinnedVehicleDocumentMeta,
  resolveVehicleDocumentSource,
  useVehicleDocumentForTrip,
  type PinnedVehicleDocumentMeta,
  type ReusableVehicleDocumentType,
  type VehicleDocumentReuseSlot,
} from "@/features/tripCompliance/services/vehicleDocumentReuse.service";
import { alertMessage } from "@/features/tripCompliance/utils/crossPlatformAlert.util";

type AttachedRow = {
  id: string;
  document_type: ReusableVehicleDocumentType;
  status: string;
  source_entity_document_id: string | null;
};

function formatExpiry(dateStr: string | null): string | null {
  if (!dateStr) return null;
  const d = new Date(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}

function guessMimeFromPath(path: string): string | null {
  const ext = path.split(".").pop()?.toLowerCase();
  if (!ext) return null;
  if (ext === "pdf") return "application/pdf";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (["png", "webp", "heic", "heif"].includes(ext)) return `image/${ext}`;
  return null;
}

async function fetchAttachedRows(tripId: string): Promise<Map<ReusableVehicleDocumentType, AttachedRow>> {
  const byType = new Map<ReusableVehicleDocumentType, AttachedRow>();
  const { data, error } = await supabase()
    .from("trip_documents")
    .select("id, document_type, status, source_entity_document_id")
    .eq("trip_id", tripId)
    .in("document_type", REUSABLE_VEHICLE_DOCUMENT_TYPES);
  if (error) return byType; // pre-migration / unavailable — treat as "nothing attached yet"
  for (const row of (data ?? []) as AttachedRow[]) {
    if (row.document_type) byType.set(row.document_type, row);
  }
  return byType;
}

type PreviewState = { title: string; url: string | null; mime: string | null; loading: boolean } | null;

type Props = {
  tripId: string;
  organizationId: string;
  vehicleId: string | null;
  actorId: string | null;
  canUseExistingDocument: boolean;
  /** Permission to upload a fresh rc/insurance file when no reusable one exists — same grant as canUseExistingDocument's RPC (trip_compliance.documents.verify), passed separately in case callers want to differ. */
  canUploadFresh?: boolean;
  onUpdated: () => void;
};

export function VehicleDocumentReuseSection({
  tripId,
  organizationId,
  vehicleId,
  actorId,
  canUseExistingDocument,
  canUploadFresh = true,
  onUpdated,
}: Props) {
  const [slots, setSlots] = useState<VehicleDocumentReuseSlot[] | null>(null);
  const [attached, setAttached] = useState<Map<ReusableVehicleDocumentType, AttachedRow>>(new Map());
  // Pinned to the exact reused entity_documents row (via source_entity_document_id),
  // NOT the vehicle's current document — kept separate from `slots` so the
  // "Used for this trip" metadata line stays historically correct even after
  // the vehicle's document is later replaced (slots.candidate always reflects
  // "current", by design).
  const [attachedMeta, setAttachedMeta] = useState<Map<ReusableVehicleDocumentType, PinnedVehicleDocumentMeta>>(new Map());
  const [loading, setLoading] = useState(true);
  const [busyType, setBusyType] = useState<ReusableVehicleDocumentType | null>(null);
  const [uploadingType, setUploadingType] = useState<ReusableVehicleDocumentType | null>(null);
  const [preview, setPreview] = useState<PreviewState>(null);
  useEffect(() => {
    const url = preview?.url ?? null;
    return () => {
      releaseStoragePreviewUrl(url);
    };
  }, [preview?.url]);

  const load = useCallback(() => {
    setLoading(true);
    const slotsPromise = vehicleId
      ? getReusableVehicleDocuments(organizationId, vehicleId).then((r) => r.slots)
      : Promise.resolve(REUSABLE_VEHICLE_DOCUMENT_TYPES.map((documentType) => ({ documentType, candidate: null })));
    void Promise.all([slotsPromise, fetchAttachedRows(tripId)]).then(async ([slotResult, attachedResult]) => {
      setSlots(slotResult);
      setAttached(attachedResult);

      const metaEntries = await Promise.all(
        Array.from(attachedResult.entries())
          .filter(([, row]) => Boolean(row.source_entity_document_id))
          .map(async ([type, row]) => {
            const { meta } = await resolvePinnedVehicleDocumentMeta(row.source_entity_document_id!);
            return meta ? ([type, meta] as const) : null;
          }),
      );
      setAttachedMeta(new Map(metaEntries.filter((e): e is readonly [ReusableVehicleDocumentType, PinnedVehicleDocumentMeta] => e != null)));
      setLoading(false);
    });
  }, [organizationId, vehicleId, tripId]);

  useEffect(() => {
    load();
  }, [load]);

  const previewCandidate = useCallback(async (type: ReusableVehicleDocumentType, storagePath: string | null) => {
    setPreview({ title: VEHICLE_DOC_TYPES[type].label, url: null, mime: null, loading: true });
    if (!storagePath) {
      setPreview({ title: VEHICLE_DOC_TYPES[type].label, url: null, mime: null, loading: false });
      return;
    }
    const { url } = await getComplianceDocumentSignedUrl(storagePath);
    setPreview({ title: VEHICLE_DOC_TYPES[type].label, url, mime: guessMimeFromPath(storagePath), loading: false });
  }, []);

  const previewAttached = useCallback(async (type: ReusableVehicleDocumentType, sourceEntityDocumentId: string) => {
    setPreview({ title: VEHICLE_DOC_TYPES[type].label, url: null, mime: null, loading: true });
    const { resolved } = await resolveVehicleDocumentSource(sourceEntityDocumentId);
    setPreview({
      title: VEHICLE_DOC_TYPES[type].label,
      url: resolved?.url ?? null,
      mime: resolved?.mimeGuess ?? null,
      loading: false,
    });
  }, []);

  const handleUse = useCallback(
    async (type: ReusableVehicleDocumentType, entityDocumentId: string) => {
      setBusyType(type);
      // Not a React hook — a service function named to match the domain
      // operation's spec name (useVehicleDocumentForTrip); the "use" prefix
      // only trips ESLint's naming heuristic.
      // eslint-disable-next-line react-hooks/rules-of-hooks
      const { error } = await useVehicleDocumentForTrip({ tripId, entityDocumentId, documentType: type });
      setBusyType(null);
      if (error) {
        alertMessage("Couldn't use this document", error.message);
        return;
      }
      onUpdated();
      load();
    },
    [tripId, onUpdated, load],
  );

  /**
   * "Upload document" when no reusable workspace document exists — goes
   * through the same canonical `uploadTripDocument()` path
   * ComplianceDocumentTable.handleAddMissing() already uses for lr/invoice/
   * eway_bill, just for document_type = rc/insurance. Not a second upload
   * mechanism; source_entity_document_id stays null for this row, so it is
   * never mistaken for a reused document.
   */
  const handleUploadFresh = useCallback(
    async (type: ReusableVehicleDocumentType) => {
      if (!actorId) return;
      setUploadingType(type);
      try {
        const res = await DocumentPicker.getDocumentAsync({
          type: [...COMPLIANCE_TRIP_DOC_PICKER_TYPES],
          copyToCacheDirectory: true,
        });
        if (res.canceled || !res.assets[0]) return;
        const asset = res.assets[0];
        const fileName = asset.name ?? `${type}.pdf`;
        if (typeof asset.size === "number") {
          const early = validateComplianceTripDocumentFile({ fileName, mimeType: asset.mimeType, byteLength: asset.size });
          if (!early.ok) throw new Error(early.reason);
        }
        const arrayBuffer = await fetch(asset.uri).then((r) => r.arrayBuffer());
        const format = validateComplianceTripDocumentFile({
          fileName,
          mimeType: asset.mimeType,
          byteLength: arrayBuffer.byteLength,
        });
        if (!format.ok) throw new Error(format.reason);
        const { error } = await uploadTripDocument(
          tripId,
          actorId,
          { arrayBuffer, fileName, mimeType: format.mimeType },
          type as TripDocumentType,
          undefined,
          { replaceExistingOfType: true },
        );
        if (error) throw error;
        onUpdated();
        load();
      } catch (e) {
        alertMessage("Couldn't add document", (e as Error).message);
      } finally {
        setUploadingType(null);
      }
    },
    [tripId, actorId, onUpdated, load],
  );

  const rows = useMemo(() => {
    if (!slots) return [];
    return slots.map((slot) => ({
      slot,
      attachedRow: attached.get(slot.documentType) ?? null,
      pinnedMeta: attachedMeta.get(slot.documentType) ?? null,
    }));
  }, [slots, attached, attachedMeta]);

  if (!vehicleId) return null;

  return (
    <View style={styles.card}>
      <Text style={styles.header}>Existing vehicle documents</Text>
      {loading ? (
        <ActivityIndicator size="small" color={Theme.textMuted} />
      ) : (
        rows.map(({ slot, attachedRow, pinnedMeta }) => {
          const label = VEHICLE_DOC_TYPES[slot.documentType].shortLabel;
          // "Used for this trip" only when this trip's own row is verified AND
          // explicitly references a specific entity_documents version — a
          // freshly uploaded rc/insurance file (source_entity_document_id
          // null) is a different evidence path, not a reuse, so it's left to
          // ComplianceDocumentTable's own trip-doc row rather than shown here.
          const usedForTrip = attachedRow?.status === "verified" && Boolean(attachedRow.source_entity_document_id);

          return (
            <View key={slot.documentType} style={styles.row}>
              <Text style={styles.rowLabel}>{label}</Text>

              {usedForTrip && attachedRow?.source_entity_document_id ? (
                <View style={styles.statusBlock}>
                  <Text style={styles.okText}>✓ Used for this trip</Text>
                  <Text style={styles.meta}>
                    {/* Pinned to the exact reused version (pinnedMeta), never
                        slot.candidate — the vehicle's document may have been
                        replaced since this trip attached it, and this line
                        must keep describing the version actually attached. */}
                    Workspace document{pinnedMeta ? ` · v${pinnedMeta.versionOrdinal}` : ""}
                    {pinnedMeta?.document.expiry_date
                      ? ` · Valid until ${formatExpiry(pinnedMeta.document.expiry_date)}`
                      : ""}
                  </Text>
                  <TouchableOpacity onPress={() => previewAttached(slot.documentType, attachedRow.source_entity_document_id!)}>
                    <Text style={styles.linkText}>Preview</Text>
                  </TouchableOpacity>
                </View>
              ) : slot.candidate?.eligibility === "eligible" ? (
                <View style={styles.statusBlock}>
                  <Text style={styles.okText}>✓ Existing verified document</Text>
                  <Text style={styles.meta}>
                    Valid until {formatExpiry(slot.candidate.document.expiry_date) ?? "—"} · v{slot.candidate.versionOrdinal}
                  </Text>
                  <View style={styles.actionsRow}>
                    <TouchableOpacity onPress={() => previewCandidate(slot.documentType, slot.candidate!.document.storage_path)}>
                      <Text style={styles.linkText}>Preview</Text>
                    </TouchableOpacity>
                    {canUseExistingDocument ? (
                      <TouchableOpacity
                        disabled={busyType === slot.documentType}
                        onPress={() => handleUse(slot.documentType, slot.candidate!.document.id)}
                        style={styles.useBtn}
                      >
                        {busyType === slot.documentType ? (
                          <ActivityIndicator size="small" color="#FFFFFF" />
                        ) : (
                          <Text style={styles.useBtnText}>Use for this trip</Text>
                        )}
                      </TouchableOpacity>
                    ) : null}
                  </View>
                </View>
              ) : slot.candidate ? (
                <View style={styles.statusBlock}>
                  <Text style={styles.warnText}>Existing document found — {slot.candidate.eligibility}</Text>
                  {canUploadFresh && actorId ? (
                    <TouchableOpacity disabled={uploadingType === slot.documentType} onPress={() => handleUploadFresh(slot.documentType)}>
                      {uploadingType === slot.documentType ? (
                        <ActivityIndicator size="small" color={Theme.textMuted} />
                      ) : (
                        <Text style={styles.linkText}>Upload document</Text>
                      )}
                    </TouchableOpacity>
                  ) : null}
                </View>
              ) : (
                <View style={styles.statusBlock}>
                  <Text style={styles.mutedText}>No valid workspace document found</Text>
                  {canUploadFresh && actorId ? (
                    <TouchableOpacity disabled={uploadingType === slot.documentType} onPress={() => handleUploadFresh(slot.documentType)}>
                      {uploadingType === slot.documentType ? (
                        <ActivityIndicator size="small" color={Theme.textMuted} />
                      ) : (
                        <Text style={styles.linkText}>Upload document</Text>
                      )}
                    </TouchableOpacity>
                  ) : null}
                </View>
              )}
            </View>
          );
        })
      )}

      <ComplianceDocumentPreviewModal
        visible={preview != null}
        title={preview?.title ?? ""}
        fileName={null}
        url={preview?.url ?? null}
        mime={preview?.mime ?? null}
        loading={preview?.loading ?? false}
        placeProof={null}
        onClose={() => setPreview(null)}
        emptyMessage="This document has no file on record."
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 14,
    gap: 10,
  },
  header: { fontSize: 15, fontWeight: "700", color: Theme.textPrimary },
  row: { borderTopWidth: 1, borderTopColor: "#F1F2F6", paddingTop: 8, gap: 4 },
  rowLabel: { fontSize: 13, fontWeight: "600", color: Theme.textPrimary },
  statusBlock: { gap: 2 },
  meta: { fontSize: 11, color: Theme.textMuted },
  okText: { fontSize: 12, color: "#0f9d58", fontWeight: "600" },
  warnText: { fontSize: 12, color: "#92600a", fontWeight: "600" },
  mutedText: { fontSize: 12, color: Theme.textMuted },
  linkText: { fontSize: 12, color: "#2563eb", fontWeight: "600" },
  actionsRow: { flexDirection: "row", gap: 14, alignItems: "center", marginTop: 2 },
  useBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "#111827",
  },
  useBtnText: { fontSize: 12, color: "#FFFFFF", fontWeight: "700" },
});
