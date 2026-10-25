/**
 * Create campaign — pick a live story lane, then boost or upgrade inline.
 */
import {
  HubMobileListCanvas,
  hubGridColumnCount,
  hubGridItemStyle,
  hubMobileChromeStyles,
} from "@/components/hub";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { BroadcastPickIndentCard } from "@/features/network/components/BroadcastPickIndentCard";
import type { IndentStoryState } from "@/features/network/services/indentStoryPosts.service";
import type { PostRow } from "@/features/network/services/posts.service";
import {
  filterBroadcastLanesByStory,
  formatBroadcastLaneClientTitle,
  groupBroadcastIndentsByPool,
  laneHasActiveStory,
  type BroadcastPoolLane,
} from "@/features/network/utils/broadcastIndentPools.util";
import { indentCanBroadcastToPulseNetwork } from "@/features/network/utils/indentBroadcastEligibility.util";
import { CampaignUpgradePanel } from "@/features/reach/components/CampaignUpgradePanel";
import { ReachCampaignStoryPopup } from "@/features/reach/components/ReachCampaignStoryPopup";
import { ReachInlineBoostPanel } from "@/features/reach/components/ReachInlineBoostPanel";
import type { ReachCampaignRow } from "@/features/reach/services/campaigns.service";
import { findOrgDraftOrActiveCampaign } from "@/features/reach/utils/orgActiveBoost";
import { classifyStoredPostType } from "@/features/network/utils/storyDisplay";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useIndentsQuery } from "@/lib/queries/useIndentsQuery";
import { useReachPlansQuery } from "@/lib/queries/useReachCampaignsQuery";
import {
  useIndentStoryStatesQuery,
  useLiveOwnLoadStoriesQuery,
} from "@/lib/queries/usePostsQuery";
import { ROUTES } from "@/lib/routes";
import { useRouter } from "expo-router";
import { X } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

function livePostIdForLane(
  memberIds: readonly string[],
  storyStates: Record<string, IndentStoryState | undefined>,
  stories: readonly PostRow[],
): string | null {
  for (const id of memberIds) {
    const state = storyStates[id];
    if (state?.isLive && state.postId) return state.postId;
  }
  const set = new Set(memberIds);
  return stories.find((post) => post.source_indent_id && set.has(post.source_indent_id))?.id ?? null;
}

function campaignForLane(
  lane: BroadcastPoolLane<{ id: string }>,
  campaigns: readonly ReachCampaignRow[],
  storyStates: Record<string, IndentStoryState | undefined>,
  stories: readonly PostRow[] = [],
): ReachCampaignRow | null {
  const indentIds = new Set(lane.members.map((member) => member.id));
  const postIds = new Set<string>();
  for (const member of lane.members) {
    const postId = storyStates[member.id]?.postId;
    if (postId) postIds.add(postId);
  }
  for (const story of stories) {
    if (story.source_indent_id && indentIds.has(story.source_indent_id)) {
      postIds.add(story.id);
    }
  }
  return (
    campaigns.find((campaign) => {
      if (campaign.status !== "active" && campaign.status !== "draft") return false;
      if (campaign.post_id && postIds.has(campaign.post_id)) return true;
      const indentId = campaign.snapshot_source_indent_id?.trim();
      return Boolean(indentId && indentIds.has(indentId));
    }) ?? null
  );
}

type ReachCreateCampaignSheetProps = {
  visible: boolean;
  orgId: string | null;
  campaigns?: ReachCampaignRow[];
  onClose: () => void;
  onCreated?: (campaignId: string) => void;
};

export function ReachCreateCampaignSheet({
  visible,
  orgId,
  campaigns = [],
  onClose,
  onCreated,
}: ReachCreateCampaignSheetProps) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const router = useRouter();
  const columns = Math.min(2, hubGridColumnCount(width));
  const gridItem = hubGridItemStyle(columns);
  const isDesktop = width >= 960;

  const indentsQ = useIndentsQuery(visible ? orgId : null);
  const openIndents = useMemo(
    () => (indentsQ.data ?? []).filter(indentCanBroadcastToPulseNetwork),
    [indentsQ.data],
  );
  const openIds = useMemo(() => openIndents.map((indent) => indent.id), [openIndents]);
  const storiesQ = useLiveOwnLoadStoriesQuery(orgId, { enabled: visible && !!orgId });
  const { data: storyStates = {} } = useIndentStoryStatesQuery(
    visible ? orgId : null,
    openIds,
  );

  const [selectedPoolId, setSelectedPoolId] = useState<string | null>(null);
  const [popupCampaign, setPopupCampaign] = useState<ReachCampaignRow | null>(null);
  const { currentOrganization } = useOrganization();
  const plansQ = useReachPlansQuery();
  const planById = useMemo(
    () => new Map((plansQ.data ?? []).map((plan) => [plan.id, plan])),
    [plansQ.data],
  );

  const existing = findOrgDraftOrActiveCampaign(campaigns);
  const lanes = useMemo(() => {
    const grouped = groupBroadcastIndentsByPool(openIndents);
    return filterBroadcastLanesByStory(grouped, "active", storyStates);
  }, [openIndents, storyStates]);

  useEffect(() => {
    if (lanes.length === 0) {
      setSelectedPoolId(null);
      return;
    }
    if (!selectedPoolId || !lanes.some((lane) => lane.poolId === selectedPoolId)) {
      const liveLane = existing
        ? lanes.find((lane) =>
            campaignForLane(lane, campaigns, storyStates, storiesQ.data ?? []),
          )
        : null;
      setSelectedPoolId((liveLane ?? lanes[0]).poolId);
    }
  }, [lanes, selectedPoolId, existing, campaigns, storyStates]);

  const selectedLane = lanes.find((lane) => lane.poolId === selectedPoolId) ?? null;
  const selectedPostId = selectedLane
    ? livePostIdForLane(
        selectedLane.members.map((member) => member.id),
        storyStates,
        storiesQ.data ?? [],
      )
    : null;
  const selectedCampaign = selectedLane
    ? campaignForLane(selectedLane, campaigns, storyStates, storiesQ.data ?? [])
    : null;

  const resetAndClose = () => {
    setSelectedPoolId(null);
    setPopupCampaign(null);
    onClose();
  };

  const finish = (campaignId: string) => {
    resetAndClose();
    onCreated?.(campaignId);
  };

  const goNetwork = () => {
    resetAndClose();
    router.push(ROUTES.TABS.NETWORK as never);
  };

  const loading = indentsQ.isLoading || storiesQ.isLoading;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={resetAndClose}
    >
      <View style={[styles.shell, { paddingTop: insets.top }]}>
        <View style={[hubMobileChromeStyles.shell, styles.hubHeader]}>
          <View style={hubMobileChromeStyles.screenHeaderRow}>
            <Pressable
              onPress={resetAndClose}
              style={styles.iconBtn}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <X size={20} color={Theme.textPrimaryDark} />
            </Pressable>
            <Text style={hubMobileChromeStyles.screenTitle} numberOfLines={1}>
              Create campaign
            </Text>
            <View style={styles.iconBtn} />
          </View>
        </View>

        <View
          style={[
            styles.body,
            { paddingBottom: insets.bottom + 12 },
            isDesktop && styles.bodyDesktop,
          ]}
        >
          <View style={[styles.workspace, isDesktop && styles.workspaceDesktop]}>
            <View style={[styles.listPane, !isDesktop && styles.listPaneMobile]}>
              {loading ? (
                <ActivityIndicator color={Theme.primary} style={{ marginTop: 24 }} />
              ) : lanes.length === 0 ? (
                <View style={styles.empty}>
                  <Text style={styles.emptyTitle}>No active stories</Text>
                  <Text style={styles.emptyBody}>
                    Broadcast a load from Network first. Once the story is live, come back and
                    boost it.
                  </Text>
                  <Pressable style={styles.secondaryBtn} onPress={goNetwork}>
                    <Text style={styles.secondaryBtnText}>Go to Network</Text>
                  </Pressable>
                </View>
              ) : (
                <ScrollView
                  style={styles.scroll}
                  contentContainerStyle={styles.scrollContent}
                  showsVerticalScrollIndicator={false}
                >
                  <HubMobileListCanvas style={styles.grid}>
                    {lanes.map((lane) => {
                      const live = laneHasActiveStory(
                        lane.members.map((member) => member.id),
                        storyStates,
                      );
                      const laneCampaign = campaignForLane(
                        lane,
                        campaigns,
                        storyStates,
                        storiesQ.data ?? [],
                      );
                      const isUpgrade = Boolean(laneCampaign);
                      return (
                        <View key={lane.poolId} style={gridItem}>
                          <BroadcastPickIndentCard
                            load={lane.representative}
                            indentCount={lane.indentCount}
                            storyLive={live}
                            selected={selectedPoolId === lane.poolId}
                            bidCount={0}
                            hubGrid={columns > 1}
                            clientTitle={formatBroadcastLaneClientTitle(
                              lane.representative.client_name,
                              lane.extraClientCount,
                            )}
                            onPress={() => {
                              setSelectedPoolId(lane.poolId);
                              if (laneCampaign) setPopupCampaign(laneCampaign);
                            }}
                            onBoost={() => setSelectedPoolId(lane.poolId)}
                            boostLabel={isUpgrade ? "Upgrade" : "Boost"}
                          />
                        </View>
                      );
                    })}
                  </HubMobileListCanvas>
                </ScrollView>
              )}
            </View>

            <View style={styles.sidePane}>
              {orgId && selectedCampaign ? (
                <ScrollView
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={styles.sidePad}
                >
                  <Text style={styles.sideKicker}>Sponsored ad is live</Text>
                  <Text style={styles.sideTitle}>Upgrade this boost</Text>
                  <Text style={styles.sideBody}>
                    This lane is already boosted. Pay more to raise the tariff, or pick another
                    story and tap Boost to move the sponsored ad there.
                  </Text>
                  <CampaignUpgradePanel
                    orgId={orgId}
                    campaignId={selectedCampaign.id}
                    currentPlanId={selectedCampaign.plan_id}
                    publishedAt={selectedCampaign.published_at}
                    expiresAt={selectedCampaign.expires_at}
                    defaultExpanded
                  />
                </ScrollView>
              ) : !selectedLane ? (
                <View style={styles.empty}>
                  <Text style={styles.emptyTitle}>Select a story</Text>
                  <Text style={styles.emptyBody}>
                    Choose a live lane. Boost shares a sponsored ad to Network, Pulse outside
                    the network, and Pulse Pilot / DCO.
                  </Text>
                </View>
              ) : orgId && selectedPostId ? (
                <ReachInlineBoostPanel
                  orgId={orgId}
                  postId={selectedPostId}
                  replacesCampaignId={
                    existing && existing.id !== selectedCampaign?.id ? existing.id : null
                  }
                  onBoosted={finish}
                />
              ) : (
                <View style={styles.empty}>
                  <Text style={styles.emptyTitle}>Story not ready</Text>
                  <Text style={styles.emptyBody}>
                    This lane does not have a live story post yet. Broadcast it from Network first.
                  </Text>
                </View>
              )}
            </View>
          </View>
        </View>
      </View>
      <ReachCampaignStoryPopup
        visible={Boolean(popupCampaign)}
        campaign={popupCampaign}
        plan={popupCampaign ? planById.get(popupCampaign.plan_id) : undefined}
        orgName={currentOrganization?.name ?? "Your org"}
        tripCampaignIds={popupCampaign ? [popupCampaign.id] : undefined}
        onClose={() => setPopupCampaign(null)}
        onViewStory={
          popupCampaign?.post_id && popupCampaign.org_id
            ? () => {
                setPopupCampaign(null);
                resetAndClose();
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
    </Modal>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: Theme.screenBackground },
  hubHeader: {
    paddingBottom: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Theme.surface,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  body: {
    flex: 1,
    minHeight: 0,
    paddingTop: 12,
    paddingHorizontal: Layout.screenPaddingHorizontal,
  },
  bodyDesktop: {
    maxWidth: Layout.desktopHubMaxWidth,
    width: "100%",
    alignSelf: "center",
    paddingHorizontal: 24,
  },
  workspace: { flex: 1, minHeight: 0, gap: 10 },
  workspaceDesktop: { flexDirection: "row", alignItems: "stretch" },
  listPane: {
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: "52%",
    minWidth: 320,
    minHeight: 0,
  },
  listPaneMobile: { flex: 1, flexBasis: "auto", minWidth: 0 },
  sidePane: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
  },
  sidePad: {
    gap: 8,
    padding: 14,
    backgroundColor: Theme.cardWhite,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Theme.actionBtnGhostBorder,
  },
  sideKicker: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: Theme.textMuted,
  },
  sideTitle: { fontSize: 16, fontWeight: "800", color: Theme.actionBtnInk },
  sideBody: { fontSize: 12, fontWeight: "500", color: Theme.textSecondary, lineHeight: 17 },
  scroll: { flex: 1, minHeight: 0 },
  scrollContent: { paddingBottom: 8 },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "stretch",
    marginHorizontal: -6,
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 24,
  },
  emptyTitle: { fontSize: 16, fontWeight: "800", color: Theme.actionBtnInk, textAlign: "center" },
  emptyBody: {
    fontSize: 13,
    color: Theme.textMuted,
    textAlign: "center",
    lineHeight: 18,
  },
  secondaryBtn: {
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.actionBtnGhostBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryBtnText: { fontSize: 13, fontWeight: "700", color: Theme.textPrimaryDark },
});
