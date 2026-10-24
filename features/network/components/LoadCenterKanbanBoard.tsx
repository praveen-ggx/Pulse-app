/**
 * Load Center Kanban board — view-only columns for Give Load / Get Load stages.
 * Parent supplies bucketed columns + card renderer so actions stay wired.
 * Column headers open a full-page list via `onColumnPress`.
 */
import Theme from "@/constants/Theme";
import type { IndentRow } from "@/features/indents";
import { useScrollPagedItems } from "@/features/network/hooks/useScrollPagedItems";
import { MARKETPLACE_LOAD_PAGE_SIZE } from "@/features/network/utils/marketplaceLoadsPage.util";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { Maximize2 } from "lucide-react-native";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from "react-native";

/** Floor so Get Load columns still fit; they flex to fill wider boards. */
const MIN_COLUMN_WIDTH = 248;

export type LoadCenterKanbanColumnTab = {
  id: string;
  label: string;
  loads: IndentRow[];
};

export type LoadCenterKanbanColumn = {
  id: string;
  label: string;
  accent: string;
  loads: IndentRow[];
  /**
   * How many cards to paint before the next scroll page.
   * The header badge stays `loads.length` (full catalog) — never the painted prefix.
   */
  pageSize?: number;
  /**
   * Optional in-column tabs (e.g. Claimed → In Transit / Completed).
   * When set, `loads` is the union used for the header badge.
   */
  tabs?: LoadCenterKanbanColumnTab[];
  defaultTabId?: string;
};

export type LoadCenterKanbanBoardProps = {
  title: string;
  columns: LoadCenterKanbanColumn[];
  renderCard: (load: IndentRow) => ReactNode;
  highlightedIndentId?: string | null;
  /**
   * Explicit outer height (e.g. measured partner sidebar) so the board
   * bottom aligns with the left rail on desktop.
   */
  matchHeight?: number | null;
  /** Open full-page list for this column (indent cards only). */
  onColumnPress?: (column: LoadCenterKanbanColumn) => void;
  /** Replaces a column's indent cards (e.g. Network Loads as pools); null keeps the cards. */
  renderColumnBody?: (column: LoadCenterKanbanColumn) => ReactNode | null;
};

function KanbanEmptyStage({ delayMs }: { delayMs: number }) {
  const appear = useRef(new Animated.Value(0)).current;
  const bob = useRef(new Animated.Value(0)).current;
  const glow = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const enter = Animated.timing(appear, {
      toValue: 1,
      duration: 420,
      delay: delayMs,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    const float = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, {
          toValue: 1,
          duration: 1400,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(bob, {
          toValue: 0,
          duration: 1400,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, {
          toValue: 1,
          duration: 1600,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(glow, {
          toValue: 0,
          duration: 1600,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    enter.start();
    const start = setTimeout(() => {
      float.start();
      pulse.start();
    }, delayMs + 200);
    return () => {
      enter.stop();
      float.stop();
      pulse.stop();
      clearTimeout(start);
    };
  }, [appear, bob, delayMs, glow]);

  return (
    <Animated.View
      style={[
        styles.emptyColumn,
        {
          opacity: appear,
          transform: [
            {
              translateY: appear.interpolate({
                inputRange: [0, 1],
                outputRange: [6, 0],
              }),
            },
          ],
        },
      ]}
    >
      <Animated.View
        style={[
          styles.emptyIconWrap,
          {
            opacity: glow.interpolate({
              inputRange: [0, 1],
              outputRange: [0.72, 1],
            }),
            transform: [
              {
                translateY: bob.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, -4],
                }),
              },
              {
                scale: glow.interpolate({
                  inputRange: [0, 1],
                  outputRange: [1, 1.06],
                }),
              },
            ],
          },
        ]}
      >
        <FontAwesome name="inbox" size={14} color={Theme.textMuted} />
      </Animated.View>
      <Text style={styles.emptyText}>No loads in this stage</Text>
    </Animated.View>
  );
}

function KanbanColumn({
  column,
  columnIndex,
  renderCard,
  highlightedIndentId,
  onColumnPress,
  renderColumnBody,
}: {
  column: LoadCenterKanbanColumn;
  columnIndex: number;
  renderCard: (load: IndentRow) => ReactNode;
  highlightedIndentId?: string | null;
  onColumnPress?: (column: LoadCenterKanbanColumn) => void;
  renderColumnBody?: (column: LoadCenterKanbanColumn) => ReactNode | null;
}) {
  const customBody = renderColumnBody?.(column) ?? null;
  const [hovered, setHovered] = useState(false);
  const tabs = column.tabs ?? [];
  const hasTabs = tabs.length > 0;
  const [activeTabId, setActiveTabId] = useState(
    column.defaultTabId ?? tabs[0]?.id ?? "",
  );
  const activeTab =
    tabs.find((t) => t.id === activeTabId) ?? tabs[0] ?? null;
  const stageLoads = hasTabs ? (activeTab?.loads ?? []) : column.loads;
  const pageSize = column.pageSize ?? MARKETPLACE_LOAD_PAGE_SIZE;
  const { visibleItems: visibleLoads, hasMore, remaining, onScroll } =
    useScrollPagedItems(stageLoads, pageSize, `${column.id}:${activeTabId}`);
  const badgeCount = column.loads.length;
  const showEmpty = stageLoads.length === 0;

  return (
    <View
      style={styles.column}
      // @ts-expect-error web mouse events
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <View style={styles.columnHeader}>
        <View style={styles.columnTitleRow}>
          <View
            style={[styles.columnAccent, { backgroundColor: column.accent }]}
          />
          <Text style={styles.columnTitle} numberOfLines={1}>
            {column.label}
          </Text>
        </View>
        <View style={styles.columnHeaderActions}>
          <View style={styles.countBadge}>
            <Text style={styles.countText}>{badgeCount}</Text>
          </View>
          {onColumnPress ? (
            <Pressable
              onPress={() => onColumnPress(column)}
              style={({ pressed }) => [
                styles.expandBtn,
                pressed && styles.expandBtnPressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel={`Full page view: ${column.label}`}
              hitSlop={6}
            >
              <Maximize2
                size={13}
                color={Theme.primary}
                strokeWidth={2.4}
              />
            </Pressable>
          ) : null}
        </View>
      </View>

      {hasTabs ? (
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
                <View style={[styles.subTabCount, on && styles.subTabCountOn]}>
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
      ) : null}

      <ScrollView
        style={[
          styles.columnScroll,
          Platform.OS === "web" &&
            ({ scrollbarWidth: "thin" } as ViewStyle),
        ]}
        contentContainerStyle={styles.columnScrollContent}
        showsVerticalScrollIndicator={hovered || Platform.OS !== "web"}
        nestedScrollEnabled
        onScroll={onScroll}
        scrollEventThrottle={16}
      >
        {customBody != null && !showEmpty ? (
          customBody
        ) : showEmpty ? (
          <KanbanEmptyStage delayMs={columnIndex * 90} />
        ) : (
          visibleLoads.map((load) => (
            <View
              key={load.id}
              style={[
                styles.cardWrap,
                highlightedIndentId === load.id && styles.cardHighlighted,
              ]}
            >
              {renderCard(load)}
            </View>
          ))
        )}
        {hasMore && customBody == null ? (
          <View style={styles.loadMoreHint} accessibilityLabel={`${remaining} more ${column.label}`}>
            <Text style={styles.loadMoreBtnText}>
              Scroll for more · {remaining} of {badgeCount} remaining
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

export function LoadCenterKanbanBoard({
  title,
  columns,
  renderCard,
  highlightedIndentId = null,
  matchHeight = null,
  onColumnPress,
  renderColumnBody,
}: LoadCenterKanbanBoardProps) {
  const shellHeight =
    matchHeight != null && matchHeight > 0 ? Math.round(matchHeight) : null;

  return (
    <View
      style={[
        styles.boardShell,
        shellHeight != null
          ? {
              height: shellHeight,
              minHeight: shellHeight,
              maxHeight: shellHeight,
              flexGrow: 0,
              flexShrink: 0,
            }
          : null,
      ]}
    >
      <View style={styles.boardHeader}>
        <Text style={styles.boardTitle}>{title}</Text>
        <Text style={styles.boardHint}>
          Tap a stage to expand · tap a card for detail
        </Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator
        style={styles.boardScroll}
        contentContainerStyle={styles.boardScrollContent}
        nestedScrollEnabled
      >
        {columns.map((column, index) => (
          <KanbanColumn
            key={column.id}
            column={column}
            columnIndex={index}
            renderCard={renderCard}
            highlightedIndentId={highlightedIndentId}
            onColumnPress={onColumnPress}
            renderColumnBody={renderColumnBody}
          />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  boardShell: {
    flex: 1,
    minHeight: 0,
    marginTop: 4,
    marginBottom: 0,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
    overflow: "hidden",
    ...Platform.select({
      web: {
        boxShadow: "0 2px 12px rgba(15,23,42,0.05)",
        display: "flex",
        flexDirection: "column",
        height: "100%",
      } as object,
      default: {},
    }),
  },
  boardHeader: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
    flexShrink: 0,
  },
  boardTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.2,
  },
  boardHint: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textMuted,
  },
  boardScroll: {
    flex: 1,
    minHeight: 0,
    alignSelf: "stretch",
  },
  boardScrollContent: {
    flexGrow: 1,
    flex: 1,
    minWidth: "100%" as unknown as number,
    minHeight: "100%" as unknown as number,
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 10,
    alignItems: "stretch",
    ...Platform.select({
      web: {
        display: "flex",
        flexDirection: "row",
        alignItems: "stretch",
        boxSizing: "border-box",
        height: "100%",
      } as object,
      default: {},
    }),
  },
  column: {
    flex: 1,
    minWidth: MIN_COLUMN_WIDTH,
    alignSelf: "stretch",
    backgroundColor: Theme.surfaceGray,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    overflow: "hidden",
    ...Platform.select({
      web: {
        display: "flex",
        flexDirection: "column",
        alignItems: "stretch",
        height: "100%",
        minWidth: MIN_COLUMN_WIDTH,
      } as object,
      default: {},
    }),
  },
  columnHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: Theme.cardWhite,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
    flexShrink: 0,
  },
  columnHeaderActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 0,
  },
  expandBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Theme.brandBlueSoft,
    borderWidth: 1,
    borderColor: Theme.brandBlue,
    alignItems: "center",
    justifyContent: "center",
    ...Platform.select({
      web: { cursor: "pointer" } as object,
      default: {},
    }),
  },
  expandBtnPressed: {
    backgroundColor: Theme.brandBlue,
    transform: [{ scale: 0.96 }],
  },
  subTabRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 6,
    backgroundColor: Theme.cardWhite,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
    flexShrink: 0,
  },
  subTab: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 7,
    paddingHorizontal: 6,
    borderRadius: 8,
    backgroundColor: Theme.surfaceGray,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  subTabOn: {
    backgroundColor: Theme.textPrimaryDark,
    borderColor: Theme.textPrimaryDark,
  },
  subTabText: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.textSecondary,
    flexShrink: 1,
  },
  subTabTextOn: {
    color: Theme.textOnDark,
  },
  subTabCount: {
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
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
  columnTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  columnAccent: {
    width: 3,
    height: 16,
    borderRadius: 2,
  },
  columnTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.1,
    flexShrink: 1,
  },
  countBadge: {
    minWidth: 24,
    height: 22,
    paddingHorizontal: 7,
    borderRadius: 999,
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    alignItems: "center",
    justifyContent: "center",
  },
  countText: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.textSecondary,
    fontVariant: ["tabular-nums"],
  },
  columnScroll: {
    flex: 1,
    minHeight: 0,
    width: "100%",
    alignSelf: "stretch",
  },
  columnScrollContent: {
    padding: 10,
    gap: 10,
    paddingBottom: 14,
    flexGrow: 1,
    // RN Web ScrollView defaults to alignItems:flex-start, so cards shrink
    // to content width and sit on the left of a wider column.
    alignItems: "stretch",
    alignSelf: "stretch",
    width: "100%",
    minWidth: "100%" as unknown as number,
    ...Platform.select({
      web: {
        display: "flex",
        flexDirection: "column",
        alignItems: "stretch",
        boxSizing: "border-box",
      } as object,
      default: {},
    }),
  },
  loadMoreHint: {
    alignSelf: "stretch",
    minHeight: 36,
    marginTop: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  loadMoreBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: Theme.primary,
  },
  cardWrap: {
    width: "100%",
    maxWidth: "100%",
    minWidth: 0,
    alignSelf: "stretch",
    flexGrow: 0,
    flexShrink: 0,
    borderRadius: 14,
    overflow: "visible",
    ...Platform.select({
      web: {
        display: "flex",
        flexDirection: "column",
        alignItems: "stretch",
        boxSizing: "border-box",
      } as object,
      default: {},
    }),
  },
  cardHighlighted: {
    borderWidth: 2,
    borderColor: Theme.primary,
    borderRadius: 14,
  },
  emptyColumn: {
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 28,
    paddingHorizontal: 12,
    flexGrow: 1,
  },
  emptyIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textMuted,
    textAlign: "center",
  },
});
