import { findDuplicateDriverPayout, monthStartOf } from '../driverPayoutDuplicate.util';

const salaryRow = (date: string, amount = 24000) => ({
  amount_out: amount,
  description: 'Monthly Salary | Mode: Cash',
  transaction_date: date,
});

describe('findDuplicateDriverPayout', () => {
  it('flags a second Monthly Salary in the same month', () => {
    const res = findDuplicateDriverPayout([salaryRow('2026-11-03')], {
      amount: 20000,
      driverPaymentType: 'salary',
      transactionDate: '2026-11-12',
    });
    expect(res).toEqual({ kind: 'same_month_salary', amount: 24000, date: '2026-11-03' });
  });

  it('allows salary for a different month', () => {
    const res = findDuplicateDriverPayout([salaryRow('2026-10-30')], {
      amount: 24000,
      driverPaymentType: 'salary',
      transactionDate: '2026-11-01',
    });
    expect(res).toBeNull();
  });

  it('flags same amount on the same day for other payment types', () => {
    const res = findDuplicateDriverPayout(
      [{ amount_out: 5000, description: 'Advance | Mode: UPI', transaction_date: '2026-11-12' }],
      { amount: 5000, driverPaymentType: 'advance', transactionDate: '2026-11-12' },
    );
    expect(res).toEqual({ kind: 'same_day_amount', amount: 5000, date: '2026-11-12' });
  });

  it('does not flag a different amount on the same day', () => {
    const res = findDuplicateDriverPayout(
      [{ amount_out: 5000, description: 'Advance', transaction_date: '2026-11-12' }],
      { amount: 3000, driverPaymentType: 'advance', transactionDate: '2026-11-12' },
    );
    expect(res).toBeNull();
  });

  it('ignores cash-in rows (amount_out 0)', () => {
    const res = findDuplicateDriverPayout(
      [{ amount_out: 0, description: 'Monthly Salary', transaction_date: '2026-11-02' }],
      { amount: 24000, driverPaymentType: 'salary', transactionDate: '2026-11-12' },
    );
    expect(res).toBeNull();
  });
});

describe('monthStartOf', () => {
  it('returns the first of the month', () => {
    expect(monthStartOf('2026-11-12')).toBe('2026-11-01');
  });
});
