# praveen/V1.0.21

## What
- Trip Ops / Compliance show Driving License (and Aadhaar) for every visible trip when the driver’s DL exists in `entity_documents` (any org) or `driver_kyc_documents`, via a new authorized batch RPC.

## Why
- Org members cannot read `driver_kyc_documents` under RLS (driver self + platform reviewers only). Client `listDriverVaultKycDocuments` therefore returned empty for Trip Ops, so DL appeared only when re-uploaded into that org’s `entity_documents` — intermittent by trip/driver.

## Areas
- `supabase/migrations/20261104095549_get_compliance_driver_docs_for_trips.sql`
- `features/tripCompliance/services/complianceListFacts.service.ts`
- `features/tripCompliance/services/tripComplianceRead.service.ts`
- `features/tripCompliance/services/compliancePipelineSync.service.ts`
- `features/trips/components/trip-detail/hooks/useTripDetail.ts`
- Tests: `complianceDriverDocs.migration.contract.test.ts`, `compliancePipelineSync.service.test.ts`; mock `get_compliance_driver_docs_for_trips` (and vehicle vault RPC) in `tripDocumentClassification.util.test.ts` + `buildComplianceTripSummaries.hardCopyPod.test.ts`

## Migrations
- `20261104095549_get_compliance_driver_docs_for_trips.sql` (additive RPC only; no table changes)

## Tested
- `npx jest features/tripCompliance/__tests__/complianceDriverDocs.migration.contract.test.ts features/tripCompliance/__tests__/compliancePipelineSync.service.test.ts features/tripCompliance/__tests__/tripDocumentClassification.util.test.ts features/tripCompliance/__tests__/buildComplianceTripSummaries.hardCopyPod.test.ts --ci --silent`
- UI: not clicked through (needs migration applied on preprod)
