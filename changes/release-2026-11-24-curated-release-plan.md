# Pulse Release 2026-11-24 — Curated Release Plan (PR #149)

**Mode:** remediation + planning only.  
**No** production migration, merge, deploy, push, `migration repair`, or history rewrite was performed.  
**Refs:** base `V1.0.1` `@1f8f790a4` · head `vasanth/marketplace-lane-48h-v1` `@c41b2563c` · feature `da9bafc24` · integrate merge `33827f2ab`  
**Linked CLI during work:** `nafxpivddesgsrthmosv` (prod) — SELECT/introspection only in prior audit; this plan does not write.

---

## A. Curated release migration set

### Verdict for the DCO / wallet / ops-UI slice of PR #149

**Curated set for a schema-first merge of the driver DCO Assigned-vehicle + wallet/Collect Payment + assigner restyle onto current production: empty.**

| Set | Versions | Rationale |
|---|---|---|
| **Required for DCO/wallet/ops UI** | _(none)_ | Uses existing prod objects (`dco_profiles` / operating-mode RPCs, `owner_vehicles`, `driver_ledger`, capture paths). No new column/RPC from the 14-file PR diff is required for that UX. |
| **Companion — only if bulk “post by trip code” ships in the same merge** | `20271118194500` (+ deps `20271118174500`, `20271118191000` if not already live) | `bulkHistory.service.ts` calls `bulk_payment_post_record`. Function absent on **both** prod and preprod. |
| **Explicitly excluded from this curated set** | Marketplace expiry family, supplier keyset, compliance pipeline, hot indexes, warehouse “before_” deps, cron/http rewrites, exchange repair | V1.0.1 debt or unrelated; see matrix. App has documented fallbacks for missing pipeline / keyset RPCs. |

### 14 vs 23 inventory (resolved)

| Scope | Count | Meaning |
|---|---|---|
| Three-dot `personal/V1.0.1...HEAD` SQL files | **14** | Migrations that are new to the PR tree **or** content-differ from the same filename on `V1.0.1`. This is the accurate “what the PR introduces as files.” |
| Wider audit inventory | **23** | The 14 above **plus** 9 filenames already present on `V1.0.1` (not new filenames in the three-dot diff) that were still audited for prod/preprod history gaps. |

**9 already on `V1.0.1` as files (not “new” to PR #149 as filenames):**  
`20261114111733`, `20261118114448`, `20271117021500`, `20271117144500`, `20271118123000`, `20271118143000`, `20271118161500`, `20271118174500`, `20271118191000`.

**Do not re-apply** the three (and other) versions already recorded in production history:  
`20261114111733`, `20261118114448`, `20270304120000`, `20270921182802`, `20270922143500`, `20271006185000`, `20271027155318`, `20271118161500`.

---

## B. Migration disposition matrix

Legend: **in_pr_diff** = in the 14-file three-dot set. **on_v101** = filename exists on base `V1.0.1`. Histories from prior audit SELECTs.

| Version | in_pr_diff | on_v101 | Prod hist | Preprod hist | Prod objects | Required by PR #149 app? | Disposition |
|---|---|---|---|---|---|---|---|
| `20261029170000` warehouses before dept mgr | Y | N | N | N | table **exists** | No (warehouse RBAC) | **Blocked** — history drift; do not re-apply SQL; reconcile separately |
| `20261112140000` award_revoked_at | Y | N | N | N | column **exists** | No | **Blocked** — history drift |
| `20261113100000` is_org_staff | Y | N | N | N | fn **exists** | No (pool bid) | **Needs review** — body checksum unknown; defer |
| `20261113104000` direct_quote names | Y | N | N | N | not fully proven | No | **Unrelated — defer** |
| `20261114110000` trips.owner_vehicle_id | Y | N | N | N | column **exists** | No for DCO wallet (plate-link dep) | **Blocked** — history drift |
| `20261114111733` plate link | N | Y | Y | Y | live | No new apply | **Already applied — do not reapply** |
| `20261118114448` blank rate basis | N | Y | Y | Y | live | Behaviour already on prod | **Already applied — do not reapply** |
| `20270304120000` list_my_org_market_bids | Y | Y | Y | Y | live; **file content differs** on HEAD | Marketplace list only | **Needs review** — applied-file drift; never re-push expecting re-run |
| `20270309030100` restore market bids identity | Y | N | N | N | unknown | Marketplace OUT-params | **Needs review / defer** unless marketplace RPC signature broken |
| `20270917100030` warehouse admin policy | Y | N | N | N | unknown | No | **Unrelated — defer** |
| `20270921182802` pause diagnostic crons | Y | Y | Y | Y | live; content may differ | No | **Already applied — do not reapply** |
| `20270922143500` http queue URL grants | Y | Y | Y | Y | live; content may differ | No | **Already applied — do not reapply** |
| `20271006185000` exchange repair SAT812 | Y | Y | Y | Y | data repair | No | **Already applied — BLOCKED for any re-apply** |
| `20271027155318` get_trips_for_org | Y | Y | Y | Y | live | Hub reads | **Already applied — do not reapply** |
| `20271106053000` hot path trip indexes | Y | N | N | N | absent | Perf only | **Unrelated — defer** (needs maintenance window) |
| `20271117021500` market_bids.expires_at | N | Y | N | Y | **absent on prod** | Marketplace 48h UX (lane), not DCO wallet | **Blocked for marketplace-hard merge**; **defer** for DCO/wallet-only curated set |
| `20271117144500` expired bid resubmit | N | Y | N | Y | depends on expires_at | Same | **Blocked / defer** with expiry family |
| `20271118123000` supplier trips keyset | N | Y | N | Y | fn **absent** prod | Supplier walk; app has missing-RPC handling | **Defer** (unlimited-access debt); not DCO/wallet |
| `20271118143000` compliance ops pipeline | N | Y | N | Y | fn **absent** prod | Catalog prefers RPC; hub walk fallback when missing | **Defer**; fallback proven in code (`getComplianceOpsPipelinePage` → `missing: true`) |
| `20271118161500` bulk operation audit | N | Y | Y | Y | tables live | Bulk UI shell | **Already applied — do not reapply** |
| `20271118174500` bulk payment paid amount | N | Y | N | Y | missing prod | Bulk amount writes | **Required if** shipping amount-write bulk path; else defer |
| `20271118191000` bulk payment mode | N | Y | N | Y | missing prod | Bulk mode | **Required if** shipping mode path; else defer |
| `20271118194500` bulk_payment_post_record | Y | N | N | N | fn **absent** both envs | `recordBulkPaymentPost` | **Required for release** only if post-by-code is in scope; else **defer** with clear product note |

### Recommended curated apply order (only if bulk post is in scope)

1. Confirm `20271118161500` already on target env (prod: yes).  
2. `20271118174500` → `20271118191000` → `20271118194500` via approved release-set dry-run (separate GO).  
3. Never include already-applied or history-drift “before_” files in the same push-set.

---

## C. Production / preproduction schema drift reconciliation plan

### Facts

| Topic | Production `nafxpivddesgsrthmosv` | Preprod `xbisiveavvbifbzyfhgy` |
|---|---|---|
| Marketplace `expires_at` | Missing | Present |
| Supplier keyset RPC | Missing | Present |
| Compliance pipeline RPC | Missing | Present |
| `bulk_payment_post_record` | Missing | Missing |
| Bulk amount/mode RPCs | Missing | Present |
| Warehouses / `award_revoked_at` / `owner_vehicle_id` | Objects exist; versions often **not** in `schema_migrations` | Similar drift class for several “before_” versions |

Environments are **not** interchangeable. Preprod is ahead on marketplace/compliance/supplier/bulk-amount; both lack `20271118194500`.

### Proposed reconciliation (review only — not executed)

1. **Inventory truth = live catalogs + migration files**, not `schema_migrations` alone.  
2. For **object exists + version missing** (warehouses, `award_revoked_at`, `owner_vehicle_id`, …):  
   - Diff live `pg_get_functiondef` / column defs vs the local migration SQL.  
   - If identical → candidate for deliberate `migration repair --status applied <version>` **only** after written owner approval (rare, targeted).  
   - If divergent → write a **new** forward migration that converges live → desired; do **not** re-run the old file.  
3. For **version applied + file content drifted** (`20270304120000`, cron/http files): treat file edits as documentation debt; ship behaviour changes only via **new** timestamps.  
4. For **missing on prod, present on preprod** (expiry, keyset, pipeline, bulk amount/mode): separate release-set(s) with schema-first GOs — **not** bundled into the empty DCO/wallet curated set.  
5. **Forbidden without GO:** `db push` of all Local-only files, `db reset`, bulk repair, force-push history, or applying empty placeholders.

---

## D. CI and lint remediation evidence

### GitHub architecture jobs (empty steps)

| Observation | Evidence |
|---|---|
| All 7 architecture jobs fail in ~2s with `"steps": []` | Run [45455151076](https://github.com/Vasanthgogox/Pulse-app/actions/runs/45455151076) job JSON via `gh run view` |
| Workflow YAML defines normal `ubuntu-latest` steps | `.github/workflows/architecture-check.yml` (checkout → setup-node → npm ci → gate) |
| Failed-job logs unavailable | `gh run view --log-failed` → “log not found”; annotations API 404 |
| Same empty-step pattern on recent PRs | Prior audit |

**Most likely cause:** org/runner setup failure (billing, Actions disabled, or jobs cancelled before step scheduling) — **not** an architecture violation inside the repo. Workflow config itself looks valid.  
**Action (owner: Eng / GitHub org admin):** restore Actions minutes/permissions; re-run the workflow; do not treat empty-step red as proof of lint/typecheck failure.

### Netlify preview

- `netlify/pulse-gx/deploy-preview` **failed** for `c41b2563c` (`6b05d137…`).  
- Preview site only — **not** gogopulse.com. Investigate separately from production deploy.

### Local lint (remediated this session — **unpushed**)

| Check | Before | After | Baseline |
|---|---|---|---|
| `node scripts/ci-baseline.js lint` | 101 → 100 (`submitDone`) → **97** | **PASS** (≤98) | 98 |

Unused bindings removed locally (not committed/pushed):

- `features/driver/components/DcoStatusScreen.tsx` — unused `submitDone`
- `app/_layout.tsx` — unused `abandonLocalSession` import
- `features/drivers/screens/DriverProfileScreen.tsx` — unused `canManageOwnerVehicles`
- `features/driver/components/DriverTripFlowCard.tsx` — unused `Image` import

Script note: “lower lint baseline to 97 in this PR” — optional ratchet; **do not push** until release GO.

### Cycles

| Check | Status |
|---|---|
| `node scripts/ci-baseline.js cycles` | **PASS** — current **94** = baseline **94** (no regression). Runtime ~31 min. |

### Other local gates (from audit + this session)

| Gate | Result |
|---|---|
| Typecheck | PASS (334 ≤ 344) — prior audit |
| lib-files | PASS (178 = 178) |
| Navigation policy | PASS 10 suites / 69 tests |

---

## E. Updated application test results

Revalidated against working tree at `c41b2563c` + local lint-only edits (no behaviour commits).

| Suite | Result |
|---|---|
| `driverIncomingAssignment.util.test.ts` | PASS |
| `driverAssignedVehicleDisplay.util.test.ts` | PASS |
| `hubTripListCounts.util.test.ts` | PASS |
| `supabaseProject.test.ts` (gx-pulse lock) | PASS |
| `marketBidExpiry.util.test.ts` | PASS |
| `complianceTripCatalog.service.test.ts` | PASS |
| `compliancePaymentAmount.util.test.ts` | PASS |
| `debitControlPod.service.test.ts` | PASS |
| `hubUnassignedExcludesCancelled.contract.test.ts` | PASS |

**Totals this session:** 9 suites · **109 tests** passed (4 suites / 59 + 5 suites / 50).

**Still NOT VERIFIED:** full `npm test`, Detox/Playwright E2E, preprod click-through (DCO vehicle, wallet Collect Payment, marketplace expiry on preprod schema, bulk post-record).

### Object → migration map (min schema for integrated app)

| App object / path | Migration family | Prod today | Class for PR #149 curated set |
|---|---|---|---|
| DCO vehicle onboarding / operating mode | Existing DCO migrations (e.g. `20271005120000` lineage) | Available | **Already available** — required UX, no new apply |
| Wallet / Collect Payment / `dco_capture` | Existing ledger / capture | Available | **Already available** |
| `market_bids.expires_at` + list/submit expiry | `20271117021500`, `20271117144500` | Missing | **Missing in prod** — marketplace lane; defer from DCO set; code tolerates null `expires_at` in UI util |
| `list_trips_where_org_is_supplier_keyset` | `20271118123000` | Missing | **Preprod only** — defer; missing-RPC path exists |
| `list_compliance_ops_pipeline_keyset` | `20271118143000` | Missing | **Preprod only** — defer; `missing: true` + hub walk |
| `bulk_payment_post_record` | `20271118194500` | Missing both | **Required if bulk post in scope** else unrelated |
| `bulk_payment_field_*` amount/mode | `20271118174500`, `20271118191000` | Missing prod | Companion to post-record |
| `trips.owner_vehicle_id` | `20261114110000` | Column exists | Drift — already available object |
| Hot indexes | `20271106053000` | Missing | Unrelated perf |

---

## F. Exact proposed release sequence

1. **Land local lint fixes** on the PR branch (commit + push) only when authorized — currently unpushed. Optionally ratchet lint baseline 98 → 97.  
2. **Restore GitHub Actions** so architecture jobs actually run steps; re-run on `c41b2563c` (or lint-fix tip).  
3. **Finish cycles gate** locally + in CI; fix only if count > 94.  
4. **Choose product scope for this merge:**  
   - **A — DCO/wallet/ops only:** curated migrations = **[]**; document marketplace/compliance/bulk limitations on prod.  
   - **B — include bulk post-by-code:** curated = `20271118174500` → `20271118191000` → `20271118194500` (after dry-run).  
   - **C — include marketplace 48h hard dependency:** separate set with `20271117021500` + `20271117144500` (schema-first; preprod already has them).  
5. **Preprod:** apply only the chosen curated set (Nihas process); smoke DCO vehicle, wallet, cancelled≠Unassigned, debit, blank basis, and any in-scope bulk/market paths.  
6. **Separate written GO — production migration** for that exact set (or GO that zero migrations are required).  
7. **Separate written GO — merge PR #149** into `V1.0.1` after schema readiness for whatever the bundle still requires.  
8. **Netlify production** verify gogopulse.com SHA; keep `gx-pulse` preprod-locked.  
9. **Production smoke** of the ten critical behaviours.  
10. Schedule **follow-up** releases for deferred debt (expiry, keyset, pipeline, history drift) — not silent passengers of this merge.

---

## G. Outstanding risks and owners

| Severity | Risk | Owner | Next action |
|---|---|---|---|
| **P0** | Actions jobs empty-step red — merge blocked / unknown real quality | Eng / GitHub org | Fix Actions; re-run |
| **P0** | Merging marketplace expiry UX without `expires_at` on prod | Release eng / DB | Defer lane **or** schema-first GO for expiry family |
| **P0** | `bulk_payment_post_record` missing both envs if post UI is used | DB owner | Apply `20271118194500` (+ deps) under GO, or disable path |
| **P0** | History drift (objects without versions) | DB owner | Checksum + repair-or-forward plan (§C) — no blind repair |
| **P1** | Netlify preview failed | Eng / Netlify | Inspect `pulse-gx` deploy `6b05d137…` |
| **P1** | Lint fixes unpushed | PR author | Commit when authorized |
| **P1** | Cycles verified locally only (CI empty-step) | Eng | Re-run Actions once runners work |
| **P1** | Preprod ≠ prod schema | Release eng | Never validate prod-only paths only on preprod |
| **P2** | Applied migration file content drift | DB owner | New timestamps for behaviour changes |
| **P2** | CLI linked to prod on this machine | Local ops | Prefer preprod link day-to-day; no push without GO |
| **P2** | No E2E / preprod UI acceptance yet | QA | Mandatory before prod migrate GO |

---

## Approval boundary (unchanged)

This plan does **not** authorize:

- production or preprod migration apply,
- `migration repair`,
- merge of PR #149,
- Netlify production deploy,
- git push of the local lint fixes,
- or any write against linked databases.

**Waiting on separate explicit human GOs** for (1) curated set + environment, (2) merge, (3) deploy verification.
