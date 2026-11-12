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

---

## Driving licence number — accept every Indian layout (Add Driver)

### What
- Licence field no longer silently drops characters. If what's typed doesn't fit the picked layout, it switches to RTO letter or "Other / old card" and keeps the number exactly as typed.
- "Other / old card" accepts any licence as printed: 7–21 letters/digits, optional single `/` separators, at least 5 digits (e.g. `MH04/12345/2005`, `P03042000123456`, `R/TN/22/001234/2009`, `DLFAP029126912005OD`).
- Standard (`TN01 20200001234`) and RTO letter (`TN29 Z19940001713`) unchanged, still auto-spaced.
- Clearer error / placeholder text in Add Driver, driver registration and the old Add Driver modal (also uppercases input there).

### Why
- A Telangana card prints only a 9-digit number; it could not be entered in any layout (Standard wiped it, Old card rejected it), so the driver could not be added.

### Areas
- `lib/indianDrivingLicenseInput.util.ts`
- `features/finance/components/PartyRegistrationPortal.tsx`
- `features/drivers/components/AddDriverModal.tsx`
- `features/drivers/components/DriverRegistrationPortalFlow.tsx`
- `lib/__tests__/indianInputFormats.test.ts`, `lib/__tests__/indianDrivingLicenseLength.test.ts`

### Migrations
- None (`license_number` is free text)

### Tested
- `npx jest lib/__tests__/indianInputFormats.test.ts lib/__tests__/indianDrivingLicenseLength.test.ts` — 40 passed
- UI: not clicked through
