import { groupBidsByLane } from "@/features/network/utils/marketplaceLaneSearchMemory.util";

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
