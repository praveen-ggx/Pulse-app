/**
 * Trips hub — bento intelligence metric row (reference: staggered manifest pulse cards).
 */
import type { ReactNode } from "react";
import Theme from "@/constants/Theme";
import type { TripMetricId } from "@/features/trips/utils/tripHubMetrics";
import { formatINRChip } from "@/lib/format";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";

export type ActiveMetricTabId = TripMetricId | "all";

export type BentoMetricVariant =
  | "indigo"
  | "slate"
  | "cyan"
  | "emerald"
  | "orange"
  | "purple"
  | "active";

export type BentoMetricSize = "large" | "small";

export type BentoMetricItem = {
  id: ActiveMetricTabId;
  count: number;
  title: string;
  subtitle: string;
  size: BentoMetricSize;
  variant: BentoMetricVariant;
  icon: React.ComponentProps<typeof FontAwesome>["name"];
};

const VARIANT_BLOB: Record<BentoMetricVariant, string> = {
  indigo: "#9ACEEB",
  slate: "#64748b",
  cyan: "#38bdf8",
  emerald: "#10b981",
  orange: Theme.accentGold,
  purple: "#9ACEEB",
  active: "#9ACEEB",
};

/** Typography parity with `TripsHubViews` fleet / ledger cards. */
const FS_CAPTION = 10;
const FS_AMOUNT_LABEL = 9;
const FS_COUNT_LARGE = 22;
const FS_COUNT_SMALL = 18;

/** Selected mission metric — matte black (trips hub / chat dark pill parity). */
const BENTO_ACTIVE_BG = "#141416";
const BENTO_ACTIVE_BORDER = "#2b2b30";
const BENTO_ACTIVE_ICON_WASH = "rgba(255, 255, 255, 0.1)";
const BENTO_ACTIVE_ICON_RING = "rgba(255, 255, 255, 0.16)";

const CARD_SHADOW = Platform.select({
  web: {
    boxShadow: "0 6px 20px rgba(15, 23, 42, 0.07)",
  } as object,
  default: {
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.07,
    shadowRadius: 10,
    elevation: 2,
  },
});

const CARD_SHADOW_ACTIVE = Platform.select({
  web: {
    boxShadow: "0 12px 32px rgba(0, 0, 0, 0.24)",
  } as object,
  default: {
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.24,
    shadowRadius: 16,
    elevation: 5,
  },
});

const BENTO_LAYOUT: Record<
  ActiveMetricTabId,
  { size: BentoMetricSize; variant: BentoMetricVariant }
> = {
  all: { size: "large", variant: "indigo" },
  indent: { size: "small", variant: "slate" },
  unassigned: { size: "small", variant: "slate" },
  assigned: { size: "small", variant: "active" },
  loading: { size: "small", variant: "orange" },
  in_transit: { size: "small", variant: "cyan" },
  unloading: { size: "small", variant: "purple" },
  delivered_docs_pending: { size: "large", variant: "emerald" },
};

function BentoMetricCard({
  item,
  active,
  onPress,
  flexStyle,
}: {
  item: BentoMetricItem;
  active: boolean;
  onPress: () => void;
  flexStyle: ViewStyle;
}) {
  const hover = useSharedValue(0);
  const press = useSharedValue(0);
  const blobColor = VARIANT_BLOB[item.variant];
  const isZero = item.count === 0;

  const cardAnim = useAnimatedStyle(() => ({
    transform: [
      {
        translateY: interpolate(hover.value, [0, 1], [0, -1]),
      },
      {
        scale: interpolate(press.value, [0, 1], [1, 0.992]),
      },
    ],
  }));

  return (
    <Pressable
      onPress={onPress}
      onHoverIn={() => {
        hover.value = withTiming(1, { duration: 140 });
      }}
      onHoverOut={() => {
        hover.value = withTiming(0, { duration: 160 });
      }}
      onPressIn={() => {
        press.value = withSpring(1, { damping: 18, stiffness: 300 });
      }}
      onPressOut={() => {
        press.value = withSpring(0, { damping: 18, stiffness: 300 });
      }}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={`${item.title}, ${item.count} trips`}
      style={[styles.cardPressable, flexStyle]}
    >
      <Animated.View
        style={[
          styles.card,
          item.size === "large" && styles.cardLarge,
          active ? styles.cardActive : styles.cardIdle,
          active ? CARD_SHADOW_ACTIVE : CARD_SHADOW,
          cardAnim,
        ]}
      >
        <View
          style={[
            StyleSheet.absoluteFill,
            active ? styles.cardActiveBg : styles.cardIdleBg,
          ]}
        />

        <View
          style={[
            styles.cornerBlob,
            { backgroundColor: active ? "#ffffff" : blobColor },
            active ? styles.cornerBlobActiveDark : null,
          ]}
          pointerEvents="none"
        />

        <View
          style={[
            styles.cardBody,
            item.size === "large" ? styles.cardBodyLarge : styles.cardBodySmall,
          ]}
        >
          <View style={styles.countRow}>
            <Text
              style={[
                styles.count,
                item.size === "large" ? styles.countLarge : styles.countSmall,
                active && styles.countActive,
                isZero && !active && styles.countZero,
              ]}
            >
              {item.count}
            </Text>
            <View
              style={[
                styles.iconOrb,
                {
                  backgroundColor: active
                    ? BENTO_ACTIVE_ICON_WASH
                    : `${blobColor}14`,
                  borderColor: active
                    ? BENTO_ACTIVE_ICON_RING
                    : `${blobColor}28`,
                },
              ]}
            >
              <FontAwesome
                name={item.icon}
                size={10}
                color={blobColor}
              />
            </View>
          </View>
          <View style={styles.labelBlock}>
            <Text
              style={[
                styles.label,
                item.title.includes(" ") && styles.labelPlain,
                active ? styles.labelActive : styles.labelIdle,
              ]}
              numberOfLines={2}
            >
              {item.title}
            </Text>
            <Text
              style={[
                styles.sub,
                active ? styles.subActive : styles.subIdle,
              ]}
              numberOfLines={2}
            >
              {item.subtitle}
            </Text>
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );
}

export type TripsHubBentoMetricsProps = {
  metricOrder: ActiveMetricTabId[];
  activeMetricTab: ActiveMetricTabId;
  onSelectMetric: (id: ActiveMetricTabId) => void;
  getCount: (id: ActiveMetricTabId) => number;
  getTitle: (id: ActiveMetricTabId) => string;
  getSubtitle: (id: ActiveMetricTabId) => string;
  getIcon: (id: ActiveMetricTabId) => React.ComponentProps<typeof FontAwesome>["name"];
  isDesktop: boolean;
  style?: StyleProp<ViewStyle>;
};

export function TripsHubBentoMetrics({
  metricOrder,
  activeMetricTab,
  onSelectMetric,
  getCount,
  getTitle,
  getSubtitle,
  getIcon,
  isDesktop,
  style,
}: TripsHubBentoMetricsProps) {
  const items: BentoMetricItem[] = metricOrder.flatMap((id) => {
    const layout = BENTO_LAYOUT[id];
    if (!layout) return [];
    return [
      {
        id,
        count: getCount(id),
        title: getTitle(id),
        subtitle: getSubtitle(id),
        size: layout.size,
        variant: layout.variant,
        icon: getIcon(id),
      },
    ];
  });

  const renderCard = (item: BentoMetricItem) => (
    <BentoMetricCard
      key={item.id}
      item={item}
      active={activeMetricTab === item.id}
      onPress={() => onSelectMetric(item.id)}
      flexStyle={
        item.size === "large" ? styles.flexLarge : styles.flexSmall
      }
    />
  );

  if (!isDesktop) {
    return (
      <View style={[styles.hub, style]}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.mobileScroll}
        >
          {items.map(renderCard)}
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={[styles.hub, style]}>
      <View style={styles.bentoRow}>{items.map(renderCard)}</View>
    </View>
  );
}

export type HistoryTripMetricId =
  | "due_to_get"
  | "no_due_to_get"
  | "due_to_pay"
  | "no_due_to_pay"
  | "pending_soft_pod"
  | "pending_hard_pod";

export type HistoryBentoMetricItem = {
  id: HistoryTripMetricId;
  count: number;
  amount: number;
  title: string;
  subtitle: string;
  variant: BentoMetricVariant;
  showsAmount: boolean;
};

const HISTORY_VARIANT: Record<
  HistoryTripMetricId,
  { variant: BentoMetricVariant; showsAmount: boolean }
> = {
  due_to_get: { variant: "emerald", showsAmount: true },
  no_due_to_get: { variant: "slate", showsAmount: false },
  due_to_pay: { variant: "orange", showsAmount: true },
  no_due_to_pay: { variant: "slate", showsAmount: false },
  pending_soft_pod: { variant: "purple", showsAmount: false },
  pending_hard_pod: { variant: "cyan", showsAmount: false },
};

function historyMetricIcon(
  id: HistoryTripMetricId,
): React.ComponentProps<typeof FontAwesome>["name"] {
  switch (id) {
    case "no_due_to_get":
    case "no_due_to_pay":
      return "check";
    case "pending_soft_pod":
      return "file-text";
    case "pending_hard_pod":
      return "copy";
    default:
      return "rupee";
  }
}

function HistoryBentoMetricCard({
  item,
  active,
  onPress,
}: {
  item: HistoryBentoMetricItem;
  active: boolean;
  onPress: () => void;
}) {
  const hover = useSharedValue(0);
  const press = useSharedValue(0);
  const blobColor = VARIANT_BLOB[item.variant];
  const isZero = item.count === 0;
  const dueAttention =
    item.showsAmount && item.amount > 0 && !active;

  const cardAnim = useAnimatedStyle(() => ({
    transform: [
      {
        translateY: interpolate(hover.value, [0, 1], [0, -1]),
      },
      {
        scale: interpolate(press.value, [0, 1], [1, 0.992]),
      },
    ],
  }));

  return (
    <Pressable
      onPress={onPress}
      onHoverIn={() => {
        hover.value = withTiming(1, { duration: 140 });
      }}
      onHoverOut={() => {
        hover.value = withTiming(0, { duration: 160 });
      }}
      onPressIn={() => {
        press.value = withSpring(1, { damping: 18, stiffness: 300 });
      }}
      onPressOut={() => {
        press.value = withSpring(0, { damping: 18, stiffness: 300 });
      }}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={`${item.title}, ${item.count} trips`}
      style={[styles.cardPressable, styles.flexSmall]}
    >
      <Animated.View
        style={[
          styles.card,
          active ? styles.cardActive : styles.cardIdle,
          dueAttention && !active && styles.cardDueAttention,
          active ? CARD_SHADOW_ACTIVE : CARD_SHADOW,
          cardAnim,
        ]}
      >
        <View
          style={[
            StyleSheet.absoluteFill,
            active ? styles.cardActiveBg : styles.cardIdleBg,
          ]}
        />

        <View
          style={[
            styles.cornerBlob,
            { backgroundColor: active ? "#ffffff" : blobColor },
            active ? styles.cornerBlobActiveDark : null,
          ]}
          pointerEvents="none"
        />

        <View style={[styles.cardBody, styles.cardBodySmall]}>
          <View style={styles.countRow}>
            <Text
              style={[
                styles.count,
                styles.countSmall,
                active && styles.countActive,
                isZero && !active && styles.countZero,
              ]}
            >
              {item.count}
            </Text>
            {item.showsAmount ? (
              <Text
                style={[
                  styles.historyAmount,
                  active
                    ? styles.historyAmountActive
                    : styles.historyAmountIdle,
                  !active && item.amount > 0 && styles.historyAmountDue,
                ]}
                numberOfLines={1}
              >
                {formatINRChip(item.amount)}
              </Text>
            ) : (
              <View
                style={[
                  styles.iconOrb,
                  active
                    ? {
                        backgroundColor: BENTO_ACTIVE_ICON_WASH,
                        borderColor: BENTO_ACTIVE_ICON_RING,
                      }
                    : {
                        backgroundColor: `${blobColor}18`,
                        borderColor: `${blobColor}30`,
                      },
                ]}
              >
                <FontAwesome
                  name={historyMetricIcon(item.id)}
                  size={10}
                  color={blobColor}
                />
              </View>
            )}
          </View>
          <View style={styles.labelBlock}>
            <Text
              style={[
                styles.label,
                active ? styles.labelActive : styles.labelIdle,
              ]}
              numberOfLines={2}
            >
              {item.title}
            </Text>
            <Text
              style={[
                styles.sub,
                active ? styles.subActive : styles.subIdle,
              ]}
              numberOfLines={2}
            >
              {item.subtitle}
            </Text>
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );
}

export type TripsHubHistoryBentoMetricsProps = {
  metricOrder: HistoryTripMetricId[];
  activeMetricTab: HistoryTripMetricId | null;
  onSelectMetric: (id: HistoryTripMetricId | null) => void;
  getMetric: (id: HistoryTripMetricId) => {
    count: number;
    amount: number;
    title: string;
    hint: string;
  };
  isDesktop: boolean;
  style?: StyleProp<ViewStyle>;
};

export function TripsHubHistoryBentoMetrics({
  metricOrder,
  activeMetricTab,
  onSelectMetric,
  getMetric,
  isDesktop,
  style,
}: TripsHubHistoryBentoMetricsProps) {
  const items: HistoryBentoMetricItem[] = metricOrder.map((id) => {
    const meta = HISTORY_VARIANT[id];
    const m = getMetric(id);
    return {
      id,
      count: m.count,
      amount: m.amount,
      title: m.title,
      subtitle: m.hint,
      variant: meta.variant,
      showsAmount: meta.showsAmount,
    };
  });

  const renderCard = (item: HistoryBentoMetricItem) => (
    <HistoryBentoMetricCard
      key={item.id}
      item={item}
      active={activeMetricTab === item.id}
      onPress={() =>
        onSelectMetric(activeMetricTab === item.id ? null : item.id)
      }
    />
  );

  const financeItems = items.filter(
    (item) =>
      item.id === "due_to_get" ||
      item.id === "no_due_to_get" ||
      item.id === "due_to_pay" ||
      item.id === "no_due_to_pay",
  );
  const podItems = items.filter(
    (item) => item.id === "pending_soft_pod" || item.id === "pending_hard_pod",
  );

  if (!isDesktop) {
    // Few tiles (e.g. Ground Ops: POD only) share the width instead of scrolling.
    if (items.length <= 2) {
      return (
        <View style={[styles.hub, style]}>
          <View style={styles.historyFillRow}>
            {items.map((item) => (
              <View key={item.id} style={styles.historyFillCell}>
                {renderCard(item)}
              </View>
            ))}
          </View>
        </View>
      );
    }
    return (
      <View style={[styles.hub, style]}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.mobileScroll}
        >
          {items.map(renderCard)}
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={[styles.hub, style]}>
      <View style={styles.historyClusters}>
        {financeItems.length > 0 ? (
          <View style={[styles.historyCluster, styles.historyClusterFinance]}>
            {financeItems.map(renderCard)}
          </View>
        ) : null}
        {podItems.length > 0 ? (
          <View style={[styles.historyCluster, styles.historyClusterPod]}>
            {podItems.map(renderCard)}
          </View>
        ) : null}
      </View>
    </View>
  );
}

/** @deprecated Use TripsHubBentoMetrics — kept for history tab rails if needed. */
export function TripsHubMetricGroupRail({
  children,
  style,
}: {
  children: ReactNode;
  isLargeScreen?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.legacyRail, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  hub: {
    width: "100%" as const,
    marginBottom: 0,
  },
  bentoRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "stretch",
    gap: 6,
    width: "100%" as const,
  },
  historyClusters: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "stretch",
    gap: 10,
    width: "100%" as const,
  },
  historyCluster: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 6,
    minWidth: 0,
  },
  historyClusterFinance: {
    flex: 2,
  },
  historyClusterPod: {
    flex: 1,
  },
  historyFillRow: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 6,
    width: "100%" as const,
  },
  historyFillCell: {
    flex: 1,
    minWidth: 0,
  },
  mobileScroll: {
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 2,
    paddingBottom: 2,
  },
  flexLarge: {
    flexGrow: 1.15,
    flexShrink: 1,
    flexBasis: 148,
    minWidth: 148,
  },
  flexSmall: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 156,
    minWidth: 148,
  },
  cardPressable: {
    minHeight: 76,
    alignSelf: "stretch",
  },
  card: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
    minHeight: 76,
  },
  cardLarge: {
    minHeight: 80,
  },
  cardIdle: {
    borderColor: Theme.borderLight,
  },
  cardActive: {
    borderColor: BENTO_ACTIVE_BORDER,
    zIndex: 1,
  },
  cardIdleBg: {
    backgroundColor: Theme.cardWhite,
  },
  cardActiveBg: {
    backgroundColor: BENTO_ACTIVE_BG,
  },
  cornerBlob: {
    position: "absolute",
    top: 0,
    right: 0,
    width: 44,
    height: 44,
    borderBottomLeftRadius: 44,
    opacity: 0.07,
  },
  cornerBlobActiveDark: {
    opacity: 0.06,
  },
  cardBody: {
    flex: 1,
    justifyContent: "space-between",
    zIndex: 1,
    minWidth: 0,
  },
  cardBodyLarge: {
    paddingHorizontal: 11,
    paddingTop: 9,
    paddingBottom: 8,
  },
  cardBodySmall: {
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 8,
  },
  countRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
    marginBottom: 4,
    minHeight: 22,
  },
  count: {
    fontWeight: "700",
    fontStyle: "normal",
    color: Theme.textPrimaryDark,
    fontVariant: ["tabular-nums"],
    flexShrink: 1,
    minWidth: 0,
  },
  countLarge: {
    fontSize: FS_COUNT_LARGE,
    lineHeight: FS_COUNT_LARGE + 2,
    letterSpacing: -0.2,
  },
  countSmall: {
    fontSize: FS_COUNT_SMALL,
    lineHeight: FS_COUNT_SMALL + 2,
    letterSpacing: -0.15,
  },
  countActive: {
    color: Theme.textOnDark,
  },
  countZero: {
    color: Theme.textMuted,
  },
  iconOrb: {
    width: 24,
    height: 24,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    flexShrink: 0,
  },
  labelBlock: {
    gap: 2,
    minWidth: 0,
    width: "100%" as const,
  },
  label: {
    fontSize: FS_CAPTION,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0,
    lineHeight: FS_CAPTION + 4,
  },
  labelPlain: {
    textTransform: "none",
    fontWeight: "700",
    fontSize: 11,
    lineHeight: 14,
  },
  labelIdle: {
    color: Theme.textMuted,
  },
  labelActive: {
    color: Theme.textOnDark,
  },
  sub: {
    fontSize: FS_AMOUNT_LABEL,
    fontWeight: "500",
    letterSpacing: 0,
    lineHeight: FS_AMOUNT_LABEL + 4,
  },
  subIdle: {
    color: Theme.textSecondary,
  },
  subActive: {
    color: Theme.textOnDarkMuted,
  },
  historyAmount: {
    fontSize: FS_CAPTION + 1,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
    flexShrink: 1,
    minWidth: 0,
    maxWidth: "48%",
    textAlign: "right" as const,
    letterSpacing: -0.2,
    lineHeight: FS_CAPTION + 4,
  },
  historyAmountIdle: {
    color: Theme.textSecondary,
  },
  historyAmountActive: {
    color: Theme.textOnDark,
  },
  historyAmountDue: {
    color: Theme.teslaRed,
  },
  cardDueAttention: {
    borderColor: Theme.teslaRed,
    borderWidth: 1,
  },
  legacyRail: {
    flexDirection: "row",
    gap: 8,
    alignItems: "stretch",
  },
  legacyGroupLabel: {
    fontSize: 8,
    fontWeight: "600",
    color: Theme.networkSectionLabel,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 5,
  },
});

export const tripsHubMetricGroupLabelStyle = styles.legacyGroupLabel;
