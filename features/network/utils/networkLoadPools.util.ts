/**
 * Supplier-side Network Loads as pools. A Network pool is the Indent Pool:
 * one canonical pickup × drop × vehicle (poolKeyId, the same key Marketplace
 * uses), whichever shippers' loads it holds. Relationship safety does not
 * come from the pool: every quote, counter and award is still one
 * direct_quotes row on one member indent, owned by that indent's shipper.
 */
import type { MarketplaceLoadSearch } from "@/features/network/utils/marketplaceSearch.util";
import {
  canonicalPoolField,
  isPoolMember,
  poolKey,
  poolKeyId,
} from "@/features/network/utils/pooledOpportunity.util";

export type NetworkPoolLoad = {
  id: string;
  organization_id: string;
  pickup_area: string | null;
  drop_location: string | null;
  vehicle_type: string | null;
  creator_organization_name?: string | null;
  pickup_date?: string | null;
  supplier_target?: number | null;
  client_price?: number | null;
  /** Kilograms. */
  weight?: number | string | null;
};

export type NetworkLoadPool<L extends NetworkPoolLoad> = {
  /** poolKeyId of the lane; stable across case/outer-space variants. */
  id: string;
  key: MarketplaceLoadSearch;
  /** Distinct shipper orgs among members; never shown as identities. */
  shipperCount: number;
  members: L[];
  earliestPickup: string | null;
  latestPickup: string | null;
  targetRateMin: number | null;
  targetRateMax: number | null;
  /**
   * Per-vehicle weight in kg. An indent's weight is the capacity of that one
   * vehicle, so a pool of three 20 MT indents is still 20 MT, not 60.
   * Min and max differ only when members of the same vehicle type disagree.
   */
  weightKgMin: number | null;
  weightKgMax: number | null;
};

function laneKeyOf(load: NetworkPoolLoad): MarketplaceLoadSearch {
  return poolKey({
    pickup: load.pickup_area ?? "",
    drop: load.drop_location ?? "",
    vehicleType: load.vehicle_type ?? "",
  });
}

function targetRate(load: NetworkPoolLoad): number | null {
  const n = Number(load.supplier_target ?? load.client_price ?? 0);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function weightKg(load: NetworkPoolLoad): number | null {
  const n = Number(load.weight ?? 0);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Groups loads into canonical Indent Pools, in first-seen order. Loads missing
 * pickup, drop or vehicle cannot form a pool and are returned as `unpooled`.
 */
export function buildNetworkLoadPools<L extends NetworkPoolLoad>(
  loads: readonly L[],
): { pools: NetworkLoadPool<L>[]; unpooled: L[] } {
  const byId = new Map<string, NetworkLoadPool<L>>();
  const shippersById = new Map<string, Set<string>>();
  const unpooled: L[] = [];
  const seen = new Set<string>();
  for (const load of loads) {
    if (seen.has(load.id)) continue;
    seen.add(load.id);
    const key = laneKeyOf(load);
    if (!isPoolMember(load, key)) {
      unpooled.push(load);
      continue;
    }
    const id = poolKeyId(key);
    const shippers = shippersById.get(id) ?? new Set<string>();
    if (load.organization_id) shippers.add(load.organization_id);
    shippersById.set(id, shippers);
    const pickup = (load.pickup_date ?? "").slice(0, 10) || null;
    const rate = targetRate(load);
    const kg = weightKg(load);
    const prev = byId.get(id);
    if (!prev) {
      byId.set(id, {
        id,
        key,
        shipperCount: 0,
        members: [load],
        earliestPickup: pickup,
        latestPickup: pickup,
        targetRateMin: rate,
        targetRateMax: rate,
        weightKgMin: kg,
        weightKgMax: kg,
      });
      continue;
    }
    prev.members.push(load);
    if (kg != null) {
      prev.weightKgMin = prev.weightKgMin == null ? kg : Math.min(prev.weightKgMin, kg);
      prev.weightKgMax = prev.weightKgMax == null ? kg : Math.max(prev.weightKgMax, kg);
    }
    if (pickup) {
      if (!prev.earliestPickup || pickup < prev.earliestPickup) prev.earliestPickup = pickup;
      if (!prev.latestPickup || pickup > prev.latestPickup) prev.latestPickup = pickup;
    }
    if (rate != null) {
      prev.targetRateMin = prev.targetRateMin == null ? rate : Math.min(prev.targetRateMin, rate);
      prev.targetRateMax = prev.targetRateMax == null ? rate : Math.max(prev.targetRateMax, rate);
    }
  }
  const pools = [...byId.values()].map((pool) => ({
    ...pool,
    shipperCount: shippersById.get(pool.id)?.size ?? 0,
  }));
  return { pools, unpooled };
}

/** Drops pools the server does not list for this org; no-op until the server list is known. */
export function keepServerPools<P extends { id: string }>(
  pools: readonly P[],
  serverPoolIds: ReadonlySet<string> | null,
): P[] {
  return serverPoolIds ? pools.filter((p) => serverPoolIds.has(p.id)) : [...pools];
}

const KNOWN_QUOTE_FAILURES: Record<string, { reason: string; because: string }> = {
  indent_not_open: {
    reason: "This indent is no longer open for quoting.",
    because: "the indent is no longer open",
  },
  quote_locked: {
    reason: "Your quote on this indent was countered or decided and can no longer be changed.",
    because: "your quote was already countered or decided",
  },
  indent_not_visible: {
    reason: "This indent is no longer available to your organization.",
    because: "the indent is no longer available to your organization",
  },
  own_indent: {
    reason: "You can't quote on your own organization's indent.",
    because: "it is your own organization's indent",
  },
  invalid_amount: {
    reason: "Enter an amount greater than 0.",
    because: "the amount was not valid",
  },
};

function knownQuoteFailureCode(message: string): string | null {
  const m = message.toLowerCase();
  return Object.keys(KNOWN_QUOTE_FAILURES).find((code) => m.includes(code)) ?? null;
}

/** Plain-language reason for one failed quote; unknown backend reasons are returned as-is. */
export function describeQuoteFailure(message: string): string {
  const code = knownQuoteFailureCode(message);
  return code ? KNOWN_QUOTE_FAILURES[code]!.reason : message.trim() || "Unknown error";
}

/**
 * One sentence per failure reason for a pool quote, e.g. "1 load could not be
 * quoted because the indent is no longer open." Unknown reasons keep the raw
 * backend text.
 */
export function poolQuoteFailureLines(
  failed: readonly { message: string }[],
): string[] {
  const groups = new Map<string, { count: number; because: string | null; raw: string }>();
  for (const f of failed) {
    const code = knownQuoteFailureCode(f.message);
    const raw = f.message.trim() || "Unknown error";
    const key = code ?? `raw:${raw}`;
    const prev = groups.get(key);
    if (prev) prev.count += 1;
    else
      groups.set(key, {
        count: 1,
        because: code ? KNOWN_QUOTE_FAILURES[code]!.because : null,
        raw,
      });
  }
  return [...groups.values()].map(({ count, because, raw }) => {
    const loads = `${count} load${count === 1 ? "" : "s"}`;
    return because
      ? `${loads} could not be quoted because ${because}.`
      : `${loads} could not be quoted: ${raw}`;
  });
}

/** Narrows pools by whichever of pickup / drop / vehicle is chosen — exact canonical equality. */
export function filterNetworkLoadPools<L extends NetworkPoolLoad>(
  pools: readonly NetworkLoadPool<L>[],
  search: Partial<MarketplaceLoadSearch> | null | undefined,
): NetworkLoadPool<L>[] {
  const n = poolKey(search);
  const pickup = canonicalPoolField(n.pickup);
  const drop = canonicalPoolField(n.drop);
  const vehicle = canonicalPoolField(n.vehicleType);
  return pools.filter(
    (p) =>
      (!pickup || canonicalPoolField(p.key.pickup) === pickup) &&
      (!drop || canonicalPoolField(p.key.drop) === drop) &&
      (!vehicle || canonicalPoolField(p.key.vehicleType) === vehicle),
  );
}
