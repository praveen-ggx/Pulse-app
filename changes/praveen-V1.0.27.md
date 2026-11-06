# praveen/V1.0.27

## What
- Compliance Verified Export Report drops the duplicate **Vendor Name** column; **Supplier** remains.

## Why
- Supplier and Vendor Name carried the same value, so the finance spreadsheet showed a redundant column.

## Areas
- `features/tripCompliance/utils/complianceVerifiedExport.util.ts`
- `features/tripCompliance/__tests__/complianceVerifiedExport.util.test.ts`

## Migrations
- none

## Tested
- `npx jest features/tripCompliance/__tests__/complianceVerifiedExport.util.test.ts --ci --silent`
- UI: not clicked through
