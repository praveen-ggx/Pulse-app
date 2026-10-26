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
import { NetworkBidPoolCard } from "@/features/network/components/pooled/NetworkBidPoolCard";
import type { IndentRow } from "@/features/indents/services/indents.service";
import {
  buildNetworkBidPools,
  type NetworkBidPool,
  type NetworkBidQuote,
} from "@/features/network/utils/networkBidPools.util";
import { viaStopLocationsForMemberIds } from "@/features/trips/utils/routeExtraStops.util";
import { useMemo, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";

export function NetworkBidPoolList({
  quotedLoads,
  shownLoads,
  quoteByIndentId,
  isPoolable,
  renderIndividualCard,
  renderPoolMemberCard: _renderPoolMemberCard,
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
  onRevisePool?: (pool: NetworkBidPool<IndentRow>) => void;
  viaStopsByIndentId?: ReadonlyMap<string, readonly string[]>;
}) {
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
  const viaFor = (pool: NetworkBidPool<IndentRow>) =>
    viaStopsByIndentId
      ? viaStopLocationsForMemberIds(
          pool.members.map((m) => m.id),
          viaStopsByIndentId,
        )
      : [];

  return (
    <View style={styles.wrap}>
      {shownPools.map((pool) => (
        <NetworkBidPoolCard
          key={pool.id}
          pool={pool}
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
});
