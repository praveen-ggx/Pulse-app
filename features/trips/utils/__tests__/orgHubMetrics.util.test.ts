import {
  EMPTY_ORG_HUB_METRICS,
  hubMetricsForExactRail,
  hubMetricsToRail,
  parseOrgHubMetrics,
  resolveOrgHubMetricsRpcResult,
} from "@/features/trips/utils/orgHubMetrics.util";

describe("parseOrgHubMetrics", () => {
  it("reads exact SQL counters and never invents catalog-sized totals", () => {
    const metrics = parseOrgHubMetrics({
      trips_total: 793,
      trips_completed: 720,
      trips_cancelled: 12,
      trips_active: 61,
      unassigned: 1,
      assigned: 27,
      loading: 1,
      in_transit: 40,
      unloading: 1,
      delivered_docs_pending: 3,
      indent_unallocated: 18,
      indent_failed: 593,
      fail_client_cancelled: 2,
      fail_indent_expired: 149,
      fail_no_rates_available: 0,
      fail_wrong_entry: 40,
    });
    expect(metrics.tripsActive + metrics.tripsCompleted).toBe(781);
    expect(metrics.indentFailed).toBe(593);
    expect(hubMetricsToRail(metrics).indent).toBe(18);
    expect(hubMetricsToRail(metrics).assigned).toBe(27);
    expect(metrics.deliveredDocsPending).toBe(3);
    expect(metrics.deliveredDocsPending).not.toBe(metrics.tripsCompleted);
  });

  it("does not treat a denied RPC null as a missing-function fallback", () => {
    expect(resolveOrgHubMetricsRpcResult({ error: null, data: { trips_total: 1 } })).toBe(
      "parse",
    );
    expect(resolveOrgHubMetricsRpcResult({ error: null, data: null })).toBe("empty");
    expect(
      resolveOrgHubMetricsRpcResult({
        error: { message: "function count_org_hub_metrics does not exist" },
        data: null,
      }),
    ).toBe("fallback");
  });

  it("uses RPC success as exact rails, zeros a denied result, and hides a missing RPC", () => {
    const parsed = parseOrgHubMetrics({ trips_total: 4, delivered_docs_pending: 2 });
    expect(hubMetricsForExactRail({ source: "rpc", metrics: parsed })).toEqual(parsed);
    expect(hubMetricsForExactRail({ source: "empty", metrics: parsed })).toEqual(
      EMPTY_ORG_HUB_METRICS,
    );
    expect(
      hubMetricsForExactRail({
        source: "fallback",
        metrics: { ...EMPTY_ORG_HUB_METRICS, tripsActive: 9 },
      }),
    ).toBeNull();
  });
});
