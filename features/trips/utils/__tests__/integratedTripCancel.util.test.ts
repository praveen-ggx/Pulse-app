import {
  integratedTripCancelBlock,
  integratedTripCancelOffered,
  isIntegratedAwardTrip,
  postedMoneyBlocksCancel,
  subcontractBlocksCancel,
} from "@/features/trips/utils/integratedTripCancel.util";

const awarded = {
  source: "indent",
  indentId: "ind-1",
  supplierId: "sup-1",
  status: "assigned",
  reasonId: "client_requested",
};

describe("integrated trip cancel", () => {
  it("allows an awarded integrated trip before pickup", () => {
    expect(isIntegratedAwardTrip(awarded)).toBe(true);
    expect(integratedTripCancelBlock(awarded)).toBeNull();
  });

  it("rejects marketplace awards and trips with no indent", () => {
    expect(
      integratedTripCancelBlock({ ...awarded, source: "market_bid" }),
    ).toBe("marketplace");
    expect(
      integratedTripCancelBlock({ ...awarded, indentId: null }),
    ).toBe("not_integrated");
  });

  it("rejects pickup and later, and an open compliance review", () => {
    expect(integratedTripCancelBlock({ ...awarded, status: "picked_up" })).toBe(
      "already_picked_up",
    );
    expect(
      integratedTripCancelBlock({ ...awarded, complianceDecision: "pending" }),
    ).toBe("compliance_review");
    expect(
      integratedTripCancelBlock({ ...awarded, complianceVerifiedAt: "2026-11-04" }),
    ).toBe("compliance_review");
  });

  it("rejects posted money and a downstream subcontract", () => {
    expect(integratedTripCancelBlock({ ...awarded, hasPostedMoney: true })).toBe(
      "posted_money",
    );
    expect(integratedTripCancelBlock({ ...awarded, hasSubcontract: true })).toBe(
      "subcontract",
    );
  });

  it("treats an open subcontract or posted money as a block", () => {
    expect(subcontractBlocksCancel(["pending"])).toBe(true);
    expect(subcontractBlocksCancel(["cancelled"])).toBe(false);
    expect(
      postedMoneyBlocksCancel({ advancePaid: 1, transactionAmounts: [], invoiceStatuses: [] }),
    ).toBe(true);
    expect(
      postedMoneyBlocksCancel({
        advancePaid: 0,
        amountPaid: 0,
        transactionAmounts: [{ amount: 0, status: "posted" }],
        invoiceStatuses: ["void"],
      }),
    ).toBe(false);
    expect(postedMoneyBlocksCancel({ invoiceStatuses: ["draft"] })).toBe(true);
    expect(
      postedMoneyBlocksCancel({
        transactionAmounts: [{ amountIn: 500, amountOut: 0 }],
      }),
    ).toBe(true);
    expect(
      integratedTripCancelOffered({
        source: "indent",
        indentId: "ind-1",
        supplierId: "sup-1",
        status: "assigned",
      }),
    ).toBe(true);
    expect(
      integratedTripCancelOffered({
        source: "market_bid",
        indentId: "ind-1",
        supplierId: "sup-1",
        status: "assigned",
      }),
    ).toBe(false);
  });

  it("requires a reason, and text when the reason is Other", () => {
    expect(integratedTripCancelBlock({ ...awarded, reasonId: null })).toBe(
      "reason_required",
    );
    expect(
      integratedTripCancelBlock({ ...awarded, reasonId: "other", otherText: "  " }),
    ).toBe("reason_required");
    expect(
      integratedTripCancelBlock({
        ...awarded,
        reasonId: "other",
        otherText: "Customer called",
      }),
    ).toBeNull();
  });
});