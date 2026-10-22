/**
 * Get Load → My Bids as pools. A pooled Network quote is stored as one
 * direct_quotes row per member indent; My Bids groups those rows back into the
 * Indent Pool they were quoted on (buildNetworkLoadPools, the same poolKeyId
 * Network Loads and Marketplace use). Each member keeps its own quote status —
 * a shipper counters, awards or rejects only its own load — so the pool only
 * summarizes them and never collapses them into one status.
 */
import { directQuoteCounterState } from "@/features/indents/utils/bidding/directQuoteCounter.util";
import {
  buildNetworkLoadPools,
  type NetworkLoadPool,
  type NetworkPoolLoad,
} from "@/features/network/utils/networkLoadPools.util";

export type NetworkBidQuote = {
  status?: string | null;
  amount?: number | string | null;
  counter_amount?: number | string | null;
};

export type NetworkBidMemberState =
  | "pending"
  | "countered"
  | "agreed"
  | "accepted"
  | "rejected"
  | "closed";

export const NETWORK_BID_STATE_ORDER: readonly NetworkBidMemberState[] = [
  "countered",
  "agreed",
  "pending",
  "accepted",
  "rejected",
  "closed",
];

export const NETWORK_BID_STATE_LABEL: Record<NetworkBidMemberState, string> = {
  countered: "countered",
  agreed: "counter accepted",
  pending: "pending",
  accepted: "accepted",
  rejected: "declined",
  closed: "closed",
};

export type NetworkBidPool<L extends NetworkPoolLoad> = NetworkLoadPool<L> & {
  /** Members per quote state; only states with at least one member. */
  stateCounts: Partial<Record<NetworkBidMemberState, number>>;
  /** The one state every member is in, or null when members differ. */
  uniformState: NetworkBidMemberState | null;
  /** This org's quoted amounts across members (counter acceptance can split them). */
  rateMin: number | null;
  rateMax: number | null;
};

type BidLoad = NetworkPoolLoad & { status?: string | null };

const TERMINAL_INDENT_STATUSES = new Set([
  "awarded",
  "completed",
  "cancelled",
  "closed",
  "expired",
]);

function positive(value: unknown): number | null {
  const n = Number(value ?? 0);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** One member's state from its own quote row; an ended indent with an open quote is closed. */
export function networkBidMemberState(
  load: { status?: string | null },
  quote: NetworkBidQuote | null | undefined,
): NetworkBidMemberState {
  const status = (quote?.status ?? "").trim().toLowerCase();
  if (status === "accepted") return "accepted";
  if (status === "rejected") return "rejected";
  if (TERMINAL_INDENT_STATUSES.has((load.status ?? "").trim().toLowerCase())) {
    return "closed";
  }
  if (status === "pending") {
    const counter = directQuoteCounterState(quote);
    return counter === "open" ? "countered" : counter === "taken" ? "agreed" : "pending";
  }
  return "closed";
}

/** "1 countered · 1 pending" — counts per state, in a fixed order. */
export function describeNetworkBidStates(
  counts: Partial<Record<NetworkBidMemberState, number>>,
): string {
  return NETWORK_BID_STATE_ORDER.filter((s) => (counts[s] ?? 0) > 0)
    .map((s) => `${counts[s]} ${NETWORK_BID_STATE_LABEL[s]}`)
    .join(" · ");
}

/**
 * Groups this org's quoted Network loads into pools. Loads that are not pool
 * members — sponsored Reach (`isPoolable` false) or an incomplete lane — are
 * returned as `individual` and keep their individual card.
 */
export function buildNetworkBidPools<L extends BidLoad>(
  loads: readonly L[],
  quoteByIndentId: ReadonlyMap<string, NetworkBidQuote>,
  isPoolable: (load: L) => boolean = () => true,
): { pools: NetworkBidPool<L>[]; individual: L[] } {
  const poolable: L[] = [];
  const sponsored = new Set<string>();
  for (const load of loads) {
    if (isPoolable(load)) poolable.push(load);
    else sponsored.add(load.id);
  }
  const built = buildNetworkLoadPools(poolable);
  const pools = built.pools.map((pool) => {
    const stateCounts: Partial<Record<NetworkBidMemberState, number>> = {};
    let rateMin: number | null = null;
    let rateMax: number | null = null;
    for (const member of pool.members) {
      const quote = quoteByIndentId.get(member.id);
      const state = networkBidMemberState(member, quote);
      stateCounts[state] = (stateCounts[state] ?? 0) + 1;
      const amount = positive(quote?.amount);
      if (amount != null) {
        rateMin = rateMin == null ? amount : Math.min(rateMin, amount);
        rateMax = rateMax == null ? amount : Math.max(rateMax, amount);
      }
    }
    const states = Object.keys(stateCounts) as NetworkBidMemberState[];
    return {
      ...pool,
      stateCounts,
      uniformState: states.length === 1 ? states[0]! : null,
      rateMin,
      rateMax,
    };
  });
  const unpooledIds = new Set(built.unpooled.map((l) => l.id));
  const individual = loads.filter((l) => sponsored.has(l.id) || unpooledIds.has(l.id));
  return { pools, individual };
}

/**
 * Lowest positive quoted amount among rows. Used to prefill Revise bid
 * without touching a first-time Quote (no amounts → null).
 */
export function existingNetworkPoolQuoteAmount(
  amounts: readonly (number | string | null | undefined)[],
): number | null {
  let min: number | null = null;
  for (const raw of amounts) {
    const n = Number(raw ?? 0);
    if (!Number.isFinite(n) || n <= 0) continue;
    min = min == null ? n : Math.min(min, n);
  }
  return min;
}
