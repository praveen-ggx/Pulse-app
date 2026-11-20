# nihas/V1.0.62

Branched from V1 `fad5ba26` on 2026-11-20.

## What
- Advance panel (Compliance → Advance Verification) reads the trip's own supplier rate basis only. A blank trip basis no longer inherits the indent's `per_mt`, so the total supplier freight is not multiplied by tons again.
- Migration `20261120094932_per_mt_advance_uses_trip_total.sql`: `compliance_advance_calculation` (used by Approve Advance) drops the same indent fallback. Blank trip basis = per trip. Explicit `per_mt` on the trip is unchanged.
- Test `readTripSupplierFreight.perMtTotal.test.ts`.

## Why
- Dhira, 20 Nov: SUNFLAG TRP002851 showed base freight ₹1,32,50,952 and advance ₹1,19,25,156.8. Real freight is ₹2,05,920 (export was right). `trips.supplier_rate` is already the total for per-MT loads; 205,920 × 64.35 t was the double count.
- Prod, read-only 20 Nov: 84 per-MT trips (indent / market bid / direct quote) all store totals with a blank trip basis, so every one was affected. No advance approved or paid at an inflated amount yet (0 of 680 payment requests).
