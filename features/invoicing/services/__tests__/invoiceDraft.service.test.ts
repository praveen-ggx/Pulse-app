import { readFileSync } from "fs";
import { join } from "path";

describe("invoice draft persistence contract", () => {
  it("saves drafts without allocate_invoice_number", () => {
    const src = readFileSync(join(__dirname, "../invoiceDraft.service.ts"), "utf8");
    expect(src).toContain('status: "draft"');
    expect(src).toContain("financial_year: \"DRAFT\"");
    expect(src).toContain("draftInvoiceNumber");
    expect(src).not.toContain("allocate_invoice_number");
    expect(src).not.toContain("issue_customer_invoice");
  });

  it("can update draft metadata without allocating a number", () => {
    const src = readFileSync(join(__dirname, "../invoiceDraft.service.ts"), "utf8");
    expect(src).toContain("export async function updateInvoiceDraft");
    expect(src).toContain("payment_terms");
    expect(src).not.toContain("allocate_invoice_number");
  });

  it("cancels drafts instead of deleting invoice history", () => {
    const src = readFileSync(join(__dirname, "../invoiceDraft.service.ts"), "utf8");
    expect(src).toContain('status: "cancelled"');
    expect(src).not.toMatch(/\.delete\(/);
  });
});
