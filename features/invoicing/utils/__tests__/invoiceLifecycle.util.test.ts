import {
  draftInvoiceNumber,
  invoiceStatusHoldsTrips,
  invoiceStatusIsDraft,
  invoiceStatusIsIssued,
  invoiceStatusIsTerminal,
} from "../invoiceLifecycle.util";

describe("invoice lifecycle", () => {
  it("treats sent and paid as issued history", () => {
    expect(invoiceStatusIsIssued("sent")).toBe(true);
    expect(invoiceStatusIsIssued("paid")).toBe(true);
    expect(invoiceStatusIsIssued("draft")).toBe(false);
  });

  it("does not treat drafts as permanently invoiced", () => {
    expect(invoiceStatusIsDraft("draft")).toBe(true);
    expect(invoiceStatusIsIssued("draft")).toBe(false);
    expect(invoiceStatusHoldsTrips("draft")).toBe(true);
  });

  it("releases trips on void/cancelled", () => {
    expect(invoiceStatusIsTerminal("void")).toBe(true);
    expect(invoiceStatusHoldsTrips("cancelled")).toBe(false);
  });

  it("draft numbers never use the INV/ sequence prefix", () => {
    expect(draftInvoiceNumber().startsWith("DRAFT/")).toBe(true);
    expect(draftInvoiceNumber().startsWith("INV/")).toBe(false);
  });
});
