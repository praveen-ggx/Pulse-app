/**
 * Global Compliance Verification work queue — header, counted stage filters,
 * Cards/Table toggle, and Trip/Vehicle/Driver checklist cards.
 */
import { ChromeBelowTopNavLoadingScreen } from "@/components/chromeLoadingScreens";
import { HubPromoHeroLottie } from "@/components/hub/HubPromoLottie";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { useAuth } from "@/contexts/AuthContext";
import { useOptionalOrganization } from "@/contexts/OrganizationContext";
import { ComplianceAdvanceProcessedTable } from "@/features/tripCompliance/components/ComplianceAdvanceProcessedTable";
import { ComplianceDocumentWorkspace } from "@/features/tripCompliance/components/ComplianceDocumentWorkspace";
import { ComplianceExportConfirmModal } from "@/features/tripCompliance/components/ComplianceExportConfirmModal";
import { CompliancePaymentConfirmModal } from "@/features/tripCompliance/components/CompliancePaymentConfirmModal";
import { ComplianceSegmentedFilter } from "@/features/tripCompliance/components/ComplianceSegmentedFilter";
import { ComplianceTripsTable } from "@/features/tripCompliance/components/ComplianceTripsTable";
import {
    COMPLIANCE_QUEUE_WINDOW_SIZE,
    useComplianceListWindow,
} from "@/features/tripCompliance/hooks/useComplianceListWindow";
import { useComplianceListTripFacts } from "@/features/tripCompliance/hooks/useComplianceListTripFacts";
import { useComplianceProductEnabled } from "@/features/tripCompliance/hooks/useComplianceProductEnabled";
import {
    tripAppearsInBalancePending,
    tripStillInPodReceived,
    useComplianceChangeSync,
    useComplianceStageFilter,
    useComplianceTripsQuery,
    type ComplianceQueueFilter,
    type ComplianceStageCounts,
} from "@/features/tripCompliance/hooks/useComplianceTripsQuery";
import { tripAppearsInAwaitingPod } from "@/features/tripCompliance/services/tripComplianceRead.service";
import {
    downloadAdvanceProcessedReport,
    downloadComplianceTableExport,
    exportVerifiedStageComplianceReport,
    prepareAdvanceProcessedReport,
} from "@/features/tripCompliance/services/complianceExportReport.service";
import {
    declineTripCompliance,
    markTripComplianceVerified,
    postCompliancePayment,
    rejectTripCompliance,
    type ComplianceLedgerCategory,
} from "@/features/tripCompliance/services/tripComplianceWrite.service";
import { COMPLIANCE_STAGE_FILTER_LABEL, type ComplianceTripSummary } from "@/features/tripCompliance/tripCompliance.types";
import {
    AWAITING_POD_SUBVIEW_LABEL,
    AWAITING_POD_SUBVIEW_TONE,
    AWAITING_POD_SUBVIEWS,
    countAwaitingPodSubviews,
    matchesAwaitingPodSubview,
    type AwaitingPodSubview,
} from "@/features/tripCompliance/utils/awaitingPodSubview.util";
import {
    countAdvanceProcessedExport,
    type AdvanceProcessedExportRow,
} from "@/features/tripCompliance/utils/complianceAdvanceProcessedExport.util";
import { sortAdvanceProcessedSummaries } from "@/features/tripCompliance/utils/complianceAdvanceProcessedSort.util";
import {
    COMPLIANCE_FILTER_COUNT_TONE,
    COMPLIANCE_STAGE_TONE,
    matchesComplianceTripSearch,
    supplierComplianceSearchLabels,
} from "@/features/tripCompliance/utils/complianceCardVisual.util";
import {
    countVerifiedStageTrips,
} from "@/features/tripCompliance/utils/complianceExportReport.util";
import { formatMarkComplianceVerifiedError } from "@/features/tripCompliance/utils/complianceMarkVerifiedError.util";
import {
    isPendingDocsDeliveredTrip,
    isPendingDocsInTransitTrip,
} from "@/features/tripCompliance/utils/compliancePipelineTrips.util";
import {
    deriveComplianceQueueReadiness,
    isCompliancePaymentPending,
    isComplianceVerifiedQueue,
} from "@/features/tripCompliance/utils/complianceReadiness.util";
import {
    complianceRejectQueueDestination,
    complianceRejectQueuePathLabel,
} from "@/features/tripCompliance/utils/complianceRejectReason.util";
import {
    complianceExportDateSpan,
    complianceTableExportMessage,
    sortComplianceTableRows,
} from "@/features/tripCompliance/utils/complianceTableExport.util";
import {
    isComplianceDeclineActive,
    isFinanceDeclinedForCompliancePending,
    isFinanceDeclinedForPendingDocs,
    isFinanceDeclinedTrip,
    isPendingDocsComplianceHold,
} from "@/features/tripCompliance/utils/complianceTableStatus.util";
import { alertMessage } from "@/features/tripCompliance/utils/crossPlatformAlert.util";
import { normalizeOrgLrNumber } from "@/features/trips/services/orgLrNumber.util";
import { getTripDisplayNumber } from "@/features/trips/services/trips.service";
import { hardCopyPodLrOptionsFromDocuments } from "@/features/trips/utils/hardCopyPodLrSelection.util";
import { EMPTY_STATE_LOTTIE } from "@/lib/emptyStateLottieAssets";
import { useLayoutInsets } from "@/lib/layoutInsets";
import {
    useRealtimeTransactionsInvalidation,
    useRealtimeTripsInvalidation,
} from "@/lib/queries/useRealtimeInvalidation";
import { useSuppliersQuery } from "@/lib/queries/useSuppliersQuery";
import { ROUTES } from "@/lib/routes";
import { useMemberAccess } from "@/lib/useMemberAccess";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Download, FileText, LayoutGrid, Search, Table2, Wallet } from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, useWindowDimensions, View, type LayoutChangeEvent, type NativeSyntheticEvent, type NativeScrollEvent, type TextStyle } from "react-native";

function complianceQueueLabel(stage: ComplianceQueueFilter): string {
  if (stage === "all") return "All";
  if (stage === "pod_received") return "POD Received";
  return COMPLIANCE_STAGE_FILTER_LABEL[stage];
}

const STAGE_DEPT_GROUPS = [
  { department: "Ground Ops", stages: ["pending_for_docs"] },
  { department: "Compliance", stages: ["compliance_pending"] },
  {
    department: "Finance",
    stages: ["compliance_verified", "advance_payment_processed"],
  },
  { department: "Debit", stages: ["hard_copy_pod_received"] },
  { department: "Finance", stages: ["balance_pending"] },
] as const;

function StageChip({
  label,
  count,
  countColor,
  active,
  onPress,
  caption,
  reserveCaption = false,
}: {
  label: string;
  count: number;
  countColor: string;
  active: boolean;
  onPress: () => void;
  caption?: string;
  reserveCaption?: boolean;
}) {
  const showCaptionCol = Boolean(caption) || reserveCaption;
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.88}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={styles.chipStack}
      hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
    >
      <View style={[styles.chip, active && styles.chipActive]}>
        <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>
          {label}
        </Text>
        {count > 0 ? (
          <View
            style={[
              styles.chipCountBadge,
              { backgroundColor: active ? Theme.cardWhite : countColor },
            ]}
          >
            <Text
              style={[
                styles.chipCount,
                { color: active ? Theme.liquidGoodBack : Theme.buttonDarkText },
              ]}
            >
              {count}
            </Text>
          </View>
        ) : null}
      </View>
      {showCaptionCol ? (
        caption ? (
          <View style={styles.chipCaptionPanel}>
            <Text style={styles.chipCaption} numberOfLines={1}>
              {caption}
            </Text>
          </View>
        ) : (
          <View style={styles.chipCaptionSlot} />
        )
      ) : null}
    </TouchableOpacity>
  );
}

function StageFilterRail({
  stage,
  counts,
  onSelectStage,
}: {
  stage: ComplianceQueueFilter;
  counts: ComplianceStageCounts;
  onSelectStage: (next: ComplianceQueueFilter) => void;
}) {
  return (
    <View style={styles.stageTrack} accessibilityRole="tablist">
      <StageChip
        label="All"
        count={counts.all}
        countColor={COMPLIANCE_FILTER_COUNT_TONE.all}
        active={stage === "all"}
        onPress={() => onSelectStage("all")}
        reserveCaption
      />
      {STAGE_DEPT_GROUPS.map((group) =>
        group.stages.map((item) => (
          <StageChip
            key={item}
            label={COMPLIANCE_STAGE_FILTER_LABEL[item]}
            count={
              item === "balance_pending"
                ? counts.balance_pending + counts.payment_settled
                : counts[item]
            }
            countColor={COMPLIANCE_FILTER_COUNT_TONE[item]}
            active={stage === item}
            onPress={() => onSelectStage(item)}
            caption={group.department}
          />
        )),
      )}
    </View>
  );
}

type TableQueueScrollEvent = NativeSyntheticEvent<NativeScrollEvent>;

function TableQueueScroll({
  onScroll,
  onContentSizeChange,
  onLayout,
  fillIfShort,
  loadingMore,
  hasMore,
  allLoaded,
  total,
  children,
}: {
  onScroll: (event: TableQueueScrollEvent) => void;
  onContentSizeChange: (width: number, height: number) => void;
  onLayout: (event: LayoutChangeEvent) => void;
  fillIfShort: () => void;
  loadingMore: boolean;
  hasMore: boolean;
  allLoaded: boolean;
  total: number;
  children: React.ReactNode;
}) {
  return (
    <ScrollView
      style={styles.queueScroll}
      contentContainerStyle={styles.queueScrollContent}
      keyboardShouldPersistTaps="handled"
      onScroll={onScroll}
      scrollEventThrottle={16}
      onContentSizeChange={onContentSizeChange}
      onLayout={onLayout}
    >
      {children}
      {loadingMore ? (
        <View style={styles.tableLoadMore} accessibilityLabel="Loading more trips">
          <ActivityIndicator size="small" color={Theme.textMuted} />
        </View>
      ) : null}
      {hasMore && !loadingMore ? (
        <View
          style={styles.tableLoadSentinel}
          onLayout={() => fillIfShort()}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />
      ) : null}
      {allLoaded && total > COMPLIANCE_QUEUE_WINDOW_SIZE ? (
        <Text style={styles.tableLoadEnd}>All trips loaded</Text>
      ) : null}
    </ScrollView>
  );
}

/** Window in which a retried Decline submit reuses its idempotency key. */
const DECLINE_KEY_REUSE_MS = 2 * 60 * 1000;
const ADVANCE_PROCESSED_TONE = COMPLIANCE_STAGE_TONE.advance_payment_processed;

export default function ComplianceScreen() {
  const layout = useLayoutInsets();
  const { width, height: windowHeight } = useWindowDimensions();
  const router = useRouter();
  const { can: canSurface, isLoading: accessLoading } = useMemberAccess();
  const { enabled: complianceEnabled, isLoading: productsLoading } = useComplianceProductEnabled();
  const canViewCompliance = complianceEnabled && canSurface("trip_compliance.tab");
  const canViewDocuments = canSurface("trip_compliance.documents.view");
  const canVerifyDocuments = canSurface("trip_compliance.documents.verify");
  const canMarkVerified = canSurface("trip_compliance.trip.mark_verified");
  const canManagePod = canSurface("trip_compliance.pod.manage");
  const canManageFinance = canSurface("trip_compliance.finance.manage");
  const canViewFinance = canSurface("trip_compliance.finance.view");
  const { user } = useAuth();
  const orgCtx = useOptionalOrganization();
  const currentOrganization = orgCtx?.currentOrganization ?? null;
  // Keep Settlement stages/counts and Finance Ledger in lockstep while this screen is open.
  useRealtimeTripsInvalidation(currentOrganization?.id ?? null);
  useRealtimeTransactionsInvalidation(currentOrganization?.id ?? null);

  const {
    summaries,
    isLoading,
    isError,
    error,
    isFetching,
    refetch,
  } = useComplianceTripsQuery();
  const { stage, setStage, filtered, counts, declinedCount } =
    useComplianceStageFilter(summaries);
  const [pendingSlice, setPendingSlice] = useState<"all" | "hold" | "finance_declined" | "rejected">("all");
  /** Pending Docs only: In-transit vs Delivered (ops trip.status). Above All / Hold / Declined. */
  const [pendingTransitSlice, setPendingTransitSlice] = useState<"in_transit" | "delivered">("in_transit");
  /** Subtabs under Verified: All / Verified / Compliance / Docs Follow Up. */
  const [verifiedSlice, setVerifiedSlice] = useState<
    "all" | "verified" | "compliance" | "pending_docs"
  >("all");
  /** Subtabs under POD: All / POD Pending / POD Received. IBond stays under Received. */
  const [podSlice, setPodSlice] = useState<"all" | "pending" | "received">("all");
  /** Subtabs under Settlement: All / Balance Pending / Settled. */
  const [settlementSlice, setSettlementSlice] = useState<"all" | "pending" | "settled">("all");
  /** When stage changes via Reject, keep the Declined by finance subtab (effect would otherwise reset to All). */
  const pendingSliceAfterStageRef = useRef<"all" | "hold" | "finance_declined" | "rejected" | null>(null);
  const verifiedSliceAfterStageRef = useRef<"all" | "verified" | "compliance" | "pending_docs" | null>(null);
  useEffect(() => {
    const intent = pendingSliceAfterStageRef.current;
    pendingSliceAfterStageRef.current = null;
    setPendingSlice(intent ?? "all");
    const verifiedIntent = verifiedSliceAfterStageRef.current;
    verifiedSliceAfterStageRef.current = null;
    if (stage !== "compliance_verified") setVerifiedSlice("all");
    else if (verifiedIntent) setVerifiedSlice(verifiedIntent);
    if (stage !== "hard_copy_pod_received") setPodSlice("all");
    if (stage !== "balance_pending") setSettlementSlice("all");
    if (stage !== "pending_for_docs") setPendingTransitSlice("in_transit");
  }, [stage]);
  const [viewMode, setViewMode] = useState<"card" | "table">("card");
  const [cardTripId, setCardTripId] = useState<string | null>(null);
  const [chargeFocus, setChargeFocus] = useState<{ tripId: string; token: number } | null>(null);
  const [cardFocus, setCardFocus] = useState<{
    tab: "trip" | "vehicle" | "driver";
    token: number;
  } | null>(null);
  const [awaitingPodSubview, setAwaitingPodSubview] = useState<AwaitingPodSubview>("all");
  const [podReceivedSubview, setPodReceivedSubview] = useState<"all" | "ibond">("all");
  const podPendingPool = useMemo(
    () =>
      stage === "hard_copy_pod_received" ? filtered.filter(tripAppearsInAwaitingPod) : [],
    [filtered, stage],
  );
  const podReceivedPool = useMemo(
    () =>
      stage === "hard_copy_pod_received" ? filtered.filter(tripStillInPodReceived) : [],
    [filtered, stage],
  );
  const settlementPendingPool = useMemo(
    () => (stage === "balance_pending" ? filtered.filter(tripAppearsInBalancePending) : []),
    [filtered, stage],
  );
  const settlementSettledPool = useMemo(
    () => (stage === "balance_pending" ? filtered.filter((s) => s.stage === "payment_settled") : []),
    [filtered, stage],
  );
  const awaitingPodCounts = useMemo(
    () =>
      stage === "hard_copy_pod_received" && podSlice === "pending"
        ? countAwaitingPodSubviews(podPendingPool)
        : null,
    [stage, podSlice, podPendingPool],
  );
  const podReceivedCounts = useMemo(() => {
    if (stage !== "hard_copy_pod_received" || podSlice !== "received") return null;
    const ibond = podReceivedPool.filter((summary) => summary.hardCopyPod?.ibond === true).length;
    return { all: podReceivedPool.length - ibond, ibond };
  }, [stage, podSlice, podReceivedPool]);
  const selectStage = useCallback((next: Parameters<typeof setStage>[0]) => {
    setStage(next);
    if (next !== "hard_copy_pod_received") {
      setPodSlice("all");
      setAwaitingPodSubview("all");
      setPodReceivedSubview("all");
    }
    if (next !== "balance_pending") setSettlementSlice("all");
  }, [setStage]);
  const courierLrOptions = useMemo(() => {
    if (stage !== "hard_copy_pod_received" || podSlice === "received") return [];
    const awaiting = podPendingPool;
    const tripDisplayById = new Map(
      awaiting.map((summary) => [
        summary.trip.id,
        getTripDisplayNumber(summary.trip, currentOrganization?.id ?? null),
      ]),
    );
    const receivedByTrip = new Map(
      awaiting.map((summary) => [
        summary.trip.id,
        new Set((summary.hardCopyPod.receivedLrNumbers ?? []).map((lr) => normalizeOrgLrNumber(lr))),
      ]),
    );
    return hardCopyPodLrOptionsFromDocuments(
      awaiting.flatMap((summary) =>
        summary.documents
          .filter((doc) => (doc.document_type ?? "").toLowerCase() === "lr")
          .map((doc) => ({
            tripId: doc.trip_id || summary.trip.id,
            documentNumber: doc.document_number,
            storagePath: doc.storage_path,
          })),
      ),
      tripDisplayById,
    ).map((option) => ({
      ...option,
      alreadyReceived: receivedByTrip.get(option.tripId)?.has(normalizeOrgLrNumber(option.lrNumber)) ?? false,
    }));
  }, [stage, podSlice, podPendingPool, currentOrganization?.id]);
  const suppliersQuery = useSuppliersQuery(currentOrganization?.id ?? null);
  const supplierSearchById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const supplier of suppliersQuery.data ?? []) {
      const labels = supplierComplianceSearchLabels(supplier);
      if (labels) map[supplier.id] = labels;
    }
    return map;
  }, [suppliersQuery.data]);
  // Resolve labels for the full queue so supplier search works across stage chips.
  const tripFacts = useComplianceListTripFacts(
    summaries,
    currentOrganization?.id ?? "",
  );
  const { supplierNameByTripId } = tripFacts;
  const syncChange = useComplianceChangeSync();
  const markTripVerified = useCallback(
    async (tripId: string) => {
      if (!canMarkVerified) {
        alertMessage("Can't verify", "You don't have permission to mark this trip compliance verified.");
        return false;
      }
      if (!user?.uid) {
        alertMessage("Can't verify", "Sign in again, then try Verify Docs.");
        return false;
      }
      const wasFinanceDeclined = Boolean(
        (summaries ?? []).find((row) => row.trip.id === tripId && isFinanceDeclinedTrip(row)),
      );
      const { error } = await markTripComplianceVerified({ tripId, actorId: user.uid });
      if (error) {
        alertMessage("Couldn't verify compliance", formatMarkComplianceVerifiedError(error.message));
        return false;
      }
      await syncChange({ type: "complianceVerified", tripId, actorId: user.uid });
      // First verify and re-verify after Declined by finance both land on Verified.
      setStage("compliance_verified");
      setCardTripId(tripId);
      if (wasFinanceDeclined) {
        setTimeout(
          () =>
            alertMessage(
              "Trip verified",
              "Documents confirmed. The trip is back on Verified.",
            ),
          0,
        );
      }
      return true;
    },
    [canMarkVerified, setStage, summaries, syncChange, user?.uid],
  );
  /**
   * One idempotency key per (trip, reason) submit, kept until success so a quick
   * retry after a network failure is deduped server-side. A different reason, or a
   * retry after DECLINE_KEY_REUSE_MS, gets a new key (so a later re-decline with the
   * same text is never silently skipped).
   */
  const declineKeysRef = useRef(new Map<string, { reason: string; key: string; at: number }>());
  const declineTrip = useCallback(
    async (tripId: string, reason: string) => {
      if (!canMarkVerified) {
        throw new Error("You don't have permission to decline compliance for this trip.");
      }
      if (!user?.uid) {
        throw new Error("Sign in again, then try Decline.");
      }
      const trimmed = reason.trim();
      const keys = declineKeysRef.current;
      const now = Date.now();
      let entry = keys.get(tripId);
      if (!entry || entry.reason !== trimmed || now - entry.at > DECLINE_KEY_REUSE_MS) {
        entry = { reason: trimmed, key: `${tripId}:${now}:${Math.random().toString(36).slice(2, 10)}`, at: now };
        keys.set(tripId, entry);
      }
      try {
        await declineTripCompliance({ tripId, reason: trimmed, idempotencyKey: entry.key });
      } catch (error) {
        // e.g. someone else verified it meanwhile — refresh this trip's flags so the
        // row catches up, then let the modal show the (user-facing) error.
        void syncChange({ type: "tripFlags", tripId }).catch(() => undefined);
        throw error;
      }
      keys.delete(tripId);
      await syncChange({ type: "complianceDeclined", tripId, actorId: user.uid, reason: trimmed });
      // Defer so the modal can close first (web alert blocks).
      setTimeout(() => alertMessage("Compliance declined", "The trip stays in Ready to Verify with your reason recorded."), 0);
    },
    [canMarkVerified, syncChange, user?.uid],
  );

  const rejectKeysRef = useRef(new Map<string, { reason: string; key: string; at: number }>());
  const rejectTrip = useCallback(
    async (tripId: string, reason: string) => {
      if (!canMarkVerified) {
        throw new Error("You don't have permission to reject compliance for this trip.");
      }
      if (!user?.uid) {
        throw new Error("Sign in again, then try Reject.");
      }
      const trimmed = reason.trim();
      const keys = rejectKeysRef.current;
      const now = Date.now();
      let entry = keys.get(tripId);
      if (!entry || entry.reason !== trimmed || now - entry.at > DECLINE_KEY_REUSE_MS) {
        entry = { reason: trimmed, key: `${tripId}:rej:${now}:${Math.random().toString(36).slice(2, 10)}`, at: now };
        keys.set(tripId, entry);
      }
      try {
        await rejectTripCompliance({ tripId, reason: trimmed, idempotencyKey: entry.key });
      } catch (error) {
        void syncChange({ type: "tripFlags", tripId }).catch(() => undefined);
        throw error;
      }
      keys.delete(tripId);
      await syncChange({ type: "complianceDeclined", tripId, actorId: user.uid, reason: trimmed });
      const destination = complianceRejectQueueDestination(trimmed);
      const pathLabel = complianceRejectQueuePathLabel(trimmed);
      if (destination === "pending_for_docs") {
        pendingSliceAfterStageRef.current = "rejected";
        setStage("pending_for_docs");
      } else {
        pendingSliceAfterStageRef.current = "finance_declined";
        setStage("compliance_pending");
      }
      setCardTripId(tripId);
      setTimeout(
        () =>
          alertMessage(
            "Trip declined by finance",
            `Moved to ${pathLabel}. Advance payment stays blocked until compliance verifies the documents again.`,
          ),
        0,
      );
    },
    [canMarkVerified, setStage, syncChange, user?.uid],
  );

  const [search, setSearch] = useState("");
  const [pay, setPay] = useState<{ summary: ComplianceTripSummary; category: ComplianceLedgerCategory } | null>(null);
  const [paying, setPaying] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [logHardCopyPodRequest, setLogHardCopyPodRequest] = useState(0);
  const [exporting, setExporting] = useState(false);
  const routeFocus = useLocalSearchParams<{ trip?: string; tab?: string }>();

  const complianceHoldCount = useMemo(
    () => (summaries ?? []).filter(isComplianceDeclineActive).length,
    [summaries],
  );
  const pendingDocsHoldCount = useMemo(
    () => (summaries ?? []).filter(isPendingDocsComplianceHold).length,
    [summaries],
  );
  const financeDeclinedCount = useMemo(
    () => (summaries ?? []).filter(isFinanceDeclinedForCompliancePending).length,
    [summaries],
  );
  const pendingDocsRejectedCount = useMemo(
    () => (summaries ?? []).filter(isFinanceDeclinedForPendingDocs).length,
    [summaries],
  );
  const matchPendingDocsTransit = useCallback(
    (summary: ComplianceTripSummary) =>
      pendingTransitSlice === "delivered"
        ? isPendingDocsDeliveredTrip(summary)
        : isPendingDocsInTransitTrip(summary),
    [pendingTransitSlice],
  );
  /** Pending Docs "All" list for the selected In-transit / Delivered subtab. */
  const pendingDocsTransitPool = useMemo(() => {
    if (stage !== "pending_for_docs") return [];
    return filtered.filter(matchPendingDocsTransit);
  }, [filtered, matchPendingDocsTransit, stage]);
  const pendingDocsTransitCounts = useMemo(() => {
    if (stage !== "pending_for_docs") {
      return { in_transit: 0, delivered: 0 };
    }
    let inTransit = 0;
    let delivered = 0;
    for (const row of filtered) {
      if (isPendingDocsDeliveredTrip(row)) delivered += 1;
      else inTransit += 1;
    }
    return { in_transit: inTransit, delivered };
  }, [filtered, stage]);
  const pendingDocsHoldCountScoped = useMemo(
    () =>
      (summaries ?? [])
        .filter(isPendingDocsComplianceHold)
        .filter(matchPendingDocsTransit).length,
    [matchPendingDocsTransit, summaries],
  );
  const pendingDocsRejectedCountScoped = useMemo(
    () =>
      (summaries ?? [])
        .filter(isFinanceDeclinedForPendingDocs)
        .filter(matchPendingDocsTransit).length,
    [matchPendingDocsTransit, summaries],
  );
  const verifiedOnlyCount = useMemo(
    () =>
      (summaries ?? []).filter((summary) => isComplianceVerifiedQueue(summary) || isCompliancePaymentPending(summary))
        .length,
    [summaries],
  );
  const stagePool = useMemo(() => {
    if (stage === "compliance_verified") {
      if (verifiedSlice === "verified") {
        return filtered.filter((summary) => isComplianceVerifiedQueue(summary) || isCompliancePaymentPending(summary));
      }
      if (verifiedSlice === "compliance") {
        return (summaries ?? []).filter(isFinanceDeclinedForCompliancePending);
      }
      if (verifiedSlice === "pending_docs") {
        return (summaries ?? []).filter(isFinanceDeclinedForPendingDocs);
      }
      return filtered;
    }
    if (stage === "compliance_pending") {
      if (pendingSlice === "all") return filtered;
      if (pendingSlice === "hold") return (summaries ?? []).filter(isComplianceDeclineActive);
      if (pendingSlice === "finance_declined") {
        return (summaries ?? []).filter(isFinanceDeclinedForCompliancePending);
      }
      return filtered;
    }
    if (stage === "pending_for_docs") {
      if (pendingSlice === "all") return pendingDocsTransitPool;
      if (pendingSlice === "hold") {
        return (summaries ?? []).filter(isPendingDocsComplianceHold).filter(matchPendingDocsTransit);
      }
      if (pendingSlice === "rejected") {
        return (summaries ?? []).filter(isFinanceDeclinedForPendingDocs).filter(matchPendingDocsTransit);
      }
      return pendingDocsTransitPool;
    }
    if (stage === "hard_copy_pod_received") {
      if (podSlice === "pending") {
        if (awaitingPodSubview === "all") return podPendingPool;
        return podPendingPool.filter((summary) =>
          matchesAwaitingPodSubview(summary, awaitingPodSubview),
        );
      }
      if (podSlice === "received") {
        if (podReceivedSubview === "ibond") {
          return podReceivedPool.filter((summary) => summary.hardCopyPod?.ibond === true);
        }
        return podReceivedPool.filter((summary) => summary.hardCopyPod?.ibond !== true);
      }
      return filtered;
    }
    if (stage === "balance_pending") {
      if (settlementSlice === "pending") return settlementPendingPool;
      if (settlementSlice === "settled") return settlementSettledPool;
      return filtered;
    }
    return filtered;
  }, [
    awaitingPodSubview,
    filtered,
    matchPendingDocsTransit,
    pendingDocsTransitPool,
    pendingSlice,
    podPendingPool,
    podReceivedPool,
    podReceivedSubview,
    podSlice,
    settlementPendingPool,
    settlementSettledPool,
    settlementSlice,
    stage,
    summaries,
    verifiedSlice,
  ]);
  /** Export Report covers the Verified stage only, so it is offered only on that chip. */
  const isVerifiedStage = stage === "compliance_verified";
  useEffect(() => {
    if (!isVerifiedStage && !exporting) setExportOpen(false);
  }, [isVerifiedStage, exporting]);
  /** Hardcopy POD PREVIEW control — late POD/settlement chips only. */
  const showHardcopyPodButton =
    stage === "hard_copy_pod_received" ||
    stage === "balance_pending";

  /**
   * Docs Follow Up / Ready to Verify / Verified — segmented control.
   * `embedded` = table toolbar (unchanged sizing). Card list uses `cardDense`.
   */
  const renderQueueSubFilter = (embedded: boolean) => {
    const cardDense = !embedded;
    if (stage === "pending_for_docs") {
      const outcomeFilter = (
        <ComplianceSegmentedFilter
          embedded
          compact
          cardDense={cardDense}
          value={
            pendingSlice === "finance_declined"
              ? "all"
              : pendingSlice === "rejected"
                ? "rejected"
                : pendingSlice
          }
          counts={{
            all: pendingDocsTransitPool.length,
            hold: pendingDocsHoldCountScoped,
            rejected: pendingDocsRejectedCountScoped,
          }}
          options={[
            { id: "all", label: "Inbox", a11yLabel: "Inbox", dot: null },
            {
              id: "hold",
              label: "Compliance Hold",
              a11yLabel: "Compliance Hold",
              dot: COMPLIANCE_STAGE_TONE.compliance_pending.fg,
            },
            {
              id: "rejected",
              label: "Declined by finance",
              a11yLabel: "Declined by finance",
              dot: COMPLIANCE_STAGE_TONE.pending_for_docs.fg,
            },
          ]}
          onChange={(next) => setPendingSlice(next)}
        />
      );
      const transitFilter = (
        <ComplianceSegmentedFilter
          embedded
          compact
          cardDense={cardDense}
          value={pendingTransitSlice}
          counts={pendingDocsTransitCounts}
          options={[
            {
              id: "in_transit",
              label: "In-transit",
              a11yLabel: "In transit",
              dot: Theme.complianceStageInfoFg,
            },
            {
              id: "delivered",
              label: "Delivered",
              a11yLabel: "Delivered",
              dot: COMPLIANCE_STAGE_TONE.compliance_verified.fg,
            },
          ]}
          onChange={setPendingTransitSlice}
        />
      );
      if (embedded) {
        return (
          <View style={styles.pendingDocsFilterStackEmbedded}>
            {transitFilter}
            {outcomeFilter}
          </View>
        );
      }
      return (
        <View style={styles.pendingDocsFilterStackCard}>
          {transitFilter}
          {outcomeFilter}
        </View>
      );
    }
    if (stage === "compliance_pending") {
      return (
        <ComplianceSegmentedFilter
          embedded={embedded}
          compact
          cardDense={cardDense}
          value={pendingSlice === "rejected" ? "all" : pendingSlice}
          counts={{
            all: counts.compliance_pending,
            hold: complianceHoldCount,
            finance_declined: financeDeclinedCount,
          }}
          options={[
            { id: "all", label: "Inbox", a11yLabel: "Inbox", dot: null },
            {
              id: "hold",
              label: "Compliance Hold",
              a11yLabel: "Compliance Hold",
              dot: COMPLIANCE_STAGE_TONE.compliance_pending.fg,
            },
            {
              id: "finance_declined",
              label: "Declined by finance",
              a11yLabel: "Declined by finance",
              dot: COMPLIANCE_STAGE_TONE.pending_for_docs.fg,
            },
          ]}
          onChange={(next) => setPendingSlice(next)}
        />
      );
    }
    if (stage === "compliance_verified") {
      const verifiedCounts = {
        all: filtered.length,
        verified: verifiedOnlyCount,
        compliance: financeDeclinedCount,
        pending_docs: pendingDocsRejectedCount,
      };
      return (
        <View
          style={[
            styles.verifiedFilterRow,
            embedded ? styles.verifiedFilterRowTable : styles.verifiedFilterRowCard,
          ]}
        >
          <View style={embedded ? styles.verifiedFilterGroupTable : styles.verifiedFilterGroupQueue}>
            <View style={styles.verifiedFilterGroupLabelPanel}>
              <Text style={styles.verifiedFilterGroupLabel}>Queue</Text>
            </View>
            <ComplianceSegmentedFilter
              embedded
              compact
              cardDense={cardDense}
              narrow={!embedded}
              value={verifiedSlice}
              counts={verifiedCounts}
              options={[
                { id: "all", label: "Inbox", a11yLabel: "Inbox", dot: null },
                {
                  id: "verified",
                  label: "Verified",
                  a11yLabel: "Verified",
                  dot: COMPLIANCE_STAGE_TONE.compliance_verified.fg,
                },
              ]}
              onChange={setVerifiedSlice}
            />
          </View>
          <View style={embedded ? styles.verifiedFilterGroupTable : styles.verifiedFilterGroupDeclined}>
            <View style={styles.verifiedFilterGroupLabelPanel}>
              <Text style={styles.verifiedFilterGroupLabel}>Declined</Text>
            </View>
            <ComplianceSegmentedFilter
              embedded
              compact
              cardDense={cardDense}
              value={verifiedSlice}
              counts={verifiedCounts}
              options={[
                {
                  id: "compliance",
                  label: "Ready to Verify",
                  a11yLabel: "Ready to Verify",
                  dot: COMPLIANCE_STAGE_TONE.compliance_pending.fg,
                },
                {
                  id: "pending_docs",
                  label: "Docs Follow Up",
                  a11yLabel: "Docs Follow Up declined by finance",
                  dot: COMPLIANCE_STAGE_TONE.pending_for_docs.fg,
                },
              ]}
              onChange={setVerifiedSlice}
            />
          </View>
        </View>
      );
    }
    if (stage === "hard_copy_pod_received") {
      return (
        <ComplianceSegmentedFilter
          embedded={embedded}
          compact
          cardDense={cardDense}
          value={podSlice}
          counts={{
            all: filtered.length,
            pending: podPendingPool.length,
            received: podReceivedPool.length,
          }}
          options={[
            { id: "all", label: "Inbox", a11yLabel: "Inbox", dot: null },
            {
              id: "pending",
              label: "POD Pending",
              a11yLabel: "POD Pending",
              dot: COMPLIANCE_STAGE_TONE.hard_copy_pod_received.fg,
            },
            {
              id: "received",
              label: "POD Received",
              a11yLabel: "POD Received",
              dot: Theme.complianceStageSuccessFg,
            },
          ]}
          onChange={(next) => {
            setPodSlice(next);
            if (next !== "pending") setAwaitingPodSubview("all");
            if (next !== "received") setPodReceivedSubview("all");
          }}
        />
      );
    }
    if (stage === "balance_pending") {
      return (
        <ComplianceSegmentedFilter
          embedded={embedded}
          compact
          cardDense={cardDense}
          value={settlementSlice}
          counts={{
            all: filtered.length,
            pending: settlementPendingPool.length,
            settled: settlementSettledPool.length,
          }}
          options={[
            { id: "all", label: "Inbox", a11yLabel: "Inbox", dot: null },
            {
              id: "pending",
              label: "Balance Pending",
              a11yLabel: "Balance Pending",
              dot: COMPLIANCE_STAGE_TONE.balance_pending.fg,
            },
            {
              id: "settled",
              label: "Settled",
              a11yLabel: "Settled",
              dot: COMPLIANCE_STAGE_TONE.payment_settled.fg,
            },
          ]}
          onChange={setSettlementSlice}
        />
      );
    }
    return null;
  };
  const hasQueueSubFilter =
    stage === "pending_for_docs" ||
    stage === "compliance_pending" ||
    stage === "compliance_verified" ||
    stage === "hard_copy_pod_received" ||
    stage === "balance_pending";

  /** Cards: queue subfilter above the trip list. Table: under stage chips. Verified has no subfilter. */
  const cardsListHeader = useMemo(() => {
    if (search.trim()) return null;
    return renderQueueSubFilter(false);
  }, [
    complianceHoldCount,
    counts.compliance_pending,
    counts.pending_for_docs,
    declinedCount,
    financeDeclinedCount,
    pendingDocsHoldCount,
    pendingDocsHoldCountScoped,
    pendingDocsRejectedCount,
    pendingDocsRejectedCountScoped,
    pendingDocsTransitCounts,
    pendingDocsTransitPool.length,
    pendingSlice,
    pendingTransitSlice,
    search,
    stage,
    verifiedOnlyCount,
    verifiedSlice,
    podSlice,
    podPendingPool.length,
    podReceivedPool.length,
    settlementSlice,
    settlementPendingPool.length,
    settlementSettledPool.length,
    filtered.length,
  ]);
  const showToolbarSubFilter = viewMode === "table" && hasQueueSubFilter;

  const [tableDateSort, setTableDateSort] = useState<"asc" | "desc">("desc");
  const [exportToast, setExportToast] = useState<string | null>(null);
  const searched = useMemo(() => {
    // With an active query, search the full Compliance queue (not only the
    // selected stage chip) so supplier / trip matches aren't hidden by filter.
    const pool = search.trim() ? summaries : stagePool;
    return pool.filter((summary) => {
      const supplierId = (summary.trip.supplier_id ?? "").trim();
      const resolved = supplierNameByTripId[summary.trip.id];
      return matchesComplianceTripSearch(summary, search, [
        supplierId ? supplierSearchById[supplierId] : null,
        resolved && resolved !== "—" ? resolved : null,
      ]);
    });
  }, [stagePool, summaries, search, supplierSearchById, supplierNameByTripId]);
  const ordered = useMemo(() => {
    // Advance Processed: newest posted advance first (Cards + Table). Other stages
    // keep trip-event date sort on Table only.
    if (stage === "advance_payment_processed") {
      return sortAdvanceProcessedSummaries(searched);
    }
    return viewMode === "table" ? sortComplianceTableRows(searched, tableDateSort) : searched;
  }, [searched, stage, tableDateSort, viewMode]);
  const visible = ordered;
  const filteredTotal = ordered.length;
  const tableResetKey = useMemo(
    () =>
      [
        viewMode,
        stage,
        pendingSlice,
        pendingTransitSlice,
        verifiedSlice,
        podSlice,
        settlementSlice,
        awaitingPodSubview,
        podReceivedSubview,
        search.trim(),
        tableDateSort,
      ].join("|"),
    [
      awaitingPodSubview,
      pendingSlice,
      pendingTransitSlice,
      podReceivedSubview,
      podSlice,
      search,
      settlementSlice,
      stage,
      tableDateSort,
      verifiedSlice,
      viewMode,
    ],
  );
  const {
    visibleItems: tableWindowItems,
    hasMore: tableHasMore,
    loadingMore: tableLoadingMore,
    allLoaded: tableAllLoaded,
    loadMore: loadMoreTable,
  } = useComplianceListWindow(ordered, { resetKey: tableResetKey });
  const tableViewportH = useRef(0);
  const tableContentH = useRef(0);
  const fillTableIfShort = useCallback(() => {
    if (viewMode !== "table" || !tableHasMore || tableLoadingMore) return;
    if (tableViewportH.current < 1 || tableContentH.current < 1) return;
    if (tableContentH.current <= tableViewportH.current + 24) loadMoreTable();
  }, [loadMoreTable, tableHasMore, tableLoadingMore, viewMode]);
  useEffect(() => {
    fillTableIfShort();
  }, [fillTableIfShort, tableWindowItems.length]);
  const onTableScroll = useCallback(
    (event: TableQueueScrollEvent) => {
      const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
      tableContentH.current = contentSize.height;
      tableViewportH.current = layoutMeasurement.height;
      if (!tableHasMore || tableLoadingMore) return;
      if (contentOffset.y + layoutMeasurement.height >= contentSize.height - 160) {
        loadMoreTable();
      }
    },
    [loadMoreTable, tableHasMore, tableLoadingMore],
  );
  const onTableContentSizeChange = useCallback((_: number, height: number) => {
    tableContentH.current = height;
    fillTableIfShort();
  }, [fillTableIfShort]);
  const onTableLayout = useCallback((event: LayoutChangeEvent) => {
    tableViewportH.current = event.nativeEvent.layout.height;
    fillTableIfShort();
  }, [fillTableIfShort]);
  const tableQueueScrollProps = {
    onScroll: onTableScroll,
    onContentSizeChange: onTableContentSizeChange,
    onLayout: onTableLayout,
    fillIfShort: fillTableIfShort,
    loadingMore: tableLoadingMore,
    hasMore: tableHasMore,
    allLoaded: tableAllLoaded,
    total: filteredTotal,
  };

  const contentTopInset = layout.isDesktopWeb ? Layout.desktopTopNavOffset : layout.top;
  const pagePad = Layout.screenPaddingHorizontal;
  /** Responsive breakpoints for header and toolbar. */
  const isNarrow = width < 560;
  const stackToolbar = width < 980;
  const compactActions = width < 700;
  const searchWidthStyle = stackToolbar
    ? undefined
    : { width: Math.min(460, Math.max(420, Math.floor(width * 0.3))) };

  const openTrip = useCallback(
    (tripId: string) => {
      router.push(ROUTES.tripDetail(tripId) as Parameters<typeof router.push>[0]);
    },
    [router],
  );

  const openPay = useCallback((summary: ComplianceTripSummary) => {
    const readiness = deriveComplianceQueueReadiness(summary);
    if (!readiness.readyCategory) {
      alertMessage("Payment blocked", readiness.blockerLines[0] ?? "This trip is not ready for payment.");
      return;
    }
    setPay({ summary, category: readiness.readyCategory });
  }, []);

  /** After an advance posts from Verified, follow the trip to Advance Processed. */
  const moveToAdvanceProcessed = useCallback(
    async (tripId: string, category: ComplianceLedgerCategory) => {
      await syncChange({ type: "payment", tripId }).catch(() => undefined);
      if (category !== "compliance_advance") return;
      if (stage !== "compliance_verified") return;
      setStage("advance_payment_processed");
      setCardTripId(tripId);
    },
    [setStage, stage, syncChange],
  );

  /** Advance Processed Export Report: rows are prepared on open so the card shows real counts. */
  const isAdvanceProcessedStage = stage === "advance_payment_processed";
  const [apExport, setApExport] = useState<{
    open: boolean;
    preparing: boolean;
    exporting: boolean;
    rows: AdvanceProcessedExportRow[];
  }>({ open: false, preparing: false, exporting: false, rows: [] });
  const apExportRequest = useRef(0);
  useEffect(() => {
    if (!isAdvanceProcessedStage) {
      apExportRequest.current += 1;
      setApExport((cur) => (cur.open && !cur.exporting ? { ...cur, open: false } : cur));
    }
  }, [isAdvanceProcessedStage]);
  const apExportCounts = useMemo(() => countAdvanceProcessedExport(apExport.rows), [apExport.rows]);

  const openAdvanceProcessedExport = useCallback(() => {
    const orgId = currentOrganization?.id;
    if (!orgId) return;
    const request = ++apExportRequest.current;
    setApExport({ open: true, preparing: true, exporting: false, rows: [] });
    // Stage-scoped (`filtered`), not cross-stage `searched` — then newest posted first.
    prepareAdvanceProcessedReport(orgId, sortAdvanceProcessedSummaries(filtered))
      .then((rows) => {
        if (request !== apExportRequest.current) return;
        setApExport((cur) => ({ ...cur, preparing: false, rows }));
      })
      .catch((error: unknown) => {
        if (request !== apExportRequest.current) return;
        setApExport((cur) => ({ ...cur, open: false, preparing: false }));
        alertMessage("Couldn't prepare report", error instanceof Error ? error.message : "Please try again.");
      });
  }, [currentOrganization?.id, filtered]);

  const closeAdvanceProcessedExport = useCallback(() => {
    apExportRequest.current += 1;
    setApExport((cur) => (cur.exporting ? cur : { ...cur, open: false, preparing: false }));
  }, []);

  const confirmAdvanceProcessedExport = useCallback(async () => {
    if (apExport.exporting || apExport.preparing || apExport.rows.length === 0) return;
    setApExport((cur) => ({ ...cur, exporting: true }));
    try {
      await downloadAdvanceProcessedReport(apExport.rows);
      setApExport((cur) => ({ ...cur, open: false, exporting: false }));
    } catch (error) {
      setApExport((cur) => ({ ...cur, exporting: false }));
      alertMessage("Couldn't export report", error instanceof Error ? error.message : "Please try again.");
    }
  }, [apExport.exporting, apExport.preparing, apExport.rows]);

  const verifiedExportTripCounts = useMemo(
    () => countVerifiedStageTrips(summaries),
    [summaries],
  );

  const confirmExportReport = useCallback(async () => {
    if (!currentOrganization?.id || exporting) return;
    setExporting(true);
    try {
      const exported = await exportVerifiedStageComplianceReport(currentOrganization.id);
      setExportOpen(false);
      if (exported === 0) {
        alertMessage("Nothing to export", "No verified-stage trips are ready to download yet.");
      }
    } catch (error) {
      alertMessage("Couldn't export report", error instanceof Error ? error.message : "Please try again.");
    } finally {
      setExporting(false);
    }
  }, [currentOrganization?.id, exporting]);

  useEffect(() => {
    if (!exportToast) return;
    const timer = setTimeout(() => setExportToast(null), 5000);
    return () => clearTimeout(timer);
  }, [exportToast]);

  const exportTable = useCallback(async () => {
    const rows = sortComplianceTableRows(searched, tableDateSort);
    const span = complianceExportDateSpan(rows);
    const extra: string[] = [];
    if (stage === "pending_for_docs" && pendingSlice === "hold") extra.push("Compliance Hold");
    if (stage === "pending_for_docs" && pendingSlice === "rejected") extra.push("Declined by finance");
    if (stage === "compliance_pending" && pendingSlice === "hold") extra.push("Compliance Hold");
    if (stage === "compliance_pending" && pendingSlice === "finance_declined") extra.push("Declined by finance");
    if (stage === "compliance_verified" && verifiedSlice === "verified") extra.push("Verified");
    if (stage === "compliance_verified" && verifiedSlice === "compliance") extra.push("Compliance");
    if (stage === "compliance_verified" && verifiedSlice === "pending_docs") extra.push("Docs Follow Up");
    if (stage === "hard_copy_pod_received" && podSlice === "pending") extra.push("POD Pending");
    if (stage === "hard_copy_pod_received" && podSlice === "received") extra.push("POD Received");
    if (stage === "hard_copy_pod_received" && podSlice === "pending" && awaitingPodSubview !== "all") {
      extra.push(AWAITING_POD_SUBVIEW_LABEL[awaitingPodSubview]);
    }
    if (stage === "hard_copy_pod_received" && podSlice === "received" && podReceivedSubview === "ibond") {
      extra.push("IBond");
    }
    if (stage === "balance_pending" && settlementSlice === "pending") extra.push("Balance Pending");
    if (stage === "balance_pending" && settlementSlice === "settled") extra.push("Settled");
    const message = complianceTableExportMessage({
      count: rows.length,
      filterLabel: complianceQueueLabel(stage),
      extraFilters: extra,
      search,
      from: span?.from ?? null,
      to: span?.to ?? null,
      sort: tableDateSort,
    });
    setExportToast(message);
    if (rows.length === 0) return;
    try {
      await downloadComplianceTableExport(rows, stage === "compliance_pending");
    } catch (error) {
      alertMessage("Couldn't export", error instanceof Error ? error.message : "Please try again.");
    }
  }, [
    awaitingPodSubview,
    pendingSlice,
    podReceivedSubview,
    podSlice,
    settlementSlice,
    search,
    searched,
    stage,
    tableDateSort,
    verifiedSlice,
  ]);

  const openComplianceCard = useCallback((tripId: string, tab: "trip" | "vehicle" | "driver" = "trip") => {
    setCardTripId(tripId);
    setCardFocus({ tab, token: Date.now() });
    setViewMode("card");
  }, []);

  const openDetails = useCallback(
    (tripId: string) => {
      router.push(ROUTES.complianceDetail(tripId) as Parameters<typeof router.push>[0]);
    },
    [router],
  );

  const appliedRouteFocus = useRef("");
  const routeTripId = typeof routeFocus.trip === "string" ? routeFocus.trip : "";
  const routeTab =
    routeFocus.tab === "vehicle" || routeFocus.tab === "driver" || routeFocus.tab === "trip"
      ? routeFocus.tab
      : "trip";

  useEffect(() => {
    if (!routeTripId) return;
    const key = `${routeTripId}:${routeTab}`;
    if (appliedRouteFocus.current === key) return;
    const row = summaries.find((item) => item.trip.id === routeTripId);
    if (!row) return;
    appliedRouteFocus.current = key;
    setStage(row.stage);
    openComplianceCard(routeTripId, routeTab);
  }, [openComplianceCard, routeTab, routeTripId, setStage, summaries]);

  if (orgCtx === undefined || accessLoading || productsLoading) {
    return <ChromeBelowTopNavLoadingScreen variant="preparing" />;
  }

  if (!canViewCompliance) {
    return (
      <View style={[styles.centered, { paddingTop: contentTopInset }]}>
        <Text style={styles.message}>
          {complianceEnabled
            ? "You don't have access to Compliance."
            : "Compliance is not enabled for this workspace."}
        </Text>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.screen,
        {
          paddingTop: contentTopInset,
          paddingBottom: layout.scrollBottomPadding(4),
          paddingHorizontal: pagePad,
          maxHeight: windowHeight,
        },
      ]}
    >
      <View style={styles.chrome}>
      <View style={[styles.toolbarRow, stackToolbar && styles.toolbarStack]}>
        <View
          style={[
            styles.searchRow,
            stackToolbar ? styles.searchRowStacked : searchWidthStyle,
            isNarrow && styles.searchRowNarrow,
          ]}
        >
          <Search size={12} color={Theme.textSecondary} strokeWidth={2} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search trip ID, vehicle, driver, client, or supplier"
            placeholderTextColor={Theme.textSecondary}
            style={styles.searchInput as TextStyle}
            autoCorrect={false}
            autoCapitalize="none"
            spellCheck={false}
            accessibilityLabel="Search compliance trips"
          />
        </View>
        <View style={styles.filtersRow}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.chipScroll}
            contentContainerStyle={styles.stageDeptWrap}
            keyboardShouldPersistTaps="handled"
          >
            <StageFilterRail stage={stage} counts={counts} onSelectStage={selectStage} />
          </ScrollView>
        </View>
      </View>
      {showToolbarSubFilter ? (
        <View style={styles.tableSubFilterBar}>{renderQueueSubFilter(true)}</View>
      ) : null}
      {awaitingPodCounts ? (
        <View style={styles.subchipRow}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.subchipScroll}
            contentContainerStyle={styles.chipWrap}
            keyboardShouldPersistTaps="handled"
          >
            {AWAITING_POD_SUBVIEWS.map((subview) => (
              <StageChip
                key={subview}
                label={AWAITING_POD_SUBVIEW_LABEL[subview]}
                count={awaitingPodCounts[subview]}
                countColor={AWAITING_POD_SUBVIEW_TONE[subview]}
                active={awaitingPodSubview === subview}
                onPress={() => setAwaitingPodSubview(subview)}
              />
            ))}
          </ScrollView>
          {stagePool.length > 0 ? (
            <TouchableOpacity
              style={styles.logHardCopyPodBtn}
              onPress={() => {
                if (viewMode !== "card") setViewMode("card");
                setLogHardCopyPodRequest((n) => n + 1);
              }}
              hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
              accessibilityRole="button"
              accessibilityLabel="Log Hard Copy POD"
            >
              <FileText size={12} color={Theme.textSecondary} strokeWidth={2} />
              <Text style={styles.logHardCopyPodBtnText} numberOfLines={1}>
                LOG HARD COPY POD
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
      {podReceivedCounts ? (
        <View style={styles.subchipRow}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.subchipScroll}
            contentContainerStyle={styles.chipWrap}
            keyboardShouldPersistTaps="handled"
          >
            <StageChip
              label="All"
              count={podReceivedCounts.all}
              countColor={Theme.complianceStageSuccessFg}
              active={podReceivedSubview === "all"}
              onPress={() => setPodReceivedSubview("all")}
            />
            <StageChip
              label="IBond"
              count={podReceivedCounts.ibond}
              countColor={Theme.complianceStageInfoFg}
              active={podReceivedSubview === "ibond"}
              onPress={() => setPodReceivedSubview("ibond")}
            />
          </ScrollView>
        </View>
      ) : null}
      </View>

      <View style={styles.queueBody}>
      {isFetching && summaries.length > 0 ? (
        <Text style={styles.stale}>Updating queue…</Text>
      ) : null}

      {isLoading && summaries.length === 0 ? (
        <View style={styles.emptyFill}>
          <Text style={styles.message}>Loading required trip, document, and payment data…</Text>
        </View>
      ) : isError ? (
        <View style={styles.emptyFill}>
          <Text style={styles.message}>{(error as Error)?.message ?? "Couldn't load Compliance."}</Text>
          <TouchableOpacity style={styles.reportBtn} onPress={() => void refetch()}>
            <Text style={styles.reportBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : viewMode === "table" && filteredTotal === 0 ? (
        <View style={styles.emptyFill}>
          <HubPromoHeroLottie
            source={EMPTY_STATE_LOTTIE.tripsTable}
            width={isNarrow ? 200 : 260}
            height={isNarrow ? 160 : 200}
          />
          <Text style={styles.emptyCaption}>
            {search.trim()
              ? "No trips match your search."
              : summaries.length
                ? stage === "compliance_verified"
                    ? verifiedSlice === "verified"
                      ? "No verified trips in this queue."
                      : verifiedSlice === "compliance"
                        ? "No finance-declined trips in Compliance."
                        : verifiedSlice === "pending_docs"
                          ? "No finance-declined trips in Docs Follow Up."
                          : "No verified or finance-declined trips."
                    : pendingSlice === "finance_declined"
                    ? "No trips declined by finance."
                    : pendingSlice === "rejected"
                      ? "No trips declined by finance."
                      : pendingSlice === "hold"
                        ? "No trips on compliance hold."
                        : stage === "hard_copy_pod_received" && podSlice === "pending" && awaitingPodSubview !== "all"
                          ? "No trips in this POD Pending group."
                          : stage === "hard_copy_pod_received" && podSlice === "received" && podReceivedSubview === "ibond"
                            ? "No IBond trips in POD Received."
                            : stage === "hard_copy_pod_received" && podSlice === "pending"
                              ? "No trips in POD Pending."
                              : stage === "hard_copy_pod_received" && podSlice === "received"
                                ? "No trips in POD Received."
                                : stage === "balance_pending" && settlementSlice === "pending"
                                  ? "No trips in Balance Pending."
                                  : stage === "balance_pending" && settlementSlice === "settled"
                                    ? "No settled trips."
                                    : "No trips in this stage."
                : "No Loading→Completed trips in the Compliance queue yet."}
          </Text>
        </View>
      ) : viewMode === "table" && stage === "advance_payment_processed" && !search.trim() ? (
        <TableQueueScroll {...tableQueueScrollProps}>
          <ComplianceAdvanceProcessedTable
            summaries={tableWindowItems}
            organizationId={currentOrganization?.id ?? ""}
            onOpenTrip={openTrip}
            onUtrSaved={(tripId) => void syncChange({ type: "payment", tripId })}
          />
        </TableQueueScroll>
      ) : viewMode === "table" ? (
        <TableQueueScroll {...tableQueueScrollProps}>
          <ComplianceTripsTable
            summaries={tableWindowItems}
            onOpenTrip={openTrip}
            onOpenDetails={openDetails}
            onReview={(tripId, _documentKey, scope = "trip") => {
              openComplianceCard(tripId, scope);
            }}
            onMarkComplianceVerified={canMarkVerified ? markTripVerified : undefined}
            onVerifyDocs={(tripId) => openComplianceCard(tripId, "trip")}
            onDeclineCompliance={canMarkVerified ? declineTrip : undefined}
            onPay={(tripId) => {
              const summary =
                tableWindowItems.find((s) => s.trip.id === tripId) ??
                visible.find((s) => s.trip.id === tripId) ??
                summaries.find((s) => s.trip.id === tripId);
              if (summary) openPay(summary);
            }}
            canManageFinance={canManageFinance}
            compliancePendingLayout={stage === "compliance_pending"}
            dateSort={isAdvanceProcessedStage ? undefined : tableDateSort}
            onDateSortChange={isAdvanceProcessedStage ? undefined : setTableDateSort}
            dateSortEnabled={!isAdvanceProcessedStage}
          />
        </TableQueueScroll>
      ) : (
        <ComplianceDocumentWorkspace
          style={styles.workspaceFill}
          summaries={visible}
          tripFacts={tripFacts}
          organizationId={currentOrganization?.id ?? ""}
          actorId={user?.uid ?? null}
          canVerify={canVerifyDocuments}
          canViewDocuments={canViewDocuments}
          canManageFinance={canManageFinance}
          showFinanceTab={stage !== "compliance_pending"}
          onPay={openPay}
          paymentSubmitting={paying}
          onConfirmPayment={
            canManageFinance
              ? async (summary, category, values) => {
                  if (!currentOrganization?.id) return;
                  setPaying(true);
                  const { error: payError } = await postCompliancePayment({
                    organizationId: currentOrganization.id,
                    trip: summary.trip,
                    category,
                    amount: values.amount,
                    paymentModeId: values.paymentModeId,
                    paymentModeLabel: values.paymentModeLabel,
                    utr: values.utr,
                    notes: values.remark,
                  });
                  setPaying(false);
                  if (payError) {
                    alertMessage("Couldn't post payment", payError.message);
                    return;
                  }
                  await moveToAdvanceProcessed(summary.trip.id, category);
                }
              : undefined
          }
          onRejectCompliance={canMarkVerified ? rejectTrip : undefined}
          onDeclineCompliance={canMarkVerified ? declineTrip : undefined}
          onMarkComplianceVerified={canMarkVerified ? markTripVerified : undefined}
          canManagePod={canManagePod}
          showHardCopyPodLog={stage === "hard_copy_pod_received" && podSlice !== "received"}
          compliancePendingQueue={stage === "compliance_pending"}
          showPodClientValidation={
            (stage === "balance_pending" && settlementSlice !== "settled") ||
            (stage === "hard_copy_pod_received" && podSlice !== "pending")
          }
          chargesReview={
            (stage === "balance_pending" && settlementSlice !== "settled") ||
            (stage === "hard_copy_pod_received" && podSlice !== "pending")
          }
          onChargesSaved={(tripId) => {
            setChargeFocus({ tripId, token: Date.now() });
            selectStage("balance_pending");
          }}
          chargeFocusTripId={chargeFocus?.tripId ?? null}
          chargeFocusToken={chargeFocus?.token ?? 0}
          showHardcopyPodButton={showHardcopyPodButton}
          logHardCopyPodRequest={logHardCopyPodRequest}
          courierLrOptions={courierLrOptions}
          selectedTripId={cardTripId}
          focusTab={cardFocus?.tab ?? null}
          focusToken={cardFocus?.token ?? 0}
          listHeader={cardsListHeader}
          stacked={isNarrow}
          onChanged={(change) => void syncChange(change)}
          onReviewTripDocs={(tripId, _documentKey, scope = "trip") => {
            openComplianceCard(tripId, scope);
          }}
        />
      )}

      <View style={styles.footer}>
        <View style={styles.footerSide}>
          <View style={[styles.viewToggle, compactActions && styles.viewToggleCompact]}>
            <TouchableOpacity
              onPress={() => setViewMode("card")}
              style={[
                styles.toggleBtn,
                compactActions && styles.toggleBtnCompact,
                viewMode === "card" && styles.toggleBtnActive,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Cards view"
              accessibilityState={{ selected: viewMode === "card" }}
            >
              <LayoutGrid
                size={13}
                color={viewMode === "card" ? Theme.buttonDarkText : Theme.textPrimary}
                strokeWidth={2}
              />
              {!compactActions ? (
                <Text style={[styles.toggleBtnText, viewMode === "card" && styles.toggleBtnTextActive]}>
                  Cards
                </Text>
              ) : null}
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setViewMode("table")}
              style={[
                styles.toggleBtn,
                compactActions && styles.toggleBtnCompact,
                viewMode === "table" && styles.toggleBtnActive,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Table view"
              accessibilityState={{ selected: viewMode === "table" }}
            >
              <Table2
                size={13}
                color={viewMode === "table" ? Theme.buttonDarkText : Theme.textPrimary}
                strokeWidth={2}
              />
              {!compactActions ? (
                <Text style={[styles.toggleBtnText, viewMode === "table" && styles.toggleBtnTextActive]}>
                  Table
                </Text>
              ) : null}
            </TouchableOpacity>
          </View>
        </View>
        <View style={styles.footerCenter} />
        <View style={[styles.footerSide, styles.footerSideEnd]}>
          {viewMode === "table" && !isAdvanceProcessedStage && !isVerifiedStage ? (
            <TouchableOpacity
              style={[styles.reportBtn, compactActions && styles.actionBtnCompact]}
              onPress={() => {
                void exportTable();
              }}
              hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
              accessibilityRole="button"
              accessibilityLabel="Export table"
            >
              <Download size={13} color={Theme.textPrimary} strokeWidth={2} />
              {!isNarrow ? <Text style={styles.reportBtnText}>Export</Text> : null}
            </TouchableOpacity>
          ) : null}
          {canViewFinance && isVerifiedStage ? (
            <TouchableOpacity
              style={[styles.reportBtn, compactActions && styles.actionBtnCompact]}
              onPress={() => setExportOpen(true)}
              hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
              accessibilityRole="button"
              accessibilityLabel="Export Report"
            >
              <Download size={13} color={Theme.textPrimary} strokeWidth={2} />
              {!isNarrow ? (
                <Text style={styles.reportBtnText}>{compactActions ? "Export" : "Export Report"}</Text>
              ) : null}
            </TouchableOpacity>
          ) : null}
          {canViewFinance && isAdvanceProcessedStage ? (
            <TouchableOpacity
              style={[styles.reportBtn, compactActions && styles.actionBtnCompact]}
              onPress={openAdvanceProcessedExport}
              hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
              accessibilityRole="button"
              accessibilityLabel="Export Report"
            >
              <Download size={13} color={Theme.textPrimary} strokeWidth={2} />
              {!isNarrow ? (
                <Text style={styles.reportBtnText}>{compactActions ? "Export" : "Export Report"}</Text>
              ) : null}
            </TouchableOpacity>
          ) : null}
          {canManageFinance ? (
            <TouchableOpacity
              style={[styles.bulkBtn, compactActions && styles.actionBtnCompact]}
              onPress={() => router.push(ROUTES.COMPLIANCE_BULK_PAYMENT as Parameters<typeof router.push>[0])}
              hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
              accessibilityRole="button"
              accessibilityLabel="Bulk Payment"
            >
              <Wallet size={13} color={Theme.complianceBulkText} strokeWidth={2} />
              {!isNarrow ? (
                <Text style={styles.bulkBtnText}>{compactActions ? "Bulk" : "Bulk Payment"}</Text>
              ) : null}
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
      </View>

      {exportToast ? (
        <View style={styles.exportToast} accessibilityRole="alert" accessibilityLiveRegion="polite">
          <Text style={styles.exportToastText}>{exportToast}</Text>
        </View>
      ) : null}

      <ComplianceExportConfirmModal
        visible={exportOpen && isVerifiedStage}
        verifiedCount={verifiedExportTripCounts.verified}
        rejectedCount={verifiedExportTripCounts.rejected}
        exporting={exporting}
        onCancel={() => {
          if (!exporting) setExportOpen(false);
        }}
        onConfirm={() => {
          void confirmExportReport();
        }}
      />

      <ComplianceExportConfirmModal
        visible={apExport.open && isAdvanceProcessedStage}
        eyebrow="Advance Processed stage only"
        verifiedCount={0}
        rejectedCount={0}
        includedCount={apExportCounts.total}
        stats={[
          {
            key: "total",
            label: "Trips",
            value: apExportCounts.total,
            tone: ADVANCE_PROCESSED_TONE,
          },
        ]}
        preparing={apExport.preparing}
        exporting={apExport.exporting}
        emptyHint="Nothing in Advance Processed stage to export yet."
        confirmLabel="Export"
        onCancel={closeAdvanceProcessedExport}
        onConfirm={() => {
          void confirmAdvanceProcessedExport();
        }}
      />

      <CompliancePaymentConfirmModal
        visible={pay != null}
        summary={pay?.summary ?? null}
        category={pay?.category ?? null}
        submitting={paying}
        onCancel={() => {
          if (!paying) setPay(null);
        }}
        onConfirm={async (values) => {
          if (!pay || !currentOrganization?.id) return;
          setPaying(true);
          const { error: payError } = await postCompliancePayment({
            organizationId: currentOrganization.id,
            trip: pay.summary.trip,
            category: pay.category,
            amount: values.amount,
            paymentModeId: values.paymentModeId,
            paymentModeLabel: values.paymentModeLabel,
            utr: values.utr,
            notes: values.remark,
          });
          setPaying(false);
          if (payError) {
            alertMessage("Couldn't post payment", payError.message);
            return;
          }
          setPay(null);
          await moveToAdvanceProcessed(pay.summary.trip.id, pay.category);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, minHeight: 0, overflow: "hidden", backgroundColor: Theme.compliancePageBg },
  chrome: { flexShrink: 0, paddingTop: 8 },
  queueBody: { flex: 1, minHeight: 0, marginTop: 8, gap: 4 },
  queueScroll: { flex: 1, width: "100%", minWidth: 0 },
  queueScrollContent: { paddingBottom: 8, width: "100%", minWidth: 0 },
  tableLoadMore: {
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  tableLoadSentinel: {
    height: 1,
  },
  tableLoadEnd: {
    paddingTop: 8,
    paddingBottom: 10,
    textAlign: "center",
    fontSize: 11,
    fontWeight: "500",
    color: Theme.textMuted,
  },
  workspaceFill: { flex: 1, minHeight: 0 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: Theme.compliancePageBg },
  searchRow: {
    flexShrink: 0,
    height: 34,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: Theme.cardWhite,
    shadowColor: Theme.textPrimaryDark,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  searchRowStacked: {
    width: "100%",
    maxWidth: "100%",
  },
  searchRowNarrow: {
    height: 34,
    paddingHorizontal: 12,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    height: "100%",
    paddingVertical: 0,
    fontSize: 11,
    fontWeight: "400",
    color: Theme.textPrimary,
    ...(Platform.OS === "web" ? { outlineStyle: "none" as const } : null),
  },
  bulkBtn: {
    height: 26,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: Theme.complianceBulk,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  reportBtn: {
    height: 26,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.complianceCardBorder,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  actionBtnCompact: {
    paddingHorizontal: 10,
    minWidth: 36,
  },
  bulkBtnText: { fontSize: 11, fontWeight: "600", lineHeight: 14, color: Theme.complianceBulkText },
  reportBtnText: { fontSize: 11, fontWeight: "500", lineHeight: 14, color: Theme.textPrimary },
  logHardCopyPodBtn: {
    flexShrink: 0,
    height: 24,
    marginLeft: 8,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.complianceCardBorder,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  logHardCopyPodBtnText: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.3,
    lineHeight: 13,
    color: Theme.textSecondary,
  },
  toolbarRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  toolbarStack: {
    flexDirection: "column",
    alignItems: "stretch",
    gap: 10,
  },
  filtersRow: {
    flex: 1,
    minWidth: 0,
  },
  chipScroll: {
    flexGrow: 0,
    width: "100%",
  },
  subChipScroll: {
    flexGrow: 0,
    width: "100%",
    marginTop: 6,
  },
  subSegmentWrap: {
    width: "100%",
    marginTop: 8,
  },
  /** Table view: full-width under toolbar so filters share the table’s left edge. */
  tableSubFilterBar: {
    width: "100%",
    alignSelf: "stretch",
    alignItems: "center",
    marginTop: 8,
    marginBottom: 2,
  },
  /** Verified: Queue (All / Verified) beside Declined (Compliance / Docs Follow Up). */
  verifiedFilterRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
  },
  /** Table: same side inset as the trip rows. */
  verifiedFilterRowTable: {
    flexDirection: "row",
    alignItems: "flex-end",
    width: "100%",
    paddingHorizontal: 4,
    gap: 10,
  },
  verifiedFilterGroupTable: {
    flex: 1,
    minWidth: 0,
    alignSelf: "stretch",
    alignItems: "stretch",
    gap: 4,
  },
  /** Card pane: same inset as the trip cards so the subtabs share their edges. */
  verifiedFilterRowCard: {
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.complianceCardBorder,
    backgroundColor: Theme.cardWhite,
  },
  verifiedFilterGroup: {
    flex: 1,
    minWidth: 0,
    alignItems: "stretch",
    gap: 4,
  },
  verifiedFilterGroupQueue: {
    flexGrow: 0,
    flexShrink: 0,
    alignItems: "center",
    gap: 4,
  },
  verifiedFilterGroupDeclined: {
    flex: 1,
    minWidth: 0,
    alignItems: "stretch",
    gap: 4,
  },
  verifiedFilterGroupLabelPanel: {
    alignSelf: "center",
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: Theme.cardWhite,
    shadowColor: Theme.textPrimaryDark,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  verifiedFilterGroupLabel: {
    textAlign: "center",
    fontSize: 9,
    lineHeight: 12,
    fontWeight: "600",
    letterSpacing: 0.2,
    color: Theme.textSecondary,
  },
  pendingDocsFilterStack: {
    width: "100%",
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 8,
    gap: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.complianceCardBorder,
    backgroundColor: Theme.cardWhite,
  },
  /** Card list header — tighter stack so both filter rows fit without scroll. */
  pendingDocsFilterStackCard: {
    width: "100%",
    paddingHorizontal: 8,
    paddingTop: 6,
    paddingBottom: 6,
    gap: 4,
    alignItems: "stretch",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.complianceCardBorder,
    backgroundColor: Theme.cardWhite,
  },
  pendingDocsFilterStackEmbedded: {
    width: "100%",
    gap: 6,
    alignSelf: "stretch",
    alignItems: "stretch",
  },
  subchipRow: {
    width: "100%",
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
  },
  subchipScroll: {
    flex: 1,
    flexGrow: 1,
    minWidth: 0,
  },
  chipWrap: {
    flexDirection: "row",
    flexWrap: "nowrap",
    alignItems: "center",
    gap: 2,
    paddingHorizontal: 4,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: Theme.cardWhite,
    shadowColor: Theme.textPrimaryDark,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  stageDeptWrap: {
    flexDirection: "row",
    flexWrap: "nowrap",
    alignItems: "flex-end",
    paddingRight: 8,
  },
  stageTrack: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 4,
    paddingTop: 2,
    paddingBottom: 2,
    borderRadius: 16,
    backgroundColor: Theme.cardWhite,
    shadowColor: Theme.textPrimaryDark,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  chipStack: {
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 3,
  },
  chip: {
    flexShrink: 0,
    paddingHorizontal: 6,
    paddingTop: 3,
    paddingBottom: 2,
    borderRadius: 14,
    backgroundColor: "transparent",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
  },
  chipActive: {
    backgroundColor: Theme.liquidGoodBack,
  },
  chipText: {
    fontSize: 10,
    fontWeight: "500",
    color: Theme.textPrimaryDark,
    lineHeight: 13,
  },
  chipTextActive: {
    color: Theme.buttonDarkText,
    fontWeight: "500",
  },
  chipCountBadge: {
    minWidth: 14,
    height: 12,
    paddingHorizontal: 4,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  chipCaptionPanel: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: Theme.cardWhite,
    shadowColor: Theme.textPrimaryDark,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  chipCaption: {
    fontSize: 8,
    lineHeight: 10,
    fontWeight: "600",
    letterSpacing: 0.2,
    color: Theme.textSecondary,
    textAlign: "center",
  },
  chipCaptionSlot: {
    height: 14,
  },
  chipCount: {
    fontSize: 8,
    fontWeight: "700",
    lineHeight: 10,
    textAlign: "center",
    fontVariant: ["tabular-nums"],
  },
  viewToggle: {
    flexShrink: 0,
    height: 26,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Theme.cardWhite,
    borderRadius: 999,
    padding: 2,
    borderWidth: 1,
    borderColor: Theme.complianceCardBorder,
    gap: 2,
  },
  viewToggleCompact: {
    height: 26,
  },
  toggleBtn: {
    height: 22,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
  },
  toggleBtnCompact: {
    width: 28,
    height: 22,
    paddingHorizontal: 0,
  },
  toggleBtnActive: { backgroundColor: Theme.buttonDark },
  toggleBtnText: { fontSize: 11, fontWeight: "500", color: Theme.textPrimary, lineHeight: 14 },
  toggleBtnTextActive: { color: Theme.buttonDarkText, fontWeight: "600" },
  cardGrid: { flexDirection: "row", flexWrap: "wrap", alignItems: "stretch" },
  emptyFill: {
    flex: 1,
    minHeight: 0,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    gap: 4,
  },
  emptyCaption: {
    fontSize: 18,
    fontWeight: "700",
    lineHeight: 24,
    color: Theme.textPrimary,
    textAlign: "center",
  },
  message: { fontSize: 14, color: Theme.textSecondary, textAlign: "center", lineHeight: 20 },
  stale: { fontSize: 12, color: Theme.textSecondary },
  footer: {
    flexShrink: 0,
    height: 32,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  footerSide: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  footerSideEnd: { justifyContent: "flex-end" },
  footerCenter: { width: 160 },
  exportToast: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 44,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: Theme.textPrimaryDark,
  },
  exportToastText: { fontSize: 12, fontWeight: "600", lineHeight: 16, color: Theme.cardWhite },
});
