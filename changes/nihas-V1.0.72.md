# nihas/V1.0.72

Branched from V1.0.71 `48fb1171` on 2026-11-23.

## What
- Stop `recordTripWorkflowEvent` (finance, invoicing, trip documents) from hitting `trip_workflow_events_idempotency_key_unique` on repeat saves: look up the key first, insert only if missing. The 23505 catch stays as a race fallback.
