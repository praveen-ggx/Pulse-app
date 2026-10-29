# vasanth/compliance-row-decline

## What

- Add a per-document Decline (and matching Approve) on the selected Compliance preview row.
- Reuse `writeDecline` / `setTripDocumentVerification` so only that `trip_documents.id` is rejected.

## Why

- Group Decline is blocked while other optional types are still missing, so an uploaded Other Documents file could not be rejected alone.
- PR #54 replace-preview cannot be validated without a safe single-row Decline.

## Areas

- `features/tripCompliance/utils/complianceReviewActions.util.ts`
- `features/tripCompliance/components/ComplianceDocumentWorkspace.tsx`
- `features/tripCompliance/__tests__/complianceReviewActions.util.test.ts`

## Migrations

- None.

## Tested

- Focused Jest for single-row target IDs.
- Browser cycle not run until this branch is on the signed-in 8110 session.
