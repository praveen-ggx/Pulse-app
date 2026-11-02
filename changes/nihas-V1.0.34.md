# nihas V1.0.34

## What
- Trip Asset Vault no longer shows the previous trip's files when you open a trip that has no files of its own.

## Why
- Dinesh (31 Oct): TRP001331 (Berger) showed a Trip Details picture but no e-way bill. Prod has zero trip_documents and zero storage objects for that trip. The screen only replaced its file list when the new trip had files, so the last trip's files stayed on screen.

## Areas
features/trips/components/trip-detail/hooks/useTripDetail.ts.

## Migrations
None.

## Tested
- Full Jest 5016 passed; lint 102, cycles 92, lib-files 178, typecheck 320 (all at/below baseline, 0 in the changed file); git diff --check clean.
- Not tested: reproducing trip → trip navigation in the app.
