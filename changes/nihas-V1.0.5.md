# nihas V1.0.5 — Licence and vehicle number: strict by default, extra formats on pick

## What
- Licence and vehicle-number entry is strict again (same rule as production): standard licence TN01 20200001234, standard plate TN 17 AS 2202 / TN 18 D 2522. Gowtham's "any letters and numbers" rule (PR #14) is reverted.
- New format picker above the licence and vehicle-number fields. Pick "Letter after RTO" to enter a licence like TN29 Z19940001713; pick "No series letter" to enter a plate like KA 56 6088. Standard stays the default.
- Where: add driver / add vehicle (party registration, desktop and mobile keypad), load allocation (aggregate step), add trip tracking step, trip assign / reassign wizard. Add Driver modal and driver registration accept both licence formats.

## Why
- Vasanth: keep the strict rule so junk numbers can't be saved; allow other real formats only when the user picks them.
- Real numbers seen: licence TN29Z19940001713, truck KA566088 — both were blocked by the strict rule.

## Migrations
- None

## Tested
- Full jest 515 suites pass (new indianInputFormats.test.ts; old TN091234-invalid case moved since it is now the opt-in format). ci-baseline lint 104, typecheck 64 (≤89), cycles 111, lib-files 178; navigation-policy 64 pass; git diff --check clean. Not clicked through in the UI.
