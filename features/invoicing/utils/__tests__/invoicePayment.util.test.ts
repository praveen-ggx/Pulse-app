import {
  agingBucket,
  allocationFits,
  deriveInvoicePaymentStatus,
  invoiceAmountOutstanding,
  parseInrAmount,
  paymentReceiptText,
  roundInr,
} from "../invoicePayment.util";

describe("invoice payment balances", () => {
  it("rounds to paise", () => {
    expect(roundInr(10.126)).toBe(10.13);
    expect(parseInrAmount("1,250.50")).toBe(1250.5);
    expect(parseInrAmount("0")).toBeNull();
  });

  it("derives unpaid, partial, paid, and overpaid from allocations", () => {
    expect(deriveInvoicePaymentStatus(1000, 0)).toBe("unpaid");
    expect(deriveInvoicePaymentStatus(1000, 400)).toBe("partially_paid");
    expect(deriveInvoicePaymentStatus(1000, 1000)).toBe("paid");
    expect(deriveInvoicePaymentStatus(1000, 1000.01)).toBe("overpaid");
    expect(invoiceAmountOutstanding(1000, 400)).toBe(600);
    expect(deriveInvoicePaymentStatus(0, 0)).toBe("paid");
  });

  it("rejects an allocation past the payment or the invoice", () => {
    expect(
      allocationFits({
        paymentAmount: 100,
        alreadyAllocated: 50,
        invoiceTotal: 80,
        alreadyReceived: 40,
        nextAmount: 40,
      }),
    ).toEqual({ ok: true });
    expect(
      allocationFits({
        paymentAmount: 100,
        alreadyAllocated: 80,
        invoiceTotal: 200,
        alreadyReceived: 0,
        nextAmount: 30,
      }).ok,
    ).toBe(false);
    expect(
      allocationFits({
        paymentAmount: 500,
        alreadyAllocated: 0,
        invoiceTotal: 100,
        alreadyReceived: 90,
        nextAmount: 20,
      }),
    ).toEqual({ ok: false, reason: "invoice" });
  });

  it("ages outstanding from the due date", () => {
    const today = new Date("2026-11-03T12:00:00");
    expect(agingBucket("2026-11-10", today)).toBe("current");
    expect(agingBucket("2026-10-20", today)).toBe("days_1_30");
    expect(agingBucket("2026-09-20", today)).toBe("days_31_60");
    expect(agingBucket("2026-08-20", today)).toBe("days_61_90");
    expect(agingBucket("2026-07-01", today)).toBe("days_over_90");
  });

  it("builds a receipt from the payment row, not from the trip ledger", () => {
    const text = paymentReceiptText({
      invoiceNumber: "GOG/2026-27/00001",
      paymentDate: "2026-11-03",
      amount: 500,
      mode: "neft",
      reference: "UTR1",
      allocationAmount: 400,
      status: "recorded",
    });
    expect(text).toContain("GOG/2026-27/00001");
    expect(text).toContain("UTR1");
    expect(text).not.toContain("amount_paid");
  });
});
