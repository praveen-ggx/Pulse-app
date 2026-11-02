import { summarizeFinanceReceivableRows } from "../dcoSelfFinanceReceivables.util";

describe("summarizeFinanceReceivableRows", () => {
  it("sums Self finance rows without mixing org ledger fields", () => {
    const totals = summarizeFinanceReceivableRows([
      { billed_amount: 5000, collected: 2000, outstanding: 3000 },
      { billed_amount: 1000, collected: 0, outstanding: 1000 },
    ]);
    expect(totals).toEqual({ billed: 6000, collected: 2000, outstanding: 4000 });
  });
});
