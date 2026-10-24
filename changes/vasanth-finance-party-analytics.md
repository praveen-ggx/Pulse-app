# vasanth finance-party-analytics

## What
- Vault preview pipeline and document delete order on trip detail / workspace docs.

## Why
- Preview cards must not treat a failed delete as success, and preview evidence must stay separate from unclassified full-suite noise.

## Areas
- `components/documentPreviewPipeline.util.ts`
- `features/trips/utils/storagePreviewObjectUrl.util.ts`
- `features/trips/services/tripDocuments.service.ts`
- `features/compliance/services/documents.service.ts`
- `features/trips/components/trip-detail/TripDetailScreen.tsx`

## Migrations
- `20271024194500_entity_documents_audit_delete_null_fk.sql` — local only; not applied remotely.
- sha256 `5ecc25def4ee256e25a0c2169ed2c285dc599f8ff70824d4ff2ce776d17e09da` (approval-readiness pass).

## Tested
- Focused preview tests: PASS — 2 suites, 11/11 (prior focused run; not rerun in the approval-readiness pass).
- Focused deletion + audit lookup (approval-readiness pass): PASS — 4 suites, 13/13.
- Broad Jest run: INCOMPLETE — 21 suite failures were reported, but the saved log identifies only two worker crashes. The remaining 19 failures are unclassified. Full suite not rerun.
- Browser Vault sign-off: PENDING / BLOCKED — no authorized session.
- Workspace-document deletion on preprod: BLOCKED — audit-trigger FK; migration local-only; no `GO apply`.
- `npm run db:preflight`: NOT RUN this pass — local CLI `supabase/.temp/project-ref` is `nafxpivddesgsrthmosv` (prod). Do not list/push against that target.

## Verification report (2026-10-24)

Branch: `vasanth/finance-party-analytics`. Working tree left as found (~300 dirty/unmerged paths including UU files). No reset, stash, clean, rebase, merge, or push. No remote migration applied. Full Jest not rerun.

### Preview pipeline — PASS (unit only; prior evidence)

Inspected `components/documentPreviewPipeline.util.ts` and `components/pdfEmbedCache.util.ts`. Focused suites are those two files (9 + 2 = 11 tests). Existing command/result preserved:

`npx jest --selectProjects app --watchman=false --forceExit --maxWorkers=2 components/__tests__/documentPreviewPipeline.util.test.ts components/__tests__/pdfEmbedCache.util.test.ts`

Result: PASS — 2 suites, 11/11. Not rerun in this pass.

Code review (not a browser measurement):
- Cache identity is storage path + document version, not a signed URL.
- Thumb vs full tiers; replacement invalidates by document-key prefix and disposes cached bitmaps.
- Failed renders are not cached, so retry is possible.
- Abort drops queued work and does not cache cancelled results.
- Bounded cache disposes evicted values. PDF embed rasters page 1 to JPEG; source PDF stays in storage.
- No defect reproduced in this inspection. No performance or network-byte claim.

### Browser Vault — PENDING / BLOCKED

This pass listed Cursor browser tabs: **empty**. No signed-in preprod tab, no credentials requested, no tokens used. All six checks remain **NOT TESTED**.

| Check | Status | Action | Observed | Errors | Evidence |
|---|---|---|---|---|---|
| 1. Card rendering | NOT TESTED | — | — | — | No session |
| 2. Thumbnail loading | NOT TESTED | — | — | — | No session |
| 3. Thumbnail retry | NOT TESTED | — | — | — | No session |
| 4. Full-document opening | NOT TESTED | — | — | — | No session |
| 5. Repeated open/close | NOT TESTED | — | — | — | No session |
| 6. Replacement invalidation | NOT TESTED | — | — | — | No session |

Manual checklist (signed-in preprod only; do not treat an unauthenticated page as a pass):
1. Open trip Asset Vault — cards show labels, type, and status (not empty placeholders only).
2. Thumbnails appear for representative files already on vault.
3. If a thumb fails (expired URL), retry loads it without a stuck error.
4. Open a file — the same document as the card, expected pages/content.
5. Open/close several times — no console/network error loop; no leftover overlay; no stale previous file.
6. Replace a file — old thumb/preview is gone; new version shows.

### Deletion (client) — PASS (this pass); remote workspace delete BLOCKED

Trip/POD (`deleteTripDocument`): row `.delete().select("id")` first; storage only after a deleted row (or synthetic storage-only id). DB error returns the message and skips storage. UI: `executeVaultDelete` shows Delete failed and returns false; preview list is updated only after success; Deleted is shown only after success.

Driver/vehicle workspace (`deleteComplianceDocument`): same order. FK error is returned as Delete failed; storage is not removed; card is not hidden.

Defect found this pass: `deleteComplianceDocument` ignored storage-remove errors and returned `{ error: null }` after a successful row delete. Smallest fix: return `new Error(storageError.message)`. UI already maps any error to Delete failed (does not hide the card or show Deleted). Added matching focused tests for both delete helpers.

This-pass command:

`npx jest --ci --silent --maxWorkers=2 --selectProjects app --watchman=false --forceExit features/trips/services/__tests__/tripDocumentDeleteOrder.test.ts features/compliance/services/__tests__/deleteComplianceDocument.order.test.ts`

Result: PASS — 2 suites, 8/8.

Client correctness is not the same as preprod `entity_documents` delete: that still fails until the trigger migration is applied.

### Migration review — reviewed, not applied (BLOCKED)

File: `supabase/migrations/20271024194500_entity_documents_audit_delete_null_fk.sql`.

1. Compatible with repo trigger: `CREATE OR REPLACE` of `entity_documents_audit_trigger()`. DELETE previously inserted `OLD.id` after the row was gone; that is the known FK failure. INSERT/UPDATE bodies match `20260828010000`.
2. INSERT still writes `document_id = NEW.id`. UPDATE still writes `document_id = NEW.id` plus notes/metadata. Unchanged.
3. DELETE writes `document_id = NULL` and `metadata = { document_id: OLD.id, doc_type, storage_path }`, plus `organization_id`, `entity_type`, `entity_id`, `action='deleted'`, `old_status`.
4. AFTER DELETE + NULL `document_id` satisfies `document_audit_log_document_id_fkey` (`ON DELETE SET NULL`). Historical rows stay on `entity_id`.
5. Consumers: `DocumentAuditEntry.documentId` is already `string | null`. `getDocumentAuditLog(documentId)` filters `.eq("document_id", documentId)` and therefore cannot return the delete event after the row is gone. Post-delete history is via `entity_id` + `metadata.document_id`. That was already true for SET NULL history.
6. Rerun: `CREATE OR REPLACE FUNCTION` is idempotent. Assumptions not met (missing table/function) fail the apply; no data rewrite of existing audit rows. `SET LOCAL lock_timeout = '5s'` bounds wait-to-acquire only.
7. Rollback: restore the previous function body. That re-breaks deletes. It cannot restore deleted `entity_documents` rows or un-NULL already-written delete audit `document_id` values.
8. `npm run db:preflight` lists Local vs Remote, rejects empty Local-only files, and refuses frozen pending versions. It does not execute this SQL, does not prove the live trigger, and may miss Local-only rows when `migration list` is JSON. A prior printed pass is not proof the trigger is fixed.

Unresolved (human approval required):
- Explicit “GO apply” through the normal preprod process (Nihas / linked preprod). Do not apply from this pass.
- After apply: one disposable workspace-document delete (plan below).
- Whether any admin UI besides `getDocumentAuditLog` must show delete events by `metadata.document_id`.

### Post-approval verification plan (do not run until applied)

Use a designated disposable driver/vehicle workspace document (test org), not a production business file. Record its `id`, `entity_id`, `doc_type`, and `storage_path` before delete.

| Step | Check | Where |
|---|---|---|
| 1 | `pg_get_functiondef('entity_documents_audit_trigger'::regproc)` contains DELETE `document_id` NULL and `metadata.document_id` | DB |
| 2 | Delete that designated document from Vault | Browser + client |
| 3 | `entity_documents` has no row for that `id` | DB |
| 4 | Latest `document_audit_log` for that `entity_id` / `action='deleted'` has `document_id IS NULL` | DB |
| 5 | Same row `metadata` has previous `document_id`, `doc_type`, `storage_path` | DB |
| 6 | Same row `entity_id` matches the workspace entity | DB |
| 7 | Storage object is gone only after step 3 succeeded | Storage / network |
| 8 | Vault card disappears only after success (not on Delete failed) | Browser |
| 9 | Forced fail (revoke permission or restore old function in a scratch env only): card and file remain | Browser + DB + storage |
| 10 | No second unexpected `deleted` row; no new client/server errors | DB + browser console |

Failed DB delete before apply must still show Delete failed and leave file + card. Do not execute this plan against preprod until the migration is approved and applied.

### Broad Jest — INCOMPLETE

Saved log: `terminals/91060.txt` (`tail -20` of an accidental repo-wide run). Identified only:
- `IndentDetailScreen.anonymous.test.tsx` — SIGABRT
- `IndentDetailScreen.anonymousCounter.test.tsx` — SIGTERM

Summary: 21 failed / 554 passed. The other 19 suite failures remain unclassified. Not treated as preview or deletion regressions. Full suite not rerun.

### Approval-readiness pass (same day, later)

Branch still `vasanth/finance-party-analytics`. Unmerged/unrelated files left in place. No reset/stash/clean/rebase/merge/push. No remote SQL.

#### Migration findings (re-read actual files)

- Repo trigger `20260828010000`: AFTER INSERT OR UPDATE OR DELETE; DELETE inserts `document_id = OLD.id` (no metadata). That is the FK failure.
- Table `20260827200000`: `document_id` references `entity_documents(id) ON DELETE SET NULL`. Types already have `document_id: string | null`.
- Proposed file replaces **only** `entity_documents_audit_trigger()`. It does not DROP/CREATE the trigger. INSERT/UPDATE SQL matches the 20260828 bodies.
- New DELETE writes `document_id = NULL` and `metadata = { document_id, doc_type, storage_path }`.
- Added fail-closed `DO $$` checks: trigger exists and is AFTER INSERT/UPDATE/DELETE; FK exists and is `ON DELETE SET NULL`.
- `CREATE OR REPLACE` is rerunnable. Failed assumption check aborts the transaction (function not left half-applied).
- `getDocumentAuditLog` previously used `.eq("document_id", documentId)` only. After a successful delete, the FK already SET NULLs older rows, and the new delete row is born NULL — that API could not return the delete event. Smallest fix: `.or(document_id.eq.id, and(document_id.is.null, metadata->>document_id.eq.id))` via `documentAuditLookupOrFilter`.
- After delete, created/updated audit rows also have `document_id` NULL and **do not** store `metadata.document_id`. Full pre-delete history is via `entity_id`, not this single-document lookup. That is existing FK behavior, not a new INSERT/UPDATE change.
- `useDocumentAuditLogQuery` is the only caller (no other UI consumer found).
- Rollback: restore the previous function body. That re-breaks deletes. It cannot restore deleted `entity_documents` rows or un-NULL audit FKs.
- `db:preflight` (`scripts/db-preflight.sh`) lists linked Local vs Remote, hard-fails empty Local-only files, classifies frozen pending versions. It does **not** execute this SQL or prove the live trigger. Not run this pass because the CLI is linked to prod.

#### Local database validation (localhost `supabase_db_pulse` :54322 only)

`npm run db:preflight` skipped (prod link).

Rolled-back local transaction (then confirmed orgs still 0 and the live function still inserts `OLD.id`):

- Assumption checks passed.
- Function after replace contained NULL delete + metadata `document_id`.
- Disposable org + driver `entity_documents` insert / update / delete succeeded inside the txn.
- After delete: row gone; `deleted` audit had `document_id` NULL; metadata kept old id, `license`, `local-test/vault-delete-probe.pdf`; `entity_id` matched.
- `created` / `updated` rows still existed on `entity_id`; their `document_id` was NULL because `ON DELETE SET NULL` (expected).
- `ROLLBACK` — no persistent local schema or data change.

This is **not** preprod verification.

#### Storage leftover messaging

`deleteComplianceDocument` / `deleteTripDocument` now return: record removed, file may still be in storage, plus the storage error. UI still titles the alert **Delete failed** and does not show **Deleted**. No storage-only retry/cleanup path exists: a second delete sees no row and returns “could not be deleted.” Follow-up (not in this pass): cleanup-by-path recovery.

#### Commands this pass

`npx jest --ci --silent --maxWorkers=2 --selectProjects app --watchman=false --forceExit features/compliance/utils/__tests__/documentAuditLookup.util.test.ts features/compliance/services/__tests__/getDocumentAuditLog.lookup.test.ts features/compliance/services/__tests__/deleteComplianceDocument.order.test.ts features/trips/services/__tests__/tripDocumentDeleteOrder.test.ts`

Result: PASS — 4 suites, 13/13.

Local rolled-back probe: PASS, then ROLLBACK.

Preview 11/11 not rerun. Full Jest not rerun. No remote apply.

### Preprod GO/NO-GO prerequisites

Do **not** apply until every item is true:

1. Explicit human instruction: `GO apply`.
2. Target is preprod project ref **`xbisiveavvbifbzyfhgy`**. This machine’s `supabase/.temp/project-ref` is currently **prod** `nafxpivddesgsrthmosv` — relink or use a worktree linked only to preprod. Never apply from a prod-linked CLI.
3. File version `20271024194500` and sha256 `5ecc25def4ee256e25a0c2169ed2c285dc599f8ff70824d4ff2ce776d17e09da`.
4. Operator accepts rollback limits (restore old function re-breaks deletes; cannot undelete rows).
5. A designated disposable driver/vehicle workspace document exists; record `id`, `entity_id`, `doc_type`, `storage_path` before delete. No customer file.
6. Baseline: `entity_documents` row present; current audit rows for that id/`entity_id` noted.
7. Normal process: `db:preflight` on the **preprod-linked** CLI, then the approved release-set / `db:push-set` path — not a raw full-tree push.

Ready for a human GO/NO-GO on those terms. Not applied.

### Post-application runbook (only after GO apply)

**DB checks**

1. `supabase migration list --linked` (preprod) shows `20271024194500` on Remote.
2. `select pg_get_functiondef('public.entity_documents_audit_trigger'::regproc);` contains DELETE `NULL` and `metadata.document_id`.
3. Trigger still `AFTER INSERT OR DELETE OR UPDATE` on `entity_documents` (event order may vary).
4. Delete only the designated disposable document from Vault (or SQL if UI is unavailable).
5. `entity_documents` has no row for that `id`.
6. Latest `document_audit_log` for that `entity_id` / `action='deleted'`: `document_id IS NULL`; metadata has old id, type, path; `entity_id` matches.
7. No extra unexpected `deleted` row for that entity. Prior created/updated rows may now have `document_id` NULL (FK SET NULL).
8. Application: `getDocumentAuditLog(oldId)` returns the delete event (`documentId` null, metadata set).

**Browser / storage**

9. Card disappears only after success (not on Delete failed).
10. Storage object gone only after the DB row is gone.
11. Failure path (before apply, or a refused delete): card + file remain; alert shows the real error.
12. Storage leftover after a successful row delete: alert must say the record was removed and the file may remain — not “Deleted”.
13. Console/network: no new unexpected errors.

Do not run this runbook against preprod until the migration is approved and applied.

### Remaining release blockers

1. Authenticated browser Vault checks 1–6 — PENDING (session required).
2. Migration apply to preprod — BLOCKED (`GO apply` + preprod-linked CLI; not applied).
3. Live disposable workspace-document delete + audit/storage/UI verification — BLOCKED on (2).
4. Broad Jest — INCOMPLETE (19 failures unclassified).
5. Storage-only cleanup retry — follow-up, not a migration apply blocker.
6. Historical-audit trade-off — PENDING accept vs redesign (see decision rule below).
7. Preprod CLI isolation — BLOCKED. This checkout and every scanned sibling worktree with a `project-ref` are **not** `xbisiveavvbifbzyfhgy` (most are prod `nafxpivddesgsrthmosv`; one other is `kfaqqunuxgpdhboijdsl`). `db:preflight` was not run.

### Human checkpoint (conditional GO for preparation only)

Operator recommendation recorded: local 13/13 + rolled-back SQL probe are evidence; preprod apply and release sign-off stay separate.

This pass reconfirmed artifact sha256 `5ecc25def4ee256e25a0c2169ed2c285dc599f8ff70824d4ff2ce776d17e09da` for `20271024194500`. No worktree was created. This checkout was **not** relinked. No preflight. No apply.

**Historical-audit trade-off — PENDING explicit human decision (accept vs redesign):**

- After `entity_documents` delete, `ON DELETE SET NULL` clears `document_audit_log.document_id` on **older** audit rows (`created` / `updated` / `verified` / etc.).
- Those older rows do **not** keep the original document ID in metadata.
- The **new delete event** stores id / type / path in metadata and has `document_id = NULL`.
- Lookup of the delete event: `getDocumentAuditLog(oldId)` (metadata) or `entity_id`.
- Lookup of the full earlier trail after delete: **`entity_id` only**.

Decision rule (operator):
- **Accept** this migration only if retaining the original document ID on every historical audit row is **not** required.
- If that retention **is** required: **pause**. Do not apply. Redesign the audit relationship first (this pass does not implement that redesign).

Recorded decision: **accepted by the operator** (2026-10-24 apply-workflow pass). Original document ID on every older audit row is **not** required. Full earlier history after delete is by `entity_id`. The new delete event keeps id/type/path in metadata. No audit-relationship redesign in this pass.

**Storage cleanup follow-up (tracked, not an apply gate):**
If storage remove fails after the row is gone, the UI reports leftover file and does not claim Deleted. There is no storage-only retry; a second delete sees no row. Recovery-by-path remains open.

Ordered next actions (not executed):
1. Isolated environment whose `supabase/.temp/project-ref` is exactly `xbisiveavvbifbzyfhgy`.
2. `db:preflight` only after that proof.
3. Reconfirm version + sha256.
4. Accept or reject the historical-audit trade-off.
5. Explicit `GO apply` through the normal preprod process.
6. Disposable workspace-document verification (row, audit, metadata, storage, UI).
7. Six authenticated browser Vault checks.

### Apply-workflow pass (same day) — STOPPED at target gate

Operator accepted the historical-audit trade-off and authorized the workflow **only if** every target-verification gate passed. They did not.

| Gate | Result |
|---|---|
| Dirty/unmerged main tree preserved | PASS — no reset/stash/clean; main `supabase/.temp/project-ref` still `nafxpivddesgsrthmosv` |
| Isolated environment | PASS (created) — detached worktree `.worktrees/preprod-vault-audit-20271024` at `33b89d25`; reviewed SQL copied in only |
| Isolated `project-ref` is preprod | **FAIL / missing** — `supabase/.temp/project-ref` does not exist in the worktree |
| Independent linked CLI target | **FAIL** — `supabase --workdir <wt> link --project-ref xbisiveavvbifbzyfhgy` → `AccessTokenRequiredError`. `supabase projects list` same error. No `SUPABASE_ACCESS_TOKEN` / `SUPABASE_DB_PASSWORD` in this environment |
| Version + sha256 | PASS — `20271024194500` / `5ecc25def4ee256e25a0c2169ed2c285dc599f8ff70824d4ff2ce776d17e09da` (main and worktree copies) |
| `npm run db:preflight` | **NOT RUN** — target not proven |
| Apply | **NOT RUN** |
| Installed-function / disposable delete / Vault browser | **NOT RUN** |

Independent identity (MCP `list_projects` / `get_project`, not CLI-linked): `xbisiveavvbifbzyfhgy` name=`pre-prod` host=`db.xbisiveavvbifbzyfhgy.supabase.co`. That does **not** satisfy the isolated CLI link gate.

Did not fall back to production. Did not use MCP `apply_migration` or any remote write. Did not run preflight or `db:push-set`.

**Exact blocker:** isolated CLI cannot authenticate or write `project-ref`. Next human action: in that worktree only, `supabase login` (or a token in that environment), then `supabase link --project-ref xbisiveavvbifbzyfhgy`, then prove `cat supabase/.temp/project-ref` is exactly `xbisiveavvbifbzyfhgy` and `supabase projects list` / `migration list --linked` agree. Then preflight. Then a separate apply. Do not paste tokens into chat or files.

### Auth attempt (same day, later) — STOPPED (non-TTY)

Ran from `.worktrees/preprod-vault-audit-20271024` only. Main `project-ref` still `nafxpivddesgsrthmosv`. Worktree `project-ref` still missing.

`supabase login --yes` → `LoginMissingTokenError`: *Cannot use automatic login flow inside non-TTY environments. Please provide --token flag or set the SUPABASE_ACCESS_TOKEN environment variable.*

Did not pass `--token`. Did not set `SUPABASE_ACCESS_TOKEN`. Did not link. Did not run `migration list --linked`. Did not run preflight or apply.

Human must run `supabase login` in a real local TTY (Terminal / iTerm) inside that worktree, complete the official browser flow, then `supabase link --project-ref xbisiveavvbifbzyfhgy`. After `cat supabase/.temp/project-ref` prints exactly `xbisiveavvbifbzyfhgy`, this workflow can continue.

### Resume pass — STOPPED (target still unverified)

Safe local checks only. No remote CLI, no preflight, no apply.

| Check | Result |
|---|---|
| Main branch | `vasanth/finance-party-analytics` |
| Main `project-ref` | `nafxpivddesgsrthmosv` (unchanged) |
| Worktree | exists, HEAD `33b89d25` |
| Worktree `project-ref` | **missing** (`supabase/.temp` has only `cli-latest`) |
| TTY / token | stdin/stdout not a TTY; `SUPABASE_ACCESS_TOKEN` unset |
| Worktree checksum | PASS `5ecc25def4ee256e25a0c2169ed2c285dc599f8ff70824d4ff2ce776d17e09da` |
| `migration list --linked` | **not run** |
| `db:preflight` | **not run** |
| Apply | **not run** |
| Disposable delete / Vault browser | **not run** — browser tabs empty |

Did not invent credentials or write `project-ref` by hand. Production not touched.

### Target re-check (same evening)

- Main `project-ref` still `nafxpivddesgsrthmosv`.
- Worktree `project-ref` now `xbisiveavvbifbzyfhgy`.
- `linked-project.json`: `ref=xbisiveavvbifbzyfhgy`, `name=pre-prod`.
- Checksum still PASS `5ecc25def4ee256e25a0c2169ed2c285dc599f8ff70824d4ff2ce776d17e09da`.
- `supabase --workdir <wt> migration list --linked` → **FAIL** `DbConnectError` / password authentication failed for `postgres` on `db.xbisiveavvbifbzyfhgy.supabase.co`. Version `20271024194500` status **unknown**.
- Preflight / apply **not run**. Did not request or store a database password.

### Target re-check (later)

Same result: worktree `project-ref` / name still preprod; `migration list --linked` still `DbConnectError` password authentication failed. `20271024194500` status still unknown. Preflight / apply still not run.

### Release

Sign-off remains **PENDING**. Six authenticated Vault browser checks are still **PENDING**. No remote migration was applied. No release-readiness claim.
