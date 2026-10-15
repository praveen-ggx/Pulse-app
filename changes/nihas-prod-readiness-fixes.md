# nihas prod-readiness-fixes — Partner-truck document upload and Godrej test guard

## What
- Trip Detail saves partner-truck RC / fitness / insurance / PUC again: the upload uses the signed-in user's org, writes the vehicle vault only for the org's own trucks, and otherwise saves to Compliance documents (`entity_documents`) under the user's org.
- Removed the call to `save_vehicle_document_for_trip`, which has never existed on production or preprod.
- Upload stops with a clear message when no organisation is selected instead of falling back to the truck owner's org.
- The PR #1 disposable SQL test now requires the Godrej test-org receipt to stay unchanged instead of applying its classification file.
- Finance decision log: the Godrej test-org decision (15 Oct) supersedes the earlier stated classification, which is kept as history.
- Payment-request backfill (`20271013101500`) skips the Godrej test-org receipt in its selection and link insert, as a documented migration exception (preprod already applied the original text).
- Added release set `prod-v1-0-1-catchup` (the 27 versions production is missing, each with its SHA-256) so `db:push-set` runs exactly these and never the excluded or gap files.

## Why
- After PR #1 (14 Oct) a dispatcher's 11 uploads for a supplier truck were refused by storage policy; before PR #1 the same flow worked through the Compliance-documents fallback.
- "Godrej India" is a test organisation (confirmed 15 Oct); its receipt must never be classified or marked paid, and the old test asserted the opposite.
- The backfill would have marked the Godrej test receipt paid and started a payment counter for the test org; the receipt must never be classified or marked paid.
- Prod needs an explicit allowlist: no existing set matched the 27, and plain `db push` would also run 10 gap files whose objects already exist on prod with newer bodies.

## Areas
- Trip Detail vehicle vault upload (`TripDetailScreen.tsx`, `vehicleDocuments.service.ts`, `vaultUploadSession.util.ts`).
- PR #1 disposable SQL test (`supabase/tests/pr1_payment_concurrency.sql`).
- `docs/deployment/FINANCE_DECISION_LOG.md`.
- `supabase/migrations/20271013101500_payment_requests.sql` backfill; `pr1ReleaseGuards.test.ts`; deployment docs.
- `supabase/release-sets/prod-v1-0-1-catchup.versions`.

## Migrations
- None
- `20271013101500_payment_requests.sql` edited (backfill only; documented exception). No new migration.
- None (release-set file only).

## Tested
- Unit: 4 new tests for `uploadAndSaveVehicleDocumentForTrip`, 3 new for `vaultUploaderOrgId`; full Jest 513 suites passed, 0 failed; navigation policy 64/64; lint, typecheck, cycles, lib-files at baseline; startup graph unchanged.
- `pr1_payment_concurrency.sql` reviewed only, not run (needs Docker). Not clicked through in the UI.
- New guard test passes and fails on 4 mutations (removed / commented / link-insert removed / moved). The link-insert line has not been run against a database; no database accessed.
- This branch: full Jest 513 suites passed, 0 failed; lint 104, typecheck 89, cycles 111, lib-files 178 (all at baseline).
- Release set: versions equal the approved 27, ascending, no excluded version; all 27 checksums match the committed files; guard tests 8/8; `migration-release-set.test.sh` passed. Godrej c1–c4 passed on 27/27 applied to a fresh prod restore (file `1cd82e0d`). Prod dry-run reported separately.
