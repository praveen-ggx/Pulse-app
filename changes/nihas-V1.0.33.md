# nihas V1.0.33

## What
- Advance Verification export: Loading/Intransit dates as `26-Oct-2026`; C Price and S Price in Excel "General" format; Source/Destination show city only; new Region column (North/South/East/West) from the source state.

## Why
- Dhira's mail "Gogopulse_Need changes in report (30.10.2026)". The Request ID change for Advance Payment in the same mail is not in this PR.

## Areas
features/tripCompliance/utils/complianceVerifiedExport.util.ts (+ its test).

## Migrations
None.

## Tested
- Full Jest 5017 passed; lint 102, cycles 92, lib-files 178, typecheck 320 (all at/below baseline); git diff --check clean.
- Not tested: a real export click on preprod/web.
