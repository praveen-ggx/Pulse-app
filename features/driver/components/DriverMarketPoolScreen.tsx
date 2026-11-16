/**
 * Driver Marketplace pooled opportunity: one pickup × drop × vehicle pool from
 * the server DCO manifest (get_dco_marketplace_pool), bid on with one rate for
 * every eligible load; the scope is re-read and fingerprint-checked before any
 * write. The shipper stays anonymous and no individual load can be picked or
 * bid on here.
 */
import {
  DRIVER_DETAIL_HORIZONTAL_PAD,
  DriverSubScreenHeader,
  driverDetailPageBackground,
} from '@/components/driver/DriverSubScreenHeader';
import Theme from '@/constants/Theme';
import { useAuth } from '@/contexts/AuthContext';
import { useDriverTheme, useDriverThemeColors } from '@/contexts/DriverThemeContext';
import { MarketLoadBidSheet } from '@/features/driver/components/MarketLoadBidSheet';
import { isLoadCompatibleWithFleet } from '@/features/driver/services/fleetOwnerLoads.service';
import {
  formatMarketBidSubmitError,
  getDcoMarketplacePool,
  submitDcoPoolBid,
} from '@/features/driver/services/marketBids.service';
import {
  driverPoolEyebrow,
  driverPoolReadiness,
  summarizeDcoManifestPool,
} from '@/features/driver/utils/driverMarketPools.util';
import { plural, PoolBidPanel } from '@/features/network/components/pooled/PoolBidPanel';
import {
  POOL_STATE_COPY,
  POOL_TOO_LARGE_MESSAGE,
  poolDriftResult,
  poolKey,
  poolKeyId,
  poolSubmissionBlockReason,
  type PoolBidSubmissionResult,
} from '@/features/network/utils/pooledOpportunity.util';
import { isVehicleTypeCompatibleWithFleet } from '@/features/marketplace/utils/fleetFit.util';
import { formatINR } from '@/lib/format';
import { useDriverOperatingModeQuery } from '@/lib/queries/useDriverOperatingModeQuery';
import { useMyMarketBidsQuery } from '@/lib/queries/useMyMarketBidsQuery';
import { useOwnerVehiclesQuery } from '@/lib/queries/useOwnerVehiclesQuery';
import { STALE } from '@/lib/queryClient';
import { queryKeys } from '@/lib/queryKeys';
import { ROUTES } from '@/lib/routes';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

function dateLabel(value: string | null): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function pickupWindow(earliest: string | null, latest: string | null): string | null {
  const a = dateLabel(earliest);
  const b = dateLabel(latest);
  if (!a || !b) return a ?? b;
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

export default function DriverMarketPoolScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const uid = profile?.uid ?? '';
  const { isDark } = useDriverTheme();
  const colors = useDriverThemeColors();
  const pageBg = driverDetailPageBackground(isDark, colors.background);
  const params = useLocalSearchParams<{ pickup?: string; drop?: string; vehicle?: string }>();
  const key = useMemo(
    () => poolKey({ pickup: params.pickup, drop: params.drop, vehicleType: params.vehicle }),
    [params.pickup, params.drop, params.vehicle],
  );
  const keyReady = !!(key.pickup && key.drop && key.vehicleType);

  const { marketplaceAllowed, isLoading: modeLoading } = useDriverOperatingModeQuery(uid);
  const poolId = keyReady ? poolKeyId(key) : '';
  const poolQueryKey = queryKeys.driverApp.dcoMarketPool(uid, poolId);
  const poolQ = useQuery({
    queryKey: poolQueryKey,
    queryFn: async () => {
      const { error: poolError, pool } = await getDcoMarketplacePool(key);
      if (poolError) throw poolError;
      if (!pool) throw new Error('Pool not found.');
      return pool;
    },
    enabled: !!uid && keyReady && marketplaceAllowed,
    staleTime: STALE.frequent,
  });
  const { isLoading, error, refetch } = poolQ;
  const manifest = poolQ.data ?? null;
  const { bids } = useMyMarketBidsQuery(uid);
  const { vehicles } = useOwnerVehiclesQuery(uid);

  const [priorMemberIds, setPriorMemberIds] = useState<ReadonlySet<string>>(() => new Set());
  const [bidTargets, setBidTargets] = useState<string[] | null>(null);
  const [bidError, setBidError] = useState<string | undefined>(undefined);
  const [result, setResult] = useState<PoolBidSubmissionResult | null>(null);

  const activeVehicles = useMemo(() => vehicles.filter((v) => v.status === 'active'), [vehicles]);
  const canBid = marketplaceAllowed && activeVehicles.length > 0;
  const fitsFleet = isVehicleTypeCompatibleWithFleet(
    key.vehicleType,
    vehicles.map((v) => v.vehicle_type),
  );

  const summary = useMemo(
    () => summarizeDcoManifestPool({ manifest, bids, priorMemberIds, canBid }),
    [manifest, bids, priorMemberIds, canBid],
  );
  const members = summary.members;
  const eligibleCount = summary.biddableIds.length;
  const readiness = !manifest
    ? { ready: false, blocked: null }
    : manifest.complete
      ? driverPoolReadiness({ readComplete: true, eligibleCount })
      : { ready: false, blocked: POOL_TOO_LARGE_MESSAGE };
  /** Server member count: the whole pool, also when it is too large to list. */
  const poolCount = manifest?.member_count ?? members.length;
  const countLabel = plural(poolCount, 'load');
  const targetCount = bidTargets?.length ?? 0;
  const targetsLabel = plural(targetCount, 'eligible load');

  const refreshAfterBid = () => {
    if (!uid) return;
    void queryClient.invalidateQueries({ queryKey: queryKeys.driverApp.myMarketBids(uid) });
    void queryClient.invalidateQueries({ queryKey: poolQueryKey });
    void queryClient.invalidateQueries({
      queryKey: queryKeys.driverApp.fleetOwnerOpenLoads(uid),
    });
  };

  /** True only when every eligible load took the rate. */
  const submitPoolRate = async (amount: number): Promise<boolean> => {
    if (!bidTargets) return false;
    if (!readiness.ready) {
      setBidError(readiness.blocked ?? 'This pool is still being prepared.');
      return false;
    }
    const blocked = poolSubmissionBlockReason(bidTargets, summary.memberIds);
    if (blocked) {
      setBidError(blocked);
      return false;
    }
    const { error: freshError, pool: fresh } = await getDcoMarketplacePool(key);
    if (freshError || !fresh) {
      setBidError("Couldn't load this pool. Nothing was submitted — try again.");
      return false;
    }
    if (!fresh.complete || fresh.fingerprint !== manifest?.fingerprint) {
      queryClient.setQueryData(poolQueryKey, fresh);
      setBidTargets(null);
      setBidError(undefined);
      setResult(poolDriftResult(fresh.complete));
      return false;
    }
    const preferredVehicle =
      activeVehicles.find((v) =>
        members[0] ? isLoadCompatibleWithFleet(members[0], [v.vehicle_type]) : false,
      ) ?? activeVehicles[0];
    const outcome = await submitDcoPoolBid(
      { indentIds: bidTargets, memberIds: new Set(fresh.members.map((m) => m.id)) },
      amount,
      preferredVehicle?.id ?? null,
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
        `None of the ${outcome.attempted} loads took your rate. ${formatMarketBidSubmitError(
          outcome.failed[0]?.message ?? '',
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

  const goBack = () =>
    router.canGoBack() ? router.back() : router.replace(ROUTES.driverAvailableLoads());

  const loading = modeLoading || (marketplaceAllowed && isLoading);
  const body = !keyReady ? (
    <Text style={[styles.message, { color: colors.textMuted }]}>
      This pool link is incomplete. Go back and pick a pool.
    </Text>
  ) : !marketplaceAllowed ? (
    <Text style={[styles.message, { color: colors.textMuted }]}>
      Marketplace bidding is available to DCOs with an active vehicle.
    </Text>
  ) : error ? (
    <View style={styles.stateBox}>
      <Text style={[styles.message, { color: colors.textMuted }]}>Couldn't load this pool.</Text>
      <Pressable
        onPress={() => void refetch()}
        style={({ pressed }) => [styles.retryBtn, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel="Retry"
      >
        <Text style={styles.retryText}>Retry</Text>
      </Pressable>
    </View>
  ) : poolCount === 0 && summary.awardedBids.length === 0 ? (
    <Text style={[styles.message, { color: colors.textMuted }]}>
      No loads in this pool are open right now.
    </Text>
  ) : (
    <>
      <View style={styles.card} testID="driver-pool-requirement">
        <Text style={styles.eyebrow}>{driverPoolEyebrow(poolCount, true)}</Text>
        <Text style={styles.route} numberOfLines={2}>
          {key.pickup} → {key.drop}
        </Text>
        <Text style={styles.stateDetail}>{POOL_STATE_COPY[summary.state].detail}</Text>
        <View style={styles.facts}>
          <Fact label="Vehicle" value={key.vehicleType} />
          <Fact label="Loads in pool" value={String(poolCount)} />
          <Fact
            label="Pickup window"
            value={pickupWindow(summary.earliestPickup, summary.latestPickup) ?? 'Not listed'}
          />
          <Fact
            label="Material"
            value={summary.loadTypes.length > 0 ? summary.loadTypes.join(', ') : 'Not listed'}
          />
          <Fact label="Shipper" value="Identity hidden" />
        </View>
      </View>

      <PoolBidPanel
        state={summary.state}
        eligibleCount={eligibleCount}
        preparing={false}
        blockedReason={readiness.blocked}
        targetRateMin={summary.targetRateMin}
        targetRateMax={summary.targetRateMax}
        canBidCapability={canBid}
        fitsFleet={fitsFleet}
        result={result}
        onBid={() => {
          if (!readiness.ready) return;
          setBidError(undefined);
          setResult(null);
          setBidTargets([...summary.biddableIds]);
        }}
      />

      {summary.awardedBids.length > 0 ? (
        <View style={styles.card}>
          <Text style={styles.stateDetail}>
            {plural(summary.awardedBids.length, 'load')} from this pool awarded to you. The
            shipper is shown once the Marketplace fee is settled.
          </Text>
          <Pressable
            onPress={() => router.push(ROUTES.driverMyBids() as Href)}
            style={({ pressed }) => [styles.retryBtn, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Open My Bids"
          >
            <Text style={styles.retryText}>Open My Bids</Text>
          </Pressable>
        </View>
      ) : null}
    </>
  );

  return (
    <View style={[styles.root, { backgroundColor: pageBg }]}>
      <DriverSubScreenHeader title="Pooled opportunity" subtitle="Market" onBack={goBack} />
      {loading ? (
        <ActivityIndicator color={colors.emerald} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: DRIVER_DETAIL_HORIZONTAL_PAD,
            paddingTop: 12,
            paddingBottom: Math.max(insets.bottom, 16) + 24,
            gap: 12,
          }}
        >
          {body}
        </ScrollView>
      )}

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
        targetRateMaxInr={summary.targetRateMax}
        entryLabel="Your rate for this pooled opportunity"
        contextLine={`Applies to all ${targetsLabel} in this pool`}
        submitLabel="Submit rate for pool"
        confirmCopy={{
          scopeNote: `Your rate will be submitted for all ${targetsLabel} in this pool. The shipper reviews bids; nothing is awarded until the shipper accepts.`,
          feeNote: (fee) =>
            `The Marketplace fee is per awarded load: you pay Pulse ${formatINR(fee)} for each load the shipper awards you at this rate.`,
          successTitle: 'Rate submitted for pool',
          successSubtitle: `Your rate has been submitted for all ${plural(targetCount, 'load')}.`,
        }}
        validationError={bidError}
        onClearValidationError={() => setBidError(undefined)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Theme.surfaceBorder,
    backgroundColor: Theme.cardWhite,
    padding: 16,
    gap: 8,
  },
  eyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 1.1, color: Theme.primary },
  route: { fontSize: 16, fontWeight: '800', color: Theme.textPrimaryDark },
  stateDetail: { fontSize: 13, color: Theme.textSecondary, lineHeight: 18 },
  facts: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 4 },
  fact: { minWidth: '40%', flexGrow: 1, flexBasis: 0, gap: 2 },
  factLabel: { fontSize: 11, fontWeight: '600', color: Theme.textMuted },
  factValue: { fontSize: 14, fontWeight: '700', color: Theme.textPrimaryDark },
  message: { fontSize: 13, lineHeight: 18, marginTop: 24, textAlign: 'center' },
  stateBox: { alignItems: 'center', gap: 10 },
  retryBtn: {
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Theme.primary,
  },
  retryText: { color: Theme.buttonPrimaryText, fontSize: 13, fontWeight: '700' },
  pressed: { opacity: 0.88 },
});
