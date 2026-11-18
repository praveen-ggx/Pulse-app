import {
  formatBareRupeeTokens,
  tripBalanceHint,
  tripPaymentProgress,
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

describe("trip payment progress", () => {
  const money = { clientTotal: 0, clientPaid: 0, supplierTotal: 50000, supplierPaid: 0 };

  it("counts this payment when the money snapshot has not caught up", () => {
    expect(tripPaymentProgress("paid", money, 44500)).toEqual({
      ratio: 0.89,
      caption: "₹5,500 left of ₹50,000",
    });
  });

  it("uses the snapshot when it already covers more than this payment", () => {
    expect(tripPaymentProgress("paid", { ...money, supplierPaid: 48000 }, 4000)?.caption).toBe(
      "₹2,000 left of ₹50,000",
    );
  });

  it("caps at the total and reads as settled", () => {
    expect(tripPaymentProgress("paid", money, 60000)).toEqual({
      ratio: 1,
      caption: "₹50,000 settled",
    });
  });

  it("returns nothing without a trip total", () => {
    expect(tripPaymentProgress("received", money, 1000)).toBeNull();
    expect(tripPaymentProgress("paid", undefined, 1000)).toBeNull();
  });
});
