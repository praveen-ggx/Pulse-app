import {
  buildDriverCaptureDescription,
  driverCaptureLaneForTrip,
  driverLedgerCaptureReferenceId,
  parseDriverCaptureLane,
  stableDriverCaptureKey,
  toExchangePaymentMode,
  uuidV5,
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

  it("turns the capture key into a stable ledger uuid", () => {
    expect(uuidV5("python.org", "6ba7b810-9dad-11d1-80b4-00c04fd430c8")).toBe(
      "886313e1-3b8a-5372-9b90-0c9aee199e5d",
    );
    const key = "dco-capture:fleet:92c57326-2af8-426c-9ec1-663ebc4d3e31:4020:CASH::2026-11-02";
    const id = driverLedgerCaptureReferenceId(key);
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(driverLedgerCaptureReferenceId(key)).toBe(id);
    expect(driverLedgerCaptureReferenceId(`${key}:2`)).not.toBe(id);
  });

  it("maps capture modes onto Exchange", () => {
    expect(toExchangePaymentMode("BANK")).toBe("BANK");
    expect(toExchangePaymentMode("FUEL_CARD")).toBe("CASH");
  });
});
