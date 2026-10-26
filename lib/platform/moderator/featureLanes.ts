/**
 * Request-moderator lanes for newer Network / Reach / story surfaces.
 *
 * These features talk to Postgres through PostgREST tables and read-only RPCs.
 * Chat, trips, and finance stay interactive (user-blocking). Story, Reach,
 * partner-display, and connection-book reads yield under load.
 *
 * Read-only RPCs are listed explicitly: supabase-js sends them as POST, and an
 * unlisted POST is treated as a write (never coalesced, never shed).
 */
import type { RequestLane } from './types';

/** GET/HEAD list reads that must not compete with trip/chat threads. */
export const BACKGROUND_FEATURE_TABLES = new Set([
  'posts',
  'connection_requests',
  'network_pool_bid_commits',
  'reach_plans',
  'reach_campaigns',
  'reach_campaign_purchases',
  'reach_referrals',
  'pulse_credit_wallets',
  'pulse_credit_referrals',
]);

/** Side-effect-free RPCs used by Network / Reach / story / partner avatars. */
export const READ_ONLY_FEATURE_RPCS = new Map<string, RequestLane>([
  ['get_network_feed', 'background'],
  ['get_story_preview', 'background'],
  ['get_story_closed_info', 'background'],
  ['are_orgs_connected', 'background'],
  ['are_orgs_connected_or_reach_target', 'background'],
  ['get_connection_partner_display', 'background'],
  ['get_connection_partner_display_batch', 'background'],
  ['get_mutual_connections', 'background'],
  ['discover_organizations', 'background'],
  ['list_network_pool_lanes_for_org', 'background'],
  ['get_org_network_pool', 'background'],
  ['list_driver_direct_bids_for_post', 'background'],
  ['is_driver_available', 'background'],
  ['list_market_bids_for_indent', 'background'],
  ['calculate_marketplace_platform_fee', 'background'],
  ['list_marketplace_search_lanes', 'background'],
  ['list_my_org_market_bids', 'background'],
  ['get_reach_campaign_delivery', 'background'],
  ['get_reach_campaign_metrics', 'background'],
  ['get_reach_org_summary', 'background'],
  ['get_driver_reach_stories', 'background'],
  ['get_reach_referral_inbox', 'background'],
  ['get_referrer_name_by_code', 'background'],
]);

export type RestResource =
  | { kind: 'table'; name: string }
  | { kind: 'rpc'; name: string }
  | { kind: 'other' };

export function parseRestResource(pathname: string): RestResource {
  const rpc = pathname.match(/\/rest\/v1\/rpc\/([^/?#]+)/i);
  if (rpc?.[1]) return { kind: 'rpc', name: decodeURIComponent(rpc[1]) };
  const table = pathname.match(/\/rest\/v1\/([^/?#]+)/i);
  if (table?.[1] && table[1].toLowerCase() !== 'rpc') {
    return { kind: 'table', name: decodeURIComponent(table[1]) };
  }
  return { kind: 'other' };
}

export function inferredFeatureLane(resource: RestResource): RequestLane | null {
  if (resource.kind === 'table' && BACKGROUND_FEATURE_TABLES.has(resource.name)) {
    return 'background';
  }
  if (resource.kind === 'rpc') {
    return READ_ONLY_FEATURE_RPCS.get(resource.name) ?? null;
  }
  return null;
}

export function isReadOnlyFeatureRpc(name: string): boolean {
  return READ_ONLY_FEATURE_RPCS.has(name);
}
