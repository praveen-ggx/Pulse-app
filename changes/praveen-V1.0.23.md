# praveen/V1.0.23

## What
- Journey Log / Manifest Pulse simulate completion time must be on or after the previous stage (same minute allowed). Invalid earlier dates/times are disabled in the picker and blocked on Confirm.
- Simulate completion time picker uses **12-hour AM/PM** (not 24-hour railway time); Journey Log stage lines already render via `formatTrackingDateTime` with `hour12: true`.
- Journey Log minute column lists **every minute 00–59** (`minuteStep={1}`), not 5-minute steps.

## Why
- Ops could save Pickup / In-Transit / Drop / Delivered with a wall-clock earlier than Assigned (e.g. Assigned 02 Nov, Driver Accepted 30 Oct), breaking chronological Journey Logs.
- Simulate Stage time control showed 17:46-style railway hours with no AM/PM.

## Clarifications
- **Initial stage (Assigned):** floor for later stages = assignment audit `changed_at` for the current driver (else trip `created_at`).
- **Same-time:** allowed (`>=` previous stage). Earlier is rejected.
- **Time format:** display/pick `hh:mm AM/PM`; stored value remains `HH:MM` 24h for validation.

## Areas
- `features/trips/utils/simulateTripStage.util.ts`
- `features/trips/components/trip-detail/SimCompletionTimeField.tsx`
- `features/trips/components/trip-detail/HardCopyPodDateField.tsx` / `HardCopyPodTimeField.tsx` (optional min + `hour12`)
- `features/trips/components/trip-detail/TripDetailScreen.tsx`
- `features/trips/utils/__tests__/simulateTripStage.util.test.ts`

## Migrations
- none

## Tested
- `npx jest features/trips/utils/__tests__/simulateTripStage.util.test.ts --ci --silent`
- UI: not clicked through
