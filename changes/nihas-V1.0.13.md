# nihas V1.0.13 — Ground Ops see only their warehouses' indents (read-only)

## What
- **Indents for Ground Ops, scoped to their warehouses.** A Ground Ops member now sees the indents behind the trips they already see: the indent's warehouse, or its sales order / execution plan pickup or drop warehouse, is one of their allocated warehouses. Same rule as their trips (`ground_ops_can_see_trip`), so trips and indents can't disagree. Before, the database gave them no indents at all.
- **Read only.** They still cannot create, edit, award, cancel or share indents: the existing write rule still excludes them, and the Trips hub hides the indent card actions (share, marketplace, Pulse story, broadcast, Review / award) for them. Tapping a card opens the indent detail, which now lets Ground Ops view (it required `tripops.indents.view`, which depends on the Sales tab); every action there keeps its own `tripops.indents.*` permission.
- **Clean re-sync.** The indent cache version goes from 3 to 4, so every device does one full indent sync after this ships (a Ground Ops sync cursor from when they saw nothing could otherwise skip older indents).

## Why
- 22 Oct: Yadagiri (Ground Ops, 22 Megha Engineering warehouses) saw Sunflag, Apollo and Berger indents on prod. That list was an admin's cached indent list from an earlier login on the same browser (191 / 109 / 62 / 129 match an admin's newest-500 exactly); the database returned no indents for Ground Ops. The cache leak is fixed by PR #23 (clear saved data on user switch, in release PR #11). Owner decision: Ground Ops should see their own warehouses' indents, not none.

## Areas
- supabase/migrations/20261022100607_ground_ops_warehouse_indents_read.sql (policy + `get_indents_delta`), features/trips/screens/TripsScreen.tsx (read-only indent cards), features/indents/components/IndentDetailScreen.tsx (view for Ground Ops), features/indents/services/indents.service.ts (cache schema v4), docs/RBAC_OPERATING_MODEL_CHANGELOG.md.

## Migrations
- `20261022100607_ground_ops_warehouse_indents_read.sql`: SELECT-only policy `indents_ground_ops_select_assigned` on `indents`, and a new body for `get_indents_delta` (Ground Ops get their warehouses' indents instead of an empty list). Uses the existing `ground_ops_can_see_trip` (already on prod, `20271008120000`). Additive; no table or data changes. Not applied anywhere yet. Needs preprod push after merge and a prod release set.

## Tested
- Rule checked read-only on prod data, acting as Yadagiri (`ground_ops_can_see_trip` evaluated with his user id): 422 indents, all Megha Engineering (168 open and unallocated, 11 failed); another Ground Ops member gets only their own single warehouse.
- New `groundOpsWarehouseIndents.migration.contract.test.ts` (4: SELECT-only policy, same helper as trips, delta filter, no write path). Indent tests 146 pass. Full jest 529 suites / 4151 tests pass (1 skipped as before). ci-baseline lint 103 (≤104), typecheck 61 (≤89), cycles 111, lib-files 178; navigation-policy 64 pass; git diff --check clean; db:preflight all pending files non-empty.
- Not clicked through in the UI. Migration not applied to preprod or prod.
