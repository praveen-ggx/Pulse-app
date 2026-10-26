/**
 * Boost progress — live campaign card on the story you own.
 */
import Theme from "@/constants/Theme";
import {
  StoryFlowSheetPortal,
  useStoryPhoneFrameMetrics,
} from "@/features/network/components/StoryMobilePopupShell";
import { CampaignUpgradePanel } from "@/features/reach/components/CampaignUpgradePanel";
import { ReachMetricsGrid } from "@/features/reach/components/ReachMetricsGrid";
import { formatRemaining } from "@/features/reach/utils/campaignFormat";
import { formatINR } from "@/lib/format";
import {
  useReachCampaignMetricsQuery,
  useReachCampaignsQuery,
  useReachPlansQuery,
} from "@/lib/queries/useReachCampaignsQuery";
import { getReachPlanDisplay } from "@/lib/reachPlanRegistry";
import { ROUTES } from "@/lib/routes";
import { useRouter } from "expo-router";
import { ChevronRight, Clock3, Flame, Rocket, X, Zap } from "lucide-react-native";
import { useEffect, useRef } from "react";
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type CampaignStatus = "draft" | "active" | "completed" | "cancelled";

const STATUS_COPY: Record<CampaignStatus, string> = {
  draft: "Awaiting payment — not live yet.",
  active: "On air — promoting your load now.",
  completed: "This campaign has ended.",
  cancelled: "This campaign was cancelled.",
};

function LiveDot() {
  const pulse = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 650,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.35,
          duration: 650,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return (
    <View style={styles.liveDotWrap}>
      <Animated.View style={[styles.liveDotRing, { opacity: pulse, transform: [{ scale: pulse }] }]} />
      <View style={styles.liveDotCore} />
    </View>
  );
}

function shortWhen(iso: string | null | undefined): { day: string; time: string } {
  if (!iso) return { day: "—", time: "" };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { day: "—", time: "" };
  return {
    day: d.toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
    time: d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true }),
  };
}

interface BoostProgressSheetProps {
  visible: boolean;
  onClose: () => void;
  orgId: string;
  campaignId: string;
  onBoostAgain?: () => void;
}

export function BoostProgressSheet({
  visible,
  onClose,
  orgId,
  campaignId,
  onBoostAgain,
}: BoostProgressSheetProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { phonePopup, sheetBottomPad } = useStoryPhoneFrameMetrics();
  const campaignsQ = useReachCampaignsQuery(visible ? orgId : null);
  const plansQ = useReachPlansQuery();
  const metricsQ = useReachCampaignMetricsQuery(visible ? campaignId : null);

  const campaign = campaignsQ.data?.find((c) => c.id === campaignId);
  const plan = plansQ.data?.find((p) => p.id === campaign?.plan_id);
  const display = plan ? getReachPlanDisplay(plan.code) : undefined;
  const metrics = metricsQ.data;

  const isActive = campaign?.status === "active";
  const isCompleted = campaign?.status === "completed" || campaign?.status === "cancelled";
  const isDraft = campaign?.status === "draft";
  const isFresh = metrics && metrics.impressions === 0 && metrics.views === 0;
  const bottomPad = sheetBottomPad ?? insets.bottom + 14;
  const reachMax = plan?.estimated_reach_max ?? 0;
  const impressions = metrics?.impressions ?? 0;
  const reachPct = reachMax > 0 ? Math.min(100, Math.round((impressions / reachMax) * 100)) : 0;
  const PlanIcon = plan?.code === "max" ? Flame : plan?.code === "boost" ? Zap : Rocket;
  const started = shortWhen(campaign?.published_at);
  const expires = shortWhen(campaign?.expires_at);
  const statusLine = campaign
    ? isActive && isFresh
      ? "Just started — promoting your load now."
      : STATUS_COPY[campaign.status]
    : "";

  return (
    <StoryFlowSheetPortal
      visible={visible}
      onClose={onClose}
      accessibilityLabel="Close boost progress"
    >
      <View style={[styles.sheet, phonePopup && styles.sheetPhone, { paddingBottom: bottomPad }]}>
        <View style={styles.handle} />
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
          <View style={styles.hero}>
            <View style={styles.heroTop}>
              {isActive ? (
                <View style={styles.onAir}>
                  <LiveDot />
                  <Text style={styles.onAirText}>Live</Text>
                </View>
              ) : (
                <View style={styles.onAirIdle}>
                  <Text style={styles.onAirIdleText}>
                    {isDraft ? "Draft" : isCompleted ? "Ended" : "Campaign"}
                  </Text>
                </View>
              )}
              <Pressable
                style={styles.closeBtn}
                onPress={onClose}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <X size={14} color={Theme.textOnPrimary} />
              </Pressable>
            </View>
            <View style={styles.heroBrand}>
              <View style={styles.planGlyph}>
                <PlanIcon size={16} color={Theme.accentGold} strokeWidth={2.4} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.heroKicker}>Pulse Boost</Text>
                <Text style={styles.heroTitle} numberOfLines={1}>
                  {plan ? `${plan.name} plan` : "Boost progress"}
                </Text>
              </View>
              {plan ? <Text style={styles.heroPrice}>{formatINR(plan.price_inr)}</Text> : null}
            </View>
            <Text style={styles.heroSub}>{statusLine}</Text>
            {isActive && campaign ? (
              <View style={styles.remainChip}>
                <Clock3 size={12} color={Theme.accentGold} />
                <Text style={styles.remainText}>{formatRemaining(campaign.expires_at)} left</Text>
              </View>
            ) : null}
          </View>

          <ReachMetricsGrid campaignId={campaignId} />

          {plan ? (
            <View style={styles.reachCard}>
              <View style={styles.reachHead}>
                <Text style={styles.reachLabel}>Campaign reach</Text>
                <Text style={styles.reachValue}>
                  {impressions.toLocaleString()}
                  <Text style={styles.reachTotal}> / {reachMax.toLocaleString()}</Text>
                </Text>
              </View>
              <View style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressFill,
                    {
                      width: `${Math.max(reachPct, impressions > 0 ? 4 : 0)}%`,
                      backgroundColor: display?.color ?? Theme.primary,
                    },
                  ]}
                />
              </View>
            </View>
          ) : null}

          {campaign ? (
            <View style={styles.timeline}>
              <View style={styles.timelineCell}>
                <Text style={styles.timelineLabel}>Started</Text>
                <Text style={styles.timelineDay}>{started.day}</Text>
                <Text style={styles.timelineTime}>{started.time}</Text>
              </View>
              <View style={styles.timelineSplit} />
              <View style={styles.timelineCell}>
                <Text style={styles.timelineLabel}>Expires</Text>
                <Text style={styles.timelineDay}>{expires.day}</Text>
                <Text style={styles.timelineTime}>{expires.time}</Text>
              </View>
              <View style={styles.timelineSplit} />
              <View style={styles.timelineCell}>
                <Text style={styles.timelineLabel}>Remaining</Text>
                <Text style={styles.timelineRemain}>
                  {isActive ? formatRemaining(campaign.expires_at) : campaign.status}
                </Text>
              </View>
            </View>
          ) : null}

          {isActive && campaign ? (
            <View style={styles.upgradeWrap}>
              <CampaignUpgradePanel
                orgId={orgId}
                campaignId={campaignId}
                currentPlanId={campaign.plan_id}
                publishedAt={campaign.published_at}
                expiresAt={campaign.expires_at}
              />
            </View>
          ) : null}

          {isCompleted && onBoostAgain ? (
            <Pressable
              style={styles.boostAgainBtn}
              onPress={() => {
                onClose();
                onBoostAgain();
              }}
            >
              <Rocket size={13} color={Theme.textOnPrimary} />
              <Text style={styles.boostAgainBtnText}>Boost again</Text>
            </Pressable>
          ) : null}

          <Pressable
            style={styles.primaryLink}
            onPress={() => {
              onClose();
              router.push(ROUTES.REACH.HOME as never);
            }}
          >
            <Text style={styles.primaryLinkText}>Open campaign</Text>
            <ChevronRight size={14} color={Theme.textOnPrimary} />
          </Pressable>
          <Pressable
            style={styles.secondaryLink}
            onPress={() => {
              onClose();
              router.push(ROUTES.REACH.HISTORY as never);
            }}
          >
            <Text style={styles.secondaryLinkText}>All Pulse Boost campaigns</Text>
            <ChevronRight size={13} color={Theme.textMuted} />
          </Pressable>
        </ScrollView>
      </View>
    </StoryFlowSheetPortal>
  );
}

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: Theme.cardWhite,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 14,
    paddingTop: 8,
    maxHeight: "90%",
  },
  sheetPhone: { width: "100%", maxHeight: "88%" },
  handle: {
    width: 32,
    height: 4,
    borderRadius: 2,
    backgroundColor: Theme.borderMedium,
    alignSelf: "center",
    marginBottom: 10,
  },
  scroll: { gap: 12, paddingBottom: 4 },
  hero: {
    backgroundColor: Theme.primary,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 10,
  },
  heroTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  onAir: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Theme.driverOverlay,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  onAirText: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: Theme.textOnPrimary,
  },
  onAirIdle: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: Theme.driverOverlay,
  },
  onAirIdleText: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: Theme.textOnPrimary,
  },
  liveDotWrap: { width: 12, height: 12, alignItems: "center", justifyContent: "center" },
  liveDotRing: {
    position: "absolute",
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Theme.accentGoldMuted,
  },
  liveDotCore: { width: 7, height: 7, borderRadius: 4, backgroundColor: Theme.accentGold },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: Theme.driverOverlay,
    alignItems: "center",
    justifyContent: "center",
  },
  heroBrand: { flexDirection: "row", alignItems: "center", gap: 10 },
  planGlyph: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: Theme.driverOverlay,
    alignItems: "center",
    justifyContent: "center",
  },
  heroKicker: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: Theme.accentGold,
  },
  heroTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: Theme.textOnPrimary,
    letterSpacing: -0.4,
  },
  heroPrice: {
    fontSize: 14,
    fontWeight: "800",
    color: Theme.accentGold,
    fontVariant: ["tabular-nums"],
  },
  heroSub: { fontSize: 12, fontWeight: "500", color: Theme.textOnPrimary, opacity: 0.88, lineHeight: 16 },
  remainChip: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Theme.driverOverlay,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  remainText: { fontSize: 12, fontWeight: "800", color: Theme.accentGold },
  reachCard: {
    backgroundColor: Theme.screenBackground,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.actionBtnGhostBorder,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  reachHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  reachLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.3,
    textTransform: "uppercase",
    color: Theme.textMuted,
  },
  reachValue: {
    fontSize: 13,
    fontWeight: "800",
    color: Theme.actionBtnInk,
    fontVariant: ["tabular-nums"],
  },
  reachTotal: { fontWeight: "600", color: Theme.textMuted },
  progressTrack: {
    height: 7,
    borderRadius: 999,
    backgroundColor: Theme.cardWhite,
    overflow: "hidden",
  },
  progressFill: { height: "100%", borderRadius: 999 },
  timeline: {
    flexDirection: "row",
    alignItems: "stretch",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.actionBtnGhostBorder,
    backgroundColor: Theme.screenBackground,
    paddingVertical: 10,
  },
  timelineCell: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    paddingHorizontal: 6,
  },
  timelineSplit: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: Theme.borderLight,
    marginVertical: 4,
  },
  timelineLabel: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  timelineDay: { fontSize: 13, fontWeight: "800", color: Theme.actionBtnInk, textAlign: "center" },
  timelineTime: { fontSize: 11, fontWeight: "600", color: Theme.textMuted, textAlign: "center" },
  timelineRemain: {
    fontSize: 16,
    fontWeight: "800",
    color: Theme.primary,
    textAlign: "center",
    marginTop: 4,
  },
  upgradeWrap: {
    backgroundColor: Theme.screenBackground,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.actionBtnGhostBorder,
    padding: 12,
  },
  boostAgainBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: Theme.primary,
  },
  boostAgainBtnText: { fontSize: 13, fontWeight: "800", color: Theme.textOnPrimary },
  primaryLink: {
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: Theme.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  primaryLinkText: { fontSize: 13, fontWeight: "800", color: Theme.textOnPrimary },
  secondaryLink: {
    minHeight: 36,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  secondaryLinkText: { fontSize: 12, fontWeight: "700", color: Theme.textMuted },
});
