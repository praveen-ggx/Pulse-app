import {
  dcoSelfReceivableBilledAmount,
  tripPartyBilledAmount,
} from "../tripPartyReceivable.util";

describe("tripPartyBilledAmount", () => {
  it("uses authoritative DCO Self receivable billed_amount when provided", () => {
    expect(
      tripPartyBilledAmount(
        {
          dco_party_billed: 1000,
          notes: '<!--pulse-dco-party:{"id":"p1","name":"X","billed":99999}-->',
        },
        { billed_amount: 18500 },
      ),
    ).toBe(18500);
  });

  it("preserves legitimate zero on the receivable", () => {
    expect(tripPartyBilledAmount({ dco_party_billed: 5000 }, { billed_amount: 0 })).toBe(0);
  });

  it("returns null when receivable is missing (distinct from zero)", () => {
    expect(tripPartyBilledAmount({ dco_party_billed: null }, null)).toBeNull();
    expect(dcoSelfReceivableBilledAmount(null)).toBeNull();
  });

  it("does not parse notes JSON billed / dco_party_billed markers", () => {
    expect(
      tripPartyBilledAmount({
        dco_party_billed: null,
        notes: '<!--pulse-dco-party:{"id":"c-2","name":"Ajio","billed":18500}-->',
      }),
    ).toBeNull();
  });

  it("does not let zero dco_party_billed fall through to notes", () => {
    expect(
      tripPartyBilledAmount({
        dco_party_billed: 0,
        notes: '<!--pulse-dco-party:{"id":"c-2","name":"Ajio","billed":18500}-->',
      }),
    ).toBe(0);
  });

  it("reads the trip column when no receivable is supplied", () => {
    expect(tripPartyBilledAmount({ dco_party_billed: 18500 })).toBe(18500);
  });
});
