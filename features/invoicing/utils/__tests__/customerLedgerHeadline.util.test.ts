import { customerLedgerHeadlineSource } from "../customerLedgerHeadline.util";

describe("customerLedgerHeadlineSource", () => {
  it("uses the invoice ledger once its lines are available", () => {
    expect(customerLedgerHeadlineSource(true)).toBe("invoice");
  });

  it("falls back to trip sales only when the invoice ledger cannot be read", () => {
    expect(customerLedgerHeadlineSource(false)).toBe("trip");
  });
});
