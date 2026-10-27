import { hubMetricsToRail, parseOrgHubMetrics } from "@/features/trips/utils/orgHubMetrics.util";

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
      delivered_docs_pending: 720,
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
  });
});
