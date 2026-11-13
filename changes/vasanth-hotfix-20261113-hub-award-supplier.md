# vasanth hotfix 2026-11-13: Trips hub supplier from indent award

## What
- Trips hub cards show the awarded carrier as the supplier when a trip came from an indent that another organization won, instead of "Awaiting data". Name comes from the matching supplier record (by linked organization) or the organization's display name; the card also gets that supplier's avatar / org logo and the integrated badge.

## Why
- Trips created from an awarded indent often have no `supplier_id` / `supplier_name` on the trip row. The award lives on `indents.assigned_supplier_id` (the winning organization id, not a suppliers row), so the hub could not resolve a supplier.

## Areas
- `features/trips/utils/tripHubPartyMeta.ts`: award lookup (`indentAwardOrgByIndentId`, `orgNameById`), supplier by linked organization.
- `features/trips/screens/TripsScreen.tsx`: award map from the shared indents query plus a chunked `indents` lookup for trips whose indent is not loaded; supplier fallback rows keep avatar / linked org; award orgs added to the linked-org profile cache.
- `lib/useLinkedOrgProfileMap.ts`: optional `extraOrgIds`, passes `organizationName` through.
- `features/trips/utils/__tests__/tripHubPartyMeta.test.ts`: new.

## Migrations
- None.

## Tested
- ci-baseline typecheck 346/346, lint 98/98, cycles 94/94, lib-files 178/178.
- `npm run test:navigation-policy`: 64/64.
- `npx jest --ci --silent`: 780 suites passed (1 skipped), 5646 tests passed, 3 skipped.
- Not clicked through.
