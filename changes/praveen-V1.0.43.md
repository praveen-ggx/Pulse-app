# praveen/V1.0.43

## What
- Ground Ops Simulate Trip (Reached Pickup / Start Trip) shows the same date and time picker as Trip Ops Journey Log Simulate Stage.
- The selected stage date and time is saved on the trip (BISIM note + `started_at` for Pickup) and shown on Manifest Pulse as selected.
- Activity Log for Ground Ops (and Trip Ops) simulations records who, the actual edit time, the action (e.g. simulated pickup), and Stage time for the picker value — not a generic "edited this trip" row.
- Ground Ops can simulate Reached Pickup / Start Trip but no longer sees or can use Undo / Revoke Last; Trip Ops Revoke Last is unchanged.
- Ground Ops Manifest Pulse hides the yellow “Business simulated · …” badge; Trip Ops still shows it.
- Manifest Pulse (Ground Ops and Trip Ops) keeps picker Stage time on the right and last editor + actual save time under the stage; Journey status audits feed that split.

## Why
- Ground Ops previously stamped wall-clock `now()` with no picker, so Pickup time on Journey Log did not match the intended stage time Trip Ops can set.
- After simulate, Activity showed a generic trip edit without the actor or stage clock.
- Ground Ops should not be able to reverse a simulation once it is recorded.

## Areas
- `features/trips/components/trip-detail/TripDetailScreen.tsx`
- `features/trips/components/trip-detail/TripAuditLogPanel.tsx`
- `features/trips/services/groundOpsPickup.service.ts`
- `features/trips/services/tripStatusTimes.service.ts`
- `features/trips/utils/simulateTripStage.util.ts`
- `features/trips/utils/manifestJourneyLog.util.ts`
- `features/trips/utils/__tests__/manifestJourneyLog.util.test.ts`
- `lib/trips/buildTripAuditLog.util.ts`
- `lib/database.types.ts`
- `supabase/migrations/20271123101500_ground_ops_pickup_event_at.sql`
- `features/trips/services/__tests__/groundOpsPickup.eventAt.migration.contract.test.ts`
- `features/trips/services/__tests__/groundOpsPickup.revokeBlocked.test.ts`
- `features/trips/utils/__tests__/groundOpsSimulateFlow.e2e.test.ts`
- `lib/trips/__tests__/buildTripAuditLog.compliance.test.ts`
- `features/trips/utils/__tests__/simulateTripStage.util.test.ts`

## Migrations
- `20271123101500_ground_ops_pickup_event_at.sql` — optional `p_event_at` on `simulate_ground_ops_pickup_status`; BISIM stage clock + editedAt; ISO built by concat (SQL Editor-safe). **Preprod already has this function via SQL Editor.** After merge, record history: `supabase migration repair --status applied 20271123101500 --linked` so the next push does not recreate it. Do not re-apply the SQL if the live def already matches.

## Tested
- Local (GitHub billing off — no remote CI): lint 48≤98, cycles 94≤94, lib-files 178≤178, nav-policy 69 pass, `git diff --check` clean. Full `npx jest --ci --silent`: all Ground Ops suites in this PR pass; remaining failures are pre-existing release-set/contract suites unrelated to this diff.
- Ground Ops util suites + migration contract + revoke block
- Preprod RPC checked after Nihas re-ran: `p_event_at` + `v_edited_iso` + concat ISO (no curly quotes in executable path). `schema_migrations` still missing `20271123101500` until repair.
- Ground Ops Simulate Trip picker / Activity / Journey on device: not clicked through
