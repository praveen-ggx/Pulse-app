# praveen/V1.0.40

## What
- Invoice Book trip search matches the operational trip id (for example SAT812GOGTRIP001) when the row id is the booking ref or LR.
- The trip table stays inside the pane and scrolls vertically after a search.

## Why
- Search only looked at the booking ref, so the displayed trip id missed while the LR of the same trip hit. The list also grew past the pane, so rows below the fold could not be scrolled to.

## Areas
- `features/invoicing/InvoicingExecuteScreen.tsx`
- `features/invoicing/services/invoicing.service.ts`
- `features/invoicing/components/financeInvoiceWorkspace.styles.ts`
- `features/invoicing/utils/invoiceTripOperational.util.ts`
- `features/invoicing/utils/__tests__/invoiceTripOperational.util.test.ts`

## Migrations
- None

## Tested
- `npx jest features/invoicing/utils/__tests__/invoiceTripOperational.util.test.ts --ci --silent --no-coverage`
- UI: not clicked through
