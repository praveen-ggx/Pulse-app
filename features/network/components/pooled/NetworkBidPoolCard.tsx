/**
 * One pooled Network bid in Get Load → My Bids. Same card chrome as
 * NetworkLoadPoolCard (size, gap, facts, rate row, footer CTA).
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
  vehicleTonnage,
} from "@/features/network/components/pooled/NetworkLoadPoolCard";
import {
  NETWORK_BID_STATE_LABEL,
  type NetworkBidMemberState,
  type NetworkBidPool,
} from "@/features/network/utils/networkBidPools.util";
import type { NetworkPoolLoad } from "@/features/network/utils/networkLoadPools.util";
import {
  describePoolCommitPending,
  usePoolCommitPreview,
} from "@/features/network/utils/networkPoolCommitPreview.util";
import { Layers } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";

const STATE_TONE: Record<NetworkBidMemberState, { bg: string; fg: string }> = {
  pending: { bg: Theme.warningMuted, fg: Theme.warning },
  countered: { bg: Theme.brandBlueSoft, fg: Theme.primary },
  agreed: { bg: Theme.brandBlueSoft, fg: Theme.primary },
  accepted: { bg: Theme.positiveMuted, fg: Theme.positive },
  rejected: { bg: Theme.surface, fg: Theme.textSecondary },
  closed: { bg: Theme.surface, fg: Theme.textMuted },
};

export function NetworkBidPoolCard({
  pool,
  onReviseBid,
  viaStops = [],
}: {
  pool: NetworkBidPool<NetworkPoolLoad>;
  onReviseBid?: () => void;
  viaStops?: readonly string[];
}) {
  const count = pool.members.length;
  const loadsLabel = plural(count, "load");
  const vehicle = titleCaseWord(pool.key.vehicleType);
  const rate = rateRange(pool.rateMin, pool.rateMax);
  const window = pickupWindow(pool.earliestPickup, pool.latestPickup);
  const weight = vehicleTonnage(pool.weightKgMin, pool.weightKgMax);
  const tone = pool.uniformState ? STATE_TONE[pool.uniformState] : null;
  const pillText = pool.uniformState
    ? NETWORK_BID_STATE_LABEL[pool.uniformState]
    : "mixed";
  const facts = [
    { label: "Vehicle", value: vehicle || "—" },
    { label: "Tonnage", value: weight ?? "—" },
    { label: "Pickup", value: window ?? "—" },
  ];
  const commit = usePoolCommitPreview(pool.id);
  const pendingLine = describePoolCommitPending(
    commit,
    pool.stateCounts.pending ?? 0,
  );
  const label = `Network pool bid, ${pool.key.pickup} to ${pool.key.drop}, ${vehicle}, ${loadsLabel}, ${pendingLine}`;

  return (
    <View
      style={styles.card}
      testID={`network-bid-pool-${pool.id}`}
      accessibilityLabel={label}
    >
      <View style={styles.top}>
        <View style={styles.tag}>
          <Layers size={12} color={Theme.primary} strokeWidth={2.4} />
          <Text style={styles.tagText}>NETWORK POOL</Text>
          <View style={styles.countPill}>
            <Text style={styles.countPillText}>{loadsLabel.toUpperCase()}</Text>
          </View>
        </View>
        <View
          style={[
            bidStyles.statePill,
            { backgroundColor: tone?.bg ?? Theme.surface },
          ]}
        >
          <Text
            style={[bidStyles.statePillText, { color: tone?.fg ?? Theme.textSecondary }]}
            numberOfLines={1}
          >
            {pillText.toUpperCase()}
          </Text>
        </View>
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
          <Text
            style={bidStyles.states}
            numberOfLines={1}
            accessibilityLabel={
              commit
                ? `${pendingLine}, until ${commit.validUntilDate}`
                : pendingLine
            }
          >
            {pendingLine}
          </Text>
        </View>
        {onReviseBid ? (
          <Pressable
            onPress={onReviseBid}
            style={styles.cta}
            accessibilityRole="button"
            accessibilityLabel={`Revise bid, ${loadsLabel}`}
          >
            <Text style={styles.ctaText}>Revise bid</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const bidStyles = StyleSheet.create({
  statePill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    flexShrink: 0,
    justifyContent: "center",
  },
  statePillText: { fontSize: 8, fontWeight: "600", letterSpacing: 0, lineHeight: 11 },
  states: {
    fontSize: 11,
    fontWeight: "500",
    letterSpacing: 0,
    color: Theme.textSecondary,
  },
});
