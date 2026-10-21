/**
 * Pooled Marketplace opportunity detail: one live lane as an anonymous
 * requirement, one rate for every eligible load, and the identity / award →
 * trip handoff. The pool, its biddable set and this org's bid state come from
 * the server manifest (get_org_marketplace_pool); the bid scope is re-read and
 * fingerprint-checked before any write. Members are never listed: no indent
 * ids, shipper names or per-load details are shown.
 */
import { ChromeBelowTopNavLoadingScreen } from "@/components/chromeLoadingScreens";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { useOptionalOrganization } from "@/contexts/OrganizationContext";
import { MarketLoadBidSheet } from "@/features/driver/components/MarketLoadBidSheet";
import { isVehicleTypeCompatibleWithFleet } from "@/features/marketplace/utils/fleetFit.util";
import { formatMarketplaceTransactionError } from "@/features/marketplace/utils/marketplaceErrorFormat.util";
import {
  MarketplaceRouteGrid,
  titleCaseWord,
} from "@/features/network/components/MarketplaceLoadCardChrome";
import {
  PoolBidPanel,
  plural,
} from "@/features/network/components/pooled/PoolBidPanel";
import { PoolHandoffPanel } from "@/features/network/components/pooled/PoolHandoffPanel";
import { PoolStatusPill } from "@/features/network/components/pooled/PoolStatusPill";
import {
  composeFindLoadsOpportunity,
  getOrgMarketplacePool,
  listMyOrgMarketBids,
  marketBidsFromQueryData,
  marketplacePoolMemberAsLoad,
  submitOrgPoolBid,
  type OrgOpenMarketplaceLoad,
} from "@/features/network/services/findLoadsForOrg.service";
import { MARKETPLACE_LOAD_PAGE_SIZE } from "@/features/network/utils/marketplaceLoadsPage.util";
import { isMarketplaceSearchReady } from "@/features/network/utils/marketplaceSearch.util";
import {
  POOL_STATE_COPY,
  manifestFetchProgress,
  poolBidReadiness,
  poolDriftResult,
  poolKey,
  poolKeyId,
  poolSubmissionBlockReason,
  summarizeServerPool,
  type PoolBidSubmissionResult,
} from "@/features/network/utils/pooledOpportunity.util";
import { formatStoryDate } from "@/features/network/utils/storyDisplay";
import { getVehiclesByOrganization } from "@/features/vehicles/services/vehicles.service";
import { formatINR } from "@/lib/format";
import { useLayoutInsets } from "@/lib/layoutInsets";
import { STALE } from "@/lib/queryClient";
import { queryKeys } from "@/lib/queryKeys";
import { ROUTES } from "@/lib/routes";
import { useMemberAccess } from "@/lib/useMemberAccess";
import {
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { Layers, X } from "lucide-react-native";
import { useMemo, useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

const WEB_COPY = Platform.select({
  web: { whiteSpace: "pre-wrap" } as object,
  default: {},
});

const TWO_COLUMN_MIN_WIDTH = 900;
/** list_my_org_market_bids caps p_limit at 100. */
const POOL_BIDS_LIMIT = 100;

function paramString(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function dateRangeLabel(
  earliest: string | null,
  latest: string | null,
): string | null {
  if (!earliest) return null;
  const a = formatStoryDate(earliest);
  if (!latest || latest === earliest) return a;
  const b = formatStoryDate(latest);
  return a === b ? a : `${a} – ${b}`;
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.fact}>
      <Text style={styles.factLabel}>{label}</Text>
      <Text style={styles.factValue} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

export function PooledOpportunityScreen() {
  const layout = useLayoutInsets();
  const { width, height } = useWindowDimensions();
  const router = useRouter();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{
    pickup?: string;
    drop?: string;
    vehicle?: string;
  }>();
  const key = useMemo(
    () =>
      poolKey({
        pickup: paramString(params.pickup),
        drop: paramString(params.drop),
        vehicleType: paramString(params.vehicle),
      }),
    [params.pickup, params.drop, params.vehicle],
  );
  const keyReady = isMarketplaceSearchReady(key);
  const poolId = keyReady ? poolKeyId(key) : "";
  const searchKey = keyReady ? `pool:${poolId}` : "";

  const orgCtx = useOptionalOrganization();
  const organization = orgCtx?.currentOrganization ?? null;
  const orgLoading = orgCtx?.isLoading ?? orgCtx == null;
  const { can: canSurface, isLoading: accessLoading } = useMemberAccess();
  const canViewFindLoads = canSurface("tripops.pulse_loads");
  const orgId = canViewFindLoads ? (organization?.id ?? null) : null;
  const viewerCanBidCapability =
    (organization?.capabilities?.canBid ?? true) &&
    canSurface("sales.marketplace.bid");

  const [priorMemberIds, setPriorMemberIds] = useState<Set<string>>(
    () => new Set(),
  );
  /** Snapshot of the whole eligible pool taken when the rate sheet opens. */
  const [bidTargets, setBidTargets] = useState<string[] | null>(null);
  const [bidError, setBidError] = useState<string | undefined>();
  const [result, setResult] = useState<PoolBidSubmissionResult | null>(null);

  const poolQueryKey = queryKeys.findLoadsForOrg.pool(orgId ?? "", poolId);
  const poolQ = useQuery({
    queryKey: poolQueryKey,
    queryFn: async () => {
      const { error, pool } = await getOrgMarketplacePool(orgId as string, key);
      if (error) throw error;
      if (!pool) throw new Error("Pool not found.");
      return pool;
    },
    enabled: !!orgId && keyReady,
    staleTime: STALE.frequent,
  });
  const loadsError = poolQ.isError;
  const fetchProgress = useMemo(
    () => manifestFetchProgress(poolQ.data),
    [poolQ.data],
  );

  /** Org bids beyond the manifest, so awards on loads that left the pool this session stay attributable. */
  const myBidsQ = useQuery({
    queryKey: [
      ...queryKeys.findLoadsForOrg.myBids(orgId ?? ""),
      "pool",
      POOL_BIDS_LIMIT,
    ],
    queryFn: () => listMyOrgMarketBids(orgId as string, POOL_BIDS_LIMIT),
    enabled: !!orgId,
  });
  const vehiclesQ = useQuery({
    queryKey: queryKeys.vehicles.all(orgId ?? ""),
    queryFn: () => getVehiclesByOrganization(orgId as string),
    enabled: !!orgId,
  });

  const myBids = useMemo(
    () => marketBidsFromQueryData(myBidsQ.data),
    [myBidsQ.data],
  );
  const fitsFleet = isVehicleTypeCompatibleWithFleet(
    key.vehicleType,
    (vehiclesQ.data?.vehicles ?? []).map((v) => v.vehicle_type),
  );

  const summary = useMemo(() => {
    const manifest = poolQ.data;
    return summarizeServerPool({
      manifest: {
        member_count: manifest?.member_count ?? 0,
        complete: manifest?.complete ?? false,
        members: (manifest?.members ?? []).map(marketplacePoolMemberAsLoad),
        biddable_ids: manifest?.biddable_ids ?? [],
        // Manifest state last, so it wins over the bid list for member indents.
        bids: [...myBids, ...(manifest?.org_bids ?? [])],
      },
      priorMemberIds,
      canBid: (load: OrgOpenMarketplaceLoad) =>
        composeFindLoadsOpportunity(load, orgId, viewerCanBidCapability)
          .bidding.canBid,
    });
  }, [poolQ.data, myBids, priorMemberIds, orgId, viewerCanBidCapability]);
  const members = summary.members;
  const eligibleCount = summary.biddableIds.length;
  const readiness = poolBidReadiness({ fetch: fetchProgress, eligibleCount });
  const preparing = !loadsError && poolQ.data == null;

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace(ROUTES.FIND_LOADS as Href);
  };

  const refreshAfterBid = () => {
    if (!orgId) return;
    queryClient.invalidateQueries({
      queryKey: queryKeys.findLoadsForOrg.myBids(orgId),
    });
    queryClient.invalidateQueries({
      queryKey: queryKeys.findLoadsForOrg.pool(orgId, poolId),
    });
    queryClient.invalidateQueries({
      queryKey: queryKeys.findLoadsForOrg.infinite(
        orgId,
        MARKETPLACE_LOAD_PAGE_SIZE,
        searchKey,
      ),
    });
  };

  /** Returns true only when every eligible load took the rate; anything less never celebrates. */
  const submitPoolRate = async (amount: number): Promise<boolean> => {
    if (!orgId || !bidTargets) return false;
    if (!readiness.ready) {
      setBidError(readiness.blocked ?? "This pool is still being prepared.");
      return false;
    }
    const blocked = poolSubmissionBlockReason(bidTargets, summary.memberIds);
    if (blocked) {
      setBidError(blocked);
      return false;
    }
    const shown = poolQ.data;
    const { error: freshError, pool: fresh } = await getOrgMarketplacePool(orgId, key);
    if (freshError || !fresh) {
      setBidError("Couldn't load this pool. Nothing was submitted — try again.");
      return false;
    }
    if (!fresh.complete || fresh.fingerprint !== shown?.fingerprint) {
      queryClient.setQueryData(poolQueryKey, fresh);
      setBidTargets(null);
      setBidError(undefined);
      setResult(poolDriftResult(fresh.complete));
      return false;
    }
    const outcome = await submitOrgPoolBid(
      orgId,
      { indentIds: bidTargets, memberIds: new Set(fresh.members.map((m) => m.id)) },
      amount,
    );
    setResult(outcome);
    if (outcome.blocked) {
      setBidError(outcome.blocked);
      return false;
    }
    if (outcome.succeeded.length > 0) {
      setPriorMemberIds((prev) => new Set([...prev, ...outcome.succeeded]));
    }
    if (outcome.succeeded.length === 0) {
      setBidError(
        `None of the ${outcome.attempted} loads took your rate. ${formatMarketplaceTransactionError(
          outcome.failed[0]?.message ?? "",
        )}`,
      );
      return false;
    }
    if (outcome.failed.length > 0) {
      setBidTargets(null);
      setBidError(undefined);
      refreshAfterBid();
      return false;
    }
    return true;
  };

  const contentTopInset = layout.isDesktopWeb
    ? Layout.desktopTopNavOffset
    : layout.top;

  if (accessLoading)
    return <ChromeBelowTopNavLoadingScreen variant="preparing" />;
  if (!canViewFindLoads) {
    return (
      <View style={[styles.centered, { paddingTop: contentTopInset }]}>
        <Text style={styles.message}>
          You don't have access to Marketplace Loads.
        </Text>
      </View>
    );
  }
  if (!orgId) {
    return (
      <ChromeBelowTopNavLoadingScreen
        variant={orgLoading ? "preparing" : "generic"}
      />
    );
  }

  const twoColumn = !!layout.isDesktopWeb && width >= TWO_COLUMN_MIN_WIDTH;
  /** Server member count: the whole pool, also when it is too large to list. */
  const poolCount = summary.poolSize ?? members.length;
  const countLabel = plural(poolCount, "load");
  const vehicleLabel = titleCaseWord(key.vehicleType);
  const targetCount = bidTargets?.length ?? 0;
  const targetsLabel = plural(targetCount, "eligible load");
  const dates = dateRangeLabel(summary.earliestPickup, summary.latestPickup);

  const header = (
    <View style={styles.header}>
      <View style={styles.headerCopy}>
        <View style={styles.headerEyebrow}>
          <Layers size={13} color={Theme.primary} strokeWidth={2.4} />
          <Text style={styles.eyebrow}>Pooled opportunity</Text>
        </View>
        <Text style={styles.title} numberOfLines={2}>
          {keyReady ? `${key.pickup} → ${key.drop}` : "Pooled opportunity"}
        </Text>
        <Text style={styles.subtitle} numberOfLines={2}>
          {vehicleLabel} · {countLabel} · one rate for the pool
        </Text>
        <Text style={styles.stateDetail} numberOfLines={2}>
          {POOL_STATE_COPY[summary.state].detail}
        </Text>
      </View>
      <View style={styles.headerActions}>
        <PoolStatusPill state={summary.state} label={summary.stateLabel} />
        <Pressable
          onPress={handleBack}
          style={({ pressed }) => [styles.closeBtn, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Close pooled opportunity"
          hitSlop={Layout.touchTargetHitSlop}
        >
          <X size={16} color={Theme.textPrimaryDark} strokeWidth={2.4} />
        </Pressable>
      </View>
    </View>
  );

  const summaryCard = (
    <View style={styles.card} testID="pool-requirement">
      <Text style={styles.cardEyebrow}>
        {countLabel.toUpperCase()} IN THIS POOL
      </Text>
      <View style={styles.routePanel}>
        <MarketplaceRouteGrid
          pickup={key.pickup}
          drop={key.drop}
          dropLabel="Destination"
        />
      </View>
      <View style={styles.facts}>
        <Fact label="Vehicle" value={vehicleLabel || "—"} />
        <Fact label="Loads in pool" value={String(poolCount)} />
        <Fact label="Pickup window" value={dates ?? "Not listed"} />
        <Fact
          label="Material"
          value={
            summary.loadTypes.length > 0
              ? summary.loadTypes.map(titleCaseWord).join(", ")
              : "Not listed"
          }
        />
        <Fact
          label="Shippers"
          value={
            summary.shipperCount > 0
              ? `${summary.shipperCount} · identity hidden`
              : "Identity hidden"
          }
        />
      </View>
    </View>
  );

  const bidPanel = (
    <View style={styles.stack}>
      <PoolBidPanel
        state={summary.state}
        eligibleCount={eligibleCount}
        preparing={preparing}
        blockedReason={readiness.blocked}
        targetRateMin={summary.targetRateMin}
        targetRateMax={summary.targetRateMax}
        canBidCapability={viewerCanBidCapability}
        fitsFleet={fitsFleet}
        result={result}
        onBid={() => {
          if (!readiness.ready) return;
          setBidError(undefined);
          setResult(null);
          setBidTargets([...summary.biddableIds]);
        }}
      />
    </View>
  );

  const handoff = (
    <PoolHandoffPanel
      awardedBids={summary.awardedBids}
      onOpenAwarded={() => router.push(ROUTES.FIND_LOADS_MY_BIDS as Href)}
    />
  );

  const loadsBody = !keyReady ? (
    <Text style={styles.message}>
      This pool link is incomplete. Go back and pick a pool.
    </Text>
  ) : poolQ.isError ? (
    <View style={styles.stateBox}>
      <Text style={styles.message}>Couldn't load this pool.</Text>
      <Pressable
        onPress={() => poolQ.refetch()}
        style={({ pressed }) => [styles.retryBtn, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel="Retry"
      >
        <Text style={styles.retryBtnText}>Retry</Text>
      </Pressable>
    </View>
  ) : preparing ? (
    <Text style={styles.message} testID="pool-preparing">
      {poolCount > 0 ? `Preparing ${countLabel}…` : "Preparing pool…"}
    </Text>
  ) : fetchProgress.complete && members.length === 0 ? (
    <Text style={styles.message}>
      No loads in this pool are open right now.
    </Text>
  ) : null;
  const showCommercial = keyReady && !poolQ.isError;

  const dialogMaxHeight = Math.max(
    420,
    height - contentTopInset - layout.bottom - 32,
  );

  return (
    <View
      style={[
        styles.overlay,
        {
          paddingTop: contentTopInset + 16,
          paddingBottom: layout.bottom + 16,
          paddingLeft: 16 + layout.left,
          paddingRight: 16 + layout.right,
        },
      ]}
    >
      <Pressable
        style={styles.backdrop}
        onPress={handleBack}
        accessibilityRole="button"
        accessibilityLabel="Close pooled opportunity"
      />
      <View
        style={[
          styles.dialog,
          { maxHeight: Math.min(dialogMaxHeight, 840) },
          twoColumn ? styles.dialogWide : styles.dialogNarrow,
        ]}
        accessibilityViewIsModal
      >
        {header}
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {twoColumn ? (
            <View style={styles.columns}>
              <View style={styles.mainCol}>
                {summaryCard}
                {loadsBody}
              </View>
              <View style={styles.sideCol}>
                {showCommercial ? bidPanel : null}
                {handoff}
              </View>
            </View>
          ) : (
            <View style={styles.stack}>
              {summaryCard}
              {showCommercial ? bidPanel : null}
              {handoff}
              {loadsBody}
            </View>
          )}
        </ScrollView>
      </View>

      <MarketLoadBidSheet
        visible={bidTargets != null}
        onClose={() => {
          setBidTargets(null);
          setBidError(undefined);
        }}
        onSubmitAmount={submitPoolRate}
        onSuccessDone={refreshAfterBid}
        shipperName={`Pooled opportunity · ${countLabel}`}
        pickup={key.pickup}
        drop={key.drop}
        vehicleType={key.vehicleType}
        targetRateInr={summary.targetRateMin}
        entryLabel="Your rate for this pooled opportunity"
        contextLine={`Applies to all ${targetsLabel} in this pool`}
        submitLabel="Submit rate for pool"
        confirmCopy={{
          scopeNote: `Your rate will be submitted for all ${targetsLabel} in this pool. The shipper reviews bids; nothing is awarded until the shipper accepts.`,
          feeNote: (fee) =>
            `The Marketplace fee is per awarded load: you pay Pulse ${formatINR(fee)} for each load the shipper awards you at this rate.`,
          successTitle: "Rate submitted for pool",
          successSubtitle: `Your rate has been submitted for all ${plural(targetCount, "load")}.`,
        }}
        validationError={bidError}
        onClearValidationError={() => setBidError(undefined)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.overlayBackdrop,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  dialog: {
    width: "100%",
    backgroundColor: Theme.cardWhite,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Theme.actionBtnGhostBorder,
    overflow: "hidden",
    zIndex: 1,
  },
  dialogWide: { maxWidth: 1080 },
  dialogNarrow: { maxWidth: 560 },
  scroll: { flexGrow: 0, flexShrink: 1, width: "100%" },
  content: {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 20,
    gap: 16,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 0,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.actionBtnGhostBorder,
    backgroundColor: Theme.cardWhite,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCopy: { flex: 1, minWidth: 0, gap: 4 },
  headerEyebrow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: "500",
    letterSpacing: 0,
    color: Theme.primary,
    ...WEB_COPY,
  },
  title: {
    fontSize: 18,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    letterSpacing: 0,
    lineHeight: 24,
    ...WEB_COPY,
  },
  subtitle: {
    fontSize: 12,
    fontWeight: "500",
    color: Theme.textSecondary,
    lineHeight: 17,
    letterSpacing: 0,
    ...WEB_COPY,
  },
  stateDetail: {
    fontSize: 12,
    lineHeight: 16,
    color: Theme.textMuted,
    letterSpacing: 0,
    ...WEB_COPY,
  },
  columns: { flexDirection: "row", alignItems: "flex-start", gap: 16 },
  mainCol: { flex: 1, minWidth: 0, gap: 14 },
  sideCol: { width: 340, flexShrink: 0, gap: 14 },
  stack: { gap: 14 },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Theme.surfaceBorder,
    backgroundColor: Theme.cardWhite,
    padding: 20,
    gap: 16,
  },
  cardEyebrow: {
    fontSize: 11,
    fontWeight: "500",
    letterSpacing: 0,
    color: Theme.textMuted,
    ...WEB_COPY,
  },
  routePanel: {
    padding: 14,
    borderRadius: 12,
    backgroundColor: Theme.analyticsCanvas,
    borderWidth: 1,
    borderColor: Theme.surfaceBorder,
  },
  facts: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  fact: {
    minWidth: 140,
    flexGrow: 1,
    flexBasis: "30%",
    gap: 4,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: Theme.analyticsCanvas,
    borderWidth: 1,
    borderColor: Theme.surfaceBorder,
  },
  factLabel: {
    fontSize: 10,
    fontWeight: "500",
    letterSpacing: 0,
    textTransform: "uppercase",
    color: Theme.textMuted,
    ...WEB_COPY,
  },
  factValue: {
    fontSize: 14,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    lineHeight: 18,
    ...WEB_COPY,
  },
  stateBox: { alignItems: "center", gap: 12, paddingVertical: 24 },
  message: {
    fontSize: 15,
    color: Theme.textSecondary,
    textAlign: "center",
    paddingVertical: 16,
  },
  retryBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    minHeight: Layout.minTouchTargetSize,
    justifyContent: "center",
    borderRadius: 10,
    backgroundColor: Theme.buttonPrimary,
  },
  retryBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: Theme.buttonPrimaryText,
  },
  pressed: { opacity: 0.85 },
});
