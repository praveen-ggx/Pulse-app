/**
 * Fleet → driver payout duplicate detection (pure).
 *
 * Rules:
 * - Monthly Salary: one per driver per calendar month (by transaction_date).
 * - Any other driver payment: same amount on the same day is a likely double entry.
 *
 * Callers ask the user to confirm; this never blocks on its own (a top-up or a
 * second advance on the same day can be legitimate).
 */

export type DriverPayoutRow = {
  amount_out: number | string | null;
  description: string | null;
  transaction_date: string | null;
};

export type DriverPayoutDuplicate =
  | { kind: 'same_month_salary'; amount: number; date: string }
  | { kind: 'same_day_amount'; amount: number; date: string };

const SALARY_LABEL = 'monthly salary';

function isSalaryRow(row: DriverPayoutRow): boolean {
  return (row.description ?? '').trim().toLowerCase().startsWith(SALARY_LABEL);
}

/** First day of the month for a YYYY-MM-DD date (string-only, no timezone shift). */
export function monthStartOf(isoDate: string): string {
  return `${isoDate.slice(0, 7)}-01`;
}

export function findDuplicateDriverPayout(
  existing: readonly DriverPayoutRow[],
  input: { amount: number; driverPaymentType: string | null | undefined; transactionDate: string },
): DriverPayoutDuplicate | null {
  const day = input.transactionDate.slice(0, 10);
  const month = day.slice(0, 7);

  if (input.driverPaymentType === 'salary') {
    const hit = existing.find(
      (r) =>
        Number(r.amount_out ?? 0) > 0 &&
        isSalaryRow(r) &&
        (r.transaction_date ?? '').slice(0, 7) === month,
    );
    if (hit) {
      return {
        kind: 'same_month_salary',
        amount: Number(hit.amount_out ?? 0),
        date: (hit.transaction_date ?? '').slice(0, 10),
      };
    }
  }

  const sameDay = existing.find(
    (r) =>
      Number(r.amount_out ?? 0) === input.amount &&
      (r.transaction_date ?? '').slice(0, 10) === day,
  );
  if (sameDay) {
    return { kind: 'same_day_amount', amount: input.amount, date: day };
  }
  return null;
}
