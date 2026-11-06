# praveen/V1.0.31

## What
- Advance Payment → Pending: after **Confirm payment**, the trip moves to **Paid** with both UTR and Transaction Date (Sync date) still shown.
- Transaction Date no longer disappears on Paid and does not need to be entered again.

## Why
- Confirm was saving UTR and the date correctly, but a follow-up ledger save wiped a small “date confirmed” mark.
- The Paid tab only displays Transaction Date when that mark is present, so UTR stayed visible while the date looked blank.

## Areas
- `features/finance/services/finance.service.ts` — keep the date-confirmed mark when rebuilding payment description metadata
- `features/finance/services/__tests__/createLedgerEntry.complianceTxnDate.test.ts`

## Migrations
- none

## Tested
- `npx jest features/finance/services/__tests__/createLedgerEntry.complianceTxnDate.test.ts --ci --silent`
- UI: not clicked through
