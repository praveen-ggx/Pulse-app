# nihas/V1.0.55

Integration branch for gowtham V1.0.39 (#114, Compliance + Trips export fixes), built from Gowtham's commits (authorship kept) with V1 `c758d407` merged in.

## What
- Trip Report export: the supplier-name map passed to `buildTripHubPartyMetaByTripId` now uses the string map `supplierNameById` (plus names fetched for suppliers the screen has not loaded), and the supplier list is `suppliersForHubParty`, the same inputs the on-screen hub uses.
- Everything else is Gowtham's #114 unchanged, including the ETA column removal (19 columns), as decided on 2026-11-18.

## Why
- #114 spread `supplierNameFallbackById` (supplier row objects) into the name map, so a supplier found through that fallback got an object instead of a name, and typecheck rose to 345 (baseline 344).

## Areas
- features/trips/screens/TripsScreen.tsx

## Migrations
- None

## Tested
- See PR description (local gates on this branch).

## Not tested
- Not clicked through on gx-pulse.
