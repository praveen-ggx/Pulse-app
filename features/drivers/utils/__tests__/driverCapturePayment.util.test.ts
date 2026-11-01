import {
  buildDriverCaptureDescription,
  driverCaptureLaneForTrip,
  parseDriverCaptureLane,
  toExchangePaymentMode,
} from "../driverCapturePayment.util";

describe("driverCapturePayment.util", () => {
  it("builds a ledger description with mode and UTR", () => {
    expect(
      buildDriverCaptureDescription({
        tripDisplay: "TRP001",
        paymentModeId: "UPI",
        reference: "ABC12345678",
        paidOn: "2026-11-01",
      }),
    ).toBe("Trip TRP001 · Mode: UPI · UTR ABC12345678 · Paid: 2026-11-01");
  });

  it("routes marketplace DCO awards to Exchange", () => {
    expect(
      driverCaptureLaneForTrip({ source: "market_bid", operating_mode: "DCO" }, false),
    ).toBe("marketplace");
    expect(
      driverCaptureLaneForTrip({ source: "manual", operating_mode: "DCO" }, false),
    ).toBe("shipper");
    expect(
      driverCaptureLaneForTrip({ source: "manual", operating_mode: "FLEET" }, true),
    ).toBe("fleet");
  });

  it("parses lane query values", () => {
    expect(parseDriverCaptureLane("marketplace")).toBe("marketplace");
    expect(parseDriverCaptureLane("nope")).toBeNull();
  });

  it("maps capture modes onto Exchange", () => {
    expect(toExchangePaymentMode("BANK")).toBe("BANK");
    expect(toExchangePaymentMode("FUEL_CARD")).toBe("CASH");
  });
});
