# praveen/V1.0.30

## What
- Compliance Verified Export Report **Loading date** falls back to `started_at` when `pickup_date` is empty, matching Trip Ops Manifest Pulse PICKUP.

## Why
- Export mapped Loading date to `pickup_date` only. Trips like `SAT812GOGTRIP002002` show PICKUP on Trip Ops via `started_at` / journey log, but the sheet left Loading date blank while Intransit (`started_at`) was filled.

## How
- Add `exportLoadingDateIso(trip)` → `pickup_date` if set, else `started_at`.
- Wire `"Loading date"` through that helper; Intransit date still uses `started_at` only.

## Areas
- `features/tripCompliance/utils/complianceVerifiedExport.util.ts`
- `features/tripCompliance/__tests__/complianceVerifiedExport.util.test.ts`

## Migrations
- none

## Tested
- `npx jest features/tripCompliance/__tests__/complianceVerifiedExport.util.test.ts --ci --silent`
- UI: not clicked through
- DB (`.env` preprod): exact ops code `SAT812GOGTRIP002002` not present; root cause confirmed from export vs Trip Ops field mapping (`pickup_date` vs `started_at` / PICKUP).
