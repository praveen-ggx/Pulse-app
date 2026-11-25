# Pulse PR #149 — Execution Status (post migration isolation)

**Decision (2026-11-25): PROCEED TO MERGE AND PRODUCTION.** The owner (Vasanth) granted GO 1 (zero migrations), GO 2 (merge PR #149) and GO 3 (production deploy), and accepted the GitHub Actions billing exception. Merge uses the normal GitHub merge with `--match-head-commit`. No admin merge, no branch-protection change, no check bypass.

**GitHub CI exception (documented, not a pass):** Architecture Check never ran on any PR #149 head. Runs `45455151076` (`c41b2563c`, 3 attempts), `45476913202` (`242ebc4c3`), `45480492499` (`0998a9027`) and `45480878844` (`845d85afc`) were all refused before start: *"recent account payments have failed or your spending limit needs to be increased"*, empty runner, 0 steps, 0 billable ms. The same seven jobs were run locally instead (table below).

Frozen RC: `242ebc4c3`  
Isolation follow-up: `0998a9027` (code); `845d85afc` (docs only). Code at `845d85afc` outside `changes/` is byte-identical to the validated isolated tree: diff hash `f6d258cb777bc8c9` from `242ebc4c3`.  
Migration branch remote: `personal/vasanth/migration-reconcile-20261124` @ `c41b2563c` (10/10 files checksum-verified from the remote ref)

## Local CI rerun on `845d85afc` (2026-11-25 09:31–09:37 UTC, Node v26.12.0)

| Architecture Check job | Command | Result |
|---|---|---|
| Domain boundary lint | `node scripts/ci-baseline.js lint` | **PASS**: 97 ≤ 98 |
| App TypeScript (strict) | `node scripts/ci-baseline.js typecheck` | **PASS**: 322 ≤ 344 |
| lib/ root file count gate | `node scripts/ci-baseline.js lib-files` | **PASS**: 178 = 178 |
| Pulse V2 isolation | `npm run test:v2` | **PASS**: 197/197 |
| Navigation policy gates | `npm run test:navigation-policy` | **PASS**: 69/69 |
| App unit tests (Jest) | `npm test -- --ci --passWithNoTests --forceExit` | **PASS**: 922 suites passed / 1 skipped (pre-existing `describe.skip`); 6546 tests passed, 0 failed, 3 pending |
| Circular dependency check | `node scripts/ci-baseline.js cycles` | **PASS**: current 94 = baseline 94, exit 0, 2026-11-25 09:31:13–10:07:13 UTC on `845d85afc` |
| Netlify build | `CI=true npm run build:ci` | **PASS**: 42.8s |
| Node 22 parity | — | **NOT RUN**: Homebrew `node@22` cannot start (missing `libsimdutf.36.dylib`) |

---

## Completed this session

1. Ten migration files verified byte-identical to `242ebc4c3` and pushed/confirmed on `vasanth/migration-reconcile-20261124`.
2. Application branch: removed 9 unapplied SQL + replay test; restored 5 applied migrations to exact `V1.0.1` content.
3. Working-tree check: `git diff --name-only personal/V1.0.1 -- supabase/migrations` → **empty**.
4. Local validation on isolated tree (Node current / 26-class environment):

| Gate | Result |
|---|---|
| Full Jest | **PASS** — 922 passed / 1 skipped suites; 6546 passed / 3 skipped tests (replay suite moved off app branch) |
| Lint | **PASS** — 97 ≤ 98 |
| Typecheck | **PASS** — 322 ≤ 344 |
| lib-files | **PASS** — 178 |
| Navigation | **PASS** — 10 / 69 |
| V2 isolation | **PASS** — 25 / 197 |
| Compliance + workflow idempotency + hub cancelled contract | **PASS** — 3 / 30 |
| `build:ci` | **PASS** |
| Cycles | **NOT RUN** — SQL-only isolation; prior 94=94 on RC tip |
| Node 22 parity | **NOT RUN** (Homebrew Node 22 unavailable) |
| GitHub Architecture Check | **BLOCKED** — account billing (run `45476913202`) |
| Preprod acceptance | **BLOCKED** — no approved credentials/data-safety GO |
| Browser smoke | **NOT RUN** |
| DB migrations applied | **NONE** |

---

## Release gates at merge time

| Gate | Status |
|---|---|
| GO 1: zero migrations | **GRANTED**. PR three-dot SQL diff vs `V1.0.1` = 0 paths; no `db push`, repair or SQL write |
| GO 2: merge PR #149 | **GRANTED** (with the billing exception) |
| GO 3: production deploy | **GRANTED**. Merge auto-publishes `pulse-gx` → gogopulse.com |
| Netlify preview | **PASS** on `0998a9027` (deploy `6b05f27d…`, 115s); `845d85afc` is docs-only |
| Preprod acceptance | **NOT RUN**: no approved credentials; proceeding on owner GO |
| Browser smoke (logged-in) | **NOT RUN** |

Rollback: republish Netlify deploy `6b05af3af91059662010a88b` (commit `1f8f790a4`), then revert the merge on `V1.0.1` with a new commit (no force-push).
