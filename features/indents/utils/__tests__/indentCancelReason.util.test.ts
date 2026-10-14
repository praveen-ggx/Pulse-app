import {
  indentAwardBlockedBecauseInactive,
  indentCancelReasonId,
  indentCancelReasonLabel,
  indentFailedCategory,
  indentStatusForCancelReason,
  isIndentFailedStatus,
} from "@/features/indents/utils/indentCancelReason.util";

describe("indent cancel reasons", () => {
  it("recognises the four stored reason ids", () => {
    expect(indentCancelReasonId("client_cancelled")).toBe("client_cancelled");
    expect(indentCancelReasonId("indent_expired")).toBe("indent_expired");
    expect(indentCancelReasonId("no_rates_available")).toBe("no_rates_available");
    expect(indentCancelReasonId("wrong_entry")).toBe("wrong_entry");
    expect(indentCancelReasonId("other")).toBeNull();
    expect(indentCancelReasonId(null)).toBeNull();
  });

  it("still labels the legacy cost reason without offering it", () => {
    expect(indentCancelReasonId("cost_does_not_match")).toBeNull();
    expect(indentCancelReasonLabel("cost_does_not_match")).toBe("Cost doesn't match");
  });

  it("treats cancelled and expired as failed", () => {
    expect(isIndentFailedStatus("cancelled")).toBe(true);
    expect(isIndentFailedStatus("expired")).toBe(true);
    expect(isIndentFailedStatus("open")).toBe(false);
    expect(isIndentFailedStatus("closed")).toBe(false);
    expect(isIndentFailedStatus("completed")).toBe(false);
  });

  it("maps indent expired onto the expired status", () => {
    expect(indentStatusForCancelReason("indent_expired")).toBe("expired");
    expect(indentStatusForCancelReason("wrong_entry")).toBe("cancelled");
    expect(indentStatusForCancelReason("client_cancelled")).toBe("cancelled");
    expect(indentStatusForCancelReason("no_rates_available")).toBe("cancelled");
  });
});

describe("indentAwardBlockedBecauseInactive", () => {
  it("blocks award on a cancelled, closed, or expired indent", () => {
    expect(indentAwardBlockedBecauseInactive("cancelled")).toMatch(/reactivate/i);
    expect(indentAwardBlockedBecauseInactive("closed")).toMatch(/reactivate/i);
    expect(indentAwardBlockedBecauseInactive("EXPIRED")).toMatch(/reactivate/i);
  });

  it("buckets a failed indent by its cancel reason", () => {
    expect(
      indentFailedCategory({ status: "cancelled", cancel_reason: "client_cancelled" }),
    ).toBe("client_cancelled");
    expect(
      indentFailedCategory({ status: "cancelled", cancel_reason: "cost_does_not_match" }),
    ).toBe("cost_does_not_match");
    expect(indentFailedCategory({ status: "expired", cancel_reason: null })).toBe(
      "indent_expired",
    );
  });

  it("leaves the live award path open", () => {
    expect(indentAwardBlockedBecauseInactive("broadcast")).toBeNull();
    expect(indentAwardBlockedBecauseInactive("open")).toBeNull();
    expect(indentAwardBlockedBecauseInactive("pending")).toBeNull();
    expect(indentAwardBlockedBecauseInactive("quoted")).toBeNull();
  });
});
