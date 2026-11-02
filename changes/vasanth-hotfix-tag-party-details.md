# vasanth hotfix tag party details

## What
- Tag-party picker shows Self avatars and party details, asks for the collection receivable, and the Add Client back button leaves the screen.

## Why
Production Self tagging opened the amount step behind the sheet, printed linked ids, and the Add Client back control did nothing.

## Areas
- features/drivers/components/DriverCollectFromSheet.tsx
- features/drivers/components/DriverTagPartyDialogs.tsx
- features/drivers/screens/DriverAddClientScreen.tsx
- features/drivers/utils/driverPartyAvatar.util.ts
- features/drivers/utils/driverPartyTagRecommend.util.ts
- components/mobile-input/NumericEntryPartyBanner.tsx
- components/mobile-input/NumericEntryRecipientHero.tsx

## Migrations
- none

## Tested
- driverPartyTagRecommend.util.test.ts passed locally
- not clicked through on production yet
