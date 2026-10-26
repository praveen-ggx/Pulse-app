/**
 * Pulse Boost billing — wallet, purchase ledger, referral. Hub / Trips layout.
 */
import Theme from "@/constants/Theme";
import { useOrganization } from "@/contexts/OrganizationContext";
import { ReachCampaignStoryPopup } from "@/features/reach/components/ReachCampaignStoryPopup";
import type {
  ReachCampaignPurchaseRow,
  ReachCampaignRow,
  ReachPlanRow,
} from "@/features/reach/services/campaigns.service";
import type { ReferralRow, ReferralStatus } from "@/features/reach/services/referrals.service";
import { formatReachTripId } from "@/features/reach/utils/campaignFormat";
import { buildReferralLink } from "@/features/reach/utils/referralLink";
import { shareViaWhatsAppOrFallback } from "@/features/reach/utils/whatsappShare";
import { classifyStoredPostType } from "@/features/network/utils/storyDisplay";
import { formatINR } from "@/lib/format";
import { useReachWalletQuery } from "@/lib/queries/useReachWalletQuery";
import {
  useMyReferralCodeQuery,
  useReferralsForOrgQuery,
} from "@/lib/queries/useReferralsQuery";
import * as Clipboard from "expo-clipboard";
import { useRouter } from "expo-router";
import { Coins, Copy, Link2, MessageCircle } from "lucide-react-native";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

function statusLabel(status: ReferralStatus): string {
  if (status === "credited") return "Credited";
  if (status === "milestone_met") return "Verifying";
  if (status === "rejected") return "Rejected";
  return "Pending";
}

function statusColor(status: ReferralStatus): string {
  if (status === "credited") return Theme.success;
  if (status === "rejected") return Theme.textMuted;
  return Theme.textSecondary;
}

function shortCampaignId(id: string): string {
  return id.replace(/-/g, "").slice(0, 10).toUpperCase();
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type ReachBillingPanelProps = {
  walletBalance?: number;
  purchases?: ReachCampaignPurchaseRow[];
  campaigns?: ReachCampaignRow[];
  plans?: ReachPlanRow[];
  purchasesLoading?: boolean;
};

export function ReachBillingPanel({
  walletBalance = 0,
  purchases = [],
  campaigns = [],
  plans = [],
  purchasesLoading = false,
}: ReachBillingPanelProps) {
  const { currentOrganization: organization } = useOrganization();
  const orgId = organization?.id ?? null;
  const router = useRouter();
  const isDesktop = useWindowDimensions().width >= 960;
  const [copiedLabel, setCopiedLabel] = useState<string | null>(null);
  const [popupCampaignId, setPopupCampaignId] = useState<string | null>(null);

  const walletQ = useReachWalletQuery(orgId);
  const liveBalance = walletQ.data ?? walletBalance;
  const codeQ = useMyReferralCodeQuery(orgId);
  const referralsQ = useReferralsForOrgQuery(orgId);
  const code = codeQ.data ?? null;
  const link = code ? buildReferralLink(code) : null;

  const campaignById = useMemo(() => {
    const map = new Map<string, ReachCampaignRow>();
    for (const c of campaigns) map.set(c.id, c);
    return map;
  }, [campaigns]);
  const planById = useMemo(() => {
    const map = new Map<string, ReachPlanRow>();
    for (const p of plans) map.set(p.id, p);
    return map;
  }, [plans]);

  const ledger = useMemo(() => {
    return [...purchases].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
  }, [purchases]);

  const creditsSpent = useMemo(() => {
    return ledger.reduce((sum, row) => {
      if (row.credits_charged != null) return sum + row.credits_charged;
      if ((row.payment_method ?? "credits") === "money") return sum;
      return sum + (planById.get(row.plan_id)?.credit_price ?? 0);
    }, 0);
  }, [ledger, planById]);

  const cashSpent = useMemo(() => {
    return ledger.reduce((sum, row) => {
      if (row.amount_inr_charged != null) return sum + Number(row.amount_inr_charged);
      if (row.payment_method === "money") {
        return sum + (planById.get(row.plan_id)?.price_inr ?? 0);
      }
      return sum;
    }, 0);
  }, [ledger, planById]);

  const flashCopied = (label: string) => {
    setCopiedLabel(label);
    setTimeout(() => setCopiedLabel(null), 2000);
  };

  const handleCopyLink = async () => {
    if (!link) return;
    await Clipboard.setStringAsync(link);
    flashCopied("Invite link copied");
  };

  const handleCopyCode = async () => {
    if (!code) return;
    await Clipboard.setStringAsync(code);
    flashCopied("Referral code copied");
  };

  const handleShareWhatsApp = async () => {
    if (!link) return;
    const message = `Join me on Pulse! Sign up with my invite link and we'll both get 500 Pulse Credits once your business is verified:\n${link}`;
    try {
      await shareViaWhatsAppOrFallback(message, link);
    } catch (e) {
      Alert.alert("Couldn't share", e instanceof Error ? e.message : "Please try again.");
    }
  };

  const popupCampaign = popupCampaignId
    ? campaignById.get(popupCampaignId) ?? null
    : null;
  const popupRelatedIds = popupCampaign
    ? campaigns
        .filter((c) => {
          if (c.id === popupCampaign.id) return true;
          const indent = popupCampaign.snapshot_source_indent_id;
          return Boolean(indent && c.snapshot_source_indent_id === indent);
        })
        .map((c) => c.id)
    : [];

  return (
    <View style={styles.workspace}>
      <View style={styles.kpiStrip}>
        <View style={styles.kpiCell}>
          <Text style={styles.kpiLabel}>Credit balance</Text>
          <Text style={styles.kpiValue}>
            {liveBalance.toLocaleString()}
            <Text style={styles.kpiUnit}> cr</Text>
          </Text>
        </View>
        <View style={[styles.kpiCell, styles.kpiCellBorder]}>
          <Text style={styles.kpiLabel}>Credits spent</Text>
          <Text style={styles.kpiValue}>{creditsSpent.toLocaleString()}</Text>
        </View>
        <View style={[styles.kpiCell, styles.kpiCellBorder]}>
          <Text style={styles.kpiLabel}>Cash spent</Text>
          <Text style={styles.kpiValue}>{formatINR(cashSpent)}</Text>
        </View>
        <View style={[styles.kpiCell, styles.kpiCellBorder]}>
          <Text style={styles.kpiLabel}>Transactions</Text>
          <Text style={styles.kpiValue}>{ledger.length}</Text>
        </View>
      </View>

      <View style={[styles.split, !isDesktop && styles.splitMobile]}>
        <View style={[styles.listPane, !isDesktop && styles.listPaneMobile]}>
          <View style={styles.paneHead}>
            <Text style={styles.paneTitle}>Transactions</Text>
            <Text style={styles.paneCount}>{ledger.length} rows</Text>
          </View>
          <ScrollView
            style={styles.listScroll}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          >
            {purchasesLoading ? (
              <ActivityIndicator color={Theme.primary} style={{ marginTop: 24 }} />
            ) : ledger.length === 0 ? (
              <View style={styles.emptyWrap}>
                <Text style={styles.emptyTitle}>No transactions yet</Text>
                <Text style={styles.emptyBody}>
                  Credit and cash spend for boosts and upgrades show here.
                </Text>
              </View>
            ) : (
              <>
                <View style={styles.txnHead}>
                  <Text style={[styles.txnHeadCell, styles.txnGrow]}>Particulars</Text>
                  <Text style={[styles.txnHeadCell, styles.txnAmt]}>Credits</Text>
                  <Text style={[styles.txnHeadCell, styles.txnAmt]}>Cash</Text>
                </View>
                {ledger.map((row, index) => {
                  const campaign = campaignById.get(row.campaign_id);
                  const plan = planById.get(row.plan_id);
                  const tripId = campaign ? formatReachTripId(campaign) : "—";
                  const method = row.payment_method ?? "credits";
                  const credits =
                    row.credits_charged ??
                    (method === "money" ? 0 : plan?.credit_price ?? 0);
                  const cash =
                    row.amount_inr_charged ??
                    (method === "money" ? plan?.price_inr ?? 0 : 0);
                  const paid = (row.status ?? "paid") === "paid";
                  return (
                    <Pressable
                      key={row.id ?? `${row.campaign_id}-${row.created_at}-${index}`}
                      style={styles.row}
                      onPress={() => setPopupCampaignId(row.campaign_id)}
                      accessibilityRole="button"
                      accessibilityLabel="Open campaign story"
                    >
                      <View style={styles.rowMain}>
                        <Text style={styles.rowTitle} numberOfLines={1}>
                          {plan?.name ?? "Boost"}
                          {" · "}
                          {campaign?.snapshot_material?.trim() || "Campaign"}
                        </Text>
                        <Text style={styles.rowId} numberOfLines={1}>
                          {tripId}
                          {"  ·  "}
                          {shortCampaignId(row.campaign_id)}
                        </Text>
                        <Text style={styles.rowMeta} numberOfLines={1}>
                          {formatWhen(row.created_at)}
                          {"  ·  "}
                          {method === "money" ? "Cash" : method === "mixed" ? "Credits + cash" : "Credits"}
                          {"  ·  "}
                          {paid ? "Paid" : row.status ?? "Pending"}
                        </Text>
                      </View>
                      <Text style={[styles.txnAmtValue, credits > 0 && styles.txnDebit]}>
                        {credits > 0 ? `−${credits.toLocaleString()} cr` : "—"}
                      </Text>
                      <Text style={[styles.txnAmtValue, cash > 0 && styles.txnDebit]}>
                        {cash > 0 ? `−${formatINR(cash)}` : "—"}
                      </Text>
                    </Pressable>
                  );
                })}
              </>
            )}
          </ScrollView>
        </View>

        <View style={[styles.sidePane, !isDesktop && styles.sidePaneMobile]}>
          <Text style={styles.paneTitle}>Earn credits</Text>
          <Text style={styles.intro}>
            Invite another logistics company. When they complete verification, you both receive 500
            Pulse Credits.
          </Text>

          {codeQ.isLoading ? (
            <ActivityIndicator color={Theme.primary} />
          ) : code ? (
            <View style={styles.codeCard}>
              <Text style={styles.codeLabel}>Referral code</Text>
              <Text style={styles.codeValue}>{code}</Text>
              <Pressable style={styles.primaryAction} onPress={handleCopyLink}>
                <Link2 size={15} color={Theme.textOnPrimary} />
                <Text style={styles.primaryActionText}>Copy invite link</Text>
              </Pressable>
              <View style={styles.secondaryActionsRow}>
                <Pressable style={styles.secondaryAction} onPress={handleCopyCode}>
                  <Copy size={13} color={Theme.textPrimaryDark} />
                  <Text style={styles.secondaryActionText}>Copy code</Text>
                </Pressable>
                <Pressable style={styles.secondaryAction} onPress={handleShareWhatsApp}>
                  <MessageCircle size={13} color={Theme.textPrimaryDark} />
                  <Text style={styles.secondaryActionText}>WhatsApp</Text>
                </Pressable>
              </View>
              {copiedLabel ? <Text style={styles.copiedHint}>{copiedLabel}</Text> : null}
            </View>
          ) : (
            <Text style={styles.emptyBody}>Couldn't load your referral code.</Text>
          )}

          <View style={styles.rewardRow}>
            <Coins size={13} color={Theme.accentGold} />
            <Text style={styles.rewardText}>+500 each on verification</Text>
          </View>

          <Text style={styles.sectionHeader}>Referral activity</Text>
          {referralsQ.isLoading ? (
            <ActivityIndicator color={Theme.primary} />
          ) : (referralsQ.data ?? []).length === 0 ? (
            <Text style={styles.emptyBody}>No referrals yet.</Text>
          ) : (
            <View style={styles.referralList}>
              {(referralsQ.data ?? []).map((r: ReferralRow) => {
                const isReferrer = r.referrer_org_id === orgId;
                const name = isReferrer ? r.referred_org_name : r.referrer_org_name;
                return (
                  <View key={r.id} style={styles.referralRow}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.referralOrgName} numberOfLines={1}>
                        {name ?? "Organization"}
                      </Text>
                      <Text style={styles.referralRole}>
                        {isReferrer ? "You invited them" : "They invited you"}
                      </Text>
                    </View>
                    <Text style={[styles.referralStatus, { color: statusColor(r.status) }]}>
                      {statusLabel(r.status)}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}
        </View>
      </View>
      <ReachCampaignStoryPopup
        visible={Boolean(popupCampaign)}
        campaign={popupCampaign}
        plan={popupCampaign ? planById.get(popupCampaign.plan_id) : undefined}
        orgName={organization?.name ?? "Your org"}
        tripCampaignIds={popupRelatedIds}
        onClose={() => setPopupCampaignId(null)}
        onViewStory={
          popupCampaign?.post_id && popupCampaign.org_id
            ? () => {
                setPopupCampaignId(null);
                router.push({
                  pathname: "/(modals)/story-detail",
                  params: {
                    postId: popupCampaign.post_id,
                    orgId: popupCampaign.org_id,
                    storyType: classifyStoredPostType(
                      popupCampaign.snapshot_post_type,
                      popupCampaign.snapshot_content,
                    ),
                  },
                });
              }
            : undefined
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  workspace: { flex: 1, minHeight: 0, gap: 10 },
  kpiStrip: {
    flexDirection: "row",
    backgroundColor: Theme.cardWhite,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Theme.actionBtnGhostBorder,
    overflow: "hidden",
  },
  kpiCell: { flex: 1, minWidth: 0, paddingHorizontal: 14, paddingVertical: 12, gap: 4 },
  kpiCellBorder: {
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: Theme.borderLight,
  },
  kpiLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: Theme.textMuted,
  },
  kpiValue: {
    fontSize: 20,
    fontWeight: "800",
    color: Theme.actionBtnInk,
    letterSpacing: -0.3,
    fontVariant: ["tabular-nums"],
  },
  kpiUnit: { fontSize: 12, fontWeight: "600", color: Theme.textMuted },
  split: { flex: 1, minHeight: 0, flexDirection: "row", gap: 10 },
  splitMobile: { flexDirection: "column" },
  listPane: {
    flex: 1.3,
    minWidth: 0,
    minHeight: 0,
    backgroundColor: Theme.cardWhite,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Theme.actionBtnGhostBorder,
    overflow: "hidden",
  },
  listPaneMobile: { flex: 1, minHeight: 280 },
  sidePane: {
    flex: 0.9,
    minWidth: 280,
    maxWidth: 420,
    backgroundColor: Theme.cardWhite,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Theme.actionBtnGhostBorder,
    padding: 14,
    gap: 10,
  },
  sidePaneMobile: { maxWidth: "100%", minWidth: 0, flex: 0 },
  paneHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
  },
  paneTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: Theme.actionBtnInk,
    letterSpacing: -0.2,
  },
  paneCount: { fontSize: 11, fontWeight: "600", color: Theme.textMuted },
  listScroll: { flex: 1, minHeight: 0 },
  listContent: { padding: 8, gap: 6, flexGrow: 1 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Theme.actionBtnGhostBorder,
    backgroundColor: Theme.screenBackground,
    ...Platform.select({
      web: { cursor: "pointer" } as object,
      default: {},
    }),
  },
  rowMain: { flex: 1, minWidth: 0, gap: 2 },
  rowTitle: { fontSize: 13, fontWeight: "700", color: Theme.actionBtnInk },
  rowId: { fontSize: 11, fontWeight: "600", color: Theme.textPrimaryDark },
  rowMeta: { fontSize: 11, fontWeight: "500", color: Theme.textMuted },
  rowAside: { alignItems: "flex-end", flexShrink: 0, gap: 2 },
  rowPlan: { fontSize: 12, fontWeight: "700", color: Theme.primary },
  rowSpend: {
    fontSize: 13,
    fontWeight: "800",
    color: Theme.actionBtnInk,
    fontVariant: ["tabular-nums"],
  },
  txnHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 10,
    paddingBottom: 4,
  },
  txnHeadCell: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: Theme.textMuted,
  },
  txnGrow: { flex: 1, minWidth: 0 },
  txnAmt: { width: 92, textAlign: "right" },
  txnAmtValue: {
    width: 92,
    textAlign: "right",
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textMuted,
    fontVariant: ["tabular-nums"],
  },
  txnDebit: { color: Theme.actionBtnInk },
  intro: { fontSize: 12, fontWeight: "500", color: Theme.textSecondary, lineHeight: 18 },
  codeCard: { gap: 8 },
  codeLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  codeValue: {
    fontSize: 22,
    fontWeight: "800",
    color: Theme.actionBtnInk,
    letterSpacing: 1,
  },
  primaryAction: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 40,
    borderRadius: 8,
    backgroundColor: Theme.textPrimaryDark,
  },
  primaryActionText: { fontSize: 13, fontWeight: "800", color: Theme.textOnPrimary },
  secondaryActionsRow: { flexDirection: "row", gap: 8 },
  secondaryAction: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: 36,
    borderRadius: 8,
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  secondaryActionText: { fontSize: 12, fontWeight: "700", color: Theme.textPrimaryDark },
  copiedHint: { fontSize: 11, fontWeight: "600", color: Theme.success, textAlign: "center" },
  rewardRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Theme.accentGoldMuted,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  rewardText: { fontSize: 11, fontWeight: "700", color: Theme.textPrimaryDark, flexShrink: 1 },
  sectionHeader: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  referralList: { gap: 6 },
  referralRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
  },
  referralOrgName: { fontSize: 13, fontWeight: "700", color: Theme.actionBtnInk },
  referralRole: { fontSize: 11, fontWeight: "500", color: Theme.textMuted },
  referralStatus: { fontSize: 11, fontWeight: "800" },
  emptyWrap: { alignItems: "center", paddingVertical: 32, gap: 4 },
  emptyTitle: { fontSize: 14, fontWeight: "700", color: Theme.actionBtnInk },
  emptyBody: { fontSize: 12, color: Theme.textMuted, textAlign: "center", lineHeight: 17 },
});
