/**
 * A4 — Business "Find Loads": open Marketplace/both indents a business
 * organization could bid on, from orgs it has no existing relationship with.
 *
 * Discovery only (list_open_marketplace_loads_for_org is membership-gated,
 * not a bid-eligibility check). Every row must be composed through
 * resolveCommercialOpportunity() before a UI decides bidding, pricing, or
 * lifecycle presentation — see docs/MARKETPLACE_DOMAIN.md
 * "Distribution vs monetization".
 */
import { getAccessToken, supabase } from '@/lib/supabase';
import {
  resolveCommercialOpportunity,
  type CommercialOpportunity,
} from '@/features/marketplace/domain';
import {
  MARKETPLACE_LOAD_PAGE_SIZE,
  nextMarketplacePageOffset,
  sliceMarketplaceLoadsPage,
} from '@/features/network/utils/marketplaceLoadsPage.util';
import {
  isMarketplaceSearchReady,
  isUnsupportedMarketplaceSearchRpc,
  lanesFromMarketplaceLoads,
  loadMatchesMarketplaceSearch,
  normalizeMarketplaceSearch,
  positiveLaneTarget,
  type MarketplaceLoadSearch,
  type MarketplaceSearchLane,
} from '@/features/network/utils/marketplaceSearch.util';
import {
  runPoolBidSubmission,
  type PoolBidSubmissionResult,
} from '@/features/network/utils/pooledOpportunity.util';

const LANE_FALLBACK_LIMIT = 80;

export type { MarketplaceLoadSearch, MarketplaceSearchLane };

export type OrgOpenMarketplaceLoad = {
  id: string;
  indent_number: string | null;
  pickup_area: string | null;
  drop_location: string | null;
  vehicle_type: string | null;
  load_type: string | null;
  pickup_date: string | null;
  status: string | null;
  circulation_target: string | null;
  rate_offer: number | null;
  creator_organization_id: string | null;
  creator_organization_name: string | null;
  created_at: string | null;
  is_sponsored: boolean | null;
  reach_campaign_id: string | null;
};

export async function listOpenMarketplaceLoadsForOrg(
  orgId: string,
  limit = MARKETPLACE_LOAD_PAGE_SIZE,
  search?: MarketplaceLoadSearch | null,
): Promise<{ error: Error | null; loads: OrgOpenMarketplaceLoad[] }> {
  const { error, loads } = await listOpenMarketplaceLoadsPage(
    orgId,
    0,
    limit,
    search,
  );
  return { error, loads };
}

/** Server-filtered page — does not fetch until from / to / vehicle are set. */
export async function listOpenMarketplaceLoadsPage(
  orgId: string,
  offset = 0,
  pageSize = MARKETPLACE_LOAD_PAGE_SIZE,
  search?: MarketplaceLoadSearch | null,
): Promise<{
  error: Error | null;
  loads: OrgOpenMarketplaceLoad[];
  hasMore: boolean;
  nextOffset: number | undefined;
}> {
  if (!isMarketplaceSearchReady(search)) {
    return { error: null, loads: [], hasMore: false, nextOffset: undefined };
  }
  const ready = normalizeMarketplaceSearch(search);
  const { data, error } = await supabase().rpc(
    'list_open_marketplace_loads_for_org',
    {
      p_org_id: orgId,
      p_limit: pageSize,
      p_offset: offset,
      p_pickup: ready.pickup,
      p_drop: ready.drop,
      p_vehicle_type: ready.vehicleType,
    },
  );
  if (!error) {
    const page = (data ?? []) as OrgOpenMarketplaceLoad[];
    return {
      error: null,
      loads: page,
      hasMore: page.length >= pageSize,
      nextOffset: nextMarketplacePageOffset(offset, page.length, pageSize),
    };
  }
  if (!isUnsupportedMarketplaceSearchRpc(error.message)) {
    return { error: new Error(error.message), loads: [], hasMore: false, nextOffset: undefined };
  }
  const fallback = await listOpenMarketplaceLoadsUnfiltered(orgId, LANE_FALLBACK_LIMIT);
  if (fallback.error) {
    return { error: fallback.error, loads: [], hasMore: false, nextOffset: undefined };
  }
  const matched = fallback.loads.filter((load) =>
    loadMatchesMarketplaceSearch(load, ready),
  );
  const { page, hasMore } = sliceMarketplaceLoadsPage(matched, offset, pageSize);
  return {
    error: null,
    loads: page,
    hasMore,
    nextOffset: nextMarketplacePageOffset(offset, page.length, pageSize),
  };
}

async function listOpenMarketplaceLoadsUnfiltered(
  orgId: string,
  limit: number,
): Promise<{ error: Error | null; loads: OrgOpenMarketplaceLoad[] }> {
  const { data, error } = await supabase().rpc(
    'list_open_marketplace_loads_for_org',
    { p_org_id: orgId, p_limit: limit },
  );
  if (error) return { error: new Error(error.message), loads: [] };
  return { error: null, loads: (data ?? []) as OrgOpenMarketplaceLoad[] };
}

function publishMarketplaceLanes(rows: readonly MarketplaceSearchLane[]): MarketplaceSearchLane[] {
  return rows
    .filter(
      (row) =>
        Boolean(row.pickup_area?.trim()) &&
        Boolean(row.drop_location?.trim()) &&
        Boolean(row.vehicle_type?.trim()),
    )
    .map((row) => {
      if (!("target_rate_min" in row) && !("target_rate_max" in row)) return row;
      return {
        ...row,
        target_rate_min: positiveLaneTarget(row.target_rate_min),
        target_rate_max: positiveLaneTarget(row.target_rate_max),
      };
    });
}

/**
 * Distinct live Marketplace lanes for From / To / Vehicle dropdowns.
 * The price bootstrap is one grouped read (pickup, drop, vehicle, count,
 * target min/max). It runs beside the lane list so a database that does not
 * have the function yet still returns lanes.
 */
export async function listMarketplaceSearchLanes(
  orgId: string,
): Promise<{ error: Error | null; lanes: MarketplaceSearchLane[] }> {
  const [boot, dedicated] = await Promise.all([
    supabase().rpc('list_marketplace_lane_bootstrap', { p_org_id: orgId }),
    supabase().rpc('list_marketplace_search_lanes', { p_org_id: orgId }),
  ]);
  if (!boot.error) {
    return { error: null, lanes: publishMarketplaceLanes((boot.data ?? []) as MarketplaceSearchLane[]) };
  }
  if (!dedicated.error) {
    const lanes = publishMarketplaceLanes((dedicated.data ?? []) as MarketplaceSearchLane[]);
    if (lanes.length > 0) return { error: null, lanes };
  } else if (!isUnsupportedMarketplaceSearchRpc(dedicated.error.message)) {
    return { error: new Error(dedicated.error.message), lanes: [] };
  }

  const fallback = await listOpenMarketplaceLoadsUnfiltered(orgId, LANE_FALLBACK_LIMIT);
  if (fallback.error) return { error: fallback.error, lanes: [] };
  return { error: null, lanes: lanesFromMarketplaceLoads(fallback.loads) };
}

/**
 * A4.4 Phase 1 — organization Market bid on an open Marketplace indent.
 * bidder_type resolves to 'organization' server-side (submit_market_bid) once
 * p_bidder_organization_id is non-null. owner_vehicle_id is deliberately
 * omitted: it can only ever reference an individual DCO's owner_vehicles row
 * (FK target), never an organization's own vehicles -- vehicle/driver
 * selection for an organization award happens at allocation time (A4.4
 * Phase 3), not at bid time. Membership, self-bid, and indent-eligibility
 * checks are all enforced server-side by submit_market_bid() itself.
 */
export type MyOrgMarketBidStatus = 'pending' | 'accepted' | 'rejected' | 'withdrawn' | 'superseded';

/** A8.6.2 — independent of MyOrgMarketBidStatus; see network/services/marketBids.service.ts for full doc. */
export type FeePaymentStatus = 'not_required' | 'required' | 'pending' | 'paid' | 'failed' | 'expired' | 'refunded';

export type MyOrgMarketBidRow = {
  id: string;
  indent_id: string;
  indent_number: string | null;
  pickup_area: string | null;
  drop_location: string | null;
  pickup_date: string | null;
  load_type: string | null;
  /** Pool key field (pickup × drop × vehicle). Absent on servers before 2026-11-11 RPC update. */
  vehicle_type?: string | null;
  /** Indent weight in kg. Absent on servers before 2026-11-11 RPC update. */
  weight?: number | null;
  /** Null until awarded AND fee settled (server-masked from 2026-11-11 RPC update). */
  owner_organization_id: string | null;
  owner_organization_name: string | null;
  /** Always populated (last-4 masked). */
  owner_masked_phone: string | null;
  /** Unmasked — only non-null once accepted AND fee_payment_status is paid/not_required. */
  owner_phone: string | null;
  amount: number;
  note: string | null;
  status: MyOrgMarketBidStatus;
  fee_payment_status: FeePaymentStatus;
  platform_fee_amount: number | null;
  created_at: string;
  accepted_at: string | null;
};

/**
 * Find Loads stores `{ bids }` on `findLoadsForOrg.myBids`. The allocation
 * wizard used to store the bare array on that same key. Either value can be
 * in cache; callers must not assume one shape.
 */
export function marketBidsFromQueryData(data: unknown): MyOrgMarketBidRow[] {
  if (Array.isArray(data)) return data as MyOrgMarketBidRow[];
  const bids = (data as { bids?: unknown } | null)?.bids;
  if (Array.isArray(bids)) return bids as MyOrgMarketBidRow[];
  return [];
}

/** One page. The walk continues until a short page, so this is not a ceiling. */
const MY_ORG_MARKET_BIDS_PAGE = 100;

/**
 * `list_my_org_market_bids_page` is in an unapplied migration. PostgREST
 * answers a missing function with 404, which the browser logs even when we
 * catch it. Stay on the deployed list until that migration is applied, then
 * turn this on (tests do that directly).
 */
let marketBidsPageRpc = false;

export function useMarketBidsPageRpc(enabled: boolean): void {
  marketBidsPageRpc = enabled;
}

function missingMarketBidsPageRpc(error: { code?: string; message?: string }): boolean {
  return (
    error.code === "PGRST202" ||
    /could not find the function|schema cache|does not exist/i.test(error.message ?? "")
  );
}

/**
 * A4.4 Phase 4 — this organization's own Marketplace bids, across every
 * member (not just whoever personally submitted a given bid) — backs the
 * "My Bids" segment in Find Loads. Pages until the organization is exhausted.
 * A plain market_bids select cannot see a colleague's bid, so this stays on
 * the security-definer page RPC.
 */
export async function listMyOrgMarketBids(
  orgId: string,
): Promise<{ error: Error | null; bids: MyOrgMarketBidRow[] }> {
  if (!marketBidsPageRpc) {
    const legacy = await supabase().rpc("list_my_org_market_bids", {
      p_org_id: orgId,
      p_limit: MY_ORG_MARKET_BIDS_PAGE,
    });
    if (legacy.error) return { error: new Error(legacy.error.message), bids: [] };
    return { error: null, bids: marketBidsFromQueryData(legacy.data) };
  }

  const bids: MyOrgMarketBidRow[] = [];
  const seen = new Set<string>();
  let beforeCreatedAt: string | null = null;
  let beforeId: string | null = null;

  for (;;) {
    const { data, error } = await supabase().rpc("list_my_org_market_bids_page", {
      p_org_id: orgId,
      p_limit: MY_ORG_MARKET_BIDS_PAGE,
      p_before_created_at: beforeCreatedAt,
      p_before_id: beforeId,
    });
    if (error) {
      if (bids.length === 0 && missingMarketBidsPageRpc(error)) {
        const legacy = await supabase().rpc("list_my_org_market_bids", {
          p_org_id: orgId,
          p_limit: MY_ORG_MARKET_BIDS_PAGE,
        });
        if (legacy.error) return { error: new Error(legacy.error.message), bids: [] };
        return { error: null, bids: marketBidsFromQueryData(legacy.data) };
      }
      return { error: new Error(error.message), bids: [] };
    }

    const page = marketBidsFromQueryData(data);
    for (const bid of page) {
      if (seen.has(bid.id)) continue;
      seen.add(bid.id);
      bids.push(bid);
    }
    if (page.length < MY_ORG_MARKET_BIDS_PAGE) return { error: null, bids };

    const last = page[page.length - 1];
    if (
      !last?.id ||
      !last.created_at ||
      (last.created_at === beforeCreatedAt && last.id === beforeId)
    ) {
      return { error: new Error("My Bids paging did not advance."), bids: [] };
    }
    beforeCreatedAt = last.created_at;
    beforeId = last.id;
  }
}

export type MyOrgMarketBidCounts = {
  total: number;
  pending: number;
  accepted: number;
  rejected: number;
  withdrawn: number;
  superseded: number;
};

/** Organization totals. Null when the count function is not deployed yet. */
export async function countMyOrgMarketBids(
  orgId: string,
): Promise<{ error: Error | null; counts: MyOrgMarketBidCounts | null }> {
  if (!marketBidsPageRpc) return { error: null, counts: null };
  const { data, error } = await supabase().rpc("count_my_org_market_bids", {
    p_org_id: orgId,
  });
  if (error) {
    if (missingMarketBidsPageRpc(error)) return { error: null, counts: null };
    return { error: new Error(error.message), counts: null };
  }
  const raw = (data ?? {}) as Partial<Record<keyof MyOrgMarketBidCounts, unknown>>;
  const n = (value: unknown) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  return {
    error: null,
    counts: {
      total: n(raw.total),
      pending: n(raw.pending),
      accepted: n(raw.accepted),
      rejected: n(raw.rejected),
      withdrawn: n(raw.withdrawn),
      superseded: n(raw.superseded),
    },
  };
}

export async function submitOrgMarketBid(
  orgId: string,
  indentId: string,
  amount: number,
  note?: string | null,
): Promise<{ error: Error | null; bidId: string | null }> {
  const { data, error } = await supabase().rpc('submit_market_bid', {
    p_indent_id: indentId,
    p_amount: amount,
    p_note: (note ?? '').trim() || null,
    p_bidder_organization_id: orgId,
    p_owner_vehicle_id: null,
  });
  if (error) return { error: new Error(error.message), bidId: null };
  const bidId = (data as { bid_id?: string } | null)?.bid_id ?? null;
  return { error: null, bidId };
}

export type MarketplacePoolMember = {
  id: string;
  indent_number: string | null;
  pickup_area: string | null;
  drop_location: string | null;
  vehicle_type: string | null;
  load_type: string | null;
  pickup_date: string | null;
  status: string | null;
  circulation_target: string | null;
  rate_offer: number | null;
  weight: number | null;
  creator_organization_id: string | null;
  created_at: string | null;
};

/** One org bid state per member indent; `status` is the organization's, `my_status` the caller's own. */
export type MarketplacePoolOrgBid = {
  id: string;
  indent_id: string;
  status: MyOrgMarketBidStatus;
  amount: number;
  fee_payment_status: FeePaymentStatus;
  is_mine: boolean;
  my_status: MyOrgMarketBidStatus | null;
  updated_at: string;
};

/** get_org_marketplace_pool: the caller-scoped pool, its biddable set and org bid state. */
export type OrgMarketplacePoolManifest = {
  pool_key: string;
  as_of: string;
  max_members: number;
  member_count: number;
  excluded_sponsored_count: number;
  complete: boolean;
  fingerprint: string | null;
  members: MarketplacePoolMember[];
  biddable_ids: string[];
  organization_blocked: { indent_id: string; reason: string; message: string }[];
  org_bids: MarketplacePoolOrgBid[];
};

export async function getOrgMarketplacePool(
  orgId: string,
  key: MarketplaceLoadSearch,
): Promise<{ error: Error | null; pool: OrgMarketplacePoolManifest | null }> {
  const { data, error } = await supabase().rpc('get_org_marketplace_pool', {
    p_org_id: orgId,
    p_pickup: key.pickup,
    p_drop: key.drop,
    p_vehicle_type: key.vehicleType,
  });
  if (error) return { error: new Error(error.message), pool: null };
  return { error: null, pool: (data ?? null) as OrgMarketplacePoolManifest | null };
}

/** A manifest member as the row shape composeFindLoadsOpportunity reads; sponsored loads are never members. */
export function marketplacePoolMemberAsLoad(member: MarketplacePoolMember): OrgOpenMarketplaceLoad {
  return {
    ...member,
    creator_organization_name: null,
    is_sponsored: false,
    reach_campaign_id: null,
  };
}

/**
 * Pooled opportunity bid: the same rate on each selected indent via the
 * existing per-indent submit_market_bid. Not atomic — each indent is its own
 * bid and its own award; the result reports which loads failed and why.
 */
/** Refuses, before any write, unless every indent is a canonical member of the pool. */
export async function submitOrgPoolBid(
  orgId: string,
  pool: { indentIds: readonly string[]; memberIds: ReadonlySet<string> },
  amount: number,
): Promise<PoolBidSubmissionResult> {
  return runPoolBidSubmission({
    indentIds: pool.indentIds,
    memberIds: pool.memberIds,
    submitOne: (indentId) => submitOrgMarketBid(orgId, indentId, amount, null),
  });
}

/**
 * Composes one discovered row into commercial truth for this viewer org.
 * `viewerCanBidCapability` must come from the same check StoryDetailScreen
 * uses (`currentOrganization.capabilities.canBid && can("sales.marketplace.bid")`)
 * — there is no dedicated "marketplace discovery" capability, and per the A4
 * design this RPC intentionally does not decide bid eligibility itself.
 */
export function composeFindLoadsOpportunity(
  load: OrgOpenMarketplaceLoad,
  viewerOrgId: string | null,
  viewerCanBidCapability: boolean,
): CommercialOpportunity {
  return resolveCommercialOpportunity({
    viewerOrgId,
    ownerOrgId: load.creator_organization_id ?? '',
    isLoad: true,
    indentStatus: load.status,
    supplierTarget: load.rate_offer,
    rateOffer: load.rate_offer,
    isSponsored: load.is_sponsored,
    reachCampaignId: load.reach_campaign_id,
    hasActiveCampaign: Boolean(load.is_sponsored),
    viewerCanBidCapability,
  });
}

export function findLoadsDisplayId(load: OrgOpenMarketplaceLoad): string {
  const n = (load.indent_number ?? '').trim();
  return n || load.id.slice(0, 8).toUpperCase();
}

export function formatFindLoadsRateOffer(
  rate: number | null | undefined,
): string | null {
  if (rate == null || !Number.isFinite(Number(rate))) return null;
  return `₹${Number(rate).toLocaleString('en-IN')}`;
}

/**
 * Which of these indents already have a linked LOAD post (source_indent_id),
 * i.e. which ones can open the existing story-detail Bid Sheet as-is.
 *
 * A marketplace/both indent is NOT guaranteed to have a post — ensureIndentStory()
 * only runs on share/Pulse actions, not on the "Share to Marketplace" toggle
 * (features/network/components/LoadCenterView.tsx's handleToggleMarketplace).
 * Rows with no match here are discovery-only in this release: we deliberately
 * do not fall back to direct_quotes (that path is documented for offline/
 * integrated_supplier indents, not open Marketplace) or auto-create a post,
 * per the A4 scope boundary — see docs/MARKETPLACE_DOMAIN.md.
 */
export async function findPostIdsForIndents(
  indentIds: string[],
): Promise<{ error: Error | null; postIdByIndentId: Map<string, string> }> {
  if (indentIds.length === 0) return { error: null, postIdByIndentId: new Map() };
  if (!(await getAccessToken())) {
    return { error: null, postIdByIndentId: new Map() };
  }
  const uniqueIds = [...new Set(indentIds.filter(Boolean))];
  const map = new Map<string, string>();
  for (let i = 0; i < uniqueIds.length; i += 40) {
    const chunk = uniqueIds.slice(i, i + 40);
    const { data, error } = await supabase()
      .from('posts')
      .select('id, source_indent_id')
      .in('source_indent_id', chunk);
    if (error) return { error: new Error(error.message), postIdByIndentId: new Map() };
    for (const row of (data ?? []) as { id: string; source_indent_id: string | null }[]) {
      if (row.source_indent_id) map.set(row.source_indent_id, row.id);
    }
  }
  return { error: null, postIdByIndentId: map };
}

/** A trip created from an awarded indent. Allocation is this trip link. */
export type MarketplaceConvertedTrip = {
  id: string;
  indentId: string;
  organizationId: string | null;
  supplierRate: number | null;
  clientPrice: number | null;
  status: string | null;
  cancelReason: string | null;
};

export type MarketplaceAwardIndent = {
  id: string;
  status: string | null;
  cancelReason: string | null;
};

export type MarketplaceTripReceipt = {
  tripId: string;
  amountIn: number;
  amountOut: number;
  contactType: string | null;
};

/**
 * Trips this user can see for the given indents, plus the ledger rows on those
 * trips. A won bid is a marketplace transaction only after the indent is
 * allocated — a non-deleted trip exists for it.
 */
export async function listMarketplaceConvertedTrips(
  indentIds: readonly string[],
): Promise<{
  error: Error | null;
  trips: MarketplaceConvertedTrip[];
  receipts: MarketplaceTripReceipt[];
  indents: MarketplaceAwardIndent[];
}> {
  const uniqueIds = [...new Set(indentIds.map((id) => id.trim()).filter(Boolean))];
  if (uniqueIds.length === 0) return { error: null, trips: [], receipts: [], indents: [] };
  const wanted = new Set(uniqueIds);
  const trips: MarketplaceConvertedTrip[] = [];
  const indents: MarketplaceAwardIndent[] = [];
  const seenTrip = new Set<string>();
  for (let i = 0; i < uniqueIds.length; i += 40) {
    const chunk = uniqueIds.slice(i, i + 40);
    const [tripResult, indentResult] = await Promise.all([
      supabase()
        .from('trips')
        .select('id, indent_id, source_indent_id, organization_id, supplier_rate, client_price, status, cancel_reason')
        .is('deleted_at', null)
        .or(`indent_id.in.(${chunk.join(',')}),source_indent_id.in.(${chunk.join(',')})`),
      supabase()
        .from('indents')
        .select('id, status, cancel_reason')
        .in('id', chunk),
    ]);
    if (tripResult.error) return { error: new Error(tripResult.error.message), trips: [], receipts: [], indents: [] };
    for (const row of (tripResult.data ?? []) as {
      id: string;
      indent_id: string | null;
      source_indent_id: string | null;
      organization_id: string | null;
      supplier_rate: number | null;
      client_price: number | null;
      status: string | null;
      cancel_reason: string | null;
    }[]) {
      const indentId = [row.indent_id, row.source_indent_id].find((id) => id && wanted.has(id));
      if (!indentId || seenTrip.has(row.id)) continue;
      seenTrip.add(row.id);
      trips.push({
        id: row.id,
        indentId,
        organizationId: row.organization_id,
        supplierRate: row.supplier_rate,
        clientPrice: row.client_price,
        status: row.status,
        cancelReason: row.cancel_reason,
      });
    }
    if (indentResult.error) return { error: new Error(indentResult.error.message), trips: [], receipts: [], indents: [] };
    for (const row of (indentResult.data ?? []) as {
      id: string;
      status: string | null;
      cancel_reason: string | null;
    }[]) {
      indents.push({ id: row.id, status: row.status, cancelReason: row.cancel_reason });
    }
  }
  const receipts: MarketplaceTripReceipt[] = [];
  const tripIds = trips.map((trip) => trip.id);
  for (let i = 0; i < tripIds.length; i += 40) {
    const chunk = tripIds.slice(i, i + 40);
    const { data, error } = await supabase()
      .from('transactions')
      .select('trip_id, amount_in, amount_out, contact_type')
      .in('trip_id', chunk);
    if (error) return { error: new Error(error.message), trips: [], receipts: [], indents: [] };
    for (const row of (data ?? []) as {
      trip_id: string | null;
      amount_in: number | null;
      amount_out: number | null;
      contact_type: string | null;
    }[]) {
      if (!row.trip_id) continue;
      receipts.push({
        tripId: row.trip_id,
        amountIn: Number(row.amount_in) || 0,
        amountOut: Number(row.amount_out) || 0,
        contactType: row.contact_type,
      });
    }
  }
  return { error: null, trips, receipts, indents };
}
