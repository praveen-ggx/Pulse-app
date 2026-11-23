# nihas/V1.0.79

Branched from V1 `f7d6b977` on 2026-11-23.

## What
- Rebuilt migration `20271123063000_release_stale_driver_phone_row.sql` (V1.0.73) from the CURRENT PROD function definitions. The four function bodies are now byte-identical to prod except for the one added helper call each.
- Set `release-stale-driver-phone-row` sha updated to the new file.

## Why
- Pre-release audit found the V1.0.73 migration had been built from the 2027-03-10 migration files. Prod's `assign_aggregate_trip_driver` and `invite_driver` were later changed by ADR-010 (`is_org_staff` gates, applied as prod migration `20270915103200 adr010_staff_rpc_gates`, which has no file in this repo). Applying the old bodies would have reverted those two gates to `is_org_member` (any org member, not only staff) and dropped other prod drift in `invite_driver`. It was applied that way on preprod on 2026-11-23; preprod needs the corrected SQL re-run. Prod never had it.

## Areas
- supabase/migrations/20271123063000_release_stale_driver_phone_row.sql
- supabase/release-sets/release-stale-driver-phone-row.versions

## Migrations
Edited `20271123063000` (not on prod). Preprod already has this version in history, so the corrected SQL must be run on preprod directly (CREATE OR REPLACE, idempotent). Not applied anywhere by this PR.

## Tested
- Each of the 4 function bodies compared to the prod definitions saved 2026-11-23: exact match except the helper call. Corrected file applied in a scratch Postgres (stubs): all 5 functions created.
- Set pin tests pass.

## Not tested
- Preprod re-apply and the click tests of the driver phone release.
