/**
 * Marketplace Loads → My Bids pooled card. Same chrome as NetworkBidPoolCard /
 * NetworkLoadPoolCard: anonymous lane, status pill, your rate — no shipper
 * name, avatar, or indent id (those stay on Awarded after fee unlock).
 */
import Theme from "@/constants/Theme";
import {
  MarketplaceRouteGrid,
  titleCaseWord,
} from "@/features/network/components/MarketplaceLoadCardChrome";
import {
  networkPoolCardStyles as styles,
  pickupWindow,
  plural,
  rateRange,
} from "@/features/network/components/pooled/NetworkLoadPoolCard";
import type { MarketplaceBidPool } from "@/features/network/utils/marketplaceBidPools.util";
import type { MyOrgMarketBidStatus } from "@/features/network/services/findLoadsForOrg.service";
import { Layers } from "lucide-react-native";
import { Platform, StyleSheet, Text, useWindowDimensions, View } from "react-native";

const STATUS_TONE: Record<
  MyOrgMarketBidStatus,
  { bg: string; fg: string; label: string }
> = {
  pending: { bg: Theme.warningMuted, fg: Theme.warning, label: "PENDING" },
  accepted: { bg: Theme.positiveMuted, fg: Theme.positive, label: "AWARDED" },
  rejected: { bg: Theme.surface, fg: Theme.textSecondary, label: "NOT SELECTED" },
  withdrawn: { bg: Theme.surface, fg: Theme.textMuted, label: "WITHDRAWN" },
  superseded: { bg: Theme.surface, fg: Theme.textMuted, label: "SUPERSEDED" },
};

export function MarketplaceBidPoolCard({ pool }: { pool: MarketplaceBidPool }) {
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === "web" && width >= 1024;
  const count = pool.members.length;
  const loadsLabel = plural(count, "load");
  const commodity = titleCaseWord(pool.loadType) || "—";
  const window = pickupWindow(pool.earliestPickup, pool.latestPickup);
  const rate = rateRange(
    pool.rateMin > 0 ? pool.rateMin : null,
    pool.rateMax > 0 ? pool.rateMax : null,
  );
  const tone = pool.uniformStatus
    ? STATUS_TONE[pool.uniformStatus]
    : { bg: Theme.surface, fg: Theme.textSecondary, label: "MIXED" };
  const facts = [
    { label: "Commodity", value: commodity },
    { label: "Loads", value: String(count) },
    { label: "Pickup", value: window ?? "—" },
  ];
  const pendingCount = pool.members.filter((m) => m.status === "pending").length;
  const footerLine =
    pool.uniformStatus === "pending"
      ? plural(pendingCount, "pending")
      : tone.label.toLowerCase();

  return (
    <View
      style={[styles.card, isDesktop && pillStyles.cardDesktop]}
      testID={`marketplace-bid-pool-${pool.id}`}
      accessibilityLabel={`Marketplace pool bid, ${pool.pickup} to ${pool.drop}, ${loadsLabel}, ${tone.label}`}
    >
      <View style={styles.top}>
        <View style={styles.tag}>
          <Layers size={12} color={Theme.primary} strokeWidth={2.4} />
          <Text style={styles.tagText}>POOLED</Text>
          <View style={styles.countPill}>
            <Text style={styles.countPillText}>{loadsLabel.toUpperCase()}</Text>
          </View>
        </View>
        <View style={[pillStyles.statePill, { backgroundColor: tone.bg }]}>
          <Text
            style={[pillStyles.statePillText, { color: tone.fg }]}
            numberOfLines={1}
          >
            {tone.label}
          </Text>
        </View>
      </View>

      <MarketplaceRouteGrid pickup={pool.pickup} drop={pool.drop} />

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

      <View style={styles.target}>
        <Text style={styles.targetLabel}>
          {count > 1 ? "Your rate per load" : "Your rate"}
        </Text>
        <Text style={styles.targetValue} numberOfLines={1}>
          {rate ?? "—"}
        </Text>
      </View>

      <View style={styles.footer}>
        <View style={styles.footerLeft}>
          <Text style={pillStyles.states} numberOfLines={1}>
            {footerLine}
          </Text>
        </View>
      </View>
    </View>
  );
}

const pillStyles = StyleSheet.create({
  cardDesktop: {
    width: "calc((100% - 36px) / 4)" as unknown as number,
    maxWidth: "calc((100% - 36px) / 4)" as unknown as number,
    minWidth: 0,
    flexGrow: 0,
    flexShrink: 0,
    ...Platform.select({
      web: { boxSizing: "border-box" } as object,
      default: {},
    }),
  },
  statePill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    flexShrink: 0,
    justifyContent: "center",
  },
  statePillText: {
    fontSize: 8,
    fontWeight: "600",
    letterSpacing: 0,
    lineHeight: 11,
  },
  states: {
    fontSize: 11,
    fontWeight: "500",
    letterSpacing: 0,
    color: Theme.textSecondary,
  },
});
