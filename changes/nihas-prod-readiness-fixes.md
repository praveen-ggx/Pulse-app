# nihas prod-readiness-fixes — Partner-truck document upload and Godrej test guard

## What
- Trip Detail saves partner-truck RC / fitness / insurance / PUC again: the upload uses the signed-in user's org, writes the vehicle vault only for the org's own trucks, and otherwise saves to Compliance documents (`entity_documents`) under the user's org.
- Removed the call to `save_vehicle_document_for_trip`, which has never existed on production or preprod.
- Upload stops with a clear message when no organisation is selected instead of falling back to the truck owner's org.
- The PR #1 disposable SQL test now requires the Godrej test-org receipt to stay unchanged instead of applying its classification file.
- Finance decision log: the Godrej test-org decision (15 Oct) supersedes the earlier stated classification, which is kept as history.

## Why
- After PR #1 (14 Oct) a dispatcher's 11 uploads for a supplier truck were refused by storage policy; before PR #1 the same flow worked through the Compliance-documents fallback.
- "Godrej India" is a test organisation (confirmed 15 Oct); its receipt must never be classified or marked paid, and the old test asserted the opposite.

## Areas
- Trip Detail vehicle vault upload (`TripDetailScreen.tsx`, `vehicleDocuments.service.ts`, `vaultUploadSession.util.ts`).
- PR #1 disposable SQL test (`supabase/tests/pr1_payment_concurrency.sql`).
- `docs/deployment/FINANCE_DECISION_LOG.md`.

## Migrations
- None

## Tested
- Unit: 4 new tests for `uploadAndSaveVehicleDocumentForTrip`, 3 new for `vaultUploaderOrgId`; full Jest 513 suites passed, 0 failed; navigation policy 64/64; lint, typecheck, cycles, lib-files at baseline; startup graph unchanged.
- `pr1_payment_concurrency.sql` reviewed only, not run (needs Docker). Not clicked through in the UI.
