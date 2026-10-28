/**
 * Pooled Marketplace opportunity — presentation model over existing data.
 *
 * A pool is one live Marketplace lane (pickup × drop × vehicle) as returned by
 * list_marketplace_search_lanes; its members are the open indents whose own
 * pickup, drop and vehicle canonically equal the lane's. A pool of one indent
 * is still a pool. There is no pool-level bid row: a pool bid is one rate the
 * bidder submits to every eligible member through the existing per-indent
 * submit_market_bid, and every award still happens per indent on the shipper
 * side. The bidder never chooses members; the pool is the scope.
 *
 * list_open_marketplace_loads_for_org matches by lowercase substring, so its
 * rows are candidates only. Membership is decided here, by isPoolMember, and
 * every count and submission works from members — never raw rows. A sponsored
 * Reach load is never a member: it stays an individual opportunity.
 */
import type {
  MarketplaceLoadSearch,
  MarketplaceSearchLane,
} from "@/features/network/utils/marketplaceSearch.util";
import { isSponsoredReachLoad } from "@/features/network/utils/sponsoredReach.util";

/**
 * list_open_marketplace_loads_for_org clamps p_offset to 150, so rows past the
 * page at offset 150 cannot be read. A pool that reaches it with a full page
 * may be larger than what can be read, and must not be bid on partially.
 */
export const MARKETPLACE_POOL_MAX_OFFSET = 150;

/** Upper bound on per-indent bid writes one pool submission may issue. */
export const POOL_BID_MAX_LOADS = 150;

export const POOL_TOO_LARGE_MESSAGE =
  "This pool contains more loads than Marketplace can currently process. Nothing was submitted.";

export const POOL_CHANGED_MESSAGE =
  "This pool changed while you were bidding. Nothing was submitted — review the updated pool and submit again.";

/**
 * Outcome to show after the re-read manifest no longer matches what was on
 * screen. A pool that became too large is already explained by the bid panel.
 */
export function poolDriftResult(stillComplete: boolean): PoolBidSubmissionResult | null {
  return stillComplete
    ? { blocked: POOL_CHANGED_MESSAGE, attempted: 0, succeeded: [], failed: [] }
    : null;
}

/** Read progress of a server manifest: it is either the whole pool or, when too large, none of it. */
export function manifestFetchProgress(
  manifest: { complete: boolean } | null | undefined,
): PoolFetchProgress {
  if (!manifest) return { nextOffset: 0, complete: false, truncated: false };
  return manifest.complete
    ? { nextOffset: null, complete: true, truncated: false }
    : { nextOffset: null, complete: false, truncated: true };
}

export type PoolCommercialState =
  "open" | "submitted" | "awarded" | "not_selected" | "closed";

export const POOL_STATE_COPY: Record<
  PoolCommercialState,
  { label: string; detail: string }
> = {
  open: {
    label: "Open for bids",
    detail: "Submit one rate for all eligible loads in this pool.",
  },
  submitted: {
    label: "Your bid submitted",
    detail:
      "The shipper reviews your rate. Nothing is awarded until the shipper accepts.",
  },
  awarded: {
    label: "Awarded",
    detail: "Loads from this pool were awarded to your organization.",
  },
  not_selected: {
    label: "Not selected",
    detail: "Your bid on this pool was not selected.",
  },
  closed: {
    label: "Closed",
    detail: "No loads in this pool are open for bids.",
  },
};

/** Same values as MyOrgMarketBidStatus (market_bids.status). */
export type PoolBidStatus =
  "pending" | "accepted" | "rejected" | "withdrawn" | "superseded";

export type PoolBid = {
  indent_id: string;
  status: PoolBidStatus;
};

type PoolRouteFields = {
  pickup_area: string | null;
  drop_location: string | null;
  vehicle_type: string | null;
};

type PoolLoad = PoolRouteFields & {
  id: string;
  pickup_date: string | null;
  load_type: string | null;
  rate_offer: number | null;
  creator_organization_id: string | null;
  is_sponsored: boolean | null;
  reach_campaign_id?: string | null;
};

/**
 * The one normalization for pool identity: trim + case-fold. Mirrors the lane
 * RPC's trim() grouping, folded so case-only variants are one pool. Internal
 * whitespace is kept as-is, as the lane RPC keeps it.
 */
export function canonicalPoolField(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

/** Trimmed display values for a pool; identity is poolKeyId. */
export function poolKey(
  draft:
    | { [K in keyof MarketplaceLoadSearch]?: MarketplaceLoadSearch[K] | null }
    | null
    | undefined,
): MarketplaceLoadSearch {
  return {
    pickup: (draft?.pickup ?? "").trim(),
    drop: (draft?.drop ?? "").trim(),
    vehicleType: (draft?.vehicleType ?? "").trim(),
  };
}

export function poolKeyFromLane(
  lane: MarketplaceSearchLane,
): MarketplaceLoadSearch {
  return poolKey({
    pickup: lane.pickup_area,
    drop: lane.drop_location,
    vehicleType: lane.vehicle_type,
  });
}

export function poolKeyId(key: MarketplaceLoadSearch): string {
  return [key.pickup, key.drop, key.vehicleType]
    .map(canonicalPoolField)
    .join("|");
}

/** Canonical pool-membership predicate. Exact on all three fields after trim + case-fold. */
export function isPoolMember(
  row: PoolRouteFields,
  key: MarketplaceLoadSearch,
): boolean {
  const pickup = canonicalPoolField(key.pickup);
  const drop = canonicalPoolField(key.drop);
  const vehicle = canonicalPoolField(key.vehicleType);
  if (!pickup || !drop || !vehicle) return false;
  return (
    canonicalPoolField(row.pickup_area) === pickup &&
    canonicalPoolField(row.drop_location) === drop &&
    canonicalPoolField(row.vehicle_type) === vehicle
  );
}

/** Members of the pool among RPC candidate rows, de-duplicated by id, RPC order kept. */
export function poolMembers<L extends PoolRouteFields & { id: string }>(
  rows: readonly L[],
  key: MarketplaceLoadSearch,
): L[] {
  const seen = new Set<string>();
  const out: L[] = [];
  for (const row of rows) {
    if (seen.has(row.id) || !isPoolMember(row, key)) continue;
    seen.add(row.id);
    out.push(row);
  }
  return out;
}

export type PoolLane = MarketplaceSearchLane & { poolId: string };

/**
 * One entry per canonical pool. Case-only lane variants are merged: counts are
 * summed and the display value is the variant carrying the most loads.
 */
export function canonicalPoolLanes(
  lanes: readonly MarketplaceSearchLane[],
): PoolLane[] {
  const byId = new Map<string, { lane: PoolLane; topCount: number }>();
  for (const lane of lanes) {
    const poolId = poolKeyId(poolKeyFromLane(lane));
    const count = Number(lane.load_count) || 0;
    const prev = byId.get(poolId);
    if (!prev) {
      byId.set(poolId, {
        lane: { ...lane, load_count: count, poolId },
        topCount: count,
      });
      continue;
    }
    const total = prev.lane.load_count + count;
    if (count > prev.topCount) {
      prev.lane = { ...lane, load_count: total, poolId };
      prev.topCount = count;
    } else {
      prev.lane = { ...prev.lane, load_count: total };
    }
  }
  return [...byId.values()].map((v) => v.lane);
}

/** Narrows pools by whichever of pickup / drop / vehicle the user has picked. */
export function filterPoolLanes(
  lanes: readonly MarketplaceSearchLane[],
  search: Partial<MarketplaceLoadSearch> | null | undefined,
): PoolLane[] {
  const n = poolKey(search);
  return canonicalPoolLanes(lanes).filter(
    (lane) =>
      (!n.pickup ||
        canonicalPoolField(lane.pickup_area) ===
          canonicalPoolField(n.pickup)) &&
      (!n.drop ||
        canonicalPoolField(lane.drop_location) ===
          canonicalPoolField(n.drop)) &&
      (!n.vehicleType ||
        canonicalPoolField(lane.vehicle_type) ===
          canonicalPoolField(n.vehicleType)),
  );
}

export type PoolField = "pickup" | "drop" | "vehicle";
export type PoolFieldOption = { label: string; count: number };

function poolFieldValue(lane: MarketplaceSearchLane, field: PoolField): string {
  if (field === "pickup") return lane.pickup_area;
  if (field === "drop") return lane.drop_location;
  return lane.vehicle_type;
}

/**
 * Pickup / drop / vehicle picker options, one per canonical value, counted
 * from canonical pool membership. Drop is narrowed to the chosen pickup and
 * vehicle to the chosen pickup + drop by exact canonical equality.
 * `menuQuery` only narrows the visible option list; it never groups or
 * decides membership.
 */
export function poolFieldOptions(
  lanes: readonly MarketplaceSearchLane[],
  draft: Partial<MarketplaceLoadSearch> | null | undefined,
  field: PoolField,
  menuQuery = "",
): PoolFieldOption[] {
  const key = poolKey(draft);
  const pickup = canonicalPoolField(key.pickup);
  const drop = canonicalPoolField(key.drop);
  const query = canonicalPoolField(menuQuery);
  const byValue = new Map<string, PoolFieldOption & { top: number }>();
  for (const lane of canonicalPoolLanes(lanes)) {
    if (field !== "pickup" && canonicalPoolField(lane.pickup_area) !== pickup) {
      continue;
    }
    if (field === "vehicle" && canonicalPoolField(lane.drop_location) !== drop) {
      continue;
    }
    const label = poolFieldValue(lane, field).trim();
    const id = canonicalPoolField(label);
    if (!id || (query && !id.includes(query))) continue;
    const prev = byValue.get(id);
    if (!prev) {
      byValue.set(id, { label, count: lane.load_count, top: lane.load_count });
    } else {
      prev.count += lane.load_count;
      if (lane.load_count > prev.top) {
        prev.label = label;
        prev.top = lane.load_count;
      }
    }
  }
  return [...byValue.values()]
    .map(({ label, count }) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

export function findPoolLane(
  lanes: readonly MarketplaceSearchLane[],
  key: MarketplaceLoadSearch,
): PoolLane | null {
  const id = poolKeyId(key);
  return canonicalPoolLanes(lanes).find((lane) => lane.poolId === id) ?? null;
}

export type PoolDetailSummary<B extends PoolBid, L extends PoolLoad> = {
  state: PoolCommercialState;
  stateLabel: string;
  /** Canonical, non-sponsored members among the loaded rows. */
  members: L[];
  memberIds: ReadonlySet<string>;
  /** Loaded rows that are not members: other lanes, and sponsored Reach loads. */
  excludedRowCount: number;
  /** Open loads in the pool per the lane RPC, never below loaded members; null if unknown. */
  poolSize: number | null;
  shipperCount: number;
  loadTypes: string[];
  earliestPickup: string | null;
  latestPickup: string | null;
  targetRateMin: number | null;
  targetRateMax: number | null;
  /** This org's bids keyed by indent, for member indents only. */
  bidByIndentId: Map<string, B>;
  /** Accepted bids on member indents (loaded, or submitted to as members this session). */
  awardedBids: B[];
  pendingCount: number;
  /** Loaded members this org may bid on (no bid yet, or a pending bid it can revise). */
  biddableIds: string[];
};

export function summarizePool<B extends PoolBid, L extends PoolLoad>(input: {
  key: MarketplaceLoadSearch;
  /** Raw RPC rows; filtered here through isPoolMember. */
  rows: readonly L[];
  bids: readonly B[];
  laneLoadCount: number | null;
  /** Indents already submitted to as members, kept attributable after they leave the open list. */
  priorMemberIds?: ReadonlySet<string>;
  canBidLoad: (load: L) => boolean;
}): PoolDetailSummary<B, L> {
  const { key, rows, bids, laneLoadCount, priorMemberIds, canBidLoad } = input;
  const members = poolMembers(rows, key).filter(
    (load) => !isSponsoredReachLoad(load),
  );
  const lane = laneLoadCount == null ? null : Number(laneLoadCount) || 0;
  return summarizePoolCore({
    members,
    excludedRowCount: rows.length - members.length,
    poolSize: lane == null ? null : Math.max(lane, members.length),
    bids,
    priorMemberIds,
    isBiddable: (load, existing) =>
      (existing == null || existing.status === "pending") && canBidLoad(load),
  });
}

/** Server pool manifest fields the summary needs (get_org_/get_dco_marketplace_pool). */
export type ServerPoolManifest<M, B> = {
  member_count: number;
  complete: boolean;
  members: readonly M[];
  biddable_ids: readonly string[];
  bids: readonly B[];
};

/**
 * Summary of a server manifest: membership and biddable set are the server's,
 * not recomputed here. `canBid` is only the viewer-level gate (capability,
 * fleet fit) applied on top; it can remove loads, never add them.
 */
export function summarizeServerPool<B extends PoolBid, L extends PoolLoad>(input: {
  manifest: ServerPoolManifest<L, B>;
  priorMemberIds?: ReadonlySet<string>;
  canBid: (load: L) => boolean;
}): PoolDetailSummary<B, L> {
  const { manifest, priorMemberIds, canBid } = input;
  const serverBiddable = new Set(manifest.biddable_ids);
  return summarizePoolCore({
    members: [...manifest.members],
    excludedRowCount: 0,
    poolSize: manifest.member_count,
    bids: manifest.bids,
    priorMemberIds,
    isBiddable: (load) => serverBiddable.has(load.id) && canBid(load),
  });
}

function summarizePoolCore<B extends PoolBid, L extends PoolLoad>(input: {
  members: L[];
  excludedRowCount: number;
  poolSize: number | null;
  bids: readonly B[];
  priorMemberIds?: ReadonlySet<string>;
  isBiddable: (load: L, existing: B | undefined) => boolean;
}): PoolDetailSummary<B, L> {
  const { members, excludedRowCount, poolSize, bids, priorMemberIds, isBiddable } = input;
  const memberIds = new Set(members.map((l) => l.id));
  const attributable = new Set(memberIds);
  for (const id of priorMemberIds ?? []) attributable.add(id);

  const bidByIndentId = new Map<string, B>();
  for (const b of bids) {
    if (attributable.has(b.indent_id)) bidByIndentId.set(b.indent_id, b);
  }
  const poolBids = [...bidByIndentId.values()];
  const awardedBids = poolBids.filter((b) => b.status === "accepted");
  const pendingCount = poolBids.filter((b) => b.status === "pending").length;
  const closedBidCount = poolBids.length - awardedBids.length - pendingCount;

  const shippers = new Set<string>();
  const loadTypes = new Set<string>();
  let earliest: string | null = null;
  let latest: string | null = null;
  let rateMin: number | null = null;
  let rateMax: number | null = null;
  const biddableIds: string[] = [];
  let unbidBiddable = 0;

  for (const load of members) {
    if (load.creator_organization_id)
      shippers.add(load.creator_organization_id);
    const lt = (load.load_type ?? "").trim();
    if (lt) loadTypes.add(lt);
    if (load.pickup_date) {
      if (earliest == null || load.pickup_date < earliest)
        earliest = load.pickup_date;
      if (latest == null || load.pickup_date > latest)
        latest = load.pickup_date;
    }
    const rate = load.rate_offer == null ? NaN : Number(load.rate_offer);
    if (Number.isFinite(rate) && rate > 0) {
      rateMin = rateMin == null ? rate : Math.min(rateMin, rate);
      rateMax = rateMax == null ? rate : Math.max(rateMax, rate);
    }
    const existing = bidByIndentId.get(load.id);
    if (isBiddable(load, existing)) {
      biddableIds.push(load.id);
      if (existing == null) unbidBiddable += 1;
    }
  }

  const awarded = awardedBids.length;
  let state: PoolCommercialState;
  if (pendingCount > 0) state = "submitted";
  else if (unbidBiddable > 0) state = "open";
  else if (awarded > 0) state = "awarded";
  else if (closedBidCount > 0) state = "not_selected";
  else state = "closed";

  const awardedSuffix =
    awarded > 0 && (state === "open" || state === "submitted")
      ? ` · ${awarded} awarded`
      : "";
  const stateLabel =
    state === "open" && awarded > 0
      ? `Open${awardedSuffix}`
      : `${POOL_STATE_COPY[state].label}${awardedSuffix}`;

  return {
    state,
    stateLabel,
    members,
    memberIds,
    excludedRowCount,
    poolSize,
    shipperCount: shippers.size,
    loadTypes: [...loadTypes],
    earliestPickup: earliest,
    latestPickup: latest,
    targetRateMin: rateMin,
    targetRateMax: rateMax,
    bidByIndentId,
    awardedBids,
    pendingCount,
    biddableIds,
  };
}

export type PoolFetchPage = {
  offset: number;
  rowCount: number;
  nextOffset: number | undefined;
};

export type PoolFetchProgress = {
  /** Offset to read next, or null when reading is finished (complete or not). */
  nextOffset: number | null;
  /** Every candidate row has been read. */
  complete: boolean;
  /** The read stopped at the RPC offset cap with rows possibly left unread. */
  truncated: boolean;
};

/** Where automatic reading of a pool's candidate rows stands. */
export function poolFetchProgress(
  pages: readonly PoolFetchPage[],
): PoolFetchProgress {
  const last = pages[pages.length - 1];
  if (!last) return { nextOffset: 0, complete: false, truncated: false };
  if (last.nextOffset == null) {
    return { nextOffset: null, complete: true, truncated: false };
  }
  if (last.nextOffset > MARKETPLACE_POOL_MAX_OFFSET) {
    return { nextOffset: null, complete: false, truncated: true };
  }
  return { nextOffset: last.nextOffset, complete: false, truncated: false };
}

/**
 * Reads a pool's candidate rows page by page until the RPC has no more rows
 * or the offset cap is reached. Never re-reads the clamped last page. Pages
 * are read one at a time, as a bidder scrolling would.
 */
export async function readCompletePool<R>(
  readPage: (
    offset: number,
  ) => Promise<{ loads: readonly R[]; nextOffset: number | undefined }>,
): Promise<{ rows: R[]; progress: PoolFetchProgress }> {
  const rows: R[] = [];
  const pages: PoolFetchPage[] = [];
  let progress = poolFetchProgress(pages);
  while (progress.nextOffset != null) {
    const offset = progress.nextOffset;
    const page = await readPage(offset);
    rows.push(...page.loads);
    pages.push({ offset, rowCount: page.loads.length, nextOffset: page.nextOffset });
    progress = poolFetchProgress(pages);
    if (progress.nextOffset != null && progress.nextOffset <= offset) {
      return { rows, progress: { nextOffset: null, complete: false, truncated: true } };
    }
  }
  return { rows, progress };
}

/**
 * Why a pool bid can't be offered yet, or null. The bid always covers every
 * eligible member, so an unread or too-large pool blocks rather than bidding
 * on part of it.
 */
export function poolBidReadiness(input: {
  fetch: PoolFetchProgress;
  eligibleCount: number;
}): { ready: boolean; blocked: string | null } {
  const { fetch, eligibleCount } = input;
  if (fetch.truncated || eligibleCount > POOL_BID_MAX_LOADS) {
    return { ready: false, blocked: POOL_TOO_LARGE_MESSAGE };
  }
  if (!fetch.complete) return { ready: false, blocked: null };
  return { ready: eligibleCount > 0, blocked: null };
}

export type PoolIdentityGateState = "hidden" | "pending_acceptance" | "eligible";

/**
 * Shipper identity boundary for the bidder. Hidden while discovering and
 * bidding; once the shipper accepts a bid it stays locked until the
 * Marketplace fee gate clears (paid / not required) — the same condition the
 * backend uses before unmasking owner contact on list_my_org_market_bids.
 * There is no separate terms-acceptance state in the backend today.
 */
export function poolIdentityGate(
  awardedBids: readonly { fee_payment_status: string | null }[],
): { state: PoolIdentityGateState; awarded: number; eligible: number } {
  const awarded = awardedBids.length;
  const eligible = awardedBids.filter(
    (b) => b.fee_payment_status === "paid" || b.fee_payment_status === "not_required",
  ).length;
  if (awarded === 0) return { state: "hidden", awarded, eligible };
  return {
    state: eligible > 0 ? "eligible" : "pending_acceptance",
    awarded,
    eligible,
  };
}

/** Failures grouped by message, so no per-load identifier is shown to the bidder. */
export function groupPoolBidFailures(
  failed: readonly { message: string }[],
): { message: string; count: number }[] {
  const byMessage = new Map<string, number>();
  for (const f of failed) {
    const m = f.message.trim() || "Unknown error";
    byMessage.set(m, (byMessage.get(m) ?? 0) + 1);
  }
  return [...byMessage.entries()].map(([message, count]) => ({ message, count }));
}

export type PoolBidSubmissionResult = {
  /** Set when the submission was refused before any write. */
  blocked: string | null;
  attempted: number;
  succeeded: string[];
  failed: { indentId: string; message: string }[];
};

/** Reason a pool submission must not run, or null. Checked before any write. */
export function poolSubmissionBlockReason(
  indentIds: readonly string[],
  memberIds: ReadonlySet<string>,
): string | null {
  if (indentIds.length === 0) return "No loads in this pool are open for your bid.";
  if (new Set(indentIds).size !== indentIds.length) {
    return "The pool lists a load twice. Nothing was submitted — reopen the pool and try again.";
  }
  if (indentIds.length > POOL_BID_MAX_LOADS) return POOL_TOO_LARGE_MESSAGE;
  if (indentIds.some((id) => !memberIds.has(id))) {
    return "Some loads are not part of this pool. Nothing was submitted — reopen the pool and try again.";
  }
  return null;
}

/**
 * Sequential on purpose: one request in flight at a time keeps a pool bid to
 * the same database load profile as a bidder submitting loads one by one.
 */
export async function runPoolBidSubmission(input: {
  indentIds: readonly string[];
  memberIds: ReadonlySet<string>;
  submitOne: (indentId: string) => Promise<{ error: Error | null }>;
}): Promise<PoolBidSubmissionResult> {
  const { indentIds, memberIds, submitOne } = input;
  const blocked = poolSubmissionBlockReason(indentIds, memberIds);
  if (blocked) return { blocked, attempted: 0, succeeded: [], failed: [] };

  const result: PoolBidSubmissionResult = {
    blocked: null,
    attempted: indentIds.length,
    succeeded: [],
    failed: [],
  };
  for (const indentId of indentIds) {
    try {
      const { error } = await submitOne(indentId);
      if (error) result.failed.push({ indentId, message: error.message });
      else result.succeeded.push(indentId);
    } catch (e) {
      result.failed.push({
        indentId,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return result;
}
