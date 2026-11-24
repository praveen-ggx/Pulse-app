# Pulse Release 2026-11-24 — External Blocker Diagnosis (PR #149)

**Not a code/workflow fix document.** Architecture Check YAML is valid; empty-step failures are account billing. Netlify preview exit 2 needs log + clean rebuild after CI billing is fixed or independently.

No production migration, merge, or gogopulse.com production deploy was performed.

---

## 1. GitHub Actions — ROOT CAUSE IDENTIFIED

### Verdict

**Infrastructure / billing refusal — not a workflow defect.**

Do **not** edit `.github/workflows/architecture-check.yml` to “make CI green.” Changing the workflow will not start runners.

### Evidence

| Signal | Value |
|---|---|
| Pattern | All 7 jobs fail in ~2–3s, `runner_name: ""`, `steps: []`, logs 404 |
| Billable usage | `total_ms: 0` for UBUNTU (nothing ran) |
| Annotation (authoritative) | *"The job was not started because recent account payments have failed or your spending limit needs to be increased. Please check the 'Billing & plans' section in your settings"* |
| First empty-runner cliff | **2026-11-16 ~08:31 UTC** (run `43831936888`); last real runners earlier same morning |
| Last full green Architecture Check | **2026-11-14 15:25 UTC** (run `43610102900`) |
| Rerun test | Attempt **3** of `45455151076` — same annotation, same empty runners |
| Repo | Private, owner user `Vasanthgogox` |
| Workflow config | Normal `ubuntu-latest` jobs; Actions enabled; allowed actions = all |

### Owner action (required — cannot be done from the agent)

1. Open **GitHub → Settings → Billing & licensing** (personal account `Vasanthgogox`).
2. Check **Actions** usage / included minutes for private repos.
3. Fix **payment method** if failed, **and/or** raise / create an Actions **budget** that allows overage (or wait for monthly quota reset).
4. After billing clears (can take time), run:
   ```bash
   gh run rerun 45455151076 --repo Vasanthgogox/Pulse-app --failed
   ```
5. Confirm jobs show real `runner_name` and non-empty steps; all Architecture Check jobs green.

### What we will not do

- Modify workflow files to bypass checks.
- Admin-merge or ignore required checks.
- Treat local gate PASS as a substitute for green GitHub checks.

---

## 2. Netlify preview (`pulse-gx` / PR #149)

### Facts

| Item | Value |
|---|---|
| Site | `pulse-gx` (`915090dc-94dd-4be1-9d5e-1541f237d5f1`) — production URL host is gogopulse.com |
| Failed deploy | `6b05d137ff29d2c509a266ac` · commit `c41b2563c` · context `deploy-preview` |
| Error | `Failed during stage 'building site': Build script returned non-zero exit code: 2` |
| Prior success same PR | `6b05cec00d1dd6ba55d22fae` · commit `da9bafc24` · **ready** in 142s (~10 min earlier) |
| Build command | `npm run build:ci` (matches `netlify.toml`) |
| Dashboard log | Not readable from agent browser (401); API `log_access` unavailable |

### Likely code delta vs last green preview

`da9bafc24` → `c41b2563c` brings the V1.0.1 integrate merge, including:

- `expo-task-manager` added to root `package.json` / lockfile
- `driverLiveLocationTask.service.ts` imported from `app/_layout.tsx`

Local `npm run build:web` initially failed with missing `expo-task-manager` in a dirty `node_modules`; after install, **PASS**. Clean Netlify `npm ci` *should* install the locked package — exit 2 may still be OOM, subproject build, or monorepo base misconfig.

### Site setting concern (needs human confirmation)

Netlify UI/API `build_settings.package_path` = **`packages/platform/identity`**.

That package has **no** `build:ci` script. Running `npm run build:ci` with cwd forced there fails locally with `Missing script: "build:ci"` (npm exit ≠ 0).  
Yet `da9bafc24` preview succeeded with the same site settings timestamped `updated_at` 2026-11-24T15:37:30Z — so either package_path is not applied to deploy-preview the same way, or another layer runs root `netlify.toml`. **Do not silently change production site settings** without an explicit GO; clearing a wrong `package_path` may be required but affects how `pulse-gx` builds.

Also: `allowed_branches: ["V1.0.1"]` (branch deploys); deploy-previews still ran for PR #149.

### Owner action

1. Open https://app.netlify.com/projects/pulse-gx/deploys/6b05d137ff29d2c509a266ac while logged in; copy the **build log** tail (first error).
2. In Site configuration → Build & deploy → **Package directory / Base directory**, confirm whether `packages/platform/identity` is intentional; for the Expo root app it should be **empty / repo root**.
3. After any setting fix, **Retry deploy** of PR #149 preview (or push a no-op on the RC once lint is pushed).
4. Confirm preview URL loads: `https://deploy-preview-149--pulse-gx.netlify.app`.

### Local `build:ci` reproduction (this session)

```text
CI=true NODE_OPTIONS=--max-old-space-size=4096 npm run build:ci
→ EXIT 0 in ~53s (expo export ok, compress ok) with expo-task-manager present in node_modules
```

So the **Netlify exit 2 on `c41b2563c` is not reproduced** on a healthy local tree that already includes the merge-defect fix / deps. Remote failure still needs the dashboard build log (or a preview retry after billing/settings). Parallel readiness work also identified a **duplicate-function merge defect** in `complianceAdvanceFinanceBreakdown.service.ts` that breaks Metro parse on the **pushed** `c41b2563c` tip — that alone can explain Netlify exit 2 on the remote tip before local fixes. See `changes/release-2026-11-24-final-readiness.md` §B.

---

## 3. Release candidate freeze (blocked on §1–§2)

| Item | Status |
|---|---|
| Intended RC branch | `vasanth/marketplace-lane-48h-v1` |
| Current remote head | `c41b2563c` |
| Local lint fixes (97) | **Unpushed** — push only after CI billing fixed / with RC freeze GO |
| Migration scope | **Empty** for DCO/wallet; `bulk_payment_post_record` **out of scope** unless separately approved |
| Three GOs | Migration / Merge / Production — **not requested until** CI + preview green |

---

## 4. Immediate asks for account owners

| # | Who | Action |
|---|---|---|
| 1 | GitHub account owner (`Vasanthgogox`) | Fix Actions billing / spending limit / payment; re-run Architecture Check |
| 2 | Netlify team owner | Read failed deploy log; fix package directory if wrong; retry PR 149 preview |
| 3 | Release eng | After both green: push lint-only commit, re-verify gates at that SHA, then request the three GOs |

**Do not touch production DB or merge PR #149 while §1 or §2 is unresolved.**
