# Pulse → AWS Microservice Migration Ledger

## Purpose

Pulse-app is the current source application. AWS microservices are a separate workstream. This ledger records what a future engineer must reproduce, replace, or redesign when a Pulse-app capability moves.

It does not assign a future service. Where that decision has not been made, the entry says TBD.

Scope of this revision: committed delta `17cf7325aaa5880a974bb3723c07b00045598d75..b6b7a0a68c8d939e1f6d2bcacef0cc55acab2b6f` on `V1.0.1`. That delta is not pushed and not deployed. Generated 2026-10-05.

## Rules

Before a deployment, update this file and `docs/deployment/CHANGELOG.md` for every change that may move to AWS.

Do not record uncommitted work as deployed. The working tree is listed only so it is not confused with DEP-2026-001 or DEP-2026-002.

Statuses: NOT APPLICABLE, PULSE ONLY, MIGRATE LATER, READY FOR EXTRACTION, ALREADY EXTRACTED, REQUIRES CONTRACT, REQUIRES DB MIGRATION, BLOCKED.

## Summary

| ID | Date | Domain | Feature | Pulse implementation | DB/API contract | Future AWS service | Migration status | Dependencies | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| DEP-2026-001 | 2026-10-05 | Driver Web / Platform | Metro chunk rewrite; five Driver routes import screens directly | `polyfills/webChunkRecovery.js` and five `app/(driver)` routes | None | NOT APPLICABLE | NOT APPLICABLE | Existing `metro.config.js` hook, not changed in this commit | COMMITTED — NOT DEPLOYED |
| DEP-2026-002 | 2026-10-05 | Commerce / Driver Execution | Authoritative trip-list Commerce origin | `trips_driver_view` plus `getDriverTripExperience` | `driver_owned_indent_execution_plan_id(uuid)`; view columns `execution_plan_id`, `is_commerce` | TBD | REQUIRES DB MIGRATION | `20270913090000` column (read, not created); `20270912140000` view body | CODE COMMITTED. MIGRATION NOT APPLIED. DEPLOYMENT PENDING |

## DEP-2026-001

- Change ID: DEP-2026-001
- Source commit: `26533561c0f6becdd075a4bc97b2fa06e37c1846`
- Domain: Driver Web / Platform
- Current owner: Pulse-app web client
- Future AWS service: NOT APPLICABLE
- Extraction design: not applicable
- DB objects: none
- Status: COMMITTED — NOT DEPLOYED
- Notes: Same-origin `*.bundle` URL rewrite, plus direct imports on available-loads, available-loads detail, profile, trip-history, and wallet. Do not port this into a backend service.

## DEP-2026-002

- Change ID: DEP-2026-002
- Source commit: `b6b7a0a68c8d939e1f6d2bcacef0cc55acab2b6f`
- Domain: Commerce / Driver Execution
- Current service ownership: PULSE-APP / SHARED DB
- Future AWS service: TBD
- Extraction design: TBD
- Status: REQUIRES DB MIGRATION. Code is committed. Migration file is in git. Migration is not applied. Release is not pushed.

### Business contract

Given an authenticated Driver and a trip that driver owns, return the authoritative Commerce origin.

Conceptual output:

- `execution_plan_id`
- `is_commerce`

Commerce means `indents.execution_plan_id` is non-null for the indent linked to that owned trip.

Link order:

1. `trips.indent_id`
2. If that lookup does not yield a plan id, `trips.source_indent_id`

Those columns are not interchangeable. Shipper, marketplace, and network trips use `indent_id`. Mover asset trips leave `indent_id` null and use `source_indent_id`.

Do not derive Commerce from the number of orders or stops, or from `client_price`.

### Current call path

```
Driver App
→ Supabase / PostgREST
→ trips_driver_view
→ driver_owned_indent_execution_plan_id()
→ indents.execution_plan_id
```

The Driver list does not query `indents` and does not call `get_driver_trip_stop_orders` to classify the list.

### Future call path

```
Driver App
→ AWS service / API
→ service-owned Commerce / Execution origin contract
```

FUTURE EXTRACTION NOTE. The future service must preserve the business contract above. It does not have to keep this SQL function. EXTRACTION DESIGN: TBD. AWS SERVICE: TBD.

Security requirement for that future API: enforce Driver trip ownership. Do not expose `indents.execution_plan_id` to arbitrary clients.

### Database contract in the unapplied migration

`20270913091000_driver_commerce_origin_read_boundary.sql`

| Object | What this migration does | Ownership now | Future ownership |
| --- | --- | --- | --- |
| `public.driver_owned_indent_execution_plan_id(uuid)` | Creates the function. `SECURITY DEFINER`, `SET search_path TO 'public'`, `STABLE`, returns `uuid`. Execute for `authenticated` only. Revoked from `PUBLIC` and `anon`. No `service_role` grant. | PULSE-APP / SHARED DB | Architecture decision required |
| `public.trips_driver_view` | Replaces the view. Stays `security_invoker`. Adds `execution_plan_id` and `is_commerce`. Keeps the existing `auth.uid()` driver filter. | PULSE-APP / SHARED DB | Architecture decision required |
| `public.indents.execution_plan_id` | Read only. Not created here. Created earlier by `20270913090000`. | CURRENT OWNERSHIP: Shared / Decision Required | FUTURE OWNERSHIP: Architecture decision required |
| `public.indents` SELECT | Not granted to drivers | Driver RLS unchanged | Do not weaken this to make the list work |
| Indexes, triggers, storage, RLS policies | None added | — | — |

Helper predicate: `drivers.user_id = auth.uid()` and the trip row links the argument through `trips.indent_id` or `trips.source_indent_id`. Null, unknown, and unowned inputs return null. The function does not return customer, order, or money columns.

`get_driver_trip_stop_orders` is unchanged. It joins `indents` on `trips.indent_id` only. It is a per-trip detail RPC, not this list contract. Copying it alone misses mover asset trips.

### Deployment order

1. Apply `20270913091000_driver_commerce_origin_read_boundary.sql`.
2. Ship the Pulse-app client in `b6b7a0a6` (the list reads the view and does not select `indents`).

The client is not deployed today. Missing columns are not a production incident until that client ships.

If the client ships without the migration, `execution_plan_id` and `is_commerce` are absent and classification falls back to `STANDARD_FTL`.

No AWS deploy step exists until a service is decided.

### Backward compatibility

REQUIRES COORDINATED DEPLOYMENT for the feature. Older Driver builds keep the blocked `indents` read and stay `STANDARD_FTL`. No existing RPC signature changes. Added view columns are ignored by clients that do not read them.

### Rollback

Revert or withhold `b6b7a0a6` if the migration was never applied. If it was applied, restore the `20270912140000` view and drop `driver_owned_indent_execution_plan_id(uuid)`. Do not drop `indents.execution_plan_id`.

## Future extraction risks

Evidence from this delta:

1. Deploying the Commerce client without the database migration removes authoritative classification. The view will not have `execution_plan_id` or `is_commerce`, and the list falls back to `STANDARD_FTL`.
2. Removing those view columns later, without a replacement API, causes the same fallback.
3. Copying `get_driver_trip_stop_orders` alone is not enough. Mover asset trips can carry the load indent on `source_indent_id` with `indent_id` null. That RPC joins on `indent_id` only.
4. Granting Drivers direct `SELECT` on `indents` would weaken the boundary this change kept. The helper returns one uuid after an ownership check.
5. A future AWS implementation must enforce Driver trip ownership. An authenticated caller must not read another driver’s plan id.
6. A future AWS implementation must keep both link semantics: plan from `indent_id`, then `source_indent_id` only when that first plan id is null.
7. A future AWS implementation should keep `execution_plan_id` as the authoritative origin. Do not classify Commerce from order count or stop count.

## UNRELEASED / WORKING TREE

Not ledger entries. Not in DEP-2026-001 or DEP-2026-002.

DCO, Fleet Owner retirement, uncommitted Marketplace wording, untracked DCO migrations `20271005120000` and `20271005130000`, untracked `20270930173000_collapse_long_haul_health_odometer_scan.sql`, `VaultUploadedDocPreviewStrip.tsx`, temporary QA/SQL scripts, and `.worktrees/` remain uncommitted. AWS SERVICE for that work: TBD. It is not part of this release.
