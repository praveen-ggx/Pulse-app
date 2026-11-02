import { deriveDriverPaymentMode } from "../driverTripSettlement.util";

describe("deriveDriverPaymentMode", () => {
  it("reads Mode: token before any other cash wording", () => {
    expect(deriveDriverPaymentMode("Trip TRP009 · Mode: UPI · cash in")).toBe("UPI");
    expect(deriveDriverPaymentMode("Mode: BANK · added to cash balance")).toBe("BANK TRANSFER");
    expect(deriveDriverPaymentMode("Mode: CHEQUE")).toBe("CHEQUE");
    expect(deriveDriverPaymentMode("Mode: CASH")).toBe("CASH");
  });

  it("does not treat cash-in / cash balance copy as cash payment mode", () => {
    expect(deriveDriverPaymentMode("Added to cash balance")).toBeNull();
    expect(deriveDriverPaymentMode("Cash in from fleet")).toBeNull();
    expect(deriveDriverPaymentMode("This will update your cash balance.")).toBeNull();
    expect(deriveDriverPaymentMode("Settlement received")).toBeNull();
  });

  it("still detects an explicit cash instrument", () => {
    expect(deriveDriverPaymentMode("Paid in cash")).toBe("CASH");
    expect(deriveDriverPaymentMode("cash payment at gate")).toBe("CASH");
  });
});
