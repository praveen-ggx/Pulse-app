import Theme from "@/constants/Theme";
import {
  HUB_GRID_PAGE_SIZE_OPTIONS,
  type HubGridPageSize,
} from "@/components/hub/hubGridCardLayout";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

export type HubListPaginationBarProps = {
  page: number;
  totalPages: number;
  totalItems: number;
  pageSize: HubGridPageSize;
  onPageSizeChange: (size: HubGridPageSize) => void;
  onPrev: () => void;
  onNext: () => void;
  /** e.g. "trips" or "loads" */
  itemLabel?: string;
  /** When true, removes outer margins for embedding in a parent bar row. */
  embedded?: boolean;
  /**
   * `full` — meta + controls (default).
   * `controls-only` — page size + prev/next for split hub footers.
   */
  layoutMode?: "full" | "controls-only";
};

export function formatHubListPaginationMeta(
  page: number,
  totalPages: number,
  totalItems: number,
  itemLabel = "items",
): string {
  return `Page ${page + 1}/${totalPages} · ${totalItems} ${itemLabel}`;
}

export function HubListPaginationBar({
  page,
  totalPages,
  totalItems,
  pageSize,
  onPageSizeChange,
  onPrev,
  onNext,
  itemLabel = "items",
  embedded = false,
  layoutMode = "full",
}: HubListPaginationBarProps) {
  const atFirst = page <= 0;
  const atLast = page >= totalPages - 1;
  const controls = (
    <View style={styles.right}>
      <View style={styles.pageSizeWrap}>
        {HUB_GRID_PAGE_SIZE_OPTIONS.map((n) => (
          <Pressable
            key={n}
            style={[
              styles.pageSizePill,
              pageSize === n && styles.pageSizePillActive,
            ]}
            onPress={() => onPageSizeChange(n)}
            accessibilityRole="button"
            accessibilityState={{ selected: pageSize === n }}
          >
            <Text
              style={[
                styles.pageSizeText,
                pageSize === n && styles.pageSizeTextActive,
              ]}
            >
              {n}
            </Text>
          </Pressable>
        ))}
      </View>
      <Pressable
        style={[styles.navBtn, atFirst && styles.navBtnDisabled]}
        onPress={onPrev}
        disabled={atFirst}
        accessibilityRole="button"
        accessibilityLabel="Previous page"
        accessibilityState={{ disabled: atFirst }}
      >
        <Text style={styles.navText}>Prev</Text>
      </Pressable>
      <Pressable
        style={[styles.navBtn, atLast && styles.navBtnDisabled]}
        onPress={onNext}
        disabled={atLast}
        accessibilityRole="button"
        accessibilityLabel="Next page"
        accessibilityState={{ disabled: atLast }}
      >
        <Text style={styles.navText}>Next</Text>
      </Pressable>
    </View>
  );

  if (layoutMode === "controls-only") {
    return (
      <View style={[styles.controlsOnlyRow, embedded && styles.rowEmbedded]}>
        {controls}
      </View>
    );
  }

  return (
    <View style={[styles.row, embedded && styles.rowEmbedded]}>
      <Text style={styles.meta}>
        {formatHubListPaginationMeta(page, totalPages, totalItems, itemLabel)}
      </Text>
      {controls}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    marginTop: 8,
    marginBottom: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingHorizontal: 2,
    width: "100%",
  },
  rowEmbedded: {
    marginTop: 0,
    marginBottom: 0,
    paddingHorizontal: 0,
  },
  controlsOnlyRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 6,
    flexShrink: 0,
  },
  meta: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textMuted,
    letterSpacing: 0.4,
    textTransform: "uppercase",
    flexShrink: 1,
    minWidth: 0,
  },
  right: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 0,
  },
  pageSizeWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 999,
    padding: 2,
  },
  pageSizePill: {
    minWidth: 34,
    minHeight: 28,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    ...Platform.select({
      web: { cursor: "pointer" } as object,
    }),
  },
  pageSizePillActive: {
    backgroundColor: Theme.darkBackground,
  },
  pageSizeText: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textMuted,
    letterSpacing: 0.35,
  },
  pageSizeTextActive: {
    color: Theme.textOnDark,
  },
  navBtn: {
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.screenBackground,
    borderRadius: 8,
    minHeight: 28,
    paddingHorizontal: 10,
    paddingVertical: 5,
    justifyContent: "center",
    ...Platform.select({
      web: { cursor: "pointer" } as object,
    }),
  },
  navBtnDisabled: {
    opacity: 0.4,
  },
  navText: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    letterSpacing: 0.35,
    textTransform: "uppercase",
  },
});
