import { resolveAdvancePaymentPendingAmount } from "@/features/tripCompliance/utils/complianceAdvanceProcessedExport.util";

describe("resolveAdvancePaymentPendingAmount", () => {
  it("uses the finance-approve snapshot when present", () => {
    expect(resolveAdvancePaymentPendingAmount(114500, 999)).toBe(114500);
    expect(resolveAdvancePaymentPendingAmount(0, 999)).toBe(0);
  });

  it("falls back to computed payable when the request has no snapshot", () => {
    expect(resolveAdvancePaymentPendingAmount(null, 4200)).toBe(4200);
    expect(resolveAdvancePaymentPendingAmount(undefined, 4200)).toBe(4200);
    expect(resolveAdvancePaymentPendingAmount(Number.NaN, 4200)).toBe(4200);
  });

  it("returns null when neither amount is usable", () => {
    expect(resolveAdvancePaymentPendingAmount(null, null)).toBeNull();
  });
});
