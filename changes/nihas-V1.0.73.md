# nihas/V1.0.73

Branched from V1 `abc8e287` on 2026-11-23. Merged to V1 as PR #153 (`5b4885eb`).

## What
- Cross-org driver phone block now self-heals. When another org holds an unclaimed driver row for the phone, that row is ended automatically and the caller proceeds, but only if it has no live trip and no pending invite. Applies to assign driver, add driver, ensure driver row and invite driver (migration `20271123063000_release_stale_driver_phone_row.sql`, new helper `release_stale_driver_phone_row`).

## Why
- Rithwik (23 Nov): AP31TQ2999 / 9949139363 could not be assigned, "pending driver entry in another organization". Held by Sathish Trailor Service; two old trips were still open. Third manual prod release (after Sandeep, Sanjay Singh). No UI exists to release a row, so ops had to ask for SQL each time. Issue #132 option A.

## Areas
- supabase/migrations/20271123063000_release_stale_driver_phone_row.sql (assign_aggregate_trip_driver, create_driver_direct, ensure_driver_row_by_phone_insert, invite_driver)
- Claimed rows (user_id set), rows with a live trip or pending invite, and the global unique index are untouched: those still return the original error.

## Migrations
`20271123063000_release_stale_driver_phone_row.sql`. Not applied to preprod or prod. Release set added in V1.0.75.

## Tested
- Helper behaviour in a scratch Postgres with stub tables: only the stale row was released; live-trip, pending-invite, claimed and same-org rows were left alone.
- Local architecture check at `9e99e700`: lint, cycles, lib cap, V2, nav, strict typecheck passed; 3 unrelated Jest suites timed out under load and passed when re-run alone.

## Not tested
- The four functions against the real schema (preprod first).
