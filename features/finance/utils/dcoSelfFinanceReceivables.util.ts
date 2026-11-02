export type DcoSelfFinanceReceivableTotalsInput = {
  billed_amount: number;
  collected: number;
  outstanding: number;
};

export function summarizeFinanceReceivableRows(
  rows: DcoSelfFinanceReceivableTotalsInput[],
) {
  return rows.reduce(
    (acc, row) => ({
      billed: acc.billed + row.billed_amount,
      collected: acc.collected + row.collected,
      outstanding: acc.outstanding + row.outstanding,
    }),
    { billed: 0, collected: 0, outstanding: 0 },
  );
}
