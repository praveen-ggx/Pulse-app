# praveen/V1.0.38

## What
- Trip Details Invoice uses the same download icon as LR.
- One invoice saves as that file. Two or more save as `Invoices.zip` containing every attached invoice, with unique names so none are overwritten or skipped.
- If any invoice cannot be read, nothing is saved.

## Why
- The Invoice card had no download. Saving each file from the same click kept only the first, because the browser accepts one download per click.

## Areas
- `features/trips/components/trip-detail/TripDetailScreen.tsx`
- `features/trips/utils/tripDocumentDownload.util.ts`
- `features/trips/utils/__tests__/tripDocumentDownload.util.test.ts`

## Migrations
- None

## Tested
- `npx jest features/trips/utils/__tests__/tripDocumentDownload.util.test.ts --ci --no-coverage`
- UI: not clicked through
