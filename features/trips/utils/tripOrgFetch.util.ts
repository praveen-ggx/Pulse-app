import { isInfrastructureErrorMessage } from "@/lib/supabaseHttp.util";

/** Live undated get_trips_for_org catalog size. */
export const GET_TRIPS_FOR_ORG_DEFAULT_CAP = 400;
/** Dated-mode safety cap in 20271027155318. Not unlimited. */
export const GET_TRIPS_FOR_ORG_DATED_SAFETY_CAP = 2000;

export function isDatedGetTripsForOrgCapped(rowCount: number): boolean {
  return rowCount >= GET_TRIPS_FOR_ORG_DATED_SAFETY_CAP;
}

export function datedGetTripsForOrgCapNote(rowCount: number): string | null {
  if (!isDatedGetTripsForOrgCapped(rowCount)) return null;
  return `Results may be incomplete (newest ${GET_TRIPS_FOR_ORG_DATED_SAFETY_CAP} matching trips)`;
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
