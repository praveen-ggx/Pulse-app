import { AdjustableSplitLayout } from "@/components/layout/AdjustableSplitLayout";
import { AlertRegistrySignalCard } from "@/components/AlertRegistrySignalCard";
import {
  RegistryCardActions,
  RegistryGhostButton,
  RegistryPrimaryButton,
} from "@/components/AlertRegistryCardActions";
import { ThemedConfirmModal } from "@/components/ThemedConfirmModal";
import Theme from "@/constants/Theme";
import { ComplianceActivityLogButton } from "@/features/tripCompliance/components/ComplianceTripActivityLog";
import { NoDocumentPreviewEmpty } from "@/features/tripCompliance/components/ComplianceEmptyState";
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
import { signCompliancePreviewUrl } from "@/features/tripCompliance/services/complianceDocumentView.service";
import type { ComplianceListTripFacts } from "@/features/tripCompliance/services/complianceListFacts.service";
import { fetchTripDocumentsForTrips } from "@/features/tripCompliance/services/tripComplianceRead.service";
import type { ComplianceTripSummary } from "@/features/tripCompliance/tripCompliance.types";
import {
  podVerificationFiles,
  podVerificationKind,
  podVerificationLabel,
  type PodVerificationFile,
} from "@/features/tripCompliance/utils/podVerificationDocuments.util";
import { getDocumentsByTripId } from "@/features/trips/services/tripDocuments.service";
import { ComplianceHardCopyPodSheet } from "@/features/tripCompliance/components/ComplianceHardCopyPodSheet";
import type { HardCopyPodLrOption } from "@/features/trips/components/trip-detail/LogHardCopyPodModal";
import Feather from "@expo/vector-icons/Feather";
import { ChevronLeft, ChevronRight, Maximize2, Minus, Plus, RefreshCw, RotateCwSquare } from "lucide-react-native";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
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

function applyExceptionLog(base: PodChargeLines, log: PodExceptionLogDraft): PodChargeLines {
  return {
    ...base,
    loading: log.loading.trim() === "" ? base.loading : moneyFromLog(log.loading),
    unloading: log.unloading.trim() === "" ? base.unloading : moneyFromLog(log.unloading),
    damage: log.damage.trim() === "" ? base.damage : moneyFromLog(log.damage),
    productMissing: log.productMissing.trim() === "" ? base.productMissing : moneyFromLog(log.productMissing),
    delay: log.delay.trim() === "" ? base.delay : moneyFromLog(log.delay),
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
  const files = useMemo(() => {
    const fromSummary = podVerificationFiles(summary.documents);
    if (fromSummary.length === 0) return liveFiles;
    const seen = new Set(fromSummary.map((file) => file.id));
    return [...fromSummary, ...liveFiles.filter((file) => !seen.has(file.id))];
  }, [liveFiles, summary.documents]);

  useEffect(() => {
    const tripId = summary.trip.id;
    let cancelled = false;
    setLiveFiles([]);
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
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [toolLabel, setToolLabel] = useState<string | null>(null);
  const [screenOpen, setScreenOpen] = useState(false);
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
    setMobilePane("work");
    setSelectedNote(null);
  }, [summary.trip.id]);
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
    const draft = chargeDraftFromLines(client ?? vendor ?? EMPTY_CHARGE_LINES);
    const other = chargeDraftFromLines(vendor ?? client ?? EMPTY_CHARGE_LINES);
    setExceptionLog({
      loading: draft.loading || other.loading,
      unloading: draft.unloading || other.unloading,
      damage: draft.damage || other.damage,
      productMissing: draft.productMissing || other.productMissing,
      delay: draft.delay || other.delay,
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
    const clientBase = loaded.data?.clientCharges ?? chargeLinesFromBase(Number(summary.trip.client_price) || 0);
    const vendorBase = loaded.data?.vendorCharges ?? chargeLinesFromBase(Number(summary.trip.supplier_rate) || 0);
    return {
      tripId: summary.trip.id,
      remarks: noDebit ? "No debit" : "",
      noDebit,
      clientInvoiceNumber: loaded.data?.invoiceNumber ?? null,
      tripStartDate:
        isoDay(loaded.data?.tripStartDate) ||
        isoDay(summary.trip.pickup_date) ||
        isoDay(summary.trip.started_at) ||
        null,
      deliveryDate:
        isoDay(exceptionLog.actualDeliveryDate) ||
        isoDay(loaded.data?.deliveryDate) ||
        isoDay(summary.trip.completed_at) ||
        null,
      dispatchDate: isoDay(loaded.data?.dispatchDate) || null,
      client: applyExceptionLog(clientBase, exceptionLog),
      vendor: applyExceptionLog(vendorBase, exceptionLog),
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
                    ? "Post client sale (revenue) and driver pay CN / DN. Own-fleet trips have no vendor payable."
                    : "Post client sale (revenue) and vendor cost CN / DN with the same provision adjust flow as trip finance."
                  : previewOnly
                    ? "Preview the hard-copy scan from Log Bulk POD or Log POD."
                    : "Only POD uploaded as soft copy or from Log Hard Copy POD"}
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
            <AlertRegistrySignalCard
              variant="feed"
              isUnread={!hard.received}
              avatar={{
                name: courierLogged ? "Courier" : "Person",
                entityType: courierLogged ? "supplier" : "driver",
                initialsColorSeed: courierLogged ? "hard-copy-courier" : "hard-copy-person",
              }}
              avatarSlot={
                <View
                  style={[
                    styles.methodIcon,
                    hard.received ? styles.methodIconOn : styles.methodIconIdle,
                  ]}
                >
                  <Feather
                    name={courierLogged ? "package" : "user"}
                    size={16}
                    color={Theme.textPrimaryDark}
                  />
                </View>
              }
              actorName={courierLogged ? "Received by Courier" : "Received by Person"}
              actionText={courierLogged ? "dispatched via courier" : "handed over in person"}
              timeLabel={hard.received ? "Received" : "Logged"}
              contextLabel="Hard copy"
              statusPill={{
                label: hard.received ? "Received" : "In transit",
                tone: hard.received ? "success" : "warning",
              }}
              detailTitle={courierLogged ? hard.courier ?? "Courier" : hard.receivedBy ?? "Desk"}
              detailSubtitle={[
                lrLabel !== "—" ? `LR ${lrLabel}` : null,
                hard.awbNumber?.trim() ? `AWB ${hard.awbNumber.trim()}` : null,
                formatPodDate(hard.receivedAt),
              ]
                .filter(Boolean)
                .join(" · ")}
            />
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
            <PodExceptionLogCard
              key={summary.trip.id}
              stacked={workLayout}
              mobileExclusive={mobileExclusive}
              plannedDelivery={summary.trip.completed_at ?? null}
              value={exceptionLog}
              onChange={setExceptionLog}
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
            {canManage ? (
              <View style={styles.validateBar}>
                <Text style={styles.meta}>
                  Save charges when a debit is identified. If there is no debit, mark No debit and Validated still moves this trip to Settlement Verification. POD not found returns it to Awaiting POD if the hard copy was logged by mistake.
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
        <PodDocumentPreview
          locked={false}
          title={active ? podVerificationLabel(active) : "POD"}
          copyKind={active ? podVerificationKind(active) : "soft"}
          fileName={active?.file_name ?? null}
          uri={previewUrl}
          isPdf={fileIsPdf(active ?? {})}
          loading={loadingPreview}
          zoom={zoom}
          rotation={rotation}
          toolLabel={toolLabel}
          index={Math.max(0, files.findIndex((file) => file.id === active?.id))}
          count={files.length}
          onZoom={setZoom}
          onRotate={() => {
            setRotation((value) => (value + 90) % 360);
            setZoom(1);
            setToolLabel("rotate");
          }}
          onRefresh={() => {
            setZoom(1);
            setRotation(0);
            setToolLabel("refresh");
          }}
          onExpand={() => setScreenOpen(true)}
          onPrev={() => {
            const index = files.findIndex((file) => file.id === active?.id);
            if (index > 0) setActiveId(files[index - 1].id);
          }}
          onNext={() => {
            const index = files.findIndex((file) => file.id === active?.id);
            if (index >= 0 && index < files.length - 1) setActiveId(files[index + 1].id);
          }}
        />
        )}
      </View>
  );

  return (
    <View style={[styles.root, workLayout && styles.rootStacked, mobileExclusive && styles.rootMobile]}>
      {mobileExclusive && mobilePane === "preview" ? (
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
      ) : mobileExclusive ? (
        workPane
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

function PodDocumentPreview({
  locked = false,
  lockHint,
  title,
  copyKind = "soft",
  fileName,
  uri,
  isPdf,
  loading,
  zoom,
  rotation,
  toolLabel,
  index,
  count,
  onZoom,
  onRotate,
  onRefresh,
  onExpand,
  onPrev,
  onNext,
}: {
  locked?: boolean;
  lockHint?: string;
  title: string;
  copyKind?: "soft" | "hard";
  fileName: string | null;
  uri: string | null;
  isPdf: boolean;
  loading: boolean;
  zoom: number;
  rotation: number;
  toolLabel: string | null;
  index: number;
  count: number;
  onZoom: (next: number) => void;
  onRotate: () => void;
  onRefresh: () => void;
  onExpand: () => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  const toolsEnabled = Boolean(uri) && !locked;
  const toolColor = toolsEnabled ? Theme.textPrimaryDark : Theme.textMuted;
  const showSideNav = count > 1 && (Boolean(uri) || loading);
  const ordinal = count > 0 ? index + 1 : 0;

  return (
    <>
      <View style={styles.docToolbar}>
        <Text style={styles.docToolbarTitle} numberOfLines={1}>
          {fileName?.trim() || title}
        </Text>
        <View style={styles.docToolbarActions}>
          <Pressable
            style={[styles.docToolBtn, toolLabel === "rotate" && styles.docToolBtnNamed, !toolsEnabled && styles.docToolDisabled]}
            onPress={onRotate}
            disabled={!toolsEnabled}
            accessibilityRole="button"
            accessibilityLabel="Rotate"
            {...(Platform.OS === "web" ? { title: "Rotate" } : {})}
          >
            <RotateCwSquare size={12} color={toolColor} strokeWidth={2.1} />
            {toolLabel === "rotate" ? <Text style={styles.docToolName}>Rotate</Text> : null}
          </Pressable>
          <View style={[styles.docZoomCluster, !toolsEnabled && styles.docToolDisabled]}>
            <Pressable
              style={styles.docZoomBtn}
              onPress={() => onZoom(clampPreviewZoom(zoom - 0.25))}
              disabled={!toolsEnabled}
              accessibilityRole="button"
              accessibilityLabel="Zoom out"
            >
              <Minus size={12} color={toolColor} />
            </Pressable>
            <Text style={[styles.docZoomLabel, !toolsEnabled && styles.docZoomLabelMuted]}>
              {Math.round(zoom * 100)}%
            </Text>
            <Pressable
              style={styles.docZoomBtn}
              onPress={() => onZoom(clampPreviewZoom(zoom + 0.25))}
              disabled={!toolsEnabled}
              accessibilityRole="button"
              accessibilityLabel="Zoom in"
            >
              <Plus size={12} color={toolColor} />
            </Pressable>
          </View>
          <Pressable
            style={[styles.docToolBtn, toolLabel === "refresh" && styles.docToolBtnNamed, !toolsEnabled && styles.docToolDisabled]}
            onPress={onRefresh}
            disabled={!toolsEnabled}
            accessibilityRole="button"
            accessibilityLabel="Refresh"
            {...(Platform.OS === "web" ? { title: "Refresh" } : {})}
          >
            <RefreshCw size={12} color={toolColor} strokeWidth={2.2} />
            {toolLabel === "refresh" ? <Text style={styles.docToolName}>Refresh</Text> : null}
          </Pressable>
          <Pressable
            style={[styles.docToolBtn, !toolsEnabled && styles.docToolDisabled]}
            onPress={onExpand}
            disabled={!toolsEnabled}
            accessibilityRole="button"
            accessibilityLabel={`Open ${title} full screen`}
            {...(Platform.OS === "web" ? { title: "Full screen" } : {})}
          >
            <Maximize2 size={12} color={toolColor} />
          </Pressable>
        </View>
      </View>
      <View style={styles.docBody}>
        {locked ? (
          <View style={styles.docEmpty}>
            <NoDocumentPreviewEmpty
              compact
              title="Save POD entries to view"
              hint={lockHint ?? "Save the POD validation entries to view the document."}
            />
          </View>
        ) : loading ? (
          <View style={styles.docEmpty}>
            <ActivityIndicator color={Theme.textPrimaryDark} />
            <Text style={styles.docEmptyHint}>Loading document…</Text>
          </View>
        ) : uri ? (
          <View
            style={[
              styles.docMedia,
              { transform: [{ rotate: `${rotation}deg` }, { scale: zoom }] },
            ]}
          >
            <TripVaultFilePreview
              uri={uri}
              isPdf={isPdf}
              sizing="fit"
              zoom={zoom}
              style={styles.docMediaFill}
              accessibilityLabel={fileName?.trim() || title}
            />
            <PodCopyWatermark kind={copyKind} />
          </View>
        ) : (
          <View style={styles.docEmpty}>
            <NoDocumentPreviewEmpty
              compact
              title={count === 0 ? "No document to preview" : `${title} has no file to preview`}
              hint="Select a soft-copy or hard-copy POD, or log the hard copy first."
            />
          </View>
        )}
        {showSideNav ? (
          <>
            <View style={styles.docNavLeft} pointerEvents="box-none">
              <Pressable
                style={[styles.docNavBtn, index <= 0 && styles.docToolDisabled]}
                onPress={onPrev}
                disabled={index <= 0}
                accessibilityRole="button"
                accessibilityLabel="Previous document"
              >
                <ChevronLeft size={20} color={index <= 0 ? Theme.textMuted : Theme.textPrimaryDark} strokeWidth={2.2} />
              </Pressable>
            </View>
            <View style={styles.docNavRight} pointerEvents="box-none">
              <Pressable
                style={[styles.docNavBtn, index >= count - 1 && styles.docToolDisabled]}
                onPress={onNext}
                disabled={index >= count - 1}
                accessibilityRole="button"
                accessibilityLabel="Next document"
              >
                <ChevronRight size={20} color={index >= count - 1 ? Theme.textMuted : Theme.textPrimaryDark} strokeWidth={2.2} />
              </Pressable>
            </View>
          </>
        ) : null}
      </View>
      <View style={styles.docFooter}>
        <Text style={styles.docFooterMeta} numberOfLines={1}>
          {count > 0 ? `${ordinal} of ${count}` : "No file on this row"}
        </Text>
      </View>
    </>
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

type ExceptionKind = "loading" | "unloading" | "damage" | "productMissing" | "late";

const EXCEPTION_KIND_OPTIONS: {
  key: ExceptionKind;
  label: string;
  hint: string;
  icon: "truck" | "package" | "alert-circle" | "minus-circle" | "clock";
}[] = [
  { key: "loading", label: "Loading", hint: "Loading charges", icon: "truck" },
  { key: "unloading", label: "Unloading", hint: "Unloading charges", icon: "package" },
  { key: "damage", label: "Damages", hint: "Damage value", icon: "alert-circle" },
  { key: "productMissing", label: "Missing", hint: "Product missing", icon: "minus-circle" },
  { key: "late", label: "Late delivery", hint: "Actual delivery date", icon: "clock" },
];

function kindsFromDraft(value: PodExceptionLogDraft): ExceptionKind[] {
  const open: ExceptionKind[] = [];
  if (amountEntered(value.loading)) open.push("loading");
  if (amountEntered(value.unloading)) open.push("unloading");
  if (amountEntered(value.damage)) open.push("damage");
  if (amountEntered(value.productMissing)) open.push("productMissing");
  if (amountEntered(value.delay) || value.actualDeliveryDate.trim()) open.push("late");
  return open;
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
        value={value}
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
  if (amountEntered(value.loading)) rows.push({ label: "Loading", detail: formatInr(Number(value.loading)) });
  if (amountEntered(value.unloading)) rows.push({ label: "Unloading", detail: formatInr(Number(value.unloading)) });
  if (amountEntered(value.damage)) rows.push({ label: "Damages", detail: formatInr(Number(value.damage)) });
  if (amountEntered(value.productMissing)) rows.push({ label: "Missing", detail: formatInr(Number(value.productMissing)) });
  if (amountEntered(value.delay) || value.actualDeliveryDate.trim()) {
    rows.push({
      label: "Late delivery",
      detail: [
        value.actualDeliveryDate ? formatPodDate(value.actualDeliveryDate) : null,
        amountEntered(value.delay) ? formatInr(Number(value.delay)) : null,
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
  const [menuOpen, setMenuOpen] = useState(false);
  const [openKinds, setOpenKinds] = useState<ExceptionKind[]>(() => kindsFromDraft(value));

  useEffect(() => {
    const fromValue = kindsFromDraft(value);
    if (fromValue.length === 0) return;
    setOpenKinds((current) => Array.from(new Set([...current, ...fromValue])));
  }, [value]);
  const patch = (key: keyof PodExceptionLogDraft, next: string) =>
    onChange({ ...value, [key]: next });
  const lateDays = lateDeliveryDays(plannedDelivery, value.actualDeliveryDate);
  const isLate = lateDays != null && lateDays > 0;
  const entered = kindsFromDraft(value).length > 0;

  const addKind = (kind: ExceptionKind) => {
    setOpenKinds((current) => (current.includes(kind) ? current : [...current, kind]));
    setMenuOpen(false);
  };

  const removeKind = (kind: ExceptionKind) => {
    setOpenKinds((current) => current.filter((item) => item !== kind));
    if (kind === "late") {
      onChange({ ...value, delay: "", actualDeliveryDate: "" });
      return;
    }
    onChange({ ...value, [kind]: "" });
  };

  return (
    <View style={[styles.logCard, mobileExclusive && styles.logCardMobile, menuOpen && styles.logCardMenuOpen]}>
      <View style={styles.logHead}>
        <View style={styles.logHeadCopy}>
          <Text style={styles.kicker}>{submitted ? "Updated from POD" : "Log entry"}</Text>
          <Text style={styles.title}>Exceptions and extra charges</Text>
          <Text style={styles.meta}>
            {submitted
              ? entered
                ? "Debit identified — CN / DN apply in Settlement."
                : "No debit — CN / DN are not required."
              : "Use Log when a debit is identified. If there is none, mark No debit and Validated."}
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
          {submitted ? (
            canManage ? <RegistryGhostButton compact label="Edit" onPress={onEdit} /> : null
          ) : (
            <RegistryGhostButton
              compact
              label="Log"
              onPress={() => setMenuOpen((current) => !current)}
            />
          )}
        </View>
      </View>
      {!submitted && menuOpen ? (
        <View style={styles.logMenu} accessibilityRole="menu">
          {EXCEPTION_KIND_OPTIONS.map((option) => {
            const added = openKinds.includes(option.key);
            return (
              <Pressable
                key={option.key}
                onPress={() => addKind(option.key)}
                style={[styles.logMenuRow, added && styles.logMenuRowActive]}
                accessibilityRole="menuitem"
                accessibilityState={{ selected: added }}
              >
                <View style={styles.logMenuIcon}>
                  <Feather name={option.icon} size={12} color={Theme.textPrimaryDark} />
                </View>
                <View style={styles.exField}>
                  <Text style={styles.logMenuLabel}>{option.label}</Text>
                  <Text style={styles.meta}>{option.hint}</Text>
                </View>
                {added ? <Feather name="check" size={14} color={Theme.textPrimaryDark} /> : null}
              </Pressable>
            );
          })}
        </View>
      ) : null}
      <AlertRegistrySignalCard
        variant="feed"
        isUnread={isLate}
        avatar={{
          name: "Exceptions",
          entityType: "client",
          initialsColorSeed: "pod-exceptions",
        }}
        avatarSlot={
          <View style={[styles.methodIcon, isLate ? styles.methodIconOn : styles.methodIconIdle]}>
            <Feather name="alert-circle" size={16} color={Theme.textPrimaryDark} />
          </View>
        }
        actorName="Trip exceptions"
        actionText={
          isLate
            ? `delivered ${lateDays} day${lateDays === 1 ? "" : "s"} late`
            : entered
              ? "charges logged on this trip"
              : "choose an entry from Log"
        }
        timeLabel={value.actualDeliveryDate ? formatPodDate(value.actualDeliveryDate) : "Actual delivery"}
        contextLabel="POD plan"
        statusPill={{
          label: submitted ? "Submitted" : isLate ? "Late" : entered ? "Logged" : "Open",
          tone: submitted || entered ? (isLate ? "warning" : "success") : "neutral",
        }}
        detailTitle={
          plannedDelivery ? `Planned ${formatPodDate(plannedDelivery)}` : "Set the actual delivery date"
        }
        detailSubtitle="Late delivery uses the actual delivery date"
      />
      {submitted ? (
        <View style={styles.exQuote}>
          {exceptionPreviewRows(value).length === 0 ? (
            <Text style={styles.meta}>No debit on this POD. Settlement will not ask for CN / DN.</Text>
          ) : (
            exceptionPreviewRows(value).map((row) => (
              <View key={row.label} style={styles.exPreviewRow}>
                <Text style={styles.exLabel}>{row.label}</Text>
                <Text style={styles.exPreviewValue}>{row.detail}</Text>
              </View>
            ))
          )}
        </View>
      ) : openKinds.length > 0 ? (
        <View style={styles.exQuote}>
          {openKinds.includes("loading") || openKinds.includes("unloading") ? (
            <View style={[styles.exRow, stacked && styles.exRowStacked]}>
              {openKinds.includes("loading") ? (
                <View style={styles.exField}>
                  <View style={styles.exFieldHead}>
                    <Text style={styles.exLabel}>Loading</Text>
                    <Pressable onPress={() => removeKind("loading")} hitSlop={8} accessibilityLabel="Remove loading">
                      <Feather name="x" size={14} color={Theme.textMuted} />
                    </Pressable>
                  </View>
                  <TextInput
                    value={value.loading}
                    onChangeText={(next) => patch("loading", next)}
                    keyboardType="decimal-pad"
                    placeholder="0"
                    placeholderTextColor={Theme.textMuted}
                    style={styles.exInput}
                    accessibilityLabel="Loading"
                  />
                </View>
              ) : (
                <View style={styles.exField} />
              )}
              {openKinds.includes("unloading") ? (
                <View style={styles.exField}>
                  <View style={styles.exFieldHead}>
                    <Text style={styles.exLabel}>Unloading</Text>
                    <Pressable onPress={() => removeKind("unloading")} hitSlop={8} accessibilityLabel="Remove unloading">
                      <Feather name="x" size={14} color={Theme.textMuted} />
                    </Pressable>
                  </View>
                  <TextInput
                    value={value.unloading}
                    onChangeText={(next) => patch("unloading", next)}
                    keyboardType="decimal-pad"
                    placeholder="0"
                    placeholderTextColor={Theme.textMuted}
                    style={styles.exInput}
                    accessibilityLabel="Unloading"
                  />
                </View>
              ) : (
                <View style={styles.exField} />
              )}
            </View>
          ) : null}
          {openKinds.includes("damage") || openKinds.includes("productMissing") ? (
            <View style={[styles.exRow, stacked && styles.exRowStacked]}>
              {openKinds.includes("damage") ? (
                <View style={styles.exField}>
                  <View style={styles.exFieldHead}>
                    <Text style={styles.exLabel}>Damages</Text>
                    <Pressable onPress={() => removeKind("damage")} hitSlop={8} accessibilityLabel="Remove damages">
                      <Feather name="x" size={14} color={Theme.textMuted} />
                    </Pressable>
                  </View>
                  <TextInput
                    value={value.damage}
                    onChangeText={(next) => patch("damage", next)}
                    keyboardType="decimal-pad"
                    placeholder="0"
                    placeholderTextColor={Theme.textMuted}
                    style={styles.exInput}
                    accessibilityLabel="Damages"
                  />
                </View>
              ) : (
                <View style={styles.exField} />
              )}
              {openKinds.includes("productMissing") ? (
                <View style={styles.exField}>
                  <View style={styles.exFieldHead}>
                    <Text style={styles.exLabel}>Missing</Text>
                    <Pressable onPress={() => removeKind("productMissing")} hitSlop={8} accessibilityLabel="Remove missing">
                      <Feather name="x" size={14} color={Theme.textMuted} />
                    </Pressable>
                  </View>
                  <TextInput
                    value={value.productMissing}
                    onChangeText={(next) => patch("productMissing", next)}
                    keyboardType="decimal-pad"
                    placeholder="0"
                    placeholderTextColor={Theme.textMuted}
                    style={styles.exInput}
                    accessibilityLabel="Missing"
                  />
                </View>
              ) : (
                <View style={styles.exField} />
              )}
            </View>
          ) : null}
          {openKinds.includes("late") ? (
            <View style={[styles.exRow, stacked && styles.exRowStacked]}>
              <View style={styles.exField}>
                <View style={styles.exFieldHead}>
                  <Text style={styles.exLabel}>Late delivery</Text>
                  <Pressable onPress={() => removeKind("late")} hitSlop={8} accessibilityLabel="Remove late delivery">
                    <Feather name="x" size={14} color={Theme.textMuted} />
                  </Pressable>
                </View>
                <HardCopyPodDateField
                  quiet
                  label="Actual delivery date"
                  value={value.actualDeliveryDate}
                  onChange={(iso) => patch("actualDeliveryDate", iso)}
                />
              </View>
              <QuietAmountField
                label={isLate ? `Late delivery (${lateDays}d)` : "Late delivery"}
                value={value.delay}
                onChange={(next) => patch("delay", next)}
              />
            </View>
          ) : null}
        </View>
      ) : (
        <Text style={[styles.meta, styles.exHint]}>Tap Log and choose loading, unloading, damages, missing, or late delivery.</Text>
      )}
      {!submitted && canManage ? (
        <View style={styles.exSubmit}>
          {saveError ? <Text style={styles.exError}>{saveError}</Text> : null}
          <View style={[styles.exSubmitRow, stacked && styles.exSubmitRowStacked]}>
            {onCancelEdit ? <RegistryGhostButton compact label="Cancel" onPress={onCancelEdit} /> : null}
            <RegistryPrimaryButton
              compact
              label={saving ? "Saving…" : entered ? "Save" : "Save no debit"}
              onPress={onSubmit}
              disabled={saving}
            />
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, minHeight: 0, flexDirection: "row" },
  rootStacked: { flexDirection: "column" },
  rootMobile: { backgroundColor: "transparent" },
  previewCol: { flex: 1, minWidth: 0, minHeight: 0 },
  previewContent: { padding: 12, gap: 12, paddingBottom: 20 },
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
  validateActions: {
    flexDirection: "row",
    flexWrap: "wrap",
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
    borderRadius: 0,
    borderWidth: 0,
    backgroundColor: "transparent",
    overflow: "visible",
  },
  logCardMobile: {
    borderRadius: 0,
    borderWidth: 0,
    backgroundColor: "transparent",
    overflow: "visible",
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
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.surfaceGray,
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
