# vasanth hotfix DCO offline tag and collect

## What
- Tag-party lists only parties saved on this device from Add client.
- Collect loads the trip row that includes the tagged party, then writes the payment.
- Tag confirm no longer reloads the party screen out from under the sheet.

## Why
The picker was showing the fleet client directory, Collect stayed disabled, and confirming a tag looped.

## Areas
- features/drivers/components/DriverCollectFromSheet.tsx
- features/drivers/offline/driverOfflineParty.ts
- features/drivers/screens/DriverAddClientScreen.tsx
- features/drivers/screens/DriverCapturePaymentScreen.tsx
- features/drivers/screens/DriverPartyReceivableScreen.tsx
- components/mobile-input/FullscreenNumericEntry.tsx

## Migrations
- none

## Tested
- not clicked through on production yet
