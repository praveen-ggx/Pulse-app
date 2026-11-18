# nihas/V1.0.56

Integration branch for praveen V1.0.41 (#124, sales report dates, creator and IDs), built from Praveen's commit (authorship kept), merged with the #114 integration (nihas/V1.0.55) and V1.

## What
- Merge: resolved #124's conflicts with V1/#114. The Trip Report export uses one `partyMetaForExport()` helper (#114's supplier-name lookup) for both the Trip Ops trips and #124's sales trips.
- Type fix: the sales-window `readAllPages` callback awaits the query and returns `{ data, error }`, like the other callers (typecheck was 345 vs baseline 344).

- Align fix: the sales download preview right-aligns money columns by key; #124 renamed them to `customerPrice` / `supplierPrice`, so the check now uses those names (was `clientCost` / `supplierCost`, typecheck +2).
## Why
- #124 conflicted with V1 in `tripIndentReport.service.ts` and `TripsScreen.tsx`, and returned a Postgrest builder where `readAllPages` expects a result.
- Sales report party meta must come from the sales window, not the hub catalog.

## Areas
- features/trips/screens/TripsScreen.tsx
- features/trips/services/tripIndentReport.service.ts

## Migrations
- None

## Tested
- See PR description (local gates on this branch).

## Not tested
- Not clicked through on gx-pulse. `loadSupplierNamesById` in #124 is kept (it reports lookup failures as warnings; #114's helper does not).
