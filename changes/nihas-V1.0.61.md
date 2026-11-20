# nihas/V1.0.61

Branched from V1 `fad5ba26` on 2026-11-20. (V1.0.59 and V1.0.60 were already in use by other work.)

## What
- Saving e-way numbers writes to the row the screens read (the newest `eway_bill` row holding numbers), not to an arbitrary uploaded file row. With no numbers yet: the newest uploaded file, else the details row (unchanged).
- Removing an e-way file (Trip Detail and the Compliance screen) first moves the trip's e-way numbers off that file when it is the row holding them — onto the newest remaining e-way row, or a new details row when none remains — and only then deletes it. If the move fails, nothing is deleted.

## Why
- Prod 20 Nov, SAT812GOGTRIP002926 (Ashick): the 2nd and later e-way numbers "would not save". They were saved onto uploaded file rows, and each time that file was removed the numbers went with it (prod logs: saves at 07:43, 07:47–07:48, 07:49, 08:11 / 09:02 each followed by a delete of the same row). Only the first number, stored on the details row, survived.

## Areas
- features/trips/services/ewayBillFields.util.ts (row selection helpers)
- features/trips/services/tripDocuments.service.ts (upsertEwayBillFields target, new deleteEwayBillDocument)
- features/trips/components/trip-detail/TripDetailScreen.tsx, features/tripCompliance/components/ComplianceDocumentWorkspace.tsx (e-way removes use deleteEwayBillDocument)

## Migrations
- None.

## Tested
- Jest: ewayBillNumbersKept (save target, remove keeps numbers, refusal deletes nothing). 7 of its 8 cases fail on V1's original service.
- Existing e-way tests unchanged and passing.

## Not tested
- Click-through on preprod (web and phone): Add e-way number, Remove keeps numbers.
- Numbers already lost on prod (e.g. 002926) cannot be recovered; they must be typed again.
- Readers are unchanged on purpose: 113 prod trips show numbers from a file row that differ from their details row; they keep showing the same until next saved.
