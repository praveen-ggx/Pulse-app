/**
 * Align story / opportunity LOAD visibility with Find Work indent logic.
 *
 * If an org is only my supplier (they carry my loads — I am their client),
 * their freight broadcasts must not appear as bid opportunities for me.
 * Orgs that are also my clients (they give load) still surface.
 * Unrelated / Reach-only authors are unaffected.
 */

/**
 * Should a feed post be shown to the viewing org?
 *
 * Order matters. Sponsored posts are audience-gated server-side by
 * `get_network_feed` (via `reach_campaign_targets`), so they clear every local
 * relationship rule — those rules exist to filter the organic feed, and
 * applying them to paid reach silently discards what the customer bought.
 *
 * `partnerBooksReady` guards the remaining rules: they read the clients and
 * suppliers books, which load in queries separate from the feed. Before those
 * settle, an empty book means "not loaded yet", not "no partners" — treating
 * the two alike is what makes a story appear on first paint and then vanish.
 */
export function shouldShowFeedPostForOrg(opts: {
  authorOrgId: string | null | undefined;
  viewerOrgId: string | null | undefined;
  postType: string | null | undefined;
  isSponsored: boolean | null | undefined;
  /** False while the clients/suppliers books are still in flight. */
  partnerBooksReady: boolean;
  supplierOrgIds: ReadonlySet<string>;
  clientOrgIds: ReadonlySet<string>;
  partnerOrgIds: ReadonlySet<string>;
  /** Approved Pulse network connections (not only CRM client/supplier books). */
  networkOrgIds?: ReadonlySet<string>;
}): boolean {
  const authorOrgId = (opts.authorOrgId ?? "").trim();
  const viewerOrgId = (opts.viewerOrgId ?? "").trim();
  if (!authorOrgId || !viewerOrgId) return false;
  if (authorOrgId === viewerOrgId) return true;
  if (opts.isSponsored) return true;
  if (!opts.partnerBooksReady) return false;
  if (
    opts.postType === "LOAD" &&
    shouldHideLoadStoryFromAuthor({
      authorOrgId,
      supplierOrgIds: opts.supplierOrgIds,
      clientOrgIds: opts.clientOrgIds,
    })
  ) {
    return false;
  }
  return (
    opts.partnerOrgIds.has(authorOrgId) ||
    Boolean(opts.networkOrgIds?.has(authorOrgId))
  );
}

/** Trimmed org ids — feed rows and viewer context must compare the same way. */
export function sameOrgId(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const left = (a ?? "").trim();
  const right = (b ?? "").trim();
  return Boolean(left) && left === right;
}

/** Own-org broadcasts belong in Load Center / history, not the network story strip. */
export function isSelfNetworkStory(
  post: { organization_id?: string | null },
  viewerOrgId: string | null | undefined,
): boolean {
  return sameOrgId(post.organization_id, viewerOrgId);
}

export function isStoryReelPostType(type: string | null | undefined): boolean {
  return type === "LOAD" || type === "VEHICLE_AVAILABILITY";
}

function storyReelDedupeKey(post: {
  organization_id?: string | null;
  type?: string | null;
  is_sponsored?: boolean | null;
}): string {
  const lane = post.is_sponsored ? "ad" : "organic";
  // One bubble per org per type per lane. Per-indent keys stacked every
  // Godrej load (and twins of the same lane) across the strip.
  return `${post.organization_id ?? "fleet"}:${post.type}:${lane}`;
}

/**
 * Horizontal pulse-story row: connected-org indent stories + sponsored
 * Pulse Boost indent ads (and capacity alerts). Never includes the viewer's
 * own posts (no Mine bubble, no self twins on the right).
 */
export function selectNetworkAndSponsoredStoryPosts<
  T extends {
    id?: string | null;
    organization_id?: string | null;
    type?: string | null;
    is_sponsored?: boolean | null;
    created_at?: string | null;
  },
>(posts: T[], viewerOrgId: string | null | undefined, limit = 24): T[] {
  const businessOnly = [...posts]
    .filter((p) => isStoryReelPostType(p.type ?? null))
    .filter((p) => !isSelfNetworkStory(p, viewerOrgId))
    .sort((a, b) => {
      const aAd = a.is_sponsored ? 1 : 0;
      const bAd = b.is_sponsored ? 1 : 0;
      if (aAd !== bAd) return bAd - aAd;
      return (
        new Date(b.created_at ?? 0).getTime() -
        new Date(a.created_at ?? 0).getTime()
      );
    });
  const seenKeys = new Set<string>();
  const stories: T[] = [];
  for (const p of businessOnly) {
    const storyKey = storyReelDedupeKey(p);
    if (seenKeys.has(storyKey)) continue;
    seenKeys.add(storyKey);
    stories.push(p);
    if (stories.length >= limit) break;
  }
  return stories;
}

export function shouldHideLoadStoryFromAuthor(opts: {
  authorOrgId: string | null | undefined;
  /** linked_organization_id values from my integrated suppliers book */
  supplierOrgIds: ReadonlySet<string>;
  /** linked_organization_id values from my integrated clients book */
  clientOrgIds: ReadonlySet<string>;
}): boolean {
  const id = (opts.authorOrgId ?? "").trim();
  if (!id) return true;
  if (!opts.supplierOrgIds.has(id)) return false;
  // Dual-role counterparty: still a shipper I can bid for.
  if (opts.clientOrgIds.has(id)) return false;
  return true;
}
