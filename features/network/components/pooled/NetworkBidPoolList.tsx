/**
 * Get Load → My Bids with Network quotes grouped back into their Indent Pools.
 * A pooled quote is one direct_quotes row per member indent; the list shows
 * one anonymous card per pool and, when opened, the member indents with each
 * one's own quote status. The member action revises that bid. Sponsored Reach
 * and incomplete-lane loads were quoted individually and keep their card.
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
import { ChevronLeft } from "lucide-react-native";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

export function NetworkBidPoolList({
  quotedLoads,
  shownLoads,
  quoteByIndentId,
  isPoolable,
  renderIndividualCard,
  renderPoolMemberCard,
  onViewPool,
}: {
  quotedLoads: readonly IndentRow[];
  shownLoads: readonly IndentRow[];
  quoteByIndentId: ReadonlyMap<string, NetworkBidQuote>;
  isPoolable: (load: IndentRow) => boolean;
  /** Existing individual card (sponsored Reach, incomplete lane). */
  renderIndividualCard: (load: IndentRow) => ReactNode;
  /** Anonymous card for a member of an opened pool. Its action revises the bid. */
  renderPoolMemberCard: (load: IndentRow) => ReactNode;
  /** Opens the pool elsewhere (desktop column view) instead of inline. */
  onViewPool?: (pool: NetworkBidPool<IndentRow>) => void;
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
        <NetworkBidPoolCard pool={openPool} showViewAction={false} />
        <Text style={styles.sectionTitle}>Indents in this pool</Text>
        {openPool.members.map((load) => (
          <View key={load.id}>{renderPoolMemberCard(load)}</View>
        ))}
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
  sectionTitle: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: Theme.textMuted,
    marginTop: 8,
  },
});
