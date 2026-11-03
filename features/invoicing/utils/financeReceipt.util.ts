/**
 * Receipt entry helpers. Pure. They mirror the database limits so the form can
 * explain a problem before submitting; the database still enforces them.
 */

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Apply `amount` to invoices in the given order (oldest due first), never past an invoice's outstanding. */
export function allocateOldestFirst(
  amount: number,
  invoices: readonly { id: string; outstanding: number }[],
): { id: string; amount: number }[] {
  let left = round2(Math.max(0, amount));
  const out: { id: string; amount: number }[] = [];
  for (const invoice of invoices) {
    if (left <= 0) break;
    const take = round2(Math.min(left, Math.max(0, invoice.outstanding)));
    if (take > 0) {
      out.push({ id: invoice.id, amount: take });
      left = round2(left - take);
    }
  }
  return out;
}

export function receiptAllocationProblems(input: {
  bank: number;
  tds: number;
  allocations: readonly { invoiceId: string; amount: number }[];
  outstanding: Readonly<Record<string, number>>;
}): string[] {
  const problems: string[] = [];
  if (!Number.isFinite(input.bank) || input.bank <= 0) problems.push("Enter the amount received in the bank.");
  if (!Number.isFinite(input.tds) || input.tds < 0) problems.push("TDS must be zero or more.");
  const total = round2((Number.isFinite(input.bank) ? input.bank : 0) + (Number.isFinite(input.tds) ? input.tds : 0));
  let applied = 0;
  for (const row of input.allocations) {
    if (!Number.isFinite(row.amount) || row.amount <= 0) {
      problems.push("Every applied amount must be greater than zero.");
      continue;
    }
    const open = input.outstanding[row.invoiceId];
    if (open === undefined) problems.push("An invoice in this receipt is no longer open.");
    else if (round2(row.amount) > round2(open)) problems.push("An applied amount is more than that invoice's outstanding balance.");
    applied = round2(applied + row.amount);
  }
  if (applied > total) problems.push("More is applied than the receipt total (bank + TDS).");
  return problems;
}
