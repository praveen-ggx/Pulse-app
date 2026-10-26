/**
 * Opportunities (Boost V2) — the fleet owner isn't processing referrals,
 * they're evaluating business opportunities recommended by their drivers.
 * This is the conversion surface: priority-scored cards (simple heuristics —
 * driver trip history + recommendation track record), structured driver
 * intent, and Approve → PRE-FILLED bid (driver's suggested rate + note carry
 * into the normal bid flow; the fleet owner only edits if needed).
 * Employed drivers recommend; independent drivers bid directly and never
 * appear here.
 */
import { HubMobileUnderlineTab, hubMobileChromeStyles } from "@/components/hub";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { useOrganization } from "@/contexts/OrganizationContext";
import {
  REACH_REFERRAL_REASON_LABELS,
  type ReachReferralInboxRow,
} from "@/features/reach/services/driverReferrals.service";
import { scoreOpportunity } from "@/features/reach/utils/opportunityScore";
import {
  useDecideReachReferralMutation,
  useReachReferralInboxQuery,
} from "@/lib/queries/useReachCampaignsQuery";
import { formatINR } from "@/lib/format";
import { formatStoryDate } from "@/features/network/utils/storyDisplay";
import { ROUTES } from "@/lib/routes";
import { useRouter } from "expo-router";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Inbox,
  MapPin,
  Star,
  Tag,
  UserRound,
  X,
} from "lucide-react-native";
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
import { useSafeAreaInsets } from "react-native-safe-area-context";

const DESKTOP_BREAKPOINT = 1024;
const CONTENT_MAX_WIDTH = 760;

const PENDING_STATUSES = new Set(["recommended"]);

function statusPill(status: string): { label: string; bg: string; border: string; text: string } {
  switch (status) {
    case "approved":
      return { label: "Approved", bg: Theme.positiveMuted, border: Theme.networkHubListCardConnectedBorder, text: Theme.success };
    case "bid_submitted":
      return { label: "Bid Submitted", bg: Theme.brandBlueWash, border: Theme.borderLight, text: Theme.primary };
    case "rewarded":
      return { label: "Trip Won · Rewarded", bg: Theme.positiveMuted, border: Theme.networkHubListCardConnectedBorder, text: Theme.success };
    case "rejected":
      return { label: "Rejected", bg: Theme.surface, border: Theme.borderLight, text: Theme.textMuted };
    case "expired":
      return { label: "Expired", bg: Theme.surface, border: Theme.borderLight, text: Theme.textMuted };
    default:
      return { label: "Pending", bg: Theme.accentGoldMuted, border: Theme.accentGoldBorder, text: Theme.accentGoldPressed };
  }
}

export default function ReachRecommendationInboxScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === "web" && width >= DESKTOP_BREAKPOINT;
  const { currentOrganization: organization } = useOrganization();
  const orgId = organization?.id ?? null;

  const inboxQ = useReachReferralInboxQuery(orgId);
  const decideMutation = useDecideReachReferralMutation();
  const [tab, setTab] = useState<"pending" | "decided">("pending");
  const [decidingId, setDecidingId] = useState<string | null>(null);

  const rows = inboxQ.data ?? [];
  // Pending sorted by priority score (best opportunity first), then recency.
  const pending = useMemo(
    () =>
      rows
        .filter((r) => PENDING_STATUSES.has(r.status))
        .sort((a, b) => scoreOpportunity(b).stars - scoreOpportunity(a).stars),
    [rows],
  );
  const decided = useMemo(() => rows.filter((r) => !PENDING_STATUSES.has(r.status)), [rows]);
  const visible = tab === "pending" ? pending : decided;

  const handleDecide = async (referral: ReachReferralInboxRow, approve: boolean) => {
    if (!orgId) return;
    setDecidingId(referral.id);
    const { error } = await decideMutation.mutateAsync({
      referralId: referral.id,
      approve,
      fleetOrgId: orgId,
    });
    setDecidingId(null);
    if (error) {
      Alert.alert("Couldn't update recommendation", error.message);
    }
  };

  /** Approve → PRE-FILLED bid: the driver's suggested rate + note ride along
   * as query params so the bid sheet opens ready to submit. */
  const openStoryToBid = (referral: ReachReferralInboxRow) => {
    if (!referral.post_id) return;
    let url: string = ROUTES.storyDetail(referral.post_id, referral.campaign_org_id, "LOAD");
    const prefill = new URLSearchParams({ referralId: referral.id });
    if (referral.suggested_rate && referral.suggested_rate > 0) {
      prefill.set("suggestedRate", String(Math.round(referral.suggested_rate)));
    }
    if (referral.note) prefill.set("refNote", referral.note);
    url = `${url}&${prefill.toString()}`;
    router.push(url as never);
  };

  const renderCard = (referral: ReachReferralInboxRow) => {
    const pill = statusPill(referral.status);
    const isPending = referral.status === "recommended";
    const isApproved = referral.status === "approved";
    const busy = decidingId === referral.id;
    const title = referral.snapshot_material?.trim() || referral.snapshot_title?.trim() || "Load";
    const hasRoute = !!referral.snapshot_origin && !!referral.snapshot_destination;
    const score = scoreOpportunity(referral);

    return (
      <View key={referral.id} style={styles.card}>
        <View style={styles.cardTop}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.cardTitle} numberOfLines={1}>{title}</Text>
            {hasRoute ? (
              <View style={styles.routeRow}>
                <MapPin size={11} color={Theme.textMuted} />
                <Text style={styles.routeText} numberOfLines={1}>
                  {referral.snapshot_origin} → {referral.snapshot_destination}
                </Text>
              </View>
            ) : null}
          </View>
          <View style={[styles.statusPill, { backgroundColor: pill.bg, borderColor: pill.border }]}>
            <Text style={[styles.statusPillText, { color: pill.text }]}>{pill.label}</Text>
          </View>
        </View>

        {/* Priority score — simple heuristics (trips + track record), AI later */}
        <View style={styles.scoreRow}>
          <View style={styles.starsRow}>
            {[1, 2, 3, 4, 5].map((i) => (
              <Star
                key={i}
                size={11}
                color={i <= score.stars ? Theme.accentGold : Theme.borderMedium}
                fill={i <= score.stars ? Theme.accentGold : "transparent"}
              />
            ))}
          </View>
          <Text style={styles.scoreConfidence}>{score.confidence}</Text>
          <Text style={styles.scoreDetail} numberOfLines={1}>
            {referral.driver_trips_completed} trips
            {score.successRate != null ? ` · ${score.successRate}% success` : ""}
          </Text>
        </View>

        <View style={styles.driverRow}>
          <View style={styles.driverAvatar}>
            <UserRound size={12} color={Theme.textSecondary} />
          </View>
          <Text style={styles.driverName} numberOfLines={1}>
            {referral.driver_name}
          </Text>
          {referral.reason ? (
            <View style={styles.reasonChip}>
              <Tag size={9} color={Theme.textSecondary} />
              <Text style={styles.reasonChipText}>
                {REACH_REFERRAL_REASON_LABELS[referral.reason]}
              </Text>
            </View>
          ) : null}
          <Text style={styles.timeText}>{formatStoryDate(referral.created_at)}</Text>
        </View>

        {referral.suggested_rate && referral.suggested_rate > 0 ? (
          <View style={styles.suggestedRateRow}>
            <Text style={styles.suggestedRateLabel}>Driver's suggested rate</Text>
            <Text style={styles.suggestedRateValue}>
              {formatINR(Math.round(referral.suggested_rate))}
            </Text>
          </View>
        ) : null}

        {referral.note ? (
          <Text style={styles.noteText} numberOfLines={3}>
            “{referral.note}”
          </Text>
        ) : null}

        {referral.reward_amount > 0 ? (
          <View style={styles.rewardStrip}>
            <Text style={styles.rewardStripText}>
              Driver earns {formatINR(referral.reward_amount)} if this converts to a trip — paid
              by the campaign owner's escrow, not by you.
            </Text>
          </View>
        ) : null}

        {isPending ? (
          <View style={styles.actionRow}>
            <Pressable
              style={[styles.approveBtn, busy && styles.btnDisabled]}
              disabled={busy}
              onPress={() => handleDecide(referral, true)}
            >
              {busy ? (
                <ActivityIndicator size="small" color={Theme.buttonPrimaryText} />
              ) : (
                <>
                  <Check size={13} color={Theme.buttonPrimaryText} strokeWidth={3} />
                  <Text style={styles.approveBtnText}>Approve</Text>
                </>
              )}
            </Pressable>
            <Pressable
              style={[styles.rejectBtn, busy && styles.btnDisabled]}
              disabled={busy}
              onPress={() => handleDecide(referral, false)}
            >
              <X size={13} color={Theme.textSecondary} strokeWidth={2.5} />
              <Text style={styles.rejectBtnText}>Reject</Text>
            </Pressable>
          </View>
        ) : isApproved ? (
          referral.post_id ? (
            <Pressable style={styles.bidBtn} onPress={() => openStoryToBid(referral)}>
              <Text style={styles.bidBtnText}>
                {referral.suggested_rate && referral.suggested_rate > 0
                  ? `Bid ${formatINR(Math.round(referral.suggested_rate))} (pre-filled)`
                  : "Review & Submit Bid"}
              </Text>
              <ArrowRight size={13} color={Theme.buttonPrimaryText} strokeWidth={2.5} />
            </Pressable>
          ) : (
            <Text style={styles.goneText}>Original story is no longer available.</Text>
          )
        ) : null}
      </View>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={[hubMobileChromeStyles.shell, styles.hubHeader]}>
        <View style={hubMobileChromeStyles.screenHeaderRow}>
          <Pressable
            style={styles.hubBackBtn}
            onPress={() => router.back()}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <ArrowLeft size={20} color={Theme.textPrimaryDark} />
          </Pressable>
          <Text style={hubMobileChromeStyles.screenTitle} numberOfLines={1}>
            Opportunities
          </Text>
          <View style={styles.headerBadge}>
            <Inbox size={12} color={Theme.textSecondary} />
            <Text style={styles.headerBadgeText}>{pending.length} pending</Text>
          </View>
        </View>
        <View style={hubMobileChromeStyles.tabHeaderRow}>
          <HubMobileUnderlineTab
            label={`Pending ${pending.length}`}
            isActive={tab === "pending"}
            onPress={() => setTab("pending")}
          />
          <HubMobileUnderlineTab
            label={`Decided ${decided.length}`}
            isActive={tab === "decided"}
            onPress={() => setTab("decided")}
          />
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 32 },
          isDesktop && styles.scrollContentDesktop,
        ]}
        showsVerticalScrollIndicator={false}
      >
        {inboxQ.isLoading ? (
          <View style={styles.emptyWrap}>
            <ActivityIndicator color={Theme.primary} />
          </View>
        ) : inboxQ.isError ? (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyBody}>
              Couldn't load opportunities: {(inboxQ.error as Error)?.message ?? "unknown error"}
            </Text>
          </View>
        ) : visible.length === 0 ? (
          <View style={styles.emptyWrap}>
            <View style={styles.emptyIcon}>
              <Inbox size={20} color={Theme.textMuted} />
            </View>
            <Text style={styles.emptyTitle}>
              {tab === "pending" ? "No pending opportunities" : "Nothing decided yet"}
            </Text>
            <Text style={styles.emptyBody}>
              When your drivers spot a boosted load worth taking, it lands here as a business
              opportunity — you keep full control of pricing and bidding.
            </Text>
          </View>
        ) : (
          visible.map(renderCard)
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.screenBackground },
  header: {
    backgroundColor: Theme.networkGlassSurface,
    borderBottomWidth: 1,
    borderBottomColor: Theme.networkCardBorder,
    paddingBottom: 12,
    paddingHorizontal: Layout.screenPaddingHorizontal,
  },
  headerInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    width: "100%",
    maxWidth: CONTENT_MAX_WIDTH,
    alignSelf: "center",
  },
  backBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { fontSize: 15, fontWeight: "900", color: Theme.textPrimaryDark },
  headerSub: { fontSize: 10, fontWeight: "600", color: Theme.textMuted, marginTop: 1 },
  hubHeader: {
    paddingBottom: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
  },
  hubBackBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Theme.surface,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  headerBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  headerBadgeText: { fontSize: 10, fontWeight: "800", color: Theme.textSecondary },

  scrollContent: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 14,
    gap: 10,
    width: "100%",
    maxWidth: CONTENT_MAX_WIDTH,
    alignSelf: "center",
  },
  scrollContentDesktop: { paddingTop: 20 },

  tabsRow: {
    flexDirection: "row",
    gap: 6,
    padding: 3,
    borderRadius: 12,
    backgroundColor: Theme.surfaceGray,
    alignSelf: "flex-start",
  },
  tabBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 10 },
  tabBtnActive: { backgroundColor: Theme.cardWhite },
  tabText: { fontSize: 11, fontWeight: "700", color: Theme.textMuted },
  tabTextActive: { color: Theme.textPrimaryDark },

  card: {
    borderRadius: 14,
    backgroundColor: Theme.networkCardBackground,
    borderWidth: 1,
    borderColor: Theme.networkCardBorder,
    padding: 12,
    gap: 8,
  },
  cardTop: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  cardTitle: { fontSize: 13, fontWeight: "800", color: Theme.textPrimaryDark },
  routeRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  routeText: { fontSize: 11, fontWeight: "600", color: Theme.textSecondary, flexShrink: 1 },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    flexShrink: 0,
  },
  statusPillText: { fontSize: 9, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.3 },

  scoreRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  starsRow: { flexDirection: "row", alignItems: "center", gap: 1.5 },
  scoreConfidence: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  scoreDetail: { flex: 1, minWidth: 0, fontSize: 9, fontWeight: "600", color: Theme.textMuted, textAlign: "right" },

  reasonChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 999,
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    flexShrink: 1,
  },
  reasonChipText: { fontSize: 9, fontWeight: "700", color: Theme.textSecondary },

  suggestedRateRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 10,
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  suggestedRateLabel: { fontSize: 10, fontWeight: "600", color: Theme.textSecondary },
  suggestedRateValue: {
    fontSize: 12,
    fontWeight: "900",
    color: Theme.textPrimaryDark,
    fontVariant: ["tabular-nums"],
  },

  driverRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  driverAvatar: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Theme.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  driverName: { flex: 1, minWidth: 0, fontSize: 11, fontWeight: "700", color: Theme.textPrimaryDark },
  timeText: { fontSize: 10, fontWeight: "600", color: Theme.textMuted },

  noteText: { fontSize: 11, fontWeight: "500", color: Theme.textSecondary, lineHeight: 16, fontStyle: "italic" },

  rewardStrip: {
    borderRadius: 10,
    backgroundColor: Theme.accentGoldMuted,
    borderWidth: 1,
    borderColor: Theme.accentGoldBorder,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  rewardStripText: { fontSize: 10, fontWeight: "600", color: Theme.textSecondary, lineHeight: 14 },

  actionRow: { flexDirection: "row", gap: 8, marginTop: 2 },
  approveBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: 40,
    borderRadius: 12,
    backgroundColor: Theme.buttonPrimary,
    borderWidth: Theme.buttonPrimaryBorderWidth,
    borderColor: Theme.buttonPrimaryBorder,
  },
  approveBtnText: { fontSize: 12, fontWeight: "800", color: Theme.buttonPrimaryText },
  rejectBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    minHeight: 40,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  rejectBtnText: { fontSize: 12, fontWeight: "700", color: Theme.textSecondary },
  btnDisabled: { opacity: 0.6 },
  bidBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: 40,
    borderRadius: 12,
    backgroundColor: Theme.buttonPrimary,
    borderWidth: Theme.buttonPrimaryBorderWidth,
    borderColor: Theme.buttonPrimaryBorder,
    marginTop: 2,
  },
  bidBtnText: { fontSize: 12, fontWeight: "800", color: Theme.buttonPrimaryText },
  goneText: { fontSize: 10, fontWeight: "600", color: Theme.textMuted },

  emptyWrap: { alignItems: "center", paddingVertical: 48, paddingHorizontal: 24, gap: 6 },
  emptyIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Theme.surface,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  emptyTitle: { fontSize: 13, fontWeight: "800", color: Theme.textPrimaryDark },
  emptyBody: {
    fontSize: 11,
    fontWeight: "500",
    color: Theme.textSecondary,
    textAlign: "center",
    lineHeight: 16,
    maxWidth: 380,
  },
});
