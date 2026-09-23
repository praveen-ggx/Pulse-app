/**
 * Load Center — reference UI: Hire Partners | Find Work | Awarded.
 * Header "Load Center" / "Find or Hire Work", three sub-tabs, cards, modals.
 */
import { PulsePillButton } from "@/components/PulsePillButton";
import { ContentErrorState } from '@/components/ContentErrorState';
import { HUB_GRID_MIN_WIDTH } from "@/components/hub/hubGridCardLayout";
import { HubScreenShell } from "@/components/hub/HubScreenShell";
import { hubMobileChromeStyles as hubChrome } from "@/components/hub";
import { useTabBarAwareScrollProps } from "@/contexts/DemoTabBarScrollContext";
import {
  ClaimedIndentCardActions,
  GetLoadIndentCardActions,
  GiveLoadIndentCardActions,
} from "@/features/network/components/LoadCenterIndentCardActions";
import {
  LoadCenterHubMobileIndentCard,
  LoadCenterHubMobileListCanvas,
} from "@/features/network/components/LoadCenterHubMobileIndentCard";
import {
  LOADS_HUB_PAGE_BG,
  LoadCenterHubMobileShell,
} from "@/features/network/components/LoadCenterHubMobileShell";
import { useLinkedOrgDisplayMap } from "@/lib/queries/useLinkedOrgDisplayQuery";
import type { ClientRow } from "@/features/clients/services/clients.service";
import { useLinkedOrgProfileMap } from "@/lib/useLinkedOrgProfileMap";
import {
  giveLoadIndentAvatarProps,
  indentClientFacesFromParties,
  isSyntheticMergedOrdersClientName,
  resolveMergedOrderCardTitle,
  marketLoadIndentAvatarProps,
} from "@/features/network/utils/indentCardAvatar.util";
import { isTripTrackingActive } from "@/features/trips/utils/tripTrackingStatus.util";
import {
  CHAT_FILTER_MUTED,
  chatFilterChromeStyles as chatChrome,
} from "@/constants/ChatFilterChrome";
import Layout from "@/constants/Layout";
import { useLayoutInsets } from "@/lib/layoutInsets";
import Theme from "@/constants/Theme";
import { useOptionalAwardedIndentDeployModal } from "@/contexts/AwardedIndentDeployModalContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import {
    getIndentDisplayNumber,
    updateIndent,
    type IndentRow,
} from "@/features/indents";
import { confirmDialog } from "@/lib/confirmDialog";
import { shareDraftIndent } from "@/features/indents/services/indents.service";
import { resolveMarketIndentShipperLabel } from "@/features/indents/utils/indentPartyDisplay.util";
import { indentCanBroadcastToPulseNetwork } from "@/features/network/utils/indentBroadcastEligibility.util";
import { indentDisplayOriginDest, indentRoutePlan } from "@/features/network/utils/executionPlanRouteSummary";
import {
  resolveAwardedVendorName,
  resolveGiveLoadAwardedAmountInr,
  supplierNameByLinkedOrgId,
} from "@/features/network/utils/awardedVendorName.util";
import {
    DONE_SUB_TABS,
    getLoadCenterStatusTabLabel,
    resolveGetLoadDoneOutcome,
    resolveGetLoadMobileCardLabels,
    resolveGetLoadSourceTag,
    resolveGetLoadTicketCommerce,
    resolveGiveLoadMobileDisplayStatus,
    resolveGiveLoadTicketCommerce,
    loadCenterShowsStandaloneChrome,
    restrictIndentsToIds,
    STATUS_TABS,
    statusMatchesFilter,
    type DoneSubTab,
    type LoadCenterPresentation,
    type LoadSubTab,
    type StatusFilterTab,
} from "@/features/network/utils/loadCenter.model";
import {
  resolveTripAllocationDisplay,
  type LoadCenterDriverProfile,
} from "@/features/network/utils/loadCenterTripAllocation.util";
import { useAwardQuote } from "@/features/network/hooks/useAwardQuote";
import { useExecutionPlanClients } from "@/features/network/hooks/useExecutionPlanClientNames";
import { extractCommercePlanIds, prioritizeIndentRowsForPlanEnrichment } from "@/features/network/utils/commercePlanIds.util";
import { useExecutionPlanRouteSummaries } from "@/features/network/hooks/useExecutionPlanRouteSummaries";
import { useLoadCenterFilters } from "@/features/network/hooks/useLoadCenterFilters";
import { useSuccessToast } from "@/features/network/hooks/useSuccessToast";
import { useTripDeployment } from "@/features/network/hooks/useTripDeployment";
import { AwardModal } from "@/features/network/components/AwardModal";
import { BidModal } from "@/features/network/components/bidding/BidModal";
import { ShareLoadSheet } from "@/features/network/components/ShareLoadSheet";
import { BoostSheet } from "@/features/reach/components/BoostSheet";
import { queryKeys } from "@/lib/queryKeys";
import { STALE, shouldRetryQuery } from "@/lib/queryClient";
import { LoadCenterKanbanBoard, type LoadCenterKanbanColumn } from "@/features/network/components/LoadCenterKanbanBoard";
import { LoadCenterKanbanColumnModal } from "@/features/network/components/LoadCenterKanbanColumnModal";
import { GIVE_LOAD_KANBAN_COLUMNS, bucketGiveLoadIndentsForKanban, giveLoadKanbanColumnLabel, giveLoadTripKanbanStage } from "@/features/network/utils/giveLoadKanban.util";
import { useOpenTripDetail } from "@/lib/navigation/useOpenTripDetail";
import {
  GET_LOAD_KANBAN_COLUMNS,
  bucketGetLoadIndentsForKanban,
  getLoadKanbanColumnLabel,
} from "@/features/network/utils/getLoadKanban.util";
import { LoadCenterIntegratedPartiesBanner } from "@/features/network/components/LoadCenterIntegratedPartiesBanner";
import { LoadCenterIntegratedPartiesRow } from "@/features/network/components/LoadCenterIntegratedPartiesRow";
import { LoadCenterUnderlineTabStrip } from "@/features/network/components/LoadCenterUnderlineTabStrip";
import { LoadCenterPromoCard } from "@/features/network/components/LoadCenterPromoCard";
import { FindNetworkVehiclesDrawer } from "@/features/network/components/FindNetworkVehiclesDrawer";
import { LoadCenterSidebarFindEmpty } from "@/features/network/components/LoadCenterSidebarFindEmpty";
import {
  LoadCenterOpportunityExchange,
  useLoadCenterOpportunityPosts,
} from "@/features/network/components/LoadCenterOpportunityExchange";
import { LoadCenterPartnerRecommendations } from "@/features/network/components/LoadCenterPartnerRecommendations";
import {
  selectIntegratedClientsForLoadCenter,
  selectIntegratedSuppliersForLoadCenter,
  type LoadCenterIntegratedParty,
} from "@/features/network/utils/loadCenterIntegratedParties.util";
import {
    assignmentShellColors,
} from "@/features/trips/styles/assignmentShellShared";
import { useMemberAccess } from "@/lib/useMemberAccess";
import { formatINR } from "@/lib/format";
import { ROUTES } from "@/lib/routes";
import { resolveLoadCenterPromoVariant } from "@/lib/loadCenterPromoAssets";
import { useAppQueryGate } from "@/lib/hooks/useAppQueryGate";
import {
  APP_QUERY_GATE_UI_MAX_WAIT_MS,
  isEnabledListQueryPending,
} from "@/lib/hooks/appQueryGate.util";
import {
    listOpenMarketplaceLoadsPage,
    type OrgOpenMarketplaceLoad,
} from "@/features/network/services/findLoadsForOrg.service";
import { MARKETPLACE_LOAD_PAGE_SIZE } from "@/features/network/utils/marketplaceLoadsPage.util";
import {
    MarketplaceRouteGrid,
    MarketplaceSpecChips,
    titleCaseWord,
} from "@/features/network/components/MarketplaceLoadCardChrome";
import { useRouter } from "expo-router";
import {
    useIndentOfferCountsQuery,
    useDriversQuery,
    useIndentsQuery,
    useInvalidateIndents,
    useInvalidatePosts,
    useIndentStoryStatesQuery,
    useMarketIndentsQuery,
    useMyDirectQuotesQuery,
    useSuppliersQuery,
    useConnectedSupplierOrgIdsQuery,
    useClientsQuery,
    useTripsQuery,
    useVehiclesQuery,
    useAcceptedDirectQuotesForFinanceQuery,
    prefetchTripDetailBundle,
} from "@/lib/queries";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { Compass, Search } from "lucide-react-native";
import { type FlashListRef } from "@shopify/flash-list";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import * as Linking from "expo-linking";


import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Modal,
    type NativeScrollEvent,
    type NativeSyntheticEvent,
    Platform,
    Pressable,
    RefreshControl,
    ScrollView,
    Share,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    useWindowDimensions,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface LoadCenterViewProps {
  /** Top padding (e.g. from parent sub-tab row + safe area). */
  contentTopPadding?: number;
  /** Opens Network → My Network (connections / invitations). */
  onMyNetworkPress?: () => void;
  onCreateIndentPress: () => void;
  onIndentPress: (indent: IndentRow) => void;
  highlightedIndentId?: string | null;
  /** @deprecated Pulse reboost is handled inside Load Center. */
  onShareToNetwork?: (indent: IndentRow) => void;
  /** Which top-level sub-tab to land on. Default preserves existing behavior. */
  initialSubTab?: LoadSubTab;
  /**
   * Sub-tabs to omit from the switcher entirely (e.g. Loads → Get Load hides
   * GIVE_LOAD now that "My Load" lives under Trips → Indents instead). Default
   * shows all three, unchanged from before this prop existed.
   */
  hiddenSubTabs?: readonly LoadSubTab[];
  /**
   * When set, restricts GIVE_LOAD rendering (both the desktop kanban and the
   * mobile/grid list) to exactly this id set instead of this component's own
   * OPEN/QUOTED/AWARDED/DONE status-tab filtering. Callers that already
   * derive an authoritative membership set (e.g. Trips → INDENT's
   * `unallocatedIndents`) pass it here so the rendered rows are guaranteed to
   * match that set — no independent status filter can hide a qualifying
   * indent or show one that no longer belongs.
   */
  restrictToIndentIds?: ReadonlySet<string> | null;
  /**
   * `trips` hides Load Center chrome (header, My Load, search, idle capacity,
   * kanban stage board) and renders existing indent cards into the Trips page
   * scroll. Standalone `/pulse-loads` stays the default.
   */
  presentation?: LoadCenterPresentation;
}

const TESLA_BLACK = "#171A20";

export function LoadCenterView({
  contentTopPadding = 0,
  onMyNetworkPress,
  onCreateIndentPress,
  onIndentPress,
  highlightedIndentId,
  initialSubTab = "GIVE_LOAD",
  hiddenSubTabs = [],
  restrictToIndentIds = null,
  presentation = "standalone",
}: LoadCenterViewProps) {
  const isTripsPresentation = presentation === "trips";
  const showLoadCenterChrome = loadCenterShowsStandaloneChrome(presentation);
  const insets = useSafeAreaInsets();
  const layout = useLayoutInsets();
  const { width, height: windowHeight } = useWindowDimensions();
  const tabBarScrollProps = useTabBarAwareScrollProps();
  const router = useRouter();
  const { currentOrganization } = useOrganization();
  const { can: canSurface } = useMemberAccess();
  const orgId = currentOrganization?.id ?? null;
  const pendingDeployCount =
    useOptionalAwardedIndentDeployModal()?.pendingDeployCount ?? 0;

  const scrollRef = useRef<FlashListRef<IndentRow>>(null);

  const [loadSubTab, setLoadSubTab] = useState<LoadSubTab>(initialSubTab);
  const [statusFilterTab, setStatusFilterTab] =
    useState<StatusFilterTab>("OPEN");
  const [doneSubTab, setDoneSubTab] = useState<DoneSubTab>("REJECTED");
  const [searchQuery, setSearchQuery] = useState("");
  /** Measured left rail height — syncs desktop Kanban shell to the sidebar. */
  const [partnerSidebarHeight, setPartnerSidebarHeight] = useState<number | null>(
    null,
  );
  const [findMarketplaceMode, setFindMarketplaceMode] = useState<
    "give" | "get" | null
  >(null);
  const [expandedKanbanColumnId, setExpandedKanbanColumnId] = useState<
    string | null
  >(null);
  const [expandedKanbanMode, setExpandedKanbanMode] = useState<
    "give" | "get" | null
  >(null);
  /** Indent detail opened from a kanban column expand (stays on that page). */
  const [kanbanDetailIndentId, setKanbanDetailIndentId] = useState<string | null>(
    null,
  );
  const [showPostModal, setShowPostModal] = useState(false);
  const { showSuccess, successMsg, trigger: triggerSuccess } = useSuccessToast();
  const [bidLoad, setBidLoad] = useState<IndentRow | null>(null);
  const [localBidHistoryByIndentId, setLocalBidHistoryByIndentId] = useState<
    Record<string, { amount: number; updatedAt: string }[]>
  >({});
  const { data: indents = [], isLoading, isError: indentsError, refetch: refetchIndents } =
    useIndentsQuery(orgId);
  const loadQueriesOpen = useAppQueryGate(orgId, { urgent: !isTripsPresentation });
  const [uiWaitExpired, setUiWaitExpired] = useState(false);
  const [enrichmentOpen, setEnrichmentOpen] = useState(false);
  useEffect(() => {
    if (!orgId || isTripsPresentation || loadQueriesOpen) {
      setUiWaitExpired(true);
      return;
    }
    setUiWaitExpired(false);
    const t = setTimeout(() => setUiWaitExpired(true), APP_QUERY_GATE_UI_MAX_WAIT_MS);
    return () => clearTimeout(t);
  }, [orgId, isTripsPresentation, loadQueriesOpen]);
  useEffect(() => {
    if (!loadQueriesOpen) {
      setEnrichmentOpen(false);
      return;
    }
    const t = setTimeout(
      () => setEnrichmentOpen(true),
      isTripsPresentation ? 400 : 2_500,
    );
    return () => clearTimeout(t);
  }, [loadQueriesOpen, isTripsPresentation]);
  const enrichmentOrgId = enrichmentOpen ? orgId : null;
  const marketQueryEnabled = loadQueriesOpen && !isTripsPresentation;
  const {
    data: marketIndents = [],
    isLoading: marketLoading,
    isError: marketError,
    isRefetching: marketRefetching,
    refetch: refetchMarketIndents,
    isFetched: marketFetched,
  } = useMarketIndentsQuery(orgId, {
    urgent: !isTripsPresentation,
    enabled: !isTripsPresentation,
  });
  const marketPending = isEnabledListQueryPending({
    enabled: marketQueryEnabled,
    isLoading: marketLoading,
    isFetched: marketFetched,
    isError: marketError,
  });
  const marketplaceQueryEnabled =
    marketQueryEnabled &&
    (marketFetched || marketError) &&
    enrichmentOpen;
  const marketplaceLoadsQ = useInfiniteQuery({
    queryKey: queryKeys.findLoadsForOrg.infinite(
      orgId ?? "",
      MARKETPLACE_LOAD_PAGE_SIZE,
    ),
    queryFn: async ({ pageParam }) => {
      const { error, loads, nextOffset } = await listOpenMarketplaceLoadsPage(
        orgId!,
        pageParam,
        MARKETPLACE_LOAD_PAGE_SIZE,
      );
      if (error) throw error;
      return { loads, nextOffset };
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextOffset,
    enabled: marketplaceQueryEnabled,
    staleTime: STALE.frequent,
    retry: shouldRetryQuery,
    placeholderData: (previousData) => previousData,
  });
  const marketplaceLoads = useMemo(
    () => marketplaceLoadsQ.data?.pages.flatMap((p) => p.loads) ?? [],
    [marketplaceLoadsQ.data],
  );
  const waitingForLoadGate =
    Boolean(orgId) &&
    !isTripsPresentation &&
    !loadQueriesOpen &&
    !uiWaitExpired;
  const getLoadPending = waitingForLoadGate || marketPending;
  const commercePlanIds = useMemo(
    () =>
      extractCommercePlanIds(
        prioritizeIndentRowsForPlanEnrichment([...indents, ...marketIndents]),
      ),
    [indents, marketIndents],
  );
  const { data: planRouteById } = useExecutionPlanRouteSummaries(
    orgId,
    commercePlanIds,
  );
  const { data: planClientsById } = useExecutionPlanClients(
    orgId,
    commercePlanIds,
  );
  const { data: myQuotes = [], refetch: refetchMyQuotes } =
    useMyDirectQuotesQuery(orgId, { urgent: !isTripsPresentation });
  const { data: trips = [] } = useTripsQuery(enrichmentOrgId);
  const { data: drivers = [] } = useDriversQuery(enrichmentOrgId);
  useVehiclesQuery(enrichmentOrgId);
  const { data: suppliers = [] } = useSuppliersQuery(enrichmentOrgId);
  const { data: liveConnectedSupplierOrgIds = [] } =
    useConnectedSupplierOrgIdsQuery(enrichmentOrgId);
  const { data: clients = [] } = useClientsQuery(enrichmentOrgId);
  const linkedOrgByOrganizationId = useLinkedOrgProfileMap(clients, suppliers);
  const integratedSuppliers = useMemo(
    () =>
      selectIntegratedSuppliersForLoadCenter(
        suppliers,
        linkedOrgByOrganizationId,
      ),
    [suppliers, linkedOrgByOrganizationId],
  );
  const integratedClients = useMemo(
    () =>
      selectIntegratedClientsForLoadCenter(clients, linkedOrgByOrganizationId),
    [clients, linkedOrgByOrganizationId],
  );

  const showIntegratedPartiesBanner = useMemo(() => {
    if (loadSubTab === "GIVE_LOAD") return integratedSuppliers.length === 0;
    if (loadSubTab === "GET_LOAD") return integratedClients.length === 0;
    return false;
  }, [loadSubTab, integratedSuppliers.length, integratedClients.length]);

  const integratedPartiesBannerMode = useMemo(
    (): "supplier" | "client" =>
      loadSubTab === "GIVE_LOAD" ? "supplier" : "client",
    [loadSubTab],
  );

  const openNetworkForParties = useCallback(() => {
    if (onMyNetworkPress) {
      onMyNetworkPress();
      return;
    }
    router.push(ROUTES.TABS.NETWORK as import("expo-router").Href);
  }, [onMyNetworkPress, router]);

  const invalidateIndents = useInvalidateIndents();
  const invalidatePosts = useInvalidatePosts(orgId);
  const [pulseShareIndent, setPulseShareIndent] = useState<IndentRow | null>(
    null,
  );
  const [boostSheetVisible, setBoostSheetVisible] = useState(false);
  const [boostPostId, setBoostPostId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { openTripDetail } = useOpenTripDetail();

  const isClaimedTab = loadSubTab === "AWARDED";
  const isGiveGetTab =
    loadSubTab === "GIVE_LOAD" || loadSubTab === "GET_LOAD";

  const formatLoadTabLabel = useCallback(
    (label: string, count: number) => `${label} (${count})`,
    [],
  );

  /** Desktop web: 3 indent cards per row (phones + tablets use hub list cards). */
  const useGridLayout = Platform.OS === "web" && width >= HUB_GRID_MIN_WIDTH;
  const isMobileView = width < 820;
  /** Desktop: Suggested partners sit in a Network-style left sidebar. */
  const usePartnerSidebar =
    Boolean(orgId) && isGiveGetTab && !isMobileView && showLoadCenterChrome;
  /**
   * Same board height for Give Load + Get Load: at least the measured left
   * rail, floored by remaining viewport so neither tab looks short.
   */
  const desktopBoardHeight = useMemo(() => {
    if (!usePartnerSidebar) return null;
    const chrome =
      (layout.isDesktopWeb ? Layout.desktopTopNavOffset : insets.top + 56) +
      contentTopPadding +
      132;
    const viewportFloor = Math.max(600, Math.round(windowHeight - chrome));
    return Math.max(partnerSidebarHeight ?? 0, viewportFloor);
  }, [
    usePartnerSidebar,
    partnerSidebarHeight,
    windowHeight,
    layout.isDesktopWeb,
    insets.top,
    contentTopPadding,
  ]);

  useEffect(() => {
    if (!highlightedIndentId || useGridLayout) return;
    const t = setTimeout(() => {
      scrollRef.current?.scrollToItem({
        animated: true,
        item: { id: highlightedIndentId } as IndentRow,
        viewPosition: 0.5,
      });
    }, 500);
    return () => clearTimeout(t);
  }, [highlightedIndentId, useGridLayout]);

  // ── Filter pipeline ─────────────────────────────────────────────────────────
  // hirePartnerLoads is needed before giveLoadIds so we compute it first.
  const hirePartnerLoadsForIds = useMemo(
    () => indents.filter((i) => i.organization_id === orgId),
    [indents, orgId],
  );
  const giveLoadIds = useMemo(
    () =>
      hirePartnerLoadsForIds
        .filter((i) => {
          const s = (i.status || "").toLowerCase();
          return s !== "awarded" && s !== "completed" && s !== "cancelled";
        })
        .map((l) => l.id),
    [hirePartnerLoadsForIds],
  );
  const { data: quoteCounts = {}, refetch: refetchQuoteCounts } =
    useIndentOfferCountsQuery(orgId, giveLoadIds);
  const { data: indentStoryStates = {}, refetch: refetchIndentStories } =
    useIndentStoryStatesQuery(orgId, giveLoadIds);

  const filters = useLoadCenterFilters({
    orgId,
    indents,
    marketIndents,
    myQuotes,
    trips,
    quoteCounts,
    loadSubTab,
    statusFilterTab,
    doneSubTab,
    searchQuery,
  });

  const {
    myQuoteByIndentId,
    indentIdsWithTrip,
    tripByIndentId,
    hirePartnerLoads,
    awardedToMeIndentIds,
    awardedLoads,
    findWorkLoads,
    findWorkDoneUnionLoads,
    filteredHirePartnerLoads,
    filteredFindWorkList,
    filteredClaimedLoads,
    doneSubTabCounts,
    statusTabCounts,
    loadMatchesSearch,
  } = filters;

  const extraMarketplaceLoads = useMemo(() => {
    const seen = new Set(findWorkLoads.map((load) => load.id));
    return marketplaceLoads.filter((load) => !seen.has(load.id));
  }, [findWorkLoads, marketplaceLoads]);

  const maybeLoadMoreMarketplace = useCallback(() => {
    if (
      !marketplaceQueryEnabled ||
      !marketplaceLoadsQ.hasNextPage ||
      marketplaceLoadsQ.isFetchingNextPage
    ) {
      return;
    }
    void marketplaceLoadsQ.fetchNextPage();
  }, [
    marketplaceQueryEnabled,
    marketplaceLoadsQ.hasNextPage,
    marketplaceLoadsQ.isFetchingNextPage,
    marketplaceLoadsQ.fetchNextPage,
  ]);

  const onGetLoadScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (loadSubTab !== "GET_LOAD") return;
      const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
      if (contentOffset.y + layoutMeasurement.height < contentSize.height - 280) {
        return;
      }
      maybeLoadMoreMarketplace();
    },
    [loadSubTab, maybeLoadMoreMarketplace],
  );

  const renderGetLoadMarketplaceStrip = () => {
    if (
      extraMarketplaceLoads.length === 0 &&
      !marketplaceLoadsQ.isFetching &&
      !marketplaceLoadsQ.isFetchingNextPage
    ) {
      return null;
    }
    return (
      <View style={styles.marketplaceLazyWrap}>
        <View style={styles.loadSectionRow}>
          <Text style={styles.loadSectionTitle}>Marketplace</Text>
          <View style={styles.loadSectionPill}>
            <Text style={styles.loadSectionPillText}>
              {extraMarketplaceLoads.length}
              {marketplaceLoadsQ.hasNextPage ? "+" : ""}
            </Text>
          </View>
        </View>
        {extraMarketplaceLoads.map((load: OrgOpenMarketplaceLoad) => {
          const shipper = titleCaseWord(
            (load.creator_organization_name ?? "").trim() || "Shipper",
          );
          const specChips = [load.vehicle_type, load.load_type]
            .map((v) => (v ?? "").trim())
            .filter(Boolean)
            .map(titleCaseWord);
          return (
            <Pressable
              key={load.id}
              onPress={() =>
                router.push(ROUTES.FIND_LOADS as import("expo-router").Href)
              }
              style={styles.marketplaceLazyCard}
            >
              <Text style={styles.marketplaceLazyShipper} numberOfLines={1}>
                {shipper}
              </Text>
              <MarketplaceRouteGrid
                pickup={load.pickup_area}
                drop={load.drop_location}
              />
              <MarketplaceSpecChips chips={specChips} dateLabel={load.pickup_date} />
            </Pressable>
          );
        })}
        {marketplaceLoadsQ.isFetchingNextPage ||
        (marketplaceLoadsQ.isFetching && extraMarketplaceLoads.length === 0) ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="small" color={Theme.primary} />
            <Text style={styles.loadingText}>Loading marketplace…</Text>
          </View>
        ) : null}
      </View>
    );
  };

  /**
   * `restrictToIndentIds` membership overrides this component's own
   * OPEN/QUOTED/AWARDED/DONE status-tab filtering for GIVE_LOAD — the caller
   * already knows exactly which indents belong (see prop doc above).
   */
  const effectiveHirePartnerLoads = useMemo(
    () =>
      restrictToIndentIds
        ? restrictIndentsToIds(hirePartnerLoads, restrictToIndentIds)
        : hirePartnerLoads,
    [hirePartnerLoads, restrictToIndentIds],
  );

  const effectiveFilteredHirePartnerLoads = useMemo(() => {
    if (!restrictToIndentIds) return filteredHirePartnerLoads;
    return effectiveHirePartnerLoads.filter((load) =>
      loadMatchesSearch(load, searchQuery),
    );
  }, [
    restrictToIndentIds,
    effectiveHirePartnerLoads,
    filteredHirePartnerLoads,
    loadMatchesSearch,
    searchQuery,
  ]);

  const supplierNameByOrgId = useMemo(
    () => supplierNameByLinkedOrgId(suppliers),
    [suppliers],
  );

  const supplierById = useMemo(() => {
    const map = new Map<(typeof suppliers)[number]["id"], (typeof suppliers)[number]>();
    for (const supplier of suppliers) map.set(supplier.id, supplier);
    return map;
  }, [suppliers]);

  const { data: acceptedQuotes = [] } = useAcceptedDirectQuotesForFinanceQuery(
    enrichmentOrgId,
  );

  const awardedVendorOrgIdByIndentId = useMemo(() => {
    const map: Record<string, string> = {};
    for (const load of hirePartnerLoads) {
      const assigned = String(load.assigned_supplier_id ?? "").trim();
      if (assigned) map[load.id] = assigned;
    }
    for (const quote of acceptedQuotes) {
      const indentId = (quote.indent_id ?? "").trim();
      const orgIdKey = (quote.bidder_organization_id ?? "").trim();
      if (indentId && orgIdKey && !map[indentId]) map[indentId] = orgIdKey;
    }
    for (const [indentId, trip] of tripByIndentId) {
      if (map[indentId]) continue;
      const supplierId = (trip.supplier_id ?? "").trim();
      const linkedOrg = (
        supplierById.get(supplierId)?.linked_organization_id ?? ""
      ).trim();
      if (linkedOrg) map[indentId] = linkedOrg;
    }
    return map;
  }, [acceptedQuotes, hirePartnerLoads, supplierById, tripByIndentId]);

  const acceptedQuoteAmountByIndentId = useMemo(() => {
    const map: Record<string, number> = {};
    for (const quote of acceptedQuotes) {
      const indentId = (quote.indent_id ?? "").trim();
      const amount = Number(quote.amount ?? 0);
      if (indentId && Number.isFinite(amount) && amount > 0 && map[indentId] == null) {
        map[indentId] = amount;
      }
    }
    return map;
  }, [acceptedQuotes]);

  const awardedSupplierOrgIds = useMemo(
    () => Array.from(new Set(Object.values(awardedVendorOrgIdByIndentId))).sort(),
    [awardedVendorOrgIdByIndentId],
  );

  const missingAwardedOrgIds = useMemo(
    () => awardedSupplierOrgIds.filter((id) => !supplierNameByOrgId[id]),
    [awardedSupplierOrgIds, supplierNameByOrgId],
  );

  const giveLoadKanbanColumns = useMemo(() => {
    const buckets = bucketGiveLoadIndentsForKanban(
      effectiveHirePartnerLoads,
      quoteCounts,
      {
        searchQuery,
        matchesSearch: loadMatchesSearch,
        tripStage: (indentId) =>
          giveLoadTripKanbanStage(tripByIndentId.get(indentId)),
      },
    );
    const accents = {
      OPEN: Theme.primary,
      QUOTED: Theme.aggregatePillText,
      AWARDED: Theme.positive,
      DONE: Theme.textMuted,
    } as const;
    // Restricted to unallocated indents (e.g. Trips → INDENT): DONE never has
    // members by construction (allocated/terminal indents are excluded from
    // the set), so drop the column instead of showing a permanently empty one.
    return GIVE_LOAD_KANBAN_COLUMNS.filter(
      (id) => !(restrictToIndentIds && id === "DONE"),
    ).map((id) => {
      if (id === "DONE") {
        return {
          id,
          label: giveLoadKanbanColumnLabel(id),
          accent: accents[id],
          loads: buckets.DONE,
          defaultTabId: "IN_TRANSIT",
          tabs: [
            {
              id: "IN_TRANSIT",
              label: "In Transit",
              loads: buckets.DONE_IN_TRANSIT,
            },
            {
              id: "COMPLETED",
              label: "Delivered",
              loads: buckets.DONE_COMPLETED,
            },
          ],
        };
      }
      return {
        id,
        label: giveLoadKanbanColumnLabel(id),
        accent: accents[id],
        loads: buckets[id],
      };
    });
  }, [
    effectiveHirePartnerLoads,
    quoteCounts,
    searchQuery,
    loadMatchesSearch,
    tripByIndentId,
    restrictToIndentIds,
  ]);

  const getLoadKanbanColumns = useMemo(() => {
    const buckets = bucketGetLoadIndentsForKanban(
      findWorkLoads,
      awardedLoads,
      findWorkDoneUnionLoads,
      myQuoteByIndentId,
      {
        searchQuery,
        matchesSearch: loadMatchesSearch,
        isInTransit: (indentId) => {
          const trip = tripByIndentId.get(indentId);
          if (!trip) return false;
          return isTripTrackingActive(trip.status, trip.completed_at);
        },
      },
    );
    const accents = {
      OPEN: Theme.primary,
      QUOTED: Theme.aggregatePillText,
      AWARDED: Theme.positive,
      CLAIMED: Theme.textMuted,
    } as const;
    return GET_LOAD_KANBAN_COLUMNS.map((id) => {
      if (id === "CLAIMED") {
        return {
          id,
          label: getLoadKanbanColumnLabel(id),
          accent: accents[id],
          loads: buckets.CLAIMED,
          defaultTabId: "IN_TRANSIT",
          tabs: [
            {
              id: "IN_TRANSIT",
              label: "In Transit",
              loads: buckets.CLAIMED_IN_TRANSIT,
            },
            {
              id: "COMPLETED",
              label: "Completed",
              loads: buckets.CLAIMED_COMPLETED,
            },
          ],
        };
      }
      return {
        id,
        label: getLoadKanbanColumnLabel(id),
        accent: accents[id],
        loads: buckets[id],
      };
    });
  }, [
    findWorkLoads,
    awardedLoads,
    findWorkDoneUnionLoads,
    myQuoteByIndentId,
    searchQuery,
    loadMatchesSearch,
    tripByIndentId,
  ]);

  /** Action required tab: prefer pending-allocation count so quiet-mode badge stays honest. */
  const claimedTabCount =
    pendingDeployCount > 0 ? pendingDeployCount : awardedLoads.length;

  const mainLoadTabs = useMemo(
    () =>
      (
        [
          {
            key: "GIVE_LOAD" as const,
            label: "My load",
            count: effectiveHirePartnerLoads.length,
          },
          {
            key: "GET_LOAD" as const,
            label: "Load from network",
            count: findWorkLoads.length,
          },
          {
            key: "AWARDED" as const,
            label: "Action required",
            count: claimedTabCount,
          },
        ] as const
      ).filter((t) => !hiddenSubTabs.includes(t.key)),
    [
      effectiveHirePartnerLoads.length,
      findWorkLoads.length,
      claimedTabCount,
      hiddenSubTabs,
    ],
  );

  const driverProfileById = useMemo(() => {
    const m = new Map<string, LoadCenterDriverProfile>();
    for (const d of drivers) {
      const name = String(
        (d as { full_name?: string; name?: string }).full_name ??
          (d as { name?: string }).name ??
          "",
      ).trim();
      if (!d.id) continue;
      m.set(d.id, {
        name: name || "Driver",
        avatarUrl: (d as { avatar_url?: string | null }).avatar_url ?? null,
        avatarSeed: (d as { avatar_seed?: string | null }).avatar_seed ?? null,
      });
    }
    return m;
  }, [drivers]);

  const tripAllocationForLoad = useCallback(
    (loadId: string) => {
      if (statusFilterTab !== "DONE" || doneSubTab !== "CONVERTED") return null;
      return resolveTripAllocationDisplay(
        tripByIndentId.get(loadId),
        driverProfileById,
      );
    },
    [statusFilterTab, doneSubTab, tripByIndentId, driverProfileById],
  );

  /** Action required: bids won still needing vehicle / driver allocation. */
  const displayedClaimedLoads = useMemo(
    () => filteredClaimedLoads,
    [filteredClaimedLoads],
  );

  const loadCenterPromoVariant = useMemo(
    () =>
      resolveLoadCenterPromoVariant({
        loadSubTab,
        statusFilterTab,
        doneSubTab,
        hasSearchFilter: searchQuery.trim().length > 0,
      }),
    [loadSubTab, statusFilterTab, doneSubTab, searchQuery],
  );

  const loadCenterEmptyStageStyle = useMemo(
    () => [
      styles.loadCenterEmptyStage,
      showIntegratedPartiesBanner &&
        (loadSubTab === "GIVE_LOAD" || loadSubTab === "GET_LOAD") &&
        styles.loadCenterEmptyStageIntegrated,
    ],
    [loadSubTab, showIntegratedPartiesBanner],
  );

  const integratedLoadsCanvas =
    showLoadCenterChrome &&
    showIntegratedPartiesBanner &&
    (loadSubTab === "GIVE_LOAD" || loadSubTab === "GET_LOAD");

  const renderLoadCenterEmptyPromo = useCallback(
    () => (
      <View style={loadCenterEmptyStageStyle}>
        {showIntegratedPartiesBanner &&
        (loadSubTab === "GIVE_LOAD" || loadSubTab === "GET_LOAD") ? (
          <LoadCenterIntegratedPartiesBanner
            mode={integratedPartiesBannerMode}
            onExploreNetwork={openNetworkForParties}
          />
        ) : (
          <LoadCenterPromoCard
            variant={loadCenterPromoVariant}
            onCtaPress={
              loadCenterPromoVariant === "give_open" &&
              canSurface("tripops.indents.create")
                ? onCreateIndentPress
                : undefined
            }
          />
        )}
      </View>
    ),
    [
      loadCenterEmptyStageStyle,
      showIntegratedPartiesBanner,
      loadSubTab,
      integratedPartiesBannerMode,
      openNetworkForParties,
      loadCenterPromoVariant,
      onCreateIndentPress,
      canSurface,
    ],
  );

  // ── Award Quote hook ────────────────────────────────────────────────────────
  const connectedSupplierOrgIds = useMemo(() => {
    const ids = new Set(
      suppliers.map((s) => s.linked_organization_id).filter(Boolean) as string[],
    );
    for (const id of liveConnectedSupplierOrgIds) ids.add(id);
    return ids;
  }, [suppliers, liveConnectedSupplierOrgIds]);
  const connectedClientOrgIds = useMemo(
    () => new Set(clients.map((c) => c.linked_organization_id).filter(Boolean) as string[]),
    [clients],
  );
  const {
    posts: getLoadOpportunityPosts,
    viewerBidByPostId: getLoadOppViewerBids,
  } = useLoadCenterOpportunityPosts(
    showLoadCenterChrome ? enrichmentOrgId : null,
    "get",
    connectedSupplierOrgIds,
    connectedClientOrgIds,
  );
  /** Open Market column badge — only loads still open to bid (not already in My Bids). */
  const openMarketOpportunityCount = useMemo(
    () =>
      getLoadOpportunityPosts.filter((p) => !getLoadOppViewerBids.has(p.id))
        .length,
    [getLoadOpportunityPosts, getLoadOppViewerBids],
  );
  const marketplaceOpenCount = marketplaceLoads.length;
  const getLoadKanbanColumnsWithOpps = useMemo(() => {
    if (openMarketOpportunityCount === 0 && marketplaceOpenCount === 0) {
      return getLoadKanbanColumns;
    }
    return getLoadKanbanColumns.map((col) => {
      if (col.id !== "OPEN") return col;
      return {
        ...col,
        countExtra: openMarketOpportunityCount + marketplaceOpenCount,
        topExtra: (
          <>
            {marketplaceOpenCount > 0 ? (
              <View style={{ marginBottom: 10 }}>
                <PulsePillButton
                  label={`${marketplaceOpenCount} Marketplace load${marketplaceOpenCount === 1 ? "" : "s"}`}
                  size="compact"
                  variant="outline"
                  showPlusIcon
                  IconComponent={Compass}
                  onPress={() =>
                    router.push(ROUTES.FIND_LOADS as import("expo-router").Href)
                  }
                  accessibilityLabel="Open Marketplace Loads"
                />
              </View>
            ) : null}
            {openMarketOpportunityCount > 0 ? (
              <LoadCenterOpportunityExchange
                orgId={orgId}
                mode="get"
                columnStack
                supplierOrgIds={connectedSupplierOrgIds}
                clientOrgIds={connectedClientOrgIds}
                embedded
              />
            ) : null}
          </>
        ),
      };
    });
  }, [
    getLoadKanbanColumns,
    openMarketOpportunityCount,
    marketplaceOpenCount,
    orgId,
    connectedSupplierOrgIds,
    connectedClientOrgIds,
    router,
  ]);

  const expandedKanbanColumn = useMemo(() => {
    if (!expandedKanbanColumnId || !expandedKanbanMode) return null;
    const cols =
      expandedKanbanMode === "give"
        ? giveLoadKanbanColumns
        : getLoadKanbanColumnsWithOpps;
    return cols.find((c) => c.id === expandedKanbanColumnId) ?? null;
  }, [
    expandedKanbanColumnId,
    expandedKanbanMode,
    giveLoadKanbanColumns,
    getLoadKanbanColumnsWithOpps,
  ]);

  const kanbanStageNeighbors = useMemo(() => {
    if (!expandedKanbanColumnId || !expandedKanbanMode) {
      return { previous: null, next: null };
    }
    const cols =
      expandedKanbanMode === "give"
        ? giveLoadKanbanColumns
        : getLoadKanbanColumnsWithOpps;
    const idx = cols.findIndex((c) => c.id === expandedKanbanColumnId);
    if (idx < 0) return { previous: null, next: null };
    const prev = idx > 0 ? cols[idx - 1] : null;
    const next = idx < cols.length - 1 ? cols[idx + 1] : null;
    const toNav = (col: LoadCenterKanbanColumn) => ({
      id: col.id,
      label: col.label,
      count: col.loads.length + (col.countExtra ?? 0),
    });
    return {
      previous: prev ? toNav(prev) : null,
      next: next ? toNav(next) : null,
    };
  }, [
    expandedKanbanColumnId,
    expandedKanbanMode,
    giveLoadKanbanColumns,
    getLoadKanbanColumnsWithOpps,
  ]);

  const openKanbanColumn = useCallback(
    (mode: "give" | "get", column: LoadCenterKanbanColumn) => {
      setExpandedKanbanMode(mode);
      setExpandedKanbanColumnId(column.id);
    },
    [],
  );

  const closeKanbanColumn = useCallback(() => {
    setKanbanDetailIndentId(null);
    setExpandedKanbanColumnId(null);
    setExpandedKanbanMode(null);
  }, []);

  const handleCardIndentPress = useCallback(
    (indent: IndentRow) => {
      if (expandedKanbanColumnId != null) {
        setKanbanDetailIndentId(indent.id);
        return;
      }
      onIndentPress(indent);
    },
    [expandedKanbanColumnId, onIndentPress],
  );

  const handleViewTrip = useCallback(
    (indent: IndentRow) => {
      const trip = tripByIndentId.get(indent.id);
      const tripId = (trip?.id ?? "").trim();
      if (!tripId) return;
      if (orgId) {
        void prefetchTripDetailBundle(queryClient, tripId, orgId);
      }
      openTripDetail(tripId, trip ?? null);
    },
    [openTripDetail, orgId, queryClient, tripByIndentId],
  );

  const handleKanbanEditIndent = useCallback(
    (indent: IndentRow) => {
      setKanbanDetailIndentId(null);
      closeKanbanColumn();
      router.push(
        `/create-indent?draftId=${encodeURIComponent(indent.id)}` as import("expo-router").Href,
      );
    },
    [closeKanbanColumn, router],
  );

  useEffect(() => {
    closeKanbanColumn();
  }, [loadSubTab, closeKanbanColumn]);

  const awardModal = useAwardQuote({ orgId, queryClient, invalidateIndents, onSuccess: triggerSuccess, connectedSupplierOrgIds });

  const navigateKanbanStage = useCallback(
    (columnId: string) => {
      setKanbanDetailIndentId(null);
      setBidLoad(null);
      awardModal.close();
      setExpandedKanbanColumnId(columnId);
    },
    [awardModal.close],
  );

  const openIndentAllocation = useCallback(
    (load: IndentRow) => {
      router.push(ROUTES.indentAllocation(load.id) as import("expo-router").Href);
    },
    [router],
  );

  // ── Trip Deployment hook ────────────────────────────────────────────────────
  const tripDeployment = useTripDeployment({
    orgId,
    myQuoteByIndentId: filters.myQuoteByIndentId,
    onSuccess: triggerSuccess,
  });

  const clientById = useMemo(() => {
    const map = new Map<string, ClientRow>();
    for (const client of clients) {
      map.set(client.id, client);
    }
    return map;
  }, [clients]);

  const marketCreatorOrgIds = useMemo(() => {
    const ids = new Set<string>();
    const addOrg = (load: { organization_id?: string | null }) => {
      const orgIdKey = (load.organization_id ?? "").trim();
      if (orgIdKey) ids.add(orgIdKey);
    };
    for (const load of filteredFindWorkList) addOrg(load);
    for (const load of findWorkLoads) addOrg(load);
    for (const load of awardedLoads) addOrg(load);
    for (const load of findWorkDoneUnionLoads) addOrg(load);
    for (const load of displayedClaimedLoads) addOrg(load);
    for (const load of hirePartnerLoads) addOrg(load);
    return Array.from(ids).sort();
  }, [
    filteredFindWorkList,
    findWorkLoads,
    awardedLoads,
    findWorkDoneUnionLoads,
    displayedClaimedLoads,
    hirePartnerLoads,
  ]);

  const loadCenterPartnerDisplayIds = useMemo(() => {
    const set = new Set(marketCreatorOrgIds);
    for (const id of missingAwardedOrgIds) set.add(id);
    if (orgId) set.add(orgId);
    return Array.from(set).sort();
  }, [marketCreatorOrgIds, missingAwardedOrgIds, orgId]);

  const loadCenterPartnerDisplay = useLinkedOrgDisplayMap(
    loadCenterPartnerDisplayIds,
  );

  const creatorOrgProfileMap = loadCenterPartnerDisplay;

  const awardedOrgDisplayNames = useMemo(() => {
    const names: Record<string, string> = {};
    for (const id of missingAwardedOrgIds) {
      const n = (loadCenterPartnerDisplay[id]?.organizationName ?? "").trim();
      if (n) names[id] = n;
    }
    return names;
  }, [missingAwardedOrgIds, loadCenterPartnerDisplay]);

  useEffect(() => {
    // Action required = pending allocation only (bids won → allocate vehicle).
    if (loadSubTab === "AWARDED") {
      if (statusFilterTab !== "AWARDED") {
        setStatusFilterTab("AWARDED");
      }
      return;
    }
    // No additional guard needed: Hire Partner and Find Work both support AWARDED now.
  }, [loadSubTab, statusFilterTab]);

  useEffect(() => {
    if (loadSubTab === "AWARDED") refetchMyQuotes();
  }, [loadSubTab, refetchMyQuotes]);

  /** Refetch offer counts when viewing Receiving Bids or desktop Give Load board. */
  useEffect(() => {
    if (
      loadSubTab === "GIVE_LOAD" &&
      (statusFilterTab === "QUOTED" || !isMobileView)
    ) {
      refetchQuoteCounts();
    }
  }, [loadSubTab, statusFilterTab, isMobileView, refetchQuoteCounts]);

  useEffect(() => {
    if (statusFilterTab === "DONE") return;
    setDoneSubTab("REJECTED");
  }, [statusFilterTab]);

  useEffect(() => {
    setDoneSubTab("REJECTED");
  }, [loadSubTab]);

  const renderDesktopStatusTabs = () => {
    if (statusTabsForRole.length === 0) return null;
    /** Desktop/tablet Give & Get Load always use the board — no stage strip. */
    if (loadSubTab === "GIVE_LOAD" || loadSubTab === "GET_LOAD") {
      return null;
    }
    const showDoneSubs = statusFilterTab === "DONE";
    return (
      <View style={styles.loadsCombinedTabRow}>
        <LoadCenterUnderlineTabStrip
          variant="blue"
          compact
          tabs={statusTabsForRole.map((tab) => ({
            key: tab.id,
            label: getLoadCenterStatusTabLabel(
              loadSubTab,
              tab.id,
              tab.label,
            ),
            count: statusTabCounts[tab.id],
          }))}
          activeKey={statusFilterTab}
          onChange={(key) => setStatusFilterTab(key as StatusFilterTab)}
          formatLabel={formatLoadTabLabel}
          style={styles.loadsStatusTabGroup}
        />
        {showDoneSubs ? (
          <LoadCenterUnderlineTabStrip
            variant="pink"
            compact
            tabs={DONE_SUB_TABS.map((tab) => ({
              key: tab.id,
              label: tab.label,
              count: doneSubTabCounts[tab.id],
            }))}
            activeKey={doneSubTab}
            onChange={(key) => setDoneSubTab(key as DoneSubTab)}
            formatLabel={formatLoadTabLabel}
            style={styles.loadsDoneTabGroup}
          />
        ) : null}
      </View>
    );
  };

  const openIntegratedParty = useCallback(
    (party: LoadCenterIntegratedParty) => {
      if (party.entityType === "supplier") {
        router.push(ROUTES.supplierDetail(party.id) as import("expo-router").Href);
        return;
      }
      router.push(ROUTES.clientDetail(party.id) as import("expo-router").Href);
    },
    [router],
  );

  const renderDesktopFilterPanel = () => (
    <View style={styles.loadsBodyFiltersBleed}>
      <View style={styles.loadsInlineFilterPanelDesktop}>
        <View style={styles.loadsInlineFilterPanelInner}>
          <View style={chatChrome.filterHeaderRow}>
            <View style={styles.loadsFilterTabsWrap}>
              <LoadCenterUnderlineTabStrip
                variant="yellow"
                tabs={mainLoadTabs}
                activeKey={loadSubTab}
                onChange={(key) => setLoadSubTab(key as LoadSubTab)}
                formatLabel={formatLoadTabLabel}
              />
            </View>
            <View style={styles.loadsFilterActions}>
              {loadSubTab === "GIVE_LOAD" || loadSubTab === "GET_LOAD" ? (
                <LoadCenterIntegratedPartiesRow
                  mode={loadSubTab === "GIVE_LOAD" ? "supplier" : "client"}
                  parties={
                    loadSubTab === "GIVE_LOAD"
                      ? integratedSuppliers
                      : integratedClients
                  }
                  onAddToNetwork={openNetworkForParties}
                  onPartyPress={openIntegratedParty}
                />
              ) : null}
              <View style={styles.loadsSearchCluster}>
                <View style={[chatChrome.searchWrap, styles.loadsSearchWrapInline]}>
                  <FontAwesome
                    name="search"
                    size={13}
                    color={CHAT_FILTER_MUTED}
                    style={styles.loadsSearchIcon}
                  />
                  <TextInput
                    style={chatChrome.searchInput}
                    placeholder="Search loads…"
                    placeholderTextColor={CHAT_FILTER_MUTED}
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>
                {loadSubTab !== "GIVE_LOAD" ? (
                  <PulsePillButton
                    label="Marketplace Loads"
                    size="compact"
                    variant="outline"
                    showPlusIcon
                    IconComponent={Compass}
                    onPress={() =>
                      router.push(ROUTES.FIND_LOADS as import("expo-router").Href)
                    }
                    accessibilityLabel="Marketplace Loads — open Marketplace opportunities"
                  />
                ) : null}
              </View>
            </View>
          </View>
          {/* Action required: pending allocation only — no Awarded/Done sub-tabs. */}
        </View>
      </View>
    </View>
  );

  const handleBroadcastDraft = async (load: IndentRow) => {
    if (!orgId) return;
    const { error } = await shareDraftIndent(load.id);
    if (error) {
      Alert.alert("Could not broadcast", error.message);
      return;
    }
    invalidateIndents(orgId);
    invalidatePosts();
    triggerSuccess("Load broadcasted to network");
  };

  const handlePulseStory = useCallback(
    (load: IndentRow) => {
      if (!orgId) return;
      const story = indentStoryStates[load.id];
      // Already live — open Reach boost (plans + credits) directly.
      if (story?.isLive && story.postId) {
        setBoostPostId(story.postId);
        setBoostSheetVisible(true);
        return;
      }
      setPulseShareIndent(load);
    },
    [orgId, indentStoryStates],
  );

  const handlePulseStoryShareSuccess = useCallback(() => {
    invalidatePosts();
    void refetchIndentStories();
  }, [invalidatePosts, refetchIndentStories]);

  const handleBoostAfterBroadcast = useCallback((postId: string) => {
    setBoostPostId(postId);
    setPulseShareIndent(null);
    setBoostSheetVisible(true);
  }, []);

  // A2: contextual Marketplace distribution toggle on an existing indent.
  // Modifies the existing circulation_target only -- no new Marketplace entity.
  const [marketplaceToggleBusyId, setMarketplaceToggleBusyId] = useState<
    string | null
  >(null);

  const handleToggleMarketplace = useCallback(
    async (load: IndentRow) => {
      if (!orgId) return;
      const target = load.circulation_target ?? "integrated_supplier";
      const isShared = target === "marketplace" || target === "both";
      const confirmed = await confirmDialog({
        title: isShared ? "Stop sharing to Marketplace?" : "Share to Marketplace?",
        message: isShared
          ? "This load will stop appearing to DCO / fleet owners in the open Marketplace. Your integrated supplier network is unaffected."
          : "This load will also become visible to verified DCO / fleet owners in the open Marketplace, alongside your integrated supplier network.",
        confirmLabel: isShared ? "Stop sharing" : "Share",
        destructive: isShared,
      });
      if (!confirmed) return;
      try {
        setMarketplaceToggleBusyId(load.id);
        const { error } = await updateIndent(load.id, {
          circulation_target: isShared ? "integrated_supplier" : "both",
        });
        if (error) {
          Alert.alert("Could not update distribution", error.message);
          return;
        }
        invalidateIndents(orgId);
        triggerSuccess(
          isShared
            ? "Stopped sharing to Marketplace."
            : "Shared to Marketplace.",
        );
      } finally {
        setMarketplaceToggleBusyId(null);
      }
    },
    [orgId, invalidateIndents, triggerSuccess],
  );

  const handleShareIndent = async (load: IndentRow) => {
    const routeLabel = `${(load.pickup_area || "—").toUpperCase()} → ${(load.drop_location || "—").toUpperCase()}`;
    const dateLabel = load.pickup_date
      ? new Date(load.pickup_date).toLocaleDateString("en-IN", {
          day: "numeric",
          month: "short",
          year: "numeric",
        })
      : "—";
    const budget = formatINR(Number(load.client_price || 0));
    const indentDisplay = getIndentDisplayNumber(load);
    const webBase =
      process.env.EXPO_PUBLIC_WEB_BASE_URL?.trim().replace(/\/$/, "") || "";
    const deepLink =
      webBase !== ""
        ? `${webBase}/indent/${load.id}`
        : Linking.createURL(`/indent/${load.id}`);
    const message =
      `Load Indent ${indentDisplay}\n` +
      `${routeLabel}\n` +
      `Pickup: ${dateLabel} · Budget: ${budget}\n\n` +
      `Update your bid:\n${deepLink}`;
    try {
      const waUrl = `whatsapp://send?text=${encodeURIComponent(message)}`;
      const canOpen = await Linking.canOpenURL(waUrl);
      if (canOpen) {
        await Linking.openURL(waUrl);
      } else {
        await Share.share({ message });
      }
    } catch {
      await Share.share({ message });
    }
  };


  const _activeDrivers = useMemo(
    () => drivers.filter((d) => !d.left_at),
    [drivers],
  );

  const paddingBottom = useMemo(() => {
    if (Platform.OS === "web" && !isMobileView && useGridLayout) {
      return 12;
    }
    return layout.scrollBottomPadding(36);
  }, [isMobileView, layout, useGridLayout]);
  const statusTabsForRole = useMemo(() => {
    if (!isClaimedTab) return STATUS_TABS;
    // Action required is pending-allocation only — no Awarded/Done stage strip.
    return [];
  }, [isClaimedTab]);

  const mobileDoneSubTabs = useMemo(
    () =>
      DONE_SUB_TABS.map((tab) => ({
        id: tab.id,
        label: tab.label,
        count: doneSubTabCounts[tab.id],
      })),
    [doneSubTabCounts],
  );

  const mobileStatusTabs = useMemo(
    () =>
      statusTabsForRole.map((tab) => ({
        id: tab.id,
        label: getLoadCenterStatusTabLabel(loadSubTab, tab.id, tab.label),
        count: statusTabCounts[tab.id],
      })),
    [statusTabsForRole, loadSubTab, statusTabCounts],
  );

  const renderClaimedMobileCard = useCallback(
    (load: IndentRow, isDone: boolean) => {
      const acceptedQuote = myQuotes.find(
        (q) =>
          (q.status || "").toLowerCase() === "accepted" &&
          q.indent_id === load.id,
      );
      const supplierRate =
        acceptedQuote?.amount != null
          ? Number(acceptedQuote.amount)
          : Number(load.client_price || 0);
      const clientLabel = resolveMarketIndentShipperLabel(load);
      const avatar = marketLoadIndentAvatarProps(load, creatorOrgProfileMap);
      const sourceTag = resolveGetLoadSourceTag(
        load.organization_id,
        connectedClientOrgIds,
      );
      const route = indentDisplayOriginDest(load, planRouteById);
      return (
        <LoadCenterHubMobileIndentCard
          key={load.id}
          indent={load}
          titleName={clientLabel}
          statusLabel={isDone ? "completed" : "action required"}
          origin={route.origin}
          dest={route.dest}
          routePlan={indentRoutePlan(load, planRouteById)}
          pickupIso={load.pickup_date}
          leftFooterLabel={(load.vehicle_type || "—").toUpperCase()}
          rightFooterLabel={
            isDone ? "On books" : formatINR(supplierRate)
          }
          ticketCommerce={{
            kicker: isDone ? "COMPLETED" : "BIDS WON",
            amountInr: isDone ? null : supplierRate,
            rightCaption: isDone ? "On books" : null,
          }}
          sourceTag={sourceTag}
          avatarUrl={avatar.avatarUrl}
          avatarSeed={avatar.avatarSeed}
          organizationImageUrl={avatar.organizationImageUrl}
          organizationAvatarSeed={avatar.organizationAvatarSeed}
          initialsColorSeed={avatar.initialsColorSeed}
          tripAllocation={tripAllocationForLoad(load.id)}
          onPress={() =>
            isDone ? handleCardIndentPress(load) : openIndentAllocation(load)
          }
          actions={
            <ClaimedIndentCardActions
              load={load}
              isDone={isDone}
              assigning={tripDeployment.assigningTripId === load.id}
              onIndentPress={handleCardIndentPress}
              onShareIndent={handleShareIndent}
              onAssignDeploy={openIndentAllocation}
            />
          }
        />
      );
    },
    [
      connectedClientOrgIds,
      creatorOrgProfileMap,
      handleShareIndent,
      openIndentAllocation,
      myQuotes,
      handleCardIndentPress,
      tripAllocationForLoad,
      tripDeployment.assigningTripId,
      planRouteById,
    ],
  );

  const renderGiveLoadHubCard = useCallback(
    (
      load: IndentRow,
      layout: {
        dense?: boolean;
        fillGrid?: boolean;
        withActions: boolean;
      },
    ) => {
      const status = (load.status || "").toLowerCase();
      const isDraft = status === "draft";
      const isAwardedStatus = status === "awarded";
      const isAwardedPendingTrip =
        isAwardedStatus && !indentIdsWithTrip.has(load.id);
      const isDone = statusMatchesFilter(status, "DONE");
      const hasDirectSupplier = !!load["assigned_supplier_id"];
      const awardedVendorOrgId = awardedVendorOrgIdByIndentId[load.id] ?? "";
      const trip = tripByIndentId.get(load.id);
      const tripSupplier = trip?.supplier_id
        ? supplierById.get(trip.supplier_id)
        : undefined;
      const tripVendorName =
        (tripSupplier?.name || tripSupplier?.company_name || trip?.supplier_name || "").trim();
      const tripDriverName =
        (trip?.driver_id
          ? driverProfileById.get(trip.driver_id)?.name
          : "") ||
        (trip?.driver_display_name ?? "").trim();
      const tripStage = giveLoadTripKanbanStage(trip);
      const isAwaitingSupplierDeploy = !trip && (isAwardedPendingTrip || hasDirectSupplier);
      const bidCount = quoteCounts[load.id] ?? 0;
      const route = indentDisplayOriginDest(load, planRouteById);
      const displayStatus =
        tripStage === "delivered"
          ? "delivered"
          : tripStage === "in_transit"
            ? "in transit"
            : resolveGiveLoadMobileDisplayStatus(
                statusFilterTab,
                status,
                bidCount,
                indentIdsWithTrip,
                load.id,
              );
      const vehicleDetail = (load.vehicle_type || "—").toUpperCase();
      const loadTypeDetail = (load.load_type || "General").toUpperCase();
      const planId =
        typeof load.execution_plan_id === "string"
          ? load.execution_plan_id.trim()
          : "";
      const linkedAvatarMap = {
        ...linkedOrgByOrganizationId,
        ...(orgId && creatorOrgProfileMap[orgId]
          ? { [orgId]: creatorOrgProfileMap[orgId] }
          : {}),
      };
      const planParties = planId ? (planClientsById?.[planId] ?? []) : [];
      const clientFaces = indentClientFacesFromParties(
        planParties,
        clientById,
        linkedAvatarMap,
      );
      const clientName = resolveMergedOrderCardTitle(
        load.client_name,
        planParties,
        clientById,
      );
      const avatarLoad =
        isSyntheticMergedOrdersClientName(load.client_name) &&
        clientFaces.length === 1
          ? {
              ...load,
              client_id: clientFaces[0]?.id ?? load.client_id,
              client_name: clientFaces[0]?.name ?? clientName,
            }
          : load;
      const awardedAmount = resolveGiveLoadAwardedAmountInr({
        assignedSupplierRate: load["assigned_supplier_rate"],
        awardedAmount: load["awarded_amount"],
        indentSupplierRate: load["supplier_rate"],
        acceptedQuoteAmount: acceptedQuoteAmountByIndentId[load.id],
        tripSupplierRate: trip?.supplier_rate,
        tripDriverCommission: trip?.driver_commission,
        tripClientPrice: trip?.client_price,
        supplierTarget: load.supplier_target,
      });
      const showPulseToNetwork =
        !isDone &&
        !isDraft &&
        (indentCanBroadcastToPulseNetwork(load) ||
          indentStoryStates[load.id]?.isLive === true);

      const avatar = giveLoadIndentAvatarProps(
        avatarLoad,
        clientById,
        linkedAvatarMap,
        {
          id: orgId,
          name: currentOrganization?.name,
          logoUrl: currentOrganization?.logo_url,
        },
        trip
          ? { client_id: trip.client_id, client_name: trip.client_name }
          : null,
      );

      const ticketCommerce = resolveGiveLoadTicketCommerce(
        statusFilterTab,
        load,
        {
          isDone,
          isDraft,
          awardedAmountInr: awardedAmount,
          isAwarded:
            isAwardedStatus ||
            hasDirectSupplier ||
            Boolean(awardedVendorOrgId),
          bidCount,
          loadTypeDetail,
          awardedByName: resolveAwardedVendorName({
            assignedSupplierOrgId:
              awardedVendorOrgId || null,
            sessionName: awardModal.lastAwardedByIndentId[load.id] ?? null,
            supplierNameByOrgId,
            orgDisplayNameById: awardedOrgDisplayNames,
            fallbackName: tripVendorName || tripDriverName || null,
          }),
        },
      );

      return (
        <LoadCenterHubMobileIndentCard
          indent={load}
          titleName={clientName}
          statusLabel={displayStatus}
          origin={route.origin}
          dest={route.dest}
          routePlan={indentRoutePlan(load, planRouteById)}
          pickupIso={load.pickup_date}
          leftFooterLabel={vehicleDetail}
          ticketCommerce={ticketCommerce}
          rightFooterLabel={
            isAwardedPendingTrip && awardedAmount != null
              ? formatINR(awardedAmount)
              : bidCount > 0
                ? `${bidCount} bid${bidCount === 1 ? "" : "s"}`
                : loadTypeDetail
          }
          avatarUrl={avatar.avatarUrl}
          avatarSeed={avatar.avatarSeed}
          organizationImageUrl={avatar.organizationImageUrl}
          organizationAvatarSeed={avatar.organizationAvatarSeed}
          initialsColorSeed={avatar.initialsColorSeed}
          avatarPartyName={avatar.partyName}
          clientFaces={clientFaces.length > 1 ? clientFaces : null}
          tripAllocation={tripAllocationForLoad(load.id)}
          onPress={
            layout.fillGrid && !isMobileView
              ? undefined
              : () => handleCardIndentPress(load)
          }
          dense={layout.dense}
          fillGrid={layout.fillGrid}
          actions={
            layout.withActions ? (
              <GiveLoadIndentCardActions
                load={load}
                bidCount={bidCount}
                isDone={isDone}
                isDraft={isDraft}
                isAwardedPendingTrip={isAwardedPendingTrip}
                isAwaitingSupplierDeploy={isAwaitingSupplierDeploy}
                showPulseToNetwork={showPulseToNetwork}
                pulseStoryLive={indentStoryStates[load.id]?.isLive === true}
                pulseBusy={false}
                awardedAmountLabel={
                  awardedAmount != null ? formatINR(awardedAmount) : null
                }
                awardedAmount={awardedAmount}
                onPulseStory={handlePulseStory}
                onIndentPress={handleCardIndentPress}
                onShareIndent={handleShareIndent}
                onToggleMarketplace={handleToggleMarketplace}
                marketplaceBusy={marketplaceToggleBusyId === load.id}
                onBroadcastDraft={handleBroadcastDraft}
                onOpenAwardModal={awardModal.open}
                onViewTrip={trip ? handleViewTrip : undefined}
                dense={layout.dense}
              />
            ) : undefined
          }
        />
      );
    },
    [
      acceptedQuoteAmountByIndentId,
      awardModal.lastAwardedByIndentId,
      awardModal.open,
      awardedOrgDisplayNames,
      awardedVendorOrgIdByIndentId,
      driverProfileById,
      clientById,
      handleBroadcastDraft,
      handlePulseStory,
      handleToggleMarketplace,
      handleShareIndent,
      indentIdsWithTrip,
      indentStoryStates,
      isMobileView,
      linkedOrgByOrganizationId,
      creatorOrgProfileMap,
      currentOrganization,
      orgId,
      handleCardIndentPress,
      handleViewTrip,
      marketplaceToggleBusyId,
      quoteCounts,
      statusFilterTab,
      supplierNameByOrgId,
      tripAllocationForLoad,
      tripByIndentId,
      supplierById,
      planRouteById,
      planClientsById,
    ],
  );

  const renderGiveLoadMobileCard = useCallback(
    (load: IndentRow) =>
      renderGiveLoadHubCard(load, { withActions: true }),
    [renderGiveLoadHubCard],
  );

  const renderGiveLoadGridCard = useCallback(
    (load: IndentRow) =>
      renderGiveLoadHubCard(load, {
        dense: true,
        fillGrid: true,
        withActions: true,
      }),
    [renderGiveLoadHubCard],
  );

  const renderGiveLoadListCard = useCallback(
    (load: IndentRow) =>
      renderGiveLoadHubCard(load, {
        // Comfort toolbar: same 32px row height as status/share, readable labels.
        dense: false,
        withActions: true,
      }),
    [renderGiveLoadHubCard],
  );

  const renderGetLoadHubCard = useCallback(
    (
      load: IndentRow,
      layout: {
        dense?: boolean;
        fillGrid?: boolean;
        withActions: boolean;
      },
    ) => {
      const existingQuote = myQuoteByIndentId.get(load.id);
      const quoteStatus = (existingQuote?.status ?? "").toLowerCase();
      const isPending = quoteStatus === "pending";
      const isRejected = quoteStatus === "rejected";
      const isAccepted = quoteStatus === "accepted";
      // The indent's own award state can move on independently of this
      // specific bid row — e.g. a rejected/pending bid whose indent was
      // later awarded to the same org through a different path (a re-award,
      // a direct assignment). Check the live award state before trusting the
      // bid's own status everywhere below, or a won load still shows
      // "Update bid"/"rejected" instead of "Allocate"/"awarded".
      const isAwardedByIndent = isAccepted || awardedToMeIndentIds.has(load.id);
      const isDoneOutcome =
        statusMatchesFilter(load.status || "", "DONE") ||
        indentIdsWithTrip.has(load.id);
      const vehicleDetail = (load.vehicle_type || "—").toUpperCase();
      const clientLabel = resolveMarketIndentShipperLabel(load);
      const mobileLabels = resolveGetLoadMobileCardLabels(
        statusFilterTab,
        doneSubTab,
        load,
        existingQuote,
        indentIdsWithTrip,
        awardedToMeIndentIds.has(load.id),
      );
      const doneOutcome =
        statusFilterTab === "DONE" || isDoneOutcome
          ? resolveGetLoadDoneOutcome(
              load,
              existingQuote,
              indentIdsWithTrip.has(load.id),
              awardedToMeIndentIds.has(load.id),
            )
          : null;
      const statusLabel =
        statusFilterTab === "DONE"
          ? mobileLabels.statusLabel
          : isAwardedByIndent
            ? "awarded"
            : isRejected
              ? "rejected"
              : isPending &&
                  existingQuote?.counter_amount != null &&
                  Number(existingQuote.counter_amount) > 0
                ? "countered"
                : isPending
                  ? "receiving bids"
                  : "open market";
      const quoteAmount = Number(existingQuote?.amount ?? 0);
      const counterInr =
        existingQuote?.counter_amount != null &&
        Number(existingQuote.counter_amount) > 0
          ? Number(existingQuote.counter_amount)
          : null;
      const isCountered = isPending && counterInr != null;
      const quoteVariant = isDoneOutcome
        ? "done"
        : isAwardedByIndent
          ? "accepted"
          : isRejected
            ? "rejected"
            : isPending
              ? "pending"
              : "open";
      const rightFooter =
        statusFilterTab === "DONE"
          ? mobileLabels.rightFooter
          : isAwardedByIndent
            ? "Bids won"
            : (load.load_type || "—").toUpperCase();
      const ticketCommerce = resolveGetLoadTicketCommerce(
        statusFilterTab,
        doneSubTab,
        load,
        existingQuote,
        indentIdsWithTrip,
        awardedToMeIndentIds.has(load.id),
      );
      /** Terminal Done cards: no Rebid — only converted keeps View details. */
      const allowPrimaryCta =
        doneOutcome == null ||
        doneOutcome.kind === "converted" ||
        doneOutcome.interactive;
      const ctaLabel =
        doneOutcome?.kind === "converted"
          ? "View details"
          : isAwardedByIndent
            ? isDoneOutcome
              ? "View details"
              : "Allocate"
            : isCountered
              ? "Respond to counter"
              : isPending
                ? "Update bid"
                : isRejected
                  ? "New quote"
                  : "Bid now";

      const avatar = marketLoadIndentAvatarProps(load, creatorOrgProfileMap);
      const sourceTag = resolveGetLoadSourceTag(
        load.organization_id,
        connectedClientOrgIds,
      );
      const route = indentDisplayOriginDest(load, planRouteById);

      const openLoad = () => {
        if (isAwardedByIndent && !isDoneOutcome) {
          openIndentAllocation(load);
          return;
        }
        handleCardIndentPress(load);
      };

      return (
        <LoadCenterHubMobileIndentCard
          indent={load}
          titleName={clientLabel}
          statusLabel={statusLabel}
          origin={route.origin}
          dest={route.dest}
          routePlan={indentRoutePlan(load, planRouteById)}
          pickupIso={load.pickup_date}
          leftFooterLabel={vehicleDetail}
          rightFooterLabel={rightFooter}
          ticketCommerce={ticketCommerce}
          sourceTag={sourceTag}
          avatarUrl={avatar.avatarUrl}
          avatarSeed={avatar.avatarSeed}
          organizationImageUrl={avatar.organizationImageUrl}
          organizationAvatarSeed={avatar.organizationAvatarSeed}
          initialsColorSeed={avatar.initialsColorSeed}
          tripAllocation={tripAllocationForLoad(load.id)}
          onPress={openLoad}
          dense={layout.dense}
          fillGrid={layout.fillGrid}
          dimmed={
            doneOutcome != null &&
            !doneOutcome.interactive &&
            doneOutcome.kind !== "converted"
          }
          actions={
            layout.withActions ? (
              <GetLoadIndentCardActions
                load={load}
                isAccepted={isAwardedByIndent}
                isDoneOutcome={isDoneOutcome}
                ctaLabel={ctaLabel}
                showPrimaryCta={allowPrimaryCta}
                quoteVariant={quoteVariant}
                quoteAmount={quoteAmount}
                onIndentPress={handleCardIndentPress}
                onShareIndent={handleShareIndent}
                onOpenBidModal={setBidLoad}
                onAllocate={openIndentAllocation}
                dense={layout.dense}
              />
            ) : undefined
          }
        />
      );
    },
    [
      awardedToMeIndentIds,
      connectedClientOrgIds,
      creatorOrgProfileMap,
      doneSubTab,
      handleShareIndent,
      indentIdsWithTrip,
      myQuoteByIndentId,
      handleCardIndentPress,
      openIndentAllocation,
      statusFilterTab,
      tripAllocationForLoad,
      planRouteById,
    ],
  );

  const renderGetLoadMobileCard = useCallback(
    (load: IndentRow) =>
      renderGetLoadHubCard(load, {
        // Same action toolbar as desktop list — Allocate on Bids Won must show.
        dense: false,
        withActions: true,
      }),
    [renderGetLoadHubCard],
  );

  const renderGetLoadGridCard = useCallback(
    (load: IndentRow) =>
      renderGetLoadHubCard(load, {
        dense: true,
        fillGrid: true,
        withActions: true,
      }),
    [renderGetLoadHubCard],
  );

  const renderGetLoadListCard = useCallback(
    (load: IndentRow) =>
      renderGetLoadHubCard(load, {
        // Comfort toolbar: same 32px row height as status/share, readable labels.
        dense: false,
        withActions: true,
      }),
    [renderGetLoadHubCard],
  );

  const renderClaimedGridCard = useCallback(
    (load: IndentRow, isDone: boolean) => {
      const acceptedQuote = myQuotes.find(
        (q) =>
          (q.status || "").toLowerCase() === "accepted" &&
          q.indent_id === load.id,
      );
      const supplierRate =
        acceptedQuote?.amount != null
          ? Number(acceptedQuote.amount)
          : Number(load.client_price || 0);
      const clientLabel = resolveMarketIndentShipperLabel(load);

      const avatar = marketLoadIndentAvatarProps(load, creatorOrgProfileMap);
      const sourceTag = resolveGetLoadSourceTag(
        load.organization_id,
        connectedClientOrgIds,
      );
      const route = indentDisplayOriginDest(load, planRouteById);

      return (
        <LoadCenterHubMobileIndentCard
          indent={load}
          titleName={clientLabel}
          statusLabel={isDone ? "completed" : "action required"}
          origin={route.origin}
          dest={route.dest}
          routePlan={indentRoutePlan(load, planRouteById)}
          pickupIso={load.pickup_date}
          leftFooterLabel={(load.vehicle_type || "—").toUpperCase()}
          rightFooterLabel={isDone ? "On books" : formatINR(supplierRate)}
          sourceTag={sourceTag}
          avatarUrl={avatar.avatarUrl}
          avatarSeed={avatar.avatarSeed}
          organizationImageUrl={avatar.organizationImageUrl}
          organizationAvatarSeed={avatar.organizationAvatarSeed}
          initialsColorSeed={avatar.initialsColorSeed}
          tripAllocation={tripAllocationForLoad(load.id)}
          onPress={() => handleCardIndentPress(load)}
          dense
          fillGrid
          actions={
            <ClaimedIndentCardActions
              load={load}
              isDone={isDone}
              assigning={tripDeployment.assigningTripId === load.id}
              onIndentPress={handleCardIndentPress}
              onShareIndent={handleShareIndent}
              onAssignDeploy={openIndentAllocation}
              dense
            />
          }
        />
      );
    },
    [
      connectedClientOrgIds,
      creatorOrgProfileMap,
      handleShareIndent,
      openIndentAllocation,
      myQuotes,
      handleCardIndentPress,
      tripAllocationForLoad,
      tripDeployment.assigningTripId,
      planRouteById,
    ],
  );

  const renderGiveLoadTripsCards = () => {
    const loads = effectiveHirePartnerLoads;
    if (loads.length === 0) return null;
    if (isMobileView) {
      return (
        <LoadCenterHubMobileListCanvas>
          {loads.map((load) => (
            <View
              key={load.id}
              style={
                highlightedIndentId === load.id
                  ? styles.highlightedIndentCard
                  : undefined
              }
            >
              {renderGiveLoadMobileCard(load)}
            </View>
          ))}
        </LoadCenterHubMobileListCanvas>
      );
    }
    return (
      <View style={styles.gridList}>
        {loads.map((load) => (
          <View
            key={load.id}
            style={[
              styles.gridCardWrap,
              highlightedIndentId === load.id && styles.highlightedIndentCard,
            ]}
          >
            {renderGiveLoadGridCard(load)}
          </View>
        ))}
      </View>
    );
  };

  const loadCenterBody = (
    <View
      style={[
        styles.container,
        isMobileView && styles.containerMobileHub,
        isTripsPresentation && styles.tripsPresentationRoot,
        { paddingTop: contentTopPadding },
      ]}
    >
      {/* Content area — gray hub canvas (matches Trips page) */}
      <View
        style={[
          styles.loadContentWrap,
          isClaimedTab && styles.loadContentWrapClaimed,
          isMobileView && styles.loadContentWrapMobileHub,
          integratedLoadsCanvas && styles.loadCanvasIntegratedEmpty,
          isTripsPresentation && styles.tripsLoadContentWrap,
        ]}
      >
        {isTripsPresentation ? (
          <View
            style={[
              styles.tripsEmbedContent,
              isMobileView && styles.scrollContentMobileHub,
            ]}
          >
            {loadSubTab === "GIVE_LOAD" && (
              <>
                {isLoading ? (
                  <View style={styles.loadingWrap}>
                    <ActivityIndicator size="small" color={Theme.primary} />
                    <Text style={styles.loadingText}>Loading…</Text>
                  </View>
                ) : indentsError ? (
                  <ContentErrorState
                    variant="loads"
                    layout="embedded"
                    onRetry={() => {
                      void refetchIndents();
                    }}
                  />
                ) : (
                  renderGiveLoadTripsCards()
                )}
              </>
            )}
          </View>
        ) : (
        <ScrollView
          style={[
            styles.scroll,
            integratedLoadsCanvas && styles.loadCanvasIntegratedEmpty,
          ]}
          contentContainerStyle={[
            styles.scrollContent,
            isClaimedTab && styles.scrollContentClaimed,
            isMobileView && styles.scrollContentMobileHub,
            integratedLoadsCanvas && styles.scrollContentIntegratedEmpty,
            { paddingBottom },
          ]}
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled
          scrollEventThrottle={400}
          onScroll={onGetLoadScroll}
          {...(isMobileView ? tabBarScrollProps : {})}
          refreshControl={
            loadSubTab === "GET_LOAD" ? (
              <RefreshControl
                refreshing={
                  (marketRefetching && !marketLoading) ||
                  (marketplaceLoadsQ.isFetching &&
                    !marketplaceLoadsQ.isFetchingNextPage &&
                    !marketplaceLoadsQ.isLoading)
                }
                onRefresh={() => {
                  void refetchMarketIndents();
                  void marketplaceLoadsQ.refetch();
                }}
                tintColor={Theme.primary}
              />
            ) : undefined
          }
        >
          {isMobileView && showLoadCenterChrome ? (
            <View style={hubChrome.bodyFiltersMobileInLayout}>
              <LoadCenterHubMobileShell
                embedInPageScroll
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                mainTabs={mainLoadTabs}
                activeMainTab={loadSubTab}
                onMainTabChange={setLoadSubTab}
                statusTabs={mobileStatusTabs}
                activeStatusTab={statusFilterTab}
                onStatusTabChange={(id) =>
                  setStatusFilterTab(id as StatusFilterTab)
                }
                showStatusTabs={
                  !isClaimedTab &&
                  !(restrictToIndentIds && loadSubTab === "GIVE_LOAD")
                }
                showDoneSubTabs={statusFilterTab === "DONE" && !isClaimedTab}
                doneSubTabs={mobileDoneSubTabs}
                activeDoneSubTab={doneSubTab}
                onDoneSubTabChange={(id) => setDoneSubTab(id as DoneSubTab)}
                findLoadsAction={
                  loadSubTab === "GIVE_LOAD" ? undefined : (
                  <PulsePillButton
                    label="Marketplace Loads"
                    size="compact"
                    variant="outline"
                    showPlusIcon
                    IconComponent={Compass}
                    onPress={() =>
                      router.push(ROUTES.FIND_LOADS as import("expo-router").Href)
                    }
                    accessibilityLabel="Marketplace Loads — open Marketplace opportunities"
                  />
                  )
                }
              />
              {loadSubTab === "GIVE_LOAD" || loadSubTab === "GET_LOAD" ? (
                <View style={styles.mobileNetworkToolbarRowInScroll}>
                  <View style={styles.mobileNetworkToolbarInner}>
                    {(loadSubTab === "GIVE_LOAD"
                      ? integratedSuppliers
                      : integratedClients
                    ).length > 0 ? (
                      <View style={styles.mobileNetworkPartiesFlex}>
                        <LoadCenterIntegratedPartiesRow
                          mode={loadSubTab === "GIVE_LOAD" ? "supplier" : "client"}
                          parties={
                            loadSubTab === "GIVE_LOAD"
                              ? integratedSuppliers
                              : integratedClients
                          }
                          onAddToNetwork={openNetworkForParties}
                          onPartyPress={openIntegratedParty}
                        />
                      </View>
                    ) : (
                      <View style={styles.mobileNetworkPartiesFlex} />
                    )}
                    <Pressable
                      style={({ pressed }) => [
                        styles.mobileFindOppsBtn,
                        pressed && styles.mobileFindOppsBtnPressed,
                      ]}
                      onPress={() =>
                        setFindMarketplaceMode(
                          loadSubTab === "GET_LOAD" ? "get" : "give",
                        )
                      }
                      accessibilityRole="button"
                      accessibilityLabel={
                        loadSubTab === "GET_LOAD"
                          ? "Search open opportunities"
                          : "Search idle capacity"
                      }
                      hitSlop={8}
                    >
                      <Search
                        size={16}
                        color={Theme.textPrimaryDark}
                        strokeWidth={2.2}
                      />
                    </Pressable>
                  </View>
                </View>
              ) : null}
            </View>
          ) : null}
          {!isMobileView && showLoadCenterChrome
            ? renderDesktopFilterPanel()
            : null}
          {isGiveGetTab ? (
            <View
              style={
                usePartnerSidebar ? styles.loadDesktopSplit : undefined
              }
            >
              {usePartnerSidebar && orgId ? (
                <View
                  style={[
                    styles.loadDesktopSidebar,
                    desktopBoardHeight != null
                      ? { minHeight: desktopBoardHeight }
                      : null,
                  ]}
                  onLayout={(e) => {
                    const next = Math.round(e.nativeEvent.layout.height);
                    if (next <= 0) return;
                    setPartnerSidebarHeight((prev) =>
                      prev === next ? prev : next,
                    );
                  }}
                >
                  {loadSubTab === "GIVE_LOAD" ? (
                    <View style={styles.sidebarIdleCapacity}>
                      <LoadCenterOpportunityExchange
                        orgId={orgId}
                        mode="give"
                        supplierOrgIds={connectedSupplierOrgIds}
                        clientOrgIds={connectedClientOrgIds}
                        embedded
                        sidebarStack
                      />
                      <Pressable
                        onPress={() => setFindMarketplaceMode("give")}
                        style={({ pressed }) => [
                          styles.findVehiclesBtn,
                          pressed && styles.findVehiclesBtnPressed,
                        ]}
                        accessibilityRole="button"
                        accessibilityLabel="Find vehicles"
                      >
                        <FontAwesome
                          name="truck"
                          size={12}
                          color={Theme.textOnDark}
                          style={{ marginRight: 8 }}
                        />
                        <Text style={styles.findVehiclesBtnText}>
                          Find vehicles
                        </Text>
                      </Pressable>
                    </View>
                  ) : (
                    <View style={styles.sidebarIdleCapacity}>
                      <Pressable
                        onPress={() => setFindMarketplaceMode("get")}
                        style={({ pressed }) => [
                          styles.findVehiclesBtn,
                          pressed && styles.findVehiclesBtnPressed,
                        ]}
                        accessibilityRole="button"
                        accessibilityLabel="Find load"
                      >
                        <FontAwesome
                          name="cube"
                          size={12}
                          color={Theme.textOnDark}
                          style={{ marginRight: 8 }}
                        />
                        <Text style={styles.findVehiclesBtnText}>
                          Find load
                        </Text>
                      </Pressable>
                      <LoadCenterSidebarFindEmpty mode="get" />
                    </View>
                  )}
                  <LoadCenterPartnerRecommendations
                    orgId={orgId}
                    mode={loadSubTab === "GET_LOAD" ? "get" : "give"}
                    onViewAll={openNetworkForParties}
                    enabled={enrichmentOpen}
                  />
                </View>
              ) : null}
              <View
                style={
                  usePartnerSidebar ? styles.loadDesktopMain : undefined
                }
              >
                {/* Opportunity cards open via search icon → Find drawer (mobile only). */}
                {!usePartnerSidebar &&
                orgId &&
                !isMobileView &&
                showLoadCenterChrome ? (
                  <View style={styles.loadPartnerRecsMobile}>
                    <LoadCenterPartnerRecommendations
                      orgId={orgId}
                      mode={loadSubTab === "GET_LOAD" ? "get" : "give"}
                      onViewAll={openNetworkForParties}
                      compact
                      enabled={enrichmentOpen}
                    />
                  </View>
                ) : null}
          {loadSubTab === "GIVE_LOAD" && (
            <>
              {isLoading ? (
                <View style={styles.loadingWrap}>
                  <ActivityIndicator size="small" color={Theme.primary} />
                  <Text style={styles.loadingText}>Loading…</Text>
                </View>
              ) : indentsError ? (
                <ContentErrorState
                  variant="loads"
                  layout="embedded"
                  onRetry={() => {
                    void refetchIndents();
                  }}
                />
              ) : isTripsPresentation ? (
                renderGiveLoadTripsCards()
              ) : !isMobileView ? (
                effectiveHirePartnerLoads.length === 0 ? (
                  renderLoadCenterEmptyPromo()
                ) : (
                  <LoadCenterKanbanBoard
                    title="Your indents by stage"
                    columns={giveLoadKanbanColumns}
                    renderCard={renderGiveLoadGridCard}
                    highlightedIndentId={highlightedIndentId}
                    matchHeight={desktopBoardHeight}
                    onColumnPress={(col) => openKanbanColumn("give", col)}
                  />
                )
              ) : effectiveFilteredHirePartnerLoads.length === 0 ? (
                renderLoadCenterEmptyPromo()
              ) : useGridLayout ? (
                <View style={styles.gridList}>
                  <View style={styles.loadSectionHeaderBlock}>
                    <View style={styles.loadSectionRow}>
                      <Text style={styles.loadSectionTitle}>
                        Your active indents
                      </Text>
                      <View style={styles.loadSectionRowActions}>
                        <View style={styles.loadSectionPill}>
                          <Text style={styles.loadSectionPillText}>Live</Text>
                        </View>
                      </View>
                    </View>
                    <Text style={styles.loadSectionSub}>
                      Indents not yet awarded go out as a 24h story. Green Pulse
                      is live; red Pulse reboosts after expiry.
                    </Text>
                  </View>
                  {effectiveFilteredHirePartnerLoads.map((load) => (
                        <View
                          key={load.id}
                          style={[
                            styles.gridCardWrap,
                            highlightedIndentId === load.id &&
                              styles.highlightedIndentCard,
                          ]}
                        >
                          {renderGiveLoadGridCard(load)}
                        </View>
                      ))}
                </View>
              ) : (
                <LoadCenterHubMobileListCanvas>
                  {!isMobileView ? (
                    <View style={styles.loadSectionHeaderBlock}>
                      <View style={styles.loadSectionRow}>
                        <Text style={styles.loadSectionTitle}>
                          Your active indents
                        </Text>
                        <View style={styles.loadSectionRowActions}>
                          <View style={styles.loadSectionPill}>
                            <Text style={styles.loadSectionPillText}>Live</Text>
                          </View>
                        </View>
                      </View>
                      <Text style={styles.loadSectionSub}>
                        Indents not yet awarded go out as a 24h story. Green Pulse
                        is live; red Pulse reboosts after expiry.
                      </Text>
                    </View>
                  ) : null}
                  {effectiveFilteredHirePartnerLoads.map((load) => (
                    <View
                      key={load.id}
                      style={
                        highlightedIndentId === load.id
                          ? styles.highlightedIndentCard
                          : undefined
                      }
                    >
                      {isMobileView
                        ? renderGiveLoadMobileCard(load)
                        : renderGiveLoadListCard(load)}
                    </View>
                  ))}
                </LoadCenterHubMobileListCanvas>
              )}
            </>
          )}

          {loadSubTab === "GET_LOAD" &&
            showLoadCenterChrome &&
            (getLoadPending ? (
              <View style={styles.loadingWrap}>
                <ActivityIndicator size="small" color={Theme.primary} />
                <Text style={styles.loadingText}>Loading…</Text>
              </View>
            ) : marketError ? (
              <ContentErrorState
                variant="loads"
                layout="embedded"
                onRetry={() => {
                  void refetchMarketIndents();
                }}
                retrying={marketRefetching}
              />
            ) : !isMobileView ? (
              findWorkLoads.length === 0 &&
              awardedLoads.length === 0 &&
              findWorkDoneUnionLoads.length === 0 &&
              getLoadOpportunityPosts.length === 0 &&
              extraMarketplaceLoads.length === 0 &&
              !marketplaceLoadsQ.isFetching ? (
                renderLoadCenterEmptyPromo()
              ) : (
                <>
                  {findWorkLoads.length > 0 ||
                  awardedLoads.length > 0 ||
                  findWorkDoneUnionLoads.length > 0 ? (
                    <LoadCenterKanbanBoard
                      title="Market opportunities by stage"
                      columns={getLoadKanbanColumnsWithOpps}
                      renderCard={renderGetLoadGridCard}
                      highlightedIndentId={highlightedIndentId}
                      matchHeight={desktopBoardHeight}
                      onColumnPress={(col) => openKanbanColumn("get", col)}
                    />
                  ) : null}
                  {renderGetLoadMarketplaceStrip()}
                </>
              )
            ) : filteredFindWorkList.length === 0 &&
              getLoadOpportunityPosts.length === 0 &&
              extraMarketplaceLoads.length === 0 &&
              !marketplaceLoadsQ.isFetching ? (
              renderLoadCenterEmptyPromo()
            ) : filteredFindWorkList.length === 0 ? (
              <LoadCenterHubMobileListCanvas>
                {renderGetLoadMarketplaceStrip()}
              </LoadCenterHubMobileListCanvas>
            ) : useGridLayout ? (
              <View style={styles.gridList}>
                <View style={styles.loadSectionRow}>
                  <Text style={styles.loadSectionTitle}>
                    Market opportunities
                  </Text>
                  <View style={styles.loadSectionPill}>
                    <Text style={styles.loadSectionPillText}>Live</Text>
                  </View>
                </View>
                {filteredFindWorkList.map((load) => (
                  <View
                    key={load.id}
                    style={[
                      styles.gridCardWrap,
                      highlightedIndentId === load.id &&
                        styles.highlightedIndentCard,
                    ]}
                  >
                    {renderGetLoadGridCard(load)}
                  </View>
                ))}
                {renderGetLoadMarketplaceStrip()}
              </View>
            ) : (
              <LoadCenterHubMobileListCanvas>
                {!isMobileView ? (
                  <View style={styles.loadSectionRow}>
                    <Text style={styles.loadSectionTitle}>
                      Market opportunities
                    </Text>
                    <View style={styles.loadSectionPill}>
                      <Text style={styles.loadSectionPillText}>Live</Text>
                    </View>
                  </View>
                ) : null}
                {filteredFindWorkList.map((load) => (
                  <View
                    key={load.id}
                    style={
                      highlightedIndentId === load.id
                        ? styles.highlightedIndentCard
                        : undefined
                    }
                  >
                    {isMobileView
                      ? renderGetLoadMobileCard(load)
                      : renderGetLoadListCard(load)}
                  </View>
                ))}
                {renderGetLoadMarketplaceStrip()}
              </LoadCenterHubMobileListCanvas>
            ))}
              </View>
            </View>
          ) : null}

          {loadSubTab === "AWARDED" &&
            showLoadCenterChrome &&
            (displayedClaimedLoads.length === 0 ? (
              renderLoadCenterEmptyPromo()
            ) : useGridLayout ? (
              <View style={styles.securedSection}>
                <View style={styles.loadSectionRow}>
                  <Text style={styles.loadSectionTitle}>
                    Pending allocation
                  </Text>
                  <View style={styles.loadSectionPill}>
                    <Text style={styles.loadSectionPillText}>
                      {displayedClaimedLoads.length} to allocate
                    </Text>
                  </View>
                </View>
                <View style={styles.gridList}>
                  {displayedClaimedLoads.map((load) => (
                    <View
                      key={`claimed-${load.id}`}
                      style={[
                        styles.gridCardWrap,
                        highlightedIndentId === load.id &&
                          styles.highlightedIndentCard,
                      ]}
                    >
                      {renderClaimedGridCard(load, false)}
                    </View>
                  ))}
                </View>
              </View>
            ) : (
              <LoadCenterHubMobileListCanvas>
                {!isMobileView ? (
                  <View style={[styles.securedSection, { marginBottom: 8 }]}>
                    <View style={styles.loadSectionRow}>
                      <Text style={styles.loadSectionTitle}>
                        Pending allocation
                      </Text>
                      <View style={styles.loadSectionPill}>
                        <Text style={styles.loadSectionPillText}>
                          {displayedClaimedLoads.length} to allocate
                        </Text>
                      </View>
                    </View>
                  </View>
                ) : null}
                {displayedClaimedLoads.map((load) => (
                  <View
                    key={load.id}
                    style={
                      highlightedIndentId === load.id
                        ? styles.highlightedIndentCard
                        : undefined
                    }
                  >
                    {renderClaimedMobileCard(load, false)}
                  </View>
                ))}
              </LoadCenterHubMobileListCanvas>
            ))}
        </ScrollView>
        )}
      </View>

      {/* Success overlay */}
      {showSuccess && (
        <View style={styles.successOverlay}>
          <View style={styles.successCard}>
            <View style={styles.successIconWrap}>
              <FontAwesome name="check" size={16} color={Theme.buttonPrimaryText} />
            </View>
            <Text style={styles.successTag}>Success</Text>
            <Text style={styles.successTitle}>{successMsg || "Success"}</Text>
          </View>
        </View>
      )}

      {/* Post / Broadcast modal — opens create-indent (reference: Deploy New Load) */}
      <Modal
        visible={showPostModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowPostModal(false)}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setShowPostModal(false)}
        >
          <View
            style={[styles.modalSheet, { paddingBottom: 24 + insets.bottom }]}
          >
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderBack} />
              <View style={styles.modalHeaderTitleWrap}>
                <Text style={styles.modalTitle}>Deploy New Load</Text>
              </View>
              <TouchableOpacity
                onPress={() => setShowPostModal(false)}
                hitSlop={12}
                style={styles.modalHeaderClose}
              >
                <FontAwesome name="times" size={24} color={Theme.textMuted} />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalHint}>
              Create an indent to share with your network.
            </Text>
            <TouchableOpacity
              style={styles.modalSubmit}
              onPress={() => {
                if (!canSurface("tripops.indents.create")) return;
                setShowPostModal(false);
                onCreateIndentPress();
              }}
              activeOpacity={0.9}
            >
              <FontAwesome
                name="send"
                size={16}
                color={Theme.primary}
                style={{ marginRight: 12 }}
              />
              <Text style={styles.modalSubmitText}>Share with Network</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      <LoadCenterKanbanColumnModal
        visible={expandedKanbanColumn != null}
        column={expandedKanbanColumn}
        onClose={closeKanbanColumn}
        renderCard={
          expandedKanbanMode === "get"
            ? renderGetLoadGridCard
            : renderGiveLoadGridCard
        }
        highlightedIndentId={highlightedIndentId}
        detailIndentId={kanbanDetailIndentId}
        onCloseDetail={() => setKanbanDetailIndentId(null)}
        onEditIndent={handleKanbanEditIndent}
        previousStage={kanbanStageNeighbors.previous}
        nextStage={kanbanStageNeighbors.next}
        onNavigateStage={navigateKanbanStage}
      >
        <AwardModal
          visible={awardModal.isOpen}
          award={awardModal}
          onViewIndent={handleCardIndentPress}
          insets={insets}
        />
        <BidModal
          visible={bidLoad !== null}
          load={bidLoad}
          orgId={orgId}
          myQuoteByIndentId={myQuoteByIndentId}
          onClose={() => setBidLoad(null)}
          onSuccess={triggerSuccess}
          localBidHistoryByIndentId={localBidHistoryByIndentId}
          onUpdateLocalBidHistory={(indentId, entry) => {
            setLocalBidHistoryByIndentId((prev) => {
              const prior = prev[indentId] ?? [];
              const alreadyExists = prior.some(
                (row) =>
                  Number(row.amount) === Number(entry.amount) &&
                  row.updatedAt === entry.updatedAt,
              );
              if (alreadyExists) return prev;
              return {
                ...prev,
                [indentId]: [entry, ...prior].slice(0, 10),
              };
            });
          }}
          queryClient={queryClient}
          invalidateIndents={invalidateIndents}
          refetchMyQuotes={refetchMyQuotes}
          refetchMarketIndents={refetchMarketIndents}
          insets={insets}
        />
      </LoadCenterKanbanColumnModal>

      {expandedKanbanColumn == null ? (
        <AwardModal
          visible={awardModal.isOpen}
          award={awardModal}
          onViewIndent={onIndentPress}
          insets={insets}
        />
      ) : null}

      <FindNetworkVehiclesDrawer
        visible={findMarketplaceMode != null}
        mode={findMarketplaceMode ?? "give"}
        onClose={() => setFindMarketplaceMode(null)}
        orgId={orgId}
        supplierOrgIds={connectedSupplierOrgIds}
        clientOrgIds={connectedClientOrgIds}
      />

      {expandedKanbanColumn == null ? (
        <BidModal
          visible={bidLoad !== null}
          load={bidLoad}
          orgId={orgId}
          myQuoteByIndentId={myQuoteByIndentId}
          onClose={() => setBidLoad(null)}
          onSuccess={triggerSuccess}
          localBidHistoryByIndentId={localBidHistoryByIndentId}
          onUpdateLocalBidHistory={(indentId, entry) => {
            setLocalBidHistoryByIndentId((prev) => {
              const prior = prev[indentId] ?? [];
              const alreadyExists = prior.some(
                (row) =>
                  Number(row.amount) === Number(entry.amount) &&
                  row.updatedAt === entry.updatedAt,
              );
              if (alreadyExists) return prev;
              return {
                ...prev,
                [indentId]: [entry, ...prior].slice(0, 10),
              };
            });
          }}
          queryClient={queryClient}
          invalidateIndents={invalidateIndents}
          refetchMyQuotes={refetchMyQuotes}
          refetchMarketIndents={refetchMarketIndents}
          insets={insets}
        />
      ) : null}

      {orgId ? (
        <ShareLoadSheet
          visible={pulseShareIndent != null}
          indent={pulseShareIndent}
          orgId={orgId}
          onClose={() => setPulseShareIndent(null)}
          onSuccess={handlePulseStoryShareSuccess}
          onBoostAfterBroadcast={handleBoostAfterBroadcast}
        />
      ) : null}

      {orgId && boostPostId ? (
        <BoostSheet
          visible={boostSheetVisible}
          onClose={() => {
            setBoostSheetVisible(false);
            setBoostPostId(null);
          }}
          orgId={orgId}
          postId={boostPostId}
          onBoosted={() => {
            invalidatePosts();
            void refetchIndentStories();
            if (orgId) {
              void queryClient.invalidateQueries({
                queryKey: queryKeys.reach.campaignsForOrg(orgId),
              });
              void queryClient.invalidateQueries({
                queryKey: queryKeys.reach.wallet(orgId),
              });
            }
          }}
        />
      ) : null}

    </View>
  );

  return isTripsPresentation ? (
    loadCenterBody
  ) : (
    <HubScreenShell footer={null}>{loadCenterBody}</HubScreenShell>
  );
}

/** Load hub page canvas — aligned with Trips (`#eef2f6`). */
const LOAD_CONTENT_BG = LOADS_HUB_PAGE_BG;

const styles = StyleSheet.create({
  container: { flex: 1, minHeight: 0, backgroundColor: LOADS_HUB_PAGE_BG },
  tripsPresentationRoot: {
    flexGrow: 0,
    flexShrink: 0,
    width: "100%",
    backgroundColor: "transparent",
    ...Platform.select({
      web: { height: "auto", minHeight: "auto" },
    }),
  },
  tripsEmbedScroll: {
    flexGrow: 0,
    backgroundColor: "transparent",
  },
  tripsEmbedContent: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 4,
    paddingBottom: 8,
    flexGrow: 0,
    flexShrink: 0,
    width: "100%",
    backgroundColor: "transparent",
    ...Platform.select({
      web: { height: "auto", minHeight: "auto" },
    }),
  },
  tripsLoadContentWrap: {
    flexGrow: 0,
    flexShrink: 0,
    width: "100%",
    backgroundColor: "transparent",
    overflow: "visible",
    ...Platform.select({
      web: { height: "auto", minHeight: "auto" },
    }),
  },
  containerMobileHub: {
    backgroundColor: LOADS_HUB_PAGE_BG,
  },
  loadsBodyFiltersBleed: {
    marginHorizontal: -Layout.screenPaddingHorizontal,
    marginBottom: 4,
    paddingTop: 4,
    paddingBottom: 4,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    backgroundColor: "transparent",
    ...Platform.select({
      web: { minWidth: 0 },
    }),
  },
  loadsInlineFilterPanelDesktop: {
    marginBottom: 0,
    backgroundColor: Theme.screenBackground,
    overflow: "visible",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
  },
  loadsInlineFilterPanelInner: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 14,
    paddingBottom: 14,
    gap: 12,
  },
  loadsFilterActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
  },
  /** Give load / Get load / Claimed tab strip, now first in filterHeaderRow (left side).
   * Local copy of chatChrome.filterHeaderRight without its `marginLeft: "auto"` — that
   * rule assumes the tab strip is last in the row and would fight this reordering. */
  loadsFilterTabsWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 0,
  },
  mobileNetworkToolbarRow: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 6,
    paddingBottom: 6,
    backgroundColor: Theme.screenBackground,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
  },
  mobileNetworkToolbarRowInScroll: {
    paddingTop: 6,
    paddingBottom: 6,
    backgroundColor: Theme.screenBackground,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
  },
  mobileNetworkToolbarInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 42,
  },
  mobileNetworkPartiesFlex: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
  },
  mobileFindOppsBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  mobileFindOppsBtnPressed: {
    opacity: 0.88,
  },
  loadsSearchIcon: { marginRight: 8 },
  loadsSearchWrapFlex: {
    flex: 1,
    minWidth: 0,
  },
  loadsSearchWrapInline: {
    width: 220,
    maxWidth: 260,
    flexShrink: 1,
    minWidth: 160,
  },
  loadsSearchCluster: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flexShrink: 1,
    minWidth: 0,
    marginLeft: "auto",
  },
  loadsStatusTabRow: {
    flexWrap: "wrap",
  },
  loadsTabDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Theme.borderLight,
    marginTop: 4,
    marginBottom: 2,
  },
  sidebarIdleCapacity: {
    width: "100%",
    minWidth: 0,
    flexGrow: 1,
    flexShrink: 1,
    gap: 10,
  },
  findVehiclesBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: Theme.textPrimaryDark,
  },
  findVehiclesBtnPressed: {
    opacity: 0.9,
  },
  findVehiclesBtnText: {
    fontSize: 12,
    fontWeight: "800",
    color: Theme.textOnDark,
    letterSpacing: 0.2,
  },
  loadsCombinedTabRow: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "stretch",
    justifyContent: "space-between",
    width: "100%",
    paddingTop: 2,
    paddingBottom: 4,
    flexWrap: "wrap",
    gap: 8,
  },
  loadsDoneTabGroup: {
    flexShrink: 0,
    marginLeft: "auto",
  },
  loadsStatusTabGroup: {
    flexShrink: 1,
    minWidth: 0,
    alignSelf: "flex-start",
  },
  loadSearchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingTop: 10,
  },
  loadSearchRowClaimed: {
    paddingTop: 6,
  },
  loadSearchWrap: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    height: 38,
    backgroundColor: Theme.screenBackground,
    paddingHorizontal: 12,
    paddingVertical: 0,
  },
  loadSearchWrapSingle: {
    flex: 1,
    maxWidth: 520,
    minWidth: 300,
    height: 36,
    marginHorizontal: 6,
  },
  loadSearchIcon: { marginRight: 8 },
  loadSearchInput: {
    flex: 1,
    minWidth: 0,
    height: 18,
    fontSize: 11,
    lineHeight: 11,
    color: Theme.textPrimaryDark,
    paddingVertical: 0,
    ...Platform.select({
      web: {
        outlineStyle: "none",
      } as object,
    }),
  },
  loadTypeFilterWrap: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 0,
    backgroundColor: Theme.surface,
    paddingHorizontal: 6,
    paddingVertical: 4,
    gap: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },
  loadTypeFilterChip: {
    paddingHorizontal: 7,
    paddingVertical: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  loadTypeFilterChipActive: {
    backgroundColor: Theme.screenBackground,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.09,
    shadowRadius: 4,
    elevation: 1,
  },
  loadTypeFilterChipText: {
    fontSize: 8,
    fontWeight: "700",
    color: Theme.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  loadTypeFilterChipTextActive: {
    color: Theme.textPrimaryDark,
  },
  loadTypeFilterChipCount: {
    fontSize: 8,
    fontWeight: "700",
    color: Theme.textSecondary,
  },
  loadTypeFilterChipCountActive: {
    color: Theme.textPrimaryDark,
  },
  loadContentWrap: {
    flex: 1,
    backgroundColor: LOADS_HUB_PAGE_BG,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    marginTop: 0,
    overflow: "hidden",
  },
  /** Network-style Give/Get desktop: suggested partners rail + loads main. */
  loadDesktopSplit: {
    flexDirection: "row",
    alignItems: "stretch",
    flexWrap: "nowrap",
    gap: 12,
    width: "100%",
    marginTop: 8,
    marginBottom: 4,
    ...Platform.select({
      web: { display: "flex" as const },
    }),
  },
  loadDesktopSidebar: {
    width: 280,
    maxWidth: 300,
    flexShrink: 0,
    gap: 10,
    alignSelf: "flex-start",
    ...Platform.select({
      web: { position: "sticky" as const, top: 8 },
    }),
  },
  loadDesktopMain: {
    flex: 1,
    minWidth: 0,
    gap: 0,
    alignSelf: "stretch",
  },
  loadPartnerRecsMobile: {
    marginTop: 4,
    marginBottom: 12,
    width: "100%",
    alignSelf: "stretch",
  },
  loadContentWrapClaimed: {
    marginTop: 0,
  },
  loadContentWrapMobileHub: {
    backgroundColor: LOADS_HUB_PAGE_BG,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    marginTop: 0,
  },
  loadCanvasIntegratedEmpty: {
    backgroundColor: Theme.cardWhite,
  },
  scroll: { flex: 1, backgroundColor: LOADS_HUB_PAGE_BG },
  scrollContent: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 4,
    flexGrow: 1,
    backgroundColor: LOADS_HUB_PAGE_BG,
    ...Platform.select({
      web: { minWidth: 0, maxWidth: "100%" as const },
    }),
  },
  scrollContentMobileHub: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 4,
  },
  scrollContentIntegratedEmpty: {
    backgroundColor: Theme.cardWhite,
  },
  loadSectionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 0,
    paddingHorizontal: 2,
    width: "100%",
  },
  loadSectionHeaderBlock: {
    width: "100%",
    marginBottom: 12,
  },
  marketplaceLazyWrap: {
    width: "100%",
    marginTop: 16,
    gap: 10,
  },
  marketplaceLazyCard: {
    width: "100%",
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  marketplaceLazyShipper: {
    fontSize: 13,
    fontWeight: "600",
    color: Theme.textPrimary,
  },
  loadSectionSub: {
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "600",
    color: Theme.textSecondary,
    marginTop: 6,
    paddingHorizontal: 2,
  },
  loadSectionTitle: {
    fontSize: 10,
    fontWeight: "600",
    fontStyle: "normal",
    color: Theme.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.55,
    flex: 1,
    minWidth: 0,
  },
  loadSectionRowActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 0,
  },
  loadSectionPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: Theme.surfaceGray,
  },
  loadSectionPillText: {
    fontSize: 8,
    fontWeight: "800",
    color: Theme.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  loadMarketClientRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
    zIndex: 1,
  },
  /** Fixed slot height so grid row mates align when org name is missing */
  loadMarketClientRowGrid: {
    minHeight: 28,
  },
  loadMarketClientRowGridReserve: {
    minHeight: 28,
    marginBottom: 8,
  },
  loadMarketClientText: {
    flex: 1,
    fontSize: 10,
    fontWeight: "800",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    minWidth: 0,
  },
  loadCardQuoteHint: {
    marginTop: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: Theme.screenBackground,
  },
  loadCardQuoteHintText: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textSecondary,
  },
  reviewHubHero: {
    backgroundColor: Theme.textPrimaryDark,
    padding: 18,
    marginBottom: 16,
    overflow: "hidden",
  },
  reviewHubHeroGlow: {
    position: "absolute",
    top: -40,
    right: -40,
    width: 140,
    height: 140,
    backgroundColor: "rgba(255,255,255,0.07)",
  },
  reviewHubHeroKicker: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textOnDarkMuted,
    textTransform: "uppercase",
    letterSpacing: 1.4,
    marginBottom: 8,
    fontStyle: "italic",
  },
  reviewHubHeroRoute: {
    fontSize: 18,
    fontWeight: "900",
    fontStyle: "italic",
    color: Theme.textOnDark,
    textTransform: "uppercase",
    letterSpacing: -0.2,
    lineHeight: 24,
  },
  reviewHubHeroMeta: {
    flexDirection: "row",
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderOnDark,
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 8,
    minWidth: 0,
  },
  reviewHubHeroMetaCol: {
    flex: 1,
    minWidth: 0,
  },
  reviewHubHeroMetaColEnd: {
    flexShrink: 1,
    minWidth: 0,
    maxWidth: "58%",
    alignItems: "flex-end",
  },
  reviewHubHeroStatValueEnd: {
    textAlign: "right",
    alignSelf: "stretch",
  },
  reviewHubHeroStatLabel: {
    fontSize: 8,
    fontWeight: "800",
    color: Theme.textOnDarkMuted,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  reviewHubHeroStatValue: {
    fontSize: 13,
    fontWeight: "900",
    color: Theme.textOnDark,
  },
  modalTitleCenter: {
    textAlign: "center",
    width: "100%",
  },
  modalSubtitle: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 1.6,
    marginTop: 4,
    textAlign: "center",
  },
  reviewHubModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  reviewHubModalBack: {
    width: 44,
    height: 44,
    backgroundColor: Theme.surfaceLight,
    alignItems: "center",
    justifyContent: "center",
  },
  reviewHubModalHeaderSpacer: {
    width: 44,
    height: 44,
  },
  bidHubHero: {
    backgroundColor: Theme.textPrimaryDark,
    padding: 18,
    marginBottom: 16,
    overflow: "hidden",
    minWidth: 0,
    alignSelf: "stretch",
    ...Platform.select({
      web: { maxWidth: "100%" as const },
    }),
  },
  bidHubHeroGlow: {
    position: "absolute",
    top: -36,
    right: -36,
    width: 120,
    height: 120,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  bidHubHeroKicker: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textOnDarkMuted,
    textTransform: "uppercase",
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  bidHubHeroRoute: {
    fontSize: 17,
    fontWeight: "900",
    fontStyle: "italic",
    color: Theme.textOnDark,
    textTransform: "uppercase",
    lineHeight: 22,
    marginBottom: 10,
  },
  bidHubHeroChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  bidHubChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  bidHubChipText: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textOnDarkMuted,
    textTransform: "uppercase",
  },
  bidSectionTitle: {
    fontSize: 11,
    fontWeight: "900",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 10,
  },
  scrollContentClaimed: {
    paddingTop: 12,
  },
  gridList: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: -4,
    alignItems: "stretch",
  },
  /** Desktop load grid — 4 cards per row (aligns with Trips hub + column modal). */
  gridCardWrap: {
    width: "25%",
    maxWidth: "25%",
    flexBasis: "25%",
    paddingHorizontal: 4,
    marginBottom: 12,
    alignSelf: "stretch",
  },
  gridPaginationWrap: {
    width: "100%",
    flexBasis: "100%",
    paddingHorizontal: 4,
    marginTop: 4,
    marginBottom: 8,
  },
  loadCardGrid: {
    flex: 1,
    width: "100%",
    alignSelf: "stretch",
    marginBottom: 0,
  },
  loadCardFooterGrid: {
    marginTop: "auto",
  },
  loadingWrap: { paddingVertical: 32, alignItems: "center", gap: 12 },
  loadingText: { fontSize: 10, fontWeight: "700", color: Theme.textMuted },
  loadCard: {
    position: "relative",
    backgroundColor: Theme.cardWhite,
    padding: 18,
    marginBottom: 12,
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.07,
    shadowRadius: 16,
    elevation: 3,
    overflow: "hidden",
    minHeight: 0,
  },
  loadCardOrb: {
    position: "absolute",
    top: -72,
    right: -48,
    width: 180,
    height: 180,
    backgroundColor: Theme.textPrimaryDark,
    opacity: 0.04,
  },
  loadCardHeroRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
    zIndex: 1,
  },
  loadCardDateHero: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1.2,
    marginTop: 2,
  },
  loadCardTop: {
    marginBottom: 8,
  },
  loadPillRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 1,
    flexWrap: "wrap",
  },
  loadTypePill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: Theme.surfaceGray,
  },
  loadTypePillText: {
    fontSize: 7,
    fontWeight: "800",
    letterSpacing: 0.35,
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
  },
  loadStatePill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  loadStatePillText: {
    fontSize: 7,
    fontWeight: "800",
    letterSpacing: 0.45,
    textTransform: "uppercase",
  },
  loadStatePillGetLoadDefault: {
    backgroundColor: Theme.positive,
  },
  loadCardTopLeft: {
    flex: 1,
    minWidth: 0,
    paddingRight: 10,
  },
  loadCardTopRight: {
    flexShrink: 0,
    alignItems: "flex-end",
    maxWidth: "40%",
  },
  loadCardIdCompact: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textSecondary,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: 12,
    zIndex: 1,
  },
  loadCardSpecsPanel: {
    backgroundColor: Theme.surfaceGray,
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginBottom: 4,
    zIndex: 1,
  },
  loadCardSpecDivider: {
    borderLeftWidth: 1,
    borderLeftColor: Theme.borderMedium,
    paddingLeft: 12,
    marginLeft: 0,
  },
  bidMetaWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
  },
  bidIconCircle: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  bidIconCircleActive: {
    backgroundColor: Theme.screenBackground,
  },
  bidIconCircleMuted: {
    backgroundColor: Theme.surfaceGray,
  },
  shareIndentIconBtn: {
    width: 44,
    height: 44,
    backgroundColor: Theme.surfaceGray,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  broadcastNetworkBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    backgroundColor: Theme.buttonPrimary,
    paddingHorizontal: 12,
    minHeight: 44,
    paddingVertical: 0,
    flexShrink: 0,
    shadowColor: Theme.brandBlueInk,
    shadowOpacity: 0.35,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  broadcastNetworkBtnText: {
    fontSize: 11,
    fontWeight: "900",
    color: Theme.buttonPrimaryText,
    letterSpacing: 0.2,
  },
  loadCardId: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textMuted,
    marginTop: 6,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  loadCardDate: {
    backgroundColor: LOAD_CONTENT_BG,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  loadCardDateText: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  loadCardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "nowrap",
    gap: 10,
    marginTop: 4,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
    zIndex: 1,
  },
  loadCardFooterCompact: {
    flexDirection: "column",
    alignItems: "stretch",
    flexWrap: "wrap",
    rowGap: 10,
    columnGap: 0,
  },
  loadCardMeta: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  loadCardMetaCompact: {
    flexGrow: 0,
    flexShrink: 1,
    alignSelf: "stretch",
  },
  loadCardMetaText: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    flex: 1,
    minWidth: 0,
  },
  loadCardActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    marginLeft: 10,
    flexShrink: 0,
    flexGrow: 0,
    minWidth: 0,
  },
  loadCardActionsCompact: {
    marginLeft: 0,
    alignSelf: "stretch",
    justifyContent: "flex-end",
    width: "100%",
    maxWidth: "100%",
  },
  loadCardActionCluster: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    flexWrap: "nowrap",
    gap: 8,
    flexGrow: 0,
    flexShrink: 0,
  },
  loadCardActionClusterStacked: {
    flexWrap: "wrap",
    rowGap: 8,
    flexShrink: 1,
    maxWidth: "100%",
    alignSelf: "flex-end",
  },
  shareIndentBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "#f8f9fa",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.02,
    shadowRadius: 2,
    elevation: 1,
    minHeight: 30,
  },
  shareIndentBtnText: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  shareIndentBtnIcon: {
    marginRight: 6,
  },
  reviewBidsBtn: {
    backgroundColor: TESLA_BLACK,
    paddingHorizontal: 20,
    paddingVertical: 12,
    minHeight: 44,
    justifyContent: "center",
    alignItems: "center",
    flexShrink: 0,
  },
  reviewBidsBtnText: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.buttonDarkText,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  deployPendingWrap: {
    paddingHorizontal: 12,
    minHeight: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  deployPendingText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#D0D0D0",
    textTransform: "uppercase",
    letterSpacing: 2,
  },
  awardedStatusPill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: Theme.surfaceGray,
  },
  awardedStatusPillText: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textSecondary,
    textTransform: "uppercase",
  },
  getLoadCompany: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    flex: 1,
    minWidth: 0,
  },
  getLoadCompanyWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  getLoadAvatarWrap: {
    width: 24,
    height: 24,
    backgroundColor: Theme.surface,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  getLoadAvatarImage: {
    width: "100%",
    height: "100%",
  },
  getLoadAvatarInitial: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textSecondary,
  },
  getLoadTargetLabel: {
    fontSize: 6,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    textAlign: "right",
  },
  getLoadTargetValue: {
    fontSize: 12,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    textAlign: "right",
  },
  loadCardInner: {
    backgroundColor: Theme.surfaceGray,
    padding: 12,
    marginTop: 6,
    zIndex: 1,
  },
  loadCardInnerTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 6,
  },
  loadCardSpecsGrid: {
    gap: 6,
  },
  loadCardSpecsLabelsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 0,
  },
  loadCardSpecsValuesRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "flex-start",
    gap: 0,
  },
  loadCardSpecCell: {
    flex: 1,
    minWidth: 0,
  },
  loadCardSpecCellRight: {
    alignItems: "flex-end",
  },
  loadCardSpecLabel: {
    fontSize: 8,
    fontWeight: "600",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  loadCardSpecValue: {
    fontSize: 8,
    fontWeight: "500",
    color: Theme.textSecondary,
    lineHeight: 12,
    ...Platform.select({
      android: { includeFontPadding: false as const },
      default: {},
    }),
  },
  loadCardSpecLabelRight: {
    textAlign: "right",
    alignSelf: "stretch",
  },
  loadCardSpecValueRight: {
    textAlign: "right",
    alignSelf: "stretch",
  },
  quoteBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "flex-start",
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: Theme.surfaceGray,
    minHeight: 30,
  },
  quoteBtnText: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.teslaRed,
    textTransform: "uppercase",
  },
  quoteSentRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 8,
  },
  quoteSentBadge: { flexDirection: "row", alignItems: "center" },
  quoteSentText: { fontSize: 11, fontWeight: "600", color: Theme.textMuted },
  quoteDeclinedText: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textSecondary,
  },
  updateQuoteBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: Theme.surfaceGray,
    minHeight: 30,
  },
  updateQuoteBtnText: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.teslaRed,
    textTransform: "uppercase",
  },
  awardedCard: {
    backgroundColor: Theme.screenBackground,
    padding: 12,
    marginBottom: 8,
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
    overflow: "hidden",
    minHeight: 132,
  },
  awardedCardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  awardedBadge: { flexDirection: "row", alignItems: "center" },
  awardedBadgeText: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
  },
  awardedId: {
    fontSize: 7,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
  },
  awardedRouteWrap: {
    backgroundColor: Theme.surfaceGray,
    padding: 9,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  awardedRoute: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textSecondary,
    textTransform: "uppercase",
  },
  awardedAmount: {
    fontSize: 13,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
  },
  handshakeBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "stretch",
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: TESLA_BLACK,
    minHeight: 32,
  },
  handshakeBtnText: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.buttonDarkText,
    textTransform: "uppercase",
  },
  securedSection: {
    marginBottom: 20,
  },
  securedSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  securedSectionTitle: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  securedSectionCount: {
    minWidth: 20,
    paddingHorizontal: 7,
    paddingVertical: 3,
    backgroundColor: Theme.surfaceGray,
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textMuted,
    textAlign: "center",
  },
  loadCenterEmptyStage: {
    width: "100%",
    alignItems: "center",
    justifyContent: "flex-start",
    paddingVertical: 20,
    paddingHorizontal: 0,
    flexGrow: 0,
    flexShrink: 0,
    backgroundColor: "transparent",
  },
  loadCenterEmptyStageIntegrated: {
    alignItems: "stretch",
    justifyContent: "flex-start",
    paddingVertical: 0,
    backgroundColor: Theme.cardWhite,
  },
  getLoadEmptyWrap: {
    paddingTop: 20,
    paddingBottom: 40,
    alignItems: "center",
    gap: 16,
  },
  getLoadEmptyTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    marginTop: 4,
    textTransform: "uppercase",
    letterSpacing: 1.6,
  },
  getLoadEmptySub: {
    fontSize: 12,
    fontWeight: "500",
    color: Theme.textSecondary,
    textAlign: "center",
    paddingHorizontal: 12,
    lineHeight: 18,
    maxWidth: 340,
  },
  emptyWrap: {
    paddingVertical: 64,
    alignItems: "center",
    backgroundColor: Theme.screenBackground,
    marginHorizontal: 0,
    marginBottom: 32,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 12,
    elevation: 2,
  },
  emptyIconWrapMuted: {
    marginBottom: 20,
    opacity: 0.4,
  },
  emptyIconWrapGold: {
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    marginTop: 12,
    textTransform: "uppercase",
    letterSpacing: 2,
  },
  emptySub: {
    fontSize: 12,
    fontWeight: "500",
    color: "#A0A0A0",
    marginTop: 12,
    textAlign: "center",
    paddingHorizontal: 40,
    lineHeight: 20,
  },
  successOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15,23,42,0.18)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
  },
  successCard: {
    minWidth: 170,
    maxWidth: 220,
    backgroundColor: Theme.screenBackground,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 4,
  },
  successIconWrap: {
    width: 30,
    height: 30,
    backgroundColor: Theme.buttonPrimary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  successTag: {
    fontSize: 8,
    fontWeight: "800",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1.1,
    marginBottom: 2,
  },
  successTitle: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
    letterSpacing: 1,
    textAlign: "center",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.6)",
    justifyContent: "flex-end",
  },
  bidModalPage: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
    justifyContent: "flex-end",
    minWidth: 0,
    ...Platform.select({
      web: { maxWidth: "100%" as const },
    }),
  },
  modalSheet: {
    backgroundColor: Theme.screenBackground,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingHorizontal: 24,
    paddingTop: 12,
    minWidth: 0,
    ...Platform.select({
      web: { maxWidth: "100%" as const },
    }),
  },
  bidModalSheetFull: {
    flex: 1,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    ...Platform.select({
      web: { minWidth: 0, maxWidth: "100%" as const },
    }),
  },
  modalSheetCenter: { alignItems: "center" },
  modalHandle: {
    width: 48,
    height: 4,
    backgroundColor: Theme.surfaceGray,
    alignSelf: "center",
    marginBottom: 24,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  modalHeaderBack: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    minWidth: 40,
    height: 40,
  },
  modalHeaderBackText: {
    fontSize: 14,
    fontWeight: "600",
    color: Theme.teslaRed,
  },
  modalHeaderTitleWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  modalHeaderClose: {
    minWidth: 40,
    alignItems: "flex-end",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
    fontStyle: "italic",
  },
  modalHint: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textMuted,
    lineHeight: 18,
    marginBottom: 16,
  },
  modalSubmit: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 18,
    backgroundColor: Theme.darkBackground,
    alignSelf: "stretch",
    minWidth: 0,
    ...Platform.select({
      web: { width: "100%" as const, maxWidth: "100%" as const },
    }),
  },
  modalSubmitText: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textOnPrimary,
    textTransform: "uppercase",
    letterSpacing: 1.4,
  },
  handshakeBtnModal: { backgroundColor: Theme.textPrimaryDark },
  handshakeSegmentSection: {
    alignItems: "center",
    marginBottom: 20,
  },
  handshakeSegmentPill: {
    flexDirection: "row",
    backgroundColor: "#0f172a",
    padding: 4,
    gap: 4,
    ...Platform.select({
      web: {
        boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
      } as object,
      default: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
        elevation: 6,
      },
    }),
  },
  handshakeSegBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 22,
  },
  handshakeSegBtnActive: {
    backgroundColor: "rgba(255,255,255,0.1)",
    ...Platform.select({
      web: {
        boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.05)",
      } as object,
    }),
  },
  handshakeSegBtnText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#94a3b8",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  handshakeSegBtnTextActive: {
    color: Theme.buttonDarkText,
  },
  handshakeAssignLaterOuter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#ffffff",
    paddingVertical: 14,
    paddingHorizontal: 18,
    marginBottom: 20,
    ...Platform.select({
      web: {
        boxShadow: "0 1px 2px rgba(15,23,42,0.06)",
      } as object,
      default: {
        shadowColor: "#0f172a",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 1,
      },
    }),
  },
  handshakeAssignLaterOuterCompact: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  handshakeAssignLaterLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    flex: 1,
    minWidth: 0,
  },
  handshakeAssignLaterIconWrap: {
    width: 40,
    height: 40,
    backgroundColor: "#f8fafc",
    alignItems: "center",
    justifyContent: "center",
  },
  handshakeAssignLaterTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#1e293b",
  },
  handshakeAssignLaterSub: {
    fontSize: 10,
    fontWeight: "500",
    color: "#94a3b8",
    marginTop: 2,
  },
  handshakePrimaryCta: {
    width: "100%",
    minHeight: 52,
    backgroundColor: "#0f172a",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    paddingVertical: 14,
    paddingHorizontal: 16,
    ...Platform.select({
      web: {
        boxShadow: "0 12px 24px rgba(15,23,42,0.2)",
        cursor: "pointer",
      } as object,
      default: {
        shadowColor: "#0f172a",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.2,
        shadowRadius: 16,
        elevation: 6,
      },
    }),
  },
  handshakePrimaryCtaText: {
    fontSize: 11,
    fontWeight: "800",
    fontStyle: "italic",
    color: "#ffffff",
    textTransform: "uppercase",
    letterSpacing: 2,
  },
  assignWebModalCardCompact: {
    width: "98%",
    maxWidth: 760,
    ...Platform.select({
      web: { height: "92vh", maxHeight: "92vh" } as object,
      default: { maxHeight: "92%" },
    }),
  },
  handshakeNativeInner: {
    flex: 1,
    minHeight: 0,
  },
  assignModalPage: {
    flex: 1,
    backgroundColor: Theme.surfaceLight,
    position: "relative",
  },
  assignModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: Theme.screenBackground,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  assignModalHeaderText: { flex: 1, minWidth: 0 },
  assignModalTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
  },
  assignModalSubtitle: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textMuted,
    marginTop: 4,
  },
  assignModalCloseBtn: {
    width: 32,
    height: 32,
    backgroundColor: Theme.surfaceGray,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 12,
  },
  assignModalScroll: { flex: 1 },
  assignModalBody: {
    flex: 1,
    minHeight: 0,
  },
  assignModalScrollContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
    width: "100%",
    alignSelf: "stretch",
  },
  tripAssignCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 10,
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: assignmentShellColors.borderSlate,
  },
  tripAssignCardHeaderTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  tripAssignSourceBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  tripAssignBadgeUnassigned: {
    backgroundColor: Theme.surfaceLight,
  },
  tripAssignSourceBadgeText: {
    fontSize: 7,
    fontWeight: "600",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  tripAssignSourceBadgeTextUnassigned: {
    color: Theme.textPrimaryDark,
  },
  tripAssignRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: assignmentShellColors.borderSlate,
  },
  tripAssignRowLast: { borderBottomWidth: 0 },
  tripAssignRowLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  tripAssignIcon: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  tripAssignIconInactive: {
    backgroundColor: "#f3f4f6",
  },
  tripAssignIconDriverActive: {
    backgroundColor: Theme.surfaceGray,
  },
  tripAssignIconVehicleActive: {
    backgroundColor: Theme.surfaceGray,
  },
  tripAssignRowTextCol: { flex: 1, minWidth: 0 },
  tripAssignRowLabel: {
    fontSize: 9,
    fontWeight: "400",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  tripAssignRowInput: {
    fontSize: 13,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    paddingVertical: 0,
    paddingHorizontal: 0,
    minHeight: 22,
    ...Platform.select({
      web: {
        outlineStyle: "none",
      } as object,
    }),
  },
  phoneModalFound: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    marginTop: 4,
  },
  phoneModalNotFound: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textMuted,
    marginTop: 4,
  },
  phoneModalInTrip: {
    fontSize: 12,
    fontWeight: "800",
    color: Theme.negative,
    marginTop: 4,
  },
  tripAssignPartnerBlock: {
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Theme.borderLight,
    gap: 8,
  },
  tripAssignPartnerHint: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textMuted,
    lineHeight: 16,
    marginBottom: 10,
  },
  aggregateSplit: {
    gap: 12,
  },
  currentNodeInnerScroll: {
    width: "100%",
  },
  currentNodeInnerScrollMobile: {
    maxHeight: 440,
  },
  currentNodeInnerScrollCompact: {
    maxHeight: 380,
  },
  currentNodeInnerScrollContent: {
    paddingBottom: 8,
  },
  aggregateMobileStack: {
    gap: 12,
  },
  aggregateSplitWide: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  aggregatePaneCard: {
    flex: 1,
    minWidth: 0,
    backgroundColor: Theme.screenBackground,
    padding: 12,
    gap: 8,
  },
  aggregatePaneWide: {
    minHeight: 190,
  },
  aggregatePaneHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 2,
  },
  aggregatePaneTitle: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  aggregatePartnerCard: {
    minHeight: 64,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  aggregatePartnerCardSelected: {
    backgroundColor: Theme.surfaceLight,
  },
  aggregatePartnerAvatar: {
    width: 34,
    height: 34,
    backgroundColor: Theme.surfaceLight,
    alignItems: "center",
    justifyContent: "center",
  },
  aggregatePartnerAvatarText: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
  },
  aggregatePartnerName: {
    fontSize: 14,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  aggregatePartnerSub: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textMuted,
    marginTop: 1,
  },
  aggregatePartnerList: {
    gap: 8,
  },
  aggregateViewMoreBtn: {
    minHeight: 36,
    backgroundColor: Theme.screenBackground,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  aggregateViewMoreText: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textMuted,
  },
  aggregateGridRow: {
    gap: 12,
  },
  aggregateGridRowWide: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  aggregateGridCol: {
    flex: 1,
    minWidth: 0,
    width: "100%",
  },
  aggregateInlineFieldLabel: {
    textTransform: "none",
    letterSpacing: 0.2,
    fontSize: 11,
    marginBottom: 6,
  },
  aggregatePhoneInputWrap: {
    width: "100%",
    alignSelf: "stretch",
    minHeight: 44,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  aggregatePhonePrefix: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textMuted,
    flexShrink: 0,
  },
  aggregatePhoneInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    paddingVertical: 0,
    ...Platform.select({
      web: {
        outlineStyle: "none",
      } as object,
    }),
  },
  partnerAddBtn: {
    minHeight: 36,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 14,
    backgroundColor: Theme.screenBackground,
  },
  partnerAddBtnText: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  assignSelectionGrid: {
    gap: 12,
    marginBottom: 14,
  },
  assignSelectionGridDesktop: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  assignPickerCard: {
    flex: 1,
    minWidth: 0,
    backgroundColor: Theme.screenBackground,
    padding: 14,
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  assignPickerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  assignPickerTitle: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.textMuted,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  assignPickerBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: Theme.surfaceLight,
  },
  assignPickerBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.primary,
    textTransform: "uppercase",
  },
  assignEntityRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Theme.screenBackground,
    paddingHorizontal: 10,
    paddingVertical: 10,
    minHeight: 56,
    marginBottom: 8,
    gap: 10,
  },
  assignEntityRowActive: {
    backgroundColor: Theme.surfaceLight,
  },
  assignEntityRowDisabled: {
    opacity: 0.6,
  },
  assignEntityIconWrap: {
    width: 34,
    height: 34,
    backgroundColor: Theme.surfaceGray,
    alignItems: "center",
    justifyContent: "center",
  },
  assignEntityTextCol: {
    flex: 1,
    minWidth: 0,
  },
  assignEntityTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  assignEntitySubtitle: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textMuted,
    marginTop: 2,
  },
  assignEmptyText: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textMuted,
    marginTop: 2,
    lineHeight: 18,
  },
  assignEmptyState: {
    marginTop: 2,
    gap: 10,
  },
  assignSummaryBar: {
    backgroundColor: Theme.surfaceLight,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 14,
  },
  assignSummaryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  assignSummaryBlock: {
    flex: 1,
    minWidth: 0,
  },
  assignSummaryDivider: {
    width: 1,
    alignSelf: "stretch",
    backgroundColor: Theme.borderLight,
    marginHorizontal: 12,
  },
  assignSummaryLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  assignSummaryValue: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  assignSummaryWarningText: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: "700",
    color: Theme.warning,
    lineHeight: 18,
  },
  assignInputWrap: {
    marginBottom: 6,
  },
  subcontractPickBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Theme.screenBackground,
    paddingVertical: 12,
    paddingHorizontal: 16,
    minHeight: 44,
    marginBottom: 6,
  },
  subcontractPickLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginRight: 10,
  },
  subcontractPickValue: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },
  subcontractPickerModalRoot: {
    flex: 1,
    width: "100%",
    backgroundColor: Theme.overlayBackdrop,
  },
  subcontractPickerModalBody: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 8,
  },
  subcontractPickerCard: {
    backgroundColor: Theme.screenBackground,
    overflow: "hidden",
    maxHeight: 380,
    alignSelf: "center",
    width: "100%",
    ...Platform.select({
      web: {
        maxWidth: 760,
        boxShadow: "0 10px 24px rgba(15,23,42,0.16)",
      } as object,
    }),
  },
  subcontractPickerTitle: {
    fontSize: 10,
    fontWeight: "900",
    color: Theme.textMutedDemo,
    letterSpacing: 0.9,
    textTransform: "uppercase",
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  subcontractPickerToggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
    backgroundColor: Theme.screenBackground,
  },
  subcontractPickerToggleLabel: {
    flex: 1,
    paddingRight: 12,
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  subcontractPickerScroll: { maxHeight: 248 },
  subcontractPickerScrollContent: { paddingVertical: 6 },
  subcontractPickerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
    minHeight: 44,
  },
  subcontractPickerRowActive: {
    backgroundColor: Theme.surfaceLight,
  },
  subcontractPickerText: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    marginRight: 10,
  },
  subcontractPickerBadge: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.primary,
    paddingHorizontal: 6,
    paddingVertical: 3,
    marginRight: 10,
  },
  subcontractPickerEmpty: {
    padding: 16,
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textMuted,
  },
  subcontractPickerClearBtn: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: Theme.screenBackground,
  },
  subcontractPickerClearText: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.negative,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  assignVehicleInput: {
    backgroundColor: Theme.screenBackground,
    paddingVertical: 12,
    paddingHorizontal: 16,
    fontSize: 13,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    minHeight: 44,
    ...Platform.select({
      web: {
        outlineStyle: "none",
      } as object,
    }),
  },
  wizardCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Theme.surfaceGray,
    padding: 16,
    marginBottom: 12,
  },
  wizardCardActive: {
  },
  wizardCardIcon: {
    marginRight: 12,
  },
  wizardCardTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    marginBottom: 4,
  },
  wizardCardSubtitle: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textMuted,
  },
  otpCard: {
    backgroundColor: Theme.surfaceGray,
    padding: 20,
    marginBottom: 20,
    alignItems: "center",
  },
  otpCode: {
    fontSize: 24,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    letterSpacing: 4,
    marginBottom: 8,
  },
  otpExpiry: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textMuted,
    marginBottom: 16,
  },
  otpActions: {
    flexDirection: "row",
    gap: 12,
  },
  otpBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: Theme.textPrimaryDark,
  },
  otpBtnText: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.buttonDarkText,
    textTransform: "uppercase",
  },
  quoteRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  quoteRowSelected: {
    backgroundColor: Theme.surfaceGray,
    borderLeftWidth: 4,
    borderLeftColor: Theme.teslaRed,
  },
  quoteRowDisabled: { opacity: 0.6 },
  quoteRowName: {
    flex: 1,
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    marginRight: 8,
  },
  quoteRowAmount: {
    fontSize: 12,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    marginRight: 8,
  },
  quoteRowStatus: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
  },
  viewIndentBtn: {
    marginTop: 8,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  viewIndentBtnText: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textSecondary,
    textTransform: "uppercase",
  },
  offerHubSummary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: Theme.surfaceGray,
    marginBottom: 12,
  },
  offerHubSummaryText: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
  },
  offerHubSummaryLowest: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.positive,
  },
  quoteHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  quoteHeaderName: {
    flex: 1,
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    marginRight: 8,
  },
  quoteHeaderAmount: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    marginRight: 8,
  },
  quoteHeaderStatus: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
  },
  quoteHeaderRowDark: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: Theme.textPrimaryDark,
    marginBottom: 8,
  },
  quoteHeaderNameDark: {
    flex: 1,
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textOnDarkMuted,
    textTransform: "uppercase",
    marginRight: 8,
    letterSpacing: 0.6,
    fontStyle: "italic",
  },
  quoteHeaderAmountDark: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textOnDarkMuted,
    textTransform: "uppercase",
    marginRight: 8,
    letterSpacing: 0.6,
    fontStyle: "italic",
  },
  quoteHeaderStatusDark: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textOnDarkMuted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    fontStyle: "italic",
  },
  bidEmptyWrap: { paddingVertical: 32, alignItems: "center" },
  bidEmptyText: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  bidEmptySubtext: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textMuted,
    marginTop: 8,
    textAlign: "center",
  },
  bidModalTitle: { flex: 1 },
  bidModalScroll: {
    flex: 1,
    alignSelf: "stretch",
    minWidth: 0,
    ...Platform.select({
      web: { width: "100%" as const, maxWidth: "100%" as const },
    }),
  },
  bidModalScrollContent: {
    flexGrow: 1,
    paddingBottom: 8,
    ...Platform.select({
      web: { minWidth: 0, maxWidth: "100%" as const },
    }),
  },
  bidIndentDetailSection: {
    marginTop: 8,
    width: "100%",
    alignSelf: "stretch",
    marginBottom: 12,
  },
  bidIndentCard: {
    backgroundColor: Theme.screenBackground,
    paddingTop: 0,
    paddingHorizontal: 14,
    paddingBottom: 14,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  bidIndentCardAccent: {
    height: 3,
    width: "100%",
    backgroundColor: Theme.buttonPrimary,
    marginHorizontal: -14,
    marginBottom: 12,
  },
  bidIndentCardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 14,
  },
  bidIndentCardHeaderLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
  bidIndentCardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 14,
  },
  bidIndentCardTopLeft: {
    flex: 1,
    minWidth: 0,
    paddingRight: 10,
  },
  bidIndentCardTopRight: {
    flexShrink: 0,
    alignItems: "flex-end",
    minWidth: 116,
    maxWidth: "42%",
  },
  bidIndentCardOrg: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.teslaRed,
    letterSpacing: 0.5,
  },
  bidIndentCardRoute: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    marginTop: 4,
    textTransform: "uppercase",
    flexShrink: 1,
    lineHeight: 16,
  },
  bidIndentCardId: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textSecondary,
    marginTop: 6,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  bidIndentDatePill: {
    backgroundColor: LOAD_CONTENT_BG,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 8,
  },
  bidIndentDatePillText: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  bidIndentCardTargetLabel: {
    fontSize: 6,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    marginBottom: 0,
  },
  bidIndentCardTargetValue: {
    fontSize: 12,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
  },
  bidIndentCardDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Theme.surfaceBorder,
    marginBottom: 4,
  },
  bidIndentSpecRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
    paddingVertical: 8,
  },
  bidIndentSpecLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    flexShrink: 0,
    maxWidth: "40%",
  },
  bidIndentSpecValue: {
    flex: 1,
    minWidth: 0,
    flexShrink: 1,
    textAlign: "right",
    fontSize: 13,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    lineHeight: 18,
  },
  bidIndentStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 12,
    gap: 12,
  },
  bidIndentStatusLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  bidIndentStatusPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: Theme.surface,
  },
  bidIndentStatusPillText: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  bidInputBlock: {
    width: "100%",
    alignSelf: "stretch",
    marginTop: 6,
    marginBottom: 24,
  },
  quoteLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 8,
  },
  quoteInput: {
    width: "100%",
    backgroundColor: Theme.surfaceGray,
    paddingVertical: 14,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    fontSize: 14,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    minHeight: 48,
    ...Platform.select({
      web: {
        outlineStyle: "none",
        /** iOS Safari: font-size < 16px on focused inputs triggers page zoom. */
        fontSize: 16,
        lineHeight: 22,
        maxWidth: "100%",
      } as object,
    }),
  },
  previousBidWrap: {
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderRadius: 10,
    backgroundColor: Theme.surfaceGray,
  },
  previousBidLabel: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  previousBidValue: {
    marginTop: 2,
    fontSize: 13,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
  },
  previousBidMeta: {
    marginTop: 2,
    fontSize: 10,
    color: Theme.textSecondary,
  },
  previousBidHistoryWrap: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: Theme.borderLight,
    gap: 6,
  },
  previousBidHistoryTitle: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.7,
  },
  previousBidHistoryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  previousBidHistoryAmount: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  previousBidHistoryDate: {
    fontSize: 10,
    color: Theme.textSecondary,
  },
  quotePlaceholder: {
    fontSize: 36,
    fontWeight: "300",
    color: Theme.textPrimaryDark,
    fontStyle: "italic",
    marginBottom: 24,
  },
  highlightedIndentCard: {
    backgroundColor: Theme.negativeMuted,
    borderColor: Theme.teslaRed,
    shadowColor: Theme.teslaRed,
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 5,
  },
});
