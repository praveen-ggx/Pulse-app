/**
 * Full-screen story viewer — Pulse "Mission" layout.
 * Own posts: show WhatsApp-style viewer list.
 * Other posts: show existing bid + edit bid flow.
 */
import { PulseStoryWatermark } from '@/components/brand/PulseStoryWatermark';
import { PartyAvatar } from "@/components/PartyAvatar";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import {
    getIndentDisplayNumber,
    getVisibleIndentById,
} from "@/features/indents/services/indents.service";
import { resolveCommercialOpportunity } from "@/features/marketplace/domain";
import { StoryBroadcastPreview } from "@/features/network/components/StoryBroadcastPreview";
import { StoryOwnerFooterActions } from "@/features/network/components/StoryDetailFooterActions";
import {
  StoryMobilePopupShell,
  useStoryPhonePopup,
} from "@/features/network/components/StoryMobilePopupShell";
import { StoryMessageSheet } from "@/features/network/components/StoryMessageSheet";
import { StoryViewersSheet } from "@/features/network/components/StoryViewersSheet";
import { BidSheet } from "@/features/network/components/bidding/BidSheet";
import { StoryOwnerBidsSheet } from "@/features/network/components/bidding/StoryOwnerBidsSheet";
import {
    getBidsForPosts,
    getDriverDirectBidsForPosts,
    type BidRow,
} from "@/features/network/services/bids.service";
import { getDirectQuotesByIndentIds } from "@/features/indents/services/direct-quotes.service";
import {
    deactivatePost,
    getOrganizationStoryBrand,
    getPostById,
    isPostVisibleForOrg,
    type PostRow,
} from "@/features/network/services/posts.service";
import {
    buildStoryOwnerBidRows,
    latestStoryOwnerBid,
    storyOwnerBidsLabel,
} from "@/features/network/utils/bidding/storyOwnerBids.util";
import {
    formatCapacityMaterial,
    formatStoryDate,
    loadMaterialLabel,
    storyHeadline,
    storyTypeLabel,
} from "@/features/network/utils/storyDisplay";
import {
    collapseStoriesByLane,
    indentCountForStory,
    laneMembersForPost,
} from "@/features/network/utils/storyLaneGroup.util";
import { isIndentStoryLive } from "@/features/network/utils/indentStoryWindow.util";
import { sameOrgId } from "@/features/network/utils/storyLoadVisibility.util";
import { positiveMoneyOrNull } from "@/lib/format";
import {
    buildStoryOwnerViewRows,
    storyOwnerViewsLabel,
    toStoryViewRows,
} from "@/features/network/utils/storyOwnerViews.util";
import { useVerifiedActionGuard } from "@/features/network/utils/verifiedActionGuard";
import { BoostProgressSheet } from "@/features/reach/components/BoostProgressSheet";
import { BoostSheet } from "@/features/reach/components/BoostSheet";
import { recordReachEvent } from "@/features/reach/services/events.service";
import { findOrgDraftOrActiveCampaign } from "@/features/reach/utils/orgActiveBoost";
import { confirmDialog } from "@/lib/confirmDialog";
import { useMyDirectQuotesQuery } from "@/lib/queries";
import { useMyBidQuery } from "@/lib/queries/useBidsQuery";
import { useInvalidateIndents } from "@/lib/queries/useIndentsQuery";
import { queryKeys } from "@/lib/queryKeys";
import { STALE } from "@/lib/queryClient";
import { useAfterPostDeleted, useInvalidatePosts, useLiveOwnLoadStoriesQuery, useNetworkFeedQuery } from "@/lib/queries/usePostsQuery";
import { useMarkReachCampaignSourceDeletedMutation, useReachCampaignsQuery } from "@/lib/queries/useReachCampaignsQuery";
import { useRecordStoryViewMutation, useStoryViewsQuery } from "@/lib/queries/useStoryViewsQuery";
import { ROUTES, buildPulseStoryPublicUrl } from "@/lib/routes";
import { useMemberAccess } from "@/lib/useMemberAccess";
import { useSafeBack } from "@/lib/useSafeBack";
import { useQuery } from "@tanstack/react-query";
import * as Linking from "expo-linking";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Sharing from "expo-sharing";
import {
    ArrowLeftRight,
    CheckCircle2,
    Clock3,
    Edit3,
    MapPin,
    MessageSquare,
    Rocket,
    Send,
    Sparkles,
    Trash2,
    Truck,
    X,
} from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Animated,
    Easing,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    View,
    useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const STORY_DURATION = 15000;
const INK = Theme.textPrimaryDark;
const MUTED = Theme.textSecondary;

const PALETTE = [
  "#4D3636", "#8b5cf6", "#ec4899", "#f43f5e",
  "#10b981", "#3b82f6", "#f59e0b", "#0ea5e9",
];
function seedColor(id: string | null | undefined): string {
  const key = (id ?? "").trim() || "fleet";
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h + key.charCodeAt(i)) % PALETTE.length;
  return PALETTE[h];
}

function timeAgo(d: string): string {
  const diff = Date.now() - new Date(d).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ── Progress segment ────────────────────────────────────────────────────────

function ProgressSegment({ index, current, progress }: { index: number; current: number; progress: Animated.Value }) {
  const width = progress.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"], extrapolate: "clamp" });
  if (index < current) return <View style={[ps.track, { flex: 1 }]}><View style={[ps.fill, { width: "100%" }]} /></View>;
  if (index === current) return <View style={[ps.track, { flex: 1 }]}><Animated.View style={[ps.fill, { width }]} /></View>;
  return <View style={[ps.track, { flex: 1 }]} />;
}

const ps = StyleSheet.create({
  track: { height: 3, backgroundColor: Theme.surfaceBorder, borderRadius: 2, overflow: "hidden" },
  fill: { height: "100%", backgroundColor: INK, borderRadius: 2 },
});

function StoryContentEntrance({
  storyKey,
  children,
}: {
  storyKey: string;
  children: React.ReactNode;
}) {
  const fade = useRef(new Animated.Value(0)).current;
  const rise = useRef(new Animated.Value(22)).current;

  useEffect(() => {
    fade.setValue(0);
    rise.setValue(22);
    Animated.parallel([
      Animated.timing(fade, {
        toValue: 1,
        duration: 380,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(rise, {
        toValue: 0,
        tension: 70,
        friction: 12,
        useNativeDriver: true,
      }),
    ]).start();
  }, [storyKey, fade, rise]);

  return (
    <Animated.View
      style={[entrance.wrap, { opacity: fade, transform: [{ translateY: rise }] }]}
      pointerEvents="none"
    >
      {children}
    </Animated.View>
  );
}

const entrance = StyleSheet.create({
  wrap: { width: "100%", alignItems: "center", gap: 0 },
});

// ── Main screen ─────────────────────────────────────────────────────────────

export default function StoryDetailScreen() {
  const router = useRouter();
  const closeStory = useSafeBack(ROUTES.TABS.NETWORK);
  const insets = useSafeAreaInsets();
  const { width: viewportWidth } = useWindowDimensions();
  const phonePopup = useStoryPhonePopup();
  /** Inside the phone-frame popup (or on real phones) always use mobile story metrics. */
  const isDesktopPreview = !phonePopup && viewportWidth >= 1024;
  const params = useLocalSearchParams<{
    orgId?: string;
    postId?: string;
    storyType?: string;
    queue?: string;
    /** Boost V2 pre-filled bid — driver's suggested rate + note from an
     * approved Opportunities recommendation. */
    suggestedRate?: string;
    refNote?: string;
  }>();
  const { currentOrganization } = useOrganization();
  const { status: authStatus } = useAuth();
  const myOrgId = currentOrganization?.id ?? "";
  const invalidatePosts = useInvalidatePosts(myOrgId);
  const invalidateIndents = useInvalidateIndents();
  const afterPostDeleted = useAfterPostDeleted(currentOrganization?.id ?? null);

  const feedQ = useNetworkFeedQuery(myOrgId);
  const allowLoadPosts = currentOrganization?.capabilities?.canBid ?? true;
  // Bidding needs the org capability AND the member's own bid surface. Kept
  // separate from `allowLoadPosts` so a member without the surface still *sees*
  // load posts in the feed — they just can't place a bid on them.
  const { can: canSurface } = useMemberAccess();
  const canBidAsMember = allowLoadPosts && canSurface("sales.marketplace.bid");
  const allPosts = useMemo(
    () => (feedQ.data ?? []).filter((post) => isPostVisibleForOrg(post, { allowLoadPosts })),
    [feedQ.data, allowLoadPosts],
  );

  const isBusinessPost = (p: PostRow) => p.type === "LOAD" || p.type === "VEHICLE_AVAILABILITY";

  const targetOrgId = params.orgId ?? "";
  const viewingOwnOrg = Boolean(myOrgId && targetOrgId && myOrgId === targetOrgId);
  const viewingOwnLoads =
    viewingOwnOrg &&
    (params.storyType === "LOAD" || params.storyType === "UPDATE" || !params.storyType);
  const liveOwnLoadsQ = useLiveOwnLoadStoriesQuery(myOrgId || null);

  const queueIds = useMemo(
    () => (params.queue ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    [params.queue],
  );
  const targetStoryType =
    params.storyType === "LOAD" || params.storyType === "VEHICLE_AVAILABILITY" ? params.storyType : null;

  const storiesByOrgType = allPosts.filter(
    (p) => p.organization_id === targetOrgId && isBusinessPost(p) && (targetStoryType ? p.type === targetStoryType : true),
  );
  const storiesFromQueue = useMemo(() => {
    if (queueIds.length === 0) return [];
    const byId = new Map(allPosts.map((p) => [p.id, p] as const));
    return queueIds.map((id) => byId.get(id)).filter((p): p is PostRow => !!p && isBusinessPost(p));
  }, [queueIds, allPosts]);
  const seedPost = allPosts.find((p) => p.id === params.postId && isBusinessPost(p));

  /**
   * Own LOAD preview: prefer live indent stories (same as green Pulse), not the
   * network-feed subset — feed can miss a live post or drop sponsored rows from
   * the Mine queue, which made 2 green icons collapse to 1 progress segment.
   */
  const liveOwnLoads = liveOwnLoadsQ.data ?? [];
  const ownLaneStories = useMemo(
    () => collapseStoriesByLane(liveOwnLoads),
    [liveOwnLoads],
  );
  const storyList: PostRow[] = useMemo(() => {
    const isLiveStory = (p: PostRow) =>
      p.type === "LOAD" ? isIndentStoryLive(p) : p.is_active !== false;
    const storiesForSeed = (seed: PostRow): PostRow[] => {
      if (sameOrgId(seed.organization_id, myOrgId) && ownLaneStories.length > 0) {
        return ownLaneStories;
      }
      const matched = allPosts.filter(
        (p) =>
          isBusinessPost(p) &&
          isLiveStory(p) &&
          sameOrgId(p.organization_id, seed.organization_id) &&
          p.type === seed.type &&
          !!p.is_sponsored === !!seed.is_sponsored,
      );
      return collapseStoriesByLane(matched);
    };
    const seeds = storiesFromQueue.length > 0 ? storiesFromQueue : seedPost ? [seedPost] : [];
    const seen = new Set<string>();
    const reel: PostRow[] = [];
    for (const seed of seeds) {
      for (const post of storiesForSeed(seed)) {
        if (!post.id || seen.has(post.id)) continue;
        seen.add(post.id);
        reel.push(post);
      }
    }
    if (reel.length > 0) return reel;
    if (viewingOwnLoads && ownLaneStories.length > 0) return ownLaneStories;
    if (storiesByOrgType.length > 0) return collapseStoriesByLane(storiesByOrgType);
    return seedPost ? [seedPost] : [];
  }, [
    allPosts,
    myOrgId,
    ownLaneStories,
    seedPost,
    storiesByOrgType,
    storiesFromQueue,
    viewingOwnLoads,
  ]);

  // Direct fetch by postId when feed cache is empty (e.g. opened via shared URL).
  const directPostQ = useQuery({
    queryKey: ["q", "posts", "direct", params.postId],
    queryFn: async () => {
      const { post } = await getPostById(params.postId!);
      return post;
    },
    enabled: Boolean(params.postId && storyList.length === 0),
    staleTime: 30_000,
  });
  const directPost = directPostQ.data ?? null;
  const resolvedStoryList: PostRow[] = storyList.length > 0 ? storyList : directPost ? [directPost] : [];
  const isLoadingPost =
    (storyList.length === 0 && directPostQ.isLoading) ||
    (viewingOwnLoads && liveOwnLoadsQ.isLoading && liveOwnLoads.length === 0 && storyList.length === 0);

  const [current, setCurrent] = useState(0);
  const [bidPost, setBidPost] = useState<PostRow | null>(null);
  const guardVerified = useVerifiedActionGuard();
  const [editBidMode, setEditBidMode] = useState(false);
  /** Snapshot so live myBid refresh cannot flip edit mode mid-celebration. */
  const [bidSheetExisting, setBidSheetExisting] = useState<BidRow | null>(null);
  const [deletingPostId, setDeletingPostId] = useState<string | null>(null);
  const [showViewers, setShowViewers] = useState(false);
  const [showBids, setShowBids] = useState(false);
  const [showBoost, setShowBoost] = useState(false);
  const [showBoostProgress, setShowBoostProgress] = useState(false);
  const [freshCampaignId, setFreshCampaignId] = useState<string | null>(null);
  /** Keeps story tap zones clear of the growing bid-status footer. */
  const [footerHeight, setFooterHeight] = useState(168);
  const progress = useRef(new Animated.Value(0)).current;
  const footerFade = useRef(new Animated.Value(0)).current;
  const animRef = useRef<Animated.CompositeAnimation | null>(null);
  const recordedViewsRef = useRef<Set<string>>(new Set());

  const goNext = useCallback(() => {
    if (current < resolvedStoryList.length - 1) { progress.setValue(0); setCurrent((c) => c + 1); }
    else closeStory();
  }, [current, resolvedStoryList.length, progress, closeStory]);

  const goPrev = useCallback(() => {
    if (current > 0) { progress.setValue(0); setCurrent((c) => c - 1); }
  }, [current, progress]);

  useEffect(() => {
    if (resolvedStoryList.length === 0) return;
    // Pause auto-advance while bidding so success returns to this story preview.
    if (bidPost != null) {
      if (animRef.current) animRef.current.stop();
      return;
    }
    if (animRef.current) animRef.current.stop();
    progress.setValue(0);
    animRef.current = Animated.timing(progress, {
      toValue: 1,
      duration: STORY_DURATION,
      easing: Easing.linear,
      useNativeDriver: false,
    });
    animRef.current.start(({ finished }) => {
      if (finished) goNext();
    });
    return () => {
      if (animRef.current) animRef.current.stop();
    };
  }, [current, resolvedStoryList.length, goNext, progress, bidPost]);

  const initialStoryIndex = useMemo(() => {
    const targetPostId = params.postId ?? "";
    if (!targetPostId || resolvedStoryList.length === 0) return 0;
    const idx = resolvedStoryList.findIndex((p) => p.id === targetPostId);
    return idx >= 0 ? idx : 0;
  }, [resolvedStoryList, params.postId]);

  useEffect(() => { setCurrent(initialStoryIndex); progress.setValue(0); }, [initialStoryIndex, progress]);

  const rawPost = resolvedStoryList[current];
  const currentPartyStories = useMemo(() => {
    if (!rawPost) return resolvedStoryList;
    return resolvedStoryList.filter(
      (p) =>
        sameOrgId(p.organization_id, rawPost.organization_id) &&
        p.type === rawPost.type &&
        !!p.is_sponsored === !!rawPost.is_sponsored,
    );
  }, [rawPost, resolvedStoryList]);
  const currentPartyIndex = Math.max(
    0,
    currentPartyStories.findIndex((p) => p.id === rawPost?.id),
  );
  const storyOrgId = (rawPost?.organization_id ?? params.orgId ?? "").trim();
  const orgBrandQ = useQuery({
    queryKey: queryKeys.posts.orgStoryBrand(storyOrgId),
    queryFn: async () => {
      const { brand } = await getOrganizationStoryBrand(
        storyOrgId,
        rawPost?.id,
      );
      return brand;
    },
    enabled: Boolean(storyOrgId),
    staleTime: STALE.slow,
  });
  const post = useMemo(() => {
    if (!rawPost) return rawPost;
    const own =
      myOrgId && rawPost.organization_id === myOrgId ? currentOrganization : null;
    const name = (
      orgBrandQ.data?.name ||
      rawPost.org_name ||
      own?.name ||
      ""
    ).trim();
    const logo =
      (orgBrandQ.data?.logoUrl || rawPost.org_avatar_url || own?.logo_url || "").trim() ||
      null;
    const seed =
      (orgBrandQ.data?.avatarSeed || rawPost.org_avatar_seed || own?.id || "").trim() ||
      null;
    return {
      ...rawPost,
      org_name: name,
      org_avatar_url: logo,
      org_avatar_seed: seed,
    };
  }, [
    rawPost,
    orgBrandQ.data,
    myOrgId,
    currentOrganization,
  ]);

  useEffect(() => {
    if (!post) return;
    footerFade.setValue(0);
    Animated.timing(footerFade, {
      toValue: 1,
      duration: 480,
      delay: 200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [post?.id, footerFade, post]);
  const linkedIndentQ = useQuery({
    queryKey: ["q", "indents", "story-target", myOrgId, post?.source_indent_id],
    queryFn: async () => {
      const { indent, error } = await getVisibleIndentById(
        myOrgId,
        post!.source_indent_id!,
      );
      if (error) throw error;
      return indent;
    },
    enabled: Boolean(myOrgId && post?.source_indent_id && post.type === "LOAD"),
    staleTime: 60_000,
  });
  const color = post ? seedColor(post.organization_id) : PALETTE[0];
  const isLoad = post?.type === "LOAD";
  const isVehicle = post?.type === "VEHICLE_AVAILABILITY";

  const isOwnPost = useMemo(() => !!myOrgId && !!post && post.organization_id === myOrgId, [myOrgId, post]);
  const ownerIndentCount = useMemo(() => {
    if (!isOwnPost || !isLoad || !post?.id) return 0;
    const fromLive = indentCountForStory(liveOwnLoads, post.id);
    if (fromLive > 0) return fromLive;
    return indentCountForStory(storiesByOrgType, post.id);
  }, [isOwnPost, isLoad, post?.id, liveOwnLoads, storiesByOrgType]);
  const myCampaignsQ = useReachCampaignsQuery(isOwnPost ? myOrgId : null);
  /** Org-level invariant — not post.reach_campaign_id (that missed other loads). */
  const orgActiveBoost = useMemo(
    () => findOrgDraftOrActiveCampaign(myCampaignsQ.data),
    [myCampaignsQ.data],
  );
  const activeCampaignForPost = useMemo(
    () =>
      myCampaignsQ.data?.find(
        (c) => c.post_id === post?.id && (c.status === "draft" || c.status === "active"),
      ) ?? null,
    [myCampaignsQ.data, post?.id],
  );
  const progressCampaignId =
    orgActiveBoost?.id ?? post?.reach_campaign_id ?? freshCampaignId ?? null;
  // Fetch bids whenever this is someone else's LOAD — commercial rules live in the resolver.
  const shouldFetchMyBid = Boolean(isLoad && !isOwnPost && myOrgId && post);
  const canContactVehicle = Boolean(isVehicle && !isOwnPost && myOrgId);
  const isDeletingCurrent = deletingPostId != null && deletingPostId === post?.id;

  // Fetch my existing bid on current post (for non-own load posts)
  const myBidQ = useMyBidQuery(shouldFetchMyBid ? (post?.id ?? null) : null, myOrgId || null);
  const myBid = myBidQ.data ?? null;
  const myQuotesQ = useMyDirectQuotesQuery(shouldFetchMyBid ? myOrgId : null);
  const myDirectQuote = useMemo(() => {
    const indentId = post?.source_indent_id;
    if (!indentId || !myQuotesQ.data?.length) return null;
    return myQuotesQ.data.find((q) => q.indent_id === indentId) ?? null;
  }, [myQuotesQ.data, post?.source_indent_id]);
  const counterOfferInr = useMemo(() => {
    const n = Number(myDirectQuote?.counter_amount ?? 0);
    const quotePending =
      (myBid?.status ?? myDirectQuote?.status ?? "").toLowerCase() === "pending";
    return quotePending && n > 0 ? n : null;
  }, [myBid?.status, myDirectQuote?.counter_amount, myDirectQuote?.status]);
  const submittedBidAmount = Number(myBid?.amount ?? myDirectQuote?.amount ?? 0);
  const hasSubmittedBid = Boolean(myBid || myDirectQuote);
  const bidStatus = (myBid?.status ?? myDirectQuote?.status ?? "pending").toLowerCase();
  const bidNote = myBid?.note ?? myDirectQuote?.notes ?? null;

  const commercialOpportunity = useMemo(
    () =>
      resolveCommercialOpportunity({
        viewerOrgId: myOrgId || null,
        ownerOrgId: post?.organization_id ?? "",
        isLoad: Boolean(isLoad),
        indentStatus: linkedIndentQ.data?.status ?? null,
        postIsActive: post?.is_active,
        bidCount: Math.max(post?.bid_count ?? 0, hasSubmittedBid ? 1 : 0),
        supplierTarget: linkedIndentQ.data?.supplier_target,
        rateOffer: post?.rate_offer,
        myBidAmount: submittedBidAmount > 0 ? submittedBidAmount : null,
        myBidStatus: hasSubmittedBid ? bidStatus : null,
        counterAmount: counterOfferInr,
        isSponsored: post?.is_sponsored,
        reachCampaignId: post?.reach_campaign_id ?? activeCampaignForPost?.id,
        hasActiveCampaign: Boolean(activeCampaignForPost),
        viewerCanBidCapability: canBidAsMember,
      }),
    [
      myOrgId,
      post?.organization_id,
      post?.is_active,
      post?.bid_count,
      post?.rate_offer,
      post?.is_sponsored,
      post?.reach_campaign_id,
      isLoad,
      linkedIndentQ.data?.status,
      linkedIndentQ.data?.supplier_target,
      hasSubmittedBid,
      submittedBidAmount,
      bidStatus,
      counterOfferInr,
      activeCampaignForPost,
      canBidAsMember,
    ],
  );
  const loadDisplayPrice = commercialOpportunity.pricing.displayPrice;
  const canBidOnLoad =
    commercialOpportunity.permissions.canBid ||
    commercialOpportunity.permissions.canEditBid ||
    commercialOpportunity.bidding.hasBid;

  // Record view (fire-and-forget, once per post per session)
  const recordView = useRecordStoryViewMutation();
  const recordViewMutate = recordView.mutate;
  useEffect(() => {
    // authStatus === 'restoring' means the session may not be durably attached
    // yet — recording now risks a stale-session 42501 (RLS insert denial).
    // Don't mark the ref until we've actually recorded, so this retries once
    // the session settles instead of silently skipping the view forever.
    if (!post || isOwnPost || !myOrgId || authStatus === "restoring") return;
    if (recordedViewsRef.current.has(post.id)) return;
    recordedViewsRef.current.add(post.id);
    if (__DEV__) console.log('[story-views] recording view for post', post.id, 'org', myOrgId);
    recordViewMutate({ postId: post.id, orgId: myOrgId, orgName: currentOrganization?.name ?? "" });
    // Reach "view" = story opened. "Impression" = feed placement, recorded
    // separately in StoryReel.tsx (see docs/REACH_DELIVERY_ENGINE_DESIGN.md,
    // "Current instrumentation gap") — the two used to fire together here,
    // which meant Impressions could never diverge from Views.
    if (post.is_sponsored && post.reach_campaign_id) {
      recordReachEvent(post.reach_campaign_id, "view", myOrgId);
    }
  }, [post?.id, post?.is_sponsored, post?.reach_campaign_id, isOwnPost, myOrgId, currentOrganization?.name, recordViewMutate, authStatus]);

  // Fetch viewers (own posts only)
  const viewsQ = useStoryViewsQuery(isOwnPost ? (post?.id ?? null) : null, isOwnPost);
  const views = viewsQ.data ?? [];

  const ownerIndentId =
    isOwnPost && isLoad ? (post?.source_indent_id ?? null) : null;
  const laneMembers = useMemo(
    () => laneMembersForPost(liveOwnLoads, post?.id),
    [liveOwnLoads, post?.id],
  );
  const lanePostIds = laneMembers.postIds.length > 0
    ? laneMembers.postIds
    : post?.id
      ? [post.id]
      : [];
  const laneIndentIds = laneMembers.indentIds.length > 0
    ? laneMembers.indentIds
    : ownerIndentId
      ? [ownerIndentId]
      : [];
  const lanePostKey = lanePostIds.slice().sort().join(",");
  const laneIndentKey = laneIndentIds.slice().sort().join(",");
  const laneBidsQ = useQuery({
    queryKey: ["q", "stories", "lane-bids", myOrgId, lanePostKey],
    queryFn: async () => {
      const { bids, error } = await getBidsForPosts(lanePostIds);
      if (error) throw error;
      return bids;
    },
    enabled: Boolean(isOwnPost && isLoad && lanePostIds.length > 0),
    staleTime: 15_000,
  });
  const laneDriverBidsQ = useQuery({
    queryKey: ["q", "stories", "lane-driver-bids", myOrgId, lanePostKey],
    queryFn: async () => {
      const { bids, error } = await getDriverDirectBidsForPosts(lanePostIds);
      if (error) throw error;
      return bids;
    },
    enabled: Boolean(isOwnPost && isLoad && lanePostIds.length > 0),
    staleTime: 15_000,
  });
  const laneQuotesQ = useQuery({
    queryKey: ["q", "stories", "lane-quotes", myOrgId, laneIndentKey],
    queryFn: async () => {
      const { quotes, error } = await getDirectQuotesByIndentIds(laneIndentIds);
      if (error) throw error;
      return quotes;
    },
    enabled: Boolean(isOwnPost && isLoad && laneIndentIds.length > 0),
    staleTime: 15_000,
  });
  const ownerBidRows = useMemo(
    () =>
      buildStoryOwnerBidRows(
        laneBidsQ.data ?? [],
        laneQuotesQ.data ?? [],
        laneDriverBidsQ.data ?? [],
      ),
    [laneBidsQ.data, laneQuotesQ.data, laneDriverBidsQ.data],
  );
  const latestLaneBid = useMemo(
    () => latestStoryOwnerBid(ownerBidRows),
    [ownerBidRows],
  );
  const ownerBidsLoading =
    laneBidsQ.isLoading || laneQuotesQ.isLoading || laneDriverBidsQ.isLoading;
  const ownerViewRows = useMemo(
    () => buildStoryOwnerViewRows(views, ownerBidRows),
    [views, ownerBidRows],
  );
  const ownerViewsLoading =
    viewsQ.isLoading || (ownerBidsLoading && views.length === 0);
  const indentDisplayLabel = linkedIndentQ.data
    ? getIndentDisplayNumber(linkedIndentQ.data)
    : null;

  const headline = post ? storyHeadline(post, Boolean(isLoad), Boolean(isVehicle)) : "";
  const loadMaterial = post && isLoad ? loadMaterialLabel(post, headline) : "";
  const capacityMaterial =
    post && isVehicle
      ? formatCapacityMaterial(post.material) || post.vehicle_type?.trim() || "Open capacity"
      : "";
  const capacityTargetRate = post && isVehicle ? positiveMoneyOrNull(post.rate_offer) : null;
  const availabilityLabel = useMemo(() => {
    if (!post || !isVehicle) return null;
    const first = post.content?.split("·")[0]?.trim();
    if (first) return first;
    if (post.load_date?.trim()) return post.load_date.trim();
    return null;
  }, [post, isVehicle]);
  const vehicleTypeHeadline = useMemo(() => (!post || !isVehicle) ? "" : post.vehicle_type?.trim().toUpperCase() || "VEHICLE", [post, isVehicle]);
  const vehicleAvailabilityText = useMemo(() => (!post || !isVehicle) ? "" : availabilityLabel || "Available now", [post, isVehicle, availabilityLabel]);
  const storyDateLabel = useMemo(() => post ? formatStoryDate(post.created_at) : "", [post]);
  const heroLabel = useMemo(() => (post ? storyTypeLabel(post.type) : ""), [post]);

  const markSourceDeletedMutation = useMarkReachCampaignSourceDeletedMutation();

  const handleDeletePost = useCallback(async () => {
    if (!post || !isOwnPost || isDeletingCurrent) return;
    const ok = activeCampaignForPost
      ? await confirmDialog({
          title: "Delete story?",
          message:
            "This story has an active Pulse Boost campaign.\n\nThe story will be removed, but your paid campaign continues:\n" +
            "• Delivery keeps running from the campaign snapshot\n" +
            "• Analytics and campaign history stay intact\n" +
            "• The campaign ends on its normal schedule\n\n" +
            "Deleting the story cannot be undone.",
          confirmLabel: "Delete",
          destructive: true,
        })
      : await confirmDialog({
          title: "Delete story?",
          message: "This story will be removed from your network broadcasts.",
          confirmLabel: "Delete",
          destructive: true,
        });
    if (!ok) return;
    setDeletingPostId(post.id);
    if (activeCampaignForPost) {
      // Transparency stamp only — the campaign is NOT cancelled. The customer
      // bought distribution; delivery continues from the campaign snapshot.
      await markSourceDeletedMutation.mutateAsync({
        campaignId: activeCampaignForPost.id,
        orgId: myOrgId,
      });
    }
    const { error } = await deactivatePost(post.id, myOrgId);
    setDeletingPostId(null);
    if (error) {
      Alert.alert("Could not delete", error.message);
      return;
    }
    await afterPostDeleted(post.id);
    closeStory();
  }, [post, isOwnPost, isDeletingCurrent, myOrgId, afterPostDeleted, closeStory, activeCampaignForPost, markSourceDeletedMutation]);

  const [showMessageSheet, setShowMessageSheet] = useState(false);

  const handleOpenMessage = useCallback(() => {
    if (!post || !myOrgId || isOwnPost) return;
    const partnerOrgId = (post.organization_id ?? "").trim();
    if (!partnerOrgId) {
      Alert.alert("Message", "Could not find this organization.");
      return;
    }
    // Stay on the story — navigating to /chat loads ChatScreen (~3k modules)
    // and freezes the browser ("Page Unresponsive") on web.
    setShowMessageSheet(true);
  }, [post, myOrgId, isOwnPost]);

  const handleShareWhatsApp = useCallback(async () => {
    if (!post || !myOrgId) return;
    const storyUrl = buildPulseStoryPublicUrl(post.id, myOrgId, post.type);
    const routeLabel =
      isLoad && post.origin && post.destination
        ? `${(post.origin || "—").toUpperCase()} → ${(post.destination || "—").toUpperCase()}`
        : post.content?.trim() || "Network Story";

    const message = `Load broadcast · ${routeLabel}\n\nView & bid:\n${storyUrl}`;
    try {
      const waUrl = `whatsapp://send?text=${encodeURIComponent(message)}`;
      const canOpen = await Linking.canOpenURL(waUrl);
      if (canOpen) {
        await Linking.openURL(waUrl);
      } else if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(storyUrl, { dialogTitle: message });
      } else {
        // Fallback for when Sharing is not available
        await Sharing.shareAsync(storyUrl, { dialogTitle: message });
      }
    } catch {
      await Sharing.shareAsync(storyUrl, { dialogTitle: message });
    }
  }, [post, myOrgId, isLoad]);


  if (!post) {
    return (
      <StoryMobilePopupShell onBackdropPress={closeStory}>
        <View style={[styles.container, { paddingTop: insets.top, paddingHorizontal: Layout.screenPaddingHorizontal }]}>
          <Pressable
            style={[styles.topBarIconBtn, { marginTop: 8, alignSelf: "flex-start" }]}
            onPress={closeStory}
          >
            <X size={16} color={INK} strokeWidth={2.25} />
          </Pressable>
          {isLoadingPost
            ? <ActivityIndicator size="large" color={Theme.primary} />
            : <Text style={{ color: Theme.textMuted, fontSize: 14, fontWeight: '500' }}>Story not found</Text>
          }
        </View>
      </StoryMobilePopupShell>
    );
  }

  return (
    <StoryMobilePopupShell onBackdropPress={closeStory}>
    <View style={styles.container}>
      {isLoad ? <View style={styles.ambientGlow} pointerEvents="none" /> : null}
      <View style={[styles.progressRow, { paddingTop: (phonePopup ? 12 : insets.top) + 8 }]}>
        {currentPartyStories.map((partyStory, i) => (
          <ProgressSegment
            key={partyStory.id ?? i}
            index={i}
            current={currentPartyIndex}
            progress={progress}
          />
        ))}
      </View>

      {/* Top bar */}
      <View style={[styles.topBar, isDesktopPreview && styles.topBarDesktop, { paddingHorizontal: Layout.screenPaddingHorizontal }]}>
        <View style={styles.topBarLeft}>
          <PartyAvatar
            name={(post.org_name ?? "").trim() || " "}
            organizationImageUrl={post.org_avatar_url}
            organizationAvatarSeed={post.org_avatar_seed}
            initialsColorSeed={post.organization_id ?? post.org_name}
            avatarSeed={post.org_avatar_seed}
            entityType="supplier"
            size={40}
            shape="circle"
          />
          <View style={styles.topBarText}>
            <View style={styles.orgBrandRow}>
              <Text style={[styles.orgTitle, (post.org_name ?? '').trim().toUpperCase() === "PULSE" && styles.orgTitlePulse]} numberOfLines={1}>
                {(post.org_name ?? "").trim()}
              </Text>
              {(post.org_name ?? '').trim().toUpperCase() === "PULSE" ? <View style={styles.pulseGreenDot} /> : null}
            </View>
            <View style={styles.topBarSubRow}>
              <Text style={styles.timeAgoLabel}>{timeAgo(post.created_at)}</Text>
              {post.is_sponsored ? (
                <Pressable
                  style={styles.sponsoredTag}
                  onPress={() =>
                    Alert.alert("Sponsored", "This load has been promoted through Pulse Boost.")
                  }
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityLabel="Why am I seeing this? This load has been promoted through Pulse Boost."
                >
                  <Rocket size={9} color={Theme.accentBrown} strokeWidth={2.25} />
                  <Text style={styles.sponsoredTagText}>Sponsored</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        </View>
        <View style={styles.topBarActions}>
          {isOwnPost ? (
            <Pressable
              style={({ pressed }) => [
                styles.topBarIconBtn,
                styles.topBarDeleteBtn,
                isDeletingCurrent && styles.topBarIconBtnDisabled,
                pressed && styles.topBarIconBtnPressed,
              ]}
              onPress={handleDeletePost}
              disabled={isDeletingCurrent}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel="Delete story"
            >
              <Trash2 size={14} color={Theme.teslaRed} strokeWidth={2.25} />
            </Pressable>
          ) : null}
          <Pressable
            style={({ pressed }) => [styles.topBarIconBtn, pressed && styles.topBarIconBtnPressed]}
            onPress={closeStory}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel="Close story"
          >
            <X size={16} color={INK} strokeWidth={2.25} />
          </Pressable>
        </View>
      </View>

      <View
        style={[styles.tapZones, { bottom: Math.max(footerHeight + 8, 140) }]}
        pointerEvents="box-none"
      >
        <Pressable style={styles.tapLeft} onPress={goPrev} />
        <Pressable style={styles.tapRight} onPress={goNext} />
      </View>

      {/* Center payload */}
      <View style={[styles.centerStage, isDesktopPreview && styles.centerStageDesktop]} pointerEvents="none">
        {isLoad && post.origin && post.destination ? (
          <StoryBroadcastPreview
            post={post}
            loadMaterial={loadMaterial}
            origin={post.origin}
            destination={post.destination}
            loadTargetRate={loadDisplayPrice}
            isDesktopPreview={isDesktopPreview}
            storyKey={post.id}
            indentCount={isOwnPost ? ownerIndentCount : 0}
            latestBid={isOwnPost ? latestLaneBid : null}
          />
        ) : isVehicle && post.origin ? (
          <StoryBroadcastPreview
            post={post}
            loadMaterial={capacityMaterial}
            origin={post.origin}
            destination={post.destination || "Anywhere"}
            loadTargetRate={capacityTargetRate}
            isDesktopPreview={isDesktopPreview}
            storyKey={post.id}
            kicker="Open capacity"
          />
        ) : (
          <StoryContentEntrance storyKey={post.id}>
            <View style={[styles.iconHero, isDesktopPreview && styles.iconHeroDesktop, { backgroundColor: color + "18" }]}>
              {isVehicle ? (
                <Truck size={isDesktopPreview ? 40 : 30} color={color} strokeWidth={1.8} />
              ) : (
                <Sparkles size={isDesktopPreview ? 40 : 30} color={color} strokeWidth={1.8} />
              )}
            </View>
            <Text style={[styles.kicker, isDesktopPreview && styles.kickerDesktop, { color }]}>{heroLabel}</Text>
            <Text style={[styles.heroTitle, isDesktopPreview && styles.heroTitleDesktop]} numberOfLines={6}>
              {isVehicle ? `${vehicleTypeHeadline} AVAILABLE` : headline}
            </Text>

            {isVehicle ? (
              <View style={[styles.vehicleAvailabilityBlock, isDesktopPreview && styles.vehicleAvailabilityBlockDesktop]}>
                <View style={styles.vehicleAvailabilityLine}>
                  <Clock3 size={14} color={MUTED} />
                  <Text style={[styles.vehicleAvailabilityText, isDesktopPreview && styles.vehicleAvailabilityTextDesktop]}>
                    {vehicleAvailabilityText}
                  </Text>
                </View>
                {storyDateLabel ? (
                  <Text style={[styles.vehicleDateText, isDesktopPreview && styles.vehicleDateTextDesktop]}>
                    {storyDateLabel}
                  </Text>
                ) : null}
              </View>
            ) : null}

            {isVehicle ? (
              <View style={[styles.vehicleLocationsCard, isDesktopPreview && styles.vehicleLocationsCardDesktop]}>
                <View style={styles.vehicleLocationRow}>
                  <MapPin size={13} color={color} />
                  <Text style={styles.vehicleLocationLabel}>Vehicle location:</Text>
                  <Text style={styles.vehicleLocationValue} numberOfLines={1}>
                    {post.origin?.trim() || "Not set"}
                  </Text>
                </View>
                <View style={styles.vehicleLocationDivider} />
                <View style={styles.vehicleLocationRow}>
                  <MapPin size={13} color={MUTED} />
                  <Text style={styles.vehicleLocationLabel}>Preferred location:</Text>
                  <Text style={styles.vehicleLocationValue} numberOfLines={1}>
                    {post.destination?.trim() || "Not set"}
                  </Text>
                </View>
              </View>
            ) : null}

            {isVehicle && post.vehicle_type ? (
              <View style={[styles.metaRow, isDesktopPreview && styles.metaRowDesktop]}>
                <View style={styles.metaChip}>
                  <Truck size={10} color={MUTED} />
                  <Text style={styles.metaChipText}>{post.vehicle_type}</Text>
                </View>
              </View>
            ) : null}
          </StoryContentEntrance>
        )}
      </View>

      {!(isLoad && post.origin && post.destination) && !(isVehicle && post.origin) ? (
        <View style={[styles.watermark, isDesktopPreview && styles.watermarkDesktop]} pointerEvents="none">
          <PulseStoryWatermark size={isDesktopPreview ? 42 : 36} />
        </View>
      ) : null}

      {/* Footer — stacked above tap zones so bid status never overlaps the hero */}
      <Animated.View
        onLayout={(e) => {
          const next = Math.ceil(e.nativeEvent.layout.height);
          if (next > 0) {
            setFooterHeight((prev) => (prev === next ? prev : next));
          }
        }}
        style={[
          styles.footer,
          {
            paddingBottom: Math.max(phonePopup ? 16 : insets.bottom, 20) + 8,
            opacity: footerFade,
          },
        ]}
      >
        {isOwnPost && isLoad && (
          <StoryOwnerFooterActions
            viewsLabel={storyOwnerViewsLabel(ownerViewRows.length, ownerViewsLoading)}
            bidsLabel={storyOwnerBidsLabel(ownerBidRows.length, ownerBidsLoading)}
            hint="This is your broadcast — others can place bids on this indent."
            primaryLabel="Open load center"
            onViewersPress={() => setShowViewers(true)}
            onBidsPress={
              ownerIndentId || laneIndentIds.length > 0 || ownerBidRows.length > 0
                ? () => setShowBids(true)
                : undefined
            }
            onPrimaryPress={() => router.push(ROUTES.PULSE_LOADS)}
            onShareWhatsApp={handleShareWhatsApp}
            boostLabel={orgActiveBoost ? "Boost Active" : "Boost"}
            onBoostPress={() => {
              if (orgActiveBoost) {
                setShowBoostProgress(true);
                return;
              }
              setShowBoost(true);
            }}
          />
        )}

        {isOwnPost && isVehicle && (
          <StoryOwnerFooterActions
            viewsLabel={storyOwnerViewsLabel(ownerViewRows.length, ownerViewsLoading)}
            hint="Your vehicle availability is visible to your network."
            primaryLabel="Done"
            onViewersPress={() => setShowViewers(true)}
            onPrimaryPress={closeStory}
            onShareWhatsApp={handleShareWhatsApp}
          />
        )}

        {canBidOnLoad && post && (
          commercialOpportunity.bidding.hasBid ? (
            <View style={styles.bidSubmittedBlock}>
              <View
                style={[
                  styles.bidStatusBanner,
                  commercialOpportunity.bidding.counterAmount != null && styles.bidStatusBannerCounter,
                ]}
              >
                {commercialOpportunity.bidding.counterAmount != null ? (
                  <ArrowLeftRight size={16} color={Theme.warning} strokeWidth={2.5} />
                ) : (
                  <CheckCircle2 size={16} color="#10b981" strokeWidth={2.5} />
                )}
                <View style={styles.bidStatusText}>
                  <Text
                    style={[
                      styles.bidStatusLabel,
                      commercialOpportunity.bidding.counterAmount != null && styles.bidStatusLabelCounter,
                    ]}
                    numberOfLines={1}
                  >
                    {commercialOpportunity.bidding.counterAmount != null
                      ? "Counter offer received"
                      : "Bid submitted"}
                  </Text>
                  <Text style={styles.bidStatusAmount} numberOfLines={1}>
                    ₹
                    {(
                      commercialOpportunity.bidding.counterAmount ??
                      commercialOpportunity.bidding.myBidAmount ??
                      0
                    ).toLocaleString("en-IN")}
                  </Text>
                  {commercialOpportunity.bidding.counterAmount != null &&
                  (commercialOpportunity.bidding.myBidAmount ?? 0) > 0 ? (
                    <Text style={styles.bidStatusSub} numberOfLines={1}>
                      Your bid · ₹
                      {commercialOpportunity.bidding.myBidAmount!.toLocaleString("en-IN")}
                    </Text>
                  ) : bidNote ? (
                    <Text style={styles.bidStatusSub} numberOfLines={1}>
                      {bidNote}
                    </Text>
                  ) : null}
                </View>
                <View
                  style={[
                    styles.bidStatusBadge,
                    commercialOpportunity.bidding.counterAmount != null
                      ? styles.bidBadgeCounter
                      : bidStatus === "accepted"
                        ? styles.bidBadgeAccepted
                        : bidStatus === "rejected"
                          ? styles.bidBadgeRejected
                          : styles.bidBadgePending,
                  ]}
                >
                  <Text
                    style={[
                      styles.bidStatusBadgeText,
                      commercialOpportunity.bidding.counterAmount != null &&
                        styles.bidStatusBadgeTextCounter,
                    ]}
                  >
                    {commercialOpportunity.bidding.counterAmount != null
                      ? "REVIEW"
                      : bidStatus.toUpperCase()}
                  </Text>
                </View>
              </View>
              {commercialOpportunity.permissions.canEditBid && (
                <Pressable
                  style={({ pressed }) => [
                    styles.authorizeBtn,
                    styles.authorizeBtnCompact,
                    pressed && styles.authorizeBtnPressed,
                  ]}
                  onPress={() =>
                    guardVerified(() => {
                      setEditBidMode(true);
                      setBidSheetExisting(myBid);
                      setBidPost(post);
                    })
                  }
                >
                  <Edit3 size={15} color={INK} />
                  <Text style={styles.authorizeBtnText}>
                    {commercialOpportunity.actions.primary?.label ?? "Edit bid"}
                  </Text>
                </Pressable>
              )}
            </View>
          ) : commercialOpportunity.permissions.canBid ? (
            <Pressable
              style={({ pressed }) => [styles.authorizeBtn, pressed && styles.authorizeBtnPressed]}
              onPress={() =>
                guardVerified(() => {
                  setEditBidMode(false);
                  setBidSheetExisting(null);
                  setBidPost(post);
                })
              }
            >
              <Send size={16} color={INK} />
              <Text style={styles.authorizeBtnText}>
                {commercialOpportunity.actions.primary?.label ?? "Bid this shipper"}
              </Text>
            </Pressable>
          ) : null
        )}

        {canContactVehicle && (
          <Pressable
            style={({ pressed }) => [
              styles.authorizeBtn,
              styles.authorizeBtnSolid,
              { backgroundColor: color },
              pressed && styles.authorizeBtnSolidPressed,
            ]}
            onPress={handleOpenMessage}
          >
            <MessageSquare size={16} color={Theme.textOnPrimary} />
            <Text style={[styles.authorizeBtnText, styles.authorizeBtnTextOnFill]}>
              Contact & message
            </Text>
          </Pressable>
        )}

        {!isOwnPost && (canBidOnLoad || canContactVehicle) && (
          <Pressable
            style={styles.messageGhost}
            onPress={handleOpenMessage}
            accessibilityRole="button"
            accessibilityLabel="Message poster"
          >
            <MessageSquare size={15} color={INK} />
            <Text style={styles.messageGhostText}>Message</Text>
          </Pressable>
        )}
      </Animated.View>

      <BidSheet
        visible={bidPost != null}
        post={bidPost}
        orgId={myOrgId}
        existingBid={editBidMode ? bidSheetExisting : null}
        initialAmount={
          editBidMode && counterOfferInr != null
            ? counterOfferInr
            : params.suggestedRate
              ? Number(params.suggestedRate)
              : null
        }
        initialNote={params.refNote ?? null}
        onClose={() => {
          setBidPost(null);
          setEditBidMode(false);
          setBidSheetExisting(null);
        }}
        onSuccess={() => {
          invalidatePosts();
          if (myOrgId) invalidateIndents(myOrgId);
          void myBidQ.refetch();
          void myQuotesQ.refetch();
          setBidPost(null);
          setEditBidMode(false);
          setBidSheetExisting(null);
          // Restart story progress on the same preview after celebration.
          progress.setValue(0);
        }}
      />

      <StoryMessageSheet
        visible={showMessageSheet}
        partnerOrgId={(post?.organization_id ?? "").trim()}
        partnerOrgName={(post?.org_name ?? "").trim() || "Partner"}
        story={
          post
            ? {
                postId: post.id,
                storyType: post.type,
                title:
                  post.vehicle_type?.trim() ||
                  post.content?.trim() ||
                  (isLoad ? "Load broadcast" : "Story"),
                origin: post.origin,
                destination: post.destination,
              }
            : null
        }
        onClose={() => setShowMessageSheet(false)}
      />

      <StoryViewersSheet
        visible={showViewers}
        views={post ? toStoryViewRows(ownerViewRows, post.id) : []}
        loading={ownerViewsLoading}
        onClose={() => setShowViewers(false)}
      />

      <StoryOwnerBidsSheet
        visible={showBids}
        bids={ownerBidRows}
        loading={ownerBidsLoading}
        latestBidKey={latestLaneBid?.key ?? null}
        indentId={ownerIndentId}
        indentLabel={
          ownerIndentCount > 1
            ? `Lane · ${ownerIndentCount} indents`
            : indentDisplayLabel
        }
        onClose={() => setShowBids(false)}
        onOpenReviewHub={
          ownerIndentId
            ? () => router.push(ROUTES.indentDetail(ownerIndentId) as never)
            : undefined
        }
      />

      {post && myOrgId ? (
        <BoostSheet
          visible={showBoost}
          onClose={() => setShowBoost(false)}
          orgId={myOrgId}
          postId={post.id}
          onBoosted={(campaignId) => {
            invalidatePosts();
            setFreshCampaignId(campaignId);
          }}
          onViewCampaign={() => {
            setShowBoost(false);
            setShowBoostProgress(true);
          }}
        />
      ) : null}

      {post && myOrgId && progressCampaignId ? (
        <BoostProgressSheet
          visible={showBoostProgress}
          onClose={() => setShowBoostProgress(false)}
          orgId={myOrgId}
          campaignId={progressCampaignId}
          onBoostAgain={() => {
            // Org may already have another draft/active (e.g. re-broadcast).
            if (findOrgDraftOrActiveCampaign(myCampaignsQ.data)) {
              setShowBoostProgress(true);
              return;
            }
            setShowBoost(true);
          }}
        />
      ) : null}
    </View>
    </StoryMobilePopupShell>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.screenBackground, overflow: "hidden" },
  ambientGlow: {
    position: "absolute",
    top: "18%",
    left: "-12%",
    right: "-12%",
    height: "52%",
    borderRadius: 999,
    backgroundColor: Theme.loadAddButtonBg,
    opacity: 0.42,
    transform: [{ scaleX: 1.15 }],
  },
  progressRow: {
    flexDirection: "row", gap: 4,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingBottom: 10, zIndex: 100, elevation: 100,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    zIndex: 100,
    elevation: 100,
    marginBottom: 6,
  },
  topBarDesktop: { marginBottom: 12 },
  topBarLeft: { flexDirection: "row", alignItems: "center", flex: 1, minWidth: 0, paddingRight: 10, gap: 8 },
  topBarText: { flex: 1, minWidth: 0 },
  topBarActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 0,
  },
  topBarIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.loadStatusTabTrayBg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.loadStatusTabBorderSoft,
    zIndex: 110,
    ...(Platform.OS === "web" ? ({ cursor: "pointer" } as object) : null),
  },
  topBarDeleteBtn: {
    backgroundColor: "rgba(220, 38, 38, 0.06)",
    borderColor: "rgba(220, 38, 38, 0.18)",
  },
  topBarIconBtnPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.96 }],
  },
  topBarIconBtnDisabled: {
    opacity: 0.5,
  },
  orgBrandRow: { flexDirection: "row", alignItems: "center", gap: 6, minWidth: 0 },
  orgTitle: { flexShrink: 1, fontSize: 14, fontWeight: "800", color: INK, letterSpacing: -0.2 },
  orgTitlePulse: { fontStyle: "italic", letterSpacing: -0.45 },
  pulseGreenDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: Theme.darkGreen, marginTop: 1, flexShrink: 0 },
  timeAgoLabel: { fontSize: 8, fontWeight: "700", color: MUTED, letterSpacing: 1, textTransform: "uppercase", marginTop: 1 },
  topBarSubRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 1 },
  sponsoredTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
    backgroundColor: Theme.accentBrownMuted,
  },
  sponsoredTagText: {
    fontSize: 8,
    fontWeight: "800",
    color: Theme.accentBrown,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  tapZones: {
    position: "absolute",
    top: 100,
    left: 0,
    right: 0,
    bottom: 168,
    flexDirection: "row",
    zIndex: 30,
  },
  tapLeft: { flex: 1 },
  tapRight: { flex: 2.2 },
  centerStage: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Layout.screenPaddingHorizontal,
    marginTop: -8,
    gap: 0,
    minHeight: 0,
    overflow: "hidden",
    zIndex: 10,
  },
  centerStageDesktop: { marginTop: -4, paddingHorizontal: 56 },
  iconHero: {
    width: 72,
    height: 72,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  iconHeroDesktop: { width: 96, height: 96, borderRadius: 28, marginBottom: 16 },
  kicker: {
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 2.2,
    textTransform: "uppercase",
    textAlign: "center",
    marginBottom: 8,
  },
  kickerDesktop: { fontSize: 9, letterSpacing: 3, marginBottom: 10 },
  heroTitle: {
    fontSize: 26,
    fontWeight: "900",
    color: INK,
    lineHeight: 28,
    textAlign: "center",
    fontStyle: "italic",
    letterSpacing: -0.6,
    maxWidth: 320,
  },
  heroTitleDesktop: { fontSize: 40, lineHeight: 42, letterSpacing: -1, maxWidth: 980 },
  loadHeroTitleWrap: {
    width: "100%",
    maxWidth: 340,
    alignSelf: "center",
    alignItems: "stretch",
    gap: 6,
  },
  loadHeroTitleWrapDesktop: { maxWidth: 640, gap: 8 },
  loadMaterialTitle: {
    maxWidth: "100%",
    fontSize: 22,
    fontWeight: "900",
    color: INK,
    lineHeight: 24,
    textAlign: "center",
    fontStyle: "italic",
    letterSpacing: -0.5,
  },
  loadMaterialTitleDesktop: { fontSize: 36, lineHeight: 38, letterSpacing: -0.9 },
  loadRouteHeadlineRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 6,
  },
  loadRouteHeadlinePoint: { flex: 1, minWidth: 0, alignItems: "flex-start" },
  loadRouteHeadlinePointEnd: { alignItems: "flex-end" },
  loadRouteArrow: { marginBottom: 4, flexShrink: 0 },
  loadCityTextEnd: { textAlign: "right" },
  loadStateTextEnd: { textAlign: "right" },
  loadCityText: {
    maxWidth: "100%",
    fontSize: 18,
    fontWeight: "900",
    color: INK,
    lineHeight: 20,
    textAlign: "left",
    fontStyle: "italic",
    letterSpacing: -0.35,
    textTransform: "uppercase",
  },
  loadCityTextDesktop: { fontSize: 28, lineHeight: 30, letterSpacing: -0.6 },
  loadStateText: {
    maxWidth: "100%",
    marginTop: 2,
    fontSize: 10,
    fontWeight: "700",
    color: MUTED,
    lineHeight: 12,
    textAlign: "left",
    letterSpacing: 0.2,
    textTransform: "uppercase",
  },
  loadStateTextDesktop: { fontSize: 13, lineHeight: 15 },
  routeCard: {
    marginTop: 12,
    width: "100%",
    maxWidth: 340,
    alignSelf: "center",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surface,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  routeCardDesktop: { maxWidth: 640, marginTop: 18, paddingHorizontal: 14, paddingVertical: 12 },
  routeLine: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
  },
  routePoint: { flex: 1, minWidth: 0, gap: 3, alignItems: "flex-start" },
  routeLabel: {
    fontSize: 7,
    fontWeight: "800",
    color: Theme.textMutedDemo,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  routeDotG: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#10b981" },
  routeDot: { width: 6, height: 6, borderRadius: 3 },
  routeText: { fontSize: 12, fontWeight: "800", color: INK, maxWidth: "100%", lineHeight: 15 },
  vehicleAvailabilityBlock: { marginTop: 10, alignItems: "center", gap: 5 },
  vehicleAvailabilityBlockDesktop: { marginTop: 14, gap: 6 },
  vehicleAvailabilityLine: { flexDirection: "row", alignItems: "center", gap: 6 },
  vehicleAvailabilityText: { fontSize: 18, fontWeight: "800", color: INK, fontStyle: "italic", letterSpacing: -0.2, textTransform: "capitalize" },
  vehicleAvailabilityTextDesktop: { fontSize: 20, letterSpacing: -0.25 },
  vehicleDateText: { fontSize: 11, fontWeight: "700", color: MUTED, letterSpacing: 0.6, textTransform: "uppercase" },
  vehicleDateTextDesktop: { fontSize: 12, letterSpacing: 0.75 },
  vehicleLocationsCard: { marginTop: 16, minWidth: "78%", maxWidth: "92%", backgroundColor: Theme.surface, borderRadius: 12, borderWidth: 1, borderColor: Theme.borderMedium, paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  vehicleLocationsCardDesktop: { minWidth: "70%", maxWidth: 900, marginTop: 22, paddingHorizontal: 16, paddingVertical: 12 },
  vehicleLocationRow: { flexDirection: "row", alignItems: "center", gap: 6, minWidth: 0 },
  vehicleLocationLabel: { fontSize: 11, fontWeight: "700", color: MUTED },
  vehicleLocationValue: { flex: 1, minWidth: 0, fontSize: 13, fontWeight: "800", color: INK },
  vehicleLocationDivider: { height: StyleSheet.hairlineWidth, backgroundColor: Theme.borderMedium },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    alignSelf: "center",
    width: "100%",
    maxWidth: 340,
    gap: 6,
    marginTop: 10,
  },
  metaRowDesktop: { marginTop: 14, maxWidth: 640, gap: 8 },
  metaChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Theme.surface,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
  },
  metaChipEmphasis: { backgroundColor: Theme.screenBackground },
  metaChipText: { fontSize: 9, fontWeight: "800", color: MUTED, letterSpacing: 0.1 },
  watermark: {
    position: "absolute",
    top: "42%",
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 5,
  },
  watermarkDesktop: { top: "40%" },
  footer: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.loadStatusTabBorderSoft,
    backgroundColor: "rgba(255,255,255,0.98)",
    gap: 8,
    maxWidth: 480,
    width: "100%",
    alignSelf: "center",
    zIndex: 60,
    elevation: 8,
  },
  authorizeBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 16,
    minHeight: 50,
    paddingVertical: 12,
    paddingHorizontal: 18,
    backgroundColor: Theme.loadAddButtonBg,
    borderWidth: Theme.buttonPrimaryBorderWidth,
    borderColor: Theme.buttonPrimaryBorder,
  },
  authorizeBtnCompact: {
    minHeight: 44,
    paddingVertical: 10,
    borderRadius: 14,
  },
  authorizeBtnPressed: {
    backgroundColor: Theme.loadAddButtonBgPressed,
    transform: [{ scale: 0.985 }],
  },
  authorizeBtnSolid: {
    borderWidth: 0,
  },
  authorizeBtnSolidPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.985 }],
  },
  authorizeBtnText: { fontSize: 13, fontWeight: "800", color: INK, letterSpacing: -0.15 },
  authorizeBtnTextOnFill: { color: Theme.textOnPrimary },
  messageGhost: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 8,
    minHeight: 44,
  },
  messageGhostText: { fontSize: 12, fontWeight: "800", color: INK, letterSpacing: 0.6 },
  bidSubmittedBlock: {
    width: "100%",
    gap: 8,
  },
  bidStatusBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#10b98110",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#10b98130",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  bidStatusBannerCounter: {
    backgroundColor: Theme.warningMuted,
    borderColor: "rgba(180, 83, 9, 0.28)",
  },
  bidStatusText: { flex: 1, minWidth: 0 },
  bidStatusLabel: {
    fontSize: 10,
    fontWeight: "900",
    color: "#10b981",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  bidStatusLabelCounter: { color: Theme.warning },
  bidStatusAmount: { fontSize: 14, fontWeight: "800", color: INK, marginTop: 1 },
  bidStatusSub: {
    fontSize: 11,
    fontWeight: "700",
    color: MUTED,
    marginTop: 2,
  },
  bidStatusBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, flexShrink: 0 },
  bidBadgePending: { backgroundColor: "#f59e0b18" },
  bidBadgeAccepted: { backgroundColor: "#10b98118" },
  bidBadgeRejected: { backgroundColor: "#ef444418" },
  bidBadgeCounter: { backgroundColor: "rgba(180, 83, 9, 0.14)" },
  bidStatusBadgeText: { fontSize: 9, fontWeight: "900", letterSpacing: 0.8, color: MUTED },
  bidStatusBadgeTextCounter: { color: Theme.warning },
});
