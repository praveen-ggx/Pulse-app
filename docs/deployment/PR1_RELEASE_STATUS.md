# PR #1 release status

Decision: **BLOCKED**. This report does not approve a merge, a migration apply, or a production deploy.

Verified 2026-10-14 from the repository, GitHub Actions, and one local disposable Postgres. Production data was not written. No migration was applied to the linked project.

## Identity

| Item | Value |
| --- | --- |
| Repository | `Vasanthgogox/Pulse-app` |
| PR | https://github.com/Vasanthgogox/Pulse-app/pull/1 |
| Base | `V1.0.1` @ `0de8638faf2c7980b06366cf82ea852236621788` |
| Head whose CI is recorded below | `cc8e89edf5a02532edb36a51c302ea1200dc11f5` on `nihas/team-sync-v1.0.1` |
| State at that read | OPEN, not draft, MERGEABLE, `mergeStateStatus` UNSTABLE |
| Reviews | 0 reviews, 0 requested reviewers, `reviewDecision` empty |
| Branch protection | Unknown. `GET /branches/V1.0.1/protection` returned HTTP 403 |
| Worktrees left untouched | Main checkout `V1.0.1` @ `7f34e4cf` (dirty). Preflight worktree detached at `0de8638f` |

`5dd3bb62` is the parent. This file records the CI that ran on `cc8e89ed`, which contains the disposable tests. A later documentation commit that only updates this file is not that run.

The diff `0de8638f...4c724c2d` is 358 files, +47019 / −10243. A line-by-line review of all 358 files was not completed. Hotspot review covered POD, finance functions, `get_trips_for_org` callers from prior catalog work, Ground Ops, the Godrej predicate, and the five failing Jest sources.

## CI for `cc8e89ed`

Completed run: https://github.com/Vasanthgogox/Pulse-app/actions/runs/38553423271

`headSha` `cc8e89edf5a02532edb36a51c302ea1200dc11f5`. Workflow conclusion: failure.

| Check | Result |
| --- | --- |
| Navigation policy gates | Passed |
| App TypeScript (strict) | Passed |
| Domain boundary lint | Passed |
| Pulse V2 isolation (first slice) | Passed |
| Circular dependency check | Passed |
| lib/ root file count gate | Passed |
| App unit tests (Jest) | Failed |
| Netlify deploy preview | Not part of this workflow run |

Jest log totals: `Test Suites: 5 failed, 1 skipped, 507 passed, 512 of 513 total`. `Tests: 11 failed, 3 skipped, 4015 passed, 4029 total`. The +1 pass versus `5dd3bb62` (run `38552321725`: 4014 passed / 4028 total) is the extra assertion in `pr1ReleaseGuards.test.ts`. `62679d2a` (run `38551814562`) was 4014 / 4028. `4c724c2d` (run `38550559222`) was 4010 / 4024. `3dc476fb` (run `38523532150`) was 4003 / 4017. The Jest check is not waived.

Failing suites on run `38553423271`, and the same five files are identical to `0de8638f` (`git diff` empty for the suites, `app/sign-in.tsx`, `LoadCenterView.tsx`, `features/chat/contexts`, and `lib/suite/suiteAuth.ts`):

1. `app/__tests__/sign-in.test.tsx` — `renders correctly` and `redirects through navigateAfterSuiteAuth once a user is present`.
2. `features/network/components/__tests__/sponsoredReachCommercialSurface.test.tsx` — `Network pool lists render incomplete-lane loads review-only, never with a Bid card`.
3. `features/chat/contexts/__tests__/IntegratedChatContext.bootstrapDedupe.test.tsx` — five bootstrap-dedupe cases.
4. `features/network/services/__tests__/mutualConnectionsPartnerDisplay.test.ts` — `does not call partner-display when the RPC already returned avatar_url` and `batches only ids that are missing avatar_url`.
5. `features/network/components/__tests__/loadCenterMarketplaceGate.test.ts` — `Load Center does not auto-fetch open Marketplace`.

Exact assertion text from the previous completed log (`38551814562`), unchanged by the docs-only commit: sign-in timeout plus `TypeError: normalizeSuiteReturnTo is not a function`; sponsored reach `toContain "pooledMode && renderPoolMemberCard"`; chat `toHaveBeenCalled` / `toHaveBeenCalledTimes(0)`; mutual-connections dynamic import without `--experimental-vm-modules`; load center `toContain "Load more"`. `suiteAuth.ts` re-exports `normalizeSuiteReturnTo` on both commits. These suites were not edited.

## Local source guards

Command, from the dedicated worktree, after `--rootDir` was set to that worktree:

```bash
npx jest --rootDir /Users/ggx/Desktop/Pulse-app/.worktrees/pr1-pod-dispatch \
  --config /Users/ggx/Desktop/Pulse-app/.worktrees/pr1-pod-dispatch/jest.config.js \
  --watchman=false --no-coverage --forceExit \
  supabase/migrations/__tests__/pr1ReleaseGuards.test.ts
```

Result: 1 suite, 5 tests, all passed. This run is not the GitHub Jest total above.

The fifth test reads every `supabase/release-sets/*.versions` file and asserts none contains `20270930130000`. It also asserts `20270930213000_reject_award_of_inactive_indent.sql` does not contain `is_org_staff`, and `20271014051328_reassert_gate1a_quote_accept_guard.sql` contains `is_org_staff` and `SECURITY DEFINER`.

## Disposable database

Command:

```bash
sh /Users/ggx/Desktop/Pulse-app/.worktrees/pr1-pod-dispatch/supabase/tests/run-pr1-disposable.sh
```

Target: Docker container `supabase_db_pulse`, database `pr1_guard`, user `postgres`. The script refuses a container name containing `pooler`, `prod`, or `nafxpivddesgsrthmosv`. Exit code 0. Final line: `disposable PR #1 guard tests passed on supabase_db_pulse/pr1_guard`. Afterward `pr1_guard` and role `pr1_caller` were absent (`count` 0 and 0). The user's `pulse` database was not the test database. This is not a backup, not a rehearsal of the release set, and not a production apply.

`ground_ops_can_see_trip` cases that raised if they failed:

- Caller `pr1_caller` with `SELECT` on `indents` and the deny-all `authenticated` policy saw 0 indent rows.
- Ground Ops user `bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb` received true for indent `eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee` in org `aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa`.
- The same user received false for other-org indent `ffffffff-ffff-ffff-ffff-ffffffffffff`.
- The same user received false when the requested org was `99999999-9999-9999-9999-999999999999`.
- Dispatcher `cccccccc-cccc-cccc-cccc-cccccccccccc` received false for the assigned indent.
- `SET ROLE anon` then `PERFORM ground_ops_can_see_trip` hit `insufficient_privilege`.

Payment cases that ran in one session:

- Two sequential `issue_payment_request` calls for trip `12121212-1212-1212-1212-121212121212` / `advance` returned the same id (`idempotent_ok = 1`) and left one live row.
- A `request_no` value `PAY-COLLISION` already used by trip `13131313-1313-1313-1313-131313131313` made the `balance` issue for the first trip raise `unique_violation` and insert no balance row.

Not executed: two concurrent sessions racing the partial unique index, and the exception handler's branch that returns an existing live row. The early `SELECT` return and the re-raise path were the paths that ran.

Godrej fixture that ran inside `pr1_guard`:

- Transaction `897a1bef-76c6-43bb-a4fa-b9d28df18a96` stayed `amount_in` 3500 with null `contact_id` and null `contact_type`.
- Transaction `55555555-5555-5555-5555-555555555555` on trip `44444444-4444-4444-4444-444444444444` moved to `amount_out` 900, `contact_id` `abababab-abab-abab-abab-abababababab`, and `party_name` `Real Supplier`.
- That row's `dco_payee_id` `d0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0` was not copied into `contact_id`.

## POD

`4c724c2d` restores modal and service dispatch-date checks. Missing, blank, and whitespace dates return `Dispatch date is required.` Invalid calendar dates return `Use YYYY-MM-DD for the dispatch date.` A valid date is trimmed into `p_dispatch_date`. `20271001093000` is not applied; it would remove the live server rejection.

Targeted worktree result, separate from CI and from a 10-test main-checkout run that did not include the new modal test: 18 passed (`markTripHardCopyPodReceived.test.ts` and `LogHardCopyPodModal.dispatchDate.test.tsx`).

## Finance — decision still required

Observed from the migration files:

- `20271013101500` creates `issue_payment_request` and `mark_trip_finance_verified(uuid, text, numeric)` without a compliance-rejection check. `issue_payment_request` is revoked from `public`, `anon`, and `authenticated`.
- `20271013120000` replaces that function and raises unless `compliance_cleared(...)`. Its own comment says an open rejection blocks approval. It still calls `issue_payment_request`.
- Timestamp order puts `20271013120000` after `20271013101500`. Applying the payment file later would drop the rejection check. They are in separate release sets (`payment-requests`, `compliance-cleared-gate`).

**Decision A, still unanswered:** Does a compliance rejection block finance approval?

**Decision B, still unanswered:** Must finance approval create a payment request?

Until an authorized finance/product owner answers both, the finance behavior is not approved.

## Ground Ops

`20271008120000` remains unapplied to production. The helper is `SECURITY DEFINER` with an empty `search_path`, revoked from `PUBLIC` and `anon`, and granted to `authenticated`. The policy still requires `platformRole = ground_ops`. The helper now also requires that role and `i.organization_id = p_org_id`. The disposable run above executed that file on `pr1_guard` only.

## Godrej ₹3,500

Transaction `897a1bef-76c6-43bb-a4fa-b9d28df18a96` on trip `3f333e5b-1256-4208-acee-7de3bc305f0b` is excluded from `20271012140000` by `tx.id IS DISTINCT FROM` that uuid. The migration file does not contain `dco_payee_id` and does not exclude every DCO row. No production row was updated.

Written confirmation from an authorized Godrej India finance approver is still absent. The exclusion is a hold, not a classification.

## Migrations, backup, rehearsal

No safe production order is approved. Do not execute `20270930130000`. Do not reapply `20270930213000` over the live Gate 1A body. Do not `migration repair` `20271014051328`. The stronger file `20271014051328_reassert_gate1a_quote_accept_guard.sql` remains the Gate 1A source that contains `is_org_staff`. Missing `schema_migrations` rows are not proof that objects are absent.

`get_trips_for_org(uuid, boolean)` in `20271013113000` is `LANGUAGE sql` and references `finance_verified_at` and `payment_requests`. It cannot be created on current production until those objects exist. The `anon` execute grant is not approved.

No backup timestamp was verified. No database backup was restored. The `pr1_guard` run created stub tables and executed two migration files; it did not replay the release set. No recovery was tested. Those gates are blocked, not complete.

## What remains before merge

1. Repository administrator: confirm required reviewers. This session could not read branch protection (HTTP 403). Do not self-approve.
2. Finance/product owner: Decision A and Decision B above.
3. Godrej India finance approver: written classification of transaction `897a1bef-76c6-43bb-a4fa-b9d28df18a96`.
4. Owner of the five baseline Jest suites: fix them outside this release, or formally waive the check. Do not mark the check green.
5. Operator: verified backup, disposable rehearsal of an approved set, and post-apply checks. None of that has been run.
6. A reviewer other than the author. Reviews are still 0.
