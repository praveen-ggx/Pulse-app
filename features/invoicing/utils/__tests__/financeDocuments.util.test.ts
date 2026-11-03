import type { CreditNoteRow, CustomerLedgerPage, PaymentReceipt, ReceiptParty } from "@/features/invoicing/services/financeBooks.service";
import { mapPaymentReceipt } from "@/features/invoicing/services/financeBooks.service";
import {
  buildCreditNoteHtml,
  buildCustomerStatementHtml,
  buildPaymentReceiptHtml,
  csvCell,
  escapeHtml,
  formatBalance,
  ledgerCsv,
  paymentReceiptFileName,
  paymentReceiptShareText,
  toCsv,
} from "@/features/invoicing/utils/financeDocuments.util";

jest.mock("@/lib/supabase", () => ({ supabase: jest.fn() }));

const rpcReceipt = {
  payment_id: "p1",
  receipt_number: "RCT/2026-27/00007",
  status: "recorded",
  payment_date: "2026-11-03",
  payment_mode: "neft",
  transaction_reference: "UTR<9>",
  amount: "1000.00",
  tds_amount: "100.00",
  bank_amount: "900.00",
  allocated: "650.00",
  unallocated: "350.00",
  recorded_by: "Finance Lead",
  issuer: { legal_name: "Acme Logistics", address_line: "1 Road", city: "Chennai", state: "Tamil Nadu", gstin: "33AAAAA0000A1Z5", logo_url: "javascript:alert(1)" },
  customer: { legal_name: "Client & Co", billing_address: "9 Street", gstin: null },
  allocations: [
    { invoice_id: "i1", invoice_number: "INV/1", invoice_date: "2026-10-01", invoice_total: "400", amount: "400", status: "confirmed" },
    { invoice_id: "i2", invoice_number: "INV/2", invoice_date: "2026-10-05", invoice_total: "600", amount: "250", status: "confirmed" },
  ],
};

function receipt(overrides: Partial<PaymentReceipt> = {}): PaymentReceipt {
  return { ...mapPaymentReceipt(rpcReceipt)!, ...overrides };
}

describe("payment receipt document", () => {
  it("uses the recorded payment amounts, not invoice totals", () => {
    const html = buildPaymentReceiptHtml(receipt());
    expect(html).toContain("RCT/2026-27/00007");
    expect(html).toContain("₹900.00"); // bank
    expect(html).toContain("₹100.00"); // TDS
    expect(html).toContain("₹1,000.00"); // settled
    expect(html).toContain("₹350.00"); // unallocated
    expect(html).toContain("Recorded by Finance Lead");
    expect(html).not.toContain("REVERSED");
  });

  it("escapes text and drops non-https logos", () => {
    const html = buildPaymentReceiptHtml(receipt());
    expect(html).toContain("UTR&lt;9&gt;");
    expect(html).toContain("Client &amp; Co");
    expect(html).not.toContain("javascript:");
  });

  it("marks a reversed receipt and shows nothing applied", () => {
    const html = buildPaymentReceiptHtml(receipt({ status: "reversed", reversalReason: "Cheque bounced", unallocated: 0 }));
    expect(html).toContain("REVERSED");
    expect(html).toContain("not an active receipt");
    expect(html).toContain("Cheque bounced");
    expect(html).toMatch(/Applied to invoices<\/td><td class="num">₹0.00/);
    expect(paymentReceiptShareText(receipt({ status: "reversed" }))).toContain("REVERSED");
  });

  it("builds a safe file name", () => {
    expect(paymentReceiptFileName({ receiptNumber: "RCT/2026-27/00007" })).toBe("RCT-2026-27-00007.pdf");
  });
});

const ledger: CustomerLedgerPage = {
  rows: [
    { key: "invoice:1", date: "2026-10-01", type: "invoice", number: "INV/1", reference: "INV/1", description: "Invoice issued", invoiceId: "1", paymentId: null, creditNoteId: null, debit: 1000, credit: 0, runningBalance: 3000 },
    { key: "allocation:1", date: "2026-10-02", type: "allocation", number: "RCT/1", reference: "INV/1", description: "Applied", invoiceId: "1", paymentId: "p", creditNoteId: null, debit: 0, credit: 0, runningBalance: 3000 },
    { key: "payment:1", date: "2026-10-02", type: "payment", number: "RCT/1", reference: "=HYPERLINK(1)", description: "Receipt", invoiceId: null, paymentId: "p", creditNoteId: null, debit: 0, credit: 3500, runningBalance: -500 },
  ],
  total: 3,
  openingBalance: 2000,
  closingBalance: -500,
  periodDebit: 1000,
  periodCredit: 3500,
};

describe("customer statement", () => {
  it("carries the opening balance and shows Dr/Cr balances", () => {
    const party = { legalName: "X", addressLines: [], gstin: null, pan: null, phone: null, email: null, logoUrl: null };
    const html = buildCustomerStatementHtml({ issuer: party, customer: party, from: "2026-10-01", to: "2026-10-31", generatedOn: "2026-11-03", ledger });
    expect(html).toContain("₹2,000.00 Dr"); // opening
    expect(html).toContain("₹500.00 Cr"); // closing
    expect(html).toContain("01 Oct 2026 – 31 Oct 2026");
    expect(html).not.toContain(">Applied<"); // allocations stay off paper
  });

  it("formats balances", () => {
    expect(formatBalance(0.001)).toBe("₹0.00");
    expect(formatBalance(12.5)).toBe("₹12.50 Dr");
    expect(formatBalance(-12.5)).toBe("₹12.50 Cr");
  });
});

describe("CSV", () => {
  it("quotes, escapes and neutralises formulas", () => {
    expect(csvCell('a,"b"')).toBe('"a,""b"""');
    expect(csvCell("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(csvCell(-12.5)).toBe("-12.50");
    expect(toCsv(["h"], [[null]])).toBe("h\r\n");
  });

  it("ledger export has opening, rows with running balance, closing", () => {
    const lines = ledgerCsv(ledger).split("\r\n");
    expect(lines[0]).toBe("Date,Type,Document,Reference,Description,Debit,Credit,Balance");
    expect(lines[1]).toBe(",Opening balance,,,,,,2000.00");
    expect(lines[4]).toContain("'=HYPERLINK(1)");
    expect(lines[lines.length - 1]).toBe(",Closing balance,,,,1000.00,3500.00,-500.00");
  });

  it("escapes html", () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
  });
});

describe("receipt refunds", () => {
  it("shows refunds paid out of the receipt", () => {
    const html = buildPaymentReceiptHtml(
      receipt({ refunded: 200, unallocated: 150, refunds: [{ refundNumber: "RFD/2026-27/00001", refundDate: "2026-11-03", amount: 200, status: "recorded", mode: "neft" }] }),
    );
    expect(html).toContain("Refunded to the customer");
    expect(html).toContain("RFD/2026-27/00001");
  });
});

describe("credit note document", () => {
  const issuer: ReceiptParty = { legalName: "Acme", addressLines: [], gstin: "33AAAAA0000A1Z5", pan: null, phone: null, email: null, logoUrl: null };
  const base: CreditNoteRow = {
    id: "c1",
    creditNumber: "CN/INV-1/01",
    creditDate: "2026-11-03",
    status: "issued",
    reason: "Rate <correction>",
    amount: 118,
    taxAmount: 18,
    taxTreatment: "gst",
    supplyType: "intra",
    gstRate: 18,
    taxableAmount: 100,
    cgstAmount: 9,
    sgstAmount: 9,
    igstAmount: 0,
    refunded: 0,
    invoiceId: "i1",
    invoiceNumber: "INV-1",
    invoiceDate: "2026-10-01",
    invoiceTotal: 1180,
    clientId: "cl",
    clientName: "Client",
    issuedBy: "Finance",
    createdAt: null,
    lines: [{ description: "Rate correction", amount: 118, taxAmount: 18, cgstAmount: 9, sgstAmount: 9, igstAmount: 0 }],
  };

  it("intra-state credit shows CGST and SGST at half the rate", () => {
    const html = buildCreditNoteHtml(base, issuer, null);
    expect(html).toContain("CGST @ 9%");
    expect(html).toContain("SGST @ 9%");
    expect(html).not.toContain("IGST");
    expect(html).toContain("₹100.00");
    expect(html).toContain("Rate &lt;correction&gt;");
  });

  it("inter-state credit shows IGST at the full rate", () => {
    const html = buildCreditNoteHtml(
      { ...base, supplyType: "inter", cgstAmount: 0, sgstAmount: 0, igstAmount: 18, lines: [{ ...base.lines[0]!, cgstAmount: 0, sgstAmount: 0, igstAmount: 18 }] },
      issuer,
      null,
    );
    expect(html).toContain("IGST @ 18%");
    expect(html).not.toContain("CGST");
  });

  it("value-only credit says it has no GST adjustment, and refunds are shown", () => {
    const html = buildCreditNoteHtml({ ...base, taxTreatment: "no_gst", supplyType: null, gstRate: null, taxAmount: 0, cgstAmount: 0, sgstAmount: 0, refunded: 50 }, issuer, null);
    expect(html).toContain("without GST adjustment");
    expect(html).toContain("Refunded to the customer");
  });
});
