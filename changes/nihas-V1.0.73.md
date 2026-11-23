# nihas/V1.0.73

Branched from V1 `abc8e287` on 2026-11-23.

## What
- Cross-org driver phone block now self-heals. When another org holds an unclaimed driver row for the phone, that row is ended automatically and the caller proceeds, but only if it has no live trip and no pending invite. Applies to assign driver, add driver, ensure driver row and invite driver (migration `20271123063000_release_stale_driver_phone_row.sql`, new helper `release_stale_driver_phone_row`).

## Why
- Rithwik (23 Nov): AP31TQ2999 / 9949139363 could not be assigned, "pending driver entry in another organization". Held by Sathish Trailor Service; two old trips were still open. Third manual prod release (after Sandeep, Sanjay Singh). No UI exists to release a row, so ops had to ask for SQL each time. Issue #132 option A.

## Not changed
- Claimed rows (user_id set), rows with a live trip or pending invite, and the global unique index are untouched: those still return the original error.
- Tested only in a scratch Postgres with stub tables (helper behaviour). Full functions not run against a real schema; not applied to preprod or prod.
