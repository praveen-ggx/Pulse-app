import { formatMarkComplianceVerifiedError } from "@/features/tripCompliance/utils/complianceMarkVerifiedError.util";

describe("formatMarkComplianceVerifiedError", () => {
  it("names the trip documents the server still needs approved", () => {
    expect(formatMarkComplianceVerifiedError("required documents not yet verified: invoice, eway_bill")).toBe(
      "Approve these trip documents first: invoice, eway_bill.",
    );
  });

  it("explains the resubmit gate", () => {
    expect(
      formatMarkComplianceVerifiedError(
        "this trip is on hold or rejected; Ground Ops must resubmit it before it can be verified",
      ),
    ).toMatch(/Ground Ops must fix it and Resubmit/);
  });

  it("passes through unrelated errors", () => {
    expect(formatMarkComplianceVerifiedError("not authorized")).toBe("not authorized");
  });
});
