# vasanth/hotfix-activity-log-20261113

Branched from production `V1.0.1` `d014cf92` (PR #111 release) on 2026-11-13.

## What
- Compliance → View activity log: the ledger query selects only columns that exist on `transactions`.

## Why
- Production returns `400` (`42703 column transactions.vehicle_number does not exist`) on every activity-log open, so the panel shows no ledger entries. `vehicle_number` and `driver_name` are not `transactions` columns; `toLedgerRow` already reads those labels from the description meta.

## Areas
- `features/tripCompliance/components/ComplianceTripActivityLog.tsx`
- `.github/ci-baseline.json`: typecheck 346 → 345 (this fix removes the `ComplianceTripActivityLog` error).

## Migrations
- None.

## Tested
- Production schema (read-only): `vehicle_number`, `driver_name`, `trip_number` absent on `public.transactions`; all 16 selected columns present.
- Baselines: lint, cycles, lib-files unchanged; typecheck 345 (baseline lowered from 346).
- `npm run test:navigation-policy`: 64/64. Full Jest: 779 suites passed (1 skipped), 5644 tests passed.
- Not clicked through.
