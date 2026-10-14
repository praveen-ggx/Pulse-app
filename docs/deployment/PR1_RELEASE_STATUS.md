# PR #1 release status

Decision: **BLOCKED**. This report does not approve a merge, a migration apply, or a production deploy.

Verified 2026-10-14 from the repository and GitHub. Production data was not written.

## Identity

| Item | Value |
| --- | --- |
| Repository | `Vasanthgogox/Pulse-app` |
| PR | https://github.com/Vasanthgogox/Pulse-app/pull/1 |
| Base | `V1.0.1` @ `0de8638faf2c7980b06366cf82ea852236621788` |
| Head verified live | `4c724c2d050ea4c094a616a75f0cb67b2b4bedf9` on `nihas/team-sync-v1.0.1` |
| This report | Committed with the unapplied SQL guards in the next commit on that branch. CI above is for `4c724c2d` only. |
| State | OPEN, not draft, MERGEABLE, `mergeStateStatus` UNSTABLE |
| Reviews | 0 reviews, 0 requested reviewers, `reviewDecision` empty |
| Branch protection | Unknown. `GET /branches/V1.0.1/protection` returned HTTP 403 |
| Worktrees left untouched | Main checkout `V1.0.1` @ `7f34e4cf` (dirty). Preflight worktree detached at `0de8638f` |

The diff `0de8638f...4c724c2d` is 358 files, +47019 / −10243. A line-by-line review of all 358 files was not completed. Hotspot review covered POD, finance functions, `get_trips_for_org` callers from prior catalog work, Ground Ops, the Godrej predicate, and the five failing Jest sources.

## CI

Latest completed run for head `4c724c2d`: https://github.com/Vasanthgogox/Pulse-app/actions/runs/38550559222

| Check | Result |
| --- | --- |
| Domain boundary lint | Passed |
| Circular dependency check | Passed |
| lib/ root file count | Passed |
| Pulse V2 isolation | Passed |
| Navigation policy | Passed |
| App TypeScript | Passed |
| App unit tests (Jest) | Failed |
| Netlify deploy preview | Ready, not production: https://deploy-preview-1--pulse-gx.netlify.app |

Jest job `115807200899`: 5 suites failed, 11 tests failed, 3 skipped, 4010 passed, 4024 total. The previous head `3dc476fb` (run `38523532150`) had the same 5 suites and 11 failures, with 4003 passed / 4017 total. The +7 passes match the dispatch-date tests added in `4c724c2d`.

Failing suites, identical as files to `0de8638f` (`git diff --stat` empty for the suites, `app/sign-in.tsx`, `LoadCenterView.tsx`, and `features/chat/contexts`):

1. `loadCenterMarketplaceGate.test.ts` — expects the string `Load more`, absent on both commits.
2. `sponsoredReachCommercialSurface.test.tsx` — expects `pooledMode && renderPoolMemberCard`, present only in the test.
3. `mutualConnectionsPartnerDisplay.test.ts` — dynamic import without `--experimental-vm-modules` at `lib/supabaseHttp.util`.
4. `IntegratedChatContext.bootstrapDedupe.test.tsx` — conversation fetch observed 0 times.
5. `sign-in.test.tsx` — CI timeout / redirect. Local Node is v26.3.1; CI runs the Node 20 action on Node 24.

These are baseline defects. They are not waived. They were not edited in this release because the sources match production and fixing them would broaden the PR.

## POD

`4c724c2d` restores modal and service dispatch-date checks. Missing, blank, and whitespace dates return `Dispatch date is required.` Invalid calendar dates return `Use YYYY-MM-DD for the dispatch date.` A valid date is trimmed into `p_dispatch_date`. `20271001093000` is not applied; it would remove the live server rejection.

Targeted worktree result, separate from CI and from a 10-test main-checkout run that did not include the new modal test: 18 passed (`markTripHardCopyPodReceived.test.ts` and `LogHardCopyPodModal.dispatchDate.test.tsx`).

## Finance — decision still required

Observed from the migration files, not from a new production query in this pass:

- `20271013101500` creates `issue_payment_request` and `mark_trip_finance_verified(uuid, text, numeric)` without a compliance-rejection check. `issue_payment_request` is revoked from `public`, `anon`, and `authenticated`.
- `20271013120000` replaces that function and raises unless `compliance_cleared(...)`. Its own comment says an open rejection blocks approval. It still calls `issue_payment_request`.
- Timestamp order puts `20271013120000` after `20271013101500`. Applying the payment file later would drop the rejection check. They are in separate release sets (`payment-requests`, `compliance-cleared-gate`).
- A unique partial index `ux_payment_requests_live_trip_type` already prevents two live requests. The issuer now catches `unique_violation` and returns the live row so a concurrent insert does not surface as a duplicate success path. This does not choose whether approval must create a request.

**Decision A, still unanswered:** Does a compliance rejection block finance approval?

**Decision B, still unanswered:** Must finance approval create a payment request?

Until an authorized finance/product owner answers both, the finance behavior is not approved.

## Ground Ops

`20271008120000` remains unapplied. The helper is `SECURITY DEFINER` with an empty `search_path`, revoked from `PUBLIC` and `anon`, and granted to `authenticated`. The policy still requires `platformRole = ground_ops`.

This pass adds the same role check, and `i.organization_id = p_org_id`, inside the helper so a direct call is not a cross-org or non-Ground-Ops indent probe. That change has a source test only. It has not been executed on a database. The migration stays out of any production set until that design is reviewed and run on a disposable database.

## Godrej ₹3,500

Transaction `897a1bef-76c6-43bb-a4fa-b9d28df18a96` on trip `3f333e5b-1256-4208-acee-7de3bc305f0b` is excluded from `20271012140000` by `tx.id IS DISTINCT FROM` that uuid. The migration still does not copy `dco_payee_id` into `supplier_id` and does not exclude every DCO row. No production row was updated.

Written confirmation from an authorized Godrej India finance approver is still absent. The exclusion is a hold, not a classification.

## Migrations, backup, rehearsal

No safe production order is approved. Do not execute `20270930130000`. Do not reapply `20270930213000` over the live Gate 1A body. Do not `migration repair` `20271014051328`. Missing `schema_migrations` rows are not proof that objects are absent.

`get_trips_for_org(uuid, boolean)` in `20271013113000` is `LANGUAGE sql` and references `finance_verified_at` and `payment_requests`. It cannot be created on current production until those objects exist. Baseline callers pass only `p_org_id`. Three PR callers pass `p_include_compliance_backlog=true`. The `anon` execute grant is not approved for removal or expansion.

No backup timestamp was verified in this pass. No disposable database was restored. No migration set was rehearsed. No recovery was tested. Those gates are blocked, not complete.

## What remains before merge

1. Repository administrator: confirm required reviewers. This session could not read branch protection (HTTP 403). Do not self-approve.
2. Finance/product owner: Decision A and Decision B above.
3. Godrej India finance approver: written classification of transaction `897a1bef-76c6-43bb-a4fa-b9d28df18a96`.
4. Owner of the five baseline Jest suites: fix them outside this release, or formally waive the check. Do not mark the check green.
5. Operator: verified backup, disposable rehearsal of an approved set, and post-apply checks. None of that has been run.
