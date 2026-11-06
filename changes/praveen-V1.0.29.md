# praveen/V1.0.29

## What
- Advance Verification / Verified export: do not treat hard-copy POD alone as Balance Pending; require a posted advance first so unpaid verified trips stay in the export.

## Why
- Delivered + `pod_received_at` with no `compliance_advance` derived `balance_pending` and `isComplianceVerifiedQueue` dropped them (hard-copy gate), so Export Report counted fewer trips than the Advance Verification inbox (e.g. 12 of 13). Preprod sample: TRP001725 and 10 others same pattern.

## How
- `deriveComplianceStage`: for delivered trips, `balance_pending` only when **hard-copy + advance**; hard-copy alone stays `compliance_verified` / `finance_verified`.
- `isComplianceVerifiedQueue` / `isFinanceVerifiedQueue`: stop excluding solely because `hardCopyPod.received` — leave Verified when advance is still unpaid (Export Report matches Advance Verification).

## Areas
- `features/tripCompliance/services/tripComplianceRead.service.ts` — `deriveComplianceStage`
- `features/tripCompliance/utils/complianceReadiness.util.ts` — Verified / Finance Verified queue
- Tests for stage + verified export queue

## Migrations
- none

## Tested
- `npx jest features/tripCompliance/__tests__/tripComplianceRead.service.test.ts features/tripCompliance/__tests__/complianceReadiness.util.test.ts features/tripCompliance/__tests__/buildComplianceTripSummaries.hardCopyPod.test.ts features/tripCompliance/__tests__/hardCopyPodPipelinePatch.test.ts features/tripCompliance/__tests__/complianceExportReport.util.test.ts --ci --silent`
- UI: not clicked through
