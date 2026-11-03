/**
 * Milestone Map — live Experience milestones from LEVELS_CONFIG.
 * MILE-01…04: segment progress + next-mile objectives from real trip/rating/KYC metrics.
 */
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import Theme from '@/constants/Theme';
import { TeslaHeader } from '@/components/TeslaHeader';
import { CenteredLoadingView } from '@/components/CenteredLoadingView';
import { useSafeBack } from '@/lib/useSafeBack';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useCompleteTripsQuery } from '@/lib/queries/useTripsQuery';
import { useQuery } from '@tanstack/react-query';
import {
  averageScore,
  getRatingsReceivedAsLinkedOrganization,
} from '@/features/ratings/services/ratings.service';
import {
  computeExperienceProgress,
  countFiveStarRatings,
  getMilestoneCount,
  isMilestoneCompleted,
  isMilestoneInProgress,
} from '@/features/experience/experienceProgress';
import { useMemo } from 'react';

const EMERALD = '#10B981';

function isTripDone(status: string) {
  const s = (status || '').toLowerCase();
  return s === 'completed' || s === 'delivered' || s === 'done';
}

function getLevelIcon(type: string): 'user' | 'truck' | 'id-card' | 'star' {
  if (type === 'trips') return 'truck';
  if (type === 'ratings') return 'star';
  if (type === 'verification') return 'id-card';
  return 'user';
}

export default function MilestoneScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const safeBack = useSafeBack();
  const { user, profile } = useAuth();
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id ?? null;
  const { data: trips = [], isLoading: tripsLoading } = useCompleteTripsQuery(orgId);

  const { data: ratingBundle, isLoading: ratingsLoading } = useQuery({
    queryKey: ['q', 'milestone', 'receivedRatings', orgId ?? ''],
    queryFn: async () => {
      if (!orgId) return { fiveStarCount: 0, avg: null as number | null };
      const { error, ratings } = await getRatingsReceivedAsLinkedOrganization(orgId);
      if (error) throw error;
      return {
        fiveStarCount: countFiveStarRatings(ratings),
        avg: averageScore(ratings),
      };
    },
    enabled: !!orgId,
    staleTime: 60_000,
  });

  const completedTrips = useMemo(
    () => (trips ?? []).filter((t) => isTripDone(t.status ?? '')).length,
    [trips],
  );

  const experience = useMemo(
    () =>
      computeExperienceProgress({
        hasSignedUp: Boolean(user?.uid || profile?.uid),
        completedTrips,
        isVerified: Boolean(orgId),
        fiveStarCount: ratingBundle?.fiveStarCount ?? 0,
      }),
    [user?.uid, profile?.uid, completedTrips, orgId, ratingBundle?.fiveStarCount],
  );

  const {
    currentLevel,
    currentLevelConfig,
    nextLevelConfig,
    experiencePct,
    currentCount,
    levels,
  } = experience;

  const remainingUnits = Math.max(0, currentCount.target - currentCount.done);
  const segments = levels.map((l) => l.level);

  if (tripsLoading || ratingsLoading) {
    return <CenteredLoadingView message="Loading milestones…" />;
  }

  return (
    <View style={styles.outer}>
      <TeslaHeader
        title="Milestone Map"
        subtitle="Experience Protocol"
        variant="default"
        showBack
        onBack={safeBack}
        onNotificationClick={() => router.push('/notifications')}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 32 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <View style={styles.heroDeco}>
            <FontAwesome name="flag" size={100} color="rgba(255,255,255,0.1)" />
          </View>
          <View style={styles.heroChevron}>
            <FontAwesome name="chevron-up" size={32} color={EMERALD} />
          </View>
          <Text style={styles.heroLabel}>Upgrade Distance</Text>
          <Text style={styles.heroXp}>
            {remainingUnits}{' '}
            <Text style={styles.heroXpUnit}>
              {currentLevelConfig.type === 'trips'
                ? 'TRIPS'
                : currentLevelConfig.type === 'ratings'
                  ? '5★'
                  : 'STEPS'}
            </Text>
          </Text>
          <Text style={styles.heroDesc}>
            {nextLevelConfig
              ? `Complete “${currentLevelConfig.goalText}” to reach ${nextLevelConfig.name} and unlock ${currentLevelConfig.privilege}.`
              : `Max milestone reached · ${currentLevelConfig.privilege}`}
          </Text>
        </View>

        <Text style={styles.sectionLabel}>
          {currentLevelConfig.tier} Path Progress · L{currentLevel}
        </Text>
        <View style={styles.segmentsRow}>
          {segments.map((s) => {
            const done = isMilestoneCompleted(s, experience);
            const current = isMilestoneInProgress(s, experience);
            return (
              <View key={s} style={styles.segmentCol}>
                <View
                  style={[
                    styles.segmentBar,
                    done && styles.segmentBarDone,
                    current && styles.segmentBarCurrent,
                  ]}
                />
                <Text style={[styles.segmentNum, current && styles.segmentNumCurrent]}>{s}</Text>
              </View>
            );
          })}
        </View>

        <View style={styles.objectivesHead}>
          <Text style={styles.objectivesTitle}>Next Mile Objectives</Text>
          <FontAwesome name="crosshairs" size={16} color={Theme.teslaRed} />
        </View>
        <View style={styles.questsList}>
          {levels.map((q) => {
            const completed = isMilestoneCompleted(q.level, experience);
            const inProgress = isMilestoneInProgress(q.level, experience);
            const count = getMilestoneCount(q, experience.metrics);
            const icon = getLevelIcon(q.type);
            return (
              <View
                key={q.level}
                style={[styles.questCard, completed && styles.questCardDone]}
              >
                <View style={[styles.questIconWrap, completed && styles.questIconWrapDone]}>
                  {completed ? (
                    <FontAwesome name="check" size={24} color={Theme.textOnPrimary} />
                  ) : (
                    <FontAwesome name={icon} size={20} color={Theme.textMutedDemo} />
                  )}
                </View>
                <View style={styles.questBody}>
                  <Text style={[styles.questTitle, completed && styles.questTitleDone]}>
                    {q.name}
                  </Text>
                  <Text style={styles.questDesc}>{q.goalText}</Text>
                </View>
                {completed ? (
                  <View style={styles.questVerified}>
                    <Text style={styles.questVerifiedText}>VERIFIED</Text>
                  </View>
                ) : (
                  <View style={styles.questProgressWrap}>
                    <Text style={styles.questCount}>
                      {count.done}
                      <Text style={styles.questCountTotal}>/{count.target}</Text>
                    </Text>
                    <View style={styles.questProgressBg}>
                      <View
                        style={[
                          styles.questProgressFill,
                          {
                            width: `${inProgress ? count.pct : 0}%`,
                          },
                        ]}
                      />
                    </View>
                  </View>
                )}
              </View>
            );
          })}
        </View>

        <Text style={styles.footerMeta}>
          {experiencePct}% on current milestone · {completedTrips} trips ·{' '}
          {experience.metrics.fiveStarCount}× 5★
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: { flex: 1, backgroundColor: Theme.screenBackground },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 24, paddingTop: 24 },
  hero: {
    backgroundColor: '#0F172A',
    borderRadius: 32,
    padding: 28,
    marginBottom: 24,
    overflow: 'hidden',
    position: 'relative',
  },
  heroDeco: {
    position: 'absolute',
    top: 0,
    right: 0,
    padding: 24,
    opacity: 0.2,
  },
  heroChevron: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 12,
  },
  heroLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    textAlign: 'center',
    marginBottom: 4,
  },
  heroXp: {
    fontSize: 42,
    fontWeight: '800',
    color: Theme.textOnDark,
    textAlign: 'center',
    letterSpacing: -1,
  },
  heroXpUnit: { fontSize: 14, color: EMERALD },
  heroDesc: {
    fontSize: 9,
    fontWeight: '700',
    color: '#64748b',
    textTransform: 'uppercase',
    textAlign: 'center',
    marginTop: 14,
    lineHeight: 16,
    letterSpacing: 0.5,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: Theme.textMutedDemo,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  segmentsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 4,
    marginBottom: 24,
  },
  segmentCol: { flex: 1, alignItems: 'center', marginHorizontal: 2 },
  segmentBar: {
    width: '100%',
    height: 6,
    borderRadius: 3,
    backgroundColor: Theme.surfaceLight,
    marginBottom: 8,
  },
  segmentBarDone: { backgroundColor: EMERALD },
  segmentBarCurrent: {
    backgroundColor: EMERALD,
    shadowColor: EMERALD,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 2,
  },
  segmentNum: { fontSize: 7, fontWeight: '800', color: Theme.textMutedDemo },
  segmentNumCurrent: { color: EMERALD },
  objectivesHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  objectivesTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: Theme.textPrimaryDark,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  questsList: { gap: 12 },
  questCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 18,
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 24,
    overflow: 'hidden',
  },
  questCardDone: {
    backgroundColor: Theme.positiveMuted,
    borderColor: 'rgba(21,128,61,0.15)',
    opacity: 0.9,
  },
  questIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: Theme.surfaceLight,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  questIconWrapDone: {
    backgroundColor: EMERALD,
    borderColor: EMERALD,
  },
  questBody: { flex: 1, minWidth: 0 },
  questTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: Theme.textPrimaryDark,
    textTransform: 'uppercase',
    letterSpacing: 0.2,
  },
  questTitleDone: {
    textDecorationLine: 'line-through',
    color: Theme.textSecondary,
  },
  questDesc: {
    fontSize: 9,
    fontWeight: '700',
    color: Theme.textMutedDemo,
    textTransform: 'uppercase',
    marginTop: 2,
  },
  questVerified: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: Theme.screenBackground,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Theme.darkGreen,
  },
  questVerifiedText: { fontSize: 8, fontWeight: '800', color: Theme.darkGreen, letterSpacing: 0.5 },
  questProgressWrap: { alignItems: 'flex-end', marginLeft: 8 },
  questCount: { fontSize: 18, fontWeight: '800', color: Theme.textPrimaryDark },
  questCountTotal: { fontSize: 12, fontWeight: '600', color: Theme.textSecondary },
  questProgressBg: {
    width: 64,
    height: 4,
    backgroundColor: Theme.surfaceLight,
    borderRadius: 2,
    marginTop: 6,
    overflow: 'hidden',
  },
  questProgressFill: { height: '100%', backgroundColor: Theme.teslaRed, borderRadius: 2 },
  footerMeta: {
    marginTop: 18,
    textAlign: 'center',
    fontSize: 10,
    fontWeight: '600',
    color: Theme.textMutedDemo,
  },
});
