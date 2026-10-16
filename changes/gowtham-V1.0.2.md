# gowtham V1.0.2 — Licence and vehicle number fields accept letters and numbers

## What
- Add Driver (load allocation → add driver): the driving licence field now accepts letters, numbers, spaces, "-" and "/" anywhere, not only letters in the first 2 characters.
- Licence and vehicle-number entry is now free alphanumeric everywhere (all add-driver and add-vehicle forms, trip create / assign / reassign, supplier panels, step-by-step keypads): licence = 6–20 letters / digits / "/", vehicle number = 4–12 letters / digits. The step-by-step licence keypad gets the same ABC/123 toggle as the vehicle keypad.
- Review fixes: minimum length raised to 6 for vehicle numbers and 10 for licences (still any letters / numbers); the licence keypad gets a "/" key (on-screen and desktop keyboard).

## Why
- Real licence numbers don't all follow TN01 20200001234 (older and some state formats have letters or "/" later in the number), so typing them was blocked.
- Same problem for vehicle numbers: BH-series (22 BH 1234 AB), older and 3-letter-series plates were blocked by the fixed AA 00 A(A) 0000 mask.
- Review on #14: a 4-char plate / 6-char licence unlocked Continue, so half-typed values (e.g. "TN17") could create junk or duplicate vehicles.

## Areas
- features/finance/components/PartyRegistrationPortal.tsx (driver licence input + its validation only).
- Shared rules in lib/indianDrivingLicenseInput.util.ts, lib/indianVehicleInput.util.ts, lib/format.ts (12-char cap), lib/validation.ts (message); driver screens AddDriverModal, DriverRegistrationPortalFlow, PartyRegistrationPortal now use the shared licence check; keypads IndianDrivingLicenseKeypadFlow, IndianVehicleRegistrationKeypadFlow; hint text in PartyDriverMobileWizard.
- Review fixes: minimums in lib/indianVehicleInput.util.ts and lib/indianDrivingLicenseInput.util.ts, lib/validation.ts (licence min/max now from the shared rule), optional "/" key in IndianVehicleRegistrationKeypad + useIndianVehiclePhysicalKeypad (licence keypad only), two blank lines removed in PartyRegistrationPortal.

## Migrations
- None (no database format constraints on vehicle_number / license_number).

## Tested
- eslint on the file (0 errors), typecheck baseline (64 ≤ 89), jest indianDrivingLicenseLength (pass). Not clicked through in the UI.
- Updated + extended lib/__tests__ indianVehiclePlate and indianDrivingLicenseLength (82 pass). ci-baseline lint 104/104, typecheck 64/89, cycles 111/111, lib-files 178/178; full jest 514 suites pass; test:navigation-policy 64 pass; git diff --check clean. Not clicked through in the UI.
- Review fixes: plate / licence tests updated (88 pass); ci-baseline lint 104/104, typecheck 64/89, cycles 111/111, lib-files 178/178; full jest 514 suites pass; test:navigation-policy 64 pass; git diff --check clean. Not clicked through in the UI.
