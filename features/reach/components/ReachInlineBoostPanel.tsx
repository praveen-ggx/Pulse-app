/**
 * Inline Pulse Boost tariff picker — live plan cards, icons, light motion.
 */
import Theme from "@/constants/Theme";
import type { ReachPlanRow } from "@/features/reach/services/campaigns.service";
import { formatINR } from "@/lib/format";
import {
  useCancelReachCampaignMutation,
  usePublishReachCampaignMutation,
  useReachPlansQuery,
} from "@/lib/queries/useReachCampaignsQuery";
import { useReachWalletQuery } from "@/lib/queries/useReachWalletQuery";
import { getReachPlanDisplay } from "@/lib/reachPlanRegistry";
import {
  Coins,
  CreditCard,
  Flame,
  Globe2,
  Radio,
  Rocket,
  Truck,
  Users,
  Wallet,
  Zap,
} from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

function formatDuration(hours: number): string {
  if (hours <= 0) return "—";
  if (hours % 24 === 0) return `${hours / 24}d`;
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

function PlanGlyph({
  code,
  index,
  color,
}: {
  code: string;
  index: number;
  color: string;
}) {
  const Icon = code === "max" || index >= 2 ? Flame : code === "boost" || index === 1 ? Zap : Rocket;
  return <Icon size={16} color={color} strokeWidth={2.4} />;
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

type ReachInlineBoostPanelProps = {
  orgId: string;
  postId: string;
  replacesCampaignId?: string | null;
  onBoosted: (campaignId: string) => void;
};

export function ReachInlineBoostPanel({
  orgId,
  postId,
  replacesCampaignId = null,
  onBoosted,
}: ReachInlineBoostPanelProps) {
  const plansQ = useReachPlansQuery();
  const walletQ = useReachWalletQuery(orgId);
  const publish = usePublishReachCampaignMutation();
  const cancelLive = useCancelReachCampaignMutation();
  const [planId, setPlanId] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"credits" | "money">("credits");
  const reachAnim = useRef(new Animated.Value(0)).current;
  const [reachShown, setReachShown] = useState(0);
  const ctaPulse = useRef(new Animated.Value(1)).current;

  const plans = plansQ.data ?? [];
  useEffect(() => {
    if (!planId && plans[0]) setPlanId(plans[0].id);
  }, [planId, plans]);

  const selected = plans.find((p) => p.id === planId) ?? plans[0];
  const balance = walletQ.data ?? 0;
  const canAfford =
    paymentMethod === "money" || (selected != null && balance >= selected.credit_price);
  const busy = publish.isPending || cancelLive.isPending;

  useEffect(() => {
    if (!selected) return;
    const target = selected.estimated_reach_max;
    reachAnim.stopAnimation();
    reachAnim.setValue(0);
    const id = reachAnim.addListener(({ value }) => {
      setReachShown(Math.round(value));
    });
    Animated.timing(reachAnim, {
      toValue: target,
      duration: 520,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
    return () => {
      reachAnim.removeListener(id);
    };
  }, [reachAnim, selected?.id, selected?.estimated_reach_max]);

  useEffect(() => {
    if (!canAfford || busy) {
      ctaPulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(ctaPulse, {
          toValue: 1.015,
          duration: 900,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(ctaPulse, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [busy, canAfford, ctaPulse]);

  const handleBoost = async () => {
    if (!selected) return;
    if (!canAfford) {
      Alert.alert("Not enough credits", "Choose cash, or earn credits first.");
      return;
    }
    if (replacesCampaignId) {
      const cancelled = await cancelLive.mutateAsync({
        campaignId: replacesCampaignId,
        reason: "moved_to_another_story",
        orgId,
      });
      if (cancelled.error) {
        Alert.alert("Couldn't move boost", cancelled.error.message);
        return;
      }
    }
    const { error, result } = await publish.mutateAsync({
      orgId,
      postId,
      planId: selected.id,
      paymentMethod,
      rewardConfig: {
        distributionChannels: ["fleet", "driver"],
        driverRewardEnabled: false,
        rewardAmount: 0,
        rewardBudget: 0,
      },
    });
    if (error || !result) {
      Alert.alert("Couldn't boost", error?.message ?? "Try again.");
      return;
    }
    onBoosted(result.campaign_id);
  };

  if (plansQ.isLoading) {
    return <ActivityIndicator color={Theme.primary} style={{ marginTop: 16 }} />;
  }
  if (!selected) {
    return <Text style={styles.empty}>No boost plans are available.</Text>;
  }

  return (
    <ScrollView
      style={styles.card}
      contentContainerStyle={styles.cardInner}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.liveRow}>
        <LiveDot />
        <Radio size={12} color={Theme.positive} strokeWidth={2.4} />
        <Text style={styles.liveText}>Live story · going on air</Text>
      </View>
      <Text style={styles.title}>Boost this story</Text>
      <Text style={styles.body}>
        Sponsored placement to Network, Pulse outside the network, and Pulse Pilot / DCO.
      </Text>

      {replacesCampaignId ? (
        <View style={styles.moveBanner}>
          <Zap size={13} color={Theme.warning} />
          <Text style={styles.moveBannerText}>
            Another boost is live. Confirming ends that ad and starts this one.
          </Text>
        </View>
      ) : null}

      <View style={styles.audienceRow}>
        <View style={styles.audienceChip}>
          <Users size={12} color={Theme.primary} />
          <Text style={styles.audienceText}>Network</Text>
        </View>
        <View style={styles.audienceChip}>
          <Globe2 size={12} color={Theme.primary} />
          <Text style={styles.audienceText}>Pulse</Text>
        </View>
        <View style={styles.audienceChip}>
          <Truck size={12} color={Theme.primary} />
          <Text style={styles.audienceText}>Pilot / DCO</Text>
        </View>
      </View>

      <View style={styles.reachHero}>
        <Text style={styles.reachKicker}>Expected reach</Text>
        <Text style={styles.reachValue}>{reachShown.toLocaleString()}</Text>
        <Text style={styles.reachSub}>
          {selected.name} · {formatDuration(selected.duration_hours)} on air
        </Text>
      </View>

      <View style={styles.list}>
        {plans.map((plan, index) => {
          const on = plan.id === selected.id;
          const color = getReachPlanDisplay(plan.code)?.color ?? Theme.primary;
          return (
            <Pressable
              key={plan.id}
              style={[styles.option, on && styles.optionOn]}
              onPress={() => setPlanId(plan.id)}
            >
              <View style={[styles.planIcon, { backgroundColor: Theme.surface }]}>
                <PlanGlyph code={plan.code} index={index} color={color} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.optionName}>{plan.name}</Text>
                <Text style={styles.optionSpec}>
                  {plan.estimated_reach_min.toLocaleString()}–
                  {plan.estimated_reach_max.toLocaleString()} people
                  {"  ·  "}
                  {formatDuration(plan.duration_hours)}
                </Text>
              </View>
              <Text style={styles.optionPrice}>
                {plan.credit_price.toLocaleString()}
                <Text style={styles.optionPriceUnit}> cr</Text>
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.payRow}>
        <Pressable
          style={[styles.payBtn, paymentMethod === "credits" && styles.payBtnOn]}
          onPress={() => setPaymentMethod("credits")}
        >
          <Coins size={13} color={paymentMethod === "credits" ? Theme.textOnPrimary : Theme.textMuted} />
          <Text style={[styles.payText, paymentMethod === "credits" && styles.payTextOn]}>
            Credits · {selected.credit_price.toLocaleString()}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.payBtn, paymentMethod === "money" && styles.payBtnOn]}
          onPress={() => setPaymentMethod("money")}
        >
          <CreditCard size={13} color={paymentMethod === "money" ? Theme.textOnPrimary : Theme.textMuted} />
          <Text style={[styles.payText, paymentMethod === "money" && styles.payTextOn]}>
            Cash · {formatINR(selected.price_inr)}
          </Text>
        </Pressable>
      </View>

      <View style={styles.walletRow}>
        <Wallet size={12} color={canAfford ? Theme.textMuted : Theme.negative} />
        <Text style={[styles.wallet, !canAfford && styles.walletWarn]}>
          Wallet {balance.toLocaleString()} cr
          {!canAfford && paymentMethod === "credits" ? " — not enough" : ""}
        </Text>
      </View>

      <Animated.View style={{ transform: [{ scale: ctaPulse }] }}>
        <Pressable
          style={[styles.confirm, (!canAfford || busy) && styles.confirmDisabled]}
          disabled={!canAfford || busy}
          onPress={handleBoost}
        >
          {busy ? (
            <ActivityIndicator size="small" color={Theme.textOnPrimary} />
          ) : (
            <>
              <Rocket size={14} color={Theme.textOnPrimary} />
              <Text style={styles.confirmText}>
                {replacesCampaignId
                  ? `Replace live boost · ${selected.name}`
                  : `Go live · ${selected.name}`}
              </Text>
            </>
          )}
        </Pressable>
      </Animated.View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minHeight: 0,
    backgroundColor: Theme.cardWhite,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.actionBtnGhostBorder,
  },
  cardInner: { padding: 14, gap: 10 },
  liveRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  liveDotWrap: { width: 12, height: 12, alignItems: "center", justifyContent: "center" },
  liveDotRing: {
    position: "absolute",
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Theme.positiveMuted,
  },
  liveDotCore: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: Theme.positive,
  },
  liveText: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.3,
    textTransform: "uppercase",
    color: Theme.positive,
  },
  title: { fontSize: 20, fontWeight: "800", color: Theme.actionBtnInk, letterSpacing: -0.4 },
  body: { fontSize: 12, fontWeight: "500", color: Theme.textSecondary, lineHeight: 17 },
  empty: { fontSize: 13, color: Theme.textMuted, padding: 16 },
  moveBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: Theme.warningMuted,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  moveBannerText: { flex: 1, fontSize: 12, fontWeight: "600", color: Theme.warning, lineHeight: 16 },
  audienceRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  audienceChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Theme.actionBtnGhostBorder,
    backgroundColor: Theme.surface,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  audienceText: { fontSize: 11, fontWeight: "700", color: Theme.actionBtnInk },
  reachHero: {
    borderRadius: 10,
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.actionBtnGhostBorder,
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignItems: "flex-start",
  },
  reachKicker: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: Theme.textMuted,
  },
  reachValue: {
    fontSize: 34,
    fontWeight: "800",
    color: Theme.actionBtnInk,
    letterSpacing: -1,
    fontVariant: ["tabular-nums"],
  },
  reachSub: { fontSize: 12, fontWeight: "600", color: Theme.textSecondary },
  list: { gap: 8 },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.actionBtnGhostBorder,
    backgroundColor: Theme.cardWhite,
  },
  optionOn: {
    borderColor: Theme.primary,
    backgroundColor: Theme.surface,
  },
  planIcon: {
    width: 32,
    height: 32,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  optionName: { fontSize: 14, fontWeight: "800", color: Theme.actionBtnInk },
  optionSpec: { fontSize: 11, fontWeight: "500", color: Theme.textMuted, marginTop: 2 },
  optionPrice: {
    fontSize: 13,
    fontWeight: "800",
    color: Theme.actionBtnInk,
    fontVariant: ["tabular-nums"],
  },
  optionPriceUnit: { fontSize: 10, fontWeight: "600", color: Theme.textMuted },
  payRow: { flexDirection: "row", gap: 8 },
  payBtn: {
    flex: 1,
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.actionBtnGhostBorder,
    backgroundColor: Theme.cardWhite,
  },
  payBtnOn: { backgroundColor: Theme.primary, borderColor: Theme.primary },
  payText: { fontSize: 12, fontWeight: "700", color: Theme.textPrimaryDark },
  payTextOn: { color: Theme.textOnPrimary },
  walletRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  wallet: { fontSize: 11, fontWeight: "600", color: Theme.textMuted },
  walletWarn: { color: Theme.negative },
  confirm: {
    minHeight: 46,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    backgroundColor: Theme.primary,
  },
  confirmDisabled: { opacity: 0.45 },
  confirmText: { fontSize: 13, fontWeight: "800", color: Theme.textOnPrimary },
});
