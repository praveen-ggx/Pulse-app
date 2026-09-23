/**
 * Driver fullscreen Pulse story viewer — Mission layout aligned with
 * business StoryDetailScreen + StoryBroadcastPreview.
 * Opens the full active-load reel as one WhatsApp-style sequence.
 */
import { PulseBrandMark } from "@/components/brand/PulseBrandMark";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { StoryBroadcastPreview } from "@/features/network/components/StoryBroadcastPreview";
import type { PostRow } from "@/features/network/services/posts.service";
import { getStoryPreview } from "@/features/network/services/posts.service";
import {
  loadMaterialLabel,
} from "@/features/network/utils/storyDisplay";
import { shouldRetryQuery } from "@/lib/queryClient";
import type { DriverReachStoryRow } from "@/features/reach/services/driverReferrals.service";
import { isLoadOpportunity } from "@/features/reach/utils/directBidLifecycle";
import { positiveMoneyOrNull } from "@/lib/format";
import { useQuery } from "@tanstack/react-query";
import {
  CheckCircle2,
  Clock3,
  Megaphone,
  Rocket,
  X,
  XCircle,
} from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const INK = Theme.textPrimaryDark;
const MUTED = Theme.textSecondary;
const STORY_DURATION = 15000;

export type DriverStoryFooterAction = {
  label: string;
  hint?: string;
  onPress: () => void;
};

export type DriverPulseStoryViewerProps = {
  /** Full active-load queue (WhatsApp-style). Prefer over a single postId. */
  stories?: DriverReachStoryRow[];
  /** Start at this post within `stories`. Defaults to the first item. */
  initialPostId?: string | null;
  /** Legacy single-story entry (deep link / story-detail). */
  postId?: string;
  story?: DriverReachStoryRow | null;
  shipperName?: string | null;
  onClose: () => void;
  /** Static footer for a single-story open. Prefer `resolveFooterAction`. */
  footerAction?: DriverStoryFooterAction | null;
  /** Per-story footer CTA while paging through the reel. */
  resolveFooterAction?: (story: DriverReachStoryRow) => DriverStoryFooterAction | null;
  /** Fired when each story becomes the active segment (for view analytics). */
  onStoryViewed?: (story: DriverReachStoryRow) => void;
};

function timeAgo(d: string): string {
  const diff = Date.now() - new Date(d).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function previewToPost(
  preview: {
    id: string;
    organization_id: string;
    org_name: string;
    type: PostRow["type"];
    origin: string | null;
    destination: string | null;
    load_date: string | null;
    vehicle_type: string | null;
    expires_at: string | null;
    is_active: boolean;
  },
  story?: DriverReachStoryRow | null,
): PostRow {
  return {
    id: preview.id,
    organization_id: preview.organization_id,
    org_name: preview.org_name || story?.org_name || "Pulse",
    org_avatar_seed: null,
    org_avatar_url: story?.org_logo_url ?? null,
    author_user_id: "",
    type: preview.type,
    content: story?.snapshot_content ?? null,
    origin: preview.origin ?? story?.snapshot_origin ?? null,
    destination: preview.destination ?? story?.snapshot_destination ?? null,
    load_date: preview.load_date,
    vehicle_type: preview.vehicle_type ?? story?.snapshot_vehicle_type ?? null,
    weight_tonnes: null,
    rate_offer: positiveMoneyOrNull(story?.snapshot_rate_offer),
    material: story?.snapshot_material ?? null,
    expires_at: preview.expires_at ?? story?.expires_at ?? null,
    is_active: preview.is_active,
    view_count: 0,
    bid_count: 0,
    created_at: story?.posted_at ?? story?.published_at ?? new Date().toISOString(),
    is_sponsored: true,
    reach_campaign_id: story?.campaign_id ?? null,
  };
}

function ProgressSegment({
  index,
  current,
  progress,
}: {
  index: number;
  current: number;
  progress: Animated.Value;
}) {
  const width = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
    extrapolate: "clamp",
  });
  if (index < current) {
    return (
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: "100%" }]} />
      </View>
    );
  }
  if (index === current) {
    return (
      <View style={styles.progressTrack}>
        <Animated.View style={[styles.progressFill, { width }]} />
      </View>
    );
  }
  return <View style={styles.progressTrack} />;
}

function BidToShipperBanner({
  story,
  shipperName,
}: {
  story: DriverReachStoryRow;
  shipperName: string;
}) {
  if (story.direct_bid_status) {
    const amount = story.direct_bid_amount ?? 0;
    const status = story.direct_bid_status;
    const isAccepted = status === "accepted";
    const isRejected = status === "rejected";
    // A6.4: not a business decision, not a driver withdrawal -- another
    // load was awarded to the driver and this bid became moot. In practice
    // isLoadOpportunity() already excludes a superseded story from the feed
    // that feeds this viewer, but handling it explicitly here too avoids a
    // misleading "waiting for shipper" / green-checkmark fallback if this
    // component is ever reached another way.
    const isSuperseded = status === "superseded";
    return (
      <View
        style={[
          styles.bidStatusBanner,
          isRejected && styles.bidStatusBannerRejected,
        ]}
      >
        {isAccepted ? (
          <CheckCircle2 size={16} color="#10b981" strokeWidth={2.5} />
        ) : isRejected || isSuperseded ? (
          <XCircle size={16} color={Theme.negative} strokeWidth={2.5} />
        ) : (
          <CheckCircle2 size={16} color="#10b981" strokeWidth={2.5} />
        )}
        <View style={styles.bidStatusText}>
          <Text style={styles.bidStatusLabel}>
            {isAccepted
              ? "Bid accepted by shipper"
              : isRejected
                ? "Bid not accepted"
                : isSuperseded
                  ? "Bid superseded"
                  : `Your bid to ${shipperName}`}
          </Text>
          <Text style={styles.bidStatusAmount}>
            ₹{Math.round(amount).toLocaleString("en-IN")}
            {!isAccepted && !isRejected && !isSuperseded ? " · waiting for shipper" : ""}
            {isSuperseded ? " · another load was awarded to you" : ""}
          </Text>
        </View>
        <View
          style={[
            styles.bidStatusBadge,
            isAccepted
              ? styles.bidBadgeAccepted
              : isRejected || isSuperseded
                ? styles.bidBadgeRejected
                : styles.bidBadgePending,
          ]}
        >
          <Text style={styles.bidStatusBadgeText}>{status.toUpperCase()}</Text>
        </View>
      </View>
    );
  }

  if (story.referral_status === "bid_submitted") {
    return (
      <View style={styles.bidStatusBanner}>
        <CheckCircle2 size={16} color="#10b981" strokeWidth={2.5} />
        <View style={styles.bidStatusText}>
          <Text style={styles.bidStatusLabel}>Fleet bid to {shipperName}</Text>
          <Text style={styles.bidStatusAmount}>Your fleet placed a bid on this load</Text>
        </View>
        <View style={[styles.bidStatusBadge, styles.bidBadgeAccepted]}>
          <Text style={styles.bidStatusBadgeText}>FLEET</Text>
        </View>
      </View>
    );
  }

  if (story.referral_status === "recommended" || story.referral_status === "approved") {
    return (
      <View style={[styles.bidStatusBanner, styles.bidStatusBannerPending]}>
        <Clock3 size={16} color={Theme.warning} strokeWidth={2.5} />
        <View style={styles.bidStatusText}>
          <Text style={[styles.bidStatusLabel, styles.bidStatusLabelPending]}>
            {story.referral_status === "approved"
              ? "Fleet is bidding for you"
              : "Recommended to your fleet"}
          </Text>
          <Text style={styles.bidStatusAmount}>
            {story.referral_status === "approved"
              ? `Waiting on ${shipperName}`
              : "Waiting for fleet owner to bid"}
          </Text>
        </View>
        <View style={[styles.bidStatusBadge, styles.bidBadgePending]}>
          <Text style={styles.bidStatusBadgeText}>PENDING</Text>
        </View>
      </View>
    );
  }

  return null;
}

function buildQueue(
  stories: DriverReachStoryRow[] | undefined,
  postId: string | undefined,
  story: DriverReachStoryRow | null | undefined,
): DriverReachStoryRow[] {
  /** Never page through awarded / rejected / rewarded history in the reel. */
  const opportunities = (stories ?? []).filter(isLoadOpportunity);
  if (opportunities.length > 0) {
    if (
      story?.post_id &&
      isLoadOpportunity(story) &&
      !opportunities.some((s) => s.post_id === story.post_id)
    ) {
      return [story, ...opportunities];
    }
    return opportunities;
  }
  // Single-story deep link: still refuse inactive / awarded history.
  if (story?.post_id && isLoadOpportunity(story)) return [story];
  if (postId && story && !isLoadOpportunity(story)) return [];
  if (postId) {
    return [
      {
        campaign_id: "",
        campaign_org_id: "",
        org_name: "Pulse",
        org_logo_url: null,
        campaign_status: "active",
        published_at: null,
        posted_at: null,
        expires_at: null,
        source_deleted_at: null,
        snapshot_post_type: "LOAD",
        snapshot_title: null,
        snapshot_origin: null,
        snapshot_destination: null,
        snapshot_vehicle_type: null,
        snapshot_material: null,
        snapshot_content: null,
        snapshot_rate_offer: null,
        driver_reward_enabled: false,
        reward_amount: 0,
        reward_available: false,
        referral_id: null,
        referral_status: null,
        referral_reward_amount: null,
        recommended_at: null,
        rewarded_at: null,
        post_id: postId,
        direct_bid_status: null,
        direct_bid_amount: null,
        direct_bid_counter_amount: null,
      },
    ];
  }
  return [];
}

export function DriverPulseStoryViewer({
  stories,
  initialPostId = null,
  postId,
  story = null,
  shipperName,
  onClose,
  footerAction = null,
  resolveFooterAction,
  onStoryViewed,
}: DriverPulseStoryViewerProps) {
  const insets = useSafeAreaInsets();
  const progress = useRef(new Animated.Value(0)).current;
  const footerFade = useRef(new Animated.Value(0)).current;
  const animRef = useRef<Animated.CompositeAnimation | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const viewedRef = useRef<Set<string>>(new Set());

  const queue = useMemo(
    () => buildQueue(stories, postId, story),
    [stories, postId, story],
  );

  useEffect(() => {
    if (queue.length === 0 && (stories?.length || story || postId)) {
      onCloseRef.current();
    }
  }, [queue.length, stories, story, postId]);

  const initialIndex = useMemo(() => {
    const target = initialPostId ?? postId ?? story?.post_id ?? null;
    if (!target || queue.length === 0) return 0;
    const idx = queue.findIndex((s) => s.post_id === target);
    return idx >= 0 ? idx : 0;
  }, [queue, initialPostId, postId, story?.post_id]);

  const [current, setCurrent] = useState(initialIndex);

  useEffect(() => {
    setCurrent(initialIndex);
    progress.setValue(0);
  }, [initialIndex, progress]);

  const activeStory = queue[current] ?? null;
  const activePostId = activeStory?.post_id ?? postId ?? "";

  const goNext = useCallback(() => {
    if (current < queue.length - 1) {
      progress.setValue(0);
      setCurrent((c) => c + 1);
      return;
    }
    onCloseRef.current();
  }, [current, queue.length, progress]);

  const goPrev = useCallback(() => {
    if (current > 0) {
      progress.setValue(0);
      setCurrent((c) => c - 1);
    }
  }, [current, progress]);

  useEffect(() => {
    if (!activeStory?.campaign_id) return;
    if (viewedRef.current.has(activeStory.campaign_id)) return;
    viewedRef.current.add(activeStory.campaign_id);
    onStoryViewed?.(activeStory);
  }, [activeStory, onStoryViewed]);

  const previewQ = useQuery({
    queryKey: ["q", "posts", "story-preview", "driver", activePostId],
    queryFn: async () => {
      const { preview, error } = await getStoryPreview(activePostId);
      if (error) throw error;
      return preview;
    },
    enabled: Boolean(activePostId),
    staleTime: 30_000,
    retry: shouldRetryQuery,
  });

  const post = useMemo(() => {
    if (previewQ.data) return previewToPost(previewQ.data, activeStory);
    // Instant paint from feed snapshot while preview RPC loads
    if (activeStory?.post_id) {
      return previewToPost(
        {
          id: activeStory.post_id,
          organization_id: activeStory.campaign_org_id,
          org_name: activeStory.org_name,
          type: (activeStory.snapshot_post_type as PostRow["type"]) || "LOAD",
          origin: activeStory.snapshot_origin,
          destination: activeStory.snapshot_destination,
          load_date: null,
          vehicle_type: activeStory.snapshot_vehicle_type,
          expires_at: activeStory.expires_at,
          is_active: true,
        },
        activeStory,
      );
    }
    return null;
  }, [previewQ.data, activeStory]);

  useEffect(() => {
    if (!post?.id || queue.length === 0) return;
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
  }, [post?.id, current, queue.length, goNext, progress]);

  useEffect(() => {
    if (!post?.id) return;
    footerFade.setValue(0);
    Animated.timing(footerFade, {
      toValue: 1,
      duration: 320,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [post?.id, footerFade]);

  const resolvedShipper =
    (shipperName ?? activeStory?.org_name ?? post?.org_name ?? "shipper").trim() ||
    "shipper";

  const activeFooter =
    (activeStory && resolveFooterAction?.(activeStory)) ??
    (queue.length <= 1 ? footerAction : null) ??
    null;

  const body = (() => {
    if (queue.length === 0 && previewQ.isLoading) {
      return (
        <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
          <ActivityIndicator size="large" color={Theme.driverEmerald} />
          <Text style={styles.loadingText}>Opening story…</Text>
        </View>
      );
    }

    if (!post && !activeStory) {
      return (
        <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
          <Pressable style={styles.topBarIconBtn} onPress={onClose}>
            <X size={16} color={INK} strokeWidth={2.25} />
          </Pressable>
          <Megaphone size={28} color={MUTED} strokeWidth={1.8} />
          <Text style={styles.notFoundTitle}>Story unavailable</Text>
          <Text style={styles.notFoundBody}>
            This market story could not be loaded. Pull to refresh on Stories and try again.
          </Text>
          <Pressable style={styles.doneBtn} onPress={onClose}>
            <Text style={styles.doneBtnText}>Close</Text>
          </Pressable>
        </View>
      );
    }

    if (!post) {
      return (
        <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
          <ActivityIndicator size="large" color={Theme.driverEmerald} />
          <Text style={styles.loadingText}>Opening story…</Text>
        </View>
      );
    }

    const isLoad = post.type === "LOAD" && Boolean(post.origin && post.destination);
    const loadMaterial = loadMaterialLabel(post, activeStory?.snapshot_title ?? "Load");

    return (
      <View style={styles.container}>
        {isLoad ? <View style={styles.ambientGlow} pointerEvents="none" /> : null}

        <View style={[styles.progressRow, { paddingTop: insets.top + 8 }]}>
          {queue.map((item, i) => (
            <ProgressSegment
              key={item.post_id || item.campaign_id || String(i)}
              index={i}
              current={current}
              progress={progress}
            />
          ))}
        </View>

        <View style={[styles.topBar, { paddingHorizontal: Layout.screenPaddingHorizontal }]}>
          <View style={styles.topBarLeft}>
            <View style={styles.topBarText}>
              <View style={styles.orgBrandRow}>
                <Text style={styles.orgTitle} numberOfLines={1}>
                  {post.org_name}
                </Text>
              </View>
              <View style={styles.topBarSubRow}>
                <Text style={styles.timeAgoLabel}>{timeAgo(post.created_at)}</Text>
                {activeStory?.source_deleted_at ? (
                  <Text style={styles.timeAgoLabel}> · Removed by org</Text>
                ) : null}
                <Pressable
                  style={styles.sponsoredTag}
                  onPress={() =>
                    Alert.alert(
                      "Sponsored",
                      "This load has been promoted through Pulse Reach.",
                    )
                  }
                  hitSlop={6}
                >
                  <Rocket size={9} color={Theme.accentBrown} strokeWidth={2.25} />
                  <Text style={styles.sponsoredTagText}>Sponsored</Text>
                </Pressable>
              </View>
            </View>
          </View>
          <Pressable
            style={({ pressed }) => [
              styles.topBarIconBtn,
              pressed && styles.topBarIconBtnPressed,
            ]}
            onPress={onClose}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel="Close story"
          >
            <X size={16} color={INK} strokeWidth={2.25} />
          </Pressable>
        </View>

        <View style={styles.tapZones} pointerEvents="box-none">
          <Pressable
            style={styles.tapLeft}
            onPress={goPrev}
            accessibilityRole="button"
            accessibilityLabel="Previous story"
          />
          <Pressable
            style={styles.tapRight}
            onPress={goNext}
            accessibilityRole="button"
            accessibilityLabel="Next story"
          />
        </View>

        <View style={styles.centerStage} pointerEvents="none">
          {isLoad ? (
            <StoryBroadcastPreview
              post={post}
              loadMaterial={loadMaterial}
              origin={post.origin}
              destination={post.destination}
              loadTargetRate={post.rate_offer}
              storyKey={post.id}
            />
          ) : (
            <View style={styles.fallbackHero}>
              <View style={styles.fallbackIcon}>
                <Megaphone size={30} color={Theme.driverEmerald} strokeWidth={1.8} />
              </View>
              <Text style={styles.fallbackKicker}>SPONSORED LOAD</Text>
              <Text style={styles.fallbackTitle} numberOfLines={4}>
                {[post.origin, post.destination].filter(Boolean).join(" → ") ||
                  post.vehicle_type ||
                  post.org_name}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.watermark} pointerEvents="none">
          <PulseBrandMark
            wordColor={INK}
            dotColor={INK}
            textStyle={styles.watermarkText}
          />
        </View>

        <Animated.View
          style={[
            styles.footer,
            {
              paddingBottom: Math.max(insets.bottom, 16) + 8,
              opacity: footerFade,
            },
          ]}
        >
          {activeStory ? (
            <BidToShipperBanner story={activeStory} shipperName={resolvedShipper} />
          ) : null}

          {activeFooter ? (
            <Pressable
              style={({ pressed }) => [
                styles.authorizeBtn,
                pressed && styles.authorizeBtnPressed,
              ]}
              onPress={activeFooter.onPress}
            >
              <Text style={styles.authorizeBtnText}>{activeFooter.label}</Text>
              {activeFooter.hint ? (
                <Text style={styles.authorizeBtnHint}>{activeFooter.hint}</Text>
              ) : null}
            </Pressable>
          ) : (
            <Pressable
              style={({ pressed }) => [
                styles.secondaryBtn,
                pressed && styles.authorizeBtnPressed,
              ]}
              onPress={onClose}
            >
              <Text style={styles.secondaryBtnText}>Done</Text>
            </Pressable>
          )}
        </Animated.View>
      </View>
    );
  })();

  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {body}
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
  },
  centered: {
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 28,
  },
  loadingText: {
    fontSize: 13,
    fontWeight: "600",
    color: MUTED,
  },
  notFoundTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: INK,
  },
  notFoundBody: {
    fontSize: 13,
    fontWeight: "500",
    color: MUTED,
    textAlign: "center",
    lineHeight: 18,
  },
  ambientGlow: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(4,120,87,0.04)",
  },
  progressRow: {
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingBottom: 8,
  },
  progressTrack: {
    flex: 1,
    height: 3,
    backgroundColor: Theme.surfaceBorder,
    borderRadius: 2,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: INK,
    borderRadius: 2,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingBottom: 6,
  },
  topBarLeft: {
    flex: 1,
    minWidth: 0,
  },
  topBarText: {
    gap: 3,
  },
  orgBrandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  orgTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: INK,
    letterSpacing: -0.15,
  },
  topBarSubRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  timeAgoLabel: {
    fontSize: 10,
    fontWeight: "500",
    color: MUTED,
  },
  sponsoredTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: Theme.accentBrownMuted,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  sponsoredTagText: {
    fontSize: 8,
    fontWeight: "700",
    letterSpacing: 0.35,
    color: Theme.accentBrown,
    textTransform: "uppercase",
  },
  topBarIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
  },
  topBarIconBtnPressed: {
    opacity: 0.85,
  },
  tapZones: {
    position: "absolute",
    top: 100,
    left: 0,
    right: 0,
    bottom: 200,
    flexDirection: "row",
    zIndex: 30,
  },
  tapLeft: { flex: 1 },
  tapRight: { flex: 2.2 },
  centerStage: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  fallbackHero: {
    alignItems: "center",
    paddingHorizontal: 24,
    gap: 8,
  },
  fallbackIcon: {
    width: 52,
    height: 52,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.driverEmeraldMuted,
  },
  fallbackKicker: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.8,
    color: Theme.driverEmerald,
  },
  fallbackTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: INK,
    textAlign: "center",
    letterSpacing: -0.3,
  },
  watermark: {
    position: "absolute",
    top: "50%",
    left: 0,
    right: 0,
    alignItems: "center",
    transform: [{ translateY: -28 }],
  },
  watermarkText: {
    fontSize: 48,
    fontWeight: "800",
    color: INK,
    opacity: 0.03,
    letterSpacing: -1,
    fontStyle: "italic",
  },
  footer: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.loadStatusTabBorderSoft,
    backgroundColor: "rgba(255,255,255,0.98)",
    gap: 8,
  },
  bidStatusBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 9,
    backgroundColor: "rgba(16,185,129,0.08)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(16,185,129,0.22)",
  },
  bidStatusBannerPending: {
    backgroundColor: "rgba(245,158,11,0.10)",
    borderColor: "rgba(245,158,11,0.28)",
  },
  bidStatusBannerRejected: {
    backgroundColor: "rgba(239,68,68,0.08)",
    borderColor: "rgba(239,68,68,0.22)",
  },
  bidStatusText: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  bidStatusLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: INK,
  },
  bidStatusLabelPending: {
    color: Theme.warning,
  },
  bidStatusAmount: {
    fontSize: 11,
    fontWeight: "500",
    color: MUTED,
  },
  bidStatusBadge: {
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  bidBadgePending: {
    backgroundColor: Theme.driverEmerald,
  },
  bidBadgeAccepted: {
    backgroundColor: "#10b981",
  },
  bidBadgeRejected: {
    backgroundColor: Theme.negative,
  },
  bidStatusBadgeText: {
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 0.4,
    color: Theme.textOnPrimary,
  },
  authorizeBtn: {
    borderRadius: 8,
    backgroundColor: Theme.buttonPrimary,
    borderWidth: Theme.buttonPrimaryBorderWidth,
    borderColor: Theme.buttonPrimaryBorder,
    paddingVertical: 11,
    paddingHorizontal: 14,
    alignItems: "center",
    gap: 1,
    minHeight: 44,
    justifyContent: "center",
  },
  authorizeBtnPressed: {
    opacity: 0.9,
  },
  authorizeBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.buttonPrimaryText,
  },
  authorizeBtnHint: {
    fontSize: 10,
    fontWeight: "500",
    color: Theme.buttonPrimaryText,
    opacity: 0.72,
  },
  secondaryBtn: {
    borderRadius: 8,
    backgroundColor: Theme.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
    paddingVertical: 11,
    alignItems: "center",
    minHeight: 40,
    justifyContent: "center",
  },
  secondaryBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: INK,
  },
  doneBtn: {
    marginTop: 8,
    borderRadius: 8,
    backgroundColor: Theme.driverEmerald,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  doneBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textOnPrimary,
  },
});
