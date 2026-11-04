# praveen/V1.0.25

## What
- `get_trip_detail_bundle` now returns `trip_operational_code` and `trip_code` on the trip JSON so trip detail shows the same operational code as the list / light path (e.g. `SAT812GOGTRIP…` instead of falling back to `display_trip_id` / `TRP…`).

## Why
- RPC path omitted those columns; `getTripOperationalDisplayCode` then skipped them (`undefined ?? next`) and showed `display_trip_id`. Light path `select('*')` included them, so the same trip could show two different codes depending on which load path won.

## Areas
- `supabase/migrations/20271104142208_get_trip_detail_bundle_operational_codes.sql`
- `lib/queries/useTripDetailBundleQuery.ts` (`BundleTrip` types)
- `features/trips/utils/__tests__/getTripDetailBundle.operationalCodes.migration.contract.test.ts`

## Migrations
- `20271104142208_get_trip_detail_bundle_operational_codes.sql` (CREATE OR REPLACE RPC; additive JSON fields only)

## Tested
- `npx jest features/trips/utils/__tests__/getTripDetailBundle.operationalCodes.migration.contract.test.ts --ci --silent`
- UI: not clicked through (needs migration on preprod)
