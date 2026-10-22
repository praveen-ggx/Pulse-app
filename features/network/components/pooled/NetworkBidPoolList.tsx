/**
 * Get Load → My Bids with Network quotes grouped back into their Indent Pools.
 * A pooled quote is one direct_quotes row per member indent; the list shows
 * one anonymous card per pool. Opened pools stay on that card (pool bidding
 * only — no indent summary). Sponsored Reach and incomplete-lane loads were
 * quoted individually and keep their card.
 *
 * Pools are built from every quoted load so a shown pool is always whole;
 * `shownLoads` (search) only decides which pools and cards appear.
 */
import Theme from "@/constants/Theme";
import { NetworkBidPoolCard } from "@/features/network/components/pooled/NetworkBidPoolCard";
import type { IndentRow } from "@/features/indents/services/indents.service";
import {
  buildNetworkBidPools,
  type NetworkBidPool,
  type NetworkBidQuote,
} from "@/features/network/utils/networkBidPools.util";
import { viaStopLocationsForMemberIds } from "@/features/trips/utils/routeExtraStops.util";
import { ChevronLeft } from "lucide-react-native";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

export function NetworkBidPoolList({
  quotedLoads,
  shownLoads,
  quoteByIndentId,
  isPoolable,
  renderIndividualCard,
  renderPoolMemberCard: _renderPoolMemberCard,
  onViewPool,
  onRevisePool,
  viaStopsByIndentId,
}: {
  quotedLoads: readonly IndentRow[];
  shownLoads: readonly IndentRow[];
  quoteByIndentId: ReadonlyMap<string, NetworkBidQuote>;
  isPoolable: (load: IndentRow) => boolean;
  /** Existing individual card (sponsored Reach, incomplete lane). */
  renderIndividualCard: (load: IndentRow) => ReactNode;
  /** Kept for callers; opened My Bids pools no longer list member indents. */
  renderPoolMemberCard: (load: IndentRow) => ReactNode;
  /** Opens the pool elsewhere (desktop column view) instead of inline. */
  onViewPool?: (pool: NetworkBidPool<IndentRow>) => void;
  onRevisePool?: (pool: NetworkBidPool<IndentRow>) => void;
  viaStopsByIndentId?: ReadonlyMap<string, readonly string[]>;
}) {
  const [openPoolId, setOpenPoolId] = useState<string | null>(null);

  const { pools, individual } = useMemo(
    () => buildNetworkBidPools([...quotedLoads], quoteByIndentId, isPoolable),
    [quotedLoads, quoteByIndentId, isPoolable],
  );
  const shownIds = useMemo(() => new Set(shownLoads.map((l) => l.id)), [shownLoads]);
  const shownPools = useMemo(
    () => pools.filter((p) => p.members.some((m) => shownIds.has(m.id))),
    [pools, shownIds],
  );
  const shownIndividual = useMemo(
    () => individual.filter((l) => shownIds.has(l.id)),
    [individual, shownIds],
  );
  const openPool = openPoolId ? (pools.find((p) => p.id === openPoolId) ?? null) : null;

  useEffect(() => {
    if (openPoolId && !openPool) setOpenPoolId(null);
  }, [openPoolId, openPool]);

  const viaFor = (pool: NetworkBidPool<IndentRow>) =>
    viaStopsByIndentId
      ? viaStopLocationsForMemberIds(
          pool.members.map((m) => m.id),
          viaStopsByIndentId,
        )
      : [];

  if (openPool) {
    return (
      <View style={styles.wrap}>
        <Pressable
          onPress={() => setOpenPoolId(null)}
          style={styles.back}
          accessibilityRole="button"
          accessibilityLabel="Back to my bids"
          hitSlop={8}
        >
          <ChevronLeft size={14} color={Theme.primary} strokeWidth={2.4} />
          <Text style={styles.backText}>My bids</Text>
        </Pressable>
        <NetworkBidPoolCard
          pool={openPool}
          showViewAction={false}
          onReviseBid={onRevisePool ? () => onRevisePool(openPool) : undefined}
          viaStops={viaFor(openPool)}
        />
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      {shownPools.map((pool) => (
        <NetworkBidPoolCard
          key={pool.id}
          pool={pool}
          onViewPool={() => (onViewPool ? onViewPool(pool) : setOpenPoolId(pool.id))}
          onReviseBid={onRevisePool ? () => onRevisePool(pool) : undefined}
          viaStops={viaFor(pool)}
        />
      ))}
      {shownIndividual.map((load) => (
        <View key={load.id}>{renderIndividualCard(load)}</View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  back: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    minHeight: 44,
  },
  backText: { fontSize: 13, fontWeight: "700", color: Theme.primary },
});
