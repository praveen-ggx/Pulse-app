# praveen V1.0.12

## What
- Stop remaining Create Trip `Maximum update depth exceeded` / supplier-queue storm after client pick (on top of V1 remount fix #43).
- `useAddTripFleetResources`: no-op empty-phone / non-aggregate cleanup; de-dupe aggregate supplier fetch per org (focus still refreshes).
- `useAddTripForm`: phone / driver / vehicle setters no-op when unchanged.
- Wizard: lane-gate local state skips redundant updates.
- Review follow-up (Nihas #47): supplier fetch claims in-flight at start (one mount request); ignore late responses after org switch; clear de-dupe on failed fetch so Aggregate toggles retry; Asset focus skips supplier RPC; lane-gate parent callback only fires on change; loop tests cover render budget, single fetch, staleness, and fail-retry.
- Lane-gate sync: set `laneGateActiveRef.current` before `setLaneGateActive` so an on→off flip in one batch still reaches the parent; regression `wizardLaneGateSync.test.tsx`.

## Why
- V1 / PR #43 fixed ScrollView↔View remounts, but `useAddTripFleetResources` still called `setDriverPhoneMatches([])` (and phone setters) every effect tick. New `[]` ≠ previous `[]` under Object.is → infinite re-renders → queue full / RPC fallback spam.

## Areas
- `features/trips/components/add-trip/useAddTripFleetResources.ts`
- `features/trips/components/add-trip/useAddTripForm.ts`
- `features/trips/components/add-trip/CreateTripDesktopWizard.tsx`
- `features/trips/components/add-trip/__tests__/useAddTripFleetResources.loop.test.tsx`
- `features/trips/components/add-trip/__tests__/mobileClientLaneGate.test.tsx` (placeholder client switch)
- `features/trips/components/add-trip/__tests__/wizardLaneGateSync.test.tsx`

## Migrations
- None.

## Tested
- Jest: `useAddTripFleetResources.loop.test.tsx` + `mobileClientLaneGate.test.tsx` + `wizardLaneGateSync.test.tsx`.
- Browser click-through: Create Trip client with contract lanes; Aggregate ↔ Asset toggles; clear/re-pick client; no "Maximum update depth" in console.
