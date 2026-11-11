# praveen/V1.0.35

## What
- Manifest E-way bill cards gain a **Remove** action for an uploaded file, using the existing vault delete confirm, so a wrong bill can be replaced during loading.
- Saving an E-way number writes `document_number` only, and reports a failure when the update changes no row.
- Ground Ops may update or delete an `eway_bill` row only while the trip is still editable (loading / assigned, or their own upload from the last 15 minutes). In transit, compliance approved, and advance posted stay locked.

## Why
- A wrong E-way file uploaded at loading could not be removed, and the corrected number did not persist. Ground Ops can insert the file, but update and delete were excluded, so the save matched no row. The save also rewrote `uploaded_at`, which the verification guard rejects for anyone who is not a trip-org manager.

## Areas
- `features/trips/components/trip-detail/EwayBillVaultTab.tsx`
- `features/trips/components/trip-detail/TripDetailScreen.tsx`
- `features/trips/components/trip-detail/TripMobileVaultPanel.tsx`
- `features/trips/components/trip-detail/TripVaultCardGrid.tsx`
- `features/trips/services/tripDocuments.service.ts`
- `features/trips/services/ewayBillFields.util.ts`
- `supabase/migrations/20271110133819_ground_ops_eway_bill_correct.sql`
- `docs/RBAC_OPERATING_MODEL_CHANGELOG.md`

## Migrations
- `20271110133819_ground_ops_eway_bill_correct.sql`

## Tested
- `npx jest features/trips/services/__tests__/upsertEwayBillFields.test.ts features/trips/services/__tests__/ewayBillFields.util.test.ts supabase/migrations/__tests__/groundOpsEwayCorrect.migration.contract.test.ts --ci --silent`
- UI: not clicked through
