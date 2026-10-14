/**
 * Load Center — opportunity exchange strip.
 * Get load: sponsored Reach load ads only — every other Network indent is
 * quoted through its Indent Pool on the Network Loads board.
 * Give load: idle VEHICLE_AVAILABILITY stories + sponsored capacity ads.
 *
 * Card chrome aligned with IndentMobileLoadDetail (Ajio-style density).
 * Avatars use PartyAvatar org hierarchy: logo → seed → initials.
 */
import { PartyAvatar } from "@/components/PartyAvatar";
import { LoadCenterSidebarFindEmpty } from "@/features/network/components/LoadCenterSidebarFindEmpty";
import Theme from "@/constants/Theme";
import { useLinkedOrgDisplayMap } from "@/lib/queries/useLinkedOrgDisplayQuery";
import type { LinkedOrgDisplay } from "@/lib/useLinkedOrgProfileMap";
import type { DirectQuoteRow } from "@/features/indents";
import type { PostRow } from "@/features/network/services/posts.service";
import { getMyBidsForPostIds } from "@/features/network/services/bids.service";
import {
  opportunityPostAvatarProps,
  type IndentCardAvatarProps,
} from "@/features/network/utils/indentCardAvatar.util";
import { MarketplaceRouteGrid } from "@/features/network/components/MarketplaceLoadCardChrome";
import {
  formatCapacityMaterial,
  formatStoryDate,
  isFleetOwnerCapacityPost,
} from "@/features/network/utils/storyDisplay";
import { shouldHideLoadStoryFromAuthor } from "@/features/network/utils/storyLoadVisibility.util";
import { isSponsoredReachPost } from "@/features/network/utils/sponsoredReach.util";
import { formatINR } from "@/lib/format";
import { useMyDirectQuotesQuery } from "@/lib/queries";
import { useNetworkFeedQuery } from "@/lib/queries/usePostsQuery";
import { queryKeys } from "@/lib/queryKeys";
import { STALE } from "@/lib/queryClient";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { ArrowRight, Truck } from "lucide-react-native";
import { memo, useMemo } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

export type LoadCenterOpportunityMode = "give" | "get";

/** Viewer’s active bid/quote on a Find-loads opportunity. */
export type OpportunityViewerBid = {
  status: string;
  amount: number;
  counterAmount: number | null;
};

type LoadCenterOpportunityExchangeProps = {
  orgId: string | null;
  mode: LoadCenterOpportunityMode;
  /** Trim outer horizontal padding when already inside a padded canvas. */
  embedded?: boolean;
  /** Full-width horizontal strip below the search bar. */
  fullBleed?: boolean;
  /**
   * Vertical stack for a Kanban column (e.g. Get Load → Open Market).
   * Full-width cards; returns null when there are no matching posts.
   */
  columnStack?: boolean;
  /**
   * Left Give Load rail: header + vertical idle-capacity cards
   * (replaces Story / Pulse Reach promo banners).
   */
  sidebarStack?: boolean;
  /**
   * Orgs in my suppliers book (linked). LOAD posts from supplier-only
   * counterparties are hidden in Get Load — same rule as Find Work.
   */
  supplierOrgIds?: ReadonlySet<string>;
  /** Orgs in my clients book (linked). Overrides supplier hide when dual-role. */
  clientOrgIds?: ReadonlySet<string>;
};

const MAX_CARDS = 12;
const LINK = "#2563EB";
const MUTED = "#6B7280";
const BODY = "#4B5563";
const INK = "#111827";
const BORDER = "#E5E7EB";
const CARD_EDGE = "#D1D5DB";
const CANVAS_SOFT = "#F9FAFB";
const CARD_W = 260;
const AVATAR = 32;

const EMPTY_ORG_SET: ReadonlySet<string> = new Set();

function formatWeightTonnes(weight: number | null | undefined): string | null {
  if (weight == null || !Number.isFinite(weight) || weight <= 0) return null;
  return weight >= 1
    ? `${Number.isInteger(weight) ? weight : weight.toFixed(1)} t`
    : `${Math.round(weight * 1000)} kg`;
}

function filterOpportunityPosts(
  posts: PostRow[],
  orgId: string,
  mode: LoadCenterOpportunityMode,
  supplierOrgIds?: ReadonlySet<string>,
  clientOrgIds?: ReadonlySet<string>,
): PostRow[] {
  const wantType = mode === "get" ? "LOAD" : "VEHICLE_AVAILABILITY";
  const suppliers = supplierOrgIds ?? EMPTY_ORG_SET;
  const clients = clientOrgIds ?? EMPTY_ORG_SET;
  const matched = posts.filter((p) => {
    if (!p.is_active) return false;
    if ((p.type ?? "").toUpperCase() !== wantType) return false;
    // Only sponsored Reach loads are individual opportunities; every other
    // Network indent is quoted through its Indent Pool.
    if (wantType === "LOAD" && !isSponsoredReachPost(p)) return false;

    if (mode === "give" && isFleetOwnerCapacityPost(p)) return true;

    if (p.organization_id != null && p.organization_id === orgId) return false;

    if (p.is_sponsored) return true;
    if (
      mode === "get" &&
      shouldHideLoadStoryFromAuthor({
        authorOrgId: p.organization_id,
        supplierOrgIds: suppliers,
        clientOrgIds: clients,
      })
    ) {
      return false;
    }
    return true;
  });

  matched.sort((a, b) => {
    const aSponsored = a.is_sponsored ? 1 : 0;
    const bSponsored = b.is_sponsored ? 1 : 0;
    if (aSponsored !== bSponsored) return bSponsored - aSponsored;
    if (mode === "give") {
      const aFo = isFleetOwnerCapacityPost(a) ? 1 : 0;
      const bFo = isFleetOwnerCapacityPost(b) ? 1 : 0;
      if (aFo !== bFo) return bFo - aFo;
    }
    return (
      new Date(b.created_at ?? 0).getTime() -
      new Date(a.created_at ?? 0).getTime()
    );
  });

  return matched.slice(0, MAX_CARDS);
}

function quoteCounterAmount(quote: DirectQuoteRow): number | null {
  const n = Number(quote.counter_amount ?? 0);
  return n > 0 ? n : null;
}

/** Prefer direct quote on source indent; fall back to story bid. */
export function resolveOpportunityViewerBid(
  post: PostRow,
  quotesByIndentId: ReadonlyMap<string, DirectQuoteRow>,
  bidsByPostId: ReadonlyMap<string, OpportunityViewerBid>,
): OpportunityViewerBid | null {
  const indentId = (post.source_indent_id ?? "").trim();
  if (indentId) {
    const quote = quotesByIndentId.get(indentId);
    if (quote) {
      const status = (quote.status ?? "pending").toLowerCase();
      if (status === "withdrawn") return null;
      return {
        status,
        amount: Number(quote.amount ?? 0),
        counterAmount: quoteCounterAmount(quote),
      };
    }
  }
  return bidsByPostId.get(post.id) ?? null;
}

/**
 * Org logo → owner avatar → seed → initials (Get Load hub parity).
 * Fleet capacity without branding gets a truck plate.
 */
function OpportunityOrgAvatar({
  post,
  isLoad,
  isFleetCapacity,
  avatar,
}: {
  post: PostRow;
  isLoad: boolean;
  isFleetCapacity: boolean;
  avatar: IndentCardAvatarProps;
}) {
  const displayName = (post.org_name ?? "").trim() || "Fleet";
  const orgLogo = (avatar.organizationImageUrl ?? "").trim() || null;
  const orgSeed = (avatar.organizationAvatarSeed ?? "").trim() || null;
  const contactUrl = (avatar.avatarUrl ?? "").trim() || null;
  const contactSeed = (avatar.avatarSeed ?? "").trim() || null;

  if (isFleetCapacity && !orgLogo && !orgSeed && !contactUrl && !contactSeed) {
    return (
      <View style={styles.avatarFleetPlate} accessibilityLabel="Fleet capacity">
        <Truck size={16} color={INK} strokeWidth={2.2} />
      </View>
    );
  }

  return (
    <PartyAvatar
      name={displayName}
      organizationImageUrl={orgLogo}
      organizationAvatarSeed={orgSeed}
      avatarUrl={contactUrl}
      avatarSeed={contactSeed}
      entityType={isLoad ? "client" : "supplier"}
      isIntegrated
      size={AVATAR}
      initialsColorSeed={avatar.initialsColorSeed}
      shape="circle"
    />
  );
}

export const OpportunityCard = memo(function OpportunityCard({
  post,
  mode,
  onPress,
  fillWidth = false,
  viewerBid = null,
  orgProfileMap,
}: {
  post: PostRow;
  mode: LoadCenterOpportunityMode;
  onPress: () => void;
  fillWidth?: boolean;
  /** When set, this load already has our bid/quote — do not show plain LIVE. */
  viewerBid?: OpportunityViewerBid | null;
  /** Batch partner display — logo → owner avatar → seed (Get Load hub parity). */
  orgProfileMap?: Record<string, LinkedOrgDisplay>;
}) {
  const isSponsored = !!post.is_sponsored;
  const isLoad = mode === "get";
  const isFleetCapacity = isFleetOwnerCapacityPost(post);
  const avatar = opportunityPostAvatarProps(post, orgProfileMap);

  const vehicle =
    post.vehicle_type?.trim() || (isLoad ? "Any vehicle" : "Capacity");
  const material = formatCapacityMaterial(post.material);
  const weight = formatWeightTonnes(post.weight_tonnes);
  const rate =
    post.rate_offer != null && Number.isFinite(post.rate_offer)
      ? formatINR(post.rate_offer)
      : null;
  const posted = post.created_at ? formatStoryDate(post.created_at) : null;
  const loadDate = post.load_date ? formatStoryDate(post.load_date) : null;
  const displayOrgName = (post.org_name ?? "").trim() || "Fleet availability";

  const bidStatus = (viewerBid?.status ?? "").toLowerCase();
  const hasActiveBid = isLoad && viewerBid != null && bidStatus !== "withdrawn";
  const isCountered =
    hasActiveBid &&
    bidStatus === "pending" &&
    viewerBid!.counterAmount != null &&
    viewerBid!.counterAmount > 0;
  const isPendingBid = hasActiveBid && bidStatus === "pending" && !isCountered;
  const isWonBid = hasActiveBid && bidStatus === "accepted";
  const isDeclinedBid = hasActiveBid && bidStatus === "rejected";

  const statusLabel = isSponsored
    ? "AD"
    : isFleetCapacity
      ? "FLEET"
      : isCountered
        ? "COUNTER"
        : isWonBid
          ? "WON"
          : isDeclinedBid
            ? "DECLINED"
            : isPendingBid
              ? "BIDDED"
              : "LIVE";

  const statusTone: "ad" | "fleet" | "live" | "bidded" | "counter" | "won" | "declined" =
    isSponsored
      ? "ad"
      : isFleetCapacity
        ? "fleet"
        : isCountered
          ? "counter"
          : isWonBid
            ? "won"
            : isDeclinedBid
              ? "declined"
              : isPendingBid
                ? "bidded"
                : "live";

  const channelLabel = isSponsored
    ? isLoad
      ? "Sponsored load"
      : "Sponsored capacity"
    : isFleetCapacity
      ? "Driver capacity"
      : isLoad
        ? hasActiveBid
          ? isCountered
            ? "Counter offer received"
            : isWonBid
              ? "Your bid won"
              : isDeclinedBid
                ? "Bid not selected"
                : "You already bid"
          : "Network indent"
        : "Network capacity";

  const ctaLabel = !isLoad
    ? "View"
    : isPendingBid || isCountered
      ? "Update bid"
      : isWonBid
        ? "View award"
        : "View & bid";

  const yourBidAmount =
    hasActiveBid && viewerBid!.amount > 0 ? formatINR(viewerBid!.amount) : null;
  const counterAmountLabel =
    isCountered && viewerBid!.counterAmount != null
      ? formatINR(viewerBid!.counterAmount)
      : null;

  const specChips = [vehicle, weight, material].filter(Boolean) as string[];

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        fillWidth && styles.cardFillWidth,
        isSponsored && styles.cardSponsored,
        pressed && styles.cardPressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={
        isSponsored
          ? `Sponsored ${isLoad ? "load" : "capacity"} from ${displayOrgName}`
          : isFleetCapacity
            ? `Fleet availability ${vehicle}`
            : hasActiveBid
              ? `${statusLabel} load from ${displayOrgName}`
              : `${isLoad ? "Indent from network" : "Idle vehicle"} from ${displayOrgName}`
      }
    >
      {isSponsored ? <View style={styles.sponsoredAccent} /> : null}

      <View style={styles.cardTop}>
        <OpportunityOrgAvatar
          post={post}
          isLoad={isLoad}
          isFleetCapacity={isFleetCapacity}
          avatar={avatar}
        />
        <View style={styles.cardTopText}>
          <Text style={styles.orgName} numberOfLines={1}>
            {isFleetCapacity ? "Fleet availability" : displayOrgName}
          </Text>
          <Text style={styles.metaLine} numberOfLines={1}>
            {channelLabel}
            {posted ? ` · ${posted}` : ""}
          </Text>
        </View>
        <View
          style={[
            styles.statusChip,
            statusTone === "ad" && styles.statusChipAd,
            statusTone === "fleet" && styles.statusChipFleet,
            statusTone === "live" && styles.statusChipLive,
            statusTone === "bidded" && styles.statusChipBidded,
            statusTone === "counter" && styles.statusChipCounter,
            statusTone === "won" && styles.statusChipWon,
            statusTone === "declined" && styles.statusChipDeclined,
          ]}
        >
          <Text
            style={[
              styles.statusChipText,
              statusTone === "ad" && styles.statusChipTextAd,
              statusTone === "fleet" && styles.statusChipTextFleet,
              statusTone === "live" && styles.statusChipTextLive,
              statusTone === "bidded" && styles.statusChipTextBidded,
              statusTone === "counter" && styles.statusChipTextCounter,
              statusTone === "won" && styles.statusChipTextWon,
              statusTone === "declined" && styles.statusChipTextDeclined,
            ]}
          >
            {statusLabel}
          </Text>
        </View>
      </View>

      <MarketplaceRouteGrid
        pickup={post.origin}
        drop={isLoad ? post.destination : post.destination || "Anywhere"}
      />

      {specChips.length > 0 || loadDate ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.specScroll}
          contentContainerStyle={styles.specRow}
        >
          {specChips.map((chip) => (
            <View key={chip} style={styles.specChip}>
              <Text style={styles.specChipText} numberOfLines={1}>
                {chip}
              </Text>
            </View>
          ))}
          {loadDate ? (
            <View style={[styles.specChip, styles.specChipDate]}>
              <Text style={styles.specChipDateText} numberOfLines={1}>
                {loadDate}
              </Text>
            </View>
          ) : null}
        </ScrollView>
      ) : null}

      <View style={styles.priceRow}>
        <View style={styles.priceCol}>
          {counterAmountLabel ? (
            <>
              <Text style={styles.priceHint}>Counter</Text>
              <Text style={styles.price} numberOfLines={1}>
                {counterAmountLabel}
              </Text>
              {yourBidAmount ? (
                <Text style={styles.priceMuted} numberOfLines={1}>
                  Your bid {yourBidAmount}
                </Text>
              ) : null}
            </>
          ) : yourBidAmount ? (
            <>
              <Text style={styles.priceHint}>Your bid</Text>
              <Text style={styles.price} numberOfLines={1}>
                {yourBidAmount}
              </Text>
            </>
          ) : rate ? (
            <>
              <Text style={styles.priceHint}>
                {isLoad ? "Offer" : "Asking"}
              </Text>
              <Text style={styles.price} numberOfLines={1}>
                {rate}
              </Text>
            </>
          ) : (
            <Text style={styles.priceMuted} numberOfLines={1}>
              {isLoad ? "Rate on request" : "Open capacity"}
            </Text>
          )}
        </View>
        <View style={styles.ctaHit}>
          <Text style={styles.ctaText}>{ctaLabel}</Text>
          <ArrowRight size={12} color={LINK} strokeWidth={2.4} />
        </View>
      </View>
    </Pressable>
  );
});

export function useLoadCenterOpportunityPosts(
  orgId: string | null,
  mode: LoadCenterOpportunityMode,
  supplierOrgIds?: ReadonlySet<string>,
  clientOrgIds?: ReadonlySet<string>,
): {
  posts: PostRow[];
  isLoading: boolean;
  viewerBidByPostId: ReadonlyMap<string, OpportunityViewerBid>;
  orgProfileMap: Record<string, LinkedOrgDisplay>;
} {
  const feedQ = useNetworkFeedQuery(orgId, { enabled: !!orgId });
  const posts = useMemo(
    () =>
      orgId
        ? filterOpportunityPosts(
            feedQ.data ?? [],
            orgId,
            mode,
            supplierOrgIds,
            clientOrgIds,
          )
        : [],
    [feedQ.data, orgId, mode, supplierOrgIds, clientOrgIds],
  );

  const creatorOrgIds = useMemo(() => {
    const set = new Set<string>();
    for (const post of posts) {
      const id = (post.organization_id ?? "").trim();
      if (id) set.add(id);
    }
    return Array.from(set).sort();
  }, [posts]);

  const orgProfileMap = useLinkedOrgDisplayMap(creatorOrgIds);

  const loadMode = mode === "get";
  const myQuotesQ = useMyDirectQuotesQuery(loadMode ? orgId : null);

  const quotesByIndentId = useMemo(() => {
    const map = new Map<string, DirectQuoteRow>();
    for (const quote of myQuotesQ.data ?? []) {
      if (!quote.indent_id) continue;
      const status = (quote.status ?? "").toLowerCase();
      if (status === "withdrawn") continue;
      map.set(quote.indent_id, quote);
    }
    return map;
  }, [myQuotesQ.data]);

  const postIdsNeedingBidLookup = useMemo(() => {
    if (!loadMode) return [] as string[];
    return posts
      .filter((p) => {
        const indentId = (p.source_indent_id ?? "").trim();
        if (indentId && quotesByIndentId.has(indentId)) return false;
        return true;
      })
      .map((p) => p.id);
  }, [loadMode, posts, quotesByIndentId]);

  const myBidsQ = useQuery({
    queryKey: [
      ...queryKeys.bids.myBid("batch", orgId ?? ""),
      postIdsNeedingBidLookup.slice().sort().join(","),
    ],
    queryFn: async () => {
      const res = await getMyBidsForPostIds(orgId!, postIdsNeedingBidLookup);
      if (res.error) throw res.error;
      return res.bids;
    },
    enabled: loadMode && !!orgId && postIdsNeedingBidLookup.length > 0,
    staleTime: STALE.moderate,
  });

  const bidsByPostId = useMemo(() => {
    const map = new Map<string, OpportunityViewerBid>();
    for (const bid of myBidsQ.data ?? []) {
      const status = (bid.status ?? "pending").toLowerCase();
      if (status === "withdrawn") continue;
      map.set(bid.post_id, {
        status,
        amount: Number(bid.amount ?? 0),
        counterAmount: null,
      });
    }
    return map;
  }, [myBidsQ.data]);

  const viewerBidByPostId = useMemo(() => {
    const map = new Map<string, OpportunityViewerBid>();
    if (!loadMode) return map;
    for (const post of posts) {
      const bid = resolveOpportunityViewerBid(
        post,
        quotesByIndentId,
        bidsByPostId,
      );
      if (bid) map.set(post.id, bid);
    }
    return map;
  }, [loadMode, posts, quotesByIndentId, bidsByPostId]);

  return {
    posts,
    isLoading: feedQ.isLoading,
    viewerBidByPostId,
    orgProfileMap,
  };
}

/** Posts still open to bid — excludes loads the viewer already quoted/bid on. */
export function filterUnbiddedOpportunityPosts(
  posts: PostRow[],
  viewerBidByPostId: ReadonlyMap<string, OpportunityViewerBid>,
): PostRow[] {
  return posts.filter((p) => !viewerBidByPostId.has(p.id));
}

export function LoadCenterOpportunityExchange({
  orgId,
  mode,
  embedded = false,
  fullBleed = false,
  columnStack = false,
  sidebarStack = false,
  supplierOrgIds,
  clientOrgIds,
}: LoadCenterOpportunityExchangeProps) {
  const router = useRouter();
  const { posts, isLoading, viewerBidByPostId, orgProfileMap } =
    useLoadCenterOpportunityPosts(
      orgId,
      mode,
      supplierOrgIds,
      clientOrgIds,
    );

  /**
   * Open Market kanban column: only show loads not yet bid on.
   * Already-bid loads live in My Bids (indent hub cards) — avoid duplicates.
   * Find drawer / carousel keep bidded cards (BIDDED badge).
   */
  const displayPosts = useMemo(() => {
    if (columnStack && mode === "get") {
      return filterUnbiddedOpportunityPosts(posts, viewerBidByPostId);
    }
    return posts;
  }, [columnStack, mode, posts, viewerBidByPostId]);

  const isGet = mode === "get";

  const sponsoredCount = displayPosts.filter((p) => p.is_sponsored).length;
  const biddedCount = isGet
    ? displayPosts.filter((p) => !p.is_sponsored && viewerBidByPostId.has(p.id))
        .length
    : 0;
  const networkCount = displayPosts.length - sponsoredCount;
  const liveOpenCount = Math.max(0, networkCount - biddedCount);
  const title = isGet ? "Sponsored loads" : "Idle capacity nearby";
  const subtitle = isGet
    ? "Sponsored Reach loads — bid on each load"
    : "Sponsored capacity and fleet Stories";
  const loadingSidebarText = isGet ? "Finding loads…" : "Finding capacity…";

  const openStory = (post: PostRow) => {
    router.push({
      pathname: "/(modals)/story-detail",
      params: {
        postId: post.id,
        ...(post.organization_id
          ? { orgId: post.organization_id }
          : {}),
        storyType: post.type,
      },
    });
  };

  if (!orgId) return null;

  const header = (
    <View style={styles.header}>
      <View style={styles.headerText}>
        <Text style={styles.headerTitle}>{title}</Text>
        <Text style={styles.headerSub} numberOfLines={sidebarStack ? 2 : 1}>
          {subtitle}
        </Text>
      </View>
      <View style={styles.countCluster}>
        {sponsoredCount > 0 ? (
          <View style={[styles.countChip, styles.countChipAd]}>
            <Text style={[styles.countChipText, styles.countChipTextAd]}>
              {sponsoredCount} Ads
            </Text>
          </View>
        ) : null}
        {liveOpenCount > 0 ? (
          <View style={[styles.countChip, styles.countChipLive]}>
            <Text style={[styles.countChipText, styles.countChipTextLive]}>
              {liveOpenCount} live
            </Text>
          </View>
        ) : null}
        {biddedCount > 0 ? (
          <View style={[styles.countChip, styles.countChipBidded]}>
            <Text style={[styles.countChipText, styles.countChipTextBidded]}>
              {biddedCount} bidded
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );

  if (columnStack || sidebarStack) {
    const waitOnFeed = isLoading && posts.length === 0;
    if (waitOnFeed) {
      if (!sidebarStack) return null;
      return (
        <View
          style={[styles.wrap, styles.wrapSidebar, embedded && styles.wrapEmbedded]}
        >
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color={Theme.accentBrown} />
            <Text style={styles.loadingText}>{loadingSidebarText}</Text>
          </View>
        </View>
      );
    }
    if (displayPosts.length === 0) {
      if (!sidebarStack) return null;
      return (
        <View
          style={[styles.wrap, styles.wrapSidebar, embedded && styles.wrapEmbedded]}
        >
          {header}
          <LoadCenterSidebarFindEmpty mode={mode} plain />
        </View>
      );
    }

    const cards = displayPosts.map((post) => (
      <OpportunityCard
        key={post.id}
        post={post}
        mode={mode}
        fillWidth
        viewerBid={viewerBidByPostId.get(post.id) ?? null}
        orgProfileMap={orgProfileMap}
        onPress={() => openStory(post)}
      />
    ));

    if (columnStack) {
      return <View style={styles.columnStack}>{cards}</View>;
    }

    return (
      <View
        style={[styles.wrap, styles.wrapSidebar, embedded && styles.wrapEmbedded]}
      >
        {header}
        <ScrollView
          style={styles.sidebarScroll}
          contentContainerStyle={styles.columnStack}
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled
        >
          {cards}
        </ScrollView>
      </View>
    );
  }

  if (isLoading && posts.length === 0) {
    return (
      <View
        style={[
          styles.wrap,
          embedded && styles.wrapEmbedded,
          fullBleed && styles.wrapFullBleed,
        ]}
      >
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={Theme.accentBrown} />
          <Text style={styles.loadingText}>Finding opportunities…</Text>
        </View>
      </View>
    );
  }
  if (posts.length === 0) return null;

  return (
    <View
      style={[
        styles.wrap,
        embedded && styles.wrapEmbedded,
        fullBleed && styles.wrapFullBleed,
      ]}
    >
      {header}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={fullBleed}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scroll,
          fullBleed && styles.scrollFullBleed,
        ]}
        style={fullBleed ? styles.scrollViewFullBleed : undefined}
        decelerationRate="fast"
        snapToInterval={CARD_W + 8}
        snapToAlignment="start"
      >
        {posts.map((post) => (
          <OpportunityCard
            key={post.id}
            post={post}
            mode={mode}
            viewerBid={viewerBidByPostId.get(post.id) ?? null}
            orgProfileMap={orgProfileMap}
            onPress={() => openStory(post)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

const cardShadow = Platform.select({
  ios: {
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
  },
  android: { elevation: 2 },
  web: {
    boxShadow:
      "0 1px 2px rgba(15, 23, 42, 0.04), 0 4px 12px rgba(15, 23, 42, 0.06)",
  } as object,
  default: {},
});

const styles = StyleSheet.create({
  wrap: {
    gap: 10,
    marginBottom: 0,
    paddingTop: 2,
  },
  wrapEmbedded: {
    marginHorizontal: 0,
    marginBottom: 0,
  },
  wrapFullBleed: {
    width: "100%",
    marginBottom: 0,
    paddingTop: 10,
    paddingBottom: 8,
    paddingHorizontal: 12,
    gap: 10,
    backgroundColor: Theme.cardWhite,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER,
  },
  wrapSidebar: {
    width: "100%",
    flexGrow: 1,
    flexShrink: 1,
    minHeight: 0,
    overflow: "hidden",
    marginBottom: 0,
    paddingTop: 12,
    paddingBottom: 12,
    paddingHorizontal: 12,
    gap: 10,
    borderRadius: 12,
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: CARD_EDGE,
    ...Platform.select({
      web: {
        display: "flex",
        flexDirection: "column",
        height: "100%",
        minHeight: 0,
      } as object,
      default: {},
    }),
  },
  scrollViewFullBleed: {
    width: "100%",
    marginHorizontal: 0,
  },
  scrollFullBleed: {
    paddingVertical: 2,
    paddingRight: 4,
    flexGrow: 1,
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
  },
  loadingText: {
    fontSize: 11,
    fontWeight: "500",
    color: MUTED,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  headerText: { flex: 1, minWidth: 0, gap: 2 },
  headerTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: INK,
    letterSpacing: -0.15,
  },
  headerSub: {
    fontSize: 11,
    fontWeight: "400",
    color: MUTED,
    lineHeight: 14,
  },
  countCluster: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 0,
    paddingTop: 1,
  },
  countChip: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "transparent",
  },
  countChipAd: {
    backgroundColor: Theme.accentBrownWash,
    borderColor: Theme.accentBrownBorder,
  },
  countChipLive: {
    backgroundColor: "#ECFDF5",
    borderColor: "rgba(21, 128, 61, 0.18)",
  },
  countChipBidded: {
    backgroundColor: "#EFF6FF",
    borderColor: "rgba(37, 99, 235, 0.22)",
  },
  countChipText: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  countChipTextAd: {
    color: Theme.accentBrown,
  },
  countChipTextLive: {
    color: Theme.positive,
  },
  countChipTextBidded: {
    color: LINK,
  },
  scroll: {
    gap: 10,
    paddingVertical: 2,
    paddingRight: 4,
  },
  columnStack: {
    width: "100%",
    gap: 10,
    marginBottom: 2,
    paddingBottom: 8,
  },
  sidebarScroll: {
    flex: 1,
    minHeight: 0,
    width: "100%",
  },
  card: {
    position: "relative",
    width: CARD_W,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: CARD_EDGE,
    backgroundColor: Theme.cardWhite,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 0,
    gap: 12,
    overflow: "hidden",
    ...cardShadow,
  },
  cardFillWidth: {
    width: "100%",
    alignSelf: "stretch",
  },
  cardSponsored: {
    borderColor: Theme.accentBrownBorder,
  },
  cardPressed: { opacity: 0.94 },
  sponsoredAccent: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    backgroundColor: Theme.accentBrown,
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  avatarRing: {
    width: AVATAR + 2,
    height: AVATAR + 2,
    borderRadius: (AVATAR + 2) / 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
    backgroundColor: CANVAS_SOFT,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    flexShrink: 0,
  },
  avatarFleetPlate: {
    width: AVATAR + 2,
    height: AVATAR + 2,
    borderRadius: 8,
    backgroundColor: CANVAS_SOFT,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  cardTopText: { flex: 1, minWidth: 0, gap: 3 },
  orgName: {
    fontSize: 14,
    fontWeight: "700",
    color: INK,
    letterSpacing: -0.2,
  },
  metaLine: {
    fontSize: 11,
    fontWeight: "400",
    color: MUTED,
    lineHeight: 14,
  },
  statusChip: {
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 6,
    flexShrink: 0,
    alignSelf: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "transparent",
  },
  statusChipAd: {
    backgroundColor: Theme.accentBrownWash,
    borderColor: Theme.accentBrownBorder,
  },
  statusChipLive: {
    backgroundColor: "#ECFDF5",
    borderColor: "rgba(21, 128, 61, 0.18)",
  },
  statusChipBidded: {
    backgroundColor: "#EFF6FF",
    borderColor: "rgba(37, 99, 235, 0.22)",
  },
  statusChipCounter: {
    backgroundColor: "#FFF7ED",
    borderColor: "rgba(234, 88, 12, 0.22)",
  },
  statusChipWon: {
    backgroundColor: "#ECFDF5",
    borderColor: "rgba(21, 128, 61, 0.22)",
  },
  statusChipDeclined: {
    backgroundColor: "#FEF2F2",
    borderColor: "rgba(220, 38, 38, 0.2)",
  },
  statusChipFleet: {
    backgroundColor: CANVAS_SOFT,
    borderColor: BORDER,
  },
  statusChipText: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  statusChipTextAd: {
    color: Theme.accentBrownDeep,
  },
  statusChipTextLive: {
    color: Theme.positive,
  },
  statusChipTextBidded: {
    color: LINK,
  },
  statusChipTextCounter: {
    color: "#C2410C",
  },
  statusChipTextWon: {
    color: Theme.positive,
  },
  statusChipTextDeclined: {
    color: Theme.destructive,
  },
  statusChipTextFleet: {
    color: BODY,
  },
  routeGrid: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
  },
  routeCol: {
    flex: 1,
    minWidth: 0,
  },
  routeColEnd: {
    alignItems: "flex-end",
  },
  routeSep: {
    paddingTop: 16,
    width: 28,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  routeSepLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: CARD_EDGE,
  },
  routeLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: MUTED,
    letterSpacing: 0.45,
    textTransform: "uppercase",
    marginBottom: 3,
  },
  routeLabelEnd: {
    textAlign: "right",
  },
  routeValue: {
    fontSize: 14,
    fontWeight: "700",
    color: INK,
    lineHeight: 19,
    letterSpacing: -0.15,
  },
  routeValueEnd: {
    textAlign: "right",
  },
  routeState: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: "400",
    color: BODY,
    lineHeight: 14,
  },
  specScroll: {
    width: "100%",
    flexGrow: 0,
  },
  specRow: {
    flexDirection: "row",
    flexWrap: "nowrap",
    alignItems: "center",
    gap: 6,
    paddingRight: 2,
  },
  specChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: CANVAS_SOFT,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
    flexShrink: 0,
  },
  specChipDate: {
    backgroundColor: "#EFF6FF",
    borderColor: "rgba(37, 99, 235, 0.28)",
  },
  specChipText: {
    fontSize: 10,
    fontWeight: "500",
    color: BODY,
    lineHeight: 13,
  },
  specChipDateText: {
    fontSize: 10,
    fontWeight: "600",
    color: LINK,
    lineHeight: 13,
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginHorizontal: -14,
    marginTop: 2,
    paddingHorizontal: 14,
    paddingTop: 11,
    paddingBottom: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: BORDER,
    backgroundColor: CANVAS_SOFT,
  },
  priceCol: { flex: 1, minWidth: 0, gap: 1 },
  priceHint: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.45,
    textTransform: "uppercase",
    color: MUTED,
    lineHeight: 12,
  },
  price: {
    fontSize: 16,
    fontWeight: "700",
    color: INK,
    fontVariant: ["tabular-nums"],
    letterSpacing: -0.3,
    lineHeight: 20,
  },
  priceMuted: {
    fontSize: 12,
    fontWeight: "500",
    color: MUTED,
  },
  ctaHit: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    flexShrink: 0,
    paddingVertical: 2,
  },
  ctaText: {
    fontSize: 12,
    fontWeight: "600",
    color: LINK,
  },
});
