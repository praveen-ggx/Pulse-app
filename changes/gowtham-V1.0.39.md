# gowtham V1.0.39 — Compliance + Trips export fixes

## What
- Compliance: Export button now shows in Cards view too (was Table view only). Same rows as before: current tab, filters, search, date sort.
- Compliance export: "Vendor Name" column filled from the same supplier lookup the screen uses, falling back to the trip's own supplier name.
- Trips report (Trip Ops + Sales): SUPPLIER resolved for every trip in the export date range, not just trips loaded on screen. Supplier names missing from the loaded supplier list are fetched at export time.
- Trip Ops report: ETA column removed (19 columns). It was distance ÷ 350 km/day from start/pickup/created time — not a real ETA (too long for short trips, could be in the past, ignored live progress / actual delivery).
- Compliance document preview: footer/header shows every LR number on the trip (copies + ranges), not only the active file’s first LR.
- Compliance document preview: footer/header shows every E-way Bill number on the trip (copies + `entries`), not only the active file’s first `ewayNo`.

## Why
- Compliance export was only reachable from Table view, and Vendor Name read `trip.supplier_name`, which is usually empty on the list payload.
- Trips export loads a wider trip catalog for the date range than the screen, but supplier names were only resolved for on-screen trips, so SUPPLIER came out blank.
- ETA in the sheet was misleading.
- Preview used `selectedDocumentNumber` alone and dropped `complianceVaultDocNumbers`, so a second LR never appeared under the scan.
- Same preview short-circuit hid extra E-way numbers (e.g. TRP002095: `542…` missing when viewing the file that only surfaced top-level `582…`).

## Areas
- `app/compliance/index.tsx`
- `features/tripCompliance/utils/complianceTableExport.util.ts`
- `features/tripCompliance/services/complianceExportReport.service.ts`
- `features/tripCompliance/utils/__tests__/complianceTableExport.util.test.ts` (new)
- `features/tripCompliance/components/ComplianceDocumentWorkspace.tsx`
- `features/trips/screens/TripsScreen.tsx`
- `features/trips/services/tripReportSupplierNames.service.ts` (new)
- `features/trips/utils/tripOpsReport.model.ts`
- `features/trips/utils/__tests__/tripOpsReport.model.test.ts`

## Migrations
- None

## Tested
- `npx jest features/tripCompliance/utils/__tests__/complianceTableExport.util.test.ts features/trips/utils/__tests__/tripOpsReport.model.test.ts`
- UI: not clicked through
