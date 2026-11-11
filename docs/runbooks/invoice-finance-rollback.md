# Invoice finance: rollout, rollback, accounting rules, legacy reconciliation

Status 2026-11-03: everything below is **local only** (uncommitted, unpushed, not applied to any hosted database).

## Migrations

| Version | File | In production baseline `67490624` (PR #81, V1.0.1)? | Notes |
|---|---|---|---|
| 20271103213000 | `invoice_payment_tracking.sql` | yes (file in the deployed branch) | Receipts, allocations, events, reversal. |
| 20271103220000 | `invoice_finance_controls.sql` | yes (file in the deployed branch) | Credit notes, cancellation, ledger, bank lines, email log, reminder rule. |
| 20271103231500 | `invoice_finance_integrity.sql` | no | 13 defects found on a real database, receipt numbers, TDS, running-balance ledger, registers, bank match/unmatch, trip-ledger link, issued-invoice guard. |
| 20271103234500 | `invoice_credit_gst_and_refunds.sql` | no | Credit-note GST breakup, customer credit, refunds. |
| 20271103235000 | `invoice_finance_dashboard.sql` | no | One bounded aggregate for the finance overview. |
| 20271103235500 | `invoice_delivery_outbox.sql` | no | Email/reminder outbox; **sends nothing** (see `invoice-delivery-setup.md`). |

"In the production baseline" means the file is in the deployed git branch. Whether 213000/220000 were ever **applied** to the production database was not checked (no hosted query in this work). Check before anything ships, read-only:

```sql
select version from supabase_migrations.schema_migrations
where version in ('20271103183000','20271103213000','20271103220000','20271103231500','20271103234500','20271103235000','20271103235500');
```

### Duplicate migration name 213000 / 183000

`20271103183000_invoice_payment_tracking.sql` exists only on the local, never-pushed branch `vasanth/invoice-payment-tracking` (27f0ba8d), byte-identical to 213000. **213000 is canonical**: it is in the deployed branch (`personal/V1.0.1`, `personal/vasanth/invoice-desk-prod`) and every later finance migration builds on it. Do not merge `vasanth/invoice-payment-tracking` as is; if anything on it is still wanted, drop its 183000 file first. If the read-only check above ever shows 183000 applied somewhere, stop: that environment needs a `migration repair` decision, not a rename.

### Other local migrations that sort before 213000

The local stacks also carry `20271103202658/202659/202700` from the unpushed `wt-invoice` work (server-authoritative issue). If 213000+ are applied to a database first, those three become "older than the remote tip" and `db push` refuses them without `--include-all`. Decide their order before either set ships.

### Fresh database from empty

A full replay of the repository's migrations from an empty schema **fails at migration 445/994** (`20260903061452_admin_rpc_anon_lockdown`: references `increment_credit_wallet` before it exists); with the untracked replay stubs another session added it reaches 449/994 and fails at `20260903072324` (`emit_network_notification`). Both are pre-existing, far before any finance migration. The finance chain is proven instead on a restored pre-finance baseline (below).

## Rollout order

1. Rehearse on a disposable copy of the target schema with `db:push-set` (CLI 2.121.0; 2.95.4 no longer works with the list parser): apply the six files in order, then run
   `supabase/tests/invoice_payment_tracking.sql`, `invoice_finance_controls.sql`, `invoice_credit_refunds.sql`,
   `invoice_delivery_dashboard.sql`, `invoice_finance_concurrency.sh`, `invoice_finance_legacy_audit.sh`. All must pass.
2. Run the legacy audit read-only on the target (see "Historical receipts" below) and keep its output.
3. Apply to the target (separate authorization; schema freeze rules apply).
4. Ship the app build. The old client keeps working: nothing it calls is removed. Differences an old client sees: it can no longer change status/totals/identity of an issued invoice through the table API; the old credit-note call is value-only and refuses caller-sent tax.

Verified locally (2026-11-03, `finrt` = restored pre-finance baseline): apply 6 → all suites pass → rollback refuses while a receipt exists → rollback on empty finance tables → table set and every public function (signature + body) equal the baseline → re-apply → suites pass. Upgrade from the current local baselines (231500 applied, with data) also verified: existing credit notes become `legacy`, nothing rewritten.

## Rollback

### Before any receipt, credit note or refund exists

`invoice-finance-rollback.sql` drops the guard trigger, the 17 tables and the functions the six migrations create (68 names, listed explicitly), and removes their history rows. It refuses if `invoice_payments`, `invoice_credit_notes` or `invoice_customer_refunds` has any row.

### After financial records exist — never drop

Freeze instead, as a forward migration:

```sql
REVOKE EXECUTE ON FUNCTION
  public.record_invoice_payment(uuid, uuid, date, numeric, text, text, uuid, text, text, text, jsonb),
  public.record_customer_receipt(uuid, uuid, date, numeric, numeric, text, text, uuid, text, text, text, jsonb),
  public.allocate_invoice_payment(uuid, uuid, jsonb, text),
  public.issue_invoice_credit_note(uuid, uuid, date, text, jsonb, text),
  public.issue_invoice_credit_note(uuid, uuid, date, text, text, jsonb, text),
  public.record_customer_refund(uuid, text, uuid, date, numeric, text, text, text, text),
  public.cancel_customer_invoice(uuid, uuid, text, text),
  public.import_bank_statement(uuid, jsonb, text),
  public.match_bank_line(uuid, uuid, uuid),
  public.unmatch_bank_line(uuid, uuid, text),
  public.link_trip_receipt_to_invoice_payment(uuid, uuid, uuid, jsonb, text),
  public.queue_invoice_email(uuid, uuid, text[], text, text, text)
FROM authenticated;
-- reverse_invoice_payment and reverse_customer_refund stay available so mistakes can still be corrected
```

If the issued-invoice guard blocks a legitimate flow: `DROP TRIGGER invoices_issued_guard ON public.invoices;` (no data effect).

## Accounting rules implemented

**Source of truth.** Invoice settlement = confirmed allocations + issued credit notes − refunds of credit-note credit on that invoice. Issued invoice totals are never rewritten. The trip ledger (`transactions`) is a separate book: it drives trip payment status (`trg_sync_trip_payment_status`) and is never written by invoice payments.

**Credit notes.**
- *With GST*: tax is derived on the server from the invoice — CGST + SGST at half the rate each (intra-state) or IGST at the full rate (inter-state), half-up to paise on the credit's taxable value, split across lines by cumulative rounding. The credit that closes the invoice's taxable value takes exactly the tax left. Caller-sent components must match to the paisa or the credit note is refused.
- Ceilings: taxable ≤ invoice taxable − earlier GST credits; each of CGST/SGST/IGST ≤ what the invoice still carries; total ≤ invoice total − all earlier credits.
- Refused for GST: invoice without GST, IGST mixed with CGST/SGST, missing rate, lines at more than one rate, tax not matching its rate, an earlier taxed credit without a breakup. These invoices can still take a **value-only** credit (no GST adjustment) — the behaviour that existed before.
- Invoices are GST-exclusive in this codebase, so credit notes are too (no inclusive entry).
- Issued credit notes and their lines are immutable; existing rows are marked `legacy`.

**Customer credit.** A credit note may now be issued on a paid invoice. The part above what the customer still owed becomes **customer credit** on that invoice (status `overpaid`, labelled "Customer credit"). Unapplied receipt money is customer credit too. Neither is paid out automatically.

**Refunds.** Money actually returned, from one source: the unapplied part of a receipt (capped at the cash received — TDS is not refundable), or the customer credit of a credit note. Never above the refundable balance; idempotent; numbered `RFD/<FY>/<seq>`; immutable; a refund that did not go through is **reversed** with a reason (the amount becomes refundable again). A receipt with recorded refunds cannot be reversed until its refunds are. If a receipt behind a credit-note refund later bounces, the customer owes the invoice again (net of the credit note and the refund). The customer ledger shows refunds as debits and refund reversals as credits; closing balance = open receivables − unapplied receipts − credit-note credit (checked in the SQL suite and by audit A9).

**Decisions that need business/accounting approval (not implemented):**
1. Applying credit-note credit to a *different* invoice (adjustment instead of cash refund). Today it can only be refunded or held.
2. Credit notes on multi-rate invoices (per-rate breakup).
3. GST-inclusive credit entry.
4. Matching refunds to bank debits in Reconciliation (bank debits are imported but only credits are matched).
5. A printable refund voucher.

## Historical receipts (legacy AR capture) — reconciliation

**Production state.** The legacy capture is in the deployed baseline `67490624` (published on gogopulse.com 2026-11-02 22:34 UTC per the Netlify API). It posts `customer_receipt` / `tds_receivable` rows to the trip ledger with description `Customer receipt[ <ref>] · <invoice> · trip <trip>`, and patches `invoices.tax_snapshot.receipt_applied` / `status='paid'` from the client. It writes no invoice payment. The working tree additionally contains (another session's, in progress) a fallback that does the same when the invoice payment book is missing on the database.

**Procedure** — nothing is migrated or allocated automatically:
1. Read-only audit + dry-run plan: `psql "<conn>" -v org=<org uuid> -f docs/runbooks/invoice-finance-legacy-audit.sql`. It runs in a `READ ONLY` transaction (it only creates session temp views) and reports A1 legacy rows, A2 client-written invoice state, A3 duplicate candidates, A4 unapplied receipts, A5 balance inconsistencies, A6 cancelled invoices with residue, A7 reversed receipts still counted, A8 per-client totals, A9 ledger vs receivables, then B1–B4: the plan, planned links (source → invoice, open before/after), excluded rows with the rule they failed, and the plan fingerprint.
2. Deterministic rule (R1–R8, in `invoice-finance-legacy-plan.sql`): legacy format, one matching issued invoice of the same client, not already linked, no invoice payment with the same reference or same amount within 3 days, and the planned rows fit the open balance. Anything else needs a person (link it from Receipts → Trip-ledger receipts).
3. Approval: a finance owner approves the B2 list and the B4 fingerprint in writing.
4. Execution: `psql "<conn>" -v org=… -v approver=<auth user id> -v plan_hash=… -v planned_rows=… -f docs/runbooks/invoice-finance-legacy-link-execute.sql`. One transaction; stops if the plan changed; each row goes through `link_trip_receipt_to_invoice_payment` as the approver with key `legacy-link:<transaction id>`; trip-ledger rows and invoices are not modified; a re-run writes nothing.
5. `invoices.tax_snapshot.receipt_applied` and `status='paid'` written by the legacy client are left as historical facts; balances never read them.

Verified on synthetic legacy-format rows (`supabase/tests/invoice_finance_legacy_audit.sh`, 24 checks). **Not run against production** — that needs explicit authorization.

## What finance users see

- **Credit Notes → Issue credit note**: pick an invoice, choose *With GST* (breakup from the invoice) or *Without GST*, enter taxable amounts per line, review the CGST/SGST or IGST preview and what becomes customer credit, confirm. The credit note PDF shows the breakup.
- **Credit Notes → Customer credit and refunds** (selected customer): unapplied receipts, credit-note credit, refundable now, refunds so far; pick a receipt or credit note to refund; refund register with reverse and CSV.
- **Reports → Overview**: outstanding, overdue, customer credit held, unmatched bank credits, aging bars, money collected by month, and a monthly table (invoiced, bank, TDS, credit notes, refunds).
- Capturing a payment on an invoice records an invoice receipt; it does not mark trips paid. Trip payment follows the trip ledger.
- A credit note is not a refund. Money goes back only when a refund is recorded.

## Recovery notes

- Receipt and refund numbers come from their sequence tables in the inserting transaction; a failed write consumes no number.
- A matched bank line whose receipt is later reversed shows under Reconciliation → Needs attention; unmatch it with a reason.
- Every finance write is idempotent on its key; a retried request (including a retried trip-ledger link) returns the original result.
