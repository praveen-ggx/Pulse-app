# Amendment — migration isolation (post-`242ebc4c3`)

Follow-up isolation commit removes all SQL migration-file differences from PR #149 vs `V1.0.1`. Ten files preserved on `vasanth/migration-reconcile-20261124` @ `c41b2563c`. Local validation after isolation: Jest 6546 pass, lint 97, typecheck 322, nav/V2/`build:ci` PASS. GitHub Architecture Check remains **BLOCKED** (billing). Node 22 parity **NOT RUN**. Browser/preprod smoke **NOT RUN**. Zero DB apply.

**2026-11-25 final status: APPROVED FOR RELEASE.** The owner granted GO 1 (zero migrations), GO 2 (merge) and GO 3 (production), and accepted the GitHub CI billing exception. Local CI was re-run on head `845d85afc`: all seven Architecture Check jobs plus `build:ci`, results in `release-2026-11-24-execution-stop.md`. The verdict in §A below is historical (written at `c41b2563c`); its blockers B1 (fix pushed: `242ebc4c3`), B4 (merge = deploy, GO 3 granted) and B5 (migrations isolated: `0998a9027`) are closed. B2 (Actions billing) is accepted as an exception. B3 (preprod acceptance) was not run and the owner chose to proceed.

See `changes/release-2026-11-24-migration-isolation.md` and updated `changes/release-2026-11-24-execution-stop.md`.

---

# Pulse Release 2026-11-24 — PR #149 Final Readiness

**Run:** 2026-11-24 19:30–20:15 UTC (2026-11-25 IST), local workspace `/Users/ggx/Desktop/Pulse-app`.
**Mode:** verification only. No production migration, production SQL write, `migration repair`, merge, push, Netlify deploy, or history rewrite was performed. All DB access was `SELECT`-only via `supabase db query --linked --project-ref <ref>`; `supabase/.temp/project-ref` was not changed (still `nafxpivddesgsrthmosv`).

Supersedes the verdicts in `release-2026-11-24-audit.md` and `release-2026-11-24-curated-release-plan.md` where they conflict (corrections are listed in §F.3).

---

## A. Executive verdict

### CONDITIONAL — SPECIFIC BLOCKERS REMAIN

The pushed PR head **`c41b2563c` cannot ship**: the merge `33827f2ab` left a duplicate function declaration that Babel/Metro cannot parse. That breaks the production web build (the cause of the failed Netlify preview) and 7 Jest suites. It is fixed in the working tree (uncommitted, unpushed). With that fix:

- full Jest, lint, typecheck, lib-files, navigation, V2 isolation, cycles and the production build all pass locally;
- the PR's application code adds **no new database dependency** over `V1.0.1` (the code live in production now), so the **migration manifest for this release is empty**.

Remaining blockers before READY:

1. **B1** — commit and push the two fixes to the PR branch (needs your authorization).
2. **B2** — GitHub Actions cannot run. Every job is refused with *"recent account payments have failed or your spending limit needs to be increased"*. No GitHub check has evaluated this code.
3. **B3** — no preprod or browser acceptance of the integrated app has been done (§G).
4. **B4** — merging into `V1.0.1` auto-publishes gogopulse.com (§J), so the merge and deploy approvals can't be given separately unless publishing is locked first.

---

## B. Source integrity

| Ref | SHA | Check |
|---|---|---|
| Base `personal/V1.0.1` | `1f8f790a436c69dcb131d28875d28ab29ad45da6` | = live production deploy (Netlify `pulse-gx` published deploy `6b05af3a…`, 2026-11-24 15:39 UTC) |
| PR head `vasanth/marketplace-lane-48h-v1` (local + `personal`) | `c41b2563c0fbd1b8d349389e22890496e68e95a3` | matches `gh pr view 149` `headRefOid` |
| `release/2026-11-24-ui-integrate` | `c41b2563c…` | identical to PR head |
| Integration merge | `33827f2abb27e56f2430ed6f224552091bd7cd06` | ancestor of HEAD ✅ |
| Feature commit | `da9bafc2439ed13b91bd7057d3216720e74fc535` | ancestor of HEAD ✅ |
| `V1.0.1` | — | ancestor of HEAD ✅ (PR is a fast-forward-able superset) |

PR #149: OPEN, not draft, `mergeable=MERGEABLE`, `mergeStateStatus=UNSTABLE` (failed checks).

### Working tree vs PR head (all uncommitted, unpushed)

| File | Change | Why |
|---|---|---|
| `features/tripCompliance/services/complianceAdvanceFinanceBreakdown.service.ts` | −66 lines | **Merge defect fix (new in this run).** `33827f2ab` kept both sides' copies of `quoteFromVaultTerms` and `quoteAdvancePayablesForTrips`. The feature's inline-typed duplicates were removed. The surviving `AdvanceVaultQuote` → `quoteAdvancePayablesForTrips` block is **byte-identical to `V1.0.1`**. The feature's `readApprovedAdvancePercent` and the delegating `payableFromVaultTerms` are kept. Both return 0 for non-positive amounts (`computeCompliancePaymentAmount` floors at 0), so behaviour is unchanged. |
| `features/trips/services/__tests__/tripWorkflow.idempotency.test.ts` | mock +`.limit()`; duplicate case expects `event: null` | **Test/implementation mismatch (new in this run).** The test came from `da9bafc24` and was written for the feature's `select('*').eq().maybeSingle()` variant. The merge correctly kept V1.0.1's production implementation (`select('id').eq().limit(1).maybeSingle()`, returns `event: null`). The test now matches production. Its only caller (`finance.service.ts:362`) ignores `event`. |
| `app/_layout.tsx`, `DcoStatusScreen.tsx`, `DriverTripFlowCard.tsx`, `DriverProfileScreen.tsx` | −1 unused binding each | Lint fixes from the prior session (no behaviour change). |

---

## C. Quality gates

All commands were run from the repo root on HEAD `c41b2563c` plus the working-tree changes above. They are the same commands as `.github/workflows/architecture-check.yml`.

| Gate | Command | Result | vs baseline |
|---|---|---|---|
| Full Jest, 1st run (pre-fix) | `npm test -- --ci --passWithNoTests --forceExit` | **FAIL**: 924 suites, 915 passed, **8 failed** (7 parse errors + 1 assertion), 1 skipped; 6471 tests, 6466 passed, **2 failed**, 3 pending | — |
| Full Jest, 2nd run (post-fix) | same, 19:45:38–19:46:38 UTC | **PASS**: 924 suites, 923 passed, **0 failed**, 1 skipped; **6555 tests, 6552 passed, 0 failed, 3 pending** | — |
| ESLint | `node scripts/ci-baseline.js lint` | **PASS**: 97 (pre- and post-fix) | baseline 98, −1 |
| ESLint, PR-touched files (82 files: three-dot diff + working tree) | `eslint` on those files | **3 errors, all pre-existing**, 48 warnings | Same 3 errors on the `V1.0.1` copies: `DriverTripHistoryDetailScreen.tsx` `historyCaptureLane`, `histCollectStyles`; `compliancePaymentField.adapter.ts` `PAYMENT_MODE_IDS`. **0 new.** The earlier claim of "0 errors in PR-touched files" was wrong. |
| TypeScript | `node scripts/ci-baseline.js typecheck` | **PASS**: 334 pre-fix; post-fix: _see §C.1_ | baseline 344 |
| lib/ file cap | `node scripts/ci-baseline.js lib-files` | **PASS**: 178 | 178 |
| Navigation policy | `npm run test:navigation-policy` | **PASS**: 10 suites / 69 tests | — |
| V2 isolation | `npm run test:v2` | **PASS**: 25 suites / 197 tests | — |
| Import cycles | `node scripts/ci-baseline.js cycles` | _see §C.1_ | baseline 94 |
| Production build | `CI=true NODE_OPTIONS=--max-old-space-size=4096`: `npx expo export --platform web`, then `oms` `npm run build`, then `analytics` `npm run build` | **PASS** (all three exit 0, `dist/index.html` produced) | `build:ci`'s `npm ci` in oms/analytics was skipped to protect the workspace. The PR changes no file under `oms/`, `analytics/` or `packages/`. |
| Migration contract tests | included in full Jest | **PASS**: 89 suites, incl. `organizationMemberWarehousesReplay`, `marketplaceBidExpiry`, `supplierTripsKeyset`, `complianceOpsPipelineKeyset`, `hubUnassignedExcludesCancelled`, `prod20261124ReleaseSet` | — |

### C.1 Results completed after the main table

- **Cycles (first run):** `node scripts/ci-baseline.js cycles`, 2026-11-24 19:38:30–20:13:16 UTC, exit 0, **PASS**: current 94 = baseline 94. It started before the two fixes landed, but neither fix changes an import, so the measured graph equals the fixed tree's.
- **Typecheck after fixes:** 322 (was 334; the duplicate declarations accounted for 12 diagnostics). Lint after fixes: 97.
- **Cycles (re-run on `845d85afc`, 2026-11-25):** **PASS**: current 94 = baseline 94, exit 0, 2026-11-25 09:31:13–10:07:13 UTC on `845d85afc`

### C.2 Why the earlier "combined cycles/tests" job aborted

- **GitHub:** no job ran at all. Run `45455151076` annotation on every job: *"The job was not started because recent account payments have failed or your spending limit needs to be increased."* The same failure appears on every Architecture Check run back to at least `release/2026-11-21-hotfix` (`44916684804`). The earlier "empty steps" observation is now explained, and it is **not** a code failure.
- **Local:** the previous session left no log of the combined command, so I can't tell whether it was cancelled or timed out. The cycles gate alone takes ~30 min, which is longer than a foreground tool timeout. This run split it into separate background jobs, and each one finished with an exit code (above).

### C.3 Targeted areas (from the post-fix full run)

89 suites / 587 tests in the requested areas, **all passed**. Key suites:

| Area | Suites (all PASS) |
|---|---|
| DCO assignment/acceptance | `driverIncomingAssignment.util`, `driverAssignedVehicleDisplay.util`, `dcoSelfIssueTripScope.contract`, `dcoSelfWorkspaceAndTag.contract`, `dcoSelfFinancialBook.contract` |
| Wallet earnings / fleet vs DCO payout | wallet/payout suites matched by name; `driverModeBooks.migrations`, `prodDcoSelfDriverBooks.set` |
| Marketplace / catalog | `marketBidExpiry.util`, `marketplaceBidExpiry.contract`, `marketplaceExpiredBidResubmission.contract`, `marketplaceLaneCommitment/Rate.contract`, `complianceTripCatalog.service` |
| Cancelled ≠ Unassigned | `hubUnassignedExcludesCancelled.contract`, `hubTripListCounts.util` |
| Compliance catalog + payment | `compliancePaymentAmount.util`, `tripComplianceBulkPayment*.service`, `compliancePaymentIdempotency.migration.contract` |
| Debit update-first | `debitControlPod.service` |
| Document deletion / trip docs | `frozenTripDocumentsStorageParty.contract`, trip-document suites |
| Blank rate basis | `readTripSupplierFreight.perMtTotal`, `supplierFreightMerge`, `advancePaymentGuardBasisReleaseSet` |
| Auth / session | auth + session suites matched by name; `supabaseProject` (gx-pulse preprod lock) |
| Keyset / hub counts | `supplierTripsKeyset.contract`, `complianceOpsPipelineKeyset.contract`, `hubRpcMigrations.contract`, `hubMetricCounter.contract` |

**Salary request visibility/navigation:** no dedicated Jest suite exists. NOT VERIFIED by tests.

---

## D. GitHub CI (PR #149, head `c41b2563c`)

**Branch protection:** `GET /repos/Vasanthgogox/Pulse-app/branches/V1.0.1` → `protected: false`, `required_status_checks: {contexts: [], checks: []}`. **GitHub enforces no required checks on `V1.0.1`.** "Required" below means required by release policy (CLAUDE.md: CI runs on every PR).

| Check | Required (policy) | Status | Result | Failure reason | Run |
|---|---|---|---|---|---|
| Domain boundary lint | Yes | completed | ❌ failure | Actions billing: job not started | [run 45455151076](https://github.com/Vasanthgogox/Pulse-app/actions/runs/45455151076) job 138662470300 |
| Circular dependency check | Yes | completed | ❌ failure | Actions billing: job not started | job 138662469273 |
| lib/ root file count gate | Yes | completed | ❌ failure | Actions billing: job not started | job 138662469186 |
| Pulse V2 isolation (first slice) | Yes | completed | ❌ failure | Actions billing: job not started | job 138662468680 |
| Navigation policy gates | Yes | completed | ❌ failure | Actions billing: job not started | job 138662469821 |
| App TypeScript (strict) | Yes | completed | ❌ failure | Actions billing: job not started | job 138662469450 |
| App unit tests (Jest) | Yes | completed | ❌ failure | Actions billing: job not started | job 138662469498 |
| netlify/pulse-gx/deploy-preview | Yes (build health) | completed | ❌ failure | `Failed during stage 'building site': Build script returned non-zero exit code: 2` | Netlify deploy `6b05d137ff29d2c509a266ac` |
| Header rules / Pages changed / Redirect rules – pulse-gx | Optional | completed | ❌ failure | follow the failed preview build | same deploy |

**Netlify preview root cause (high confidence):** Netlify's API does not return the build log text. The committed `complianceAdvanceFinanceBreakdown.service.ts` at `c41b2563c` fails `@babel/parser` with `Identifier 'quoteFromVaultTerms' has already been declared (327:9)`, and Babel is the parser Metro uses for `expo export`. The fixed file parses, and the full production build passes locally.

**Not done, deliberately:** re-running CI. It would fail the same way until billing is fixed. Workflow files were not modified. Local results are not a substitute for these checks.

---

## E. Curated migration manifest

### E.1 Final manifest for PR #149: **EMPTY (0 migrations)**

```
# ordered filename                                   sha256
(none)
```

**Evidence that PR #149 needs no schema change:**

1. `.rpc('<name>')` names in app code (`app`, `features`, `lib`, `components`, `contexts`, excluding tests) at `V1.0.1` vs HEAD: **identical sets**. None added, none removed.
2. The PR's TS/TSX diff adds **no** lines referencing `expires_at`, `bulk_payment_*`, `*_keyset`, `compliance_ops_pipeline`, `owner_vehicle_id`, or `award_revoked_at`.
3. Every object missing on production (`market_bids.expires_at`, `list_trips_where_org_is_supplier_keyset`, `list_compliance_ops_pipeline_keyset`, `bulk_payment_post_record`, `bulk_payment_amount_allowed`, `bulk_payment_mode_id`) is referenced identically by `V1.0.1`, which is **already live**. Their absence is pre-existing production state, not something PR #149 introduces.
4. One behaviour change touches the schema boundary: the compliance catalog fallback now walks hub `active` + `history` buckets. `HubKeysetBucket`/`p_bucket` already exist on `V1.0.1` (`trips.service.ts`), and `trips.service.ts`'s RPC parameter set is unchanged by the PR. When the pipeline RPC is absent, the catalog still uses `getComplianceOpsPipelinePage → missing:true → hub walk`.

**Production migration approval request (J.1) is therefore: approve that _no_ migration is run for this release.**

### E.2 Migration files the PR carries (14 SQL): disposition

Merging PR #149 adds these files to `V1.0.1`. **None may be pushed as part of this release.** Checksums are SHA-256, first 16 hex characters, at HEAD.

**9 new files.** History is MISSING on **both** prod and preprod. They will appear as "pending" to any later `db push` from `V1.0.1`.

| Version / file | sha256[:16] | Prod object | Preprod object | No-op on prod? | Disposition |
|---|---|---|---|---|---|
| `20261029170000_organization_member_warehouses_before_department_manager.sql` | `3174b4ed5b8d6474` | table exists | exists | Yes (`IF NOT EXISTS`) | **BLOCKED**: history drift, reconcile separately |
| `20261112140000_indents_award_revoked_at_before_reference.sql` | `83e11ca12270b810` | column exists | exists | Likely (needs body check) | **BLOCKED**: history drift |
| `20261113100000_is_org_staff_before_pool_bid_policy.sql` | `275779dd754a57ae` | fn exists | exists | **No**: `CREATE OR REPLACE` overwrites the live body | **BLOCKED**: body diff vs `pg_get_functiondef` required |
| `20261113104000_direct_quote_names_return_before_pool_reissue.sql` | `ba2ac98def08af1a` | not proven | not proven | **No**: `DROP FUNCTION get_direct_quotes_with_bidder_names`, constraint changes | **BLOCKED** |
| `20261114110000_trips_owner_vehicle_id_before_plate_link.sql` | `30020fbec3da5434` | column exists | exists | Likely | **BLOCKED**: history drift |
| `20270309030100_restore_my_org_market_bids_identity.sql` | `ea07aa27852bf96d` | fn exists | exists | **No**: `DROP` + `CREATE list_my_org_market_bids` | **BLOCKED / defer** |
| `20270917100030_restore_warehouse_assignment_admin_policy.sql` | `4e4cf45b0afb9023` | policies unknown | unknown | **No**: drops and recreates RLS policies | **BLOCKED / defer** |
| `20271106053000_hot_path_trip_cover_indexes.sql` | `fc254ac57d5b3f41` | **both indexes exist** | **exist** | Yes (`IF NOT EXISTS`) | History-only drift. Candidate for an owner-approved `repair --status applied` later. **Not this release.** |
| `20271118194500_bulk_payment_post_record.sql` | `08f1d30c1bc5c5ec` | fn **absent** | **absent** | N/A, new fn | **Defer**: fixes pre-existing V1.0.1 gap (§I, P1-4). Separate GO. |

**5 modified files whose versions are already APPLIED on both prod and preprod.** These are file-content drift only. Never re-run them; changes affect fresh-DB replay only.

| File | sha256[:16] | Diff vs V1.0.1 |
|---|---|---|
| `20270304120000_list_my_org_market_bids.sql` | `20edd40a22279aa0` | +4 (adds `DROP FUNCTION` before recreate) |
| `20270921182802_pause_diagnostic_crons_during_unhealthy.sql` | `6ab5ab7510f205a2` | +27/−19 (privilege guard) |
| `20270922143500_guard_http_queue_url_and_rpc_grants.sql` | `17ae37ba61ce14ce` | +2/−2 |
| `20271006185000_pulse_exchange_repair_sat812_trp191.sql` | `09c93973e6b5cc3b` | +4/−2 (**data repair, never re-run**) |
| `20271027155318_get_trips_for_org_date_range.sql` | `54b5c22c474392d0` | +1 |

### E.3 Deferred families (already on `V1.0.1` as files; not part of this release)

| Family | Files (sha256[:16]) | Prod hist / object | Preprod hist / object |
|---|---|---|---|
| Marketplace bid expiry | `20271117021500` (`e345eb52a667fdd5`), `20271117144500` (`86481ac1ce97cf9a`) | missing / `expires_at` absent, `tg_market_bid_set_expiry` absent | applied / present |
| Supplier keyset | `20271118123000` (`f87481af0db502c8`) | missing / fn absent | applied / present |
| Compliance pipeline + hub tiles | `20271118143000` (`b963037dafa83ee3`) | missing / fn absent | applied / present |
| Bulk amount + mode | `20271118174500` (`9334ece0d2684421`), `20271118191000` (`3f4c4fc6f90c1162`) | missing / `bulk_payment_amount_allowed`, `bulk_payment_mode_id` absent. **Note:** `field_submit`, `field_correct`, `normalize_fields`, `commit_row` exist on prod, from `20271118161500`. | applied / present |
| Already applied, do not re-run | `20261114111733` (`0b41142750e8e96d`), `20261118114448` (`142b5ecc98c55ac7`), `20271118161500` (`e7556a8edda0f9f6`) | applied | applied |

---

## F. Production / preproduction drift

### F.1 Live state (SELECT-only, 2026-11-24 ~19:40 UTC)

| Item | Prod `nafxpivddesgsrthmosv` | Preprod `xbisiveavvbifbzyfhgy` |
|---|---|---|
| Postgres | 17.6 | 17.6 |
| `schema_migrations` rows | 1047 | 1106 |
| Max version | `20271124154500` | `20271124154500` |
| Of the 23 audited versions applied | 8 | 14 |
| `market_bids.expires_at` / one-pending index | ❌ / ❌ | ✅ / ✅ |
| `list_trips_where_org_is_supplier_keyset` | ❌ | ✅ |
| `list_compliance_ops_pipeline_keyset`, `compliance_ops_pipeline_match`, `hub_tile_match` | ❌ | ✅ |
| `bulk_payment_post_record` | ❌ | ❌ |
| `bulk_payment_amount_allowed`, `bulk_payment_mode_id` | ❌ | ✅ |
| `_attach_market_lane_commit` | ❌ | ✅ |
| `idx_trips_org_count_cover`, `idx_trips_org_created_cover` | ✅ (history ❌) | ✅ (history ❌) |
| `organization_member_warehouses`, `indents.award_revoked_at`, `trips.owner_vehicle_id`, `bulk_operation_batches`, `is_org_staff` | ✅ | ✅ |

Query: `changes/release-2026-11-24-final-readiness.inventory.sql` (SELECT-only), run with `supabase db query --linked --project-ref <ref> -f changes/release-2026-11-24-final-readiness.inventory.sql -o csv`.

### F.2 Assessment

- **No unresolved drift blocks PR #149**, because the release applies no migration and the code adds no schema dependency.
- **Standing drift (not introduced by this PR; owner: DB):** 5 "before_" objects and the 2 hot-path indexes exist without history. Preprod is ahead of prod on 4 families. Neither environment has `bulk_payment_post_record`.
- **New hazard created by merging:** the 9 new files become "pending" on both DBs. Several are older than the remote tip, so they need `--include-all`, and 4 of them change live functions or policies. Anyone running a plain `db push` from `V1.0.1` after the merge could apply them. Mitigation: always use `db:push-set` with an explicit list (CLI 2.95.4 per team procedure), or move the 9 files out of PR #149 into a separate reconciliation PR **(recommended)**.

### F.3 Corrections to the prior audit and plan

| Prior claim | Corrected (evidence §F.1 / §E.1) |
|---|---|
| Hot-path trip indexes "absent" on prod | **Present on both**; history-only drift |
| Bulk post-by-code is "required if in scope" for PR #149 | `bulk_payment_post_record` is already called by live `V1.0.1` code. This is a pre-existing gap, not a PR #149 dependency. |
| Marketplace expiry is a P0 merge blocker | The PR adds no new code dependency on `expires_at`; V1.0.1 code is identical in that respect |
| PR-touched files have 0 ESLint errors | 3 errors, all pre-existing on V1.0.1; 0 new |
| GitHub "empty steps" cause unknown | Actions billing / spending limit (annotation) |
| Netlify preview failure "investigate separately" | Merge-introduced duplicate declaration breaks the build; fixed locally |
| Code-level conflict resolution spot-checked OK | Missed the duplicate declaration and the test/impl mismatch |

---

## G. Application acceptance tests

| Workflow | Unit/contract (local Jest) | Preprod UI | Production |
|---|---|---|---|
| DCO assignment + acceptance | PASS | NOT VERIFIED | NOT RUN (forbidden) |
| Driver wallet earnings / Collect Payment | PASS (util/service level) | NOT VERIFIED | NOT RUN |
| Fleet vs DCO payout separation | PASS (display + books contracts); payout maths end-to-end NOT VERIFIED | NOT VERIFIED | NOT RUN |
| Salary request visibility/navigation | no suite: NOT VERIFIED | NOT VERIFIED | NOT RUN |
| Marketplace + catalog | PASS | NOT VERIFIED | NOT RUN |
| Cancelled excluded from Unassigned | PASS | NOT VERIFIED | NOT RUN |
| Compliance catalog + payment | PASS (now incl. 7 suites that could not parse pre-fix) | NOT VERIFIED | NOT RUN |
| Debit update-first | PASS | NOT VERIFIED | NOT RUN |
| Document deletion re-read | PASS (service level) | NOT VERIFIED | NOT RUN |
| Blank rate basis | PASS | NOT VERIFIED | NOT RUN |
| Auth / session | PASS | NOT VERIFIED | NOT RUN |
| Keyset pagination + hub counts | PASS | NOT VERIFIED | NOT RUN |

**Preproduction validation was not performed:**
1. The curated set is empty, so there is nothing to apply.
2. `xbisiveavvbifbzyfhgy` is positively identified as preprod (`scripts/supabaseProject.cjs` `PREPROD_REF`, gx-pulse lock), but whether its data is safe to mutate is still unresolved. Earlier sampling found real-looking transport-company org names. Preprod applies go through the Nihas process.
3. No approved test identity or org login is available for UI acceptance in this session.

Detox and Playwright were not run.

---

## H. Rollback plan

### H.1 Database
The manifest is empty, so there is no DB change to roll back. Pre-merge requirement: confirm prod `schema_migrations` max version is still `20271124154500` and rows are 1047 immediately before merge. If either moved, re-run §F.1 before proceeding.

### H.2 Application (gogopulse.com)
- **Pre-deploy:** record the current published deploy `6b05af3a…` (commit `1f8f790a4`).
- **Rollback:** Netlify → `pulse-gx` → Deploys → publish `6b05af3a…` (instant, atomic static swap; no DB coupling). Lock auto-publishing so the next `V1.0.1` push does not re-publish the broken build. Then revert the merge on `V1.0.1` with a new revert commit (no force-push).
- **Expected impact:** none on the DB. Clients holding the new bundle pick up the old one on reload.
- **Limitation:** the Expo native (driver app) channel is not covered by a Netlify rollback. If the release reaches native builds or OTA, that needs its own rollback.

### H.3 Deferred migrations (for future releases, informational)
| Family | Rollback feasibility |
|---|---|
| `20271118194500` bulk post record | Reversible: `DROP FUNCTION public.bulk_payment_post_record(uuid,text,text,jsonb)`. Rows already written to `bulk_operation_*` stay as audit history. |
| Expiry family | Partially reversible. The column can be dropped, but the `submit_market_bid` replacement and unique-index swap need the previous function bodies captured beforehand. Bids carrying expiry semantics cannot be "un-expired". |
| Keyset / pipeline RPCs | Reversible (`DROP FUNCTION`). The app falls back when they are missing. |
| `20271006185000` exchange repair | **Not reversible**; never re-run. |
| "before_" shims with `CREATE OR REPLACE`/`DROP` | Not reversible without capturing `pg_get_functiondef`/policy definitions first. |

**If a future push-set fails halfway:** each file runs in its own transaction with `SET LOCAL lock_timeout = '5s'`, so a failed file rolls back completely and is not recorded. Stop, do not retry in a loop, and do not `repair`. Re-check history plus objects (§F.1 query) and escalate to the DB owner.

---

## I. Outstanding blockers

| ID | Severity | Blocker | Evidence | Owner | Required action |
|---|---|---|---|---|---|
| B1 | **P0** | Pushed head `c41b2563c` does not build (duplicate declaration from merge `33827f2ab`) | Babel parse fail; Jest 8 failed suites pre-fix; Netlify preview build exit 2 | PR author (Vasanth) | Authorize commit + push of the 6 working-tree files to `vasanth/marketplace-lane-48h-v1` (**not** done) |
| B2 | **P0** | GitHub Actions refused for billing; no CI has evaluated the code | Annotation on all 7 jobs, run `45455151076`; same since ≥ 2026-11-21 | GitHub account owner (`Vasanthgogox`) | Fix payment / spending limit, then re-run Architecture Check on the new head |
| B3 | **P1** | No preprod/browser acceptance of the integrated app | §G | QA / release eng | Click-through on gx-pulse (preprod) of the 12 workflows, with an approved identity |
| B4 | **P1** | Merge = production deploy (auto-publish on `V1.0.1`, `stop_builds: false`) | Netlify `getSite` | Release owner | Lock publishing before merge if J.2 and J.3 must stay separate |
| B5 | **P1** | Merge brings in 9 un-applied migration files (4 non-idempotent on prod) | §E.2 | DB owner | Prefer removing them from PR #149 into a separate reconciliation PR. Otherwise use only explicit `db:push-set`, never a plain `db push`. |
| B6 | P2 | Cycles CI parity | §C.1 | Eng | Re-run in CI after B2 |
| P1-4 | P1 (pre-existing) | `bulk_payment_post_record` missing on prod and preprod; live V1.0.1 silently drops bulk-post audit records (`recordBulkPaymentPost` returns nulls) | §F.1, `bulkHistory.service.ts:211` | DB owner | Separate GO for `20271118174500` → `191000` → `194500` |
| P2-1 | P2 (pre-existing) | Preprod data safety (real-looking orgs) unresolved | memory / prior sampling | Preprod owner | Confirm synthetic vs copied data before any preprod writes |
| P2-2 | P2 | Lint/typecheck baselines could be ratcheted (98→97, 344→334) | §C | PR author | Optional, in the same push as B1 |

---

## J. Approval requests (separate; none granted)

1. **Production migration approval:** approve that **zero** migrations are applied for PR #149 (manifest §E.1 is empty). No `db push`, `db:push-set`, or `repair` is requested.
2. **PR #149 merge approval:** requires B1 (fix pushed), B2 (CI green on the new head), and B3 (preprod acceptance) first. Merge into `V1.0.1` with a normal merge (no admin bypass).
3. **Production Netlify deployment approval:** gogopulse.com auto-publishes from `Vasanthgogox/Pulse-app@V1.0.1`, so approval 2 effectively deploys. To keep 3 separate, lock auto-publishing on `pulse-gx` before merging, then publish the verified deploy manually after approval. Post-deploy: confirm the published commit SHA equals the merge commit and smoke-test the 12 workflows.

**Stop condition reached.** Nothing further will be pushed, merged, applied, or deployed without the approvals above.
