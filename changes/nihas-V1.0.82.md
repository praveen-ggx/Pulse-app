# nihas/V1.0.82

Branched from V1 `967a2753` on 2026-11-24.

## What
- An e-way card whose number has no document of its own shows no image (with Upload) instead of the trip's first e-way image. Trips whose e-way slot has no separate file list keep showing that slot file, as before.
- "Add e-way number" now requires the e-way bill's own document: the form has a required "E-way bill document" field, Save stays off until a file is chosen, and Save uploads the file and adds the number linked to it in one step (`addEwayBillWithFile`, which re-reads the list first so other changes are kept). Edit on a card that already has its file does not ask for a document.

## Why
- Preprod 24 Nov, SAT812GOGTRIP002240 (Ashick): after V1.0.80 the 2nd+ e-way numbers saved, but e-way bills 3 and 4 (added by number only) showed bill 1's image, so it looked like the first image was copied onto them. Stored data was correct (each number linked to its own file or none); preprod logs show no image upload for that trip that day. Rule agreed with Nihas: after entering a new e-way number, its document must be uploaded.

## Areas
- features/trips/services/ewayBillFields.util.ts (no borrowed slot image for number-only cards)
- features/trips/services/tripDocuments.service.ts (addEwayBillWithFile)
- features/trips/components/trip-detail/EwayBillVaultTab.tsx (required document on add)
- features/trips/components/trip-detail/TripDetailScreen.tsx, TripMobileVaultPanel.tsx, TripVaultCardGrid.tsx, TripAssetVaultPanel.tsx (pass the add-with-document handler)

## Migrations
- None.

## Tested
- Jest: ewayBillNewEntryDocument (002240 display — fails on V1's original builder; single-file slot unchanged; add uploads + links and keeps other numbers; upload failure adds nothing; saved-file-but-not-number message).
- Jest: EwayBillAddRequiresDocument (Save off without a document; chosen file and number go to the add handler together; Edit on a card with its file does not ask for one).

## Not tested
- Click-through on preprod (web and phone): Add e-way number with a document, a card without a document showing no image, Upload on it.
- Existing number-only e-way bills (e.g. 002240 bills 3 and 4) still need their documents uploaded with Upload on their cards.
- Ground Ops on a locked trip cannot add another e-way file (existing database rule), so Add e-way number fails there with that message.
