/**
 * Shared route + spec chrome for Find Loads Discover / My Bids cards.
 * Mirrors Load Center indent cards so Marketplace surfaces match app UI.
 */
import Theme from "@/constants/Theme";
import { RouteEndpointStack } from "@/features/network/components/RouteEndpointStack";
import { ArrowRight } from "lucide-react-native";
import { Platform, ScrollView, StyleSheet, Text, View, type ViewStyle } from "react-native";

export function titleCaseWord(value: string): string {
  const t = value.trim();
  if (!t) return t;
  return t
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

export function MarketplaceRouteGrid({
  pickup,
  drop,
  pickupLabel = "Pickup",
  dropLabel = "Drop",
  viaStops = [],
}: {
  pickup: string | null | undefined;
  drop: string | null | undefined;
  pickupLabel?: string;
  dropLabel?: string;
  viaStops?: readonly string[];
}) {
  const via = viaStops.map((s) => s.trim()).filter(Boolean);
  const viaLabel = via.join(" · ");
  return (
    <View style={styles.routeBlock}>
      <View style={styles.routeGrid}>
        <View style={styles.routeCol}>
          <Text style={styles.routeLabel}>{pickupLabel}</Text>
          <View style={styles.routeStack}>
            <RouteEndpointStack
              value={pickup}
              primaryStyle={styles.routeCity}
              secondaryStyle={styles.routeState}
            />
          </View>
        </View>
        <View style={styles.routeSep} pointerEvents="none" accessibilityElementsHidden>
          <View style={styles.routeSepLine} />
          <ArrowRight size={14} color={Theme.textMuted} strokeWidth={2.2} />
          <View style={styles.routeSepLine} />
        </View>
        <View style={[styles.routeCol, styles.routeColEnd]}>
          <Text style={[styles.routeLabel, styles.routeLabelEnd]}>{dropLabel}</Text>
          <View style={[styles.routeStack, styles.routeStackEnd]}>
            <RouteEndpointStack
              value={drop}
              align="end"
              primaryStyle={styles.routeCity}
              secondaryStyle={styles.routeState}
            />
          </View>
        </View>
      </View>
      {viaLabel ? (
        <View
          style={styles.viaRow}
          accessible
          accessibilityLabel={`Via ${viaLabel}`}
        >
          <Text style={styles.viaKicker}>Via</Text>
          <Text style={styles.viaPlaces} numberOfLines={2}>
            {viaLabel}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

export function MarketplaceSpecChips({
  chips,
  dateLabel,
}: {
  chips: string[];
  dateLabel?: string | null;
}) {
  if (chips.length === 0 && !dateLabel) return null;

  return (
    <ScrollView
      horizontal
      nestedScrollEnabled
      showsHorizontalScrollIndicator={false}
      showsVerticalScrollIndicator={false}
      bounces={false}
      style={styles.specScroll}
      contentContainerStyle={styles.specRow}
    >
      {chips.map((chip) => (
        <View key={chip} style={styles.specChip}>
          <Text style={styles.specChipText} numberOfLines={1}>
            {chip}
          </Text>
        </View>
      ))}
      {dateLabel ? (
        <View style={[styles.specChip, styles.specChipDate]}>
          <Text style={styles.specChipDateText} numberOfLines={1}>
            {dateLabel}
          </Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  routeBlock: {
    width: "100%",
    maxWidth: "100%",
    gap: 8,
  },
  viaRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: Theme.brandBlueSoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.brandBlue,
  },
  viaKicker: {
    fontSize: 9,
    fontWeight: "600",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: Theme.primary,
    paddingTop: 1,
  },
  viaPlaces: {
    flex: 1,
    minWidth: 0,
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    lineHeight: 15,
  },
  routeGrid: Platform.select({
    web: {
      display: "grid",
      gridTemplateColumns: "minmax(0, 1fr) 44px minmax(0, 1fr)",
      columnGap: 10,
      alignItems: "flex-start",
      width: "100%",
      maxWidth: "100%",
      paddingVertical: 2,
      // CSS Grid is web-only and absent from RN's ViewStyle — route the cast
      // through `object`, matching how the rest of the repo handles web-only CSS.
    } as object as ViewStyle,
    default: {
      flexDirection: "row",
      alignItems: "flex-start",
      alignSelf: "stretch",
      width: "100%",
      gap: 10,
      paddingVertical: 2,
    },
  }),
  routeCol: Platform.select({
    web: {
      display: "flex",
      flexDirection: "column",
      alignItems: "flex-start",
      minWidth: 0,
      maxWidth: "100%",
    } as ViewStyle,
    default: {
      flex: 1,
      flexGrow: 1,
      flexShrink: 1,
      flexBasis: 0,
      minWidth: 0,
    },
  }),
  routeColEnd: {
    alignItems: "flex-end",
  },
  routeStack: {
    width: "100%",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 1,
  },
  routeStackEnd: {
    alignItems: "flex-end",
  },
  routeSep: {
    paddingTop: 16,
    width: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    flexShrink: 0,
    flexGrow: 0,
    alignSelf: "flex-start",
  },
  routeSepLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: Theme.border,
  },
  routeLabel: {
    fontSize: 10,
    fontWeight: "500",
    color: Theme.textMuted,
    letterSpacing: 0.2,
    textTransform: "uppercase",
    marginBottom: 4,
    lineHeight: 13,
    ...Platform.select({
      web: { whiteSpace: "pre-wrap" } as object,
      default: {},
    }),
  },
  routeLabelEnd: {
    textAlign: "right",
    width: "100%",
  },
  routeCity: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    lineHeight: 16,
    letterSpacing: 0,
    ...Platform.select({
      web: { whiteSpace: "pre-wrap" } as object,
      default: {},
    }),
  },
  routeState: {
    marginTop: 1,
    fontSize: 10,
    fontWeight: "400",
    color: Theme.textMuted,
    lineHeight: 13,
  },
  specScroll: {
    width: "100%",
    maxWidth: "100%",
    flexGrow: 0,
    flexShrink: 0,
    alignSelf: "stretch",
    marginTop: 1,
  },
  specRow: {
    flexDirection: "row",
    flexWrap: "nowrap",
    alignItems: "center",
    gap: 5,
    paddingVertical: 1,
    paddingRight: 8,
  },
  specChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: Theme.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.surfaceBorder,
    flexGrow: 0,
    flexShrink: 0,
  },
  specChipDate: {
    backgroundColor: Theme.brandBlueSoft,
    borderColor: Theme.brandBlue,
  },
  specChipText: {
    fontSize: 10,
    fontWeight: "500",
    color: Theme.textSecondary,
    lineHeight: 13,
  },
  specChipDateText: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.primary,
    lineHeight: 13,
  },
});
