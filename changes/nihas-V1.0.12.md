# nihas V1.0.12 — Ground Ops document lock, and Asset Vault adds instead of replacing

## What
- **Ground Ops document lock.** Ground Ops can no longer replace, renumber, delete, or upload over an existing trip document once the trip is in transit or later, compliance approved, advance approved, or an advance is processed. Still open to them: uploading a missing document type, a document Compliance rejected, and every document while the trip is back with them after a hold or finance reject (until they Resubmit). Other roles are unchanged.
  - Compliance page: the files dialog hides Replace / Remove / Add and shows the reason ("Locked: trip is in transit", "Locked: advance processed", …).
  - Trip detail: Delete in the preview, the Trip Details slot upload buttons, gallery cards, "Add another" and Update LR follow the same rule.
  - Trips hub: Ground Ops can add a missing LR but not edit an existing one on a locked trip.
  - Database: new trigger on `trip_documents` enforces the same rule for insert / update / delete (migration `20261022093720_ground_ops_trip_document_lock.sql`).
- **Asset Vault adds instead of replacing.** On trip detail, uploading a vehicle document (RC, insurance, …) when one is already on file, or a driver licence / Aadhaar, now adds the file next to the existing one, like the Compliance upload. Added files show as "RC · added" in the vault and gallery and can be deleted there.
- **15-minute grace for Ground Ops' own new files.** A Ground Ops user can still add more pages of a type they just uploaded, fill its LR / invoice number (the post-upload and OCR write), or delete a wrong upload, for 15 minutes. Without it, a multi-page POD at delivery failed after the first page. Same window in the app and the database.
- **Trip detail now reads each document's review status** (`status` added to the trip-documents select), so a document Compliance rejected is shown as editable there too.
- **Delete order fix.** Deleting a trip document now removes the database row before the stored file, so a refused delete never leaves a row pointing at a missing file; when row access silently deletes nothing, the file is kept and an error is shown.

## Why
- Ground Ops changed or removed documents after the trip had moved on (in transit, approved, advance paid). The old lock only covered deleting LR / e-way / invoice after compliance verify, and only in the Compliance page; replace was not locked in the database at all.
- On trip detail, a second vehicle or driver document replaced the first, while the Compliance page added it. The two screens disagreed and the first file was lost from the vault.

## Areas
- features/tripCompliance/utils/groundOpsDocumentLock.util.ts (new rule), ComplianceDocumentWorkspace.tsx, app/compliance/index.tsx; features/trips/components/trip-detail/TripDetailScreen.tsx, hooks/useTripDetail.ts, assetEntityExtras.util.ts (new); features/trips/screens/TripsScreen.tsx; features/trips/services/tripDocuments.service.ts (delete order, `status` on the row type), trips.service.ts (`compliance_declined_at` on the row type); docs/RBAC_OPERATING_MODEL_CHANGELOG.md.

## Migrations
- `20261022093720_ground_ops_trip_document_lock.sql`: function `ground_ops_trip_document_lock_reason(uuid, text)` (SECURITY DEFINER, anon has no EXECUTE) and trigger `trg_guard_trip_document_ground_ops` (before insert / update / delete on `trip_documents`). Additive; no table or data changes. Not applied anywhere yet. Needs preprod push after merge, and a prod release set.

## Tested
- New tests: `groundOpsDocumentLock.util.test.ts` (10: every status, approvals, rejected document, finance reject / hold until resubmit), `groundOpsDocumentLock.migration.contract.test.ts` (8: SQL statuses match the app, exceptions, roles, anon), `tripDocumentDeleteOrder.test.ts` (4), `assetEntityExtras.util.test.ts` (4).
- Migration run on a throwaway local Postgres 17 with stub tables: 20 scenarios pass (incl. multi-page upload, own-file number fill and delete within 15 minutes, older own file blocked) (Ground Ops blocked on replace / renumber / delete / add-over in transit, after approval, advance approved and processed; allowed before transit, for a missing type, a rejected document, while awaiting resubmit; Finance and service role unaffected; review-status-only updates unaffected). Not applied to preprod or prod.
- Full jest 532 suites / 4173 tests pass (1 skipped as before). ci-baseline lint 102 (≤104), typecheck 61 (≤89), cycles 111, lib-files 178; navigation-policy 64 pass; git diff --check clean; db:preflight: all pending files non-empty.
- Not clicked through in the UI (no Ground Ops login used).
