import {
  gstStructure,
  invoiceOpenBalance,
  previewCreditNote,
  taxOnPaise,
  type InvoiceTaxProfile,
} from "@/features/invoicing/utils/creditNoteTax.util";

// Same invoices as supabase/tests/invoice_credit_refunds.sql, so the preview and the
// server are checked against the same numbers.
function profile(overrides: Partial<InvoiceTaxProfile> = {}): InvoiceTaxProfile {
  return {
    invoiceId: "inv",
    invoiceNumber: "CR-GI",
    invoiceDate: "2026-10-24",
    status: "sent",
    subtotal: 1000,
    gstRate: 18,
    cgst: 90,
    sgst: 90,
    igst: 0,
    total: 1180,
    lineRates: [18],
    snapshotSupply: "intra",
    prior: { total: 0, gstTaxable: 0, cgst: 0, sgst: 0, igst: 0, legacyTaxed: 0 },
    received: 0,
    creditRefunded: 0,
    ...overrides,
  };
}

const inter = () =>
  profile({ subtotal: 999.99, cgst: 0, sgst: 0, igst: 180, total: 1179.99, snapshotSupply: "inter" });

describe("taxOnPaise", () => {
  it("rounds half-up to paise", () => {
    expect(taxOnPaise(10_000n, 18, 200)).toBe(900n); // 100.00 × 9% = 9.00
    expect(taxOnPaise(3_333_300n / 100n, 18, 100)).toBe(6_000n); // 333.33 × 18% = 59.9994 → 60.00
    expect(taxOnPaise(5_005n, 18, 200)).toBe(450n); // 50.05 × 9% = 4.5045 → 4.50
    expect(taxOnPaise(50n, 18, 100)).toBe(9n); // 0.50 × 18% = 0.09
    expect(taxOnPaise(25n, 18, 100)).toBe(5n); // 0.25 × 18% = 0.045 → 0.05 (half-up)
  });
});

describe("previewCreditNote with GST", () => {
  it("intra-state: CGST and SGST at half the rate", () => {
    const p = previewCreditNote(profile(), "gst", [100]);
    expect(p.ok).toBe(true);
    expect([p.cgst, p.sgst, p.igst, p.amount]).toEqual([9, 9, 0, 118]);
  });

  it("inter-state: IGST at the full rate", () => {
    const p = previewCreditNote(inter(), "gst", [333.33]);
    expect([p.supply, p.igst, p.cgst, p.amount]).toEqual(["inter", 60, 0, 393.33]);
  });

  it("splits tax across lines so lines sum to the header", () => {
    const p = previewCreditNote(profile(), "gst", [50.05, 49.95]);
    expect(p.cgst).toBe(9);
    expect(p.lines.map((l) => l.cgst)).toEqual([4.5, 4.5]);
    expect(p.lines.reduce((s, l) => s + l.amount, 0)).toBeCloseTo(p.amount, 2);
  });

  it("closing credit takes exactly the tax left", () => {
    const gr = profile({ subtotal: 100.03, cgst: 9, sgst: 9, total: 118.03, lineRates: [18] });
    const first = previewCreditNote(gr, "gst", [33.33]);
    expect(first.cgst).toBe(3);
    const after2 = { ...gr, prior: { total: 78.66, gstTaxable: 66.66, cgst: 6, sgst: 6, igst: 0, legacyTaxed: 0 } };
    const last = previewCreditNote(after2, "gst", [33.37]);
    expect([last.cgst, last.sgst, last.amount, last.creditableAfter]).toEqual([3, 3, 39.37, 0]);
    expect(previewCreditNote({ ...after2, prior: { ...after2.prior, total: 118.03, gstTaxable: 100.03, cgst: 9, sgst: 9 } }, "gst", [0.01]).error).toMatch(/taxable value/);
  });

  it("refuses above the remaining taxable value", () => {
    const p = previewCreditNote(profile({ prior: { total: 236, gstTaxable: 200, cgst: 18, sgst: 18, igst: 0, legacyTaxed: 0 } }), "gst", [800.01]);
    expect(p.ok).toBe(false);
    expect(p.error).toMatch(/taxable value/);
  });

  it("refuses invoices whose tax cannot be derived", () => {
    expect(gstStructure(profile({ lineRates: [12, 18], cgst: 75, sgst: 75, total: 1150 }))).toMatchObject({ ok: false });
    expect(gstStructure(profile({ cgst: 0, sgst: 0, total: 1000, gstRate: 0 }))).toMatchObject({ ok: false, reason: expect.stringMatching(/no GST/) });
    expect(gstStructure(profile({ cgst: 45, sgst: 45, igst: 90 }))).toMatchObject({ ok: false, reason: expect.stringMatching(/mixes IGST/) });
    expect(gstStructure(profile({ gstRate: 0 }))).toMatchObject({ ok: false, reason: expect.stringMatching(/rate is not available/) });
    expect(gstStructure(profile({ prior: { total: 118, gstTaxable: 0, cgst: 0, sgst: 0, igst: 0, legacyTaxed: 1 } }))).toMatchObject({ ok: false });
    expect(gstStructure(profile({ snapshotSupply: "inter" }))).toMatchObject({ ok: false });
  });

  it("rejects more than two decimals and non-positive lines", () => {
    expect(previewCreditNote(profile(), "gst", [10.005]).error).toMatch(/two decimals/);
    expect(previewCreditNote(profile(), "gst", [0]).ok).toBe(false);
  });
});

describe("previewCreditNote without GST and customer credit", () => {
  it("value-only credit has no tax", () => {
    const p = previewCreditNote(profile({ cgst: 0, sgst: 0, total: 500, subtotal: 500, gstRate: 0 }), "no_gst", [100]);
    expect([p.tax, p.amount]).toEqual([0, 100]);
  });

  it("credit on a paid invoice becomes customer credit", () => {
    const paid = profile({ received: 1180 });
    expect(invoiceOpenBalance(paid)).toBe(0);
    const p = previewCreditNote(paid, "gst", [100]);
    expect([p.openBefore, p.customerCredit]).toEqual([0, 118]);
  });

  it("partly paid: only the part above the open balance is customer credit", () => {
    const p = previewCreditNote(profile({ received: 1100 }), "no_gst", [100]);
    expect([p.openBefore, p.customerCredit]).toEqual([80, 20]);
  });

  it("cannot credit more than the invoice value not yet credited", () => {
    const p = previewCreditNote(profile({ prior: { total: 1000, gstTaxable: 0, cgst: 0, sgst: 0, igst: 0, legacyTaxed: 0 } }), "no_gst", [180.01]);
    expect(p.error).toMatch(/not yet credited/);
  });
});
