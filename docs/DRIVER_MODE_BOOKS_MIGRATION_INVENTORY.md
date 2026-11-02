# Driver-mode books: migration inventory

Release branch: `vasanth/driver-mode-books` (PR #67).

This inventory is **immutable from here on**: listed files are not edited again. Fixes go into new forward migrations only.

## Files, in apply order

None of these are on the production branch `V1.0.1` (`2e78da38`).

| # | Migration | SHA-256 (prefix) | Commits | Purpose |
|---|---|---|---|---|
| 1 | `20271101154500_ensure_dco_workspace.sql` | `fcb327601b5d` | added `bb373be4`, **edited in place** `a1bd7301` | DCO-owned ASSET_BASED workspace |
| 2 | `20271101184600_ensure_dco_workspace_qualify_returning_id.sql` | `62421339d745` | added `bb373be4`, **edited in place** `a1bd7301` | fixes `RETURNING id` ambiguity in #1 |
| 3 | `20271101222100_tag_dco_trip_party.sql` | `fec6499b4646` | added `bb373be4`, **edited in place** `a1bd7301` | Party B tag RPC. Original: 2-arg, no operating-mode/workspace check. Edited: 3-arg + checks + drops the 2-arg overload |
| 4 | `20271102003100_dco_self_financial_book.sql` | `87e82b092f8b` | `a1bd7301` | `dco_self_*` tables, RPCs, RLS |
| 5 | `20271102114500_driver_indie_financial_book.sql` | `b0e299984e9c` | `bbbdf8b0` | Independent DRIVER book |
| 6 | `20271102120000_dco_self_finance_visibility.sql` | `94acae74e73c` | `bbbdf8b0` | Finance Self visibility |
| 7 | `20271102134500_tag_dco_trip_party_no_notes_finance.sql` | `29916c0eaf63` | added `e3163680` (`f5ab54071671`), **appended** `370fc2fa` (2-arg `DROP`) | tag RPC: no notes marker, no `dco_party_billed`, ignores `p_billed` |
| 8 | `20271102141500_drop_legacy_tag_dco_trip_party_overload.sql` | `90bd81b453c2` | this change | idempotent forward `DROP` of the unchecked `tag_dco_trip_party(uuid, uuid)` |
| 9 | `20271102183000_dco_self_issue_trip_scope.sql` | `2d8422df6f25` | release remediation (from `79171699`) | `issue_dco_self_receivable`: trip must be live; outside the Self workspace it must be `operating_mode = 'DCO'` and driven by the caller; one non-void receivable per trip (`dco_self_receivables_active_trip_uidx`); constraint-specific conflict handling. Stops instead of rewriting rows if duplicates already exist |

### Why #8 exists although #3 and #7 already contain the drop

An environment that applied an **earlier body** of #3 (the original `bb373be4` file) or of #7 (the `e3163680` file, hash `f5ab…`) never re-runs either file. In that environment the unchecked 2-arg overload survives, and a 2-arg named-argument RPC call would resolve to it. #8 is a separate version, so it runs in every environment.

#8 takes the next non-midnight key after #7. `supabase migration new` would stamp the real 2026 clock, which sorts before this 2027-dated head; `20271005190000` set the same precedent.

## Environment status

| Environment | Recorded state | Verified? |
|---|---|---|
| Production `nafxpivddesgsrthmosv` | none of #1–#8 expected (not in `V1.0.1`) | **UNVERIFIED** (needs approved read-only access) |
| Preprod `xbisiveavvbifbzyfhgy` | #4 "realized via compat; do not replay"; #5–#8 on the dry-run allowlist; #1–#3 "remote apply status UNVERIFIED" (`docs/DCO_SELF_FINANCIAL_BOOK_PLAN.md`) | **UNVERIFIED** |

**Preprod holds PR #65's DCO Self objects** (recorded `20261101184143`, `20261101184214`; `ensure_dco_workspace` is PR #65's pinned version). #4 would fail there (same argument types, renamed parameters) and #1/#2 would overwrite the pinned workspace function. Preprod is not a valid target for this set until it is reconciled under a separate approval.

### The `20271102003100` discrepancy

The release set records that #4's objects already existed on preprod ("realized via compat") and that #4 must not be replayed. The repository holds no record of how that happened. The most likely explanation is that the objects were created outside `db push` during development, so the version row and the object bodies may not match the committed file.

Until verified, preprod's #4 objects must not be assumed to equal the file.

### Read-only verification (approved access required)

Run against preprod, then production:

```sql
select version from supabase_migrations.schema_migrations
 where version between '20271101000000' and '20271102999999' order by version;
-- expect only tag_dco_trip_party(uuid,uuid,numeric) once #8 has run
select oid::regprocedure from pg_proc where proname = 'tag_dco_trip_party';
select relname, relrowsecurity from pg_class
 where relname in ('dco_self_parties','dco_self_receivables',
                   'dco_self_receivable_versions','dco_self_collections');
```

Only report the overload as "removed" in an environment where the first query shows it was present before #8 ran. Otherwise report "absent", not "removed".

## Ordered plan for a future authorised production release

This is a plan only. Nothing is approved.

1. Run the read-only checks on production and record the results.
2. If none of #1–#8 is present, apply #1 → #8 **one version at a time** (`db-push-set`), never a generic `supabase db push`.
3. If any are partially present, stop and reconcile each object against its file before applying anything.
4. After applying:
   - re-run the checks;
   - confirm only the 3-arg tag function exists;
   - confirm RLS is on all four `dco_self_*` tables;
   - run the contract tests.
5. Only then deploy the app build that depends on them.
