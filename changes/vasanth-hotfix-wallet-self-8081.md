# vasanth hotfix wallet Self 8081

## What
- Restore Driver Self wallet receivables to the trip-based party preview used on localhost:8081 (Untagged, Marketplace, billed/received/due totals).
- Stop the book overlay path that showed Outstanding as Unavailable and hid Untagged.

## Why
Production `V1.0.1` after release/2026-11-02 shipped the receivable-book rollup UI. Operators need the working 8081 Self preview published.

## Areas
- components/DetailPageLayout.tsx (titleAlign)
- features/clients/components/AddClientModal.tsx (allowOfflineWithoutOrganization)
- features/drivers/utils/driverPartyReceivables.util.ts
- features/drivers/components/DriverSelfReceivablesPanel.tsx
- features/drivers/screens/DriverPartyReceivableScreen.tsx
- features/drivers/components/DriverCollectFromSheet.tsx
- features/drivers/screens/DriverAddClientScreen.tsx
- features/driver/components/TripDetailSettlementPanel.tsx
- features/driver/components/DriverTripHistoryDetailScreen.tsx

## Migrations
- none

## Tested
- jest driverPartyReceivables.util.test.ts (17 passed)
- TripDetailSettlementPanel.exchange.test aligned to 8081 fleet copy ("Request from fleet owner"); suite green locally
- typecheck props restored: DetailPageLayout titleAlign + AddClientModal allowOfflineWithoutOrganization
- not clicked through on production yet
