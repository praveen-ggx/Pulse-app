/**
 * One Network pool in Get Load → Network Loads: the open loads on one
 * canonical lane, from any number of shippers. The pool shows the lane and
 * the load facts only — no party identity and no relationship facepile; the
 * indents (with their detail) open from "View N indents".
 * One rate is quoted for the whole pool.
 */
import Theme from "@/constants/Theme";
import {
  MarketplaceRouteGrid,
  titleCaseWord,
} from "@/features/network/components/MarketplaceLoadCardChrome";
import type {
  NetworkLoadPool,
  NetworkPoolLoad,
} from "@/features/network/utils/networkLoadPools.util";
import { formatStoryDate } from "@/features/network/utils/storyDisplay";
import { formatINR } from "@/lib/format";
import { ChevronRight, Layers } from "lucide-react-native";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";

export function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

export function rateRange(min: number | null, max: number | null): string | null {
  if (min == null || max == null) return null;
  return min === max ? formatINR(min) : `${formatINR(min)} – ${formatINR(max)}`;
}

export function pickupWindow(from: string | null, to: string | null): string | null {
  if (!from) return null;
  if (!to || to === from) return formatStoryDate(from);
  return `${formatStoryDate(from)} – ${formatStoryDate(to)}`;
}

export function tonnage(kg: number | null): string | null {
  if (kg == null || kg <= 0) return null;
  const t = Math.round((kg / 1000) * 10) / 10;
  if (t < 0.1) return `${Math.round(kg)} kg`;
  return `${t % 1 === 0 ? t.toFixed(0) : t} t`;
}

/** Capacity of one vehicle in the pool. Equal capacities render once. */
export function vehicleTonnage(minKg: number | null, maxKg: number | null): string | null {
  const min = tonnage(minKg);
  const max = tonnage(maxKg);
  if (min == null) return max;
  if (max == null || min === max) return min;
  return `${min} – ${max}`;
}

export function NetworkLoadPoolCard({
  pool,
  canQuote,
  showIndentsAction = true,
  onQuote,
  onViewIndents,
  viaStops = [],
}: {
  pool: NetworkLoadPool<NetworkPoolLoad>;
  canQuote: boolean;
  showIndentsAction?: boolean;
  onQuote: () => void;
  onViewIndents?: () => void;
  viaStops?: readonly string[];
}) {
  const count = pool.members.length;
  const loadsLabel = plural(count, "load");
  const vehicle = titleCaseWord(pool.key.vehicleType);
  const target = rateRange(pool.targetRateMin, pool.targetRateMax);
  const window = pickupWindow(pool.earliestPickup, pool.latestPickup);
  const weight = vehicleTonnage(pool.weightKgMin, pool.weightKgMax);
  const facts = [
    { label: "Vehicle", value: vehicle || "—" },
    { label: "Tonnage", value: weight ?? "—" },
    { label: "Pickup", value: window ?? "—" },
  ];

  return (
    <View
      style={styles.card}
      testID={`network-pool-${pool.id}`}
      accessibilityLabel={`Network pool, ${pool.key.pickup} to ${pool.key.drop}, ${vehicle}, ${loadsLabel}`}
    >
      <View style={styles.top}>
        <View style={styles.tag}>
          <Layers size={12} color={Theme.primary} strokeWidth={2.4} />
          <Text style={styles.tagText}>NETWORK POOL</Text>
          <View style={styles.countPill}>
            <Text style={styles.countPillText}>{loadsLabel.toUpperCase()}</Text>
          </View>
        </View>
        {showIndentsAction && onViewIndents ? (
          <Pressable
            onPress={onViewIndents}
            style={styles.view}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={`View ${plural(count, "indent")} in this pool`}
          >
            <Text style={styles.viewText}>View {plural(count, "indent")}</Text>
            <ChevronRight size={12} color={Theme.primary} strokeWidth={2.4} />
          </Pressable>
        ) : null}
      </View>

      <MarketplaceRouteGrid
        pickup={pool.key.pickup}
        drop={pool.key.drop}
        viaStops={viaStops}
      />

      <View style={styles.facts}>
        {facts.map((f, i) => (
          <View
            key={f.label}
            style={[styles.fact, i > 0 && styles.factDivider]}
            accessible
            accessibilityLabel={`${f.label}: ${f.value}`}
          >
            <Text style={styles.factLabel} numberOfLines={1}>
              {f.label}
            </Text>
            <Text style={styles.factValue} numberOfLines={1}>
              {f.value}
            </Text>
          </View>
        ))}
      </View>

      {target ? (
        <View style={styles.target}>
          <Text style={styles.targetLabel}>
            {count > 1 ? "Target per load" : "Target rate"}
          </Text>
          <Text style={styles.targetValue} numberOfLines={1}>
            {target}
          </Text>
        </View>
      ) : null}

      <View style={styles.footer}>
        <View style={styles.footerLeft} />
        <Pressable
          onPress={onQuote}
          disabled={!canQuote}
          style={[styles.cta, !canQuote && styles.ctaDisabled]}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canQuote }}
          accessibilityLabel={`Quote for pool, ${loadsLabel}`}
        >
          <Text style={styles.ctaText}>Quote for pool</Text>
        </Pressable>
      </View>
    </View>
  );
}

export const networkPoolCardStyles = StyleSheet.create({
  card: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    padding: 14,
    backgroundColor: Theme.cardWhite,
    gap: 12,
    overflow: "hidden",
    ...Platform.select({
      web: { boxShadow: `0 6px 16px ${Theme.actionAccentShadow}` } as object,
      default: {
        shadowColor: Theme.primaryText,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 6,
        elevation: 2,
      },
    }),
  },
  top: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  tag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minWidth: 0,
    flexShrink: 1,
  },
  tagText: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.6,
    color: Theme.primary,
  },
  countPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: Theme.brandBlueSoft,
  },
  countPillText: {
    fontSize: 9.5,
    fontWeight: "800",
    letterSpacing: 0.4,
    color: Theme.primary,
  },
  view: { flexDirection: "row", alignItems: "center", gap: 1 },
  viewText: { fontSize: 11, fontWeight: "700", color: Theme.primary },

  facts: {
    flexDirection: "row",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    backgroundColor: Theme.whiteMuted,
  },
  fact: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 8,
    paddingHorizontal: 10,
    gap: 2,
  },
  factDivider: {
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: Theme.borderInput,
  },
  factLabel: {
    fontSize: 9.5,
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: Theme.textMuted,
  },
  factValue: { fontSize: 12, fontWeight: "700", color: Theme.textPrimaryDark },

  target: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 8,
  },
  targetLabel: {
    fontSize: 9.5,
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: Theme.textMuted,
  },
  targetValue: {
    flexShrink: 1,
    fontSize: 16,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
  },

  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderInput,
  },
  footerLeft: { flex: 1, minWidth: 0 },
  cta: {
    paddingHorizontal: 16,
    minHeight: 36,
    justifyContent: "center",
    borderRadius: 999,
    backgroundColor: Theme.buttonPrimary,
    borderWidth: Theme.buttonPrimaryBorderWidth,
    borderColor: Theme.buttonPrimaryBorder,
  },
  ctaDisabled: { opacity: 0.45 },
  ctaText: { fontSize: 12, fontWeight: "700", color: Theme.buttonPrimaryText },
});
const styles = networkPoolCardStyles;
