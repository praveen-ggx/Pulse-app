# Production readiness fixes

Decision: **NOT RELEASED**. This branch is local, uncommitted, unpushed, and approves no merge, migration apply, or production deploy.

Recorded 2026-10-15 from the repository, unit tests on Node, and read-only evidence gathered earlier (Supabase logs API, read-only SQL on production). No database was written. No migration was applied. Docker was not used.

## Identity

| Item | Value |
| --- | --- |
| Branch | `nihas/prod-readiness-fixes` (local worktree `~/pulse-prod-readiness-fixes`) |
| Base | `vasanth/V1.0.1` @ `db9e4981` (Finance merge, PR #2) |
| Commits | none (changes are uncommitted) |
| Migrations | none added or edited |

## Problem fixed: partner-truck vehicle documents from Trip Detail

On 14 Oct, after PR #1 went live (18:15 IST), a GOGOVAN dispatcher tried to save RC and fitness for supplier-owned truck TS04UD1699 from Trip Detail: 11 attempts, 0 saved. Each attempt was refused by storage policy "Org members can upload vehicle documents" because the upload targeted the supplier's folder.

Before PR #1 the same flow worked. Each of the 11 `save_vehicle_document_for_trip` 404s that morning was followed 2–4 s later by a successful `entity_documents` row from the same user. The RPC has never existed on production or preprod, so the 404 was noise; the existing fallback did the real work.

PR #1 commit `76aef9e1` made Trip Detail pass the truck owner's org as the uploader org, so the fallback upload also targeted the supplier's folder and failed before reaching `entity_documents`.

## Changes

| File | Change |
| --- | --- |
| `features/trips/components/trip-detail/TripDetailScreen.tsx` | Uploader org = `vaultUploaderOrgId({ currentOrgId, tripOrgId })`; never the truck owner's org. Only the trip org is an extra vault target. No org at all: upload stops with "Select your organisation, then try again." |
| `features/vehicles/services/vehicleDocuments.service.ts` | `uploadAndSaveVehicleDocumentForTrip`: vehicle vault only when the truck is found under one of the preferred orgs; otherwise save to `compliance-documents` + `entity_documents` under the uploader org. Removed the call to the non-existent `save_vehicle_document_for_trip`, and the upload-then-delete it caused. `uploadComplianceDocument` is now a static import (no import cycle; startup graph report unchanged). |
| `features/trips/utils/vaultUploadSession.util.ts` | New pure helper `vaultUploaderOrgId`. |
| `supabase/tests/pr1_payment_concurrency.sql` | Stops applying `20271014184500`. Snapshots the Godrej test-org receipt `897a1bef` before `20271012140000` and requires it unchanged afterwards. Supplier-rewrite and idempotency assertions kept. |
| `features/vehicles/services/__tests__/uploadAndSaveVehicleDocumentForTrip.test.ts` (new) | 4 tests; fake storage enforces the production folder rule. |
| `features/trips/utils/__tests__/vaultUploadSession.util.test.ts` | 3 tests for `vaultUploaderOrgId`. |
| `docs/deployment/FINANCE_DECISION_LOG.md` | Godrej entry superseded: "Godrej India" is a test organisation (decision 2026-10-15); the earlier stated classification is kept as history. |

## Permission model

No policy, grant, function, or migration changed. Writes stay inside existing rules:

| Write | Rule (production, read-only check 2026-10-15) |
| --- | --- |
| `compliance-documents/<uploader org>/vehicle/…` | `is_org_member(folder[1])` |
| `entity_documents` row | `is_org_staff(organization_id)`: owner, admin, member, dispatcher, finance |
| Own-org vehicle vault | `vehicle-documents` folder must be one of the user's orgs; `vehicles` row RLS |

Cross-org access is narrower than before: the app no longer attempts writes into another org's storage folder or `vehicles` row, and no longer calls a SECURITY DEFINER function that would overwrite a supplier's documents.

Visibility: Trip Detail fills empty vault slots from `entity_documents` under the trip, viewer and owner orgs (`useTripDetail.ts`, commit `d763992a`), and `getVehicleDocumentViewUrl` signs `org/vehicle/…` paths from `compliance-documents`. Compliance shows the same rows.

## Tests

| Check | Result |
| --- | --- |
| `uploadAndSaveVehicleDocumentForTrip.test.ts` | 4/4 passed |
| `vaultUploadSession.util.test.ts` | 7/7 passed (3 new) |
| Full Jest (`npm test -- --ci --passWithNoTests --forceExit`) | 513 passed, 0 failed, 1 skipped suite; 4,035 tests passed |
| `test:navigation-policy` | 64/64 |
| `ci-baseline` lint / typecheck / cycles / lib-files | 104 / 89 / 111 / 178, all at baseline |
| `find-startup-graph-offenders.mjs` | identical report to `db9e4981` (322 files) |
| `supabase/tests/pr1_payment_concurrency.sql` | **Not run.** It needs Docker (`run-pr1-disposable.sh`). Reviewed only. |
| UI click-through | Not done |

## Known limitations

1. Trip Detail fills only empty vault slots. If the supplier's own vault already has that document type, Trip Detail shows the supplier's file; the upload still shows in Compliance.
2. Drivers are not org staff and cannot save through `entity_documents`.
3. A user who also belongs to the truck owner's org, but is acting as another org, now saves to `entity_documents` instead of the owner's vault.
4. Out of scope, tracked separately:
   - Extras uploads for partner trucks fail the same way, and have done since before PR #1; they have no `entity_documents` fallback;
   - Trip Detail delete does not remove `entity_documents`-sourced files.
5. The Godrej backfill side effect in `20271013101500` is not addressed here (see `REMEDIATION_PLAN.md`, Gate G).

## Rollback

- **App:** revert the branch's commit, or redeploy the previous Netlify build. No data migration to undo.
- **Data:** files saved through this path are ordinary `entity_documents` rows and `compliance-documents` objects under the uploader's org, the same shape the pre-PR #1 fallback already produced. They stay valid after a code rollback.
- **SQL test file:** test-only, with no runtime effect.
