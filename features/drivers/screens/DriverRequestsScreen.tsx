import { DriverSelfAvatar } from '@/components/driver/DriverSelfAvatar';
import { useDriverAvatarUri } from '@/lib/avatarUpload';
import { LoadingIndicator } from "@/components/LoadingIndicator";
import { resolveDriverOrgAvatarUri } from '@/features/drivers/utils/resolveDriverOrgAvatar.util';
import { useOrgBrandingByIds } from '@/lib/hooks/useOrgBrandingByIds';
import {
  buildDriverTripNumberMap,
  getDriverTripDisplayNumber,
} from '@/features/driver/utils/driverTripSequence.util';
import { DriverBrandMark } from '@/components/driver/DriverBrandMark';
import { DriverInviteCard } from '@/components/driver/DriverInviteCard';
import Layout from '@/constants/Layout';
import Theme from '@/constants/Theme';
import {
  buildOfferText,
  isCompletedStatus,
  resolveDriverTripPayoutTerms,
  tripEarningsForDriver,
} from '@/features/drivers/utils/driverUtils.util';
import { phonePeMetaDate } from '@/features/driver/utils/driverGpayTransactions.util';
import { useAuth } from '@/contexts/AuthContext';
import { useDriverTheme, useDriverThemeColors } from '@/contexts/DriverThemeContext';
import * as driversService from '@/features/drivers/services/drivers.service';
import * as tripsService from '@/features/trips/services/trips.service';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  AppState,
  Image,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';


/**
 * Driver Requests page — connection invites + passbook per fleet (driver_invites, trips, driver_ledger).
 * PENDING: accept/decline. CONNECTED: accepted/declined with optional Passbook summary and link to detail.
 */
const GRAY_700 = '#374151';

type RequestsQuickTab = 'all' | 'payment_updates';

/** Per-org passbook stats (trips, earned, received from DB). */
export interface ConnectionPassbook {
  driverId: string;
  orgId: string;
  orgName: string;
  tripsCount: number;
  completedCount: number;
  totalEarned: number;
  totalReceived: number;
  pendingAmount: number;
}

export default function DriverRequestsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { theme } = useDriverTheme();
  const colors = useDriverThemeColors();
  const isDark = theme === 'dark';
  const { profile } = useAuth();
  const { avatarUri } = useDriverAvatarUri();

  const [invites, setInvites] = useState<driversService.DriverInviteRow[]>([]);
  const [linkedDrivers, setLinkedDrivers] = useState<driversService.DriverRow[]>([]);
  const [allTrips, setAllTrips] = useState<tripsService.TripRow[]>([]);
  const [allLedger, setAllLedger] = useState<driversService.DriverLedgerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const isRefreshingRef = useRef(false);
  const initialLoadDoneRef = useRef(false);
  // Mount, focus, and AppState-active can all call fetch() within the same tick
  // (React Navigation fires focus on initial mount too) — join the same in-flight
  // request instead of firing a second Promise.all of the same RPCs.
  const fetchInFlightRef = useRef<Promise<void> | null>(null);
  const [inviteActionId, setInviteActionId] = useState<string | null>(null);
  const [leavingOrgId, setLeavingOrgId] = useState<string | null>(null);
  const [leaveFleetPressedOrgId, setLeaveFleetPressedOrgId] = useState<string | null>(null);
  const [quickTab, setQuickTab] = useState<RequestsQuickTab>('all');

  const fetch = useCallback((): Promise<void> => {
    if (fetchInFlightRef.current) return fetchInFlightRef.current;
    if (!profile?.uid) {
      setLoading(false);
      return Promise.resolve();
    }
    if (!isRefreshingRef.current && !initialLoadDoneRef.current) setLoading(true);
    const run = Promise.all([
      driversService.getDriverInvitesReceived(),
      driversService.getLinkedDriversForCurrentUser(profile.uid),
    ]).then(([invRes, driversRes]) => {
      setInvites(invRes.invites ?? []);
      const drivers = driversRes.drivers ?? [];
      setLinkedDrivers(drivers);
      const driverIds = drivers.map((d) => d.id);
      if (driverIds.length === 0) {
        setAllTrips([]);
        setAllLedger([]);
        setLoading(false);
        initialLoadDoneRef.current = true;
        isRefreshingRef.current = false;
        setRefreshing(false);
        return Promise.resolve();
      }
      return Promise.all([
        tripsService.getDriverUiTripsByDriverIds(driverIds),
        driversService.getDriverLedgerByDriverIds(driverIds),
      ]).then(([tRes, ledgerRes]) => {
        setAllTrips(tRes.trips ?? []);
        setAllLedger(ledgerRes.entries ?? []);
        setLoading(false);
        initialLoadDoneRef.current = true;
        isRefreshingRef.current = false;
        setRefreshing(false);
      });
    }).catch(() => {
      setLoading(false);
      initialLoadDoneRef.current = true;
      isRefreshingRef.current = false;
      setRefreshing(false);
    }).finally(() => {
      fetchInFlightRef.current = null;
    });
    fetchInFlightRef.current = run;
    return run;
  }, [profile?.uid]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  useFocusEffect(
    useCallback(() => {
      if (profile?.uid) fetch();
    }, [profile?.uid, fetch])
  );

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && profile?.uid) fetch();
    });
    return () => sub.remove();
  }, [profile?.uid, fetch]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    fetch().finally(() => setRefreshing(false));
  }, [fetch]);

  const pendingInvites = invites.filter((i) => i.status === 'pending');
  const resolvedInvites = invites.filter((i) => i.status !== 'pending');
  const acceptedInvites = resolvedInvites.filter((i) => i.status === 'accepted');

  const inviteOrgIds = useMemo(
    () =>
      Array.from(
        new Set(
          invites
            .map((i) => String(i.from_organization_id ?? '').trim())
            .filter(Boolean),
        ),
      ),
    [invites],
  );
  const orgBrandingById = useOrgBrandingByIds(inviteOrgIds);

  const activeLinkedDrivers = useMemo(
    () => linkedDrivers.filter((d) => !d.left_at),
    [linkedDrivers]
  );
  const driverTripNumberById = useMemo(
    () => buildDriverTripNumberMap(allTrips),
    [allTrips],
  );
  const pastLinkedDrivers = useMemo(
    () =>
      linkedDrivers
        .filter((d) => !!d.left_at)
        .sort((a, b) => new Date((b.left_at ?? 0) as string).getTime() - new Date((a.left_at ?? 0) as string).getTime()),
    [linkedDrivers]
  );

  /** Accepted invites where the driver is still active (not left). */
  const connectedAcceptedInvites = useMemo(
    () =>
      acceptedInvites.filter((inv) =>
        activeLinkedDrivers.some((d) => d.organization_id === inv.from_organization_id)
      ),
    [acceptedInvites, activeLinkedDrivers]
  );

  /** Map: orgId -> ConnectionPassbook for accepted invites where we have a linked driver (active or past). */
  const passbookByOrgId = useMemo(() => {
    const map: Record<string, ConnectionPassbook> = {};
    const accepted = resolvedInvites.filter((i) => i.status === 'accepted');
    for (const inv of accepted) {
      const orgId = inv.from_organization_id;
      const driver = linkedDrivers.find((d) => d.organization_id === orgId);
      if (!driver) continue;
      const driverTrips = allTrips.filter((t) => t.driver_id === driver.id);
      const driverLedger = allLedger.filter((e) => e.driver_id === driver.id);
      const completed = driverTrips.filter((t) =>
        isCompletedStatus(String(t.status ?? '')),
      );
      // Same authoritative resolver used elsewhere — an accepted invite for
      // this org doesn't mean every trip has agreed per-trip terms; only
      // trips with real agreed terms contribute to the total.
      const offer = {
        commissionPercent: inv.commission_percent ?? driver.commission_percent ?? null,
        commissionPerKm: inv.commission_per_km ?? driver.commission_per_km ?? null,
        payableAmount: inv.payable_amount ?? driver.payable_amount ?? null,
      };
      const totalEarned = Math.round(
        completed.reduce((sum, t) => {
          const { hasAgreedPayoutTerms } = resolveDriverTripPayoutTerms(t, offer);
          return sum + (hasAgreedPayoutTerms ? tripEarningsForDriver(t, offer) : 0);
        }, 0)
      );
      const totalReceived = Math.round(
        driverLedger.reduce((s, e) => s + (Number(e.amount) ?? 0), 0)
      );
      map[orgId] = {
        driverId: driver.id,
        orgId,
        orgName: inv.from_org_name ?? 'Fleet',
        tripsCount: driverTrips.length,
        completedCount: completed.length,
        totalEarned,
        totalReceived,
        pendingAmount: Math.max(0, totalEarned - totalReceived),
      };
    }
    return map;
  }, [resolvedInvites, linkedDrivers, allTrips, allLedger]);

  const hasAccepted = connectedAcceptedInvites.length > 0 || pastLinkedDrivers.length > 0;

  const hasFleetPaidPendingToken = useCallback((raw?: string | null) => {
    const s = (raw ?? '').trim();
    if (!s) return false;
    return /Sync\s*:\s*FLEET_PAID_PENDING/i.test(s);
  }, []);

  const isLegacyFleetPendingEvidence = useCallback((raw?: string | null) => {
    const s = (raw ?? '').trim();
    if (!s) return false;
    return /(\bUTR\b|\bMode\s*:|\bTrip\s*Commission\b|\bTrip\s*Payment\b|\bSettlement\b)/i.test(s);
  }, []);

  const derivePaymentMode = useCallback((raw?: string | null): 'UPI' | 'BANK TRANSFER' | 'CASH' | null => {
    const s = (raw ?? '').toLowerCase();
    if (!s) return null;
    if (s.includes('upi')) return 'UPI';
    if (s.includes('bank') || s.includes('neft') || s.includes('rtgs') || s.includes('imps')) return 'BANK TRANSFER';
    if (s.includes('cash')) return 'CASH';
    return null;
  }, []);

  const extractUtr = useCallback((raw?: string | null): string | null => {
    const s = (raw ?? '').trim();
    if (!s) return null;
    const m = s.match(/\bUTR\b\s*[:=]?\s*([0-9A-Za-z-]{8,24})\b/i);
    return m?.[1] ?? null;
  }, []);

  const paymentUpdates = useMemo(() => {
    const driverByOrg = new Map<string, driversService.DriverRow>();
    activeLinkedDrivers.forEach((d) => {
      driverByOrg.set(String(d.organization_id), d);
    });
    const tripById = new Map<string, tripsService.TripRow>();
    allTrips.forEach((t) => tripById.set(t.id, t));
    const receivedByTripId: Record<string, number> = {};
    allLedger.forEach((e) => {
      if (!e.trip_id) return;
      if (e.type !== 'settlement') return;
      const amt = Number(e.amount) || 0;
      receivedByTripId[e.trip_id] = (receivedByTripId[e.trip_id] ?? 0) + amt;
    });

    const updates = allLedger
      .filter((e) => {
        if (!e.trip_id) return false;
        if (e.type === 'settlement') return false;
        const amt = Number(e.amount) || 0;
        if (amt <= 0) return false;
        return hasFleetPaidPendingToken(e.description) || isLegacyFleetPendingEvidence(e.description);
      })
      .map((e) => {
        const trip = e.trip_id ? tripById.get(e.trip_id) ?? null : null;
        if (!trip) return null;
        const orgId = String(trip.organization_id ?? '');
        const linked = driverByOrg.get(orgId);
        if (!linked) return null;
        const isAlreadySettled = (receivedByTripId[trip.id] ?? 0) > 0;
        if (isAlreadySettled) return null;
        return {
          id: e.id,
          orgId,
          orgName:
            connectedAcceptedInvites.find((inv) => inv.from_organization_id === orgId)?.from_org_name ??
            passbookByOrgId[orgId]?.orgName ??
            'Fleet',
          tripId: trip.id,
          tripRef: getDriverTripDisplayNumber(trip, driverTripNumberById),
          amount: Math.round(Number(e.amount) || 0),
          createdAt: e.created_at,
          paymentMode: derivePaymentMode(e.description) ?? 'BANK TRANSFER',
          utr: extractUtr(e.description) ?? '—',
        };
      })
      .filter((u): u is NonNullable<typeof u> => u != null)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const byTrip: Record<string, (typeof updates)[number]> = {};
    updates.forEach((u) => {
      const prev = byTrip[u.tripId];
      if (!prev || new Date(u.createdAt).getTime() > new Date(prev.createdAt).getTime()) {
        byTrip[u.tripId] = u;
      }
    });
    return Object.values(byTrip);
  }, [
    activeLinkedDrivers,
    allTrips,
    driverTripNumberById,
    allLedger,
    connectedAcceptedInvites,
    passbookByOrgId,
    hasFleetPaidPendingToken,
    isLegacyFleetPendingEvidence,
    derivePaymentMode,
    extractUtr,
  ]);

  const handleLeaveFleet = useCallback(
    async (organizationId: string) => {
      setLeavingOrgId(organizationId);
      const { error } = await driversService.leaveFleet(organizationId);
      setLeavingOrgId(null);
      if (error) {
        const msg = error.message ?? 'Could not leave fleet.';
        Alert.alert(
          'Leave fleet failed',
          /function.*does not exist|relation.*does not exist/i.test(msg)
            ? 'Server is not set up for leaving fleets yet. Please try again later or contact support.'
            : msg,
          [{ text: 'OK' }]
        );
        return;
      }
      fetch();
    },
    [fetch]
  );

  const handleLeaveFleetPress = useCallback(
    (organizationId: string, orgName: string) => {
      Alert.alert(
        'Leave fleet?',
        `You will no longer receive trip assignments from ${orgName}. Your passbook for this fleet will remain available under Passbook history. You can connect again if they send a new invite.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Leave fleet',
            style: 'destructive',
            onPress: () => handleLeaveFleet(organizationId),
          },
        ]
      );
    },
    [handleLeaveFleet]
  );

  const styles = useMemo(() => StyleSheet.create({
    container: { flex: 1 },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: Layout.driverHeaderHorizontalPadding,
      paddingBottom: Layout.driverHeaderBottomPadding,
      borderBottomWidth: 1,
    },
    headerLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Layout.driverHeaderGap,
      flex: 1,
      minWidth: 0,
    },
    headerTextWrap: {
      flex: 1,
      minWidth: 0,
    },
    avatarBtn: { padding: 2 },
    avatarCircle: {
      width: Layout.driverHeaderAvatarSize,
      height: Layout.driverHeaderAvatarSize,
      borderRadius: Layout.driverHeaderAvatarSize / 2,
      borderWidth: 2,
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarImage: { width: '100%', height: '100%', borderRadius: Layout.driverHeaderAvatarSize / 2 },
    brand: { fontSize: 9, fontWeight: '800', letterSpacing: 1.6, marginBottom: 1 },
    welcomeTitle: { fontSize: 15, fontWeight: '700', letterSpacing: -0.2 },
    creditsSection: {
      paddingHorizontal: 16,
      paddingTop: 20,
      paddingBottom: 24,
    },
    quickTabsWrap: {
      marginHorizontal: 24,
      marginTop: -6,
      marginBottom: 12,
      flexDirection: 'row',
      borderWidth: 1,
      borderRadius: 999,
      padding: 6,
      gap: 6,
    },
    quickTabBtn: {
      flex: 1,
      minHeight: 42,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 10,
    },
    quickTabBtnActive: {
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.16,
      shadowRadius: 18,
      elevation: 6,
    },
    quickTabText: {
      fontSize: 9,
      fontWeight: '800',
      letterSpacing: 1.2,
      textTransform: 'uppercase',
    },
    paymentUpdatesSection: {
      marginBottom: 26,
    },
    paymentUpdatesTitle: {
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 1.2,
      marginBottom: 6,
    },
    paymentUpdatesSubtitle: {
      fontSize: 12,
      lineHeight: 18,
      marginBottom: 14,
    },
    paymentUpdateCard: {
      borderRadius: 14,
      borderWidth: 1,
      padding: 14,
      marginBottom: 10,
    },
    paymentUpdateTopRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 10,
      marginBottom: 8,
    },
    paymentUpdateOrg: {
      fontSize: 14,
      fontWeight: '800',
      flex: 1,
      minWidth: 0,
    },
    paymentUpdateAmount: {
      fontSize: 16,
      fontWeight: '900',
      letterSpacing: -0.2,
    },
    paymentUpdateMeta: {
      fontSize: 11,
      fontWeight: '600',
      marginBottom: 2,
    },
    paymentUpdateSubMeta: {
      fontSize: 11,
      fontWeight: '500',
      marginBottom: 10,
    },
    paymentUpdateAction: {
      minHeight: 34,
      borderRadius: 10,
      borderWidth: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingHorizontal: 12,
      alignSelf: 'flex-start',
    },
    paymentUpdateActionText: {
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 0.9,
      textTransform: 'uppercase',
    },
    creditsTitle: {
      fontSize: 36,
      fontWeight: '900',
      letterSpacing: -0.5,
      fontStyle: 'italic',
      textTransform: 'uppercase',
      color: Theme.driverEmerald,
    },
    creditsSubtitle: {
      fontSize: 10,
      fontWeight: '700',
      letterSpacing: 0.5,
      marginTop: 8,
      textTransform: 'uppercase',
      color: GRAY_700,
    },
    notificationBtn: {
      width: Layout.driverHeaderActionSize,
      height: Layout.driverHeaderActionSize,
      borderRadius: Layout.driverHeaderActionSize / 2,
      borderWidth: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    scroll: { flex: 1, alignSelf: 'stretch' },
    scrollContent: { paddingHorizontal: 24, paddingTop: 8 },
    section: { marginBottom: 28 },
    sectionTitle: { fontSize: 10, fontWeight: '800', letterSpacing: 1.2, marginBottom: 4 },
    sectionSubtitle: { fontSize: 12, marginBottom: 16, lineHeight: 18 },
    card: {
      width: '100%',
      borderRadius: 18,
      borderWidth: 1,
      padding: 18,
      marginBottom: 14,
    },
    cardReadOnly: { paddingBottom: 16 },
    premiumHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12,
    },
    premiumHeaderLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      flex: 1,
      minWidth: 0,
    },
    premiumInfoBtn: {
      width: 28,
      height: 28,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
      marginLeft: 8,
    },
    cardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginBottom: 14,
    },
    cardIconWrap: {
      width: 44,
      height: 44,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    cardIconImage: {
      width: '100%',
      height: '100%',
    },
    cardHeaderText: { flex: 1, minWidth: 0 },
    cardOrgName: { fontSize: 16, fontWeight: '800', marginBottom: 4 },
    cardOffer: { fontSize: 10, lineHeight: 16, fontWeight: '500' },
    cardActions: { flexDirection: 'row', gap: 12 },
    btnSecondary: {
      flex: 1,
      paddingVertical: 14,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderRadius: 10,
    },
    btnSecondaryText: { fontSize: 13, fontWeight: '800', letterSpacing: 0.3 },
    btnPrimary: {
      flex: 1,
      paddingVertical: 14,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 10,
    },
    btnPrimaryText: { fontSize: 13, fontWeight: '800', letterSpacing: 0.3 },
    btnDisabled: { opacity: 0.6 },
    statusBadge: {
      flexDirection: 'column',
      alignItems: 'center',
      position: 'absolute',
      paddingHorizontal: 6,
      paddingVertical: 4,
      borderRadius: 8,
    },
    statusBadgeText: { fontSize: 9, fontWeight: '700', letterSpacing: 0.2, marginTop: 2 },
    quickStatsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 12,
      marginBottom: 14,
      paddingHorizontal: 2,
    },
    quickStatCol: { flex: 1, minWidth: 0 },
    quickStatLabel: {
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 0.7,
      textTransform: 'uppercase',
    },
    quickStatValue: { fontSize: 13, fontWeight: '800', marginTop: 4 },
    quickDivider: { width: 1, height: 28, marginHorizontal: 8 },
    insightCard: {
      borderRadius: 18,
      padding: 14,
      marginBottom: 10,
    },
    insightHeader: {
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 10,
    },
    insightIconWrap: {
      width: 26,
      height: 26,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
    },
    insightLabel: {
      color: colors.textMuted,
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 1,
      textAlign: 'center',
    },
    insightAmount: {
      color: colors.text,
      fontSize: 24,
      fontWeight: '800',
      textAlign: 'center',
      marginTop: 2,
    },
    insightProgressHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 6,
    },
    insightProgressLabel: { fontSize: 11, fontWeight: '600', color: colors.textMuted },
    insightProgressValue: { fontSize: 11, fontWeight: '700' },
    insightProgressTrack: {
      width: '100%',
      height: 8,
      borderRadius: 99,
      backgroundColor: 'rgba(255,255,255,0.08)',
      overflow: 'hidden',
    },
    insightProgressFill: { height: '100%', borderRadius: 99 },
    insightFooter: {
      marginTop: 10,
      paddingTop: 10,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    insightFooterText: { color: colors.textMuted, fontSize: 10, fontWeight: '600', flex: 1 },
    insightFooterAmount: { color: colors.text, fontWeight: '800' },
    metricsSplitRow: { flexDirection: 'row', gap: 10 },
    metricTile: {
      flex: 1,
      borderWidth: 1,
      borderRadius: 12,
      padding: 12,
    },
    metricTileHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
    metricTileLabel: {
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 0.7,
      textTransform: 'uppercase',
    },
    metricTileValue: { fontSize: 18, fontWeight: '800' },
    passbookBlock: {
      marginTop: 14,
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderRadius: 12,
      borderWidth: 1,
    },
    passbookRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 7,
    },
    passbookLabel: { fontSize: 13, fontWeight: '600' },
    passbookValue: { fontSize: 14, fontWeight: '800' },
    passbookActions: { flexDirection: 'row', gap: 12, marginTop: 12, alignItems: 'center' },
    passbookActionsColumn: {
      marginTop: 14,
      gap: 10,
    },
    viewPassbookBtnLarge: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 14,
      paddingHorizontal: 18,
      borderRadius: 16,
      elevation: 4,
    },
    viewPassbookBtnLargeLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-start',
      gap: 10,
    },
    viewPassbookBtnLargeSpacer: { flex: 1 },
    viewPassbookBtnLargeText: {
      fontSize: 13,
      fontWeight: '900',
      letterSpacing: 0.8,
      textTransform: 'uppercase',
    },
    viewPassbookBtnLargeArrow: { opacity: 0.35 },
    leaveFleetLink: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 6,
    },
    leaveFleetLinkText: { fontSize: 13, fontWeight: '700' },
    viewPassbookBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 12,
      borderRadius: 10,
    },
    viewPassbookBtnText: { fontSize: 12, fontWeight: '800', letterSpacing: 0.5, color: colors.textOnPrimary },
    leaveFleetBtn: {
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderRadius: 10,
      borderWidth: 1,
      justifyContent: 'center',
      alignItems: 'center',
      minWidth: 100,
    },
    leaveFleetBtnText: { fontSize: 12, fontWeight: '800', letterSpacing: 0.3 },
    historyCardMinimal: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      paddingVertical: 14,
      paddingHorizontal: 16,
      borderRadius: 12,
      borderWidth: 1,
      marginBottom: 10,
    },
    historyCardName: { fontSize: 15, fontWeight: '700', flex: 1, minWidth: 0 },
    viewPassbookBtnSmall: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderRadius: 10,
    },
    seeMoreWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 12,
      marginTop: 4,
    },
    seeMoreText: { fontSize: 13, fontWeight: '700', letterSpacing: 0.3 },
    passbookHistoryEmpty: {
      paddingVertical: 20,
      paddingHorizontal: 16,
      borderRadius: 12,
      borderWidth: 1,
      marginBottom: 12,
    },
    passbookHistoryEmptyText: {
      fontSize: 14,
      textAlign: 'center',
      lineHeight: 20,
    },
    viewHistoryBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      paddingVertical: 14,
      paddingHorizontal: 20,
      borderRadius: 12,
      borderWidth: 1,
    },
    viewHistoryBtnText: { fontSize: 14, fontWeight: '800', letterSpacing: 0.3 },
    viewHistoryLink: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      flexWrap: 'wrap',
      gap: 6,
      paddingVertical: 2,
    },
    viewHistoryLinkEyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 1.2, marginRight: 6 },
    viewHistoryLinkText: { fontSize: 14, fontWeight: '700', letterSpacing: 0.1 },
    emptyCard: {
      width: '100%',
      padding: 28,
      borderRadius: 16,
      borderWidth: 1,
      alignItems: 'center',
    },
    emptyIconWrap: {
      width: 72,
      height: 72,
      borderRadius: 36,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 20,
    },
    emptyTitle: { fontSize: 17, fontWeight: '800', marginBottom: 8, letterSpacing: 0.3 },
    emptySubtitle: { fontSize: 13, textAlign: 'center', lineHeight: 20, paddingHorizontal: 8 },
    cardOrgAvatar: {
      width: '100%',
      height: '100%',
      borderRadius: 24,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cardOrgAvatarText: {
      fontSize: 18,
      fontWeight: '800',
      letterSpacing: 0.2,
    },
  }), [colors]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + Layout.driverHeaderTopOffset, backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.headerLeft}>
          <TouchableOpacity onPress={() => router.push('/(driver)/profile')} style={styles.avatarBtn} activeOpacity={0.8}>
            <DriverSelfAvatar size={36} uri={avatarUri} borderColor={colors.emerald} />
          </TouchableOpacity>
          <View style={styles.headerTextWrap}>
            <DriverBrandMark color={colors.textMuted} />
            <Text style={[styles.welcomeTitle, { color: colors.text }]} numberOfLines={1}>
              {hasAccepted ? 'Passbook' : 'Requests'}
            </Text>
          </View>
        </View>
        <TouchableOpacity
          onPress={() => {}}
          style={[styles.notificationBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
          activeOpacity={0.8}
          accessibilityLabel="Notifications"
        >
          <FontAwesome
            name="bell"
            size={Layout.driverHeaderActionIconSize}
            color={colors.text}
          />
        </TouchableOpacity>
      </View>

      <View style={[styles.creditsSection, { backgroundColor: colors.background }]}>
        <Text style={[styles.creditsTitle, { color: Theme.driverEmerald, textTransform: 'uppercase' }]}>
          {hasAccepted ? 'Passbook.' : 'Requests.'}
        </Text>
        <Text style={[styles.creditsSubtitle, { color: GRAY_700 }]}>
          {hasAccepted ? 'Fleet connections.' : 'Connection invites.'}
        </Text>
      </View>
      <View
        style={[
          styles.quickTabsWrap,
          {
            backgroundColor: isDark ? colors.surfaceElevated : 'rgba(226,232,240,0.55)',
            borderColor: isDark ? colors.borderSubtle : 'rgba(255,255,255,0.7)',
          },
        ]}
      >
        {[
          { id: 'all' as const, label: 'All' },
          { id: 'payment_updates' as const, label: `Payment updates (${paymentUpdates.length})` },
        ].map((tab) => {
          const active = quickTab === tab.id;
          return (
            <TouchableOpacity
              key={tab.id}
              onPress={() => setQuickTab(tab.id)}
              activeOpacity={0.85}
              style={[
                styles.quickTabBtn,
                active && [styles.quickTabBtnActive, { backgroundColor: '#0f172a', shadowColor: isDark ? '#000' : 'rgba(15,23,42,0.22)' }],
              ]}
            >
              <Text style={[styles.quickTabText, { color: active ? Theme.textOnPrimary : colors.textMuted }]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <LoadingIndicator size="large" color={colors.emerald} />
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 80 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.emerald} />
          }
        >
          {quickTab === 'payment_updates' && (
            <View style={[styles.section, styles.paymentUpdatesSection]}>
              <Text style={[styles.paymentUpdatesTitle, { color: colors.textMuted }]}>PAYMENT UPDATES</Text>
              <Text style={[styles.paymentUpdatesSubtitle, { color: colors.textMuted }]}>
                Fleet owner marked these trips as paid. Review and verify from passbook.
              </Text>
              {paymentUpdates.length === 0 ? (
                <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <View style={[styles.emptyIconWrap, { backgroundColor: colors.whiteMuted }]}>
                    <FontAwesome name="bell-slash" size={34} color={colors.textMuted} />
                  </View>
                  <Text style={[styles.emptyTitle, { color: colors.text }]}>No payment updates yet</Text>
                  <Text style={[styles.emptySubtitle, { color: colors.textMuted }]}>
                    New fleet-marked-paid updates will appear here across all your connected fleets.
                  </Text>
                </View>
              ) : (
                paymentUpdates.map((u) => (
                  <View
                    key={u.id}
                    style={[
                      styles.paymentUpdateCard,
                      {
                        backgroundColor: colors.surface,
                        borderColor: isDark ? colors.border : 'rgba(226,232,240,0.9)',
                      },
                    ]}
                  >
                    <View style={styles.paymentUpdateTopRow}>
                      <Text style={[styles.paymentUpdateOrg, { color: colors.text }]} numberOfLines={1}>
                        {u.orgName}
                      </Text>
                      <Text style={[styles.paymentUpdateAmount, { color: colors.emerald }]}>
                        ₹{u.amount.toLocaleString('en-IN')}
                      </Text>
                    </View>
                    <Text style={[styles.paymentUpdateMeta, { color: colors.textMuted }]}>
                      {u.tripRef} · {phonePeMetaDate(u.createdAt)}
                    </Text>
                    <Text style={[styles.paymentUpdateSubMeta, { color: colors.textMuted }]}>
                      {u.paymentMode} · UTR {u.utr}
                    </Text>
                    <TouchableOpacity
                      style={[styles.paymentUpdateAction, { borderColor: colors.emerald, backgroundColor: colors.emeraldMuted }]}
                      onPress={() =>
                        router.push({
                          pathname: `/(driver)/passbook/${u.orgId}` as const,
                          params: { orgName: u.orgName, from: 'requests' },
                        } as Parameters<typeof router.push>[0])
                      }
                      activeOpacity={0.85}
                    >
                      <FontAwesome name="book" size={12} color={colors.emerald} />
                      <Text style={[styles.paymentUpdateActionText, { color: colors.emerald }]}>
                        Open passbook
                      </Text>
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </View>
          )}

          {quickTab === 'all' && (
            <>
          {pendingInvites.length > 0 && (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>PENDING</Text>
              <Text style={[styles.sectionSubtitle, { color: colors.textMuted }]}>
                {activeLinkedDrivers.length === 0
                  ? 'Accept an invitation below to connect again and receive trip assignments.'
                  : 'Accept to join and receive trip assignments.'}
              </Text>
              {pendingInvites.map((inv) => (
                <DriverInviteCard
                  key={inv.id}
                  invite={inv}
                  colors={colors}
                  offerText={buildOfferText(inv)}
                  busy={inviteActionId === inv.id}
                  fallbackAvatarUri={avatarUri}
                  onIgnore={() => {
                    const title = "Decline invitation?";
                    const msg = "You will reject this fleet connection invitation.";
                    
                    if (Platform.OS === "web" && typeof window !== "undefined") {
                      const confirmed = window.confirm(`${title}\n\n${msg}`);
                      if (confirmed) {
                        (async () => {
                          setInviteActionId(inv.id);
                          const { error } = await driversService.rejectDriverInvite(inv.id);
                          setInviteActionId(null);
                          if (error) {
                            Alert.alert('Decline failed', error.message ?? 'Could not decline. Try again.', [{ text: 'OK' }]);
                          }
                          fetch();
                        })();
                      }
                      return;
                    }

                    Alert.alert(
                      title,
                      msg,
                      [
                        { text: "Cancel", style: "cancel" },
                        {
                          text: "Decline",
                          style: "destructive",
                          onPress: async () => {
                            setInviteActionId(inv.id);
                            const { error } = await driversService.rejectDriverInvite(inv.id);
                            setInviteActionId(null);
                            if (error) {
                              Alert.alert('Decline failed', error.message ?? 'Could not decline. Try again.', [{ text: 'OK' }]);
                            }
                            fetch();
                          }
                        }
                      ]
                    );
                  }}
                  onAccept={async () => {
                    setInviteActionId(inv.id);
                    const { error } = await driversService.acceptDriverInvite(inv.id);
                    setInviteActionId(null);
                    if (error) {
                      Alert.alert('Accept failed', error.message ?? 'Could not accept. Try again.', [{ text: 'OK' }]);
                      fetch();
                      return;
                    }
                    fetch();
                  }}
                />
              ))}
            </View>
          )}

          {connectedAcceptedInvites.length > 0 && (
            <View style={styles.section}>
              {connectedAcceptedInvites.map((inv) => {
                const passbook = passbookByOrgId[inv.from_organization_id];
                const isLeaving = leavingOrgId === inv.from_organization_id;
                const receivedPercentage =
                  passbook && passbook.totalEarned > 0
                    ? Math.min(100, Math.round((passbook.totalReceived / passbook.totalEarned) * 100))
                    : 0;
                return (
                  <View
                    key={inv.id}
                    style={[
                      styles.card,
                      styles.cardReadOnly,
                      {
                        backgroundColor: colors.surface,
                        borderColor: isDark ? colors.border : 'rgba(226,232,240,0.9)',
                      },
                    ]}
                  >
                    <View style={styles.premiumHeaderRow}>
                      <View style={styles.premiumHeaderLeft}>
                        <View
                          style={[
                            styles.cardIconWrap,
                            { backgroundColor: isDark ? colors.surfaceElevated : 'rgba(248,250,252,0.95)' },
                          ]}
                        >
                          <Image
                            source={{
                              uri: resolveDriverOrgAvatarUri({
                                orgId: inv.from_organization_id,
                                orgName: inv.from_org_name ?? 'Organisation',
                                branding:
                                  orgBrandingById[
                                    String(inv.from_organization_id ?? '')
                                  ],
                                logoUrl: inv.from_org_logo_url,
                                avatarSeed: inv.from_org_avatar_seed,
                                avatarUrl: inv.from_org_avatar_url,
                              }),
                            }}
                            style={styles.cardIconImage}
                            resizeMode="cover"
                          />
                        </View>
                        <View style={styles.cardHeaderText}>
                          <Text style={[styles.cardOrgName, { color: colors.text }]} numberOfLines={1}>
                            {inv.from_org_name || 'Organisation'}
                          </Text>
                          <Text style={[styles.cardOffer, { color: colors.textMuted }]} numberOfLines={1}>
                            {buildOfferText(inv)}
                          </Text>
                        </View>

                      </View>
                      <TouchableOpacity
                        style={[styles.premiumInfoBtn, { backgroundColor: colors.surfaceElevated }]}
                        activeOpacity={0.8}
                        onPress={() => {}}
                      >
                        <FontAwesome name="info" size={12} color={colors.textMuted} />
                      </TouchableOpacity>
                    </View>

                    <View style={[styles.statusBadge, { backgroundColor: 'transparent', top: 18, right: 18 }]}>
                      <FontAwesome name="check-circle" size={10} color={colors.emerald} />
                      <Text style={[styles.statusBadgeText, { color: colors.text, textAlign: 'center' }]}>Accepted</Text>
                    </View>

                    {passbook != null ? (
                      <>
                        <View style={styles.quickStatsRow}>
                          <View style={styles.quickStatCol}>
                            <Text style={[styles.quickStatLabel, { color: colors.textMuted }]}>Rate</Text>
                            <Text style={[styles.quickStatValue, { color: colors.text }]}>₹{inv.payable_amount?.toLocaleString('en-IN') ?? 0}</Text>

                          </View>
                          <View style={[styles.quickDivider, { backgroundColor: colors.border }]} />
                          <View style={styles.quickStatCol}>
                            <Text style={[styles.quickStatLabel, { color: colors.textMuted }]}>Commission</Text>
                            <Text style={[styles.quickStatValue, { color: colors.text }]}>{inv.commission_percent ?? 0}%</Text>
                          </View>
                          <View style={[styles.quickDivider, { backgroundColor: colors.border }]} />
                          <View style={styles.quickStatCol}>
                            <Text style={[styles.quickStatLabel, { color: colors.textMuted }]}>Completed</Text>
                            <Text style={[styles.quickStatValue, { color: colors.text }]}>{passbook.completedCount}</Text>
                          </View>
                        </View>

                        <View style={[styles.insightCard, { backgroundColor: colors.surfaceElevated }]}>
                          <View style={styles.insightHeader}>
                            <View>
                              <Text style={styles.insightLabel}>TOTAL EARNINGS</Text>
                              <Text style={styles.insightAmount}>₹{passbook.totalEarned.toLocaleString('en-IN')}</Text>
                            </View>
                          </View>
                          <View style={styles.insightProgressHeader}>
                            <Text style={[styles.insightProgressLabel, { color: colors.textMuted }]}>Payout progress</Text>
                            <Text style={[styles.insightProgressValue, { color: colors.emerald }]}>
                              {receivedPercentage}% settled
                            </Text>
                          </View>
                          <View style={styles.insightProgressTrack}>
                            <View style={[styles.insightProgressFill, { backgroundColor: colors.emerald, width: `${receivedPercentage}%` }]} />
                          </View>
                          <View style={styles.insightFooter}>
                            <FontAwesome name="line-chart" size={10} color={colors.emerald} />
                            <Text style={styles.insightFooterText}>
                              Pending <Text style={styles.insightFooterAmount}>₹{passbook.pendingAmount.toLocaleString('en-IN')}</Text> to be released
                            </Text>
                          </View>
                        </View>

                        <View style={styles.metricsSplitRow}>
                          <View style={[styles.metricTile, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
                            <View style={styles.metricTileHead}>
                              <FontAwesome name="money" size={12} color={colors.textMuted} />
                              <Text style={[styles.metricTileLabel, { color: colors.textMuted }]}>Received</Text>
                            </View>
                            <Text style={[styles.metricTileValue, { color: colors.text }]}>₹{passbook.totalReceived.toLocaleString('en-IN')}</Text>
                          </View>
                          <View style={[styles.metricTile, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
                            <View style={styles.metricTileHead}>
                              <FontAwesome name="clock-o" size={12} color={colors.textMuted} />
                              <Text style={[styles.metricTileLabel, { color: colors.textMuted }]}>Pending</Text>
                            </View>
                            <Text style={[styles.metricTileValue, { color: colors.gold }]}>₹{passbook.pendingAmount.toLocaleString('en-IN')}</Text>
                          </View>
                        </View>
                      </>
                    ) : null}

                    <View style={styles.passbookActionsColumn}>
                      <TouchableOpacity
                        style={[
                          styles.viewPassbookBtnLarge,
                          {
                            backgroundColor: colors.emerald,
                            shadowColor: colors.text,
                            shadowOffset: { width: 4, height: 4 },
                            shadowOpacity: 0.2,
                            shadowRadius: 0,
                          },

                        ]}
                        onPress={() => router.push({
                          pathname: `/(driver)/passbook/${passbook?.orgId ?? inv.from_organization_id}` as const,
                          params: { orgName: passbook?.orgName ?? inv.from_org_name ?? 'Fleet', from: 'requests' },
                        } as Parameters<typeof router.push>[0])}
                        activeOpacity={0.9}
                      >
                        <View style={styles.viewPassbookBtnLargeLeft}>
                          <FontAwesome name="credit-card" size={16} color={colors.textOnPrimary} />
                          <Text style={[styles.viewPassbookBtnLargeText, { color: colors.textOnPrimary }]}>VIEW DETAILED STATEMENT</Text>
                        </View>
                        <View style={styles.viewPassbookBtnLargeSpacer} />
                        <FontAwesome name="chevron-right" size={16} color={colors.textOnPrimary} style={styles.viewPassbookBtnLargeArrow} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.leaveFleetLink}
                        onPress={() => handleLeaveFleetPress(inv.from_organization_id, inv.from_org_name ?? 'this organisation')}
                        onPressIn={() => setLeaveFleetPressedOrgId(inv.from_organization_id)}
                        onPressOut={() => setLeaveFleetPressedOrgId(null)}
                        disabled={!!isLeaving}
                        activeOpacity={1}
                      >
                        {isLeaving ? (
                          <LoadingIndicator size="small" color={colors.textMuted} />
                        ) : (
                          <>
                            <FontAwesome
                              name="sign-out"
                              size={16}
                              color={leaveFleetPressedOrgId === inv.from_organization_id ? Theme.negative : colors.textMuted}
                            />
                            <Text
                              style={[
                                styles.leaveFleetLinkText,
                                { color: leaveFleetPressedOrgId === inv.from_organization_id ? Theme.negative : colors.textMuted },
                              ]}
                            >
                              Exit fleet
                            </Text>
                          </>
                        )}
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {pastLinkedDrivers.length > 0 && (
            <View style={styles.section}>
              <TouchableOpacity
                style={styles.viewHistoryLink}
                onPress={() => router.push('/(driver)/passbook/history')}
                activeOpacity={0.8}
              >
                <Text style={[styles.viewHistoryLinkEyebrow, { color: colors.textMuted }]}>PASSBOOK HISTORY</Text>
                <Text style={[styles.viewHistoryLinkText, { color: colors.emerald }]}>View history</Text>
                <FontAwesome name="chevron-right" size={12} color={colors.emerald} />
              </TouchableOpacity>
            </View>
          )}

          {pendingInvites.length === 0 && connectedAcceptedInvites.length === 0 && pastLinkedDrivers.length === 0 && (
            <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={[styles.emptyIconWrap, { backgroundColor: colors.whiteMuted }]}>
                <FontAwesome name="inbox" size={40} color={colors.textMuted} />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.text }]}>No connection requests</Text>
              <Text style={[styles.emptySubtitle, { color: colors.textMuted }]}>
                Organisation invites will appear here. Accept to connect and receive trip assignments on the Dashboard.
              </Text>
            </View>
          )}
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

