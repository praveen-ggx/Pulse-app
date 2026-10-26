import {
  alignPodSettlementLedger,
  podSettlementPayable,
  signedPodNoteAmount,
} from "@/features/debit-control/utils/podSettlementSummary.util";
import type { PodCnDnDraft } from "@/features/debit-control/utils/podExceptionCnDn.util";

function draft(over: Partial<PodCnDnDraft> & Pick<PodCnDnDraft, "party" | "impact" | "amount">): PodCnDnDraft {
  return {
    missionKey: "PODCNDN-VENDOR-DAMAGE",
    partyLabel: "Vendor",
    chargeKey: "damage",
    label: "Damages",
    type: "cost",
    noteKind: "CN",
    reason: "Damages / Missing",
    ...over,
  };
}

describe("podSettlementPayable", () => {
  it("does not subtract posted CN / DN again from revised cost", () => {
    const next = podSettlementPayable({
      revisedCost: 4401,
      pending: [],
      tdsAmount: 0,
      documentationCharges: 200,
      advancePaid: 0,
      balancePaid: 0,
    });
    expect(next.revisedPayable).toBe(4401);
    expect(next.actualPayable).toBe(4201);
    expect(next.remaining).toBe(4201);
  });

  it("applies POD charges that are still not adjusted", () => {
    const next = podSettlementPayable({
      revisedCost: 4401,
      pending: [draft({ party: "vendor", impact: "minus", amount: 500 })],
      tdsAmount: 0,
      documentationCharges: 0,
      advancePaid: 1000,
      balancePaid: 0,
    });
    expect(next.unadjustedCost).toBe(-500);
    expect(next.actualPayable).toBe(3901);
    expect(next.remaining).toBe(2901);
  });
});

describe("alignPodSettlementLedger", () => {
  it("marks an untagged Finance payout as advance and keeps remaining aligned", () => {
    const next = alignPodSettlementLedger({
      actualPayable: 4201,
      taggedAdvance: 0,
      taggedBalance: 0,
      ledgerCostPaid: 1500,
    });
    expect(next.advancePaid).toBe(1500);
    expect(next.balancePosted).toBe(false);
    expect(next.remaining).toBe(2701);
  });

  it("does not treat remaining as paid when no balance row exists", () => {
    const next = alignPodSettlementLedger({
      actualPayable: 4201,
      taggedAdvance: 2000,
      taggedBalance: 0,
      ledgerCostPaid: 2000,
    });
    expect(next.advancePaid).toBe(2000);
    expect(next.balancePaid).toBe(0);
    expect(next.remaining).toBe(2201);
  });
});

describe("signedPodNoteAmount", () => {
  it("prefers the posted CN / DN amount", () => {
    expect(
      signedPodNoteAmount({ amount: 4500, impact: "minus" }, { amount: 5099, impact: "minus" }),
    ).toBe(-5099);
  });
});
