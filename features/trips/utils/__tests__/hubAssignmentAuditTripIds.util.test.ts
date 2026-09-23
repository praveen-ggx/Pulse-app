import { hubAssignmentAuditTripIds } from "../hubAssignmentAuditTripIds.util";

describe("hubAssignmentAuditTripIds", () => {
  it("caps the hub assignment-audit IN list", () => {
    const ids = Array.from({ length: 24 }, (_, i) => `t${i}`);
    expect(hubAssignmentAuditTripIds(ids)).toHaveLength(12);
    expect(hubAssignmentAuditTripIds(ids)[0]).toBe("t0");
  });

  it("returns an empty list when the cap is 0", () => {
    expect(hubAssignmentAuditTripIds(["a"], 0)).toEqual([]);
  });
});
