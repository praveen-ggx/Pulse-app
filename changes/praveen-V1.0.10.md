# praveen V1.0.10

## What
- Mobile Create Trip (`/add-trip`): stop contract-lane gate flicker that remounted the wizard and restarted supplier fetches (`getSuppliersByOrganization` storm / queue reject / Maximum update depth).
- `FullPageWizardShell`: keep one `ScrollView` body host; scroll vs keypad is props only (no `ScrollView` ↔ `View` swap).
- Client step: keep lane gate up from `contractLanes.length > 0 || clientHasContracts` (and loading/placeholder); clear `laneGateActive` when the client is cleared, not on every remount/unmount.
- Wizard passes `isPlaceholderData` so the previous client's lanes do not count as this client's contracts.
- Regression: `mobileClientLaneGate.test.tsx` (shell remount, with/without lanes, client clear).

## Why
- Selecting a client with contract lanes on mobile flipped `laneGateActive` true→false→true. That swapped the shell host, remounted the wizard, wiped sticky contract state, and re-ran fleet/supplier fetches in a loop.

## Areas
- `components/full-page-wizard/FullPageWizardShell.tsx`
- `features/trips/components/add-trip/CreateTripDesktopClientStep.tsx`
- `features/trips/components/add-trip/CreateTripDesktopWizard.tsx`
- `features/trips/components/add-trip/__tests__/mobileClientLaneGate.test.tsx`

## Migrations
- None.

## Tested
- `npx jest features/trips/components/add-trip/__tests__/mobileClientLaneGate.test.tsx --no-coverage`: 4/4 pass.
- ESLint clean on the four files above; no new tsc errors in those files.
- Browser click-through of client with/without lanes at 393×581 and ≥1080: confirmed fixed after sign-in.
