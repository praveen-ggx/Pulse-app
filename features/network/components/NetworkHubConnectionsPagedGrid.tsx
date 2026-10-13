/**
 * Your connections — horizontal swipe pages (5×2 desktop, 2×2 mobile) + Previous / Next.
 */
import Theme from "@/constants/Theme";
import { useLanguage } from "@/contexts/LanguageContext";
import type { NetworkHubConnectionsLayout } from "@/features/network/constants/networkHubGrid";
import {
  NETWORK_HUB_GRID_GAP_PX,
  NETWORK_HUB_NATIVE_LIST_GAP_PX,
  NETWORK_HUB_GRID_ROW_PADDING_H,
} from "@/features/network/constants/networkHubGrid";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ViewStyle,
} from "react-native";

export type NetworkHubConnectionsPagedGridProps<T> = {
  items: T[];
  layout: NetworkHubConnectionsLayout;
  resetKey: string;
  keyExtractor: (item: T) => string;
  renderItem: (item: T) => ReactNode;
  /** Fires when the visible page of items changes (for synced tables / counts). */
  onVisiblePageChange?: (items: T[]) => void;
  /** Override default horizontal grid padding. */
  contentPaddingHorizontal?: number;
};

function chunkRow<T>(items: T[], columns: number): (T | null)[] {
  const row: (T | null)[] = [];
  for (let i = 0; i < columns; i += 1) {
    row.push(items[i] ?? null);
  }
  return row;
}

function buildPages<T>(items: T[], pageSize: number, pageCount: number): T[][] {
  const pages: T[][] = [];
  for (let p = 0; p < pageCount; p += 1) {
    pages.push(items.slice(p * pageSize, (p + 1) * pageSize));
  }
  return pages;
}

export function NetworkHubConnectionsPagedGrid<T>({
  items,
  layout,
  resetKey,
  keyExtractor,
  renderItem,
  onVisiblePageChange,
  contentPaddingHorizontal = NETWORK_HUB_GRID_ROW_PADDING_H,
}: NetworkHubConnectionsPagedGridProps<T>) {
  const { t } = useLanguage();
  const [page, setPage] = useState(0);
  const [viewportWidth, setViewportWidth] = useState(0);
  const listRef = useRef<ScrollView>(null);
  const pageRef = useRef(0);
  const viewportWidthRef = useRef(0);
  const visibleIdsRef = useRef("");
  const emptyPageRef = useRef<T[]>([]);
  const { columns, rows, pageSize } = layout;
  const isWeb = Platform.OS === "web";
  const slideWidth = viewportWidth > 0 ? Math.floor(viewportWidth) : 0;

  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const pages = useMemo(
    () => buildPages(items, pageSize, pageCount),
    [items, pageSize, pageCount],
  );

  const visiblePageItems =
    pages[Math.min(page, pageCount - 1)] ?? emptyPageRef.current;

  useEffect(() => {
    const ids = visiblePageItems.map(keyExtractor).join("|");
    if (ids === visibleIdsRef.current) return;
    visibleIdsRef.current = ids;
    onVisiblePageChange?.(visiblePageItems);
  }, [keyExtractor, onVisiblePageChange, visiblePageItems]);

  const singleColumn = columns === 1;

  const commitPage = useCallback((next: number) => {
    const clamped = Math.max(0, Math.min(pageCount - 1, next));
    if (pageRef.current === clamped) return;
    pageRef.current = clamped;
    setPage(clamped);
  }, [pageCount]);

  const scrollPagerTo = useCallback(
    (x: number, animated: boolean) => {
      const scroller = listRef.current;
      if (!scroller) return;
      if (isWeb) {
        const node =
          typeof (scroller as unknown as { getNativeScrollRef?: () => unknown })
            .getNativeScrollRef === "function"
            ? (scroller as unknown as { getNativeScrollRef: () => unknown }).getNativeScrollRef()
            : typeof (scroller as unknown as { getScrollableNode?: () => unknown })
                  .getScrollableNode === "function"
              ? (scroller as unknown as { getScrollableNode: () => unknown }).getScrollableNode()
              : null;
        const el = node as { scrollTo?: (opts: ScrollToOptions) => void } | null;
        if (el && typeof el.scrollTo === "function") {
          el.scrollTo({ left: x, top: 0, behavior: animated ? "smooth" : "auto" });
          return;
        }
      }
      scroller.scrollTo({ x, y: 0, animated });
    },
    [isWeb],
  );

  const swipePager = !isWeb && pageCount > 1 && slideWidth > 0;

  const goToPage = useCallback(
    (target: number, animated = true) => {
      const next = Math.max(0, Math.min(pageCount - 1, target));
      pageRef.current = next;
      setPage(next);
      if (swipePager && slideWidth > 0) {
        scrollPagerTo(next * slideWidth, animated);
      }
    },
    [pageCount, scrollPagerTo, slideWidth, swipePager],
  );

  useEffect(() => {
    pageRef.current = 0;
    setPage((current) => (current === 0 ? current : 0));
    if (slideWidth > 0) {
      scrollPagerTo(0, false);
    }
  }, [resetKey, scrollPagerTo, slideWidth]);

  useEffect(() => {
    setPage((current) => {
      const next = Math.min(current, pageCount - 1);
      pageRef.current = next;
      return next;
    });
  }, [pageCount]);

  const onPagerScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (slideWidth <= 0) return;
      const idx = Math.round(e.nativeEvent.contentOffset.x / slideWidth);
      commitPage(idx);
    },
    [commitPage, slideWidth],
  );

  const renderPageBody = useCallback(
    (pageItems: T[]) => {
      if (singleColumn) {
        return (
          <View style={styles.nativeList}>
            {pageItems.map((item) => (
              <View key={keyExtractor(item)} style={styles.nativeListItem}>
                {renderItem(item)}
              </View>
            ))}
          </View>
        );
      }

      const gridRows: (T | null)[][] = [];
      for (let r = 0; r < rows; r += 1) {
        const start = r * columns;
        gridRows.push(
          chunkRow(pageItems.slice(start, start + columns), columns),
        );
      }

      return (
        <View
          style={[
            styles.grid,
            rows >= 2 && styles.gridTwoRow,
            { paddingHorizontal: contentPaddingHorizontal },
          ]}
        >
          {gridRows.map((row, rowIndex) => (
            <View
              key={`hub-page-row-${rowIndex}`}
              style={[styles.row, rows >= 2 && styles.rowHubTiles]}
            >
              {row.map((item, colIndex) => (
                <View
                  key={
                    item
                      ? keyExtractor(item)
                      : `hub-page-empty-${rowIndex}-${colIndex}`
                  }
                  style={styles.cell}
                >
                  {item ? renderItem(item) : null}
                </View>
              ))}
            </View>
          ))}
        </View>
      );
    },
    [columns, contentPaddingHorizontal, keyExtractor, renderItem, rows, singleColumn],
  );

  if (items.length === 0) {
    return null;
  }

  const canGoPrevious = page > 0;
  const canGoNext = page < pageCount - 1;

  return (
    <View
      style={styles.root}
      onLayout={(e) => {
        const w = Math.floor(e.nativeEvent.layout.width);
        if (w <= 0) return;
        if (Math.abs(w - viewportWidthRef.current) < 2) return;
        viewportWidthRef.current = w;
        setViewportWidth(w);
      }}
    >
      {swipePager ? (
        <ScrollView
          ref={listRef}
          horizontal
          nestedScrollEnabled
          directionalLockEnabled
          disableIntervalMomentum
          pagingEnabled={Platform.OS === "ios"}
          snapToInterval={Platform.OS === "android" ? slideWidth : undefined}
          snapToAlignment="start"
          decelerationRate="fast"
          bounces={false}
          overScrollMode="never"
          showsHorizontalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={onPagerScroll}
          onMomentumScrollEnd={onPagerScroll}
          style={[styles.pagerList, isWeb ? WEB_PAGER_SCROLL : null]}
          contentContainerStyle={styles.pagerContent}
        >
          {pages.map((pageItems, index) => (
            <View
              key={`connections-hub-page-${index}`}
              style={[
                styles.pageSlide,
                { width: slideWidth },
                isWeb ? WEB_PAGE_SLIDE : null,
              ]}
            >
              {renderPageBody(pageItems)}
            </View>
          ))}
        </ScrollView>
      ) : (
        renderPageBody(pages[Math.min(page, pageCount - 1)] ?? [])
      )}

      {pageCount > 1 ? (
        <View style={styles.pager}>
          <Pressable
            onPress={() => goToPage(page - 1)}
            disabled={!canGoPrevious}
            style={({ pressed }) => [
              styles.pagerBtn,
              !canGoPrevious && styles.pagerBtnDisabled,
              pressed && canGoPrevious && styles.pagerBtnPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel={t("networkConnectionsPrevious")}
          >
            <ChevronLeft
              size={12}
              color={canGoPrevious ? Theme.textPrimaryDark : Theme.textMuted}
              strokeWidth={2.4}
            />
            <Text
              style={[styles.pagerBtnText, !canGoPrevious && styles.pagerBtnTextDisabled]}
            >
              {t("networkConnectionsPrevious")}
            </Text>
          </Pressable>

          <Text style={styles.pagerMeta}>
            {page + 1} / {pageCount}
          </Text>

          <Pressable
            onPress={() => goToPage(page + 1)}
            disabled={!canGoNext}
            style={({ pressed }) => [
              styles.pagerBtn,
              !canGoNext && styles.pagerBtnDisabled,
              pressed && canGoNext && styles.pagerBtnPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel={t("networkConnectionsNext")}
          >
            <Text
              style={[styles.pagerBtnText, !canGoNext && styles.pagerBtnTextDisabled]}
            >
              {t("networkConnectionsNext")}
            </Text>
            <ChevronRight
              size={12}
              color={canGoNext ? Theme.textPrimaryDark : Theme.textMuted}
              strokeWidth={2.4}
            />
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const WEB_PAGER_SCROLL: ViewStyle = {
  overflowX: "auto",
  overflowY: "hidden",
  scrollSnapType: "x mandatory",
  overscrollBehaviorX: "contain",
  WebkitOverflowScrolling: "touch",
} as ViewStyle;

const WEB_PAGE_SLIDE: ViewStyle = {
  scrollSnapAlign: "start",
  scrollSnapStop: "always",
} as ViewStyle;

const styles = StyleSheet.create({
  root: {
    width: "100%",
    gap: 8,
  },
  pagerList: {
    width: "100%",
  },
  pagerContent: {
    flexDirection: "row",
    alignItems: "stretch",
  },
  pageSlide: {
    flexShrink: 0,
  },
  grid: {
    width: "100%",
    gap: NETWORK_HUB_GRID_GAP_PX,
  },
  gridTwoRow: {
    gap: 14,
    paddingBottom: 4,
  },
  row: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: NETWORK_HUB_GRID_GAP_PX,
    width: "100%",
  },
  rowHubTiles: {
    alignItems: "stretch",
    gap: 12,
  },
  cell: {
    flex: 1,
    minWidth: 0,
    alignSelf: "stretch",
    overflow: "hidden",
  },
  nativeList: {
    width: "100%",
    alignSelf: "stretch",
    paddingHorizontal: NETWORK_HUB_GRID_ROW_PADDING_H,
    gap: NETWORK_HUB_NATIVE_LIST_GAP_PX,
  },
  nativeListItem: {
    width: "100%",
    maxWidth: "100%",
    alignSelf: "stretch",
  },
  pager: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: NETWORK_HUB_GRID_ROW_PADDING_H,
    paddingTop: 2,
    paddingBottom: 4,
    gap: 8,
  },
  pagerBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 5,
    minHeight: 32,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.screenBackground,
  },
  pagerBtnPressed: {
    opacity: 0.88,
  },
  pagerBtnDisabled: {
    opacity: 0.42,
    backgroundColor: Theme.surfaceForm,
  },
  pagerBtnText: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  pagerBtnTextDisabled: {
    color: Theme.textMuted,
  },
  pagerMeta: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textMuted,
    letterSpacing: 0.2,
  },
});
