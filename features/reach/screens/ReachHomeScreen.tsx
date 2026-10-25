/**
 * Pulse Boost — Campaign Manager, aligned with Trips / Broadcast hub chrome.
 */
import {
  HubMobileListCanvas,
  HubMobileSearchRow,
  HubMobileUnderlineTab,
  hubMobileChromeStyles,
} from "@/components/hub";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { useOrganization } from "@/contexts/OrganizationContext";
import { ReachBillingPanel } from "@/features/reach/components/ReachBillingPanel";
import { ReachCampaignDetailPanel } from "@/features/reach/components/ReachCampaignDetailPanel";
import { ReachCampaignHubCard } from "@/features/reach/components/ReachCampaignHubCard";
import { ReachAboutPulseBoost } from "@/features/reach/components/ReachAboutPulseBoost";
import { ReachCreateCampaignSheet } from "@/features/reach/components/ReachCreateCampaignSheet";
import { indentCanBroadcastToPulseNetwork } from "@/features/network/utils/indentBroadcastEligibility.util";
import { classifyStoredPostType } from "@/features/network/utils/storyDisplay";
import {
  groupReachCampaignsByPool,
  indentCountForReachPool,
} from "@/features/reach/utils/reachCampaignPool.util";
import {
  useReachCampaignPurchasesQuery,
  useReachCampaignsQuery,
  useReachOrgSummaryQuery,
  useReachPlansQuery,
  useReachReferralInboxQuery,
} from "@/lib/queries/useReachCampaignsQuery";
import { useIndentsQuery } from "@/lib/queries/useIndentsQuery";
import { ROUTES } from "@/lib/routes";
import { useSafeBack } from "@/lib/useSafeBack";
import { useRouter } from "expo-router";
import { ArrowLeft, Inbox as InboxIcon, Plus, Rocket } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type ReelFilter = "active" | "history";
type StudioTab = "campaigns" | "credits";

interface ReachStudioScreenProps {
  initialReelFilter?: ReelFilter;
}

function storyFilterTone(kind: "active" | "history") {
  if (kind === "active") {
    return {
      bg: Theme.screenBackground,
      border: Theme.positive,
      text: Theme.positive,
      dot: Theme.positive,
      selectedBg: Theme.positive,
      selectedBorder: Theme.positive,
      selectedText: Theme.buttonDarkText,
      selectedDot: Theme.buttonDarkText,
    };
  }
  return {
    bg: Theme.screenBackground,
    border: Theme.brandBlueInk,
    text: Theme.brandBlueInk,
    dot: Theme.brandBlueInk,
    selectedBg: Theme.brandBlue,
    selectedBorder: Theme.brandBlueInk,
    selectedText: Theme.brandBlueInk,
    selectedDot: Theme.brandBlueInk,
  };
}

export default function ReachHomeScreen({
  initialReelFilter = "active",
}: ReachStudioScreenProps) {
  const router = useRouter();
  const goBack = useSafeBack(ROUTES.TABS.NETWORK);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 960;
  const { currentOrganization: organization } = useOrganization();
  const orgId = organization?.id ?? null;

  const summaryQ = useReachOrgSummaryQuery(orgId);
  const campaignsQ = useReachCampaignsQuery(orgId);
  const purchasesQ = useReachCampaignPurchasesQuery(orgId);
  const plansQ = useReachPlansQuery();
  const inboxQ = useReachReferralInboxQuery(orgId);
  const indentsQ = useIndentsQuery(orgId);
  const pendingRecommendations = (inboxQ.data ?? []).filter(
    (r) => r.status === "recommended",
  ).length;
  const summary = summaryQ.data;
  const allCampaigns = campaignsQ.data ?? [];
  const planById = new Map((plansQ.data ?? []).map((p) => [p.id, p]));

  const [reelFilter, setReelFilter] = useState<ReelFilter>(initialReelFilter);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [studioTab, setStudioTab] = useState<StudioTab>("campaigns");
  const [createOpen, setCreateOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);

  const allTripGroups = useMemo(() => {
    const purchases = purchasesQ.data ?? [];
    const allIndents = indentsQ.data ?? [];
    const openIndents = allIndents.filter(indentCanBroadcastToPulseNetwork);
    const indentById = new Map(allIndents.map((indent) => [indent.id, indent]));
    return groupReachCampaignsByPool(allCampaigns, indentById).map((camps) => {
      const activeOnes = camps.filter((c) => c.status === "active");
      const rankPool = activeOnes.length > 0 ? activeOnes : camps;
      const byRank = [...rankPool].sort((a, b) => {
        const pa = planById.get(a.plan_id)?.sort_order ?? 0;
        const pb = planById.get(b.plan_id)?.sort_order ?? 0;
        if (pa !== pb) return pb - pa;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
      const primary = byRank[0];
      const campaignIds = new Set(camps.map((c) => c.id));
      const tripPurchases = purchases.filter((p) => campaignIds.has(p.campaign_id));
      const planTimeline =
        tripPurchases.length > 0
          ? tripPurchases.map((p) => planById.get(p.plan_id)?.name ?? "Boost")
          : [planById.get(primary.plan_id)?.name ?? "Boost"];
      return {
        primary,
        campaignIds: camps.map((c) => c.id),
        indentCount: indentCountForReachPool(primary, openIndents, camps, indentById),
        bucket: (activeOnes.length > 0 ? "active" : "history") as ReelFilter,
        boostCount: Math.max(tripPurchases.length, camps.length),
        planTimeline,
      };
    });
  }, [allCampaigns, indentsQ.data, plansQ.data, purchasesQ.data]);

  const activeCount = allTripGroups.filter((g) => g.bucket === "active").length;
  const historyCount = allTripGroups.filter((g) => g.bucket === "history").length;

  const groups = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allTripGroups.filter((g) => {
      if (g.bucket !== reelFilter) return false;
      if (!q) return true;
      const c = g.primary;
      const hay = [
        c.snapshot_material,
        c.snapshot_origin,
        c.snapshot_destination,
        c.snapshot_vehicle_type,
        c.id,
        c.post_id,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [allTripGroups, reelFilter, search]);

  useEffect(() => {
    if (groups.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !groups.some((g) => g.primary.id === selectedId)) {
      setSelectedId(groups[0].primary.id);
    }
  }, [groups, selectedId]);

  const selectedGroup = groups.find((g) => g.primary.id === selectedId) ?? groups[0] ?? null;
  const selected = selectedGroup?.primary ?? null;

  const goBoost = () => setCreateOpen(true);
  const openSelectedStory = () => {
    if (!selected?.post_id || !selected.org_id) return;
    router.push({
      pathname: "/(modals)/story-detail",
      params: {
        postId: selected.post_id,
        orgId: selected.org_id,
        storyType: classifyStoredPostType(selected.snapshot_post_type, selected.snapshot_content),
      },
    });
  };

  const kpiCards = (
    <View style={styles.kpiStrip}>
      {(
        [
          {
            label: "Balance",
            value: (summary?.walletBalance ?? 0).toLocaleString(),
            unit: "credits",
          },
          { label: "Active", value: String(activeCount) },
          {
            label: "Impressions",
            value: (summary?.metrics.impressions ?? 0).toLocaleString(),
          },
          {
            label: "Bids",
            value: (summary?.metrics.bids ?? 0).toLocaleString(),
          },
        ] as const
      ).map((card, index) => (
        <View
          key={card.label}
          style={[styles.kpiCell, index > 0 && styles.kpiCellBorder]}
        >
          <Text style={styles.kpiLabel}>{card.label}</Text>
          <Text style={styles.kpiValue} numberOfLines={1}>
            {card.value}
            {"unit" in card && card.unit ? (
              <Text style={styles.kpiUnit}> {card.unit}</Text>
            ) : null}
          </Text>
        </View>
      ))}
    </View>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={[hubMobileChromeStyles.shell, styles.hubHeader]}>
        <View style={hubMobileChromeStyles.screenHeaderRow}>
          <Pressable
            onPress={goBack}
            style={styles.backBtn}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <ArrowLeft size={20} color={Theme.textPrimaryDark} />
          </Pressable>
          <View style={styles.titleBlock}>
            <Text style={hubMobileChromeStyles.screenTitle} numberOfLines={1}>
              Pulse Boost
            </Text>
            <Pressable
              onPress={() => setAboutOpen(true)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="What is Pulse Boost"
            >
              <Text style={styles.whatIsLink}>What is Pulse Boost?</Text>
            </Pressable>
          </View>
          <View style={styles.headerRight}>
            <Pressable
              style={styles.inboxHeaderBtn}
              onPress={() => router.push(ROUTES.REACH.INBOX as never)}
              accessibilityLabel="Opportunities — recommended by drivers"
            >
              <InboxIcon size={16} color={Theme.textPrimaryDark} />
              {pendingRecommendations > 0 ? (
                <View style={styles.inboxBadge}>
                  <Text style={styles.inboxBadgeText}>
                    {pendingRecommendations > 9 ? "9+" : pendingRecommendations}
                  </Text>
                </View>
              ) : null}
            </Pressable>
          </View>
        </View>
        <View style={hubMobileChromeStyles.tabHeaderRow}>
          {(
            [
              { key: "campaigns" as const, label: "Campaigns" },
              { key: "credits" as const, label: "Billing" },
            ] as const
          ).map((t) => (
            <HubMobileUnderlineTab
              key={t.key}
              label={t.label}
              isActive={studioTab === t.key}
              onPress={() => setStudioTab(t.key)}
            />
          ))}
        </View>
      </View>

      <View
        style={[
          styles.body,
          { paddingBottom: insets.bottom + 12 },
          isDesktop && styles.bodyDesktop,
        ]}
      >
        {studioTab !== "credits" ? (
          summaryQ.isLoading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator color={Theme.primary} />
            </View>
          ) : (
            kpiCards
          )
        ) : null}

        {studioTab === "credits" ? (
          <View style={styles.workspace}>
            <ReachBillingPanel
              walletBalance={summary?.walletBalance ?? 0}
              purchases={purchasesQ.data ?? []}
              campaigns={allCampaigns}
              plans={plansQ.data ?? []}
              purchasesLoading={purchasesQ.isLoading}
            />
          </View>
        ) : null}

        {studioTab === "campaigns" ? (
          <View style={[styles.workspace, isDesktop && styles.workspaceDesktop]}>
            <View style={[styles.listPanel, !isDesktop && styles.listPanelMobile]}>
              <View style={styles.listToolbar}>
                <View style={styles.filterTagRow} accessibilityRole="tablist">
                  {(
                    [
                      { id: "active" as const, label: `Active ${activeCount}` },
                      { id: "history" as const, label: `History ${historyCount}` },
                    ] as const
                  ).map((option) => {
                    const on = reelFilter === option.id;
                    const tone = storyFilterTone(option.id);
                    return (
                      <Pressable
                        key={option.id}
                        accessibilityRole="tab"
                        accessibilityState={{ selected: on }}
                        onPress={() => setReelFilter(option.id)}
                        style={[
                          styles.filterTag,
                          {
                            backgroundColor: on ? tone.selectedBg : tone.bg,
                            borderColor: on ? tone.selectedBorder : tone.border,
                          },
                        ]}
                      >
                        <View
                          style={[
                            styles.filterTagDot,
                            { backgroundColor: on ? tone.selectedDot : tone.dot },
                          ]}
                        />
                        <Text
                          style={[
                            styles.filterTagText,
                            { color: on ? tone.selectedText : tone.text },
                          ]}
                        >
                          {option.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                <View style={styles.searchGrow}>
                  <HubMobileSearchRow
                    value={search}
                    onChange={setSearch}
                    placeholder="Search campaigns, lanes, IDs…"
                    accessibilityLabel="Search campaigns"
                  />
                </View>
                <Pressable
                  style={styles.createBtn}
                  onPress={goBoost}
                  accessibilityRole="button"
                  accessibilityLabel="Create campaign"
                >
                  <Plus size={13} color={Theme.textOnPrimary} strokeWidth={2.4} />
                  <Text style={styles.createBtnText}>Create</Text>
                </Pressable>
              </View>

              <ScrollView
                style={styles.listScroll}
                contentContainerStyle={styles.listScrollContent}
                showsVerticalScrollIndicator={false}
              >
                {campaignsQ.isLoading ? (
                  <View style={styles.loadingWrap}>
                    <ActivityIndicator color={Theme.primary} />
                  </View>
                ) : groups.length === 0 ? (
                  <View style={styles.emptyPick}>
                    <Rocket size={36} color={Theme.textMuted} />
                    <Text style={styles.emptyTitle}>No campaigns yet</Text>
                    <Text style={styles.emptyBody}>
                      Boost a live load from Network. It will appear here with reach, bids, and
                      spend.
                    </Text>
                    <Pressable style={styles.emptyCta} onPress={goBoost}>
                      <Plus size={15} color={Theme.textOnPrimary} />
                      <Text style={styles.emptyCtaText}>Create campaign</Text>
                    </Pressable>
                  </View>
                ) : (
                  <HubMobileListCanvas style={styles.listStack}>
                    {groups.map(({ primary: c, campaignIds, indentCount }) => (
                      <ReachCampaignHubCard
                        key={c.id}
                        campaign={c}
                        plan={planById.get(c.plan_id)}
                        tripCampaignIds={campaignIds}
                        indentCount={indentCount}
                        selected={c.id === selected?.id}
                        onPress={() => setSelectedId(c.id)}
                      />
                    ))}
                  </HubMobileListCanvas>
                )}
              </ScrollView>
            </View>

            {isDesktop ? (
              <View style={styles.previewPane}>
                <ReachCampaignDetailPanel
                  campaign={selected}
                  plan={selected ? planById.get(selected.plan_id) : undefined}
                  orgName={organization?.name ?? "Your org"}
                  tripCampaignIds={selectedGroup?.campaignIds}
                  onViewStory={selected?.post_id ? openSelectedStory : undefined}
                />
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
      <ReachAboutPulseBoost visible={aboutOpen} onClose={() => setAboutOpen(false)} />
      <ReachCreateCampaignSheet
        visible={createOpen}
        orgId={orgId}
        campaigns={allCampaigns}
        onClose={() => setCreateOpen(false)}
        onCreated={(campaignId) => {
          setStudioTab("campaigns");
          setSelectedId(campaignId);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, minHeight: 0, backgroundColor: Theme.screenBackground },
  hubHeader: {
    paddingBottom: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
  },
  titleBlock: { flex: 1, minWidth: 0, gap: 2 },
  whatIsLink: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.primary,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Theme.surface,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    zIndex: 2,
    ...Platform.select({
      web: { cursor: "pointer" } as object,
      default: {},
    }),
  },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 0 },
  inboxHeaderBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Theme.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  inboxBadge: {
    position: "absolute",
    top: -3,
    right: -3,
    minWidth: 15,
    height: 15,
    borderRadius: 8,
    paddingHorizontal: 3,
    backgroundColor: Theme.negative,
    alignItems: "center",
    justifyContent: "center",
  },
  inboxBadgeText: { fontSize: 8, fontWeight: "800", color: Theme.textOnPrimary },
  createBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    backgroundColor: Theme.primary,
    paddingHorizontal: 14,
    minHeight: 36,
    borderRadius: 999,
    flexShrink: 0,
  },
  createBtnText: { fontSize: 12, fontWeight: "800", color: Theme.textOnPrimary },
  body: {
    flex: 1,
    minHeight: 0,
    paddingTop: 12,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    gap: 12,
  },
  bodyDesktop: {
    maxWidth: Layout.desktopHubMaxWidth,
    width: "100%",
    alignSelf: "center",
    paddingHorizontal: 24,
  },
  kpiStrip: {
    flexDirection: "row",
    alignItems: "stretch",
    backgroundColor: Theme.cardWhite,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    overflow: "hidden",
  },
  kpiCell: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 4,
  },
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
    color: Theme.textPrimaryDark,
    letterSpacing: -0.3,
    fontVariant: ["tabular-nums"],
  },
  kpiUnit: { fontSize: 11, fontWeight: "600", color: Theme.textMuted },
  workspace: { flex: 1, minHeight: 0, gap: 10 },
  workspaceDesktop: { flexDirection: "row", alignItems: "stretch" },
  listPanel: {
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: "42%",
    minWidth: 320,
    maxWidth: 560,
    minHeight: 0,
    backgroundColor: Theme.screenBackground,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Theme.actionBtnGhostBorder,
    overflow: "hidden",
  },
  listPanelMobile: {
    flex: 1,
    flexBasis: "auto",
    maxWidth: "100%",
    minWidth: 0,
  },
  listToolbar: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "nowrap",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
  },
  searchGrow: { flex: 1, minWidth: 0 },
  filterTagRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 4,
  },
  filterTag: {
    minHeight: 26,
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  filterTagDot: { width: 6, height: 6, borderRadius: 3 },
  filterTagText: { fontSize: 11, fontWeight: "700" },
  listScroll: { flex: 1, minHeight: 0 },
  listScrollContent: { flexGrow: 1, padding: 8, gap: 8 },
  listStack: { gap: 8 },
  previewPane: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
  },
  detailModal: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    gap: 12,
  },
  detailModalHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  detailModalTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
  },
  detailModalClose: { fontSize: 14, fontWeight: "700", color: Theme.primary },
  tabScroll: { flex: 1, minHeight: 0 },
  billingWrap: {
    maxWidth: 640,
    width: "100%",
    alignSelf: "center",
    paddingBottom: 16,
  },
  loadingWrap: { alignItems: "center", paddingVertical: 28 },
  emptyPick: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 48,
    paddingHorizontal: 24,
    gap: 8,
  },
  emptyTitle: { fontSize: 16, fontWeight: "800", color: Theme.textPrimaryDark, marginTop: 4 },
  emptyBody: {
    fontSize: 13,
    color: Theme.textRouteCard,
    textAlign: "center",
    lineHeight: 19,
    maxWidth: 360,
  },
  emptyCta: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Theme.textPrimaryDark,
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 11,
  },
  emptyCtaText: { fontSize: 13, fontWeight: "800", color: Theme.textOnPrimary },
});
