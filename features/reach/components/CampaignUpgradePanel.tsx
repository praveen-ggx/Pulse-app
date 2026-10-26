/**
 * Upgrade picker — higher plans only, with expected reach and new expiry.
 */
import Theme from "@/constants/Theme";
import type { ReachPlanRow } from "@/features/reach/services/campaigns.service";
import { formatINR, formatLedgerDateTime } from "@/lib/format";
import { useReachPlansQuery, useUpgradeReachCampaignMutation } from "@/lib/queries/useReachCampaignsQuery";
import { useReachWalletQuery } from "@/lib/queries/useReachWalletQuery";
import { Check, Coins, CreditCard } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from "react-native";

interface CampaignUpgradePanelProps {
  orgId: string;
  campaignId: string;
  currentPlanId: string;
  defaultExpanded?: boolean;
  publishedAt?: string | null;
  expiresAt?: string | null;
}

function formatDuration(hours: number): string {
  if (hours <= 0) return "—";
  if (hours % 24 === 0) return `${hours / 24}d`;
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

function projectedExpiryIso(
  publishedAt: string | null | undefined,
  expiresAt: string | null | undefined,
  durationHours: number,
): string | null {
  const fromPublish = publishedAt
    ? new Date(publishedAt).getTime() + durationHours * 60 * 60 * 1000
    : 0;
  const current = expiresAt ? new Date(expiresAt).getTime() : 0;
  const next = Math.max(fromPublish, current);
  return next > 0 ? new Date(next).toISOString() : null;
}

export function CampaignUpgradePanel({
  orgId,
  campaignId,
  currentPlanId,
  publishedAt,
  expiresAt,
}: CampaignUpgradePanelProps) {
  const plansQ = useReachPlansQuery();
  const walletQ = useReachWalletQuery(orgId);
  const upgradeMutation = useUpgradeReachCampaignMutation();
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"credits" | "money">("credits");

  const plans = plansQ.data ?? [];
  const current =
    plans.find((p) => p.id === currentPlanId) ??
    plans.find((p) => p.code === currentPlanId) ??
    null;

  const options = useMemo(() => {
    const ranked = [...plans].sort(
      (a, b) => a.sort_order - b.sort_order || a.credit_price - b.credit_price,
    );
    if (!current) return ranked.filter((p) => p.id !== currentPlanId);
    return ranked.filter(
      (p) => p.id !== current.id && (p.sort_order > current.sort_order || p.credit_price > current.credit_price),
    );
  }, [current, currentPlanId, plans]);

  useEffect(() => {
    if (options.length === 0) {
      setSelectedPlanId(null);
      return;
    }
    if (!selectedPlanId || !options.some((p) => p.id === selectedPlanId)) {
      setSelectedPlanId(options[0].id);
    }
  }, [options, selectedPlanId]);

  const selected = options.find((p) => p.id === selectedPlanId) ?? options[0];
  const balance = walletQ.data ?? 0;
  const diffCredits = selected && current ? selected.credit_price - current.credit_price : selected?.credit_price ?? 0;
  const diffInr = selected && current ? selected.price_inr - current.price_inr : selected?.price_inr ?? 0;
  const canAffordCredits = balance >= diffCredits;
  const canPay = paymentMethod === "money" || canAffordCredits;

  const handleUpgrade = async () => {
    if (!selected) return;
    if (paymentMethod === "credits" && !canAffordCredits) {
      Alert.alert(
        "Not enough credits",
        `This upgrade needs ${diffCredits.toLocaleString()} credits. Your wallet has ${balance.toLocaleString()}. Choose cash, or earn credits first.`,
      );
      return;
    }
    const { error, result } = await upgradeMutation.mutateAsync({
      campaignId,
      newPlanId: selected.id,
      paymentMethod,
      orgId,
    });
    if (error || !result) {
      const message = error?.message ?? "Upgrade did not complete.";
      if (/insufficient|not enough|wallet|credit/i.test(message)) {
        Alert.alert("Not enough credits", message);
        return;
      }
      Alert.alert("Couldn't upgrade", message);
      return;
    }
    if (result.purchase_status === "pending") {
      Alert.alert(
        "Upgrade recorded",
        `Cash payment of ${formatINR(diffInr)} is pending. ${selected.name} is queued once settlement clears.`,
      );
      return;
    }
    Alert.alert(
      "Upgraded",
      `Charged ${diffCredits.toLocaleString()} credits. This campaign is now on ${selected.name}.`,
    );
  };

  if (plansQ.isLoading) {
    return <ActivityIndicator color={Theme.primary} style={{ marginVertical: 8 }} />;
  }

  if (options.length === 0) {
    return (
      <View style={styles.wrap}>
        <Text style={styles.kicker}>Upgrades</Text>
        <Text style={styles.now}>
          {current?.name ?? "This plan"} is the highest tariff. Sponsored ads already go to
          Network, Pulse outside the network, and Pulse Pilot / DCO until expiry.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.kicker}>Upgrade reach</Text>
      <Text style={styles.now}>
        Pay the difference. Reach and expiry move to the new plan.
      </Text>

      <View style={styles.list}>
        {options.map((plan) => {
          const on = plan.id === selected?.id;
          const extraReach = current
            ? Math.max(0, plan.estimated_reach_max - current.estimated_reach_max)
            : plan.estimated_reach_max;
          const nextExpiry = projectedExpiryIso(publishedAt, expiresAt, plan.duration_hours);
          return (
            <Pressable
              key={plan.id}
              style={[styles.option, on && styles.optionOn]}
              onPress={() => setSelectedPlanId(plan.id)}
            >
              <View style={styles.optionTop}>
                <Text style={styles.optionName}>{plan.name}</Text>
                {on ? <Check size={14} color={Theme.primary} strokeWidth={3} /> : null}
              </View>
              <Text style={styles.reachLine}>
                Expected reach {plan.estimated_reach_min.toLocaleString()}–
                {plan.estimated_reach_max.toLocaleString()}
                {extraReach > 0 ? `  ·  +${extraReach.toLocaleString()} vs now` : ""}
              </Text>
              <View style={styles.metaRow}>
                <Text style={styles.meta}>
                  Expires {nextExpiry ? formatLedgerDateTime(nextExpiry) : formatDuration(plan.duration_hours)}
                </Text>
                <Text style={styles.metaStrong}>
                  +{Math.max(0, current ? plan.credit_price - current.credit_price : plan.credit_price).toLocaleString()} cr
                  {"  ·  "}
                  +{formatINR(Math.max(0, current ? plan.price_inr - current.price_inr : plan.price_inr))}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      {selected ? (
        <>
          <View style={styles.payRow}>
            <Pressable
              style={[styles.payBtn, paymentMethod === "credits" && styles.payBtnOn]}
              onPress={() => setPaymentMethod("credits")}
            >
              <Coins size={13} color={paymentMethod === "credits" ? Theme.textOnPrimary : Theme.textMuted} />
              <Text style={[styles.payText, paymentMethod === "credits" && styles.payTextOn]}>
                Credits · {Math.max(0, diffCredits).toLocaleString()}
              </Text>
            </Pressable>
            <Pressable
              style={[styles.payBtn, paymentMethod === "money" && styles.payBtnOn]}
              onPress={() => setPaymentMethod("money")}
            >
              <CreditCard size={13} color={paymentMethod === "money" ? Theme.textOnPrimary : Theme.textMuted} />
              <Text style={[styles.payText, paymentMethod === "money" && styles.payTextOn]}>
                Cash · {formatINR(Math.max(0, diffInr))}
              </Text>
            </Pressable>
          </View>
          <Text style={[styles.wallet, paymentMethod === "credits" && !canAffordCredits && styles.walletWarn]}>
            Wallet {balance.toLocaleString()} cr
            {paymentMethod === "credits" && !canAffordCredits
              ? ` — need ${diffCredits.toLocaleString()} to upgrade`
              : ""}
          </Text>
          <Pressable
            style={[styles.confirm, (!canPay || upgradeMutation.isPending) && styles.confirmDisabled]}
            disabled={!canPay || upgradeMutation.isPending}
            onPress={handleUpgrade}
          >
            {upgradeMutation.isPending ? (
              <ActivityIndicator size="small" color={Theme.textOnPrimary} />
            ) : (
              <Text style={styles.confirmText}>
                {paymentMethod === "credits"
                  ? `Pay ${Math.max(0, diffCredits).toLocaleString()} cr · ${selected.name}`
                  : `Pay ${formatINR(Math.max(0, diffInr))} · ${selected.name}`}
              </Text>
            )}
          </Pressable>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  kicker: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: Theme.textMuted,
  },
  now: { fontSize: 12, fontWeight: "600", color: Theme.textSecondary, lineHeight: 17 },
  list: { gap: 8 },
  option: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.actionBtnGhostBorder,
    backgroundColor: Theme.cardWhite,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
  },
  optionOn: {
    borderColor: Theme.primary,
    backgroundColor: Theme.surface,
  },
  optionTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  optionName: { fontSize: 14, fontWeight: "800", color: Theme.actionBtnInk },
  reachLine: { fontSize: 12, fontWeight: "700", color: Theme.primary },
  metaRow: { gap: 2 },
  meta: { fontSize: 11, fontWeight: "500", color: Theme.textMuted },
  metaStrong: { fontSize: 11, fontWeight: "700", color: Theme.actionBtnInk },
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
  wallet: { fontSize: 11, fontWeight: "600", color: Theme.textMuted },
  walletWarn: { color: Theme.negative },
  confirm: {
    minHeight: 44,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.primary,
    paddingHorizontal: 12,
  },
  confirmDisabled: { opacity: 0.45 },
  confirmText: { fontSize: 13, fontWeight: "800", color: Theme.textOnPrimary, textAlign: "center" },
});
