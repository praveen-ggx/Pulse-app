/**
 * Full-page modal listing indent cards for a Load Center kanban column.
 * Network Loads (OPEN) is search-first: pickup / drop / vehicle first, then
 * only matching cards — same pattern as Marketplace Loads. Other stages keep
 * search + chips. Nested Award / Bid + indent detail stay on-page.
 */
import Theme from "@/constants/Theme";
import Layout from "@/constants/Layout";
import { LazySuspenseInlineFallback } from "@/components/LazySuspenseFallback";
import { HUB_GRID_MIN_WIDTH } from "@/components/hub/hubGridCardLayout";
import { getIndentDisplayNumber, type IndentRow } from "@/features/indents";
import type {
  LoadCenterKanbanColumn,
} from "@/features/network/components/LoadCenterKanbanBoard";
import { MarketplaceLaneFilters } from "@/features/network/components/MarketplaceLaneFilters";
import { useScrollPagedItems } from "@/features/network/hooks/useScrollPagedItems";
import {
  filterMarketplaceOptions,
  isMarketplaceSearchReady,
  lanesFromMarketplaceLoads,
  type MarketplaceLoadSearch,
} from "@/features/network/utils/marketplaceSearch.util";
import { MARKETPLACE_LOAD_PAGE_SIZE } from "@/features/network/utils/marketplaceLoadsPage.util";
import { IncompleteLaneNotice } from "@/features/network/components/pooled/IncompleteLaneNotice";
import { NetworkBidPoolCard } from "@/features/network/components/pooled/NetworkBidPoolCard";
import { NetworkLoadPoolCard } from "@/features/network/components/pooled/NetworkLoadPoolCard";
import {
  buildNetworkBidPools,
  type NetworkBidQuote,
} from "@/features/network/utils/networkBidPools.util";
import { useServerNetworkPoolIds } from "@/features/network/hooks/useNetworkPoolLanesQuery";
import {
  buildNetworkLoadPools,
  filterNetworkLoadPools,
  keepServerPools,
  type NetworkLoadPool,
} from "@/features/network/utils/networkLoadPools.util";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import type { ReactNode } from "react";
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import {
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

const IndentDetailScreen = lazy(() =>
  import("@/features/indents/components/IndentDetailScreen").then((m) => ({
    default: m.IndentDetailScreen,
  })),
);

const TABLET_BREAKPOINT = 720;
const DESKTOP_SIDE_PAD = 32;
const MOBILE_SIDE_PAD = Layout.screenPaddingHorizontal;
const GRID_GAP = 14;
const BOARD_MAX_ONE = 720;
const BOARD_MAX_TWO = 980;
const BOARD_MAX_THREE = 1180;
/** Collapsed edge rail width — content inset keeps cards clear of the icon. */
const STAGE_BOOKMARK_RAIL = 40;

type FilterKey = "pickup" | "drop" | "vehicle";

export type LoadCenterKanbanStageNav = {
  id: string;
  label: string;
  count: number;
};

export type LoadCenterKanbanColumnModalProps = {
  visible: boolean;
  column: LoadCenterKanbanColumn | null;
  onClose: () => void;
  renderCard: (load: IndentRow) => ReactNode;
  highlightedIndentId?: string | null;
  /** Indent detail opened from cards while this modal is up (stays on top). */
  detailIndentId?: string | null;
  /** Detail was opened from a Network pool member: hide shipper identity. */
  detailAnonymous?: boolean;
  onCloseDetail?: () => void;
  onEditIndent?: (indent: IndentRow) => void;
  /** Adjacent stages in board order — edge bookmark arrows jump full-page. */
  previousStage?: LoadCenterKanbanStageNav | null;
  nextStage?: LoadCenterKanbanStageNav | null;
  onNavigateStage?: (columnId: string) => void;
  /** Nested overlays (Award / Bid modals) — render inside so they stack above this page. */
  children?: ReactNode;
  /**
   * When set, Network Loads (OPEN) lists lane + shipper pools instead of one
   * card per indent; each pool takes one quote for all its loads.
   */
  onQuotePool?: (pool: NetworkLoadPool<IndentRow>) => void;
  canQuotePools?: boolean;
  /** Indent card inside an opened open-market pool — details only, no per-indent quote. */
  renderPoolMemberCard?: (load: IndentRow) => ReactNode;
  /** Indent card inside an opened My Bids pool. Its action revises that bid. */
  renderBidPoolMemberCard?: (load: IndentRow) => ReactNode;
  /**
   * Every open Network load before search, so a shown pool is always whole.
   * Column loads may be search-filtered, so without this no pool is shown or quotable.
   */
  poolLoads?: IndentRow[];
  /** Viewing org; pools the server does not list for it are not shown. */
  poolOrgId?: string | null;
  /** Pool to open when the column opens (from the board preview). */
  initialOpenPoolId?: string | null;
  /**
   * When set, My Bids (QUOTED) groups pooled Network quotes into one anonymous
   * card per pool; `isBidPoolable` false (sponsored Reach) stays individual.
   */
  bidPoolQuotes?: ReadonlyMap<string, NetworkBidQuote>;
  isBidPoolable?: (load: IndentRow) => boolean;
  /** Every quoted load before search; bid pools are built only from this, never from column loads. */
  bidPoolLoads?: IndentRow[];
};

function maxColumnsForWidth(width: number): 1 | 2 | 3 {
  if (width >= HUB_GRID_MIN_WIDTH) return 3;
  if (width >= TABLET_BREAKPOINT) return 2;
  return 1;
}

/** Cap columns to viewport + card count so sparse stages fill the row (no empty right half). */
function columnsForGrid(width: number, cardCount: number): number {
  const viewportMax = maxColumnsForWidth(width);
  if (cardCount <= 0) return viewportMax;
  return Math.min(viewportMax, Math.max(cardCount, 1));
}

function gridTemplateColumns(columns: number): string {
  if (columns <= 1) return "minmax(0, 1fr)";
  return `repeat(${columns}, minmax(0, 1fr))`;
}

function norm(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function fieldEquals(value: string | null | undefined, selected: string): boolean {
  if (!selected) return true;
  return norm(value) === norm(selected);
}

function loadMatchesSearch(load: IndentRow, q: string): boolean {
  const trimmed = q.trim().toLowerCase();
  if (!trimmed) return true;
  const route = `${norm(load.pickup_area)} ${norm(load.drop_location)}`.trim();
  const indentId = (getIndentDisplayNumber(load) || "").toLowerCase();
  const client = norm(load.client_name);
  const creator = norm(
    (load as { creator_organization_name?: string | null }).creator_organization_name,
  );
  const vehicle = norm(load.vehicle_type);
  return (
    route.includes(trimmed) ||
    indentId.includes(trimmed) ||
    client.includes(trimmed) ||
    creator.includes(trimmed) ||
    vehicle.includes(trimmed)
  );
}

function shortLabel(value: string, max = 18): string {
  const t = value.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function StageBookmarkArrow({
  side,
  stage,
  onPress,
}: {
  side: "left" | "right";
  stage: LoadCenterKanbanStageNav;
  onPress: () => void;
}) {
  const isLeft = side === "left";
  const [hovered, setHovered] = useState(false);
  const [peeked, setPeeked] = useState(false);
  const revealed = hovered || peeked;
  const iconColor = revealed ? Theme.textSecondary : Theme.textMuted;

  useEffect(() => {
    setPeeked(false);
    setHovered(false);
  }, [stage.id]);

  const handlePress = () => {
    if (!revealed) {
      setPeeked(true);
      return;
    }
    setPeeked(false);
    onPress();
  };

  return (
    <Pressable
      onPress={handlePress}
      
      // @ts-expect-error Web-only mouse events not in React Native types
      onMouseEnter={(_e: any) => setHovered(true)}
      onMouseLeave={(_e: any) => {
        setHovered(false);
        setPeeked(false);
      }}
      style={({ pressed }) => [
        styles.stageBookmark,
        isLeft ? styles.stageBookmarkLeft : styles.stageBookmarkRight,
        revealed ? styles.stageBookmarkExpanded : styles.stageBookmarkCollapsed,
        pressed && styles.stageBookmarkPressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${isLeft ? "Previous" : "Next"} stage: ${stage.label}, ${stage.count} loads`}
      accessibilityHint={
        revealed
          ? "Activates to open this stage"
          : "Shows stage name, then tap again to open"
      }
      hitSlop={6}
    >
      {isLeft ? (
        <View
          style={[
            styles.stageBookmarkIconCol,
            revealed && styles.stageBookmarkIconColRevealed,
          ]}
        >
          <FontAwesome name="chevron-left" size={12} color={iconColor} />
          {!revealed ? (
            <Text style={styles.stageBookmarkCountPeek}>{stage.count}</Text>
          ) : null}
        </View>
      ) : null}
      {revealed ? (
        <Text style={styles.stageBookmarkLabel} numberOfLines={1}>
          {stage.label}
          <Text style={styles.stageBookmarkCount}>{` · ${stage.count}`}</Text>
        </Text>
      ) : null}
      {!isLeft ? (
        <View
          style={[
            styles.stageBookmarkIconCol,
            revealed && styles.stageBookmarkIconColRevealed,
          ]}
        >
          <FontAwesome name="chevron-right" size={12} color={iconColor} />
          {!revealed ? (
            <Text style={styles.stageBookmarkCountPeek}>{stage.count}</Text>
          ) : null}
        </View>
      ) : null}
    </Pressable>
  );
}

export function LoadCenterKanbanColumnModal({
  visible,
  column,
  onClose,
  renderCard,
  highlightedIndentId = null,
  detailIndentId = null,
  detailAnonymous = false,
  onCloseDetail,
  onEditIndent,
  previousStage = null,
  nextStage = null,
  onNavigateStage,
  children,
  onQuotePool,
  canQuotePools = false,
  renderPoolMemberCard,
  renderBidPoolMemberCard,
  poolLoads,
  poolOrgId = null,
  initialOpenPoolId = null,
  bidPoolQuotes,
  isBidPoolable,
  bidPoolLoads,
}: LoadCenterKanbanColumnModalProps) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isDesktop = width >= TABLET_BREAKPOINT;
  const sidePad = isDesktop ? DESKTOP_SIDE_PAD : MOBILE_SIDE_PAD;
  const showDetail = Boolean(detailIndentId);

  const [searchQuery, setSearchQuery] = useState("");
  const [pickupFilter, setPickupFilter] = useState("");
  const [dropFilter, setDropFilter] = useState("");
  const [vehicleFilter, setVehicleFilter] = useState("");
  const [openMenu, setOpenMenu] = useState<FilterKey | null>(null);
  const [menuQuery, setMenuQuery] = useState("");
  const [appliedSearch, setAppliedSearch] = useState<MarketplaceLoadSearch | null>(
    null,
  );
  const searchFirst = column?.id === "OPEN";
  const searchReady = isMarketplaceSearchReady(appliedSearch);
  const pooledMode =
    searchFirst && onQuotePool != null && renderPoolMemberCard != null;
  const awaitingSearch = searchFirst && !searchReady && !pooledMode;
  const bidPooledMode =
    column?.id === "QUOTED" &&
    bidPoolQuotes != null &&
    bidPoolLoads != null &&
    renderPoolMemberCard != null;
  const [openPoolId, setOpenPoolId] = useState<string | null>(null);

  const tabs = column?.tabs ?? [];
  const hasTabs = tabs.length > 0;
  const [activeTabId, setActiveTabId] = useState(
    column?.defaultTabId ?? tabs[0]?.id ?? "",
  );

  useEffect(() => {
    if (!column) return;
    setActiveTabId(column.defaultTabId ?? column.tabs?.[0]?.id ?? "");
    setSearchQuery("");
    setPickupFilter("");
    setDropFilter("");
    setVehicleFilter("");
    setOpenMenu(null);
    setMenuQuery("");
    setAppliedSearch(null);
    setOpenPoolId(initialOpenPoolId);
  }, [column, initialOpenPoolId]);

  const allColumnLoads = column?.loads ?? [];

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? tabs[0] ?? null;
  const activeTabLoads = activeTab?.loads;
  const columnLoads = column?.loads;
  const stageLoads = useMemo(
    () => (hasTabs ? (activeTabLoads ?? []) : (columnLoads ?? [])),
    [hasTabs, activeTabLoads, columnLoads],
  );
  const laneDraft = useMemo(
    () => ({
      pickup: pickupFilter,
      drop: dropFilter,
      vehicleType: vehicleFilter,
    }),
    [pickupFilter, dropFilter, vehicleFilter],
  );
  const columnLanes = useMemo(
    () => lanesFromMarketplaceLoads(allColumnLoads),
    [allColumnLoads],
  );
  const cascadeOptions = useMemo(
    () =>
      filterMarketplaceOptions(
        columnLanes,
        laneDraft,
        openMenu ?? "pickup",
        menuQuery,
      ),
    [columnLanes, laneDraft, openMenu, menuQuery],
  );

  const serverPoolIds = useServerNetworkPoolIds(pooledMode ? poolOrgId : null);
  const networkPools = useMemo(() => {
    if (!pooledMode) {
      return { pools: [] as NetworkLoadPool<IndentRow>[], unpooled: [] as IndentRow[] };
    }
    if (!poolLoads) {
      return { pools: [] as NetworkLoadPool<IndentRow>[], unpooled: [] as IndentRow[] };
    }
    const shownIds = new Set(stageLoads.map((l) => l.id));
    const all = buildNetworkLoadPools(poolLoads);
    return {
      pools: keepServerPools(all.pools, serverPoolIds).filter((p) =>
        p.members.some((m) => shownIds.has(m.id)),
      ),
      unpooled: all.unpooled.filter((l) => shownIds.has(l.id)),
    };
  }, [pooledMode, stageLoads, poolLoads, serverPoolIds]);
  const shownPools = useMemo(
    () => filterNetworkLoadPools(networkPools.pools, appliedSearch),
    [networkPools, appliedSearch],
  );
  const openPool = openPoolId
    ? (networkPools.pools.find((p) => p.id === openPoolId) ?? null)
    : null;

  const stageLoadPasses = useCallback(
    (load: IndentRow) =>
      loadMatchesSearch(load, searchQuery) &&
      fieldEquals(load.pickup_area, pickupFilter) &&
      fieldEquals(load.drop_location, dropFilter) &&
      fieldEquals(load.vehicle_type, vehicleFilter),
    [searchQuery, pickupFilter, dropFilter, vehicleFilter],
  );
  const stageLoadIds = useMemo(() => new Set(stageLoads.map((l) => l.id)), [stageLoads]);
  const shownInStage = useCallback(
    (load: IndentRow) => stageLoadIds.has(load.id) && stageLoadPasses(load),
    [stageLoadIds, stageLoadPasses],
  );
  const bidPools = useMemo(
    () =>
      bidPooledMode && bidPoolQuotes && bidPoolLoads
        ? buildNetworkBidPools(bidPoolLoads, bidPoolQuotes, isBidPoolable)
        : null,
    [bidPooledMode, bidPoolLoads, bidPoolQuotes, isBidPoolable],
  );
  const shownBidPools = useMemo(
    () =>
      bidPools ? bidPools.pools.filter((p) => p.members.some(shownInStage)) : [],
    [bidPools, shownInStage],
  );
  const openBidPool =
    openPoolId && bidPools
      ? (bidPools.pools.find((p) => p.id === openPoolId) ?? null)
      : null;

  const filteredLoads = useMemo(() => {
    if (bidPools) {
      if (openBidPool) return openBidPool.members;
      return bidPools.individual.filter(shownInStage);
    }
    if (pooledMode) {
      if (openPool) return openPool.members;
      return networkPools.unpooled.filter(
        (load) =>
          fieldEquals(load.pickup_area, appliedSearch?.pickup ?? "") &&
          fieldEquals(load.drop_location, appliedSearch?.drop ?? "") &&
          fieldEquals(load.vehicle_type, appliedSearch?.vehicleType ?? ""),
      );
    }
    if (searchFirst && !searchReady) return [];
    const pickup = searchFirst ? (appliedSearch?.pickup ?? "") : pickupFilter;
    const drop = searchFirst ? (appliedSearch?.drop ?? "") : dropFilter;
    const vehicle = searchFirst
      ? (appliedSearch?.vehicleType ?? "")
      : vehicleFilter;
    return stageLoads.filter(
      (load) =>
        loadMatchesSearch(load, searchFirst ? "" : searchQuery) &&
        fieldEquals(load.pickup_area, pickup) &&
        fieldEquals(load.drop_location, drop) &&
        fieldEquals(load.vehicle_type, vehicle),
    );
  }, [
    bidPools,
    openBidPool,
    shownInStage,
    pooledMode,
    openPool,
    networkPools,
    searchFirst,
    searchReady,
    appliedSearch,
    stageLoads,
    searchQuery,
    pickupFilter,
    dropFilter,
    vehicleFilter,
  ]);

  const {
    visibleItems: visibleLoads,
    hasMore: hasMoreVisibleLoads,
    remaining: remainingVisibleLoads,
    onScroll: onPagedScroll,
  } = useScrollPagedItems(
    filteredLoads,
    MARKETPLACE_LOAD_PAGE_SIZE,
    `${column?.id ?? ""}:${activeTabId}:${searchQuery}:${pickupFilter}:${dropFilter}:${vehicleFilter}:${appliedSearch ? "s" : ""}:${openPoolId ?? ""}`,
  );

  const showPoolList = pooledMode && !openPool;
  const showBidPoolList = bidPools != null && !openBidPool;
  const columns = columnsForGrid(
    width,
    showPoolList
      ? shownPools.length
      : showBidPoolList
        ? shownBidPools.length + visibleLoads.length
        : visibleLoads.length,
  );

  const cellStyle = useMemo(() => {
    if (Platform.OS === "web") {
      return styles.cardCellGrid;
    }
    if (columns === 1) {
      return styles.cardCellOne;
    }
    const pct = `${100 / columns}%` as `${number}%`;
    return {
      width: pct,
      maxWidth: pct,
      flexBasis: pct,
      paddingHorizontal: GRID_GAP / 2,
      marginBottom: GRID_GAP,
      alignSelf: "stretch" as const,
      minWidth: 0,
    };
  }, [columns]);

  const boardMaxWidth =
    columns <= 1 ? BOARD_MAX_ONE : columns === 2 ? BOARD_MAX_TWO : BOARD_MAX_THREE;

  const webGridStyle = useMemo(() => {
    if (Platform.OS !== "web") return null;
    return {
      display: "grid" as const,
      gridTemplateColumns: gridTemplateColumns(columns),
      gap: GRID_GAP,
      width: "100%",
      maxWidth: boardMaxWidth,
      alignSelf: "center" as const,
      alignItems: "stretch" as const,
    };
  }, [columns, boardMaxWidth]);

  const hasActiveFilters = pooledMode
    ? Boolean(appliedSearch?.pickup || appliedSearch?.drop || appliedSearch?.vehicleType)
    : searchFirst
    ? searchReady
    : searchQuery.trim().length > 0 ||
      pickupFilter.length > 0 ||
      dropFilter.length > 0 ||
      vehicleFilter.length > 0;

  const clearFilters = useCallback(() => {
    setSearchQuery("");
    setPickupFilter("");
    setDropFilter("");
    setVehicleFilter("");
    setOpenMenu(null);
    setMenuQuery("");
    setAppliedSearch(null);
    setOpenPoolId(null);
  }, []);

  const changeLaneSearch = useCallback((next: MarketplaceLoadSearch) => {
    setAppliedSearch(next);
    setOpenPoolId(null);
  }, []);

  const badgeCount = allColumnLoads.length;
  const shownCount = showPoolList
    ? shownPools.reduce((n, p) => n + p.members.length, 0) + filteredLoads.length
    : showBidPoolList
      ? shownBidPools.reduce((n, p) => n + p.members.length, 0) + filteredLoads.length
      : filteredLoads.length;
  const poolSummary = `${shownPools.length} pool${shownPools.length === 1 ? "" : "s"} · ${shownCount} load${shownCount === 1 ? "" : "s"}`;
  const bidPoolSummary = `${shownBidPools.length} pool${shownBidPools.length === 1 ? "" : "s"} · ${shownCount} load${shownCount === 1 ? "" : "s"}`;

  if (!column) return null;

  const menuOptions = openMenu ? cascadeOptions : [];

  const menuValue =
    openMenu === "pickup"
      ? pickupFilter
      : openMenu === "drop"
        ? dropFilter
        : openMenu === "vehicle"
          ? vehicleFilter
          : "";

  const setMenuValue = (value: string) => {
    if (openMenu === "pickup") {
      setPickupFilter(value);
      setDropFilter("");
      setVehicleFilter("");
      setMenuQuery("");
      setOpenMenu(value ? "drop" : null);
      return;
    }
    if (openMenu === "drop") {
      setDropFilter(value);
      setVehicleFilter("");
      setMenuQuery("");
      setOpenMenu(value ? "vehicle" : null);
      return;
    }
    if (openMenu === "vehicle") setVehicleFilter(value);
    setMenuQuery("");
    setOpenMenu(null);
  };

  const menuTitle =
    openMenu === "pickup"
      ? "Pickup location"
      : openMenu === "drop"
        ? "Drop location"
        : openMenu === "vehicle"
          ? "Vehicle type"
          : "";

  const renderFilterChip = (
    key: FilterKey,
    label: string,
    value: string,
    icon: "map-marker" | "flag" | "truck",
    disabled = false,
  ) => {
    const active = value.length > 0 || openMenu === key;
    return (
      <Pressable
        key={key}
        disabled={disabled}
        onPress={() => {
          setMenuQuery("");
          setOpenMenu((cur) => (cur === key ? null : key));
        }}
        style={({ pressed }) => [
          styles.filterChip,
          active && styles.filterChipActive,
          disabled && styles.filterChipDisabled,
          pressed && !disabled && styles.filterChipPressed,
        ]}
        accessibilityRole="button"
        accessibilityState={{ expanded: openMenu === key, disabled }}
        accessibilityLabel={`${label}${value ? `: ${value}` : ""}`}
      >
        <FontAwesome
          name={icon}
          size={11}
          color={active ? Theme.textPrimaryDark : Theme.textMuted}
        />
        <Text
          style={[styles.filterChipText, active && styles.filterChipTextActive]}
          numberOfLines={1}
        >
          {value ? shortLabel(value, isDesktop ? 20 : 14) : label}
        </Text>
        <FontAwesome
          name={openMenu === key ? "chevron-up" : "chevron-down"}
          size={9}
          color={active ? Theme.textPrimaryDark : Theme.textMuted}
        />
      </Pressable>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View
        style={[
          styles.root,
          {
            paddingTop: Math.max(insets.top, 12),
            paddingBottom: Math.max(insets.bottom, 12),
          },
        ]}
      >
        <View style={[styles.headerBand, { paddingHorizontal: sidePad }]}>
          <View
            style={[styles.headerInner, !isDesktop && styles.headerInnerMobile]}
          >
            <View style={styles.headerTopRow}>
              <View style={styles.headerLeft}>
                <View
                  style={[styles.accent, { backgroundColor: column.accent }]}
                />
                <View style={styles.headerText}>
                  <Text style={styles.eyebrow} numberOfLines={1}>
                    {searchFirst ? "GET LOAD" : "LOAD STAGE"}
                  </Text>
                  <Text
                    style={[
                      styles.title,
                      isDesktop && styles.titleDesktop,
                      !isDesktop && styles.titleMobile,
                    ]}
                    numberOfLines={isDesktop ? 1 : 2}
                  >
                    {column.label}
                  </Text>
                </View>
              </View>
              <View style={styles.headerRight}>
                {awaitingSearch ? null : (
                  <View
                    style={[
                      styles.countBadge,
                      !isDesktop && styles.countBadgeMobile,
                    ]}
                  >
                    <Text style={styles.countText}>
                      {hasActiveFilters ? shownCount : badgeCount}
                    </Text>
                  </View>
                )}
                <Pressable
                  onPress={onClose}
                  style={({ pressed }) => [
                    styles.headerAction,
                    !isDesktop && styles.headerActionMobile,
                    pressed && styles.closeBtnPressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Close"
                  hitSlop={8}
                >
                  <FontAwesome
                    name="times"
                    size={16}
                    color={Theme.textPrimaryDark}
                  />
                </Pressable>
              </View>
            </View>
            <Text
              style={[styles.subtitle, !isDesktop && styles.subtitleMobile]}
              numberOfLines={isDesktop ? 1 : 2}
            >
              {awaitingSearch
                ? "Choose pickup, drop, and vehicle to see matching loads"
                : openPool
                  ? `${openPool.members.length} load${openPool.members.length === 1 ? "" : "s"} in this pool · one quote`
                  : openBidPool
                    ? `${openBidPool.members.length} load${openBidPool.members.length === 1 ? "" : "s"} in this pool · your pooled bid`
                  : showBidPoolList && shownBidPools.length > 0
                    ? bidPoolSummary
                  : showPoolList
                    ? `${poolSummary} · one quote per pool`
                    : hasActiveFilters
                  ? `${shownCount} matching load${shownCount === 1 ? "" : "s"}`
                  : `${badgeCount} load${badgeCount === 1 ? "" : "s"} in this stage`}
            </Text>
          </View>
        </View>

        {hasTabs ? (
          <View style={[styles.subTabBand, { paddingHorizontal: sidePad }]}>
            <View style={styles.subTabRow}>
              {tabs.map((tab) => {
                const on = tab.id === (activeTab?.id ?? "");
                return (
                  <Pressable
                    key={tab.id}
                    onPress={() => setActiveTabId(tab.id)}
                    style={[styles.subTab, on && styles.subTabOn]}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: on }}
                  >
                    <Text
                      style={[styles.subTabText, on && styles.subTabTextOn]}
                      numberOfLines={1}
                    >
                      {tab.label}
                    </Text>
                    <View
                      style={[styles.subTabCount, on && styles.subTabCountOn]}
                    >
                      <Text
                        style={[
                          styles.subTabCountText,
                          on && styles.subTabCountTextOn,
                        ]}
                      >
                        {tab.loads.length}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}

        {searchFirst ? (
          <View style={[styles.toolbarBand, { paddingHorizontal: sidePad }]}>
            <View style={[styles.lanePanel, !isDesktop && styles.lanePanelMobile]}>
              <View style={styles.lanePanelHead}>
                <Text style={styles.lanePanelHint}>
                  Pickup · Drop · Vehicle
                </Text>
                <Text style={styles.lanePanelMeta} numberOfLines={1}>
                  {pooledMode
                    ? poolSummary
                    : searchReady
                      ? `${shownCount} match${shownCount === 1 ? "" : "es"}`
                      : "Choose a lane"}
                </Text>
              </View>
              <MarketplaceLaneFilters
                lanes={columnLanes}
                value={appliedSearch}
                onChange={changeLaneSearch}
                autoOpenFirst={!pooledMode}
                stacked={!isDesktop}
              />
            </View>
          </View>
        ) : (
        <View style={[styles.toolbarBand, { paddingHorizontal: sidePad }]}>
          <View style={[styles.toolbar, !isDesktop && styles.toolbarMobile]}>
            <View style={[styles.searchWrap, !isDesktop && styles.searchWrapMobile]}>
              <FontAwesome
                name="search"
                size={13}
                color={Theme.textMuted}
                style={styles.searchIcon}
              />
              <TextInput
                style={styles.searchInput}
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search loads, route, ID…"
                placeholderTextColor={Theme.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                clearButtonMode="while-editing"
                returnKeyType="search"
                accessibilityLabel="Search loads"
              />
              {searchQuery.length > 0 ? (
                <Pressable
                  onPress={() => setSearchQuery("")}
                  hitSlop={8}
                  accessibilityLabel="Clear search"
                >
                  <FontAwesome name="times-circle" size={14} color={Theme.textMuted} />
                </Pressable>
              ) : null}
            </View>

            <View style={[styles.filterRow, !isDesktop && styles.filterRowMobile]}>
              {renderFilterChip("pickup", "Pickup", pickupFilter, "map-marker")}
              {renderFilterChip(
                "drop",
                "Drop",
                dropFilter,
                "flag",
                !pickupFilter,
              )}
              {renderFilterChip(
                "vehicle",
                "Vehicle",
                vehicleFilter,
                "truck",
                !pickupFilter || !dropFilter,
              )}
              {hasActiveFilters ? (
                <Pressable
                  onPress={clearFilters}
                  style={({ pressed }) => [
                    styles.clearChip,
                    pressed && styles.filterChipPressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Clear filters"
                >
                  <FontAwesome name="undo" size={10} color={Theme.textSecondary} />
                  <Text style={styles.clearChipText}>Clear</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        </View>
        )}

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            {
              paddingLeft:
                sidePad +
                (isDesktop && !showDetail && previousStage
                  ? STAGE_BOOKMARK_RAIL
                  : 0),
              paddingRight:
                sidePad +
                (isDesktop && !showDetail && nextStage
                  ? STAGE_BOOKMARK_RAIL
                  : 0),
              paddingTop: isDesktop ? 16 : 14,
              paddingBottom: isDesktop ? 32 : 28,
            },
          ]}
          showsVerticalScrollIndicator
          keyboardShouldPersistTaps="handled"
          onScroll={onPagedScroll}
          scrollEventThrottle={16}
        >
          {openPool ? (
            <View
              style={[
                styles.poolDetail,
                Platform.OS === "web"
                  ? ({ maxWidth: boardMaxWidth, alignSelf: "center", width: "100%" } as object)
                  : null,
              ]}
            >
              <Pressable
                onPress={() => setOpenPoolId(null)}
                style={styles.poolBack}
                accessibilityRole="button"
                accessibilityLabel="Back to all pools"
                hitSlop={8}
              >
                <FontAwesome name="chevron-left" size={11} color={Theme.primary} />
                <Text style={styles.poolBackText}>All pools</Text>
              </Pressable>
              <NetworkLoadPoolCard
                pool={openPool}
                canQuote={canQuotePools}
                showIndentsAction={false}
                onQuote={() => onQuotePool?.(openPool)}
              />
              <Text style={styles.poolSectionTitle}>
                Indents in this pool
              </Text>
            </View>
          ) : null}
          {openBidPool ? (
            <View
              style={[
                styles.poolDetail,
                Platform.OS === "web"
                  ? ({ maxWidth: boardMaxWidth, alignSelf: "center", width: "100%" } as object)
                  : null,
              ]}
            >
              <Pressable
                onPress={() => setOpenPoolId(null)}
                style={styles.poolBack}
                accessibilityRole="button"
                accessibilityLabel="Back to my bids"
                hitSlop={8}
              >
                <FontAwesome name="chevron-left" size={11} color={Theme.primary} />
                <Text style={styles.poolBackText}>My bids</Text>
              </Pressable>
              <NetworkBidPoolCard pool={openBidPool} showViewAction={false} />
              <Text style={styles.poolSectionTitle}>
                Indents in this pool
              </Text>
            </View>
          ) : null}
          {showBidPoolList && shownBidPools.length > 0 ? (
            <View
              style={[
                styles.grid,
                columns === 1 && styles.gridStack,
                Platform.OS !== "web" && { maxWidth: boardMaxWidth, alignSelf: "center" },
                webGridStyle as object,
                filteredLoads.length > 0 && styles.bidPoolGridGap,
              ]}
            >
              {shownBidPools.map((pool) => (
                <View key={pool.id} style={cellStyle}>
                  <NetworkBidPoolCard
                    pool={pool}
                    onViewPool={() => setOpenPoolId(pool.id)}
                  />
                </View>
              ))}
            </View>
          ) : null}
          {showPoolList ? (
            shownPools.length === 0 && filteredLoads.length === 0 ? (
              <View style={styles.empty}>
                <View style={styles.emptyIcon}>
                  <FontAwesome name="inbox" size={18} color={Theme.primary} />
                </View>
                <Text style={styles.emptyTitle}>
                  {hasActiveFilters ? "No pools on this lane" : "No open Network loads"}
                </Text>
                <Text style={styles.emptyText}>
                  {hasActiveFilters
                    ? "Try another city pair or vehicle type."
                    : "Partner loads will appear here, grouped by shipper and lane."}
                </Text>
                {hasActiveFilters ? (
                  <Pressable onPress={clearFilters} style={styles.emptyClearBtn}>
                    <Text style={styles.emptyClearText}>Change search</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : (
              <View
                style={[
                  styles.grid,
                  columns === 1 && styles.gridStack,
                  Platform.OS !== "web" && { maxWidth: boardMaxWidth, alignSelf: "center" },
                  webGridStyle as object,
                ]}
              >
                {shownPools.map((pool) => (
                  <View key={pool.id} style={cellStyle}>
                    <NetworkLoadPoolCard
                      pool={pool}
                      canQuote={canQuotePools}
                      onQuote={() => onQuotePool?.(pool)}
                      onViewIndents={() => setOpenPoolId(pool.id)}
                    />
                  </View>
                ))}
              </View>
            )
          ) : null}
          {showPoolList && filteredLoads.length > 0 ? <IncompleteLaneNotice /> : null}
          {(showPoolList || (showBidPoolList && shownBidPools.length > 0)) &&
          filteredLoads.length === 0 ? null : filteredLoads.length === 0 ? (
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <FontAwesome
                  name={
                    searchFirst && !searchReady
                      ? "search"
                      : hasActiveFilters
                        ? "filter"
                        : "inbox"
                  }
                  size={18}
                  color={Theme.primary}
                />
              </View>
              <Text style={styles.emptyTitle}>
                {searchFirst && !searchReady
                  ? "Search a live lane"
                  : hasActiveFilters
                    ? "No loads on this lane"
                    : "Nothing in this stage"}
              </Text>
              <Text style={styles.emptyText}>
                {searchFirst && !searchReady
                  ? "Pick pickup, then drop, then vehicle. Only matching Network loads will appear."
                  : hasActiveFilters
                    ? "Try another city pair or vehicle type."
                    : "Loads will appear here when they enter this stage."}
              </Text>
              {hasActiveFilters ? (
                <Pressable onPress={clearFilters} style={styles.emptyClearBtn}>
                  <Text style={styles.emptyClearText}>
                    {searchFirst ? "Change search" : "Clear filters"}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ) : (
            <View
              style={[
                styles.grid,
                columns === 1 && styles.gridStack,
                Platform.OS !== "web" && { maxWidth: boardMaxWidth, alignSelf: "center" },
                webGridStyle as object,
              ]}
            >
              {visibleLoads.map((load) => {
                const memberRenderer = openBidPool
                  ? (renderBidPoolMemberCard ?? renderPoolMemberCard)
                  : pooledMode
                    ? renderPoolMemberCard
                    : null;
                return (
                <View
                  key={load.id}
                  style={[
                    cellStyle,
                    highlightedIndentId === load.id && styles.cardHighlighted,
                  ]}
                >
                  <View style={styles.cardFill}>
                    {memberRenderer ? memberRenderer(load) : renderCard(load)}
                  </View>
                </View>
                );
              })}
            </View>
          )}
          {hasMoreVisibleLoads ? (
            <Text style={styles.loadMoreBtnText}>
              Scroll for more · {remainingVisibleLoads} of {filteredLoads.length}{" "}
              remaining
            </Text>
          ) : null}
        </ScrollView>

        {/* Bookmark-style stage jumpers — hide on first/last and while detail is open */}
        {isDesktop && !showDetail && previousStage && onNavigateStage ? (
          <StageBookmarkArrow
            side="left"
            stage={previousStage}
            onPress={() => onNavigateStage(previousStage.id)}
          />
        ) : null}
        {isDesktop && !showDetail && nextStage && onNavigateStage ? (
          <StageBookmarkArrow
            side="right"
            stage={nextStage}
            onPress={() => onNavigateStage(nextStage.id)}
          />
        ) : null}

        {/* Nested Award / Bid modals — mount inside so they stack above this page */}
        {children}

        {/* Indent detail overlay — stays on this page */}
        {showDetail && detailIndentId ? (
          <View
            style={[styles.detailOverlay, { paddingTop: insets.top }]}
            pointerEvents="auto"
          >
            <Suspense
              fallback={
                <LazySuspenseInlineFallback message="Loading indent…" />
              }
            >
              <IndentDetailScreen
                indentId={detailIndentId}
                anonymous={detailAnonymous}
                onBack={() => onCloseDetail?.()}
                onEditPress={onEditIndent}
              />
            </Suspense>
          </View>
        ) : null}

        {/* Filter option picker */}
        <Modal
          visible={openMenu != null}
          transparent
          animationType="fade"
          onRequestClose={() => setOpenMenu(null)}
        >
          <Pressable
            style={styles.menuBackdrop}
            onPress={() => setOpenMenu(null)}
          >
            <Pressable
              style={[
                styles.menuSheet,
                {
                  marginTop: Math.max(insets.top, 48),
                  marginBottom: Math.max(insets.bottom, 24),
                },
              ]}
              onPress={(e) => {
                if ("stopPropagation" in e && typeof e.stopPropagation === "function") {
                  e.stopPropagation();
                }
              }}
            >
              <View style={styles.menuHeader}>
                <Text style={styles.menuTitle}>{menuTitle}</Text>
                <Pressable
                  onPress={() => {
                    setMenuQuery("");
                    setOpenMenu(null);
                  }}
                  style={styles.menuClose}
                  hitSlop={8}
                >
                  <FontAwesome name="times" size={14} color={Theme.textMuted} />
                </Pressable>
              </View>
              <View style={styles.menuSearch}>
                <FontAwesome name="search" size={12} color={Theme.textMuted} />
                <TextInput
                  style={styles.menuSearchInput}
                  value={menuQuery}
                  onChangeText={setMenuQuery}
                  placeholder={
                    openMenu === "pickup"
                      ? "Search pickup"
                      : openMenu === "drop"
                        ? "Search drop"
                        : "Search vehicle"
                  }
                  placeholderTextColor={Theme.textMuted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  accessibilityLabel="Search filter options"
                />
              </View>
              <ScrollView
                style={styles.menuList}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator
              >
                <Pressable
                  onPress={() => setMenuValue("")}
                  style={[
                    styles.menuOption,
                    !menuValue && styles.menuOptionActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.menuOptionText,
                      !menuValue && styles.menuOptionTextActive,
                    ]}
                  >
                    All
                  </Text>
                  {!menuValue ? (
                    <FontAwesome
                      name="check"
                      size={12}
                      color={Theme.textPrimaryDark}
                    />
                  ) : null}
                </Pressable>
                {menuOptions.length === 0 ? (
                  <Text style={styles.menuEmpty}>No matching live loads</Text>
                ) : (
                  menuOptions.map((opt) => {
                    const on = norm(opt.label) === norm(menuValue);
                    return (
                      <Pressable
                        key={opt.label}
                        onPress={() => setMenuValue(opt.label)}
                        style={[styles.menuOption, on && styles.menuOptionActive]}
                      >
                        <Text
                          style={[
                            styles.menuOptionText,
                            on && styles.menuOptionTextActive,
                          ]}
                          numberOfLines={2}
                        >
                          {opt.label}
                        </Text>
                        <View style={styles.menuOptionMeta}>
                          <Text style={styles.menuOptionCount}>
                            {opt.count} {opt.count === 1 ? "load" : "loads"}
                          </Text>
                          {on ? (
                            <FontAwesome
                              name="check"
                              size={12}
                              color={Theme.textPrimaryDark}
                            />
                          ) : null}
                        </View>
                      </Pressable>
                    );
                  })
                )}
              </ScrollView>
            </Pressable>
          </Pressable>
        </Modal>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Theme.analyticsCanvas,
    width: "100%",
    position: "relative",
    overflow: "hidden",
  },
  headerBand: {
    backgroundColor: Theme.cardWhite,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.surfaceBorder,
    paddingBottom: 16,
    width: "100%",
    ...Platform.select({
      web: {
        boxShadow: "0 1px 0 rgba(15,23,42,0.04)",
      } as object,
      default: {},
    }),
  },
  headerInner: {
    width: "100%",
    gap: 8,
  },
  headerInnerMobile: {
    gap: 10,
  },
  headerTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    width: "100%",
  },
  headerLeft: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  accent: {
    width: 4,
    height: 44,
    borderRadius: 999,
    flexShrink: 0,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.1,
    color: Theme.textMuted,
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.5,
  },
  titleDesktop: {
    fontSize: 26,
    letterSpacing: -0.6,
  },
  titleMobile: {
    fontSize: 20,
    lineHeight: 24,
    letterSpacing: -0.4,
  },
  subtitle: {
    fontSize: 13,
    fontWeight: "500",
    color: Theme.textSecondary,
  },
  subtitleMobile: {
    paddingLeft: 16,
    lineHeight: 18,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 0,
  },
  headerAction: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
    alignItems: "center",
    justifyContent: "center",
  },
  headerActionMobile: {
    width: 44,
    height: 44,
  },
  countBadge: {
    minWidth: 40,
    height: 40,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    alignItems: "center",
    justifyContent: "center",
  },
  countBadgeMobile: {
    minWidth: 44,
    height: 44,
  },
  countText: {
    fontSize: 13,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    fontVariant: ["tabular-nums"],
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Theme.surfaceGray,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    alignItems: "center",
    justifyContent: "center",
  },
  closeBtnPressed: {
    opacity: 0.85,
  },
  stageBookmark: {
    position: "absolute",
    top: "48%",
    zIndex: 50,
    elevation: 50,
    flexDirection: "row",
    alignItems: "center",
    overflow: "hidden",
    backgroundColor: Theme.tripHubUnassignedPillBg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
    ...Platform.select({
      web: {
        backgroundColor: "rgba(255,255,255,0.52)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        boxShadow: "0 1px 0 rgba(255,255,255,0.5) inset",
        transform: [{ translateY: -28 }],
        transitionProperty: "max-width, padding, gap, opacity",
        transitionDuration: "160ms",
        transitionTimingFunction: "ease-out",
      } as object,
      default: {
        shadowColor: Theme.shadow,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 5,
        transform: [{ translateY: -28 }],
      },
    }),
  },
  stageBookmarkCollapsed: {
    width: STAGE_BOOKMARK_RAIL,
    minHeight: 56,
    paddingVertical: 10,
    paddingHorizontal: 0,
    justifyContent: "center",
    gap: 0,
  },
  stageBookmarkExpanded: {
    maxWidth: 196,
    minHeight: 44,
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 7,
  },
  stageBookmarkLeft: {
    left: 0,
    borderTopRightRadius: 14,
    borderBottomRightRadius: 14,
    borderLeftWidth: 0,
  },
  stageBookmarkRight: {
    right: 0,
    borderTopLeftRadius: 14,
    borderBottomLeftRadius: 14,
    borderRightWidth: 0,
  },
  stageBookmarkPressed: {
    opacity: 0.8,
  },
  stageBookmarkIconCol: {
    width: STAGE_BOOKMARK_RAIL,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
  },
  stageBookmarkIconColRevealed: {
    width: "auto" as unknown as number,
    minWidth: 14,
  },
  stageBookmarkLabel: {
    flexShrink: 1,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.15,
    color: Theme.textSecondary,
  },
  stageBookmarkCount: {
    fontWeight: "600",
    color: Theme.textMuted,
    fontVariant: ["tabular-nums"],
  },
  stageBookmarkCountPeek: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textMuted,
    fontVariant: ["tabular-nums"],
  },
  subTabBand: {
    backgroundColor: Theme.cardWhite,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
    paddingTop: 12,
    paddingBottom: 12,
    width: "100%",
  },
  subTabRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    width: "100%",
  },
  subTab: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: Theme.surfaceGray,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  subTabOn: {
    backgroundColor: Theme.textPrimaryDark,
    borderColor: Theme.textPrimaryDark,
  },
  subTabText: {
    fontSize: 12,
    fontWeight: "800",
    color: Theme.textSecondary,
    flexShrink: 1,
  },
  subTabTextOn: {
    color: Theme.textOnDark,
  },
  subTabCount: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.cardWhite,
  },
  subTabCountOn: {
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  subTabCountText: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textSecondary,
    fontVariant: ["tabular-nums"],
  },
  subTabCountTextOn: {
    color: Theme.textOnDark,
  },
  toolbarBand: {
    backgroundColor: Theme.analyticsCanvas,
    paddingTop: 14,
    paddingBottom: 4,
    width: "100%",
  },
  lanePanel: {
    width: "100%",
    maxWidth: BOARD_MAX_THREE,
    alignSelf: "center",
    padding: 14,
    borderRadius: 16,
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.surfaceBorder,
    gap: 10,
  },
  lanePanelMobile: {
    maxWidth: "100%",
    padding: 12,
    borderRadius: 14,
  },
  lanePanelHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  lanePanelHint: {
    flex: 1,
    minWidth: 0,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: Theme.textMuted,
  },
  lanePanelMeta: {
    flexShrink: 0,
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textSecondary,
  },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    width: "100%",
    minWidth: 0,
  },
  toolbarMobile: {
    flexDirection: "column",
    alignItems: "stretch",
    gap: 10,
  },
  searchWrap: {
    flex: 1,
    minWidth: 200,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 40,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: Theme.surfaceGray,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    ...Platform.select({
      web: { outlineStyle: "none" as unknown as undefined },
      default: {},
    }),
  },
  searchWrapMobile: {
    maxWidth: "100%",
    width: "100%",
    minWidth: 0,
    flex: 0,
  },
  searchIcon: {
    marginTop: 1,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    paddingVertical: Platform.OS === "web" ? 8 : 9,
    ...Platform.select({
      web: {
        outlineStyle: "none" as unknown as undefined,
        outlineWidth: 0,
      } as object,
      default: {},
    }),
  },
  filterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 0,
    minWidth: 0,
    flexWrap: "wrap",
    marginLeft: "auto",
  },
  filterRowMobile: {
    width: "100%",
    marginLeft: 0,
  },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 36,
    maxWidth: 200,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: Theme.surfaceGray,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  filterChipActive: {
    backgroundColor: Theme.pulseIndigoWash,
    borderColor: Theme.loadAddButtonBorder,
  },
  filterChipPressed: {
    opacity: 0.88,
  },
  filterChipDisabled: {
    opacity: 0.42,
  },
  filterChipText: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textSecondary,
    letterSpacing: 0.2,
    flexShrink: 1,
  },
  filterChipTextActive: {
    color: Theme.textPrimaryDark,
  },
  clearChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    minHeight: 36,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  clearChipText: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textSecondary,
  },
  scroll: {
    flex: 1,
    width: "100%",
  },
  scrollContent: {
    flexGrow: 1,
    width: "100%",
    alignSelf: "stretch",
    ...Platform.select({
      web: { boxSizing: "border-box" } as object,
      default: {},
    }),
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "stretch",
    width: "100%",
    alignSelf: "stretch",
  },
  gridStack: {
    flexDirection: "column",
  },
  cardCellOne: {
    width: "100%",
    alignSelf: "stretch",
    marginBottom: GRID_GAP,
    minWidth: 0,
  },
  cardCellGrid: {
    minWidth: 0,
    width: "100%",
    alignSelf: "stretch",
  },
  cardFill: {
    flex: 1,
    width: "100%",
    minWidth: 0,
    alignSelf: "stretch",
  },
  cardHighlighted: {
    borderWidth: 2,
    borderColor: Theme.primary,
    borderRadius: 14,
  },
  detailOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 80,
    elevation: 80,
    backgroundColor: Theme.screenBackground,
  },
  poolDetail: { gap: 12, marginBottom: GRID_GAP },
  bidPoolGridGap: { marginBottom: GRID_GAP },
  poolBack: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    minHeight: 44,
  },
  poolBackText: { fontSize: 13, fontWeight: "700", color: Theme.primary },
  poolSectionTitle: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: Theme.textMuted,
    marginTop: 8,
    marginBottom: 10,
  },
  empty: {
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 72,
    paddingHorizontal: 24,
    width: "100%",
    maxWidth: 420,
    alignSelf: "center",
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.3,
    textAlign: "center",
  },
  emptyQuiet: {
    minHeight: 220,
    width: "100%",
  },
  emptyIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: Theme.brandBlueSoft,
    borderWidth: 1,
    borderColor: Theme.brandBlue,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  emptyText: {
    fontSize: 13,
    fontWeight: "500",
    color: Theme.textSecondary,
    textAlign: "center",
    lineHeight: 18,
  },
  emptyClearBtn: {
    marginTop: 4,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: Theme.textPrimaryDark,
  },
  emptyClearText: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textOnDark,
  },
  loadMoreBtn: {
    alignSelf: "center",
    marginTop: 16,
    minHeight: 44,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
    justifyContent: "center",
  },
  loadMoreBtnPressed: {
    opacity: 0.85,
  },
  loadMoreBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: Theme.primary,
  },
  menuBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.4)",
    justifyContent: "flex-start",
    paddingHorizontal: 20,
    zIndex: 90,
  },
  menuSheet: {
    width: "100%",
    maxWidth: 440,
    alignSelf: "center",
    maxHeight: "70%",
    backgroundColor: Theme.cardWhite,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    overflow: "hidden",
    ...Platform.select({
      web: {
        boxShadow: "0 16px 40px rgba(15,23,42,0.18)",
      } as object,
      default: {
        shadowColor: "#000",
        shadowOpacity: 0.12,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 8 },
        elevation: 8,
      },
    }),
  },
  menuHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
  },
  menuSearch: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 12,
    marginBottom: 8,
    minHeight: 40,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    backgroundColor: Theme.screenBackground,
  },
  menuSearchInput: {
    flex: 1,
    minHeight: 40,
    fontSize: 14,
    color: Theme.textPrimaryDark,
  },
  menuTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  menuClose: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.surfaceGray,
  },
  menuList: {
    maxHeight: 360,
  },
  menuOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
  },
  menuOptionActive: {
    backgroundColor: Theme.surfaceGray,
  },
  menuOptionText: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    fontWeight: "600",
    color: Theme.textPrimary,
  },
  menuOptionTextActive: {
    color: Theme.textPrimaryDark,
    fontWeight: "800",
  },
  menuOptionMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 0,
  },
  menuOptionCount: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textSecondary,
  },
  menuEmpty: {
    padding: 20,
    textAlign: "center",
    fontSize: 13,
    color: Theme.textMuted,
  },
});
