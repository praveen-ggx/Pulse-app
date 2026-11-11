# vasanth V1.0.20 — stop two avoidable Postgres 23505 errors

## What
- POD validation events in `trip_workflow_events` now update the existing row first and insert only when none matches. The advance document-cost event checks before inserting.
- `createVehicle` checks `(organization_id, vehicle_number)` before inserting, and returns the same "already added" message.

## Why
Both paths relied on a unique-constraint violation (23505) as normal control flow, so every repeat save or repeat number logged an error in prod Postgres (2026-11-11 log export). The `trip_workflow_events` unique index is partial (`WHERE idempotency_key IS NOT NULL`), so a PostgREST `on_conflict` upsert can't target it without a schema change.

## Areas
- features/debit-control/services/debitControlPod.service.ts
- features/vehicles/services/vehicles.service.ts
- features/debit-control/services/__tests__/debitControlPod.service.test.ts (mock now follows the update-first chain)

## Migrations
None.

## Tested
- `npx jest features/debit-control features/vehicles`: 69/69 pass.
- `tsc --noEmit`: no errors in changed files. ESLint clean on changed files.
- The concurrent-insert race still falls back to the 23505 → update path, so behaviour is unchanged when two saves collide.
