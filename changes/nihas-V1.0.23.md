# nihas V1.0.23 — Driver licence: accept Telangana smart cards with a letter suffix

## What broke / root cause
- Rithwik (Slack, 23 and 28 Oct) could not add driver NAGESH K: licence `DLFAP029126912005OD` (Telangana smart card). The "Old card" rule accepted `DLF + 2 letters + 9-13 digits` with no trailing letters, and the Old card input was capped at 18 characters, so the second "D" was cut off and Continue showed "Use a valid DL number".

## What
- Smart-card rule now allows up to 3 trailing letters (same as the old slash-card rule already did).
- Old card input cap 18 → 21 (DLF + 2 letters + 13 digits + 3 letters); the keypad uses the same constant from the util. Hint example updated.

## Areas
- lib/indianDrivingLicenseInput.util.ts, components/party/keypad/IndianDrivingLicenseKeypadFlow.tsx, lib/__tests__/indianDrivingLicenseLength.test.ts.

## Migrations
- None (drivers.license_number is plain text, no DB check).

## Tested
- New Jest cases with the reported number; full Jest, navigation-policy, ci-baseline in a clean worktree. Not clicked through on gx-pulse yet.

## Baseline
- After syncing prod into V1 (#51): typecheck 350 → 325; ci-baseline lowered.
