# nihas/V1.0.72

Branched from V1.0.71 `48fb1171` on 2026-11-23. Merged to V1 as PR #152 (`016e3239`).

## What
- Stop `recordTripWorkflowEvent` (finance, invoicing, trip documents) from hitting `trip_workflow_events_idempotency_key_unique` on repeat saves: look up the key first, insert only if missing. The 23505 catch stays as a race fallback.

## Why
- Prod Postgres logs showed repeated 23505 errors on that index whenever a finance, invoice or document save was repeated. The app swallowed the error, but Postgres logged it every time.

## Areas
- features/trips/services/tripWorkflow.service.ts (+ test in features/trips/services/__tests__/tripWorkflow.service.test.ts)

## Migrations
None.

## Tested
- New unit tests for both paths; local architecture check (`scripts/ci-local.sh`, 7 jobs) passed at `95b01a3d`.

## Not tested
- Prod behaviour. After release, the 23505 errors for this index should stop in prod Postgres logs.
