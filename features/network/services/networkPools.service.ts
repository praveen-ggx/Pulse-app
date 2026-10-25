/**
 * Network Indent Pools, server-authoritative: lanes from
 * list_network_pool_lanes_for_org, one pool's members and quotable set from
 * get_org_network_pool, and each member quote through submit_network_quote.
 * Membership, sponsored exclusion, open status and quote state are decided by
 * the server for the viewing organization; the client never rebuilds them.
 *
 * Network only. Marketplace / Story quotes go through
 * submit_pulse_bid_with_direct_quote (bids.service), never through here.
 */
import type { MarketplaceLoadSearch } from '@/features/network/utils/marketplaceSearch.util';
import { supabase } from '@/lib/supabase';

/** list_network_pool_lanes_for_org clamps p_limit to 1..200. */
const LANE_PAGE_SIZE = 200;
/** Lanes are read keyset-paged; this bounds one discovery read. */
const MAX_LANE_PAGES = 10;

export type NetworkPoolLane = {
  pool_key: string;
  pickup_area: string;
  drop_location: string;
  vehicle_type: string;
  eligible_count: number;
  sponsored_count: number;
  shipper_count: number;
  too_large: boolean;
};

export type NetworkPoolMember = {
  id: string;
  indent_number: string | null;
  pickup_area: string;
  drop_location: string;
  vehicle_type: string;
  load_type: string | null;
  pickup_date: string | null;
  status: string | null;
  circulation_target: string | null;
  supplier_target: number | null;
  client_price: number | null;
  weight: number | null;
  organization_id: string;
  creator_organization_name: string | null;
  created_at: string;
};

export type NetworkPoolOrgQuote = {
  id: string;
  indent_id: string;
  status: string;
  amount: number;
  counter_amount: number | null;
  quotable: boolean;
  updated_at: string;
};

export type NetworkPoolManifest = {
  pool_key: string;
  viewing_organization_id: string;
  as_of: string;
  max_members: number;
  member_count: number;
  shipper_count: number;
  excluded_sponsored_count: number;
  /** False when the pool exceeds max_members; members and quotable_ids are then empty. */
  complete: boolean;
  /** Null when incomplete. Changes whenever membership or this org's quote state changes. */
  fingerprint: string | null;
  members: NetworkPoolMember[];
  quotable_ids: string[];
  org_quotes: NetworkPoolOrgQuote[];
};

export type NetworkQuoteResult = {
  quote_id: string;
  indent_id: string;
  bidder_organization_id: string;
  amount: number;
  status: string;
  created: boolean;
};

export async function listNetworkPoolLanes(
  orgId: string,
): Promise<{ error: Error | null; lanes: NetworkPoolLane[]; complete: boolean }> {
  const lanes: NetworkPoolLane[] = [];
  let afterKey: string | null = null;
  for (let page = 0; page < MAX_LANE_PAGES; page += 1) {
    const { data, error } = await supabase().rpc('list_network_pool_lanes_for_org', {
      p_org_id: orgId,
      p_limit: LANE_PAGE_SIZE,
      p_after_key: afterKey,
    });
    if (error) return { error: new Error(error.message), lanes, complete: false };
    const rows = (data ?? []) as NetworkPoolLane[];
    lanes.push(...rows);
    if (rows.length < LANE_PAGE_SIZE) return { error: null, lanes, complete: true };
    afterKey = rows[rows.length - 1]!.pool_key;
  }
  return { error: null, lanes, complete: false };
}

export async function getOrgNetworkPool(
  orgId: string,
  key: MarketplaceLoadSearch,
): Promise<{ error: Error | null; pool: NetworkPoolManifest | null }> {
  const { data, error } = await supabase().rpc('get_org_network_pool', {
    p_org_id: orgId,
    p_pickup: key.pickup,
    p_drop: key.drop,
    p_vehicle_type: key.vehicleType,
  });
  if (error) return { error: new Error(error.message), pool: null };
  return { error: null, pool: (data ?? null) as NetworkPoolManifest | null };
}

/**
 * New quote, or a revision of this org's uncountered pending quote, on one
 * Network-visible indent. Decided or countered quotes raise quote_locked.
 */
export async function submitNetworkQuote(
  indentId: string,
  bidderOrgId: string,
  amount: number,
  notes?: string | null,
): Promise<{ error: Error | null; quote: NetworkQuoteResult | null }> {
  const { data, error } = await supabase().rpc('submit_network_quote', {
    p_indent_id: indentId,
    p_bidder_org_id: bidderOrgId,
    p_amount: Number(amount),
    p_notes: (notes ?? '').trim() || null,
  });
  if (error) return { error: new Error(error.message), quote: null };
  return { error: null, quote: (data ?? null) as NetworkQuoteResult | null };
}

export type NetworkPoolQuoteCommitInput = {
  vehicleLimit: number;
  validUntilIso: string;
};

export type NetworkPoolQuoteCommitResult = {
  commit_id: string;
  pool_key: string;
  quoted: number;
  failed: number;
  vehicle_limit: number;
  valid_until: string;
};

export async function submitNetworkPoolQuote(
  orgId: string,
  key: MarketplaceLoadSearch,
  amount: number,
  commit: NetworkPoolQuoteCommitInput,
): Promise<{ error: Error | null; result: NetworkPoolQuoteCommitResult | null }> {
  const { data, error } = await supabase().rpc('submit_network_pool_quote', {
    p_org_id: orgId,
    p_pickup: key.pickup,
    p_drop: key.drop,
    p_vehicle_type: key.vehicleType,
    p_amount: Number(amount),
    p_vehicle_limit: Math.floor(commit.vehicleLimit),
    p_valid_until: commit.validUntilIso,
  });
  if (error) {
    const detail = [error.code, error.message].filter(Boolean).join(" ");
    return { error: new Error(detail || "submit_network_pool_quote failed"), result: null };
  }
  return { error: null, result: (data ?? null) as NetworkPoolQuoteCommitResult | null };
}

export type NetworkPoolBidCommitRow = {
  id: string;
  status: string;
  awarded_count: number;
  vehicle_limit: number;
  valid_until: string;
};

export async function withdrawNetworkQuotes(
  orgId: string,
  indentIds: string[],
): Promise<{ error: Error | null; withdrawn: number }> {
  const unique = [...new Set(indentIds.filter(Boolean))];
  if (!orgId || unique.length === 0) {
    return { error: new Error("No bid to cancel."), withdrawn: 0 };
  }

  const { data: rpcCount, error: rpcError } = await supabase().rpc(
    "withdraw_network_quotes",
    {
      p_bidder_org_id: orgId,
      p_indent_ids: unique,
    },
  );
  if (!rpcError) {
    const withdrawn = Math.max(0, Math.floor(Number(rpcCount ?? 0)));
    if (withdrawn === 0) {
      return { error: new Error("No pending bid to cancel."), withdrawn: 0 };
    }
    return { error: null, withdrawn };
  }

  const { data, error } = await supabase()
    .from("direct_quotes")
    .delete()
    .eq("bidder_organization_id", orgId)
    .eq("status", "pending")
    .in("indent_id", unique)
    .select("id");
  if (!error) {
    const withdrawn = (data ?? []).length;
    if (withdrawn === 0) {
      return { error: new Error("No pending bid to cancel."), withdrawn: 0 };
    }
    return { error: null, withdrawn };
  }

  const detail = [rpcError.code, rpcError.message, error.message]
    .filter(Boolean)
    .join(" ");
  return {
    error: new Error(detail || "Could not cancel bid."),
    withdrawn: 0,
  };
}

export async function getNetworkPoolBidCommitsByIds(
  ids: string[],
): Promise<{ error: Error | null; commits: Record<string, NetworkPoolBidCommitRow> }> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return { error: null, commits: {} };
  const { data, error } = await supabase()
    .from('network_pool_bid_commits')
    .select('id, status, awarded_count, vehicle_limit, valid_until')
    .in('id', unique);
  if (error) return { error: new Error(error.message), commits: {} };
  const commits: Record<string, NetworkPoolBidCommitRow> = {};
  for (const row of (data ?? []) as NetworkPoolBidCommitRow[]) {
    if (row.id) commits[row.id] = row;
  }
  return { error: null, commits };
}
