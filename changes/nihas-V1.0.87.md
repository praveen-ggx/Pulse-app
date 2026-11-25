# nihas-V1.0.87

- Round started from V1 f46d9f659.

## Indent screen: bid list only for the confirmed owner org
- The indent screen asked for market bids before its indent row loaded, so non-owner viewers triggered "unauthorized: caller must be a non-driver member" (P0001) on prod. It now waits until the indent is loaded and belongs to the viewer org.

## Trip workflow events: quiet idempotent insert
- New RPC record_trip_workflow_event inserts with ON CONFLICT DO NOTHING, so repeat events no longer log duplicate-key errors on prod (the old check could not see other orgs rows). Client falls back to the old path until the migration is applied. Set: record-trip-workflow-event.

## Prod error report script
- scripts/prod-error-report.sh [hours] groups prod Postgres errors from the logs API into app vs manual (hand-run SQL), so a fix can be proven by the app count reaching zero. Read-only.

## Timeline events: drivers can write them
- New RPC record_trip_operational_timeline_event lets the trips assigned driver (not an org member) write timeline rows; members behave as before and the table policies are unchanged. Fixes the 42501 errors where driver flows silently lost the entry. Set: record-trip-operational-timeline-event.

## Test fix after V1 sync
- tripWorkflow.idempotency.test now follows the record_trip_workflow_event path (V1 was red after the merge of #174 because the test still expected the old insert).
