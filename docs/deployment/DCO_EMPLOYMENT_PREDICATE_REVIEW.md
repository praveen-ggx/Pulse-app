# DCO employment predicate: pre-apply review record

Status: **ready for final pre-apply review, not authorized to apply.** Production apply
needs: daytime monitoring clean, Driver Execution Authority accepted, final review of this
record, explicit authorization. Ships alone: not bundled with the DCO Wallet UI commit or
the Multi-Order UI release.

## Evidence classification

| Driver | Evidence type | Use in release report |
|---|---|---|
| `1026422b` | **Production UI actions** (2026-10-06, local dev web app on production): disconnected both fleets via Wallet → Self at 01:51:39/42 UTC; then Reach bid → shipper award (TRP063, 02:04:38) → driver reject → bid → `leave_fleet` Godrej (02:13:54) → award TRP065 (02:14:29), which re-attached the Godrej `tracking_only` stub. Membership stays `inactive`. | **Excluded** from predicate effectiveness. Eligible regardless of this migration. Not restored by this migration; any restoration is a separate, explicitly authorized action. |
| `f3beccae` | **Migration effect**: only roster row in `dc771ec3` (Godrej, a shipper) is a `market_award` trip stub | Positive case: must go `DCO_EMPLOYMENT_CONFLICT → DCO` |
| `6e31cf96` | **Regression protection**: `active_employee` in `aad4d03c` (plus a Godrej `market_award` stub) | Must stay `DCO_EMPLOYMENT_CONFLICT` |

Invariant: a driver is employed if any employment-counting roster relationship exists.
An independent-only relationship does not count, and a `tracking_only` trip-assignment
stub never counts: a Marketplace/Reach shipper that awards a bid is not an employer.

Purpose: the predicate protects an independent DCO from being classified as employed when
a later Marketplace award creates or re-attaches a `tracking_only` assignment row in the
shipper org. `1026422b`'s current eligibility comes from the production Disconnect
actions and is not evidence for this migration.

## Artifact

| Item | Value |
|---|---|
| Migration | `supabase/migrations/20271006015124_dco_employment_ignores_independent_roster_membership.sql` |
| SHA-256 | `157072646bc71c15cbfddfd5d144ea890f8495464aa07bb00f1558176aea2766` (amended 2026-10-06 to ignore `tracking_only` stubs; superseded `daa01153…`) |
| Release set | `supabase/release-sets/dco-employment-predicate.versions` → `20271006015124` only |
| Apply (after authorization) | `MIGRATION_APPLY_CONFIRM=dco-employment-predicate npm run db:push-set -- dco-employment-predicate` |

The CLI generated `20261006015124` (real UTC), which sorts before the repo's
future-dated head `20271005223000` and before `20271005120000`, the migration it
replaces. It was renamed to `20271006015124` (same non-midnight time of day). The version
is absent from remote `schema_migrations`.

`npm run db:push-set -- dco-employment-predicate --dry-run` (2026-10-06, re-run after the
amendment): snapshot Local-only list equals the set; "Would push" lists only `20271006015124`.

## Change

One `CREATE OR REPLACE FUNCTION public._is_active_employee_driver(uuid)`, plus the same
three `REVOKE`s as `20271005120000`. Signature, `LANGUAGE sql`, `STABLE`,
`SECURITY DEFINER` and `search_path ''` are unchanged. No table DDL, no client change.

A driver membership no longer counts as employment when the org has at least one current
(`left_at IS NULL AND deleted_at IS NULL`) roster row for that user and **every** such row
is `independent` or `tracking_only`. `active_employee` rows (including a `tracking_only`
one), memberships with no roster row, and orgs with any non-stub NULL or other-status
current row still count.

Why stubs: on award, `_resolve_or_create_market_driver` creates or re-attaches a
`tracking_only`, `market_award`, `independent` row in the shipper org (a trip's driver
must belong to the trip's org). Awards create no `organization_members` row; the active
memberships on stubs come from the Sep 15 ADR-010 backfill. Live roster rows with a user:
every `tracking_only` row is a stub (`market_award` 5 current, `phone_assignment` 15,
legacy 3); no `tracking_only` row is `active_employee`.

## Live baseline (pre-apply)

| Object | md5(pg_get_functiondef) |
|---|---|
| `_is_active_employee_driver(uuid)` (live) | `2e5838dc0b473d8b949ae48e4d433d30` |
| `_is_active_employee_driver(uuid)` (after replace, in rolled-back probe) | `bf03ebd3d2226be38332cabb72cd7f35` (amended; superseded `d75aef06…`) |
| `is_dco_eligible(uuid)` | `21a830d05d6a333561e939b14e8a2d3f` |
| `get_my_driver_operating_mode()` | `98557c91af60b6de7f2e38443699d59e` |
| `platform_approve_dco(uuid)` | `0a9ab93ceba5348d61c54537221f6e1c` |
| `platform_reinstate_dco(uuid)` | `a53eba09c1e571afcb914ea16cc32243` |

ACL `{postgres=X/postgres,service_role=X/postgres}` before and after.

Dependency closure: exactly these 4 functions reference the predicate; 0 views,
0 materialized views, 0 RLS policies. `is_dco_marketplace_eligible` reaches it only via
`is_dco_eligible`. Referenced columns (`organization_members.user_id/organization_id/role/status`,
`drivers.user_id/organization_id/left_at/deleted_at/relationship_status/tracking_only`) exist on remote.

Caller semantics (final review must re-confirm against the hashes above):

- `is_dco_eligible`: `APPROVED AND NOT employed`. Narrower employment ⇒ more eligible.
- `get_my_driver_operating_mode`: `APPROVED AND employed` ⇒ `DCO_EMPLOYMENT_CONFLICT`.
- `platform_approve_dco` / `platform_reinstate_dco`: raise `employment_conflict` when
  employed. Independent-roster-only drivers become approvable/reinstatable.

## Rolled-back production probe (2026-10-06, re-run on the amended text)

`scripts/sql/_tmp_dco_predicate_probe.sql`: one `DO` block ending in `RAISE EXCEPTION`
(lock_timeout 2s), executing the migration's exact CREATE text. Live md5 re-read after
the run: unchanged (`2e5838dc…`). Non-AccessShare relation locks held: none.
Membership classification: 21 with an `active_employee` row, 26 independent-or-stub only.

| Assertion | Result |
|---|---|
| `f3beccae` → eligible (`DCO_EMPLOYMENT_CONFLICT → DCO`, marketplace false → true) | pass |
| `1026422b` | excluded (manual disconnect; eligible before and after) |
| `6e31cf96` → stays `DCO_EMPLOYMENT_CONFLICT` (active_employee in `aad4d03c`) | pass |
| Users with an `active_employee` row still employed (21 users) | 0 violations |
| Independent-or-stub-only users no longer employed (19 users) | 0 violations |
| Users with no-roster / non-stub NULL / other-status membership still employed | 0 such users in production; covered by the synthetic matrix |
| Users flipping not-employed → employed | 0 |
| Mode changes for users whose employment did not flip | 0 |

Note: `1026422b` called `leave_fleet` for orgs `89427247` and `dc771ec3` at
01:51:39 / 01:51:42 UTC via the local dev web app (`localhost:8081`, Wallet → Self
Disconnect). Their roster rows are now `disconnected` and memberships `inactive`, so
they are DCO-eligible regardless of this migration.

No production instance of "membership with no roster row" exists, so the full case
matrix was also run against the migration's exact body on temp-table copies
(`scripts/sql/_tmp_dco_predicate_logic_cases.sql`, rolled back): 20/20 pass, covering
active_employee, independent, no roster row, NULL status, independent+NULL, left row,
soft-deleted row, cross-org independent, disconnected-but-current row, mixed orgs,
inactive membership, independent+active_employee in the same org, and the stub cases:
NULL-status stub (not employed), `market_award` stub (not employed), stub + non-stub
NULL row (employed), `tracking_only` active_employee (employed), left stub (employed:
membership with no current row).

## Blast radius

42 users evaluated (active driver memberships ∪ current roster rows ∪ dco_profiles).
19 change `_is_active_employee_driver` true → false:

- 1 approved DCO: `f3beccae` (`dc771ec3` independent): conflict → DCO, gains Marketplace.
- 18 non-DCO drivers (`dco_profiles` none, profile role `driver`): employment flag only.
  Operating mode stays `DRIVER`, `is_dco_eligible` and marketplace eligibility stay false.
  All 18 are independent-only roster drivers:
  `11289de9 275d88ed 2890c0f2 6e2b980a 9ce39411 c1cded1c c9463820 de385ce4 eb889ab2 f484524e`
  (org `5b471ecb`), `27da417b` (`dc9d2063`), `43764433` (`163f7589`), `44551066`
  (`a92cf1f6`), `56e374f6 d0f8d11b ea29631d` (`89427247`), `76b2ade1`
  (`d0d5e14e`, `f6be40d7`), `f9fe675f` (`f6be40d7`).
  Practical effect: if any of them later applies for DCO, approval is no longer blocked
  by the independent roster link.

## Apply runbook (only after explicit authorization)

Pre-apply (read-only):

1. Re-hash the four callers and `_is_active_employee_driver`; all must equal the
   "Live baseline" table above. Any drift → stop and re-review.
2. Confirm `20271006015124` is absent from remote `supabase_migrations.schema_migrations`.
3. Confirm `dco-employment-predicate.versions` lists exactly `20271006015124`, and the
   migration SHA-256 equals the value in "Artifact".
4. `npm run db:preflight`, then `npm run db:push-set -- dco-employment-predicate --dry-run`
   ("Would push" must list only `20271006015124`).

Apply:

5. `MIGRATION_APPLY_CONFIRM=dco-employment-predicate npm run db:push-set -- dco-employment-predicate`

Post-apply (read-only):

6. `_is_active_employee_driver` md5 = `bf03ebd3d2226be38332cabb72cd7f35`; ACL unchanged;
   the four caller hashes unchanged.
7. Re-run the eligibility comparison read-only (no function replacement), with
   `1026422b` reported as excluded / manual disconnect:
   - `f3beccae` → mode `DCO`, marketplace eligible;
   - `6e31cf96` → `DCO_EMPLOYMENT_CONFLICT`;
   - independent-only and stub-only population → not employed;
   - active_employee / non-stub NULL / mixed / no-roster users → still employed.

## Open follow-up: memberships backed only by trip stubs

22 active driver memberships (5 on `market_award` stubs, 17 on other `tracking_only`
stubs) exist only because of the Sep 15 backfill. This migration stops them counting as
employment; it does not change what they grant. No membership is modified by this
migration.

Read-only RLS audit (2026-10-06, `scripts/sql/_tmp_stub_membership_rls_audit.sql` plus
`pg_policies` reads). `is_org_staff` (127 policies, 84 tables) lists roles
`owner, admin, member, dispatcher, finance` and excludes drivers. These checks do **not**
exclude `role = 'driver'`, so any active driver member, including a stub-only member in a
shipper org, gets:

| Policy | Grant | Severity |
|---|---|---|
| `supplier_tds_rates` "Org members manage supplier tds rates" (ALL, `is_org_member`) | read/insert/update/delete the org's supplier TDS rates | High |
| `chat_conversations` select/insert/update (`fn_chat_is_org_member`) | all org conversations; helper has **no `status` check**, so inactive members keep access | High |
| `driver_locations`, `trip_location_checkpoints` "Trip partners read…" (`is_org_member(t.organization_id)`) | GPS/checkpoints for every trip in the org | Medium–high |
| `trip_documents_org_member_insert` (`can_insert_trip_document`) | upload documents to any org trip | Medium |
| `operational_sequence_rollover_log` select, `organizations` "read orgs they belong to" | org row, sequence log | Low |

The first four also apply to genuine employee drivers; they are pre-existing RLS scope
issues, not caused by the stubs. Remediation is a separate, explicitly authorized
security change (policy scoping to staff and/or the trip's assigned driver; status check
in `fn_chat_is_org_member`) and must be designed so driver-app trip access, which uses
the trip's assigned driver row, keeps working. Deactivating stub-only memberships is a
separate data decision.
