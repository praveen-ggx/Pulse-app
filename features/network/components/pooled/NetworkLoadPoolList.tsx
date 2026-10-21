/**
 * Get Load → Network Loads on the phone list: partner loads grouped into
 * canonical Indent Pools (pickup + drop + vehicle). One rate per pool; an
 * opened pool lists its indents for review only. A load without a complete
 * lane cannot be pooled and is review-only too: no normal Network indent is
 * individually biddable.
 *
 * Which pools exist comes from the server (list_network_pool_lanes_for_org):
 * a lane the server does not list is not shown, whatever the loaded rows say.
 * The cards and their indent lists are built from the loaded open loads for
 * display only; "Quote for pool" re-reads the server manifest for its scope.
 * Search only decides which pools are shown.
 */
import Theme from "@/constants/Theme";
import { IncompleteLaneNotice } from "@/features/network/components/pooled/IncompleteLaneNotice";
import { NetworkLoadPoolCard } from "@/features/network/components/pooled/NetworkLoadPoolCard";
import { useServerNetworkPoolIds } from "@/features/network/hooks/useNetworkPoolLanesQuery";
import {
  buildNetworkLoadPools,
  keepServerPools,
  type NetworkLoadPool,
} from "@/features/network/utils/networkLoadPools.util";
import type { IndentRow } from "@/features/indents/services/indents.service";
import { viaStopLocationsForMemberIds } from "@/features/trips/utils/routeExtraStops.util";
import { ChevronLeft } from "lucide-react-native";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

export function NetworkLoadPoolList({
  orgId,
  openLoads,
  shownLoads,
  canQuote,
  onQuotePool,
  renderPoolMemberCard,
  onViewIndents,
  viaStopsByIndentId,
}: {
  orgId: string | null;
  openLoads: readonly IndentRow[];
  shownLoads: readonly IndentRow[];
  canQuote: boolean;
  onQuotePool: (pool: NetworkLoadPool<IndentRow>) => void;
  /** Review-only card: pool members, and loads that cannot form a pool. */
  renderPoolMemberCard: (load: IndentRow) => ReactNode;
  /** Opens the pool elsewhere (desktop column view) instead of inline. */
  onViewIndents?: (pool: NetworkLoadPool<IndentRow>) => void;
  viaStopsByIndentId?: ReadonlyMap<string, readonly string[]>;
}) {
  const [openPoolId, setOpenPoolId] = useState<string | null>(null);

  const serverPoolIds = useServerNetworkPoolIds(orgId);
  const { pools, unpooled } = useMemo(() => {
    const built = buildNetworkLoadPools([...openLoads]);
    return { pools: keepServerPools(built.pools, serverPoolIds), unpooled: built.unpooled };
  }, [openLoads, serverPoolIds]);
  const shownIds = useMemo(
    () => new Set(shownLoads.map((l) => l.id)),
    [shownLoads],
  );
  const shownPools = useMemo(
    () => pools.filter((p) => p.members.some((m) => shownIds.has(m.id))),
    [pools, shownIds],
  );
  const shownUnpooled = useMemo(
    () => unpooled.filter((l) => shownIds.has(l.id)),
    [unpooled, shownIds],
  );
  const openPool = openPoolId
    ? (pools.find((p) => p.id === openPoolId) ?? null)
    : null;

  useEffect(() => {
    if (openPoolId && !openPool) setOpenPoolId(null);
  }, [openPoolId, openPool]);

  const viaFor = (pool: NetworkLoadPool<IndentRow>) =>
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
          accessibilityLabel="Back to all pools"
          hitSlop={8}
        >
          <ChevronLeft size={14} color={Theme.primary} strokeWidth={2.4} />
          <Text style={styles.backText}>All pools</Text>
        </Pressable>
        <NetworkLoadPoolCard
          pool={openPool}
          canQuote={canQuote}
          showIndentsAction={false}
          onQuote={() => onQuotePool(openPool)}
          viaStops={viaFor(openPool)}
        />
        <Text style={styles.sectionTitle}>Indents in this pool</Text>
        {openPool.members.map((load) => (
          <View key={load.id}>{renderPoolMemberCard(load)}</View>
        ))}
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.summary}>
        {shownPools.length} pool{shownPools.length === 1 ? "" : "s"} · one quote
        per pool
      </Text>
      {shownPools.map((pool) => (
        <NetworkLoadPoolCard
          key={pool.id}
          pool={pool}
          canQuote={canQuote}
          onQuote={() => onQuotePool(pool)}
          onViewIndents={() =>
            onViewIndents ? onViewIndents(pool) : setOpenPoolId(pool.id)
          }
          viaStops={viaFor(pool)}
        />
      ))}
      {shownUnpooled.length > 0 ? (
        <>
          <IncompleteLaneNotice />
          {shownUnpooled.map((load) => (
            <View key={load.id}>{renderPoolMemberCard(load)}</View>
          ))}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  summary: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textSecondary,
  },
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
