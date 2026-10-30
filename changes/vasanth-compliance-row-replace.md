# vasanth/compliance-row-replace

## What

- Add an explicit Replace action on a rejected Compliance trip document.
- The action calls `replaceTripFile` with that row’s exact `trip_documents.id` (`replaceDocumentId`).
- Hide Add / Add more copies on that rejected row so a second Other Documents row is not created.
- Does not change per-row Decline / Approve behavior from `vasanth/compliance-row-decline`.

## Why

- Per-row Decline on Other Documents passed on preprod (`b7cbfe36-…`).
- Pencil / Edit opened the category modal and never invoked replace-in-place, so PR #54 preview after resubmit could not be validated.

## Areas

- `features/tripCompliance/utils/complianceRowReplace.util.ts`
- `features/tripCompliance/__tests__/complianceRowReplace.util.test.ts`
- `features/tripCompliance/components/ComplianceDocumentWorkspace.tsx`
- `features/trips/components/trip-detail/VaultChooserNotifyRow.tsx`
- `features/trips/components/trip-detail/VaultCategoryPreviewModal.tsx`
- `features/trips/services/__tests__/tripDocumentReplaceById.test.ts`

## Migrations

- None. Resubmit attachment check `20271029223000_compliance_resubmit_attachment_only.sql` stays a separate Nihas preprod-only apply. This machine’s CLI is linked to prod `nafxpivddesgsrthmosv` — do not push or apply from here.

## Tested

- Focused Jest for replace target identity, sibling isolation, duplicate prevention, storage failure, and missing-row fail-closed.
- Browser replace → blue preview → approve is still NOT TESTED until this build is signed in on a non-production port.
- PR #54 and PR #55 remain NO-GO / unmerged.
