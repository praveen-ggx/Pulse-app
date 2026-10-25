/**
 * Boost sheet — pick a Reach plan, choose distribution (fleet / driver
 * stories), optionally enable flat driver referral rewards with an escrowed
 * budget (Boost V2), pay with Pulse Credits or cash, publish.
 * Modeled on StoryOwnerBidsSheet.tsx's Modal/sheet pattern.
 */
import Theme from "@/constants/Theme";
import {
  StoryFlowSheetPortal,
  useStoryPhoneFrameMetrics,
} from "@/features/network/components/StoryMobilePopupShell";
import type { ReachPlanRow } from "@/features/reach/services/campaigns.service";
import { findOrgDraftOrActiveCampaign } from "@/features/reach/utils/orgActiveBoost";
import { formatINR } from "@/lib/format";
import {
  useCancelReachCampaignMutation,
  usePublishReachCampaignMutation,
  useReachCampaignsQuery,
  useReachPlansQuery,
} from "@/lib/queries/useReachCampaignsQuery";
import { useReachWalletQuery } from "@/lib/queries/useReachWalletQuery";
import { describeReachPlan, getReachPlanDisplay } from "@/lib/reachPlanRegistry";
import { ROUTES } from "@/lib/routes";
import { useRouter } from "expo-router";
import { Check, CheckCircle2, Coins, CreditCard, Rocket, Users, X, Zap } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/** Flat rewards only in this release (1 credit == ₹1). */
const REWARD_PRESETS = [250, 500, 1000] as const;
const DEFAULT_REWARD_BUDGET = "5000";

const INK = Theme.loadAddButtonText;
const MUTED = Theme.loadStatusTabTextMuted;

interface BoostSheetProps {
  visible: boolean;
  onClose: () => void;
  orgId: string;
  postId: string;
  /** Called with the new campaign's id — the post list hasn't refetched yet
   * at this point, so callers needing the id right away (View Campaign)
   * can't rely on post.reach_campaign_id being fresh. */
  onBoosted: (campaignId: string) => void;
  /** Opens the progress sheet for the campaign that was just created. */
  onViewCampaign?: () => void;
}

function formatDuration(hours: number): string {
  if (hours % 24 === 0) return `${hours / 24} day${hours === 24 ? "" : "s"}`;
  return `${hours} hours`;
}

export function BoostSheet({ visible, onClose, orgId, postId, onBoosted, onViewCampaign }: BoostSheetProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { phonePopup, sheetBottomPad } = useStoryPhoneFrameMetrics();
  const plansQ = useReachPlansQuery();
  const campaignsQ = useReachCampaignsQuery(visible ? orgId : null);
  const walletQ = useReachWalletQuery(visible ? orgId : null);
  const publishMutation = usePublishReachCampaignMutation();
  const cancelMutation = useCancelReachCampaignMutation();
  const bottomPad = sheetBottomPad ?? insets.bottom + 14;

  const orgActiveBoost = useMemo(
    () => findOrgDraftOrActiveCampaign(campaignsQ.data),
    [campaignsQ.data],
  );

  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"credits" | "money">("credits");
  const [justBoosted, setJustBoosted] = useState<{ plan: ReachPlanRow; pending: boolean } | null>(null);
  // Boost V2 — driver distribution + referral escrow
  const [driverChannel, setDriverChannel] = useState(true);
  const [rewardEnabled, setRewardEnabled] = useState(false);
  const [rewardAmount, setRewardAmount] = useState<number>(500);
  const [rewardBudgetText, setRewardBudgetText] = useState(DEFAULT_REWARD_BUDGET);

  useEffect(() => {
    if (visible && plansQ.data && plansQ.data.length > 0 && !selectedPlanId) {
      setSelectedPlanId(plansQ.data[0].id);
    }
    if (!visible) {
      setSelectedPlanId(null);
      setPaymentMethod("credits");
      setJustBoosted(null);
      setDriverChannel(true);
      setRewardEnabled(false);
      setRewardAmount(500);
      setRewardBudgetText(DEFAULT_REWARD_BUDGET);
    }
  }, [visible, plansQ.data, selectedPlanId]);

  const selectedPlan = plansQ.data?.find((p) => p.id === selectedPlanId) ?? null;
  const balance = walletQ.data ?? 0;

  const driverRewardOn = driverChannel && rewardEnabled;
  const rewardBudget = driverRewardOn ? Math.max(0, parseInt(rewardBudgetText, 10) || 0) : 0;
  const rewardConfigValid = !driverRewardOn || rewardBudget >= rewardAmount;
  // Referral escrow is ALWAYS reserved from the credits wallet (wallet lock),
  // even when the boost fee itself is paid with cash.
  const requiredCredits =
    (paymentMethod === "credits" ? (selectedPlan?.credit_price ?? 0) : 0) + rewardBudget;
  const canAffordCredits = balance >= requiredCredits;

  const openExistingBoost = () => {
    onClose();
    if (onViewCampaign) {
      onViewCampaign();
      return;
    }
    if (orgActiveBoost?.id) {
      router.push(ROUTES.REACH.HOME as never);
      return;
    }
    router.push(ROUTES.REACH.HISTORY as never);
  };

  const handleConfirm = async () => {
    if (!selectedPlan || !rewardConfigValid) return;
    const live = findOrgDraftOrActiveCampaign(campaignsQ.data);
    if (live && live.post_id === postId) {
      Alert.alert(
        "Boost Active",
        "This story is already boosted. Open it to upgrade the plan.",
        [
          { text: "View Boost", onPress: openExistingBoost },
          { text: "Cancel", style: "cancel" },
        ],
      );
      return;
    }
    if (live) {
      const cancelled = await cancelMutation.mutateAsync({
        campaignId: live.id,
        reason: "moved_to_another_story",
        orgId,
      });
      if (cancelled.error) {
        Alert.alert("Couldn't move boost", cancelled.error.message);
        return;
      }
    }
    const { error, result } = await publishMutation.mutateAsync({
      orgId,
      postId,
      planId: selectedPlan.id,
      paymentMethod,
      rewardConfig: {
        distributionChannels: ["fleet", "driver"],
        driverRewardEnabled: driverRewardOn,
        rewardAmount: driverRewardOn ? rewardAmount : 0,
        rewardBudget,
      },
    });
    if (error || !result) {
      const message = error?.message ?? "Unknown error";
      if (message.includes("active_boost_exists")) {
        Alert.alert(
          "Boost Active",
          "Your organization already has an active Boost. Open it instead of purchasing another.",
          [
            { text: "View Boost", onPress: openExistingBoost },
            { text: "Cancel", style: "cancel" },
          ],
        );
        return;
      }
      Alert.alert("Couldn't boost this load", message);
      return;
    }
    onBoosted(result.campaign_id);
    setJustBoosted({ plan: selectedPlan, pending: result.purchase_status === "pending" });
  };

  const showActiveBlock = Boolean(
    visible && orgActiveBoost && orgActiveBoost.post_id === postId && !justBoosted,
  );

  return (
    <StoryFlowSheetPortal
      visible={visible}
      onClose={onClose}
      accessibilityLabel="Close boost picker"
    >
      <View style={[styles.sheet, phonePopup && styles.sheetPhone, { paddingBottom: bottomPad }]}>
          <View style={styles.handle} />

          {justBoosted ? (
            <View style={styles.successWrap}>
              <Text style={styles.successEmoji}>{justBoosted.pending ? "🕐" : "🎉"}</Text>
              <Text style={styles.successTitle}>
                {justBoosted.pending ? "Boost requested" : "Your load is now promoted!"}
              </Text>
              <View style={styles.successPlanBadge}>
                <Rocket size={12} color={getReachPlanDisplay(justBoosted.plan.code)?.color ?? Theme.primary} />
                <Text
                  style={[
                    styles.successPlanBadgeText,
                    { color: getReachPlanDisplay(justBoosted.plan.code)?.color ?? Theme.primary },
                  ]}
                >
                  {justBoosted.plan.name} Plan
                </Text>
              </View>
              {justBoosted.pending ? (
                <Text style={styles.successPending}>
                  Awaiting payment confirmation — your load will go live and be promoted to relevant fleet owners and shippers across Pulse once confirmed.
                </Text>
              ) : (
                <>
                  <Text style={styles.successBody}>
                    Promoting your load to relevant fleet owners and shippers across Pulse
                  </Text>
                  <Text style={styles.successStartNote}>Campaign starts immediately.</Text>
                </>
              )}
              <View style={styles.successActionRow}>
                {onViewCampaign ? (
                  <Pressable
                    style={styles.viewCampaignBtn}
                    onPress={() => {
                      onClose();
                      onViewCampaign();
                    }}
                  >
                    <Text style={styles.viewCampaignBtnText}>View Campaign</Text>
                  </Pressable>
                ) : null}
                <Pressable style={[styles.doneBtn, onViewCampaign && styles.doneBtnFlex]} onPress={onClose}>
                  <CheckCircle2 size={15} color={INK} strokeWidth={2.25} />
                  <Text style={styles.doneBtnText}>Done</Text>
                </Pressable>
              </View>
            </View>
          ) : showActiveBlock ? (
            <View style={styles.successWrap}>
              <View style={styles.headerIcon}>
                <Rocket size={15} color={INK} strokeWidth={2.25} />
              </View>
              <Text style={styles.successTitle}>Boost Active</Text>
              <Text style={styles.successBody}>
                Your organization already has a draft or active Boost. Only one can run at a time —
                open the current campaign instead of purchasing another.
              </Text>
              <View style={styles.successActionRow}>
                <Pressable style={styles.viewCampaignBtn} onPress={openExistingBoost}>
                  <Text style={styles.viewCampaignBtnText}>View Boost</Text>
                </Pressable>
                <Pressable
                  style={[styles.doneBtn, styles.doneBtnFlex]}
                  onPress={() => {
                    onClose();
                    router.push(ROUTES.REACH.HISTORY as never);
                  }}
                >
                  <Text style={styles.doneBtnText}>Reach History</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <>
          <View style={styles.header}>
            <View style={styles.headerLeading}>
              <View style={styles.headerIcon}>
                <Rocket size={15} color={INK} strokeWidth={2.25} />
              </View>
              <View>
                <Text style={styles.title}>Boost this load</Text>
                <Text style={styles.subtitle}>Reach more verified fleet owners</Text>
              </View>
            </View>
            <Pressable style={styles.closeBtn} onPress={onClose} hitSlop={8} accessibilityRole="button">
              <X size={16} color={MUTED} strokeWidth={2.25} />
            </Pressable>
          </View>

          {plansQ.isLoading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator color={INK} />
            </View>
          ) : plansQ.isError || (plansQ.data ?? []).length === 0 ? (
            <View style={styles.loadingWrap}>
              <Text style={styles.errorText}>
                {plansQ.isError
                  ? `Couldn't load Reach plans: ${(plansQ.error as Error)?.message ?? "unknown error"}`
                  : "No Reach plans are available for this workspace yet."}
              </Text>
            </View>
          ) : (
            <ScrollView style={styles.plansList} showsVerticalScrollIndicator={false}>
              {(plansQ.data ?? []).map((plan) => {
                const display = getReachPlanDisplay(plan.code);
                const active = plan.id === selectedPlanId;
                return (
                  <Pressable
                    key={plan.id}
                    style={[styles.planCard, active && styles.planCardActive]}
                    onPress={() => setSelectedPlanId(plan.id)}
                  >
                    <View style={styles.planCardTop}>
                      <Text style={styles.planName}>{plan.name}</Text>
                      {active ? <Check size={16} color={display?.color ?? Theme.primary} strokeWidth={3} /> : null}
                    </View>
                    <Text style={styles.planReach}>
                      {describeReachPlan(plan)} · runs {formatDuration(plan.duration_hours)}
                    </Text>
                    <View style={styles.planPriceRow}>
                      <Text style={styles.planPrice}>{formatINR(plan.price_inr)}</Text>
                      <Text style={styles.planPriceOr}>or {plan.credit_price} credits</Text>
                    </View>
                  </Pressable>
                );
              })}

              {/* ── Distribution ── */}
              <Text style={styles.v2SectionLabel}>Distribution</Text>
              <View style={styles.checkRow}>
                <View style={[styles.checkBox, styles.checkBoxOn, styles.checkBoxLocked]}>
                  <Check size={11} color={Theme.textOnPrimary} strokeWidth={3.5} />
                </View>
                <Text style={styles.checkLabel}>Fleet Owner Stories</Text>
                <Text style={styles.checkHint}>Always on</Text>
              </View>
              <Pressable style={styles.checkRow} onPress={() => setDriverChannel((v) => !v)}>
                <View style={[styles.checkBox, driverChannel && styles.checkBoxOn]}>
                  {driverChannel ? <Check size={11} color={Theme.textOnPrimary} strokeWidth={3.5} /> : null}
                </View>
                <Text style={styles.checkLabel}>Driver Stories</Text>
                <Users size={13} color={MUTED} />
              </Pressable>

              {/* ── Driver Incentive — a campaign-funded, escrow-backed reward,
                   never a gratuity ("tip" deliberately avoided). ── */}
              {driverChannel ? (
                <>
                  <Text style={styles.v2SectionLabel}>Driver Incentive</Text>
                  <Pressable style={styles.checkRow} onPress={() => setRewardEnabled((v) => !v)}>
                    <View style={[styles.checkBox, rewardEnabled && styles.checkBoxOn]}>
                      {rewardEnabled ? <Check size={11} color={Theme.textOnPrimary} strokeWidth={3.5} /> : null}
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.checkLabel}>Add a Driver Incentive</Text>
                      <Text style={styles.checkSub}>
                        Drivers recommend this load to their fleet owner and earn the reward only
                        when the trip converts.
                      </Text>
                    </View>
                  </Pressable>

                  {!rewardEnabled ? (
                    <View style={styles.tipNudge}>
                      <Zap size={13} color={Theme.accentGold} />
                      <Text style={styles.tipNudgeText}>
                        Campaigns with a driver incentive get quicker bids — it gives drivers a
                        reason to push your load to their fleet owner right away.
                      </Text>
                    </View>
                  ) : null}

                  {rewardEnabled ? (
                    <View style={styles.rewardConfig}>
                      <Text style={styles.rewardLabel}>Reward per converted recommendation</Text>
                      <View style={styles.rewardPresets}>
                        {REWARD_PRESETS.map((amt) => (
                          <Pressable
                            key={amt}
                            style={[styles.rewardPreset, rewardAmount === amt && styles.rewardPresetActive]}
                            onPress={() => setRewardAmount(amt)}
                          >
                            <Text
                              style={[
                                styles.rewardPresetText,
                                rewardAmount === amt && styles.rewardPresetTextActive,
                              ]}
                            >
                              {formatINR(amt)}
                            </Text>
                          </Pressable>
                        ))}
                      </View>

                      <Text style={styles.rewardLabel}>Maximum Incentive Budget</Text>
                      <TextInput
                        style={styles.budgetInput}
                        value={rewardBudgetText}
                        onChangeText={setRewardBudgetText}
                        keyboardType="number-pad"
                        placeholder={DEFAULT_REWARD_BUDGET}
                        placeholderTextColor={Theme.textMuted}
                      />
                      {!rewardConfigValid ? (
                        <Text style={styles.rewardError}>
                          Budget must cover at least one reward ({formatINR(rewardAmount)}).
                        </Text>
                      ) : (
                        <Text style={styles.rewardHintText}>
                          Reserved as escrow from your credits wallet. Unused incentive budget is
                          refunded automatically when the campaign ends.
                        </Text>
                      )}
                    </View>
                  ) : null}
                </>
              ) : null}

              {/* ── Campaign Summary ── */}
              {selectedPlan && rewardBudget > 0 ? (
                <View style={styles.summaryCard}>
                  <Text style={styles.v2SectionLabel}>Campaign Summary</Text>
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Boost Fee</Text>
                    <Text style={styles.summaryValue}>
                      {paymentMethod === "credits"
                        ? `${selectedPlan.credit_price} credits`
                        : formatINR(selectedPlan.price_inr)}
                    </Text>
                  </View>
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Reserved Incentive Pool (escrow)</Text>
                    <Text style={styles.summaryValue}>{rewardBudget} credits</Text>
                  </View>
                  <View style={[styles.summaryRow, styles.summaryTotalRow]}>
                    <Text style={styles.summaryTotalLabel}>Total Required Balance</Text>
                    <Text style={styles.summaryTotalValue}>
                      {paymentMethod === "credits"
                        ? `${selectedPlan.credit_price + rewardBudget} credits`
                        : `${formatINR(selectedPlan.price_inr)} + ${rewardBudget} credits`}
                    </Text>
                  </View>
                </View>
              ) : null}
            </ScrollView>
          )}

          {selectedPlan ? (
            <>
              <View style={styles.paymentRow}>
                <Pressable
                  style={[styles.paymentBtn, paymentMethod === "credits" && styles.paymentBtnActive]}
                  onPress={() => setPaymentMethod("credits")}
                >
                  <Coins size={14} color={paymentMethod === "credits" ? INK : MUTED} />
                  <Text style={[styles.paymentBtnText, paymentMethod === "credits" && styles.paymentBtnTextActive]}>
                    Credits ({balance})
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.paymentBtn, paymentMethod === "money" && styles.paymentBtnActive]}
                  onPress={() => setPaymentMethod("money")}
                >
                  <CreditCard size={14} color={paymentMethod === "money" ? INK : MUTED} />
                  <Text style={[styles.paymentBtnText, paymentMethod === "money" && styles.paymentBtnTextActive]}>
                    Pay {formatINR(selectedPlan.price_inr)}
                  </Text>
                </Pressable>
              </View>

              {!canAffordCredits ? (
                <View style={styles.needCreditsCard}>
                  <Text style={styles.needCreditsTitle}>Need credits?</Text>
                  <Text style={styles.needCreditsBody}>
                    Not enough credits ({balance} available, {requiredCredits} needed
                    {rewardBudget > 0 ? " including the incentive escrow" : ""}).{" "}
                    {paymentMethod === "credits" && rewardBudget === 0
                      ? "Pay with cash instead, or contact your Pulse administrator to receive promotional credits."
                      : "The incentive escrow is always reserved from your credits wallet — lower the budget or top up credits."}
                  </Text>
                </View>
              ) : null}

              <Pressable
                style={[
                  styles.confirmBtn,
                  (!canAffordCredits || !rewardConfigValid) && styles.confirmBtnDisabled,
                ]}
                disabled={publishMutation.isPending || !canAffordCredits || !rewardConfigValid}
                onPress={handleConfirm}
              >
                {publishMutation.isPending ? (
                  <ActivityIndicator color={INK} size="small" />
                ) : (
                  <Text style={styles.confirmBtnText}>
                    Boost with{" "}
                    {paymentMethod === "credits"
                      ? `${selectedPlan.credit_price + rewardBudget} credits`
                      : `${formatINR(selectedPlan.price_inr)}${rewardBudget > 0 ? ` + ${rewardBudget} credits escrow` : ""}`}
                  </Text>
                )}
              </Pressable>
            </>
          ) : null}
            </>
          )}
        </View>
    </StoryFlowSheetPortal>
  );
}

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: Theme.cardWhite,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 18,
    paddingTop: 10,
    maxHeight: "82%",
    gap: 12,
  },
  sheetPhone: {
    width: "100%",
    maxHeight: "88%",
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Theme.borderMedium,
    alignSelf: "center",
    marginBottom: 4,
  },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headerLeading: { flexDirection: "row", alignItems: "center", gap: 10 },
  headerIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: Theme.accentGoldMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: 15, fontWeight: "800", color: Theme.textPrimaryDark },
  subtitle: { fontSize: 11, fontWeight: "600", color: MUTED, marginTop: 1 },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: Theme.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingWrap: { paddingVertical: 32, alignItems: "center", paddingHorizontal: 8 },
  errorText: { fontSize: 12, fontWeight: "500", color: Theme.textMuted, textAlign: "center", lineHeight: 17 },
  plansList: { maxHeight: 320 },
  planCard: {
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: Theme.borderLight,
    padding: 14,
    marginBottom: 10,
    gap: 6,
  },
  planCardActive: {
    borderColor: Theme.primary,
    backgroundColor: Theme.primary + "08",
  },
  planCardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  planName: { fontSize: 14, fontWeight: "800", color: Theme.textPrimaryDark },
  planReach: { fontSize: 12, fontWeight: "500", color: Theme.textSecondary },
  planPriceRow: { flexDirection: "row", alignItems: "baseline", gap: 8, marginTop: 2 },
  planPrice: { fontSize: 15, fontWeight: "900", color: Theme.textPrimaryDark },
  planPriceOr: { fontSize: 11, fontWeight: "600", color: Theme.textMuted },
  v2SectionLabel: {
    fontSize: 10,
    fontWeight: "900",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginTop: 6,
    marginBottom: 8,
  },
  checkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surface,
    marginBottom: 8,
  },
  checkBox: {
    width: 18,
    height: 18,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: Theme.borderMedium,
    backgroundColor: Theme.cardWhite,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  checkBoxOn: { backgroundColor: Theme.primary, borderColor: Theme.primary },
  checkBoxLocked: { opacity: 0.55 },
  checkLabel: { flex: 1, fontSize: 12, fontWeight: "700", color: Theme.textPrimaryDark },
  checkSub: { fontSize: 10, fontWeight: "500", color: Theme.textSecondary, marginTop: 2, lineHeight: 14 },
  checkHint: { fontSize: 9, fontWeight: "700", color: Theme.textMuted, textTransform: "uppercase" },
  tipNudge: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.accentGoldBorder,
    backgroundColor: Theme.accentGoldMuted,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
  },
  tipNudgeText: {
    flex: 1,
    minWidth: 0,
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textSecondary,
    lineHeight: 14,
  },
  rewardConfig: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    padding: 12,
    gap: 8,
    marginBottom: 8,
  },
  rewardLabel: { fontSize: 10, fontWeight: "800", color: Theme.textSecondary, textTransform: "uppercase", letterSpacing: 0.3 },
  rewardPresets: { flexDirection: "row", gap: 8 },
  rewardPreset: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surface,
  },
  rewardPresetActive: { backgroundColor: Theme.primary, borderColor: Theme.primary },
  rewardPresetText: { fontSize: 12, fontWeight: "800", color: Theme.textPrimaryDark },
  rewardPresetTextActive: { color: Theme.textOnPrimary },
  budgetInput: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    backgroundColor: Theme.cardWhite,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  rewardError: { fontSize: 10, fontWeight: "700", color: Theme.negative },
  rewardHintText: { fontSize: 10, fontWeight: "500", color: Theme.textMuted, lineHeight: 14 },
  summaryCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.accentGoldBorder,
    backgroundColor: Theme.accentGoldMuted,
    paddingHorizontal: 12,
    paddingBottom: 10,
    marginBottom: 8,
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 3,
  },
  summaryLabel: { fontSize: 11, fontWeight: "600", color: Theme.textSecondary },
  summaryValue: { fontSize: 11, fontWeight: "800", color: Theme.textPrimaryDark, fontVariant: ["tabular-nums"] },
  summaryTotalRow: {
    marginTop: 4,
    paddingTop: 7,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.accentGoldBorder,
  },
  summaryTotalLabel: { fontSize: 12, fontWeight: "900", color: Theme.textPrimaryDark },
  summaryTotalValue: { fontSize: 12, fontWeight: "900", color: Theme.textPrimaryDark, fontVariant: ["tabular-nums"] },

  paymentRow: { flexDirection: "row", gap: 8 },
  paymentBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  paymentBtnActive: { backgroundColor: Theme.loadAddButtonBg, borderColor: Theme.loadStatusTabBorderSoft },
  paymentBtnText: { fontSize: 12, fontWeight: "700", color: MUTED },
  paymentBtnTextActive: { color: INK },
  needCreditsCard: {
    borderRadius: 12,
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    padding: 12,
    gap: 4,
  },
  needCreditsTitle: { fontSize: 12, fontWeight: "800", color: Theme.textPrimaryDark },
  needCreditsBody: { fontSize: 11, fontWeight: "500", color: Theme.textSecondary, lineHeight: 16 },
  confirmBtn: {
    minHeight: 50,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.loadAddButtonBg,
    borderWidth: Theme.buttonPrimaryBorderWidth,
    borderColor: Theme.buttonPrimaryBorder,
  },
  confirmBtnDisabled: { opacity: 0.5 },
  confirmBtnText: { fontSize: 13, fontWeight: "800", color: INK },

  successWrap: { alignItems: "center", paddingVertical: 20, paddingHorizontal: 8, gap: 6 },
  successEmoji: { fontSize: 40, marginBottom: 4 },
  successTitle: { fontSize: 16, fontWeight: "800", color: Theme.textPrimaryDark, textAlign: "center" },
  successPlanBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: Theme.surface,
    marginTop: 4,
  },
  successPlanBadgeText: { fontSize: 12, fontWeight: "800" },
  successBody: { fontSize: 13, fontWeight: "500", color: MUTED, textAlign: "center", marginTop: 4 },
  successStartNote: { fontSize: 11, fontWeight: "600", color: Theme.textMuted, textAlign: "center", marginTop: 8 },
  successPending: { fontSize: 12, fontWeight: "500", color: Theme.textSecondary, textAlign: "center", marginTop: 6, lineHeight: 17, paddingHorizontal: 8 },
  successActionRow: { flexDirection: "row", gap: 10, width: "100%", marginTop: 18 },
  viewCampaignBtn: {
    flex: 1,
    minHeight: 50,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  viewCampaignBtnText: { fontSize: 13, fontWeight: "800", color: Theme.textPrimaryDark },
  doneBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 50,
    minWidth: "100%",
    borderRadius: 16,
    backgroundColor: Theme.loadAddButtonBg,
    borderWidth: Theme.buttonPrimaryBorderWidth,
    borderColor: Theme.buttonPrimaryBorder,
  },
  doneBtnFlex: { flex: 1, minWidth: 0 },
  doneBtnText: { fontSize: 13, fontWeight: "800", color: INK },
});
