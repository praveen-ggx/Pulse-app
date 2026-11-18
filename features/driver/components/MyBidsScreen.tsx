/**
 * Phase A/B — My Bids: this DCO's own market_bids rows.
 * Status comes directly from market_bids.status, never inferred from trip
 * existence. Route text for an accepted bid is resolved by matching
 * indent_id against this driver's own awarded trips (trips_driver_view) —
 * market_bids itself carries no route fields, and a DCO cannot read
 * `indents` directly (org-scoped RLS), so this is the only route text
 * available without a backend change.
 */
import {
  DRIVER_DETAIL_HORIZONTAL_PAD,
  DriverSubScreenHeader,
  driverDetailPageBackground,
} from '@/components/driver/DriverSubScreenHeader';
import Theme from '@/constants/Theme';
import { useAuth } from '@/contexts/AuthContext';
import { useDriverTheme, useDriverThemeColors } from '@/contexts/DriverThemeContext';
import { DriverWorkOpportunityCard } from '@/features/driver/components/DriverWorkOpportunityCard';
import type { FleetOwnerOpenLoad } from '@/features/driver/services/fleetOwnerLoads.service';
import {
  formatMarketBidAmount,
  marketBidStatusLabel,
  type FeePaymentStatus,
  type MarketBidRow,
} from '@/features/driver/services/marketBids.service';
import { useFleetOwnerOpenLoadsQuery } from '@/lib/queries/useFleetOwnerOpenLoadsQuery';
import { useMyMarketAwardsQuery } from '@/lib/queries/useMyMarketAwardsQuery';
import { useMyMarketBidsQuery } from '@/lib/queries/useMyMarketBidsQuery';
import { ROUTES } from '@/lib/routes';
import type { DriverTripRow } from '@/types/trip-views';
import { useRouter, type Href } from 'expo-router';
import { Inbox } from 'lucide-react-native';
import { useMemo, type ReactNode } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LaneBidInvitesCard } from '@/features/network/components/laneOffers/LaneBidInvitesCard';

function formatSubmittedAt(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function feePaymentGateSatisfied(status: FeePaymentStatus): boolean {
  return status === 'paid' || status === 'not_required';
}

function feePendingLabel(status: FeePaymentStatus, feeAmount: number | null): string {
  const feeLabel = feeAmount != null ? formatMarketBidAmount(feeAmount) : 'the Marketplace fee';
  switch (status) {
    case 'pending':
      return `Payment of ${feeLabel} did not finish. Open the job to complete payment.`;
    case 'failed':
      return `Payment of ${feeLabel} failed — retry to unlock this job.`;
    case 'required':
    default:
      return `Pay ${feeLabel} to Pulse to unlock this job.`;
  }
}

function isAssignedLike(status: string): boolean {
  const s = (status || '').toLowerCase();
  return s === 'assigned' || s === 'pending' || s === 'scheduled';
}

function isActiveLike(status: string): boolean {
  const s = (status || '').toLowerCase();
  return (
    s === 'in_progress' ||
    s === 'in_transit' ||
    s === 'transit' ||
    s === 'picked_up' ||
    s === 'pickup' ||
    s === 'started'
  );
}

/**
 * Shared My Bids content — used both by the standalone My Bids route (kept,
 * unlinked from primary nav) and inline as Market's "My Bids" segment.
 * No header/root background here; the caller owns the shell.
 */
export function MyBidsContent({
  uid,
  listHeader,
}: {
  uid: string;
  /** Optional chrome that scrolls with the list (Market segment, etc.). */
  listHeader?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { isDark } = useDriverTheme();
  const colors = useDriverThemeColors();
  const cardBorder = isDark ? colors.borderSubtle : 'rgba(226,232,240,0.95)';

  const { bids, isLoading, isRefetching, refetch, error } = useMyMarketBidsQuery(uid);
  const { awards } = useMyMarketAwardsQuery(uid);
  const { loads } = useFleetOwnerOpenLoadsQuery(uid);

  const loadById = useMemo(() => {
    const map = new Map<string, (typeof loads)[number]>();
    for (const load of loads) map.set(load.id, load);
    return map;
  }, [loads]);

  const awardByIndentId = useMemo(() => {
    const map = new Map<string, DriverTripRow>();
    for (const trip of awards) {
      if (!trip.indent_id) continue;
      const existing = map.get(trip.indent_id);
      // Prefer the non-cancelled canonical trip if a stale cancelled one also matches.
      if (!existing || (existing.status === 'cancelled' && trip.status !== 'cancelled')) {
        map.set(trip.indent_id, trip);
      }
    }
    return map;
  }, [awards]);

  // Lifecycle fix: `market_bids.status` never leaves 'accepted' once
  // awarded — the trip's own status is the only real signal of what
  // happened next, and it's already available here via awardByIndentId.
  // A completed trip must not keep showing under Awarded; a cancelled
  // trip is no longer actionable either, but isn't "Completed" -- it goes
  // to the closed/"Not selected" bucket, where BidCard renders it as
  // "Cancelled" without needing a new DB status.
  const groups = useMemo(() => {
    const pending: MarketBidRow[] = [];
    const awarded: MarketBidRow[] = [];
    const completed: MarketBidRow[] = [];
    const closed: MarketBidRow[] = [];
    for (const b of bids) {
      if (b.status === 'pending') {
        pending.push(b);
      } else if (b.status === 'accepted') {
        const trip = awardByIndentId.get(b.indent_id);
        if (trip?.status === 'completed') completed.push(b);
        else if (trip?.status === 'cancelled') closed.push(b);
        else awarded.push(b);
      } else {
        closed.push(b);
      }
    }
    return { pending, awarded, completed, closed };
  }, [bids, awardByIndentId]);

  const renderAwardCard = (b: MarketBidRow) => {
    const trip = awardByIndentId.get(b.indent_id);
    return (
      <BidCard
        key={b.id}
        bid={b}
        load={loadById.get(b.indent_id)}
        trip={trip}
        onViewTrip={(tripId) => {
          const t = awardByIndentId.get(b.indent_id);
          if (t && (isAssignedLike(t.status) || isActiveLike(t.status))) {
            router.replace(ROUTES.DRIVER_ROOT as Href);
            return;
          }
          router.push(`/driver-trip/${tripId}` as Href);
        }}
        onOpenDetail={() => router.push(ROUTES.driverAvailableLoad(b.indent_id) as Href)}
        onBid={
          trip
            ? undefined
            : () => router.push(ROUTES.driverAvailableLoad(b.indent_id, { bid: true }) as Href)
        }
        onPress={
          trip
            ? () => {
                if (isAssignedLike(trip.status) || isActiveLike(trip.status)) {
                  router.replace(ROUTES.DRIVER_ROOT as Href);
                  return;
                }
                router.push(`/driver-trip/${trip.id}` as Href);
              }
            : () => router.push(ROUTES.driverAvailableLoad(b.indent_id) as Href)
        }
      />
    );
  };

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{
        paddingBottom: Math.max(insets.bottom, 16) + 24,
        paddingTop: listHeader ? 0 : 10,
        gap: 14,
      }}
      refreshControl={
        <RefreshControl
          refreshing={isRefetching}
          onRefresh={() => void refetch()}
          tintColor={colors.emerald}
        />
      }
      showsVerticalScrollIndicator={false}
    >
      {listHeader}
      <View style={{ paddingHorizontal: DRIVER_DETAIL_HORIZONTAL_PAD, gap: 14 }}>
      <LaneBidInvitesCard onResponded={() => void refetch()} />
      {error ? (
        <Text style={styles.errorText}>
          {error instanceof Error ? error.message : 'Could not load your bids.'}
        </Text>
      ) : null}

      {isLoading ? (
        <ActivityIndicator color={colors.emerald} style={{ marginTop: 28 }} />
      ) : bids.length === 0 ? (
        <View style={[styles.empty, { backgroundColor: isDark ? colors.surface : Theme.cardWhite, borderColor: cardBorder }]}>
          <Inbox size={22} color={colors.emerald} />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>No bids yet</Text>
          <Text style={[styles.emptyBody, { color: colors.textMuted }]}>
            Bid on an open Market load and it will show up here.
          </Text>
        </View>
      ) : (
        <>
          {groups.awarded.length > 0 ? (
            <Section title="Awarded" count={groups.awarded.length} colors={colors}>
              {groups.awarded.map(renderAwardCard)}
            </Section>
          ) : null}

          {groups.completed.length > 0 ? (
            <Section title="Completed" count={groups.completed.length} colors={colors}>
              {groups.completed.map(renderAwardCard)}
            </Section>
          ) : null}

          {groups.pending.length > 0 ? (
            <Section title="Pending" count={groups.pending.length} colors={colors}>
              {groups.pending.map((b) => (
                <BidCard
                  key={b.id}
                  bid={b}
                  load={loadById.get(b.indent_id)}
                  onOpenDetail={() =>
                    router.push(ROUTES.driverAvailableLoad(b.indent_id) as Href)
                  }
                  onBid={() =>
                    router.push(ROUTES.driverAvailableLoad(b.indent_id, { bid: true }) as Href)
                  }
                />
              ))}
            </Section>
          ) : null}

          {groups.closed.length > 0 ? (
            <Section title="Not selected" count={groups.closed.length} colors={colors}>
              {groups.closed.map((b) => (
                <BidCard
                  key={b.id}
                  bid={b}
                  load={loadById.get(b.indent_id)}
                  onOpenDetail={() =>
                    router.push(ROUTES.driverAvailableLoad(b.indent_id) as Href)
                  }
                />
              ))}
            </Section>
          ) : null}
        </>
      )}
      </View>
    </ScrollView>
  );
}

/** Standalone route wrapper — kept, but unlinked from primary Market nav now that My Bids is a Market segment. */
export default function MyBidsScreen() {
  const router = useRouter();
  const { profile } = useAuth();
  const uid = profile?.uid ?? '';
  const { isDark } = useDriverTheme();
  const colors = useDriverThemeColors();
  const pageBg = driverDetailPageBackground(isDark, colors.background);

  return (
    <View style={[styles.root, { backgroundColor: pageBg }]}>
      <DriverSubScreenHeader
        title="My Bids"
        subtitle="Market"
        onBack={() =>
          router.canGoBack()
            ? router.back()
            : router.replace(ROUTES.driverAvailableLoads() as Href)
        }
      />
      {uid ? <MyBidsContent uid={uid} /> : null}
    </View>
  );
}

function Section({
  title,
  count,
  colors,
  children,
}: {
  title: string;
  count: number;
  colors: ReturnType<typeof useDriverThemeColors>;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>
        {title.toUpperCase()} · {count}
      </Text>
      <View style={styles.sectionCards}>{children}</View>
    </View>
  );
}

function BidCard({
  bid,
  load,
  trip,
  onViewTrip,
  onOpenDetail,
  onBid,
  onPress,
}: {
  bid: MarketBidRow;
  load?: FleetOwnerOpenLoad;
  trip?: DriverTripRow;
  onViewTrip?: (tripId: string) => void;
  onOpenDetail?: () => void;
  onBid?: () => void;
  onPress?: () => void;
}) {
  const rawAccepted = bid.status === 'accepted';
  const isCompleted = rawAccepted && trip?.status === 'completed';
  const isCancelledTrip = rawAccepted && trip?.status === 'cancelled';
  const isActiveAward = rawAccepted && !isCompleted && !isCancelledTrip;
  const feePending = isActiveAward && !feePaymentGateSatisfied(bid.fee_payment_status);
  const statusLabel = isCompleted
    ? 'Completed'
    : isCancelledTrip
      ? 'Cancelled'
      : isActiveAward
        ? 'Awarded'
        : marketBidStatusLabel(bid.status);
  const ctaLabel =
    trip && onViewTrip
      ? isAssignedLike(trip.status) || isActiveLike(trip.status)
        ? 'Open job'
        : 'View trip'
      : null;
  const shipper =
    (trip?.organization_name ?? load?.creator_organization_name ?? '').trim() || 'Shipper';
  const origin = trip?.pickup_location || load?.pickup_area;
  const destination = trip?.dropoff_location || load?.drop_location;
  const amount = formatMarketBidAmount(bid.amount) || 'Rate hidden';
  const superseded =
    bid.status === 'superseded'
      ? 'Another load was awarded to you, so this bid is no longer active.'
      : null;

  let primary: Parameters<typeof DriverWorkOpportunityCard>[0]['primaryCta'] = null;
  if (ctaLabel && trip && onViewTrip) {
    primary = {
      title: ctaLabel,
      hint: feePending
        ? feePendingLabel(bid.fee_payment_status, bid.platform_fee_amount)
        : isCompleted
          ? 'Job finished'
          : 'Continue on Dashboard',
      onPress: () => onViewTrip(trip.id),
    };
  } else if (bid.status === 'pending' && onBid) {
    primary = {
      title: 'Revise bid',
      hint: `Your bid ${amount}`,
      variant: 'quoted',
      onPress: onBid,
    };
  } else {
    primary = {
      title: statusLabel,
      variant: 'info',
      onPress: onOpenDetail ?? onPress ?? (() => {}),
    };
  }

  return (
    <DriverWorkOpportunityCard
      orgName={shipper}
      orgLogoUrl={load?.creator_organization_logo_url}
      orgAvatarSeed={load?.creator_organization_avatar_seed}
      orgSeed={load?.creator_organization_id ?? bid.indent_id}
      kicker={
        isCompleted
          ? 'Job · Completed'
          : feePending
            ? 'Job · Payment required'
            : isActiveAward
              ? 'Job · Awarded'
              : bid.status === 'pending'
                ? 'Quoted bid'
                : statusLabel
      }
      badge={isActiveAward || isCompleted ? 'awarded' : bid.status === 'pending' ? 'quoted' : null}
      origin={origin}
      destination={destination}
      vehicleType={load?.vehicle_type}
      material={load?.load_type}
      pickupDate={load?.pickup_date ?? trip?.pickup_scheduled_at}
      targetLabel={isActiveAward || isCompleted ? 'Your payout' : 'Your bid'}
      targetValue={amount}
      extra={
        <>
          {feePending ? (
            <Text style={styles.noteEmphasis}>
              {feePendingLabel(bid.fee_payment_status, bid.platform_fee_amount)}
            </Text>
          ) : null}
          {bid.note ? (
            <Text style={styles.note} numberOfLines={2}>
              {bid.note}
            </Text>
          ) : null}
          {superseded ? (
            <Text style={styles.note} numberOfLines={2}>
              {superseded}
            </Text>
          ) : null}
          <Text style={styles.meta}>Submitted {formatSubmittedAt(bid.created_at)}</Text>
        </>
      }
      primaryCta={primary}
      secondaryCta={
        isActiveAward && trip
          ? null
          : onOpenDetail || onPress
            ? {
                title: 'Full view',
                onPress: onOpenDetail ?? onPress ?? (() => {}),
              }
            : null
      }
    />
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  section: { gap: 7 },
  sectionCards: { gap: 8 },
  sectionTitle: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.55,
    lineHeight: 13,
    includeFontPadding: false,
  },
  note: {
    fontSize: 11,
    fontWeight: '500',
    lineHeight: 15,
    color: Theme.textMuted,
    includeFontPadding: false,
  },
  noteEmphasis: {
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 15,
    color: Theme.textMuted,
    includeFontPadding: false,
  },
  meta: {
    fontSize: 10,
    fontWeight: '500',
    lineHeight: 13,
    color: Theme.textMuted,
    includeFontPadding: false,
  },
  empty: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    gap: 6,
  },
  emptyTitle: { fontSize: 14, fontWeight: '700', letterSpacing: -0.15 },
  emptyBody: { fontSize: 12, lineHeight: 17 },
  errorText: { color: Theme.negative, fontSize: 12, fontWeight: '600' },
});
