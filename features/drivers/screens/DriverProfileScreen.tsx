/**
 * Driver Profile — hero, fleet vehicle, levels, KYC shortcut to documents (single upload hub).
 */
import { useAvatar } from '@/lib/useAvatar';
import Layout from '@/constants/Layout';
import Theme from '@/constants/Theme';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useDriverAvatar } from '@/contexts/DriverAvatarContext';
import { useDriverTheme, useDriverThemeColors } from '@/contexts/DriverThemeContext';
import { EditProfileModal } from '@/features/auth/components/EditProfileModal';
import {
  computeExperienceProgress,
  countFiveStarRatings,
  getMilestoneCount,
  isMilestoneCompleted,
  isMilestoneInProgress,
  type ExperienceLevelConfig,
  type MilestoneGuideActionKind,
} from '@/features/experience/experienceProgress';
import { MilestoneHowToModal } from '@/features/experience/components/MilestoneHowToModal';
import {
  averageScore,
  getRatingsForDrivers,
} from '@/features/ratings/services/ratings.service';
import type { RatingRow } from '@/features/ratings/types';
import { ROUTES } from '@/lib/routes';
import { supabase } from '@/lib/supabase';
import { subscribeSharedPostgresChanges } from '@/lib/realtimeRegistry';
import * as driversService from '@/features/drivers/services/drivers.service';
import { getVehicleById } from '@/features/vehicles/services/vehicles.service';
import { useDcoStatusQuery } from '@/lib/queries/useDcoStatusQuery';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import {
  Camera,
  ChevronLeft,
  ChevronRight,
  Crown,
  Dna,
  Edit3,
  Fuel,
  Gavel,
  Gauge,
  Globe,
  History,
  LogOut,
  Milestone,
  Quote,
  Share2,
  Shield,
  Star,
  Thermometer,
  Trophy,
  Truck,
  UserPlus,
  Wrench
} from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Image,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';

const SCREEN_PAD = Layout.screenPaddingHorizontal;

/**
 * Clear absolute DriverTabBar footer on web/native.
 * Footer = padTop(6) + dock (tabBarHeight+5) + padBottom(max(inset*0.35, 10)).
 */
function driverTabBarScrollInset(bottomInset: number): number {
  const footerPadTop = 6;
  const dockHeight = Layout.tabBarHeight + 5;
  const footerPadBottom = Math.max(Math.round(bottomInset * 0.35), 10);
  return footerPadTop + dockHeight + footerPadBottom + 24;
}

/** Reference palette — heroes stay slate-900 for brand match; page bg uses theme. */
const SLATE_900 = '#0f172a';
const SLATE_50 = '#f8fafc';
const AMBER_400 = '#fbbf24';
const AMBER_500 = '#f59e0b';

type ProfileView = 'main' | 'vehicle' | 'levels';

/** Same completion rule as trip history: status or a stamped completed_at. */
const COMPLETED_TRIP_FILTER =
  'status.in.(completed,delivered,done),completed_at.not.is.null';

const webPress: ViewStyle | null =
  Platform.OS === 'web' ? ({ cursor: 'pointer' } as ViewStyle) : null;

async function countCompletedTrips(driverIds: string[]): Promise<number> {
  const { count, error } = await supabase()
    .from('trips')
    .select('id', { count: 'exact', head: true })
    .in('driver_id', driverIds)
    .or(COMPLETED_TRIP_FILTER);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

async function lookupTripVehicleNumber(driverIds: string[]): Promise<string | null> {
  const { data, error } = await supabase()
    .from('trips')
    .select('vehicle_display_number')
    .in('driver_id', driverIds)
    .not('vehicle_display_number', 'is', null)
    .limit(1);
  if (error) return null;
  const row = (data ?? [])[0] as { vehicle_display_number?: string | null } | undefined;
  const num = (row?.vehicle_display_number ?? '').trim();
  return num.length > 0 ? num : null;
}

function formatShortDate(iso?: string | null) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return '—';
  }
}

export default function DriverProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { theme } = useDriverTheme();
  const isDark = theme === 'dark';
  const colors = useDriverThemeColors();
  const { user, profile, signOut, refreshSession, patchProfile } = useAuth();
  const { status: dcoStatus } = useDcoStatusQuery(profile?.uid);
  const { locale, localeOptions } = useLanguage();
  const languageLabel =
    localeOptions.find((o) => o.value === locale)?.label ?? 'English';
  const { avatarSeed, setAvatarSeed, setPreviewUri } = useDriverAvatar();
  const [showEditProfileModal, setShowEditProfileModal] = useState(false);
  const [profileView, setProfileView] = useState<ProfileView>('main');
  const [guideLevel, setGuideLevel] = useState<ExperienceLevelConfig | null>(null);
  const [drivers, setDrivers] = useState<driversService.DriverRow[]>([]);
  const [driverIds, setDriverIds] = useState<string[]>([]);
  const [completedTripCount, setCompletedTripCount] = useState(0);
  const [loadingTrips, setLoadingTrips] = useState(true);
  const [tripsLoaded, setTripsLoaded] = useState(false);
  const [tripVehicleLabel, setTripVehicleLabel] = useState<string | null>(null);
  const [driverRatings, setDriverRatings] = useState<RatingRow[]>([]);
  const [loadingDriverRatings, setLoadingDriverRatings] = useState(false);
  const [kycUploadedCount, setKycUploadedCount] = useState(0);
  const [kycStatus, setKycStatus] = useState<{
    reviewStatus: string | null;
    isVerified: boolean;
    verifiedDocs: number;
    requiredDocs: number;
  } | null>(null);
  const [assignedVehicleLabel, setAssignedVehicleLabel] = useState<string | null>(null);
  const [assignedVehicleMeta, setAssignedVehicleMeta] = useState<{
    model?: string | null;
    type?: string | null;
    brand?: string | null;
  } | null>(null);

  const scrollBottomPad = driverTabBarScrollInset(insets.bottom);

  const displayName =
    profile?.full_name?.trim() ||
    profile?.displayName?.trim() ||
    user?.email?.split('@')[0] ||
    'Pilot';

  const {
    imageSource: displayAvatarSource,
    initials: displayAvatarInitials,
    initialsColor: displayAvatarColor,
  } = useAvatar({
    type: 'driver',
    name: displayName,
    avatarUrl: profile?.avatar_url ?? null,
    avatarSeed: profile?.avatar_url?.trim()
      ? null
      : profile?.avatar_seed?.trim() || avatarSeed,
  });

  const tripLoadGen = useRef(0);
  const loadTrips = useCallback(() => {
    const gen = ++tripLoadGen.current;
    if (!profile?.uid) {
      setLoadingTrips(false);
      setTripsLoaded(true);
      setCompletedTripCount(0);
      setTripVehicleLabel(null);
      return;
    }
    setLoadingTrips(true);
    driversService
      .getLinkedDriversForCurrentUser(profile.uid)
      .then(async (res) => {
        if (gen !== tripLoadGen.current) return;
        // All driver rows (including left fleets) — experience is cumulative.
        const allRows = res.drivers ?? [];
        const ids = allRows.map((d) => d.id);
        // UI fleet display: active fleet links only. tracking_only rows are trip-assignment
        // identities (e.g. the shipper that awarded a Marketplace bid), not a fleet.
        setDrivers(allRows.filter((d) => !d.left_at && d.tracking_only !== true));
        // Same id set the count below uses — drives the realtime subscription filter.
        setDriverIds(ids);
        if (ids.length === 0) {
          setCompletedTripCount(0);
          setTripVehicleLabel(null);
          setTripsLoaded(true);
          return;
        }
        const [count, plate] = await Promise.all([
          countCompletedTrips(ids),
          lookupTripVehicleNumber(ids),
        ]);
        if (gen !== tripLoadGen.current) return;
        setCompletedTripCount(count);
        setTripVehicleLabel(plate);
        setTripsLoaded(true);
      })
      .catch((err: unknown) => {
        if (gen !== tripLoadGen.current) return;
        console.warn('[profile] trip summary:', err instanceof Error ? err.message : err);
        setTripsLoaded(true);
      })
      .finally(() => {
        if (gen === tripLoadGen.current) setLoadingTrips(false);
      });
  }, [profile?.uid]);

  /**
   * Reads driver_kyc_status — the authoritative view over driver_kyc_documents
   * and driver_kyc_submissions. This previously inferred KYC state from auth
   * user_metadata, a driver_profiles column, and storage filename prefixes
   * (all pre-dating the driver_kyc_documents table), so it could never show
   * verification and drifted from the real rows: an approved driver still read
   * "3/3 uploaded" with no mention of being verified.
   */
  const loadKycSummary = useCallback(async () => {
    if (!profile?.uid) {
      setKycUploadedCount(0);
      setKycStatus(null);
      return;
    }
    try {
      const { data } = await supabase()
        .from('driver_kyc_status')
        .select('review_status,is_verified,verified_docs,uploaded_docs,required_docs')
        .eq('driver_user_id', profile.uid)
        .maybeSingle();

      const row = data as {
        review_status: string | null;
        is_verified: boolean | null;
        verified_docs: number | null;
        uploaded_docs: number | null;
        required_docs: number | null;
      } | null;

      if (row) {
        setKycStatus({
          reviewStatus: row.review_status,
          isVerified: !!row.is_verified,
          verifiedDocs: row.verified_docs ?? 0,
          requiredDocs: row.required_docs ?? 0,
        });
        setKycUploadedCount(row.uploaded_docs ?? 0);
        return;
      }

      // No submission yet — fall back to counting uploaded documents so the
      // row still reflects progress before the driver presses submit.
      const { count } = await supabase()
        .from('driver_kyc_documents')
        .select('id', { count: 'exact', head: true })
        .eq('driver_user_id', profile.uid)
        .is('deleted_at', null);
      setKycStatus(null);
      setKycUploadedCount(count ?? 0);
    } catch {
      setKycUploadedCount(0);
      setKycStatus(null);
    }
  }, [profile?.uid]);

  useEffect(() => {
    loadTrips();
  }, [loadTrips]);

  useFocusEffect(useCallback(() => {
    loadTrips();
  }, [loadTrips]));

  // Shared with LevelProgressionScreen's identical subscription (same signed-in user
  // resolves the same driverIds) — same key means the realtime registry dedupes to one
  // channel instead of two when both screens are mounted. Scoped to this user's own
  // driver_id(s) — a driver's trips can span multiple orgs, so organization_id can't be
  // used here; waits for driverIds to resolve before subscribing.
  const driverIdsKey = driverIds.join(',');
  useEffect(() => {
    if (!profile?.uid || driverIds.length === 0) return;
    return subscribeSharedPostgresChanges(
      `driver-app:trips:driver:${profile.uid}`,
      [{ event: '*', schema: 'public', table: 'trips', filter: `driver_id=in.(${driverIdsKey})` }],
      () => { loadTrips(); },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- driverIdsKey is the stable dep for driverIds
  }, [profile?.uid, driverIdsKey, loadTrips]);

  useEffect(() => {
    void loadKycSummary();
  }, [loadKycSummary]);

  const primaryDriver = drivers[0] ?? null;

  useEffect(() => {
    let cancelled = false;
    const orgId = String(primaryDriver?.organization_id ?? '').trim();
    const vehicleId = String(primaryDriver?.assigned_vehicle_id ?? '').trim();
    if (!orgId || !vehicleId) {
      setAssignedVehicleLabel(null);
      setAssignedVehicleMeta(null);
      return;
    }
    void getVehicleById(orgId, vehicleId).then((res) => {
      if (cancelled) return;
      const v = res.vehicle;
      if (!v) {
        setAssignedVehicleLabel(null);
        setAssignedVehicleMeta(null);
        return;
      }
      setAssignedVehicleLabel((v.vehicle_number ?? '').trim() || null);
      setAssignedVehicleMeta({
        model: v.vehicle_model,
        type: v.vehicle_type,
        brand: v.vehicle_brand,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [primaryDriver?.organization_id, primaryDriver?.assigned_vehicle_id]);

  const tripsCount = completedTripCount;

  useEffect(() => {
    if (driverIds.length === 0) {
      setDriverRatings([]);
      setLoadingDriverRatings(false);
      return;
    }
    let cancelled = false;
    setLoadingDriverRatings(true);
    void getRatingsForDrivers(driverIds)
      .then((res) => {
        if (cancelled) return;
        if (res.error) {
          setDriverRatings([]);
          return;
        }
        const rows = Object.values(res.byDriverId ?? {}).flat();
        setDriverRatings(rows);
      })
      .catch(() => {
        if (!cancelled) setDriverRatings([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingDriverRatings(false);
      });
    return () => {
      cancelled = true;
    };
    // driverIdsKey is the stable dep for driverIds
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driverIdsKey]);

  const driverRatingAvg = useMemo(() => averageScore(driverRatings), [driverRatings]);
  const driverRatingCount = driverRatings.length;

  const experience = useMemo(
    () =>
      computeExperienceProgress({
        hasSignedUp: Boolean(profile?.uid || user?.uid),
        completedTrips: tripsCount,
        isVerified: Boolean(kycStatus?.isVerified),
        fiveStarCount: countFiveStarRatings(driverRatings),
      }),
    [profile?.uid, user?.uid, tripsCount, kycStatus?.isVerified, driverRatings],
  );
  const {
    currentLevel,
    currentLevelConfig,
    nextLevelConfig,
    experiencePct,
  } = experience;

  const handleMilestoneGuideAction = (kind: MilestoneGuideActionKind) => {
    setGuideLevel(null);
    if (kind === 'documents') {
      router.push('/(driver)/documents');
      return;
    }
    if (kind === 'find_work') {
      router.push(ROUTES.driverAvailableLoads());
    }
  };

  const fleetOrgName =
    (primaryDriver?.organizations as { name?: string } | null | undefined)?.name?.trim() ||
    'Fleet';
  const plateLabel = assignedVehicleLabel || tripVehicleLabel;
  const modelParts = [
    assignedVehicleMeta?.brand?.trim(),
    assignedVehicleMeta?.model?.trim() || assignedVehicleMeta?.type?.trim(),
  ].filter(Boolean);
  const vehicleDisplay = {
    model: modelParts.length > 0 ? modelParts.join(' ') : plateLabel ? 'Assigned vehicle' : 'No vehicle assigned',
    plate: plateLabel || (primaryDriver ? 'Not linked yet' : '—'),
    fleetId: fleetOrgName.slice(0, 18).toUpperCase(),
    assignedOn: formatShortDate(primaryDriver?.created_at),
    supervisor: fleetOrgName,
    odometer: '—',
    fuel: '—',
    engineTemp: '—',
    specs: [
      { label: 'Type', value: assignedVehicleMeta?.type?.trim() || '—' },
      { label: 'Brand', value: assignedVehicleMeta?.brand?.trim() || '—' },
      { label: 'Model', value: assignedVehicleMeta?.model?.trim() || '—' },
      { label: 'Plate', value: plateLabel || '—' },
    ] as { label: string; value: string }[],
    health: [
      { label: 'Assignment', value: plateLabel ? 'Linked' : 'Pending', color: Theme.driverEmerald },
      { label: 'Fleet', value: fleetOrgName, color: Theme.driverEmerald },
      { label: 'Status', value: primaryDriver ? 'Active' : '—', color: Theme.driverEmerald },
    ] as { label: string; value: string; color: string }[],
  };

  const handleBack = () => {
    if (profileView !== 'main') {
      setProfileView('main');
      return;
    }
    if (router.canGoBack()) router.back();
    else router.replace('/(driver)');
  };

  const buildDriverInviteUrl = () => {
    const base = 'https://pulse.netlify.app/invite';
    const ref = profile?.uid;
    return ref ? `${base}?ref=${ref}` : base;
  };

  const handleShareProfile = () => {
    Share.share({
      message: `${displayName} — Pulse Driver profile`,
      title: 'Share profile',
    }).catch(() => {});
  };

  const handleInviteDrivers = () => {
    const inviteUrl = buildDriverInviteUrl();
    const message =
      `Join me on Pulse Driver! Manage trips, payouts, and network requests.\n\n` +
      `Sign up here: ${inviteUrl}`;
    Share.share({
      title: 'Join Pulse Driver',
      message,
      url: inviteUrl,
    }).catch(() => {});
  };

  const handleSignOut = () => {
    void Promise.race([
      signOut(),
      new Promise<void>((resolve) => {
        setTimeout(resolve, 4000);
      }),
    ]).finally(() => {
      router.replace(ROUTES.SIGN_IN_DIRECT);
    });
  };

  const pageBg = isDark ? colors.background : SLATE_50;
  const cardBorder = isDark ? colors.borderSubtle : 'rgba(226,232,240,0.9)';
  const muted = colors.textMuted;

  const LevelView = () => (
    <View style={styles.subPage}>
      <View style={styles.subHeaderRow}>
        <TouchableOpacity style={[styles.iconPill, { borderColor: cardBorder, backgroundColor: colors.surface }]} onPress={() => setProfileView('main')}>
          <ChevronLeft size={20} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.subTitle, { color: colors.text }]}>EXPERIENCE ROADMAP</Text>
      </View>

      <View style={styles.heroDark}>
        <View style={styles.heroWatermark}>
          <Milestone size={120} color="rgba(255,255,255,0.06)" />
        </View>
        <View style={styles.rankRow}>
          <LinearGradient colors={[AMBER_500, '#d97706']} style={styles.crownBox}>
            <Crown size={28} color="#fff" />
          </LinearGradient>
          <View>
            <Text style={styles.heroEyebrowGold}>CURRENT MILESTONE</Text>
            <Text style={styles.heroRankTitle}>
              {currentLevelConfig.tier} · {currentLevelConfig.name}
            </Text>
          </View>
        </View>

        <View style={styles.roadLineWrap}>
          <View style={styles.roadLine} />
          {experience.levels.map((step) => {
            const past = isMilestoneCompleted(step.level, experience);
            const active = isMilestoneInProgress(step.level, experience);
            const count = getMilestoneCount(step, experience.metrics);
            return (
                <Pressable
                  key={step.level}
                  style={styles.roadStep}
                  onPress={() => setGuideLevel(step)}
                  accessibilityRole="button"
                  accessibilityLabel={`L${step.level} ${step.name}. ${step.goalText}`}
                  accessibilityHint="Shows what to do to complete this level"
                >
                <View
                  style={[
                    styles.roadDot,
                    { borderColor: SLATE_900 },
                    active && { backgroundColor: AMBER_400 },
                    past && !active && { backgroundColor: Theme.driverEmerald },
                    !past && !active && { backgroundColor: '#475569' },
                  ]}
                />
                <View style={[styles.roadCard, active ? styles.roadCardActive : styles.roadCardMuted]}>
                  <View style={styles.roadCardTop}>
                    <Text style={styles.roadTier}>
                      L{step.level} {step.name}
                    </Text>
                    <Text style={styles.roadMin}>{step.goalText}</Text>
                  </View>
                  {active ? (
                    <View style={{ marginTop: 10 }}>
                      <View style={styles.roadProgLabels}>
                        <Text style={styles.roadProgLeft}>
                          {nextLevelConfig
                            ? `Progress to ${nextLevelConfig.name}`
                            : 'Final milestone'}
                        </Text>
                        <Text style={styles.roadProgPct}>{experiencePct}%</Text>
                      </View>
                      <View style={styles.progressTrack}>
                        <View style={[styles.progressFillGold, { width: `${experiencePct}%` }]} />
                      </View>
                      <Text style={[styles.roadMin, { marginTop: 6 }]}>
                        {count.done}/{count.target} · unlocks {step.privilege}
                      </Text>
                    </View>
                  ) : null}
                </View>
                </Pressable>
            );
          })}
        </View>
      </View>

      <View style={[styles.metricsCard, { backgroundColor: colors.surface, borderColor: cardBorder }]}>
        <Text style={[styles.metricsTitle, { color: muted }]}>EXPERIENCE METRICS</Text>
        <View style={styles.metricsGrid}>
          <View style={[styles.metricCell, { backgroundColor: isDark ? colors.surfaceElevated : '#f1f5f9' }]}>
            <Text style={[styles.metricLabel, { color: muted }]}>TRIPS DONE</Text>
            <Text style={[styles.metricValue, { color: colors.text }]}>{tripsCount}</Text>
          </View>
          <View style={[styles.metricCell, { backgroundColor: isDark ? colors.surfaceElevated : '#f1f5f9' }]}>
            <Text style={[styles.metricLabel, { color: muted }]}>5★ RATINGS</Text>
            <Text style={[styles.metricValue, { color: Theme.driverEmeraldDark }]}>
              {experience.metrics.fiveStarCount}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );

  const VehicleTechnicalView = () => (
    <View style={styles.subPage}>
      <View style={styles.subHeaderRow}>
        <TouchableOpacity style={[styles.iconPill, { borderColor: cardBorder, backgroundColor: colors.surface }]} onPress={() => setProfileView('main')}>
          <ChevronLeft size={20} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.subTitle, { color: colors.text }]}>FLEET VEHICLE</Text>
      </View>

      <View style={styles.heroDark}>
        <View style={[styles.heroWatermark, { padding: 28 }]}>
          <Truck size={120} color="rgba(255,255,255,0.1)" />
        </View>
        <View style={styles.vehicleHeroTop}>
          <View style={styles.fleetBadge}>
            <Text style={styles.fleetBadgeText}>{vehicleDisplay.fleetId}</Text>
          </View>
          <View style={styles.connectedRow}>
            <View style={styles.pulseDot} />
            <Text style={styles.connectedText}>Connected</Text>
          </View>
        </View>
        <Text style={styles.vehicleModel}>{vehicleDisplay.model}</Text>
        <Text style={styles.vehiclePlate}>{vehicleDisplay.plate}</Text>
        <View style={styles.vehicleGrid2}>
          <View style={styles.vehicleStatDark}>
            <Text style={styles.vehicleStatLabel}>ASSIGNED ON</Text>
            <Text style={styles.vehicleStatValue}>{vehicleDisplay.assignedOn}</Text>
          </View>
          <View style={styles.vehicleStatDark}>
            <Text style={styles.vehicleStatLabel}>SUPERVISOR</Text>
            <Text style={styles.vehicleStatValue}>{vehicleDisplay.supervisor}</Text>
          </View>
        </View>
      </View>

      <View style={styles.triGaugeRow}>
        <View style={[styles.gaugeCard, { backgroundColor: colors.surface, borderColor: cardBorder }]}>
          <Fuel size={20} color={Theme.driverEmerald} />
          <Text style={[styles.gaugeVal, { color: colors.text }]}>{vehicleDisplay.fuel}</Text>
          <Text style={[styles.gaugeLbl, { color: muted }]}>FUEL</Text>
        </View>
        <View style={[styles.gaugeCard, { backgroundColor: colors.surface, borderColor: cardBorder }]}>
          <Gauge size={20} color="#3b82f6" />
          <Text style={[styles.gaugeVal, { color: colors.text }]}>{vehicleDisplay.odometer}</Text>
          <Text style={[styles.gaugeLbl, { color: muted }]}>KM</Text>
        </View>
        <View style={[styles.gaugeCard, { backgroundColor: colors.surface, borderColor: cardBorder }]}>
          <Thermometer size={20} color="#f43f5e" />
          <Text style={[styles.gaugeVal, { color: colors.text }]}>{vehicleDisplay.engineTemp}</Text>
          <Text style={[styles.gaugeLbl, { color: muted }]}>TEMP</Text>
        </View>
      </View>

      <View style={[styles.whiteCardLg, { backgroundColor: colors.surface, borderColor: cardBorder }]}>
        <View style={styles.cardHeadRow}>
          <Dna size={16} color={muted} />
          <Text style={[styles.cardHeadTitle, { color: muted }]}>TECH SPECS</Text>
        </View>
        {vehicleDisplay.specs.map((spec, i) => (
          <View key={spec.label} style={[styles.specRow, i < vehicleDisplay.specs.length - 1 && styles.specRowBorder]}>
            <Text style={[styles.specLabel, { color: muted }]}>{spec.label}</Text>
            <Text style={[styles.specValue, { color: colors.text }]}>{spec.value}</Text>
          </View>
        ))}
      </View>

      <View style={[styles.whiteCardLg, { backgroundColor: colors.surface, borderColor: cardBorder }]}>
        <View style={styles.cardHeadRow}>
          <Wrench size={16} color={muted} />
          <Text style={[styles.cardHeadTitle, { color: muted }]}>HEALTH DIAGNOSTICS</Text>
        </View>
        {vehicleDisplay.health.map((h) => (
          <View key={h.label} style={[styles.healthRow, { backgroundColor: isDark ? colors.surfaceElevated : '#f8fafc' }]}>
            <Text style={[styles.healthLabel, { color: colors.text }]}>{h.label}</Text>
            <Text style={[styles.healthValue, { color: h.color }]}>{h.value}</Text>
          </View>
        ))}
      </View>
    </View>
  );

  return (
    <View style={[styles.outer, { backgroundColor: pageBg }]}>
      <View
        style={[
          styles.topBar,
          {
            paddingTop: insets.top + Layout.driverHeaderTopOffset,
            paddingBottom: Layout.driverHeaderBottomPadding,
            borderBottomColor: cardBorder,
            backgroundColor: isDark ? 'rgba(15,23,42,0.92)' : 'rgba(255,255,255,0.85)',
          },
        ]}
      >
        <TouchableOpacity style={styles.topIconBtn} onPress={handleBack} hitSlop={12}>
          <ChevronLeft size={22} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.titleCenter}>
          <Text style={[styles.headerName, { color: colors.text }]} numberOfLines={1}>
            {displayName}
          </Text>
          <View style={styles.liveDot} />
        </View>
        <View style={styles.topActions}>
          <TouchableOpacity
            style={styles.topIconBtn}
            onPress={handleInviteDrivers}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Invite drivers"
          >
            <UserPlus size={Layout.driverHeaderActionIconSize} color={muted} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.topIconBtn}
            onPress={handleShareProfile}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Share profile"
          >
            <Share2 size={Layout.driverHeaderActionIconSize} color={muted} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{
          paddingTop: 12,
          paddingBottom: scrollBottomPad,
          paddingHorizontal: SCREEN_PAD,
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <>
            {profileView === 'main' && (
              <View style={{ gap: 14 }}>
                <LinearGradient colors={['#0f172a', '#020617']} style={styles.profileHero}>
                  <View style={styles.heroGlow} />
                  <TouchableOpacity style={styles.avatarCluster} onPress={() => setShowEditProfileModal(true)} activeOpacity={0.9}>
                    <LinearGradient colors={[Theme.driverPrimary, Theme.driverEmeraldDark, '#0f766e']} style={styles.avatarRing}>
                      <View style={styles.avatarInner}>
                        {displayAvatarSource ? (
                          <Image source={displayAvatarSource} style={styles.avatarImg} resizeMode="cover" />
                        ) : (
                          <View
                            style={[
                              styles.avatarImg,
                              {
                                backgroundColor: displayAvatarColor,
                                alignItems: 'center',
                                justifyContent: 'center',
                              },
                            ]}
                          >
                            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 24 }}>
                              {displayAvatarInitials}
                            </Text>
                          </View>
                        )}
                        <View style={styles.camOverlay} pointerEvents="none">
                          <Camera size={18} color="#fff" />
                        </View>
                      </View>
                    </LinearGradient>
                    <View style={styles.levelBadge}>
                      <Trophy size={12} color="#fff" />
                      <Text style={styles.levelBadgeText}>Lvl {currentLevel}</Text>
                    </View>
                  </TouchableOpacity>
                  <Text style={styles.profileNameHero}>{displayName}</Text>
                  <Text style={styles.tierSmall}>{currentLevelConfig.tier} rank · {currentLevelConfig.name}</Text>

                  <TouchableOpacity style={styles.xpCard} onPress={() => setProfileView('levels')} activeOpacity={0.88}>
                    <View style={styles.xpTop}>
                      <Text style={styles.xpEyebrow}>EXPERIENCE PROGRESS</Text>
                      <Text style={styles.xpPct}>{experiencePct}%</Text>
                    </View>
                    <View style={styles.progressTrackDark}>
                      <LinearGradient
                        colors={[Theme.driverEmerald, Theme.driverPrimary]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={[styles.progressFillEm, { width: `${experiencePct}%` }]}
                      />
                    </View>
                    <View style={styles.xpFooter}>
                      <Text style={styles.xpFooterTxt}>
                        {experience.currentCount.done}/{experience.currentCount.target} · {tripsCount} trips
                      </Text>
                      <Text style={styles.xpFooterTxt}>{nextLevelConfig?.name ?? 'Max'} next</Text>
                    </View>
                  </TouchableOpacity>
                </LinearGradient>

                <View style={[styles.bioStatementCard, { backgroundColor: colors.surface, borderColor: cardBorder }]}>
                  <View style={styles.bioStatementHeader}>
                    <View style={styles.bioStatementTitleRow}>
                      <View style={[styles.quoteIconWrap, { backgroundColor: isDark ? colors.emeraldMuted : 'rgba(167,243,208,0.38)' }]}>
                        <Quote size={15} color={Theme.driverEmerald} strokeWidth={2.2} />
                      </View>
                      <Text style={[styles.bioStatementEyebrow, { color: muted }]}>Pilot statement</Text>
                    </View>
                    <TouchableOpacity
                      style={[styles.bioEditBtn, { backgroundColor: isDark ? colors.whiteMuted : '#f1f5f9' }]}
                      onPress={() => setShowEditProfileModal(true)}
                      hitSlop={12}
                      accessibilityRole="button"
                      accessibilityLabel="Edit bio"
                    >
                      <Edit3 size={16} color={muted} strokeWidth={2.2} />
                    </TouchableOpacity>
                  </View>
                  <Text style={[styles.bioStatementBody, { color: colors.text }]}>
                    {(profile?.status_text ?? '').trim().length > 0
                      ? `"${(profile?.status_text ?? '').trim()}"`
                      : 'Add a short bio — visible to passengers and fleet managers. Tap edit to update.'}
                  </Text>
                </View>

                <TouchableOpacity
                  style={[styles.rowCard, webPress, { backgroundColor: colors.surface, borderColor: cardBorder }]}
                  onPress={() =>
                    router.push(ROUTES.driverDcoStatus() as Parameters<typeof router.push>[0])
                  }
                  activeOpacity={0.88}
                  accessibilityRole="button"
                  accessibilityLabel={dcoStatus === 'NONE' ? 'Become a DCO' : 'DCO status'}
                >
                  <View style={styles.rowCardLeft}>
                    <View style={[styles.blueIcon, { backgroundColor: isDark ? colors.emeraldMuted : 'rgba(167,243,208,0.45)' }]}>
                      <Gavel size={20} color={colors.emerald} />
                    </View>
                    <View style={styles.rowCardText}>
                      <Text style={[styles.rowEyebrow, { color: muted }]}>
                        {dcoStatus === 'APPROVED' ? 'DCO' : 'INDEPENDENT OWNER-OPERATOR'}
                      </Text>
                      <Text style={[styles.rowTitle, { color: colors.text }]}>
                        {dcoStatus === 'NONE'
                          ? 'Become a DCO'
                          : dcoStatus === 'PENDING'
                            ? 'DCO — Under review'
                            : dcoStatus === 'APPROVED'
                              ? 'DCO status'
                              : dcoStatus === 'REJECTED'
                                ? 'DCO — Request again'
                                : 'DCO — Suspended'}
                      </Text>
                      <Text style={[styles.rowSub, { color: muted }]} numberOfLines={2}>
                        {dcoStatus === 'APPROVED'
                          ? 'Your vehicle · Marketplace bids & awards'
                          : 'Become an independent owner-operator'}
                      </Text>
                    </View>
                  </View>
                  <View style={[styles.chevPill, { backgroundColor: isDark ? colors.surfaceElevated : '#f1f5f9' }]}>
                    <ChevronRight size={18} color={muted} />
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.rowCard, webPress, { backgroundColor: colors.surface, borderColor: cardBorder }]}
                  onPress={() =>
                    router.push(ROUTES.driverDcoStatus() as Parameters<typeof router.push>[0])
                  }
                  activeOpacity={0.88}
                  accessibilityRole="button"
                  accessibilityLabel="DCO status"
                >
                  <View style={styles.rowCardLeft}>
                    <View style={[styles.blueIcon, { backgroundColor: isDark ? colors.emeraldMuted : 'rgba(167,243,208,0.45)' }]}>
                      <Gavel size={20} color={colors.emerald} />
                    </View>
                    <View style={styles.rowCardText}>
                      <Text style={[styles.rowEyebrow, { color: muted }]}>
                        {dcoStatus === 'APPROVED' ? 'DCO' : 'INDEPENDENT OWNER-OPERATOR'}
                      </Text>
                      <Text style={[styles.rowTitle, { color: colors.text }]}>
                        {dcoStatus === 'NONE'
                          ? 'Become a DCO'
                          : dcoStatus === 'PENDING'
                            ? 'DCO — Under review'
                            : dcoStatus === 'APPROVED'
                              ? 'DCO status'
                              : dcoStatus === 'REJECTED'
                                ? 'DCO — Request again'
                                : 'DCO — Suspended'}
                      </Text>
                      <Text style={[styles.rowSub, { color: muted }]} numberOfLines={2}>
                        {dcoStatus === 'APPROVED'
                          ? 'Bid in the marketplace as an independent owner-operator'
                          : 'Admin-approved independent owner-operator status'}
                      </Text>
                    </View>
                  </View>
                  <View style={[styles.chevPill, { backgroundColor: isDark ? colors.surfaceElevated : '#f1f5f9' }]}>
                    <ChevronRight size={18} color={muted} />
                  </View>
                </TouchableOpacity>

                <TouchableOpacity style={[styles.rowCard, webPress, { backgroundColor: colors.surface, borderColor: cardBorder }]} onPress={() => setProfileView('vehicle')} activeOpacity={0.88}>
                  <View style={styles.rowCardLeft}>
                    <View style={styles.blueIcon}>
                      <Truck size={20} color="#3b82f6" />
                    </View>
                    <View style={styles.rowCardText}>
                      <Text style={[styles.rowEyebrow, { color: muted }]}>FLEET ASSIGNED</Text>
                      <Text style={[styles.rowTitle, { color: colors.text }]}>{vehicleDisplay.model}</Text>
                    </View>
                  </View>
                  <View style={[styles.chevPill, { backgroundColor: isDark ? colors.surfaceElevated : '#f1f5f9' }]}>
                    <ChevronRight size={18} color={muted} />
                  </View>
                </TouchableOpacity>

                <Pressable
                  style={({ pressed }) => [
                    styles.rowCard,
                    webPress,
                    { backgroundColor: colors.surface, borderColor: cardBorder, opacity: pressed ? 0.88 : 1 },
                  ]}
                  onPress={() => router.push('/(driver)/documents')}
                  accessibilityRole="button"
                  accessibilityLabel="Upload and verify documents"
                >
                  <View style={styles.rowCardLeft}>
                    <View style={styles.darkIcon}>
                      <Shield size={18} color="#fff" />
                    </View>
                    <View style={styles.rowCardText}>
                      <Text style={[styles.rowEyebrow, { color: muted }]}>KYC & COMPLIANCE</Text>
                      <View style={styles.rowTitleLine}>
                        <Text style={[styles.rowTitle, { color: colors.text }]}>
                          {kycStatus?.isVerified ? 'Identity verified' : 'Upload & verify documents'}
                        </Text>
                        {kycStatus?.isVerified ? (
                          <View style={[styles.verifiedPill, { backgroundColor: colors.emeraldMuted }]}>
                            <Text style={[styles.verifiedPillText, { color: colors.emerald }]}>
                              VERIFIED
                            </Text>
                          </View>
                        ) : null}
                      </View>
                      <Text
                        style={[
                          styles.rowSub,
                          {
                            color: kycStatus?.reviewStatus === 'rejected' ? Theme.negative : muted,
                          },
                        ]}
                        numberOfLines={2}
                      >
                        {kycStatus?.isVerified
                          ? `${kycStatus.verifiedDocs} document${kycStatus.verifiedDocs === 1 ? '' : 's'} verified by our team`
                          : kycStatus?.reviewStatus === 'submitted'
                            ? 'Awaiting verification — our team is reviewing'
                            : kycStatus?.reviewStatus === 'rejected'
                              ? 'Rejected — tap to see what needs fixing'
                              : `${kycUploadedCount} uploaded · tap to add or submit`}
                      </Text>
                    </View>
                  </View>
                  <View style={[styles.chevPill, { backgroundColor: isDark ? colors.surfaceElevated : '#f1f5f9' }]}>
                    <ChevronRight size={18} color={muted} />
                  </View>
                </Pressable>

                <Pressable
                  style={({ pressed }) => [
                    styles.rowCard,
                    webPress,
                    { backgroundColor: colors.surface, borderColor: cardBorder, opacity: pressed ? 0.88 : 1 },
                  ]}
                  onPress={() =>
                    router.push(
                      ROUTES.MODALS.LANGUAGE_SETTINGS as Parameters<typeof router.push>[0],
                    )
                  }
                  accessibilityRole="button"
                  accessibilityLabel="Language settings"
                >
                  <View style={styles.rowCardLeft}>
                    <View style={styles.violetIcon}>
                      <Globe size={18} color={Theme.primary} />
                    </View>
                    <View style={styles.rowCardText}>
                      <Text style={[styles.rowEyebrow, { color: muted }]}>PREFERENCES</Text>
                      <Text style={[styles.rowTitle, { color: colors.text }]}>Language</Text>
                      <Text style={[styles.rowSub, { color: muted }]} numberOfLines={1}>
                        {languageLabel}
                      </Text>
                    </View>
                  </View>
                  <View style={[styles.chevPill, { backgroundColor: isDark ? colors.surfaceElevated : '#f1f5f9' }]}>
                    <ChevronRight size={18} color={muted} />
                  </View>
                </Pressable>

                <View style={styles.statsRow}>
                  <View style={[styles.statBox, { backgroundColor: colors.surface, borderColor: cardBorder }]}>
                    <View style={styles.amberIcon}>
                      <Star size={18} color="#d97706" fill="#d97706" />
                    </View>
                    <Text style={[styles.statNum, { color: colors.text }]}>
                      {loadingDriverRatings && driverRatings.length === 0
                        ? '–'
                        : driverRatingAvg != null
                          ? driverRatingAvg.toFixed(1)
                          : '—'}
                    </Text>
                    <Text style={[styles.statLbl, { color: muted }]}>AVG RATING</Text>
                    {!loadingDriverRatings && driverRatingCount > 0 ? (
                      <Text style={[styles.statHint, { color: muted }]} numberOfLines={1}>
                        {driverRatingCount} {driverRatingCount === 1 ? 'review' : 'reviews'}
                      </Text>
                    ) : null}
                  </View>
                  <Pressable
                    style={({ pressed }) => [
                      styles.statBox,
                      webPress,
                      { backgroundColor: colors.surface, borderColor: cardBorder, opacity: pressed ? 0.88 : 1 },
                    ]}
                    onPress={() => router.push('/(driver)/trip-history')}
                    accessibilityRole="button"
                    accessibilityLabel="Open trip history"
                  >
                    <View style={styles.blueIconSm}>
                      <History size={18} color="#3b82f6" />
                    </View>
                    <Text style={[styles.statNum, { color: colors.text }]}>
                      {!tripsLoaded && loadingTrips ? '–' : tripsCount}
                    </Text>
                    <Text style={[styles.statLbl, { color: muted }]}>TRIPS</Text>
                  </Pressable>
                </View>

                <Pressable
                  style={({ pressed }) => [
                    styles.signOutCard,
                    webPress,
                    { backgroundColor: colors.surface, borderColor: cardBorder, opacity: pressed ? 0.85 : 1 },
                  ]}
                  onPress={handleSignOut}
                  accessibilityRole="button"
                  accessibilityLabel="Sign out"
                >
                  <LogOut size={18} color="#f43f5e" />
                  <Text style={styles.signOutLbl}>Sign out</Text>
                </Pressable>
              </View>
            )}
            {profileView === 'levels' && <LevelView />}
            {profileView === 'vehicle' && <VehicleTechnicalView />}
        </>
      </ScrollView>

      <MilestoneHowToModal
        visible={guideLevel != null}
        level={guideLevel}
        progress={experience}
        audience="driver"
        onClose={() => setGuideLevel(null)}
        onAction={handleMilestoneGuideAction}
      />

      <EditProfileModal
        visible={showEditProfileModal}
        layout="driver"
        avatarPresetStyle="user-2d"
        heroSubtitle={`${currentLevelConfig.tier} · ${currentLevelConfig.name}`}
        onClose={() => {
          setShowEditProfileModal(false);
          void refreshSession();
        }}
        initialFullName={profile?.full_name ?? profile?.displayName ?? ''}
        initialPhone={profile?.phone ?? ''}
        initialCompanyName={profile?.company_name ?? ''}
        email={user?.email ?? ''}
        onPhotoUpdated={async (payload) => {
          if (payload?.avatarUri?.trim()) {
            setPreviewUri(payload.avatarUri.trim());
          } else if (payload && !payload.avatarUri) {
            setPreviewUri(null);
          }
          if (payload?.avatarPath) {
            patchProfile({ avatar_url: payload.avatarPath, avatar_seed: undefined });
          } else if (payload && payload.avatarPath === null) {
            patchProfile({ avatar_url: undefined });
          }
          void refreshSession();
        }}
        initialAvatarSeed={profile?.avatar_seed?.trim() || avatarSeed}
        onPresetSelected={(seed) => {
          setAvatarSeed(seed);
          setPreviewUri(null);
          patchProfile({ avatar_url: undefined, avatar_seed: seed });
          void refreshSession();
        }}
        initialStatusText={profile?.status_text ?? ''}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  outer: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Layout.driverHeaderHorizontalPadding,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  topActions: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  topIconBtn: {
    width: Layout.driverHeaderActionSize,
    height: Layout.driverHeaderActionSize,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  headerName: { fontSize: 14, fontWeight: '700', maxWidth: 200 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: Theme.driverEmerald },
  scroll: { flex: 1 },

  profileHero: {
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 18,
    overflow: 'hidden',
    alignItems: 'center',
  },
  heroGlow: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(16,185,129,0.08)',
  },
  avatarCluster: { marginBottom: 12, alignItems: 'center' },
  avatarRing: { padding: 3, borderRadius: 26 },
  avatarInner: {
    width: 84,
    height: 84,
    borderRadius: 22,
    backgroundColor: '#1e293b',
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: SLATE_900,
  },
  avatarImg: { width: '100%', height: '100%' },
  camOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  levelBadge: {
    position: 'absolute',
    right: -6,
    bottom: -2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: Theme.driverEmeraldDark,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 3,
    borderColor: SLATE_900,
  },
  levelBadgeText: { fontSize: 9, fontWeight: '800', color: '#fff' },
  profileNameHero: { fontSize: 18, fontWeight: '800', color: '#fff', letterSpacing: -0.3 },
  tierSmall: { marginTop: 4, fontSize: 10, fontWeight: '700', color: Theme.driverPrimary, letterSpacing: 1 },
  xpCard: {
    marginTop: 14,
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  xpTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  xpEyebrow: { fontSize: 9, fontWeight: '700', color: 'rgba(148,163,184,0.95)', letterSpacing: 1.2 },
  xpPct: { fontSize: 10, fontWeight: '800', color: Theme.driverPrimary },
  progressTrackDark: {
    height: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(15,23,42,0.9)',
    overflow: 'hidden',
  },
  progressFillEm: { height: '100%', borderRadius: 999 },
  xpFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  xpFooterTxt: { fontSize: 10, fontWeight: '600', color: 'rgba(148,163,184,0.9)' },

  bioStatementCard: {
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 14,
    overflow: 'hidden',
  },
  bioStatementHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  bioStatementTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  quoteIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bioStatementEyebrow: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  bioEditBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bioStatementBody: {
    fontSize: 13,
    fontWeight: '500',
    fontStyle: 'italic',
    lineHeight: 19,
    opacity: 0.92,
  },

  rowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 44,
    borderRadius: 16,
    borderWidth: 1,
    gap: 10,
  },
  rowCardLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 },
  rowCardText: { flex: 1, minWidth: 0 },
  blueIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: 'rgba(59,130,246,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  darkIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: SLATE_900,
    alignItems: 'center',
    justifyContent: 'center',
  },
  violetIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: 'rgba(79,70,229,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowEyebrow: { fontSize: 9, fontWeight: '700', letterSpacing: 1.2, marginBottom: 2 },
  rowTitle: { fontSize: 15, fontWeight: '700' },
  rowTitleLine: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  verifiedPill: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  verifiedPillText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  rowSub: { marginTop: 4, fontSize: 11, fontWeight: '500', lineHeight: 15 },
  chevPill: { padding: 8, borderRadius: 12 },
  statsRow: { flexDirection: 'row', gap: 10 },
  statBox: {
    flex: 1,
    padding: 14,
    minHeight: 44,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
  },
  amberIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: 'rgba(245,158,11,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  blueIconSm: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: 'rgba(59,130,246,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  statNum: { fontSize: 18, fontWeight: '800' },
  statLbl: { marginTop: 4, fontSize: 9, fontWeight: '700', letterSpacing: 1.2 },
  statHint: { marginTop: 3, fontSize: 10, fontWeight: '600' },
  signOutCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    minHeight: 44,
    borderRadius: 16,
    borderWidth: 1,
  },
  signOutLbl: { fontSize: 13, fontWeight: '700', color: '#f43f5e' },

  subPage: { gap: 14, paddingBottom: 8 },
  subHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
  iconPill: {
    padding: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  subTitle: { fontSize: 13, fontWeight: '800', letterSpacing: 0.8 },

  heroDark: {
    backgroundColor: SLATE_900,
    borderRadius: 20,
    padding: 16,
    overflow: 'hidden',
  },
  heroWatermark: { position: 'absolute', top: 0, right: 0, padding: 16 },
  rankRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  crownBox: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  heroEyebrowGold: { fontSize: 9, color: AMBER_400, fontWeight: '700', letterSpacing: 1.2 },
  heroRankTitle: { fontSize: 18, fontWeight: '800', color: '#fff' },

  roadLineWrap: { paddingLeft: 28, gap: 22 },
  roadLine: {
    position: 'absolute',
    left: 11,
    top: 10,
    bottom: 10,
    width: 2,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  roadStep: { flexDirection: 'row', gap: 12, position: 'relative' },
  roadDot: {
    position: 'absolute',
    left: -21,
    top: 14,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 4,
    zIndex: 2,
  },
  roadCard: { flex: 1, padding: 14, borderRadius: 18, borderWidth: 1 },
  roadCardActive: { backgroundColor: 'rgba(255,255,255,0.08)', borderColor: 'rgba(255,255,255,0.18)' },
  roadCardMuted: { borderColor: 'transparent', opacity: 0.45 },
  roadCardTop: { flexDirection: 'row', justifyContent: 'space-between' },
  roadTier: { fontSize: 11, fontWeight: '900', color: '#fff', letterSpacing: 2 },
  roadMin: { fontSize: 10, fontWeight: '800', color: 'rgba(148,163,184,0.9)' },
  roadProgLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  roadProgLeft: { fontSize: 9, fontWeight: '800', color: 'rgba(148,163,184,0.85)', letterSpacing: 1 },
  roadProgPct: { fontSize: 9, fontWeight: '900', color: AMBER_400 },
  progressTrack: { height: 4, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.12)', overflow: 'hidden', marginTop: 6 },
  progressFillGold: { height: '100%', backgroundColor: AMBER_400, borderRadius: 999 },

  metricsCard: { borderRadius: 32, padding: 22, borderWidth: 1 },
  metricsTitle: { fontSize: 11, fontWeight: '900', letterSpacing: 3, marginBottom: 14 },
  metricsGrid: { flexDirection: 'row', gap: 12 },
  metricCell: { flex: 1, padding: 14, borderRadius: 18 },
  metricLabel: { fontSize: 9, fontWeight: '900', letterSpacing: 1, marginBottom: 6 },
  metricValue: { fontSize: 14, fontWeight: '900' },

  vehicleHeroTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 18 },
  fleetBadge: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  fleetBadgeText: { fontSize: 9, fontWeight: '700', color: '#fff', letterSpacing: 1.2 },
  connectedRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pulseDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: Theme.driverEmerald },
  connectedText: { fontSize: 10, fontWeight: '600', color: Theme.driverPrimary },
  vehicleModel: { fontSize: 20, fontWeight: '800', color: '#fff', letterSpacing: -0.3 },
  vehiclePlate: { marginTop: 4, fontSize: 11, fontWeight: '700', color: 'rgba(148,163,184,0.95)', letterSpacing: 2 },
  vehicleGrid2: { flexDirection: 'row', gap: 10, marginTop: 14 },
  vehicleStatDark: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  vehicleStatLabel: { fontSize: 10, color: 'rgba(148,163,184,0.85)', fontWeight: '600', marginBottom: 4 },
  vehicleStatValue: { fontSize: 12, fontWeight: '700', color: '#fff' },
  triGaugeRow: { flexDirection: 'row', gap: 8 },
  gaugeCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
    gap: 4,
  },
  gaugeVal: { fontSize: 16, fontWeight: '800' },
  gaugeLbl: { fontSize: 8, fontWeight: '700', letterSpacing: 1.2 },
  whiteCardLg: { borderRadius: 16, padding: 14, borderWidth: 1 },
  cardHeadRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  cardHeadTitle: { fontSize: 10, fontWeight: '700', letterSpacing: 1.5 },
  specRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10 },
  specRowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(226,232,240,0.8)' },
  specLabel: { fontSize: 12, fontWeight: '600' },
  specValue: { fontSize: 12, fontWeight: '700' },
  healthRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 14,
    marginBottom: 8,
  },
  healthLabel: { fontSize: 12, fontWeight: '600' },
  healthValue: { fontSize: 10, fontWeight: '700' },
});
