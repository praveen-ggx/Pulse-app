/**
 * Sponsored Reach is the one individual commercial opportunity: an indent with
 * an active Reach campaign. Marketplace rows carry it as is_sponsored /
 * reach_campaign_id; the Network feed carries it as an active sponsored LOAD
 * post linked to the indent through source_indent_id. A sponsored indent is
 * never a member of an Indent Pool, on any surface.
 */

type SponsoredPostFields = {
  type?: string | null;
  is_active?: boolean | null;
  is_sponsored?: boolean | null;
  source_indent_id?: string | null;
};

type SponsoredLoadFields = {
  id: string;
  is_sponsored?: boolean | null;
  reach_campaign_id?: string | null;
};

export function isSponsoredReachPost(post: SponsoredPostFields): boolean {
  return (
    post.is_sponsored === true &&
    post.is_active !== false &&
    (post.type ?? "").toUpperCase() === "LOAD"
  );
}

/** Indents with an active sponsored LOAD post in the Network feed. */
export function sponsoredReachIndentIds(
  posts: readonly SponsoredPostFields[] | null | undefined,
): Set<string> {
  const ids = new Set<string>();
  for (const post of posts ?? []) {
    const indentId = (post.source_indent_id ?? "").trim();
    if (indentId && isSponsoredReachPost(post)) ids.add(indentId);
  }
  return ids;
}

/** Own live Pulse Boost — feed/strip often omit the advertiser's row. */
export function sponsoredPostFromReachCampaign(campaign: {
  id: string;
  org_id: string;
  post_id: string | null;
  status: string;
  published_at: string | null;
  created_at: string;
  expires_at: string | null;
  snapshot_post_type?: string | null;
  snapshot_origin?: string | null;
  snapshot_destination?: string | null;
  snapshot_vehicle_type?: string | null;
  snapshot_material?: string | null;
  snapshot_content?: string | null;
  snapshot_source_indent_id?: string | null;
  load_pickup_date?: string | null;
  load_weight?: number | null;
  load_rate?: number | null;
}): {
  id: string;
  organization_id: string;
  org_name: string;
  org_avatar_seed: null;
  org_avatar_url: null;
  author_user_id: string;
  type: "LOAD";
  content: string | null;
  origin: string | null;
  destination: string | null;
  load_date: string | null;
  vehicle_type: string | null;
  weight_tonnes: number | null;
  rate_offer: number | null;
  material: string | null;
  expires_at: string | null;
  is_active: true;
  view_count: number;
  bid_count: number;
  created_at: string;
  source_indent_id: string | null;
  is_sponsored: true;
  reach_campaign_id: string;
} | null {
  if (campaign.status !== "active") return null;
  const postId = (campaign.post_id ?? "").trim();
  if (!postId) return null;
  const type = (campaign.snapshot_post_type ?? "LOAD").toUpperCase();
  if (type !== "LOAD") return null;
  return {
    id: postId,
    organization_id: campaign.org_id,
    org_name: "",
    org_avatar_seed: null,
    org_avatar_url: null,
    author_user_id: "",
    type: "LOAD",
    content: campaign.snapshot_content ?? null,
    origin: campaign.snapshot_origin ?? null,
    destination: campaign.snapshot_destination ?? null,
    load_date: campaign.load_pickup_date ?? null,
    vehicle_type: campaign.snapshot_vehicle_type ?? null,
    weight_tonnes: campaign.load_weight ?? null,
    rate_offer: campaign.load_rate ?? null,
    material: campaign.snapshot_material ?? null,
    expires_at: campaign.expires_at,
    is_active: true,
    view_count: 0,
    bid_count: 0,
    created_at: campaign.published_at ?? campaign.created_at,
    source_indent_id: campaign.snapshot_source_indent_id ?? null,
    is_sponsored: true,
    reach_campaign_id: campaign.id,
  };
}

export function isSponsoredReachLoad(
  load: SponsoredLoadFields,
  sponsoredIndentIds?: ReadonlySet<string>,
): boolean {
  return (
    load.is_sponsored === true ||
    !!(load.reach_campaign_id ?? "").trim() ||
    (sponsoredIndentIds?.has(load.id) ?? false)
  );
}
