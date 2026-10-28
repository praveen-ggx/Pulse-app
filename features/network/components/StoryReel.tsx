/**
 * Network stories row — circular avatars with gradient rings (unseen / seen).
 */
import { PartyAvatar } from "@/components/PartyAvatar";
import { PulseBrandMark } from '@/components/brand/PulseBrandMark';
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import { type PostRow } from "@/features/network/services/posts.service";
import { isIndentStoryLive } from "@/features/network/utils/indentStoryWindow.util";
import {
  collapseStoriesByLane,
} from "@/features/network/utils/storyLaneGroup.util";
import { splitLocationParts } from "@/features/network/utils/storyDisplay";
import {
  sameOrgId,
  selectNetworkAndSponsoredStoryPosts,
} from "@/features/network/utils/storyLoadVisibility.util";
import { storyIdsForBubble } from "@/features/network/utils/storyReelOpen.util";
import { storyOrgPreviewLabel } from "@/features/network/utils/storyStrip.util";
import { useRecordSponsoredImpressions } from "@/features/reach/hooks/useRecordSponsoredImpressions";
import { useLiveOwnLoadStoriesQuery } from "@/lib/queries/usePostsQuery";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { Plus } from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

interface StoryReelProps {
  posts: PostRow[];
  orgId?: string;
  orgName?: string;
  onCreatePost: () => void;
  headerActions?: React.ReactNode;
  /** Inside desktop 80% story column — trim outer horizontal padding. */
  embedded?: boolean;
  /**
   * Whether this org may post/broadcast load stories. Asset-only orgs can
   * view stories but never create them (they cannot give load). Default true.
   */
  canCreatePost?: boolean;
  /**
   * @deprecated No longer read. This used to duplicate a connected org's
   * sponsored post into an organic twin + an Ad bubble, which made one indent
   * look like two loads. Sponsored posts now render once. Kept so existing
   * call sites keep compiling; safe to drop from callers.
   */
  networkPartnerOrgIds?: ReadonlySet<string>;
  /**
   * When false, skip the live-own-LOAD stories query (e.g. trip/chat embeds that
   * already pass partner posts). Default true for Network / Load Center.
   */
  fetchLiveOwnLoads?: boolean;
  /** Lane indent counts from the uncollapsed strip source. */
  indentCountByPostId?: Readonly<Record<string, number>>;
}

type StoryMetrics = {
  avatar: number;
  ring: number;
  itemWidth: number;
  labelSize: number;
  labelLineHeight: number;
  addBadge: number;
  plusSize: number;
};

/** Mobile / stacked layout — compact Instagram-style bubbles. */
const STORY_METRICS_DEFAULT: StoryMetrics = {
  avatar: 52,
  ring: 60,
  itemWidth: 66,
  labelSize: 10,
  labelLineHeight: 13,
  addBadge: 20,
  plusSize: 12,
};

/** Desktop / chat strip — same compact original size. */
const STORY_METRICS_EMBEDDED: StoryMetrics = {
  avatar: 56,
  ring: 64,
  itemWidth: 72,
  labelSize: 10,
  labelLineHeight: 13,
  addBadge: 22,
  plusSize: 13,
};

function storyMetricsFor(embedded: boolean): StoryMetrics {
  return embedded ? STORY_METRICS_EMBEDDED : STORY_METRICS_DEFAULT;
}

const RING_UNSEEN = [Theme.brandBlueInk, Theme.brandBlue] as const;
const RING_SEEN = [Theme.brandBlueRing, Theme.brandBluePressed] as const;
const RING_MINE_ACTIVE = [Theme.accentGold, Theme.brandBlueInk] as const;
const RING_MINE_IDLE = [Theme.brandBlue, Theme.brandBlueInk] as const;
const RING_SPONSORED = [Theme.accentGold, Theme.brandBlueInk] as const;
const RING_SPONSORED_SEEN = [Theme.brandBlueRing, Theme.accentGold] as const;

function storyLane(post: PostRow): "ad" | "organic" {
  return post.is_sponsored ? "ad" : "organic";
}

function storySeenKey(post: PostRow): string {
  return `${post.organization_id ?? "fleet"}:${post.type}:${storyLane(post)}`;
}

function storyBubbleKey(post: PostRow): string {
  return `${post.id}:${storyLane(post)}`;
}

function activeStoryCountForBubble(posts: readonly PostRow[], bubble: PostRow): number {
  return storyIdsForBubble(posts, bubble).length;
}

/**
 * One indent = one bubble. A boosted post from a connected org previously
 * rendered twice here (an organic twin with the Ad chrome stripped, plus the
 * sponsored original), so the same load read as two separate loads in the
 * strip. Sponsored posts now show once, with their Ad badge, whether or not
 * the poster is already a connection.
 */

function StoryAvatar({
  name,
  avatarUrl,
  avatarSeed,
  organizationImageUrl,
  organizationAvatarSeed,
  initialsColorSeed,
  entityType = "supplier" as const,
  size,
}: {
  name: string;
  avatarUrl?: string | null;
  avatarSeed?: string | null;
  organizationImageUrl?: string | null;
  organizationAvatarSeed?: string | null;
  initialsColorSeed?: string | null;
  entityType?: "client" | "supplier" | "driver";
  size: number;
}) {
  return (
    <PartyAvatar
      name={name}
      avatarUrl={avatarUrl}
      avatarSeed={avatarSeed}
      organizationImageUrl={organizationImageUrl}
      organizationAvatarSeed={organizationAvatarSeed}
      initialsColorSeed={initialsColorSeed}
      entityType={entityType}
      size={size}
      style={styles.avatarPlain}
      borderStyle={styles.avatarPlain}
    />
  );
}

function StoryGradientRingSized({
  colors,
  ringSize,
  gapSize,
  children,
}: {
  colors: readonly string[];
  ringSize: number;
  gapSize: number;
  children: React.ReactNode;
}) {
  return (
    <LinearGradient
      colors={
        (colors.length >= 3
          ? [colors[0], colors[1], colors[2]]
          : [colors[0], colors[1]]) as [string, string, ...string[]]
      }
      start={{ x: 0.15, y: 0 }}
      end={{ x: 0.85, y: 1 }}
      style={[
        styles.ringGradientBase,
        { width: ringSize, height: ringSize, borderRadius: ringSize / 2 },
      ]}
    >
      <View
        style={[
          styles.ringGapBase,
          {
            width: gapSize,
            height: gapSize,
            borderRadius: gapSize / 2,
          },
        ]}
      >
        {children}
      </View>
    </LinearGradient>
  );
}

function StoryBubble({
  label,
  ringColors,
  metrics,
  onPress,
  onPressIn,
  onPressOut,
  scale,
  children,
  badge,
  caption,
  accessibilityLabel,
}: {
  label: string;
  ringColors: readonly string[];
  metrics: StoryMetrics;
  onPress: () => void;
  onPressIn?: () => void;
  onPressOut?: () => void;
  scale?: Animated.Value;
  children: React.ReactNode;
  badge?: React.ReactNode;
  /** Tiny line under the name (e.g. sponsored “Ad”). */
  caption?: string;
  accessibilityLabel?: string;
}) {
  const gapSize = metrics.avatar + 3;
  return (
    <Pressable
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      style={({ pressed }) => [
        styles.storyItem,
        { width: metrics.itemWidth },
        pressed && styles.storyItemPressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
    >
      <Animated.View
        style={[
          styles.bubbleScale,
          scale ? { transform: [{ scale }] } : undefined,
        ]}
      >
        <View
          style={[
            styles.ringStack,
            { width: metrics.ring, height: metrics.ring },
          ]}
        >
          <StoryGradientRingSized
            colors={ringColors}
            ringSize={metrics.ring}
            gapSize={gapSize}
          >
            {children}
          </StoryGradientRingSized>
          {badge}
        </View>
      </Animated.View>
      <Text
        style={[
          styles.storyName,
          { fontSize: metrics.labelSize, lineHeight: metrics.labelLineHeight },
          caption ? styles.storyNameWithCaption : null,
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
      {caption ? (
        <Text style={styles.storyCaption} numberOfLines={1}>
          {caption}
        </Text>
      ) : null}
    </Pressable>
  );
}

function BroadcastStory({
  post,
  seen,
  onPress,
  metrics,
  storyCount = 1,
}: {
  post: PostRow;
  seen: boolean;
  onPress: () => void;
  metrics: StoryMetrics;
  storyCount?: number;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const isSponsored = !!post.is_sponsored;
  const ringColors = isSponsored
    ? seen
      ? RING_SPONSORED_SEEN
      : RING_SPONSORED
    : seen
      ? RING_SEEN
      : RING_UNSEEN;

  const handlePressIn = () =>
    Animated.spring(scale, { toValue: 0.94, useNativeDriver: true }).start();
  const handlePressOut = () =>
    Animated.spring(scale, { toValue: 1, tension: 80, friction: 6, useNativeDriver: true }).start();

  const orgLabel = storyOrgPreviewLabel(post);
  const shortName = orgLabel.trim().split(/\s+/)[0] || orgLabel;
  const origin = splitLocationParts(post.origin).city;
  const drop =
    post.type === "LOAD"
      ? splitLocationParts(post.destination).city
      : splitLocationParts(post.destination).city || "Anywhere";
  const a11yDetail = [
    post.vehicle_type?.trim(),
    origin && drop ? `${origin} to ${drop}` : null,
    storyCount > 1 ? `${storyCount} stories` : null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <StoryBubble
      label={shortName}
      ringColors={ringColors}
      metrics={metrics}
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      scale={scale}
      accessibilityLabel={
        isSponsored
          ? `${shortName}, sponsored ad${a11yDetail ? `, ${a11yDetail}` : ""}`
          : `${shortName}${a11yDetail ? `, ${a11yDetail}` : ""}`
      }
      caption={isSponsored ? "Ad" : undefined}
      badge={
        <>
          {storyCount > 0 ? (
            <View style={styles.countChip} pointerEvents="none">
              <Text style={styles.countChipText}>{storyCount}</Text>
            </View>
          ) : null}
          {isSponsored ? (
            <View style={styles.adsBadge} pointerEvents="none">
              <View style={styles.adsBadgeInner}>
                <Text style={styles.adsBadgeText}>Ad</Text>
              </View>
            </View>
          ) : null}
        </>
      }
    >
      <StoryAvatar
        name={orgLabel || post.org_name || "Org"}
        organizationImageUrl={post.org_avatar_url}
        organizationAvatarSeed={post.org_avatar_seed}
        initialsColorSeed={post.organization_id}
        entityType="supplier"
        size={metrics.avatar}
      />
    </StoryBubble>
  );
}

export function StoryReel({
  posts,
  orgId,
  orgName,
  onCreatePost,
  embedded = false,
  canCreatePost = true,
  fetchLiveOwnLoads = true,
}: StoryReelProps) {
  const router = useRouter();
  const { profile } = useAuth();
  const { currentOrganization } = useOrganization();
  /** Same source as Load Center green Pulse — not limited to network-feed rows. */
  const liveOwnLoadsQ = useLiveOwnLoadStoriesQuery(orgId ?? null, {
    enabled: fetchLiveOwnLoads,
  });
  const [seenKeys, setSeenKeys] = useState<Record<string, true>>({});
  const seenStorageKey = `q:stories:seen:${orgId ?? "global"}`;
  /** Impression: sponsored story rendered here. Shared with Get Load ads. */

  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(seenStorageKey)
      .then((raw) => {
        if (!mounted) return;
        if (!raw) {
          setSeenKeys({});
          return;
        }
        const parsed = JSON.parse(raw) as Record<string, true>;
        setSeenKeys(parsed && typeof parsed === "object" ? parsed : {});
      })
      .catch(() => {
        if (mounted) setSeenKeys({});
      });
    return () => {
      mounted = false;
    };
  }, [seenStorageKey]);

  const markStorySeen = useCallback(
    (post: PostRow) => {
      const key = storySeenKey(post);
      setSeenKeys((prev) => {
        if (prev[key]) return prev;
        const next = { ...prev, [key]: true as const };
        AsyncStorage.setItem(seenStorageKey, JSON.stringify(next)).catch(() => {});
        return next;
      });
    },
    [seenStorageKey],
  );

  const businessOnly = [...posts]
    .filter((p) => p.type === "LOAD" || p.type === "VEHICLE_AVAILABILITY")
    .sort(
      (a, b) =>
        new Date(b.created_at ?? 0).getTime() -
        new Date(a.created_at ?? 0).getTime(),
    );
  const stories = selectNetworkAndSponsoredStoryPosts(businessOnly, orgId);
  const storyCountByPostId = useMemo(() => {
    const map: Record<string, number> = {};
    for (const post of stories) {
      const id = (post.id ?? "").trim();
      if (!id) continue;
      map[id] = activeStoryCountForBubble(businessOnly, post);
    }
    return map;
  }, [businessOnly, stories]);
  const ownStories: PostRow[] = [];
  for (const p of businessOnly) {
    if (!sameOrgId(p.organization_id, orgId)) continue;
    // Network feed still returns own awarded LOADs for shipper history —
    // never put those in the Mine story queue.
    if (p.type === "LOAD" && p.source_indent_id && !isIndentStoryLive(p)) {
      continue;
    }
    if (p.type === "LOAD" && p.source_indent_id && p.is_active === false) {
      continue;
    }
    ownStories.push(p);
  }
  /**
   * Mine queue = every live indent LOAD (green Pulse) + own capacity stories from
   * the feed. Do not drop sponsored loads — a boosted indent is still a live story.
   * Prefer `listLiveOwnLoadStories` over feed rows so missing feed entries still
   * produce multiple progress segments in story preview.
   */
  const ownStoryQueueResolved = useMemo(() => {
    const byId = new Map<string, PostRow>();
    for (const p of liveOwnLoadsQ.data ?? []) {
      byId.set(p.id, p);
    }
    for (const p of ownStories) {
      if (p.type === "LOAD" && p.source_indent_id) {
        // Live query is authoritative for indent LOADs; skip stale feed-only rows.
        if ((liveOwnLoadsQ.data?.length ?? 0) > 0) continue;
      }
      if (!byId.has(p.id)) byId.set(p.id, p);
    }
    return collapseStoriesByLane(
      [...byId.values()].sort(
        (a, b) =>
          new Date(b.created_at ?? 0).getTime() -
          new Date(a.created_at ?? 0).getTime(),
      ),
    );
  }, [liveOwnLoadsQ.data, ownStories]);
  const latestOwnStory = ownStoryQueueResolved[0];
  const mineActiveStoryCount = ownStoryQueueResolved.length;
  const mineQueueIds = ownStoryQueueResolved.map((s) => s.id).filter(Boolean).join(",");
  const hasOwnStories = ownStoryQueueResolved.length > 0;

  /** Mine bubble is the org brand (logo), not the signed-in user's personal avatar. */
  const mineAvatar = useMemo(() => {
    const orgLogo =
      (currentOrganization?.id === orgId
        ? currentOrganization?.logo_url
        : null
      )?.trim() ||
      (latestOwnStory?.org_avatar_url ?? "").trim() ||
      null;
    const orgSeed =
      (latestOwnStory?.org_avatar_seed ?? "").trim() || null;
    const name =
      (orgName ?? "").trim() ||
      (currentOrganization?.id === orgId
        ? currentOrganization?.name
        : null
      )?.trim() ||
      (latestOwnStory?.org_name ?? "").trim() ||
      profile?.displayName?.trim() ||
      profile?.full_name?.trim() ||
      "Mine";
    return {
      name,
      organizationImageUrl: orgLogo,
      organizationAvatarSeed: orgSeed,
      /** Personal photo only when the org has no logo yet. */
      avatarUrl: orgLogo ? null : (profile?.avatar_url ?? null),
      avatarSeed: orgLogo || orgSeed ? null : (profile?.avatar_seed ?? null),
      initialsColorSeed: orgId ?? currentOrganization?.id ?? null,
    };
  }, [
    currentOrganization?.id,
    currentOrganization?.logo_url,
    currentOrganization?.name,
    latestOwnStory?.org_avatar_seed,
    latestOwnStory?.org_avatar_url,
    latestOwnStory?.org_name,
    orgId,
    orgName,
    profile?.avatar_seed,
    profile?.avatar_url,
    profile?.displayName,
    profile?.full_name,
  ]);

  useRecordSponsoredImpressions(stories, orgId);

  const mineRing = hasOwnStories ? RING_MINE_ACTIVE : RING_MINE_IDLE;
  const metrics = storyMetricsFor(embedded);

  return (
    <View style={[styles.wrap, embedded && styles.wrapEmbedded]}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[
          styles.scroll,
          embedded && styles.scrollEmbedded,
          embedded && styles.scrollEmbeddedDesktop,
        ]}
      >
        <View style={[styles.mineCluster, embedded && styles.mineClusterEmbedded]}>
          <StoryBubble
            label="Mine"
            ringColors={mineRing}
            metrics={metrics}
            onPress={() => {
            if (!latestOwnStory) {
              // Asset-only orgs can't post loads — the empty bubble is a no-op.
              if (canCreatePost) onCreatePost();
              return;
            }
            markStorySeen(latestOwnStory);
            router.push({
              pathname: "/(modals)/story-detail",
              params: {
                postId: latestOwnStory.id,
                orgId: latestOwnStory.organization_id,
                storyType: latestOwnStory.type,
                queue: mineQueueIds,
              },
            });
          }}
          badge={
            <>
              {mineActiveStoryCount > 0 ? (
                <View style={styles.countChip} pointerEvents="none">
                  <Text style={styles.countChipText}>{mineActiveStoryCount}</Text>
                </View>
              ) : null}
            {canCreatePost ? (
            <View
              style={[
                styles.addBadge,
                {
                  width: metrics.addBadge,
                  height: metrics.addBadge,
                  borderRadius: metrics.addBadge / 2,
                  right: Math.round(metrics.ring * 0.02),
                  bottom: Math.round(metrics.ring * 0.02),
                },
              ]}
              {...(Platform.OS === "web"
                ? {
                    onClick: (e: { stopPropagation: () => void }) => {
                      e.stopPropagation();
                      router.push("/(modals)/create-post");
                    },
                  }
                : {
                    onStartShouldSetResponder: () => true,
                    onResponderRelease: () => router.push("/(modals)/create-post"),
                  })}
              hitSlop={8}
              {...(Platform.OS !== "web" && { accessibilityRole: "button" as const })}
              accessibilityLabel="Add story"
            >
              <Plus size={metrics.plusSize} color={Theme.brandBlueInk} strokeWidth={2.8} />
            </View>
            ) : null}
            </>
          }
        >
          <View
            style={[
              styles.mineDisc,
              {
                width: metrics.ring - 3,
                height: metrics.ring - 3,
                borderRadius: (metrics.ring - 3) / 2,
              },
            ]}
          >
            <StoryAvatar
              name={mineAvatar.name}
              organizationImageUrl={mineAvatar.organizationImageUrl}
              organizationAvatarSeed={mineAvatar.organizationAvatarSeed}
              avatarUrl={mineAvatar.avatarUrl}
              avatarSeed={mineAvatar.avatarSeed}
              initialsColorSeed={mineAvatar.initialsColorSeed}
              entityType="supplier"
              size={metrics.ring - 3}
            />
          </View>
          </StoryBubble>
          <View
            style={[
              styles.pulseStoryWatermark,
              embedded && styles.pulseStoryWatermarkEmbedded,
              { marginTop: Math.max(0, (metrics.ring - (embedded ? 48 : 38)) / 2) },
            ]}
            pointerEvents="none"
          >
            <PulseBrandMark
              size="lg"
              textStyle={[styles.watermarkPulse, embedded && styles.watermarkPulseEmbedded]}
            />
            <Text style={[styles.watermarkStory, embedded && styles.watermarkStoryEmbedded]}>
              story
            </Text>
          </View>
        </View>

        {stories.map((post) => (
          <BroadcastStory
            key={storyBubbleKey(post)}
            post={post}
            metrics={metrics}
            storyCount={storyCountByPostId[post.id] ?? 1}
            seen={!!seenKeys[storySeenKey(post)]}
            onPress={() => {
              markStorySeen(post);
              router.push({
                pathname: "/(modals)/story-detail",
                params: {
                  postId: post.id,
                  orgId: post.organization_id,
                  storyType: post.type,
                  queue: storyIdsForBubble(businessOnly, post).join(","),
                },
              });
            }}
          />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingTop: 12,
    paddingBottom: 12,
    overflow: "visible",
  },
  wrapEmbedded: {
    paddingTop: 10,
    paddingBottom: 12,
    minWidth: 0,
    overflow: "visible",
  },
  scroll: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    gap: 10,
    alignItems: "flex-start",
    paddingRight: 12,
    paddingTop: 6,
    // Room for the count chip and the Ad chip that hang on the ring.
    paddingBottom: 8,
    overflow: "visible",
  },
  scrollEmbedded: {
    // Parent (Network top cluster) already applies screen horizontal inset.
    paddingHorizontal: 0,
    paddingRight: 4,
  },
  scrollEmbeddedDesktop: {
    gap: 12,
    paddingTop: 2,
    paddingBottom: 8,
  },
  mineCluster: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 16,
    marginRight: 6,
    flexShrink: 0,
    paddingVertical: 2,
  },
  mineClusterEmbedded: {
    gap: 20,
    marginRight: 10,
    paddingVertical: 4,
  },
  pulseStoryWatermark: {
    justifyContent: "center",
    opacity: 0.12,
    minWidth: 52,
    marginRight: 6,
  },
  mineDisc: {
    overflow: "hidden",
    backgroundColor: Theme.brandBlue,
    alignItems: "center",
    justifyContent: "center",
  },
  pulseStoryWatermarkEmbedded: {
    opacity: 0.14,
    minWidth: 64,
    marginRight: 10,
  },
  watermarkPulse: {
    fontWeight: "700",
  },
  watermarkPulseEmbedded: {
    fontSize: 28,
    lineHeight: 30,
    letterSpacing: -1,
  },
  watermarkStory: {
    fontSize: 16,
    fontWeight: "600",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.4,
    lineHeight: 19,
    alignSelf: "flex-end",
    marginTop: -2,
  },
  watermarkStoryEmbedded: {
    fontSize: 20,
    lineHeight: 23,
  },
  storyItem: {
    alignItems: "center",
    justifyContent: "flex-start",
    overflow: "visible",
  },
  storyItemPressed: {
    opacity: 0.92,
  },
  bubbleScale: {
    overflow: "visible",
  },
  ringStack: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
    overflow: "visible",
  },
  ringGradientBase: {
    padding: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  ringGapBase: {
    backgroundColor: Theme.screenBackground,
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
  },
  avatarPlain: {
    overflow: "hidden",
    borderWidth: 0,
    borderColor: "transparent",
  },
  loadPreview: {
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
  },
  loadPreviewGlow: {
    position: "absolute",
    top: -6,
    right: -8,
    backgroundColor: Theme.screenBackground,
    opacity: 0.45,
  },
  loadPreviewIconWrap: {
    backgroundColor: Theme.screenBackground,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Theme.surfaceBorder,
  },
  loadPreviewVehicle: {
    fontWeight: "700",
    color: Theme.primary,
    textAlign: "center",
    letterSpacing: 0.35,
    textTransform: "uppercase",
    width: "100%",
  },
  loadPreviewRail: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  loadPreviewDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: Theme.primary,
  },
  loadPreviewDotEnd: {
    backgroundColor: Theme.accentBrown,
  },
  loadPreviewLine: {
    height: 2,
    backgroundColor: Theme.brandBlueInk,
    opacity: 0.22,
    marginHorizontal: 3,
    borderRadius: 2,
    overflow: "hidden",
  },
  loadPreviewTraveler: {
    position: "absolute",
    left: 0,
    top: -2,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Theme.accentGold,
  },
  loadPreviewCities: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
    gap: 4,
  },
  loadPreviewCity: {
    flex: 1,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.15,
    textAlign: "left",
  },
  loadPreviewCityEnd: {
    textAlign: "right",
  },
  countChip: {
    position: "absolute",
    top: 1,
    right: 1,
    minWidth: 22,
    height: 22,
    paddingHorizontal: 5,
    borderRadius: 11,
    backgroundColor: Theme.accentBrownDeep,
    borderWidth: 2,
    borderColor: Theme.screenBackground,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 5,
  },
  countChipText: {
    fontSize: 10,
    lineHeight: 12,
    fontWeight: "700",
    color: Theme.textOnDark,
    letterSpacing: -0.2,
    textAlign: "center",
    includeFontPadding: false,
  },
  orgBadge: {
    position: "absolute",
    right: 1,
    bottom: 1,
    padding: 1.5,
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.surfaceBorder,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    zIndex: 5,
  },
  addBadge: {
    position: "absolute",
    right: 2,
    bottom: 2,
    backgroundColor: Theme.accentGold,
    borderWidth: 2,
    borderColor: Theme.screenBackground,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: Theme.accentBrownDeep,
    shadowOpacity: 0.28,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
    zIndex: 3,
  },
  /** Floating Ad chip — centered under the ring, not clipped by ring height. */
  adsBadge: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: -5,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 4,
  },
  adsBadgeInner: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: Theme.accentBrown,
    borderWidth: 1.5,
    borderColor: Theme.screenBackground,
    shadowColor: Theme.accentBrownDeep,
    shadowOpacity: 0.4,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 4,
  },
  adsBadgeText: {
    fontSize: 8,
    fontWeight: "800",
    color: Theme.textOnPrimary,
    letterSpacing: 0.7,
    textTransform: "uppercase",
    lineHeight: 10,
  },
  storyName: {
    marginTop: 6,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    letterSpacing: 0.1,
    textAlign: "center",
    width: "100%",
  },
  storyNameWithCaption: {
    marginTop: 8,
    marginBottom: 0,
  },
  storyCaption: {
    marginTop: 1,
    fontSize: 9,
    fontWeight: "800",
    color: Theme.accentBrown,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    textAlign: "center",
    width: "100%",
  },
});
