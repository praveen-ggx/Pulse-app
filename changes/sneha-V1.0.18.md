# sneha/V1.0.18

## What

- Settlement shows the expense log without the reimbursement summary card, and without the “Open earnings & trips” link.
- Expense rows no longer expand. A row opens the expense to edit.
- Operations no longer points drivers to the Settlement tab for the expense log.
- Log expense uses the receipt card: corner guides, Click Photo, and Attach Photo. Click Photo opens the full-page camera. The trip route sits under the scan.
- Non-DCO earnings uses the billed amount, with Received, Pending, Spent, and Margin. DCO does not see the salary request button.
- DCO Self uses the green Total outstanding card. The linked fleet card stays hidden after unlink.
- Transactions include book collections and trip expenses. Receipt actions sit on one row.
- An approved DCO who is still employed must unlink before continuing.

## Why

The reimbursement summary was an empty card, and the receipt scan controls were overlapping. Drivers should see expenses after they are added, and take a receipt photo from a clear scan card. Earnings, transactions, and the DCO unlink step were still on the old figures.

## Areas

- features/driver/components/TripDetailSettlementPanel.tsx
- features/driver/components/DriverTripExpenseLogSection.tsx
- features/driver/components/DriverTripOperationsTab.tsx
- features/trips/operations/shared/DriverExpenseEntryLayout.tsx
- features/trips/operations/shared/ExpenseReceiptViewfinder.tsx
- features/trips/operations/shared/ReceiptCameraScreen.tsx
- features/trips/operations/fuel, toll, other entry screens
- features/drivers/screens/DriverWalletScreen.tsx
- features/drivers/components/DriverWalletEarningsPanel.tsx
- features/drivers/components/DcoEmploymentConflictModal.tsx
- features/drivers/utils/driverWalletTransactions.util.ts
- components/ledger/LedgerEntryReceiptCard.tsx

## Migrations

None.

## Tested

Not clicked through.
