import { formatINR } from "@/lib/format";
import { awardRevokePresentation } from "@/features/marketplace/utils/testFeeRevoke.util";

const paid = {
  status: "accepted",
  fee_payment_status: "paid",
  platform_fee_amount: 3600,
};

describe("awardRevokePresentation", () => {
  it("keeps the existing revoke action when the fee is not paid", () => {
    const view = awardRevokePresentation([
      { ...paid, fee_payment_status: "required" },
    ]);
    expect(view.mode).toBe("revoke");
    expect(view.buttonLabel).toBe("Revoke award");
    expect(view.confirmMessage).not.toContain("3,600");
  });

  it("asks to reverse the paid test fee and shows the amount", () => {
    const view = awardRevokePresentation([paid]);
    expect(view.mode).toBe("refund_test");
    expect(view.buttonLabel).toBe("Refund test fee and revoke");
    expect(view.confirmMessage).toContain(formatINR(3600));
    expect(view.confirmMessage).toContain("Razorpay and cash");
  });

  it("ignores a paid bid that is not the accepted award", () => {
    const view = awardRevokePresentation([
      { ...paid, status: "rejected" },
    ]);
    expect(view.mode).toBe("revoke");
  });
});
