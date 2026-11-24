# sneha/V1.0.18

## What

- Settlement shows the expense log without the reimbursement summary card, and without the “Open earnings & trips” link.
- Expense rows no longer expand. A row opens the expense to edit.
- Operations no longer points drivers to the Settlement tab for the expense log.
- Log expense uses the receipt card: corner guides, Click Photo, and Attach Photo. Click Photo opens the full-page camera. The trip route sits under the scan.

## Why

The reimbursement summary was an empty card, and the receipt scan controls were overlapping. Drivers should see expenses after they are added, and take a receipt photo from a clear scan card.

## Areas

- features/driver/components/TripDetailSettlementPanel.tsx
- features/driver/components/DriverTripExpenseLogSection.tsx
- features/driver/components/DriverTripOperationsTab.tsx
- features/trips/operations/shared/DriverExpenseEntryLayout.tsx
- features/trips/operations/shared/ExpenseReceiptViewfinder.tsx
- features/trips/operations/shared/ReceiptCameraScreen.tsx
- features/trips/operations/fuel, toll, other entry screens

## Migrations

None.

## Tested

Not clicked through.
