import {
  dcoSelfReceivableBilledAmount,
  tripPartyBilledAmount,
} from "../tripPartyReceivable.util";

describe("tripPartyBilledAmount — receivable is exclusive SOT", () => {
  it("uses authoritative issued receivable billed_amount", () => {
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

  it("returns unavailable when receivable is missing (null), even if dco_party_billed is set", () => {
    expect(tripPartyBilledAmount({ dco_party_billed: 18500 }, null)).toBeNull();
    expect(dcoSelfReceivableBilledAmount(null)).toBeNull();
  });

  it("returns unavailable when receivable argument is omitted — dco_party_billed alone is not issued", () => {
    expect(tripPartyBilledAmount({ dco_party_billed: 18500 })).toBeNull();
  });

  it("does not parse notes JSON billed markers", () => {
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
    ).toBeNull();
  });

  it("ignores trip object entirely when receivable is provided", () => {
    expect(
      tripPartyBilledAmount(
        {
          dco_party_billed: 99999,
          notes: '<!--pulse-dco-party:{"id":"x","name":"Y","billed":1}-->',
        } as { dco_party_billed: number; notes: string; client_price?: number },
        { billed_amount: 250 },
      ),
    ).toBe(250);
  });
});
