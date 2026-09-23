/**
 * The focused Compliance review experience — opened from a trip card's
 * Trip/Vehicle/Driver tiles or Verify Docs. Two steps in one Modal: a
 * document list with Approve/Decline on uploaded rows (Decline requires a note),
 * then a preview pane. Trip docs use trip_documents; vehicle/driver docs use
 * entity_documents via documents.service.
 */
import Theme from "@/constants/Theme";
import {
  rejectDocument,
  replaceComplianceDocument,
  updateEntityDocumentExpiry,
  uploadComplianceDocument,
  verifyDocument,
} from "@/features/compliance/services/documents.service";
import { getVehicleById } from "@/features/vehicles/services/vehicles.service";
import {
  resolveVehicleDocumentsWriteTarget,
  updateVehicleDocumentExpiry,
  uploadAndSaveVehicleDocument,
} from "@/features/vehicles/services/vehicleDocuments.service";
import type { VehicleComplianceDocType } from "@/features/vehicles/utils/vehicleDocuments.util";
import { describeStopProofDocument, type StopProofDocumentSummary } from "@/features/driver/job-card/deliveryProof";
import { ComplianceDocumentPreviewModal } from "@/features/tripCompliance/components/ComplianceDocumentPreviewModal";
import {
  guessCompliancePreviewMime,
  resolveComplianceActorDetails,
  signCompliancePreviewUrl,
} from "@/features/tripCompliance/services/complianceDocumentView.service";
import { ComplianceInputModal } from "@/features/tripCompliance/components/ComplianceInputModal";
import { COMPLIANCE_STATUS_META, ComplianceStatusChip } from "@/features/tripCompliance/components/ComplianceStatusIcon";
import { uploadTripDocument, isTripDocumentsStoragePathConflict, type TripDocumentType } from "@/features/trips/services/tripDocuments.service";
import {
  COMPLIANCE_TRIP_DOC_PICKER_TYPES,
  complianceTripDocFormatHint,
  validateComplianceTripDocumentFile,
} from "@/features/tripCompliance/utils/complianceTripDocumentFormat.util";
import {
  approveComplianceWithException,
  markTripComplianceVerified,
  setTripDocumentVerification,
} from "@/features/tripCompliance/services/tripComplianceWrite.service";
import { canApproveComplianceWithException, canMarkComplianceVerified } from "@/features/tripCompliance/services/tripComplianceRead.service";
import {
  COMPLIANCE_DRIVER_DOCUMENT_TYPES,
  COMPLIANCE_VEHICLE_DOCUMENT_TYPES,
  documentRequiresExpiry,
  type ComplianceChecklistGroup,
  type ComplianceDocumentRow,
  type ComplianceEntityDocument,
  type ComplianceTripSummary,
} from "@/features/tripCompliance/tripCompliance.types";
import {
  deriveComplianceDocumentRows,
  deriveEntityComplianceRows,
  groupComplianceReviewRows,
  labelForDocType,
  requirementScopeLabel,
  requiredRowNextAction,
  type ComplianceDocRow,
} from "@/features/tripCompliance/utils/complianceDocumentRows.util";
import {
  canModerateComplianceRow,
  complianceReviewDecisionActions,
} from "@/features/tripCompliance/utils/complianceReviewActions.util";
import { classifyPreviewFailure } from "@/features/tripCompliance/utils/compliancePreviewFailure.util";
import { buildComplianceDocumentActivity, type ComplianceActorDetail, type ComplianceDocumentActivityEntry } from "@/features/tripCompliance/utils/complianceDocumentActivity.util";
import { formatMarkComplianceVerifiedError } from "@/features/tripCompliance/utils/complianceMarkVerifiedError.util";
import { deriveComplianceQueueReadiness } from "@/features/tripCompliance/utils/complianceReadiness.util";
import { alertMessage } from "@/features/tripCompliance/utils/crossPlatformAlert.util";
import { HUB_MOBILE_TICKET_REF } from "@/components/hub/hubMobileTicketTokens";
import * as DocumentPicker from "expo-document-picker";
import { ChevronLeft, Eye, Upload, X } from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
  type ViewStyle,
} from "react-native";

const REF = HUB_MOBILE_TICKET_REF;
/** Side-by-side Pending | Verified columns when the sheet has room. */
const REVIEW_SPLIT_MIN_WIDTH = 720;

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
  } catch {
    return "—";
  }
}

const VAULT_VEHICLE_TYPES = new Set(["rc", "insurance", "fitness", "pollution"]);

export type ComplianceReviewScope = ComplianceChecklistGroup["key"];

const SCOPE_COPY: Record<
  ComplianceReviewScope,
  { title: string; section: string; hint: string }
> = {
  trip: {
    title: "Compliance Review",
    section: "LR, E-WAY BILL, INVOICE",
    hint: "Upload or select LR, e-way bill, invoice, or another trip document.",
  },
  vehicle: {
    title: "Vehicle documents",
    section: "RC, INSURANCE, FC, PERMIT, POLLUTION, TAX",
    hint: "Upload or select RC, insurance, FC, permit, pollution, or tax.",
  },
  driver: {
    title: "Driver documents",
    section: "LICENCE & AADHAAR",
    hint: "Upload or select driving licence or Aadhaar.",
  },
};

export type ComplianceDocumentReviewSheetProps = {
  visible: boolean;
  onClose: () => void;
  tripId: string;
  tripLabel: string;
  organizationId: string;
  actorId: string | null;
  documents: ComplianceDocumentRow[];
  canViewDocuments?: boolean;
  canVerify: boolean;
  canMarkVerified?: boolean;
  canManageFinance?: boolean;
  summary?: ComplianceTripSummary | null;
  initialSelectedKey?: string | null;
  onChanged: () => void;
  onPay?: () => void;
  scope?: ComplianceReviewScope;
  vehicleId?: string | null;
  driverId?: string | null;
  vehicleDocuments?: ComplianceEntityDocument[];
  driverDocuments?: ComplianceEntityDocument[];
  vehicleLabel?: string;
  driverLabel?: string;
};

export function ComplianceDocumentReviewSheet({
  visible,
  onClose,
  tripId,
  tripLabel,
  organizationId,
  actorId,
  documents,
  canViewDocuments = true,
  canVerify,
  canMarkVerified = false,
  canManageFinance = false,
  summary = null,
  initialSelectedKey = null,
  onChanged,
  onPay,
  scope = "trip",
  vehicleId = null,
  driverId = null,
  vehicleDocuments = [],
  driverDocuments = [],
  vehicleLabel = "Unassigned",
  driverLabel = "Unassigned",
}: ComplianceDocumentReviewSheetProps) {
  const { width: windowWidth } = useWindowDimensions();
  const splitColumns = windowWidth >= REVIEW_SPLIT_MIN_WIDTH;
  const rows = useMemo(() => {
    if (scope === "vehicle") return deriveEntityComplianceRows(COMPLIANCE_VEHICLE_DOCUMENT_TYPES, vehicleDocuments);
    if (scope === "driver") return deriveEntityComplianceRows(COMPLIANCE_DRIVER_DOCUMENT_TYPES, driverDocuments);
    return deriveComplianceDocumentRows(documents);
  }, [scope, documents, vehicleDocuments, driverDocuments]);
  const [selectedKey, setSelectedKey] = useState<string | null>(initialSelectedKey);
  const [busy, setBusy] = useState(false);
  const [busyRowKey, setBusyRowKey] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<ComplianceDocRow | null>(null);
  const [rejectVisible, setRejectVisible] = useState(false);
  const [uploadingMissing, setUploadingMissing] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [retryType, setRetryType] = useState<string | null>(null);
  const [expiryPrompt, setExpiryPrompt] = useState<{
    docType: string;
    resolve: (value: string | null) => void;
  } | null>(null);
  const [markingVerified, setMarkingVerified] = useState(false);
  const [markVerifiedError, setMarkVerifiedError] = useState<string | null>(null);
  const [exceptionPanelOpen, setExceptionPanelOpen] = useState(false);
  const [exceptionComment, setExceptionComment] = useState("");
  const [approvingException, setApprovingException] = useState(false);
  const [exceptionError, setExceptionError] = useState<string | null>(null);
  const [viewingKey, setViewingKey] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<{
    rowKey: string;
    title: string;
    fileName: string | null;
    url: string | null;
    mime: string | null;
    loading: boolean;
    placeProof: StopProofDocumentSummary | null;
    activity: ComplianceDocumentActivityEntry[];
    actorDetails: Record<string, ComplianceActorDetail>;
  } | null>(null);

  const grouped = useMemo(() => groupComplianceReviewRows(rows), [rows]);
  const pendingRows = useMemo(
    () => [...grouped.needsAction, ...grouped.missing, ...grouped.pending],
    [grouped],
  );
  const verifiedRows = grouped.verified;
  const tripVerifyCheck = useMemo(() => canMarkComplianceVerified(documents), [documents]);
  const exceptionCheck = useMemo(
    () => canApproveComplianceWithException({ documents, complianceVerifiedAt: summary?.complianceVerifiedAt ?? null }),
    [documents, summary],
  );
  const readiness = useMemo(() => (summary ? deriveComplianceQueueReadiness(summary) : null), [summary]);
  const selected: ComplianceDocRow | null = rows.find((r) => r.key === selectedKey) ?? null;
  const canModerateSelected =
    scope === "trip"
      ? Boolean(selected?.doc)
      : Boolean(selected?.entityDoc) && selected?.entityDoc?.source !== "driver-kyc";
  const copy = SCOPE_COPY[scope];
  const entityId = scope === "vehicle" ? vehicleId : scope === "driver" ? driverId : tripId;
  const entityAssigned = scope === "trip" || Boolean(entityId);
  const subtitle = scope === "vehicle" ? vehicleLabel : scope === "driver" ? driverLabel : tripLabel;
  const unassignedMessage =
    scope === "vehicle"
      ? "Assign a vehicle on this trip before uploading documents."
      : "Assign a driver on this trip before uploading documents.";

  useEffect(() => {
    if (visible) {
      setSelectedKey(initialSelectedKey);
    } else {
      setLightbox(null);
      setExceptionPanelOpen(false);
      setExceptionComment("");
      setExceptionError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, tripId, scope]);

  const promptExpiryDate = useCallback((docType: string) => {
    return new Promise<string | null>((resolve) => {
      setExpiryPrompt({ docType, resolve });
    });
  }, []);

  const stopProofForRow = useCallback((row: ComplianceDocRow | null) => {
    if (!row) return null;
    return describeStopProofDocument({
      fileName: row.doc?.file_name ?? row.entityDoc?.notes,
      mimeType: row.doc?.mime_type,
      documentNumber: row.doc?.document_number,
      storagePath: row.doc?.storage_path ?? row.entityDoc?.storage_path,
    });
  }, []);

  const openRowPreview = useCallback(
    async (row: ComplianceDocRow) => {
      const path = row.doc?.storage_path ?? row.entityDoc?.storage_path ?? null;
      const placeProof = stopProofForRow(row);
      const title = labelForDocType(row.type);
      const fileName = row.doc?.file_name ?? null;
      const activity = buildComplianceDocumentActivity(row);
      if (placeProof) {
        setLightbox({
          rowKey: row.key,
          title,
          fileName,
          url: null,
          mime: "text/plain",
          loading: false,
          placeProof,
          activity,
          actorDetails: {},
        });
        void resolveComplianceActorDetails(activity.map((entry) => entry.actorId), organizationId).then((actorDetails) => {
          setLightbox((current) => (current?.rowKey === row.key ? { ...current, actorDetails } : current));
        });
        return;
      }
      if (!path) {
        const failure = classifyPreviewFailure({ hasStoragePath: false });
        alertMessage("Document missing", failure.message);
        return;
      }
      if (!canViewDocuments) {
        alertMessage("Permission denied", "You don't have permission to preview this file.");
        return;
      }
      setViewingKey(row.key);
      setLightbox({
        rowKey: row.key,
        title,
        fileName,
        url: null,
        mime: null,
        loading: true,
        placeProof: null,
        activity,
        actorDetails: {},
      });
      try {
        const [url, actorDetails] = await Promise.all([
          signCompliancePreviewUrl({
            storagePath: path,
            source: scope === "trip" ? "trip" : row.entityDoc?.source,
            sourceEntityDocumentId: row.doc?.source_entity_document_id,
            organizationId,
            entityId: row.entityDoc?.entity_id ?? entityId,
            docType: row.type,
          }),
          resolveComplianceActorDetails(activity.map((entry) => entry.actorId), organizationId),
        ]);
        setLightbox({
          rowKey: row.key,
          title,
          fileName,
          url,
          mime: guessCompliancePreviewMime(path, row.doc?.mime_type),
          loading: false,
          placeProof: null,
          activity,
          actorDetails,
        });
        if (!url) {
          const failure = classifyPreviewFailure({ hasStoragePath: true, url: null, mime: guessCompliancePreviewMime(path, row.doc?.mime_type) });
          alertMessage("Couldn't open document", failure.message);
        }
      } catch (e) {
        setLightbox(null);
        const failure = classifyPreviewFailure({ hasStoragePath: true, error: e });
        alertMessage("Couldn't open document", failure.message);
      } finally {
        setViewingKey(null);
      }
    },
    [scope, stopProofForRow, canViewDocuments, organizationId, entityId],
  );

  const selectedStopProof = stopProofForRow(selected);

  const handleApprove = useCallback(
    async (row: ComplianceDocRow | null) => {
      if (!actorId || !row) return;
      setBusy(true);
      setBusyRowKey(row.key);
      try {
        let expiryDate = row.entityDoc?.expiry_date?.trim() ?? "";
        if (documentRequiresExpiry(row.type) && !expiryDate) {
          const entered = await promptExpiryDate(row.type);
          if (!entered) return;
          const trimmed = entered.trim();
          if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
            alertMessage("Invalid expiry date", "Use YYYY-MM-DD (for example 2027-03-15).");
            return;
          }
          expiryDate = trimmed;
        }

        if (scope === "trip") {
          if (!row.doc) return;
          const { error } = await setTripDocumentVerification({
            document: row.doc,
            organizationId,
            actorId,
            status: "verified",
          });
          if (error) {
            alertMessage("Couldn't approve document", error.message);
            return;
          }
        } else if (
          row.entityDoc?.source === "vehicle-vault" &&
          scope === "vehicle" &&
          vehicleId
        ) {
          // Vault docs are "verified" when on file (+ expiry for Insurance/FC).
          if (documentRequiresExpiry(row.type)) {
            const { error } = await updateVehicleDocumentExpiry(
              organizationId,
              vehicleId,
              row.type as VehicleComplianceDocType,
              expiryDate,
              null,
            );
            if (error) {
              // Cross-org vault write may fail — fall back to entity_documents expiry+verify when possible.
              const resolved = await resolveVehicleDocumentsWriteTarget(vehicleId, [organizationId]);
              if (!resolved) {
                alertMessage(
                  "Couldn't approve document",
                  error.message ||
                    "Could not save the expiry date on this vehicle. Re-upload with an expiry date, then Approve.",
                );
                return;
              }
              const retry = await updateVehicleDocumentExpiry(
                resolved.orgId,
                vehicleId,
                row.type as VehicleComplianceDocType,
                expiryDate,
                resolved.documents,
              );
              if (retry.error) {
                alertMessage("Couldn't approve document", retry.error.message);
                return;
              }
            }
          }
          // No separate verify step for vault — checklist treats on-file + expiry as verified.
        } else if (row.entityDoc?.source === "driver-kyc") {
          alertMessage(
            "Couldn't approve document",
            "Update this driver document from Trip Operations / Driver KYC, then refresh Compliance.",
          );
          return;
        } else {
          if (!row.entityDoc?.id) {
            alertMessage("Couldn't approve document", "Document record is missing. Re-upload, then try again.");
            return;
          }
          if (documentRequiresExpiry(row.type) && expiryDate) {
            const { error: expiryError } = await updateEntityDocumentExpiry(row.entityDoc.id, expiryDate);
            if (expiryError) {
              alertMessage("Couldn't approve document", expiryError.message);
              return;
            }
          }
          const { error } = await verifyDocument(row.entityDoc.id, actorId);
          if (error) {
            alertMessage("Couldn't approve document", error.message);
            return;
          }
        }
        onChanged();
      } finally {
        setBusy(false);
        setBusyRowKey(null);
      }
    },
    [actorId, organizationId, onChanged, scope, vehicleId, promptExpiryDate],
  );

  const handleRejectSubmit = useCallback(
    async (values: Record<string, string>) => {
      const row = rejectTarget ?? selected;
      if (!actorId || !row) return;
      setBusy(true);
      setBusyRowKey(row.key);
      if (scope === "trip") {
        if (!row.doc) {
          setBusy(false);
          setBusyRowKey(null);
          return;
        }
        const { error } = await setTripDocumentVerification({
          document: row.doc,
          organizationId,
          actorId,
          status: "rejected",
          rejectionReason: values.reason,
        });
        setBusy(false);
        setBusyRowKey(null);
        setRejectVisible(false);
        setRejectTarget(null);
        if (error) {
          alertMessage("Couldn't reject document", error.message);
          return;
        }
      } else {
        if (!row.entityDoc || row.entityDoc.source === "driver-kyc") {
          setBusy(false);
          setBusyRowKey(null);
          return;
        }
        if (row.entityDoc.source === "vehicle-vault") {
          setBusy(false);
          setBusyRowKey(null);
          setRejectVisible(false);
          setRejectTarget(null);
          alertMessage(
            "Couldn't decline document",
            "Replace this file from the vehicle vault, or upload a new copy in Compliance.",
          );
          return;
        }
        const { error } = await rejectDocument(row.entityDoc.id, values.reason);
        setBusy(false);
        setBusyRowKey(null);
        setRejectVisible(false);
        setRejectTarget(null);
        if (error) {
          alertMessage("Couldn't reject document", error.message);
          return;
        }
      }
      onChanged();
    },
    [rejectTarget, selected, actorId, organizationId, onChanged, scope],
  );

  const handleMarkVerified = useCallback(async () => {
    if (!actorId) {
      const message = "Your session is missing an actor id. Sign in again, then retry.";
      setMarkVerifiedError(message);
      alertMessage("Couldn't mark compliance verified", message);
      return;
    }
    if (!tripVerifyCheck.ok) return;
    setMarkVerifiedError(null);
    setMarkingVerified(true);
    const { error } = await markTripComplianceVerified({ tripId, actorId });
    setMarkingVerified(false);
    if (error) {
      const message = formatMarkComplianceVerifiedError(error.message);
      setMarkVerifiedError(message);
      alertMessage("Couldn't mark compliance verified", message);
      return;
    }
    onChanged();
  }, [actorId, tripVerifyCheck.ok, tripId, onChanged]);

  const handleApproveWithException = useCallback(async () => {
    if (!exceptionComment.trim()) return;
    setExceptionError(null);
    setApprovingException(true);
    const { error } = await approveComplianceWithException({ tripId, comment: exceptionComment });
    setApprovingException(false);
    if (error) {
      setExceptionError(error.message);
      alertMessage("Couldn't approve with exception", error.message);
      return;
    }
    setExceptionPanelOpen(false);
    setExceptionComment("");
    onChanged();
  }, [exceptionComment, tripId, onChanged]);

  const resolveExpiryForUpload = useCallback(
    async (type: string): Promise<string | null> => {
      const existing = rows.find((row) => row.type === type)?.entityDoc?.expiry_date?.trim() ?? "";
      if (!documentRequiresExpiry(type)) return existing;
      if (existing && /^\d{4}-\d{2}-\d{2}$/.test(existing)) return existing;
      const entered = await promptExpiryDate(type);
      if (!entered) return null;
      const trimmed = entered.trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
        alertMessage("Invalid expiry date", "Use YYYY-MM-DD (for example 2027-03-15).");
        return null;
      }
      return trimmed;
    },
    [promptExpiryDate, rows],
  );

  const handleAddMissing = useCallback(
    async (type: string) => {
      if (!actorId) return;
      if (uploadingMissing) return;
      if (!entityAssigned) {
        alertMessage("Nothing to upload", unassignedMessage);
        return;
      }
      setUploadError(null);
      setRetryType(type);
      setUploadingMissing(true);
      try {
        const res = await DocumentPicker.getDocumentAsync({
          type: [...COMPLIANCE_TRIP_DOC_PICKER_TYPES],
          copyToCacheDirectory: true,
        });
        if (res.canceled || !res.assets[0]) return;
        const asset = res.assets[0];
        const fileName = asset.name ?? `${type}.pdf`;
        if (typeof asset.size === "number") {
          const early = validateComplianceTripDocumentFile({
            fileName,
            mimeType: asset.mimeType,
            byteLength: asset.size,
          });
          if (!early.ok) throw new Error(early.reason);
        }
        const arrayBuffer = await fetch(asset.uri).then((r) => r.arrayBuffer());
        const format = validateComplianceTripDocumentFile({
          fileName,
          mimeType: asset.mimeType,
          byteLength: arrayBuffer.byteLength,
        });
        if (!format.ok) throw new Error(format.reason);

        let expiryDate: string | null = null;
        if (scope === "vehicle" || scope === "driver") {
          expiryDate = await resolveExpiryForUpload(type);
          if (documentRequiresExpiry(type) && !expiryDate) return;
        }

        if (scope === "trip") {
          const { error } = await uploadTripDocument(
            tripId,
            actorId,
            { arrayBuffer, fileName, mimeType: format.mimeType },
            type as TripDocumentType,
            undefined,
            { replaceExistingOfType: true },
          );
          if (error) throw error;
        } else if (scope === "vehicle" && VAULT_VEHICLE_TYPES.has(type) && vehicleId) {
          // Prefer the vehicle vault (vehicles.documents) when this org owns the
          // truck. Cross-org / RLS-blocked vault writes fall back to
          // entity_documents so Compliance can still collect mandatory RC/FC/etc.
          const owned = await getVehicleById(organizationId, vehicleId);
          if (owned.error) throw owned.error;

          let savedToVault = false;
          if (owned.vehicle) {
            const { error: vaultError } = await uploadAndSaveVehicleDocument(
              organizationId,
              vehicleId,
              type as VehicleComplianceDocType,
              {
                arrayBuffer,
                fileName,
                mimeType: format.mimeType,
              },
              expiryDate ?? "",
              owned.vehicle.documents ?? null,
            );
            savedToVault = !vaultError;
          } else {
            // Vehicle may live on a supplier-linked org — resolve owning org then retry vault write.
            const resolved = await resolveVehicleDocumentsWriteTarget(vehicleId, [organizationId]);
            if (resolved) {
              const { error: vaultError } = await uploadAndSaveVehicleDocument(
                resolved.orgId,
                vehicleId,
                type as VehicleComplianceDocType,
                {
                  arrayBuffer,
                  fileName,
                  mimeType: format.mimeType,
                },
                expiryDate ?? "",
                resolved.documents,
              );
              savedToVault = !vaultError;
            }
          }

          if (!savedToVault) {
            const existing = rows.find((row) => row.type === type)?.entityDoc;
            if (existing?.source === "driver-kyc") {
              throw new Error("Replace this file from Trip Operations Asset Vault.");
            }
            const upload = {
              orgId: organizationId,
              entityType: "vehicle" as const,
              entityId: vehicleId,
              docType: type,
              file: {
                arrayBuffer,
                mimeType: format.mimeType,
                fileName,
              },
              uploadedBy: actorId,
              expiryDate: expiryDate || null,
            };
            const canReplaceEntity =
              Boolean(existing?.id) && (existing?.source === "entity" || !existing?.source);
            const { error } = canReplaceEntity
              ? await replaceComplianceDocument({ existingDocId: existing!.id, upload })
              : await uploadComplianceDocument(upload);
            if (error) throw error;
          }
        } else {
          const existing = rows.find((row) => row.type === type)?.entityDoc;
          if (existing?.source === "vehicle-vault" || existing?.source === "driver-kyc") {
            throw new Error("Replace this file from Trip Operations Asset Vault.");
          }
          const upload = {
            orgId: organizationId,
            entityType: scope,
            entityId: entityId as string,
            docType: type,
            file: {
              arrayBuffer,
              mimeType: format.mimeType,
              fileName,
            },
            uploadedBy: actorId,
            expiryDate: expiryDate || null,
          };
          const { error } = existing?.id
            ? await replaceComplianceDocument({ existingDocId: existing.id, upload })
            : await uploadComplianceDocument(upload);
          if (error) throw error;
        }
        onChanged();
        setRetryType(null);
      } catch (e) {
        const message = (e as Error).message;
        if (isTripDocumentsStoragePathConflict({ message })) {
          onChanged();
          setRetryType(null);
          setUploadError(null);
          return;
        }
        setUploadError(message);
        alertMessage("Couldn't add document", message);
      } finally {
        setUploadingMissing(false);
      }
    },
    [
      tripId,
      actorId,
      onChanged,
      scope,
      entityAssigned,
      entityId,
      organizationId,
      rows,
      unassignedMessage,
      vehicleId,
      uploadingMissing,
      resolveExpiryForUpload,
    ],
  );

  const uploadedAt = selected?.doc?.uploaded_at ?? selected?.entityDoc?.created_at ?? null;
  const verifiedAt = selected?.doc?.verified_at ?? selected?.entityDoc?.verified_at ?? null;
  const rejectionReason = selected?.doc?.rejection_reason ?? selected?.entityDoc?.notes ?? null;
  const statusMeta = selected ? COMPLIANCE_STATUS_META[selected.status] : null;

  const renderDocRow = (row: ComplianceDocRow, index: number) => {
    const meta = COMPLIANCE_STATUS_META[row.status];
    const decisions = complianceReviewDecisionActions(row);
    const canModerate = canVerify && canModerateComplianceRow(row, scope);
    const rowBusy = busy && busyRowKey === row.key;
    const uploadLabel =
      uploadingMissing && retryType === row.type
        ? "Uploading…"
        : uploadError && retryType === row.type
          ? "Retry"
          : row.status === "missing"
            ? "Upload"
            : "Replace";
    return (
      <View key={row.key} style={[styles.docBlock, index > 0 && styles.docBlockBorder]}>
        <View style={styles.docRow}>
          <TouchableOpacity
            style={styles.docRowMain}
            disabled={row.status === "missing"}
            onPress={() => setSelectedKey(row.key)}
          >
            <View style={styles.docCopy}>
              <View style={styles.docTitleRow}>
                <Text style={styles.docRowLabel} numberOfLines={1}>
                  {labelForDocType(row.type)}
                </Text>
                <Text
                  style={[
                    styles.scopeTag,
                    row.required ? styles.scopeTagRequired : styles.scopeTagOptional,
                  ]}
                >
                  {requirementScopeLabel(row.required)}
                </Text>
              </View>
              <Text style={styles.docMetaLine} numberOfLines={1}>
                {row.doc?.uploaded_at
                  ? `Uploaded ${formatDate(row.doc.uploaded_at)}`
                  : row.entityDoc?.created_at
                    ? `Uploaded ${formatDate(row.entityDoc.created_at)}`
                    : "Not uploaded"}
                {row.doc?.file_name
                  ? ` · ${row.doc.file_name}`
                  : row.doc?.uploaded_by
                    ? ` · ${row.doc.uploaded_by.slice(0, 8)}`
                    : ""}
              </Text>
              {row.status === "rejected" && (row.doc?.rejection_reason || row.entityDoc?.notes) ? (
                <Text style={styles.rejectReasonText} numberOfLines={2}>
                  Rejected — {row.doc?.rejection_reason || row.entityDoc?.notes}
                </Text>
              ) : (
                <Text style={styles.docMetaLine} numberOfLines={2}>
                  {requiredRowNextAction(row)}
                </Text>
              )}
            </View>
          </TouchableOpacity>
          <View style={styles.docActions}>
            <ComplianceStatusChip status={row.status} label={meta.label} compact />
            <View style={styles.docActionBtns}>
              <TouchableOpacity
                onPress={() => void openRowPreview(row)}
                disabled={viewingKey != null || !canViewDocuments}
                style={styles.eyeBtn}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel={`View ${labelForDocType(row.type)}`}
              >
                {viewingKey === row.key ? (
                  <ActivityIndicator size="small" color={Theme.textMuted} />
                ) : (
                  <Eye
                    size={15}
                    color={
                      row.doc?.storage_path || row.entityDoc?.storage_path
                        ? Theme.textPrimary
                        : Theme.textMuted
                    }
                    strokeWidth={2.2}
                  />
                )}
              </TouchableOpacity>
              {canVerify && entityAssigned ? (
                <TouchableOpacity
                  disabled={uploadingMissing}
                  onPress={() => handleAddMissing(row.type)}
                  style={styles.addBtn}
                  accessibilityRole="button"
                  accessibilityLabel={`${uploadLabel} ${labelForDocType(row.type)}`}
                >
                  <Upload size={12} color={Theme.buttonPrimaryText} strokeWidth={2.4} />
                  <Text style={styles.addBtnText}>{uploadLabel}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        </View>
        {canModerate && (decisions.canApprove || decisions.canDecline) ? (
          <View style={styles.decisionRow}>
            {rowBusy ? (
              <ActivityIndicator size="small" color={Theme.textMuted} />
            ) : (
              <>
                {decisions.canApprove ? (
                  <TouchableOpacity
                    style={styles.decisionApproveBtn}
                    disabled={busy}
                    onPress={() => void handleApprove(row)}
                    accessibilityRole="button"
                    accessibilityLabel={`Approve ${labelForDocType(row.type)}`}
                  >
                    <Text style={styles.approveBtnText}>Approve</Text>
                  </TouchableOpacity>
                ) : null}
                {decisions.canDecline ? (
                  <TouchableOpacity
                    style={styles.decisionDeclineBtn}
                    disabled={busy}
                    onPress={() => {
                      setRejectTarget(row);
                      setRejectVisible(true);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Decline ${labelForDocType(row.type)}`}
                  >
                    <Text style={styles.rejectBtnText}>Decline</Text>
                  </TouchableOpacity>
                ) : null}
              </>
            )}
          </View>
        ) : null}
      </View>
    );
  };

  const renderColumn = (
    title: string,
    columnRows: ComplianceDocRow[],
    tone: "pending" | "verified",
  ) => (
    <View style={[styles.boardColumn, tone === "verified" ? styles.boardColumnVerified : styles.boardColumnPending]}>
      <View style={styles.boardColumnHeader}>
        <Text
          style={[
            styles.boardColumnTitle,
            tone === "verified" ? styles.boardColumnTitleVerified : styles.boardColumnTitlePending,
          ]}
        >
          {title}
        </Text>
        <View
          style={[
            styles.boardColumnBadge,
            tone === "verified" ? styles.boardColumnBadgeVerified : styles.boardColumnBadgePending,
          ]}
        >
          <Text
            style={[
              styles.boardColumnBadgeText,
              tone === "verified" ? styles.boardColumnBadgeTextVerified : styles.boardColumnBadgeTextPending,
            ]}
          >
            {columnRows.length}
          </Text>
        </View>
      </View>
      {columnRows.length === 0 ? (
        <Text style={styles.boardEmpty}>
          {tone === "verified" ? "No verified documents yet." : "Nothing pending."}
        </Text>
      ) : (
        <View style={styles.groupCard}>{columnRows.map((row, index) => renderDocRow(row, index))}</View>
      )}
    </View>
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.sheet, splitColumns && styles.sheetWide]}>
          <View style={styles.header}>
            {selected ? (
              <TouchableOpacity style={styles.backBtn} onPress={() => setSelectedKey(null)}>
                <ChevronLeft size={16} color={Theme.textPrimary} strokeWidth={2.2} />
                <Text style={styles.backBtnText}>Back to documents</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.headerCopy}>
                <Text style={styles.headerTitle}>{copy.title}</Text>
                <Text style={styles.headerSubtitle} numberOfLines={1}>
                  {subtitle}
                </Text>
              </View>
            )}
            <TouchableOpacity
              onPress={onClose}
              accessibilityLabel="Close"
              style={styles.closeBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <X size={18} color={Theme.textMuted} strokeWidth={2} />
            </TouchableOpacity>
          </View>

          {!selected ? (
            <ScrollView
              style={styles.listScroll}
              contentContainerStyle={styles.listContent}
              keyboardShouldPersistTaps="handled"
            >
              {!entityAssigned ? <Text style={styles.unassigned}>{unassignedMessage}</Text> : null}
              <View style={styles.summaryBoard}>
                <View style={[styles.summaryTile, styles.summaryTilePending]}>
                  <Text style={[styles.summaryTileLabel, styles.summaryTileLabelPending]}>Pending</Text>
                  <Text style={[styles.summaryTileValue, styles.summaryTileValuePending]}>
                    {scope === "trip" && readiness
                      ? readiness.requiredDocs.pending +
                        readiness.requiredDocs.missing +
                        readiness.requiredDocs.rejected
                      : pendingRows.length}
                  </Text>
                  <Text style={styles.summaryTileContent} numberOfLines={2}>
                    {scope === "trip" && readiness
                      ? [
                          readiness.requiredDocs.missing > 0
                            ? `${readiness.requiredDocs.missing} missing`
                            : null,
                          readiness.requiredDocs.pending > 0
                            ? `${readiness.requiredDocs.pending} in review`
                            : null,
                          readiness.requiredDocs.rejected > 0
                            ? `${readiness.requiredDocs.rejected} rejected`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" · ") || "None pending"
                      : pendingRows.length === 0
                        ? "None pending"
                        : `${pendingRows.length} document${pendingRows.length === 1 ? "" : "s"}`}
                  </Text>
                </View>
                <View style={[styles.summaryTile, styles.summaryTileVerified]}>
                  <Text style={[styles.summaryTileLabel, styles.summaryTileLabelVerified]}>Verified</Text>
                  <Text
                    style={[
                      styles.summaryTileValue,
                      scope === "trip" &&
                        readiness &&
                        readiness.requiredDocs.verified === readiness.requiredDocs.total &&
                        readiness.requiredDocs.total > 0 &&
                        styles.summaryTileValueOk,
                    ]}
                  >
                    {scope === "trip" && readiness
                      ? `${readiness.requiredDocs.verified}/${readiness.requiredDocs.total}`
                      : verifiedRows.length}
                  </Text>
                  <Text style={styles.summaryTileContent} numberOfLines={2}>
                    {scope === "trip" && readiness
                      ? readiness.requiredDocs.verified === readiness.requiredDocs.total &&
                        readiness.requiredDocs.total > 0
                        ? "All required docs verified"
                        : "Required trip documents"
                      : verifiedRows.length === 0
                        ? "None verified yet"
                        : `${verifiedRows.length} document${verifiedRows.length === 1 ? "" : "s"}`}
                  </Text>
                </View>
              </View>
              {scope === "trip" && readiness ? (
                <View style={styles.requiredSummary}>
                  <Text style={styles.nextActionLine}>Next: {readiness.nextAction}</Text>
                  <View
                    style={[
                      styles.paymentBanner,
                      readiness.paymentReady ? styles.paymentBannerReady : styles.paymentBannerBlocked,
                    ]}
                  >
                    <Text
                      style={[
                        styles.paymentBannerText,
                        readiness.paymentReady
                          ? styles.paymentBannerTextReady
                          : styles.paymentBannerTextBlocked,
                      ]}
                    >
                      {readiness.paymentReady
                        ? "Payment ready"
                        : `Payment blocked — ${readiness.blockerLines[0] ?? "not ready"}`}
                    </Text>
                  </View>
                </View>
              ) : null}
              <Text style={styles.hint}>{complianceTripDocFormatHint()}</Text>
              {uploadingMissing ? <Text style={styles.inlineStatus}>Uploading…</Text> : null}
              {uploadError ? (
                <Text style={styles.rejectReasonText}>
                  Upload failed: {uploadError}
                  {retryType && canVerify ? " Use Retry on that row." : ""}
                </Text>
              ) : null}

              <View style={[styles.boardRow, !splitColumns && styles.boardRowStack]}>
                {renderColumn("Pending", pendingRows, "pending")}
                {renderColumn("Verified", verifiedRows, "verified")}
              </View>
              {scope === "trip" && canMarkVerified && summary?.complianceDecision === "approved_with_exception" ? (
                <View style={styles.requiredSummary}>
                  <Text style={styles.sectionLabel}>APPROVED WITH EXCEPTION</Text>
                  <Text style={styles.docMetaLine}>
                    Outstanding:{" "}
                    {[
                      ...(summary.complianceOutstandingSummary?.missing ?? []),
                      ...(summary.complianceOutstandingSummary?.pending_verification ?? []),
                      ...(summary.complianceOutstandingSummary?.rejected ?? []),
                    ]
                      .map((type) => labelForDocType(type))
                      .join(", ") || "none"}
                  </Text>
                  <Text style={styles.docMetaLine}>Comment: {summary.complianceExceptionReason ?? "—"}</Text>
                  <Text style={styles.docMetaLine}>
                    Approved by: {summary.complianceVerifiedBy ? summary.complianceVerifiedBy.slice(0, 8) : "—"}
                  </Text>
                  <Text style={styles.docMetaLine}>Approved at: {formatDate(summary.complianceVerifiedAt)}</Text>
                </View>
              ) : null}
              {scope === "trip" &&
              canMarkVerified &&
              summary?.complianceVerifiedAt &&
              summary?.complianceDecision !== "approved_with_exception" ? (
                <View style={styles.verifiedBanner}>
                  <Text style={styles.verifiedBannerText}>Compliance Verified ✓</Text>
                </View>
              ) : null}
              {scope === "trip" && canMarkVerified && !summary?.complianceVerifiedAt ? (
                <View style={styles.footerActionsBlock}>
                  {!tripVerifyCheck.ok ? (
                    <Text style={styles.rejectReasonText}>
                      {[
                        readiness?.requiredDocs.missingLabels.length
                          ? `Missing: ${readiness.requiredDocs.missingLabels.join(", ")}`
                          : null,
                        readiness?.requiredDocs.pendingLabels.length
                          ? `Pending: ${readiness.requiredDocs.pendingLabels.join(", ")}`
                          : null,
                        readiness?.requiredDocs.rejectedLabels.length
                          ? `Rejected: ${readiness.requiredDocs.rejectedLabels.join(", ")}`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </Text>
                  ) : null}
                  {markVerifiedError ? (
                    <Text style={styles.rejectReasonText}>{markVerifiedError}</Text>
                  ) : null}
                  {tripVerifyCheck.ok ? (
                    <TouchableOpacity
                      style={styles.primaryCta}
                      disabled={markingVerified}
                      onPress={() => void handleMarkVerified()}
                    >
                      <Text style={styles.primaryCtaText}>
                        {markingVerified ? "Marking verified…" : "Mark Compliance Verified"}
                      </Text>
                    </TouchableOpacity>
                  ) : !exceptionPanelOpen ? (
                    <TouchableOpacity
                      style={[styles.primaryCta, !exceptionCheck.ok && styles.primaryCtaDisabled]}
                      disabled={!exceptionCheck.ok}
                      onPress={() => setExceptionPanelOpen(true)}
                    >
                      <Text style={styles.primaryCtaText}>Approve with Exception</Text>
                    </TouchableOpacity>
                  ) : (
                    <View style={styles.exceptionPanel}>
                      <Text style={styles.sectionLabel}>COMPLIANCE EXCEPTION</Text>
                      {exceptionCheck.outstanding.missing.length ? (
                        <Text style={styles.docMetaLine}>
                          Missing: {exceptionCheck.outstanding.missing.map((t) => labelForDocType(t)).join(", ")}
                        </Text>
                      ) : null}
                      {exceptionCheck.outstanding.pending_verification.length ? (
                        <Text style={styles.docMetaLine}>
                          Pending Verification:{" "}
                          {exceptionCheck.outstanding.pending_verification.map((t) => labelForDocType(t)).join(", ")}
                        </Text>
                      ) : null}
                      {exceptionCheck.outstanding.rejected.length ? (
                        <Text style={styles.docMetaLine}>
                          Rejected: {exceptionCheck.outstanding.rejected.map((t) => labelForDocType(t)).join(", ")}
                        </Text>
                      ) : null}
                      <Text style={styles.exceptionHint}>
                        This approves the trip for advance processing despite the outstanding documents above.
                      </Text>
                      <Text style={styles.label}>Reason / Comment (required)</Text>
                      <TextInput
                        style={styles.exceptionCommentInput}
                        placeholder="Why is this being approved with an exception?"
                        value={exceptionComment}
                        onChangeText={setExceptionComment}
                        multiline
                        numberOfLines={3}
                      />
                      {exceptionError ? <Text style={styles.rejectReasonText}>{exceptionError}</Text> : null}
                      <View style={styles.actionsRow}>
                        <TouchableOpacity
                          style={styles.rejectBtn}
                          disabled={approvingException}
                          onPress={() => {
                            setExceptionPanelOpen(false);
                            setExceptionComment("");
                            setExceptionError(null);
                          }}
                        >
                          <Text style={styles.rejectBtnText}>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.approveBtn, !exceptionComment.trim() && styles.approveBtnDisabled]}
                          disabled={!exceptionComment.trim() || approvingException}
                          onPress={() => void handleApproveWithException()}
                        >
                          <Text style={styles.approveBtnText}>
                            {approvingException ? "Approving…" : "Approve with Exception"}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}
                </View>
              ) : null}
              {scope === "trip" && canManageFinance && readiness?.paymentReady && onPay ? (
                <TouchableOpacity style={styles.primaryCta} onPress={onPay}>
                  <Text style={styles.primaryCtaText}>
                    Pay {readiness.readyCategory === "compliance_balance" ? "balance" : "advance"}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </ScrollView>
          ) : (
            <ScrollView style={styles.previewScroll}>
              <View style={styles.previewBox}>
                <Text style={styles.previewBoxLabel}>DOCUMENT PREVIEW</Text>
                {selectedStopProof ? (
                  <View style={styles.placeProofBox}>
                    <Text style={styles.placeProofLabel}>{selectedStopProof.label}</Text>
                    <Text style={styles.placeProofHint}>
                      {selectedStopProof.note ??
                        (selectedStopProof.kind === "pickup"
                          ? "Pickup place was recorded without a photo."
                          : "Delivery place was recorded without a photo.")}
                    </Text>
                  </View>
                ) : (
                  <TouchableOpacity
                    onPress={() => selected && void openRowPreview(selected)}
                    style={styles.openDocBtn}
                    disabled={viewingKey != null}
                  >
                    <Text style={styles.openDocBtnText}>
                      {viewingKey === selected?.key ? "Opening…" : "Preview"}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
              <Text style={styles.docTitle}>{labelForDocType(selected.type)}</Text>
              <Text style={styles.docMeta}>
                {uploadedAt ? `Uploaded ${formatDate(uploadedAt)}` : "Not uploaded"}
                {selected.doc?.uploaded_by ? ` · ${selected.doc.uploaded_by.slice(0, 8)}` : ""}
                {" · "}
                {statusMeta?.label ?? selected.status}
                {selected.status === "verified" && verifiedAt ? ` ${formatDate(verifiedAt)}` : ""}
              </Text>
              {selected.status === "rejected" && rejectionReason ? (
                <Text style={styles.rejectReasonText}>Reason: {rejectionReason}</Text>
              ) : null}

              {canVerify && canModerateSelected ? (
                <View style={styles.actionsRow}>
                  {busy ? (
                    <ActivityIndicator size="small" color={Theme.textMuted} />
                  ) : (
                    <>
                      {selected.status !== "verified" ? (
                        <TouchableOpacity style={styles.approveBtn} onPress={() => void handleApprove(selected)} disabled={busy}>
                          <Text style={styles.approveBtnText}>{busy ? "Approving…" : "Approve"}</Text>
                        </TouchableOpacity>
                      ) : null}
                      {selected.status !== "rejected" && selected.entityDoc?.source !== "vehicle-vault" ? (
                        <TouchableOpacity
                          style={styles.rejectBtn}
                          onPress={() => {
                            setRejectTarget(selected);
                            setRejectVisible(true);
                          }}
                        >
                          <Text style={styles.rejectBtnText}>Decline</Text>
                        </TouchableOpacity>
                      ) : null}
                    </>
                  )}
                </View>
              ) : null}
            </ScrollView>
          )}
        </View>
      </View>

      <ComplianceInputModal
        visible={rejectVisible}
        title="Decline document"
        fields={[{ key: "reason", label: "Note — why is this document being declined?", placeholder: "Enter reason", required: true }]}
        confirmLabel="Decline with note"
        onCancel={() => {
          setRejectVisible(false);
          setRejectTarget(null);
        }}
        onSubmit={handleRejectSubmit}
      />
      <ComplianceInputModal
        visible={expiryPrompt != null}
        title={`Expiry date — ${expiryPrompt ? labelForDocType(expiryPrompt.docType) : "Document"}`}
        fields={[
          {
            key: "expiry",
            label: "Expiry date (YYYY-MM-DD)",
            placeholder: "2027-03-15",
            required: true,
          },
        ]}
        confirmLabel="Continue"
        onCancel={() => {
          expiryPrompt?.resolve(null);
          setExpiryPrompt(null);
        }}
        onSubmit={(values) => {
          expiryPrompt?.resolve(values.expiry ?? null);
          setExpiryPrompt(null);
        }}
      />
      <ComplianceDocumentPreviewModal
        visible={lightbox != null}
        title={lightbox?.title ?? ""}
        fileName={lightbox?.fileName}
        url={lightbox?.url ?? null}
        mime={lightbox?.mime ?? null}
        loading={Boolean(lightbox?.loading)}
        placeProof={lightbox?.placeProof ?? null}
        activity={lightbox?.activity}
        actorDetails={lightbox?.actorDetails}
        onClose={() => setLightbox(null)}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  sheet: {
    width: "100%",
    maxWidth: 560,
    maxHeight: "86%",
    backgroundColor: Theme.cardWhite,
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Theme.borderLight,
    ...Platform.select({
      web: {
        boxShadow: "0 12px 40px rgba(15, 23, 42, 0.18)",
      } as ViewStyle,
      default: {
        shadowColor: "#0f172a",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.16,
        shadowRadius: 20,
        elevation: 8,
      },
    }),
  },
  /** Desktop: wider for two-column summary + board, not full-screen. */
  sheetWide: {
    maxWidth: 880,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: REF.hairline,
  },
  headerCopy: { flex: 1, minWidth: 0, gap: 2 },
  headerTitle: { fontSize: 16, fontWeight: "700", color: REF.ink, letterSpacing: -0.2 },
  headerSubtitle: { fontSize: 12, color: REF.muted, fontWeight: "500" },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.compliancePageBg,
  },
  backBtn: { flexDirection: "row", alignItems: "center", gap: 4, flex: 1, minWidth: 0 },
  backBtnText: { fontSize: 13, fontWeight: "600", color: Theme.textPrimary },
  listScroll: { flexGrow: 1 },
  listContent: { padding: 16, gap: 12, paddingBottom: 20 },
  summaryBoard: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 10,
  },
  summaryTile: {
    flex: 1,
    minWidth: 0,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 4,
    minHeight: 96,
    justifyContent: "center",
  },
  summaryTilePending: {
    backgroundColor: Theme.complianceStageDocsBg,
    borderColor: Theme.complianceGroupDangerDot,
  },
  summaryTileVerified: {
    backgroundColor: Theme.complianceStageSuccessBg,
    borderColor: Theme.complianceGroupSuccessDot,
  },
  summaryTileLabel: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  summaryTileLabelPending: { color: Theme.complianceStageDocsFg },
  summaryTileLabelVerified: { color: Theme.complianceStageSuccessFg },
  summaryTileValue: {
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: -0.6,
    lineHeight: 32,
    color: REF.ink,
  },
  summaryTileValuePending: { color: Theme.complianceStageDocsFg },
  summaryTileValueOk: { color: Theme.complianceStageSuccessFg },
  summaryTileContent: {
    fontSize: 12,
    fontWeight: "500",
    color: Theme.textMuted,
    lineHeight: 16,
  },
  requiredSummary: {
    gap: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: Theme.compliancePageBg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: REF.hairline,
  },
  nextActionLine: { fontSize: 12, fontWeight: "600", color: Theme.textPrimary, lineHeight: 16 },
  paymentBanner: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  paymentBannerBlocked: { backgroundColor: Theme.complianceStageDocsBg },
  paymentBannerReady: { backgroundColor: Theme.complianceStageSuccessBg },
  paymentBannerText: { fontSize: 12, fontWeight: "700", lineHeight: 16 },
  paymentBannerTextBlocked: { color: Theme.complianceStageDocsFg },
  paymentBannerTextReady: { color: Theme.complianceStageSuccessFg },
  unassigned: { fontSize: 12, color: Theme.textMuted, lineHeight: 16 },
  sectionLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: REF.muted,
    letterSpacing: 0.5,
  },
  boardRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  boardRowStack: {
    flexDirection: "column",
  },
  boardColumn: {
    flex: 1,
    minWidth: 0,
    gap: 8,
  },
  boardColumnPending: {},
  boardColumnVerified: {},
  boardColumnHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingHorizontal: 2,
  },
  boardColumnTitle: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  boardColumnTitlePending: { color: Theme.complianceStageDocsFg },
  boardColumnTitleVerified: { color: Theme.complianceStageSuccessFg },
  boardColumnBadge: {
    minWidth: 24,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    alignItems: "center",
  },
  boardColumnBadgePending: { backgroundColor: Theme.complianceStageDocsBg },
  boardColumnBadgeVerified: { backgroundColor: Theme.complianceStageSuccessBg },
  boardColumnBadgeText: { fontSize: 11, fontWeight: "800" },
  boardColumnBadgeTextPending: { color: Theme.complianceStageDocsFg },
  boardColumnBadgeTextVerified: { color: Theme.complianceStageSuccessFg },
  boardEmpty: {
    fontSize: 12,
    color: REF.muted,
    paddingVertical: 16,
    paddingHorizontal: 12,
    textAlign: "center",
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: REF.hairline,
    backgroundColor: Theme.compliancePageBg,
  },
  groupCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
    overflow: "hidden",
  },
  label: { fontSize: 12, fontWeight: "600", color: Theme.textMuted, marginTop: 4 },
  exceptionPanel: {
    gap: 6,
    marginTop: 4,
    padding: 12,
    borderRadius: 12,
    backgroundColor: Theme.compliancePageBg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: REF.hairline,
  },
  exceptionHint: { fontSize: 12, color: Theme.textMuted, lineHeight: 16 },
  exceptionCommentInput: {
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    color: Theme.textPrimary,
    minHeight: 72,
    textAlignVertical: "top",
    backgroundColor: Theme.cardWhite,
  },
  docBlock: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 8,
  },
  docBlockBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: REF.hairline,
  },
  docRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  docRowMain: { flex: 1, minWidth: 0 },
  docCopy: { flex: 1, minWidth: 0, gap: 3 },
  docTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  docRowLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: REF.ink,
    flexShrink: 1,
    minWidth: 0,
  },
  scopeTag: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.3,
    textTransform: "uppercase",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    overflow: "hidden",
  },
  scopeTagRequired: {
    color: Theme.complianceStageDocsFg,
    backgroundColor: Theme.complianceStageDocsBg,
  },
  scopeTagOptional: {
    color: REF.muted,
    backgroundColor: Theme.compliancePageBg,
  },
  docActions: {
    flexShrink: 0,
    alignItems: "flex-end",
    gap: 8,
    maxWidth: "46%",
  },
  docActionBtns: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  decisionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    alignItems: "center",
  },
  decisionApproveBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    minHeight: 36,
    borderRadius: 8,
    backgroundColor: Theme.success,
    alignItems: "center",
    justifyContent: "center",
  },
  decisionDeclineBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    minHeight: 36,
    borderRadius: 8,
    backgroundColor: Theme.complianceDocNeedBg,
    alignItems: "center",
    justifyContent: "center",
  },
  eyeBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.compliancePageBg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: REF.hairline,
  },
  addBtn: {
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: Theme.buttonPrimaryRadius,
    backgroundColor: Theme.buttonPrimary,
    borderWidth: Theme.buttonPrimaryBorderWidth,
    borderColor: Theme.buttonPrimaryBorder,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  addBtnText: { fontSize: 12, fontWeight: "700", color: Theme.buttonPrimaryText },
  hint: {
    fontSize: 11,
    color: REF.muted,
    lineHeight: 15,
    textAlign: "left",
  },
  inlineStatus: { fontSize: 12, color: Theme.textMuted, fontWeight: "600" },
  footerActionsBlock: { gap: 10, marginTop: 4 },
  verifiedBanner: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: Theme.complianceVerifiedPillBg,
    borderWidth: 1,
    borderColor: Theme.complianceVerifiedPillBorder,
  },
  verifiedBannerText: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.complianceVerifiedPillFg,
    textAlign: "center",
  },
  primaryCta: {
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: Theme.buttonPrimaryRadius,
    backgroundColor: Theme.buttonPrimary,
    borderWidth: Theme.buttonPrimaryBorderWidth,
    borderColor: Theme.buttonPrimaryBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryCtaDisabled: { opacity: 0.45 },
  primaryCtaText: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.buttonPrimaryText,
  },
  previewScroll: { padding: 16 },
  previewBox: {
    backgroundColor: Theme.compliancePageBg,
    borderRadius: 12,
    padding: 24,
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: REF.hairline,
  },
  previewBoxLabel: { fontSize: 10, fontWeight: "700", color: Theme.textMuted, letterSpacing: 0.5 },
  placeProofBox: { width: "100%", alignItems: "center", gap: 6, paddingVertical: 12 },
  placeProofLabel: { fontSize: 16, fontWeight: "700", color: Theme.textPrimary, textAlign: "center" },
  placeProofHint: { fontSize: 12, color: Theme.textMuted, textAlign: "center", lineHeight: 16 },
  openDocBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    minHeight: 40,
    borderRadius: Theme.buttonPrimaryRadius,
    backgroundColor: Theme.buttonPrimary,
    borderWidth: Theme.buttonPrimaryBorderWidth,
    borderColor: Theme.buttonPrimaryBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  openDocBtnText: { fontSize: 12, fontWeight: "700", color: Theme.buttonPrimaryText },
  docTitle: { fontSize: 15, fontWeight: "700", color: Theme.textPrimary },
  docMeta: { fontSize: 12, color: Theme.textMuted, marginTop: 2 },
  rejectReasonText: { fontSize: 12, color: Theme.teslaRed, lineHeight: 16 },
  docMetaLine: { fontSize: 11, color: Theme.textMuted, lineHeight: 15 },
  actionsRow: { flexDirection: "row", gap: 10, marginTop: 8 },
  approveBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: Theme.success,
    alignItems: "center",
  },
  approveBtnDisabled: { opacity: 0.45 },
  approveBtnText: { fontSize: 13, fontWeight: "700", color: Theme.buttonDarkText },
  rejectBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: Theme.complianceDocNeedBg,
    alignItems: "center",
  },
  rejectBtnText: { fontSize: 13, fontWeight: "700", color: Theme.teslaRed },
});
