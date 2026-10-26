# praveen V1.0.9 — Download Trip Report on Trip Operations (rebased onto latest V1)

## What broke / root cause
- Local `praveen/V1.0.8` sat on older V1 (`8a2bb97a`) while integration V1 moved forward with prod syncs (`8b58785c`). Uncommitted Trip Report work needed a clean carry onto current V1 without merging the old branch.

## What
- Cherry-picked WIP Trip Report onto `praveen/V1.0.9` from latest `nihas/V1` (no merge of old branch).
- Trip Operations (`TripsScreen`) top action row: icon-only download button (same pill style/size as **Add**) next to **Add**, tooltip “Download Trip Report”, exports `Pulse_Trip_Report_YYYY-MM-DD.xlsx`.
- Excel columns (fixed order): Customer Name, Indent Type, Source, Destination, Supplier Name, Truck Number, Truck Type, Tonnage / Vehicle Capacity, Driver Name, Driver Phone Number, Indent Created Date & Time, Confirmed Date & Time, Client Cost, Supplier Cost, Status, Created By, Pulse ID, Trip ID.
- Pulse ID = enterprise operational code (`trip_operational_code` / `trip_code` on trips; `indent_operational_code` / `indent_code` on pending indents). Distinct from Trip ID (`display_trip_id` / `trip_number`).
- Excel formatting (export only): Calibri 10pt worksheet-wide, bold header row with light fill, thin borders on table, right-aligned costs with `#,##0.00`, auto column widths, autofilter. Uses `xlsx-js-style` so styles persist in the file.
- Row uniqueness: one row per trip; one row per org-owned indent with no linked trip (`indent_id` / `source_indent_id`). When an indent becomes a trip, only the trip row remains.
- Data from existing trips/indents catalogs plus enrichment (`market_bids.accepted_at`, `vehicles`, `profiles`, `organizations`, driver phones RPC). No schema change.

## Why
- Trip Ops needs a full indent+trip lifecycle Excel report without redesigning the hub or changing award/assignment workflows.

## Areas
- `features/trips/screens/TripsScreen.tsx`
- `features/trips/utils/tripIndentReport.model.ts`
- `features/trips/services/tripIndentReport.service.ts`
- `features/trips/services/tripIndentReport.export.ts`
- `features/trips/utils/__tests__/tripIndentReport.model.test.ts`
- `features/trips/services/__tests__/tripIndentReport.export.test.ts`

## Migrations
- None.

## Tested
- Unit tests for indent type, uniqueness, tonnage, filename, Pulse ID vs Trip ID mapping, pending confirmed-at blank + Pulse ID without Trip ID.
- Export formatting tests: Calibri 10 / bold headers on cells; written OOXML (`xl/styles.xml`) contains Calibri, sz 10, bold.
- Handoff checks: typecheck, lint, jest --ci, ci-baseline (lint|typecheck|cycles|lib-files), `git diff --check` (see PR / agent report).

## Not tested
- Not clicked through in the app (download button wired; verify Excel open in browser after deploy).
