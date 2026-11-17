import { CenteredLoadingView } from '@/components/CenteredLoadingView';
import Layout from '@/constants/Layout';
import Theme from '@/constants/Theme';
import { useAuth } from '@/contexts/AuthContext';
import { useDriverTheme, useDriverThemeColors } from '@/contexts/DriverThemeContext';
import { buildDriverTripNumberMap, getDriverTripDisplayNumber } from '@/features/driver/utils/driverTripSequence.util';
import { phonePeMetaDate } from '@/features/driver/utils/driverGpayTransactions.util';
import {
  buildSalaryRequestActivityLog,
  formatSalaryRequestMonth,
  salaryRequestStatusColors,
  salaryRequestStatusLabel,
  salaryRequestStatusTone,
  salaryRequestTypeLabel,
} from '@/features/drivers/utils/salaryRequestDisplay.util';
import * as driversService from '@/features/drivers/services/drivers.service';
import * as salaryRequestsService from '@/features/drivers/services/salaryRequests.service';
import * as tripsService from '@/features/trips/services/trips.service';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { confirmDialog } from '@/lib/confirmDialog';
import { showAppAlert } from '@/lib/appAlert';

const LIST_BG = '#eef2f6';
const HERO_FROM = '#022c22';
const HERO_TO = '#064e3b';

export default function DriverSalaryRequestDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const requestId =
    typeof params.id === 'string' ? params.id : Array.isArray(params.id) ? params.id[0] : '';
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const { theme } = useDriverTheme();
  const colors = useDriverThemeColors();
  const isDark = theme === 'dark';
  const listBg = isDark ? colors.background : LIST_BG;
  const cardBg = isDark ? colors.surface : Theme.cardWhite;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [request, setRequest] = useState<salaryRequestsService.SalaryRequestRow | null>(null);
  const [orgName, setOrgName] = useState('Fleet');
  const [linkedTrips, setLinkedTrips] = useState<tripsService.TripRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [withdrawing, setWithdrawing] = useState(false);

  const load = useCallback(async () => {
    if (!requestId) {
      setError('Request not found.');
      setLoading(false);
      return;
    }
    const res = await salaryRequestsService.getSalaryRequestByIdForDriver(requestId);
    if (res.error || !res.request) {
      setError(res.error?.message ?? 'Request not found.');
      setRequest(null);
      setLoading(false);
      setRefreshing(false);
      return;
    }
    setRequest(res.request);
    setError(null);

    const tripIds = res.request.trip_ids ?? [];
    const [driversRes, tripsRes] = await Promise.all([
      profile?.uid
        ? driversService.getLinkedDriversForCurrentUser(profile.uid)
        : Promise.resolve({ drivers: [] }),
      tripIds.length > 0
        ? Promise.all(tripIds.map((id) => tripsService.getDriverTripById(id))).then((rows) =>
            rows
              .map((r) => (r.trip ? tripsService.driverRowToTripRow(r.trip) : null))
              .filter(Boolean) as tripsService.TripRow[],
          )
        : Promise.resolve([]),
    ]);

    const driverRow = (driversRes.drivers ?? []).find((d) => d.id === res.request!.driver_id);
    const fleetName =
      (driverRow?.organizations as { name?: string } | null | undefined)?.name?.trim() ?? null;
    setOrgName(fleetName ?? 'Fleet');
    setLinkedTrips(tripsRes);
    setLoading(false);
    setRefreshing(false);
  }, [profile?.uid, requestId]);

  useEffect(() => {
    void load();
  }, [load]);

  const refresh = useCallback(() => {
    setRefreshing(true);
    void load();
  }, [load]);

  /** Driver takes back a request the fleet has not acted on yet. */
  const withdraw = useCallback(async () => {
    if (!request || withdrawing) return;
    const ok = await confirmDialog({
      title: 'Withdraw this request?',
      message: 'The fleet will no longer see it. You can request these trips again later.',
      confirmLabel: 'Withdraw',
      destructive: true,
    });
    if (!ok) return;
    setWithdrawing(true);
    const { error: withdrawError, withdrawn } = await salaryRequestsService.withdrawSalaryRequest(request.id);
    setWithdrawing(false);
    if (withdrawError) {
      showAppAlert('Could not withdraw', withdrawError.message);
      return;
    }
    if (!withdrawn) {
      showAppAlert('Already handled', 'The fleet has already acted on this request, so it can no longer be withdrawn.');
    }
    void load();
  }, [load, request, withdrawing]);

  const tripNumberById = useMemo(() => buildDriverTripNumberMap(linkedTrips), [linkedTrips]);
  const activityLog = useMemo(
    () => (request ? buildSalaryRequestActivityLog(request) : []),
    [request],
  );

  if (loading && !request) {
    return <CenteredLoadingView message="Loading salary request…" />;
  }

  if (error || !request) {
    return (
      <View style={[styles.root, { backgroundColor: listBg, paddingTop: insets.top + 16 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtnLight}>
          <ArrowLeft size={22} color={colors.text} strokeWidth={2.4} />
        </TouchableOpacity>
        <Text style={[styles.errorTitle, { color: colors.text }]}>{error ?? 'Not found'}</Text>
      </View>
    );
  }

  const amount = Math.round(Number(request.amount) || 0);
  const monthLabel = formatSalaryRequestMonth(request.salary_month);
  const statusTone = salaryRequestStatusTone(request.status);
  const statusColors = salaryRequestStatusColors(statusTone);

  return (
    <View style={[styles.root, { backgroundColor: listBg }]}>
      <LinearGradient
        colors={[HERO_FROM, HERO_TO]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.hero, { paddingTop: insets.top + 8 }]}
      >
        <View style={styles.heroTopRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <ArrowLeft size={22} color="#fff" strokeWidth={2.4} />
          </TouchableOpacity>
          <Text style={styles.heroTitle}>Salary request</Text>
          <View style={styles.backBtnPlaceholder} />
        </View>

        <Text style={styles.heroEyebrow}>{orgName.toUpperCase()}</Text>
        <View style={styles.heroAmountRow}>
          <Text style={styles.heroRupee}>₹</Text>
          <Text style={styles.heroAmount}>{amount.toLocaleString('en-IN')}</Text>
        </View>
        <Text style={styles.heroSub}>{salaryRequestTypeLabel(request.request_type)}</Text>
        <View
          style={[
            styles.heroStatusPill,
            { backgroundColor: statusColors.bg, borderColor: statusColors.border },
          ]}
        >
          <Text style={[styles.heroStatusText, { color: statusColors.text }]}>
            {salaryRequestStatusLabel(request.status).toUpperCase()}
          </Text>
        </View>
      </LinearGradient>

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + Layout.fabBottomOffset },
        ]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.emerald} />
        }
      >
        <View style={[styles.card, { backgroundColor: cardBg, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>Request details</Text>
          <DetailRow label="Fleet" value={orgName} colors={colors} />
          <DetailRow label="Type" value={salaryRequestTypeLabel(request.request_type)} colors={colors} />
          {monthLabel ? <DetailRow label="Salary month" value={monthLabel} colors={colors} /> : null}
          <DetailRow label="Submitted" value={phonePeMetaDate(request.created_at)} colors={colors} />
          {request.updated_at && request.updated_at !== request.created_at ? (
            <DetailRow label="Last updated" value={phonePeMetaDate(request.updated_at)} colors={colors} />
          ) : null}
          {request.note?.trim() ? (
            <DetailRow label="Your note" value={request.note.trim()} colors={colors} multiline />
          ) : null}
          {String(request.status).toLowerCase() === 'pending' ? (
            <TouchableOpacity
              onPress={() => void withdraw()}
              disabled={withdrawing}
              style={[styles.withdrawBtn, { borderColor: colors.border, opacity: withdrawing ? 0.6 : 1 }]}
              activeOpacity={0.85}
              accessibilityRole="button"
            >
              <Text style={[styles.withdrawText, { color: Theme.negative }]}>
                {withdrawing ? 'Withdrawing…' : 'Withdraw request'}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {linkedTrips.length > 0 ? (
          <View style={[styles.card, { backgroundColor: cardBg, borderColor: colors.border }]}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>
              Linked trips ({linkedTrips.length})
            </Text>
            {linkedTrips.map((trip) => (
              <TouchableOpacity
                key={trip.id}
                style={[styles.tripRow, { borderTopColor: colors.borderSubtle }]}
                onPress={() => router.push(`/driver-trip/${trip.id}` as import('expo-router').Href)}
                activeOpacity={0.82}
              >
                <View style={styles.tripRowMain}>
                  <Text style={[styles.tripId, { color: colors.text }]}>
                    {getDriverTripDisplayNumber(trip, tripNumberById)}
                  </Text>
                  <Text style={[styles.tripRoute, { color: colors.textMuted }]} numberOfLines={1}>
                    {trip.pickup_area || 'Pickup'} → {trip.drop_location || 'Drop'}
                  </Text>
                </View>
                <FontAwesome name="chevron-right" size={12} color={colors.textMuted} />
              </TouchableOpacity>
            ))}
          </View>
        ) : null}

        <View style={[styles.card, { backgroundColor: cardBg, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>Activity log</Text>
          {activityLog.map((entry, index) => {
            const entryTone = entry.tone === 'neutral' ? null : salaryRequestStatusColors(entry.tone);
            return (
              <View
                key={entry.id}
                style={[
                  styles.logRow,
                  index > 0 && { borderTopColor: colors.borderSubtle, borderTopWidth: StyleSheet.hairlineWidth },
                ]}
              >
                <View style={[styles.logDot, { backgroundColor: entryTone?.text ?? colors.emerald }]} />
                <View style={styles.logMain}>
                  <View style={styles.logHead}>
                    <Text style={[styles.logTitle, { color: colors.text }]}>{entry.title}</Text>
                    <Text style={[styles.logTime, { color: colors.textMuted }]}>
                      {phonePeMetaDate(entry.at)}
                    </Text>
                  </View>
                  <Text style={[styles.logDetail, { color: colors.textMuted }]}>{entry.detail}</Text>
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

function DetailRow({
  label,
  value,
  colors,
  multiline = false,
}: {
  label: string;
  value: string;
  colors: ReturnType<typeof useDriverThemeColors>;
  multiline?: boolean;
}) {
  return (
    <View style={styles.detailRow}>
      <Text style={[styles.detailLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text
        style={[styles.detailValue, { color: colors.text }]}
        numberOfLines={multiline ? undefined : 2}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  withdrawBtn: {
    marginTop: 12,
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  withdrawText: {
    fontSize: 13,
    fontWeight: '600',
  },
  root: { flex: 1 },
  hero: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingBottom: 20,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  backBtnLight: {
    width: 40,
    height: 40,
    marginHorizontal: Layout.screenPaddingHorizontal,
    marginBottom: 12,
  },
  backBtnPlaceholder: { width: 40, height: 40 },
  heroTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: -0.2,
  },
  heroEyebrow: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.1,
    color: 'rgba(167,243,208,0.88)',
    marginBottom: 6,
  },
  heroAmountRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
    marginBottom: 4,
  },
  heroRupee: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
    paddingBottom: 4,
  },
  heroAmount: {
    fontSize: 32,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.5,
  },
  heroSub: {
    fontSize: 13,
    fontWeight: '500',
    color: 'rgba(167,243,208,0.82)',
    marginBottom: 12,
  },
  heroStatusPill: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  heroStatusText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  scrollContent: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 14,
    gap: 12,
  },
  card: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: -0.1,
    marginBottom: 2,
  },
  detailRow: { gap: 3 },
  detailLabel: {
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  detailValue: {
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  tripRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  tripRowMain: { flex: 1, minWidth: 0, gap: 2 },
  tripId: { fontSize: 12, fontWeight: '700' },
  tripRoute: { fontSize: 11, fontWeight: '500' },
  logRow: { flexDirection: 'row', gap: 10, paddingTop: 10 },
  logDot: { width: 8, height: 8, borderRadius: 4, marginTop: 5 },
  logMain: { flex: 1, minWidth: 0, gap: 4 },
  logHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    alignItems: 'flex-start',
  },
  logTitle: { fontSize: 13, fontWeight: '700', flex: 1 },
  logTime: { fontSize: 10, fontWeight: '600', flexShrink: 0 },
  logDetail: { fontSize: 12, fontWeight: '500', lineHeight: 17 },
  errorTitle: {
    fontSize: 15,
    fontWeight: '600',
    paddingHorizontal: Layout.screenPaddingHorizontal,
  },
});
