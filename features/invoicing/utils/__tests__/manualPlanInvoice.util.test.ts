import {
  buildManualPlanInvoiceLines,
  defaultBillingPeriod,
  manualPlanSnapshot,
} from "../manualPlanInvoice.util";

describe("manualPlanInvoice.util", () => {
  const plan = {
    id: "plan-1",
    client_id: "c1",
    pickup_area: "Enterprise",
    drop_location: "Logistics",
    rate: 25000,
    rate_type: "fixed",
    valid_from: "2026-01-01",
    valid_to: null,
    notes: null,
  };

  it("populates SKU, period, and taxable rate from the client plan", () => {
    const lines = buildManualPlanInvoiceLines({
      plan,
      billingPeriodStart: "2026-09-01",
      billingPeriodEnd: "2026-09-30",
    });
    expect(lines).toHaveLength(1);
    expect(lines[0]?.trip_ref).toBe("PLAN-FIXED");
    expect(lines[0]?.rate).toBe(25000);
    expect(lines[0]?.line_type).toBe("plan");
    expect(lines[0]?.description).toContain("2026-09-01");
  });

  it("snapshots plan metadata for historical issue", () => {
    const snap = manualPlanSnapshot({
      plan,
      billingPeriodStart: "2026-09-01",
      billingPeriodEnd: "2026-09-30",
    });
    expect(snap.plan_id).toBe("plan-1");
    expect(snap.sku).toBe("PLAN-FIXED");
    expect(snap.billing_period_start).toBe("2026-09-01");
  });

  it("defaults billing period to the current calendar month", () => {
    const p = defaultBillingPeriod(new Date(2026, 8, 22));
    expect(p.start).toBe("2026-09-01");
    expect(p.end).toBe("2026-09-30");
  });
});
