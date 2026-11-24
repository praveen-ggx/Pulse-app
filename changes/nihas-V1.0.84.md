# nihas/V1.0.84

Branched from V1 `c21ae5c8` on 2026-11-24.

## What
- Journey Log Simulate (Trip Ops) and Ground Ops Simulate Trip: no stage date/time can be later than now. Future days and times are disabled in the picker, and Confirm refuses a future time. Any past date stays allowed (Ops record trips after the fact).
- Stages stay in order as before (each stage at least 1 minute after the previous one in the app). If the previous stage was saved in the future before this rule, the dialog names that stage (Reached Pickup / In Transit / At Drop) with its time, says how to correct it (Trip Ops: Revoke Last; Ground Ops: ask Trip Ops), and keeps Confirm off until it is corrected.
- Phone (iOS / Android) time picker: a future time snaps back to now, same result as web (where later times are greyed out). Earlier-than-previous-stage picks keep the existing behaviour.
- Database (Ground Ops path, migration `20271124104457_ground_ops_stage_time_window`): when the app sends a stage time, Reached Pickup and Start Trip are refused if more than 5 minutes in the future (device clock drift), and Start Trip is refused if its minute is earlier than the recorded Reached Pickup minute (same minute allowed; skipped when no pickup time is recorded). Older apps that send no time keep using now(). All existing role, warehouse, status and document checks unchanged. `SET LOCAL lock_timeout` (repo convention), so it does not carry into later files of the same push.

## Why
- Vasanth's review of release prod-2026-11-23 (PR #144): the Ground Ops stage time was not range-checked on the server. Rule agreed with Nihas: past open, no future, stages in order.

## Areas
- features/trips/components/trip-detail/SimCompletionTimeField.tsx, HardCopyPodDateField.tsx, HardCopyPodTimeField.tsx (optional max date/time)
- features/trips/components/trip-detail/TripDetailScreen.tsx (both Simulate dialogs)
- features/trips/utils/simulateTripStage.util.ts (future-time helpers)
- supabase/migrations/20271124104457_ground_ops_stage_time_window.sql, release set ground-ops-stage-time-window

## Migrations
- `20271124104457_ground_ops_stage_time_window.sql` (replaces `simulate_ground_ops_pickup_status`; must run after `20271123101500`). Release set `ground-ops-stage-time-window`. Not applied to preprod or prod.

## Tested
- Jest: simulateStageTimeWindow (future blocked, past open, stage order, previous stage in the future named per stage and cleared after correction), SimCompletionTimeFieldMax (future day/time snaps to now; fails on V1's original field), HardCopyPodFieldsMaxNative (iOS + Android: future time snaps to now, earlier allowed time kept, below-floor still ignored, latest day passed to the date picker; snap cases fail on the earlier ignore behaviour), groundOpsStageTimeWindowReleaseSet (set pin, base checks unchanged, no created_at floor, SET LOCAL).
- Rollback on local Postgres 17: old (20271123101500) → new → old, each file in one transaction like the CLI. Restored function identical to the original (signature, SECURITY DEFINER, search_path, grants, definition md5), one overload, behaviour back to original. Session `SET` leaked 5s lock_timeout after the file; `SET LOCAL` did not.
- Local Postgres 17 with stub tables: base + new migration applied (and re-applied); 20 cases — future pickup refused, 4 min ahead allowed, 6 min refused, 78 days / 2 years back allowed, Start Trip before pickup refused (with IST time), same minute allowed, re-saved pickup used, garbage note falls back to started_at, old-app NULL path unchanged, existing status/member checks still refuse.

## Not tested
- Click-through on preprod (web and phone) for both Trip Ops and Ground Ops dialogs. The Confirm-off state is wired in TripDetailScreen; its rule is unit-tested, the screen itself is not.
- Trip Ops writes stage times from the app (no server function), so for Trip Ops the rule is enforced in the app only.
- Prod observation (read-only, 24 Nov, not changed here): 1 completed trip has started_at in the future and 6 completed trips have completed_at in the future; no active trip has a future stage time.
