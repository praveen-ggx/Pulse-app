/**
 * Full-page modal listing all indent cards for a Load Center kanban column.
 * Full-bleed width; grid uses up to 4 columns and shrinks when the stage is sparse
 * so cards fill the row (no empty right half). Toolbar: search + pickup / drop /
 * vehicle filters. Nested children (Award / Bid) + indent detail overlay stay on-page.
 */
import Theme from "@/constants/Theme";
import Layout from "@/constants/Layout";
import { LazySuspenseInlineFallback } from "@/components/LazySuspenseFallback";
import { HUB_GRID_MIN_WIDTH } from "@/components/hub/hubGridCardLayout";
import { getIndentDisplayNumber, type IndentRow } from "@/features/indents";
import type {
  LoadCenterKanbanColumn,
} from "@/features/network/components/LoadCenterKanbanBoard";
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
const DESKTOP_SIDE_PAD = 20;
const MOBILE_SIDE_PAD = Layout.screenPaddingHorizontal;
const GRID_GAP = 10;
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
  onCloseDetail?: () => void;
  onEditIndent?: (indent: IndentRow) => void;
  /** Adjacent stages in board order — edge bookmark arrows jump full-page. */
  previousStage?: LoadCenterKanbanStageNav | null;
  nextStage?: LoadCenterKanbanStageNav | null;
  onNavigateStage?: (columnId: string) => void;
  /** Nested overlays (Award / Bid modals) — render inside so they stack above this page. */
  children?: ReactNode;
};

function maxColumnsForWidth(width: number): 1 | 2 | 4 {
  if (width >= HUB_GRID_MIN_WIDTH) return 4;
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

function uniqueSorted(values: Array<string | null | undefined>): string[] {
  const set = new Set<string>();
  for (const v of values) {
    const t = (v ?? "").trim();
    if (t) set.add(t);
  }
  return [...set].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
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
  onCloseDetail,
  onEditIndent,
  previousStage = null,
  nextStage = null,
  onNavigateStage,
  children,
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
  }, [column]);

  const allColumnLoads = column?.loads ?? [];

  const filterOptions = useMemo(() => {
    return {
      pickup: uniqueSorted(allColumnLoads.map((l) => l.pickup_area)),
      drop: uniqueSorted(allColumnLoads.map((l) => l.drop_location)),
      vehicle: uniqueSorted(allColumnLoads.map((l) => l.vehicle_type)),
    };
  }, [allColumnLoads]);

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? tabs[0] ?? null;
  const stageLoads = hasTabs ? (activeTab?.loads ?? []) : allColumnLoads;

  const filteredLoads = useMemo(() => {
    return stageLoads.filter(
      (load) =>
        loadMatchesSearch(load, searchQuery) &&
        fieldEquals(load.pickup_area, pickupFilter) &&
        fieldEquals(load.drop_location, dropFilter) &&
        fieldEquals(load.vehicle_type, vehicleFilter),
    );
  }, [stageLoads, searchQuery, pickupFilter, dropFilter, vehicleFilter]);

  const columns = columnsForGrid(width, filteredLoads.length);

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

  const webGridStyle = useMemo(() => {
    if (Platform.OS !== "web") return null;
    return {
      display: "grid" as const,
      gridTemplateColumns: gridTemplateColumns(columns),
      gap: GRID_GAP,
      width: "100%",
      maxWidth: columns === 1 ? 440 : ("100%" as const),
      alignSelf: columns === 1 ? ("flex-start" as const) : ("stretch" as const),
      alignItems: "stretch" as const,
    };
  }, [columns]);

  const hasActiveFilters =
    searchQuery.trim().length > 0 ||
    pickupFilter.length > 0 ||
    dropFilter.length > 0 ||
    vehicleFilter.length > 0;

  const clearFilters = useCallback(() => {
    setSearchQuery("");
    setPickupFilter("");
    setDropFilter("");
    setVehicleFilter("");
    setOpenMenu(null);
  }, []);

  const badgeCount = allColumnLoads.length;
  const shownCount = filteredLoads.length;

  if (!column) return null;

  const menuOptions =
    openMenu === "pickup"
      ? filterOptions.pickup
      : openMenu === "drop"
        ? filterOptions.drop
        : openMenu === "vehicle"
          ? filterOptions.vehicle
          : [];

  const menuValue =
    openMenu === "pickup"
      ? pickupFilter
      : openMenu === "drop"
        ? dropFilter
        : openMenu === "vehicle"
          ? vehicleFilter
          : "";

  const setMenuValue = (value: string) => {
    if (openMenu === "pickup") setPickupFilter(value);
    if (openMenu === "drop") setDropFilter(value);
    if (openMenu === "vehicle") setVehicleFilter(value);
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
  ) => {
    const active = value.length > 0 || openMenu === key;
    return (
      <Pressable
        key={key}
        onPress={() => setOpenMenu((cur) => (cur === key ? null : key))}
        style={({ pressed }) => [
          styles.filterChip,
          active && styles.filterChipActive,
          pressed && styles.filterChipPressed,
        ]}
        accessibilityRole="button"
        accessibilityState={{ expanded: openMenu === key }}
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
          <View style={styles.headerInner}>
            <View style={styles.headerLeft}>
              <View
                style={[styles.accent, { backgroundColor: column.accent }]}
              />
              <View style={styles.headerText}>
                <Text
                  style={[styles.title, isDesktop && styles.titleDesktop]}
                  numberOfLines={1}
                >
                  {column.label}
                </Text>
                <Text style={styles.subtitle} numberOfLines={1}>
                  {hasActiveFilters
                    ? `${shownCount} of ${stageLoads.length} load${
                        stageLoads.length === 1 ? "" : "s"
                      } shown`
                    : `${badgeCount} load${badgeCount === 1 ? "" : "s"} in this stage`}
                </Text>
              </View>
            </View>
            <View style={styles.headerRight}>
              <View style={styles.countBadge}>
                <Text style={styles.countText}>
                  {hasActiveFilters ? shownCount : badgeCount}
                </Text>
              </View>
              <Pressable
                onPress={onClose}
                style={({ pressed }) => [
                  styles.closeBtn,
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

        {/* Search + filters */}
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
              {renderFilterChip("drop", "Drop", dropFilter, "flag")}
              {renderFilterChip("vehicle", "Vehicle", vehicleFilter, "truck")}
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

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            {
              paddingLeft:
                sidePad +
                (!showDetail && previousStage ? STAGE_BOOKMARK_RAIL : 0),
              paddingRight:
                sidePad +
                (!showDetail && nextStage ? STAGE_BOOKMARK_RAIL : 0),
              paddingTop: isDesktop ? 16 : 14,
              paddingBottom: isDesktop ? 32 : 28,
            },
          ]}
          showsVerticalScrollIndicator
          keyboardShouldPersistTaps="handled"
        >
          {filteredLoads.length === 0 ? (
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <FontAwesome
                  name={hasActiveFilters ? "filter" : "inbox"}
                  size={16}
                  color={Theme.textMuted}
                />
              </View>
              <Text style={styles.emptyText}>
                {hasActiveFilters
                  ? "No loads match your filters"
                  : "No loads in this stage"}
              </Text>
              {hasActiveFilters ? (
                <Pressable onPress={clearFilters} style={styles.emptyClearBtn}>
                  <Text style={styles.emptyClearText}>Clear filters</Text>
                </Pressable>
              ) : null}
            </View>
          ) : (
            <View
              style={[
                styles.grid,
                columns === 1 && styles.gridStack,
                webGridStyle as object,
              ]}
            >
              {filteredLoads.map((load) => (
                <View
                  key={load.id}
                  style={[
                    cellStyle,
                    highlightedIndentId === load.id && styles.cardHighlighted,
                  ]}
                >
                  <View style={styles.cardFill}>{renderCard(load)}</View>
                </View>
              ))}
            </View>
          )}
        </ScrollView>

        {/* Bookmark-style stage jumpers — hide on first/last and while detail is open */}
        {!showDetail && previousStage && onNavigateStage ? (
          <StageBookmarkArrow
            side="left"
            stage={previousStage}
            onPress={() => onNavigateStage(previousStage.id)}
          />
        ) : null}
        {!showDetail && nextStage && onNavigateStage ? (
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
                  onPress={() => setOpenMenu(null)}
                  style={styles.menuClose}
                  hitSlop={8}
                >
                  <FontAwesome name="times" size={14} color={Theme.textMuted} />
                </Pressable>
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
                  <Text style={styles.menuEmpty}>No options in this stage</Text>
                ) : (
                  menuOptions.map((opt) => {
                    const on = norm(opt) === norm(menuValue);
                    return (
                      <Pressable
                        key={opt}
                        onPress={() => setMenuValue(opt)}
                        style={[styles.menuOption, on && styles.menuOptionActive]}
                      >
                        <Text
                          style={[
                            styles.menuOptionText,
                            on && styles.menuOptionTextActive,
                          ]}
                          numberOfLines={2}
                        >
                          {opt}
                        </Text>
                        {on ? (
                          <FontAwesome
                            name="check"
                            size={12}
                            color={Theme.textPrimaryDark}
                          />
                        ) : null}
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
    backgroundColor: Theme.surfaceGray,
    width: "100%",
    position: "relative",
    overflow: "hidden",
  },
  headerBand: {
    backgroundColor: Theme.cardWhite,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
    paddingBottom: 14,
    width: "100%",
  },
  headerInner: {
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
    gap: 10,
  },
  accent: {
    width: 4,
    height: 32,
    borderRadius: 2,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  title: {
    fontSize: 17,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.3,
  },
  titleDesktop: {
    fontSize: 20,
    letterSpacing: -0.4,
  },
  subtitle: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textMuted,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flexShrink: 0,
  },
  countBadge: {
    minWidth: 28,
    height: 26,
    paddingHorizontal: 8,
    borderRadius: 999,
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    alignItems: "center",
    justifyContent: "center",
  },
  countText: {
    fontSize: 12,
    fontWeight: "800",
    color: Theme.textSecondary,
    fontVariant: ["tabular-nums"],
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
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
    backgroundColor: Theme.cardWhite,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
    paddingTop: 10,
    paddingBottom: 12,
    width: "100%",
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
  empty: {
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 80,
    width: "100%",
  },
  emptyIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    fontSize: 13,
    fontWeight: "600",
    color: Theme.textMuted,
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
  menuEmpty: {
    padding: 20,
    textAlign: "center",
    fontSize: 13,
    color: Theme.textMuted,
  },
});
