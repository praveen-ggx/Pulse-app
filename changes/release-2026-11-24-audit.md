# Pulse Release 2026-11-24 — PR #149 Final Release Readiness Audit

**Audit mode only.** No production migration, merge, deploy, push, repair, or history rewrite was performed.  
**Audit time:** 2026-11-24 (local)  
**Linked CLI project during audit:** `nafxpivddesgsrthmosv` (**production**) — SELECT/introspection only.

---

## A. Executive verdict

### NOT READY

GitHub mergeability is **not** release readiness. Required CI is red (empty-step failures + Netlify preview failure), local lint exceeds baseline, the “23 migrations” claim is inaccurate vs the live PR diff, production/preprod migration history and live objects diverge, and several migrations that the app expects are absent from production. Separate explicit approvals are still required before any production migration, merge, or Netlify production deploy.

---

## B. Source integrity

| Ref | SHA |
|---|---|
| PR base `V1.0.1` | `1f8f790a436c69dcb131d28875d28ab29ad45da6` |
| PR head `vasanth/marketplace-lane-48h-v1` | `c41b2563c0fbd1b8d349389e22890496e68e95a3` |
| Integration `release/2026-11-24-ui-integrate` | `c41b2563c0fbd1b8d349389e22890496e68e95a3` (identical to PR head) |
| Integration merge | `33827f2abb27e56f2430ed6f224552091bd7cd06` |
| Feature checkpoint | `da9bafc2439ed13b91bd7057d3216720e74fc535` |
| Debit-control follow-up | `c41b2563c` (on top of merge) |

**Ancestry**
- `da9bafc24` is an ancestor of HEAD: **YES**
- `33827f2ab` is an ancestor of HEAD: **YES**
- `release/2026-11-24-ui-integrate` vs `vasanth/marketplace-lane-48h-v1`: **0 / 0** (identical)
- Remote `personal/*` matches local for both branches at `c41b2563c`

**Commit graph (PR head not in `V1.0.1`)**
```
c41b2563c Fix debit-control merge by taking the V1.0.1 update-first workflow path.
33827f2ab Merge V1.0.1 into release/2026-11-24-ui-integrate.
da9bafc24 Ship driver DCO vehicle onboarding, wallet card polish, and ops UI fixes.
… (marketplace / compliance / bulk lineage) …
d8b2ab962 Give Marketplace bids their own 48-hour clock…
```

**Changed-file inventory:** `personal/V1.0.1...HEAD` → **99 files**, +4400 / −1460.

**Conflict resolution representation:** The merge commit `33827f2ab` + debit fix `c41b2563c` are on the PR head; the 35 conflicted paths are no longer unmerged. Final behaviour for the ten critical areas was spot-checked in Phase E.

**Unintended V1.0.1 content:** Expected — the integration intentionally merged production `V1.0.1` (`1f8f790a4`, PR #148 lineage). That is correct for conflict resolution, but it means the PR ships **production-side migrations/code already on `V1.0.1` plus additional head-only migrations**.

---

## C. CI results

**PR checks (head `c41b2563c`) — all failed**

| Check | Status | Result | Notes | Required? |
|---|---|---|---|---|
| App TypeScript (strict) | completed | **fail** | Job ended in ~2s; **steps: []** — no real typecheck evidence | NOT VERIFIED (branch protection API 403) |
| App unit tests (Jest) | completed | **fail** | Same empty-step pattern | NOT VERIFIED |
| Circular dependency check | completed | **fail** | Empty steps | NOT VERIFIED |
| Domain boundary lint | completed | **fail** | Empty steps | NOT VERIFIED |
| Navigation policy gates | completed | **fail** | Empty steps | NOT VERIFIED |
| lib/ root file count gate | completed | **fail** | Empty steps | NOT VERIFIED |
| Pulse V2 isolation | completed | **fail** | Empty steps | NOT VERIFIED |
| netlify/pulse-gx/deploy-preview | completed | **fail** | Deploy failed (`6b05d137…`) | Preview only — not gogopulse.com |
| Header/Pages/Redirect rules - pulse-gx | completed | **fail** | Tied to failed preview | Preview only |

Run: https://github.com/Vasanthgogox/Pulse-app/actions/runs/45455151076  
Workflow: `.github/workflows/architecture-check.yml`

**Branch protection:** GitHub API returned **403** (Pro required). Whether these checks are hard-required is **NOT VERIFIED**.

**Local quality gates (this workspace, no mutations)**

| Gate | Result | Evidence |
|---|---|---|
| Typecheck vs baseline | **PASS** (334 ≤ baseline 344; improved by 10) | `node scripts/ci-baseline.js typecheck` |
| Lint vs baseline | **FAIL** (101 > baseline 98; +3) | `node scripts/ci-baseline.js lint` |
| lib-files | **PASS** (178 = 178) | `node scripts/ci-baseline.js lib-files` |
| Navigation policy | **PASS** 10 suites / 69 tests | `npm run test:navigation-policy` |
| Cycles | **NOT VERIFIED** | `ci-baseline.js cycles` still running / no final PASS-FAIL captured within audit window |
| Production web build | **NOT VERIFIED** | Not run (time/safety; CI preview already failed) |
| Full Jest suite | **NOT VERIFIED** | Targeted suites only (Phase G) |

**Typecheck note:** Many TS errors remain (334) but are **below** baseline 344. Failures listed include pre-existing areas (`lib/eventService.ts`, `lib/globalSync`, vehicles service, etc.). Distinguishing brand-new vs pre-existing line-by-line was not fully completed; baseline comparison is the authoritative gate here.

---

## D. Migration audit matrix

### Inventory correction (critical)

The earlier draft claimed **23** migrations. Against current PR head:

- **14** SQL files appear in `personal/V1.0.1...HEAD` three-dot diff.
- Of the original **23** named versions:
  - **9** are already present as files on `V1.0.1` (merged via production) and are **not** new to the PR tree as unique filenames — though some still lack production history and/or have **content drift** vs the `V1.0.1` copy.
  - **Several** show content differences even when the filename exists on both sides (dangerous if someone assumes “same version = same SQL”).

**Production project:** `nafxpivddesgsrthmosv` (1047 rows in `schema_migrations`).  
**Preproduction project:** `xbisiveavvbifbzyfhgy` (queried read-only via Supabase MCP).

Legend for **Production drift**:
- `APPLIED` = version present in `schema_migrations`
- `MISSING` = version absent from history
- `OBJECT_EXISTS` = live object/column found even if history missing (history drift risk)

| Migration | Purpose | Dependencies | Production drift | Risk | Verdict |
|---|---|---|---|---|---|
| `20261029170000` org_member_warehouses before dept manager | CREATE/ALTER `organization_member_warehouses`, indexes, policy/delete cleanup | Warehouse RBAC path | History **MISSING**; table **OBJECT_EXISTS** | History drift / possible no-op or conflict on re-apply | **BLOCKED** until history vs object reconciliation |
| `20261112140000` indents award_revoked_at | ALTER `indents` add column | Later award/revoke flows | History **MISSING**; column **EXISTS** | Same drift class | **BLOCKED** |
| `20261113100000` is_org_staff before pool bid | CREATE OR REPLACE `is_org_staff` + GRANT | Pool bid policies | History **MISSING**; function **EXISTS** (`anon`+`authenticated` EXECUTE) | Replacing live function body without checksum proof | **NEEDS REVIEW** |
| `20261113104000` direct_quote names return | ALTER `direct_quotes`, DROP FUNCTION | Pool reissue | History **MISSING** | Column/function state not fully proven | **NEEDS REVIEW** |
| `20261114110000` trips.owner_vehicle_id | ALTER `trips` add owner_vehicle_id | Plate-link migration | History **MISSING**; column **EXISTS** | Drift | **BLOCKED** |
| `20261114111733` link trip vehicle by plate | Triggers/functions for plate link | Needs owner_vehicle_id | History **APPLIED** (prod+preprod) | Already live; file also on V1.0.1 | **SAFE** (no re-apply) |
| `20261118114448` blank supplier rate basis | REPLACE `compliance_advance_calculation` | Advance UX | History **APPLIED** | Already live | **SAFE** (no re-apply) |
| `20270304120000` list_my_org_market_bids | REPLACE RPC; HEAD adds DROP before recreate | Marketplace UI | History **APPLIED**; **content differs** from V1.0.1 file (+DROP FUNCTION) | Changing applied migration file ≠ re-running it | **NEEDS REVIEW** (do not rely on re-push) |
| `20270309030100` restore market bids identity | DROP/CREATE `list_my_org_market_bids` | Depends on prior list_my_org shape | History **MISSING** on prod+preprod | May be required after signature changes | **NEEDS REVIEW** (schema-first if OUT params changed) |
| `20270917100030` restore warehouse assignment admin policy | DROP/CREATE policies | Warehouse admin | History **MISSING** both envs | RLS behaviour change | **NEEDS REVIEW** |
| `20270921182802` pause diagnostic crons | UPDATE `cron.job` (HEAD wraps privilege guard) | Ops only | History **APPLIED**; **content differs** | Privilege-guarded rewrite of applied file | **NEEDS REVIEW** |
| `20270922143500` guard http queue URL + grants | REPLACE `net_http_post_if_url`, GRANT/REVOKE | Cron/http queue | History **APPLIED**; **content differs** | Applied-file drift | **NEEDS REVIEW** |
| `20271006185000` pulse exchange repair SAT812/TRP191 | Data UPDATE | One-off repair | History **APPLIED**; content may differ | Re-running would mutate prod data | **BLOCKED** for any re-apply |
| `20271027155318` get_trips_for_org date range | REPLACE `get_trips_for_org` | Hub/compliance reads | History **APPLIED**; content may differ | Live fn exists (`anon` EXECUTE = true — pre-existing concern) | **NEEDS REVIEW** |
| `20271106053000` hot path trip cover indexes | CREATE INDEX×4 | Query performance | History **MISSING** both | Concurrent index risk on hot `trips` | **NEEDS REVIEW** (lock_timeout present; still needs window) |
| `20271117021500` marketplace bid individual expiry | `market_bids.expires_at`, triggers, list RPC | App expiry clock | Prod history **MISSING**; preprod **APPLIED**; prod column **absent** | Prod app using expiry without column = breakage if merged first | **BLOCKED** (schema-first mandatory) |
| `20271117144500` expired bid resubmission | `submit_market_bid` + unique indexes | Expiry migration | Prod **MISSING**; preprod **APPLIED** | Depends on expires_at | **BLOCKED** until 20271117021500 on prod |
| `20271118123000` supplier trips keyset | `list_trips_where_org_is_supplier_keyset` | App supplier walk | Prod **MISSING** (fn absent); preprod **APPLIED** | App falls back / unlimited-access risk if wrong path | **BLOCKED** for app-before-schema |
| `20271118143000` compliance ops pipeline + hub tiles | Large hub/compliance RPC rewrite | App compliance catalog | Prod **MISSING** (fn absent); preprod **APPLIED** | App hard-codes missing RPC probe; hub walk fallback | **NEEDS REVIEW** (schema-first preferred; fallback exists) |
| `20271118161500` bulk operation audit | New bulk_* tables, RLS, many RPCs | Bulk UI | Prod+preprod **APPLIED**; tables exist | Already live | **SAFE** (no re-apply) |
| `20271118174500` bulk payment paid amount | Bulk payment amount RPCs | Audit tables | Prod **MISSING**; preprod **APPLIED** | App bulk payment amount writes depend on this | **BLOCKED** until applied before relying on amount writes |
| `20271118191000` bulk payment mode | Mode RPCs | Amount migration | Prod **MISSING**; preprod **APPLIED** | Same family | **BLOCKED** |
| `20271118194500` bulk payment post record | `bulk_payment_post_record` | Mode/amount | Prod+preprod history **MISSING**; fn **absent** both | Post-by-trip-code path incomplete | **BLOCKED** |

**SAFE count:** 3 (already applied; do not re-apply)  
**NEEDS REVIEW:** 9  
**BLOCKED:** 11  

**No migration is approved for production apply by this audit.**

---

## E. Production / preproduction comparison

| Item | Production `nafxpivddesgsrthmosv` | Preprod `xbisiveavvbifbzyfhgy` |
|---|---|---|
| Access method | Linked CLI + SELECT | Supabase MCP `execute_sql` (read) |
| Of 23 versions in history | **8** applied | **14** applied |
| `market_bids.expires_at` | **false / absent** | **true** |
| `list_compliance_ops_pipeline_keyset` | **absent** | **present** |
| `list_trips_where_org_is_supplier_keyset` | **absent** | **present** |
| `bulk_payment_post_record` | **absent** | **absent** |
| `organization_member_warehouses` | present | present |
| `bulk_operation_batches` | present | present |
| `indents.award_revoked_at` | present | present |
| `trips.owner_vehicle_id` | present | (not re-queried; assumed from shared lineage) |

**Unknowns**
- Checksums of applied SQL vs local files: **NOT VERIFIED** (CLI list does not prove body identity).
- Full policy dump / grant matrix beyond sampled functions: **NOT VERIFIED**.
- Whether history-missing but object-present migrations were applied under alternate versions: **NOT VERIFIED** — treat as drift.

**Environments are not interchangeable.** Preprod is ahead of prod for marketplace expiry, supplier keyset, compliance pipeline, and most bulk-payment RPC versions — but still missing `20271118194500` and several earlier “before_” dependency migrations in history.

---

## F. Conflict-resolution regression audit

| # | Area | Final implementation evidence | Prod intent | Tests | Regression risk |
|---|---|---|---|---|---|
| 1 | DCO + incoming assignment | `app/(driver)/index.tsx` combines `canSeeMarketplace` **and** incoming OTP/assignment gate; DCO checklist includes Assigned/Your vehicle (`DcoStatusScreen`) | Market DCO-only; don’t flash Available over accept | `driverIncomingAssignment.util.test.ts`, `driverAssignedVehicleDisplay.util.test.ts` | Low if both gates kept — **observed kept** |
| 2 | Driver wallet earnings | Receipt preview modal + Capture/Request on day cards | Flattened cards + collection preview | Partial (component-heavy; no full E2E) | Medium — UI-only; **no E2E** |
| 3 | Fleet vs DCO payout separation | Profile no longer shows Fleet Assigned row (removed in ours); vehicle step in DCO | Separation via DCO path | Display util tests | Low for row removal; payout math **NOT VERIFIED** end-to-end |
| 4 | Marketplace/catalog | Compliance catalog uses active+history hub walks when pipeline missing | Preprod has pipeline; prod does not | `complianceTripCatalog.service.test.ts` | Medium on prod until pipeline migration |
| 5 | Cancelled ≠ Unassigned | `hubTripListCounts.util.ts` matches V1.0.1 comments/policy | PR #148 cancelled exclusion | `hubTripListCounts` + `hubUnassignedExcludesCancelled.contract` | Low — **prod rule preserved** |
| 6 | Session-dependent RPC | `SESSION_EXPIRED_MESSAGE` returns in `trips.service.ts` | Fail closed when anon | Partial | Low |
| 7 | Debit update-first | `debitControlPod.service.ts` update-before-insert; tests from V1.0.1 | Avoid 23505/409 noise | `debitControlPod.service.test.ts` (4 passed) | Low — **prod fix kept** |
| 8 | Document delete re-read | Re-select status before delete | Never delete verified | Service-level only | Low |
| 9 | Blank rate-basis | No indent per-MT inherit; blank stays blank; approved % still read | Prod comment + feature approved % | `compliancePaymentAmount.util.test.ts` | Low if both kept — **observed** |
| 10 | Netlify `gx-pulse` lock | `PREPROD_NETLIFY_SITE = "gx-pulse"` in `scripts/supabaseProject.cjs` | Preprod site locked to preprod DB | `supabaseProject.test.ts` | Low for config; **gogopulse.com deploy path NOT exercised** |

**Older bug reintroduction:** Cancelled-on-Unassigned feature-branch behaviour was **rejected** in favour of production. Debit read-first hybrid was **fixed** by taking V1.0.1 update-first. No evidence of reverting those two production fixes in the final head.

---

## G. Test evidence

### Commands and results (executed)

| Command | Result |
|---|---|
| Targeted Jest (8 suites: hub counts, incoming assignment, assigned vehicle, compliance catalog/payment, debit, supabaseProject, hub cancelled contract) | **8 passed / 101 tests** |
| `npm run test:navigation-policy` | **10 passed / 69 tests** |
| `node scripts/ci-baseline.js typecheck` | **PASS** (334 ≤ 344) |
| `node scripts/ci-baseline.js lint` | **FAIL** (101 > 98) |
| `node scripts/ci-baseline.js lib-files` | **PASS** |
| Cycles baseline | **NOT VERIFIED** (no final result in audit window) |
| Full `npm test` | **NOT VERIFIED** |
| Preprod UI / smoke (DCO, wallet, salary, marketplace, History→Cancelled, compliance, debit, document delete, auth edge) | **NOT VERIFIED** — no preprod click-through performed |
| Production smoke | **NOT RUN** (forbidden) |

### Coverage gaps
- Driver wallet / Collect Payment UI flows: no Detox/Playwright evidence in this audit.
- Fleet payout calculation correctness: not re-proven.
- End-to-end bulk payment post-record: blocked by missing `bulk_payment_post_record` on both DBs.
- Marketplace expiry on production: cannot pass until schema applied.

---

## H. Release sequencing (proposed — not authorized)

1. **Prerequisite fixes (code):** restore green CI (investigate empty-step Actions failures); reduce lint to ≤ baseline 98; finish cycles gate; optionally bump typecheck baseline to 334 in a controlled way.
2. **Curate an explicit release set** — do **not** push all Local-only files. Separate:
   - already-applied (never re-apply),
   - history-drift objects (repair vs placeholder strategy with owner),
   - true new schema needed by this app (marketplace expiry family, supplier keyset, bulk payment amount/mode/post, hot indexes, etc.).
3. **Preproduction migration** of the curated set only (Nihas / preprod process), after dry-run.
4. **Preproduction application validation** of this exact head against that schema (manual + automated acceptance list in §G).
5. **Production migration approval** for the **exact** set (separate written GO).
6. **Production migration execution** (schema-first), verify history + objects; stop on failure (no repair loops).
7. **Independent merge approval** for PR #149 (separate from migration GO).
8. **Merge PR #149** into `V1.0.1` only after schema readiness for any RPC/column the new bundle requires.
9. **Netlify production verification** on gogopulse.com (confirm commit SHA; `gx-pulse` must remain preprod-locked).
10. **Production smoke** of the ten critical behaviours.

---

## I. Outstanding blockers

| Severity | Blocker | Evidence | Owner | Action |
|---|---|---|---|---|
| **P0** | GitHub architecture checks all fail with empty steps | Run `45455151076` | Eng / GitHub Actions | Re-run / fix Actions permissions-billing; do not merge on red |
| **P0** | Netlify deploy preview failed | pulse-gx deploy `6b05d137…` | Eng / Netlify | Inspect preview logs; confirm not production |
| **P0** | Production missing marketplace expiry schema while PR ships expiry UX | `expires_at` false; migrations missing on prod | DB owner | Schema-first release set before merge |
| **P0** | Production missing supplier keyset + compliance pipeline RPCs | Functions absent | DB owner | Apply or keep proven hub fallbacks; document |
| **P0** | `bulk_payment_post_record` missing on prod **and** preprod | History + `to_regprocedure` | DB owner | Apply `20271118194500` (and deps) before relying on post-by-code |
| **P0** | Migration history drift (objects exist, versions missing) | warehouses / award_revoked_at / owner_vehicle_id | DB owner | Reconcile before any push-set |
| **P1** | Local lint exceeds baseline (+3) | `ci-baseline.js lint` | PR author | Fix new lint or prove pre-existing and adjust process |
| **P1** | “23 migrations” inventory inaccurate vs 14 new + mixed applied | Diff + history queries | Release eng | Re- basematrix; curated set only |
| **P1** | Content drift on already-applied migration files | `git diff V1.0.1 HEAD` on several SQL files | DB owner | Never edit applied versions expecting re-run |
| **P2** | Cycles gate not completed in audit | Timeout | Eng | Complete before merge |
| **P2** | Branch protection required-check list unknown | API 403 | Admin | Confirm required status checks |
| **P2** | CLI linked to **production** on this machine | `supabase/.temp/project-ref` | Local ops | Prefer preprod link for day-to-day; never `db push` without GO |
| **P2** | Preprod UI acceptance not run | Audit scope | QA | Mandatory before prod migrate GO |

---

## J. Explicit approval boundary

This document is an **audit**. It does **not** authorize:

- production migration apply,
- `migration repair`,
- merge of PR #149,
- Netlify production deployment to gogopulse.com,
- or any write against `nafxpivddesgsrthmosv` / `xbisiveavvbifbzyfhgy`.

**Next stage requires separate, explicit human approvals** for (1) curated migration set + environment, then (2) merge, then (3) deploy verification.
