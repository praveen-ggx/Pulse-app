/**
 * One pooled Network bid in Get Load → My Bids: the lane this org quoted one
 * rate on, with its rate and how each member quote stands. Like the Network
 * Loads pool card it carries no party identity — no shipper name, avatar,
 * indent number or facepile. Pressing the card opens the pool. Revising
 * the bid happens on the loads inside it.
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
  describeNetworkBidStates,
  NETWORK_BID_STATE_LABEL,
  type NetworkBidMemberState,
  type NetworkBidPool,
} from "@/features/network/utils/networkBidPools.util";
import type { NetworkPoolLoad } from "@/features/network/utils/networkLoadPools.util";
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
  showViewAction = true,
  onViewPool,
}: {
  pool: NetworkBidPool<NetworkPoolLoad>;
  showViewAction?: boolean;
  onViewPool?: () => void;
}) {
  const count = pool.members.length;
  const loadsLabel = plural(count, "load");
  const vehicle = titleCaseWord(pool.key.vehicleType);
  const rate = rateRange(pool.rateMin, pool.rateMax);
  const window = pickupWindow(pool.earliestPickup, pool.latestPickup);
  const weight = vehicleTonnage(pool.weightKgMin, pool.weightKgMax);
  const states = describeNetworkBidStates(pool.stateCounts);
  const tone = pool.uniformState ? STATE_TONE[pool.uniformState] : null;
  const pillText = pool.uniformState
    ? NETWORK_BID_STATE_LABEL[pool.uniformState]
    : "mixed";
  const facts = [
    { label: "Vehicle", value: vehicle || "—" },
    { label: "Tonnage", value: weight ?? "—" },
    { label: "Pickup", value: window ?? "—" },
  ];

  const label = `Network pool bid, ${pool.key.pickup} to ${pool.key.drop}, ${vehicle}, ${loadsLabel}, ${states}`;
  const opensDetail = showViewAction && onViewPool != null;

  const body = (
    <View
      style={styles.card}
      testID={`network-bid-pool-${pool.id}`}
      accessibilityLabel={opensDetail ? undefined : label}
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

      <MarketplaceRouteGrid pickup={pool.key.pickup} drop={pool.key.drop} />

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
        <Text style={bidStyles.states} numberOfLines={2}>
          {states}
        </Text>
      </View>
    </View>
  );

  if (!opensDetail || !onViewPool) return body;

  return (
    <Pressable
      onPress={onViewPool}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [bidStyles.hit, pressed && bidStyles.pressed]}
    >
      {body}
    </Pressable>
  );
}

const bidStyles = StyleSheet.create({
  statePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    flexShrink: 0,
  },
  statePillText: { fontSize: 9, fontWeight: "700", letterSpacing: 0.3 },
  states: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textSecondary,
  },
  hit: { alignSelf: "stretch" },
  pressed: { opacity: 0.92 },
});
