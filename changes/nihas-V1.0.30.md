# nihas V1.0.30

## What
- Release set `clear-cancel-reason-on-award` for Praveen's migration 20271030110000 (PR #61), plus its pinning test.

## Why
- Preprod refuses a plain linked push (frozen 20271005130000), so the migration needs a named set.

## Areas
supabase/release-sets, supabase/migrations/__tests__.

## Migrations
None new (set only).

## Tested
- Set pinning + migration contract tests: 7 passed. Preprod dry-run lists exactly 20271030110000.
