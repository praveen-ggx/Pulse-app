# nihas V1.0.30

## What
- Release set `clear-cancel-reason-on-award` for Praveen's migration 20271030110000 (PR #61), plus its pinning test.
- Trip vault: compliance-rejected LR / e-way bill shows "Rejected · reason" on the card; e-way pill turns red and button says Re-upload.
- E-way tab: every uploaded e-way file gets its own row, even when details were saved for fewer bills; saving details on the extra row now keeps them.

## Why
- Preprod refuses a plain linked push (frozen 20271005130000), so the migration needs a named set.
- Ops couldn't see why a document was rejected.
- Trips with 2+ e-way files but fewer saved entries showed only one bill (e.g. TRP795 on preprod).

## Areas
supabase/release-sets, supabase/migrations/__tests__.
features/trips (trip-detail vault, ewayBillFields.util, tripDocuments.service).

## Migrations
None new (set only).

## Tested
- Set pinning + migration contract tests: 7 passed. Preprod dry-run lists exactly 20271030110000.
- Jest: e-way + trip-detail suites, 83 passed. Manual: TRP795 on preprod via localhost shows both e-way rows.
