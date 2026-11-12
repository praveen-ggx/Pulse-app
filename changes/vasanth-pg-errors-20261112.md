# vasanth pg-errors-20261112: clear app-caused errors from the 2026-11-12 Postgres log

## What
- Brings in 9fdc4527 (built on 2026-11-11 for nihas PR #104, never merged into V1.0.1). It makes POD validation events update-first, has the advance document-cost event check before inserting, and pre-checks vehicle numbers.
- `recordTripWorkflowEvent` checks for an existing singleton event (`trip.completed`, `pod.uploaded`, ...) before inserting.
- The Compliance Trip Activity ledger query stops selecting `vehicle_number` / `driver_name`, which don't exist on `transactions` (42703, empty ledger tab). `toLedgerRow` already reads them from description meta.
- `deleteTripDocument` refuses an approved (`verified`) document before calling the database. It also writes the "deleted" audit row only after the row is actually gone. Before this, a refused delete still showed as "deleted" in Trip Activity.

## Why
The 2026-11-12 05:05–05:57 UTC log export had these errors:
- 10× 23505 `trip_workflow_events_idempotency_key_unique`
- 4× 42703 `transactions.vehicle_number`
- 1× 42501 `approved documents cannot be deleted`

All three were app-caused.

## Not changed (classified)
- 57014 / 25P03 bursts (05:05, 05:52–05:55): host-stall symptoms. The 5s idle-in-transaction limit is deliberate.
- 42501 on `count_org_hub_metrics` / `list_org_hub_trips_keyset` / `discover_organizations`: anon calls in the gap before the auth token is ready. Grants are correct (authenticated only).
- 42P01 `edge_logs` / `postgres_logs` / `api`, and 42703 `m.department`: ad-hoc SQL editor sessions. No function or app code references them.

## Migrations
None.

## Tested
- New: `tripWorkflow.recordIdempotent.test.ts` and `tripDocuments.deleteApproved.test.ts` (4/4).
- Related suites (trips services, debit-control, vehicles, tripCompliance, createLedgerEntry): 858 pass.
- CI baselines: lint 98/98. Typecheck 345 (lowered from 346).
