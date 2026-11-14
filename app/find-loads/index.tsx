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
import { MarketplaceSearchSheet } from "@/features/network/components/MarketplaceSearchSheet";
import { OrgMyBidsList } from "@/features/network/components/OrgMyBidsList";
import { LaneBidInvitesCard } from "@/features/network/components/laneOffers/LaneBidInvitesCard";
import { NetworkMyQuotesList } from "@/features/network/components/laneOffers/NetworkMyQuotesList";
import { PooledOpportunityCard } from "@/features/network/components/pooled/PooledOpportunityCard";
import {
  listMarketplaceSearchLanes,
  listMyOrgMarketBids,
  marketBidsFromQueryData,
} from "@/features/network/services/findLoadsForOrg.service";
import {
  isMarketplaceSearchReady,
  normalizeMarketplaceSearch,
  type MarketplaceLoadSearch,
} from "@/features/network/utils/marketplaceSearch.util";
import {
  filterPoolLanes,
  poolKeyFromLane,
} from "@/features/network/utils/pooledOpportunity.util";
import { STALE } from "@/lib/queryClient";
import { isVehicleTypeCompatibleWithFleet } from "@/features/marketplace/utils/fleetFit.util";
import { getVehiclesByOrganization } from "@/features/vehicles/services/vehicles.service";
import { useLayoutInsets } from "@/lib/layoutInsets";
import { queryKeys } from "@/lib/queryKeys";
import { ROUTES } from "@/lib/routes";
import { useMemberAccess } from "@/lib/useMemberAccess";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { Award, SlidersHorizontal, X } from "lucide-react-native";
import React, { useEffect, useMemo, useState } from "react";
import {
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

type Segment = "discover" | "myBids";


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

  const params = useLocalSearchParams<{ segment?: string }>();
  const [segment, setSegment] = useState<Segment>(
    params.segment === "my-bids" ? "myBids" : "discover",
  );
  useEffect(() => {
    if (params.segment === "my-bids") setSegment("myBids");
  }, [params.segment]);
  const [appliedSearch, setAppliedSearch] = useState<MarketplaceLoadSearch | null>(
    null,
  );
  const [filterOpen, setFilterOpen] = useState(false);
  const searchReady = isMarketplaceSearchReady(appliedSearch);
  const searchActive = Object.values(normalizeMarketplaceSearch(appliedSearch)).some(Boolean);

  const contentTopInset = layout.isDesktopWeb
    ? Layout.desktopTopNavOffset
    : layout.top;

  const handleClose = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace(ROUTES.PULSE_LOADS as import("expo-router").Href);
  };

  const vehiclesQ = useQuery({
    queryKey: queryKeys.vehicles.all(orgId ?? ""),
    queryFn: () => getVehiclesByOrganization(orgId as string),
    enabled: !!orgId,
  });
  const fleetVehicleTypes = useMemo(
    () => (vehiclesQ.data?.vehicles ?? []).map((v) => v.vehicle_type),
    [vehiclesQ.data],
  );

  const myBidsQ = useQuery({
    queryKey: queryKeys.findLoadsForOrg.myBids(orgId ?? ""),
    queryFn: () => listMyOrgMarketBids(orgId as string),
    enabled: !!orgId,
  });
  const lanesQ = useQuery({
    queryKey: queryKeys.findLoadsForOrg.searchLanes(orgId ?? ""),
    queryFn: async () => {
      const { error, lanes } = await listMarketplaceSearchLanes(orgId as string);
      if (error && lanes.length === 0) throw error;
      return lanes;
    },
    enabled: !!orgId && segment === "discover",
    staleTime: STALE.moderate,
  });
  const myBids = marketBidsFromQueryData(myBidsQ.data);
  const awardedCount = useMemo(
    () => myBids.filter((b) => b.status === "accepted").length,
    [myBids],
  );

  const lanes = useMemo(() => lanesQ.data ?? [], [lanesQ.data]);
  const pools = useMemo(
    () => filterPoolLanes(lanes, appliedSearch),
    [lanes, appliedSearch],
  );
  const poolLoadTotal = useMemo(
    () => pools.reduce((n, lane) => n + (Number(lane.load_count) || 0), 0),
    [pools],
  );
  const discoverColumns = layout.isDesktopWeb ? 3 : 1;

  if (accessLoading) {
    return <ChromeBelowTopNavLoadingScreen variant="preparing" />;
  }
  if (!canViewFindLoads) {
    return (
      <View style={[styles.centered, { paddingTop: contentTopInset }]}>
        <Pressable
          onPress={handleClose}
          style={({ pressed }) => [
            styles.closeBtn,
            styles.noAccessCloseBtn,
            pressed && styles.closeBtnPressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Close Marketplace Loads"
          hitSlop={Layout.touchTargetHitSlop}
        >
          <X size={20} color={Theme.textPrimaryDark} strokeWidth={2.2} />
        </Pressable>
        <Text style={styles.message}>You don't have access to Marketplace Loads.</Text>
      </View>
    );
  }
  if (!orgId) {
    return <ChromeBelowTopNavLoadingScreen variant={orgLoading ? "preparing" : "generic"} />;
  }

  const headerSubtitle =
    segment === "myBids"
      ? `${myBids.length} bid${myBids.length === 1 ? "" : "s"} from your org`
      : lanesQ.isLoading
        ? "Finding pooled opportunities…"
        : `${pools.length} pooled opportunit${pools.length === 1 ? "y" : "ies"} · ${poolLoadTotal} load${
            poolLoadTotal === 1 ? "" : "s"
          }`;

  const pageChrome = () => (
      <View
        style={[
          styles.chrome,
          layout.isDesktopWeb && styles.chromeDesktop,
        ]}
      >
        <View style={styles.chromeInner}>
          {awardedCount > 0 ? (
            <Pressable
              onPress={() => setSegment("myBids")}
              style={({ pressed }) => [
                styles.awardedBanner,
                pressed && styles.awardedBannerPressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Open awarded bids"
            >
              <View style={styles.awardedBannerIcon}>
                <Award size={15} color={Theme.positive} strokeWidth={2.2} />
              </View>
              <Text style={styles.awardedBannerText} numberOfLines={2}>
                {awardedCount === 1
                  ? "You have 1 awarded bid — assign a vehicle to get started"
                  : `You have ${awardedCount} awarded bids — assign vehicles to get started`}
              </Text>
            </Pressable>
          ) : null}

          <View style={[styles.headerInner, !layout.isDesktopWeb && styles.headerInnerMobile]}>
            {layout.isDesktopWeb ? (
              <View style={styles.headerLeft}>
                <View style={styles.headerAccent} />
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
                <View style={styles.mobileTitleRow}>
                  <View style={styles.headerTextCol}>
                    <Text style={styles.eyebrow} numberOfLines={1}>
                      LIVE MARKETPLACE
                    </Text>
                    <Text style={styles.title} numberOfLines={2}>
                      Marketplace Loads
                    </Text>
                  </View>
                  <Pressable
                    onPress={handleClose}
                    style={({ pressed }) => [
                      styles.closeBtn,
                      styles.closeBtnMobile,
                      pressed && styles.closeBtnPressed,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel="Close Marketplace Loads"
                    hitSlop={Layout.touchTargetHitSlop}
                  >
                    <X size={18} color={Theme.textPrimaryDark} strokeWidth={2.2} />
                  </Pressable>
                </View>
                <View style={styles.mobileMetaRow}>
                  <Text style={[styles.subtitle, styles.subtitleFlex]} numberOfLines={2}>
                    {headerSubtitle}
                  </Text>
                  <View style={styles.headerRight}>
                    {segment === "myBids" ? (
                      <Pressable
                        onPress={() => setSegment("discover")}
                        style={({ pressed }) => [
                          styles.segmentChip,
                          styles.segmentChipMobile,
                          pressed && styles.awardedBannerPressed,
                        ]}
                        accessibilityRole="button"
                        accessibilityLabel="Discover"
                      >
                        <Text style={styles.segmentChipText}>Discover</Text>
                      </Pressable>
                    ) : null}
                    <Pressable
                      onPress={() => setSegment("myBids")}
                      style={({ pressed }) => [
                        styles.segmentChip,
                        styles.segmentChipMobile,
                        segment === "myBids" && styles.segmentChipActive,
                        pressed && styles.awardedBannerPressed,
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel="My Bids"
                    >
                      <Text
                        style={[
                          styles.segmentChipText,
                          segment === "myBids" && styles.segmentChipTextActive,
                        ]}
                      >
                        My Bids
                      </Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            )}
            {layout.isDesktopWeb ? (
            <View style={styles.headerRight}>
              {segment === "myBids" ? (
                <Pressable
                  onPress={() => setSegment("discover")}
                  style={({ pressed }) => [
                    styles.segmentChip,
                    !layout.isDesktopWeb && styles.segmentChipMobile,
                    pressed && styles.awardedBannerPressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Discover"
                >
                  <Text style={styles.segmentChipText}>Discover</Text>
                </Pressable>
              ) : null}
              <Pressable
                onPress={() => setSegment("myBids")}
                style={({ pressed }) => [
                  styles.segmentChip,
                  !layout.isDesktopWeb && styles.segmentChipMobile,
                  segment === "myBids" && styles.segmentChipActive,
                  pressed && styles.awardedBannerPressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel="My Bids"
              >
                <Text
                  style={[
                    styles.segmentChipText,
                    segment === "myBids" && styles.segmentChipTextActive,
                  ]}
                >
                  My Bids
                </Text>
              </Pressable>
              <Pressable
                onPress={handleClose}
                style={({ pressed }) => [
                  styles.closeBtn,
                  !layout.isDesktopWeb && styles.closeBtnMobile,
                  pressed && styles.closeBtnPressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Close Marketplace Loads"
                hitSlop={Layout.touchTargetHitSlop}
              >
                <X size={18} color={Theme.textPrimaryDark} strokeWidth={2.2} />
              </Pressable>
            </View>
            ) : null}
          </View>

          {segment === "discover" ? (
            <View style={styles.lanePanel}>
              <View style={styles.lanePanelHead}>
                <Text style={styles.lanePanelHint}>
                  Narrow pools by pickup, drop, then vehicle
                </Text>
                <Pressable
                  onPress={() => setFilterOpen(true)}
                  style={({ pressed }) => [
                    styles.filterIconBtn,
                    pressed && styles.closeBtnPressed,
                    searchReady && styles.filterIconBtnActive,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Filter marketplace loads"
                >
                  <SlidersHorizontal
                    size={16}
                    color={
                      searchReady ? Theme.textOnPrimary : Theme.textPrimaryDark
                    }
                    strokeWidth={2.2}
                  />
                </Pressable>
              </View>
              <MarketplaceLaneFilters
                lanes={lanesQ.data ?? []}
                value={appliedSearch}
                onChange={setAppliedSearch}
                stacked={!layout.isDesktopWeb}
              />
            </View>
          ) : null}
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
          onPress={() => setFilterOpen(true)}
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
      {segment === "myBids" ? (
        <ScrollView
          style={styles.pageScroll}
          contentContainerStyle={styles.pageScrollContent}
        >
          {pageChrome()}
          <LaneBidInvitesCard onResponded={() => void myBidsQ.refetch()} />
          <NetworkMyQuotesList />
          <OrgMyBidsList
            bids={myBids}
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
        <FlatList
          data={pools}
          key={`discover-${discoverColumns}`}
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
          ListHeaderComponent={pageChrome()}
          renderItem={({ item }) => (
            <PooledOpportunityCard
              lane={item}
              fitsFleet={isVehicleTypeCompatibleWithFleet(item.vehicle_type, fleetVehicleTypes)}
              isDesktop={!!layout.isDesktopWeb}
              onPress={() => router.push(ROUTES.findLoadsPool(poolKeyFromLane(item)) as Href)}
            />
          )}
        />
      ) : (
        <ScrollView
          style={styles.pageScroll}
          contentContainerStyle={styles.pageScrollContent}
        >
          {pageChrome()}
          {discoverBody}
        </ScrollView>
      )}

      <MarketplaceSearchSheet
        visible={filterOpen && segment === "discover"}
        initial={appliedSearch}
        lanes={lanesQ.data ?? []}
        lanesLoading={lanesQ.isLoading}
        eyebrow="Marketplace"
        title="Search live loads"
        onClose={() => setFilterOpen(false)}
        onApply={(next) => {
          setAppliedSearch(next);
          setFilterOpen(false);
        }}
      />
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
    borderRadius: 10,
    backgroundColor: Theme.buttonPrimary,
  },
  retryBtnPressed: { opacity: 0.85 },
  retryBtnText: { fontSize: 14, fontWeight: "700", color: Theme.buttonPrimaryText },
  chrome: {
    backgroundColor: Theme.cardWhite,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 14,
  },
  chromeDesktop: {
    paddingHorizontal: 32,
  },
  chromeInner: {
    width: "100%",
    gap: 12,
  },
  headerInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    width: "100%",
  },
  headerInnerMobile: {
    flexDirection: "column",
    alignItems: "stretch",
    gap: 12,
  },
  headerLeft: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  headerAccent: {
    width: 4,
    height: 44,
    borderRadius: 999,
    backgroundColor: Theme.primary,
    flexShrink: 0,
  },
  headerTextCol: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  mobileHeader: {
    width: "100%",
    gap: 10,
  },
  mobileTitleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    width: "100%",
  },
  mobileMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    width: "100%",
  },
  subtitleFlex: {
    flex: 1,
    minWidth: 0,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 0,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.1,
    color: Theme.textMuted,
  },
  lanePanel: {
    width: "100%",
    padding: 12,
    borderRadius: 16,
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.surfaceBorder,
    gap: 12,
  },
  lanePanelHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  lanePanelHint: {
    flex: 1,
    minWidth: 0,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase",
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
  awardedBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: Theme.positiveMuted,
    borderWidth: 1,
    borderColor: Theme.positiveMutedDarkBorder,
  },
  awardedBannerPressed: { opacity: 0.88 },
  awardedBannerIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Theme.cardWhite,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  awardedBannerText: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    fontWeight: "600",
    color: Theme.primaryText,
    lineHeight: 18,
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
  segmentChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    minHeight: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    backgroundColor: Theme.cardWhite,
    justifyContent: "center",
  },
  segmentChipMobile: {
    minHeight: 40,
    paddingHorizontal: 16,
  },
  segmentChipActive: {
    backgroundColor: Theme.primaryText,
    borderColor: Theme.primaryText,
  },
  segmentChipText: { fontSize: 13, fontWeight: "600", color: Theme.primaryText },
  segmentChipTextActive: { color: Theme.textOnPrimary },
  filterIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    backgroundColor: Theme.cardWhite,
    alignItems: "center",
    justifyContent: "center",
  },
  filterIconBtnActive: {
    backgroundColor: Theme.primary,
    borderColor: Theme.primary,
  },
  list: {
    flex: 1,
    width: "100%",
  },
  listContent: {
    width: "100%",
    alignSelf: "stretch",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 32,
    gap: 16,
  },
  listContentDesktop: {
    paddingHorizontal: 32,
  },
  listRow: {
    gap: 16,
    width: "100%",
    paddingHorizontal: 0,
  },
});
