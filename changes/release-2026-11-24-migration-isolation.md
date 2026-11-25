# PR #149 — Migration Isolation Follow-up

**Frozen RC:** `242ebc4c3cef45d58c5946f118f46a6e0115bc92`  
**Follow-up commit:** `0998a902712d6b7174cb531a493d92e8a988f0c3`  
**Migration branch (remote):** `vasanth/migration-reconcile-20261124` @ `c41b2563c0fbd1b8d349389e22890496e68e95a3`

## Before → after

### Before (three-dot `V1.0.1...242ebc4c3`)

14 SQL paths + 1 replay test in the application PR diff.

### After (isolation)

| Action | Paths |
|---|---|
| **Removed** from app branch (preserved on migration branch) | 9 SQL + 1 test (ten-file set) |
| **Restored** to exact `V1.0.1` bytes | 5 previously applied SQL files with content drift |

### Ten-file preservation set (checksums = `242ebc4c3` / migration branch)

| File | SHA-256 |
|---|---|
| `20261029170000_organization_member_warehouses_before_department_manager.sql` | `3174b4ed5b8d6474e38ce018d5558b660d3a0a7feae977e8f5bb5cade627d36d` |
| `20261112140000_indents_award_revoked_at_before_reference.sql` | `83e11ca12270b810cd704775f036ac9677436ee75fff72b6ba6771312427deae` |
| `20261113100000_is_org_staff_before_pool_bid_policy.sql` | `275779dd754a57ae40dcb315f26a1ed892eff6605dc0d9f802eb87512fd6644b` |
| `20261113104000_direct_quote_names_return_before_pool_reissue.sql` | `ba2ac98def08af1a05d8b15eae4e0e8f9ea73492b9e89ca87e87c77d0e891225` |
| `20261114110000_trips_owner_vehicle_id_before_plate_link.sql` | `30020fbec3da54347efa3c57003e51358303c2453d13b91abc7386edf06c40f3` |
| `20270309030100_restore_my_org_market_bids_identity.sql` | `ea07aa27852bf96de6858fad56000df7c3c66876a86d4740724a577ceea3f5fc` |
| `20270917100030_restore_warehouse_assignment_admin_policy.sql` | `4e4cf45b0afb9023944d8b7201300f4da731754780c376831ba52a9e586d6afc` |
| `20271106053000_hot_path_trip_cover_indexes.sql` | `fc254ac57d5b3f41023aa42208af05a6f44ef7bacd8e5d242557faf71cca6743` |
| `20271118194500_bulk_payment_post_record.sql` | `08f1d30c1bc5c5ec3067dfd2613e4480887a2ac80e47bf993d764253f895eeb0` |
| `organizationMemberWarehousesReplay.contract.test.ts` | `c89ad7d04328a0b9c7bc7de5e2e804f82458602dceff1be4eb0ef96af3872d76` |

Byte-identical to `242ebc4c3` and to remote migration branch tip. Remote push verified (`personal/vasanth/migration-reconcile-20261124`).

### Five restored to `V1.0.1`

- `20270304120000_list_my_org_market_bids.sql`
- `20270921182802_pause_diagnostic_crons_during_unhealthy.sql`
- `20270922143500_guard_http_queue_url_and_rpc_grants.sql`
- `20271006185000_pulse_exchange_repair_sat812_trp191.sql`
- `20271027155318_get_trips_for_org_date_range.sql`

## Database policy

- **Zero** `db push` / repair / reset / manual SQL on prod or preprod for this release.
- Application code from `242ebc4c3` fixes preserved (merge parse + lint + idempotency test).
- `bulk_payment_post_record` remains out of application scope (on migration branch only).


## Local validation (isolated tree, before follow-up commit)

| Gate | Result |
|---|---|
| Full Jest | PASS — 922 suites passed / 1 skipped; 6546 tests passed / 3 skipped |
| Lint | PASS — 97 ≤ 98 |
| Typecheck | PASS — 322 ≤ 344 |
| lib-files | PASS — 178 |
| Navigation | PASS — 69/69 |
| V2 | PASS — 197/197 |
| Targeted compliance/idempotency/hub | PASS — 30/30 |
| build:ci | PASS |
| Cycles | NOT RUN (SQL-only change) |
| Node 22 | NOT RUN |
| GitHub CI | BLOCKED (billing) |
| Browser smoke | NOT RUN |
| Preprod acceptance | BLOCKED |
| DB apply | NONE |

App fixes from `242ebc4c3` preserved (no diff on complianceAdvanceFinanceBreakdown / lint / idempotency test files vs that commit aside from migration paths).
