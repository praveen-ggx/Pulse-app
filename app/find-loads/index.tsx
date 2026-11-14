/**
 * A4.3 — Business Find Loads: open Marketplace discovery, separate from Load
 * Center's relationship-based Get Load tab (features/network/utils/loadCenter.model.ts).
 * "Source" (All / Sponsored / Marketplace) is a distribution signal on one feed,
 * not three separate workflows — see docs/MARKETPLACE_DOMAIN.md
 * "Distribution vs monetization".
 *
 * Discover lists pooled opportunities: one card per live lane (pickup × drop ×
 * vehicle, from list_marketplace_search_lanes) with its open load count. The
 * pool's loads, the one-rate pool bid and the award handoff live on
 * /find-loads/pool (PooledOpportunityScreen). Bids are still persisted per
 * indent as organization Market bids (market_bids, bidder_type='organization');
 * fleet/driver is chosen at allocation after award (A4.4 Phase 3).
 */
import { ChromeBelowTopNavLoadingScreen } from "@/components/chromeLoadingScreens";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { useOptionalOrganization } from "@/contexts/OrganizationContext";
import { MarketplaceLaneFilters } from "@/features/network/components/MarketplaceLaneFilters";
import { MarketplaceLanding } from "@/features/network/components/MarketplaceLanding";
import { MarketplaceWalletBoard } from "@/features/network/components/MarketplaceWalletBoard";
import { OrgMyBidsList } from "@/features/network/components/OrgMyBidsList";
import { LaneBidInvitesCard } from "@/features/network/components/laneOffers/LaneBidInvitesCard";
import { NetworkMyQuotesList } from "@/features/network/components/laneOffers/NetworkMyQuotesList";
import { PooledOpportunityCard } from "@/features/network/components/pooled/PooledOpportunityCard";
import {
  listMarketplaceSearchLanes,
  listMyOrgMarketBids,
  listMarketplaceConvertedTrips,
  listOpenMarketplaceLoadsPage,
  getOrgMarketplacePool,
  marketBidsFromQueryData,
} from "@/features/network/services/findLoadsForOrg.service";
import {
  normalizeMarketplaceSearch,
  positiveLaneTarget,
  type MarketplaceLoadSearch,
} from "@/features/network/utils/marketplaceSearch.util";
import { hotMarketplaceLanes } from "@/features/network/utils/hotMarketplaceLanes.util";
import { marketplaceArBook } from "@/features/network/utils/marketplaceWallet.util";
import {
  liveMarketplaceSearch,
  marketplaceLaneCountKey,
  marketplaceLaneSearchKey,
  bidderLaneKey,
  bidderLanePreview,
  lanePoolCounts,
  presetMarketplaceSearch,
  rememberLaneCounts,
} from "@/features/network/utils/marketplaceLaneSearchMemory.util";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ChevronLeft } from "lucide-react-native";
import {
  canonicalPoolField,
  filterPoolLanes,
  poolKeyFromLane,
  poolKeyId,
} from "@/features/network/utils/pooledOpportunity.util";
import { STALE } from "@/lib/queryClient";
import { isVehicleTypeCompatibleWithFleet } from "@/features/marketplace/utils/fleetFit.util";
import { getVehiclesByOrganization } from "@/features/vehicles/services/vehicles.service";
import { marketplaceFeeGateSatisfied } from "@/features/network/services/marketBids.service";
import { useLayoutInsets } from "@/lib/layoutInsets";
import { queryKeys } from "@/lib/queryKeys";
import { ROUTES } from "@/lib/routes";
import { useMemberAccess } from "@/lib/useMemberAccess";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

type Segment = "discover" | "wallet" | "myBids";


export default function FindLoadsScreen() {
  const layout = useLayoutInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const orgCtx = useOptionalOrganization();
  const organization = orgCtx?.currentOrganization ?? null;
  const orgLoading = orgCtx?.isLoading ?? orgCtx == null;
  const { can: canSurface, isLoading: accessLoading } = useMemberAccess();
  // Reuses Load Center's hub gate for this first version rather than a
  // dedicated "Find Loads" surface — see A4.3 report.
  const canViewFindLoads = canSurface("tripops.pulse_loads");
  const orgId = canViewFindLoads ? organization?.id ?? null : null;
  const warmPool = useCallback(
    (lane: { pickup_area: string; drop_location: string; vehicle_type: string }) => {
      if (!orgId) return;
      const key = poolKeyFromLane(lane);
      void queryClient.prefetchQuery({
        queryKey: queryKeys.findLoadsForOrg.pool(orgId, poolKeyId(key)),
        staleTime: STALE.frequent,
        queryFn: async () => {
          const { error, pool } = await getOrgMarketplacePool(orgId, key);
          if (error || !pool) throw error ?? new Error("Pool not found.");
          return pool;
        },
      });
    },
    [orgId, queryClient],
  );

  const params = useLocalSearchParams<{ segment?: string }>();
  const [bidFocus, setBidFocus] = useState<"bids" | "won">("bids");
  const [segment, setSegment] = useState<Segment>(
    params.segment === "my-bids" ? "myBids" : params.segment === "wallet" ? "wallet" : "discover",
  );
  useEffect(() => {
    if (params.segment === "my-bids") setSegment("myBids");
  }, [params.segment]);
  const [appliedSearch, setAppliedSearch] = useState<MarketplaceLoadSearch | null>(
    null,
  );
  const [browseAllLanes, setBrowseAllLanes] = useState(false);
  const [pickupOpenToken, setPickupOpenToken] = useState(0);
  const searchActive = Object.values(normalizeMarketplaceSearch(appliedSearch)).some(Boolean);
  const searchHydrated = useRef<string | null>(null);

  const contentTopInset = layout.isDesktopWeb
    ? Layout.desktopTopNavOffset
    : layout.top;

  const vehiclesQ = useQuery({
    queryKey: queryKeys.vehicles.all(orgId ?? ""),
    queryFn: () => getVehiclesByOrganization(orgId as string),
    enabled: !!orgId,
    staleTime: STALE.moderate,
  });
  const fleetVehicleTypes = useMemo(
    () => (vehiclesQ.data?.vehicles ?? []).map((v) => v.vehicle_type),
    [vehiclesQ.data],
  );

  const myBidsQ = useQuery({
    queryKey: queryKeys.findLoadsForOrg.myBids(orgId ?? ""),
    queryFn: () => listMyOrgMarketBids(orgId as string, 100),
    enabled: !!orgId,
    staleTime: STALE.frequent,
  });
  const lanesQ = useQuery({
    queryKey: queryKeys.findLoadsForOrg.searchLanes(orgId ?? ""),
    queryFn: async () => {
      const { error, lanes } = await listMarketplaceSearchLanes(orgId as string);
      if (error && lanes.length === 0) throw error;
      return lanes;
    },
    enabled: !!orgId && (segment === "discover" || segment === "myBids"),
    staleTime: STALE.moderate,
  });
  const myBids = marketBidsFromQueryData(myBidsQ.data);
  const wonIndentKey = useMemo(
    () =>
      myBids
        .filter((bid) => bid.status === "accepted")
        .map((bid) => bid.indent_id)
        .filter(Boolean)
        .sort()
        .join(","),
    [myBids],
  );
  const wonTripsQ = useQuery({
    queryKey: ["marketplace", "converted-trips", orgId ?? "", wonIndentKey],
    queryFn: () => listMarketplaceConvertedTrips(wonIndentKey.split(",")),
    enabled: !!orgId && wonIndentKey.length > 0,
    staleTime: STALE.frequent,
  });
  const convertedTrips = wonTripsQ.data?.trips ?? [];
  const transactionBids = useMemo(() => {
    const converted = new Set(convertedTrips.map((trip) => trip.indentId));
    return myBids.filter((bid) => bid.status === "accepted" && converted.has(bid.indent_id));
  }, [myBids, convertedTrips]);
  const transactionsReady = wonIndentKey.length === 0 || wonTripsQ.isSuccess || wonTripsQ.isError;
  const assignBids = useMemo(() => {
    if (!transactionsReady) return [];
    const allocated = new Set(convertedTrips.map((trip) => trip.indentId));
    return myBids.filter(
      (bid) =>
        bid.status === "accepted" &&
        marketplaceFeeGateSatisfied(bid.fee_payment_status) &&
        !allocated.has(bid.indent_id),
    );
  }, [convertedTrips, myBids, transactionsReady]);
  const arBook = useMemo(
    () =>
      marketplaceArBook(
        myBids,
        convertedTrips,
        wonTripsQ.data?.receipts ?? [],
        orgId ?? "",
      ),
    [myBids, convertedTrips, wonTripsQ.data?.receipts, orgId],
  );

  const lanes = useMemo(() => lanesQ.data ?? [], [lanesQ.data]);
  const [laneHighWater, setLaneHighWater] = useState<Record<string, number>>({});
  const laneCountsReady = useRef<string | null>(null);

  useEffect(() => {
    if (!orgId || !lanesQ.isSuccess || laneCountsReady.current === orgId) return;
    let cancelled = false;
    void (async () => {
      let saved: Record<string, number> = {};
      try {
        const raw = await AsyncStorage.getItem(marketplaceLaneCountKey(orgId));
        const parsed = raw ? (JSON.parse(raw) as Record<string, number>) : {};
        if (parsed && typeof parsed === "object") saved = parsed;
      } catch {
        saved = {};
      }
      if (cancelled) return;
      laneCountsReady.current = orgId;
      const next = rememberLaneCounts(saved, lanePoolCounts(lanes));
      setLaneHighWater(next);
      AsyncStorage.setItem(marketplaceLaneCountKey(orgId), JSON.stringify(next)).catch(() => undefined);
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId, lanes, lanesQ.isSuccess]);

  useEffect(() => {
    if (!orgId || laneCountsReady.current !== orgId || !lanesQ.isSuccess) return;
    const next = rememberLaneCounts(laneHighWater, lanePoolCounts(lanes));
    if (JSON.stringify(next) === JSON.stringify(laneHighWater)) return;
    setLaneHighWater(next);
    AsyncStorage.setItem(marketplaceLaneCountKey(orgId), JSON.stringify(next)).catch(() => undefined);
  }, [orgId, lanes, lanesQ.isSuccess, laneHighWater]);

  const lanePreviewByBidId = useMemo(() => {
    const today = new Date();
    const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const counts = lanePoolCounts(lanes);
    const ready = lanesQ.isSuccess && laneCountsReady.current === orgId;
    const preview: Record<string, { tone: "live" | "reduced" | "expired"; label: string }> = {};
    for (const bid of myBids) {
      const status = bidderLanePreview({
        bidStatus: bid.status,
        pickupDate: bid.pickup_date,
        currentCount: counts.get(bidderLaneKey(bid.pickup_area, bid.drop_location)) ?? 0,
        rememberedCount: laneHighWater[bidderLaneKey(bid.pickup_area, bid.drop_location)],
        lanesReady: ready,
        today: todayKey,
      });
      if (status) preview[bid.id] = status;
    }
    return preview;
  }, [lanes, lanesQ.isSuccess, laneHighWater, myBids, orgId]);

  useEffect(() => {
    if (!orgId || lanes.length === 0 || searchHydrated.current === orgId) return;
    let cancelled = false;
    void (async () => {
      let saved: MarketplaceLoadSearch | null = null;
      try {
        const raw = await AsyncStorage.getItem(marketplaceLaneSearchKey(orgId));
        saved = raw ? (JSON.parse(raw) as MarketplaceLoadSearch) : null;
      } catch {
        saved = null;
      }
      if (cancelled) return;
      searchHydrated.current = orgId;
      const next = liveMarketplaceSearch(lanes, saved);
      if (next) setAppliedSearch(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId, lanes]);

  const updateSearch = (next: MarketplaceLoadSearch) => {
    setAppliedSearch(next);
    if (!orgId) return;
    AsyncStorage.setItem(
      marketplaceLaneSearchKey(orgId),
      JSON.stringify(normalizeMarketplaceSearch(next)),
    ).catch(() => {});
  };

  const laneSuggestion = useMemo(
    () => (searchActive ? null : presetMarketplaceSearch(lanes)),
    [lanes, searchActive],
  );

  const pools = useMemo(
    () => filterPoolLanes(lanes, appliedSearch),
    [lanes, appliedSearch],
  );
  const poolLoadTotal = useMemo(
    () => pools.reduce((n, lane) => n + (Number(lane.load_count) || 0), 0),
    [pools],
  );
  const featuredLanes = useMemo(() => {
    const ranked = [...pools].sort(
      (a, b) => (Number(b.load_count) || 0) - (Number(a.load_count) || 0),
    );
    const busy = ranked.filter((lane) => (Number(lane.load_count) || 0) >= 10);
    return busy.length > 0 ? busy : ranked;
  }, [pools]);
  const showHotLanesOnly = !searchActive && !browseAllLanes;
  const listedPools = useMemo(
    () => (showHotLanesOnly ? hotMarketplaceLanes(pools) : pools),
    [showHotLanesOnly, pools],
  );
  const bidPools = useMemo(() => {
    const keys = new Set(myBids.map((bid) => bidderLaneKey(bid.pickup_area, bid.drop_location)));
    return filterPoolLanes(lanes, null).filter((lane) =>
      keys.has(bidderLaneKey(lane.pickup_area, lane.drop_location)),
    );
  }, [lanes, myBids]);
  const discoverColumns = layout.isDesktopWeb ? 3 : 1;
  const [laneTargets, setLaneTargets] = useState<
    Record<string, { min: number | null; max: number | null }>
  >({});

  useEffect(() => {
    const source = segment === "discover" ? listedPools : segment === "myBids" ? bidPools : [];
    if (!orgId || source.length === 0) return;
    const missing = source.filter(
      (lane) =>
        positiveLaneTarget(lane.target_rate_min) == null &&
        laneTargets[lane.poolId] == null,
    );
    if (missing.length === 0) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      void (async () => {
        const found: Record<string, { min: number | null; max: number | null }> = {};
        for (let index = 0; index < missing.length; index += 2) {
          if (cancelled) return;
          const wave = missing.slice(index, index + 2);
          await Promise.all(
            wave.map(async (lane) => {
              let min: number | null = null;
              let max: number | null = null;
              let seen = 0;
              let offset = 0;
              const expected = Number(lane.load_count) || 0;
              for (let page = 0; page < 6; page += 1) {
                if (cancelled) return;
                const result = await listOpenMarketplaceLoadsPage(orgId, offset, 15, {
                  pickup: lane.pickup_area,
                  drop: lane.drop_location,
                  vehicleType: lane.vehicle_type,
                });
                if (result.error) break;
                for (const load of result.loads) {
                  if (load.is_sponsored) continue;
                  if (
                    canonicalPoolField(load.pickup_area) !== canonicalPoolField(lane.pickup_area) ||
                    canonicalPoolField(load.drop_location) !== canonicalPoolField(lane.drop_location) ||
                    canonicalPoolField(load.vehicle_type) !== canonicalPoolField(lane.vehicle_type)
                  ) {
                    continue;
                  }
                  seen += 1;
                  const rate = positiveLaneTarget(load.rate_offer);
                  if (rate == null) continue;
                  min = min == null ? rate : Math.min(min, rate);
                  max = max == null ? rate : Math.max(max, rate);
                }
                if (!result.hasMore || result.nextOffset == null || (expected > 0 && seen >= expected)) break;
                offset = result.nextOffset;
              }
              found[lane.poolId] = { min, max };
            }),
          );
        }
        if (!cancelled) setLaneTargets((current) => ({ ...current, ...found }));
      })();
    }, 700);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [segment, orgId, listedPools, bidPools, laneTargets]);

  if (accessLoading) {
    return <ChromeBelowTopNavLoadingScreen variant="preparing" />;
  }
  if (!canViewFindLoads) {
    return (
      <View style={[styles.centered, { paddingTop: contentTopInset }]}>
        <Text style={styles.message}>You don't have access to Marketplace Loads.</Text>
      </View>
    );
  }
  if (!orgId) {
    return <ChromeBelowTopNavLoadingScreen variant={orgLoading ? "preparing" : "generic"} />;
  }

  const headerSubtitle =
    segment === "wallet"
      ? "Wallet and marketplace transactions"
      : segment === "myBids"
      ? `${myBids.length} bid${myBids.length === 1 ? "" : "s"} from your org`
      : lanesQ.isLoading
        ? "Finding pooled opportunities…"
        : showHotLanesOnly && listedPools.length < pools.length
          ? `${listedPools.length} hot lanes · ${pools.length} pooled opportunities · ${poolLoadTotal} loads`
          : `${pools.length} pooled opportunit${pools.length === 1 ? "y" : "ies"} · ${poolLoadTotal} load${
            poolLoadTotal === 1 ? "" : "s"
          }`;

  const laneFilters = (
    <View style={styles.headerFilters}>
      <MarketplaceLaneFilters
        lanes={lanesQ.data ?? []}
        value={appliedSearch}
        onChange={updateSearch}
        suggestion={laneSuggestion}
        stacked={!layout.isDesktopWeb}
        appearance="board"
        openPickupToken={pickupOpenToken}
      />
    </View>
  );

  const pageChrome = () => (
      <View
        style={[
          styles.chrome,
          segment === "discover" &&
            showHotLanesOnly &&
            !lanesQ.isLoading &&
            !lanesQ.isError &&
            pools.length > 0 &&
            styles.chromeFlush,
        ]}
      >
        <View style={styles.chromeInner}>
          {segment === "discover" && showHotLanesOnly && !lanesQ.isLoading && !lanesQ.isError && pools.length > 0 ? null : (
          <View style={[styles.headerInner, !layout.isDesktopWeb && styles.headerInnerMobile]}>
            {layout.isDesktopWeb ? (
              <View style={styles.headerLeft}>
                <View style={styles.headerTextCol}>
                  <Text style={styles.eyebrow} numberOfLines={1}>
                    LIVE MARKETPLACE
                  </Text>
                  <Text style={[styles.title, styles.titleDesktop]} numberOfLines={1}>
                    Marketplace Loads
                  </Text>
                  <Text style={styles.subtitle} numberOfLines={1}>
                    {headerSubtitle}
                  </Text>
                </View>
              </View>
            ) : (
              <View style={styles.mobileHeader}>
                <Text style={styles.eyebrow} numberOfLines={1}>
                  LIVE MARKETPLACE
                </Text>
                <Text style={styles.title} numberOfLines={2}>
                  Marketplace Loads
                </Text>
                <Text style={styles.subtitle} numberOfLines={2}>
                  {headerSubtitle}
                </Text>
              </View>
            )}
            {segment === "discover" ? null : (
              <Pressable
                onPress={() => setSegment("discover")}
                style={({ pressed }) => [styles.backToLoads, pressed && styles.retryBtnPressed]}
                accessibilityRole="button"
                accessibilityLabel="Back to marketplace loads"
                hitSlop={4}
              >
                <ChevronLeft size={16} color={Theme.textPrimaryDark} strokeWidth={2.4} />
                <Text style={styles.backToLoadsText}>Loads</Text>
              </Pressable>
            )}
          </View>
          )}
        </View>
      </View>
    );

  const discoverBody = lanesQ.isError ? (
    <View style={styles.pageBody}>
      <Text style={styles.message}>Couldn't load Marketplace pools.</Text>
      <Pressable
        onPress={() => lanesQ.refetch()}
        style={({ pressed }) => [styles.retryBtn, pressed && styles.retryBtnPressed]}
        accessibilityRole="button"
        accessibilityLabel="Retry"
      >
        <Text style={styles.retryBtnText}>Retry</Text>
      </Pressable>
    </View>
  ) : lanesQ.isLoading ? (
    <View style={styles.pageBody}>
      <Text style={styles.message}>Finding pooled opportunities…</Text>
    </View>
  ) : pools.length === 0 ? (
    <View style={styles.pageBody}>
      <Text style={styles.message}>
        {searchActive
          ? "No pooled opportunities match these filters."
          : "No open Marketplace loads right now."}
      </Text>
      {searchActive ? (
        <Pressable
          onPress={() => setAppliedSearch(null)}
          style={({ pressed }) => [styles.retryBtn, pressed && styles.retryBtnPressed]}
          accessibilityRole="button"
          accessibilityLabel="Change marketplace filters"
        >
          <Text style={styles.retryBtnText}>Change filters</Text>
        </Pressable>
      ) : null}
    </View>
  ) : null;

  const showDiscoverCards = segment === "discover" && discoverBody == null;

  return (
    <View style={[styles.root, { paddingTop: contentTopInset }]}>
      <View style={[styles.frame, layout.isDesktopWeb && styles.frameDesktop]}>
      {pageChrome()}
      {segment === "wallet" ? (
        <ScrollView
          style={styles.pageScroll}
          contentContainerStyle={styles.pageScrollContent}
        >
          <MarketplaceWalletBoard
            orgName={organization?.name ?? ""}
            bids={myBids}
            statementBids={transactionBids}
            statementReady={transactionsReady}
            arBook={arBook}
            onOpenBids={() => {
              setBidFocus("bids");
              setSegment("myBids");
            }}
            onFindLoads={() => setSegment("discover")}
          />
        </ScrollView>
      ) : segment === "myBids" ? (
        <ScrollView
          style={styles.pageScroll}
          contentContainerStyle={styles.pageScrollContent}
        >
          <LaneBidInvitesCard onResponded={() => void myBidsQ.refetch()} />
          <NetworkMyQuotesList />
          <OrgMyBidsList
            bids={myBids}
            focus={bidFocus}
            onFocusChange={setBidFocus}
            awardTrips={convertedTrips}
            awardIndents={wonTripsQ.data?.indents ?? []}
            lanePreviewByBidId={lanePreviewByBidId}
            lanes={lanes}
            laneTargets={laneTargets}
            lanesReady={lanesQ.isSuccess}
            isLoading={myBidsQ.isLoading}
            orgId={orgId}
            onPaymentUpdated={() => {
              if (orgId) {
                queryClient.invalidateQueries({ queryKey: queryKeys.findLoadsForOrg.myBids(orgId) });
              }
            }}
          />
        </ScrollView>
      ) : showDiscoverCards ? (
        <View style={[styles.discoverShell, layout.isDesktopWeb && styles.discoverShellDesktop]}>
        <FlatList
          data={listedPools}
          key={`discover-${discoverColumns}-${showHotLanesOnly ? "hot" : "all"}`}
          numColumns={discoverColumns}
          keyExtractor={(item) => item.poolId}
          style={styles.list}
          contentContainerStyle={[
            styles.listContent,
            layout.isDesktopWeb && styles.listContentDesktop,
          ]}
          columnWrapperStyle={
            discoverColumns > 1 ? styles.listRow : undefined
          }
          ListHeaderComponent={
            <View>
              {showHotLanesOnly ? (
                <MarketplaceLanding
                  orgName={organization?.name ?? ""}
                  bids={myBids}
                  transactionBids={transactionBids}
                  transactionsReady={transactionsReady}
                  loadCount={poolLoadTotal}
                  laneCount={pools.length}
                  showing={listedPools.length}
                  hiddenCount={Math.max(0, pools.length - listedPools.length)}
                  isDesktop={!!layout.isDesktopWeb}
                  part={layout.isDesktopWeb ? "main" : "all"}
                  onOpenLoads={() => setBrowseAllLanes(false)}
                  onOpenBids={(focus) => {
                    setBidFocus(focus ?? "bids");
                    setSegment("myBids");
                  }}
                  onOpenWallet={() => setSegment("wallet")}
                  onOpenTransactions={() => setSegment("wallet")}
                  onShowAllLanes={() => {}}
                  onSearchLoads={() => setPickupOpenToken((token) => token + 1)}
                  filters={laneFilters}
                  featuredLanes={featuredLanes}
                  onOpenFeaturedLane={(lane) =>
                    router.push(ROUTES.findLoadsPool(poolKeyFromLane(lane)) as Href)
                  }
                  onWarmFeaturedLane={warmPool}
                  lanes={lanes}
                  assignBids={assignBids}
                  onAssignVehicle={(bid) =>
                    router.push(ROUTES.indentAllocation(bid.indent_id, "vehicle") as Href)
                  }
                />
              ) : (
                <>
                  {browseAllLanes && !searchActive ? (
                <Pressable
                  onPress={() => setBrowseAllLanes(false)}
                  style={styles.hotLaneBack}
                  accessibilityRole="button"
                  accessibilityLabel="Show hot lanes"
                >
                  <Text style={styles.hotLaneBackText}>Show hot lanes</Text>
                </Pressable>
                  ) : null}
                  {laneFilters}
                </>
              )}
            </View>
          }
          renderItem={({ item }) => (
            <PooledOpportunityCard
              lane={{
                ...item,
                target_rate_min: item.target_rate_min ?? laneTargets[item.poolId]?.min,
                target_rate_max: item.target_rate_max ?? laneTargets[item.poolId]?.max,
              }}
              fitsFleet={isVehicleTypeCompatibleWithFleet(item.vehicle_type, fleetVehicleTypes)}
              isDesktop={!!layout.isDesktopWeb}
              columns={discoverColumns}
              onPress={() => router.push(ROUTES.findLoadsPool(poolKeyFromLane(item)) as Href)}
              onBid={() =>
                router.push(ROUTES.findLoadsPool(poolKeyFromLane(item), { bid: true }) as Href)
              }
              onWarm={() => warmPool(item)}
            />
          )}
        />
        {layout.isDesktopWeb ? (
          <MarketplaceLanding
            orgName={organization?.name ?? ""}
            bids={myBids}
            transactionBids={transactionBids}
            transactionsReady={transactionsReady}
            loadCount={poolLoadTotal}
            laneCount={pools.length}
            showing={listedPools.length}
            hiddenCount={Math.max(0, pools.length - listedPools.length)}
            isDesktop
            part="side"
            onOpenLoads={() => setBrowseAllLanes(false)}
            onOpenBids={(focus) => {
              setBidFocus(focus ?? "bids");
              setSegment("myBids");
            }}
            onOpenWallet={() => setSegment("wallet")}
            onOpenTransactions={() => setSegment("wallet")}
            onShowAllLanes={() => {}}
            lanes={lanes}
          />
        ) : null}
        </View>
      ) : (
        <ScrollView
          style={styles.pageScroll}
          contentContainerStyle={styles.pageScrollContent}
        >
          {discoverBody}
        </ScrollView>
      )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Theme.analyticsCanvas },
  pageScroll: {
    flex: 1,
    width: "100%",
  },
  pageScrollContent: {
    flexGrow: 1,
    width: "100%",
    paddingTop: 4,
    paddingBottom: 32,
  },
  pageBody: {
    alignItems: "center",
    paddingHorizontal: 24,
    paddingVertical: 40,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  message: { fontSize: 16, color: Theme.textSecondary },
  retryBtn: {
    marginTop: 14,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: Theme.buttonPrimary,
    borderWidth: Theme.buttonPrimaryBorderWidth,
    borderColor: Theme.buttonPrimaryBorder,
    borderRadius: Theme.buttonPrimaryRadius,
  },
  retryBtnPressed: { opacity: 0.85 },
  retryBtnText: { fontSize: 14, fontWeight: "700", color: Theme.buttonPrimaryText },
  frame: {
    flex: 1,
    width: "100%",
    alignSelf: "center",
    paddingHorizontal: 16,
  },
  frameDesktop: {
    width: "100%",
    maxWidth: "100%",
    paddingHorizontal: 20,
  },
  chrome: {
    backgroundColor: Theme.analyticsCanvas,
    paddingTop: 18,
    paddingBottom: 8,
  },
  chromeFlush: { paddingTop: 4, paddingBottom: 0 },
  chromeInner: { width: "100%", gap: 12 },
  hotLaneBack: {
    alignSelf: "flex-start",
    minHeight: 36,
    paddingHorizontal: 4,
    justifyContent: "center",
  },
  hotLaneBackText: {
    fontSize: 14,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  headerInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    width: "100%",
  },
  headerInnerMobile: {
    alignItems: "flex-start",
    gap: 12,
  },
  headerLeft: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  headerFilters: {
    flex: 1,
    minWidth: 0,
    borderRadius: 16,
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    overflow: "hidden",
    justifyContent: "center",
  },
  backToLoads: {
    marginLeft: "auto",
    flexShrink: 0,
    flexDirection: "row",
    gap: 2,
    minHeight: 44,
    paddingLeft: 10,
    paddingRight: 16,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
    alignItems: "center",
    justifyContent: "center",
  },
  backToLoadsText: {
    fontSize: 14,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  headerTextCol: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  mobileHeader: {
    flex: 1,
    minWidth: 0,
    gap: 6,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.1,
    color: Theme.textMuted,
  },
  closeBtn: {
    width: Layout.minTouchTargetSize,
    height: Layout.minTouchTargetSize,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    backgroundColor: Theme.cardWhite,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  closeBtnMobile: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  closeBtnPressed: { opacity: 0.85 },
  noAccessCloseBtn: {
    position: "absolute",
    top: 12,
    right: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.5,
    lineHeight: 30,
  },
  titleDesktop: {
    fontSize: 26,
    letterSpacing: -0.6,
  },
  subtitle: {
    fontSize: 13,
    fontWeight: "500",
    color: Theme.textSecondary,
  },
  list: {
    flex: 1,
    width: "100%",
  },
  discoverShell: { flex: 1, width: "100%" },
  discoverShellDesktop: { flexDirection: "row", alignItems: "stretch", gap: 16 },
  listRow: {
    width: "100%",
    alignItems: "stretch",
    gap: 12,
  },
  listContent: {
    width: "100%",
    alignSelf: "stretch",
    paddingTop: 8,
    paddingBottom: 32,
    gap: 12,
  },
  listContentDesktop: {
    paddingTop: 0,
    paddingHorizontal: 0,
    gap: 16,
  },
});
