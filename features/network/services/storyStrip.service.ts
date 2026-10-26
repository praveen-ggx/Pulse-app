import { getNetworkFeed, type PostRow } from "@/features/network/services/posts.service";
import { getAccessToken, supabase } from "@/lib/supabase";
import { mergeStoryStripSources } from "@/features/network/utils/storyStrip.util";

const ORG_IN_CHUNK = 40;

function chunkIds(ids: string[], size = ORG_IN_CHUNK): string[][] {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += size) {
    chunks.push(ids.slice(i, i + size));
  }
  return chunks;
}

/**
 * Active published stories from connected orgs (RLS: any authenticated user
 * can read `is_active` posts). Pool-route LOADs and capacity alerts.
 */
export async function listPublishedStoriesForOrgs(
  organizationIds: readonly string[],
): Promise<{ error: Error | null; posts: PostRow[] }> {
  const ids = [
    ...new Set(organizationIds.map((id) => id.trim()).filter(Boolean)),
  ];
  if (ids.length === 0) return { error: null, posts: [] };
  if (!(await getAccessToken())) return { error: null, posts: [] };

  const rows: Array<Record<string, unknown>> = [];
  for (const chunk of chunkIds(ids)) {
    const { data, error } = await supabase()
      .from("posts")
      .select(
        "id, organization_id, author_user_id, type, content, origin, destination, load_date, vehicle_type, weight_tonnes, rate_offer, material, expires_at, is_active, view_count, created_at, source_indent_id",
      )
      .in("organization_id", chunk)
      .in("type", ["LOAD", "VEHICLE_AVAILABILITY"])
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(80);
    if (error) return { error: new Error(error.message), posts: [] };
    for (const row of data ?? []) rows.push(row as Record<string, unknown>);
  }

  const { getLinkedOrgProfilesBatch } = await import(
    "@/features/clients/services/clients.service"
  );
  const profiles = await getLinkedOrgProfilesBatch(ids);

  const posts: PostRow[] = [];
  for (const raw of rows) {
    const type = String(raw.type ?? "");
    if (type === "LOAD" && !String(raw.source_indent_id ?? "").trim()) continue;
    const orgId = String(raw.organization_id ?? "");
    const org = profiles[orgId];
    posts.push({
      id: String(raw.id),
      organization_id: orgId || null,
      org_name: (org?.organizationName ?? "").trim(),
      org_avatar_seed: org?.avatarSeed ?? org?.orgAvatarSeed ?? null,
      org_avatar_url: org?.logoUrl ?? org?.avatarUrl ?? null,
      author_user_id: String(raw.author_user_id ?? ""),
      type: type as PostRow["type"],
      content: (raw.content as string | null) ?? null,
      origin: (raw.origin as string | null) ?? null,
      destination: (raw.destination as string | null) ?? null,
      load_date: (raw.load_date as string | null) ?? null,
      vehicle_type: (raw.vehicle_type as string | null) ?? null,
      weight_tonnes: (raw.weight_tonnes as number | null) ?? null,
      rate_offer: (raw.rate_offer as number | null) ?? null,
      material: (raw.material as string | null) ?? null,
      expires_at: (raw.expires_at as string | null) ?? null,
      is_active: raw.is_active === true,
      view_count: Number(raw.view_count ?? 0),
      bid_count: 0,
      created_at: String(raw.created_at ?? ""),
      source_indent_id: (raw.source_indent_id as string | null) ?? null,
    });
  }
  return { error: null, posts };
}

/**
 * Story row sources: `get_network_feed` plus published stories from approved
 * Pulse **network** connections (not CRM clients — that was Pulse Reach).
 * A Boost on a connection's story still overlays `is_sponsored` from the feed.
 */
export async function listStoryStripPosts(
  viewerOrgId: string,
  connectedOrgIds: readonly string[],
): Promise<{ error: Error | null; posts: PostRow[] }> {
  const [feed, connected] = await Promise.all([
    getNetworkFeed(viewerOrgId, 50, 0),
    listPublishedStoriesForOrgs(connectedOrgIds),
  ]);
  if (feed.error && connected.error) {
    return { error: feed.error, posts: [] };
  }
  if (feed.error && connected.posts.length === 0) {
    return { error: feed.error, posts: [] };
  }
  const merged = mergeStoryStripSources(feed.posts, connected.posts);
  const missingOrgIds = [
    ...new Set(
      merged
        .filter((post) => !(post.org_name ?? "").trim() && post.organization_id)
        .map((post) => String(post.organization_id).trim()),
    ),
  ];
  if (missingOrgIds.length === 0) {
    return { error: null, posts: merged };
  }
  const { getLinkedOrgProfilesBatch } = await import(
    "@/features/clients/services/clients.service"
  );
  const profiles = await getLinkedOrgProfilesBatch(missingOrgIds);
  return {
    error: null,
    posts: merged.map((post) => {
      const org = profiles[(post.organization_id ?? "").trim()];
      if (!org) return post;
      return {
        ...post,
        org_name:
          (post.org_name ?? "").trim() || (org.organizationName ?? "").trim(),
        org_avatar_url:
          post.org_avatar_url ?? org.logoUrl ?? org.avatarUrl ?? null,
        org_avatar_seed:
          post.org_avatar_seed ?? org.avatarSeed ?? org.orgAvatarSeed ?? null,
      };
    }),
  };
}
