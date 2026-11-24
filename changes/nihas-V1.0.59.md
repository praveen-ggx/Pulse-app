# nihas/V1.0.59

Branched from V1 `617de36a` on 2026-11-20. Fixes the app-side prod Postgres errors seen 17–20 Nov 2026.

## What
- Signed-in-only calls (Trips hub list and counts, trip documents batch, compliance driver docs, driver profile batch) now check for a session first and stop with "Your session has expired. Please sign in again." instead of going out as anon.
- Trip status changes keep `completed_at` in step with status: completing stamps it (unless already set), any other status (assign, reopen, simulate revert, cancel) clears it.
- Deleting a trip document re-reads its status first; an approved (verified) document is refused in the app with "Approved documents cannot be deleted." and no 'deleted' audit row is written.
- POD validation saves update the existing workflow event first and insert only when none exists; the advance document-cost snapshot is skipped when already frozen.

## Why
- Prod logs 17–20 Nov: ~85 `permission denied for function …` errors from PostgREST, all sent with the anon key (session gone on the device, screen still mounted). The functions are correctly granted to `authenticated` only.
- 5 `trips_check1` violations: `updateTripStatus` sent `status` without `completed_at`, so completing left it null (or leaving completed kept it).
- 6 `approved documents cannot be deleted` errors: the app sent deletes for documents approved after the screen loaded, and wrote a 'deleted' audit row before the database refused.
- 444 `trip_workflow_events_idempotency_key_unique` errors: both writers inserted first and relied on the duplicate-key error to fall back. Harmless to data, but log noise that hid real errors.

## Areas
- lib/supabase.ts (SESSION_EXPIRED_MESSAGE)
- features/trips/services/integratedTripCancel.service.ts, tripDocuments.service.ts
- features/debit-control/services/debitControlPod.service.ts
- features/trips/services/trips.service.ts, features/drivers/services/drivers.service.ts
- features/tripCompliance/services/complianceListFacts.service.ts, tripComplianceRead.service.ts

## Migrations
- None.

## Tested
- Jest: features/tripCompliance, features/trips, features/drivers, features/finance (318 suites pass); new test that no RPC is sent without a session.
- Jest: updateTripStatus completed_at stamp / keep / clear; features/trips, driver, drivers (227 suites pass).
- Jest: tripDocumentDeleteOrder (approved document: no delete, no audit).
- Jest: debit-control (repeat save updates, no duplicate insert).
- After merging V1 fad5ba26: added the session exports to the vehicleDocumentReuse test mock; tripCompliance, trips, debit-control, drivers, compliance suites pass; typecheck 344/344.

## Not tested
- Click-through on a device with an expired session.
