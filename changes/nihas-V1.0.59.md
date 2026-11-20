# nihas/V1.0.59

Branched from V1 `617de36a` on 2026-11-20. Fixes the app-side prod Postgres errors seen 17–20 Nov 2026.

## What
- Signed-in-only calls (Trips hub list and counts, trip documents batch, compliance driver docs, driver profile batch) now check for a session first and stop with "Your session has expired. Please sign in again." instead of going out as anon.

## Why
- Prod logs 17–20 Nov: ~85 `permission denied for function …` errors from PostgREST, all sent with the anon key (session gone on the device, screen still mounted). The functions are correctly granted to `authenticated` only.

## Areas
- lib/supabase.ts (SESSION_EXPIRED_MESSAGE)
- features/trips/services/trips.service.ts, features/drivers/services/drivers.service.ts
- features/tripCompliance/services/complianceListFacts.service.ts, tripComplianceRead.service.ts

## Migrations
- None.

## Tested
- Jest: features/tripCompliance, features/trips, features/drivers, features/finance (318 suites pass); new test that no RPC is sent without a session.

## Not tested
- Click-through on a device with an expired session.
