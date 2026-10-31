/**
 * Trips Control — demo2 trips tab. Active | History, trip cards, Add Trip.
 * Private Book = driver/vehicle assigned by you; Shared Ledger = assigned by another user.
 */
import { ContentErrorState } from "@/components/ContentErrorState";
import { DateRangePickerModal } from "@/components/DateRangePickerModal";
import { PulsePillButton } from "@/components/PulsePillButton";
import { SceneLoadingSplash } from "@/components/chromeLoadingScreens";
import {
    hubMobileChromeStyles as hubChrome,
    HubMobileScreenHeader,
    HubMobileUnderlineTab,
} from "@/components/hub";
import { HubScreenShell } from "@/components/hub/HubScreenShell";
import type { HubGridPageSize } from "@/components/hub/hubGridCardLayout";
import {
    HUB_GRID_DEFAULT_PAGE_SIZE,
    HUB_GRID_MIN_WIDTH,
    hubGridColumnCount,
    hubGridItemStyle,
} from "@/components/hub/hubGridCardLayout";
import {
    CHAT_FILTER_MUTED,
    chatFilterChromeStyles as chatChrome,
} from "@/constants/ChatFilterChrome";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { useOptionalActiveWorkspace } from "@/contexts/ActiveWorkspaceContext";
import { useOptionalAuth } from "@/contexts/AuthContext";
import { useTabBarAwareScrollProps } from "@/contexts/DemoTabBarScrollContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useOptionalOrganization } from "@/contexts/OrganizationContext";
import { downloadTripIndentReportExcel } from "@/features/trips/utils/tripIndentReportExport.util";
import { resolveTripIndentReportAudience } from "@/features/trips/utils/tripIndentReport.model";
import {
  buildTripOpsReportRows,
  TRIP_OPS_REPORT_COLUMNS,
} from "@/features/trips/utils/tripOpsReport.model";
import { downloadTripOpsReportExcel } from "@/features/trips/utils/tripOpsReportExport.util";
import {
  buildTripIndentReport,
  loadTripIndentReportCatalog,
} from "@/features/trips/services/tripIndentReport.service";
import { shouldShowAggregateTripKindPill } from "@/features/drivers/utils/driverUtils.util";
import { toReportIsoDate } from "@/features/finance/lib/ledgerReportTable.util";
import type { LedgerRow } from "@/features/finance/services/finance.service";
import { computeTripSettlementDues } from "@/features/finance/utils/tripSettlement.util";
import type { IndentRow } from "@/features/indents";
import { setInitialIndentForDetail } from "@/features/indents/initialIndentForDetail";
import { getIndentDisplayNumber } from "@/features/indents/services/indents.service";
import {
    INDENT_CANCEL_REASONS,
    indentCancelReasonId,
    isIndentFailedStatus,
    type IndentCancelReasonId,
} from "@/features/indents/utils/indentCancelReason.util";
import { GiveLoadIndentCardActions } from "@/features/network/components/LoadCenterIndentCardActions";
import { useExecutionPlanClients } from "@/features/network/hooks/useExecutionPlanClientNames";
import { useGiveLoadIndentActions } from "@/features/network/hooks/useGiveLoadIndentActions";
import { useShipperPoolIndentView } from "@/features/network/hooks/useShipperPoolIndentView";
import { extractCommercePlanIds } from "@/features/network/utils/commercePlanIds.util";
import { giveLoadIndentAvatarProps, resolveMergedOrderCardTitle } from "@/features/network/utils/indentCardAvatar.util";
import { isIndentStageDone, isIndentUnallocated } from "@/features/network/utils/loadCenter.model";
import { GroundOpsWarehouseNotice } from "@/features/organization/components/GroundOpsWarehouseNotice";
import { useGroundOpsWarehouseGap } from "@/features/organization/hooks/useGroundOpsWarehouseGap";
import { useSourcingScope } from "@/features/organization/hooks/useSourcingScope";
import { getTripDriverPhones } from "@/features/tripCompliance/services/tripDriverPhones.service";
import { groundOpsDocumentLockReason } from "@/features/tripCompliance/utils/groundOpsDocumentLock.util";
import { AttributionRequestsSection } from "@/features/trips/components/AttributionRequestsSection";
import { HubTripLrUpdateModal } from "@/features/trips/components/HubTripLrUpdateModal";
import {
  IndentHubActivityLogButton,
  IndentHubActivityLogPanel,
} from "@/features/trips/components/IndentHubActivityLog";
import { IndentHubSpreadsheetTable } from "@/features/trips/components/IndentHubSpreadsheetTable";
import { IndentStageViews } from "@/features/trips/components/IndentStagePoolView";
import { TripsFilterBottomSheet } from "@/features/trips/components/TripsFilterBottomSheet";
import {
    TripsHubBentoMetrics,
    TripsHubHistoryBentoMetrics,
    type HistoryTripMetricId,
} from "@/features/trips/components/TripsHubBentoMetrics";
import { TripsHubIndentStageCard } from "@/features/trips/components/TripsHubIndentStageCard";
import {
    linkedOrgAvatarFields,
    summarizeTripLedgerForHub,
    tripFinanceAdjForHubLookup,
    tripHubRevenue,
    TripsHubAuditFooter,
    TripsHubMobileTripListCanvas,
    TripsHubTableView,
    TripsHubTripCard,
} from "@/features/trips/components/TripsHubViews";
import { TripsLedgerExportModalGate } from "@/features/trips/components/TripsLedgerExportModalGate";
import { TripsPromoCard } from "@/features/trips/components/TripsPromoCard";
import { VaultCategoryPreviewModal } from "@/features/trips/components/trip-detail/VaultCategoryPreviewModal";
import { shouldFetchHubDigitalPodFlags } from "@/features/trips/components/trip-detail/completedTripInitialLoad.util";
import type { VaultCategoryPreviewFile } from "@/features/trips/components/trip-detail/vaultCategoryPreview.types";
import {
    useRouteExtraStopRows,
    useRouteExtraStopsSummaries,
} from "@/features/trips/hooks/useRouteExtraStopsQuery";
import {
    getTripHubInTransitPing,
    useTripHubInTransitPings,
} from "@/features/trips/hooks/useTripHubInTransitPings";
import { useTripsHubDateRange } from "@/features/trips/hooks/useTripsHubDateRange";
import { useIndentWorkload } from "@/features/indents/hooks/useIndentWorkload";
import {
    classifyIndentWorkload,
    indentWorkloadStatusTag,
    type IndentWorkloadKind,
} from "@/features/indents/utils/indentWorkload.util";
import { useTripsHubSearch } from "@/features/trips/hooks/useTripsHubSearch";
import { useTripsIndentCodeSearch } from "@/features/trips/hooks/useTripsIndentCodeSearch";
import type { ElrTripSource } from "@/features/trips/services/elrSnapshot.util";
import type { TripAdjustment } from "@/features/trips/services/tripAdjustments";
import {
    loadHubPodReceiptFlags,
    loadHubTripDocumentLabelsByTripIds,
    tripHasHubPodFlag,
    tripPodIsReceived,
    type HubPodReceiptFlags,
} from "@/features/trips/services/tripDocumentLrPod.service";
import { getTripStatusTimes } from "@/features/trips/services/tripStatusTimes.service";
import type { TripRow } from "@/features/trips/services/trips.service";
import { isAttributedFleetTrip } from "@/features/trips/utils/attributedFleetTrip.util";
import {
    HUB_ASSIGNMENT_AUDIT_TRIP_LIMIT,
    hubAssignmentAuditTripIds,
} from "@/features/trips/utils/hubAssignmentAuditTripIds.util";
import {
    buildActiveHubRailCounts,
    filterHubTripsForActiveList,
    filterHubTripsForHistoryList,
    hubActiveAllTripCount,
    hubActiveRailMetric,
    hubCountText,
    hubHistoryPodMetricIds,
    hubSoftPodCheckedTripIds,
    hubSoftPodChipState,
    hubShowingCountLabel,
    hubTabTripCounts,
    hubTripCompletenessNote,
    resolveHubTripDataset,
} from "@/features/trips/utils/hubTripListCounts.util";
import { HUB_ALL_TIME_BOUNDS } from "@/features/trips/utils/tripOrgFetch.util";
import {
    hubItemListIndex,
    hubPageForIndex,
    hubVisibleCountForIndex,
} from "@/features/trips/utils/hubLastOpenedVisibility.util";
import {
  sliceHubListPage,
  visibleHubTripIds,
} from "@/features/trips/utils/hubListPageSlice.util";
import {
    indentHubStatusTag,
    type IndentHubStatusTag,
} from "@/features/trips/utils/indentHubCardPresentation";
import { indentRowToHubTrip } from "@/features/trips/utils/indentHubTableTrip.util";
import {
  collectIndentHubSearchMatches,
  pickIndentHubSearchStage,
} from "@/features/trips/utils/indentHubSearchStage.util";
import {
  bestTripHubSearchMatch,
  collectTripHubSearchMatches,
  pickTripHubSearchStage,
} from "@/features/trips/utils/tripHubSearchStage.util";
import {
    indentMatchesHubDateFilter,
    indentMatchesHubSearch,
    mergeIndentsByLatestUpdate,
    mergeIndentSearchHits,
} from "@/features/trips/utils/indentHubToolbarFilter";
import { nextIndentActivitySelection } from "@/features/trips/utils/indentHubActivity.util";
import {
    getLastOpenedHubItem,
    setLastOpenedHubItem,
} from "@/features/trips/utils/lastOpenedHubItem.util";
import {
    TRIP_METRIC_ORDER,
    type TripMetricId,
} from "@/features/trips/utils/tripHubMetrics";
import type { TripHubPartyMeta } from "@/features/trips/utils/tripHubPartyMeta";
import { buildTripHubPartyMetaByTripId } from "@/features/trips/utils/tripHubPartyMeta";
import { tripMatchesHubSearch } from "@/features/trips/utils/tripHubSearch.util";
import { tripNonSupplierOutflowTotal } from "@/features/trips/utils/tripManifestFreightCost";
import { showAppAlert } from "@/lib/appAlert";
import { canAccessTrips } from "@/lib/capabilities";
import {
    compareTripsByScheduleAsc,
    compareTripsByScheduleDesc,
    formatIsoDayRangeLabel,
    hubDateFilterIsoBounds,
    tripDayMatchesHubDateFilter,
    type TripHubDateFilter,
} from "@/lib/dateRangePresets";
import { formatLedgerDate } from "@/lib/format";
import { useGlobalSyncStore } from "@/lib/globalSync/useGlobalSyncStore";
import { useAlertRegistryFinanceHandlers } from "@/lib/hooks/useAlertRegistryFinanceHandlers";
import { useLoadingStuck } from "@/lib/hooks/useLoadingStuck";
import { useLayoutInsets } from "@/lib/layoutInsets";
import { useOpenTripDetail } from "@/lib/navigation/useOpenTripDetail";
import { FINITE_LIST_CAP } from "@/lib/pagination";
import { useClientsQuery } from "@/lib/queries/useClientsQuery";
import { useDriverProfileImagesQuery } from "@/lib/queries/useDriverProfileImagesQuery";
import { useDriversQuery } from "@/lib/queries/useDriversQuery";
import { useTripSubcontractsQuery } from "@/lib/queries/useFinanceEntityQueries";
import {
    useFailedIndentsQuery,
    useIndentBidSnapshotsQuery,
    useIndentOfferCountsQuery,
    useIndentsQuery,
} from "@/lib/queries/useIndentsQuery";
import {
    useRealtimeTransactionsInvalidation,
    useRealtimeTripsInvalidation,
} from "@/lib/queries/useRealtimeInvalidation";
import { useSuppliersQuery } from "@/lib/queries/useSuppliersQuery";
import { useTransactionsQuery } from "@/lib/queries/useTransactionsQuery";
import { useTripFinanceAdjustmentsMap } from "@/lib/queries/useTripFinanceAdjustmentsQuery";
import {
    useAssignmentAuditQuery,
    useOrgIndentIdsWithTripQuery,
    useOrgHubMetricsQuery,
    useShipperDisplayNamesQuery,
    useTripsQuery,
} from "@/lib/queries/useTripsQuery";
import { queryKeys, tripIdsHashKey } from "@/lib/queryKeys";
import { scheduleIdleWork } from "@/lib/scheduleIdleWork";
import { supabase } from "@/lib/supabase";
import { isInfrastructureErrorMessage } from "@/lib/supabaseHttp.util";
import {
    resolveTripsPromoVariant,
} from "@/lib/tripsPromoAssets";
import { useLinkedOrgProfileMap } from "@/lib/useLinkedOrgProfileMap";
import { useMemberAccess } from "@/lib/useMemberAccess";
import { useMemberCapabilities } from "@/lib/useMemberCapabilities";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { Download } from "lucide-react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    NativeScrollEvent,
    NativeSyntheticEvent,
    Platform,
    Pressable,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    useWindowDimensions,
    View,
    type TextStyle,
    type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type SupplyFilter = "all" | "asset" | "aggregated";
type SortBy =
  | "date_desc"
  | "date_asc"
  | "revenue_desc"
  | "revenue_asc"
  | "client_asc"
  | "client_desc";
type PaymentFilter = "all" | "pending" | "partial" | "paid";
type AttributionFilter = "all" | "attributed";
type DateFilter = TripHubDateFilter;

type TripsListLayout = "cards" | "table";
type ActiveMetricTabId = TripMetricId | "all";
/** Hub list canvas — soft gray so white trip cards lift; footer is white. */
const TRIPS_PAGE_BG = Theme.surface;
const TRIPS_LIST_LAYOUT_KEY = "@pulse/trips-list-layout";
/** Native mobile: render trips in batches so the hub stays responsive at scale. */
const MOBILE_HUB_INITIAL_BATCH = 20;
const MOBILE_HUB_BATCH_STEP = 20;
/** Rail tiles are status-only; document flags are not needed for counts. */
const EMPTY_HUB_DOC_TRIP_IDS = new Set<string>();

/** Aligns list + Intake / In motion hub counts with All / Asset / Aggregate (same pill logic as hub cards). */
function tripMatchesSupplyFilter(
  trip: TripRow,
  supplyFilter: SupplyFilter,
  partyMeta: Pick<
    TripHubPartyMeta,
    "supplierLinkedOrgId" | "driverTrackingOnly"
  > | undefined,
  viewerOrganizationId: string | null | undefined,
): boolean {
  if (supplyFilter === "all") return true;
  const showAggregatePill = shouldShowAggregateTripKindPill(trip, {
    viewerOrganizationId,
    supplierLinkedOrganizationId: partyMeta?.supplierLinkedOrgId ?? null,
    driverTrackingOnly: partyMeta?.driverTrackingOnly,
  });
  if (supplyFilter === "aggregated") return showAggregatePill;
  return !showAggregatePill;
}

function tripMatchesAttributionFilter(
  trip: TripRow,
  attributionFilter: AttributionFilter,
): boolean {
  if (attributionFilter === "all") return true;
  return isAttributedFleetTrip(trip);
}

function supplierNameFallbackMapsEqual(
  a: Record<string, string>,
  b: Record<string, string>,
): boolean {
  const keysA = Object.keys(a);
  if (keysA.length !== Object.keys(b).length) return false;
  for (const k of keysA) {
    if (a[k] !== b[k]) return false;
  }
  return true;
}

function historyTripDueState(
  trip: TripRow,
  ledgerRows: LedgerRow[],
  currentOrganizationId: string | null | undefined,
  adjustments?: TripAdjustment[] | null,
  subcontractRate?: number | null,
): { receivableDue: number; payableDue: number } {
  const settlement = computeTripSettlementDues({
    trip,
    viewerOrgId: currentOrganizationId,
    ledgerEntries: ledgerRows,
    adjustments,
    subcontractRate: subcontractRate ?? null,
  });
  return {
    receivableDue: settlement.receivableDue,
    payableDue: settlement.payableDue,
  };
}

function hubElrSourceFromTrip(
  trip: TripRow,
  org: { id?: string | null; name?: string | null } | null,
): ElrTripSource {
  return {
    tripId: trip.id,
    tripNumber: trip.trip_number,
    organizationId: trip.organization_id,
    viewerOrganizationId: org?.id ?? null,
    transporterName: org?.name ?? trip.organization_name ?? null,
    clientName: trip.client_name,
    clientId: trip.client_id,
    vehicleId: trip.vehicle_id ?? trip.owner_vehicle_id,
    vehicleRegistration: trip.vehicle_display_number,
    driverId: trip.driver_id,
    driverName: trip.driver_display_name,
    origin: trip.pickup_area,
    destination: trip.drop_location,
    pickupDate: trip.pickup_date,
    loadType: trip.load_type,
    loadTons: trip.load_tons,
    freight: trip.client_price,
    indentId: trip.indent_reference_code ?? trip.indent_id,
    indentRecordId: trip.indent_id,
    tripStatus: trip.status,
  };
}

/** Phone digits for hub search: "+91 98765 43210" / "098765…" search as "9876543210". */
function hubSearchPhoneDigits(query: string): string {
  const digits = query.replace(/\D/g, "");
  if (digits.length > 10 && digits.startsWith("91")) return digits.slice(-10);
  if (digits.length === 11 && digits.startsWith("0")) return digits.slice(1);
  return digits;
}

/** get_trip_driver_phones accepts at most 500 trip ids per call. */
const TRIP_DRIVER_PHONES_CHUNK = 500;
const EMPTY_PHONE_BY_TRIP_ID: Record<string, string> = {};
const EMPTY_TRIP_ROWS: TripRow[] = [];
const EMPTY_INDENT_ROWS: IndentRow[] = [];
const EMPTY_STATUS_TIMES: Awaited<ReturnType<typeof getTripStatusTimes>>["times"] = {};

/** Driver phone per trip via get_trip_driver_phones, in chunks. Plain object: the cache is JSON. */
async function loadDriverPhonesByTripId(
  rows: readonly TripRow[],
): Promise<Record<string, string>> {
  const withDriver = rows
    .filter((t) => Boolean(t.driver_id))
    .map((t) => ({ id: t.id, driver_id: t.driver_id ?? null }));
  const phones: Record<string, string> = {};
  for (let i = 0; i < withDriver.length; i += TRIP_DRIVER_PHONES_CHUNK) {
    const part = await getTripDriverPhones(
      withDriver.slice(i, i + TRIP_DRIVER_PHONES_CHUNK),
    );
    for (const [tripId, phone] of part) phones[tripId] = phone;
  }
  return phones;
}

/** Base list flags plus the older search hits' flags (either may be missing). */
function mergeHubPodFlags(
  base: HubPodReceiptFlags | undefined,
  extra: HubPodReceiptFlags | undefined,
): HubPodReceiptFlags | undefined {
  if (!extra) return base;
  if (!base) return extra;
  // `?? []` / `?? {}`: persisted payloads from older app versions may lack a field.
  return {
    softTripIds: [...(base.softTripIds ?? []), ...(extra.softTripIds ?? [])],
    hardTripIds: [...(base.hardTripIds ?? []), ...(extra.hardTripIds ?? [])],
    ewayExpiryByTripId: { ...base.ewayExpiryByTripId, ...extra.ewayExpiryByTripId },
    lrNumbersByTripId: { ...base.lrNumbersByTripId, ...extra.lrNumbersByTripId },
    ewayNumbersByTripId: { ...base.ewayNumbersByTripId, ...extra.ewayNumbersByTripId },
  };
}

function asRestoredMetricTab(
  value: string | undefined,
): ActiveMetricTabId | null {
  if (value === "all") return "all";
  if (value && (TRIP_METRIC_ORDER as readonly string[]).includes(value)) {
    return value as TripMetricId;
  }
  return null;
}

export default function TripsScreen() {
  const { width, height } = useWindowDimensions();
  /** Desktop card grid — hub ticket cards (4 per row), aligned with Load Center. */
  const isLargeScreen = Platform.OS === "web" && width >= HUB_GRID_MIN_WIDTH;
  const hubGridColumns = hubGridColumnCount(width);
  const hubGridItem = hubGridItemStyle(hubGridColumns);
  const isCompactWeb = Platform.OS === "web" && width < 1180;
  const isMobile = width < 560;
  // Use mobile layout behavior for narrow web widths as well.
  const isMobileViewport = width < 820;
  const insets = useSafeAreaInsets();
  const layout = useLayoutInsets();
  const tabBarScrollProps = useTabBarAwareScrollProps();
  const screenTopPad =
    Platform.OS === "web" ? 0 : insets.top + Layout.headerPaddingBelowInset;
  const tripsScrollBottomPad =
    Platform.OS === "web" && !isMobileViewport
      ? 12
      : layout.scrollBottomPadding(40);
  const router = useRouter();
  /** Deep-link into the INDENT stage, e.g. `/(tabs)/trips?stage=indent`. */
  const { stage: tripsStageParam } = useLocalSearchParams<{
    stage?: string;
  }>();
  const indentDeepLink = tripsStageParam === "indent";
  const { openTripDetail: openTripDetailRaw } = useOpenTripDetail();
  const restoredHubItem = getLastOpenedHubItem();
  const [lastOpenedTripId, setLastOpenedTripId] = useState<string | null>(
    restoredHubItem?.id ?? null,
  );
  const lastOpenedTabSearchDoneRef = useRef<string | null>(null);
  const tripsHubLayoutCompact = width > 0 && width < 640;
  const { t: tr } = useLanguage();
  const orgCtx = useOptionalOrganization();
  const workspaceCtx = useOptionalActiveWorkspace();
  const isGroundOpsMember = workspaceCtx?.memberPlatformRole === "ground_ops";
  // Sourcing follows indents and trips read-only: no card actions, no money
  // tiles, no report / ledger export. App-side only — see RBAC_OPERATING_MODEL.md.
  const isSourcingMember = workspaceCtx?.memberPlatformRole === "sourcing";
  const { finance } = useAlertRegistryFinanceHandlers();
  const salaryRequestRows = useGlobalSyncStore((s) => s.salaryRequestRows);
  const [refreshing, setRefreshing] = useState(false);
  const lastFocusRefreshRef = useRef<number>(0);
  const [tripFilter, setTripFilter] = useState<"Active" | "History">(
    restoredHubItem?.tripFilter === "History" ? "History" : "Active",
  );
  const [searchQuery, setSearchQuery] = useState("");
  const queryClient = useQueryClient();
  const [activeMetricTab, setActiveMetricTab] = useState<ActiveMetricTabId>(
    indentDeepLink
      ? "indent"
      : (asRestoredMetricTab(restoredHubItem?.metricTab) ?? "assigned"),
  );
  // Deep-link re-entry: expo-router can update params on an already-mounted
  // screen (e.g. navigating here again from another post-create success
  // path) without remounting, so the initializer above alone would miss it.
  useEffect(() => {
    if (indentDeepLink) setActiveMetricTab("indent");
  }, [indentDeepLink]);
  const [supplyFilter, setSupplyFilter] = useState<SupplyFilter>("all");
  const [sortBy, setSortBy] = useState<SortBy>("date_desc");
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>("all");
  const [attributionFilter, setAttributionFilter] =
    useState<AttributionFilter>("all");
  const [loadTypeFilter, setLoadTypeFilter] = useState<string>("all");
  const [dateRangeFilter, setDateRangeFilter] = useState<DateFilter>("all");
  const [indentStatusTag, setIndentStatusTag] = useState<
    IndentHubStatusTag | "failed" | null
  >(null);
  const [indentFailedReason, setIndentFailedReason] =
    useState<IndentCancelReasonId | null>(null);
  const [indentActivityOpen, setIndentActivityOpen] = useState(false);
  const [indentActivityFocusId, setIndentActivityFocusId] = useState<string | null>(
    null,
  );
  const indentActivityClickAt = useRef(0);
  const toggleIndentActivity = useCallback((indentId: string | null) => {
    if (!indentId) {
      setIndentActivityFocusId(null);
      indentActivityClickAt.current = 0;
      setIndentActivityOpen(true);
      return;
    }
    const next = nextIndentActivitySelection(
      indentActivityFocusId,
      indentId,
      Date.now(),
      indentActivityClickAt.current,
    );
    indentActivityClickAt.current = next.lastClickAt;
    setIndentActivityFocusId(next.selectedId);
    setIndentActivityOpen(true);
  }, [indentActivityFocusId]);
  const [customDateFrom, setCustomDateFrom] = useState<string | null>(null);
  const [customDateTo, setCustomDateTo] = useState<string | null>(null);
  const [tripLedgerExportOpen, setTripLedgerExportOpen] = useState(false);
  const [tripReportDownloading, setTripReportDownloading] = useState(false);
  /** Domain flags — finance gates cost columns on Trip Report export. */
  const memberDomains = useMemberCapabilities();
  const [activeHistoryMetricTab, setActiveHistoryMetricTab] =
    useState<HistoryTripMetricId | null>(
      restoredHubItem?.historyMetricTab
        ? (restoredHubItem.historyMetricTab as HistoryTripMetricId)
        : null,
    );
  const rememberOpenedHubItem = useCallback(
    (id: string) => {
      setLastOpenedHubItem({
        id,
        tripFilter,
        metricTab: activeMetricTab,
        historyMetricTab: activeHistoryMetricTab,
      });
      setLastOpenedTripId(id);
    },
    [tripFilter, activeMetricTab, activeHistoryMetricTab],
  );
  const openTripDetail = useCallback(
    (...args: Parameters<typeof openTripDetailRaw>) => {
      const id = typeof args[0] === "string" ? args[0].trim() : "";
      if (id) rememberOpenedHubItem(id);
      openTripDetailRaw(...args);
    },
    [openTripDetailRaw, rememberOpenedHubItem],
  );
  const handleOpenTripDetails = useCallback(
    (trip: TripRow) => {
      openTripDetail(trip.id, trip);
    },
    [openTripDetail],
  );
  const [showDateRangePicker, setShowDateRangePicker] = useState(false);
  const [showSortModal, setShowSortModal] = useState(false);
  const hubCustomDateRangeLabel =
    dateRangeFilter === "custom" && customDateFrom && customDateTo
      ? formatIsoDayRangeLabel(customDateFrom, customDateTo)
      : null;
  /** Default to cards for all users; table remains an explicit user toggle. */
  const [listLayout, setListLayout] = useState<TripsListLayout>("cards");
  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(TRIPS_LIST_LAYOUT_KEY);
        if (!isMounted) return;
        if (saved === "cards" || saved === "table") {
          setListLayout(saved);
        }
      } catch {
        // Ignore storage read errors and keep default cards layout.
      }
    })();
    return () => {
      isMounted = false;
    };
  }, []);
  const setListLayoutWithPersistence = useCallback((next: TripsListLayout) => {
    setListLayout(next);
    AsyncStorage.setItem(TRIPS_LIST_LAYOUT_KEY, next).catch(() => {
      // Ignore storage write errors; UI state remains responsive.
    });
  }, []);
  useEffect(() => {
    if (isMobileViewport) setListLayout("cards");
  }, [isMobileViewport]);
  /** Mobile: table is hidden; always use card list + hub toolbar. */
  const effectiveListLayout: TripsListLayout = isMobileViewport
    ? "cards"
    : listLayout;

  const { can: canSurface, orgCapabilities, isLoading: memberAccessLoading } =
    useMemberAccess();
  const auth = useOptionalAuth();
  const canEditHubLr = canSurface("tripops.trips.docs");
  const [hubLrEdit, setHubLrEdit] = useState<{
    tripId: string;
    label: string;
    organizationId: string | null;
  } | null>(null);
  const [hubLrPreviewByTripId, setHubLrPreviewByTripId] = useState<
    Record<string, string>
  >({});
  const [hubLrDocPreview, setHubLrDocPreview] = useState<{
    files: VaultCategoryPreviewFile[];
    index: number;
    tripId: string;
  } | null>(null);
  const groundOpsWarehouseGap = useGroundOpsWarehouseGap();
  // Org model decides whether trips exist at all; the surface decides whether
  // this member may open them. Gating on member-filtered capabilities too would
  // hide the list from finance members, who hold `tripops.trips.view` as a
  // read-only surface that deliberately confers no `dispatch`.
  const canAccess = canAccessTrips(orgCapabilities) && canSurface("tripops.trips.view");
  const canAddTrip =
    canAccess &&
    (canSurface("tripops.trips.create_asset") ||
      canSurface("tripops.trips.create_aggregate"));
  const canAddLoad = canSurface("tripops.indents.create");
  const canUnifiedAdd = canAddTrip || canAddLoad;
  const attributionRequests = useMemo(
    () =>
      salaryRequestRows.filter(
        (row) =>
          String(row.status ?? "pending") === "pending" &&
          row.request_type === "trip_based" &&
          String(row.note ?? "").toLowerCase().includes("fleet trip"),
      ),
    [salaryRequestRows],
  );
  const currentOrganization = orgCtx?.currentOrganization ?? null;
  // Sourcing: only the assigned clients' / warehouses' indents and trips
  // (filtered here, app-side). Org-wide server counts are dropped for them.
  const sourcingScope = useSourcingScope(currentOrganization?.id ?? null);
  const orgLoading = orgCtx?.isLoading ?? !orgCtx;
  const organizationError = orgCtx?.error ?? null;
  const refreshOrganization = orgCtx?.refreshOrganization;
  const workspaceResolving =
    Boolean(workspaceCtx) &&
    (workspaceCtx!.isLoading || !workspaceCtx!.membershipResolved);
  const orgBootPending = orgLoading || workspaceResolving;
  const orgId = canAccess ? (currentOrganization?.id ?? null) : null;
  const cachedTripsForOrg = orgId
    ? (queryClient.getQueryData(queryKeys.trips.finite(orgId)) as TripRow[] | undefined)
    : undefined;

  const {
    data: tripsDataRaw = EMPTY_TRIP_ROWS,
    isPending: tripsLoading,
    isError: tripsLoadFailed,
    error: tripsLoadError,
    refetch: refetchTrips,
  } = useTripsQuery(orgId);
  const tripsData = useMemo(
    () => sourcingScope.filterTrips(tripsDataRaw as TripRow[]),
    [sourcingScope, tripsDataRaw],
  );
  const { data: orgIndentIdsWithTrip } = useOrgIndentIdsWithTripQuery(orgId);
  const { data: hubMetricsRaw } = useOrgHubMetricsQuery(orgId);
  const hubMetrics = sourcingScope.active ? undefined : hubMetricsRaw;
  const trips = tripsData as TripRow[];
  // Newest 400 by default; date pills and search pull older rows from the server.
  const hubDateBounds = useMemo(
    () =>
      hubDateFilterIsoBounds(dateRangeFilter, {
        customFrom: customDateFrom,
        customTo: customDateTo,
      }),
    [customDateFrom, customDateTo, dateRangeFilter],
  );
  // Hub counts and lists use get_trips_for_org dated mode for every pill, "All time"
  // included. The undated newest-400 list is only a first paint / error fallback.
  const {
    trips: hubDateRangeTripsRaw,
    isFetched: hubDateRangeFetched,
    isError: hubDateRangeFailed,
  } = useTripsHubDateRange(orgId, hubDateBounds ?? HUB_ALL_TIME_BOUNDS);
  const hubDateRangeTrips = useMemo(
    () => sourcingScope.filterTrips(hubDateRangeTripsRaw),
    [sourcingScope, hubDateRangeTripsRaw],
  );
  const hubTripCompleteness = resolveHubTripDataset({
    rangeRows: hubDateRangeTrips,
    rangeFetched: hubDateRangeFetched,
    rangeError: hubDateRangeFailed,
    newestRows: tripsData,
  }).completeness;
  const hubCountsPartial = hubTripCompleteness !== "exact";
  const useRangeList = hubTripCompleteness === "exact" || hubTripCompleteness === "capped";
  // Full-width toolbar warning (HubPartialWarning). dateRangeLabel only renders for custom ranges.
  const hubCompletenessNote = hubTripCompletenessNote(hubTripCompleteness);
  const hubDateRangeLabel = hubCustomDateRangeLabel;
  const {
    hits: hubSearchHitsRaw,
    needle: hubSearchNeedle,
    isFetching: hubSearchFetching,
  } = useTripsHubSearch(orgId, searchQuery);
  const hubSearchHits = useMemo(
    () => sourcingScope.filterTrips(hubSearchHitsRaw),
    [sourcingScope, hubSearchHitsRaw],
  );
  const hubSearchHitsCurrent =
    hubSearchNeedle.length >= 2 &&
    hubSearchNeedle.toLowerCase() === searchQuery.trim().toLowerCase();
  const hubSearchHitIds = useMemo(
    () => new Set(hubSearchHitsCurrent ? hubSearchHits.map((t) => t.id) : []),
    [hubSearchHitsCurrent, hubSearchHits],
  );
  /** Search hits missing from the hub rows (older than a capped / fallback list). */
  const hubExtraTrips = useMemo(() => {
    if (!hubSearchHitsCurrent || hubSearchHits.length === 0) return EMPTY_TRIP_ROWS;
    const loadedIds = new Set(
      (useRangeList ? hubDateRangeTrips : trips).map((t) => t.id),
    );
    const extra = hubSearchHits.filter((t) => !loadedIds.has(t.id));
    return extra.length > 0 ? extra : EMPTY_TRIP_ROWS;
  }, [hubDateRangeTrips, hubSearchHits, hubSearchHitsCurrent, trips, useRangeList]);
  const hubTrips = useMemo(() => {
    const source = useRangeList ? hubDateRangeTrips : trips;
    return hubExtraTrips.length > 0 ? source.concat(hubExtraTrips) : source;
  }, [hubDateRangeTrips, hubExtraTrips, trips, useRangeList]);
  // INDENT stage: same `useIndentsQuery` Give Load already runs (shared
  // TanStack Query cache — no duplicate fetch), filtered to indents this org
  // owns that have not yet been allocated to a trip. Allocation is read from
  // the trips this screen already fetches (`trips.indent_id`), not a new query.
  const { data: allIndentsRaw = EMPTY_INDENT_ROWS } = useIndentsQuery(orgId);
  const allIndents = useMemo(
    () => sourcingScope.filterIndents(allIndentsRaw),
    [sourcingScope, allIndentsRaw],
  );
  // Indent tile = exact server counts. Hub opens on "All" (`hubDateBounds` null →
  // "all"): live = any date; needs_trip keeps today−7. Dated pills widen both.
  const indentWorkloadRange = hubDateBounds ?? "all";
  const indentWorkloadRaw = useIndentWorkload(orgId, { range: indentWorkloadRange });
  const indentWorkload = useMemo(
    () =>
      sourcingScope.active
        ? {
            ...indentWorkloadRaw,
            counts: null,
            indents: indentWorkloadRaw.indents
              ? sourcingScope.filterIndents(indentWorkloadRaw.indents)
              : null,
          }
        : indentWorkloadRaw,
    [sourcingScope, indentWorkloadRaw],
  );
  const indentCodeSearchQuery = searchQuery.trim();
  const {
    data: indentCodeSearchHitsRaw = EMPTY_INDENT_ROWS,
    isFetching: indentCodeSearchFetching,
  } = useTripsIndentCodeSearch(orgId, indentCodeSearchQuery);
  const indentCodeSearchHits = useMemo(
    () => sourcingScope.filterIndents(indentCodeSearchHitsRaw),
    [sourcingScope, indentCodeSearchHitsRaw],
  );
  const hubIndents = useMemo(
    () =>
      indentCodeSearchQuery
        ? mergeIndentSearchHits(allIndents, indentCodeSearchHits)
        : allIndents,
    [allIndents, indentCodeSearchHits, indentCodeSearchQuery],
  );
  const indentHubSearchActive = searchQuery.trim().length >= 2;
  const { data: failedIndentsRemoteRaw = EMPTY_INDENT_ROWS } = useFailedIndentsQuery(
    activeMetricTab === "indent" || indentHubSearchActive ? orgId : null,
  );
  const failedIndentsRemote = useMemo(
    () => sourcingScope.filterIndents(failedIndentsRemoteRaw),
    [sourcingScope, failedIndentsRemoteRaw],
  );
  const indentCodesByIndentId = useMemo(() => {
    const byId = new Map<string, string>();
    for (const i of hubIndents) {
      const codes = [i.indent_operational_code, i.indent_code, i.indent_number, getIndentDisplayNumber(i)]
        .map((v) => String(v ?? "").toLowerCase())
        .join(" ");
      byId.set(i.id, codes);
    }
    return byId;
  }, [hubIndents]);
  const indentIdsWithTrip = useMemo(() => {
    const set = new Set(
      hubTrips.map((t) => t.indent_id).filter((id): id is string => Boolean(id)),
    );
    for (const indentId of orgIndentIdsWithTrip ?? []) set.add(indentId);
    return set;
  }, [hubTrips, orgIndentIdsWithTrip]);
  // Live + needs-trip workload rows (server list; until it loads, the capped
  // newest list filtered by the same rules, and counts stay server-exact).
  const indentWorkloadKindById = useMemo(() => {
    const byId = new Map<string, IndentWorkloadKind>();
    const bounds = indentWorkload.bounds;
    if (!bounds) return byId;
    const rows = indentCodeSearchQuery
      ? mergeIndentSearchHits(indentWorkload.indents ?? allIndents, indentCodeSearchHits)
      : (indentWorkload.indents ?? allIndents);
    for (const indent of rows) {
      const kind = classifyIndentWorkload(
        indent,
        indentIdsWithTrip.has(indent.id),
        bounds,
        indentWorkloadRange,
      );
      if (kind) byId.set(indent.id, kind);
    }
    return byId;
  }, [
    allIndents,
    indentCodeSearchHits,
    indentCodeSearchQuery,
    indentWorkloadRange,
    indentIdsWithTrip,
    indentWorkload.bounds,
    indentWorkload.indents,
  ]);
  const unallocatedIndents = useMemo(() => {
    const rows = indentCodeSearchQuery
      ? mergeIndentSearchHits(indentWorkload.indents ?? allIndents, indentCodeSearchHits)
      : (indentWorkload.indents ?? allIndents);
    return rows.filter(
      (i) =>
        (i.organization_id ?? "") === (orgId ?? "") &&
        indentWorkloadKindById.has(i.id) &&
        isIndentUnallocated(i, indentIdsWithTrip) &&
        // Status only — do not drop awarded rows just because a stale Failed
        // query still lists the same id from before the award.
        !isIndentFailedStatus(i.status),
    );
  }, [
    allIndents,
    indentCodeSearchHits,
    indentCodeSearchQuery,
    indentIdsWithTrip,
    indentWorkload.indents,
    indentWorkloadKindById,
    orgId,
  ]);
  // Date pills already applied by the workload query / classifier above.
  const dateFilteredUnallocatedIndents = unallocatedIndents;
  const liveIndents = useMemo(
    () => unallocatedIndents.filter((i) => indentWorkloadKindById.get(i.id) === "live"),
    [indentWorkloadKindById, unallocatedIndents],
  );
  const liveIndentCount = indentWorkload.counts?.live ?? liveIndents.length;
  const needsTripIndentCount =
    indentWorkload.counts?.needs_trip ??
    unallocatedIndents.length - liveIndents.length;
  const visibleUnallocatedIndents = useMemo(
    () =>
      dateFilteredUnallocatedIndents.filter((i) =>
        indentMatchesHubSearch(i, searchQuery),
      ),
    [dateFilteredUnallocatedIndents, searchQuery],
  );
  const unallocatedIndentIds = useMemo(
    () => unallocatedIndents.map((i) => i.id),
    [unallocatedIndents],
  );
  const extraStopsByIndentId = useRouteExtraStopsSummaries("indent", unallocatedIndentIds);
  const extraStopRows = useRouteExtraStopRows("indent", unallocatedIndentIds);
  const extraStopNamesByIndentId = useMemo(() => {
    const byIndent = new Map<string, string[]>();
    for (const row of extraStopRows) {
      if (!row.indent_id) continue;
      const city = row.location.split(",")[0]?.trim();
      if (!city) continue;
      const list = byIndent.get(row.indent_id);
      if (list) list.push(city);
      else byIndent.set(row.indent_id, [city]);
    }
    return byIndent;
  }, [extraStopRows]);
  // The full list is capped (newest FINITE_LIST_CAP), so older failures come
  // from their own query (failedIndentsRemote, Indent tab only). Merge the
  // live/needs-trip workload too — an award refreshes workload before the
  // Failed cache, and without it a stale cancelled copy can sit in Failed
  // while the same id is already in Needs trip creation. Code-search hits
  // fill gaps when the Failed query has not loaded yet (user typed from
  // another rail tile).
  const failedCandidateIndents = useMemo(
    () =>
      mergeIndentsByLatestUpdate(
        failedIndentsRemote,
        allIndents,
        indentWorkload.indents ?? [],
        indentCodeSearchQuery ? indentCodeSearchHits : [],
      ),
    [
      failedIndentsRemote,
      allIndents,
      indentWorkload.indents,
      indentCodeSearchQuery,
      indentCodeSearchHits,
    ],
  );
  const failedStageIndents = useMemo(() => {
    if (!orgId) return [];
    return failedCandidateIndents.filter((indent) => {
      if ((indent.organization_id ?? "") !== orgId) return false;
      // allIndents (merged in above) holds every status, not just failed ones —
      // re-check here or non-failed indents (awarded, bidding, etc.) leak into
      // the Failed tab's list and count.
      if (!isIndentFailedStatus(indent.status)) return false;
      if (
        !indentMatchesHubDateFilter(indent, dateRangeFilter, {
          customFrom: customDateFrom,
          customTo: customDateTo,
        })
      ) {
        return false;
      }
      return indentMatchesHubSearch(indent, searchQuery);
    });
  }, [
    failedCandidateIndents,
    orgId,
    dateRangeFilter,
    customDateFrom,
    customDateTo,
    searchQuery,
  ]);
  /**
   * INDENT-stage membership is `isIndentUnallocated` (`trips.indent_id`).
   * Cards use the same trip ticket shell with indent bidding status +
   * circulation_target source tags.
   */
  /** Offer/story satellites follow the visible hub page, not every unallocated indent. */
  const hubSatelliteIndentIds = useMemo(
    () => visibleUnallocatedIndents.slice(0, HUB_ASSIGNMENT_AUDIT_TRIP_LIMIT).map((i) => i.id),
    [visibleUnallocatedIndents],
  );
  const indentOfferCountIds = useMemo(() => {
    // While searching, load bid counts for the whole unallocated pool so
    // Pending vs Bids received auto-navigation is correct before the indent tile is selected.
    if (activeMetricTab === "indent" || indentHubSearchActive) {
      return dateFilteredUnallocatedIndents.map((indent) => indent.id);
    }
    if (activeMetricTab === "all") return hubSatelliteIndentIds;
    return [];
  }, [
    activeMetricTab,
    dateFilteredUnallocatedIndents,
    hubSatelliteIndentIds,
    indentHubSearchActive,
  ]);
  const { data: indentOfferCounts = {} } = useIndentOfferCountsQuery(
    activeMetricTab === "all" ||
      activeMetricTab === "indent" ||
      indentHubSearchActive
      ? orgId
      : null,
    indentOfferCountIds,
  );
  const indentWorkloadTagFor = useCallback(
    (indent: IndentRow) =>
      indentWorkloadStatusTag(
        indentWorkloadKindById.get(indent.id) ?? "live",
        indentOfferCounts[indent.id] ?? 0,
      ),
    [indentOfferCounts, indentWorkloadKindById],
  );
  const indentHubSearchMatches = useMemo(
    () =>
      collectIndentHubSearchMatches({
        query: searchQuery,
        unallocated: unallocatedIndents,
        failed: failedStageIndents,
        bidCountById: indentOfferCounts,
        workloadKindById: indentWorkloadKindById,
        indentIdsWithTrip,
      }),
    [
      searchQuery,
      unallocatedIndents,
      failedStageIndents,
      indentOfferCounts,
      indentWorkloadKindById,
      indentIdsWithTrip,
    ],
  );
  const tripHubSearchMatches = useMemo(
    () =>
      collectTripHubSearchMatches({
        query: searchQuery,
        trips: hubTrips,
        organizationId: orgId,
      }),
    [searchQuery, hubTrips, orgId],
  );
  const indentSearchHighlightId = useMemo(() => {
    if (!searchQuery.trim() || indentHubSearchMatches.length === 0) return null;
    const stage = pickIndentHubSearchStage(indentHubSearchMatches);
    if (!stage) return null;
    let best: (typeof indentHubSearchMatches)[number] | null = null;
    for (const row of indentHubSearchMatches) {
      if (row.stage !== stage) continue;
      if (!best || row.score > best.score) best = row;
    }
    return best?.indentId ?? null;
  }, [searchQuery, indentHubSearchMatches]);
  const tripSearchHighlightId = useMemo(() => {
    if (!searchQuery.trim() || tripHubSearchMatches.length === 0) return null;
    const stage = pickTripHubSearchStage(tripHubSearchMatches);
    return bestTripHubSearchMatch(tripHubSearchMatches, stage)?.tripId ?? null;
  }, [searchQuery, tripHubSearchMatches]);
  const lastHubSearchNavRef = useRef("");
  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 2) {
      lastHubSearchNavRef.current = "";
      return;
    }
    const tripStage = pickTripHubSearchStage(tripHubSearchMatches);
    const indentStage = pickIndentHubSearchStage(indentHubSearchMatches);
    const bestTrip = bestTripHubSearchMatch(tripHubSearchMatches, tripStage);
    let bestIndentScore = 0;
    if (indentStage) {
      for (const row of indentHubSearchMatches) {
        if (row.stage !== indentStage) continue;
        if (row.score > bestIndentScore) bestIndentScore = row.score;
      }
    }
    if (!tripStage && !indentStage) {
      // Server / code lookup still in flight — wait before treating as a miss.
      if (hubSearchFetching || indentCodeSearchFetching) return;
      return;
    }
    // Strong trip-code hits (exact / includes) win over indent text matches so a
    // Trip ID search leaves Live Indents and opens the trip's real rail stage.
    const preferTrip =
      tripStage != null &&
      bestTrip != null &&
      (indentStage == null ||
        bestTrip.score >= 80 ||
        bestTrip.score > bestIndentScore);
    if (preferTrip && tripStage && bestTrip) {
      const key = `trip|${q.toLowerCase()}|${tripStage}|${bestTrip.tripId}`;
      if (lastHubSearchNavRef.current === key) return;
      lastHubSearchNavRef.current = key;
      setTripFilter("Active");
      setIndentFailedReason(null);
      setIndentStatusTag(null);
      setActiveHistoryMetricTab(null);
      setActiveMetricTab(tripStage);
      return;
    }
    if (!indentStage) return;
    const key = `indent|${q.toLowerCase()}|${indentStage}`;
    if (lastHubSearchNavRef.current === key) return;
    lastHubSearchNavRef.current = key;
    setTripFilter("Active");
    setActiveMetricTab("indent");
    setIndentFailedReason(null);
    setIndentStatusTag(indentStage);
  }, [
    searchQuery,
    tripHubSearchMatches,
    indentHubSearchMatches,
    hubSearchFetching,
    indentCodeSearchFetching,
  ]);
  // Default list = live indents (the tile). "Needs trip creation" (awarded tag) is its own list.
  const indentStageIndents = useMemo(() => {
    if (activeMetricTab === "indent" && indentStatusTag === "failed") {
      if (!indentFailedReason) return failedStageIndents;
      return failedStageIndents.filter(
        (indent) => indentCancelReasonId(indent.cancel_reason) === indentFailedReason,
      );
    }
    if (activeMetricTab !== "indent" || indentStatusTag == null) {
      return visibleUnallocatedIndents.filter(
        (indent) => indentWorkloadKindById.get(indent.id) === "live",
      );
    }
    return visibleUnallocatedIndents.filter(
      (indent) => indentWorkloadTagFor(indent) === indentStatusTag,
    );
  }, [
    activeMetricTab,
    indentStatusTag,
    indentFailedReason,
    failedStageIndents,
    visibleUnallocatedIndents,
    indentWorkloadKindById,
    indentWorkloadTagFor,
  ]);
  const indentStatusTagCounts = useMemo(() => {
    const counts: Record<IndentHubStatusTag, number> = {
      pending: 0,
      bids: 0,
      awarded: 0,
      failed: hubMetrics?.indentFailed ?? failedStageIndents.length,
    };
    if (activeMetricTab !== "indent") return counts;
    for (const indent of visibleUnallocatedIndents) {
      counts[indentWorkloadTagFor(indent)] += 1;
    }
    // Without a search, the needs-trip chip shows the exact server count.
    if (!searchQuery.trim()) counts.awarded = needsTripIndentCount;
    return counts;
  }, [
    activeMetricTab,
    visibleUnallocatedIndents,
    indentWorkloadTagFor,
    failedStageIndents,
    hubMetrics,
    needsTripIndentCount,
    searchQuery,
  ]);
  const indentStageToolbarCountLabel =
    indentStatusTag === "failed"
      ? `Showing ${indentStageIndents.length} of ${hubMetrics?.indentFailed ?? failedStageIndents.length}`
      : hubShowingCountLabel({
          shown: indentStageIndents.length,
          total:
            indentStatusTag === "awarded"
              ? needsTripIndentCount
              : indentStatusTag == null
                ? liveIndentCount
                : indentStatusTagCounts[indentStatusTag],
          partial: indentWorkload.listTruncated || indentWorkload.listError,
        });
  const canViewIndentPools = canSurface("tripops.indents.view");
  const canSelectPoolIndents = canSurface("tripops.indents.allocate");
  const allocatedOrgIndents = useMemo(
    () =>
      allIndents.filter(
        (i) =>
          (i.organization_id ?? "") === (orgId ?? "") &&
          indentIdsWithTrip.has(i.id),
      ),
    [allIndents, orgId, indentIdsWithTrip],
  );
  // Indent Pool lanes/finder must cover the full unallocated workload (live +
  // needs_trip). Live-only hid awarded routes such as Gowdavalli → Amaravati
  // (IND002935) from Drop options even though the pool UI has an Awarded stage.
  const indentPoolView = useShipperPoolIndentView({
    poolIndents: unallocatedIndents,
    visibleIndents: visibleUnallocatedIndents,
    allocatedIndents: allocatedOrgIndents,
  });
  const showIndentPoolView =
    canViewIndentPools && indentPoolView.view === "indents";
  const { data: indentBidSnapshots } = useIndentBidSnapshotsQuery(
    showIndentPoolView && activeMetricTab === "indent" ? orgId : null,
    unallocatedIndentIds,
  );
  const failedReasonCounts = useMemo(() => {
    if (hubMetrics) return hubMetrics.failReasons;
    const counts: Record<IndentCancelReasonId, number> = {
      client_cancelled: 0,
      indent_expired: 0,
      no_rates_available: 0,
      wrong_entry: 0,
    };
    for (const indent of failedStageIndents) {
      const reason = indentCancelReasonId(indent.cancel_reason);
      if (reason) counts[reason] += 1;
    }
    return counts;
  }, [failedStageIndents, hubMetrics]);
  const indentHubToolbarTags = useMemo(
    () => [
      {
        id: "pending",
        kind: "status" as const,
        label: `Pending ${indentStatusTagCounts.pending}`,
        selected: indentStatusTag === "pending",
        accessibilityLabel: "Pending, waiting for bid",
        onPress: () => {
          setIndentFailedReason(null);
          setIndentStatusTag((current) =>
            current === "pending" ? null : "pending",
          );
        },
      },
      {
        id: "bids",
        kind: "status" as const,
        label: `Bids received ${indentStatusTagCounts.bids}`,
        selected: indentStatusTag === "bids",
        accessibilityLabel: "Bids received, receiving bids",
        onPress: () => {
          setIndentFailedReason(null);
          setIndentStatusTag((current) =>
            current === "bids" ? null : "bids",
          );
        },
      },
      {
        id: "awarded",
        kind: "status" as const,
        label: `Needs trip creation ${indentStatusTagCounts.awarded}`,
        selected: indentStatusTag === "awarded",
        accessibilityLabel: "Awarded, needs trip creation",
        onPress: () => {
          setIndentFailedReason(null);
          setIndentStatusTag((current) =>
            current === "awarded" ? null : "awarded",
          );
        },
      },
      {
        id: "failed",
        kind: "status" as const,
        label: `Failed ${hubMetrics?.indentFailed ?? failedStageIndents.length}`,
        selected: indentStatusTag === "failed",
        accessibilityLabel:
          indentStatusTag === "failed"
            ? "Failed, tap again to clear"
            : "Failed indents",
        onPress: () => {
          setIndentFailedReason(null);
          setIndentStatusTag((current) =>
            current === "failed" ? null : "failed",
          );
        },
      },
      ...(indentStatusTag === "failed"
        ? INDENT_CANCEL_REASONS.map((reason) => ({
            id: `reason:${reason.id}`,
            kind: "reason" as const,
            label: `${reason.label} ${failedReasonCounts[reason.id]}`,
            selected: indentFailedReason === reason.id,
            accessibilityLabel:
              indentFailedReason === reason.id
                ? `${reason.label}, tap again to clear`
                : reason.label,
            onPress: () =>
              setIndentFailedReason((current) =>
                current === reason.id ? null : reason.id,
              ),
          }))
        : []),
    ],
    [
      failedReasonCounts,
      failedStageIndents.length,
      hubMetrics?.indentFailed,
      indentFailedReason,
      indentStatusTag,
      indentStatusTagCounts.awarded,
      indentStatusTagCounts.bids,
      indentStatusTagCounts.pending,
    ],
  );
  const indentHubActionOrgId =
    activeMetricTab === "all" || activeMetricTab === "indent" ? orgId : null;
  const handleOpenUnallocatedIndent = useCallback(
    (indent: IndentRow) => {
      rememberOpenedHubItem(indent.id);
      setInitialIndentForDetail(indent);
      router.push(`/indent/${indent.id}` as import("expo-router").Href);
    },
    [router, rememberOpenedHubItem],
  );
  const indentHubActions = useGiveLoadIndentActions({
    orgId: indentHubActionOrgId,
    indentIds:
      activeMetricTab === "indent"
        ? indentStageIndents
            .slice(0, HUB_ASSIGNMENT_AUDIT_TRIP_LIMIT)
            .map((indent) => indent.id)
        : hubSatelliteIndentIds,
    onOpenIndent: handleOpenUnallocatedIndent,
    insets,
  });
  const { data: shipperNameByTripId = {} } = useShipperDisplayNamesQuery(orgId);
  const { data: transactions = [], refetch: refetchTransactions } =
    useTransactionsQuery(orgId);
  const { data: clients = [] } = useClientsQuery(orgId);
  const { data: suppliers = [] } = useSuppliersQuery(orgId);
  const { data: drivers = [] } = useDriversQuery(orgId);
  const hubDriverIds = useMemo(() => {
    const ids = new Set<string>();
    for (const trip of trips) {
      const id = (trip.driver_id ?? "").trim();
      if (id) ids.add(id);
    }
    return Array.from(ids);
  }, [trips]);
  const driverImageById = useDriverProfileImagesQuery(hubDriverIds);
  const driverPhoneById = useMemo(() => {
    const map = new Map<string, string>();
    for (const d of drivers) {
      const phone = (d.phone ?? "").trim();
      if (phone) map.set(d.id.trim().toLowerCase(), phone);
    }
    return map;
  }, [drivers]);
  const linkedOrgByOrganizationId = useLinkedOrgProfileMap(clients, suppliers);
  const clientById = useMemo(() => {
    const map = new Map<string, (typeof clients)[number]>();
    for (const client of clients) map.set(client.id, client);
    return map;
  }, [clients]);
  const tripIds = useMemo(() => trips.map((t) => t.id), [trips]);
  const { data: hubTripSubcontracts = [] } = useTripSubcontractsQuery(
    orgId,
    tripIds,
  );
  const hubSubcontractRateByTripId = useMemo(() => {
    const m = new Map<string, number | null>();
    for (const row of hubTripSubcontracts) {
      const tid = String(row.trip_id ?? "").trim();
      if (!tid) continue;
      m.set(tid, Number(row.rate ?? 0));
    }
    return m;
  }, [hubTripSubcontracts]);
  const { record: tripFinanceAdjRecord, isLoading: tripFinanceAdjLoading } =
    useTripFinanceAdjustmentsMap(
      orgId,
      tripsLoading ? [] : hubAssignmentAuditTripIds(tripIds),
    );
  /** Until loaded, hub uses raw trip rates (same as trip list before this feature). */
  const tripFinanceAdjForHub = tripFinanceAdjLoading
    ? undefined
    : tripFinanceAdjRecord;
  const { refetch: refetchAssignment } = useAssignmentAuditQuery(
    tripsLoading ? [] : hubAssignmentAuditTripIds(tripIds),
  );

  useRealtimeTripsInvalidation(orgId);
  useRealtimeTransactionsInvalidation(orgId);

  const onRefresh = useCallback(async () => {
    if (!orgId) {
      setRefreshing(false);
      return;
    }
    setRefreshing(true);
    const REFRESH_TIMEOUT_MS = 20_000;
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("refresh timeout")), REFRESH_TIMEOUT_MS),
    );
    try {
      await Promise.race([
        Promise.all([
          refetchTrips(),
          refetchTransactions(),
          refetchAssignment(),
          queryClient.invalidateQueries({
            queryKey: ["q", "trips", "doc-trip-ids"],
          }),
          queryClient.invalidateQueries({
            queryKey: [...queryKeys.tripFinanceAdjustmentsRoot],
          }),
        ]),
        timeoutPromise,
      ]);
    } catch {
      // timeout or network error — silently complete; stale data remains visible
    } finally {
      setRefreshing(false);
    }
  }, [
    refetchTrips,
    refetchTransactions,
    refetchAssignment,
    queryClient,
    orgId,
  ]);

  useFocusEffect(
    useCallback(() => {
      const saved = getLastOpenedHubItem();
      if (saved?.id) {
        setLastOpenedTripId(saved.id);
        if (!indentDeepLink && saved.tripFilter) {
          setTripFilter(saved.tripFilter);
        }
        const restoredTab = asRestoredMetricTab(saved.metricTab);
        if (!indentDeepLink && restoredTab) {
          setActiveMetricTab(restoredTab);
        }
        if (saved.historyMetricTab) {
          setActiveHistoryMetricTab(
            saved.historyMetricTab as HistoryTripMetricId,
          );
        }
      }
      // Light stale refresh on focus — trips only; full ledger refresh stays on pull-to-refresh.
      if (Date.now() - lastFocusRefreshRef.current > 5 * 60_000) {
        lastFocusRefreshRef.current = Date.now();
        scheduleIdleWork(() => {
          void refetchTrips();
        });
      }
    }, [refetchTrips, indentDeepLink]),
  );

  const loading = tripsLoading && trips.length === 0 && !(cachedTripsForOrg?.length);
  const tripsBootFailed =
    tripsLoadFailed && trips.length === 0 && !(cachedTripsForOrg?.length);
  const orgBootSplash =
    canAccess && !orgId && !(cachedTripsForOrg?.length) && orgBootPending;
  const bootSplashActive = orgBootSplash || loading || tripsBootFailed;
  const bootStuck = useLoadingStuck(bootSplashActive);

  /** Display date for card: pickup > started > created. */
  const getTripCardDate = (t: TripRow) => {
    const raw =
      t.pickup_date ?? t.started_at ?? t.completed_at ?? t.created_at ?? "";
    return raw ? formatLedgerDate(raw) : "—";
  };

  const indentById = useMemo(() => {
    const byId = new Map<string, IndentRow>();
    for (const indent of indentStageIndents) byId.set(indent.id, indent);
    return byId;
  }, [indentStageIndents]);

  const handleOpenHubTableRow = useCallback(
    (trip: TripRow) => {
      const indent = indentById.get(trip.id);
      if (indent) {
        handleOpenUnallocatedIndent(indent);
        return;
      }
      handleOpenTripDetails(trip);
    },
    [indentById, handleOpenUnallocatedIndent, handleOpenTripDetails],
  );

  const getStageLabelForTrip = useCallback(
    (t: TripRow) => {
      const indent = indentById.get(t.id);
      if (indent) {
        const tag = indentHubStatusTag(
          indent.status,
          indentOfferCounts[indent.id] ?? 0,
        );
        if (tag === "pending") return "PENDING";
        if (tag === "bids") return "BIDS RECEIVED";
        if (tag === "awarded") return "AWARDED";
        return "FAILED";
      }
      if (t.driver_id == null) return tr("unassigned").toUpperCase();
      const s = (t.status ?? "").trim().toLowerCase();
      if (s === "in_progress")
        return t.started_at ? "IN TRANSIT" : "LOADING";
      if (s === "in_transit" || s === "transit" || s === "dispatched")
        return "IN TRANSIT";
      if (s === "picked_up" || s === "pickup") return "LOADING";
      if (s === "at_drop" || s === "unloading" || s === "arrived" || s === "at_destination")
        return "UNLOADING";
      if (s === "assigned") return "ASSIGNED";
      if (s === "completed" || s === "delivered" || s === "done") return "COMPLETED";
      if (s === "cancelled") return "CANCELLED";
      return s.replace(/_/g, " ").toUpperCase() || "ACTIVE";
    },
    [tr, indentById, indentOfferCounts],
  );

  /** Show completed/done trips only on the History tab. */
  const showCompletedList = tripFilter === "History";

  /**
   * `baseTripsByStatus` is the loaded list only, so per-trip lookups keyed on it
   * stay put while typing; `tripsByStatus` adds the older search hits.
   */
  const { baseTripsByStatus, tripsByStatus, historyTripsForDelivered } = useMemo(() => {
    // History: completed / delivered / done. Active: open (not cancelled).
    const source = useRangeList ? hubDateRangeTrips : trips;
    const all = hubExtraTrips.length > 0 ? source.concat(hubExtraTrips) : source;
    const history = filterHubTripsForHistoryList(all);
    const base = showCompletedList
      ? filterHubTripsForHistoryList(source)
      : filterHubTripsForActiveList(source);
    return {
      baseTripsByStatus: base,
      tripsByStatus: showCompletedList ? history : filterHubTripsForActiveList(all),
      // Active Delivered tile lists the History set (its count is the History badge).
      historyTripsForDelivered: history,
    };
  }, [showCompletedList, trips, hubExtraTrips, useRangeList, hubDateRangeTrips]);

  /** Pill context only (linked org + tracking_only); independent of async supplier name fallback. */
  const tripKindPillMetaByTripId = useMemo(
    () =>
      buildTripHubPartyMetaByTripId(
        trips,
        clients,
        suppliers,
        drivers,
        transactions,
        {},
        {
          viewerOrgId: orgId,
          subcontracts: hubTripSubcontracts,
          driverImageById,
        },
      ),
    [
      trips,
      clients,
      suppliers,
      drivers,
      transactions,
      orgId,
      hubTripSubcontracts,
      driverImageById,
    ],
  );

  const baseTripIdsKey = useMemo(
    () => tripIdsHashKey(baseTripsByStatus.map((t) => t.id)),
    [baseTripsByStatus],
  );
  const olderHitIdsKey = useMemo(
    () => tripIdsHashKey(hubExtraTrips.map((t) => t.id)),
    [hubExtraTrips],
  );
  const hasOlderHits = hubExtraTrips.length > 0;
  const hubDocFlagsLoadedForView = shouldFetchHubDigitalPodFlags(showCompletedList, {
    compactViewport: isMobileViewport,
  });
  const hubSearchActive = searchQuery.trim().length >= 2;
  /**
   * Search may need LR / e-way numbers for trips not on this page. Cards load
   * documents only for the visible page (see visibleHubTripIdsForDocs below).
   */
  const { data: searchDocFlags } = useQuery({
    queryKey: queryKeys.trips.hubDocNumbers(orgId ?? "", baseTripIdsKey),
    enabled: !!orgId && hubSearchActive && baseTripsByStatus.length > 0,
    staleTime: 60_000,
    queryFn: () => loadHubPodReceiptFlags(baseTripsByStatus.map((t) => t.id)),
  });
  const { data: olderHitDocFlags } = useQuery({
    queryKey: queryKeys.trips.hubDocNumbers(orgId ?? "", olderHitIdsKey),
    enabled: !!orgId && hasOlderHits,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
    queryFn: () => loadHubPodReceiptFlags(hubExtraTrips.map((t) => t.id)),
  });
  const olderHitFlags = hasOlderHits ? olderHitDocFlags : undefined;
  const searchNumberFlags = useMemo(
    () => mergeHubPodFlags(searchDocFlags, olderHitFlags),
    [olderHitFlags, searchDocFlags],
  );
  const searchLrNumbersByTripId = useMemo(
    () => searchNumberFlags?.lrNumbersByTripId ?? ({} as Record<string, string>),
    [searchNumberFlags],
  );
  const searchEwayNumbersByTripId = useMemo(
    () => searchNumberFlags?.ewayNumbersByTripId ?? ({} as Record<string, string>),
    [searchNumberFlags],
  );

  /**
   * Driver numbers for search. The drivers list only has this org's active fleet,
   * so vendor / former drivers have no number there; get_trip_driver_phones covers
   * every trip in the list. Fetched only while the search has 4+ digits.
   */
  const hubSearchPhoneActive = hubSearchPhoneDigits(searchQuery.trim()).length >= 4;
  const { data: baseDriverPhoneByTripId = EMPTY_PHONE_BY_TRIP_ID } = useQuery({
    queryKey: queryKeys.trips.hubDriverPhones(orgId ?? "", baseTripIdsKey),
    enabled: !!orgId && hubSearchPhoneActive && baseTripsByStatus.length > 0,
    staleTime: 5 * 60_000,
    queryFn: () => loadDriverPhonesByTripId(baseTripsByStatus),
  });
  const { data: olderHitDriverPhoneByTripId = EMPTY_PHONE_BY_TRIP_ID } = useQuery({
    queryKey: queryKeys.trips.hubDriverPhones(orgId ?? "", olderHitIdsKey),
    enabled: !!orgId && hubSearchPhoneActive && hasOlderHits,
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
    queryFn: () => loadDriverPhonesByTripId(hubExtraTrips),
  });
  const searchDriverPhoneByTripId = useMemo(
    () =>
      hasOlderHits
        ? { ...baseDriverPhoneByTripId, ...olderHitDriverPhoneByTripId }
        : baseDriverPhoneByTripId,
    [hasOlderHits, baseDriverPhoneByTripId, olderHitDriverPhoneByTripId],
  );
  const hardPodTripIds = useMemo(() => {
    const set = new Set<string>();
    for (const row of tripsByStatus) {
      if (!tripPodIsReceived(row) || !row.id) continue;
      set.add(row.id.trim().toLowerCase());
    }
    return set;
  }, [tripsByStatus]);

  const hubScopedTrips = useMemo(() => {
    let list = hubTrips;
    if (supplyFilter !== "all") {
      list = list.filter((t) =>
        tripMatchesSupplyFilter(
          t,
          supplyFilter,
          tripKindPillMetaByTripId.get(t.id),
          currentOrganization?.id,
        ),
      );
    }
    if (attributionFilter !== "all") {
      list = list.filter((t) => tripMatchesAttributionFilter(t, attributionFilter));
    }
    if (dateRangeFilter !== "all") {
      list = list.filter((t) =>
        tripDayMatchesHubDateFilter(t, dateRangeFilter, {
          customFrom: customDateFrom,
          customTo: customDateTo,
        }),
      );
    }
    return list;
  }, [
    hubTrips,
    supplyFilter,
    attributionFilter,
    tripKindPillMetaByTripId,
    currentOrganization?.id,
    dateRangeFilter,
    customDateFrom,
    customDateTo,
  ]);

  const attributedTripCount = useMemo(
    () => trips.filter((t) => isAttributedFleetTrip(t)).length,
    [trips],
  );

  // Rail tiles = open trips in hubScopedTrips (same rows as the Active tab badge).
  // Completed trips are History only; the indent tile counts indents, never trips.
  const openHubRailCounts = useMemo(
    () => buildActiveHubRailCounts(hubScopedTrips, EMPTY_HUB_DOC_TRIP_IDS),
    [hubScopedTrips],
  );

  const metricCounts = useMemo(
    () => ({ ...openHubRailCounts, indent: liveIndentCount }),
    [liveIndentCount, openHubRailCounts],
  );

  const transactionsByTripId = useMemo(() => {
    const map = new Map<string, LedgerRow[]>();
    for (const tx of transactions) {
      if (!tx.trip_id) continue;
      const list = map.get(tx.trip_id);
      if (list) list.push(tx);
      else map.set(tx.trip_id, [tx]);
    }
    return map;
  }, [transactions]);

  // Apply trip-type and text filters for both tabs. Metric buckets are applied in a second pass.
  const baseFilteredTrips = useMemo(() => {
    let list = tripsByStatus;
    if (!showCompletedList) {
      if (activeMetricTab === "all") {
        // Keep all active trips visible across Intake + In motion.
        list = tripsByStatus;
      } else if (activeMetricTab === "indent") {
        list = [];
      } else if (activeMetricTab === "delivered_docs_pending") {
        list = historyTripsForDelivered;
      } else {
        list = list.filter(
          (t) => hubActiveRailMetric(t, EMPTY_HUB_DOC_TRIP_IDS) === activeMetricTab,
        );
      }
    }
    if (supplyFilter !== "all") {
      list = list.filter((t) =>
        tripMatchesSupplyFilter(
          t,
          supplyFilter,
          tripKindPillMetaByTripId.get(t.id),
          currentOrganization?.id,
        ),
      );
    }

    if (attributionFilter !== "all") {
      list = list.filter((t) => tripMatchesAttributionFilter(t, attributionFilter));
    }

    if (paymentFilter !== "all") {
      list = list.filter((t) => {
        const status = (t.payment_status || "pending").toLowerCase();
        if (paymentFilter === "paid")
          return status === "paid" || status === "fully_paid";
        return status === paymentFilter;
      });
    }

    if (loadTypeFilter !== "all") {
      list = list.filter(
        (t) =>
          (t.load_type || "").toLowerCase() === loadTypeFilter.toLowerCase(),
      );
    }

    // Active search is the primary constraint: keep Trip ID / text hits even when
    // they fall outside the hub date pill, so stage auto-nav is not an empty list.
    const q = searchQuery.trim();
    if (dateRangeFilter !== "all" && q.length < 2) {
      list = list.filter((t) =>
        tripDayMatchesHubDateFilter(t, dateRangeFilter, {
          customFrom: customDateFrom,
          customTo: customDateTo,
        }),
      );
    }

    if (q) {
      const qDigits = hubSearchPhoneDigits(q);
      list = list.filter((t) => {
        // Server search already matched it (LR, driver phone, client master, …).
        if (hubSearchHitIds.has(t.id)) return true;
        if (
          tripMatchesHubSearch(t, q, {
            organizationId: orgId,
            clientName:
              shipperNameByTripId[t.id] ??
              (t.organization_id !== orgId ? "" : t.client_name ?? ""),
            supplierName: t.supplier_name,
            lrLabel:
              hubLrPreviewByTripId[t.id.trim().toLowerCase()] ||
              searchLrNumbersByTripId[t.id.trim().toLowerCase()] ||
              "",
            elrLabel: "",
          })
        ) {
          return true;
        }
        const displayName = (
          shipperNameByTripId[t.id] ??
          (t.organization_id !== orgId ? "" : t.client_name ?? "")
        ).toLowerCase();
        const clientMaster = (
          t.organization_id === orgId && t.client_id
            ? clientById.get(t.client_id)?.name ?? ""
            : ""
        ).toLowerCase();
        const driverPhone = (
          searchDriverPhoneByTripId[t.id] ??
          driverPhoneById.get((t.driver_id ?? "").trim().toLowerCase()) ??
          ""
        ).replace(/\D/g, "");
        const pillMeta = tripKindPillMetaByTripId.get(t.id);
        const supplierShown = (pillMeta?.displaySupplierName ?? "").toLowerCase();
        const driverShown = (pillMeta?.displayDriverName ?? "").toLowerCase();
        const refs = [
          t.booking_ref,
          t.trip_code,
          t.trip_operational_code,
          t.driver_display_trip_id,
          t.indent_reference_code,
          t.source_indent_code,
          t.indent_number,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        const pickup = (t.pickup_area ?? "").toLowerCase();
        const drop = (t.drop_location ?? "").toLowerCase();
        const tripRef = `${t.trip_number ?? ""} ${t.display_trip_id ?? ""}`
          .trim()
          .toLowerCase();
        // Allocated indents have no card of their own, so their codes match the trip.
        const indentRef = t.indent_id ? indentCodesByIndentId.get(t.indent_id) ?? "" : "";
        const lrNos = (
          searchLrNumbersByTripId[t.id.trim().toLowerCase()] ?? ""
        ).toLowerCase();
        const qCompact = q.replace(/\s+/g, "");
        const ewayNos = (
          searchEwayNumbersByTripId[t.id.trim().toLowerCase()] ?? ""
        ).toLowerCase();
        const vehicleNo = (t.vehicle_display_number ?? "")
          .toLowerCase()
          .replace(/\s+/g, "");
        const driver = (t.driver_display_name ?? "").toLowerCase();
        const supplier = (t.supplier_name ?? "").toLowerCase();
        return (
          displayName.includes(q) ||
          pickup.includes(q) ||
          drop.includes(q) ||
          tripRef.includes(q) ||
          indentRef.includes(q) ||
          lrNos.includes(q) ||
          (qCompact.length > 0 && vehicleNo.includes(qCompact)) ||
          driver.includes(q) ||
          supplier.includes(q) ||
          clientMaster.includes(q) ||
          supplierShown.includes(q) ||
          driverShown.includes(q) ||
          refs.includes(q) ||
          (qCompact.length > 0 && ewayNos.includes(qCompact)) ||
          (qDigits.length >= 4 && driverPhone.includes(qDigits))
        );
      });
    }

    let sorted = [...list];
    sorted.sort((a, b) => {
      switch (sortBy) {
        case "date_desc":
          return compareTripsByScheduleDesc(a, b);
        case "date_asc":
          return compareTripsByScheduleAsc(a, b);
        case "revenue_desc":
        case "revenue_asc": {
          const orgSort = currentOrganization?.id ?? null;
          const adjA = tripFinanceAdjForHubLookup(tripFinanceAdjForHub, a.id);
          const adjB = tripFinanceAdjForHubLookup(tripFinanceAdjForHub, b.id);
          const va = tripHubRevenue(a, orgSort, adjA);
          const vb = tripHubRevenue(b, orgSort, adjB);
          return sortBy === "revenue_desc" ? vb - va : va - vb;
        }
        case "client_asc":
          return (a.client_name || "").localeCompare(b.client_name || "");
        case "client_desc":
          return (b.client_name || "").localeCompare(a.client_name || "");
        default:
          return 0;
      }
    });

    return sorted;
  }, [
    tripsByStatus,
    historyTripsForDelivered,
    activeMetricTab,
    supplyFilter,
    attributionFilter,
    tripKindPillMetaByTripId,
    searchQuery,
    indentCodesByIndentId,
    hubSearchHitIds,
    clientById,
    driverPhoneById,
    searchDriverPhoneByTripId,
    searchLrNumbersByTripId,
    searchEwayNumbersByTripId,
    shipperNameByTripId,
    hubLrPreviewByTripId,
    showCompletedList,
    sortBy,
    paymentFilter,
    loadTypeFilter,
    dateRangeFilter,
    customDateFrom,
    customDateTo,
    currentOrganization?.id,
    tripFinanceAdjForHub,
  ]);

  const filtered = useMemo(() => {
    if (!showCompletedList || activeHistoryMetricTab == null) {
      return baseFilteredTrips;
    }
    return baseFilteredTrips.filter((trip) => {
      const adj = tripFinanceAdjForHubLookup(tripFinanceAdjForHub, trip.id);
      const { receivableDue, payableDue } = historyTripDueState(
        trip,
        transactionsByTripId.get(trip.id) ?? [],
        currentOrganization?.id ?? null,
        adj,
        hubSubcontractRateByTripId.get(trip.id) ?? null,
      );
      switch (activeHistoryMetricTab) {
        case "due_to_get":
          return receivableDue > 0;
        case "no_due_to_get":
          return receivableDue <= 0;
        case "due_to_pay":
          return payableDue > 0;
        case "no_due_to_pay":
          return payableDue <= 0;
        default:
          return true;
      }
    });
  }, [
    activeHistoryMetricTab,
    baseFilteredTrips,
    currentOrganization?.id,
    showCompletedList,
    transactionsByTripId,
    tripFinanceAdjForHub,
    hubSubcontractRateByTripId,
  ]);

  const hubTableTrips = useMemo(() => {
    if (tripFilter === "Active" && activeMetricTab === "indent") {
      return indentStageIndents.map(indentRowToHubTrip);
    }
    return filtered;
  }, [tripFilter, activeMetricTab, indentStageIndents, filtered]);

  const commercePlanIds = useMemo(
    () => extractCommercePlanIds(filtered),
    [filtered],
  );
  const { data: planClientsById } = useExecutionPlanClients(orgId, commercePlanIds);
  const tripCardClientName = useCallback(
    (t: TripRow) => {
      if (shipperNameByTripId[t.id]) return shipperNameByTripId[t.id];
      if (t.organization_id !== orgId) return "—";
      const planId = (t.execution_plan_id ?? "").trim();
      return resolveMergedOrderCardTitle(
        t.client_name,
        planId ? (planClientsById?.[planId] ?? []) : [],
        clientById,
      );
    },
    [shipperNameByTripId, orgId, planClientsById, clientById],
  );

  const hasNonMetricTripFilters =
    supplyFilter !== "all" ||
    attributionFilter !== "all" ||
    paymentFilter !== "all" ||
    loadTypeFilter !== "all" ||
    dateRangeFilter !== "all" ||
    searchQuery.trim().length > 0;

  const tripsEmptyPromoVariant = useMemo(
    () =>
      resolveTripsPromoVariant({
        showCompletedList,
        tripsInTabCount: tripsByStatus.length,
        allTripsCount: trips.length,
        activeMetricTab,
        activeHistoryMetricTab,
        hasNonMetricFilters: hasNonMetricTripFilters,
        metricCounts,
      }),
    [
      showCompletedList,
      tripsByStatus.length,
      trips.length,
      activeMetricTab,
      activeHistoryMetricTab,
      hasNonMetricTripFilters,
      metricCounts,
    ],
  );

  const emptyBannerStageStyle = useMemo(
    () => [
      styles.emptyBannerStage,
      Platform.OS === "web" &&
        !isMobileViewport && {
          minHeight: Math.max(320, Math.round(height * 0.34)),
        },
    ],
    [height, isMobileViewport],
  );

  const tripsTableResetKey = useMemo(
    () =>
      [
        effectiveListLayout,
        searchQuery,
        tripFilter,
        activeMetricTab,
        activeHistoryMetricTab ?? "",
        supplyFilter,
        attributionFilter,
        sortBy,
        paymentFilter,
        loadTypeFilter,
        dateRangeFilter,
        customDateFrom ?? "",
        customDateTo ?? "",
        indentStatusTag ?? "",
        indentFailedReason ?? "",
      ].join("|"),
    [
      effectiveListLayout,
      searchQuery,
      tripFilter,
      activeMetricTab,
      activeHistoryMetricTab,
      supplyFilter,
      attributionFilter,
      sortBy,
      paymentFilter,
      loadTypeFilter,
      dateRangeFilter,
      customDateFrom,
      customDateTo,
      indentStatusTag,
      indentFailedReason,
    ],
  );

  const [mobileVisibleCount, setMobileVisibleCount] = useState(MOBILE_HUB_INITIAL_BATCH);
  const [tripsTablePageSize, setTripsTablePageSize] =
    useState<HubGridPageSize>(HUB_GRID_DEFAULT_PAGE_SIZE);
  const [tripsTablePage, setTripsTablePage] = useState(0);
  const [hubToolbarMatchCount, setHubToolbarMatchCount] = useState<
    number | null
  >(null);
  const [supplierNameFallbackById, setSupplierNameFallbackById] = useState<
    Record<string, string>
  >({});

  // Indent cards list only on the Active Indent tile — never in trip lists or History.
  const hubShowsIndentList = tripFilter === "Active" && activeMetricTab === "indent";
  const hubTripMatchCount = hubShowsIndentList
    ? 0
    : (hubToolbarMatchCount ?? filtered.length);
  const hubIndentMatchCount = hubShowsIndentList ? indentStageIndents.length : 0;
  const hubFocusItemId =
    tripSearchHighlightId ?? indentSearchHighlightId ?? lastOpenedTripId;
  const lastOpenedHubIndex = useMemo(
    () =>
      hubItemListIndex({
        id: hubFocusItemId,
        indentIds: indentStageIndents.map((indent) => indent.id),
        tripIds: filtered.map((trip) => trip.id),
        includeIndents: hubShowsIndentList,
        includeTrips: !hubShowsIndentList,
      }),
    [
      hubFocusItemId,
      indentStageIndents,
      filtered,
      hubShowsIndentList,
    ],
  );
  const tripsHubPaginationTotal = hubIndentMatchCount + hubTripMatchCount;

  const tripsTableTotalPages = Math.max(
    1,
    Math.ceil(tripsHubPaginationTotal / tripsTablePageSize),
  );
  const tripsTablePageSafe = Math.min(
    tripsTablePage,
    Math.max(0, tripsTableTotalPages - 1),
  );
  const hubListPageSlice = sliceHubListPage({
    indentCount: hubIndentMatchCount,
    tripCount: hubTripMatchCount,
    page: tripsTablePageSafe,
    pageSize: tripsTablePageSize,
  });
  const paginatedHubIndents =
    Platform.OS === "web" && !isMobileViewport
      ? indentStageIndents.slice(
          hubListPageSlice.indentOffset,
          hubListPageSlice.indentOffset + hubListPageSlice.indentLimit,
        )
      : indentStageIndents;

  const visibleHubTripIdsForDocs = useMemo(() => {
    const ids = filtered.map((trip) => trip.id);
    if (Platform.OS === "web" && !isMobileViewport) {
      return visibleHubTripIds(ids, hubListPageSlice);
    }
    return visibleHubTripIds(ids, { page: 0, pageSize: mobileVisibleCount });
  }, [filtered, hubListPageSlice, isMobileViewport, mobileVisibleCount]);
  const visibleHubTripIdsKey = useMemo(
    () => tripIdsHashKey(visibleHubTripIdsForDocs),
    [visibleHubTripIdsForDocs],
  );
  const { data: pagePodFlagsRaw } = useQuery({
    queryKey: [
      "q",
      "trips",
      "doc-trip-ids",
      "v7-pod-eway-page",
      orgId ?? "",
      visibleHubTripIdsKey,
    ],
    enabled:
      !!orgId &&
      hubDocFlagsLoadedForView &&
      visibleHubTripIdsForDocs.length > 0,
    staleTime: 60_000,
    queryFn: () => loadHubPodReceiptFlags(visibleHubTripIdsForDocs),
  });
  const hubPodFlags = useMemo(
    () => mergeHubPodFlags(pagePodFlagsRaw, olderHitFlags),
    [olderHitFlags, pagePodFlagsRaw],
  );
  const ewayExpiryByTripId = useMemo(() => {
    const map = hubPodFlags?.ewayExpiryByTripId;
    if (!map || typeof map !== "object") return {} as Record<string, string>;
    return map;
  }, [hubPodFlags]);
  const cardNumberFlags = useMemo(
    () => mergeHubPodFlags(hubPodFlags, searchNumberFlags),
    [hubPodFlags, searchNumberFlags],
  );
  const lrNumbersByTripId = useMemo(
    () => cardNumberFlags?.lrNumbersByTripId ?? ({} as Record<string, string>),
    [cardNumberFlags],
  );
  const softPodCheckedTripIds = useMemo(
    () =>
      hubSoftPodCheckedTripIds([
        {
          loaded: hubDocFlagsLoadedForView && pagePodFlagsRaw != null,
          tripIds: visibleHubTripIdsForDocs,
        },
        {
          loaded: hasOlderHits && olderHitDocFlags != null,
          tripIds: hubExtraTrips.map((t) => t.id),
        },
        {
          loaded: hubSearchActive && searchDocFlags != null,
          tripIds: baseTripsByStatus.map((t) => t.id),
        },
      ]),
    [
      baseTripsByStatus,
      hasOlderHits,
      hubDocFlagsLoadedForView,
      hubExtraTrips,
      hubSearchActive,
      olderHitDocFlags,
      pagePodFlagsRaw,
      searchDocFlags,
      visibleHubTripIdsForDocs,
    ],
  );
  const tripIdsWithDocuments = useMemo(() => {
    const soft = cardNumberFlags?.softTripIds;
    if (Array.isArray(soft)) {
      return new Set(
        soft
          .filter((value): value is string => typeof value === "string")
          .map((value) => value.trim().toLowerCase())
          .filter(Boolean),
      );
    }
    return new Set<string>();
  }, [cardNumberFlags]);
  const { data: hubDocLabels } = useQuery({
    queryKey: queryKeys.trips.hubLrLabels(orgId ?? "", visibleHubTripIdsKey),
    enabled: Boolean(orgId && visibleHubTripIdsKey),
    staleTime: 60_000,
    queryFn: () => loadHubTripDocumentLabelsByTripIds(visibleHubTripIdsForDocs),
  });
  const hubLrLabels = hubDocLabels?.lrLabels ?? {};
  const hubElrLabels = hubDocLabels?.elrLabels ?? {};
  const hubLrLabelFor = useCallback(
    (tripId: string) => {
      const id = tripId.trim().toLowerCase();
      return (
        hubLrPreviewByTripId[id] ||
        hubLrLabels[id] ||
        lrNumbersByTripId[id] ||
        ""
      );
    },
    [hubLrLabels, hubLrPreviewByTripId, lrNumbersByTripId],
  );
  const hubElrLabelFor = useCallback(
    (tripId: string) => hubElrLabels[tripId.trim().toLowerCase()] || "",
    [hubElrLabels],
  );
  const canEditHubLrFor = useCallback(
    (trip: TripRow | undefined) =>
      canEditHubLr &&
      !(
        isGroundOpsMember &&
        trip &&
        hubLrLabelFor(trip.id) &&
        groundOpsDocumentLockReason({ trip }) != null
      ),
    [canEditHubLr, isGroundOpsMember, hubLrLabelFor],
  );
  const openHubLrEdit = useCallback(
    (tripId: string) => {
      const trip = tripsByStatus.find((row) => row.id === tripId);
      if (!canEditHubLrFor(trip)) return;
      setHubLrEdit({
        tripId,
        label: hubLrLabelFor(tripId),
        organizationId: trip?.organization_id ?? orgId ?? null,
      });
    },
    [canEditHubLrFor, hubLrLabelFor, orgId, tripsByStatus],
  );

  useEffect(() => {
    setHubToolbarMatchCount(null);
  }, [tripsTableResetKey]);

  useEffect(() => {
    setMobileVisibleCount(MOBILE_HUB_INITIAL_BATCH);
  }, [tripsTableResetKey]);

  useEffect(() => {
    const maxPage = Math.max(
      0,
      Math.ceil(tripsHubPaginationTotal / tripsTablePageSize) - 1,
    );
    setTripsTablePage((p) => Math.min(p, maxPage));
  }, [tripsHubPaginationTotal, tripsTablePageSize]);

  useEffect(() => {
    if (lastOpenedHubIndex >= 0) {
      setTripsTablePage(hubPageForIndex(lastOpenedHubIndex, tripsTablePageSize));
      return;
    }
    setTripsTablePage(0);
  }, [tripsTableResetKey, tripsTablePageSize, lastOpenedHubIndex]);

  useEffect(() => {
    if (lastOpenedHubIndex < 0) return;
    setMobileVisibleCount((current) =>
      hubVisibleCountForIndex(lastOpenedHubIndex, current),
    );
  }, [lastOpenedHubIndex, tripsTableResetKey]);

  // One-shot: look for the last-opened trip once, then leave tab choice to the user.
  // Without this, tapping Active snaps straight back to History when that trip is completed.
  useEffect(() => {
    if (!lastOpenedTripId || indentDeepLink) return;
    if (lastOpenedTabSearchDoneRef.current === lastOpenedTripId) return;
    if (lastOpenedHubIndex >= 0) {
      lastOpenedTabSearchDoneRef.current = lastOpenedTripId;
      return;
    }
    if (tripFilter === "Active" && activeMetricTab !== "all") {
      setActiveMetricTab("all");
      return;
    }
    lastOpenedTabSearchDoneRef.current = lastOpenedTripId;
    if (tripFilter === "Active" && activeMetricTab === "all") {
      setTripFilter("History");
    }
  }, [
    lastOpenedTripId,
    lastOpenedHubIndex,
    tripFilter,
    activeMetricTab,
    indentDeepLink,
  ]);

  useEffect(() => {
    if (!hubFocusItemId || lastOpenedHubIndex < 0) return;
    const timer = setTimeout(() => {
      if (Platform.OS !== "web") return;
      const doc = (globalThis as { document?: Document }).document;
      doc
        ?.getElementById(`hub-item-${hubFocusItemId}`)
        ?.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 280);
    return () => clearTimeout(timer);
  }, [
    hubFocusItemId,
    lastOpenedHubIndex,
    tripsTablePageSafe,
    isMobileViewport,
  ]);

  const handleTripsMainScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const p = tabBarScrollProps as {
        onScroll?: (ev?: NativeSyntheticEvent<NativeScrollEvent>) => void;
      };
      p.onScroll?.(e);
      if (!isMobileViewport || Platform.OS === "web") return;
      const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
      const nearBottom =
        contentOffset.y + layoutMeasurement.height >= contentSize.height - 360;
      if (!nearBottom) return;
      setMobileVisibleCount((prev) => {
        const total = tripsHubPaginationTotal;
        if (prev >= total) return prev;
        return Math.min(total, prev + MOBILE_HUB_BATCH_STEP);
      });
    },
    [tabBarScrollProps, isMobileViewport, tripsHubPaginationTotal],
  );

  const loadTypeOptions = useMemo(() => {
    const types = new Set<string>();
    trips.forEach((t) => {
      if (t.load_type) types.add(t.load_type.trim());
    });
    return Array.from(types).sort();
  }, [trips]);

  /** Stable fingerprint of supplier ids needing name fallback — avoids effect churn when trip array identity changes without data changes */
  const supplierNameFallbackEffectKey = useMemo(() => {
    const knownSupplierIds = new Set(
      suppliers.map((s) => String(s.id).trim().toLowerCase()).filter(Boolean),
    );
    const missingSupplierIds = [
      ...new Set(
        trips
          .map((trip) => String(trip.supplier_id ?? "").trim().toLowerCase())
          .filter((id) => id.length > 0 && !knownSupplierIds.has(id)),
      ),
    ].sort();
    return missingSupplierIds.join("|");
  }, [trips, suppliers]);

  useEffect(() => {
    let cancelled = false;

    if (!supplierNameFallbackEffectKey) {
      setSupplierNameFallbackById((prev) =>
        Object.keys(prev).length === 0 ? prev : {},
      );
      return undefined;
    }

    const missingSupplierIds = supplierNameFallbackEffectKey.split("|").filter(
      Boolean,
    );

    void (async () => {
      const { data, error } = await supabase()
        .from("suppliers")
        .select("id, name, company_name, contact_person")
        .in("id", missingSupplierIds);
      if (cancelled) return;
      if (error) {
        setSupplierNameFallbackById((prev) =>
          Object.keys(prev).length === 0 ? prev : {},
        );
        return;
      }
      const next: Record<string, string> = {};
      for (const row of
        (data ?? []) as Array<{
          id: string;
          name?: string | null;
          company_name?: string | null;
          contact_person?: string | null;
        }>) {
        const key = String(row.id ?? "").trim().toLowerCase();
        if (!key) continue;
        const label =
          String(row.name ?? "").trim() ||
          String(row.company_name ?? "").trim() ||
          String(row.contact_person ?? "").trim();
        if (label) next[key] = label;
      }
      setSupplierNameFallbackById((prev) =>
        supplierNameFallbackMapsEqual(prev, next) ? prev : next,
      );
    })();

    return () => {
      cancelled = true;
    };
  }, [supplierNameFallbackEffectKey]);

  const tripHubPartyMetaByTripId = useMemo(
    () =>
      buildTripHubPartyMetaByTripId(
        trips,
        clients,
        suppliers,
        drivers,
        transactions,
        supplierNameFallbackById,
        {
          viewerOrgId: orgId,
          subcontracts: hubTripSubcontracts,
          driverImageById,
        },
      ),
    [
      trips,
      clients,
      suppliers,
      drivers,
      transactions,
      supplierNameFallbackById,
      orgId,
      hubTripSubcontracts,
      driverImageById,
    ],
  );

  /**
   * Trip Report Excel — same date bounds as the hub pills (All time →
   * HUB_ALL_TIME_BOUNDS) and Asset/Aggregate scope.
   * - Sales → Sales indent report (Indent ID + costs when finance).
   * - TripOps-only → classic ops sheet (TRIP ID / LR NO / stage times).
   */
  const handleDownloadTripReport = useCallback(async () => {
    if (!orgId || tripReportDownloading) return;
    setTripReportDownloading(true);
    try {
      const audience = resolveTripIndentReportAudience(memberDomains);
      const catalog = await loadTripIndentReportCatalog(
        orgId,
        hubTrips,
        allIndents,
        {
          dateBounds: hubDateBounds ?? HUB_ALL_TIME_BOUNDS,
          dateFilter: dateRangeFilter,
          customFrom: customDateFrom,
          customTo: customDateTo,
        },
      );
      if (catalog.error) {
        showAppAlert(
          "Export failed",
          catalog.error.message || "Could not load trips and indents for the report.",
        );
        return;
      }
      const scopedTrips = sourcingScope.filterTrips(catalog.trips);

      if (audience === "tripops") {
        const tripIds = scopedTrips.map((t) => t.id);
        const [statusResult, docFlags, driverPhoneByTripId] = await Promise.all([
          getTripStatusTimes(tripIds),
          loadHubPodReceiptFlags(tripIds),
          loadDriverPhonesByTripId(scopedTrips),
        ]);
        if (statusResult.error) {
          showAppAlert(
            "Export failed",
            statusResult.error.message || "Could not load stage times for the report.",
          );
          return;
        }
        const rows = buildTripOpsReportRows(scopedTrips, {
          statusTimesByTripId: statusResult.times,
          lrNumberByTripId: {
            ...lrNumbersByTripId,
            ...(docFlags.lrNumbersByTripId ?? {}),
          },
          driverPhoneByTripId,
          driverPhoneByDriverId: driverPhoneById,
          partyMetaByTripId: tripHubPartyMetaByTripId,
          clientNameForTrip: tripCardClientName,
          stageLabelForTrip: getStageLabelForTrip,
        });
        const notes: string[] = [...catalog.notes];
        await downloadTripOpsReportExcel(rows, {
          companyName: currentOrganization?.name ?? undefined,
          notes,
        });
        if (notes.length > 0) {
          showAppAlert("Trip Report downloaded with notes", notes.join("\n\n"));
        }
        return;
      }

      const scopedIndents = sourcingScope.filterIndents(catalog.indents);
      const driverPhoneByTripId = await loadDriverPhonesByTripId(scopedTrips);
      const { error, rows, warnings } = await buildTripIndentReport({
        orgId,
        trips: scopedTrips,
        indents: scopedIndents,
        partyMetaByTripId: tripHubPartyMetaByTripId,
        driverPhoneByTripId,
        stageLabelForTrip: getStageLabelForTrip,
      });
      if (error) {
        showAppAlert("Export failed", error.message || "Could not build the trip report.");
        return;
      }
      const notes: string[] = [...catalog.notes, ...warnings];
      await downloadTripIndentReportExcel(rows, {
        companyName: currentOrganization?.name ?? undefined,
        includeCosts: memberDomains.finance,
        notes,
      });
      if (notes.length > 0) {
        showAppAlert(
          "Trip Report downloaded with notes",
          notes.join("\n\n"),
        );
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      showAppAlert("Export failed", message || "Could not download the trip report.");
    } finally {
      setTripReportDownloading(false);
    }
  }, [
    orgId,
    tripReportDownloading,
    hubTrips,
    allIndents,
    hubDateBounds,
    dateRangeFilter,
    customDateFrom,
    customDateTo,
    sourcingScope,
    tripHubPartyMetaByTripId,
    getStageLabelForTrip,
    currentOrganization?.name,
    memberDomains,
    lrNumbersByTripId,
    driverPhoneById,
    tripCardClientName,
  ]);

  const { data: inTransitPingByTripId = {} } = useTripHubInTransitPings(
    orgId,
    showCompletedList ? [] : tripsByStatus,
  );

  const tripLedgerExportReport = useMemo(() => {
    const columns: Array<{
      key: string;
      label: string;
      align?: "left" | "right" | "center";
    }> = [
      { key: "rowType", label: "Type", align: "center" },
      { key: "trip", label: "Trip" },
      { key: "date", label: "Date", align: "center" },
      { key: "status", label: "Status", align: "center" },
      { key: "route", label: "Route" },
      { key: "party", label: "Party" },
      { key: "supplier", label: "Supplier" },
      { key: "salesValue", label: "Sales Value", align: "right" },
      { key: "supplierCost", label: "Supplier Cost", align: "right" },
      { key: "received", label: "Received", align: "right" },
      { key: "paid", label: "Paid", align: "right" },
      { key: "pendingRecv", label: "Pending Recv", align: "right" },
      { key: "pendingPay", label: "Pending Pay", align: "right" },
      { key: "txnMode", label: "Txn Mode", align: "center" },
      { key: "reference", label: "Reference" },
      { key: "txnIn", label: "Txn In", align: "right" },
      { key: "txnOut", label: "Txn Out", align: "right" },
    ];
    const rows: Array<Record<string, string | number | null | undefined>> = [];
    const orgId = currentOrganization?.id ?? null;
    for (const trip of filtered) {
      const tripRef = (
        trip.display_trip_id ??
        trip.trip_number ??
        trip.id
      ).trim();
      const route = `${(trip.pickup_area ?? "—").trim()} → ${(trip.drop_location ?? "—").trim()}`;
      const stage = getStageLabelForTrip(trip);
      const tripDateRaw =
        trip.pickup_date ??
        trip.started_at ??
        trip.completed_at ??
        trip.created_at ??
        "";
      const tripDate = tripDateRaw ? formatLedgerDate(String(tripDateRaw)) : "—";
      const tripDateIso = toReportIsoDate(tripDateRaw);
      const clientName = tripCardClientName(trip);
      const supplierName =
        (
          tripHubPartyMetaByTripId.get(trip.id)?.displaySupplierName ??
          trip.supplier_name ??
          "—"
        ).trim() || "—";
      const txns = [...(transactionsByTripId.get(trip.id) ?? [])].sort(
        (a, b) => {
          const da = String(a.transaction_date ?? a.created_at ?? "");
          const db = String(b.transaction_date ?? b.created_at ?? "");
          return db.localeCompare(da);
        },
      );
      const rowAdj = tripFinanceAdjForHubLookup(tripFinanceAdjForHub, trip.id);
      const settlement = computeTripSettlementDues({
        trip,
        viewerOrgId: orgId,
        ledgerEntries: txns,
        adjustments: rowAdj,
        subcontractRate: hubSubcontractRateByTripId.get(trip.id) ?? null,
      });
      const salesValue = settlement.receivableTarget;
      const supplierCost = settlement.payableTarget;
      const received = settlement.clientReceived;
      const paid = settlement.payablePaid;
      const pendingRecv = settlement.receivableDue;
      const pendingPay = settlement.payableDue;
      rows.push({
        rowType: "TRIP",
        trip: tripRef,
        date: tripDate,
        dateIso: tripDateIso,
        status: stage,
        route,
        party: clientName,
        supplier: supplierName,
        salesValue,
        supplierCost,
        received,
        paid,
        pendingRecv,
        pendingPay,
        txnMode: "",
        reference: "",
        txnIn: "",
        txnOut: "",
      });
      for (const txn of txns) {
        const txnRaw = txn.transaction_date || txn.created_at || "";
        rows.push({
          rowType: "TXN",
          trip: tripRef,
          date: formatLedgerDate(String(txnRaw)),
          dateIso: toReportIsoDate(txnRaw),
          status: (txn.reconciliation_status ?? "").toString().toUpperCase(),
          route: "",
          party:
            (txn.party_name ?? txn.driver_name ?? txn.contact_type ?? "—")
              .toString()
              .trim() || "—",
          supplier: "",
          salesValue: "",
          supplierCost: "",
          received: "",
          paid: "",
          pendingRecv: "",
          pendingPay: "",
          txnMode: (txn.payment_mode ?? "").toString().trim().toUpperCase(),
          reference: (txn.payment_reference ?? txn.trip_number ?? "")
            .toString()
            .trim(),
          txnIn: Number(txn.amount_in ?? 0),
          txnOut: Number(txn.amount_out ?? 0),
        });
      }
      rows.push({
        rowType: "BAL",
        trip: tripRef,
        date: tripDate,
        dateIso: tripDateIso,
        status: "STATEMENT",
        route: "",
        party: "Trip Balance",
        supplier: "",
        salesValue,
        supplierCost,
        received,
        paid,
        pendingRecv,
        pendingPay,
        txnMode: "",
        reference: "",
        txnIn: "",
        txnOut: "",
      });
    }
    return { columns, rows };
  }, [
    currentOrganization?.id,
    filtered,
    getStageLabelForTrip,
    shipperNameByTripId,
    transactionsByTripId,
    tripHubPartyMetaByTripId,
    tripFinanceAdjForHub,
    hubSubcontractRateByTripId,
  ]);

  /** Trip Ops members without Finance export the ops sheet instead of the ledger. */
  const useOpsTripExport = memberDomains.tripops && !memberDomains.finance;
  const opsExportTripIds = useMemo(
    () => (useOpsTripExport ? filtered.map((t) => t.id) : []),
    [useOpsTripExport, filtered],
  );
  const opsExportIdsKey = useMemo(() => tripIdsHashKey(opsExportTripIds), [opsExportTripIds]);
  const opsExportQueriesEnabled =
    !!orgId && tripLedgerExportOpen && opsExportTripIds.length > 0;
  const opsStatusTimesQuery = useQuery({
    queryKey: queryKeys.trips.opsExportStatusTimes(orgId ?? "", opsExportIdsKey),
    enabled: opsExportQueriesEnabled,
    queryFn: async () => {
      const { error, times } = await getTripStatusTimes(opsExportTripIds);
      if (error) throw error;
      return times;
    },
  });
  const opsStatusTimes = opsStatusTimesQuery.data ?? EMPTY_STATUS_TIMES;
  // LR numbers and driver numbers for exactly the exported trips: the hub only
  // loads LR numbers on some views, and the drivers list misses vendor drivers.
  const opsExportDocFlagsQuery = useQuery({
    queryKey: queryKeys.trips.hubDocNumbers(orgId ?? "", opsExportIdsKey),
    enabled: opsExportQueriesEnabled,
    staleTime: 60_000,
    queryFn: () => loadHubPodReceiptFlags(opsExportTripIds),
  });
  const opsExportDriverPhonesQuery = useQuery({
    queryKey: queryKeys.trips.hubDriverPhones(orgId ?? "", opsExportIdsKey),
    enabled: opsExportQueriesEnabled,
    staleTime: 5 * 60_000,
    queryFn: () => loadDriverPhonesByTripId(filtered),
  });
  const opsExportLrByTripId = opsExportDocFlagsQuery.data?.lrNumbersByTripId;
  const opsExportPhoneByTripId = opsExportDriverPhonesQuery.data;
  const opsExportLoading =
    opsStatusTimesQuery.isLoading ||
    opsExportDocFlagsQuery.isLoading ||
    opsExportDriverPhonesQuery.isLoading;
  // Not while refetching: a retry keeps isError true until it settles, and
  // counting that would close the sheet again before the retry can succeed.
  const opsExportFailed = [opsStatusTimesQuery, opsExportDocFlagsQuery, opsExportDriverPhonesQuery].some(
    (q) => q.isError && !q.isFetching,
  );
  // Don't open the sheet with blank columns; close it and say so instead.
  useEffect(() => {
    if (!opsExportFailed || !tripLedgerExportOpen || !useOpsTripExport) return;
    setTripLedgerExportOpen(false);
    showAppAlert(
      "Export failed",
      "Couldn't load stage times, LR numbers or driver numbers. Try again.",
    );
  }, [opsExportFailed, tripLedgerExportOpen, useOpsTripExport]);

  const tripOpsExportReport = useMemo(() => {
    const columns = TRIP_OPS_REPORT_COLUMNS.map((c) => ({
      key: c.key,
      label: c.label,
    }));
    // Only Trip Ops members see this sheet, and only once Export is open.
    if (!useOpsTripExport || !tripLedgerExportOpen) return { columns, rows: [] };
    const rows = buildTripOpsReportRows(filtered, {
      statusTimesByTripId: opsStatusTimes,
      lrNumberByTripId: {
        ...lrNumbersByTripId,
        ...(opsExportLrByTripId ?? {}),
      },
      driverPhoneByTripId: opsExportPhoneByTripId,
      driverPhoneByDriverId: driverPhoneById,
      partyMetaByTripId: tripHubPartyMetaByTripId,
      clientNameForTrip: tripCardClientName,
      stageLabelForTrip: getStageLabelForTrip,
    });
    return { columns, rows };
  }, [
    useOpsTripExport,
    tripLedgerExportOpen,
    filtered,
    opsStatusTimes,
    tripHubPartyMetaByTripId,
    opsExportLrByTripId,
    lrNumbersByTripId,
    tripCardClientName,
    opsExportPhoneByTripId,
    driverPhoneById,
    getStageLabelForTrip,
  ]);

  const historyMetricCards = useMemo(() => {
    const base: Record<
      HistoryTripMetricId,
      { count: number; amount: number; title: string; hint: string }
    > = {
      due_to_get: {
        count: 0,
        amount: 0,
        title: "Due to get",
        hint: "Receivable pending",
      },
      no_due_to_get: {
        count: 0,
        amount: 0,
        title: "No due to get",
        hint: "Receivable cleared",
      },
      due_to_pay: {
        count: 0,
        amount: 0,
        title: "Due to pay",
        hint: "Payable pending",
      },
      no_due_to_pay: {
        count: 0,
        amount: 0,
        title: "No due to pay",
        hint: "Payable cleared",
      },
      pending_soft_pod: {
        count: 0,
        amount: 0,
        title: "Pending soft POD",
        hint: "Document not on file",
      },
      pending_hard_pod: {
        count: 0,
        amount: 0,
        title: "Pending hard POD",
        hint: "Hard copy not received",
      },
    };

    if (!showCompletedList) return base;

    for (const trip of baseFilteredTrips) {
      const adj = tripFinanceAdjForHubLookup(tripFinanceAdjForHub, trip.id);
      const { receivableDue, payableDue } = historyTripDueState(
        trip,
        transactionsByTripId.get(trip.id) ?? [],
        currentOrganization?.id ?? null,
        adj,
        hubSubcontractRateByTripId.get(trip.id) ?? null,
      );

      if (receivableDue > 0) {
        base.due_to_get.count += 1;
        base.due_to_get.amount += receivableDue;
      } else {
        base.no_due_to_get.count += 1;
      }

      if (payableDue > 0) {
        base.due_to_pay.count += 1;
        base.due_to_pay.amount += payableDue;
      } else {
        base.no_due_to_pay.count += 1;
      }

      if (!tripHasHubPodFlag(tripIdsWithDocuments, trip.id)) {
        base.pending_soft_pod.count += 1;
      }
      if (
        !tripHasHubPodFlag(hardPodTripIds, trip.id) &&
        !tripPodIsReceived(trip)
      ) {
        base.pending_hard_pod.count += 1;
      }
    }

    return base;
  }, [
    baseFilteredTrips,
    currentOrganization?.id,
    showCompletedList,
    transactionsByTripId,
    tripFinanceAdjForHub,
    hubSubcontractRateByTripId,
    tripIdsWithDocuments,
    hardPodTripIds,
  ]);

  const tripMainTabCounts = useMemo(
    () => hubTabTripCounts(hubScopedTrips),
    [hubScopedTrips],
  );

  const formatMainTabLabel = useCallback(
    (label: string, count: number) =>
      `${label} (${hubCountText(count, hubCountsPartial)})`,
    [hubCountsPartial],
  );

  const mainTabs = useMemo(
    () => [
      {
        id: "active" as const,
        label: tr("active"),
        count: tripMainTabCounts.active,
        isActive: tripFilter === "Active",
        onPress: () => {
          lastOpenedTabSearchDoneRef.current = lastOpenedTripId;
          setTripFilter("Active");
          setActiveHistoryMetricTab(null);
        },
      },
      {
        id: "history" as const,
        label: tr("history"),
        count: tripMainTabCounts.history,
        isActive: tripFilter === "History",
        onPress: () => {
          lastOpenedTabSearchDoneRef.current = lastOpenedTripId;
          setTripFilter("History");
        },
      },
    ],
    [tr, tripFilter, tripMainTabCounts, lastOpenedTripId],
  );

  const subTabs = useMemo(
    () => [
      {
        id: "all" as const,
        label: tr("all"),
        isActive: supplyFilter === "all",
        onPress: () => setSupplyFilter("all"),
      },
      {
        id: "asset" as const,
        label: tr("tripAsset"),
        isActive: supplyFilter === "asset",
        onPress: () => setSupplyFilter("asset"),
      },
      {
        id: "aggregated" as const,
        label: tr("tripAggregate"),
        isActive: supplyFilter === "aggregated",
        onPress: () => setSupplyFilter("aggregated"),
      },
    ],
    [tr, supplyFilter],
  );

  const tripMetricCopy = useMemo(
    () =>
      ({
        all: {
          title: tr("tripMetricAllTrips"),
          hint: tr("tripMetricHintAllTrips"),
        },
        indent: {
          title: tr("tripMetricIndent"),
          hint: tr("tripMetricHintIndent"),
        },
        unassigned: {
          title: tr("tripMetricUnassigned"),
          hint: tr("tripMetricHintUnassigned"),
        },
        assigned: {
          title: tr("tripAssigned"),
          hint: tr("tripMetricHintAssigned"),
        },
        loading: {
          title: tr("tripMetricLoading"),
          hint: tr("tripMetricHintLoading"),
        },
        in_transit: {
          title: tr("tripMetricInTransit"),
          hint: tr("tripMetricHintInTransit"),
        },
        unloading: {
          title: tr("tripMetricUnloading"),
          hint: tr("tripMetricHintUnloading"),
        },
        delivered_docs_pending: {
          title: tr("tripMetricDeliveredDocsPending"),
          hint: tr("tripMetricHintDeliveredDocsPending"),
        },
      }) satisfies Record<ActiveMetricTabId, { title: string; hint: string }>,
    [tr],
  );
  const tripMetricVisual = useMemo(
    () =>
      ({
        all: {
          icon: "th-large",
          gradient: [Theme.financeHeroBg, Theme.financeCardSlateTo] as [
            string,
            string,
          ],
          accent: Theme.primary,
          micro: tr("tripMetricHintAllTrips"),
        },
        indent: {
          icon: "file-text-o",
          gradient: [Theme.financeCardSlateFrom, "#1e293b"] as [string, string],
          accent: Theme.textSecondary,
          // Separate needs-trip count beside the tile; never added to the live total.
          micro: `${tr("tripMetricNeedsTripCreation")} · ${needsTripIndentCount}`,
        },
        unassigned: {
          icon: "user-times",
          gradient: [Theme.financeCardSlateFrom, "#1e293b"] as [string, string],
          accent: Theme.textSecondary,
          micro: tr("tripMetricHintUnassigned"),
        },
        assigned: {
          icon: "check-circle",
          gradient: [Theme.primary, Theme.financeCardBlueTo] as [
            string,
            string,
          ],
          accent: Theme.primaryLight,
          micro: tr("tripMetricHintAssigned"),
        },
        loading: {
          icon: "upload",
          gradient: [Theme.financeCardOrangeFrom, Theme.financeCardOrangeTo] as [
            string,
            string,
          ],
          accent: Theme.warning,
          micro: tr("tripMetricHintLoading"),
        },
        in_transit: {
          icon: "paper-plane",
          gradient: [Theme.financeCardBlueFrom, Theme.financeCardCashTo] as [
            string,
            string,
          ],
          accent: "#38bdf8",
          micro: tr("tripMetricHintInTransit"),
        },
        unloading: {
          icon: "map-marker",
          gradient: ["#5b21b6", "#312e81"] as [string, string],
          accent: "#a78bfa",
          micro: tr("tripMetricHintUnloading"),
        },
        delivered_docs_pending: {
          icon: "flag-checkered",
          gradient: [Theme.financeCardGreenFrom, Theme.financeCardGreenTo] as [
            string,
            string,
          ],
          accent: Theme.positive,
          micro: tr("tripMetricHintDeliveredDocsPending"),
        },
      }) satisfies Record<
        ActiveMetricTabId,
        {
          icon: React.ComponentProps<typeof FontAwesome>["name"];
          gradient: [string, string];
          accent: string;
          micro: string;
        }
      >,
    [tr, needsTripIndentCount],
  );

  const activeMetricIdsForRail = useMemo(
    () => [...TRIP_METRIC_ORDER, "all" as const],
    [],
  );
  // ALL = open trips on the rail only. Completed trips belong on History.
  // Indent cards stay on the Indent tile and are not added here.
  const activeAllCount = useMemo(
    () => hubActiveAllTripCount(openHubRailCounts),
    [openHubRailCounts],
  );
  // "Showing X of Y": Y is the current tab's total (or the selected History card's
  // count), X the filtered list. activeMetricTab stays "all" on History, so key on
  // the tab, not the metric.
  const tripListToolbarCountLabel = useMemo(() => {
    let total: number;
    if (!showCompletedList) {
      if (activeMetricTab === "indent") return undefined;
      total =
        activeMetricTab === "all" ? tripMainTabCounts.active : metricCounts[activeMetricTab];
    } else {
      total =
        activeHistoryMetricTab == null
          ? tripMainTabCounts.history
          : historyMetricCards[activeHistoryMetricTab].count;
    }
    return hubShowingCountLabel({
      shown: filtered.length,
      total,
      partial: hubCountsPartial,
    });
  }, [
    activeHistoryMetricTab,
    activeMetricTab,
    filtered.length,
    historyMetricCards,
    hubCountsPartial,
    metricCounts,
    showCompletedList,
    tripMainTabCounts,
  ]);

  /**
   * INDENT is the first stage of the same lifecycle the rail already
   * renders — not a separate Load Center page. Cards share the Trip ticket
   * shell; status comes from Give Load bid-count derivation.
   */
  const renderUnallocatedIndentCards = (
    hubGrid: boolean,
    indents: IndentRow[],
  ) =>
    indents.map((indent) => {
      const status = (indent.status || "").toLowerCase();
      const isDraft = status === "draft";
      const isAwardedPendingTrip = status === "awarded";
      const isDone = isIndentStageDone(status);
      const hasDirectSupplier = Boolean(
        (indent as { assigned_supplier_id?: string | null }).assigned_supplier_id,
      );
      const bidCount = indentOfferCounts[indent.id] ?? 0;
      const openIndent = () => handleOpenUnallocatedIndent(indent);
      const avatarProps = giveLoadIndentAvatarProps(
        indent,
        clientById,
        linkedOrgByOrganizationId,
      );
      const card = (
        <TripsHubIndentStageCard
          indent={indent}
          highlighted={
            lastOpenedTripId === indent.id ||
            indentSearchHighlightId === indent.id
          }
          bidCount={bidCount}
          extraStopCount={extraStopsByIndentId.get(indent.id)?.count ?? 0}
          extraStopNames={extraStopNamesByIndentId.get(indent.id)}
          hubGrid={hubGrid}
          layoutCompact={tripsHubLayoutCompact}
          onPress={openIndent}
          tr={tr}
          clientAvatarUrl={avatarProps.avatarUrl}
          clientAvatarSeed={avatarProps.avatarSeed}
          clientAvatarFallbackSeed={avatarProps.initialsColorSeed}
          clientOrganizationImageUrl={avatarProps.organizationImageUrl}
          clientOrganizationAvatarSeed={avatarProps.organizationAvatarSeed}
          clientIntegrated={avatarProps.isIntegrated}
          actions={
            // Ground Ops see their warehouses' indents read-only: no share,
            // marketplace, story, broadcast or award. Tapping the card opens detail.
            // Sourcing is read-only the same way.
            isGroundOpsMember || isSourcingMember ? undefined : (
            <GiveLoadIndentCardActions
              load={indent}
              bidCount={bidCount}
              isDone={isDone}
              isDraft={isDraft}
              isAwardedPendingTrip={isAwardedPendingTrip}
              isAwaitingSupplierDeploy={
                isAwardedPendingTrip || hasDirectSupplier
              }
              showPulseToNetwork={indentHubActions.showPulseToNetwork(indent)}
              pulseStoryLive={
                indentHubActions.indentStoryStates[indent.id]?.isLive === true
              }
              onPulseStory={indentHubActions.handlePulseStory}
              onIndentPress={handleOpenUnallocatedIndent}
              onShareIndent={indentHubActions.handleShareIndent}
              onToggleMarketplace={indentHubActions.handleToggleMarketplace}
              marketplaceBusy={
                indentHubActions.marketplaceToggleBusyId === indent.id
              }
              onBroadcastDraft={indentHubActions.handleBroadcastDraft}
              onOpenAwardModal={indentHubActions.awardModal.open}
              dense={hubGrid || tripsHubLayoutCompact}
            />
            )
          }
        />
      );
      if (!hubGrid) return <View key={indent.id}>{card}</View>;
      return (
        <View key={indent.id} style={hubGridItem}>
          {card}
        </View>
      );
    });

  const renderIndentStageBody = (
    indents: IndentRow[] = paginatedHubIndents,
  ) => {
    if (
      indents.length === 0 &&
      indentHubSearchActive &&
      indentHubSearchMatches.length === 0 &&
      !indentCodeSearchFetching
    ) {
      return (
        <View style={emptyBannerStageStyle}>
          <Text style={styles.empty}>No matching indent found</Text>
        </View>
      );
    }
    if (indents.length === 0 && visibleUnallocatedIndents.length === 0) {
      return (
        <View style={emptyBannerStageStyle}>
          <TripsPromoCard
            variant={tripsEmptyPromoVariant}
            onCtaPress={
              canUnifiedAdd && tripsEmptyPromoVariant === "first_trip"
                ? () => router.push("/add-trip")
                : undefined
            }
          />
        </View>
      );
    }
    if (isLargeScreen) {
      return (
        <View style={styles.gridContainer}>
          {renderUnallocatedIndentCards(true, indents)}
        </View>
      );
    }
    return (
      <TripsHubMobileTripListCanvas>
        {renderUnallocatedIndentCards(false, indents)}
      </TripsHubMobileTripListCanvas>
    );
  };

  // Ground Ops and Sourcing never see receivable / payable money: History keeps
  // only the POD tiles.
  const hideMoneyTiles = isGroundOpsMember || isSourcingMember;
  const historyReceivableIds: HistoryTripMetricId[] = useMemo(
    () => (hideMoneyTiles ? [] : ["due_to_get", "no_due_to_get"]),
    [hideMoneyTiles],
  );
  const historyPayableIds: HistoryTripMetricId[] = useMemo(
    () => (hideMoneyTiles ? [] : ["due_to_pay", "no_due_to_pay"]),
    [hideMoneyTiles],
  );
  const historyPodIds: HistoryTripMetricId[] = useMemo(
    () => hubHistoryPodMetricIds(hubDocFlagsLoadedForView),
    [hubDocFlagsLoadedForView],
  );

  const clearTripFilters = useCallback(() => {
    setSortBy("date_desc");
    setSupplyFilter("all");
    setAttributionFilter("all");
    setDateRangeFilter("all");
    setPaymentFilter("all");
    setLoadTypeFilter("all");
    setCustomDateFrom(null);
    setCustomDateTo(null);
  }, []);

  const dateFilterOptionLabel = useCallback(
    (f: "all" | "today" | "tomorrow" | "this_week" | "this_month") => {
      switch (f) {
        case "all":
          return tr("all");
        case "today":
          return tr("todayTrips");
        case "tomorrow":
          return tr("tomorrowTrips");
        case "this_week":
          return tr("thisWeekTrips");
        case "this_month":
          return tr("thisMonthTrips");
        default:
          return tr("all");
      }
    },
    [tr],
  );

  const paymentFilterOptionLabel = useCallback(
    (f: PaymentFilter) => (f === "all" ? tr("all") : tr(`${f}Payment`)),
    [tr],
  );

  const attributionFilterOptionLabel = useCallback(
    (f: AttributionFilter) => {
      if (f === "all") return tr("attributedTripsAll");
      return attributedTripCount > 0
        ? `${tr("attributedTripsOnly")} (${attributedTripCount})`
        : tr("attributedTripsOnly");
    },
    [tr, attributedTripCount],
  );

  const sortOptions = useMemo(
    () => [
      {
        id: "date_desc" as const,
        label: tr("newestFirst"),
        icon: "calendar" as const,
      },
      {
        id: "date_asc" as const,
        label: tr("oldestFirst"),
        icon: "calendar" as const,
      },
      {
        id: "revenue_desc" as const,
        label: tr("revenueHighToLow"),
        icon: "money" as const,
      },
      {
        id: "revenue_asc" as const,
        label: tr("revenueLowToHigh"),
        icon: "money" as const,
      },
      {
        id: "client_asc" as const,
        label: tr("clientAZ"),
        icon: "sort-alpha-asc" as const,
      },
      {
        id: "client_desc" as const,
        label: tr("clientZA"),
        icon: "sort-alpha-desc" as const,
      },
    ],
    [tr],
  );

  const historyMetricOrder = useMemo(
    () =>
      [
        ...historyReceivableIds,
        ...historyPayableIds,
        ...historyPodIds,
      ] as HistoryTripMetricId[],
    [historyReceivableIds, historyPayableIds, historyPodIds],
  );

  const webTripsPagination =
    Platform.OS === "web"
      ? {
          page: tripsTablePageSafe,
          pageSize: tripsTablePageSize,
          // Indent tab feeds indents (as rows) into the table, so page by the indent slice.
          offset: hubShowsIndentList
            ? hubListPageSlice.indentOffset
            : hubListPageSlice.tripOffset,
          limit: hubShowsIndentList
            ? hubListPageSlice.indentLimit
            : hubListPageSlice.tripLimit,
        }
      : undefined;

  const mobileTripsPagination =
    isMobileViewport && Platform.OS !== "web"
      ? { page: 0, pageSize: mobileVisibleCount }
      : undefined;

  const tripsListPagination = webTripsPagination ?? mobileTripsPagination;

  const handleTripsPagePrev = useCallback(
    () => setTripsTablePage((p) => Math.max(0, p - 1)),
    [],
  );
  const handleTripsPageNext = useCallback(
    () =>
      setTripsTablePage((p) => Math.min(tripsTableTotalPages - 1, p + 1)),
    [tripsTableTotalPages],
  );

  const showTripsPaginationFooter =
    Platform.OS === "web" &&
    !isMobileViewport &&
    tripsHubPaginationTotal > 0;

  if (memberAccessLoading || orgBootPending) {
    if (!bootStuck) {
      return <SceneLoadingSplash variant="preparing" message={tr("loading")} />;
    }
  }

  if (!canAccess) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top }]}>
        <Text style={styles.message}>{tr("noAccessTrips")}</Text>
          </View>
    );
  }

  if (!orgId) {
    if (orgBootPending && !bootStuck) {
      return <SceneLoadingSplash variant="preparing" message={tr("loading")} />;
    }
    if (organizationError || bootStuck) {
      const infra = organizationError
        ? isInfrastructureErrorMessage(organizationError.message)
        : true;
      return (
        <View style={[styles.centered, { paddingTop: insets.top }]}>
          <ContentErrorState
            variant={infra ? "connection" : "workspace"}
            message={organizationError?.message}
            onRetry={() => void refreshOrganization?.()}
          />
        </View>
      );
    }
    // Authenticated but workspace still settling — hold splash, don't flash
    // "No organization linked" on route focus / back navigation races.
    if (workspaceResolving || orgLoading) {
      return <SceneLoadingSplash variant="preparing" message={tr("loading")} />;
    }
    return (
      <View style={[styles.centered, { paddingTop: insets.top }]}>
        <ContentErrorState
          variant="workspaceMissing"
          onRetry={() => void refreshOrganization?.()}
          retryLabel="Refresh"
        />
      </View>
    );
  }

  if (groundOpsWarehouseGap.missingWarehouse) {
    return <GroundOpsWarehouseNotice />;
  }
  if (sourcingScope.missingScope) {
    return <GroundOpsWarehouseNotice sourcing />;
  }

  if (loading || tripsBootFailed) {
    if (tripsBootFailed) {
      const message =
        tripsLoadError instanceof Error ? tripsLoadError.message : undefined;
      return (
        <View style={[styles.centered, { paddingTop: insets.top }]}>
          <ContentErrorState
            variant={
              message && isInfrastructureErrorMessage(message)
                ? "connection"
                : "loads"
            }
            message={message}
            onRetry={() => void refetchTrips()}
          />
        </View>
      );
    }
    if (bootStuck) {
      return (
        <View style={[styles.centered, { paddingTop: insets.top }]}>
          <ContentErrorState
            variant="connection"
            onRetry={() => void refetchTrips()}
          />
        </View>
      );
    }
    return <SceneLoadingSplash variant="preparing" message={tr("loading")} />;
  }

  // Trip report and ledger export carry freight / cost columns — not for Sourcing.
  const openTripLedgerExport = isSourcingMember
    ? undefined
    : () => setTripLedgerExportOpen(true);
  const tripsReportButton = canAccess && !isSourcingMember ? (
    <View
      {...(Platform.OS === "web"
        ? ({ title: "Download Trip Report" } as object)
        : null)}
    >
      <PulsePillButton
        size="compact"
        icon={
          <Download
            size={12}
            color={Theme.buttonPrimaryText}
            strokeWidth={2.4}
          />
        }
        loading={tripReportDownloading}
        disabled={tripReportDownloading || !orgId}
        onPress={() => void handleDownloadTripReport()}
        accessibilityLabel="Download Trip Report"
        style={[styles.tripsAddButtonOnChrome, styles.tripsReportIconButton]}
      />
    </View>
  ) : null;

  const tripsAddButton = canUnifiedAdd ? (
    <PulsePillButton
      label="Add"
      showPlusIcon
      size="compact"
      onPress={() => router.push("/add-trip")}
      accessibilityLabel="Add"
      style={styles.tripsAddButtonOnChrome}
    />
  ) : null;

  const tripsHeaderActions =
    tripsReportButton || tripsAddButton ? (
      <View style={styles.tripsHeaderActionsRow}>
        {tripsReportButton}
        {tripsAddButton}
      </View>
    ) : null;

  return (
    <HubScreenShell
      footer={
        Platform.OS === "web" && !isMobileViewport ? (
          <TripsHubAuditFooter
            onExportLedger={openTripLedgerExport}
            tr={tr}
            pagination={
              showTripsPaginationFooter
                ? {
                    page: tripsTablePageSafe,
                    totalPages: tripsTableTotalPages,
                    totalItems: tripsHubPaginationTotal,
                    pageSize: tripsTablePageSize,
                    onPageSizeChange: (size) =>
                      setTripsTablePageSize(size as HubGridPageSize),
                    itemLabel: "trips",
                    onPrev: handleTripsPagePrev,
                    onNext: handleTripsPageNext,
                  }
                : undefined
            }
          />
        ) : null
      }
    >
    <View style={[styles.container, { paddingTop: screenTopPad }]}>
      <TripsFilterBottomSheet
        visible={showSortModal}
        onClose={() => setShowSortModal(false)}
        onClearAll={clearTripFilters}
        title={tr("allFilters")}
        clearAllLabel={tr("clearAllFilters")}
        applyLabel={tr("applyTripFilters")}
        viewByLabel={tr("sortBy")}
        tripTypeLabel={tr("tripType")}
        dateFilterLabel={tr("dateFilter")}
        paymentStatusLabel={tr("paymentStatus")}
        loadTypeLabel={tr("loadType")}
        sortOptions={sortOptions}
        sortBy={sortBy}
        onSortByChange={setSortBy}
        supplyTabs={subTabs}
        dateFilters={["all", "today", "tomorrow", "this_week", "this_month"]}
        dateRangeFilter={dateRangeFilter}
        onDateFilterChange={setDateRangeFilter}
        dateFilterOptionLabel={dateFilterOptionLabel}
        paymentFilters={["all", "pending", "partial", "paid"]}
        paymentFilter={paymentFilter}
        onPaymentFilterChange={setPaymentFilter}
        paymentFilterOptionLabel={paymentFilterOptionLabel}
        attributionFilterLabel={tr("tripAttribution")}
        attributionFilters={["all", "attributed"]}
        attributionFilter={attributionFilter}
        onAttributionFilterChange={setAttributionFilter}
        attributionFilterOptionLabel={attributionFilterOptionLabel}
        loadTypeOptions={loadTypeOptions}
        loadTypeFilter={loadTypeFilter}
        onLoadTypeFilterChange={setLoadTypeFilter}
        allLabel={tr("all")}
        maxScrollHeight={width > 1024 ? 560 : 440}
      />

      <HubTripLrUpdateModal
        visible={Boolean(hubLrEdit)}
        tripId={hubLrEdit?.tripId ?? ""}
        organizationId={orgId ?? ""}
        tripOrganizationId={hubLrEdit?.organizationId ?? orgId ?? null}
        actorId={auth?.profile?.uid ?? auth?.user?.uid ?? ""}
        existingLabel={hubLrEdit?.label ?? ""}
        elrSource={
          hubLrEdit
            ? (() => {
                const trip = tripsByStatus.find((row) => row.id === hubLrEdit.tripId);
                return trip ? hubElrSourceFromTrip(trip, currentOrganization) : null;
              })()
            : null
        }
        onClose={() => setHubLrEdit(null)}
        onSubmitted={(lrNumber, previewFiles) => {
          const id = (hubLrEdit?.tripId ?? "").trim().toLowerCase();
          const tripId = hubLrEdit?.tripId ?? "";
          if (id) {
            setHubLrPreviewByTripId((current) => ({ ...current, [id]: lrNumber }));
          }
          if (previewFiles.length > 0) {
            setHubLrDocPreview({
              files: previewFiles,
              index: Math.max(0, previewFiles.length - 1),
              tripId,
            });
          }
        }}
      />

      <VaultCategoryPreviewModal
        visible={Boolean(hubLrDocPreview)}
        files={hubLrDocPreview?.files ?? []}
        index={hubLrDocPreview?.index ?? 0}
        onIndexChange={(index) =>
          setHubLrDocPreview((current) => (current ? { ...current, index } : current))
        }
        onClose={() => setHubLrDocPreview(null)}
        onAdd={
          hubLrDocPreview
            ? () => {
                const tripId = hubLrDocPreview.tripId;
                const label =
                  hubLrPreviewByTripId[tripId.trim().toLowerCase()] ??
                  hubLrEdit?.label ??
                  "";
                setHubLrDocPreview(null);
                setHubLrEdit({
                  tripId,
                  label,
                  organizationId: hubLrEdit?.organizationId ?? orgId ?? null,
                });
              }
            : undefined
        }
      />

      <DateRangePickerModal
        visible={showDateRangePicker}
        initialFrom={customDateFrom}
        initialTo={customDateTo}
        onDismiss={() => setShowDateRangePicker(false)}
        onApply={(from, to) => {
          setCustomDateFrom(from);
          setCustomDateTo(to);
          setDateRangeFilter("custom");
          setShowDateRangePicker(false);
        }}
        onClear={() => {
          setCustomDateFrom(null);
          setCustomDateTo(null);
          setDateRangeFilter("all");
          setShowDateRangePicker(false);
        }}
      />

      {indentHubActions.sheets}
      <IndentHubActivityLogPanel
        visible={indentActivityOpen}
        orgId={orgId}
        indentId={indentActivityFocusId}
        onSelectIndent={setIndentActivityFocusId}
        onClose={() => {
          setIndentActivityOpen(false);
          setIndentActivityFocusId(null);
          indentActivityClickAt.current = 0;
        }}
      />

      <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: tripsScrollBottomPad },
          ]}
          showsVerticalScrollIndicator={false}
          {...tabBarScrollProps}
          onScroll={handleTripsMainScroll}
          scrollEventThrottle={
            effectiveListLayout === "table"
              ? 100
              : (tabBarScrollProps.scrollEventThrottle ?? 64)
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={Theme.primary}
            />
          }
        >
          {tripFilter === "Active" && attributionRequests.length > 0 ? (
            <View style={styles.attributionRequestsTop}>
              <AttributionRequestsSection
                requests={attributionRequests}
                orgId={orgId}
                busySalaryId={finance.busySalaryId}
                onOpenRequest={(req) =>
                  finance.onOpenDetail("salary", req.id, "active")
                }
                onAcceptRequest={finance.onPaySalary}
                onReject={finance.onRejectSalary}
              />
            </View>
          ) : null}
          <View
            style={
              isMobileViewport
                ? hubChrome.bodyFiltersMobileInLayout
                : styles.tripsBodyFiltersBleed
            }
          >
            <View
              style={[
                styles.tripsInlineFilterPanel,
                isMobileViewport && styles.tripsInlineFilterPanelMobileLight,
                !isMobileViewport && styles.tripsInlineFilterPanelDesktop,
              ]}
            >
              {isMobileViewport ? (
                <>
                  <HubMobileScreenHeader title={tr("myTrips")} />
                  <View style={[hubChrome.tabHeaderRow, styles.tripsMobileTabRow]}>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      keyboardShouldPersistTaps="handled"
                      nestedScrollEnabled
                      style={hubChrome.primaryTabsScroll}
                      contentContainerStyle={hubChrome.primaryTabsContent}
                    >
                      {mainTabs.map((tab) => (
                        <HubMobileUnderlineTab
                          key={tab.id}
                          label={formatMainTabLabel(tab.label, tab.count)}
                          isActive={tab.isActive}
                          onPress={tab.onPress}
                          accessibilityLabel={`${tab.label}, ${tab.count} trips`}
                        />
                      ))}
                    </ScrollView>
                    {tripsHeaderActions}
                  </View>
                  <View style={hubChrome.tabDivider} />
                </>
              ) : (
                <View style={styles.tripsInlineFilterPanelWeb}>
                  <View
                    style={[
                      chatChrome.filterHeaderRow,
                      styles.tripsFilterHeaderRowCompact,
                      isCompactWeb && styles.tripsFilterHeaderCompact,
                    ]}
                  >
                    {!isMobile ? (
                      <View
                        style={[
                          chatChrome.tabRow,
                          chatChrome.tabRowHug,
                          styles.tripsFilterTabRowCompact,
                        ]}
                      >
                        {subTabs.map((tab) => (
                          <Pressable
                            key={tab.id}
                            style={({ hovered, pressed }: { pressed: boolean; hovered?: boolean }) => [
                              chatChrome.tabPill,
                              chatChrome.tabPillHug,
                              styles.tripsFilterTabPillCompact,
                              tab.isActive && chatChrome.tabPillActive,
                              !tab.isActive &&
                                (hovered || pressed) &&
                                chatChrome.tabPillHover,
                              Platform.OS === "web"
                                ? ({ cursor: "pointer" } as ViewStyle)
                                : null,
                            ]}
                            onPress={tab.onPress}
                            accessibilityRole="tab"
                            accessibilityState={{ selected: tab.isActive }}
                          >
                            <Text
                              style={[
                                chatChrome.tabPillLabel,
                                chatChrome.tabPillLabelHug,
                                styles.tripsFilterTabLabelCompact,
                                tab.isActive && chatChrome.tabPillLabelActive,
                              ]}
                            >
                              {tab.label}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    ) : null}
                    <View
                      style={[
                        chatChrome.filterHeaderRight,
                        isCompactWeb && styles.tripsFilterHeaderRightCompact,
                      ]}
                    >
                      <View
                        style={[
                          chatChrome.tabRow,
                          chatChrome.tabRowHug,
                          styles.tripsFilterTabRowCompact,
                        ]}
                      >
                        {mainTabs.map((tab) => (
                          <Pressable
                            key={tab.id}
                            style={({ hovered, pressed }: { pressed: boolean; hovered?: boolean }) => [
                              chatChrome.tabPill,
                              chatChrome.tabPillHug,
                              styles.tripsFilterTabPillCompact,
                              tab.isActive && chatChrome.tabPillActive,
                              !tab.isActive &&
                                (hovered || pressed) &&
                                chatChrome.tabPillHover,
                              Platform.OS === "web"
                                ? ({ cursor: "pointer" } as ViewStyle)
                                : null,
                            ]}
                            onPress={tab.onPress}
                            accessibilityRole="tab"
                            accessibilityState={{ selected: tab.isActive }}
                            accessibilityLabel={`${tab.label}, ${tab.count} trips`}
                          >
                            <Text
                              style={[
                                chatChrome.tabPillLabel,
                                chatChrome.tabPillLabelHug,
                                styles.tripsFilterTabLabelCompact,
                                tab.isActive && chatChrome.tabPillLabelActive,
                              ]}
                            >
                              {formatMainTabLabel(tab.label, tab.count)}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                      {!isMobileViewport ? (
                        <View
                          style={[
                            chatChrome.iconToggleTray,
                            styles.tripsFilterIconTrayCompact,
                          ]}
                          accessibilityRole="tablist"
                        >
                          <TouchableOpacity
                            style={[
                              chatChrome.iconToggleBtn,
                              styles.tripsFilterIconBtnCompact,
                              listLayout === "cards" &&
                                chatChrome.iconToggleBtnActive,
                            ]}
                            onPress={() =>
                              setListLayoutWithPersistence("cards")
                            }
                            activeOpacity={0.85}
                            accessibilityRole="tab"
                            accessibilityState={{
                              selected: listLayout === "cards",
                            }}
                            accessibilityLabel={tr("tripsViewCards")}
                          >
                            <FontAwesome
                              name="th-large"
                              size={12}
                              color={
                                listLayout === "cards"
                                  ? Theme.primary
                                  : CHAT_FILTER_MUTED
                              }
                            />
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[
                              chatChrome.iconToggleBtn,
                              styles.tripsFilterIconBtnCompact,
                              listLayout === "table" &&
                                chatChrome.iconToggleBtnActive,
                            ]}
                            onPress={() =>
                              setListLayoutWithPersistence("table")
                            }
                            activeOpacity={0.85}
                            accessibilityRole="tab"
                            accessibilityState={{
                              selected: listLayout === "table",
                            }}
                            accessibilityLabel={tr("tripsViewTable")}
                          >
                            <FontAwesome
                              name="list"
                              size={12}
                              color={
                                listLayout === "table"
                                  ? Theme.primary
                                  : CHAT_FILTER_MUTED
                              }
                            />
                          </TouchableOpacity>
                        </View>
                      ) : null}
                      {tripsHeaderActions}
                    </View>
                  </View>
                </View>
              )}
            </View>
            {tripFilter === "Active" ? (
              isMobileViewport ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                  contentContainerStyle={hubChrome.metricTabsContent}
                  style={hubChrome.metricTabsScroll}
                >
                  {activeMetricIdsForRail.map((metricId) => {
                    const active = activeMetricTab === metricId;
                    const copy = tripMetricCopy[metricId];
                    if (!copy) return null;
                    const count =
                      metricId === "all"
                        ? activeAllCount
                        : metricCounts[metricId];
                    return (
                      <HubMobileUnderlineTab
                        key={metricId}
                        label={`${copy.title} (${count})`}
                        isActive={active}
                        compact
                        onPress={() => setActiveMetricTab(metricId)}
                        accessibilityLabel={`${copy.title}, ${count} trips`}
                      />
                    );
                  })}
                </ScrollView>
              ) : (
                <TripsHubBentoMetrics
                  metricOrder={activeMetricIdsForRail}
                  activeMetricTab={activeMetricTab}
                  onSelectMetric={setActiveMetricTab}
                  getCount={(id) =>
                    id === "all" ? activeAllCount : metricCounts[id]
                  }
                  getTitle={(id) => tripMetricCopy[id]?.title ?? id}
                  getSubtitle={(id) => tripMetricVisual[id]?.micro ?? ""}
                  getIcon={(id) => tripMetricVisual[id]?.icon ?? "th-large"}
                  isDesktop={isLargeScreen}
                style={styles.tripMetricsScroll}
                />
              )
            ) : isMobileViewport ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={hubChrome.metricTabsContent}
                style={hubChrome.metricTabsScroll}
              >
                {[...historyReceivableIds, ...historyPayableIds, ...historyPodIds].map(
                  (metricId) => {
                    const active = activeHistoryMetricTab === metricId;
                    const copy = historyMetricCards[metricId];
                    return (
                      <HubMobileUnderlineTab
                        key={metricId}
                        label={`${copy.title} (${copy.count})`}
                        isActive={active}
                        compact
                        onPress={() =>
                          setActiveHistoryMetricTab((current) =>
                            current === metricId ? null : metricId,
                          )
                        }
                        accessibilityLabel={`${copy.title}, ${copy.count} trips`}
                      />
                    );
                  },
                )}
              </ScrollView>
            ) : (
              <TripsHubHistoryBentoMetrics
                metricOrder={historyMetricOrder}
                activeMetricTab={activeHistoryMetricTab}
                onSelectMetric={setActiveHistoryMetricTab}
                getMetric={(id) => historyMetricCards[id]}
                isDesktop={isLargeScreen}
                style={styles.tripMetricsScroll}
              />
            )}
          </View>

          {/*
           * ALL is a mixed lifecycle list: unallocated indent tickets
           * (bidding status + NETWORK/MARKETPLACE tags) alongside actual
           * Trip tickets (lifecycle status + INDENT/DIRECT origin).
           * Search/date live on the shared Trips hub toolbar, not inside
           * a Load Center shell and not only on the trip table.
           */}
          {tripFilter === "Active" &&
          activeMetricTab === "indent" &&
          effectiveListLayout !== "table" ? (
            <TripsHubTableView
              trips={[]}
              hideBody
              renderAboveBody={
                <IndentStageViews
                  state={indentPoolView}
                  canView={canViewIndentPools}
                  canSelect={canSelectPoolIndents}
                  bidCountById={indentOfferCounts}
                  bidSnapshotById={indentBidSnapshots}
                  listCapped={allIndents.length >= FINITE_LIST_CAP}
                  compact={isMobileViewport}
                  onOpenIndent={handleOpenUnallocatedIndent}
                  cards={renderIndentStageBody(paginatedHubIndents)}
                />
              }
              renderBody={() => null}
              toolbarCountLabel={indentStageToolbarCountLabel}
              toolbarTags={indentHubToolbarTags}
              toolbarLeading={
                <IndentHubActivityLogButton
                  onPress={() => toggleIndentActivity(null)}
                />
              }
              searchQuery={searchQuery}
              searchPlaceholder="Search indent, client, trip id"
              onSearchQueryChange={setSearchQuery}
              lrLabelByTripId={{ ...hubLrLabels, ...hubLrPreviewByTripId }}
              elrLabelByTripId={hubElrLabels}
              pagination={showIndentPoolView ? undefined : tripsListPagination}
              onDisplayedTripsLengthChange={undefined}
              currentOrganizationId={currentOrganization?.id ?? null}
              getStageLabel={getStageLabelForTrip}
              transactionsByTripId={transactionsByTripId}
              financeAdjustmentsByTripId={tripFinanceAdjForHub}
              subcontractRateByTripId={hubSubcontractRateByTripId}
              onOpenTripDetails={handleOpenTripDetails}
              tr={tr}
              dateRangeFilter={dateRangeFilter}
              dateRangeLabel={hubDateRangeLabel}
              onDateRangeFilterChange={(next: DateFilter) => {
                setDateRangeFilter(next);
                if (next !== "custom") {
                  setCustomDateFrom(null);
                  setCustomDateTo(null);
                }
              }}
              onOpenDateRangePicker={() => setShowDateRangePicker(true)}
              onExportLedger={openTripLedgerExport}
              clientNameByTripId={shipperNameByTripId}
              linkedOrgByOrganizationId={linkedOrgByOrganizationId}
              partyMetaByTripId={tripHubPartyMetaByTripId}
              softPodTripIds={tripIdsWithDocuments}
              softPodCheckedTripIds={softPodCheckedTripIds}
              hardPodTripIds={hardPodTripIds}
            />
          ) : effectiveListLayout === "table" ? (
            <View>
            <ScrollView
              horizontal
              nestedScrollEnabled
              showsHorizontalScrollIndicator
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.tripsTableHScrollContent}
            >
              <View
                style={[
                  styles.tripsTableMinWidth,
                  {
                    minWidth: Math.max(
                      width - Layout.screenPaddingHorizontal * 2,
                        isMobile ? 980 : 1140,
                    ),
                  },
                ]}
              >
                <TripsHubTableView
                  trips={hubTableTrips}
                  pagination={tripsListPagination}
                  onDisplayedTripsLengthChange={setHubToolbarMatchCount}
                  currentOrganizationId={currentOrganization?.id ?? null}
                  getStageLabel={getStageLabelForTrip}
                  transactionsByTripId={transactionsByTripId}
                    financeAdjustmentsByTripId={tripFinanceAdjForHub}
                  subcontractRateByTripId={hubSubcontractRateByTripId}
                  onOpenTripDetails={handleOpenHubTableRow}
                  tr={tr}
                  renderBody={
                    activeMetricTab === "indent"
                      ? (rows) => (
                          <IndentHubSpreadsheetTable
                            indents={rows
                              .map((row) => indentById.get(row.id) ?? indentById.get(row.indent_id ?? ""))
                              .filter((indent): indent is IndentRow => indent != null)}
                            bidCountById={indentOfferCounts}
                            onOpenIndent={handleOpenUnallocatedIndent}
                            onOpenActivity={(indent) => {
                              toggleIndentActivity(indent.id);
                            }}
                          />
                        )
                      : undefined
                  }
                  toolbarLeading={
                    activeMetricTab === "indent" ? (
                      <IndentHubActivityLogButton
                        onPress={() => toggleIndentActivity(null)}
                      />
                    ) : undefined
                  }
                  toolbarTags={
                    activeMetricTab === "indent" ? indentHubToolbarTags : undefined
                  }
                  searchQuery={searchQuery}
                  searchPlaceholder={
                    activeMetricTab === "indent"
                      ? "Search indent, client, trip id"
                      : undefined
                  }
                  onSearchQueryChange={setSearchQuery}
                  indentSearchTextByIndentId={indentCodesByIndentId}
                  lrLabelByTripId={{ ...hubLrLabels, ...hubLrPreviewByTripId }}
                  elrLabelByTripId={hubElrLabels}
                  toolbarCountLabel={
                    activeMetricTab === "indent"
                      ? indentStageToolbarCountLabel
                      : tripListToolbarCountLabel
                  }
                  toolbarWarning={hubShowsIndentList ? null : hubCompletenessNote}
                  renderAboveBody={null}
                  dateRangeFilter={dateRangeFilter}
                  dateRangeLabel={hubDateRangeLabel}
                  onDateRangeFilterChange={(next: DateFilter) => {
                    setDateRangeFilter(next);
                    if (next !== "custom") {
                      setCustomDateFrom(null);
                      setCustomDateTo(null);
                    }
                  }}
                  onOpenDateRangePicker={() => setShowDateRangePicker(true)}
                    onExportLedger={openTripLedgerExport}
                  clientNameByTripId={shipperNameByTripId}
                  linkedOrgByOrganizationId={linkedOrgByOrganizationId}
                  partyMetaByTripId={tripHubPartyMetaByTripId}
                  ewayExpiryByTripId={
                    activeMetricTab === "indent" ? undefined : ewayExpiryByTripId
                  }
                  lrNumbersByTripId={
                    activeMetricTab === "indent" ? undefined : lrNumbersByTripId
                  }
                  softPodTripIds={
                    activeMetricTab === "indent" ? undefined : tripIdsWithDocuments
                  }
                  softPodCheckedTripIds={
                    activeMetricTab === "indent" ? undefined : softPodCheckedTripIds
                  }
                  hardPodTripIds={
                    activeMetricTab === "indent" ? undefined : hardPodTripIds
                  }
                />
                {hubTableTrips.length === 0 && activeMetricTab !== "indent" ? (
                  <View style={emptyBannerStageStyle}>
                    <TripsPromoCard
                      variant={tripsEmptyPromoVariant}
                      onCtaPress={
                        canUnifiedAdd && tripsEmptyPromoVariant === "first_trip"
                          ? () => router.push("/add-trip")
                          : undefined
                      }
                    />
                  </View>
                ) : null}
              </View>
            </ScrollView>
            </View>
          ) : (
            <View
              style={
                Platform.OS === "web" && !isMobileViewport
                  ? styles.tripsHubListShell
                  : undefined
              }
            >
              <TripsHubTableView
                trips={filtered}
                pagination={tripsListPagination}
                onDisplayedTripsLengthChange={setHubToolbarMatchCount}
                currentOrganizationId={currentOrganization?.id ?? null}
                getStageLabel={getStageLabelForTrip}
                transactionsByTripId={transactionsByTripId}
                financeAdjustmentsByTripId={tripFinanceAdjForHub}
                subcontractRateByTripId={hubSubcontractRateByTripId}
                onOpenTripDetails={handleOpenTripDetails}
                tr={tr}
                searchQuery={searchQuery}
                onSearchQueryChange={setSearchQuery}
                indentSearchTextByIndentId={indentCodesByIndentId}
                lrLabelByTripId={{ ...hubLrLabels, ...hubLrPreviewByTripId }}
                elrLabelByTripId={hubElrLabels}
                toolbarCountLabel={tripListToolbarCountLabel}
                toolbarWarning={hubCompletenessNote}
                renderAboveBody={null}
                dateRangeFilter={dateRangeFilter}
                dateRangeLabel={hubDateRangeLabel}
                onDateRangeFilterChange={(next: DateFilter) => {
                  setDateRangeFilter(next);
                  if (next !== "custom") {
                    setCustomDateFrom(null);
                    setCustomDateTo(null);
                  }
                }}
                onOpenDateRangePicker={() => setShowDateRangePicker(true)}
                onExportLedger={openTripLedgerExport}
                clientNameByTripId={shipperNameByTripId}
                linkedOrgByOrganizationId={linkedOrgByOrganizationId}
                partyMetaByTripId={tripHubPartyMetaByTripId}
                softPodTripIds={tripIdsWithDocuments}
                softPodCheckedTripIds={softPodCheckedTripIds}
                hardPodTripIds={hardPodTripIds}
                ewayExpiryByTripId={ewayExpiryByTripId}
                lrNumbersByTripId={lrNumbersByTripId}
                renderBody={(rows) =>
                  rows.length === 0 && filtered.length === 0 ? (
                    <View style={emptyBannerStageStyle}>
                      <TripsPromoCard
                        variant={tripsEmptyPromoVariant}
                        onCtaPress={
                          canUnifiedAdd && tripsEmptyPromoVariant === "first_trip"
                            ? () => router.push("/add-trip")
                            : undefined
                        }
                      />
                    </View>
                  ) : isLargeScreen ? (
                  <View style={styles.gridContainer}>
                    {rows.map((t) => {
                      const stage = getStageLabelForTrip(t);
                      const displayClientName = tripCardClientName(t);
                      const cardLedgerRows = transactionsByTripId.get(t.id) ?? [];
                      const hubLedger = summarizeTripLedgerForHub(cardLedgerRows);
                      const party = tripHubPartyMetaByTripId.get(t.id);
                      const clientOrgFields = linkedOrgAvatarFields(
                        party?.clientLinkedOrgId,
                        linkedOrgByOrganizationId,
                        party?.clientAvatarUrl,
                      );
                      const supplierOrgFields = linkedOrgAvatarFields(
                        party?.supplierLinkedOrgId,
                        linkedOrgByOrganizationId,
                        party?.supplierAvatarUrl,
                      );
                      return (
                        <View key={t.id} style={hubGridItem}>
                          <TripsHubTripCard
                            hubGrid
                            trip={t}
                            softPodReceived={hubSoftPodChipState(
                              softPodCheckedTripIds.has(t.id.trim().toLowerCase()),
                              tripHasHubPodFlag(tripIdsWithDocuments, t.id),
                            )}
                            hardPodReceived={
                              tripHasHubPodFlag(hardPodTripIds, t.id) ||
                              tripPodIsReceived(t)
                            }
                            ewayExpiryLabel={
                              ewayExpiryByTripId[t.id.trim().toLowerCase()] ??
                              null
                            }
                            lrLabel={hubLrLabelFor(t.id)}
                            elrLabel={hubElrLabelFor(t.id)}
                            canEditLr={canEditHubLrFor(t)}
                            onPressLr={openHubLrEdit}
                            highlighted={
                              lastOpenedTripId === t.id ||
                              tripSearchHighlightId === t.id
                            }
                            currentOrganizationId={
                              currentOrganization?.id ?? null
                            }
                            kindPillMeta={
                              party
                                ? {
                                    supplierLinkedOrgId:
                                      party.supplierLinkedOrgId,
                                    driverTrackingOnly:
                                      party.driverTrackingOnly,
                                  }
                                : null
                            }
                            financeAdjustments={tripFinanceAdjForHubLookup(
                              tripFinanceAdjForHub,
                              t.id,
                            )}
                            hubCostContext={{
                              subcontractRate:
                                hubSubcontractRateByTripId.get(t.id) ?? null,
                              nonSupplierExpenseTotal:
                                tripNonSupplierOutflowTotal(cardLedgerRows),
                            }}
                            displayClientName={displayClientName}
                            displaySupplierName={party?.displaySupplierName ?? ""}
                            displayDriverName={party?.displayDriverName ?? ""}
                            clientAvatarUrl={party?.clientAvatarUrl ?? null}
                            clientAvatarSeed={party?.clientAvatarSeed ?? null}
                            clientAvatarFallbackSeed={party?.clientFallbackSeed}
                            clientOrganizationImageUrl={
                              clientOrgFields.organizationImageUrl
                            }
                            clientOrganizationAvatarSeed={
                              clientOrgFields.organizationAvatarSeed
                            }
                            supplierAvatarUrl={party?.supplierAvatarUrl ?? null}
                            supplierAvatarSeed={party?.supplierAvatarSeed ?? null}
                            supplierAvatarFallbackSeed={
                              party?.supplierFallbackSeed
                            }
                            supplierOrganizationImageUrl={
                              supplierOrgFields.organizationImageUrl
                            }
                            supplierOrganizationAvatarSeed={
                              supplierOrgFields.organizationAvatarSeed
                            }
                            clientIntegrated={party?.clientIntegrated}
                            supplierIntegrated={party?.supplierIntegrated}
                            driverAvatarUrl={party?.driverAvatarUrl ?? null}
                            driverAvatarSeed={party?.driverAvatarSeed ?? null}
                            cardDate={getTripCardDate(t)}
                            stageLabel={stage}
                            onOpenTrip={openTripDetail}
                            layoutCompact={tripsHubLayoutCompact}
                            viewportWidth={width}
                            tr={tr}
                            ledgerReceivedTotal={hubLedger.receivedTotal}
                            ledgerPaidTotal={hubLedger.paidTotal}
                            ledgerTxnCount={hubLedger.count}
                            lastLedgerDateLabel={
                              hubLedger.lastAtIso
                                ? formatLedgerDate(hubLedger.lastAtIso)
                                : undefined
                            }
                            rowWebStyle={
                              Platform.OS === "web"
                                ? ({ cursor: "pointer" } as ViewStyle)
                                : undefined
                            }
                            inTransitPing={getTripHubInTransitPing(
                              inTransitPingByTripId,
                              t.id,
                            )}
                          />
                        </View>
                      );
                    })}
                  </View>
                  ) : (
                  <TripsHubMobileTripListCanvas>
                    {rows.map((t) => {
                      const stage = getStageLabelForTrip(t);
                      const displayClientName = tripCardClientName(t);
                      const cardLedgerRows = transactionsByTripId.get(t.id) ?? [];
                      const hubLedger = summarizeTripLedgerForHub(cardLedgerRows);
                      const party = tripHubPartyMetaByTripId.get(t.id);
                      const clientOrgFields = linkedOrgAvatarFields(
                        party?.clientLinkedOrgId,
                        linkedOrgByOrganizationId,
                        party?.clientAvatarUrl,
                      );
                      const supplierOrgFields = linkedOrgAvatarFields(
                        party?.supplierLinkedOrgId,
                        linkedOrgByOrganizationId,
                        party?.supplierAvatarUrl,
                      );
                      return (
                        <TripsHubTripCard
                          key={t.id}
                          trip={t}
                          softPodReceived={hubSoftPodChipState(
                            softPodCheckedTripIds.has(t.id.trim().toLowerCase()),
                            tripHasHubPodFlag(tripIdsWithDocuments, t.id),
                          )}
                          hardPodReceived={
                            tripHasHubPodFlag(hardPodTripIds, t.id) ||
                            tripPodIsReceived(t)
                          }
                          ewayExpiryLabel={
                            ewayExpiryByTripId[t.id.trim().toLowerCase()] ??
                            null
                          }
                          lrLabel={hubLrLabelFor(t.id)}
                          elrLabel={hubElrLabelFor(t.id)}
                          canEditLr={canEditHubLrFor(t)}
                          onPressLr={openHubLrEdit}
                          highlighted={
                            lastOpenedTripId === t.id ||
                            tripSearchHighlightId === t.id
                          }
                          currentOrganizationId={
                            currentOrganization?.id ?? null
                          }
                          kindPillMeta={
                            party
                              ? {
                                  supplierLinkedOrgId: party.supplierLinkedOrgId,
                                  driverTrackingOnly: party.driverTrackingOnly,
                                }
                              : null
                          }
                          financeAdjustments={tripFinanceAdjForHubLookup(
                            tripFinanceAdjForHub,
                            t.id,
                          )}
                          hubCostContext={{
                            subcontractRate:
                              hubSubcontractRateByTripId.get(t.id) ?? null,
                            nonSupplierExpenseTotal:
                              tripNonSupplierOutflowTotal(cardLedgerRows),
                          }}
                          displayClientName={displayClientName}
                          displaySupplierName={party?.displaySupplierName ?? ""}
                          displayDriverName={party?.displayDriverName ?? ""}
                          clientAvatarUrl={party?.clientAvatarUrl ?? null}
                          clientAvatarSeed={party?.clientAvatarSeed ?? null}
                          clientAvatarFallbackSeed={party?.clientFallbackSeed}
                          clientOrganizationImageUrl={
                            clientOrgFields.organizationImageUrl
                          }
                          clientOrganizationAvatarSeed={
                            clientOrgFields.organizationAvatarSeed
                          }
                          supplierAvatarUrl={party?.supplierAvatarUrl ?? null}
                          supplierAvatarSeed={party?.supplierAvatarSeed ?? null}
                          supplierAvatarFallbackSeed={party?.supplierFallbackSeed}
                          supplierOrganizationImageUrl={
                            supplierOrgFields.organizationImageUrl
                          }
                          supplierOrganizationAvatarSeed={
                            supplierOrgFields.organizationAvatarSeed
                          }
                          clientIntegrated={party?.clientIntegrated}
                          supplierIntegrated={party?.supplierIntegrated}
                          driverAvatarUrl={party?.driverAvatarUrl ?? null}
                          driverAvatarSeed={party?.driverAvatarSeed ?? null}
                          cardDate={getTripCardDate(t)}
                          stageLabel={stage}
                          onOpenTrip={openTripDetail}
                          layoutCompact={tripsHubLayoutCompact}
                          viewportWidth={width}
                          tr={tr}
                          ledgerReceivedTotal={hubLedger.receivedTotal}
                          ledgerPaidTotal={hubLedger.paidTotal}
                          ledgerTxnCount={hubLedger.count}
                          lastLedgerDateLabel={
                            hubLedger.lastAtIso
                              ? formatLedgerDate(hubLedger.lastAtIso)
                              : undefined
                          }
                          inTransitPing={getTripHubInTransitPing(
                            inTransitPingByTripId,
                            t.id,
                          )}
                        />
                      );
                    })}
                  </TripsHubMobileTripListCanvas>
                  )
                }
              />
            </View>
          )}
        </ScrollView>
      <TripsLedgerExportModalGate
        // Ops sheet waits for stage times, LR and driver numbers so no column is blank.
        active={
          tripLedgerExportOpen &&
          !(useOpsTripExport && (opsExportLoading || opsExportFailed))
        }
        visible={tripLedgerExportOpen}
        onClose={() => setTripLedgerExportOpen(false)}
        transactions={[]}
        title={useOpsTripExport ? "Trips Export" : "Trips Ledger Export"}
        hideCashSummary
        customReport={useOpsTripExport ? tripOpsExportReport : tripLedgerExportReport}
      />
    </View>
    </HubScreenShell>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, minHeight: 0, backgroundColor: TRIPS_PAGE_BG },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  message: { fontSize: 16, color: Theme.textSecondary },
  headerBlock: {
    backgroundColor: Theme.darkBackground,
    width: "100%",
    paddingTop: 12,
  },
  tabRowWeb: {
    flexDirection: "row",
    justifyContent: "center",
    paddingHorizontal: Layout.screenPaddingHorizontal,
    marginTop: 2,
    marginBottom: 4,
    paddingBottom: 6,
  },
  tabRowScroll: {
    flexGrow: 0,
    borderBottomWidth: 0,
  },
  tabRowWebSub: {
    flexDirection: "row",
    justifyContent: "center",
    paddingHorizontal: Layout.screenPaddingHorizontal,
    marginTop: 2,
    marginBottom: 4,
    paddingBottom: 6,
  },
  tabRowScrollSub: {
    flexGrow: 0,
    borderBottomWidth: 0,
  },
  tripsMobileTopFilterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 8,
    paddingBottom: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
  },
  tripsMobileMainTabs: {
    flex: 0.75,
    minWidth: 0,
    borderBottomWidth: 0,
  },
  tripsMobileSubTabs: {
    flex: 1.25,
    minWidth: 0,
    borderBottomWidth: 0,
  },
  tripsMobileTab: {
    minWidth: 62,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 34,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  tripsMobileSubTabText: {
    fontSize: 7,
    letterSpacing: 1.1,
  },
  tabRowScrollContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 0,
    paddingTop: 4,
    paddingBottom: 4,
  },
  tab: {
    position: "relative" as const,
    minWidth: 80,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  tabWeb: {
    flex: 1,
    minWidth: 56,
    position: "relative" as const,
    paddingVertical: 6,
    justifyContent: "center",
    alignItems: "center",
  },
  tabActive: {
    backgroundColor: Theme.screenBackground,
  },
  tabText: {
    fontSize: 10,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 1.6,
    color: Theme.textMuted,
  },
  tabTextActive: { color: Theme.textPrimaryDark },
  tabActiveMobileDark: {
    backgroundColor: Theme.screenBackground,
    borderColor: Theme.screenBackground,
  },
  tabTextMobileDark: {
    color: Theme.textOnDarkMuted,
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 1.3,
  },
  tabTextActiveMobileDark: {
    color: Theme.textPrimaryDark,
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 1.3,
  },
  tabUnderline: {
    position: "absolute",
    bottom: 2,
    left: 10,
    right: 10,
    height: 2.5,
    backgroundColor: Theme.tabUnderline,
    borderRadius: 999,
  },
  /** Native: one horizontal track for main (underline) + sub (pills) — no double underline. */
  tripsMobileTabsScroll: {
    maxHeight: 50,
    minWidth: 0,
    alignSelf: "stretch",
    ...Platform.select({
      web: { width: "100%" as const, maxWidth: "100%" as const },
    }),
  },
  tripsMobileTabsScrollContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingLeft: 0,
    paddingRight: 0,
    paddingTop: 8,
    paddingBottom: Layout.spacingMedium,
    flexGrow: 0,
  },
  tripsFilterGroupSeparator: {
    width: 1,
    height: 22,
    backgroundColor: Theme.borderLight,
    marginHorizontal: 10,
    flexShrink: 0,
  },
  tabSubPill: {
    minWidth: 74,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: Theme.liquidPillBg,
    borderWidth: 1,
    borderColor: Theme.liquidPillBorder,
    justifyContent: "center",
    alignItems: "center",
  },
  tabSubPillActive: {
    backgroundColor: Theme.darkBackground,
    borderColor: Theme.darkBackground,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
    elevation: 2,
  },
  tabSubPillText: {
    fontSize: 10,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.9,
    color: Theme.textSecondary,
  },
  tabSubPillTextActive: {
    color: Theme.textOnDark,
  },
  /** Native: search + sort + date chips in one side-scrollable row. */
  tripsToolbarScroll: {
    maxHeight: 58,
    minWidth: 0,
    alignSelf: "stretch",
    ...Platform.select({
      web: { width: "100%" as const, maxWidth: "100%" as const },
    }),
  },
  tripsToolbarScrollContent: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 2,
    paddingBottom: 10,
    gap: 8,
  },
  /** In horizontal scroll, do not use flex:1 (avoids zero-width search). */
  tripsSearchWrapInToolbarScroll: {
    flexGrow: 0,
    flexShrink: 0,
    flex: 0,
    width: 220,
    minHeight: 40,
  },
  /** Network / Treasury-style: search + supply chips (stacked narrow, row on wide web). */
  tripsToolbar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 10,
    paddingBottom: 10,
    backgroundColor: "transparent",
    gap: 10,
  },
  tripsLayoutToggle: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Theme.screenBackground,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    padding: 3.5,
    gap: 3,
  },
  tripsLayoutToggleBtn: {
    width: 38,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  tripsLayoutToggleBtnActive: {
    backgroundColor: Theme.darkBackground,
  },
  tripsToolbarActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 0,
    flexShrink: 0,
    minWidth: 0,
  },
  tripsSearchWrap: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    minHeight: 40,
    borderRadius: 13,
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    paddingHorizontal: 13,
    paddingVertical: 0,
    minWidth: 0,
  },
  tripsSearchWrapRow: {
    flex: 1,
  },
  /** Web: avoid default focus ring clashing with dark field (RN web). */
  tripsSearchWrapWeb: {
    outlineStyle: "none",
    outlineWidth: 0,
  } as unknown as ViewStyle,
  tripsSearchWrapWebCompact: {
    flex: 0,
    width: 240,
    minWidth: 160,
    maxWidth: 300,
  },
  tripsSearchIcon: { marginRight: 8 },
  tripsSearchInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    paddingVertical: 0,
  },
  tripsSearchInputWeb: {
    outlineStyle: "none",
    outlineWidth: 0,
  } as unknown as TextStyle,
  tripsFilterIconBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    alignItems: "center",
    justifyContent: "center",
    ...Platform.select({
      web: {
        outlineStyle: "none",
      } as object,
    }),
  },
  tripsFilterCountBadge: {
    position: "absolute",
    top: -5,
    right: -5,
    minWidth: 15,
    height: 15,
    borderRadius: 999,
    paddingHorizontal: 3,
    backgroundColor: Theme.accentGold,
    alignItems: "center",
    justifyContent: "center",
  },
  tripsFilterCountBadgeText: {
    color: Theme.brandBlueInk,
    fontSize: 8,
    fontWeight: "800",
    lineHeight: 10,
  },
  tripsMobileDateInlineRow: {
    flex: 1,
    minWidth: 96,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  tripsMobileDateChip: {
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  tripsDateFilterRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 10,
    paddingBottom: 12,
    gap: 10,
    backgroundColor: "#000000",
    borderBottomWidth: 1,
    borderBottomColor: Theme.separatorDark,
  },
  tripsDateChipsScroll: {
    flex: 1,
    flexGrow: 1,
    flexShrink: 1,
  },
  tripsDateChipsContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 6,
    paddingRight: 4,
    paddingLeft: 0,
  },
  tripsDateChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: Theme.darkSurface,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    flexDirection: "row",
    alignItems: "center",
  },
  tripsDateChipActive: {
    backgroundColor: "rgba(255,255,255,0.16)",
    borderColor: "rgba(255,255,255,0.22)",
  },
  tripsDateChipCustom: {
    backgroundColor: Theme.accentGold,
    borderColor: Theme.accentGold,
    gap: 6,
  },
  tripsDateChipCustomIcon: {
    marginRight: 2,
  },
  tripsDateChipCustomClose: {
    marginLeft: 4,
    paddingLeft: 6,
    borderLeftWidth: 1,
    borderLeftColor: "rgba(255,255,255,0.25)",
  },
  tripsDateChipText: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textOnDarkMuted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  tripsDateChipTextActive: {
    color: Theme.textOnDark,
  },
  tripsDateRangeIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderColor: Theme.separatorDark,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  tripsDateRangeIconBtnActive: {
    backgroundColor: Theme.accentGold,
    borderColor: Theme.accentGold,
  },
  dropdownItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    position: "relative",
  },
  dropdownItemActive: {
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  dropdownItemAccent: {
    position: "absolute",
    left: 0,
    top: 10,
    bottom: 10,
    width: 3,
    borderRadius: 2,
    backgroundColor: Theme.accentGold,
  },
  dropdownItemIconWrap: {
    width: 26,
    height: 26,
    borderRadius: 6,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  dropdownItemIconWrapActive: {
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  dropdownItemText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    color: Theme.textOnDark,
    letterSpacing: 0.2,
  },
  dropdownItemTextActive: {
    color: Theme.textOnDark,
    fontWeight: "700",
  },
  dropdownItemCheck: {
    marginLeft: 6,
  },
  tripsSupplyChipsScroll: {
    flex: 1,
    minWidth: 0,
    flexShrink: 1,
  },
  tripsSupplyChipsScrollRow: {
    flexGrow: 0,
    flexShrink: 0,
    alignSelf: "auto",
  },
  tripsSupplyChipsScrollInner: {
    alignItems: "center",
    justifyContent: "flex-start",
    paddingRight: 2,
  },
  tripsSupplyChipsRail: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 0,
    alignSelf: "flex-start",
    backgroundColor: Theme.darkSurface,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    paddingHorizontal: 6,
    paddingVertical: 4,
    gap: 3,
  },
  tripsSupplyChip: {
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 999,
  },
  tripsSupplyChipWeb: { cursor: "pointer" } as ViewStyle,
  tripsSupplyChipActive: {
    backgroundColor: "rgba(255,255,255,0.15)",
  },
  tripsSupplyChipText: {
    fontSize: 8,
    fontWeight: "500",
    color: Theme.textOnDarkMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  tripsSupplyChipTextActive: {
    color: Theme.textOnDark,
  },
  gridContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: -6,
    alignItems: "stretch",
    paddingTop: 0,
    marginTop: 0,
    rowGap: 4,
  },
  /** Desktop trips grid — column % comes from hubGridItemStyle. */
  gridItem: {
    paddingHorizontal: 6,
    marginBottom: 14,
    alignSelf: "stretch",
  },
  tripsTableHScrollContent: {
    paddingBottom: 8,
    flexGrow: 1,
  },
  tripsTableMinWidth: {
    flexGrow: 1,
  },
  tripsTablePaginationRow: {
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingHorizontal: 2,
  },
  tripsTablePaginationMeta: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textMuted,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  tripsTablePaginationRowBottom: {
    marginTop: 8,
    marginBottom: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingHorizontal: 2,
  },
  tripsTablePaginationRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  tripsTablePageSizeWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 999,
    padding: 2,
  },
  tripsTablePageSizePill: {
    minWidth: 34,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  tripsTablePageSizePillActive: {
    backgroundColor: Theme.darkBackground,
  },
  tripsTablePageSizeText: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textMuted,
    letterSpacing: 0.35,
  },
  tripsTablePageSizeTextActive: {
    color: Theme.textOnDark,
  },
  tripsTablePageNavBtn: {
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.screenBackground,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  tripsTablePageNavBtnDisabled: {
    opacity: 0.4,
  },
  tripsTablePageNavText: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    letterSpacing: 0.35,
    textTransform: "uppercase",
  },
  scroll: { flex: 1, backgroundColor: TRIPS_PAGE_BG },
  scrollContent: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 4,
    flexGrow: 1,
    backgroundColor: TRIPS_PAGE_BG,
    /** Web: allow column children (e.g. horizontal ScrollViews) to shrink to viewport, not min-content width. */
    ...Platform.select({
      web: { minWidth: 0, maxWidth: "100%" as const },
    }),
  },
  attributionRequestsTop: {
    width: "100%",
    marginBottom: 4,
  },
  /** Status + date filters (moved from header) — full-bleed strip above list/table */
  tripsBodyFiltersBleed: {
    marginHorizontal: -Layout.screenPaddingHorizontal,
    marginBottom: 4,
    paddingTop: 4,
    paddingBottom: 0,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    backgroundColor: "transparent",
    borderBottomWidth: 0,
    ...Platform.select({
      web: { minWidth: 0 },
    }),
  },
  /** Narrow web / mobile: one continuous dark strip (tabs + date chips + metric rail). */
  tripsBodyFiltersBleedMobileDark: {
    marginHorizontal: 0,
    paddingHorizontal: 0,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: Theme.darkBackground,
    borderBottomColor: Theme.separatorDark,
  },
  tripsInlineFilterPanel: {
    marginBottom: 4,
    backgroundColor: Theme.screenBackground,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 12,
    overflow: "hidden",
  },
  tripsInlineFilterPanelDesktop: {
    marginBottom: 4,
    backgroundColor: Theme.cardWhite,
    borderTopWidth: 0,
    borderBottomWidth: 0,
    borderRadius: 14,
    overflow: "visible",
    ...Platform.select({
      web: {
        boxShadow: "0 2px 14px rgba(15, 23, 42, 0.05)",
      } as object,
      default: {
        shadowColor: "#0f172a",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 1,
      },
    }),
  },
  tripsInlineFilterPanelMobileLight: {
    marginBottom: 0,
    backgroundColor: Theme.screenBackground,
    borderTopWidth: 0,
    borderBottomWidth: 0,
    borderColor: "transparent",
    borderRadius: 0,
    overflow: "visible",
  },
  tripsInlineFilterRowWeb: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingVertical: 8,
  },
  tripsInlineFilterPanelWeb: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 6,
    paddingBottom: 4,
    gap: 4,
  },
  tripsMobileTabRow: {
    alignItems: "center",
    minHeight: 36,
  },
  tripsAddButtonOnChrome: {
    marginLeft: 8,
    marginBottom: 6,
    flexShrink: 0,
    alignSelf: "center",
  },
  /** Same compact height as Add; square padding so only the download icon shows. */
  tripsReportIconButton: {
    minWidth: 32,
    paddingHorizontal: 8,
  },
  tripsHeaderActionsRow: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 0,
    gap: 4,
  },
  tripsFilterHeaderCompact: {
    flexDirection: "column",
    alignItems: "stretch",
    gap: 6,
  },
  tripsFilterHeaderRightCompact: {
    marginLeft: 0,
    width: "100%",
    justifyContent: "flex-end",
    flexWrap: "wrap",
    rowGap: 6,
  },
  tripsFilterHeaderRowCompact: {
    gap: 8,
  },
  tripsFilterTabRowCompact: {
    gap: 4,
    paddingVertical: 3,
    paddingHorizontal: 3,
    borderRadius: 14,
  },
  tripsFilterTabPillCompact: {
    minHeight: 30,
    paddingVertical: 5,
    paddingHorizontal: 10,
    gap: 4,
  },
  tripsFilterTabLabelCompact: {
    fontSize: 7.5,
    letterSpacing: 0.45,
  },
  tripsFilterIconTrayCompact: {
    gap: 3,
    paddingVertical: 3,
    paddingHorizontal: 3,
    borderRadius: 14,
  },
  tripsFilterIconBtnCompact: {
    width: 30,
    height: 30,
  },
  tripsTopHeaderRowWeb: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    minHeight: 36,
  },
  tripsMainTabsRowWeb: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flexShrink: 0,
  },
  tripsMainTabsRowWebCompact: {
    width: "auto" as const,
    alignSelf: "auto",
    justifyContent: "flex-end",
    marginLeft: "auto",
    flexShrink: 0,
  },
  tripsTopHeaderSpacer: {
    flex: 1,
  },
  tripsMainTabsPillWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    padding: 4,
    borderRadius: 999,
    backgroundColor: Theme.liquidPillBg,
    borderWidth: 1,
    borderColor: Theme.liquidPillBorder,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 0,
  },
  tripsMainTabsPillWrapMobile: {
    gap: 2,
    padding: 3,
  },
  tripsMainPillWeb: {
    minWidth: 104,
    borderRadius: 999,
    paddingVertical: 9,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
    ...Platform.select({
      web: {
        outlineStyle: "none",
      } as object,
    }),
  },
  tripsMainPillWebMobile: {
    minWidth: 86,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  tripsMainPillActiveWeb: {
    backgroundColor: Theme.darkBackground,
    shadowOpacity: 0,
    elevation: 0,
  },
  tripsMainPillTextWeb: {
    fontSize: 10,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 1.1,
    color: Theme.textMuted,
  },
  tripsMainPillTextActiveWeb: {
    color: Theme.textOnDark,
  },
  tripsBottomHeaderRowWeb: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "nowrap",
  },
  tripsBottomHeaderRowWebCompact: {
    flexDirection: "column",
    alignItems: "stretch",
    gap: 10,
  },
  tripsTabClusterWeb: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    flexShrink: 0,
    backgroundColor: Theme.liquidPillBg,
    borderWidth: 1,
    borderColor: Theme.liquidPillBorder,
    borderRadius: 999,
    paddingHorizontal: 4,
    paddingVertical: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
  tripsTabClusterWebCompact: {
    alignSelf: "center",
    maxWidth: "100%",
    flexWrap: "wrap",
  },
  tripsScopePillWeb: {
    minWidth: 92,
    borderRadius: 999,
    backgroundColor: "transparent",
    borderColor: "transparent",
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 14,
    ...Platform.select({
      web: {
        outlineStyle: "none",
      } as object,
    }),
  },
  tripsScopePillActiveWeb: {
    backgroundColor: Theme.darkBackground,
    borderColor: Theme.darkBackground,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.16,
    shadowRadius: 7,
    elevation: 2,
  },
  tripsScopePillTextWeb: {
    color: Theme.textMuted,
    letterSpacing: 1,
  },
  tripsScopePillTextActiveWeb: {
    color: Theme.textOnDark,
  },
  tabWebCompact: {
    minWidth: 66,
    position: "relative" as const,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  /** Sub-tabs on web: same pill look as native (not a second red underline). */
  tabSubPillWeb: {
    minWidth: 58,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  tabTextSubCompact: {
    fontSize: 7,
    letterSpacing: 1.2,
  },
  tripsToolbarWeb: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
    flexWrap: "nowrap",
    justifyContent: "flex-end",
    paddingHorizontal: 0,
    paddingVertical: 0,
    backgroundColor: "transparent",
  },
  tripsToolbarWebCompact: {
    width: "100%",
    justifyContent: "space-between",
    flexWrap: "nowrap",
    rowGap: 0,
    alignItems: "center",
  },
  tripsSearchWrapWebFluid: {
    flex: 1,
    width: "auto" as const,
    minWidth: 190,
    maxWidth: "100%" as const,
  },
  tripsSearchWrapWebMobile: {
    minWidth: 140,
  },
  tripsDateInlineRowWeb: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 0,
    marginLeft: 2,
  },
  tripMetricsGrid: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    paddingBottom: 8,
    paddingRight: 4,
  },
  tripMetricsScroll: {
    marginBottom: 2,
    paddingBottom: 0,
    borderBottomWidth: 0,
  },
  tripMetricTabsScroll: {
    marginBottom: 4,
    borderRadius: 22,
    backgroundColor: Theme.darkBackground,
    borderWidth: 1,
    borderColor: Theme.separatorDark,
  },
  tripMetricTabsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 7,
  },
  tripHistoryMobileTabsWrap: {
    marginBottom: 8,
  },
  tripMetricTabPill: {
    minWidth: 104,
    paddingVertical: 9,
    paddingHorizontal: 14,
  },
  tripMetricTabPillDark: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  tripMetricTabPillDarkActive: {
    backgroundColor: Theme.buttonPrimary,
    borderColor: Theme.primary,
  },
  tripMetricTabText: {
    letterSpacing: 0.9,
    color: "rgba(255,255,255,0.66)",
  },
  tripMetricTabTextDarkActive: {
    color: Theme.textOnDark,
  },
  metricTagRailScrollMobile: {
    marginBottom: 2,
    borderRadius: 0,
    backgroundColor: "transparent",
    borderWidth: 0,
    borderColor: "transparent",
    minWidth: 0,
    alignSelf: "stretch",
    ...Platform.select({
      web: { width: "100%" as const, maxWidth: "100%" as const },
    }),
  },
  metricTagRailMobile: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 0,
    paddingTop: Layout.spacingMedium,
    paddingBottom: 4,
    marginTop: Layout.spacingMedium,
    borderTopWidth: 1,
    borderTopColor: Theme.separatorDark,
  },
  metricTagChipMobile: {
    minHeight: 34,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
    backgroundColor: "rgba(255,255,255,0.05)",
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  metricTagChipMobileActive: {
    backgroundColor: Theme.screenBackground,
    borderColor: Theme.screenBackground,
  },
  metricTagLabelMobile: {
    fontSize: 8,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1.3,
    color: Theme.textOnDarkMuted,
  },
  metricTagLabelMobileActive: {
    color: Theme.textPrimaryDark,
  },
  metricTagCountMobile: {
    width: 24,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.10)",
  },
  metricTagCountMobileActive: {
    backgroundColor: "rgba(15,23,42,0.10)",
  },
  metricTagCountTextMobile: {
    fontSize: 9,
    fontWeight: "800",
    color: "rgba(255,255,255,0.72)",
    fontVariant: ["tabular-nums"],
  },
  metricTagCountTextMobileActive: {
    color: Theme.textPrimaryDark,
  },
  metricTabHintMobile: {
    marginTop: 2,
    fontSize: 9,
    fontWeight: "600",
    color: Theme.textMuted,
  },
  metricTabHintMobileActive: {
    color: "rgba(241,245,249,0.75)",
  },
  metricTabCountMobile: {
    minWidth: 30,
    paddingHorizontal: 8,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(15,23,42,0.08)",
    borderWidth: 1,
    borderColor: "rgba(15,23,42,0.12)",
  },
  metricTabCountMobileActive: {
    backgroundColor: "rgba(255,255,255,0.18)",
    borderColor: "rgba(255,255,255,0.28)",
  },
  metricTabCountTextMobile: {
    fontSize: 12,
    fontWeight: "900",
    color: Theme.textPrimaryDark,
  },
  metricTabCountTextMobileActive: {
    color: Theme.textOnDark,
  },
  tripMetricsGridWeb: {
    justifyContent: "flex-start",
    alignItems: "stretch",
    gap: 8,
    width: "100%" as const,
    paddingRight: 0,
  },
  tripMetricsGroupColumn: {
    flexDirection: "column",
    alignItems: "flex-start",
    flexShrink: 0,
    marginRight: 4,
  },
  tripMetricsGroupColumnWeb: {
    flex: 1,
    minWidth: 0,
    marginRight: 0,
  },
  tripMetricsGroupColumnAllWeb: {
    flex: 0.85,
    minWidth: 0,
    maxWidth: "12%" as const,
    marginRight: 0,
  },
  tripMetricsGroupColumnIntakeWeb: {
    flex: 1,
    minWidth: 0,
    maxWidth: "14%" as const,
    marginRight: 0,
  },
  tripMetricsGroupColumnInMotionWeb: {
    flex: 5,
    minWidth: 0,
    marginRight: 0,
  },
  metricGroupLabel: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1.1,
    marginBottom: 6,
    paddingLeft: 2,
  },
  tripMetricsBundleRail: {
    flexDirection: "row",
    flexWrap: "nowrap",
    alignItems: "stretch",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: "rgba(15, 23, 42, 0.06)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(15, 23, 42, 0.08)",
  },
  tripMetricsBundleRailWeb: {
    width: "100%" as const,
  },
  tripHistoryPairRail: {
    flexDirection: "row",
    flexWrap: "nowrap",
    alignItems: "stretch",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: "rgba(15, 23, 42, 0.06)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(15, 23, 42, 0.08)",
  },
  tripHistoryPairRailWeb: {
    width: "100%" as const,
  },
  tripMetricBento: {
    backgroundColor: "transparent",
    padding: 0,
    overflow: "hidden",
    borderColor: "rgba(255, 255, 255, 0.12)",
  },
  tripMetricBentoActive: {
    borderColor: Theme.primary,
    borderWidth: 2,
    backgroundColor: "transparent",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 12,
    elevation: 7,
    transform: [{ translateY: -2 }],
  },
  tripMetricBentoInactive: {
    backgroundColor: Theme.cardWhite,
    borderColor: Theme.cinematicCardBorder,
    ...Platform.select({
      web: {
        boxShadow: "0 1px 2px rgba(15,23,42,0.06), 0 4px 12px rgba(15,23,42,0.04)",
      },
      default: {
        shadowColor: Theme.shadow,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 6,
        elevation: 2,
      },
    }),
  },
  historyMetricAccentBar: {
    position: "absolute",
    left: 0,
    top: 12,
    bottom: 12,
    width: 3,
    borderTopRightRadius: 3,
    borderBottomRightRadius: 3,
    backgroundColor: Theme.buttonPrimary,
    opacity: 0.85,
    zIndex: 2,
  },
  historyMetricAccentBarActive: {
    opacity: 1,
    top: 10,
    bottom: 10,
    width: 4,
  },
  tripMetricTileShrinkNone: {
    flexShrink: 0,
    alignSelf: "stretch",
  },
  metricCardHintAtBottom: {
    marginTop: "auto" as const,
  },
  metricBentoHeadRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
  },
  metricBentoIconWrap: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.35)",
    backgroundColor: "rgba(15,23,42,0.45)",
  },
  metricBentoIconWrapLight: {
    borderColor: "rgba(15,23,42,0.18)",
    backgroundColor: "rgba(15,23,42,0.08)",
  },
  tripMetricTile: {
    width: 188,
    minHeight: Platform.OS === "web" ? 118 : 102,
    paddingVertical: Platform.OS === "web" ? 18 : 14,
    paddingHorizontal: 16,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.screenBackground,
  },
  tripMetricTileHero: {
    width: 220,
    backgroundColor: Theme.darkBackground,
    borderColor: Theme.darkBackground,
  },
  tripMetricTileWeb: {
    flex: 1,
    flexBasis: 0,
    width: "auto" as const,
    minWidth: 110,
    minHeight: 124,
  },
  tripMetricTileHeroWeb: {
    width: 248,
  },
  tripMetricTileActive: {
    borderColor: Theme.primary,
    backgroundColor: Theme.surface,
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 2,
  },
  tripMetricTileHeroActive: {
    backgroundColor: Theme.darkBackground,
    borderColor: Theme.primary,
  },
  historyMetricCardShell: {
    padding: 0,
    overflow: "hidden",
    backgroundColor: "transparent",
  },
  /** Bento content: flex so hint can sit at bottom when row stretch aligns card heights. */
  historyMetricInner: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    paddingVertical: 14,
    paddingHorizontal: 15,
    paddingLeft: 18,
    zIndex: 1,
    width: "100%" as const,
    flexDirection: "column",
  },
  /** Bento tile typography — tuned for 188px card width, left-aligned, even vertical rhythm. */
  metricBentoValue: {
    fontSize: Platform.OS === "web" ? 28 : 22,
    fontWeight: "900",
    fontStyle: "italic",
    letterSpacing: -0.4,
    lineHeight: Platform.OS === "web" ? 31 : 26,
    marginBottom: 4,
    textAlign: "left" as const,
  },
  metricBentoValueOnDark: {
    color: Theme.textOnDark,
  },
  metricBentoValueOnLight: {
    color: Theme.textPrimaryDark,
  },
  metricBentoLabel: {
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    lineHeight: 13,
    textAlign: "left" as const,
    width: "100%" as const,
  },
  metricBentoLabelOnDark: {
    color: "rgba(255,255,255,0.88)",
  },
  metricBentoLabelOnLight: {
    color: Theme.textPrimaryDark,
  },
  metricBentoLabelOnDarkActive: {
    color: "rgba(255,255,255,0.97)",
  },
  metricBentoSubtext: {
    fontSize: 9,
    fontWeight: "500",
    lineHeight: 12,
    textAlign: "left" as const,
    width: "100%" as const,
  },
  metricBentoSubtextOnDark: {
    color: "rgba(255,255,255,0.55)",
  },
  metricBentoSubtextOnLight: {
    color: Theme.textSecondary,
  },
  historyMetricWatermarkOrbs: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden",
  },
  historyWmLightBlobA: {
    position: "absolute",
    top: -44,
    right: -32,
    width: 128,
    height: 128,
    borderRadius: 64,
    backgroundColor: "rgba(15, 23, 42, 0.05)",
  },
  historyWmLightBlobB: {
    position: "absolute",
    bottom: -26,
    left: -20,
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: "rgba(79, 70, 229, 0.06)",
  },
  historyWmReceiveBlobA: {
    backgroundColor: "rgba(21, 128, 61, 0.1)",
  },
  historyWmReceiveBlobB: {
    backgroundColor: "rgba(4, 120, 87, 0.07)",
  },
  historyWmClearedPayBlobA: {
    backgroundColor: "rgba(21, 128, 61, 0.08)",
  },
  historyWmClearedPayBlobB: {
    backgroundColor: "rgba(15, 23, 42, 0.06)",
  },
  historyWmPayBlobA: {
    backgroundColor: "rgba(232, 33, 39, 0.1)",
  },
  historyWmPayBlobB: {
    backgroundColor: "rgba(15, 23, 42, 0.06)",
  },
  historyWmHeroBlobA: {
    position: "absolute",
    top: -56,
    right: -40,
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: "rgba(255, 255, 255, 0.07)",
  },
  historyWmHeroBlobB: {
    position: "absolute",
    bottom: -28,
    left: -32,
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "rgba(99, 102, 241, 0.12)",
  },
  historyMetricTileAttention: {
    borderColor: Theme.accentGold,
    borderWidth: 1.5,
    shadowColor: Theme.accentGoldMuted,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 3,
  },
  historyMetricAmountOnDark: {
    color: "rgba(248, 250, 252, 0.55)",
  },
  historyMetricAmountOnLight: {
    color: Theme.textSecondary,
  },
  historyMetricTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  historyMetricAmount: {
    marginTop: 0,
    flexShrink: 1,
    fontSize: 12,
    fontWeight: "900",
    color: Theme.textSecondary,
    letterSpacing: -0.1,
  },
  historyMetricAmountBento: {
    fontSize: 10.5,
    lineHeight: 13.5,
  },
  historyMetricAmountDue: {
    color: Theme.teslaRed,
  },
  tripMetricCount: {
    fontSize: 24,
    fontWeight: "900",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.6,
    marginBottom: 6,
  },
  tripMetricCountHero: {
    color: Theme.textOnDark,
  },
  tripMetricCountActive: {
    color: Theme.textOnDark,
  },
  tripMetricCountHeroActive: {
    color: Theme.textOnDark,
  },
  tripMetricTitle: {
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    color: Theme.textMuted,
    lineHeight: 15,
  },
  tripMetricTitleHero: {
    color: "rgba(255,255,255,0.84)",
  },
  tripMetricTitleActive: {
    color: Theme.textPrimaryDark,
  },
  tripMetricTitleHeroActive: {
    color: "rgba(255,255,255,0.92)",
  },
  tripMetricHint: {
    marginTop: 6,
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textSecondary,
    lineHeight: 13,
  },
  tripMetricHintHero: {
    color: "rgba(255,255,255,0.56)",
  },
  tripsBodyStatusRowWeb: {
    flexDirection: "row",
    justifyContent: "center",
    paddingBottom: 10,
    marginBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
  },
  tripsBodyStatusScroll: {
    flexGrow: 0,
    marginBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
  },
  tripsBodyStatusScrollContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
    paddingVertical: 4,
    gap: 4,
  },
  tripsBodyStatusTabWeb: {
    flex: 1,
    minWidth: 72,
    position: "relative" as const,
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  tripsBodyStatusTab: {
    position: "relative" as const,
    minWidth: 72,
    paddingVertical: 8,
    paddingHorizontal: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  tripsBodyStatusTabActive: {},
  tripsBodyStatusTabText: {
    fontSize: 8,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1.5,
    color: Theme.textMuted,
  },
  tripsBodyStatusTabTextActive: {
    color: Theme.textPrimaryDark,
  },
  tripsBodyStatusUnderline: {
    position: "absolute",
    bottom: 0,
    left: 8,
    right: 8,
    height: 2,
    backgroundColor: Theme.loaderAccent,
    borderRadius: 1,
  },
  tripsBodyDateFilterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingTop: 2,
  },
  tripsBodyDateChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: Theme.surfaceGray,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    flexDirection: "row",
    alignItems: "center",
  },
  tripsBodyDateChipActive: {
    backgroundColor: Theme.screenBackground,
    borderColor: Theme.textPrimaryDark,
  },
  tripsBodyDateChipText: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  tripsBodyDateChipTextActive: {
    color: Theme.textPrimaryDark,
  },
  tripsBodyDateChipMobileDark: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderColor: "rgba(255,255,255,0.10)",
  },
  tripsBodyDateChipActiveMobileDark: {
    backgroundColor: "rgba(255,255,255,0.14)",
    borderColor: "rgba(255,255,255,0.22)",
  },
  tripsBodyDateChipTextMobileDark: {
    color: "rgba(255,255,255,0.62)",
  },
  tripsBodyDateChipTextActiveMobileDark: {
    color: Theme.textOnDark,
  },
  tripsBodyDateRangeIconBtnMobileDark: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderColor: "rgba(255,255,255,0.12)",
  },
  tripsBodyDateRangeIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: Theme.surfaceGray,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  emptyBannerStage: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    minHeight: 240,
    flexGrow: 1,
    backgroundColor: "transparent",
  },
  tripsHubListShell: {
    flexGrow: 1,
    minHeight: 0,
    width: "100%",
  },
  empty: {
    padding: 24,
    textAlign: "center",
    color: Theme.textSecondary,
  },
  fabWrap: {
    position: "absolute",
  },
  card: {
    borderWidth: 1,
    borderColor: Theme.borderLight,
    padding: 12,
    marginBottom: 10,
    backgroundColor: Theme.screenBackground,
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  cardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 10,
  },
  cardTopRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  sourcePill: {
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 1,
    backgroundColor: Theme.surfaceBorder,
  },
  sourcePillShared: {
    backgroundColor: Theme.positiveMuted,
    borderWidth: 1,
    borderColor: Theme.darkGreen,
  },
  tripTypePillAggregate: {
    backgroundColor: Theme.aggregatePillBg,
    borderWidth: 1,
    borderColor: Theme.aggregatePillBorder,
  },
  tripTypePillTextAggregate: {
    color: Theme.aggregatePillText,
  },
  sourcePillText: {
    fontSize: 5,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    letterSpacing: 0.5,
  },
  cardClient: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
    flex: 1,
    marginRight: 8,
  },
  cardId: { fontSize: 6, fontWeight: "700", color: Theme.textMutedDemo },
  stagePill: {
    backgroundColor: Theme.buttonPrimary,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 1,
  },
  stageText: {
    fontSize: 6,
    fontWeight: "800",
    color: Theme.buttonPrimaryText,
    letterSpacing: 0.5,
  },
  cardRoute: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Theme.surfaceLight,
    marginBottom: 12,
  },
  routeCol: { flex: 1 },
  routeColRight: { alignItems: "flex-end" },
  routeLabel: {
    fontSize: 5,
    fontWeight: "700",
    color: Theme.textMutedDemo,
    textTransform: "uppercase",
    marginBottom: 2,
  },
  routeValue: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
  },
  cardMetaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
    marginBottom: 8,
  },
  metaCol: { flex: 1 },
  metaColRight: { alignItems: "flex-end" },
  metaLabel: {
    fontSize: 5,
    fontWeight: "700",
    color: Theme.textMutedDemo,
    textTransform: "uppercase",
    marginBottom: 1,
  },
  metaValue: {
    fontSize: 8,
    fontWeight: "600",
    color: Theme.textSecondary,
    textTransform: "uppercase",
  },
  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cardMeta: {
    fontSize: 7,
    fontWeight: "700",
    color: Theme.textMutedDemo,
    textTransform: "uppercase",
    flex: 1,
  },
  cardMetaTotal: { color: Theme.textMutedDemo, fontWeight: "600" },
  cardDue: { fontSize: 10, fontWeight: "800", color: Theme.textPrimaryDark },
  cardDueLabel: { fontSize: 5, color: Theme.teslaRed, marginLeft: 2 },
});
