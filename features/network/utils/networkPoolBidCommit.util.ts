/** Live Network pool bid: remaining vehicle slots and a future valid-until. */

export type NetworkPoolBidCommit = {
  id?: string;
  status?: string | null;
  awarded_count?: number | null;
  vehicle_limit?: number | null;
  valid_until?: string | null;
};

export function endOfLocalDayIso(isoDate: string): string {
  const day = /^\d{4}-\d{2}-\d{2}$/.test(isoDate) ? isoDate : "";
  if (!day) return "";
  const end = new Date(`${day}T23:59:59`);
  if (Number.isNaN(end.getTime())) return "";
  return end.toISOString();
}

export function defaultPoolBidValidUntilIso(from = new Date(), days = 7): string {
  const d = new Date(from);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function remainingPoolCommitSlots(
  commit: NetworkPoolBidCommit | null | undefined,
): number {
  const limit = Number(commit?.vehicle_limit ?? 0);
  const awarded = Number(commit?.awarded_count ?? 0);
  if (!Number.isFinite(limit) || limit < 1) return 0;
  return Math.max(0, limit - (Number.isFinite(awarded) ? awarded : 0));
}

export function isNetworkPoolCommitLive(
  commit: NetworkPoolBidCommit | null | undefined,
  now = new Date(),
): boolean {
  if (!commit) return true;
  if (String(commit.status ?? "active").trim().toLowerCase() !== "active") {
    return false;
  }
  if (remainingPoolCommitSlots(commit) <= 0) return false;
  const until = commit.valid_until ? new Date(commit.valid_until) : null;
  if (!until || Number.isNaN(until.getTime()) || until.getTime() <= now.getTime()) {
    return false;
  }
  return true;
}

/** Pending pool quotes stay in the table after exhaustion so the supplier can bid again. */
export function shipperCanSeePendingPoolQuote(
  quote: { status?: string | null; pool_commit_id?: string | null },
  commit: NetworkPoolBidCommit | null | undefined,
  now = new Date(),
): boolean {
  const status = String(quote.status ?? "").trim().toLowerCase();
  if (status !== "pending") return true;
  if (!quote.pool_commit_id) return true;
  return isNetworkPoolCommitLive(commit, now);
}

export const MAX_POOL_VEHICLE_COMMIT = 10;

export function clampPoolVehicleCommit(
  count: number,
  poolSize?: number,
  fleetSize?: number | null,
): number {
  const n = Math.floor(count);
  if (!Number.isFinite(n) || n < 1) return 1;
  // Pool/fleet size is a hint for the operator, not a hard lock on +/−.
  void poolSize;
  void fleetSize;
  return Math.min(n, MAX_POOL_VEHICLE_COMMIT);
}
