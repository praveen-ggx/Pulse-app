# Finance migrations: deterministic order and compatibility

Inventory taken 2026-11-03 from **all 98 git worktrees** of this repository (working trees, including untracked files), compared by name and SHA-256 with the deployed baseline `67490624` (V1.0.1, PR #81 — the build published on gogopulse.com). Read-only; nothing was applied anywhere. Raw inventory: scratchpad `fin-snap/migration-inventory.json`.

## Facts

- Baseline `67490624`: 1,000 migration files; newest `20271103220000_invoice_finance_controls.sql`.
- 40 migration files exist in some worktree but not in the baseline. **No version collides** (no two different files share a 14-digit version).
- Every one of those 40 files except the four finance files below is **older than the deployed tip**: pushing it needs `--include-all` and it runs out of order. That is why sets are pushed with `db:push-set`, never a generic `db push`.
- **This checkout's branch (`vasanth/shop-desktop-prod-20261030`, `38605c6b`) is not based on the deployed line.** It lacks 8 deployed migrations (`20271102003100`, `114500`, `120000`, `134500`, `141500`, `183000_dco_self_issue_trip_scope`, …) and holds *older content* for 3 deployed ones (`20271101154500`, `184600`, `222100`). Cutting a release from it would regress production files. `vasanth/invoice-desk-prod` (`6caf537d`) has no gaps against the baseline.
- `20271103183000_invoice_payment_tracking.sql` (only on `vasanth/invoice-payment-tracking`) is byte-identical to the deployed `20271103213000`. That branch also lacks the four invoice-desk migrations of 2027-11-03.
- `20271103202658/202659/202700` (invoice-completeness: server-computed totals) are on `vasanth/invoice-completeness` and `vasanth/invoice-payment-tracking`, verified on local stacks only, never applied to a hosted database. They sort **before** the deployed `213000/220000`.
- Other actors' untracked migrations in this checkout (`20260903061451`, `20260903070000`, `20270117595900` replay stubs; `20271005164900` … `20271030214500` with their `supabase/release-sets/*.versions`) belong to other workstreams and are **not** part of the finance release. The replay stubs only create functions that are missing and only drop functions marked `replay_stub`.

## Deterministic order (finance and invoicing only)

Base: the deployed line (`67490624` / `vasanth/invoice-desk-prod`). Apply each set with `db:push-set` (CLI 2.121.0; 2.95.4 no longer works with the list parser) in this order; stop if any rehearsal step fails.

| Step | Set | Versions (in order) | Gate |
|---|---|---|---|
| 0 | inventory | — | Read-only on the target: `select version from supabase_migrations.schema_migrations where version like '202711030%' or version like '2027110321%' or version like '2027110322%' or version like '2027110323%';` Confirms whether 213000/220000 are already applied, and that 183000/202658–202700 are absent. |
| 1 | finance-base | `20271103213000`, `20271103220000` | Only if step 0 shows them missing. Additive; the deployed client does not call them. |
| 2 | **app release A** | — | Deploy the client from this work (capture fails closed without the finance RPCs). From this moment no client writes invoice payment state from the browser. |
| 3 | finance-integrity | `20271103231500`, `20271103234500`, `20271103235000`, `20271103235500` | All newer than the deployed tip, so no `--include-all`. Rehearse on a copy first (suites listed in `invoice-finance-rollback.md`). |
| 4 | invoice-server-totals | `issue_customer_invoice_v2` + GIN index, **re-issued with versions after `20271103235500`** | Safe to renumber: never applied to a hosted database. Additive; v1 stays callable. |
| 5 | **app release B** | — | Client that issues through `issue_customer_invoice_v2`. |
| 6 | close-v1 | revoke of `issue_customer_invoice` (today `20271103202700`), re-issued after step 4's versions | **Only after** release B is live and no older client is in use. Guarded by `supabase/migrations/__tests__/issueCustomerInvoiceStillCallable.contract.test.ts`, which fails while any migration in the tree leaves v1 uncallable. |
| — | never | `20271103183000_invoice_payment_tracking.sql` | Duplicate of 213000. Delete from `vasanth/invoice-payment-tracking` before that branch is merged anywhere. |

Why release A goes **before** step 3: `20271103231500` installs `invoices_issued_guard`, which rejects browser-side status changes on issued invoices. The deployed client's legacy capture posts trip-ledger rows and then sets `status = 'paid'` from the browser when a receipt clears an invoice. With the guard in place and the old client still live, that capture would write the trip-ledger rows and then fail: a partial write. Deploying the new client first trades this for a short, safe window in which capture is refused with a clear message (nothing is written) until step 3 lands.

## Compatibility matrix

✓ works · ✗ breaks · ⚠ works with the noted limit

| Database state → / client ↓ | Deployed `67490624` (legacy capture, issue v1) | Release A (this work: capture fails closed, issue v1) | Release B (issue v2) |
|---|---|---|---|
| Baseline only (no 213000/220000) | ✓ (legacy dual-write, today's production) | ⚠ capture refused: "Finance payment tables are not installed"; books show unavailable; issuing ✓ | ✗ issue v2 missing |
| + finance-base (213000, 220000) | ✓ | ⚠ bank capture refused (needs `record_customer_receipt` from 231500); a TDS-only capture *would* record through 213000's `record_invoice_payment` without the 231500 fixes — keep this window short; issuing ✓ | ✗ issue v2 missing |
| + finance-integrity (231500 … 235500) | **✗ partial write** on capture that clears an invoice (trip-ledger rows written, status update rejected by the guard); other capture ✓; issuing ✓ | ✓ | ✗ issue v2 missing |
| + invoice-server-totals (v2, v1 kept) | same as above | ✓ | ✓ |
| + close-v1 (v1 revoked) | **✗ cannot issue invoices** | **✗ cannot issue invoices** | ✓ |

Rows are cumulative. The only order with no ✗ for the client that is live at each moment is the step order above.

## Decisions still needed

1. Whether finance-base (213000/220000) is already applied in production (step 0 — needs authorization for a read-only hosted query).
2. Length of the capture-refused window between release A and step 3, and who applies step 3.
3. Who rebases the finance work (`231500`–`235500` and the app changes) from this checkout's branch onto the deployed line — this branch cannot be released as is.
4. When to renumber and ship invoice-server-totals, and the criterion for "no older client in use" before close-v1.
