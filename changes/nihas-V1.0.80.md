# nihas/V1.0.80

Branched from V1 `23dd893b` on 2026-11-24. E-way bill lifecycle audit: every create / read / update / delete path checked against prod data; each fix below was a real defect.

## What
- Edit on an e-way card that has an image but no number now adds that number. It used to "save" without it: the editor only replaced an entry at the card's position, and there was none, so the typed details were dropped with no error.
- Each e-way number remembers its image (`filePath` in the stored entry). Saving pins every number to the image it is shown with, so cards filled out of order stay right, a new upload no longer pulls an old number onto the new image (cards are newest first), and a number whose image is removed keeps its own card. Numbers never saved since keep matching by position, as before.
- Saving the list clears older copies of it left on other e-way rows (plain single numbers are kept). Those copies made the Trips hub tags / expiry badge show changed or removed numbers.
- When the database refuses the save on the list's row (Ground Ops on a locked trip may only change their own recent upload), the list is written to the newest e-way row instead, so it still shows.
- Trips hub update sheet (e-way): numbers typed per image now go into the trip's one list, linked to that image, instead of onto the file rows (where one plain number hid the whole list from Trip Detail / Compliance). The sheet shows each image's number from the list and no longer lists the details row (fields.json) as an image.
- e-LR prefill takes the e-way number from the trip's current list; rows used to be read in no order, so an older copy could win.
- Compliance review thumbnails show each e-way image's own number (they showed the list's first number on one image and nothing on the others).
- Upload pressed on a card that has a number but no image attaches the new image to that number (re-read from the database first, so a save made meanwhile is not overwritten).

## Why
- Prod 23–24 Nov, SAT812GOGTRIP003016 (Ashick): three e-way images, only the first number saved. Prod logs show a successful save at 11:13 on 23 Nov that left the stored list unchanged. Reproduced on V1's original code: Edit on card 2 saved `["272334573679"]` only.
- Prod read-only counts (24 Nov): 5 trips where the hub tags show numbers not in the current list; 13 active trips holding more than one copy of the list; 2 trips with hub plain numbers, 1 of them hiding the list.

## Areas
- features/trips/services/ewayBillFields.util.ts (file link, pairing, pinning, per-file entry map, hub merge, list-copy helpers)
- features/trips/services/tripDocuments.service.ts (upsertEwayBillFields: clear old copies, fallback row; saveEwayNumbersByFile; linkEwayEntryToFile)
- features/trips/services/elrPrefill.service.ts
- features/trips/components/trip-detail/EwayBillVaultTab.tsx, TripDetailScreen.tsx (card Upload link)
- features/trips/components/HubTripLrUpdateModal.tsx
- features/tripCompliance/components/ComplianceDocumentWorkspace.tsx (thumbnail captions)

## Migrations
- None.

## Tested
- Jest: ewayBillEntryFileLink (003016 round trip, out-of-order cards, links and order kept, pinning against a new upload, old entries by position, removed image, Add e-way number, nextEwayEntries); ewayBillLifecycleAudit (old copies cleared / plain numbers kept, e-LR prefill, per-file map, hub merge and save, card Upload link and its refusal, refused-row fallback). The old-copy and prefill cases fail on V1's original service.
- ewayBillFields.util: two expectations updated on purpose — rows carry `fileStoragePath`, and a file card with no entry has `entryIndex: -1` (the old `1` pointed at a missing entry, which is the bug).

## Not tested
- Click-through on preprod / prod: Edit on the 2nd and 3rd e-way cards, cards out of order, a new upload after saving, Remove an image, Trips hub update sheet for e-way, card Upload on a number without an image.
- The 5 trips whose hub tags show old numbers are corrected on their next e-way save; no data script here.
- Not changed: the editor still cannot remove a trip's last e-way number (Remove shows only with 2+); the hub tag query has no upload time, so it relies on old copies being cleared.
