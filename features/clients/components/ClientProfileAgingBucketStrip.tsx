/**
 * Receivable aging — segmented filter strip (tap bucket to filter AR).
 */
import Theme from "@/constants/Theme";
import type {
  AgingBucketKey,
  ClientPaymentAging,
} from "@/features/clients/components/analytics/clientAnalyticsUtils";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

export const AGING_BUCKET_CARDS: Array<{
  key: AgingBucketKey;
  short: string;
  label: string;
  color: string;
  tint: string;
}> = [
  {
    key: "bucket0_30",
    short: "0–30",
    label: "0-30 days",
    color: "#17C653",
    tint: "rgba(23, 198, 83, 0.08)",
  },
  {
    key: "bucket31_60",
    short: "31–60",
    label: "31-60 days",
    color: "#F6C000",
    tint: "rgba(246, 192, 0, 0.10)",
  },
  {
    key: "bucket61_90",
    short: "61–90",
    label: "61-90 days",
    color: "#FF6F1E",
    tint: "rgba(255, 111, 30, 0.10)",
  },
  {
    key: "bucket90Plus",
    short: "90+",
    label: "90+ days",
    color: "#F1416C",
    tint: "rgba(241, 65, 108, 0.10)",
  },
];

type Props = {
  aging: ClientPaymentAging;
  selected: AgingBucketKey | null;
  onChange: (next: AgingBucketKey | null) => void;
  /** Optional trip counts per bucket for denser meta. */
  tripCounts?: Partial<Record<AgingBucketKey, number>>;
  compact?: boolean;
  /** Default: Receivable aging. Use Payable aging for suppliers. */
  title?: string;
};

function formatInr(n: number): string {
  const abs = Math.abs(Math.round(n));
  if (abs >= 10_00_000) {
    return `₹${(abs / 10_00_000).toFixed(1).replace(/\.0$/, "")}L`;
  }
  return `₹${abs.toLocaleString("en-IN")}`;
}

export function ClientProfileAgingBucketStrip({
  aging,
  selected,
  onChange,
  tripCounts,
  compact = false,
  title = "Receivable aging",
}: Props) {
  const total = Math.max(0, aging.outstanding);
  const activeCard = AGING_BUCKET_CARDS.find((c) => c.key === selected) ?? null;
  const emptyLabel = /payable/i.test(title)
    ? "No open payables"
    : "No open receivables";

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <View style={styles.headLeft}>
          <View style={styles.headIcon}>
            <FontAwesome name="clock-o" size={11} color={Theme.textRouteCard} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.title, compact && styles.titleSm]} numberOfLines={1}>
              {title}
            </Text>
            <Text style={styles.subtitle} numberOfLines={compact ? 2 : 1}>
              {total > 0
                ? `${formatInr(total)} open across ${aging.totalOverdueTrips} trip${aging.totalOverdueTrips === 1 ? "" : "s"}`
                : emptyLabel}
            </Text>
          </View>
        </View>
        {selected && activeCard ? (
          <Pressable
            onPress={() => onChange(null)}
            style={[styles.clearBtn, { borderColor: activeCard.color }]}
            hitSlop={6}
          >
            <Text style={[styles.clearText, { color: activeCard.color }]}>
              {activeCard.short}
            </Text>
            <FontAwesome name="times" size={9} color={activeCard.color} />
          </Pressable>
        ) : (
          <Text style={styles.hint}>Tap to filter</Text>
        )}
      </View>

      {(() => {
        const stripCells = AGING_BUCKET_CARDS.map((card, index) => {
          const amount = aging[card.key];
          const active = selected === card.key;
          const muted = !active && selected != null;
          const share = total > 0 ? Math.min(100, Math.round((amount / total) * 100)) : 0;
          const trips = tripCounts?.[card.key] ?? 0;
          const isLast = index === AGING_BUCKET_CARDS.length - 1;

          return (
            <Pressable
              key={card.key}
              onPress={() => onChange(active ? null : card.key)}
              style={[
                styles.cell,
                compact && styles.cellCompactScroll,
                !isLast && styles.cellDivider,
                active && { backgroundColor: card.tint },
                muted && styles.cellMuted,
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${card.label}, ${formatInr(amount)}. ${active ? "Selected, tap to clear" : "Tap to filter"}`}
            >
              <View style={[styles.rail, { backgroundColor: card.color }]} />
              <View style={styles.cellBody}>
                <View style={styles.cellTop}>
                  <Text
                    style={[
                      styles.cellLabel,
                      compact && styles.cellLabelSm,
                      active && { color: card.color },
                    ]}
                    numberOfLines={1}
                  >
                    {card.short}
                  </Text>
                  {active ? (
                    <FontAwesome name="check-circle" size={10} color={card.color} />
                  ) : null}
                </View>
                <Text
                  style={[
                    styles.cellValue,
                    compact && styles.cellValueSm,
                    { color: amount > 0 || active ? card.color : Theme.textMuted },
                  ]}
                  numberOfLines={1}
                >
                  {formatInr(amount)}
                </Text>
                <Text style={[styles.cellMeta, compact && styles.cellMetaSm]} numberOfLines={1}>
                  {trips > 0 ? `${trips} trip${trips === 1 ? "" : "s"}` : card.label}
                </Text>
                <View style={styles.shareTrack}>
                  <View
                    style={[
                      styles.shareFill,
                      {
                        width: `${share}%`,
                        backgroundColor: card.color,
                        opacity: amount > 0 ? 0.9 : 0.25,
                      },
                    ]}
                  />
                </View>
              </View>
            </Pressable>
          );
        });

        // Compact: keep the same single-row strip as desktop, scroll horizontally
        // so cells don't crush into a clustered 2×2 grid.
        if (compact) {
          return (
            <ScrollView
              horizontal
              nestedScrollEnabled
              showsHorizontalScrollIndicator
              style={styles.stripScroll}
              contentContainerStyle={styles.stripScrollContent}
            >
              <View style={[styles.strip, styles.stripCompactScroll]}>
                {stripCells}
              </View>
            </ScrollView>
          );
        }

        return <View style={styles.strip}>{stripCells}</View>;
      })()}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    backgroundColor: Theme.cardWhite,
    overflow: "hidden",
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderInput,
    backgroundColor: Theme.surfaceGray,
  },
  headLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  headIcon: {
    width: 24,
    height: 24,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.borderInput,
  },
  title: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  titleSm: { fontSize: 10 },
  subtitle: {
    marginTop: 1,
    fontSize: 9,
    fontWeight: "500",
    color: Theme.textMuted,
  },
  hint: {
    fontSize: 9,
    fontWeight: "600",
    color: Theme.textMuted,
    flexShrink: 0,
  },
  clearBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: Theme.cardWhite,
    minHeight: 26,
    flexShrink: 0,
  },
  clearText: {
    fontSize: 9,
    fontWeight: "700",
  },
  strip: {
    flexDirection: "row",
    alignItems: "stretch",
    minHeight: 86,
  },
  stripScroll: {
    width: "100%",
    maxWidth: "100%",
    alignSelf: "stretch",
  },
  // flexGrow:1 collapses horizontal scroll width on web — keep content-sized.
  stripScrollContent: {
    flexGrow: 0,
    paddingRight: 12,
    alignItems: "flex-start",
  },
  stripCompactScroll: {
    width: 600,
    minWidth: 600,
    minHeight: 86,
    flexGrow: 0,
    flexShrink: 0,
    alignSelf: "flex-start",
  },
  cell: {
    flex: 1,
    flexDirection: "row",
    minWidth: 0,
    paddingVertical: 8,
    paddingRight: 8,
  },
  cellCompactScroll: {
    width: 150,
    minWidth: 150,
    flexGrow: 0,
    flexShrink: 0,
    minHeight: 86,
  },
  cellDivider: {
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: Theme.borderInput,
  },
  cellMuted: {
    opacity: 0.45,
  },
  rail: {
    width: 3,
    borderRadius: 2,
    marginRight: 8,
    marginLeft: 0,
    alignSelf: "stretch",
  },
  cellBody: {
    flex: 1,
    minWidth: 0,
    gap: 3,
    justifyContent: "center",
  },
  cellTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 4,
  },
  cellLabel: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textRouteCard,
    letterSpacing: 0.2,
  },
  cellLabelSm: { fontSize: 8 },
  cellValue: {
    fontSize: 13,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
    color: Theme.textPrimaryDark,
  },
  cellValueSm: { fontSize: 12 },
  cellMeta: {
    fontSize: 8,
    fontWeight: "500",
    color: Theme.textMuted,
  },
  cellMetaSm: { fontSize: 7 },
  shareTrack: {
    marginTop: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: Theme.borderInput,
    overflow: "hidden",
  },
  shareFill: {
    height: "100%",
    borderRadius: 2,
  },
});
