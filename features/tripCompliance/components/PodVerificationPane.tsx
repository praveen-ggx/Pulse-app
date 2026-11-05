import { PartyAvatar } from "@/components/PartyAvatar";
import { AdjustableSplitLayout } from "@/components/layout/AdjustableSplitLayout";
import {
  RegistryCardActions,
  RegistryGhostButton,
  RegistryPrimaryButton,
} from "@/components/AlertRegistryCardActions";
import { ThemedConfirmModal } from "@/components/ThemedConfirmModal";
import Theme from "@/constants/Theme";
import { ComplianceActivityLogButton } from "@/features/tripCompliance/components/ComplianceTripActivityLog";
import { PodCopyWatermark } from "@/features/tripCompliance/components/PodCopyWatermark";
import { TripVaultFilePreview } from "@/features/trips/components/trip-detail/TripVaultFilePreview";
import {
  EMPTY_CHARGE_LINES,
  EMPTY_POD_EXCEPTION_LOG,
  type PodChargeLines,
  type PodExceptionLogDraft,
} from "@/features/debit-control/utils/debitControlPod.model";
import {
  usePodClientValidationQuery,
  useReleasePodSettlementMutation,
  useReportPodNotFoundMutation,
  useRequestPodRevalidationMutation,
  useSavePodValidationDraftMutation,
  useValidatePodsMutation,
} from "@/features/debit-control/hooks/useDebitControlPod";
import {
  chargeDraftFromLines,
  chargeLinesFromBase,
  formatInr,
} from "@/features/debit-control/utils/podChargeTotals.util";
import {
  editPodExceptionCnDn,
  revokePodExceptionCnDn,
  savePodProvisionNote,
} from "@/features/debit-control/services/podExceptionCnDn.service";
import { ProvisionAdjustmentModal } from "@/features/trips/components/trip-detail/adjustment/ProvisionAdjustmentModal";
import { ProvisionNotePdfModal } from "@/features/trips/components/trip-detail/adjustment/ProvisionNotePdfModal";
import { TripFinanceAdjustmentsPanel } from "@/features/trips/components/trip-detail/adjustment/TripFinanceAdjustmentsPanel";
import { NativeHtmlWebView } from "@/components/NativeHtmlWebView";
import {
  buildProvisionNotePreviewHtml,
  type ProvisionNotePdfContext,
} from "@/features/trips/components/trip-detail/adjustment/tripProvisionNotePdf.util";
import {
  passThroughPresetFromRecommendation,
  type ClientPassThroughRecommendation,
} from "@/features/trips/components/trip-detail/adjustment/tripAdjustmentPassThrough.util";
import { provisionLineMetaLabel } from "@/features/trips/components/trip-detail/tripDetail.helpers";
import { getTripDisplayNumber } from "@/features/trips/services/trips.service";
import {
  createdPodCnDnDrafts,
  isPodCostParty,
  pendingPodCnDnAlertMessage,
  pendingPodCnDnDrafts,
  podCnDnAdjustmentFor,
  podCnDnProvisionPreset,
  podExceptionCnDnDrafts,
  type PodCnDnDraft,
} from "@/features/debit-control/utils/podExceptionCnDn.util";
import { podDebitIdentified } from "@/features/debit-control/utils/podExceptionDebit.util";
import {
  alignPodSettlementLedger,
  podSettlementPayable,
  signedPodNoteAmount,
} from "@/features/debit-control/utils/podSettlementSummary.util";
import { isAssetExecutionTrip } from "@/features/trips/domain/tripExecutionModel";
import {
  adjustedCost,
  adjustedRevenue,
  getTripAdjustments,
  isAdjustmentVoided,
  updateTripAdjustment,
  type TripAdjustment,
  type TripAdjustmentImpact,
  type TripAdjustmentType,
} from "@/features/trips/services/tripAdjustments";
import { queryKeys } from "@/lib/queryKeys";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { VaultChooserNotifyRow } from "@/features/trips/components/trip-detail/VaultChooserNotifyRow";
import { HardCopyPodDateField } from "@/features/trips/components/trip-detail/HardCopyPodDateField";
import { fetchComplianceAdvanceFinanceBreakdown } from "@/features/tripCompliance/services/complianceAdvanceFinanceBreakdown.service";
import { fetchTripCostLedgerPaid } from "@/features/tripCompliance/services/tripComplianceRead.service";
import { invalidateCompliancePreviewCache, signCompliancePreviewUrl } from "@/features/tripCompliance/services/complianceDocumentView.service";
import { pickComplianceVaultFiles } from "@/features/tripCompliance/services/complianceVaultUpload.service";
import type { ComplianceListTripFacts } from "@/features/tripCompliance/services/complianceListFacts.service";
import { fetchTripDocumentsForTrips } from "@/features/tripCompliance/services/tripComplianceRead.service";
import type { ComplianceTripSummary } from "@/features/tripCompliance/tripCompliance.types";
import {
  podVerificationFiles,
  podVerificationKind,
  podVerificationLabel,
  pulseHardCopyFileName,
  type PodVerificationFile,
} from "@/features/tripCompliance/utils/podVerificationDocuments.util";
import {
  deleteTripDocument,
  getDocumentsByTripId,
  uploadTripDocument,
  type TripDocumentRow,
} from "@/features/trips/services/tripDocuments.service";
import { ComplianceHardCopyPodSheet } from "@/features/tripCompliance/components/ComplianceHardCopyPodSheet";
import type { HardCopyPodLrOption } from "@/features/trips/components/trip-detail/LogHardCopyPodModal";
import Feather from "@expo/vector-icons/Feather";
import { ChevronLeft, Clock, Hand, Maximize2, Minus, Pencil, Plus, RotateCwSquare, Scan, Trash2, Upload } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

function formatPodDate(iso: string | null | undefined): string {
  const raw = String(iso ?? "").trim();
  if (!raw) return "—";
  const d = /^\d{4}-\d{2}-\d{2}$/.test(raw.slice(0, 10))
    ? new Date(`${raw.slice(0, 10)}T12:00:00`)
    : new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function isoDay(value: string | null | undefined): string {
  const day = String(value ?? "").trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : "";
}

function moneyFromLog(raw: string): number {
  const value = Number(String(raw ?? "").trim());
  return Number.isFinite(value) && value > 0 ? Math.round(value * 100) / 100 : 0;
}

function applyExceptionLog(
  base: PodChargeLines,
  log: PodExceptionLogDraft,
  side: "client" | "vendor",
): PodChargeLines {
  const text = (clientKey: keyof PodExceptionLogDraft, vendorKey: keyof PodExceptionLogDraft) =>
    side === "vendor" ? log[vendorKey] : log[clientKey];
  const apply = (current: number, raw: string) => (raw.trim() === "" ? current : moneyFromLog(raw));
  return {
    ...base,
    loading: apply(base.loading, text("loading", "loadingVendor")),
    unloading: apply(base.unloading, text("unloading", "unloadingVendor")),
    damage: apply(base.damage, text("damage", "damageVendor")),
    productMissing: apply(base.productMissing, text("productMissing", "productMissingVendor")),
    delay: apply(base.delay, text("delay", "delayVendor")),
    halting: apply(base.halting, text("halting", "haltingVendor")),
  };
}

function fileIsPdf(file: PodVerificationFile): boolean {
  const mime = (file.mime_type ?? "").toLowerCase();
  const name = (file.file_name ?? "").toLowerCase();
  return mime.includes("pdf") || name.endsWith(".pdf");
}

export function PodVerificationPane({
  summary,
  organizationId,
  actorId,
  canManage,
  tripFacts,
  courierLrOptions,
  stacked = false,
  mobileExclusive = false,
  settlementMode = false,
  finalSettlement = false,
  previewOnly = false,
  onChanged,
  onChargesSaved,
  onRevalidated,
  onPodNotFound,
  onProceededToSettlement,
  onPayBalance,
  canPayBalance = false,
  payingBalance = false,
  onOpenActivityLog,
}: {
  summary: ComplianceTripSummary;
  organizationId: string;
  actorId: string | null;
  canManage: boolean;
  tripFacts: Pick<ComplianceListTripFacts, "truckTypeByVehicleId" | "supplierNameByTripId">;
  courierLrOptions: HardCopyPodLrOption[];
  stacked?: boolean;
  /** Phone: work first, then a full-page document preview — same as document upload. */
  mobileExclusive?: boolean;
  chargesReview?: boolean;
  /** Settlement Verification: charges + preview only; create CN/DN for the parties. */
  settlementMode?: boolean;
  /** Final Settlement: same pane, payable summary, revalidate + pay balance. */
  finalSettlement?: boolean;
  onPayBalance?: (amount: number) => void;
  canPayBalance?: boolean;
  payingBalance?: boolean;
  /** Awaiting POD: preview + log only, no charge form. */
  previewOnly?: boolean;
  onChanged: (tripId: string) => void | Promise<void>;
  onChargesSaved?: (tripId: string) => void;
  onRevalidated?: (tripId: string) => void;
  onPodNotFound?: (tripId: string) => void;
  onProceededToSettlement?: (tripId: string) => void;
  onOpenActivityLog?: () => void;
}) {
  const [liveFiles, setLiveFiles] = useState<PodVerificationFile[]>([]);
  const [droppedFileIds, setDroppedFileIds] = useState<Set<string>>(() => new Set());
  const files = useMemo(() => {
    const fromSummary = podVerificationFiles(summary.documents).filter(
      (file) => !droppedFileIds.has(file.id),
    );
    const liveById = new Map(liveFiles.map((file) => [file.id, file]));
    const base = fromSummary.length === 0 ? liveFiles : fromSummary;
    const seen = new Set<string>();
    const merged: PodVerificationFile[] = [];
    for (const file of base) {
      if (droppedFileIds.has(file.id)) continue;
      seen.add(file.id);
      merged.push(liveById.get(file.id) ?? file);
    }
    for (const file of liveFiles) {
      if (seen.has(file.id) || droppedFileIds.has(file.id)) continue;
      merged.push(file);
    }
    return merged;
  }, [droppedFileIds, liveFiles, summary.documents]);

  useEffect(() => {
    const tripId = summary.trip.id;
    let cancelled = false;
    setLiveFiles([]);
    setDroppedFileIds(new Set());
    void (async () => {
      const byTrip = await fetchTripDocumentsForTrips([tripId]);
      let next = podVerificationFiles(byTrip.get(tripId) ?? []);
      if (next.length === 0) {
        const listed = await getDocumentsByTripId(tripId, {
          includeOcr: false,
          includeStorageFallback: true,
        });
        next = podVerificationFiles(
          (listed.documents ?? []).map((doc) => ({
            id: doc.id,
            document_type: doc.document_type,
            file_name: doc.file_name,
            storage_path: doc.storage_path,
            mime_type: doc.mime_type,
          })),
        );
      }
      if (!cancelled) setLiveFiles(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [summary.trip.id]);

  const [activeId, setActiveId] = useState<string | null>(files[0]?.id ?? null);
  const [mobilePane, setMobilePane] = useState<"work" | "preview">("work");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [exceptionLog, setExceptionLog] = useState<PodExceptionLogDraft>(EMPTY_POD_EXCEPTION_LOG);
  const exceptionLogRef = useRef(exceptionLog);
  exceptionLogRef.current = exceptionLog;
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [, setToolLabel] = useState<string | null>(null);
  const [screenOpen, setScreenOpen] = useState(false);
  const [fileBusy, setFileBusy] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [confirmDeleteFile, setConfirmDeleteFile] = useState(false);
  const [savedLocal, setSavedLocal] = useState(false);
  const [editingSaved, setEditingSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmValidated, setConfirmValidated] = useState(false);
  const [confirmRevalidate, setConfirmRevalidate] = useState(false);
  const [confirmNotFound, setConfirmNotFound] = useState(false);
  const [confirmSettle, setConfirmSettle] = useState(false);
  const [revalidateReason, setRevalidateReason] = useState("");
  const [notFoundReason, setNotFoundReason] = useState("");
  const [noteError, setNoteError] = useState<string | null>(null);
  const [noteAction, setNoteAction] = useState<{ kind: "revoke"; draft: PodCnDnDraft } | null>(null);
  const [noteBusy, setNoteBusy] = useState(false);
  const [provisionSide, setProvisionSide] = useState<"client" | "supplier" | null>(null);
  const [provisionEdit, setProvisionEdit] = useState<TripAdjustment | null>(null);
  const [notePdf, setNotePdf] = useState<ProvisionNotePdfContext | null>(null);
  const [selectedNote, setSelectedNote] = useState<TripAdjustment | null>(null);

  useEffect(() => {
    setMobilePane(previewOnly ? "preview" : "work");
    setSelectedNote(null);
  }, [previewOnly, summary.trip.id]);
  const [provisionDraft, setProvisionDraft] = useState<PodCnDnDraft | null>(null);
  const [provisionPreset, setProvisionPreset] = useState<{
    type?: TripAdjustmentType;
    impact?: TripAdjustmentImpact;
    reasonSeed?: string | null;
    amountSeed?: number | null;
  } | null>(null);
  const pendingPassThroughRef = useRef<ClientPassThroughRecommendation | null>(null);
  const continueProvisionRef = useRef(false);
  const lastDraftKeyRef = useRef<string | null>(null);
  const insets = useSafeAreaInsets();
  const modalPad = {
    paddingTop: Math.max(16, insets.top + 12),
    paddingBottom: Math.max(16, insets.bottom + 12),
  };
  // Reopen supplier provision after a client CN success (same trip-detail pass-through).
  const queryClient = useQueryClient();
  const adjustmentsQuery = useQuery({
    queryKey: [...queryKeys.tripFinanceAdjustmentsRoot, summary.trip.id],
    queryFn: () => getTripAdjustments(summary.trip.id),
    enabled: (settlementMode || finalSettlement) && Boolean(summary.trip.id),
  });
  const financeBreakdownQuery = useQuery({
    queryKey: ["compliance", "final-settlement-finance", organizationId, summary.trip.id],
    queryFn: () =>
      fetchComplianceAdvanceFinanceBreakdown({
        orgId: organizationId || summary.trip.organization_id || "",
        tripId: summary.trip.id,
        supplierId: summary.trip.supplier_id,
        supplierRate: Number(summary.trip.supplier_rate) || 0,
        supplierRateBasis:
          (summary.trip as { supplier_rate_basis?: string | null }).supplier_rate_basis ?? null,
        loadTons: summary.trip.load_tons ?? null,
      }),
    enabled: (settlementMode || finalSettlement) && Boolean(summary.trip.id),
  });
  const costLedgerQuery = useQuery({
    queryKey: [
      "compliance",
      "settlement-cost-ledger",
      summary.trip.id,
      summary.advance?.amount ?? 0,
      summary.balance?.amount ?? 0,
    ],
    queryFn: () => fetchTripCostLedgerPaid(summary.trip.id),
    enabled: (settlementMode || finalSettlement) && Boolean(summary.trip.id),
  });

  const loaded = usePodClientValidationQuery(organizationId || null, summary.trip.id, {
    organizationId: summary.trip.organization_id || organizationId,
    supplierRate: Number(summary.trip.supplier_rate) || 0,
    supplierRateBasis:
      (summary.trip as { supplier_rate_basis?: string | null }).supplier_rate_basis ?? null,
    loadTons: summary.trip.load_tons ?? null,
  });
  const saveDraft = useSavePodValidationDraftMutation(organizationId || null, actorId);
  const validate = useValidatePodsMutation(organizationId || null, actorId);
  const revalidate = useRequestPodRevalidationMutation(organizationId || null, actorId);
  const notFound = useReportPodNotFoundMutation(organizationId || null, actorId);
  const releaseSettlement = useReleasePodSettlementMutation(organizationId || null, actorId);

  const active = files.find((file) => file.id === activeId) ?? files[0] ?? null;
  const canEditFiles = canManage && Boolean(actorId);

  const reloadPodFiles = useCallback(async () => {
    const listed = await getDocumentsByTripId(summary.trip.id, {
      includeOcr: false,
      includeStorageFallback: true,
    });
    const next = podVerificationFiles(
      (listed.documents ?? []).map((doc) => ({
        id: doc.id,
        document_type: doc.document_type,
        file_name: doc.file_name,
        storage_path: doc.storage_path,
        mime_type: doc.mime_type,
      })),
    );
    setDroppedFileIds(new Set());
    setLiveFiles(next);
    return next;
  }, [summary.trip.id]);

  const uploadPodFiles = useCallback(
    async (mode: "add" | "replace") => {
      if (!actorId || fileBusy) return;
      const target = active;
      if (mode === "replace" && !target?.storage_path) return;
      setFileError(null);
      setFileBusy(true);
      try {
        const picked = await pickComplianceVaultFiles("pod");
        const batch = mode === "replace" ? picked.slice(0, 1) : picked;
        if (batch.length === 0) return;
        let lastId = target?.id ?? null;
        const hardCopy = !target || podVerificationKind(target) === "hard";
        for (const [index, file] of batch.entries()) {
          const replacing = mode === "replace" && index === 0 && target ? target : null;
          const { doc, error } = await uploadTripDocument(
            summary.trip.id,
            actorId,
            {
              arrayBuffer: file.arrayBuffer,
              fileName: hardCopy ? pulseHardCopyFileName(file.fileName) : file.fileName,
              mimeType: file.mimeType,
            },
            "pod",
            undefined,
            replacing
              ? { replaceDocumentId: replacing.id, organizationId }
              : { organizationId },
          );
          if (error || !doc) {
            setFileError(error?.message || "Could not save the POD file.");
            break;
          }
          lastId = doc.id;
          if (replacing?.storage_path) invalidateCompliancePreviewCache([replacing.storage_path]);
        }
        const next = await reloadPodFiles();
        const focus = next.find((file) => file.id === lastId) ?? next[next.length - 1] ?? null;
        setActiveId(focus?.id ?? null);
        setPreviewUrl(null);
        await onChanged(summary.trip.id);
      } catch (err) {
        setFileError(err instanceof Error ? err.message : "Could not save the POD file.");
      } finally {
        setFileBusy(false);
      }
    },
    [active, actorId, fileBusy, onChanged, organizationId, reloadPodFiles, summary.trip.id],
  );

  const deleteActivePodFile = useCallback(async () => {
    if (!active?.storage_path || fileBusy) return;
    setFileError(null);
    setFileBusy(true);
    try {
      const row: TripDocumentRow = {
        id: active.id,
        trip_id: summary.trip.id,
        file_name: active.file_name?.trim() || "pod",
        storage_path: active.storage_path,
        mime_type: active.mime_type ?? null,
        size_bytes: null,
        uploaded_at: new Date(0).toISOString(),
        uploaded_by: actorId,
        document_type: "pod",
      };
      const { error } = await deleteTripDocument(row);
      if (error) {
        setFileError(error.message);
        return;
      }
      invalidateCompliancePreviewCache([active.storage_path]);
      setDroppedFileIds((current) => new Set(current).add(active.id));
      setLiveFiles((current) => current.filter((file) => file.id !== active.id));
      setPreviewUrl(null);
      setConfirmDeleteFile(false);
      await onChanged(summary.trip.id);
    } finally {
      setFileBusy(false);
    }
  }, [active, actorId, fileBusy, onChanged, summary.trip.id]);

  useEffect(() => {
    setActiveId(files[0]?.id ?? null);
    setExceptionLog(EMPTY_POD_EXCEPTION_LOG);
    setSavedLocal(false);
    setEditingSaved(false);
    setSaveError(null);
    setConfirmValidated(false);
    setConfirmRevalidate(false);
    setConfirmNotFound(false);
    setConfirmSettle(false);
    setRevalidateReason("");
    setNotFoundReason("");
    continueProvisionRef.current = false;
    lastDraftKeyRef.current = null;
    setNoteError(null);
    setNoteAction(null);
    setProvisionSide(null);
    setProvisionEdit(null);
    setProvisionDraft(null);
    setProvisionPreset(null);
    setNotePdf(null);
    pendingPassThroughRef.current = null;
    setZoom(1);
    setRotation(0);
    setScreenOpen(false);
  }, [summary.trip.id]);

  useEffect(() => {
    setActiveId((current) => {
      if (current && files.some((file) => file.id === current)) return current;
      return files[0]?.id ?? null;
    });
  }, [files]);

  useEffect(() => {
    if (!loaded.data) return;
    const client = loaded.data.clientCharges;
    const vendor = loaded.data.vendorCharges;
    if (!client && !vendor && !loaded.data.deliveryDate) return;
    const clientDraft = chargeDraftFromLines(client ?? EMPTY_CHARGE_LINES);
    const vendorDraft = chargeDraftFromLines(vendor ?? EMPTY_CHARGE_LINES);
    setExceptionLog({
      loading: client ? clientDraft.loading : "",
      loadingVendor: vendor ? vendorDraft.loading : "",
      unloading: client ? clientDraft.unloading : "",
      unloadingVendor: vendor ? vendorDraft.unloading : "",
      damage: client ? clientDraft.damage : "",
      damageVendor: vendor ? vendorDraft.damage : "",
      productMissing: client ? clientDraft.productMissing : "",
      productMissingVendor: vendor ? vendorDraft.productMissing : "",
      delay: client ? clientDraft.delay : "",
      delayVendor: vendor ? vendorDraft.delay : "",
      halting: client ? clientDraft.halting : "",
      haltingVendor: vendor ? vendorDraft.halting : "",
      actualDeliveryDate: isoDay(loaded.data.deliveryDate),
    });
  }, [loaded.data, summary.trip.id]);

  useEffect(() => {
    setZoom(1);
    setRotation(0);
  }, [active?.id]);

  useEffect(() => {
    const path = active?.storage_path?.trim() ?? "";
    if (!path) {
      setPreviewUrl(null);
      setLoadingPreview(false);
      return;
    }
    let cancelled = false;
    setLoadingPreview(true);
    void signCompliancePreviewUrl({
      storagePath: path,
      source: "trip",
      organizationId,
    }).then((url) => {
      if (cancelled) return;
      setPreviewUrl(url);
      setLoadingPreview(false);
    });
    return () => {
      cancelled = true;
    };
  }, [
    active?.id,
    active?.storage_path,
    organizationId,
    loaded.data?.validatedAt,
    loaded.data?.draftedAt,
    savedLocal,
  ]);

  const hard = summary.hardCopyPod;
  const courierLogged = Boolean(hard.courier?.trim() || hard.awbNumber?.trim());
  const personLogged = Boolean(hard.receivedBy?.trim());
  const logged = hard.received || courierLogged || personLogged;
  const lrLabel = (hard.lrNumbers ?? []).filter(Boolean).join(", ") || "—";
  const previouslyValidated = Boolean(loaded.data?.validatedAt);
  const drafted = Boolean(loaded.data?.draftedAt || savedLocal);
  const submitted = previouslyValidated || (drafted && !editingSaved);
  const canViewDocument = Boolean(active?.storage_path?.trim());
  const compactSettlement = stacked || mobileExclusive;
  const workLayout = stacked || mobileExclusive;
  const isAssetExecution = isAssetExecutionTrip(summary.trip);
  const noteDrafts = useMemo(
    () =>
      podExceptionCnDnDrafts({
        client: loaded.data?.clientCharges,
        vendor: loaded.data?.vendorCharges,
        costParty: isAssetExecution ? "driver" : "vendor",
      }),
    [isAssetExecution, loaded.data?.clientCharges, loaded.data?.vendorCharges],
  );
  const adjustments = adjustmentsQuery.data ?? [];
  useEffect(() => {
    setSelectedNote((current) => {
      if (!current) return null;
      return adjustments.find((row) => row.id === current.id) ?? null;
    });
  }, [adjustments, summary.trip.id]);
  const pendingNotes = pendingPodCnDnDrafts(noteDrafts, adjustments);
  const createdNotes = createdPodCnDnDrafts(noteDrafts, adjustments);
  const baseSale = Number(summary.trip.client_price) || 0;
  const baseCost = Number(summary.trip.supplier_rate) || 0;
  const adjSales = adjustedRevenue(baseSale, adjustments);
  const adjCost = adjustedCost(baseCost, adjustments);
  const settlementPayable = podSettlementPayable({
    revisedCost: adjCost,
    pending: pendingNotes,
    tdsAmount: financeBreakdownQuery.data?.tdsAmount ?? 0,
    documentationCharges:
      financeBreakdownQuery.data?.documentationCharges ??
      loaded.data?.vendorCharges?.documentCost ??
      0,
    advancePaid: 0,
    balancePaid: 0,
  });
  const settlementLedger = alignPodSettlementLedger({
    actualPayable: settlementPayable.actualPayable,
    taggedAdvance:
      costLedgerQuery.data?.taggedAdvance ||
      summary.advance?.amount ||
      financeBreakdownQuery.data?.postedAdvanceAmount ||
      0,
    taggedBalance: costLedgerQuery.data?.taggedBalance || summary.balance?.amount || 0,
    ledgerCostPaid: costLedgerQuery.data?.ledgerCostPaid ?? 0,
  });
  const clientName = summary.trip.client_name?.trim() || "Client";
  const supplierName =
    (tripFacts.supplierNameByTripId[summary.trip.id] ?? summary.trip.supplier_name)?.trim() ||
    "Vendor";
  const driverName = summary.trip.driver_display_name?.trim() || "Driver";
  const costPartyName = isAssetExecution ? driverName : supplierName;
  const costLaneLabel = isAssetExecution ? "Driver cost" : "Vendor cost";
  const hasLogEntries = kindsFromDraft(exceptionLog).length > 0;
  const debitIdentified =
    hasLogEntries ||
    podDebitIdentified(loaded.data?.clientCharges, loaded.data?.vendorCharges);
  const noDebit = !debitIdentified;
  const busy = saveDraft.isPending || validate.isPending || notFound.isPending;
  const canValidatePod = !busy;

  const buildTripInput = () => {
    const log = exceptionLogRef.current;
    const markedNoDebit =
      kindsFromDraft(log).length === 0 &&
      (exceptionLogExplicitlyClear(log) ||
        !podDebitIdentified(loaded.data?.clientCharges, loaded.data?.vendorCharges));
    const clientBase = loaded.data?.clientCharges ?? chargeLinesFromBase(Number(summary.trip.client_price) || 0);
    const vendorBase = loaded.data?.vendorCharges ?? chargeLinesFromBase(Number(summary.trip.supplier_rate) || 0);
    return {
      tripId: summary.trip.id,
      remarks: markedNoDebit ? "No debit" : "",
      noDebit: markedNoDebit,
      clientInvoiceNumber: loaded.data?.invoiceNumber ?? null,
      tripStartDate:
        isoDay(loaded.data?.tripStartDate) ||
        isoDay(summary.trip.pickup_date) ||
        isoDay(summary.trip.started_at) ||
        null,
      deliveryDate:
        isoDay(log.actualDeliveryDate) ||
        isoDay(loaded.data?.deliveryDate) ||
        isoDay(summary.trip.completed_at) ||
        null,
      dispatchDate: isoDay(loaded.data?.dispatchDate) || null,
      client: applyExceptionLog(clientBase, log, "client"),
      vendor: applyExceptionLog(vendorBase, log, "vendor"),
    };
  };

  const persistDraft = async () => {
    if (busy) return false;
    setSaveError(null);
    try {
      const result = await saveDraft.mutateAsync([buildTripInput()]);
      if (!result.updatedIds.includes(summary.trip.id)) {
        setSaveError(result.error?.message ?? "Could not save POD entries.");
        return false;
      }
      setSavedLocal(true);
      setEditingSaved(false);
      return true;
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Could not save POD entries.");
      return false;
    }
  };

  const submitDraft = async () => {
    const ok = await persistDraft();
    if (ok) void onChanged(summary.trip.id);
  };

  const completeValidation = async () => {
    if (busy) return;
    if (hasLogEntries || noDebit) {
      const saved = await persistDraft();
      if (!saved) return;
    }
    setSaveError(null);
    try {
      const result = await validate.mutateAsync([buildTripInput()]);
      if (!result.updatedIds.includes(summary.trip.id)) {
        setSaveError(result.error?.message ?? "Could not validate this POD.");
        return;
      }
      setSavedLocal(true);
      setEditingSaved(false);
      void onChanged(summary.trip.id);
      onChargesSaved?.(summary.trip.id);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Could not validate this POD.");
    }
  };

  const requestRevalidate = async () => {
    if (revalidate.isPending) return;
    setNoteError(null);
    try {
      const result = await revalidate.mutateAsync({
        tripId: summary.trip.id,
        reason: revalidateReason,
      });
      if (result.error) {
        setNoteError(result.error.message);
        return;
      }
      setConfirmRevalidate(false);
      setRevalidateReason("");
      void onChanged(summary.trip.id);
      onRevalidated?.(summary.trip.id);
    } catch (error) {
      setNoteError(error instanceof Error ? error.message : "Could not send this trip back for revalidation.");
    }
  };

  const requestSettle = async () => {
    if (releaseSettlement.isPending || createdNotes.length === 0) return;
    setNoteError(null);
    try {
      const result = await releaseSettlement.mutateAsync({
        tripId: summary.trip.id,
        pendingNotes: pendingNotes.map((draft) => `${draft.noteKind} · ${draft.partyLabel} · ${draft.label}`),
      });
      if (result.error) {
        setNoteError(result.error.message);
        return;
      }
      setConfirmSettle(false);
      void onChanged(summary.trip.id);
      onProceededToSettlement?.(summary.trip.id);
    } catch (error) {
      setNoteError(error instanceof Error ? error.message : "Could not proceed to Final Settlement.");
    }
  };

  const submitPodNotFound = async () => {
    if (notFound.isPending) return;
    setNoteError(null);
    try {
      const result = await notFound.mutateAsync({
        tripId: summary.trip.id,
        reason: notFoundReason,
      });
      if (result.error) {
        setNoteError(result.error.message);
        return;
      }
      setConfirmNotFound(false);
      setNotFoundReason("");
      void onChanged(summary.trip.id);
      onPodNotFound?.(summary.trip.id);
    } catch (error) {
      setNoteError(error instanceof Error ? error.message : "Could not return this trip to Awaiting POD.");
    }
  };

  const refreshNotes = async () => {
    await queryClient.invalidateQueries({
      queryKey: [...queryKeys.tripFinanceAdjustmentsRoot],
    });
    void onChanged(summary.trip.id);
  };

  const closeProvision = () => {
    const nextPassThrough = pendingPassThroughRef.current;
    const continueQueue = continueProvisionRef.current;
    const postedKey = lastDraftKeyRef.current;
    pendingPassThroughRef.current = null;
    continueProvisionRef.current = false;
    setProvisionSide(null);
    setProvisionEdit(null);
    setProvisionDraft(null);
    setProvisionPreset(null);
    if (nextPassThrough) {
      requestAnimationFrame(() => {
        openProvision({
          side: "supplier",
          preset: passThroughPresetFromRecommendation(nextPassThrough),
        });
      });
      return;
    }
    if (!continueQueue) return;
    const remaining = pendingNotes.filter((draft) => draft.missionKey !== postedKey);
    if (remaining[0]) {
      requestAnimationFrame(() => openProvisionDraft(remaining[0]));
    }
  };

  const openProvision = (input: {
    side: "client" | "supplier";
    draft?: PodCnDnDraft | null;
    edit?: TripAdjustment | null;
    preset?: {
      type?: TripAdjustmentType;
      impact?: TripAdjustmentImpact;
      reasonSeed?: string | null;
      amountSeed?: number | null;
    } | null;
  }) => {
    setNoteError(null);
    lastDraftKeyRef.current = input.draft?.missionKey ?? null;
    setProvisionSide(input.side);
    setProvisionDraft(input.draft ?? null);
    setProvisionEdit(input.edit ?? null);
    setProvisionPreset(input.preset ?? null);
  };

  const noteContextFor = (adj: TripAdjustment): ProvisionNotePdfContext => {
    const isSale = adj.type === "revenue";
    return {
      adjustment: adj,
      tripCode: getTripDisplayNumber(summary.trip, organizationId),
      companyName: "PULSE",
      partyName: isSale ? clientName : costPartyName,
      laneLabel: isSale ? "Sale" : "Cost",
      partyRole: isSale ? "Client" : isAssetExecution ? "Driver" : "Supplier",
      baseLaneAmount: isSale ? baseSale : baseCost,
      revisedLaneAmount: isSale ? adjSales : adjCost,
    };
  };

  const openNotePdf = (adj: TripAdjustment) => {
    setNotePdf(noteContextFor(adj));
  };

  const openPostedNote = (adj: TripAdjustment) => {
    openProvision({
      side: adj.type === "revenue" ? "client" : "supplier",
      edit: adj,
    });
  };

  const openProvisionDraft = (draft: PodCnDnDraft) => {
    openProvision({
      side: draft.party === "client" ? "client" : "supplier",
      draft,
      preset: podCnDnProvisionPreset(draft),
    });
  };

  const saveProvisionNote = async (params: {
    type: TripAdjustmentType;
    impact: TripAdjustmentImpact;
    amount: number;
    reason: string;
  }) => {
    setNoteError(null);
    const orgId = summary.trip.organization_id || organizationId;
    const result = await savePodProvisionNote({
      tripId: summary.trip.id,
      organizationId: orgId,
      actorId,
      params,
      missionKey: provisionDraft?.missionKey ?? null,
    });
    if (result.error) throw result.error;
    continueProvisionRef.current = true;
    await refreshNotes();
  };

  const updateProvisionNote = async (
    adjustmentId: string,
    params: {
      type: TripAdjustmentType;
      impact: TripAdjustmentImpact;
      amount: number;
      reason: string;
    },
  ) => {
    setNoteError(null);
    if (provisionDraft) {
      const result = await editPodExceptionCnDn({
        tripId: summary.trip.id,
        draft: provisionDraft,
        amount: params.amount,
        reason: params.reason,
        type: params.type,
        impact: params.impact,
      });
      if (result.error) throw result.error;
    } else {
      await updateTripAdjustment(summary.trip.id, adjustmentId, params);
    }
    await refreshNotes();
  };

  const submitNoteAction = async (values: { reason: string }) => {
    if (!noteAction || noteBusy) return;
    setNoteError(null);
    setNoteBusy(true);
    try {
      const result = await revokePodExceptionCnDn({
        tripId: summary.trip.id,
        draft: noteAction.draft,
        reason: values.reason,
      });
      if (result.error) {
        setNoteError(result.error.message);
        return;
      }
      setNoteAction(null);
      await refreshNotes();
    } catch (error) {
      setNoteError(error instanceof Error ? error.message : "Could not revoke this CN / DN.");
    } finally {
      setNoteBusy(false);
    }
  };

  const pickFile = (id: string) => {
    setActiveId(id);
    setSelectedNote(null);
    if (mobileExclusive) setMobilePane("preview");
  };

  const pickNote = (next: TripAdjustment | null) => {
    setSelectedNote(next);
    if (mobileExclusive && next) setMobilePane("preview");
  };

  const filePicker = mobileExclusive ? (
    <View style={styles.fileCardList}>
      {files.length === 0 ? (
        <View style={styles.fileCardEmpty}>
          <Text style={styles.logEmptyText}>
            No POD is on file yet. Log a hard copy or upload a soft copy, then preview it here.
          </Text>
        </View>
      ) : (
        files.map((file) => {
          const kind = podVerificationKind(file);
          const path = file.storage_path?.trim() || null;
          return (
            <VaultChooserNotifyRow
              key={file.id}
              label={podVerificationLabel(file)}
              meta={kind === "hard" ? "Hard copy" : "Soft copy"}
              actionText={file.file_name?.trim() || undefined}
              onFile={Boolean(path)}
              canUpload={false}
              entityType={kind === "hard" ? "supplier" : "client"}
              preview={
                path
                  ? {
                      storagePath: path,
                      fileName: file.file_name,
                      mimeHint: file.mime_type,
                      source: "trip",
                      organizationId,
                      entityId: summary.trip.id,
                    }
                  : null
              }
              onPreview={() => pickFile(file.id)}
              onAdd={() => pickFile(file.id)}
            />
          );
        })
      )}
    </View>
  ) : (
    <View style={settlementMode ? styles.chipRow : styles.logChipRow}>
      {files.map((file) => {
        const selected = file.id === (active?.id ?? "");
        const kind = podVerificationKind(file);
        return (
          <Pressable
            key={file.id}
            onPress={() => pickFile(file.id)}
            style={[styles.chip, selected && styles.chipSelected]}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={`${podVerificationLabel(file)} ${file.file_name ?? ""}`}
          >
            <Feather
              name={kind === "hard" ? "package" : "file-text"}
              size={12}
              color={selected ? Theme.textPrimaryDark : Theme.textMuted}
            />
            <Text style={[styles.chipText, selected && styles.chipTextSelected]} numberOfLines={1}>
              {podVerificationLabel(file)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );

  const workPane = (
      <ScrollView
        style={styles.previewCol}
        contentContainerStyle={[
          styles.previewContent,
          !mobileExclusive && styles.previewContentFill,
          workLayout && styles.previewContentStacked,
          mobileExclusive && styles.previewContentMobile,
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.pageHead}>
          <Text style={[styles.kicker, mobileExclusive && styles.kickerMobile]}>
            {finalSettlement
              ? "Final Settlement"
              : settlementMode
                ? "Settlement"
                : previewOnly
                  ? "Awaiting POD"
                  : "POD files"}
          </Text>
          <View style={styles.pageHeadRow}>
            <Text style={[styles.title, styles.pageHeadTitle, mobileExclusive && styles.titleMobile]}>
              {finalSettlement
                ? "Payable after POD"
                : settlementMode
                  ? "Charges from POD"
                  : previewOnly
                    ? "Logged hard copy"
                    : "Soft copy and hard copy"}
            </Text>
            {onOpenActivityLog && !mobileExclusive ? (
              <ComplianceActivityLogButton compact onPress={onOpenActivityLog} />
            ) : null}
          </View>
          <Text style={[styles.meta, mobileExclusive && styles.metaMobile]}>
            {mobileExclusive
              ? "Tap a document to preview it full page. Back returns to this trip."
              : finalSettlement
                ? "Revised sale and cost after CN / DN, plus POD charges that are still not adjusted."
                : settlementMode
                  ? isAssetExecution
                    ? "Post client sale and driver pay. Own-fleet trips have no vendor payable."
                    : "Post the client sale and the vendor cost from this POD."
                  : previewOnly
                    ? "Preview the hard-copy scan, then log how it was received."
                    : "Choose a copy, confirm who received it, then validate."}
          </Text>
        </View>
        {settlementMode ? filePicker : null}

        {settlementMode ? null : (
        <View style={[styles.logCard, mobileExclusive && styles.logCardMobile]}>
          {mobileExclusive ? (
            <View style={styles.fileCardInLogMobile}>{filePicker}</View>
          ) : files.length > 0 ? (
            filePicker
          ) : null}
          <View style={[styles.logHead, workLayout && styles.logHeadStacked, mobileExclusive && styles.logHeadMobile]}>
            <View style={styles.logHeadCopy}>
              <Text style={styles.kicker}>Logged POD</Text>
              <Text style={styles.title}>Receipt from Awaiting POD</Text>
            </View>
            {canManage ? (
              <View style={[styles.logHeadActions, mobileExclusive && styles.logHeadActionsMobile]}>
                <RegistryGhostButton
                  label={logged ? "Edit" : "Log POD"}
                  onPress={() => setLogOpen(true)}
                  style={mobileExclusive ? styles.validateBtnStacked : undefined}
                />
              </View>
            ) : null}
          </View>
          {logged ? (
            <View style={styles.receiptPanel}>
              <View style={styles.receiptTop}>
                <PartyAvatar
                  name={courierLogged ? hard.courier?.trim() || "Courier" : hard.receivedBy?.trim() || "Desk"}
                  entityType={courierLogged ? "supplier" : "driver"}
                  initialsColorSeed={courierLogged ? hard.courier || "courier" : hard.receivedBy || "desk"}
                  size={40}
                />
                <View style={styles.receiptCopy}>
                  <Text style={styles.receiptName} numberOfLines={1}>
                    {courierLogged ? hard.courier?.trim() || "Courier" : hard.receivedBy?.trim() || "Desk"}
                  </Text>
                  <Text style={styles.receiptRole} numberOfLines={1}>
                    {courierLogged ? "Received by courier" : "Received in person"}
                  </Text>
                </View>
                <View style={[styles.receiptPill, hard.received ? styles.receiptPillOn : styles.receiptPillWait]}>
                  <Text style={[styles.receiptPillText, hard.received ? styles.receiptPillTextOn : styles.receiptPillTextWait]}>
                    {hard.received ? "Received" : "In transit"}
                  </Text>
                </View>
              </View>
              <View style={styles.receiptFacts}>
                <View style={styles.receiptFact}>
                  <Text style={styles.receiptFactLabel}>LR</Text>
                  <Text style={styles.receiptFactValue} numberOfLines={1}>
                    {lrLabel}
                  </Text>
                </View>
                <View style={styles.receiptFact}>
                  <Text style={styles.receiptFactLabel}>When</Text>
                  <Text style={styles.receiptFactValue} numberOfLines={1}>
                    {formatPodDate(hard.receivedAt) || "—"}
                  </Text>
                </View>
                {hard.awbNumber?.trim() ? (
                  <View style={styles.receiptFact}>
                    <Text style={styles.receiptFactLabel}>AWB</Text>
                    <Text style={styles.receiptFactValue} numberOfLines={1}>
                      {hard.awbNumber.trim()}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>
          ) : (
            <View style={[styles.logEmpty, mobileExclusive && styles.logEmptyMobile]}>
              <Text style={styles.logEmptyText}>
                {files.length > 0
                  ? "A scan is on file. Log the hard-copy receipt to record who received it."
                  : "No hard-copy POD has been logged for this trip yet."}
              </Text>
            </View>
          )}
        </View>
        )}

        {previewOnly ? null : settlementMode ? (
          <SettlementChargeNotesCard
            stacked={compactSettlement}
            mobileExclusive={mobileExclusive}
            drafts={noteDrafts}
            created={createdNotes}
            pending={pendingNotes}
            plannedDelivery={summary.trip.completed_at ?? null}
            actualDelivery={exceptionLog.actualDeliveryDate || isoDay(loaded.data?.deliveryDate)}
            error={noteError}
            creating={false}
            canManage={canManage && !finalSettlement}
            canRevalidate={canManage}
            finalSettlement={finalSettlement}
            clientCharges={loaded.data?.clientCharges ?? null}
            vendorCharges={loaded.data?.vendorCharges ?? null}
            tdsAmount={financeBreakdownQuery.data?.tdsAmount ?? 0}
            documentationCharges={
              financeBreakdownQuery.data?.documentationCharges ??
              loaded.data?.vendorCharges?.documentCost ??
              0
            }
            advancePaid={settlementLedger.advancePaid}
            balancePaid={settlementLedger.balancePaid}
            ledgerPaid={settlementLedger.ledgerPaid}
            remainingPayable={settlementLedger.remaining}
            balancePosted={settlementLedger.balancePosted}
            adjustments={adjustments}
            clientName={clientName}
            supplierName={costPartyName}
            costLaneLabel={costLaneLabel}
            isAssetExecution={isAssetExecution}
            sales={baseSale}
            adjSales={adjSales}
            cost={baseCost}
            adjCost={adjCost}
            onCreate={() => {
              if (pendingNotes[0]) openProvisionDraft(pendingNotes[0]);
            }}
            onAdjustClient={() => {
              const next = pendingNotes.find((draft) => draft.party === "client");
              if (next) openProvisionDraft(next);
              else openProvision({ side: "client" });
            }}
            onAdjustVendor={() => {
              const next = pendingNotes.find((draft) => isPodCostParty(draft.party));
              if (next) openProvisionDraft(next);
              else openProvision({ side: "supplier" });
            }}
            onCreateDraft={openProvisionDraft}
            onViewNotePdf={openNotePdf}
            onSelectedAdjustmentChange={pickNote}
            onEditAdjustment={canManage ? openPostedNote : undefined}
            onEdit={(draft) => {
              const posted = podCnDnAdjustmentFor(adjustments, draft.missionKey);
              if (!posted) return;
              openProvision({
                side: draft.party === "client" ? "client" : "supplier",
                draft,
                edit: posted,
              });
            }}
            onRevoke={(draft) => {
              setNoteError(null);
              setNoteAction({ kind: "revoke", draft });
            }}
            onRevalidate={() => {
              setNoteError(null);
              setConfirmRevalidate(true);
            }}
            onProceed={() => {
              setNoteError(null);
              setConfirmSettle(true);
            }}
            onPayBalance={() => onPayBalance?.(settlementLedger.remaining)}
            canPayBalance={canPayBalance && !settlementLedger.balancePosted && settlementLedger.remaining > 0}
            payingBalance={payingBalance}
            proceeding={releaseSettlement.isPending}
            revalidating={revalidate.isPending}
          />
        ) : (
          <>
            {summary.hardCopyPod.revalidateRequested ? (
              <Text style={styles.meta}>
                Settlement sent this trip back. Update the POD charges, then Validated to return it to Settlement Verification.
              </Text>
            ) : null}
            <View style={styles.workFill}>
            <PodExceptionLogCard
              key={summary.trip.id}
              stacked={workLayout}
              mobileExclusive={mobileExclusive}
              plannedDelivery={summary.trip.completed_at ?? null}
              value={exceptionLog}
              onChange={(next) => {
                exceptionLogRef.current = next;
                setExceptionLog(next);
              }}
              canManage={canManage}
              submitted={submitted && !editingSaved}
              saving={saveDraft.isPending}
              saveError={saveError}
              onSubmit={() => void submitDraft()}
              onEdit={() => {
                setEditingSaved(true);
                setSaveError(null);
              }}
              onCancelEdit={
                editingSaved && (previouslyValidated || drafted)
                  ? () => {
                      setEditingSaved(false);
                      setSaveError(null);
                    }
                  : undefined
              }
            />
            </View>
            {canManage ? (
              <View style={[styles.validateBar, styles.validateDock]}>
                <Text style={styles.meta}>
                  Validated moves this trip to Settlement Verification. POD not found sends it back to Awaiting POD.
                </Text>
                <View style={[styles.validateActions, workLayout && styles.validateActionsStacked]}>
                  <View style={[styles.validateAction, workLayout && styles.validateActionStacked]}>
                    <RegistryGhostButton
                      label={notFound.isPending ? "Returning…" : "POD not found"}
                      onPress={() => {
                        setNoteError(null);
                        setConfirmNotFound(true);
                      }}
                      disabled={busy}
                      style={workLayout ? styles.validateBtnStacked : undefined}
                    />
                  </View>
                  <View style={[styles.validateAction, workLayout && styles.validateActionStacked]}>
                    <RegistryPrimaryButton
                      label={validate.isPending ? "Validating…" : "Validated"}
                      onPress={() => setConfirmValidated(true)}
                      disabled={!canValidatePod}
                      style={workLayout ? styles.validateBtnStacked : undefined}
                    />
                  </View>
                </View>
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
  );

  const previewPane = (
      <View
        style={[
          styles.previewPane,
          stacked && !mobileExclusive && styles.previewPaneStacked,
          !stacked && styles.previewPaneSplit,
          mobileExclusive && styles.previewPaneMobile,
        ]}
      >
        {selectedNote ? (
          <CnDnNotePreview
            context={noteContextFor(selectedNote)}
            onExpand={() => openNotePdf(selectedNote)}
          />
        ) : (
          <PodShopPreview
            title={active ? podVerificationLabel(active) : "POD"}
            fileName={active?.file_name ?? null}
            uri={previewUrl}
            isPdf={fileIsPdf(active ?? {})}
            loading={loadingPreview}
            zoom={zoom}
            rotation={rotation}
            index={Math.max(0, files.findIndex((file) => file.id === active?.id))}
            files={files.map((file) => ({
              id: file.id,
              label: podVerificationKind(file) === "hard" ? "POD" : "SOFT",
            }))}
            selectedId={active?.id ?? null}
            onSelect={(id) => setActiveId(id)}
            tripLabel={getTripDisplayNumber(summary.trip, summary.trip.organization_id ?? null)}
            onFileSince={summary.documents.find((doc) => doc.id === active?.id)?.uploaded_at ?? null}
            logged={logged}
            receiptDetail={
              logged
                ? [
                    courierLogged ? hard.courier?.trim() || "Courier" : hard.receivedBy?.trim() || "Desk",
                    hard.awbNumber?.trim() ? `AWB ${hard.awbNumber.trim()}` : null,
                    hard.received ? "Received" : "In transit",
                  ]
                    .filter(Boolean)
                    .join(" · ")
                : "Receipt not logged"
            }
            canLog={canManage}
            onLog={() => setLogOpen(true)}
            canEditFiles={canEditFiles}
            fileBusy={fileBusy}
            fileError={fileError}
            onAdd={() => void uploadPodFiles("add")}
            onEdit={() => void uploadPodFiles("replace")}
            onDelete={() => {
              setFileError(null);
              setConfirmDeleteFile(true);
            }}
            onActivityLog={onOpenActivityLog}
            onZoom={setZoom}
            onRotate={() => {
              setRotation((value) => (value + 90) % 360);
              setZoom(1);
              setToolLabel("rotate");
            }}
            onOriginal={() => {
              setZoom(1);
              setRotation(0);
              setToolLabel("original");
            }}
            onExpand={() => setScreenOpen(true)}
          />
        )}
      </View>
  );

  return (
    <View style={[styles.root, workLayout && styles.rootStacked, mobileExclusive && styles.rootMobile]}>
      {mobileExclusive && !previewOnly && mobilePane === "preview" ? (
        <View style={styles.mobilePreviewFill}>
          <Pressable
            onPress={() => setMobilePane("work")}
            style={styles.mobilePreviewBack}
            accessibilityRole="button"
            accessibilityLabel="Back to trip"
          >
            <ChevronLeft size={20} color={Theme.textPrimaryDark} strokeWidth={2.2} />
            <Text style={styles.mobilePreviewBackText}>
              {finalSettlement
                ? "Final Settlement"
                : settlementMode
                  ? "Settlement"
                  : previewOnly
                    ? "Awaiting POD"
                    : "POD files"}
            </Text>
          </Pressable>
          {previewPane}
        </View>
      ) : mobileExclusive && !previewOnly ? (
        workPane
      ) : previewOnly ? (
        <View style={styles.shopStage}>{previewPane}</View>
      ) : (
      <AdjustableSplitLayout
        storageKey="compliance.podPreview"
        enabled={!stacked}
        stacked={stacked}
        sizedPane="end"
        defaultSize={420}
        minSize={260}
        maxSize={720}
        start={workPane}
        end={previewPane}
      />
      )}

      {screenOpen && previewUrl && canViewDocument ? (
        <Modal visible transparent animationType="fade" onRequestClose={() => setScreenOpen(false)}>
          <View style={styles.fullScreen}>
            <Pressable
              style={styles.fullScreenClose}
              onPress={() => setScreenOpen(false)}
              accessibilityRole="button"
              accessibilityLabel="Close full screen"
            >
              <Text style={styles.fullScreenCloseText}>Close</Text>
            </Pressable>
            <View style={styles.fullScreenMedia}>
              <TripVaultFilePreview
                uri={previewUrl}
                isPdf={fileIsPdf(active ?? {})}
                sizing="fit"
                showToolbar
                style={{ flex: 1 }}
                accessibilityLabel={active?.file_name ?? "POD preview"}
              />
              <PodCopyWatermark kind={active ? podVerificationKind(active) : "soft"} />
            </View>
          </View>
        </Modal>
      ) : null}
      {logOpen ? (
        <ComplianceHardCopyPodSheet
          visible
          onClose={() => setLogOpen(false)}
          summary={summary}
          organizationId={organizationId || null}
          canManage={canManage}
          lrOptions={courierLrOptions}
          tripFacts={tripFacts}
          onChanged={async (ids) => {
            await Promise.all((ids.length ? ids : [summary.trip.id]).map((id) => onChanged(id)));
            setLogOpen(false);
          }}
        />
      ) : null}
      <ProvisionAdjustmentModal
        visible={provisionSide != null}
        side={provisionSide}
        onClose={closeProvision}
        onSave={saveProvisionNote}
        editTarget={provisionEdit}
        onUpdate={updateProvisionNote}
        launchPreset={provisionPreset}
        tripCode={getTripDisplayNumber(summary.trip, organizationId)}
        partyLabel={provisionSide === "client" ? clientName : costPartyName}
        clientName={clientName}
        supplierName={costPartyName}
        isAssetExecution={isAssetExecution}
        sales={baseSale}
        adjSales={adjSales}
        cost={baseCost}
        adjCost={adjCost}
        revenueSideDelta={adjSales - baseSale}
        costSideDelta={adjCost - baseCost}
        adjustments={adjustments}
        lineMetaLabel={provisionLineMetaLabel}
        onRequestDeduction={(rec) => {
          pendingPassThroughRef.current = rec;
        }}
      />
      <ProvisionNotePdfModal
        visible={notePdf != null}
        context={notePdf}
        onClose={() => setNotePdf(null)}
        onEdit={
          canManage && notePdf && !isAdjustmentVoided(notePdf.adjustment)
            ? (adj) => {
                setNotePdf(null);
                openPostedNote(adj);
              }
            : undefined
        }
      />
      <SettlementNoteActionModal
        action={noteAction}
        busy={noteBusy}
        error={noteError}
        onCancel={() => {
          setNoteAction(null);
          setNoteError(null);
        }}
        onSubmit={(values) => void submitNoteAction(values)}
      />
      <Modal visible={confirmRevalidate} transparent animationType="fade" onRequestClose={() => setConfirmRevalidate(false)}>
        <View style={[styles.noteModalOverlay, modalPad]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setConfirmRevalidate(false)} accessibilityLabel="Close" />
          <View style={styles.noteModal}>
            <Text style={styles.kicker}>Revalidate</Text>
            <Text style={styles.title}>Send back to POD Verification?</Text>
            <Text style={styles.meta}>
              Debit Control will see this trip on the Reverification tab and can update the POD charges.
            </Text>
            <View style={styles.exField}>
              <Text style={styles.exLabel}>Reason</Text>
              <TextInput
                value={revalidateReason}
                onChangeText={setRevalidateReason}
                placeholder="Why must this POD be reworked?"
                placeholderTextColor={Theme.textMuted}
                style={[styles.exInput, styles.noteReasonInput]}
                multiline
                accessibilityLabel="Revalidate reason"
              />
            </View>
            {noteError ? <Text style={styles.exError}>{noteError}</Text> : null}
            <View style={styles.exSubmitRow}>
              <RegistryGhostButton compact label="Cancel" onPress={() => setConfirmRevalidate(false)} />
              <RegistryPrimaryButton
                compact
                label={revalidate.isPending ? "Sending…" : "Revalidate"}
                onPress={() => void requestRevalidate()}
                disabled={revalidate.isPending || revalidateReason.trim().length < 3}
              />
            </View>
          </View>
        </View>
      </Modal>
      <Modal visible={confirmNotFound} transparent animationType="fade" onRequestClose={() => setConfirmNotFound(false)}>
        <View style={[styles.noteModalOverlay, modalPad]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setConfirmNotFound(false)} accessibilityLabel="Close" />
          <View style={styles.noteModal}>
            <Text style={styles.kicker}>POD not found</Text>
            <Text style={styles.title}>Return this trip to Awaiting POD?</Text>
            <Text style={styles.meta}>
              Use this when the hard copy was logged incorrectly and is not actually received. The trip goes back to Awaiting POD so it can be logged again.
            </Text>
            <View style={styles.exField}>
              <Text style={styles.exLabel}>Reason</Text>
              <TextInput
                value={notFoundReason}
                onChangeText={setNotFoundReason}
                placeholder="Why is this POD not received?"
                placeholderTextColor={Theme.textMuted}
                style={[styles.exInput, styles.noteReasonInput]}
                multiline
                accessibilityLabel="POD not found reason"
              />
            </View>
            {noteError ? <Text style={styles.exError}>{noteError}</Text> : null}
            <View style={styles.exSubmitRow}>
              <RegistryGhostButton compact label="Cancel" onPress={() => setConfirmNotFound(false)} />
              <RegistryPrimaryButton
                compact
                label={notFound.isPending ? "Returning…" : "Return to Awaiting POD"}
                onPress={() => void submitPodNotFound()}
                disabled={notFound.isPending || notFoundReason.trim().length < 3}
              />
            </View>
          </View>
        </View>
      </Modal>
      <ThemedConfirmModal
        visible={confirmDeleteFile}
        title="Delete this POD file?"
        message="The scan is removed from this trip. The receipt log stays until you edit it."
        confirmText={fileBusy ? "Deleting…" : "Delete"}
        cancelText="Cancel"
        variant="warning"
        onCancel={() => setConfirmDeleteFile(false)}
        onConfirm={() => void deleteActivePodFile()}
      />
      <ThemedConfirmModal
        visible={confirmValidated}
        title="Validate this POD?"
        message={
          noDebit
            ? "No debit identified. This completes POD verification without CN / DN and moves the trip to Settlement Verification."
            : "This completes POD verification and moves the trip to Settlement Verification. CN / DN apply for the logged debit."
        }
        confirmText="Proceed"
        cancelText="Cancel"
        variant="positive"
        onCancel={() => setConfirmValidated(false)}
        onConfirm={() => {
          setConfirmValidated(false);
          void completeValidation();
        }}
      />
      <ThemedConfirmModal
        visible={confirmSettle}
        title="Proceed to Final Settlement?"
        message={pendingPodCnDnAlertMessage(pendingNotes)}
        confirmText="Proceed"
        cancelText="Cancel"
        variant={pendingNotes.length > 0 ? "warning" : "positive"}
        onCancel={() => setConfirmSettle(false)}
        onConfirm={() => void requestSettle()}
      />
    </View>
  );
}

function clampPreviewZoom(value: number): number {
  return Math.min(4, Math.max(0.5, value));
}

function CnDnNotePreview({
  context,
  onExpand,
}: {
  context: ProvisionNotePdfContext;
  onExpand: () => void;
}) {
  const html = buildProvisionNotePreviewHtml(context);
  const cancelled = isAdjustmentVoided(context.adjustment);
  const kind = context.adjustment.impact === "minus" ? "CN" : "DN";
  const title = context.adjustment.impact === "minus" ? "Credit note" : "Debit note";
  return (
    <>
      <View style={styles.docToolbar}>
        <Text style={styles.docToolbarTitle} numberOfLines={1}>
          {title}
          {cancelled ? " · Cancelled" : ""}
        </Text>
        <View style={styles.docToolbarActions}>
          <Pressable
            style={styles.docToolBtn}
            onPress={onExpand}
            accessibilityRole="button"
            accessibilityLabel={`Open ${kind} full screen`}
          >
            <Maximize2 size={12} color={Theme.textPrimaryDark} />
          </Pressable>
        </View>
      </View>
      <View style={styles.docBody}>
        <View style={styles.cnPreview}>
          {Platform.OS === "web" ? (
            <iframe
              srcDoc={html}
              title={title}
              style={{ width: "100%", height: "100%", border: "none", backgroundColor: "#eef2f6" }}
            />
          ) : (
            <NativeHtmlWebView html={html} docPreview style={styles.cnPreviewFill} />
          )}
          {cancelled ? (
            <PodCopyWatermark label="Cancelled" tone="cancelled" />
          ) : null}
        </View>
      </View>
      <View style={styles.docFooter}>
        <Text style={styles.docFooterMeta} numberOfLines={1}>
          {cancelled
            ? `Cancelled${context.adjustment.void_reason ? ` · ${context.adjustment.void_reason}` : ""}`
            : `${kind} · ${context.partyName}`}
        </Text>
      </View>
    </>
  );
}

function PodShopPreview({
  title,
  fileName,
  uri,
  isPdf,
  loading,
  zoom,
  rotation,
  index,
  files,
  selectedId,
  onSelect,
  tripLabel,
  onFileSince,
  logged,
  receiptDetail,
  canLog,
  onLog,
  canEditFiles,
  fileBusy,
  fileError,
  onAdd,
  onEdit,
  onDelete,
  onActivityLog,
  onZoom,
  onRotate,
  onOriginal,
  onExpand,
}: {
  title: string;
  fileName: string | null;
  uri: string | null;
  isPdf: boolean;
  loading: boolean;
  zoom: number;
  rotation: number;
  index: number;
  files: { id: string; label: string }[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  tripLabel: string;
  onFileSince: string | null;
  logged: boolean;
  receiptDetail: string;
  canLog: boolean;
  onLog: () => void;
  canEditFiles: boolean;
  fileBusy: boolean;
  fileError: string | null;
  onAdd: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onActivityLog?: () => void;
  onZoom: (next: number) => void;
  onRotate: () => void;
  onOriginal: () => void;
  onExpand: () => void;
}) {
  const toolsEnabled = Boolean(uri);
  const ink = toolsEnabled ? Theme.actionBtnInk : Theme.textMuted;
  const [hand, setHand] = useState(true);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const handRef = useRef(hand);
  const panRef = useRef(pan);
  handRef.current = hand;
  panRef.current = pan;
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const shopStageRef = useRef<View>(null);
  useEffect(() => {
    if (Platform.OS !== "web" || !hand || !toolsEnabled) return;
    const node = shopStageRef.current as unknown as HTMLElement | null;
    if (!node?.addEventListener) return;
    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest?.("button, a, [role='button']")) return;
      drag.current = {
        x: event.clientX,
        y: event.clientY,
        px: panRef.current.x,
        py: panRef.current.y,
      };
      try {
        node.setPointerCapture(event.pointerId);
      } catch {
        /* ignore */
      }
      node.style.cursor = "grabbing";
    };
    const onPointerMove = (event: PointerEvent) => {
      const start = drag.current;
      if (!start) return;
      setPan({
        x: start.px + (event.clientX - start.x),
        y: start.py + (event.clientY - start.y),
      });
    };
    const endPointer = (event: PointerEvent) => {
      drag.current = null;
      try {
        node.releasePointerCapture(event.pointerId);
      } catch {
        /* ignore */
      }
      node.style.cursor = "grab";
    };
    const onWheel = (event: WheelEvent) => {
      if (!handRef.current) return;
      event.preventDefault();
      setPan((current) => ({
        x: current.x - event.deltaX,
        y: current.y - event.deltaY,
      }));
    };
    node.addEventListener("pointerdown", onPointerDown);
    node.addEventListener("pointermove", onPointerMove);
    node.addEventListener("pointerup", endPointer);
    node.addEventListener("pointercancel", endPointer);
    node.addEventListener("wheel", onWheel, { passive: false });
    node.style.cursor = "grab";
    return () => {
      node.removeEventListener("pointerdown", onPointerDown);
      node.removeEventListener("pointermove", onPointerMove);
      node.removeEventListener("pointerup", endPointer);
      node.removeEventListener("pointercancel", endPointer);
      node.removeEventListener("wheel", onWheel);
      node.style.cursor = "";
    };
  }, [hand, toolsEnabled, uri]);
  const handPan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: () => handRef.current,
        onPanResponderGrant: (event) => {
          drag.current = {
            x: event.nativeEvent.pageX,
            y: event.nativeEvent.pageY,
            px: panRef.current.x,
            py: panRef.current.y,
          };
        },
        onPanResponderMove: (event) => {
          const start = drag.current;
          if (!start) return;
          setPan({
            x: start.px + (event.nativeEvent.pageX - start.x),
            y: start.py + (event.nativeEvent.pageY - start.y),
          });
        },
        onPanResponderRelease: () => {
          drag.current = null;
        },
        onPanResponderTerminationRequest: () => false,
        onPanResponderTerminate: () => {
          drag.current = null;
        },
      }),
    [],
  );
  useEffect(() => {
    setPan({ x: 0, y: 0 });
  }, [uri, rotation, zoom === 1]);
  const editInk = canEditFiles && !fileBusy ? Theme.actionBtnInk : Theme.textMuted;
  const activityLogButton = onActivityLog ? (
    <Pressable
      style={styles.shopToolBtn}
      onPress={onActivityLog}
      accessibilityRole="button"
      accessibilityLabel="View activity log"
    >
      <Clock size={10} color={Theme.actionBtnInk} strokeWidth={2.1} />
      <Text style={styles.shopToolText}>Log</Text>
    </Pressable>
  ) : null;
  const toolbar = (
    <View style={styles.shopOverlay} pointerEvents="box-none">
      <View style={styles.shopToolbar}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.shopToolbarScroll}
          contentContainerStyle={styles.shopToolbarTools}
        >
          {canEditFiles ? (
            <>
              <Pressable
                style={[styles.shopToolBtn, fileBusy && styles.docToolDisabled]}
                onPress={onAdd}
                disabled={fileBusy}
                accessibilityRole="button"
                accessibilityLabel={`Add more ${title}`}
              >
                <Plus size={10} color={editInk} />
                <Text style={styles.shopToolText}>Add more</Text>
              </Pressable>
              <Pressable
                style={[styles.shopToolBtn, (!toolsEnabled || fileBusy) && styles.docToolDisabled]}
                onPress={onEdit}
                disabled={!toolsEnabled || fileBusy}
                accessibilityRole="button"
                accessibilityLabel={`Edit ${title}`}
              >
                <Pencil size={10} color={toolsEnabled && !fileBusy ? Theme.actionBtnInk : Theme.textMuted} strokeWidth={2} />
                <Text style={styles.shopToolText}>Edit</Text>
              </Pressable>
              <Pressable
                style={[styles.shopToolBtn, (!toolsEnabled || fileBusy) && styles.docToolDisabled]}
                onPress={onDelete}
                disabled={!toolsEnabled || fileBusy}
                accessibilityRole="button"
                accessibilityLabel={`Delete ${title}`}
              >
                <Trash2 size={10} color={toolsEnabled && !fileBusy ? Theme.actionBtnInk : Theme.textMuted} strokeWidth={2} />
                <Text style={styles.shopToolText}>Delete</Text>
              </Pressable>
              <View style={styles.shopToolDivider} />
            </>
          ) : null}
          {canLog ? (
            <>
              <Pressable
                style={styles.shopToolBtn}
                onPress={onLog}
                accessibilityRole="button"
                accessibilityLabel={logged ? "Edit the POD log" : "Log POD"}
              >
                <Plus size={10} color={Theme.actionBtnInk} />
                <Text style={styles.shopToolText}>Log POD</Text>
              </Pressable>
              <View style={styles.shopToolDivider} />
            </>
          ) : null}
          <View style={styles.shopZoom}>
            <Pressable
              onPress={() => onZoom(clampPreviewZoom(zoom - 0.25))}
              disabled={!toolsEnabled || zoom <= 0.5}
              style={!toolsEnabled && styles.docToolDisabled}
              accessibilityRole="button"
              accessibilityLabel="Zoom out"
            >
              <Minus size={10} color={ink} />
            </Pressable>
            <Text style={styles.shopZoomLabel}>{Math.round(zoom * 100)}%</Text>
            <Pressable
              onPress={() => onZoom(clampPreviewZoom(zoom + 0.25))}
              disabled={!toolsEnabled}
              style={!toolsEnabled && styles.docToolDisabled}
              accessibilityRole="button"
              accessibilityLabel="Zoom in"
            >
              <Plus size={10} color={ink} />
            </Pressable>
          </View>
          <Pressable
            style={[
              styles.shopToolBtn,
              hand && toolsEnabled && styles.shopToolBtnOn,
              !toolsEnabled && styles.docToolDisabled,
            ]}
            onPress={() => {
              setHand((current) => !current);
              if (hand) setPan({ x: 0, y: 0 });
            }}
            disabled={!toolsEnabled}
            accessibilityRole="button"
            accessibilityLabel="Hand"
            accessibilityState={{ selected: hand && toolsEnabled }}
          >
            <Hand size={10} color={ink} strokeWidth={2.1} />
            <Text style={styles.shopToolText}>Hand</Text>
          </Pressable>
          <Pressable
            style={[styles.shopToolBtn, !toolsEnabled && styles.docToolDisabled]}
            onPress={onRotate}
            disabled={!toolsEnabled}
            accessibilityRole="button"
            accessibilityLabel="Rotate"
          >
            <RotateCwSquare size={10} color={ink} strokeWidth={2.1} />
            <Text style={styles.shopToolText}>Rotate</Text>
          </Pressable>
          <Pressable
            style={[styles.shopToolBtn, !toolsEnabled && styles.docToolDisabled]}
            onPress={onOriginal}
            disabled={!toolsEnabled}
            accessibilityRole="button"
            accessibilityLabel="Original"
          >
            <Scan size={10} color={ink} strokeWidth={2.1} />
            <Text style={styles.shopToolText}>Original</Text>
          </Pressable>
          <Pressable
            style={[styles.shopToolBtn, !toolsEnabled && styles.docToolDisabled]}
            onPress={onExpand}
            disabled={!toolsEnabled}
            accessibilityRole="button"
            accessibilityLabel={`Open ${title} full screen`}
          >
            <Maximize2 size={10} color={ink} />
            <Text style={styles.shopToolText}>Full view</Text>
          </Pressable>
        </ScrollView>
        {activityLogButton}
      </View>
    </View>
  );
  const ordinal = files.length > 0 ? index + 1 : 0;
  const when = onFileSince ? new Date(onFileSince) : null;
  const onFileLabel =
    when && !Number.isNaN(when.getTime())
      ? when.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
      : uri
        ? "On file"
        : "Awaiting upload";
  const pageLine = [
    fileName?.trim() || null,
    files.length > 0 ? `${ordinal} of ${files.length}` : null,
    tripLabel ? `# ${tripLabel}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <View style={styles.shopRoot}>
      {files.length > 0 ? (
        <ScrollView
          style={styles.shopRail}
          contentContainerStyle={styles.shopRailContent}
          showsVerticalScrollIndicator={false}
        >
          {files.map((file, fileIndex) => {
            const selected = file.id === selectedId;
            return (
              <Pressable
                key={file.id}
                onPress={() => onSelect(file.id)}
                style={[styles.shopThumb, selected && styles.shopThumbOn]}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={`${file.label} ${fileIndex + 1}`}
              >
                <Feather name="file-text" size={16} color={selected ? Theme.textPrimaryDark : Theme.textMuted} />
                <Text style={[styles.shopThumbText, selected && styles.shopThumbTextOn]}>{file.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}
      <View style={styles.shopMain}>
        <View style={styles.shopHero}>
          {loading ? (
            <View style={styles.docEmpty}>
              <ActivityIndicator color={Theme.textPrimaryDark} />
              <Text style={styles.docEmptyHint}>Loading document…</Text>
            </View>
          ) : uri ? (
            <View ref={shopStageRef} style={styles.shopDoc}>
              <View
                style={[
                  styles.docMedia,
                  hand && toolsEnabled ? styles.docMediaHand : null,
                  {
                    transform: [
                      { translateX: pan.x },
                      { translateY: pan.y },
                      { rotate: `${rotation}deg` },
                      { scale: zoom },
                    ],
                  },
                ]}
                {...(hand && toolsEnabled ? handPan.panHandlers : {})}
              >
                <TripVaultFilePreview
                  uri={uri}
                  isPdf={isPdf}
                  sizing="fit"
                  zoom={zoom}
                  style={styles.docMediaFill}
                  accessibilityLabel={fileName?.trim() || title}
                />
              </View>
              {toolbar}
            </View>
          ) : (
            <View style={styles.shopDrop}>
              <Pressable
                style={styles.shopDropBody}
                onPress={canLog ? onLog : canEditFiles ? onAdd : undefined}
                disabled={!canLog && !canEditFiles}
                accessibilityRole={canLog || canEditFiles ? "button" : "text"}
                accessibilityLabel={
                  canLog
                    ? "Log the hard-copy POD"
                    : canEditFiles
                      ? `Add ${title}`
                      : "No POD to preview"
                }
              >
                <View style={styles.shopDropIcon}>
                  <Upload size={22} color={Theme.actionBtnInk} strokeWidth={2} />
                </View>
                <Text style={styles.shopDropTitle}>Log the hard-copy POD</Text>
                <Text style={styles.shopDropHint}>
                  {canLog
                    ? "Upload the scan, then record a desk receipt, courier, or lost POD."
                    : "No soft-copy or hard-copy POD is on file for this trip."}
                </Text>
                {canLog ? (
                  <View style={styles.shopDropBtn}>
                    <Text style={styles.shopDropBtnText}>Log POD</Text>
                  </View>
                ) : null}
              </Pressable>
              {toolbar}
            </View>
          )}
        </View>
        <View style={styles.shopFooter}>
          <Text style={styles.shopFooterTitle} numberOfLines={1}>
            {title}
          </Text>
          <Text style={styles.shopFooterMeta} numberOfLines={1}>
            {pageLine || receiptDetail}
          </Text>
          <View style={[styles.shopStatus, !uri && styles.shopStatusPending]}>
            <Text style={styles.shopStatusKicker}>{uri ? "On file since" : "Status"}</Text>
            <Text style={styles.shopStatusValue} numberOfLines={1}>
              {onFileLabel}
            </Text>
          </View>
          <Text
            style={[styles.shopReceipt, fileError ? styles.shopReceiptError : null]}
            numberOfLines={2}
          >
            {fileError || receiptDetail}
          </Text>
        </View>
      </View>
    </View>
  );
}

function SettlementChargeNotesCard({
  stacked = false,
  mobileExclusive = false,
  drafts,
  created,
  pending,
  plannedDelivery,
  actualDelivery,
  error,
  creating,
  canManage,
  finalSettlement = false,
  vendorCharges,
  tdsAmount = 0,
  documentationCharges = 0,
  advancePaid = 0,
  balancePaid = 0,
  ledgerPaid = 0,
  remainingPayable = 0,
  balancePosted = false,
  adjustments,
  clientName,
  supplierName,
  costLaneLabel = "Vendor cost",
  isAssetExecution = false,
  sales,
  adjSales,
  cost,
  adjCost,
  onCreate,
  onAdjustClient,
  onAdjustVendor,
  onCreateDraft,
  onViewNotePdf,
  onSelectedAdjustmentChange,
  onEditAdjustment,
  onEdit: _onEdit,
  onRevoke: _onRevoke,
  onRevalidate,
  onProceed,
  onPayBalance,
  canPayBalance = false,
  payingBalance = false,
  canRevalidate = false,
  proceeding = false,
  revalidating,
}: {
  stacked?: boolean;
  mobileExclusive?: boolean;
  drafts: PodCnDnDraft[];
  created: PodCnDnDraft[];
  pending: PodCnDnDraft[];
  plannedDelivery: string | null;
  actualDelivery: string;
  error: string | null;
  creating: boolean;
  canManage: boolean;
  finalSettlement?: boolean;
  clientCharges?: PodChargeLines | null;
  vendorCharges?: PodChargeLines | null;
  tdsAmount?: number;
  documentationCharges?: number;
  advancePaid?: number;
  balancePaid?: number;
  ledgerPaid?: number;
  remainingPayable?: number;
  balancePosted?: boolean;
  adjustments: TripAdjustment[];
  clientName: string;
  supplierName: string;
  costLaneLabel?: string;
  isAssetExecution?: boolean;
  sales: number;
  adjSales: number;
  cost: number;
  adjCost: number;
  onCreate: () => void;
  onAdjustClient: () => void;
  onAdjustVendor: () => void;
  onCreateDraft: (draft: PodCnDnDraft) => void;
  onViewNotePdf?: (adj: TripAdjustment) => void;
  onSelectedAdjustmentChange?: (adj: TripAdjustment | null) => void;
  onEditAdjustment?: (adj: TripAdjustment) => void;
  onEdit: (draft: PodCnDnDraft) => void;
  onRevoke: (draft: PodCnDnDraft) => void;
  onRevalidate: () => void;
  onProceed: () => void;
  onPayBalance?: () => void;
  canPayBalance?: boolean;
  payingBalance?: boolean;
  canRevalidate?: boolean;
  proceeding?: boolean;
  revalidating: boolean;
}) {
  const createdKeys = new Set(created.map((item) => item.missionKey));
  const clientNotes = drafts.filter((item) => item.party === "client");
  const vendorNotes = drafts.filter((item) => isPodCostParty(item.party));
  const posted = drafts.length > 0 && pending.length === 0;
  const tableManage = canManage && !finalSettlement;
  const showFinalActions = finalSettlement && (canRevalidate || canPayBalance || Boolean(onPayBalance));

  return (
    <View style={[styles.logCard, mobileExclusive && styles.logCardMobile]}>
      <View style={styles.logHead}>
        <View style={styles.logHeadCopy}>
          <Text style={styles.kicker}>{finalSettlement ? "Settled from POD" : "Updated from POD"}</Text>
          <Text style={styles.title}>
            {finalSettlement
              ? drafts.length === 0
                ? "No debit — payable without CN / DN"
                : "Revenue and cost after CN / DN"
              : drafts.length === 0
                ? "No debit identified"
                : "Exceptions and extra charges"}
          </Text>
          <Text style={styles.meta}>
            {plannedDelivery
              ? `Planned ${formatPodDate(plannedDelivery)}${actualDelivery ? ` · Actual ${formatPodDate(actualDelivery)}` : ""}`
              : isAssetExecution
                ? "Client sale (revenue) and driver pay from the saved POD"
                : "Client sale (revenue) and vendor cost from the saved POD"}
          </Text>
        </View>
      </View>
      {finalSettlement ? (
        <View style={[styles.provisionTotals, stacked && styles.provisionTotalsStacked]}>
          <SettlementAdjustmentLane
            title="Client sale · revenue"
            party={clientName}
            base={sales}
            revised={adjSales}
            posted={clientNotes.filter((item) => createdKeys.has(item.missionKey))}
            pending={clientNotes.filter((item) => !createdKeys.has(item.missionKey))}
            adjustments={adjustments}
            onViewNotePdf={onViewNotePdf}
          />
          <SettlementAdjustmentLane
            title={isAssetExecution ? "Driver pay · own fleet" : "Vendor cost"}
            party={supplierName}
            base={cost}
            revised={adjCost}
            posted={vendorNotes.filter((item) => createdKeys.has(item.missionKey))}
            pending={vendorNotes.filter((item) => !createdKeys.has(item.missionKey))}
            adjustments={adjustments}
            onViewNotePdf={onViewNotePdf}
          />
        </View>
      ) : (
        <>
      <View style={styles.settleSummary}>
        <View style={[styles.methodIcon, pending.length > 0 ? styles.methodIconOn : styles.methodIconIdle]}>
          <Feather name="alert-circle" size={16} color={Theme.textPrimaryDark} />
        </View>
        <View style={styles.settleSummaryCopy}>
          <Text style={styles.settleSummaryTitle} numberOfLines={2}>
            {posted
              ? "CN / DN posted on this trip"
              : drafts.length > 0
                ? "Exception charges ready for CN / DN"
                : "No extra charges on this POD"}
          </Text>
          <Text style={styles.meta} numberOfLines={2}>
            {[
              drafts.length > 0
                ? `${clientNotes.length} client sale · ${vendorNotes.length} ${isAssetExecution ? "driver pay" : "vendor cost"}`
                : null,
              pending.length > 0
                ? `${pending.length} note${pending.length === 1 ? "" : "s"} still to create`
                : drafts.length > 0
                  ? "Late delivery uses the actual delivery date"
                  : null,
              actualDelivery ? formatPodDate(actualDelivery) : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </Text>
        </View>
        <View
          style={[
            styles.settleStatus,
            posted
              ? styles.settleStatusOn
              : drafts.length > 0
                ? styles.settleStatusReady
                : styles.settleStatusIdle,
          ]}
        >
          <Text
            style={[
              styles.settleStatusText,
              posted
                ? styles.settleStatusTextOn
                : drafts.length > 0
                  ? styles.settleStatusTextReady
                  : styles.settleStatusTextIdle,
            ]}
          >
            {posted ? "Posted" : drafts.length > 0 ? "Ready" : "Open"}
          </Text>
        </View>
      </View>
      <View style={[styles.provisionTotals, stacked && styles.provisionTotalsStacked]}>
        <Pressable
          style={styles.provisionTotal}
          onPress={canManage ? onAdjustClient : undefined}
          accessibilityRole="button"
          accessibilityLabel="Adjust client sale"
        >
          <Text style={styles.kicker}>Client sale</Text>
          <Text style={styles.provisionParty} numberOfLines={1}>
            {clientName}
          </Text>
          <Text style={styles.provisionAmount}>{formatInr(adjSales)}</Text>
          <Text style={styles.meta}>
            Base {formatInr(sales)}
            {adjSales !== sales ? ` · ${adjSales > sales ? "+" : ""}${formatInr(adjSales - sales)}` : ""}
          </Text>
        </Pressable>
        <Pressable
          style={styles.provisionTotal}
          onPress={canManage ? onAdjustVendor : undefined}
          accessibilityRole="button"
          accessibilityLabel={isAssetExecution ? "Adjust driver cost" : "Adjust vendor cost"}
        >
          <Text style={styles.kicker}>{costLaneLabel}</Text>
          <Text style={styles.provisionParty} numberOfLines={1}>
            {supplierName}
          </Text>
          <Text style={styles.provisionAmount}>{formatInr(adjCost)}</Text>
          <Text style={styles.meta}>
            Base {formatInr(cost)}
            {adjCost !== cost ? ` · ${adjCost > cost ? "+" : ""}${formatInr(adjCost - cost)}` : ""}
          </Text>
        </Pressable>
      </View>
        </>
      )}
      <SettlementPayableSummary
        pending={pending}
        tdsAmount={tdsAmount}
        documentationCharges={
          documentationCharges > 0 ? documentationCharges : moneyLine(vendorCharges, "documentCost")
        }
        advancePaid={advancePaid}
        balancePaid={balancePaid}
        ledgerPaid={ledgerPaid}
        remainingPayable={remainingPayable}
        balancePosted={balancePosted}
        payable={adjCost}
      />
      <View style={styles.noteTable}>
        {pending.length > 0 ? (
          <View style={styles.pendingStrip}>
            <Text style={styles.lanePendingTitle}>POD captured · not adjusted</Text>
            {pending.map((draft) => (
              <Pressable
                key={draft.missionKey}
                style={styles.laneRow}
                onPress={tableManage ? () => onCreateDraft(draft) : undefined}
                accessibilityRole={tableManage ? "button" : undefined}
                accessibilityLabel={`${draft.noteKind} ${draft.label} not adjusted`}
              >
                <Text style={styles.lanePendingLabel} numberOfLines={1}>
                  {draft.noteKind} {draft.label} · {draft.partyLabel}
                </Text>
                <Text style={styles.lanePendingValue}>{formatSignedInr(signedPodNoteAmount(draft))}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        <TripFinanceAdjustmentsPanel
          adjustments={adjustments}
          sales={sales}
          adjSales={adjSales}
          revenueSideDelta={adjSales - sales}
          cost={cost}
          adjCost={adjCost}
          costSideDelta={adjCost - cost}
          clientName={clientName}
          supplierName={supplierName}
          isAssetExecution={isAssetExecution}
          costLaneLabel={costLaneLabel}
          lineMetaLabel={provisionLineMetaLabel}
          canAddAdjustment={tableManage}
          onOpenProvision={(side) => (side === "client" ? onAdjustClient() : onAdjustVendor())}
          onViewNotePdf={onViewNotePdf}
          onSelectedAdjustmentChange={onSelectedAdjustmentChange}
          onEditAdjustment={onEditAdjustment}
          layout={stacked ? "mobile" : "desktop"}
          linesOnly
        />
      </View>
      {tableManage || showFinalActions ? (
        <View style={[styles.noteFooter, stacked && styles.noteFooterStacked]}>
          <View style={styles.noteFooterCopy}>
            {error ? <Text style={styles.exError}>{error}</Text> : null}
            <Text style={styles.meta} numberOfLines={2}>
              {finalSettlement
                ? pending.length > 0
                  ? `${pending.length} POD charge${pending.length === 1 ? "" : "s"} still not adjusted. Revalidate to rework, or pay the revised balance.`
                  : "Posts the remaining payable to the Finance ledger as a compliance balance."
                : pending.length === 0
                  ? "CN / DN for these POD charges are already on revised sale and cost."
                  : isAssetExecution
                    ? "Own-fleet extras go to the driver (pay or deduct), not a vendor CN / DN."
                    : "Opens the filled CN / DN from the POD charge. Confirm the amount, then the next pending note."}
            </Text>
          </View>
          {stacked ? (
            <View style={styles.validateActionsStacked}>
              <RegistryGhostButton
                label={revalidating ? "Sending…" : "Revalidate"}
                onPress={onRevalidate}
                disabled={!canRevalidate || revalidating || proceeding || payingBalance}
                style={styles.validateBtnStacked}
              />
              {finalSettlement ? (
                <RegistryPrimaryButton
                  label={
                    payingBalance ? "Posting…" : summaryBalanceLabel(canPayBalance)
                  }
                  onPress={() => onPayBalance?.()}
                  disabled={!canPayBalance || payingBalance || revalidating}
                  style={styles.validateBtnStacked}
                />
              ) : (
                <>
                  <RegistryPrimaryButton
                    label={creating ? "Creating…" : pending.length === 0 ? "Created" : "Create CN / DN"}
                    onPress={onCreate}
                    disabled={creating || pending.length === 0}
                    style={styles.validateBtnStacked}
                  />
                  <RegistryPrimaryButton
                    label={proceeding ? "Moving…" : "Proceed to settlement"}
                    onPress={onProceed}
                    disabled={proceeding || (drafts.length > 0 && created.length === 0)}
                    style={styles.validateBtnStacked}
                  />
                </>
              )}
            </View>
          ) : (
          <RegistryCardActions>
            <RegistryGhostButton
              label={revalidating ? "Sending…" : "Revalidate"}
              onPress={onRevalidate}
              disabled={!canRevalidate || revalidating || proceeding || payingBalance}
            />
            {finalSettlement ? (
              <RegistryPrimaryButton
                label={payingBalance ? "Posting…" : summaryBalanceLabel(canPayBalance)}
                onPress={() => onPayBalance?.()}
                disabled={!canPayBalance || payingBalance || revalidating}
              />
            ) : (
              <>
                <RegistryPrimaryButton
                  label={creating ? "Creating…" : pending.length === 0 ? "Created" : "Create CN / DN"}
                  onPress={onCreate}
                  disabled={creating || pending.length === 0}
                />
                <RegistryPrimaryButton
                  label={proceeding ? "Moving…" : "Proceed to settlement"}
                  onPress={onProceed}
                  disabled={proceeding || (drafts.length > 0 && created.length === 0)}
                />
              </>
            )}
          </RegistryCardActions>
          )}
        </View>
      ) : null}
    </View>
  );
}

function moneyLine(lines: PodChargeLines | null | undefined, key: keyof PodChargeLines): number {
  const amount = Number(lines?.[key]);
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
}

function summaryBalanceLabel(canPay: boolean): string {
  return canPay ? "Pay balance" : "Paid";
}

function formatSignedInr(amount: number): string {
  if (amount < 0) return `− ${formatInr(Math.abs(amount))}`;
  if (amount > 0) return `+ ${formatInr(amount)}`;
  return formatInr(0);
}

function SettlementAdjustmentLane({
  title,
  party,
  base,
  revised,
  posted,
  pending,
  adjustments,
  onViewNotePdf,
}: {
  title: string;
  party: string;
  base: number;
  revised: number;
  posted: PodCnDnDraft[];
  pending: PodCnDnDraft[];
  adjustments: TripAdjustment[];
  onViewNotePdf?: (adj: TripAdjustment) => void;
}) {
  return (
    <View style={styles.provisionTotal} accessibilityLabel={title}>
      <Text style={styles.kicker}>{title}</Text>
      <Text style={styles.provisionParty} numberOfLines={1}>
        {party}
      </Text>
      <View style={styles.laneRow}>
        <Text style={styles.laneLabel}>Base</Text>
        <Text style={styles.laneValue}>{formatInr(base)}</Text>
      </View>
      {posted.length === 0 ? (
        <View style={styles.laneRow}>
          <Text style={styles.laneLabel}>CN / DN posted</Text>
          <Text style={styles.laneValue}>{formatInr(0)}</Text>
        </View>
      ) : (
        posted.map((draft) => {
          const postedAdj = podCnDnAdjustmentFor(adjustments, draft.missionKey);
          const signed = signedPodNoteAmount(draft, postedAdj);
          return (
            <Pressable
              key={draft.missionKey}
              style={styles.laneRow}
              onPress={postedAdj && onViewNotePdf ? () => onViewNotePdf(postedAdj) : undefined}
              accessibilityRole={postedAdj && onViewNotePdf ? "button" : undefined}
              accessibilityLabel={`Preview ${draft.noteKind} ${draft.label}`}
            >
              <Text style={[styles.laneLabel, signed < 0 && styles.payableLabelDeduct]} numberOfLines={1}>
                {draft.noteKind} {draft.label}
              </Text>
              <Text style={[styles.laneValue, signed < 0 && styles.payableValueDeduct]}>
                {formatSignedInr(signed)}
              </Text>
            </Pressable>
          );
        })
      )}
      <View style={[styles.laneRow, styles.laneRowOn]}>
        <Text style={styles.laneLabelOn}>Revised</Text>
        <Text style={styles.laneValueOn}>{formatInr(revised)}</Text>
      </View>
      {pending.length > 0 ? (
        <View style={styles.lanePendingBlock}>
          <Text style={styles.lanePendingTitle}>POD captured · not adjusted</Text>
          {pending.map((draft) => (
            <View key={draft.missionKey} style={styles.laneRow}>
              <Text style={styles.lanePendingLabel} numberOfLines={1}>
                {draft.noteKind} {draft.label}
              </Text>
              <Text style={styles.lanePendingValue}>{formatSignedInr(signedPodNoteAmount(draft))}</Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.laneClear}>All POD charges on this side are adjusted</Text>
      )}
    </View>
  );
}

function SettlementPayableSummary({
  pending,
  tdsAmount,
  documentationCharges,
  advancePaid,
  balancePaid,
  ledgerPaid,
  remainingPayable,
  balancePosted,
  payable,
}: {
  pending: readonly PodCnDnDraft[];
  tdsAmount: number;
  documentationCharges: number;
  advancePaid: number;
  balancePaid: number;
  ledgerPaid: number;
  remainingPayable: number;
  balancePosted: boolean;
  payable: number;
}) {
  const next = podSettlementPayable({
    revisedCost: payable,
    pending,
    tdsAmount,
    documentationCharges,
    advancePaid: 0,
    balancePaid: 0,
  });
  const extraLedger = Math.max(0, Math.round((ledgerPaid - advancePaid - balancePaid) * 100) / 100);
  type PayableRow = { label: string; value: string; emphasize?: boolean; deduct?: boolean };
  const rows: PayableRow[] = ([
    { label: "Revised vendor / driver payable", value: formatInr(next.revisedPayable) },
    {
      label: "POD not adjusted",
      value: formatSignedInr(next.unadjustedCost),
      deduct: next.unadjustedCost < 0,
    },
    {
      label: "TDS",
      value: next.tdsAmount > 0 ? `− ${formatInr(next.tdsAmount)}` : formatInr(0),
      deduct: next.tdsAmount > 0,
    },
    {
      label: "Documentation charges",
      value: next.documentationCharges > 0 ? `− ${formatInr(next.documentationCharges)}` : formatInr(0),
      deduct: next.documentationCharges > 0,
    },
    { label: "Actual payable", value: formatInr(next.actualPayable), emphasize: true },
    {
      label: advancePaid > 0 ? "Advance paid" : "Advance paid",
      value: formatInr(advancePaid),
    },
    extraLedger > 0 && advancePaid > 0
      ? { label: "Other ledger paid", value: formatInr(extraLedger) }
      : null,
    balancePosted ? { label: "Balance paid", value: formatInr(balancePaid) } : null,
    {
      label: remainingPayable > 0 || !balancePosted ? "Balance to pay" : "Balance to pay",
      value: formatInr(remainingPayable),
      emphasize: true,
    },
  ] as (PayableRow | null)[]).filter((row): row is PayableRow => row != null);
  return (
    <View style={styles.payableCard}>
      <Text style={styles.payableTitle}>Payable after POD</Text>
      {rows.map((row) => (
        <View
          key={row.label}
          style={[styles.payableRow, row.emphasize && styles.payableRowOn]}
        >
          <Text
            style={[
              styles.payableLabel,
              row.emphasize && styles.payableLabelOn,
              row.deduct && styles.payableLabelDeduct,
            ]}
          >
            {row.label}
          </Text>
          <Text
            style={[
              styles.payableValue,
              row.emphasize && styles.payableValueOn,
              row.deduct && styles.payableValueDeduct,
            ]}
          >
            {row.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

function _SettlementNoteGroup({
  stacked = false,
  title,
  drafts,
  createdKeys,
  adjustments,
  canManage,
  onCreateDraft,
  onEdit,
  onRevoke,
}: {
  stacked?: boolean;
  title: string;
  drafts: PodCnDnDraft[];
  createdKeys: Set<string>;
  adjustments: TripAdjustment[];
  canManage: boolean;
  onCreateDraft: (draft: PodCnDnDraft) => void;
  onEdit: (draft: PodCnDnDraft) => void;
  onRevoke: (draft: PodCnDnDraft) => void;
}) {
  return (
    <View style={styles.noteGroup}>
      <Text style={styles.noteParty}>{title}</Text>
      {drafts.map((draft) => {
        const created = createdKeys.has(draft.missionKey);
        const posted = podCnDnAdjustmentFor(adjustments, draft.missionKey);
        return (
          <View
            key={draft.missionKey}
            style={[styles.noteCols, styles.noteRow, stacked && styles.noteRowStacked]}
          >
            <View style={stacked ? styles.noteStackedLead : styles.noteTypeCol}>
              <View style={[styles.notePill, draft.noteKind === "CN" ? styles.notePillCn : styles.notePillDn]}>
                <Text style={[styles.notePillText, draft.noteKind === "CN" ? styles.notePillTextCn : styles.notePillTextDn]}>
                  {draft.noteKind}
                </Text>
              </View>
              {stacked ? (
                <Text style={styles.noteCharge} numberOfLines={2}>
                  {draft.label}
                </Text>
              ) : null}
            </View>
            {stacked ? null : (
              <View style={styles.noteChargeCol}>
                <Text style={styles.noteCharge} numberOfLines={1}>
                  {draft.label}
                </Text>
              </View>
            )}
            {stacked ? (
              <View style={styles.noteStackedMeta}>
                <Text style={[styles.noteAmount, styles.noteAmountStacked]} numberOfLines={1}>
                  {formatInr(posted?.amount ?? draft.amount)}
                </Text>
                <Text
                  style={[styles.noteState, styles.noteStateStacked, created ? styles.noteStateOn : styles.noteStateOff]}
                  numberOfLines={1}
                >
                  {created ? "Created" : "Pending"}
                </Text>
              </View>
            ) : (
              <>
                <View style={styles.noteAmountCol}>
                  <Text style={styles.noteAmount} numberOfLines={1}>
                    {formatInr(posted?.amount ?? draft.amount)}
                  </Text>
                </View>
                <View style={styles.noteStateCol}>
                  <Text
                    style={[styles.noteState, created ? styles.noteStateOn : styles.noteStateOff]}
                    numberOfLines={1}
                  >
                    {created ? "Created" : "Pending"}
                  </Text>
                </View>
              </>
            )}
            {canManage && created ? (
              <View style={[styles.noteActionCol, stacked && styles.noteActionColStacked]}>
                <Pressable onPress={() => onEdit(draft)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Edit ${draft.label}`}>
                  <Text style={styles.noteAction}>Edit</Text>
                </Pressable>
                <Pressable onPress={() => onRevoke(draft)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Revoke ${draft.label}`}>
                  <Text style={styles.noteActionDanger}>Revoke</Text>
                </Pressable>
              </View>
            ) : canManage ? (
              <View style={[styles.noteActionCol, stacked && styles.noteActionColStacked]}>
                <Pressable
                  onPress={() => onCreateDraft(draft)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={`Create ${draft.noteKind} ${draft.label}`}
                >
                  <Text style={styles.noteAction}>Create</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

function SettlementNoteActionModal({
  action,
  busy,
  error,
  onCancel,
  onSubmit,
}: {
  action: { kind: "revoke"; draft: PodCnDnDraft } | null;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (values: { reason: string }) => void;
}) {
  const [reason, setReason] = useState("");

  useEffect(() => {
    setReason("");
  }, [action]);

  const canSubmit = reason.trim().length >= 3;
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={action != null} transparent animationType="fade" onRequestClose={onCancel}>
      <View
        style={[
          styles.noteModalOverlay,
          { paddingTop: Math.max(16, insets.top + 12), paddingBottom: Math.max(16, insets.bottom + 12) },
        ]}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} accessibilityLabel="Close" />
        <View style={styles.noteModal}>
          <Text style={styles.kicker}>Revoke CN / DN</Text>
          <Text style={styles.title}>
            {action ? `${action.draft.noteKind} · ${action.draft.partyLabel} · ${action.draft.label}` : "Note"}
          </Text>
          <Text style={styles.meta}>This voids the note on revised sale or cost. Enter why you are revoking it.</Text>
          <View style={styles.exField}>
            <Text style={styles.exLabel}>Reason</Text>
            <TextInput
              value={reason}
              onChangeText={setReason}
              placeholder="Why is this note revoked?"
              placeholderTextColor={Theme.textMuted}
              style={[styles.exInput, styles.noteReasonInput]}
              multiline
              accessibilityLabel="Reason"
            />
          </View>
          {error ? <Text style={styles.exError}>{error}</Text> : null}
          <View style={styles.exSubmitRow}>
            <RegistryGhostButton compact label="Cancel" onPress={onCancel} />
            <RegistryPrimaryButton
              compact
              label={busy ? "Saving…" : "Revoke"}
              onPress={() => onSubmit({ reason })}
              disabled={busy || !canSubmit}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

function lateDeliveryDays(plannedIso: string | null | undefined, actualIso: string): number | null {
  const planned = String(plannedIso ?? "").trim().slice(0, 10);
  const actual = actualIso.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(planned) || !/^\d{4}-\d{2}-\d{2}$/.test(actual)) return null;
  return Math.round(
    (new Date(`${actual}T12:00:00`).getTime() - new Date(`${planned}T12:00:00`).getTime()) /
      86_400_000,
  );
}

function amountEntered(value: string): boolean {
  const raw = value.trim();
  if (!raw) return false;
  return raw !== "0";
}

type ExceptionKind = "loading" | "unloading" | "damage" | "productMissing" | "halting" | "late";

const EXCEPTION_KIND_OPTIONS: {
  key: ExceptionKind;
  label: string;
  hint: string;
  icon: "truck" | "package" | "alert-circle" | "minus-circle" | "clock" | "pause-circle";
}[] = [
  { key: "loading", label: "Loading", hint: "Client and vendor loading", icon: "truck" },
  { key: "unloading", label: "Unloading", hint: "Client and vendor unloading", icon: "package" },
  { key: "halting", label: "Detention charges (Halting)", hint: "Halting for client and vendor", icon: "pause-circle" },
  { key: "damage", label: "Damages", hint: "Damage value", icon: "alert-circle" },
  { key: "productMissing", label: "Missing", hint: "Product missing", icon: "minus-circle" },
  { key: "late", label: "Late delivery", hint: "Actual delivery date", icon: "clock" },
];

const EXCEPTION_AMOUNT_KEYS: Record<
  Exclude<ExceptionKind, "late">,
  { client: keyof PodExceptionLogDraft; vendor: keyof PodExceptionLogDraft }
> = {
  loading: { client: "loading", vendor: "loadingVendor" },
  unloading: { client: "unloading", vendor: "unloadingVendor" },
  damage: { client: "damage", vendor: "damageVendor" },
  productMissing: { client: "productMissing", vendor: "productMissingVendor" },
  halting: { client: "halting", vendor: "haltingVendor" },
};

const EXCEPTION_LOG_AMOUNT_KEYS: (keyof PodExceptionLogDraft)[] = [
  "loading",
  "loadingVendor",
  "unloading",
  "unloadingVendor",
  "damage",
  "damageVendor",
  "productMissing",
  "productMissingVendor",
  "delay",
  "delayVendor",
  "halting",
  "haltingVendor",
];

/** "0" is an explicit clear. Empty keeps the amount already stored on the trip. */
function zeroExceptionLog(): PodExceptionLogDraft {
  const next = { ...EMPTY_POD_EXCEPTION_LOG };
  for (const key of EXCEPTION_LOG_AMOUNT_KEYS) next[key] = "0";
  return next;
}

function exceptionLogExplicitlyClear(log: PodExceptionLogDraft): boolean {
  return (
    EXCEPTION_LOG_AMOUNT_KEYS.every((key) => String(log[key] ?? "").trim() === "0") &&
    !String(log.actualDeliveryDate ?? "").trim()
  );
}

function parsedLogAmount(raw: string): "empty" | "zero" | "bad" | string {
  const text = raw.trim();
  if (!text) return "empty";
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return "bad";
  const value = Number(text);
  if (!Number.isFinite(value) || value < 0) return "bad";
  if (value === 0) return "zero";
  return String(Math.round(value * 100) / 100);
}

function normalizeExceptionLog(value: PodExceptionLogDraft): PodExceptionLogDraft | null {
  const next = { ...value };
  for (const key of EXCEPTION_LOG_AMOUNT_KEYS) {
    const parsed = parsedLogAmount(String(value[key] ?? ""));
    if (parsed === "bad") return null;
    next[key] = parsed === "zero" ? "0" : parsed === "empty" ? "" : parsed;
  }
  return next;
}

function kindsFromDraft(value: PodExceptionLogDraft): ExceptionKind[] {
  const open: ExceptionKind[] = [];
  if (amountEntered(value.loading) || amountEntered(value.loadingVendor)) open.push("loading");
  if (amountEntered(value.unloading) || amountEntered(value.unloadingVendor)) open.push("unloading");
  if (amountEntered(value.halting) || amountEntered(value.haltingVendor)) open.push("halting");
  if (amountEntered(value.damage) || amountEntered(value.damageVendor)) open.push("damage");
  if (amountEntered(value.productMissing) || amountEntered(value.productMissingVendor)) open.push("productMissing");
  if (amountEntered(value.delay) || amountEntered(value.delayVendor) || value.actualDeliveryDate.trim()) {
    open.push("late");
  }
  return open;
}

function partyAmountDetail(client: string, vendor: string): string {
  const parts = [
    amountEntered(client) ? `Client ${formatInr(Number(client))}` : null,
    amountEntered(vendor) ? `Vendor ${formatInr(Number(vendor))}` : null,
  ].filter(Boolean);
  return parts.join(" · ");
}

function QuietAmountField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <View style={styles.exField}>
      <Text style={styles.exLabel}>{label}</Text>
      <TextInput
        value={value.trim() === "0" ? "" : value}
        onChangeText={onChange}
        keyboardType="decimal-pad"
        placeholder="0"
        placeholderTextColor={Theme.textMuted}
        style={styles.exInput}
        accessibilityLabel={label}
      />
    </View>
  );
}

function exceptionPreviewRows(value: PodExceptionLogDraft): { label: string; detail: string }[] {
  const rows: { label: string; detail: string }[] = [];
  const push = (label: string, client: string, vendor: string) => {
    const detail = partyAmountDetail(client, vendor);
    if (detail) rows.push({ label, detail });
  };
  push("Loading", value.loading, value.loadingVendor);
  push("Unloading", value.unloading, value.unloadingVendor);
  push("Detention charges (Halting)", value.halting, value.haltingVendor);
  push("Damages", value.damage, value.damageVendor);
  push("Missing", value.productMissing, value.productMissingVendor);
  if (amountEntered(value.delay) || amountEntered(value.delayVendor) || value.actualDeliveryDate.trim()) {
    rows.push({
      label: "Late delivery",
      detail: [
        value.actualDeliveryDate ? formatPodDate(value.actualDeliveryDate) : null,
        partyAmountDetail(value.delay, value.delayVendor) || null,
      ]
        .filter(Boolean)
        .join(" · "),
    });
  }
  return rows;
}

function PodExceptionLogCard({
  stacked = false,
  mobileExclusive = false,
  plannedDelivery,
  value,
  onChange,
  canManage,
  submitted,
  saving,
  saveError,
  onSubmit,
  onEdit,
  onCancelEdit,
}: {
  stacked?: boolean;
  mobileExclusive?: boolean;
  plannedDelivery: string | null;
  value: PodExceptionLogDraft;
  onChange: (next: PodExceptionLogDraft) => void;
  canManage: boolean;
  submitted: boolean;
  saving: boolean;
  saveError: string | null;
  onSubmit: () => void;
  onEdit: () => void;
  onCancelEdit?: () => void;
}) {
  const [logOpen, setLogOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const [activeKind, setActiveKind] = useState<ExceptionKind>("loading");
  const [lineError, setLineError] = useState<string | null>(null);
  const [updatedKind, setUpdatedKind] = useState<ExceptionKind | null>(null);
  const entered = kindsFromDraft(value).length > 0;
  const preview = exceptionPreviewRows(value);
  const draftEntered = kindsFromDraft(draft).length > 0;
  const lateDays = lateDeliveryDays(plannedDelivery, draft.actualDeliveryDate);
  const isLate = lateDays != null && lateDays > 0;

  const openLog = () => {
    if (submitted) onEdit();
    setDraft(value);
    setActiveKind(kindsFromDraft(value)[0] ?? "loading");
    setLineError(null);
    setUpdatedKind(null);
    setLogOpen(true);
  };

  const patchDraft = (key: keyof PodExceptionLogDraft, next: string) => {
    setLineError(null);
    setUpdatedKind(null);
    setDraft((current) => ({ ...current, [key]: next }));
  };

  const clearKind = (kind: ExceptionKind) => {
    setLineError(null);
    setUpdatedKind(null);
    if (kind === "late") {
      setDraft((current) => ({ ...current, delay: "", delayVendor: "", actualDeliveryDate: "" }));
      return;
    }
    const keys = EXCEPTION_AMOUNT_KEYS[kind];
    setDraft((current) => ({ ...current, [keys.client]: "", [keys.vendor]: "" }));
  };

  const [confirmMode, setConfirmMode] = useState<null | "update" | "save">(null);
  const [confirmTitle, setConfirmTitle] = useState("");
  const [confirmMessage, setConfirmMessage] = useState("");
  const [readyDraft, setReadyDraft] = useState<PodExceptionLogDraft | null>(null);

  const commitDraft = (next: PodExceptionLogDraft, close: boolean) => {
    onChange(next);
    setDraft(next);
    if (close) setLogOpen(false);
    onSubmit();
  };

  const lineEntry = (kind: ExceptionKind) => {
    const normalized = normalizeExceptionLog(draft);
    if (!normalized) return { error: "Enter a valid amount." } as const;
    const next = { ...normalized };
    const clientRaw = kind === "late" ? draft.delay : String(draft[EXCEPTION_AMOUNT_KEYS[kind].client] ?? "");
    const vendorRaw = kind === "late" ? draft.delayVendor : String(draft[EXCEPTION_AMOUNT_KEYS[kind].vendor] ?? "");
    const client = parsedLogAmount(clientRaw);
    const vendor = parsedLogAmount(vendorRaw);
    if (client === "bad" || vendor === "bad") return { error: "Enter a valid amount." } as const;
    const clientEntered = client !== "empty" && client !== "zero";
    const vendorEntered = vendor !== "empty" && vendor !== "zero";
    if (!clientEntered && !vendorEntered) return { error: "Enter a client or vendor amount." } as const;
    if (kind === "late" && !draft.actualDeliveryDate.trim()) {
      return { error: "Enter the actual delivery date." } as const;
    }
    if (kind === "late") {
      next.delay = clientEntered ? client : "0";
      next.delayVendor = vendorEntered ? vendor : "0";
    } else {
      const keys = EXCEPTION_AMOUNT_KEYS[kind];
      next[keys.client] = clientEntered ? client : "0";
      next[keys.vendor] = vendorEntered ? vendor : "0";
    }
    const label = EXCEPTION_KIND_OPTIONS.find((option) => option.key === kind)?.label ?? "This charge";
    const parts = [
      clientEntered ? `Client ₹${Number(client).toLocaleString("en-IN")}` : null,
      vendorEntered ? `Vendor ₹${Number(vendor).toLocaleString("en-IN")}` : null,
      kind === "late" && draft.actualDeliveryDate.trim() ? formatPodDate(draft.actualDeliveryDate) : null,
    ].filter(Boolean);
    return { next, summary: `${label}: ${parts.join(" · ")}` } as const;
  };

  const askUpdate = (kind: ExceptionKind) => {
    const prepared = lineEntry(kind);
    if ("error" in prepared) {
      setLineError(prepared.error);
      setUpdatedKind(null);
      return;
    }
    setLineError(null);
    setReadyDraft(prepared.next);
    setUpdatedKind(kind);
    setConfirmTitle("Update this charge?");
    setConfirmMessage(prepared.summary);
    setConfirmMode("update");
  };

  const askSave = () => {
    const normalized = normalizeExceptionLog(draft);
    if (!normalized) {
      setLineError("Enter a valid amount.");
      return;
    }
    const hasDebit = kindsFromDraft(normalized).length > 0;
    if (!hasDebit) {
      const touched = EXCEPTION_LOG_AMOUNT_KEYS.some((key) => String(draft[key] ?? "").trim() !== "");
      if (touched) {
        setLineError("Enter a client or vendor amount.");
        return;
      }
    }
    setLineError(null);
    const next = hasDebit ? normalized : zeroExceptionLog();
    const lines = exceptionPreviewRows(next);
    setReadyDraft(next);
    setConfirmTitle(hasDebit ? "Save this debit?" : "Save no debit?");
    setConfirmMessage(
      hasDebit
        ? lines.map((row) => `${row.label} · ${row.detail}`).join("\n")
        : "This POD will be saved with no extra charges.",
    );
    setConfirmMode("save");
  };

  return (
    <View style={[styles.logCard, styles.logCardFill, mobileExclusive && styles.logCardMobile]}>
      <View style={styles.logHead}>
        <View style={styles.logHeadCopy}>
          <Text style={styles.kicker}>{submitted ? "Updated from POD" : "Log entry"}</Text>
          <Text style={styles.title}>Exceptions and extra charges</Text>
          <Text style={styles.meta}>
            {submitted
              ? entered
                ? "Debit identified. CN / DN apply in Settlement."
                : "No debit. CN / DN are not required."
              : "Log a debit when one is identified. Otherwise mark No debit and Validated."}
          </Text>
        </View>
        <View style={styles.logHeadActions}>
          <View
            style={[styles.debitTag, entered ? styles.debitTagOn : styles.debitTagOff]}
            accessibilityLabel={entered ? "Debit identified" : "No debit"}
          >
            <Text style={[styles.debitTagText, entered ? styles.debitTagTextOn : styles.debitTagTextOff]}>
              {entered ? "Debit" : "No debit"}
            </Text>
          </View>
          {canManage ? (
            <RegistryGhostButton compact label={submitted ? "Edit" : "Log"} onPress={openLog} />
          ) : null}
        </View>
      </View>
      {preview.length === 0 ? (
        <Text style={[styles.meta, styles.exHint]}>No debit logged on this POD.</Text>
      ) : (
        <View style={styles.exQuote}>
          {preview.map((row) => (
            <View key={row.label} style={styles.exPreviewRow}>
              <Text style={styles.exPreviewLabel}>{row.label}</Text>
              <Text style={styles.exPreviewValue}>{row.detail}</Text>
            </View>
          ))}
        </View>
      )}
      {saveError ? <Text style={[styles.exError, styles.exHint]}>{saveError}</Text> : null}
      {!submitted && onCancelEdit ? (
        <View style={styles.exSubmit}>
          <RegistryGhostButton compact label="Cancel" onPress={onCancelEdit} />
        </View>
      ) : null}
      <Modal visible={logOpen} transparent animationType="fade" onRequestClose={() => setLogOpen(false)}>
        <View style={styles.noteModalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setLogOpen(false)} accessibilityLabel="Close" />
          <View style={styles.debitModal}>
            <Text style={styles.kicker}>Log debit</Text>
            <Text style={styles.title}>Exceptions and extra charges</Text>
            <Text style={styles.meta}>
              Choose a charge. Client and vendor amounts are saved separately.
            </Text>
            <ScrollView
              style={styles.debitList}
              contentContainerStyle={styles.debitListContent}
              keyboardShouldPersistTaps="handled"
            >
              {EXCEPTION_KIND_OPTIONS.map((option) => {
                const selected = activeKind === option.key;
                const detail =
                  option.key === "late"
                    ? [
                        draft.actualDeliveryDate ? formatPodDate(draft.actualDeliveryDate) : null,
                        partyAmountDetail(draft.delay, draft.delayVendor) || null,
                      ]
                        .filter(Boolean)
                        .join(" · ")
                    : partyAmountDetail(
                        String(draft[EXCEPTION_AMOUNT_KEYS[option.key].client] ?? ""),
                        String(draft[EXCEPTION_AMOUNT_KEYS[option.key].vendor] ?? ""),
                      );
                return (
                  <View key={option.key} style={[styles.debitRow, selected && styles.debitRowOn]}>
                    <Pressable
                      onPress={() => setActiveKind(option.key)}
                      style={styles.debitRowHit}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      accessibilityLabel={option.label}
                    >
                      <View style={[styles.logMenuIcon, selected && styles.debitIconOn]}>
                        <Feather name={option.icon} size={13} color={Theme.textPrimaryDark} />
                      </View>
                      <View style={styles.debitRowCopy}>
                        <Text style={styles.logMenuLabel}>{option.label}</Text>
                        <Text style={styles.meta} numberOfLines={1}>
                          {detail || option.hint}
                        </Text>
                      </View>
                      {detail ? <Feather name="check" size={14} color={Theme.textPrimaryDark} /> : null}
                    </Pressable>
                    {selected && option.key !== "late" ? (
                      <View style={[styles.exRow, stacked && styles.exRowStacked, styles.debitFields]}>
                        <QuietAmountField
                          label="Client charges"
                          value={String(draft[EXCEPTION_AMOUNT_KEYS[option.key].client] ?? "")}
                          onChange={(next) => patchDraft(EXCEPTION_AMOUNT_KEYS[option.key].client, next)}
                        />
                        <QuietAmountField
                          label="Vendor charges"
                          value={String(draft[EXCEPTION_AMOUNT_KEYS[option.key].vendor] ?? "")}
                          onChange={(next) => patchDraft(EXCEPTION_AMOUNT_KEYS[option.key].vendor, next)}
                        />
                      </View>
                    ) : null}
                    {selected && option.key === "late" ? (
                      <View style={styles.debitFields}>
                        <HardCopyPodDateField
                          quiet
                          label="Actual delivery date"
                          value={draft.actualDeliveryDate}
                          onChange={(iso) => patchDraft("actualDeliveryDate", iso)}
                        />
                        {plannedDelivery ? (
                          <Text style={styles.meta}>
                            {isLate
                              ? `${lateDays} day${lateDays === 1 ? "" : "s"} after ${formatPodDate(plannedDelivery)}`
                              : `Planned ${formatPodDate(plannedDelivery)}`}
                          </Text>
                        ) : null}
                        <View style={[styles.exRow, stacked && styles.exRowStacked]}>
                          <QuietAmountField
                            label="Client charges"
                            value={draft.delay}
                            onChange={(next) => patchDraft("delay", next)}
                          />
                          <QuietAmountField
                            label="Vendor charges"
                            value={draft.delayVendor}
                            onChange={(next) => patchDraft("delayVendor", next)}
                          />
                        </View>
                      </View>
                    ) : null}
                    {selected ? (
                      <View style={styles.debitLineActions}>
                        <View style={styles.debitLineActionEnd}>
                          {detail ? (
                            <Pressable
                              onPress={() => clearKind(option.key)}
                              style={styles.debitClear}
                              accessibilityRole="button"
                              accessibilityLabel={`Clear ${option.label}`}
                            >
                              <Text style={styles.debitClearText}>Clear</Text>
                            </Pressable>
                          ) : (
                            <View />
                          )}
                          {updatedKind === option.key && !saving ? (
                            <Text style={styles.debitUpdated}>Updated</Text>
                          ) : null}
                        </View>
                        <RegistryPrimaryButton
                          label={saving ? "Saving…" : "Update"}
                          onPress={() => askUpdate(option.key)}
                          disabled={saving}
                          style={styles.debitUpdateBtn}
                        />
                      </View>
                    ) : null}
                    {selected && lineError ? <Text style={styles.exError}>{lineError}</Text> : null}
                  </View>
                );
              })}
            </ScrollView>
            {saveError ? <Text style={styles.exError}>{saveError}</Text> : null}
            <View style={styles.exSubmitRow}>
              <RegistryGhostButton compact label="Cancel" onPress={() => setLogOpen(false)} disabled={saving} />
              <RegistryPrimaryButton
                compact
                label={saving ? "Saving…" : draftEntered ? "Save debit" : "Save no debit"}
                onPress={askSave}
                disabled={saving}
              />
            </View>
          </View>
        </View>
      </Modal>
      <ThemedConfirmModal
        visible={confirmMode != null}
        variant={confirmMode === "save" && !draftEntered ? "neutral" : "positive"}
        title={confirmTitle}
        message={confirmMessage}
        confirmText={confirmMode === "update" ? "Update" : draftEntered ? "Save debit" : "Save no debit"}
        confirmVariant="primary"
        onCancel={() => setConfirmMode(null)}
        onRequestClose={() => setConfirmMode(null)}
        onConfirm={() => {
          const mode = confirmMode;
          const next = readyDraft;
          setConfirmMode(null);
          if (!next || !mode) return;
          commitDraft(next, mode === "save");
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, minHeight: 0, flexDirection: "row" },
  rootStacked: { flexDirection: "column" },
  rootMobile: { backgroundColor: "transparent" },
  previewCol: { flex: 1, minWidth: 0, minHeight: 0 },
  previewContent: { padding: 12, gap: 12, paddingBottom: 20 },
  previewContentFill: { flexGrow: 1 },
  workFill: { flexGrow: 1, minHeight: 0 },
  previewContentStacked: { paddingBottom: 28 },
  previewContentMobile: { paddingHorizontal: 0, paddingTop: 12, gap: 12, paddingBottom: 32 },
  fileCardList: { gap: 10 },
  fileCardInLog: { paddingHorizontal: 10, paddingTop: 10 },
  fileCardInLogMobile: { paddingHorizontal: 0, paddingTop: 0 },
  fileCardEmpty: {
    paddingHorizontal: 12,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: Theme.compliancePageBg,
  },
  mobilePreviewFill: { flex: 1, minHeight: 0, gap: 0 },
  mobilePreviewBack: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 44,
    paddingHorizontal: 4,
    gap: 2,
  },
  mobilePreviewBackText: {
    fontSize: 15,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.2,
  },
  pageHead: { gap: 6, paddingHorizontal: 2, paddingBottom: 2 },
  pageHeadRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  pageHeadTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "500",
    letterSpacing: -0.2,
  },
  validateBar: {
    gap: 8,
    paddingTop: 4,
  },
  validateDock: {
    marginTop: "auto",
  },
  validateActions: {
    flexDirection: "row",
    flexWrap: "nowrap",
    gap: 8,
    alignItems: "stretch",
  },
  validateActionsStacked: {
    flexDirection: "column",
  },
  validateAction: {
    flexGrow: 1,
    flexBasis: 160,
    minWidth: 0,
  },
  validateActionStacked: {
    flexGrow: 0,
    flexBasis: "auto",
    width: "100%",
  },
  validateBtnStacked: {
    width: "100%",
    minHeight: 44,
    height: 44,
  },
  previewPane: {
    flex: 1.15,
    minWidth: 0,
    minHeight: 0,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.complianceTripCardBorder,
    backgroundColor: Theme.cardWhite,
    overflow: "hidden",
    marginVertical: 12,
    marginRight: 12,
    marginLeft: 0,
  },
  previewPaneStacked: {
    minHeight: 220,
    marginTop: 0,
    marginVertical: 0,
    marginRight: 0,
  },
  previewPaneSplit: {
    width: "100%",
    maxWidth: "100%",
    marginVertical: 0,
    marginRight: 0,
    flex: 1,
  },
  previewPaneMobile: {
    flex: 1,
    minHeight: 0,
    marginVertical: 0,
    marginRight: 0,
    marginLeft: 0,
    borderRadius: 12,
  },
  shopStage: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
  },
  shopRoot: {
    flex: 1,
    minHeight: 0,
    flexDirection: "row",
    backgroundColor: Theme.compliancePageBg,
  },
  shopRail: {
    width: 72,
    flexGrow: 0,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: Theme.complianceTripCardBorder,
    backgroundColor: Theme.cardWhite,
  },
  shopRailContent: {
    paddingVertical: 8,
    paddingHorizontal: 8,
    gap: 8,
  },
  shopThumb: {
    minHeight: 64,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.complianceTripCardBorder,
    backgroundColor: Theme.surface,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  shopThumbOn: {
    borderColor: Theme.textPrimaryDark,
    backgroundColor: Theme.complianceIconWash,
  },
  shopThumbText: {
    fontSize: 9,
    lineHeight: 11,
    fontWeight: "400",
    color: Theme.textMuted,
  },
  shopThumbTextOn: {
    color: Theme.textPrimaryDark,
  },
  shopMain: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
  },
  shopHero: {
    flex: 1,
    minHeight: 0,
    padding: 8,
  },
  shopDoc: {
    flex: 1,
    minHeight: 0,
    borderRadius: 10,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.complianceTripCardBorder,
    backgroundColor: Theme.cardWhite,
  },
  shopOverlay: {
    position: "absolute",
    top: 10,
    left: 12,
    right: 12,
    zIndex: 30,
    alignItems: "center",
  },
  shopToolbarScroll: {
    flexGrow: 0,
    flexShrink: 1,
    minWidth: 0,
  },
  shopToolbarTools: {
    flexDirection: "row",
    alignItems: "center",
  },
  shopToolbar: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "center",
    maxWidth: "100%",
    height: 34,
    paddingHorizontal: 4,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.complianceTripCardBorder,
    backgroundColor: Theme.cardWhite,
  },
  shopToolBtn: {
    height: 26,
    paddingHorizontal: 8,
    borderRadius: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  shopToolBtnOn: {
    backgroundColor: Theme.complianceIconWash,
  },
  docMediaHand: Platform.OS === "web" ? ({ cursor: "grab" } as object) : {},
  shopToolText: {
    fontSize: 10,
    lineHeight: 12,
    fontWeight: "400",
    color: Theme.actionBtnInk,
  },
  shopToolDivider: {
    width: StyleSheet.hairlineWidth,
    height: 16,
    marginHorizontal: 4,
    backgroundColor: Theme.complianceTripCardBorder,
  },
  shopZoom: {
    flexDirection: "row",
    alignItems: "center",
    height: 26,
    paddingHorizontal: 4,
    gap: 4,
  },
  shopZoomLabel: {
    minWidth: 36,
    fontSize: 10,
    lineHeight: 12,
    fontWeight: "400",
    color: Theme.textPrimaryDark,
    textAlign: "center",
  },
  shopDrop: {
    flex: 1,
    minHeight: 220,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.complianceTripCardBorder,
    backgroundColor: Theme.cardWhite,
    overflow: "hidden",
  },
  shopDropBody: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    gap: 8,
  },
  shopDropIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.complianceIconWash,
  },
  shopDropTitle: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "400",
    color: Theme.textPrimaryDark,
    textAlign: "center",
  },
  shopDropHint: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "400",
    color: Theme.textMuted,
    textAlign: "center",
    maxWidth: 360,
  },
  shopDropBtn: {
    marginTop: 4,
    minHeight: 36,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.buttonDark,
  },
  shopDropBtnText: {
    fontSize: 13,
    fontWeight: "400",
    color: Theme.buttonDarkText,
  },
  shopFooter: {
    flexShrink: 0,
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: Theme.cardWhite,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.complianceTripCardBorder,
  },
  shopFooterTitle: {
    flexShrink: 0,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "400",
    color: Theme.textPrimaryDark,
  },
  shopFooterMeta: {
    flex: 1,
    minWidth: 0,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "400",
    color: Theme.textMuted,
  },
  shopStatus: {
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: Theme.complianceIconWash,
  },
  shopStatusPending: {
    backgroundColor: Theme.surface,
  },
  shopStatusKicker: {
    fontSize: 8,
    lineHeight: 10,
    fontWeight: "400",
    color: Theme.textMuted,
    textTransform: "uppercase",
  },
  shopStatusValue: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "400",
    color: Theme.textPrimaryDark,
  },
  shopReceipt: {
    flexShrink: 1,
    maxWidth: 220,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "400",
    color: Theme.textSecondary,
  },
  shopReceiptError: {
    color: Theme.destructive,
  },
  docToolbar: {
    flexShrink: 0,
    minHeight: 36,
    height: 36,
    paddingHorizontal: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.complianceTripCardBorder,
    backgroundColor: Theme.cardWhite,
  },
  docToolbarTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },
  docToolbarActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 0,
  },
  docToolBtn: {
    minWidth: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.compliancePageBg,
    borderWidth: 1,
    borderColor: Theme.complianceTripCardBorder,
  },
  docToolBtnNamed: { paddingHorizontal: 8 },
  docToolName: { fontSize: 10, fontWeight: "600", color: Theme.textPrimaryDark },
  docToolDisabled: { opacity: 0.45 },
  docZoomCluster: {
    height: 28,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.complianceTripCardBorder,
    backgroundColor: Theme.compliancePageBg,
    overflow: "hidden",
  },
  docZoomBtn: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  docZoomLabel: {
    minWidth: 44,
    height: 28,
    paddingHorizontal: 8,
    fontSize: 11,
    fontWeight: "600",
    lineHeight: 28,
    color: Theme.textPrimaryDark,
    textAlign: "center",
  },
  docZoomLabelMuted: { color: Theme.textMuted },
  docBody: {
    flex: 1,
    minHeight: 0,
    backgroundColor: Theme.compliancePreviewCanvas,
    overflow: "hidden",
  },
  docMedia: { flex: 1, minHeight: 0, position: "relative", overflow: "hidden" },
  docMediaFill: { width: "100%", height: "100%" },
  cnPreview: {
    flex: 1,
    minHeight: 0,
    width: "100%",
    position: "relative",
    overflow: "hidden",
    backgroundColor: Theme.compliancePageBg,
  },
  cnPreviewFill: { flex: 1, minHeight: 0, width: "100%" },
  docEmpty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  docEmptyHint: { marginTop: 8, fontSize: 12, color: Theme.textMuted },
  docNavLeft: {
    position: "absolute",
    left: 8,
    top: 0,
    bottom: 0,
    justifyContent: "center",
  },
  docNavRight: {
    position: "absolute",
    right: 8,
    top: 0,
    bottom: 0,
    justifyContent: "center",
  },
  docNavBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.complianceTripCardBorder,
    backgroundColor: Theme.cardWhite,
    alignItems: "center",
    justifyContent: "center",
  },
  docFooter: {
    minHeight: 32,
    paddingHorizontal: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.complianceTripCardBorder,
    justifyContent: "center",
    backgroundColor: Theme.cardWhite,
  },
  docFooterMeta: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textMuted,
  },
  fullScreen: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.92)",
    padding: 16,
  },
  fullScreenClose: {
    alignSelf: "flex-end",
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: Theme.cardWhite,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  fullScreenCloseText: {
    fontSize: 13,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },
  fullScreenMedia: { flex: 1, minHeight: 0, borderRadius: 8, overflow: "hidden" },
  kicker: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "600",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: Theme.textMuted,
  },
  kickerMobile: {
    fontSize: 8,
    lineHeight: 11,
    fontWeight: "700",
    letterSpacing: 1.2,
  },
  title: { fontSize: 14, lineHeight: 20, fontWeight: "600", color: Theme.textPrimaryDark },
  titleMobile: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  meta: { fontSize: 12, lineHeight: 18, fontWeight: "400", color: Theme.textMuted },
  metaMobile: { fontSize: 13, lineHeight: 18, fontWeight: "500" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  logChipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    paddingHorizontal: 12,
    paddingTop: 10,
  },
  chip: {
    height: 28,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: Theme.complianceTripCardBorder,
    paddingHorizontal: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Theme.cardWhite,
  },
  chipSelected: {
    borderColor: Theme.analyticsHeroBg,
    backgroundColor: Theme.compliancePageBg,
  },
  chipText: { fontSize: 12, fontWeight: "400", color: Theme.textMuted },
  chipTextSelected: { fontWeight: "500", color: Theme.textPrimaryDark },
  logCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.complianceTripCardBorder,
    backgroundColor: Theme.cardWhite,
    overflow: "hidden",
    paddingBottom: 4,
  },
  logCardFill: {
    flexGrow: 1,
  },
  receiptPanel: {
    marginHorizontal: 12,
    marginBottom: 12,
    borderRadius: 10,
    backgroundColor: Theme.compliancePageBg,
    padding: 12,
    gap: 12,
  },
  receiptTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  receiptCopy: { flex: 1, minWidth: 0, gap: 2 },
  receiptName: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },
  receiptRole: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "400",
    color: Theme.textSecondary,
  },
  receiptPill: {
    minHeight: 24,
    paddingHorizontal: 8,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  receiptPillOn: { backgroundColor: Theme.complianceStageSuccessBg },
  receiptPillWait: { backgroundColor: Theme.complianceStageBalanceBg },
  receiptPillText: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "700",
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  receiptPillTextOn: { color: Theme.complianceStageSuccessFg },
  receiptPillTextWait: { color: Theme.complianceStageBalanceFg },
  receiptFacts: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 8,
  },
  receiptFact: {
    flex: 1,
    minWidth: 0,
    borderRadius: 8,
    backgroundColor: Theme.cardWhite,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 2,
  },
  receiptFactLabel: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "600",
    letterSpacing: 0.3,
    textTransform: "uppercase",
    color: Theme.textRouteCard,
  },
  receiptFactValue: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "500",
    color: Theme.textPrimaryDark,
  },
  logCardMobile: {
    borderRadius: 0,
    borderWidth: 0,
    backgroundColor: "transparent",
    overflow: "visible",
    flexGrow: 0,
  },
  logCardMenuOpen: { zIndex: 6 },
  logMenu: {
    marginHorizontal: 12,
    marginBottom: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.complianceTripCardBorder,
    backgroundColor: Theme.cardWhite,
    overflow: "hidden",
  },
  logMenuRow: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  logMenuRowActive: {
    backgroundColor: Theme.compliancePageBg,
  },
  logMenuIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.surfaceGray,
  },
  debitModal: {
    width: "100%",
    maxWidth: 480,
    maxHeight: "86%",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Theme.complianceTripCardBorder,
    backgroundColor: Theme.cardWhite,
    padding: 16,
    gap: 8,
  },
  debitList: { flexGrow: 0, maxHeight: 420 },
  debitListContent: { paddingBottom: 8 },
  debitRow: {
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 6,
    gap: 8,
  },
  debitRowOn: { backgroundColor: Theme.compliancePageBg },
  debitRowHit: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  debitRowCopy: { flex: 1, minWidth: 0, gap: 1 },
  debitIconOn: { backgroundColor: Theme.cardWhite },
  debitFields: { paddingLeft: 38, paddingBottom: 6, gap: 8 },
  debitLineActions: {
    alignSelf: "stretch",
    gap: 8,
    paddingLeft: 38,
    paddingRight: 4,
    paddingBottom: 8,
  },
  debitLineActionEnd: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 28,
  },
  debitUpdateBtn: { alignSelf: "stretch", flexGrow: 0, flexShrink: 0 },
  debitUpdated: { fontSize: 12, lineHeight: 16, fontWeight: "600", color: Theme.textPrimaryDark },
  debitClear: { alignSelf: "flex-start", marginLeft: 0, minHeight: 28, justifyContent: "center" },
  debitClearText: { fontSize: 12, lineHeight: 16, fontWeight: "500", color: Theme.textSecondary },
  exPreviewLabel: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "500",
    color: Theme.textPrimaryDark,
  },
  logMenuLabel: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "500",
    color: Theme.textPrimaryDark,
  },
  exFieldHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  exHint: {
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  logHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 52,
  },
  logHeadStacked: {
    flexWrap: "wrap",
  },
  logHeadMobile: {
    flexDirection: "column",
    alignItems: "stretch",
  },
  logHeadActionsMobile: {
    width: "100%",
  },
  logHeadCopy: { flex: 1, minWidth: 0, gap: 2 },
  logEmpty: {
    marginHorizontal: 12,
    marginBottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: Theme.compliancePageBg,
  },
  logEmptyMobile: {
    marginHorizontal: 0,
    marginBottom: 0,
    paddingHorizontal: 0,
    paddingVertical: 4,
    borderRadius: 0,
    backgroundColor: "transparent",
  },
  logEmptyText: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "400",
    color: Theme.textMuted,
  },
  logHeadActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 0,
  },
  debitTag: {
    minHeight: 22,
    paddingHorizontal: 8,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  debitTagOn: { backgroundColor: Theme.complianceStageBalanceBg },
  debitTagOff: { backgroundColor: Theme.complianceStageSuccessBg },
  debitTagText: { fontSize: 10, fontWeight: "700", letterSpacing: 0.3, textTransform: "uppercase" },
  debitTagTextOn: { color: Theme.complianceStageBalanceFg },
  debitTagTextOff: { color: Theme.complianceStageSuccessFg },
  methodIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  methodIconOn: { backgroundColor: Theme.primaryLight },
  methodIconIdle: { backgroundColor: Theme.surfaceGray },
  exQuote: {
    marginHorizontal: 12,
    marginBottom: 12,
    marginTop: 4,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 6,
    backgroundColor: Theme.compliancePageBg,
    gap: 8,
  },
  exRow: { flexDirection: "row", gap: 8 },
  exRowStacked: { flexDirection: "column" },
  exField: { flex: 1, minWidth: 0, gap: 4 },
  exLabel: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "400",
    color: Theme.textMuted,
  },
  exInput: {
    minHeight: 36,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
    paddingHorizontal: 10,
    paddingVertical: 7,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "400",
    color: Theme.textPrimaryDark,
  },
  exPreviewRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  exPreviewValue: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "500",
    color: Theme.textPrimaryDark,
  },
  exSubmit: {
    paddingHorizontal: 12,
    paddingBottom: 12,
    gap: 8,
    alignItems: "flex-end",
  },
  exSubmitRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  exSubmitRowStacked: {
    width: "100%",
    justifyContent: "flex-end",
    flexWrap: "wrap",
  },
  exError: {
    alignSelf: "stretch",
    fontSize: 12,
    lineHeight: 16,
    color: Theme.negative,
  },
  settleSummary: {
    marginHorizontal: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: Theme.compliancePageBg,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  settleSummaryCopy: { flex: 1, minWidth: 0, gap: 2 },
  settleSummaryTitle: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "500",
    color: Theme.textPrimaryDark,
  },
  settleStatus: {
    flexShrink: 0,
    height: 18,
    paddingHorizontal: 7,
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  settleStatusOn: { backgroundColor: Theme.complianceStageSuccessBg },
  settleStatusReady: { backgroundColor: Theme.complianceStagePendingBg },
  settleStatusIdle: { backgroundColor: Theme.surfaceGray },
  settleStatusText: { fontSize: 9, lineHeight: 11, fontWeight: "500", letterSpacing: 0.1 },
  settleStatusTextOn: { color: Theme.complianceStageSuccessFg },
  settleStatusTextReady: { color: Theme.complianceStagePendingFg },
  settleStatusTextIdle: { color: Theme.textMuted },
  provisionTotals: {
    marginHorizontal: 12,
    marginTop: 10,
    flexDirection: "row",
    alignItems: "stretch",
    gap: 8,
  },
  provisionTotalsStacked: {
    flexDirection: "column",
  },
  provisionTotal: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: Theme.compliancePageBg,
    gap: 2,
    justifyContent: "flex-start",
  },
  provisionParty: {
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "500",
    color: Theme.textPrimaryDark,
  },
  provisionAmount: {
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "500",
    color: Theme.textPrimaryDark,
    fontVariant: ["tabular-nums"],
  },
  laneRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    minHeight: 22,
  },
  laneRowOn: {
    marginTop: 6,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.complianceTripCardBorder,
  },
  laneLabel: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "400",
    color: Theme.textSecondary,
  },
  laneValue: {
    flexShrink: 0,
    minWidth: 96,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "400",
    color: Theme.textPrimaryDark,
    textAlign: "right",
    fontVariant: ["tabular-nums"],
  },
  laneLabelOn: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },
  laneValueOn: {
    flexShrink: 0,
    minWidth: 96,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    textAlign: "right",
    fontVariant: ["tabular-nums"],
  },
  lanePendingBlock: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.complianceTripCardBorder,
    gap: 2,
  },
  lanePendingTitle: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "500",
    color: Theme.complianceStagePendingFg,
    marginBottom: 4,
  },
  lanePendingLabel: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "400",
    color: Theme.complianceStagePendingFg,
  },
  lanePendingValue: {
    flexShrink: 0,
    minWidth: 96,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "500",
    color: Theme.complianceStagePendingFg,
    textAlign: "right",
    fontVariant: ["tabular-nums"],
  },
  laneClear: {
    marginTop: 8,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "400",
    color: Theme.textMuted,
  },
  payableCard: {
    marginHorizontal: 12,
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: Theme.compliancePageBg,
    gap: 2,
  },
  payableTitle: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "500",
    color: Theme.textPrimaryDark,
    marginBottom: 8,
  },
  payableRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    minHeight: 28,
    paddingVertical: 4,
  },
  payableRowOn: {
    marginTop: 6,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.complianceTripCardBorder,
  },
  payableLabel: {
    flex: 1,
    minWidth: 0,
    paddingRight: 8,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "400",
    color: Theme.textSecondary,
  },
  payableLabelOn: {
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },
  payableLabelDeduct: {
    color: Theme.textMuted,
  },
  payableValue: {
    flexShrink: 0,
    minWidth: 112,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "400",
    color: Theme.textPrimaryDark,
    textAlign: "right",
    fontVariant: ["tabular-nums"],
  },
  payableValueOn: {
    fontWeight: "600",
  },
  payableValueDeduct: {
    color: Theme.negative,
  },
  noteTable: {
    marginHorizontal: 12,
    marginBottom: 4,
    marginTop: 8,
    paddingHorizontal: 0,
    paddingVertical: 0,
    borderRadius: 8,
    backgroundColor: Theme.cardWhite,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.complianceTripCardBorder,
    gap: 0,
  },
  pendingStrip: {
    gap: 2,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.complianceTripCardBorder,
  },
  noteCols: {
    minHeight: 36,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    width: "100%",
  },
  noteHead: {
    minHeight: 26,
    paddingBottom: 6,
    marginBottom: 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.complianceTripCardBorder,
  },
  noteRow: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.complianceTripCardBorder,
  },
  noteRowStacked: {
    flexDirection: "column",
    alignItems: "stretch",
    minHeight: 0,
    gap: 6,
    paddingVertical: 8,
  },
  noteStackedLead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minWidth: 0,
  },
  noteStackedMeta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  noteAmountStacked: {
    flex: 1,
    minWidth: 0,
    textAlign: "left",
  },
  noteStateStacked: {
    flexShrink: 0,
    textAlign: "right",
  },
  noteActionColStacked: {
    width: "100%",
    justifyContent: "flex-start",
    minHeight: 32,
  },
  noteColLabel: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "400",
    color: Theme.textMuted,
  },
  noteAlignEnd: { textAlign: "right", width: "100%" },
  noteTypeCol: {
    width: 52,
    flexGrow: 0,
    flexShrink: 0,
    justifyContent: "center",
  },
  noteChargeCol: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 0,
    justifyContent: "center",
  },
  noteAmountCol: {
    width: 120,
    flexGrow: 0,
    flexShrink: 0,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  noteStateCol: {
    width: 80,
    flexGrow: 0,
    flexShrink: 0,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  noteActionCol: {
    width: 72,
    flexGrow: 0,
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 8,
  },
  noteAction: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "500",
    color: Theme.actionBtnInk,
  },
  noteActionDanger: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "500",
    color: Theme.negative,
  },
  noteModalOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
    backgroundColor: "rgba(15, 23, 42, 0.32)",
  },
  noteModal: {
    width: "100%",
    maxWidth: 400,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.complianceTripCardBorder,
    backgroundColor: Theme.cardWhite,
    padding: 16,
    gap: 10,
  },
  noteReasonInput: {
    minHeight: 72,
    textAlignVertical: "top",
  },
  noteGroup: { gap: 0, paddingTop: 8 },
  noteParty: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "500",
    color: Theme.textMuted,
    paddingBottom: 4,
  },
  notePill: {
    minWidth: 32,
    height: 20,
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  notePillCn: { backgroundColor: Theme.complianceStageSuccessBg },
  notePillDn: { backgroundColor: Theme.complianceStageBalanceBg },
  notePillText: { fontSize: 9, lineHeight: 11, fontWeight: "500", letterSpacing: 0.1 },
  notePillTextCn: { color: Theme.complianceStageSuccessFg },
  notePillTextDn: { color: Theme.complianceStageBalanceFg },
  noteCharge: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "500",
    color: Theme.textPrimaryDark,
  },
  noteAmount: {
    width: "100%",
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "400",
    color: Theme.textPrimaryDark,
    textAlign: "right",
    fontVariant: ["tabular-nums"],
  },
  noteState: {
    width: "100%",
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "400",
    textAlign: "right",
  },
  noteStateOn: { color: Theme.complianceStageSuccessFg },
  noteStateOff: { color: Theme.complianceStagePendingFg },
  noteFooter: {
    flexDirection: "row",
    flexWrap: "nowrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 12,
    minHeight: 44,
  },
  noteFooterCopy: { flex: 1, minWidth: 0, gap: 4 },
  noteFooterStacked: {
    flexDirection: "column",
    alignItems: "stretch",
    flexWrap: "nowrap",
    minHeight: 0,
  },
});
