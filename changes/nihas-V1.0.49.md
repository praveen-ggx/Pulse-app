# nihas/V1.0.49

Branched from V1 `90cb560a` on 2026-11-12.

## What
- Advance Verification Export Report: All / Verified / Balance pending filter in the confirm pop-up; report follows the choice.

## Why
- Finance wants to export just verified or just balance-pending trips. Old export also skipped the Balance Pending cards (17 of 28).

## Areas
- Compliance → Advance Verification → Export Report.

## Migrations
None.

## Tested
- Nihas checked locally on top of prod (vasanth/V1.0.1): works. New filter unit test; compliance Jest suite.

## Not tested
- Native (iOS/Android) export.
