import {
  invoiceHsnIssueBlock,
  isCompleteHsnSac,
  normalizeHsnSac,
} from "../invoiceLineHsn.util";
import { buildManualPlanInvoiceLines } from "../manualPlanInvoice.util";

describe("invoiceLineHsn.util", () => {
  it("does not invent HSN", () => {
    expect(normalizeHsnSac(null)).toBeNull();
    expect(normalizeHsnSac("")).toBeNull();
    expect(isCompleteHsnSac("9983")).toBe(true);
    expect(isCompleteHsnSac("12")).toBe(false);
  });

  it("blocks issue when any line is missing HSN", () => {
    expect(invoiceHsnIssueBlock([{ hsn_sac: "9983" }])).toBeNull();
    expect(invoiceHsnIssueBlock([{ hsn_sac: null }])).toMatch(/required/i);
  });

  it("manual PLAN- SKU without HSN cannot issue", () => {
    const lines = buildManualPlanInvoiceLines({
      plan: {
        id: "p1",
        client_id: "c1",
        pickup_area: "A",
        drop_location: "B",
        rate: 1000,
        rate_type: "fixed",
        valid_from: null,
        valid_to: null,
        notes: null,
      },
      billingPeriodStart: "2026-09-01",
      billingPeriodEnd: "2026-09-30",
    });
    expect(lines[0]?.trip_ref).toBe("PLAN-FIXED");
    expect(lines[0]?.hsn_sac).toBeNull();
    expect(invoiceHsnIssueBlock(lines)).toMatch(/HSN\/SAC/);
  });

  it("manual HSN is taken from operator entry only", () => {
    const lines = buildManualPlanInvoiceLines({
      plan: {
        id: "p1",
        client_id: "c1",
        pickup_area: "A",
        drop_location: "B",
        rate: 1000,
        rate_type: "fixed",
        valid_from: null,
        valid_to: null,
        notes: null,
      },
      billingPeriodStart: "2026-09-01",
      billingPeriodEnd: "2026-09-30",
      hsnSac: "9965",
    });
    expect(lines[0]?.hsn_sac).toBe("9965");
    expect(invoiceHsnIssueBlock(lines)).toBeNull();
  });
});
