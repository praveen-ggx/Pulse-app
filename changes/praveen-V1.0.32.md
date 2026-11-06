# praveen/V1.0.32

## What
- **Cancel trip (pre-pickup)** and **Simulate / Revoke Last** are limited to organization **owners and admins** only.
- Dispatchers, sales, and other member roles no longer get those actions in trip detail.

## Why
- Those actions change trip lifecycle in ways that should stay with org leadership.
- Trip Ops members currently had Simulate / Revoke Last via `tripops.trips.simulate`, and Cancel trip via assign capability alone.

## Areas
- `lib/memberSurfaces.ts` — `ownerAdminOnly` flag; `tripops.trips.simulate` + new `tripops.trips.cancel`
- `features/trips/components/trip-detail/TripDetailScreen.tsx` — Cancel trip gated on `tripops.trips.cancel`
- `features/organization/components/MemberPermissionsPanel/DomainPermissionToggleRow.tsx` — owner-only rows shown locked
- `supabase/migrations/20261106121132_tripops_simulate_cancel_owner_admin_only.sql` — TripOps manager allowlist drops simulate
- `docs/RBAC_OPERATING_MODEL.md`, `docs/RBAC_OPERATING_MODEL_CHANGELOG.md`
- Tests: `rbac.memberAccess.test.ts`, `rbac.departmentManager.test.ts`

## Migrations
- `20261106121132_tripops_simulate_cancel_owner_admin_only.sql`

## Tested
- `npx jest lib/__tests__/rbac.memberAccess.test.ts lib/__tests__/rbac.departmentManager.test.ts --ci --silent`
- UI: not clicked through
