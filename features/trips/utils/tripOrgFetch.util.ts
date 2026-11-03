import { isInfrastructureErrorMessage } from "@/lib/supabaseHttp.util";

/** Live undated get_trips_for_org catalog size. */
export const GET_TRIPS_FOR_ORG_DEFAULT_CAP = 400;
/** Dated-mode safety cap in 20271027155318. Not unlimited. */
export const GET_TRIPS_FOR_ORG_DATED_SAFETY_CAP = 2000;

/**
 * "All time" on the Trips hub. Sent as p_from / p_to so get_trips_for_org uses its
 * dated mode (every visible trip, newest 2000) instead of the undated newest 400.
 * Every trip has created_at, so this range matches all of them.
 */
export const HUB_ALL_TIME_BOUNDS = { from: "2000-01-01", to: "2099-12-31" } as const;

export function isDatedGetTripsForOrgCapped(rowCount: number): boolean {
  return rowCount >= GET_TRIPS_FOR_ORG_DATED_SAFETY_CAP;
}

export function datedGetTripsForOrgCapNote(rowCount: number): string | null {
  if (!isDatedGetTripsForOrgCapped(rowCount)) return null;
  return `Results may be incomplete (newest ${GET_TRIPS_FOR_ORG_DATED_SAFETY_CAP} matching trips)`;
}

function utcIsoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function nextIsoDate(iso: string): string | null {
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return null;
  return utcIsoDate(Date.UTC(year, month - 1, day + 1));
}

/** Split an inclusive calendar range into two non-overlapping halves. */
export function splitIsoDateRange(
  from: string,
  to: string,
): { from: string; to: string }[] | null {
  if (from >= to) return null;
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  const mid = utcIsoDate(start + Math.floor((end - start) / 2));
  if (mid < from || mid >= to) return null;
  const rightFrom = nextIsoDate(mid);
  if (!rightFrom || rightFrom > to) return null;
  return [
    { from, to: mid },
    { from: rightFrom, to },
  ];
}

/**
 * A dated get_trips_for_org page of 2000 is truncated. Keep the page only when
 * it is short, or when the range is already a single day.
 */
export function completeTripRangeStep(
  range: { from: string; to: string },
  rowCount: number,
): { accept: boolean; children: { from: string; to: string }[] } {
  if (!isDatedGetTripsForOrgCapped(rowCount) || range.from === range.to) {
    return { accept: true, children: [] };
  }
  const children = splitIsoDateRange(range.from, range.to);
  if (!children) return { accept: true, children: [] };
  return { accept: false, children };
}

/**
 * Table-scan fallback for `get_trips_for_org` is only for a missing RPC
 * (local/old schema). 503/504/timeout must not start a second `trips` SELECT
 * — that pair is ~13% of CPU in the 2026-09-22 statement snapshot.
 */
export function tripsForOrgRpcArgs(
  orgId: string,
  opts?: { includeComplianceBacklog?: boolean; from?: string; to?: string },
): {
  p_org_id: string;
  p_include_compliance_backlog?: boolean;
  p_from?: string;
  p_to?: string;
} {
  const args: {
    p_org_id: string;
    p_include_compliance_backlog?: boolean;
    p_from?: string;
    p_to?: string;
  } = { p_org_id: orgId };
  if (opts?.includeComplianceBacklog === true) {
    args.p_include_compliance_backlog = true;
  }
  const from = (opts?.from ?? "").slice(0, 10);
  const to = (opts?.to ?? "").slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to)) {
    args.p_from = from <= to ? from : to;
    args.p_to = from <= to ? to : from;
  }
  return args;
}

/** Dated hub pills must not fall back to owner-only, unfiltered, capped table scans. */
export function shouldTableScanTripsForOrg(
  error: {
    message?: string | null;
    code?: string | null;
  } | null,
  opts?: { from?: string; to?: string },
): boolean {
  const args = tripsForOrgRpcArgs("org", opts);
  if (args.p_from && args.p_to) return false;
  return shouldFallbackTripsTableScan(error);
}

export function shouldFallbackTripsTableScan(error: {
  message?: string | null;
  code?: string | null;
} | null): boolean {
  if (!error) return false;
  const code = String(error.code ?? "").toUpperCase();
  if (code === "42883" || code === "PGRST202") return true;
  const message = String(error.message ?? "");
  if (isInfrastructureErrorMessage(message)) return false;
  return /does not exist|could not find the function/i.test(message);
}
