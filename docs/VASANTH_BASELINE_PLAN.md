# Roadmap: move the team onto vasanth/V1.0.1

Owner: Nihas. Last updated 2026-10-10. Nothing below has been run unless it's ticked.

## Goal

When this is done:

- Everyone builds on vasanth's `V1.0.1` and sends small PRs there.
- Sneha's compliance work and Praveen's POD work are in his `V1.0.1`, clean and fully working.
- Preprod matches his line (prod schema plus approved changes), and Netlify preprod deploys his branch.
- `V1` is retired but archived, so nothing is lost.

## Decisions so far (call with vasanth, 2026-10-10)

1. PRs go to vasanth's `V1.0.1`.
2. He takes nothing from V1 now. Later: Sneha's compliance and Praveen's POD, only when finished, clean and fully working, without Nihas's changes.
3. Sneha keeps building compliance on V1. Praveen keeps building POD on V1.
4. The DB functions his code calls exist on prod (see Facts). No extra migrations needed.
5. Netlify preprod deploys `V1` for now.
6. Preprod is rebuilt only after Sneha's and Praveen's packs are merged.

## Roadmap

### Stage 0: protect what exists (today, 10 min)

- [x] Create two archive tags at exact hashes and push them to `origin`. Done 2026-10-10; verified on origin and locally.
      `git tag archive/V1-20261010 81475bf9681aa3c558001b55f81d2fcecbba981a`
      `git tag archive/merge-vasanth-20261010 7432aaa8902bf5a3d55ce1694c25d72ca37a90a7`
      `git push origin archive/V1-20261010 archive/merge-vasanth-20261010`
- [x] Verify with `git ls-remote --tags origin 'archive/*'`. Both show exactly those hashes.
- [ ] Park `nihas/merge-vasanth-V1.0.1`: no push, no PR.
- [ ] Leave preprod and `origin/V1` untouched.

### Stage 1: Nihas starts on his base (now, ongoing)

- [ ] Set up a local Supabase (needs Docker): `supabase start`, then `supabase db reset` (local only), from a checkout of `vasanth/V1.0.1`. This is your test database, because preprod has V1's extra schema.
- [ ] For each feature: `git switch -c nihas/vb-<feature> vasanth/V1.0.1`, push to `origin` only, and open a small PR into his `V1.0.1`.
- [ ] New migrations: `supabase migration new <name>` (real timestamp), plus a release-set file under `supabase/release-sets/`, checked with `npm run db:push-set -- <set> --dry-run`.
- Limit: your new migrations can't be pushed to preprod until Stage 4, because preprod's history doesn't match his folder yet. Test locally; vasanth pushes to prod after merging.

### Stage 2: Sneha and Praveen finish on V1 (ongoing, their pace)

- [ ] They keep using V1, preprod and Netlify as today.
- [ ] Before finishing, each writes a **dependency list**: which commits, files and migrations from V1 (yours or anyone's) their feature needs to work. For Sneha this includes at least the slab settings (from commit `220102ad`, files only) and the compliance pieces she builds on.
- [ ] Each marks their feature "done on V1": it works on preprod and its tests pass.

### Stage 3: build the clean packs on his base (when each feature is done)

One pack per feature (Sneha compliance, Praveen POD; split further if large):

- [ ] Cut a fresh branch from the latest `vasanth/V1.0.1`, e.g. `sneha/vb-compliance`.
- [ ] Bring over their own commits plus exactly the items on their dependency list. Check `git show --stat` first. Copy files instead of cherry-picking when a commit carries unrelated files (like `220102ad`, which has 3 unrelated migrations).
- [ ] Adapt to his code: his compliance files differ from V1's, and a clean cherry-pick doesn't prove the feature works.
- [ ] Migrations: re-issue each with a **new** timestamp (never the old version). Before writing it, compare the object on preprod (columns, constraints, indexes, grants, RLS, function signatures) with the intended definition. Use `if not exists` / `create or replace` only where they match exactly. Never loosen a policy.
- [ ] Tests before the PR:
  - **Fresh install:** local DB from his files plus the pack's migrations.
  - **Existing schema:** the pack's migrations on a local restore of the preprod backup. Data such as the 10 slab rows must survive.
  - **App:** the feature works end to end, with no new typecheck, lint or test failures.
  - **Security:** RLS, grants and function permissions are the same as or stricter than before.
- [ ] PR into his `V1.0.1` listing source commits, dependencies, migrations, release sets and test results.
- [ ] Vasanth reviews, merges, and pushes migrations to prod with `db:push-set`.

### Stage 4 investigation (read-only, done 2026-10-10)

Schema-only dumps of `public` and `private` from prod and preprod were compared object by object. The dumps are kept privately outside the repo.

- **Target is prod's real history and schema, not a branch.** No branch matches prod: vasanth/V1.0.1 differs by 12 + 11 versions, vasanth/V1 by 23 + 0, origin/V1 by 22 + 17.
- **History:** prod 930, preprod 942, shared 925. Prod-only (5): `20270930173000`, `20271005164900` (neither is in any branch), `20271005211835`, `20271005215938` (driver execution), `20271006185000` (TRP-191, data only). Preprod-only (17): the 11 team migrations, plus 6 old merge versions whose objects prod restored under `20270930220000`. 942 − 17 + 5 = 930. ✓ Two shared versions are named `remote_history_placeholder` on preprod (name only).
- **Schema:** 33 objects only on prod, 77 only on preprod, 23 changed. Classified as:
  - extra on preprod: the team objects (slabs, compliance batch, stops, refund, bank fields, reject, POD-edit policy);
  - changed prod objects: constraints, the guard function, the hard-copy POD function;
  - missing on preprod: driver execution, the stop-execution RLS rework, the `v_long_haul_health` view, `get_driver_owned_trip`;
  - environment, keep as is: project URLs, removed Slack webhook, comment and whitespace differences;
  - **Needs Verification:** `get_driver_owned_trip` is on prod but its version isn't in prod's history; `tg_trips_block_blacklisted_supplier`; `fill_driver_commission`; 2 checkpoint indexes found only on preprod.
- Correction to the earlier plan: 2 of the "skipped" driver-execution migrations and the TRP-191 repair **are on prod**. Preprod is behind, not prod.

Before any repair:

- [ ] Rotate exposed credentials (prod DB password, prod service_role key, the Slack webhook in the prod monitor functions, the Gemini key), with their owners.
- [ ] Get from vasanth the SQL source for `20270930173000`, `20271005164900`, and how `get_driver_owned_trip` reached prod. Don't recreate them from guesses; prod's dump is a fallback only with his OK.
- [ ] Resolve the 4 Needs Verification items.
- [ ] For each object, decide remove / restore / add / keep / investigate, with its dependencies and data checked. Justify each history change on its own, not in bulk.

### Stage 4: switch preprod to his line (after both packs are merged)

Pick one, with vasanth:

- **Option A, rebuild (clean):** back up preprod, rebuild it from prod's schema, resync data with `~/pulse-preprod-sync`, then push his pending release sets.
- **Option B, repair history (quick):** keep preprod's data and schema and fix only the migration history. Preflight: back up, export `schema_migrations` to CSV, save `supabase migration list --linked` from his branch, and check each version (see the table below). Write the exact repair commands here for approval, then run them. Afterwards, diff the history CSV (only the intended versions change), and `migration list` must show nothing remote-only.

Then:

- [ ] Point Netlify preprod at his `V1.0.1`.
- [ ] Separately, and only with approval: drop leftovers nobody ported, after a dependency and row check. `indent_stops`/`trip_stops` have 0 rows. `marketplace_fee_refunds` has 1 row: export it first and ask who needs it.

### Stage 5: retire V1

- [ ] Everyone cuts branches from his `V1.0.1` only.
- [ ] Update `.cursor/rules/team-git-workflow.mdc` and `CLAUDE.local.md`: the source of truth becomes his `V1.0.1`, and V1 is archived.
- [ ] Optional, as a pack if vasanth wants it: the CI no-regression checks (`scripts/ci-baseline.js`, `.github/ci-baseline.json`).
- [ ] Done when: both packs are merged, preprod is on his line, Netlify deploys his branch, and nobody works on V1.

## Queued follow-ups (decide after Sneha's PR)

- [ ] **Wire vasanth's multi-file trip document upload into our compliance upload.** His `uploadTripDocumentsAdditively` (`features/tripCompliance/services/complianceTripDocumentUpload.service.ts`) adds each LR / Invoice / E-way file as a new document. It is still in `nihas/team-sync-v1.0.1`, but nothing calls it since `ComplianceDocumentReviewSheet` was removed, so a second upload of the same type replaces the first. Do it as a new commit on top of the branch (never rewrite it), after Sneha's compliance PR, since she may touch the same upload code.

## Never

- Push to `vasanth` or `gogopulse`, or write to prod.
- `supabase db reset --linked` (it wipes preprod).
- Apply his 5 pending migrations (20271005130000, 20271005190000, 20271005211835, 20271005215938, 20271006185000) without his approval.
- Change the preprod migration history or drop schema before Stage 4.
- Delete V1 or team branches.

## Facts (checked read-only, 2026-10-10)

| What | Evidence |
|---|---|
| Archive hashes | `origin/V1` = `81475bf9…981a`, `nihas/merge-vasanth-V1.0.1` = `7432aaa8…90a7`. Tags `archive/V1-20261010` and `archive/merge-vasanth-20261010` point to these two commits; they were created and verified on `origin` on 2026-10-10. |
| Baseline | `vasanth/V1.0.1` = `d9d9055db772a439e26b847dad0845102f3c3005`, fetched 2026-10-10 (previously recorded as `fdb96fe1…00e2`). The 16 newer commits were inspected and don't touch `supabase/`. Migration head: `20271008101106`. |
| His vendor migrations | `20260928122336` / `20260928125247` are byte-identical to our `20270925195000` / `20270925195500`. Preprod has those applied, and all 9 columns, the TDS table and both triggers exist. |
| Functions his code calls | On preprod and prod with the same signatures: `decline_trip_compliance`, `log_trip_hard_copy_pod_courier`, `get_trip_documents_lr_pod_batch`. `reject_trip_compliance` is on preprod only; his code never calls it (it's only in a URL pattern in `lib/supabaseHttp.util.ts`). |
| Commit `220102ad` (slabs) | Slab files plus 3 unrelated migrations (bank_docs type, reject_verified, freight_route_stops). |
| Commit `3293bf63` (Sneha) | 7 compliance payment/export files plus tests. Uses the slab service. |
| Preprod data in team objects | Slabs 10 rows, bank holder/branch 1 account, `bank_docs` 1 document, refunds 1 row, stops 0 rows. |

Team migrations on preprod that aren't in his folder (for Stage 3 and 4):

| Version | Migration | By | Notes |
|---|---|---|---|
| 20260930165033 | org_document_charge_slabs | Nihas | Sneha's compliance needs it |
| 20260930170616 | org_document_charge_revoke_anon | Nihas | Goes with slabs |
| 20261005122431 | compliance_batch_trip_facts_and_vault | Nihas | Only if Sneha's pack needs it |
| 20270930153000 | freight_route_stops | Nihas | Unused; duplicates his extra stops |
| 20270930201500 | indent_cancel_reason | Nihas | His own migration covers it |
| 20270930235100 | refund_test_marketplace_fee_and_revoke_indent | Nihas | Test-only; 1 refund row |
| 20261005080754 | add_bank_account_beneficiary_branch | Sneha | Her pack if she uses it |
| 20270930123100 | trip_documents_bank_docs_type | Sneha | 1 document uses it |
| 20270930124500 | reject_verified_trip_compliance | Sneha | Her pack if she uses Reject on Verified |
| 20271001093000 | hard_copy_pod_optional_dispatch_date | Praveen | Praveen's pack |
| 20271006154500 | trip_workflow_events_org_update | Praveen | Praveen's pack |

Vasanth also wrote 9 migrations that exist only on the V1 line (perf fixes, the 30 Sep rollback and restore pair, and others). They stay in the DB, and only their history changes in Stage 4.
