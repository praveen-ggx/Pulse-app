/**
 * Pulse LOAD stories linked to indents — 24h reel window + lifecycle when indent closes.
 *
 * Get Load / bid visibility stays on indent status (Marketplace P0.1).
 * `posts.expires_at` is only the story-reel clock; we do not hide the indent from bids.
 */
import {
  createPost,
  type PostRow,
} from '@/features/network/services/posts.service';
import {
  indentStoryExpiresAt,
  isIndentStoryLive,
} from '@/features/network/utils/indentStoryWindow.util';
import { fetchExecutionPlanRouteSummaries } from '@/features/network/services/fetchExecutionPlanRouteSummaries';
import { indentDisplayOriginDest } from '@/features/network/utils/executionPlanRouteSummary';
import { looksLikePlannerStopSummary } from '@/features/network/utils/storyDisplay';
import { supabase } from '@/lib/supabase';
import { isSupabaseCircuitOpen } from '@/lib/supabaseHttp.util';
import { isCommerceDataQueryEnabled } from '@/lib/suite/productLock';

export { indentStoryExpiresAt, isIndentStoryLive } from '@/features/network/utils/indentStoryWindow.util';

/** Indent statuses that should remove linked stories from the network feed. */
export const INDENT_TERMINAL_STORY_STATUSES = [
  'awarded',
  'assigned',
  'deployed',
  'completed',
  'cancelled',
  'closed',
  'expired',
] as const;

export function isIndentTerminalForStory(
  status: string | null | undefined,
): boolean {
  const s = (status ?? '').trim().toLowerCase();
  return (INDENT_TERMINAL_STORY_STATUSES as readonly string[]).includes(s);
}

export type IndentStoryState = {
  postId: string;
  isLive: boolean;
  expiresAt: string | null;
};

/** Fields needed to publish / reboost a LOAD story — avoid importing IndentRow (cycle). */
export type IndentStorySource = {
  id: string;
  pickup_area?: string | null;
  drop_location?: string | null;
  pickup_date?: string | null;
  vehicle_type?: string | null;
  weight?: number | null;
  supplier_target?: number | null;
  client_price?: number | null;
  load_type?: string | null;
  status?: string | null;
  execution_plan_id?: string | null;
};

type LinkedStoryRow = {
  id: string;
  is_active: boolean;
  expires_at: string | null;
  created_at: string;
};

function storyRateOffer(indent: IndentStorySource): number | undefined {
  const target = indent.supplier_target;
  if (typeof target === 'number' && Number.isFinite(target) && target > 0) {
    return target;
  }
  return undefined;
}

function storyWeightTonnes(indent: IndentStorySource): number | undefined {
  if (indent.weight == null || !Number.isFinite(indent.weight)) return undefined;
  return indent.weight / 1000;
}

async function listLinkedLoadStories(
  indentId: string,
): Promise<{ error: Error | null; rows: LinkedStoryRow[] }> {
  const { data, error } = await supabase()
    .from('posts')
    .select('id, is_active, expires_at, created_at')
    .eq('source_indent_id', indentId)
    .eq('type', 'LOAD')
    .order('created_at', { ascending: false });

  if (error) return { error: new Error(error.message), rows: [] };
  return { error: null, rows: (data ?? []) as LinkedStoryRow[] };
}

/**
 * Soft-deactivate all active LOAD stories for an indent (stops reel + new bids).
 * DB trigger also runs on indent status change; this keeps the client cache in sync.
 */
export async function deactivatePostsForIndent(
  indentId: string,
): Promise<{ error: Error | null; deactivatedCount: number }> {
  const { data, error } = await supabase()
    .from('posts')
    .update({ is_active: false })
    .eq('source_indent_id', indentId)
    .eq('is_active', true)
    .select('id');

  if (error) {
    return { error: new Error(error.message), deactivatedCount: 0 };
  }
  return { error: null, deactivatedCount: (data ?? []).length };
}

/**
 * Latest LOAD story per indent (own org). Used to color the Pulse button.
 */
const POSTGREST_IN_CHUNK = 40;

function chunkIds(ids: string[], size = POSTGREST_IN_CHUNK): string[][] {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += size) {
    chunks.push(ids.slice(i, i + size));
  }
  return chunks;
}

export async function getIndentStoryStates(
  orgId: string,
  indentIds: string[],
): Promise<{ error: Error | null; byIndentId: Record<string, IndentStoryState> }> {
  const ids = [...new Set(indentIds.filter(Boolean))];
  if (!orgId || ids.length === 0) {
    return { error: null, byIndentId: {} };
  }

  if (isSupabaseCircuitOpen()) {
    return { error: null, byIndentId: {} };
  }

  const rows: Array<{
    id: string;
    source_indent_id?: string | null;
    is_active: boolean;
    expires_at: string | null;
    created_at: string;
  }> = [];

  for (const chunk of chunkIds(ids)) {
    const { data, error } = await supabase()
      .from('posts')
      .select('id, source_indent_id, is_active, expires_at, created_at')
      .eq('organization_id', orgId)
      .eq('type', 'LOAD')
      .in('source_indent_id', chunk)
      .order('created_at', { ascending: false });

    if (error) return { error: new Error(error.message), byIndentId: {} };
    rows.push(...((data ?? []) as typeof rows));
  }

  const byIndentId: Record<string, IndentStoryState> = {};
  for (const row of rows) {
    const indentId = row.source_indent_id;
    if (!indentId || byIndentId[indentId]) continue;
    byIndentId[indentId] = {
      postId: row.id,
      isLive: isIndentStoryLive(row),
      expiresAt: row.expires_at ?? null,
    };
  }
  return { error: null, byIndentId };
}

/**
 * All live indent-linked LOAD stories for an org — same clock as the Load Center
 * green Pulse icon (`isIndentStoryLive`) AND indent still open for bids.
 * Awarded / trip-converted indents never appear in Mine / story preview.
 */
export async function listLiveOwnLoadStories(
  orgId: string,
): Promise<{ error: Error | null; posts: PostRow[] }> {
  if (!orgId) return { error: null, posts: [] };

  const { data, error } = await supabase()
    .from('posts')
    .select(
      'id, organization_id, author_user_id, type, content, origin, destination, load_date, vehicle_type, weight_tonnes, rate_offer, material, expires_at, is_active, view_count, created_at, source_indent_id',
    )
    .eq('organization_id', orgId)
    .eq('type', 'LOAD')
    .not('source_indent_id', 'is', null)
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  if (error) return { error: new Error(error.message), posts: [] };

  const liveRows = (data ?? []).filter((raw) => isIndentStoryLive(raw));
  const indentIds = [
    ...new Set(
      liveRows
        .map((row) => String(row.source_indent_id ?? '').trim())
        .filter(Boolean),
    ),
  ];
  const statusByIndentId: Record<string, string | null> = {};
  for (const chunk of chunkIds(indentIds)) {
    const { data: indentRows, error: indentErr } = await supabase()
      .from('indents')
      .select('id, status')
      .in('id', chunk);
    if (indentErr) return { error: new Error(indentErr.message), posts: [] };
    for (const row of indentRows ?? []) {
      statusByIndentId[String((row as { id?: string }).id ?? '')] =
        (row as { status?: string | null }).status ?? null;
    }
  }

  const { data: orgRow } = await supabase()
    .from('organizations')
    .select('name, avatar_seed, logo_url')
    .eq('id', orgId)
    .maybeSingle();

  const posts: PostRow[] = [];
  for (const raw of liveRows) {
    const indentId = String(raw.source_indent_id ?? '').trim();
    if (isIndentTerminalForStory(statusByIndentId[indentId])) continue;
    posts.push({
      id: raw.id,
      organization_id: raw.organization_id,
      org_name: orgRow?.name ?? '',
      org_avatar_seed: orgRow?.avatar_seed ?? null,
      org_avatar_url: orgRow?.logo_url ?? null,
      author_user_id: raw.author_user_id,
      type: 'LOAD',
      content: raw.content,
      origin: raw.origin,
      destination: raw.destination,
      load_date: raw.load_date,
      vehicle_type: raw.vehicle_type,
      weight_tonnes: raw.weight_tonnes,
      rate_offer: raw.rate_offer,
      material: raw.material,
      expires_at: raw.expires_at,
      is_active: raw.is_active,
      view_count: raw.view_count ?? 0,
      bid_count: 0,
      created_at: raw.created_at,
      source_indent_id: raw.source_indent_id,
    });
  }

  return { error: null, posts };
}

async function resolvedStoryRoute(indent: IndentStorySource): Promise<{
  origin: string | undefined;
  destination: string | undefined;
}> {
  const fallback = {
    origin: indent.pickup_area || undefined,
    destination: indent.drop_location || undefined,
  };
  const planId =
    typeof indent.execution_plan_id === 'string' ? indent.execution_plan_id.trim() : '';
  if (!planId || !isCommerceDataQueryEnabled()) return fallback;
  try {
    const map = await fetchExecutionPlanRouteSummaries([planId]);
    const overlay = indentDisplayOriginDest(indent, map);
    return {
      origin: overlay.origin === '—' ? fallback.origin : overlay.origin,
      destination: overlay.dest === '—' ? fallback.destination : overlay.dest,
    };
  } catch {
    return fallback;
  }
}

async function persistIndentRouteIfNeeded(
  indent: IndentStorySource,
  origin: string | undefined,
  destination: string | undefined,
): Promise<void> {
  if (!origin || !destination) return;
  const pickup = (indent.pickup_area ?? '').trim();
  const drop = (indent.drop_location ?? '').trim();
  if (pickup === origin && drop === destination) return;
  if (!looksLikePlannerStopSummary(pickup) && !looksLikePlannerStopSummary(drop)) {
    return;
  }
  await supabase()
    .from('indents')
    .update({ pickup_area: origin, drop_location: destination })
    .eq('id', indent.id);
}

async function reactivateStory(
  postId: string,
  content?: string,
  route?: { origin?: string; destination?: string },
): Promise<{ error: Error | null }> {
  const payload: Record<string, unknown> = {
    is_active: true,
    expires_at: indentStoryExpiresAt(),
  };
  if (content !== undefined) payload.content = content || null;
  if (route?.origin) payload.origin = route.origin;
  if (route?.destination) payload.destination = route.destination;

  const { error } = await supabase().from('posts').update(payload).eq('id', postId);
  if (error) return { error: new Error(error.message) };
  return { error: null };
}

/**
 * One live 24h LOAD story per indent.
 * Create on first share; reboost refreshes `expires_at` (and reactivates if needed).
 */
export async function ensureIndentStory(
  orgId: string,
  indent: IndentStorySource,
  options?: { content?: string; reboost?: boolean },
): Promise<{
  error: Error | null;
  postId: string | null;
  created: boolean;
  reboosted: boolean;
}> {
  if (!orgId || !indent.id) {
    return { error: new Error('Missing organization or indent'), postId: null, created: false, reboosted: false };
  }
  if (isIndentTerminalForStory(indent.status)) {
    return {
      error: new Error('This indent is closed and cannot go to the story reel'),
      postId: null,
      created: false,
      reboosted: false,
    };
  }

  const listed = await listLinkedLoadStories(indent.id);
  if (listed.error) {
    return { error: listed.error, postId: null, created: false, reboosted: false };
  }

  const [latest, ...older] = listed.rows;
  const live = latest ? isIndentStoryLive(latest) : false;
  const route = await resolvedStoryRoute(indent);
  await persistIndentRouteIfNeeded(indent, route.origin, route.destination);

  if (latest && live && !options?.reboost) {
    if (route.origin || route.destination) {
      await supabase()
        .from('posts')
        .update({
          ...(route.origin ? { origin: route.origin } : {}),
          ...(route.destination ? { destination: route.destination } : {}),
        })
        .eq('id', latest.id);
    }
    return { error: null, postId: latest.id, created: false, reboosted: false };
  }

  if (latest) {
    const reactivated = await reactivateStory(latest.id, options?.content, route);
    if (reactivated.error) {
      return { error: reactivated.error, postId: null, created: false, reboosted: false };
    }
    const extras = older.filter((row) => row.is_active).map((row) => row.id);
    if (extras.length > 0) {
      await supabase().from('posts').update({ is_active: false }).in('id', extras);
    }
    return { error: null, postId: latest.id, created: false, reboosted: true };
  }

  const created = await createPost({
    organizationId: orgId,
    type: 'LOAD',
    content: options?.content,
    origin: route.origin,
    destination: route.destination,
    loadDate: indent.pickup_date ?? undefined,
    vehicleType: indent.vehicle_type ?? undefined,
    weightTonnes: storyWeightTonnes(indent),
    rateOffer: storyRateOffer(indent),
    material: indent.load_type ?? undefined,
    expiresAt: indentStoryExpiresAt(),
    sourceIndentId: indent.id,
  });

  if (created.error) {
    return { error: created.error, postId: null, created: false, reboosted: false };
  }
  return { error: null, postId: created.postId, created: true, reboosted: false };
}
