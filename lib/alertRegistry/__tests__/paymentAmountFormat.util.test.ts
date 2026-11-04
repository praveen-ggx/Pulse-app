import {
  formatBareRupeeTokens,
  tripBalanceHint,
} from "@/lib/alertRegistry/paymentAmountFormat.util";

describe("payment amount format", () => {
  it("groups a zero-padded ledger rupee", () => {
    expect(
      formatBareRupeeTokens("Godrej India paid ₹0036000 to nihas logs"),
    ).toBe("Godrej India paid ₹36,000 to nihas logs");
  });

  it("leaves an already grouped amount alone", () => {
    expect(formatBareRupeeTokens("paid ₹36,000 to nihas logs")).toBe(
      "paid ₹36,000 to nihas logs",
    );
  });

  it("shows remaining supplier balance when the trip has a total", () => {
    expect(
      tripBalanceHint("paid", {
        clientTotal: 0,
        clientPaid: 0,
        supplierTotal: 48000,
        supplierPaid: 36000,
      }),
    ).toBe("₹12,000 left of ₹48,000");
  });

  it("shows the trip total when nothing has been recorded against it", () => {
    expect(
      tripBalanceHint("received", {
        clientTotal: 50000,
        clientPaid: 0,
        supplierTotal: 0,
        supplierPaid: 0,
      }),
    ).toBe("Trip total ₹50,000");
  });

  it("stays quiet when the trip has no total", () => {
    expect(
      tripBalanceHint("paid", {
        clientTotal: 36000,
        clientPaid: 0,
        supplierTotal: 0,
        supplierPaid: 0,
      }),
    ).toBeNull();
  });
});
