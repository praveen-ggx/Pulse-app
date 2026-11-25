# nihas-V1.0.87

- Round started from V1 f46d9f659.

## Indent screen: bid list only for the confirmed owner org
- The indent screen asked for market bids before its indent row loaded, so non-owner viewers triggered "unauthorized: caller must be a non-driver member" (P0001) on prod. It now waits until the indent is loaded and belongs to the viewer org.

## Trip workflow events: quiet idempotent insert
- New RPC record_trip_workflow_event inserts with ON CONFLICT DO NOTHING, so repeat events no longer log duplicate-key errors on prod (the old check could not see other orgs rows). Client falls back to the old path until the migration is applied. Set: record-trip-workflow-event.

## Prod error report script
- scripts/prod-error-report.sh [hours] groups prod Postgres errors from the logs API into app vs manual (hand-run SQL), so a fix can be proven by the app count reaching zero. Read-only.
