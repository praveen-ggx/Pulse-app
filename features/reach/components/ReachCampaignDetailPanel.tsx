/**
 * Right-hand Reach partition — plan, expiry, and performance (no wave timeline).
 */
import Theme from "@/constants/Theme";
import { CampaignUpgradePanel } from "@/features/reach/components/CampaignUpgradePanel";
import { ReachStoryPostPreview } from "@/features/reach/components/ReachStoryPostPreview";
import type { ReachCampaignRow, ReachPlanRow } from "@/features/reach/services/campaigns.service";
import { formatReachTripId, formatRemaining } from "@/features/reach/utils/campaignFormat";
import { formatLedgerDateTime } from "@/lib/format";
import { getReachPlanDisplay } from "@/lib/reachPlanRegistry";
import { useReachTripMetricsQuery } from "@/lib/queries/useReachCampaignsQuery";
import { Clock3, Eye, Flame, Gavel, Radio, Rocket, Zap } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Animated, Easing, ScrollView, StyleSheet, Text, View } from "react-native";

type ReachCampaignDetailPanelProps = {
  campaign: ReachCampaignRow | null;
  plan?: ReachPlanRow;
  orgName: string;
  tripCampaignIds?: string[];
  onViewStory?: () => void;
};

function formatPlanDuration(hours: number | undefined): string {
  if (!hours || hours <= 0) return "—";
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  const rem = hours % 24;
  return rem ? `${days}d ${rem}h` : `${days}d`;
}

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  return formatLedgerDateTime(iso);
}

function LiveDot() {
  const pulse = useRef(new Animated.Value(0.45)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.4,
          duration: 700,
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

function useCountUp(value: number | null | undefined) {
  const anim = useRef(new Animated.Value(0)).current;
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const target = value ?? 0;
    anim.stopAnimation();
    const id = anim.addListener(({ value: next }) => setShown(Math.round(next)));
    Animated.timing(anim, {
      toValue: target,
      duration: 560,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
    return () => anim.removeListener(id);
  }, [anim, value]);
  return shown;
}

export function ReachCampaignDetailPanel({
  campaign,
  plan,
  orgName,
  tripCampaignIds,
  onViewStory,
}: ReachCampaignDetailPanelProps) {
  const ids = tripCampaignIds?.length ? tripCampaignIds : campaign ? [campaign.id] : [];
  const metricsQ = useReachTripMetricsQuery(ids);
  const metrics = metricsQ.data;
  const isActive = campaign?.status === "active";
  const planColor = plan ? getReachPlanDisplay(plan.code)?.color ?? Theme.primary : Theme.primary;
  const reachMax = plan?.estimated_reach_max ?? 0;
  const impressions = metrics?.impressions ?? 0;
  const reachPct =
    reachMax > 0 ? Math.min(100, Math.round((impressions / reachMax) * 100)) : 0;
  const impressionsShown = useCountUp(metrics?.impressions);
  const viewsShown = useCountUp(metrics?.views);
  const bidsShown = useCountUp(metrics?.bids);

  if (!campaign) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyTitle}>Select a campaign</Text>
        <Text style={styles.emptyBody}>
          Plan, expiry, and performance show here.
        </Text>
      </View>
    );
  }
  const tiles = [
    { label: "Impressions", value: impressionsShown, Icon: Radio },
    { label: "Views", value: viewsShown, Icon: Eye },
    { label: "Bids", value: bidsShown, Icon: Gavel },
  ] as const;
  const PlanIcon = plan?.code === "max" ? Flame : plan?.code === "boost" ? Zap : Rocket;

  return (
    <View style={styles.pane}>
      <View style={styles.paneHead}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.paneKicker}>{formatReachTripId(campaign)}</Text>
          <Text style={styles.paneTitle} numberOfLines={1}>
            {campaign.snapshot_material?.trim() || "Load"}
          </Text>
        </View>
        <View style={[styles.statusPill, isActive ? styles.statusLive : styles.statusIdle]}>
          {isActive ? <LiveDot /> : null}
          <Text style={[styles.statusText, isActive ? styles.statusTextLive : styles.statusTextIdle]}>
            {isActive ? `Live · ${formatRemaining(campaign.expires_at)}` : campaign.status}
          </Text>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.hero, { borderColor: planColor }]}>
          <View style={styles.heroTop}>
            <View style={[styles.planGlyph, { backgroundColor: Theme.surface }]}>
              <PlanIcon size={18} color={planColor} strokeWidth={2.4} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.cardKicker}>Active plan</Text>
              <Text style={styles.heroTitle}>{plan?.name ?? "Boost"}</Text>
            </View>
            <View style={styles.heroReachBadge}>
              <Text style={styles.heroReachLabel}>Expected reach</Text>
              <Text style={styles.heroReachValue}>
                {plan
                  ? `${plan.estimated_reach_min.toLocaleString()}–${plan.estimated_reach_max.toLocaleString()}`
                  : "—"}
              </Text>
            </View>
          </View>
          <View style={styles.heroMeta}>
            <View style={styles.heroMetaCell}>
              <View style={styles.metaLabelRow}>
                <Clock3 size={11} color={Theme.textMuted} />
                <Text style={styles.specLabel}>Expires</Text>
              </View>
              <Text style={styles.heroMetaValue}>
                {formatWhen(isActive ? campaign.expires_at : campaign.completed_at ?? campaign.expires_at)}
              </Text>
            </View>
            <View style={styles.heroMetaCell}>
              <Text style={styles.specLabel}>{isActive ? "Left" : "Status"}</Text>
              <Text style={[styles.heroMetaValue, isActive && styles.expiryAccent]}>
                {isActive ? formatRemaining(campaign.expires_at) : campaign.status}
              </Text>
            </View>
            <View style={styles.heroMetaCell}>
              <Text style={styles.specLabel}>Duration</Text>
              <Text style={styles.heroMetaValue}>{formatPlanDuration(plan?.duration_hours)}</Text>
            </View>
          </View>
          {plan ? (
            <View style={styles.progressBlock}>
              <View style={styles.progressLabelRow}>
                <Text style={styles.progressLabel}>Delivered vs expected</Text>
                <Text style={styles.progressValue}>
                  {impressions.toLocaleString()}
                  <Text style={styles.progressTotal}> / {reachMax.toLocaleString()}</Text>
                </Text>
              </View>
              <View style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressFill,
                    { width: `${Math.max(reachPct, impressions > 0 ? 4 : 0)}%`, backgroundColor: planColor },
                  ]}
                />
              </View>
            </View>
          ) : null}
        </View>

        <View style={styles.metricRow}>
          {tiles.map((tile) => (
            <View key={tile.label} style={styles.metricChip}>
              <View style={styles.metricLabelRow}>
                <tile.Icon size={12} color={Theme.primary} />
                <Text style={styles.metricLabel}>{tile.label}</Text>
              </View>
              {metricsQ.isLoading ? (
                <ActivityIndicator size="small" color={Theme.primary} />
              ) : (
                <Text style={styles.metricValue}>{tile.value.toLocaleString()}</Text>
              )}
            </View>
          ))}
        </View>

        {isActive ? (
          <View style={styles.card}>
            <CampaignUpgradePanel
              orgId={campaign.org_id}
              campaignId={campaign.id}
              currentPlanId={campaign.plan_id}
              publishedAt={campaign.published_at}
              expiresAt={campaign.expires_at}
            />
          </View>
        ) : null}

        <ReachStoryPostPreview
          campaign={campaign}
          plan={plan}
          orgName={orgName}
          onOpenCampaign={onViewStory}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  pane: {
    flex: 1,
    minHeight: 0,
    backgroundColor: Theme.cardWhite,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Theme.actionBtnGhostBorder,
    overflow: "hidden",
  },
  paneHead: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
  },
  paneKicker: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: Theme.textMuted,
    marginBottom: 2,
  },
  paneTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: Theme.actionBtnInk,
    letterSpacing: -0.2,
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    flexShrink: 0,
  },
  liveDotWrap: { width: 12, height: 12, alignItems: "center", justifyContent: "center" },
  liveDotRing: {
    position: "absolute",
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Theme.positiveMuted,
  },
  liveDotCore: { width: 7, height: 7, borderRadius: 4, backgroundColor: Theme.positive },
  planGlyph: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  metaLabelRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  metricLabelRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  statusLive: {
    backgroundColor: Theme.positiveMuted,
    borderColor: Theme.positive,
  },
  statusIdle: {
    backgroundColor: Theme.screenBackground,
    borderColor: Theme.actionBtnGhostBorder,
  },
  statusText: { fontSize: 11, fontWeight: "700" },
  statusTextLive: { color: Theme.positive },
  statusTextIdle: { color: Theme.textMuted },
  metricRow: { flexDirection: "row", gap: 8 },
  metricChip: {
    flex: 1,
    minWidth: 0,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.actionBtnGhostBorder,
    backgroundColor: Theme.screenBackground,
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 2,
  },
  metricLabel: { fontSize: 10, fontWeight: "600", color: Theme.textMuted, textTransform: "uppercase" },
  metricValue: {
    fontSize: 20,
    fontWeight: "800",
    color: Theme.actionBtnInk,
    letterSpacing: -0.4,
    fontVariant: ["tabular-nums"],
  },
  scroll: { flex: 1, minHeight: 0 },
  scrollContent: { padding: 12, gap: 10 },
  hero: {
    borderRadius: 10,
    borderWidth: 1.5,
    backgroundColor: Theme.screenBackground,
    padding: 14,
    gap: 12,
  },
  heroTop: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  heroTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: Theme.actionBtnInk,
    letterSpacing: -0.4,
  },
  heroReachBadge: {
    backgroundColor: Theme.cardWhite,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.actionBtnGhostBorder,
    paddingHorizontal: 10,
    paddingVertical: 8,
    alignItems: "flex-end",
  },
  heroReachLabel: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: Theme.textMuted,
  },
  heroReachValue: {
    fontSize: 15,
    fontWeight: "800",
    color: Theme.actionBtnInk,
    fontVariant: ["tabular-nums"],
  },
  heroMeta: { flexDirection: "row", gap: 8 },
  heroMetaCell: { flex: 1, minWidth: 0, gap: 2 },
  heroMetaValue: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.actionBtnInk,
  },
  card: {
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Theme.actionBtnGhostBorder,
    backgroundColor: Theme.screenBackground,
    padding: 12,
    gap: 10,
  },
  cardKicker: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: Theme.textMuted,
  },
  specLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textMuted,
    textTransform: "uppercase",
  },
  progressBlock: { gap: 6 },
  progressLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  progressLabel: { fontSize: 11, fontWeight: "600", color: Theme.textMuted },
  progressValue: {
    fontSize: 12,
    fontWeight: "800",
    color: Theme.actionBtnInk,
    fontVariant: ["tabular-nums"],
  },
  progressTotal: { fontSize: 11, fontWeight: "600", color: Theme.textMuted },
  progressTrack: {
    height: 6,
    borderRadius: 999,
    backgroundColor: Theme.cardWhite,
    overflow: "hidden",
  },
  progressFill: { height: "100%", borderRadius: 999 },
  expiryAccent: { color: Theme.primary },
  empty: {
    flex: 1,
    minHeight: 220,
    backgroundColor: Theme.cardWhite,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Theme.actionBtnGhostBorder,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
    gap: 6,
  },
  emptyTitle: { fontSize: 14, fontWeight: "700", color: Theme.actionBtnInk },
  emptyBody: {
    fontSize: 12,
    color: Theme.textRouteCard,
    textAlign: "center",
    lineHeight: 18,
  },
});
