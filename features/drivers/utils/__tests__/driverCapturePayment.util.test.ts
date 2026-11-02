import {
  buildDriverCaptureDescription,
  driverCaptureLaneForTrip,
  parseDriverCaptureLane,
  stableDriverCaptureKey,
  toExchangePaymentMode,
} from "../driverCapturePayment.util";

describe("driverCapturePayment.util", () => {
  it("labels fleet captures as commission", () => {
    expect(
      buildDriverCaptureDescription({
        tripDisplay: "TRP009",
        paymentModeId: "BANK",
        reference: "NEFT1",
        paidOn: "2026-11-01",
        lane: "fleet",
      }),
    ).toBe("Commission TRP009 · Mode: BANK TRANSFER · UTR NEFT1 · Paid: 2026-11-01");
  });

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
    expect(
      driverCaptureLaneForTrip({ source: "manual", operating_mode: "FLEET" }, false),
    ).toBe("shipper");
  });

  it("parses lane query values", () => {
    expect(parseDriverCaptureLane("marketplace")).toBe("marketplace");
    expect(parseDriverCaptureLane("nope")).toBeNull();
  });

  it("builds a stable capture key for retries", () => {
    const a = stableDriverCaptureKey({
      lane: "shipper",
      tripId: "t1",
      amount: 99.4,
      paymentModeId: "upi",
      reference: " UTR9 ",
      paidOn: "2026-11-01T10:00:00Z",
    });
    const b = stableDriverCaptureKey({
      lane: "shipper",
      tripId: "t1",
      amount: 99,
      paymentModeId: "UPI",
      reference: "utr9",
      paidOn: "2026-11-01",
    });
    expect(a).toBe(b);
    expect(a).toBe("dco-capture:shipper:t1:99:UPI:utr9:2026-11-01");
  });

  it("maps capture modes onto Exchange", () => {
    expect(toExchangePaymentMode("BANK")).toBe("BANK");
    expect(toExchangePaymentMode("FUEL_CARD")).toBe("CASH");
  });
});
