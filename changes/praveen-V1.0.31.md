# praveen/V1.0.31

## What
- Advance Payment **Confirm payment** keeps the Sync / Transaction Date on the **Paid** tab together with the UTR (date no longer blanks after confirm).

## Why
- Confirm Payment already stamped QMETA `compliance_txn_date_set` and wrote `transaction_date`, but `createLedgerEntry` rebuilt the description QMETA and dropped that flag. The Paid tab only shows Paid at / Sync date when the flag is present, so UTR stayed visible while the date looked missing and needed re-entry.

## How
- `buildDescriptionWithMeta` / `normalizeLedgerMeta` preserve `compliance_txn_date_set` when ledger writes rebuild QMETA for trip/payment fields.

## Areas
- `features/finance/services/finance.service.ts`
- `features/finance/services/__tests__/createLedgerEntry.complianceTxnDate.test.ts`

## Migrations
- none

## Tested
- `npx jest features/finance/services/__tests__/createLedgerEntry.complianceTxnDate.test.ts --ci --silent`
- UI: not clicked through
