# nihas V1.0.3 — repository = production for migrations

## What
- Added the three migrations production has but the repository did not: `20270930173000` (long-haul health view), `20271012125000` (trip number truncation fix), `20271012143000` (trip document access for every trip party + LR/POD batch).

## Why
- They were applied straight to production, so preprod and fresh local databases were missing them. Production already records all three; nothing runs again there.

## Areas
- Supabase migrations only (no app code).

## Migrations
- 20270930173000_collapse_long_haul_health_odometer_scan.sql (rebuilt from production's live view, since production stored only the view body)
- 20271012125000_fix_legacy_trip_number_lpad_truncation.sql (verbatim from production history)
- 20271012143000_trip_document_party_access_and_lr_batch.sql (verbatim from production history)

## Tested
- Migration Jest suites 17/17. Not yet run on any database; preprod apply follows after merge.
