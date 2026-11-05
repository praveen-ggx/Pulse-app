# praveen/V1.0.26

## What
- Trip Ops structural search treats **LR number** like Trip ID / Indent ID / Vehicle: identify the trip, highlight its owning stage, show only that trip under that stage, keep all other stage tabs visible with count **0**, and never auto-navigate.

## Why
- Searching an LR (e.g. AH2752 / AI1050) left mode `off`, so rail counts stayed unfiltered (Live Indents 211, etc.) and Live Indents could show “No matching indent” even when `search_trips_for_org` had already matched the trip via `trip_documents`.

## Areas
- `features/trips/utils/hubSearchScopedCounts.util.ts` — structural mode `lr`, scoped counts, trip/indent filters
- `features/trips/utils/tripHubSearch.util.ts` — `scoreTripLrHubSearchMatch`
- `features/trips/utils/tripHubSearchStage.util.ts` — collect matches with LR labels + provisional server hits
- `features/trips/screens/TripsScreen.tsx` — wire hydrated LR labels + `hubSearchHitIds`; highlight for `lr`
- Tests under `features/trips/utils/__tests__/`

## Migrations
- none

## Tested
- `npx jest features/trips/utils/__tests__/hubSearchScopedCounts.util.test.ts features/trips/utils/__tests__/tripHubSearch.util.test.ts features/trips/utils/__tests__/tripHubSearchStage.util.test.ts --ci --silent`
- UI: not clicked through
