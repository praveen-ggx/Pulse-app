import { dcoSelfIssueKey, outstandingForReceivable } from "../dcoSelfReceivable.service";

describe("dcoSelfReceivable outstanding", () => {
  it("is current billed minus all collections", () => {
    expect(outstandingForReceivable(55000, [])).toBe(55000);
    expect(outstandingForReceivable(55000, [{ amount: 20000 }])).toBe(35000);
    expect(outstandingForReceivable(50000, [{ amount: 20000 }])).toBe(30000);
    expect(outstandingForReceivable(20000, [{ amount: 20000 }])).toBe(0);
  });

  it("uses one issue key per trip", () => {
    expect(dcoSelfIssueKey("trip-1")).toBe("dco-self-issue:trip-1");
  });
});
