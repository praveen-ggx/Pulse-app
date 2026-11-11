# gowtham V1.0.38 — Pulse fixes (Nihas tasks, non-driver)

## What
- Trip Ops All Trips Excel: 20-column sample layout (sheet `All Trips`, headers row 1, blue `#B4C6E7` header fill, black borders, Calibri 9); date-range picker kept.
- KM blank root cause: null lat/lon became `Number(null)===0`; browser Nominatim geocode hit CORS/429. Fix: real pin check, expanded India city table, Mapbox geocode (no Nominatim), haversine × 1.3, optional road-route upgrade.
- POD soft copy uploaded by: teammate names via `get_org_members_with_profiles` (Asik/Rithvik see each other).
- Hide Trip Report download (and ledger export entry) for **Ground Ops** only; Sourcing already hidden.

## Why
- Nihas V1.0.40 shrank the TripOps export; GoGoVan Trip Ops needed the All Trips sample format + table styling.
- Soft-copy names used direct `profiles` SELECT (own-row RLS).
- KM stayed empty when only odometer/GPS (or start/end) had values, or when export rows did not carry distance fields.
- Ground Ops does not need this download.

## Areas
- `features/trips/utils/tripOpsReport.model.ts`
- `features/trips/utils/tripOpsReportExport.util.ts`
- `features/trips/utils/__tests__/tripOpsReport.model.test.ts`
- `features/trips/services/tripSoftCopyUploader.service.ts`
- `features/trips/services/tripOpsReportKm.service.ts`
- `features/trips/screens/TripsScreen.tsx`

## Migrations
- None

## Tested
- `npx jest features/trips/utils/__tests__/tripOpsReport.model.test.ts --ci --silent`
- UI: not clicked through
