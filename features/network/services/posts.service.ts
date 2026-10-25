/**
 * Posts service — business updates and load posts in the network feed.
 */
import { getAccessToken, supabase } from '@/lib/supabase';

/** Pulse network: business-only. `UPDATE` is legacy (hidden in UI; migrate off DB when ready). */
export type PostType = 'UPDATE' | 'LOAD' | 'VEHICLE_AVAILABILITY';
const VEHICLE_POST_MARKER = '[VEHICLE_AVAILABILITY]';

export function hasVehicleMarker(content: string | null | undefined): boolean {
  return (content ?? '').trimStart().startsWith(VEHICLE_POST_MARKER);
}

export function stripVehicleMarker(content: string | null): string | null {
  if (!content) return content;
  return content.replace(VEHICLE_POST_MARKER, '').trimStart();
}

function toStoredVehicleContent(content: string | undefined): string {
  const clean = (content ?? '').trim();
  return hasVehicleMarker(clean) ? clean : `${VEHICLE_POST_MARKER} ${clean}`.trim();
}

function normalizeFeedPost(row: PostRow): PostRow {
  const isLegacyVehicle = row.type === 'UPDATE' && hasVehicleMarker(row.content);
  if (!isLegacyVehicle && row.type !== 'VEHICLE_AVAILABILITY') return row;
  return {
    ...row,
    type: 'VEHICLE_AVAILABILITY',
    content: stripVehicleMarker(row.content),
  };
}

export interface PostRow {
  id: string;
  organization_id: string | null;
  org_name: string;
  org_avatar_seed: string | null;
  /** Org logo image (organizations.logo_url) — rendered as the story cover. */
  org_avatar_url: string | null;
  author_user_id: string;
  type: PostType;
  content: string | null;
  origin: string | null;
  destination: string | null;
  load_date: string | null;
  vehicle_type: string | null;
  weight_tonnes: number | null;
  rate_offer: number | null;
  material: string | null;
  expires_at: string | null;
  is_active: boolean;
  view_count: number;
  bid_count: number;
  created_at: string;
  /** Set when a LOAD story is published from an indent (Pulse / Share load). */
  source_indent_id?: string | null;
  circulation_target?: string | null;
  visibility_scope?: string | null;
  target_role?: string | null;
  audience?: string | null;
  viewer_role?: string | null;
  visible_to?: string[] | null;
  /** Reach boost — undefined until 20261224050000_network_feed_sponsored_badge.sql is applied. */
  is_sponsored?: boolean | null;
  reach_campaign_id?: string | null;
}

/**
 * Client-side safety gate for feed visibility.
 * Backend should enforce this; this guard prevents accidental overexposure when payload fields exist.
 */
export function isPostVisibleForOrg(
  post: PostRow,
  opts: { allowLoadPosts: boolean },
): boolean {
  if (post.type === 'LOAD' && !opts.allowLoadPosts) return false;

  const normalize = (v: string | null | undefined) => (v ?? '').trim().toLowerCase();
  const audienceSignals = [
    normalize(post.circulation_target),
    normalize(post.visibility_scope),
    normalize(post.target_role),
    normalize(post.audience),
    normalize(post.viewer_role),
  ].filter(Boolean);

  // Supplier-targeted circulation (including integrated_supplier) should be visible
  // only to supplier-side viewers. We currently infer that via allowLoadPosts.
  if (audienceSignals.some((s) => s.includes('supplier') || s.includes('carrier'))) {
    return opts.allowLoadPosts;
  }
  if (audienceSignals.some((s) => s.includes('client'))) {
    return false;
  }
  if (Array.isArray(post.visible_to)) {
    const normalized = post.visible_to.map((v) => normalize(v));
    if (normalized.some((v) => v.includes('supplier') || v.includes('carrier'))) {
      return opts.allowLoadPosts;
    }
    if (normalized.some((v) => v.includes('client'))) {
      return false;
    }
  }
  return true;
}

export interface CreatePostInput {
  organizationId: string;
  type: PostType;
  content?: string;
  origin?: string;
  destination?: string;
  loadDate?: string;
  vehicleType?: string;
  weightTonnes?: number;
  rateOffer?: number;
  material?: string;
  expiresAt?: string;
  /** When broadcasting from an indent — drives Load Center bid counts and BidSheet → direct_quote. */
  sourceIndentId?: string | null;
}

export async function getNetworkFeed(
  orgId: string,
  limit = 30,
  offset = 0,
): Promise<{ error: Error | null; posts: PostRow[] }> {
  if (!(await getAccessToken())) {
    return { error: null, posts: [] };
  }
  const cappedLimit = Math.min(Math.max(limit, 1), 50);
  const { data, error } = await supabase().rpc('get_network_feed', {
    p_org_id: orgId,
    p_limit: cappedLimit,
    p_offset: Math.max(offset, 0),
  });
  if (error) return { error: new Error(error.message), posts: [] };
  const rawPosts = (data ?? []) as PostRow[];
  // Marketplace Stability P0.1: backend (get_network_feed + indent lifecycle) is the
  // visibility authority. Do not filter or write is_active from posts.expires_at here —
  // that dual clock killed discovery while indents were still open for bids.
  // Own-org awarded LOAD posts may still appear with is_active=false for shipper history.
  const activePosts = rawPosts.filter(
    (p) =>
      p.is_active === true ||
      (p.organization_id === orgId && p.source_indent_id != null),
  );

  const posts = activePosts.map(normalizeFeedPost);
  return { error: null, posts };
}

export async function createPost(
  input: CreatePostInput,
): Promise<{ error: Error | null; postId: string | null }> {
  const { data: session } = await supabase().auth.getSession();
  const userId = session?.session?.user?.id;
  if (!userId) return { error: new Error('Not authenticated'), postId: null };

  const buildInsert = (type: PostType | 'UPDATE', content: string | undefined) => ({
    organization_id: input.organizationId,
    author_user_id: userId,
    type,
    content: content ?? null,
    origin: input.origin ?? null,
    destination: input.destination ?? null,
    // `load_date` is only meaningful for LOAD posts.
    load_date: type === 'LOAD' ? input.loadDate ?? null : null,
    vehicle_type: input.vehicleType ?? null,
    weight_tonnes: input.weightTonnes ?? null,
    rate_offer: input.rateOffer ?? null,
    material: input.material ?? null,
    expires_at: input.expiresAt ?? null,
    source_indent_id: input.sourceIndentId ?? null,
  });

  const primaryType = input.type;
  const primaryContent =
    input.type === 'VEHICLE_AVAILABILITY' ? toStoredVehicleContent(input.content) : input.content;

  const primary = await supabase()
    .from('posts')
    .insert(buildInsert(primaryType, primaryContent))
    .select('id')
    .maybeSingle();

  if (!primary.error) {
    return { error: null, postId: primary.data?.id ?? null };
  }

  // Backward-compatible fallback: older DB check constraints may allow only UPDATE/LOAD.
  if (
    input.type === 'VEHICLE_AVAILABILITY' &&
    (primary.error.message.includes('posts_type_check') ||
      primary.error.message.toLowerCase().includes('check constraint'))
  ) {
    const fallback = await supabase()
      .from('posts')
      .insert(buildInsert('UPDATE', toStoredVehicleContent(input.content)))
      .select('id')
      .maybeSingle();
    if (!fallback.error) {
      return { error: null, postId: fallback.data?.id ?? null };
    }
    return { error: new Error(fallback.error.message), postId: null };
  }

  // RLS: posts_insert requires organization_id ∈ the caller's organization_members.
  // A 42501 here means the active-workspace org isn't one the user is a member of
  // (e.g. a connected/partner org or a stale workspace selection). Surface a clear
  // message instead of the raw policy violation.
  if (
    primary.error.code === '42501' ||
    primary.error.message.toLowerCase().includes('row-level security')
  ) {
    if (__DEV__) {
      console.warn(
        '[posts] createPost blocked by RLS — user',
        userId,
        'is not a member of org',
        input.organizationId,
      );
    }
    return {
      error: new Error(
        'You can only post for an organization you belong to. Please reselect your workspace and try again.',
      ),
      postId: null,
    };
  }

  return { error: new Error(primary.error.message), postId: null };
}

export async function getPostById(
  postId: string,
): Promise<{ error: Error | null; post: PostRow | null }> {
  const { data, error } = await supabase()
    .from('posts')
    .select('*, organizations(name, logo_url, avatar_seed)')
    .eq('id', postId)
    .single();
  if (error) return { error: new Error(error.message), post: null };
  const raw = data as (PostRow & {
    organizations?: { name: string; logo_url?: string | null; avatar_seed?: string | null } | null;
  });
  const row: PostRow = {
    ...raw,
    org_name: raw.org_name ?? raw.organizations?.name ?? '',
    org_avatar_url: raw.org_avatar_url ?? raw.organizations?.logo_url ?? null,
    org_avatar_seed: raw.org_avatar_seed ?? raw.organizations?.avatar_seed ?? null,
  };
  return { error: null, post: normalizeFeedPost(row) };
}

export type OrganizationStoryBrand = {
  name: string;
  logoUrl: string | null;
  avatarSeed: string | null;
};

/**
 * Org mark + company name for a story. Direct `organizations` SELECT is
 * member-only RLS, so another company's name never comes back that way —
 * that is what painted the "Organization" fallback. Use the definer
 * partner-display RPC (and story preview) instead.
 */
export async function getOrganizationStoryBrand(
  orgId: string,
  postId?: string | null,
): Promise<{ error: Error | null; brand: OrganizationStoryBrand | null }> {
  const id = orgId.trim();
  if (!id) return { error: null, brand: null };

  const { getLinkedOrgProfilesBatch } = await import(
    '@/features/clients/services/clients.service'
  );
  const profiles = await getLinkedOrgProfilesBatch([id]);
  const profile = profiles[id];
  const fromRpc: OrganizationStoryBrand = {
    name: (profile?.organizationName ?? '').trim(),
    logoUrl:
      (profile?.logoUrl ?? profile?.avatarUrl ?? '').trim() || null,
    avatarSeed:
      (profile?.avatarSeed ?? profile?.orgAvatarSeed ?? '').trim() || null,
  };
  if (fromRpc.name) return { error: null, brand: fromRpc };

  const previewId = (postId ?? '').trim();
  if (previewId) {
    const { preview } = await getStoryPreview(previewId);
    const previewName = (preview?.org_name ?? '').trim();
    if (previewName) {
      return {
        error: null,
        brand: {
          name: previewName,
          logoUrl: fromRpc.logoUrl,
          avatarSeed: fromRpc.avatarSeed,
        },
      };
    }
  }

  const { data, error } = await supabase()
    .from('organizations')
    .select('name, logo_url, avatar_seed')
    .eq('id', id)
    .maybeSingle();
  if (error) {
    return {
      error: new Error(error.message),
      brand: fromRpc.name || fromRpc.logoUrl ? fromRpc : null,
    };
  }
  if (!data) {
    return {
      error: null,
      brand: fromRpc.name || fromRpc.logoUrl ? fromRpc : null,
    };
  }
  return {
    error: null,
    brand: {
      name: (data.name ?? '').trim() || fromRpc.name,
      logoUrl: (data.logo_url ?? '').trim() || fromRpc.logoUrl,
      avatarSeed: (data.avatar_seed ?? '').trim() || fromRpc.avatarSeed,
    },
  };
}

export async function deactivatePost(
  postId: string,
  organizationId?: string | null,
): Promise<{ error: Error | null }> {
  const baseUpdate = supabase().from('posts').update({ is_active: false }).eq('id', postId);
  const scopedUpdate = organizationId ? baseUpdate.eq('organization_id', organizationId) : baseUpdate;
  const { error } = await scopedUpdate;
  if (!error) return { error: null };

  // Fallback for stricter RLS variants where update is blocked but delete is allowed.
  const baseDelete = supabase().from('posts').delete().eq('id', postId);
  const scopedDelete = organizationId ? baseDelete.eq('organization_id', organizationId) : baseDelete;
  const { error: deleteError } = await scopedDelete;
  if (deleteError) return { error: new Error(deleteError.message) };
  return { error: null };
}

export interface StoryPreviewRow {
  id: string;
  organization_id: string;
  org_name: string;
  type: PostType;
  origin: string | null;
  destination: string | null;
  load_date: string | null;
  vehicle_type: string | null;
  expires_at: string | null;
  is_active: boolean;
}

/**
 * Public, non-commercial preview of a post for the story-detail share link.
 * Works for anonymous callers — used to render a preview before sign-in.
 */
export async function getStoryPreview(
  postId: string,
): Promise<{ error: Error | null; preview: StoryPreviewRow | null }> {
  const { data, error } = await supabase().rpc('get_story_preview', { p_post_id: postId });
  if (error) return { error: new Error(error.message), preview: null };
  const rows = (data ?? []) as StoryPreviewRow[];
  return { error: null, preview: rows[0] ?? null };
}

async function hasLinkedClientRelationship(
  viewerOrgId: string,
  authorOrgId: string,
): Promise<boolean> {
  const { data, error } = await supabase()
    .from('clients')
    .select('id')
    .eq('organization_id', viewerOrgId)
    .eq('linked_organization_id', authorOrgId)
    .is('deleted_at', null)
    .limit(1);
  return !error && (data?.length ?? 0) > 0;
}

/**
 * Story preview gate. `are_orgs_connected` only sees approved
 * connection_requests. Your connections also lists linked clients (Godrej),
 * so those workspace links must open the story viewer too.
 */
export async function checkOrgsConnectedForStoryPreview(
  viewerOrgId: string,
  authorOrgId: string,
  postId?: string | null,
): Promise<{ error: Error | null; connected: boolean }> {
  const rpc = await checkOrgsConnected(viewerOrgId, authorOrgId, postId);
  if (rpc.connected) return rpc;
  try {
    const linked = await hasLinkedClientRelationship(viewerOrgId, authorOrgId);
    return { error: rpc.error, connected: linked };
  } catch (e) {
    return {
      error: e instanceof Error ? e : rpc.error,
      connected: false,
    };
  }
}

export async function checkOrgsConnected(
  orgA: string,
  orgB: string,
  postId?: string | null,
): Promise<{ error: Error | null; connected: boolean }> {
  if (!orgA || !orgB) return { error: null, connected: false };
  if (orgA === orgB) return { error: null, connected: true };
  // With a postId, also allow released Reach wave targets — Reach delivers
  // beyond existing connections by design, so a paid recipient must be able to
  // open the story it was delivered.
  if (postId) {
    const { data, error } = await supabase().rpc('are_orgs_connected_or_reach_target', {
      p_viewer_org: orgA,
      p_author_org: orgB,
      p_post_id: postId,
    });
    if (error) return { error: new Error(error.message), connected: false };
    return { error: null, connected: Boolean(data) };
  }
  const { data, error } = await supabase().rpc('are_orgs_connected', {
    p_org_a: orgA,
    p_org_b: orgB,
  });
  if (error) return { error: new Error(error.message), connected: false };
  return { error: null, connected: Boolean(data) };
}

/** Why a shared story link is no longer bid-able. */
export type StoryClosedReason =
  /** Source indent was awarded / assigned / deployed / completed. */
  | 'assigned'
  /** Broadcast passed its expiry window. */
  | 'expired'
  /** Load giver cancelled the indent. */
  | 'withdrawn'
  /** Post deleted or not visible — nothing left to show. */
  | 'removed'
  /** Deactivated with no richer signal available. */
  | 'closed';

export interface StoryClosedInfo {
  reason: StoryClosedReason;
  indentStatus: string | null;
}

/**
 * Best-effort explanation for a dead story link (deleted, deactivated or
 * expired) — so the share page can say "load assigned" instead of a generic
 * error. Goes through get_story_closed_info (SECURITY DEFINER), not a direct
 * table read: posts_select_authenticated only allows a raw SELECT when
 * is_active = true OR the caller is in the post's own org, which means the
 * exact moment a story closes is the moment a direct read from any other
 * viewer would return nothing — collapsing every real reason into the
 * generic fallback. The RPC sees the row regardless of caller org, same
 * public-callable pattern as get_story_preview.
 */
export async function getStoryClosedInfo(
  postId: string,
): Promise<StoryClosedInfo> {
  const fallback: StoryClosedInfo = { reason: 'removed', indentStatus: null };
  if (!postId) return fallback;

  try {
    const { data, error } = await supabase().rpc('get_story_closed_info', {
      p_post_id: postId,
    });
    if (error) return fallback;
    const row = (data ?? [])[0] as { reason: StoryClosedReason; indent_status: string | null } | undefined;
    if (!row) return fallback;
    return { reason: row.reason, indentStatus: row.indent_status };
  } catch {
    return fallback;
  }
}

export async function incrementPostViewCount(postId: string): Promise<void> {
  try {
    await supabase().rpc('increment_post_view_count', { p_post_id: postId });
  } catch {
    // best-effort
  }
}
