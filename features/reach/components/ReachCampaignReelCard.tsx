/**
 * Campaign row/card for Pulse Boost studio.
 * `manager` = Ads Manager–style dense list row (desktop).
 * `deck` = compact card for mobile horizontal browse.
 */
import Theme from "@/constants/Theme";
import type { ReachCampaignRow, ReachPlanRow } from "@/features/reach/services/campaigns.service";
import { getCampaignIdentity } from "@/features/reach/utils/campaignIdentity";
import { formatINR } from "@/lib/format";
import { useReachTripMetricsQuery } from "@/lib/queries/useReachCampaignsQuery";
import { getReachPlanDisplay } from "@/lib/reachPlanRegistry";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

interface ReachCampaignReelCardProps {
  /** The trip's current/highest-tier campaign — one card per trip, never one per boost. */
  campaign: ReachCampaignRow;
  /** Every campaign on this trip (re-boost / upgrade siblings). Metrics are summed. */
  tripCampaignIds: string[];
  plan: ReachPlanRow | undefined;
  /** How many boosts (re-broadcasts/upgrades) this trip has had in total. */
  boostCount: number;
  /** Plan names across all of this trip's boosts, oldest first. Shown only when boostCount > 1. */
  planTimeline: string[];
  selected: boolean;
  onSelect: () => void;
  onOpenDetail: () => void;
  onBoost: () => void;
  /** Desktop Ads Manager list vs mobile deck card. */
  variant?: "manager" | "deck";
}

export function ReachCampaignReelCard({
  campaign,
  tripCampaignIds,
  plan,
  boostCount,
  planTimeline,
  selected,
  onSelect,
  onOpenDetail,
  onBoost,
  variant = "deck",
}: ReachCampaignReelCardProps) {
  const id = getCampaignIdentity(campaign);
  const display = plan ? getReachPlanDisplay(plan.code) : undefined;
  const planColor = display?.color ?? Theme.primary;
  const metricsQ = useReachTripMetricsQuery(
    tripCampaignIds.length > 0 ? tripCampaignIds : [campaign.id],
  );
  const m = metricsQ.data;
  const isActive = campaign.status === "active";
  const tierPath = planTimeline.filter((p, i) => i === 0 || p !== planTimeline[i - 1]);
  const pickupLabel = campaign.load_pickup_date
    ? new Date(campaign.load_pickup_date).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
      })
    : "—";
  const fareLabel =
    campaign.load_rate != null && campaign.load_rate > 0
      ? formatINR(campaign.load_rate)
      : "On request";

  if (variant === "manager") {
    return (
      <Pressable
        onPress={onSelect}
        style={[styles.row, selected && styles.rowSelected]}
        accessibilityRole="button"
        accessibilityState={{ selected }}
      >
        <View style={styles.rowName}>
          <View style={[styles.rowAvatar, isActive && styles.rowAvatarLive]}>
            <Text style={styles.rowAvatarText}>{id.initials}</Text>
          </View>
          <View style={styles.rowNameCopy}>
            <Text style={styles.rowTitle} numberOfLines={1}>
              {id.title}
            </Text>
            <Text style={styles.rowSub} numberOfLines={1}>
              {id.route ?? id.tripId}
              {boostCount > 1 ? ` · ${boostCount} boosts` : ""}
            </Text>
          </View>
        </View>

        <View style={styles.rowCol}>
          <View
            style={[
              styles.deliveryPill,
              isActive ? styles.deliveryActive : styles.deliveryMuted,
            ]}
          >
            <View
              style={[
                styles.deliveryDot,
                { backgroundColor: isActive ? Theme.success : Theme.textMuted },
              ]}
            />
            <Text
              style={[
                styles.deliveryText,
                isActive && styles.deliveryTextActive,
              ]}
            >
              {isActive ? "Active" : campaign.status}
            </Text>
          </View>
        </View>

        <View style={styles.rowCol}>
          <Text style={styles.rowMetric}>
            {metricsQ.isLoading || !m ? "—" : m.impressions.toLocaleString()}
          </Text>
          <Text style={styles.rowMetricLabel}>Reach</Text>
        </View>

        <View style={styles.rowCol}>
          <Text style={styles.rowMetric}>
            {metricsQ.isLoading || !m ? "—" : m.bids.toLocaleString()}
          </Text>
          <Text style={styles.rowMetricLabel}>Results</Text>
        </View>

        <View style={styles.rowCol}>
          <Text style={styles.rowMetric}>
            {metricsQ.isLoading || !m ? "—" : m.creditsUsed.toLocaleString()}
          </Text>
          <Text style={styles.rowMetricLabel}>Credits</Text>
        </View>

        <View style={[styles.rowCol, styles.rowColWide]}>
          <Text style={styles.rowMeta} numberOfLines={1}>
            {id.truck ?? "Any"} · {pickupLabel}
          </Text>
          <Text style={styles.rowFare} numberOfLines={1}>
            {fareLabel}
          </Text>
        </View>

        <View style={styles.rowActions}>
          <Pressable
            style={[styles.rowBtn, styles.rowBtnPrimary]}
            onPress={onBoost}
          >
            <Text style={styles.rowBtnPrimaryText}>
              {isActive ? "Upgrade" : "Re-boost"}
            </Text>
          </Pressable>
          <Pressable style={styles.rowBtn} onPress={onOpenDetail}>
            <Text style={styles.rowBtnText}>Open</Text>
          </Pressable>
        </View>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={onSelect}
      style={[styles.card, selected && styles.cardSelected]}
    >
      <View style={styles.topRow}>
        <View style={styles.topLeft}>
          <View style={[styles.avatar, isActive && styles.avatarLive]}>
            <Text style={styles.avatarText}>{id.initials}</Text>
          </View>
          <View style={styles.titleCol}>
            <View style={styles.titleRow}>
              <Text style={styles.title} numberOfLines={1}>
                {id.title}
              </Text>
              <View
                style={[
                  styles.statusPill,
                  isActive ? styles.statusActive : styles.statusMuted,
                ]}
              >
                <Text
                  style={[styles.statusText, isActive && styles.statusTextActive]}
                >
                  {campaign.status}
                </Text>
              </View>
            </View>
            <Text style={styles.tripId}>{id.tripId}</Text>
          </View>
        </View>
        <View
          style={[
            styles.tierPill,
            { backgroundColor: planColor + "14", borderColor: planColor + "40" },
          ]}
        >
          <Text style={[styles.tierText, { color: planColor }]}>
            {plan?.name ?? "Boost"}
          </Text>
        </View>
      </View>

      {boostCount > 1 ? (
        <Text style={styles.timelineText} numberOfLines={1}>
          {boostCount} boosts · {tierPath.join(" → ")}
        </Text>
      ) : null}

      <View style={styles.detailBlock}>
        <Text style={styles.routeText} numberOfLines={1}>
          {id.route ?? "Story boost"}
        </Text>
        <Text style={styles.detailMeta} numberOfLines={1}>
          {id.truck ?? "Any vehicle"} · {pickupLabel} · {fareLabel}
        </Text>
      </View>

      <View style={styles.actions}>
        <Pressable style={styles.boostBtn} onPress={onBoost}>
          <Text style={styles.boostBtnText}>
            {isActive ? "Upgrade" : "Re-boost"}
          </Text>
        </Pressable>
        <Pressable style={styles.previewBtn} onPress={onOpenDetail}>
          <Text style={styles.previewBtnText}>Open</Text>
        </Pressable>
      </View>

      {metricsQ.isLoading || !m ? (
        <View style={styles.metricsLoading}>
          <ActivityIndicator size="small" color={Theme.primary} />
        </View>
      ) : (
        <View style={styles.metrics}>
          {(
            [
              ["Reach", m.impressions],
              ["Views", m.views],
              ["Bids", m.bids],
              ["Credits", m.creditsUsed],
            ] as const
          ).map(([label, value]) => (
            <View key={label} style={styles.metricCell}>
              <Text style={styles.metricValue}>{value.toLocaleString()}</Text>
              <Text style={styles.metricLabel}>{label}</Text>
            </View>
          ))}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  /* ── Ads Manager row ───────────────────────────────────────── */
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
  },
  rowSelected: {
    backgroundColor: Theme.surface,
    borderLeftWidth: 3,
    borderLeftColor: Theme.primary,
    paddingLeft: 11,
  },
  rowName: {
    flex: 1.4,
    minWidth: 160,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  rowAvatar: {
    width: 32,
    height: 32,
    borderRadius: 6,
    backgroundColor: Theme.accentBrownSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  rowAvatarLive: {
    borderWidth: 1.5,
    borderColor: Theme.success,
  },
  rowAvatarText: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.accentBrownDeep,
  },
  rowNameCopy: { flex: 1, minWidth: 0, gap: 2 },
  rowTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.1,
  },
  rowSub: { fontSize: 11, fontWeight: "500", color: Theme.textRouteCard },
  rowCol: { width: 72, alignItems: "flex-start", gap: 2 },
  rowColWide: { width: 120, flexShrink: 1 },
  deliveryPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
  },
  deliveryActive: {
    backgroundColor: Theme.positiveMuted,
    borderColor: "rgba(21,128,61,0.25)",
  },
  deliveryMuted: {
    backgroundColor: Theme.surface,
    borderColor: Theme.borderLight,
  },
  deliveryDot: { width: 6, height: 6, borderRadius: 3 },
  deliveryText: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textMuted,
    textTransform: "capitalize",
  },
  deliveryTextActive: { color: Theme.success },
  rowMetric: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    fontVariant: ["tabular-nums"],
  },
  rowMetricLabel: {
    fontSize: 10,
    fontWeight: "500",
    color: Theme.textMuted,
  },
  rowMeta: { fontSize: 11, fontWeight: "500", color: Theme.textRouteCard },
  rowFare: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    fontVariant: ["tabular-nums"],
  },
  rowActions: {
    width: 132,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 6,
    flexShrink: 0,
  },
  rowBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    backgroundColor: Theme.cardWhite,
  },
  rowBtnPrimary: {
    backgroundColor: REACH_M.primary,
    borderColor: REACH_M.primary,
  },
  rowBtnText: { fontSize: 11, fontWeight: "700", color: Theme.textPrimaryDark },
  rowBtnPrimaryText: { fontSize: 11, fontWeight: "700", color: Theme.textOnPrimary },

  /* ── Mobile deck card ──────────────────────────────────────── */
  card: {
    width: 300,
    backgroundColor: Theme.cardWhite,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    padding: 12,
    gap: 10,
  },
  cardSelected: {
    borderColor: Theme.primary,
    backgroundColor: Theme.surface,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
  },
  topLeft: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1, minWidth: 0 },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 6,
    backgroundColor: Theme.accentBrownSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarLive: { borderWidth: 1.5, borderColor: Theme.success },
  avatarText: { fontSize: 10, fontWeight: "800", color: Theme.accentBrownDeep },
  titleCol: { flex: 1, minWidth: 0, gap: 2 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  title: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    flexShrink: 1,
  },
  tripId: {
    fontSize: 10,
    fontWeight: "500",
    color: Theme.textMuted,
    fontVariant: ["tabular-nums"],
  },
  statusPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  statusActive: {
    backgroundColor: Theme.positiveMuted,
    borderColor: "rgba(21,128,61,0.25)",
  },
  statusMuted: { backgroundColor: Theme.surface, borderColor: Theme.borderLight },
  statusText: {
    fontSize: 9,
    fontWeight: "700",
    textTransform: "capitalize",
    color: Theme.textMuted,
  },
  statusTextActive: { color: Theme.success },
  tierPill: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
    flexShrink: 0,
  },
  tierText: { fontSize: 9, fontWeight: "800", textTransform: "uppercase" },
  timelineText: { fontSize: 10, fontWeight: "500", color: Theme.textMuted },
  detailBlock: {
    backgroundColor: Theme.surface,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 3,
  },
  routeText: { fontSize: 12, fontWeight: "700", color: Theme.textPrimaryDark },
  detailMeta: { fontSize: 11, fontWeight: "500", color: Theme.textRouteCard },
  actions: { flexDirection: "row", gap: 6 },
  boostBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: REACH_M.primary,
    borderRadius: 6,
    paddingVertical: 8,
  },
  boostBtnText: { fontSize: 11, fontWeight: "700", color: Theme.textOnPrimary },
  previewBtn: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.cardWhite,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  previewBtnText: { fontSize: 11, fontWeight: "700", color: Theme.textPrimaryDark },
  metricsLoading: { paddingVertical: 6, alignItems: "center" },
  metrics: {
    flexDirection: "row",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
    paddingTop: 8,
  },
  metricCell: { flex: 1, alignItems: "center", gap: 1 },
  metricValue: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    fontVariant: ["tabular-nums"],
  },
  metricLabel: {
    fontSize: 9,
    fontWeight: "500",
    color: Theme.textMuted,
    textTransform: "uppercase",
  },
});
