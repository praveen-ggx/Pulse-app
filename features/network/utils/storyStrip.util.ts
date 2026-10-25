import { isIndentStoryLive } from "@/features/network/utils/indentStoryWindow.util";
import {
  isSelfNetworkStory,
  isStoryReelPostType,
  selectNetworkAndSponsoredStoryPosts,
} from "@/features/network/utils/storyLoadVisibility.util";

/**
 * Story strip + preview audience.
 * Pulse Boost extras stay out. Anyone in Your connections who can publish
 * pool stories is in: approved network invites **and** linked clients
 * (Godrej-style shippers). Supplier-only books are not an audience.
 */
export function collectStoryStripAudienceOrgIds(
  networkOrgIds: ReadonlySet<string>,
  clientOrgIds: ReadonlySet<string>,
): Set<string> {
  const ids = new Set<string>();
  for (const id of networkOrgIds) {
    const trimmed = id.trim();
    if (trimmed) ids.add(trimmed);
  }
  for (const id of clientOrgIds) {
    const trimmed = id.trim();
    if (trimmed) ids.add(trimmed);
  }
  return ids;
}

/** Approved Pulse network counterparties (both invite directions). */
export function collectApprovedNetworkOrgIds(
  viewerOrgId: string | null | undefined,
  rows: ReadonlyArray<{
    status?: string | null;
    from_organization_id?: string | null;
    to_organization_id?: string | null;
  }>,
): Set<string> {
  const viewer = (viewerOrgId ?? "").trim();
  const ids = new Set<string>();
  for (const row of rows) {
    if ((row.status ?? "").trim().toLowerCase() !== "approved") continue;
    const from = (row.from_organization_id ?? "").trim();
    const to = (row.to_organization_id ?? "").trim();
    if (from === viewer && to && to !== viewer) ids.add(to);
    else if (to === viewer && from && from !== viewer) ids.add(from);
  }
  return ids;
}

/** Indent-linked pool LOAD, or a live capacity alert. */
export function isPublishedPoolRouteStory(post: {
  type?: string | null;
  is_active?: boolean | null;
  expires_at?: string | null;
  source_indent_id?: string | null;
}): boolean {
  if (!isStoryReelPostType(post.type ?? null)) return false;
  if (post.type === "VEHICLE_AVAILABILITY") {
    return isIndentStoryLive({ ...post, source_indent_id: null });
  }
  if (!(post.source_indent_id ?? "").trim()) return false;
  return isIndentStoryLive(post);
}

/**
 * WhatsApp Pulse story row — Pulse Boost, not Pulse Reach.
 *
 * Organic pool stories: approved network / Your connections only.
 * Sponsored Boost ads: keep what `get_network_feed` already released via
 * `reach_campaign_targets` (Network + Pulse outside the network). Own posts
 * stay on Mine.
 */
export function selectStoryStripPosts<
  T extends {
    id?: string | null;
    organization_id?: string | null;
    type?: string | null;
    is_sponsored?: boolean | null;
    is_active?: boolean | null;
    expires_at?: string | null;
    source_indent_id?: string | null;
    created_at?: string | null;
  },
>(
  posts: T[],
  viewerOrgId: string | null | undefined,
  connectedOrgIds: ReadonlySet<string>,
  options: { connectionsReady?: boolean; limit?: number } = {},
): T[] {
  const connected = new Set(
    [...connectedOrgIds].map((id) => id.trim()).filter(Boolean),
  );
  const connectionsReady = options.connectionsReady !== false;
  const limit = options.limit ?? 24;
  const eligible = posts.filter((post) => {
    if (isSelfNetworkStory(post, viewerOrgId)) return false;
    const published = isPublishedPoolRouteStory(post);
    const sponsored = Boolean(post.is_sponsored);
    if (!published && !sponsored) return false;
    // Paid delivery is audience-gated in get_network_feed. Show Boost ads
    // even before the network book resolves — hiding them blocked impressions.
    if (sponsored) return true;
    if (!connectionsReady) return false;
    return connected.has((post.organization_id ?? "").trim());
  });
  return selectNetworkAndSponsoredStoryPosts(eligible, viewerOrgId, limit);
}

function firstNonEmpty(
  ...values: Array<string | null | undefined>
): string | null {
  for (const value of values) {
    const trimmed = (value ?? "").trim();
    if (trimmed) return trimmed;
  }
  return null;
}

/** Label under the WhatsApp story circle — organization name, not the lane. */
export function storyOrgPreviewLabel(
  post: { org_name?: string | null },
): string {
  return (post.org_name ?? "").trim();
}

/** Feed rows win on `is_sponsored` / campaign id so a boosted connection shows as Ad. */
export function mergeStoryStripSources<
  T extends {
    id?: string | null;
    is_sponsored?: boolean | null;
    reach_campaign_id?: string | null;
    org_name?: string | null;
    org_avatar_url?: string | null;
    org_avatar_seed?: string | null;
  },
>(feedPosts: T[], connectedPosts: T[]): T[] {
  const byId = new Map<string, T>();
  for (const post of connectedPosts) {
    const id = (post.id ?? "").trim();
    if (id) byId.set(id, post);
  }
  for (const post of feedPosts) {
    const id = (post.id ?? "").trim();
    if (!id) continue;
    const existing = byId.get(id);
    if (!existing) {
      byId.set(id, post);
      continue;
    }
    byId.set(id, {
      ...existing,
      ...post,
      is_sponsored: Boolean(post.is_sponsored || existing.is_sponsored),
      reach_campaign_id:
        post.reach_campaign_id ?? existing.reach_campaign_id ?? null,
      org_name:
        firstNonEmpty(existing.org_name, post.org_name) ?? existing.org_name,
      org_avatar_url:
        firstNonEmpty(existing.org_avatar_url, post.org_avatar_url) ??
        existing.org_avatar_url,
      org_avatar_seed:
        firstNonEmpty(existing.org_avatar_seed, post.org_avatar_seed) ??
        existing.org_avatar_seed,
    });
  }
  const campaignByIndent = new Map<string, string>();
  for (const post of byId.values()) {
    const indent = String(
      (post as { source_indent_id?: string | null }).source_indent_id ?? "",
    ).trim();
    const campaign = (post.reach_campaign_id ?? "").trim();
    if (indent && campaign) campaignByIndent.set(indent, campaign);
  }
  if (campaignByIndent.size > 0) {
    for (const [id, post] of byId) {
      const indent = String(
        (post as { source_indent_id?: string | null }).source_indent_id ?? "",
      ).trim();
      const campaign = campaignByIndent.get(indent);
      if (!campaign || (post.reach_campaign_id ?? "").trim()) continue;
      byId.set(id, {
        ...post,
        is_sponsored: true,
        reach_campaign_id: campaign,
      });
    }
  }
  return [...byId.values()];
}
