# nihas/V1.0.75

Branched from V1 `016e3239`+`5b4885eb` (after #152, #153) on 2026-11-23.

## What
- Release set `release-stale-driver-phone-row` (migration `20271123063000`, with its sha256) so the V1.0.73 migration can be applied to preprod with `scripts/db-push-set.sh`.
- Filled in the empty sections of the V1.0.71 / V1.0.72 / V1.0.73 notes.

## Why
- `db-push-set.sh` only applies versions listed in a named release set; the V1.0.73 migration had none.

## Areas
- supabase/release-sets/release-stale-driver-phone-row.versions
- changes/nihas-V1.0.71.md, nihas-V1.0.72.md, nihas-V1.0.73.md

## Migrations
None new (the set points at `20271123063000`). Prod apply still needs the Jest pin test and Vasanth's go.

## Tested
- Set checksum matches the migration file.

## Not tested
- The set has not been dry-run or applied. No Jest pin test yet.
