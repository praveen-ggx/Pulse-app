import { expectedAfterTds, normalizeClientTdsPercent, tdsForBankCredit } from "@/features/invoicing/utils/clientTds.util";

describe("client TDS expectation", () => {
  it("keeps a one-time percent inside 0 to 100", () => {
    expect(normalizeClientTdsPercent(2)).toBe(2);
    expect(normalizeClientTdsPercent(-1)).toBe(0);
    expect(normalizeClientTdsPercent(140)).toBe(100);
  });

  it("expects the bank credit after the client deducts TDS", () => {
    expect(expectedAfterTds(100000, 2)).toEqual({
      gross: 100000,
      percent: 2,
      tds: 2000,
      bank: 98000,
    });
  });

  it("rebuilds TDS from the bank credit at the saved rate", () => {
    expect(tdsForBankCredit(98000, 2)).toBe(2000);
    expect(tdsForBankCredit(98000, 0)).toBe(0);
  });
});
