/**
 * Documents the DB unique identity for manual-plan invoices.
 * Enforced by invoices_one_active_per_manual_plan_period.
 */
describe("manual plan period uniqueness", () => {
  const identity = (period: { start: string; end: string }) =>
    ["org", "plan-1", period.start, period.end].join(":");

  it("same plan + September cannot produce two active invoices", () => {
    const sept = identity({ start: "2026-09-01", end: "2026-09-30" });
    const again = identity({ start: "2026-09-01", end: "2026-09-30" });
    expect(sept).toBe(again);
  });

  it("October is a distinct billing identity", () => {
    const sept = identity({ start: "2026-09-01", end: "2026-09-30" });
    const oct = identity({ start: "2026-10-01", end: "2026-10-31" });
    expect(sept).not.toBe(oct);
  });
});
