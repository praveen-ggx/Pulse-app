# praveen/V1.0.33

## What
- Journey Log **Assigned**: always from assignment/reassignment audit (or stable `created_at`). Never `updated_at`, so Revoke Last / simulate cannot rewrite Assigned to “now”.
- Journey Log **Driver Accepted**: from accept audit, unrevoked accept-sim, or post-assign GPS only. Never `started_at` (Pickup) or `updated_at`.
- **Pickup**: manual past or future date/time, no floor from Assigned/Accepted.
- **In-transit → Delivered**: completion picker floored to the **next minute after** the previous stage (Pickup-only floor; later accept cannot block a past Pickup).
- Simulate Confirm saves the **controlled picker value** (sync ref + state) into BISIM + `started_at` as one instant; BISIM timestamp is force-aligned to that instant.
- Journey Log Pickup header / badge / history prefer `started_at` (picker) over a stale BISIM click-time.
- Web: date/time pickers portal above Simulate modal; hub LR chip avoids nested `<button>`.

## Why
- Revoke was bumping trip `updated_at`, and Assigned fell back to that — looking like Assigned “reset to today”.
- Driver Accepted was borrowing Pickup `started_at`, so accept showed the loading time (and could sit before Assigned).

## Areas
- `features/trips/utils/simulateTripStage.util.ts`
- `features/trips/utils/manifestJourneyLog.util.ts`
- `features/trips/components/trip-detail/TripDetailScreen.tsx`
- `features/trips/components/trip-detail/HardCopyPodDateField.tsx` / `HardCopyPodTimeField.tsx`
- `features/trips/components/TripsHubMobileTripCard.tsx`
- `features/trips/utils/__tests__/simulateTripStage.util.test.ts`
- `features/trips/utils/__tests__/manifestJourneyLog.util.test.ts`
- `changes/praveen-V1.0.33.md`

## Migrations
- none

## Tested
- `npx jest features/trips/utils/__tests__/simulateTripStage.util.test.ts features/trips/utils/__tests__/manifestJourneyLog.util.test.ts --ci --silent`
- UI: not clicked through
