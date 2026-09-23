/**
 * Driver level progression — Experience milestones from LEVELS_CONFIG.
 * Live trips + KYC + five-star ratings drive sequential progress.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Platform, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import Theme from '@/constants/Theme';
import {
  DRIVER_DETAIL_HORIZONTAL_PAD,
  DriverSubScreenHeader,
  driverDetailPageBackground,
} from '@/components/driver/DriverSubScreenHeader';
import { useDriverTheme, useDriverThemeColors } from '@/contexts/DriverThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { CenteredLoadingView } from '@/components/CenteredLoadingView';
import { subscribeSharedPostgresChanges } from '@/lib/realtimeRegistry';
import * as driversService from '@/features/drivers/services/drivers.service';
import * as tripsService from '@/features/trips/services/trips.service';
import { getRatingsForDrivers } from '@/features/ratings/services/ratings.service';
import type { RatingRow } from '@/features/ratings/types';
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
import { ROUTES } from '@/lib/routes';
import { supabase } from '@/lib/supabase';

const DARK_HERO_BG = '#0f0f0f';
const DARK_CARD_BORDER = 'rgba(255,255,255,0.06)';

function getLevelIcon(type: string): 'user' | 'truck' | 'id-card' | 'star' {
  if (type === 'trips') return 'truck';
  if (type === 'ratings') return 'star';
  if (type === 'verification') return 'id-card';
  return 'user';
}

export default function LevelProgressionScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { theme } = useDriverTheme();
  const isDark = theme === 'dark';
  const colors = useDriverThemeColors();
  const pageBg = driverDetailPageBackground(isDark, colors.background);

  const handleBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(driver)/profile');
  };
  const { profile, user } = useAuth();
  const [tripsCount, setTripsCount] = useState(0);
  const [ratings, setRatings] = useState<RatingRow[]>([]);
  const [isVerified, setIsVerified] = useState(false);
  const [loading, setLoading] = useState(true);
  const [linkedDriverIds, setLinkedDriverIds] = useState<string[]>([]);
  const [guideLevel, setGuideLevel] = useState<ExperienceLevelConfig | null>(null);

  const load = useCallback((showLoading = true) => {
    if (!profile?.uid) {
      setLoading(false);
      return;
    }
    if (showLoading) setLoading(true);
    void (async () => {
      try {
        const [driversRes, kycRes] = await Promise.all([
          driversService.getLinkedDriversForCurrentUser(profile.uid),
          supabase()
            .from('driver_kyc_status')
            .select('is_verified')
            .eq('driver_user_id', profile.uid)
            .maybeSingle(),
        ]);
        setIsVerified(Boolean((kycRes.data as { is_verified?: boolean } | null)?.is_verified));

        const drivers = driversRes.drivers ?? [];
        const driverIds = drivers.map((d) => d.id);
        // Same id set the trips query below uses — drives the realtime subscription filter.
        setLinkedDriverIds(driverIds);
        if (driverIds.length === 0) {
          setTripsCount(0);
          setRatings([]);
          return;
        }
        const [tRes, rRes] = await Promise.all([
          tripsService.getDriverUiTripsByDriverIds(driverIds),
          getRatingsForDrivers(driverIds),
        ]);
        const list = tRes.trips ?? [];
        setTripsCount(list.filter((t) => tripsService.isTripCompleted(t)).length);
        const byDriver = rRes.byDriverId ?? {};
        setRatings(Object.values(byDriver).flat());
      } finally {
        setLoading(false);
      }
    })();
  }, [profile?.uid]);

  useEffect(() => {
    load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      load(false);
    }, [load]),
  );

  // Shared with DriverProfileScreen's identical subscription (same signed-in user
  // resolves the same driverIds) — same key means the realtime registry dedupes to one
  // channel instead of two when both screens are mounted. Scoped to this user's own
  // driver_id(s) — a driver's trips can span multiple orgs, so organization_id can't be
  // used here; waits for linkedDriverIds to resolve before subscribing.
  const linkedDriverIdsKey = linkedDriverIds.join(',');
  useEffect(() => {
    if (!profile?.uid || linkedDriverIds.length === 0) return;
    return subscribeSharedPostgresChanges(
      `driver-app:trips:driver:${profile.uid}`,
      [{ event: '*', schema: 'public', table: 'trips', filter: `driver_id=in.(${linkedDriverIdsKey})` }],
      () => {
        load(false);
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- linkedDriverIdsKey is the stable dep for linkedDriverIds
  }, [profile?.uid, linkedDriverIdsKey, load]);

  const experience = useMemo(
    () =>
      computeExperienceProgress({
        hasSignedUp: Boolean(profile?.uid || user?.uid),
        completedTrips: tripsCount,
        isVerified,
        fiveStarCount: countFiveStarRatings(ratings),
      }),
    [profile?.uid, user?.uid, tripsCount, isVerified, ratings],
  );

  const {
    currentLevel,
    currentLevelConfig,
    nextLevelConfig,
    experiencePct,
    currentCount,
  } = experience;

  const roadToLabel = nextLevelConfig
    ? `ROAD TO ${nextLevelConfig.name.toUpperCase()}`
    : `${currentLevelConfig.tier.toUpperCase()} MAX`;

  if (loading) {
    return <CenteredLoadingView message="Loading…" color={Theme.driverPrimary} />;
  }

  return (
    <View style={[styles.root, { backgroundColor: pageBg }]}>
      <DriverSubScreenHeader title="Your level" onBack={handleBack} backAccessibilityLabel="Back to profile" />

      <ScrollView
        style={[styles.container, { backgroundColor: pageBg }]}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: 16,
            paddingHorizontal: DRIVER_DETAIL_HORIZONTAL_PAD,
            paddingBottom: insets.bottom + 80,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
      <View style={[styles.eliteCard, Platform.OS === 'ios' ? styles.eliteCardShadowIos : styles.eliteCardShadowAndroid]}>
        <View style={[styles.cardDeco, { pointerEvents: 'none' }]}>
          <FontAwesome name="star" size={72} color="rgba(255,255,255,0.12)" />
        </View>
        <Text style={styles.eliteLabel}>Elite Evolution</Text>
        <Text style={styles.eliteTitle}>{roadToLabel}</Text>
        <Text style={styles.eliteSub}>
          L{currentLevel} {currentLevelConfig.name} · {currentLevelConfig.goalText}
        </Text>
        <View style={styles.eliteXpRow}>
          <Text style={styles.eliteXpValue}>
            {currentCount.done} / {currentCount.target}
          </Text>
          <Text style={styles.eliteXpLabel}>Milestone Progress</Text>
        </View>
        <View style={styles.xpBarBg}>
          <View style={[styles.xpBarFill, { width: `${Math.max(experiencePct, 2)}%` }]} />
        </View>
        <Text style={styles.eliteStatus}>
          Status: Active · Unlocks {currentLevelConfig.privilege}
        </Text>
      </View>

      <View style={styles.statsGrid}>
        <View style={[styles.statCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.statLabel, { color: colors.textMuted }]}>KYC</Text>
          <View style={styles.statRow}>
            <Text style={[styles.statValue, { color: colors.text }]}>
              {isVerified ? 'Verified' : 'Pending'}
            </Text>
            <FontAwesome name="shield" size={14} color={Theme.darkGreen} />
          </View>
        </View>
        <View style={[styles.statCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.statLabel, { color: colors.textMuted }]}>5★ Ratings</Text>
          <View style={styles.statRow}>
            <Text style={[styles.statValue, { color: colors.text }]}>
              {experience.metrics.fiveStarCount}
            </Text>
            <FontAwesome name="star" size={14} color={Theme.darkGreen} />
          </View>
        </View>
        <View style={[styles.statCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.statLabel, { color: colors.textMuted }]}>Trips Logged</Text>
          <View style={styles.statRow}>
            <Text style={[styles.statValue, { color: colors.text }]}>{tripsCount}</Text>
            <FontAwesome name="trophy" size={14} color="#d97706" />
          </View>
        </View>
        <View style={[styles.statCard, styles.statCardDark]}>
          <Text style={styles.statLabelDark}>XP Level</Text>
          <View style={styles.statRow}>
            <Text style={styles.statValueDark}>{currentLevel}</Text>
            <FontAwesome name="star" size={14} color={Theme.darkGreen} />
          </View>
        </View>
      </View>

      <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>Next Mile Objectives</Text>
      <View style={styles.questsList}>
        {experience.levels.map((lvl) => {
          const completed = isMilestoneCompleted(lvl.level, experience);
          const inProgress = isMilestoneInProgress(lvl.level, experience);
          const count = getMilestoneCount(lvl, experience.metrics);
          const progressPctObj = inProgress ? count.pct : completed ? 100 : 0;
          const iconName = getLevelIcon(lvl.type);
          return (
            <Pressable
              key={lvl.level}
              onPress={() => setGuideLevel(lvl)}
              accessibilityRole="button"
              accessibilityLabel={`${lvl.name}. ${lvl.goalText}`}
              accessibilityHint="Shows what to do to complete this level"
              style={[
                styles.questCard,
                { backgroundColor: colors.surface ?? Theme.screenBackground, borderColor: colors.border ?? Theme.borderLight },
                completed && styles.questCardDone,
              ]}
            >
              <View style={[styles.questIconWrap, completed && styles.questIconWrapDone]}>
                {completed ? (
                  <FontAwesome name="check" size={20} color={Theme.textOnPrimary} />
                ) : (
                  <FontAwesome
                    name={iconName}
                    size={18}
                    color={colors.textMuted ?? Theme.textMutedDemo}
                  />
                )}
              </View>
              <View style={styles.questBody}>
                <Text style={[styles.questTitle, { color: colors.text }, completed && styles.questTitleDone]}>
                  {lvl.name.toUpperCase()}
                </Text>
                <Text style={[styles.questDesc, { color: colors.textMuted }]}>
                  {lvl.goalText.toUpperCase()}
                </Text>
              </View>
              {completed ? (
                <View style={styles.questVerified}>
                  <Text style={styles.questVerifiedText}>VERIFIED</Text>
                </View>
              ) : (
                <View style={styles.questProgressWrap}>
                  <Text style={[styles.questCount, { color: inProgress ? colors.text : colors.textMuted }]}>
                    {count.done}
                    <Text style={[styles.questCountTotal, { color: colors.textMuted }]}>
                      /{count.target}
                    </Text>
                  </Text>
                  <View style={styles.questProgressBg}>
                    <View style={[styles.questProgressFill, { width: `${progressPctObj}%` }]} />
                  </View>
                </View>
              )}
            </Pressable>
          );
        })}
      </View>
      </ScrollView>
      <MilestoneHowToModal
        visible={guideLevel != null}
        level={guideLevel}
        progress={experience}
        audience="driver"
        onClose={() => setGuideLevel(null)}
        onAction={(kind: MilestoneGuideActionKind) => {
          setGuideLevel(null);
          if (kind === 'documents') router.push('/(driver)/documents');
          if (kind === 'find_work') router.push(ROUTES.driverAvailableLoads());
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  container: { flex: 1 },
  scrollContent: {},
  eliteCard: {
    backgroundColor: DARK_HERO_BG,
    borderRadius: 28,
    padding: 20,
    marginBottom: 24,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
    borderColor: DARK_CARD_BORDER,
  },
  eliteCardShadowIos: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
  },
  eliteCardShadowAndroid: { elevation: 8 },
  cardDeco: {
    position: 'absolute',
    top: 8,
    right: 8,
    opacity: 1,
  },
  eliteLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.6)',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  eliteTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Theme.textOnPrimary,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  eliteSub: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.55)',
    marginBottom: 12,
  },
  eliteXpRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  eliteXpValue: {
    fontSize: 28,
    fontWeight: '800',
    color: Theme.textOnPrimary,
  },
  eliteXpLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.5)',
    textTransform: 'uppercase',
  },
  xpBarBg: {
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.12)',
    overflow: 'hidden',
    marginBottom: 10,
  },
  xpBarFill: {
    height: '100%',
    backgroundColor: Theme.driverEmerald,
    borderRadius: 4,
  },
  eliteStatus: {
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.45)',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 24,
  },
  statCard: {
    width: '48%',
    flexGrow: 1,
    minWidth: '46%',
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
  },
  statCardDark: {
    backgroundColor: DARK_HERO_BG,
    borderColor: DARK_CARD_BORDER,
    width: '48%',
    flexGrow: 1,
    minWidth: '46%',
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  statLabelDark: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: 8,
    color: 'rgba(255,255,255,0.55)',
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statValue: { fontSize: 20, fontWeight: '800' },
  statValueDark: { fontSize: 20, fontWeight: '800', color: Theme.textOnPrimary },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  questsList: { gap: 12 },
  questCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderWidth: 1,
    borderRadius: 20,
  },
  questCardDone: {
    backgroundColor: Theme.positiveMuted,
    borderColor: 'rgba(21,128,61,0.15)',
  },
  questIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: Theme.surfaceLight,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  questIconWrapDone: {
    backgroundColor: Theme.driverEmerald,
    borderColor: Theme.driverEmerald,
  },
  questBody: { flex: 1, minWidth: 0 },
  questTitle: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  questTitleDone: {
    textDecorationLine: 'line-through',
    color: Theme.textSecondary,
  },
  questDesc: {
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginTop: 2,
  },
  questVerified: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: Theme.screenBackground,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Theme.darkGreen,
  },
  questVerifiedText: {
    fontSize: 8,
    fontWeight: '800',
    color: Theme.darkGreen,
    letterSpacing: 0.5,
  },
  questProgressWrap: { alignItems: 'flex-end', marginLeft: 8 },
  questCount: { fontSize: 16, fontWeight: '800' },
  questCountTotal: { fontSize: 11, fontWeight: '600' },
  questProgressBg: {
    width: 64,
    height: 4,
    backgroundColor: Theme.surfaceLight,
    borderRadius: 2,
    marginTop: 6,
    overflow: 'hidden',
  },
  questProgressFill: { height: '100%', backgroundColor: Theme.teslaRed, borderRadius: 2 },
});
