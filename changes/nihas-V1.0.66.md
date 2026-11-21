# nihas/V1.0.66

Branched from V1 `5212e0f2` (= prod 49bccc6e) on 2026-11-21.

## What
- Hotfix migration `20261121113052_advance_payment_guard_resolved_basis.sql`: the advance payment guard (`tg_transactions_link_payment_request`) compares the supplier rate basis as `compliance_advance_calculation` resolves it (blank = per_trip), the same value the approval snapshot stores. Body is the live prod definition with only that check changed. Release set `advance-payment-guard-basis` + pin test.

## Why
- Dhira 21 Nov: "Couldn't post payment — trip terms changed after approval; reapprove the advance" (TRP002845). Since 20271118094500 (formula v1, 18 Nov) the guard compared the raw `trips.supplier_rate_basis` (blank on most trips) with the snapshot's resolved `per_trip`, so every blank-basis advance was blocked. Prod: 132 pending, none posted since 18 Nov 18:40. Re-approving does not help (same snapshot).

## Areas
- supabase/migrations/20261121113052_advance_payment_guard_resolved_basis.sql
- supabase/release-sets/advance-payment-guard-basis.versions
- supabase/migrations/__tests__/advancePaymentGuardBasisReleaseSet.test.ts

## Migrations
- 20261121113052 (set `advance-payment-guard-basis`).

## Tested
- Preprod inside BEGIN … ROLLBACK (blank-basis trip, approval snapshot from the server calculation): old guard → "trip terms changed"; new guard → payment posts; rate changed after approval → still blocked; amount ≠ approved → still blocked. Preprod unchanged afterwards.
- Prod read-only: all 132 blocked requests have unchanged rate, tons, resolved basis and payable, so they pass the new guard.
- Jest: advancePaymentGuardBasisReleaseSet, advancePaymentIntegrity (10 pass).

## Not tested
- Real apply (preprod by Nihas, prod by Vasanth) and a real Confirm payment click after it.
