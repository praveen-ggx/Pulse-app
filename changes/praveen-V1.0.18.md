# praveen V1.0.18

## What
- Manifest Management e-way bill: each trip’s uploaded image stays scoped to that trip. Empty table/bundle loads no longer keep the previous trip’s vault files, and vault cards filter by `trip_id`.
- Trip Details LR card: add a top-right download icon (shop card only) that saves the on-file LR without changing layout, View/Add, or other vault slots.
- Driver POD card: same top-right download icon when a POD file is on file; hidden while pending / awaiting upload.

## Why
- Opening trip B after uploading an e-way image on trip A showed A’s file as “On file” even when B had zero `trip_documents` rows: light bundle `documents: []` and empty table reads kept `prev` vault state across navigation.
- Ops needed a one-tap download for on-file LR and Driver POD without opening the full preview or changing the vault card layout.

## Areas
- `features/trips/utils/tripDocumentsScope.util.ts`
- `features/trips/utils/tripDocumentDownload.util.ts`
- `features/trips/utils/__tests__/tripDocumentsScope.util.test.ts`
- `features/trips/components/trip-detail/hooks/useTripDetail.ts`
- `features/trips/components/trip-detail/VaultChooserNotifyRow.tsx`
- `features/trips/components/trip-detail/TripDetailScreen.tsx`

## Migrations
- none

## Tested
- Jest: `tripDocumentsScope.util.test.ts` (7/7)
- Preprod: TRP001937 had zero `eway_bill` rows while UI showed On file — confirms stale client vault, not shared storage paths
- not clicked through UI after this commit
