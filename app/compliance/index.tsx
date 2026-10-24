/**
 * Global Compliance Verification work queue — header, counted stage filters,
 * Cards/Table toggle, and Trip/Vehicle/Driver checklist cards.
 */
import { ComplianceHardCopyPodSheet } from "@/features/tripCompliance/components/ComplianceHardCopyPodSheet";
import { GroundOpsWarehouseNotice } from "@/features/organization/components/GroundOpsWarehouseNotice";
import { useGroundOpsWarehouseGap } from "@/features/organization/hooks/useGroundOpsWarehouseGap";
import { ChromeBelowTopNavLoadingScreen } from "@/components/chromeLoadingScreens";
import { HubPromoHeroLottie } from "@/components/hub/HubPromoLottie";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { useAuth } from "@/contexts/AuthContext";
import { useOptionalOrganization } from "@/contexts/OrganizationContext";
import { ComplianceAdvanceProcessedTable } from "@/features/tripCompliance/components/ComplianceAdvanceProcessedTable";
import { ComplianceDocumentWorkspace } from "@/features/tripCompliance/components/ComplianceDocumentWorkspace";
import { ComplianceExportConfirmModal } from "@/features/tripCompliance/components/ComplianceExportConfirmModal";
import {
  CompliancePaymentConfirmModal,
  compliancePaymentNotes,
} from "@/features/tripCompliance/components/CompliancePaymentConfirmModal";
import { ComplianceMobileChrome } from "@/features/tripCompliance/components/ComplianceMobileChrome";
import { ComplianceSegmentedFilter } from "@/features/tripCompliance/components/ComplianceSegmentedFilter";
import { isComplianceMobileViewport } from "@/features/tripCompliance/utils/complianceMobileLayout.util";
import { HUB_MOBILE_LIST_CANVAS_BG } from "@/components/hub";
import { ComplianceTripsTable } from "@/features/tripCompliance/components/ComplianceTripsTable";
import { DebitControlTripsTable } from "@/features/tripCompliance/components/DebitControlTripsTable";
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
import { fetchComplianceAdvanceFinanceBreakdown } from "@/features/tripCompliance/services/complianceAdvanceFinanceBreakdown.service";
import {
    downloadAdvancePaymentReport,
    downloadAdvanceProcessedReport,
    downloadComplianceTableExport,
    exportVerifiedStageComplianceReport,
    prepareAdvancePaymentReport,
    prepareAdvanceProcessedReport,
} from "@/features/tripCompliance/services/complianceExportReport.service";
import {
    declineTripCompliance,
    markTripFinanceVerified,
    unmarkTripFinanceVerified,
    markTripComplianceVerified,
    postCompliancePayment,
    rejectTripCompliance,
    resubmitTripCompliance,
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
    countAdvancePaymentExport,
    countAdvanceProcessedExport,
    type AdvancePaymentExportRow,
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
} from "@/features/tripCompliance/utils/complianceRejectReason.util";
import {
    complianceExportDateSpan,
    complianceTableExportMessage,
    sortComplianceTableRows,
} from "@/features/tripCompliance/utils/complianceTableExport.util";
import {
    isActiveFinanceReject,
    isComplianceAwaitingResubmit,
    isComplianceHoldAwaitingResubmit,
    routeHoldsToDocumentUpload,
    onlyCompletedTrips,
    isComplianceDeclineActive,
    isFinanceDeclinedForCompliancePending,
    isFinanceDeclinedForPendingDocs,
    isFinanceDeclinedTrip,
    isPendingDocsComplianceHold,
} from "@/features/tripCompliance/utils/complianceTableStatus.util";
import { alertMessage, confirmAction } from "@/features/tripCompliance/utils/crossPlatformAlert.util";
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
import { useOptionalActiveWorkspace } from "@/contexts/ActiveWorkspaceContext";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Download, FileText, LayoutGrid, Search, Table2, Wallet } from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, useWindowDimensions, View, type LayoutChangeEvent, type NativeSyntheticEvent, type NativeScrollEvent, type TextStyle, type ViewStyle } from "react-native";

function complianceQueueLabel(stage: ComplianceQueueFilter): string {
  if (stage === "all") return "All";
  if (stage === "pod_received") return "POD Verification";
  return COMPLIANCE_STAGE_FILTER_LABEL[stage];
}

const STAGE_DEPT_GROUPS = [
  { department: "Ground Ops", stages: ["pending_for_docs"] },
  { department: "Compliance", stages: ["compliance_pending"] },
  { department: "Finance", stages: ["compliance_verified", "finance_verified"] },
  // Awaiting POD = the former POD tab (with its sub-tabs) plus paid trips still running.
  // POD Verification: for now the hard-copy-received list; its own logic comes later.
  { department: "Debit", stages: ["hard_copy_pod_received", "pod_received"] },
  { department: "Finance", stages: ["balance_pending", "payment_settled"] },
] as const;

type HoverPressState = { pressed: boolean; hovered?: boolean };

const WEB_POINTER: ViewStyle | null =
  Platform.OS === "web" ? ({ cursor: "pointer" } as ViewStyle) : null;

function StageChip({
  label,
  count,
  countColor,
  active,
  onPress,
  caption,
}: {
  label: string;
  count: number;
  countColor: string;
  active: boolean;
  onPress: () => void;
  caption?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={caption ? `${label}, ${caption}, ${count}` : `${label}, ${count}`}
      style={styles.chipStack}
      hitSlop={{ top: 4, bottom: 4, left: 2, right: 2 }}
    >
      {({ pressed, hovered }: HoverPressState) => {
        const highlighted = Boolean(hovered) || pressed;
        return (
          <View
            style={[
              styles.chip,
              WEB_POINTER,
              highlighted && !active && styles.chipHover,
              active && styles.chipActive,
              highlighted && active && styles.chipActiveHover,
            ]}
          >
            <View style={styles.chipCopy}>
              <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>
                {label}
              </Text>
              {caption ? (
                <Text
                  style={[
                    styles.chipSubtitle,
                    highlighted && !active && styles.chipSubtitleHover,
                    active && styles.chipSubtitleActive,
                  ]}
                  numberOfLines={1}
                >
                  {caption}
                </Text>
              ) : null}
            </View>
            {count > 0 ? (
              <View
                style={[
                  styles.chipCountBadge,
                  { backgroundColor: active ? Theme.accentGold : countColor },
                ]}
              >
                <Text
                  style={[
                    styles.chipCount,
                    { color: active ? Theme.buttonDark : Theme.buttonDarkText },
                  ]}
                >
                  {count}
                </Text>
              </View>
            ) : null}
          </View>
        );
      }}
    </Pressable>
  );
}

function StageFilterRail({
  stage,
  counts,
  podReceivedCount,
  onSelectStage,
  visibleStages,
}: {
  stage: ComplianceQueueFilter;
  counts: ComplianceStageCounts;
  podReceivedCount: number;
  onSelectStage: (next: ComplianceQueueFilter) => void;
  /** When set, All and any stage outside the set are hidden. */
  visibleStages?: ReadonlySet<ComplianceQueueFilter> | null;
}) {
  const showStage = (item: ComplianceQueueFilter) => !visibleStages || visibleStages.has(item);
  return (
    <>
      {showStage("all") ? (
      <StageChip
        label="All"
        count={counts.all}
        countColor={COMPLIANCE_FILTER_COUNT_TONE.all}
        active={stage === "all"}
        onPress={() => onSelectStage("all")}
      />
      ) : null}
      {STAGE_DEPT_GROUPS.map((group) =>
        group.stages.filter((item) => showStage(item)).map((item) => (
          <StageChip
            key={item}
            label={complianceQueueLabel(item)}
            count={
              item === "pod_received" ? podReceivedCount : counts[item]
            }
            countColor={COMPLIANCE_FILTER_COUNT_TONE[item === "pod_received" ? "hard_copy_pod_received" : item]}
            active={stage === item}
            onPress={() => onSelectStage(item)}
            caption={group.department}
          />
        )),
      )}
    </>
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
  const isMobile = isComplianceMobileViewport(width);
  const router = useRouter();
  const { can: canSurface, isLoading: accessLoading } = useMemberAccess();
  const { enabled: complianceEnabled, isLoading: productsLoading } = useComplianceProductEnabled();
  const canViewCompliance = complianceEnabled && canSurface("trip_compliance.tab");
  const canResubmit = canSurface("trip_compliance.trip.resubmit");
  const canViewDocuments = canSurface("trip_compliance.documents.view");
  const canVerifyDocuments = canSurface("trip_compliance.documents.verify");
  const canMarkVerified = canSurface("trip_compliance.trip.mark_verified");
  /** Finance may Reject (not Verify) with its own surface. */
  const canReject = canMarkVerified || canSurface("trip_compliance.finance.reject");
  const canManagePod = canSurface("trip_compliance.pod.manage");
  const canManageFinance = canSurface("trip_compliance.finance.manage");
  const canViewFinance = canSurface("trip_compliance.finance.view");
  /** Ground Ops upload documents only: no rates, profit, bank details, advance or balance amounts. */
  const hideCommercials = useOptionalActiveWorkspace()?.memberPlatformRole === "ground_ops";
  /** Ground Ops on a phone: list → trip documents flow, cards only, short chip labels. */
  const groundOpsPhone = hideCommercials && width < 560;
  const groundOpsWarehouseGap = useGroundOpsWarehouseGap();
  const canTabAdvanceVerification = canSurface("trip_compliance.tab.advance_verification");
  const canTabAdvancePayment = canSurface("trip_compliance.tab.advance_payment");
  const canTabSettlementVerification = canSurface("trip_compliance.tab.settlement_verification");
  const canTabFinalSettlement = canSurface("trip_compliance.tab.final_settlement");
  // Debit control (POD only — no Document Upload, Verification or Finance tabs)
  // works completed trips only, and has no "All" (it would equal Awaiting POD).
  const debitControlOnly =
    canManagePod && !canViewDocuments && !canVerifyDocuments && !canMarkVerified && !canViewFinance;
  const visibleStages = useMemo(() => {
    const stages = new Set<ComplianceQueueFilter>();
    if (canViewDocuments || canResubmit || canVerifyDocuments || canMarkVerified) {
      stages.add("pending_for_docs");
    }
    if (canVerifyDocuments || canMarkVerified) stages.add("compliance_pending");
    // Finance tabs: one surface each (granted from the Finance department).
    if (canTabAdvanceVerification) stages.add("compliance_verified");
    if (canTabAdvancePayment) stages.add("finance_verified");
    if (canTabAdvancePayment || canManagePod) stages.add("advance_payment_processed");
    if (canTabSettlementVerification) stages.add("balance_pending");
    if (canTabFinalSettlement) stages.add("payment_settled");
    // Hard-copy POD tabs belong to Debit control.
    if (canManagePod) {
      stages.add("hard_copy_pod_received");
      stages.add("pod_received");
    }
    if (stages.size > 1 && !debitControlOnly) stages.add("all");
    return stages;
  }, [
    debitControlOnly,
    canManagePod,
    canMarkVerified,
    canResubmit,
    canTabAdvancePayment,
    canTabAdvanceVerification,
    canTabFinalSettlement,
    canTabSettlementVerification,
    canVerifyDocuments,
    canViewDocuments,
  ]);
  const { user } = useAuth();
  const orgCtx = useOptionalOrganization();
  const currentOrganization = orgCtx?.currentOrganization ?? null;
  // Keep Settlement stages/counts and Finance Ledger in lockstep while this screen is open.
  useRealtimeTripsInvalidation(currentOrganization?.id ?? null);
  useRealtimeTransactionsInvalidation(currentOrganization?.id ?? null);

  const {
    summaries: queueSummaries,
    isLoading,
    isError,
    error,
    isFetching,
    refetch,
  } = useComplianceTripsQuery();
  // Ground Ops / TripOps fix holds but can't verify: their held trips show in
  // Document Upload → Compliance Hold, wherever the file count would place them.
  const fixesHoldsOnly = canResubmit && !canVerifyDocuments && !canMarkVerified;
  const summaries = useMemo(() => {
    if (!queueSummaries) return queueSummaries;
    const routed = fixesHoldsOnly ? routeHoldsToDocumentUpload(queueSummaries) : queueSummaries;
    return debitControlOnly ? onlyCompletedTrips(routed) : routed;
  }, [debitControlOnly, fixesHoldsOnly, queueSummaries]);
  const { stage, setStage, filtered, counts, declinedCount, podReceivedCount } =
    useComplianceStageFilter(summaries);
  const [pendingSlice, setPendingSlice] = useState<"all" | "hold" | "finance_declined" | "rejected">("all");
  /** Pending Docs only: In-transit vs Delivered (ops trip.status). Above All / Hold / Declined. */
  const [pendingTransitSlice, setPendingTransitSlice] = useState<"in_transit" | "delivered">("in_transit");
  /** Subtabs under Verified: All / Verified / Compliance / Document Upload. */
  const [verifiedSlice, setVerifiedSlice] = useState<
    "all" | "verified" | "compliance" | "pending_docs"
  >("all");
  /** Subtabs under Awaiting POD: All / POD Pending / POD Received / Advance Processed. IBond stays under Received. */
  const [podSlice, setPodSlice] = useState<"all" | "pending" | "received" | "advance_processed">("all");
  /** Subtabs under Advance Payment: Pending (ready to pay) / Paid (advance posted). */
  const [advancePaySlice, setAdvancePaySlice] = useState<"pending" | "paid">("pending");
  /** Advance Processed view (txn date / UTR table + export): Awaiting POD sub-tab and Advance Payment → Paid. */
  const isAdvanceProcessedStage =
    stage === "advance_payment_processed" ||
    (stage === "hard_copy_pod_received" && podSlice === "advance_processed") ||
    (stage === "finance_verified" && advancePaySlice === "paid");
  /** Every trip whose advance is posted, whatever stage it has moved on to (Awaiting POD, Settlement…). */
  const advancePaidPool = useMemo(
    () => (summaries ?? []).filter((summary) => summary.advance != null),
    [summaries],
  );
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
    if (stage !== "finance_verified") setAdvancePaySlice("pending");
    if (stage !== "balance_pending") setSettlementSlice("all");
    if (stage !== "pending_for_docs") setPendingTransitSlice("in_transit");
  }, [stage]);
  useEffect(() => {
    if (!canViewCompliance || visibleStages.size === 0) return;
    if (visibleStages.has(stage)) return;
    setStage(visibleStages.has("pending_for_docs") ? "pending_for_docs" : [...visibleStages][0]);
  }, [canViewCompliance, setStage, stage, visibleStages]);
  const [viewMode, setViewMode] = useState<"card" | "table">("card");
  // Phone layouts stay on cards. Ground Ops already had no table toggle.
  useEffect(() => {
    if (groundOpsPhone || isMobile) setViewMode("card");
  }, [groundOpsPhone, isMobile]);
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
      const target = (summaries ?? []).find((row) => row.trip.id === tripId);
      if (target && isComplianceAwaitingResubmit(target)) {
        alertMessage(
          "Waiting for Ground Ops",
          "This trip is on hold or rejected. Ground Ops must fix it and Resubmit before it can be verified.",
        );
        return false;
      }
      const wasFinanceDeclined = Boolean(target && isFinanceDeclinedTrip(target));
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
      setTimeout(() => alertMessage("Compliance declined", "The trip stays in Compliance Verification with your reason recorded."), 0);
    },
    [canMarkVerified, syncChange, user?.uid],
  );

  /** Finance approval: Compliance Verified → Finance Verified, and its undo. */
  const [financeVerifySubmitting, setFinanceVerifySubmitting] = useState(false);
  const financeVerifyTrip = useCallback(
    async (tripId: string) => {
      if (!canManageFinance) {
        alertMessage("Couldn't approve advance", "You don't have permission to approve the advance for this trip.");
        return;
      }
      const confirmed = await confirmAction(
        "Approve advance?",
        "The trip moves to Advance Payment, where the advance can be posted. You can undo this until the advance is posted.",
        "Approve",
      );
      if (!confirmed) return;
      setFinanceVerifySubmitting(true);
      try {
        // Snapshot the advance payable (same math as the payment card) on the
        // payment request issued by this approval. Unknown terms → no snapshot.
        const trip = (summaries ?? []).find((summary) => summary.trip.id === tripId)?.trip;
        const orgId = trip?.organization_id ?? currentOrganization?.id ?? null;
        const approvedAmount =
          trip && orgId
            ? await fetchComplianceAdvanceFinanceBreakdown({
                orgId,
                tripId,
                supplierId: trip.supplier_id,
                supplierRate: trip.supplier_rate,
                supplierRateBasis: (trip as { supplier_rate_basis?: string | null }).supplier_rate_basis ?? null,
                loadTons: trip.load_tons ?? null,
              })
                .then((breakdown) => breakdown?.computedAdvancePayable ?? null)
                .catch(() => null)
            : null;
        const { error } = await markTripFinanceVerified({
          tripId,
          idempotencyKey: `${tripId}:fv:${Date.now()}`,
          approvedAmount,
        });
        await syncChange({ type: "tripFlags", tripId }).catch(() => undefined);
        if (error) {
          alertMessage("Couldn't approve advance", error.message);
          return;
        }
        setStage("finance_verified");
        setCardTripId(tripId);
      } finally {
        setFinanceVerifySubmitting(false);
      }
    },
    [canManageFinance, currentOrganization?.id, setStage, summaries, syncChange],
  );
  const undoFinanceVerifyTrip = useCallback(
    async (tripId: string) => {
      if (!canManageFinance) {
        alertMessage("Couldn't undo approval", "You don't have permission to undo the advance approval for this trip.");
        return;
      }
      setFinanceVerifySubmitting(true);
      try {
        const { error } = await unmarkTripFinanceVerified({
          tripId,
          idempotencyKey: `${tripId}:fvu:${Date.now()}`,
        });
        await syncChange({ type: "tripFlags", tripId }).catch(() => undefined);
        if (error) {
          alertMessage("Couldn't undo approval", error.message);
          return;
        }
        setStage("compliance_verified");
        setCardTripId(tripId);
      } finally {
        setFinanceVerifySubmitting(false);
      }
    },
    [canManageFinance, setStage, syncChange],
  );

  const rejectKeysRef = useRef(new Map<string, { reason: string; key: string; at: number }>());
  const rejectTrip = useCallback(
    async (tripId: string, reason: string) => {
      if (!canReject) {
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
      await syncChange({ type: "complianceRejected", tripId, actorId: user.uid, reason: trimmed });
      pendingSliceAfterStageRef.current = "rejected";
      setStage("pending_for_docs");
      setCardTripId(tripId);
      setTimeout(
        () =>
          alertMessage(
            "Trip declined by finance",
            `Moved to Document Upload → Declined by finance. After Ground Ops resubmit it returns to Compliance Verification. Advance payment stays blocked until compliance verifies the documents again.`,
          ),
        0,
      );
    },
    [canReject, setStage, syncChange, user?.uid],
  );

  const resubmitKeysRef = useRef(new Map<string, { key: string; at: number }>());
  const resubmitComplianceTrip = useCallback(
    async (tripId: string, note: string) => {
      if (!canResubmit) {
        throw new Error("You don't have permission to resubmit this trip.");
      }
      if (!user?.uid) {
        throw new Error("Sign in again, then try Resubmit.");
      }
      const summary = (summaries ?? []).find((row) => row.trip.id === tripId);
      const isHold = Boolean(summary && isComplianceHoldAwaitingResubmit(summary));
      // Holds and finance rejects both go back to Compliance Verification.
      // Compliance Hold goes back to Compliance; a resubmitted finance reject goes
      // straight back to Finance (Advance Verification) — no second Compliance verify.
      const destination = isHold ? ("compliance_pending" as const) : ("compliance_verified" as const);
      const keys = resubmitKeysRef.current;
      const now = Date.now();
      let entry = keys.get(tripId);
      if (!entry || now - entry.at > DECLINE_KEY_REUSE_MS) {
        entry = { key: `${tripId}:resub:${now}:${Math.random().toString(36).slice(2, 10)}`, at: now };
        keys.set(tripId, entry);
      }
      try {
        await resubmitTripCompliance({ tripId, note, idempotencyKey: entry.key });
      } catch (error) {
        void syncChange({ type: "tripFlags", tripId }).catch(() => undefined);
        throw error;
      }
      keys.delete(tripId);
      await syncChange({ type: "complianceResubmitted", tripId, at: new Date().toISOString(), note: note.trim() });
      pendingSliceAfterStageRef.current = isHold ? "hold" : "all";
      setStage(destination);
      setCardTripId(tripId);
    },
    [canResubmit, setStage, summaries, syncChange, user?.uid],
  );

  const [search, setSearch] = useState("");
  const [pay, setPay] = useState<{ summary: ComplianceTripSummary; category: ComplianceLedgerCategory } | null>(null);
  const [paying, setPaying] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [logHardCopyPodRequest, setLogHardCopyPodRequest] = useState(0);
  /** Debit control table: trip whose Log hard copy POD modal is open. */
  const [podLogSummary, setPodLogSummary] = useState<ComplianceTripSummary | null>(null);
  const [exporting, setExporting] = useState(false);
  const routeFocus = useLocalSearchParams<{ trip?: string; tab?: string }>();

  const complianceHoldCount = useMemo(
    // Every trip Compliance put on hold: waiting for Ground Ops or resubmitted.
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
      if (verifiedSlice === "compliance" || verifiedSlice === "pending_docs") {
        return [];
      }
      return filtered;
    }
    if (stage === "compliance_pending") {
      if (pendingSlice === "all") return filtered.filter((summary) => !isActiveFinanceReject(summary));
      if (pendingSlice === "hold") return (summaries ?? []).filter(isComplianceDeclineActive);
      if (pendingSlice === "finance_declined") {
        return (summaries ?? []).filter(isFinanceDeclinedForCompliancePending);
      }
      return filtered;
    }
    if (stage === "pending_for_docs") {
      if (pendingSlice === "all") {
        return pendingDocsTransitPool.filter((summary) => !isActiveFinanceReject(summary));
      }
      if (pendingSlice === "hold") {
        return (summaries ?? []).filter(isPendingDocsComplianceHold).filter(matchPendingDocsTransit);
      }
      if (pendingSlice === "rejected") {
        return (summaries ?? []).filter(isFinanceDeclinedForPendingDocs).filter(matchPendingDocsTransit);
      }
      return pendingDocsTransitPool;
    }
    if (stage === "finance_verified") {
      return advancePaySlice === "paid" ? advancePaidPool : filtered;
    }
    if (stage === "hard_copy_pod_received") {
      if (podSlice === "pending") {
        if (awaitingPodSubview === "all") return podPendingPool;
        return podPendingPool.filter((summary) =>
          matchesAwaitingPodSubview(summary, awaitingPodSubview),
        );
      }
      if (podSlice === "advance_processed") {
        return filtered.filter((summary) => summary.stage === "advance_payment_processed");
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
    advancePaidPool,
    advancePaySlice,
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
   * Document Upload / Compliance Verification / Verified — segmented control.
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
              label: groundOpsPhone ? "On hold" : "Compliance Hold",
              a11yLabel: "Compliance Hold",
              dot: COMPLIANCE_STAGE_TONE.compliance_pending.fg,
            },
            {
              id: "rejected",
              label: groundOpsPhone ? "Declined" : "Declined by finance",
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
          wrap
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
        compliance: 0,
        pending_docs: 0,
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
                // Verified was the same list as Inbox (Finance feedback): one list only.
                { id: "all", label: "Inbox", a11yLabel: "Inbox", dot: null },
              ]}
              onChange={setVerifiedSlice}
            />
          </View>
        </View>
      );
    }
    if (stage === "finance_verified") {
      return (
        <ComplianceSegmentedFilter
          embedded={embedded}
          compact
          cardDense={cardDense}
          value={advancePaySlice}
          counts={{ pending: filtered.length, paid: advancePaidPool.length }}
          options={[
            {
              id: "pending",
              label: "Pending",
              a11yLabel: "Advance pending",
              dot: COMPLIANCE_STAGE_TONE.finance_verified.fg,
            },
            { id: "paid", label: "Paid", a11yLabel: "Advance paid", dot: ADVANCE_PROCESSED_TONE.fg },
          ]}
          onChange={setAdvancePaySlice}
        />
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
            advance_processed: filtered.filter((summary) => summary.stage === "advance_payment_processed").length,
          }}
          options={[
            { id: "all", label: "All", a11yLabel: "All", dot: null },
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
            {
              id: "advance_processed",
              label: "Advance Processed",
              a11yLabel: "Advance Processed",
              dot: ADVANCE_PROCESSED_TONE.fg,
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
    // Settlement Verification / Final Settlement are separate tabs: no sub-filter.
    return null;
  };
  const hasQueueSubFilter =
    stage === "pending_for_docs" ||
    stage === "compliance_pending" ||
    stage === "compliance_verified" ||
    stage === "finance_verified" ||
    stage === "hard_copy_pod_received";

  /** Cards: queue subfilter above the trip list. Table: under stage chips. Verified has no subfilter. */
  const cardsListHeader = useMemo(() => {
    if (isMobile) {
      return hasQueueSubFilter ? (
        <View style={styles.cardListHeader}>{renderQueueSubFilter(false)}</View>
      ) : null;
    }
    return (
      <View style={styles.cardListHeader}>
        <View style={styles.cardSearchRow}>
          <Search size={14} color={Theme.textSecondary} strokeWidth={2.2} />
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
        {renderQueueSubFilter(false)}
      </View>
    );
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
    groundOpsPhone,
    search,
    stage,
    verifiedOnlyCount,
    verifiedSlice,
    podSlice,
    podPendingPool.length,
    podReceivedPool.length,
    advancePaySlice,
    advancePaidPool.length,
    settlementSlice,
    settlementPendingPool.length,
    settlementSettledPool.length,
    filtered.length,
    hasQueueSubFilter,
    isMobile,
  ]);
  const showToolbarSubFilter = viewMode === "table" && hasQueueSubFilter;

  const [tableDateSort, setTableDateSort] = useState<"asc" | "desc">("desc");
  const [exportToast, setExportToast] = useState<string | null>(null);
  const searched = useMemo(() => {
    // Search stays inside the open tab and sub-tab; "All" is the cross-queue search.
    return stagePool.filter((summary) => {
      const supplierId = (summary.trip.supplier_id ?? "").trim();
      const resolved = supplierNameByTripId[summary.trip.id];
      return matchesComplianceTripSearch(summary, search, [
        supplierId ? supplierSearchById[supplierId] : null,
        resolved && resolved !== "—" ? resolved : null,
      ]);
    });
  }, [stagePool, search, supplierSearchById, supplierNameByTripId]);
  const ordered = useMemo(() => {
    // Advance Processed: newest posted advance first (Cards + Table). Other stages
    // keep trip-event date sort on Table only.
    if (isAdvanceProcessedStage) {
      return sortAdvanceProcessedSummaries(searched);
    }
    return viewMode === "table" ? sortComplianceTableRows(searched, tableDateSort) : searched;
  }, [isAdvanceProcessedStage, searched, tableDateSort, viewMode]);
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
        advancePaySlice,
        settlementSlice,
        awaitingPodSubview,
        podReceivedSubview,
        search.trim(),
        tableDateSort,
      ].join("|"),
    [
      advancePaySlice,
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
      if (stage === "finance_verified") {
        // Advance Payment → Paid lists it; Finance does not get the Awaiting POD tab.
        setAdvancePaySlice("paid");
        setCardTripId(tripId);
        return;
      }
      if (stage !== "compliance_verified") return;
      // Paid trips are listed under Awaiting POD.
      setStage("hard_copy_pod_received");
      setCardTripId(tripId);
    },
    [setStage, stage, syncChange],
  );

  /** Advance Processed Export Report: rows are prepared on open so the card shows real counts. */
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

  /** Advance Payment Export Report: Pending + Paid in one sheet, whichever sub-tab is open. */
  const [payExport, setPayExport] = useState<{
    open: boolean;
    preparing: boolean;
    exporting: boolean;
    rows: AdvancePaymentExportRow[];
  }>({ open: false, preparing: false, exporting: false, rows: [] });
  const payExportRequest = useRef(0);
  const isAdvancePaymentStage = stage === "finance_verified";
  useEffect(() => {
    if (!isAdvancePaymentStage) {
      payExportRequest.current += 1;
      setPayExport((cur) => (cur.open && !cur.exporting ? { ...cur, open: false } : cur));
    }
  }, [isAdvancePaymentStage]);
  const payExportCounts = useMemo(() => countAdvancePaymentExport(payExport.rows), [payExport.rows]);

  const openAdvancePaymentExport = useCallback(() => {
    const orgId = currentOrganization?.id;
    if (!orgId) return;
    const request = ++payExportRequest.current;
    setPayExport({ open: true, preparing: true, exporting: false, rows: [] });
    // `filtered` is the Pending queue on this stage; Paid comes from its own pool.
    prepareAdvancePaymentReport(orgId, filtered, advancePaidPool)
      .then((rows) => {
        if (request !== payExportRequest.current) return;
        setPayExport((cur) => ({ ...cur, preparing: false, rows }));
      })
      .catch((error: unknown) => {
        if (request !== payExportRequest.current) return;
        setPayExport((cur) => ({ ...cur, open: false, preparing: false }));
        alertMessage("Couldn't prepare report", error instanceof Error ? error.message : "Please try again.");
      });
  }, [advancePaidPool, currentOrganization?.id, filtered]);

  const closeAdvancePaymentExport = useCallback(() => {
    payExportRequest.current += 1;
    setPayExport((cur) => (cur.exporting ? cur : { ...cur, open: false, preparing: false }));
  }, []);

  const confirmAdvancePaymentExport = useCallback(async () => {
    if (payExport.exporting || payExport.preparing || payExport.rows.length === 0) return;
    setPayExport((cur) => ({ ...cur, exporting: true }));
    try {
      await downloadAdvancePaymentReport(payExport.rows);
      setPayExport((cur) => ({ ...cur, open: false, exporting: false }));
    } catch (error) {
      setPayExport((cur) => ({ ...cur, exporting: false }));
      alertMessage("Couldn't export report", error instanceof Error ? error.message : "Please try again.");
    }
  }, [payExport.exporting, payExport.preparing, payExport.rows]);

  const openAdvanceProcessedExport = useCallback(() => {
    const orgId = currentOrganization?.id;
    if (!orgId) return;
    const request = ++apExportRequest.current;
    setApExport({ open: true, preparing: true, exporting: false, rows: [] });
    // Stage-scoped (`filtered`), not cross-stage `searched` — then newest posted first.
    // Awaiting POD also lists unpaid trips, so keep only Advance Processed ones.
    prepareAdvanceProcessedReport(
      orgId,
      sortAdvanceProcessedSummaries(filtered.filter((summary) => summary.stage === "advance_payment_processed")),
    )
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
    if (stage === "compliance_verified" && verifiedSlice === "pending_docs") extra.push("Document Upload");
    if (stage === "hard_copy_pod_received" && podSlice === "pending") extra.push("POD Pending");
    if (stage === "hard_copy_pod_received" && podSlice === "received") extra.push("POD Received");
    if (stage === "hard_copy_pod_received" && podSlice === "advance_processed") extra.push("Advance Processed");
    if (stage === "finance_verified") extra.push(advancePaySlice === "paid" ? "Paid" : "Pending");
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
      await downloadComplianceTableExport(rows, stage === "compliance_pending" || hideCommercials);
    } catch (error) {
      alertMessage("Couldn't export", error instanceof Error ? error.message : "Please try again.");
    }
  }, [
    advancePaySlice,
    awaitingPodSubview,
    pendingSlice,
    podReceivedSubview,
    podSlice,
    settlementSlice,
    hideCommercials,
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

  const awaitingFiltersOnDetail = viewMode === "card" && !debitControlOnly;
  const renderAwaitingPodFilters = (onDetail: boolean) =>
    awaitingPodCounts ? (
      <View style={onDetail ? styles.detailFilterRow : styles.subchipRow}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={onDetail ? styles.detailFilterScroll : styles.subchipScroll}
          contentContainerStyle={onDetail ? styles.detailFilterChips : styles.chipWrap}
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
    ) : null;

  const mobileStageItems = useMemo(() => {
    const show = (item: ComplianceQueueFilter) => visibleStages.has(item);
    const items: {
      id: ComplianceQueueFilter;
      label: string;
      count: number;
      caption?: string;
    }[] = [];
    if (show("all")) items.push({ id: "all", label: "All", count: counts.all });
    for (const group of STAGE_DEPT_GROUPS) {
      for (const item of group.stages) {
        if (!show(item)) continue;
        items.push({
          id: item,
          label: complianceQueueLabel(item),
          count: item === "pod_received" ? podReceivedCount : counts[item],
          caption: group.department,
        });
      }
    }
    return items;
  }, [counts, podReceivedCount, visibleStages]);
  const mobileCanExport =
    Boolean(canViewFinance) &&
    (isVerifiedStage || isAdvancePaymentStage || (isAdvanceProcessedStage && !isAdvancePaymentStage));
  const onMobileExport = () => {
    if (isVerifiedStage) setExportOpen(true);
    else if (isAdvancePaymentStage) openAdvancePaymentExport();
    else if (isAdvanceProcessedStage) openAdvanceProcessedExport();
  };

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

  if (groundOpsWarehouseGap.missingWarehouse) {
    return <GroundOpsWarehouseNotice />;
  }

  return (
    <View
      style={[
        styles.screen,
        isMobile && styles.screenMobile,
        {
          paddingTop: contentTopInset,
          // Native: the root tab dock sits below the screen (not over it), so no dock clearance.
          paddingBottom: Platform.OS === "web" ? layout.scrollBottomPadding(4) : 4,
          paddingHorizontal: isMobile ? Layout.screenPaddingHorizontal : pagePad,
          maxHeight: windowHeight,
        },
      ]}
    >
      <View style={[styles.chrome, isMobile && styles.chromeMobile]}>
      {isMobile ? (
        <ComplianceMobileChrome
          search={search}
          onSearchChange={setSearch}
          stages={mobileStageItems}
          stage={stage}
          onSelectStage={selectStage}
          subFilter={hasQueueSubFilter ? renderQueueSubFilter(false) : null}
          extraFilters={
            <>
              {awaitingPodCounts && !awaitingFiltersOnDetail ? renderAwaitingPodFilters(false) : null}
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
            </>
          }
          canBulkPay={canManageFinance}
          onBulkPay={() => router.push(ROUTES.COMPLIANCE_BULK_PAYMENT as Parameters<typeof router.push>[0])}
          canExport={mobileCanExport}
          onExport={onMobileExport}
          exportLabel="Export Report"
        />
      ) : (
      <View>
      <View style={[styles.toolbarRow, stackToolbar && styles.toolbarStack]}>
        {viewMode !== "card" ? (
        <View
          style={[
            styles.searchRow,
            stackToolbar ? styles.searchRowStacked : searchWidthStyle,
            isNarrow && styles.searchRowNarrow,
          ]}
        >
          <Search size={14} color={Theme.textSecondary} strokeWidth={2.2} />
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
        ) : null}
        <View style={[styles.filtersRow, stackToolbar && styles.filtersRowStacked]}>
          <View style={styles.stageTrack}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.chipScroll}
              contentContainerStyle={styles.stageDeptWrap}
              keyboardShouldPersistTaps="handled"
            >
              <StageFilterRail
                stage={stage}
                counts={counts}
                podReceivedCount={podReceivedCount}
                onSelectStage={selectStage}
                visibleStages={visibleStages}
              />
            </ScrollView>
          </View>
        </View>
      </View>
      {showToolbarSubFilter ? (
        <View style={styles.tableSubFilterBar}>{renderQueueSubFilter(true)}</View>
      ) : null}
      {awaitingPodCounts && !awaitingFiltersOnDetail ? renderAwaitingPodFilters(false) : null}
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
      )}
      </View>

      <View style={[styles.queueBody, isMobile && styles.queueBodyMobile]}>
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
              ? "No trips in this tab match your search."
              : summaries.length
                ? stage === "compliance_verified"
                    ? verifiedSlice === "verified"
                      ? "No verified trips in this queue."
                      : verifiedSlice === "compliance"
                        ? "No finance-declined trips in Compliance."
                        : verifiedSlice === "pending_docs"
                          ? "No finance-declined trips in Document Upload."
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
      ) : viewMode === "table" && debitControlOnly ? (
        // Debit control: one 10-column table for every tab.
        <TableQueueScroll {...tableQueueScrollProps}>
          <DebitControlTripsTable
            summaries={tableWindowItems}
            tripFacts={tripFacts}
            onOpenTrip={openTrip}
            onRowPress={
              stage === "hard_copy_pod_received" && podSlice !== "received"
                ? (summary) => {
                    if (tripAppearsInAwaitingPod(summary)) setPodLogSummary(summary);
                  }
                : undefined
            }
          />
        </TableQueueScroll>
      ) : viewMode === "table" && isAdvanceProcessedStage ? (
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
            onMarkComplianceVerified={canMarkVerified && stage !== "pending_for_docs" ? markTripVerified : undefined}
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
            compliancePendingLayout={stage === "compliance_pending" || hideCommercials}
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
          hideCommercials={hideCommercials}
          groundOpsDocumentLock={hideCommercials}
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
                    transactionDate: values.transactionDate,
                    notes: compliancePaymentNotes(values),
                    paidFromAccountId: values.paidFromAccountId,
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
          onRejectCompliance={canReject ? rejectTrip : undefined}
          onResubmitCompliance={
            canResubmit && stage === "pending_for_docs"
              ? resubmitComplianceTrip
              : undefined
          }
          onDeclineCompliance={canMarkVerified ? declineTrip : undefined}
          onMarkComplianceVerified={canMarkVerified && stage !== "pending_for_docs" ? markTripVerified : undefined}
          onFinanceVerify={canManageFinance ? financeVerifyTrip : undefined}
          onUndoFinanceVerify={canManageFinance ? undoFinanceVerifyTrip : undefined}
          financeVerifySubmitting={financeVerifySubmitting}
          defaultPreview={
            stage === "compliance_verified" || stage === "finance_verified" ? "advance" : "document"
          }
          defaultFinanceList={stage === "compliance_verified"}
          hideDocumentDecisions={stage === "compliance_verified" || stage === "pending_for_docs"}
          hideDocumentPanes={debitControlOnly}
          canManagePod={canManagePod}
          canEditTripFiles={canResubmit}
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
          onSelectedTripChange={setCardTripId}
          focusTab={cardFocus?.tab ?? null}
          focusToken={cardFocus?.token ?? 0}
          listHeader={cardsListHeader}
          detailHeader={awaitingFiltersOnDetail ? renderAwaitingPodFilters(true) : null}
          stacked={isNarrow}
          phoneFlow={groundOpsPhone}
          onChanged={(change) => void syncChange(change)}
          onReviewTripDocs={(tripId, _documentKey, scope = "trip") => {
            openComplianceCard(tripId, scope);
          }}
        />
      )}

      {/* Ground Ops on a phone work in cards only: no Cards/Table toggle or export. */}
      {groundOpsPhone || isMobile ? null : (
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
              <Download size={11} color={Theme.actionBtnInk} strokeWidth={2} />
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
              <Download size={11} color={Theme.actionBtnInk} strokeWidth={2} />
              {!isNarrow ? (
                <Text style={styles.reportBtnText}>{compactActions ? "Export" : "Export Report"}</Text>
              ) : null}
            </TouchableOpacity>
          ) : null}
          {canViewFinance && isAdvancePaymentStage ? (
            <TouchableOpacity
              style={[styles.reportBtn, compactActions && styles.actionBtnCompact]}
              onPress={openAdvancePaymentExport}
              hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
              accessibilityRole="button"
              accessibilityLabel="Export Report"
            >
              <Download size={11} color={Theme.actionBtnInk} strokeWidth={2} />
              {!isNarrow ? (
                <Text style={styles.reportBtnText}>{compactActions ? "Export" : "Export Report"}</Text>
              ) : null}
            </TouchableOpacity>
          ) : null}
          {canViewFinance && isAdvanceProcessedStage && !isAdvancePaymentStage ? (
            <TouchableOpacity
              style={[styles.reportBtn, compactActions && styles.actionBtnCompact]}
              onPress={openAdvanceProcessedExport}
              hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
              accessibilityRole="button"
              accessibilityLabel="Export Report"
            >
              <Download size={11} color={Theme.actionBtnInk} strokeWidth={2} />
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
              <Wallet size={11} color={Theme.buttonDarkText} strokeWidth={2} />
              {!isNarrow ? (
                <Text style={styles.bulkBtnText}>{compactActions ? "Bulk" : "Bulk Payment"}</Text>
              ) : null}
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
      )}
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

      <ComplianceExportConfirmModal
        visible={payExport.open && isAdvancePaymentStage}
        eyebrow="Advance Payment · Pending and Paid"
        verifiedCount={0}
        rejectedCount={0}
        includedCount={payExportCounts.total}
        stats={[
          {
            key: "pending",
            label: "Pending",
            value: payExportCounts.pending,
            tone: COMPLIANCE_STAGE_TONE.finance_verified,
          },
          { key: "paid", label: "Paid", value: payExportCounts.paid, tone: ADVANCE_PROCESSED_TONE },
        ]}
        preparing={payExport.preparing}
        exporting={payExport.exporting}
        emptyHint="No advances pending or paid to export yet."
        confirmLabel="Export"
        onCancel={closeAdvancePaymentExport}
        onConfirm={() => {
          void confirmAdvancePaymentExport();
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
            transactionDate: values.transactionDate,
            notes: compliancePaymentNotes(values),
            paidFromAccountId: values.paidFromAccountId,
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
      {podLogSummary ? (
        <ComplianceHardCopyPodSheet
          visible
          onClose={() => setPodLogSummary(null)}
          summary={podLogSummary}
          organizationId={currentOrganization?.id ?? null}
          canManage={canManagePod}
          lrOptions={courierLrOptions}
          tripFacts={tripFacts}
          onChanged={async (ids) => {
            await Promise.all(ids.map((tripId) => syncChange({ type: "tripFlags", tripId })));
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, minHeight: 0, overflow: "hidden", backgroundColor: Theme.compliancePageBg },
  screenMobile: { backgroundColor: HUB_MOBILE_LIST_CANVAS_BG },
  chrome: { flexShrink: 0, paddingTop: 8 },
  chromeMobile: { paddingTop: 2 },
  queueBody: { flex: 1, minHeight: 0, marginTop: 8, gap: 4 },
  queueBodyMobile: { marginTop: 2 },
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
    height: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.complianceCardBorder,
    shadowColor: Theme.textPrimaryDark,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  searchRowStacked: {
    width: "100%",
    maxWidth: "100%",
  },
  searchRowNarrow: {
    height: 44,
    paddingHorizontal: 12,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    height: "100%",
    paddingVertical: 0,
    fontSize: 12,
    fontWeight: "500",
    color: Theme.textPrimary,
    ...(Platform.OS === "web" ? { outlineStyle: "none" as const } : null),
  },
  bulkBtn: {
    height: 26,
    minHeight: 26,
    minWidth: 68,
    paddingHorizontal: 10,
    borderRadius: 4,
    backgroundColor: Theme.actionBtnInk,
    borderWidth: 1,
    borderColor: Theme.actionBtnInk,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  reportBtn: {
    height: 26,
    minHeight: 26,
    minWidth: 68,
    paddingHorizontal: 10,
    borderRadius: 4,
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.actionBtnGhostBorder,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  actionBtnCompact: {
    paddingHorizontal: 10,
    minWidth: 36,
  },
  bulkBtnText: { fontSize: 10, fontWeight: "500", lineHeight: 12, color: Theme.buttonDarkText },
  reportBtnText: { fontSize: 10, fontWeight: "500", lineHeight: 12, color: Theme.actionBtnInk },
  logHardCopyPodBtn: {
    flexShrink: 0,
    height: 26,
    minHeight: 26,
    minWidth: 68,
    marginLeft: 8,
    paddingHorizontal: 10,
    borderRadius: 4,
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.actionBtnGhostBorder,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  logHardCopyPodBtnText: {
    fontSize: 10,
    fontWeight: "500",
    letterSpacing: 0,
    lineHeight: 12,
    color: Theme.actionBtnInk,
  },
  toolbarRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  toolbarStack: {
    flexDirection: "column",
    alignItems: "stretch",
    gap: 10,
  },
  filtersRow: {
    flex: 1,
    minWidth: 0,
    minHeight: 56,
    justifyContent: "center",
  },
  /**
   * Stacked toolbar is a column: `flex: 1` (basis 0) collapses the rail to 0 high
   * on Android and the queue draws over it. Size it to the rail instead.
   */
  filtersRowStacked: { flex: 0, flexGrow: 0, flexShrink: 0, flexBasis: "auto", width: "100%" },
  chipScroll: {
    flexGrow: 1,
    width: "100%",
    height: 32,
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
  /** Verified: Queue (All / Verified) beside Declined (Compliance / Document Upload). */
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
    paddingHorizontal: 10,
    paddingTop: 6,
    paddingBottom: 8,
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
  detailFilterRow: {
    width: "100%",
    marginTop: 0,
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 8,
    paddingRight: 8,
    borderRadius: 999,
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.complianceCardBorder,
    overflow: "hidden",
  },
  detailFilterScroll: {
    flex: 1,
    minWidth: 0,
    height: 40,
  },
  detailFilterChips: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 40,
    paddingRight: 4,
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
  cardListHeader: {
    width: "100%",
    alignItems: "stretch",
  },
  cardSearchRow: {
    alignSelf: "stretch",
    height: 40,
    marginTop: 10,
    marginHorizontal: 10,
    marginBottom: 2,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.complianceCardBorder,
  },
  stageDeptWrap: {
    flexDirection: "row",
    flexWrap: "nowrap",
    alignItems: "center",
    gap: 4,
    height: 32,
    paddingRight: 4,
  },
  stageTrack: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    height: 56,
    paddingHorizontal: 6,
    paddingVertical: 10,
    overflow: "hidden",
    borderRadius: 999,
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.complianceCardBorder,
    shadowColor: Theme.textPrimaryDark,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
    gap: 6,
  },
  chipStack: {
    flexShrink: 0,
    height: 32,
    justifyContent: "center",
  },
  chip: {
    flexShrink: 0,
    height: 32,
    minWidth: 44,
    paddingLeft: 12,
    paddingRight: 10,
    borderRadius: 999,
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.complianceCardBorder,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    ...(Platform.OS === "web"
      ? {
          transitionDuration: "140ms",
          transitionProperty: "background-color, border-color, box-shadow",
          transitionTimingFunction: "ease",
        }
      : null),
  },
  chipHover: {
    backgroundColor: Theme.cardWhite,
    borderColor: Theme.complianceHoverBorder,
  },
  chipActive: {
    backgroundColor: Theme.buttonDark,
    borderColor: Theme.buttonDark,
  },
  chipActiveHover: {
    ...(Platform.OS === "web"
      ? { boxShadow: `0 6px 14px ${Theme.complianceCardShadow}` }
      : null),
  },
  chipCopy: {
    minWidth: 0,
    justifyContent: "center",
    gap: 1,
  },
  chipText: {
    fontSize: 10,
    fontWeight: "700",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    lineHeight: 12,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  chipTextActive: {
    color: Theme.buttonDarkText,
  },
  chipSubtitle: {
    fontSize: 7,
    fontWeight: "600",
    fontStyle: "italic",
    color: Theme.textMuted,
    lineHeight: 9,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  chipSubtitleHover: {
    color: Theme.textSecondary,
  },
  chipSubtitleActive: {
    color: Theme.accentGold,
  },
  chipCountBadge: {
    minWidth: 20,
    height: 18,
    paddingHorizontal: 6,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  chipCount: {
    fontSize: 10,
    fontWeight: "700",
    lineHeight: 12,
    textAlign: "center",
    fontVariant: ["tabular-nums"],
    includeFontPadding: false,
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
    gap: 8,
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
