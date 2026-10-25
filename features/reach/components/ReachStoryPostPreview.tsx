/**
 * Live commercial ad preview — story-card creative for Pulse Boost.
 */
import { PulseStoryWatermark } from "@/components/brand/PulseStoryWatermark";
import Theme from "@/constants/Theme";
import { splitLocationParts } from "@/features/network/utils/storyDisplay";
import type { ReachCampaignRow, ReachPlanRow } from "@/features/reach/services/campaigns.service";
import { getCampaignIdentity } from "@/features/reach/utils/campaignIdentity";
import { formatINR } from "@/lib/format";
import { getReachPlanDisplay } from "@/lib/reachPlanRegistry";
import { ArrowRight, Eye, Globe2, Hand, Radio, Send, Truck, Users } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

interface ReachStoryPostPreviewProps {
  campaign: ReachCampaignRow | null;
  plan: ReachPlanRow | undefined;
  orgName: string;
  onOpenCampaign?: () => void;
  showAudienceToggle?: boolean;
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

export function ReachStoryPostPreview({
  campaign,
  plan,
  orgName,
  onOpenCampaign,
  showAudienceToggle = false,
}: ReachStoryPostPreviewProps) {
  const id = campaign ? getCampaignIdentity(campaign) : null;
  const isActive = campaign?.status === "active";
  const [audience, setAudience] = useState<"driver" | "fleet">("driver");
  const fareLabel =
    campaign?.load_rate != null && campaign.load_rate > 0
      ? formatINR(campaign.load_rate)
      : "On request";
  const rewardAmount =
    campaign?.driver_reward_enabled && campaign.reward_amount > 0
      ? campaign.reward_amount
      : null;
  const driverMode = showAudienceToggle && audience === "driver";
  const fleetMode = showAudienceToggle && audience === "fleet";
  const planDisplay = plan ? getReachPlanDisplay(plan.code) : undefined;
  const planColor = planDisplay?.color ?? Theme.primary;
  const origin = splitLocationParts(campaign?.snapshot_origin);
  const dest = splitLocationParts(campaign?.snapshot_destination);

  return (
    <View style={styles.shell}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.headerLive}>
            {isActive ? <LiveDot /> : <Radio size={12} color={Theme.textMuted} />}
            <Text style={[styles.headerKicker, isActive && styles.headerKickerLive]}>
              {isActive ? "On air" : "Ad preview"}
            </Text>
          </View>
          <Text style={styles.headerTitle}>Sponsored story</Text>
        </View>
        {showAudienceToggle ? (
          <View style={styles.audienceToggle}>
            {(["driver", "fleet"] as const).map((a) => (
              <Pressable
                key={a}
                onPress={() => setAudience(a)}
                style={[styles.audienceBtn, audience === a && styles.audienceBtnActive]}
              >
                <Text style={[styles.audienceText, audience === a && styles.audienceTextActive]}>
                  {a === "driver" ? "Driver" : "Fleet"}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : (
          <View style={[styles.statusBadge, isActive ? styles.statusBadgeLive : styles.statusBadgeIdle]}>
            <Text style={[styles.statusBadgeText, isActive && styles.statusBadgeTextLive]}>
              {campaign ? (isActive ? "Delivering" : campaign.status) : "Empty"}
            </Text>
          </View>
        )}
      </View>

      {campaign && id ? (
        <View style={styles.stage}>
          <View style={styles.phone}>
            <View style={styles.watermark}>
              <PulseStoryWatermark size={28} opacity={0.42} />
            </View>
            <View style={styles.identityRow}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{id.initials}</Text>
              </View>
              <View style={styles.identityText}>
                <Text style={styles.kicker}>Load broadcast</Text>
                <Text style={styles.title} numberOfLines={1}>
                  {id.truck ?? id.title}
                </Text>
                <Text style={styles.advertiser} numberOfLines={1}>
                  {orgName} · Sponsored
                </Text>
              </View>
              {plan ? (
                <View style={[styles.planChip, { borderColor: planColor }]}>
                  <Text style={[styles.planChipText, { color: planColor }]}>{plan.name}</Text>
                </View>
              ) : null}
            </View>

            <View style={styles.routeStrip}>
              <View style={styles.routeEnd}>
                <View style={styles.dotOrigin} />
                <Text style={styles.routeCity} numberOfLines={2}>
                  {origin.city || campaign.snapshot_origin || "Origin"}
                </Text>
                {origin.state ? (
                  <Text style={styles.routeState} numberOfLines={1}>
                    {origin.state}
                  </Text>
                ) : null}
              </View>
              <View style={styles.routeMid}>
                <View style={styles.routeLine} />
                <ArrowRight size={14} color={Theme.actionBtnInk} strokeWidth={2.4} />
                <View style={styles.routeLine} />
              </View>
              <View style={[styles.routeEnd, styles.routeEndRight]}>
                <View style={styles.dotDest} />
                <Text style={[styles.routeCity, styles.routeCityRight]} numberOfLines={2}>
                  {dest.city || campaign.snapshot_destination || "Destination"}
                </Text>
                {dest.state ? (
                  <Text style={[styles.routeState, styles.routeCityRight]} numberOfLines={1}>
                    {dest.state}
                  </Text>
                ) : null}
              </View>
            </View>

            <View style={styles.specRow}>
              <View style={styles.specChip}>
                <Truck size={12} color={Theme.textMuted} strokeWidth={2.2} />
                <Text style={styles.specChipText}>{id.truck ?? "Any vehicle"}</Text>
              </View>
              <View style={[styles.specChip, styles.specChipFare]}>
                <Text style={styles.specFare}>{fareLabel}</Text>
              </View>
            </View>

            <View style={styles.audienceRow}>
              <View style={styles.audienceChip}>
                <Users size={11} color={Theme.primary} />
                <Text style={styles.audienceChipText}>Network</Text>
              </View>
              <View style={styles.audienceChip}>
                <Globe2 size={11} color={Theme.primary} />
                <Text style={styles.audienceChipText}>Pulse</Text>
              </View>
              <View style={styles.audienceChip}>
                <Truck size={11} color={Theme.primary} />
                <Text style={styles.audienceChipText}>Pilot / DCO</Text>
              </View>
            </View>
          </View>

          {driverMode ? (
            <View style={styles.ctaBlock}>
              {campaign.distribution_channels?.includes("driver") ? (
                <>
                  <Pressable style={[styles.cta, styles.ctaSecondary]} onPress={onOpenCampaign}>
                    <Send size={14} color={Theme.primary} />
                    <Text style={styles.ctaSecondaryText}>
                      Recommend to Fleet
                      {rewardAmount ? ` (+₹${rewardAmount})` : ""}
                    </Text>
                  </Pressable>
                  <Text style={styles.ctaSubtext}>
                    Drivers forward this load to their fleet for bidding
                  </Text>
                </>
              ) : (
                <>
                  <View style={[styles.cta, styles.ctaDisabled]}>
                    <Send size={14} color={Theme.textMuted} />
                    <Text style={styles.ctaDisabledText}>Driver channel disabled</Text>
                  </View>
                  <Text style={styles.ctaSubtext}>Drivers will not see this campaign</Text>
                </>
              )}
            </View>
          ) : fleetMode ? (
            <View style={styles.ctaBlock}>
              <Pressable style={styles.cta} onPress={onOpenCampaign}>
                <Hand size={14} color={Theme.textOnPrimary} />
                <Text style={styles.ctaText}>Submit fleet bid</Text>
              </Pressable>
              <Text style={styles.ctaSubtext}>Fleet owners quote the shipper directly</Text>
            </View>
          ) : (
            <Pressable
              style={[styles.cta, !onOpenCampaign && styles.ctaDisabled]}
              onPress={onOpenCampaign}
              disabled={!onOpenCampaign}
            >
              <Eye size={15} color={Theme.textOnPrimary} strokeWidth={2.3} />
              <Text style={styles.ctaText}>
                {onOpenCampaign ? "View story" : "Preview only"}
              </Text>
            </Pressable>
          )}
        </View>
      ) : (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No campaign selected</Text>
          <Text style={styles.emptyBody}>Select a campaign to preview the live story ad.</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    width: "100%",
    alignSelf: "stretch",
    backgroundColor: Theme.cardWhite,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Theme.actionBtnGhostBorder,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
    backgroundColor: Theme.screenBackground,
  },
  headerLeft: { flex: 1, minWidth: 0, gap: 2 },
  headerLive: { flexDirection: "row", alignItems: "center", gap: 6 },
  headerKicker: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: Theme.textMuted,
  },
  headerKickerLive: { color: Theme.positive },
  headerTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: Theme.actionBtnInk,
    letterSpacing: -0.3,
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
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    flexShrink: 0,
  },
  statusBadgeLive: {
    backgroundColor: Theme.positiveMuted,
    borderColor: Theme.positive,
  },
  statusBadgeIdle: {
    backgroundColor: Theme.cardWhite,
    borderColor: Theme.actionBtnGhostBorder,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "capitalize",
  },
  statusBadgeTextLive: { color: Theme.positive },
  stage: { padding: 14, gap: 12, backgroundColor: Theme.screenBackground },
  phone: {
    borderRadius: 18,
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.actionBtnGhostBorder,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 14,
    gap: 12,
    overflow: "hidden",
    ...Platform.select({
      web: { boxShadow: "0 10px 28px rgba(77, 54, 54, 0.08)" } as object,
      default: {},
    }),
  },
  watermark: {
    position: "absolute",
    right: 16,
    top: 18,
    zIndex: 0,
  },
  identityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    zIndex: 1,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Theme.accentBrownSoft,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    borderWidth: 2,
    borderColor: Theme.cardWhite,
  },
  avatarText: {
    fontSize: 13,
    fontWeight: "800",
    color: Theme.accentBrownDeep,
  },
  identityText: { flex: 1, minWidth: 0, gap: 1 },
  kicker: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: Theme.textMuted,
  },
  title: {
    fontSize: 20,
    fontWeight: "800",
    color: Theme.actionBtnInk,
    letterSpacing: -0.4,
  },
  advertiser: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textMuted,
  },
  planChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: Theme.cardWhite,
    flexShrink: 0,
  },
  planChipText: {
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  routeStrip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Theme.loadAddButtonBg,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    zIndex: 1,
  },
  routeEnd: { flex: 1, minWidth: 0, gap: 3 },
  routeEndRight: { alignItems: "flex-end" },
  routeCity: {
    fontSize: 14,
    fontWeight: "800",
    color: Theme.actionBtnInk,
    letterSpacing: -0.2,
  },
  routeCityRight: { textAlign: "right" },
  routeState: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textMuted,
  },
  routeMid: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flexShrink: 0,
  },
  routeLine: {
    width: 14,
    height: StyleSheet.hairlineWidth,
    backgroundColor: Theme.loadStatusTabBorderSoft,
  },
  dotOrigin: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Theme.positive,
  },
  dotDest: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Theme.actionBtnInk,
  },
  specRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, zIndex: 1 },
  specChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 999,
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.actionBtnGhostBorder,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  specChipFare: { backgroundColor: Theme.loadAddButtonBg },
  specChipText: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.actionBtnInk,
  },
  specFare: {
    fontSize: 13,
    fontWeight: "800",
    color: Theme.actionBtnInk,
    fontVariant: ["tabular-nums"],
  },
  audienceRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, zIndex: 1 },
  audienceChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Theme.actionBtnGhostBorder,
    backgroundColor: Theme.cardWhite,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  audienceChipText: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.actionBtnInk,
  },
  cta: {
    width: "100%",
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Theme.buttonPrimary,
    borderRadius: 12,
    borderWidth: Theme.buttonPrimaryBorderWidth,
    borderColor: Theme.buttonPrimaryBorder,
    ...Platform.select({
      web: { cursor: "pointer" } as object,
      default: {},
    }),
  },
  ctaText: {
    fontSize: 14,
    fontWeight: "800",
    color: Theme.textOnPrimary,
    letterSpacing: -0.2,
  },
  ctaBlock: { gap: 6 },
  ctaSecondary: {
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.actionBtnGhostBorder,
  },
  ctaSecondaryText: {
    fontSize: 14,
    fontWeight: "800",
    color: Theme.primary,
  },
  ctaDisabled: {
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.actionBtnGhostBorder,
  },
  ctaDisabledText: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textMuted,
  },
  ctaSubtext: {
    fontSize: 12,
    fontWeight: "500",
    color: Theme.textMuted,
    textAlign: "center",
    lineHeight: 16,
  },
  audienceToggle: {
    flexDirection: "row",
    gap: 2,
    backgroundColor: Theme.cardWhite,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.actionBtnGhostBorder,
    padding: 2,
    flexShrink: 0,
  },
  audienceBtn: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
  },
  audienceBtnActive: { backgroundColor: Theme.primary },
  audienceText: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textMuted,
  },
  audienceTextActive: { color: Theme.textOnPrimary },
  empty: {
    minHeight: 200,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingVertical: 32,
    gap: 6,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
  },
  emptyBody: {
    fontSize: 12,
    fontWeight: "500",
    color: Theme.textMuted,
    textAlign: "center",
    lineHeight: 17,
  },
});
