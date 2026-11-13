# praveen/V1.0.37

## What
- After In Transit is revoked, a new Pickup date and time is the only reference for the next In Transit simulation.
- The completion picker no longer keeps the previous In Transit instant, and dates before the updated Pickup are not selectable.
- Active Pickup notes are rewritten to that new instant. The revoked In Transit line is left as-is.

## Why
- Revoke returned the trip to Pickup, but the date floor still used the latest stored timestamp. An older Pickup line, or the revoked In Transit time, stayed ahead of the Pickup the user had just saved.

## Areas
- `features/trips/utils/simulateTripStage.util.ts`
- `features/trips/components/trip-detail/TripDetailScreen.tsx`
- `features/trips/components/trip-detail/SimCompletionTimeField.tsx`
- `features/trips/utils/__tests__/simulateTripStage.util.test.ts`
- `features/trips/utils/__tests__/manifestJourneyLog.util.test.ts`

## Migrations
- None

## Tested
- `npx jest features/trips/utils/__tests__/simulateTripStage.util.test.ts features/trips/utils/__tests__/manifestJourneyLog.util.test.ts --ci --no-coverage`
- UI: not clicked through
