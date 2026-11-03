import {
  companyInvoicePrefix,
  formatInvoiceReference,
  nextInvoiceSequence,
  sequenceInReference,
} from "@/features/invoicing/utils/invoiceNumberPlan.util";

describe("invoice number plan", () => {
  it("uses the first three letters of the company", () => {
    expect(companyInvoicePrefix("Gogovan India Pvt Ltd")).toBe("GOG");
    expect(companyInvoicePrefix("")).toBe("INV");
    expect(companyInvoicePrefix("A1")).toBe("AXX");
  });

  it("formats a unique reference without reusing a saved sequence", () => {
    expect(
      formatInvoiceReference({ prefix: "GOG", financialYear: "2026-27", sequence: 12 }),
    ).toBe("GOG/2026-27/00012");
    expect(nextInvoiceSequence({ start: 1, used: [3, 12] })).toBe(13);
    expect(nextInvoiceSequence({ start: 100, used: [12] })).toBe(100);
    expect(sequenceInReference("GOG/2026-27/00012", "GOG", "2026-27")).toBe(12);
    expect(sequenceInReference("DRAFT/abc", "GOG", "2026-27")).toBeNull();
  });
});
