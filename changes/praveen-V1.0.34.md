# praveen/V1.0.34

## What
- Restore the Compliance **Resubmit** control on desktop shop layout so Ground Ops can resubmit finance-rejected / held trips from Document Upload.
- Stop queuing `resubmit_trip_compliance` behind preview/list fetches (same ungated path as Verify/Decline/Reject) so Resubmit no longer hits client `TimeoutError`.

## Why
- After the shop chrome change (`commerceLayout` always on), desktop hid the document-list pane that held Resubmit. Rejected trips stayed under Document Upload; uploads alone never move them, and Resubmit was unreachable on desktop.
- Resubmit then opened but failed with `TimeoutError: Request timed out` because the RPC sat in the data-fetch concurrency queue until the 20s write timeout — Approve/Verify were already excluded from that queue; Resubmit was not.

## Areas
- `features/tripCompliance/components/ComplianceDocumentWorkspace.tsx`
- `lib/supabaseHttp.util.ts`
- `lib/__tests__/supabaseHttp.util.test.ts`

## Migrations
- none

## Tested
- not clicked through (desktop): Resubmit should appear under the trip strip on Document Upload for an active finance reject / hold when the user has `trip_compliance.trip.resubmit`
- unit: `shouldQueueDataFetch` returns false for `resubmit_trip_compliance`
- preprod TRP001755: docs/RPC gates already allow resubmit; failures were missing desktop control + queued RPC timeout
