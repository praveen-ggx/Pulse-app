# nihas V1.0.20 — Supabase client typed with the generated Database types (honest typecheck baseline 408)

## What broke / root cause
- `lib/supabase.ts` created the client without the `Database` generic, so every query, insert, update and RPC result was loosely typed (`any`) and `lib/database.types.ts` checked nothing. Typecheck showed 99 errors while hiding the real mismatches.

## What
- `createClient<Database>` and `SupabaseClient<Database>` in `lib/supabase.ts`. No runtime change.
- `.github/ci-baseline.json` typecheck 99 → 408 (unmasked count). No exposed errors fixed in this PR; they are burned down in later PRs by business risk.
- Found while measuring: 8 RPCs called by the app do not exist on prod at all (read-only `pg_proc` check 2026-10-27): attach_driver_by_contact, claim_trip_creator, get_current_organization_id, get_trip_driver_online_state, increment_post_view_count, log_activity, manual_advance_trip, submit_network_pool_quote.

## Areas
- lib/supabase.ts, .github/ci-baseline.json.

## Migrations
- None.

## Tested
- ci-baseline typecheck 408 (8 GB heap, clean worktree, ~2.5 min) / lint 146 / cycles 92 / lib-files 179, full Jest (4615 passed), navigation-policy (64).
