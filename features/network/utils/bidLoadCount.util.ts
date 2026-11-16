import { groupBidsByLane, lanePoolCounts } from "@/features/network/utils/marketplaceLaneSearchMemory.util";

/** Bid rows versus the distinct loads those bids were sent on. */
export function countSubmittedBids(
  rows: readonly { indent_id?: string | null }[],
): { bids: number; loads: number } {
  const loads = new Set<string>();
  for (const row of rows) {
    const id = (row.indent_id ?? "").trim();
    if (id) loads.add(id);
  }
  return { bids: rows.length, loads: loads.size };
}

/**
 * Pending Marketplace bids only. One lane (same pickup and drop) is one active
 * bid, even when that rate sits on several loads.
 */
export function countActiveMarketplaceBids(
  rows: readonly {
    status?: string | null;
    indent_id?: string | null;
    pickup_area?: string | null;
    drop_location?: string | null;
  }[],
): { bids: number; loads: number } {
  return countLaneBids(rows.filter((row) => row.status === "pending"));
}

/** Awarded Marketplace bids. One lane is one won bid; loads stay the indents. */
export function countWonMarketplaceBids(
  rows: readonly {
    status?: string | null;
    indent_id?: string | null;
    pickup_area?: string | null;
    drop_location?: string | null;
  }[],
): { bids: number; loads: number } {
  return countLaneBids(rows.filter((row) => row.status === "accepted"));
}

/**
 * Loads this bid still covers. A larger live lane includes loads added after
 * the bid, which the rate does not cover. A smaller live lane means some of
 * the bid's loads are no longer open.
 * `openLaneLoads` null means the lane list is not ready yet.
 */
export function loadsStillInPlay(coveredLoads: number, openLaneLoads: number | null): number {
  const covered = Number.isFinite(coveredLoads) ? Math.max(0, Math.trunc(coveredLoads)) : 0;
  if (openLaneLoads == null || !Number.isFinite(openLaneLoads)) return covered;
  return Math.min(covered, Math.max(0, Math.trunc(openLaneLoads)));
}

type LaneLoadRow = {
  pickup_area?: string | null;
  drop_location?: string | null;
  load_count?: number | null;
};

/** Pending lane bids, with each lane's load count capped by what is still open. */
export function countActiveLoadsInPlay(
  rows: readonly {
    status?: string | null;
    indent_id?: string | null;
    pickup_area?: string | null;
    drop_location?: string | null;
  }[],
  lanes: readonly LaneLoadRow[] | null,
): { bids: number; loads: number } {
  const open = lanes ? lanePoolCounts(lanes) : null;
  const groups = groupBidsByLane(rows.filter((row) => row.status === "pending"));
  const loads = groups.reduce((sum, group) => {
    const covered = countSubmittedBids(group.bids).loads;
    const openLaneLoads = open ? (open.get(group.key) ?? 0) : null;
    return sum + loadsStillInPlay(covered, openLaneLoads);
  }, 0);
  return { bids: groups.length, loads };
}

/** Rows already grouped onto one lane. The lane is the bid; indents are the loads. */
export function countLaneBids(
  rows: readonly {
    indent_id?: string | null;
    pickup_area?: string | null;
    drop_location?: string | null;
  }[],
): { bids: number; loads: number } {
  return {
    bids: groupBidsByLane(rows).length,
    loads: countSubmittedBids(rows).loads,
  };
}

/** Caption for one lane: the bid, then the loads that bid covers. */
export function laneBidCaption(loads: number): string {
  return `1 bid · ${loadsCaption(loads)}`;
}

export function loadsCaption(loads: number): string {
  return `${loads} load${loads === 1 ? "" : "s"}`;
}
