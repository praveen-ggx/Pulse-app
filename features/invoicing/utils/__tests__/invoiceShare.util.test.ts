import { buildInvoiceShareText, whatsAppNumber } from "../invoiceShare.util";

describe("invoice share", () => {
  it("writes a draft that includes the organization billing identity", () => {
    const text = buildInvoiceShareText({
      status: "draft",
      organization: "Megha Engineering",
      gstin: "36AAAAA0000A1Z5",
      cin: "U12345TG2020PTC000001",
      pan: "AAAAA0000A",
      address: "Hyderabad, Telangana, 500001",
      client: "Acme Logistics",
      invoiceNumber: "DRAFT-1",
      invoiceDate: "03 Nov 2026",
      dueDate: "02 Dec 2026",
      amount: "₹1,000.00",
      tripCount: 2,
    });
    expect(text).toContain("Draft invoice");
    expect(text).toContain("From: Megha Engineering");
    expect(text).toContain("GSTIN: 36AAAAA0000A1Z5");
    expect(text).toContain("CIN: U12345TG2020PTC000001");
    expect(text).toContain("To: Acme Logistics");
    expect(text).toContain("not a tax invoice");
  });

  it("prefixes a 10-digit Indian mobile for WhatsApp", () => {
    expect(whatsAppNumber("+91 93982 93360")).toBe("919398293360");
    expect(whatsAppNumber("")).toBeNull();
  });
});