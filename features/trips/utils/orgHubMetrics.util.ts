import type { IndentCancelReasonId } from "@/features/indents/utils/indentCancelReason.util";
import type { TripMetricId } from "@/features/trips/utils/tripHubMetrics";

export type OrgHubMetrics = {
  tripsTotal: number;
  tripsCompleted: number;
  tripsCancelled: number;
  tripsActive: number;
  unassigned: number;
  assigned: number;
  loading: number;
  inTransit: number;
  unloading: number;
  deliveredDocsPending: number;
  indentUnallocated: number;
  indentFailed: number;
  failReasons: Record<IndentCancelReasonId, number>;
};

export const EMPTY_ORG_HUB_METRICS: OrgHubMetrics = {
  tripsTotal: 0,
  tripsCompleted: 0,
  tripsCancelled: 0,
  tripsActive: 0,
  unassigned: 0,
  assigned: 0,
  loading: 0,
  inTransit: 0,
  unloading: 0,
  deliveredDocsPending: 0,
  indentUnallocated: 0,
  indentFailed: 0,
  failReasons: {
    client_cancelled: 0,
    indent_expired: 0,
    no_rates_available: 0,
    wrong_entry: 0,
  },
};

function asCount(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

export type OrgHubMetricsSource = "rpc" | "empty" | "fallback";

/**
 * count_org_hub_metrics:
 * - success + jsonb → parse (authoritative org-wide rails)
 * - success + null → fail closed (not a member / denied). Do not table-scan.
 * - error (missing RPC) → incomplete; do not present owner-only counts as org rails.
 */
export function resolveOrgHubMetricsRpcResult(args: {
  error: { message?: string } | null;
  data: unknown;
}): "parse" | "empty" | "fallback" {
  if (!args.error && args.data != null) return "parse";
  if (!args.error && args.data == null) return "empty";
  return "fallback";
}

/** Exact rails only when the RPC succeeded. Missing RPC is not a zeroed org. */
export function hubMetricsForExactRail(args: {
  source: OrgHubMetricsSource;
  metrics: OrgHubMetrics;
}): OrgHubMetrics | null {
  if (args.source === "rpc") return args.metrics;
  if (args.source === "empty") return EMPTY_ORG_HUB_METRICS;
  return null;
}

export function parseOrgHubMetrics(raw: unknown): OrgHubMetrics {
  const row = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    tripsTotal: asCount(row.trips_total),
    tripsCompleted: asCount(row.trips_completed),
    tripsCancelled: asCount(row.trips_cancelled),
    tripsActive: asCount(row.trips_active),
    unassigned: asCount(row.unassigned),
    assigned: asCount(row.assigned),
    loading: asCount(row.loading),
    inTransit: asCount(row.in_transit),
    unloading: asCount(row.unloading),
    deliveredDocsPending: asCount(row.delivered_docs_pending),
    indentUnallocated: asCount(row.indent_unallocated),
    indentFailed: asCount(row.indent_failed),
    failReasons: {
      client_cancelled: asCount(row.fail_client_cancelled),
      indent_expired: asCount(row.fail_indent_expired),
      no_rates_available: asCount(row.fail_no_rates_available),
      wrong_entry: asCount(row.fail_wrong_entry),
    },
  };
}

export function hubMetricsToRail(metrics: OrgHubMetrics): Record<TripMetricId, number> {
  return {
    // Indent stage only: pending + bids + awarded. No trip yet, no failed.
    indent: metrics.indentUnallocated,
    unassigned: metrics.unassigned,
    assigned: metrics.assigned,
    loading: metrics.loading,
    in_transit: metrics.inTransit,
    unloading: metrics.unloading,
    delivered_docs_pending: metrics.deliveredDocsPending,
  };
}
