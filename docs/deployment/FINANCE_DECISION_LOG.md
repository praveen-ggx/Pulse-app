# Finance decision log

Recorded 2026-10-14 from the product owner's instructions in this working session. This file does not apply a migration, authorize a release set, or replace written confirmation from the Godrej India finance approver.

## Decision A — Compliance gate

**Compliance rejection blocks finance approval.**

`mark_trip_finance_verified` raises `this trip was rejected; Ground Ops must resubmit it before the advance can be approved` unless `compliance_cleared` is true. That check is in `20271013120000_compliance_cleared_gate.sql` and is kept by `20271014183000_finance_approval_issues_payment_request.sql`. Both calls to `issue_payment_request` come after the raise. An open rejection does not create a payment request.

`20271013101500_payment_requests.sql` still defines an older `mark_trip_finance_verified` without that check. It must be applied before `20271013120000`, and must not be applied again afterward.

Pending, missing, and flagged compliance are not invented here:

| State | Existing server rule |
| --- | --- |
| `compliance_verified_at` is null (never verified / missing) | `compliance must be verified before finance verify` |
| Open decline (`compliance_cleared` is false) | `this trip was rejected; Ground Ops must resubmit it before the advance can be approved` |
| Decline then Ground Ops resubmit (`resubmitted_at >= declined_at`) | Cleared; approval is allowed without a second Compliance verify |
| `finance_flagged_at` set | `this trip is flagged for compliance review; the advance cannot be approved until the flag is cleared` |

P3 #2 (`review_trip_expense`) remains **HOLD**. It is not a drop-in for employer approval: the live client path still posts via `evaluateAndPost*` after a table update. Switching only to the RPC would drop that posting step. No expense-posting code is changed in this work.

P3 #3 (`lock_timeout`) is a **forward-only authoring rule** on new migrations and `.cursor/rules/supabase-migrations.mdc`. No role/GUC or applied-migration change.

## Decision B — Payment request

**Finance approval creates a payment request.**

After the compliance gate passes, approval calls `issue_payment_request` for the advance. The live-request unique index and the `unique_violation` handler in `issue_payment_request` keep one live request per trip and payment type. `20271014183000` also issues that request when the trip is already finance-verified, and it no longer returns before the call when the workflow-event insert conflicts.

## Godrej transaction — stated classification, not yet release-approved

| Item | Value |
| --- | --- |
| Transaction | `897a1bef-76c6-43bb-a4fa-b9d28df18a96` |
| Trip | `3f333e5b-1256-4208-acee-7de3bc305f0b` |
| Amount | ₹3,500, kept in full |
| Payee | The trip's existing DCO payee, who acts as both driver and supplier |
| Payable | 100% of the applicable supplier cost. No commission split and no deduction |
| Classification | DCO driver-owner payable, not a conventional supplier payable |

`20271012140000_compliance_payments_supplier_payable.sql` still skips this id, so a null `supplier_id` is not written into `contact_id` and the label `Supplier` is not invented. `20271014184500_godrej_dco_payable_classification.sql` then sets `amount_out` 3500, `amount_in` 0, `contact_type` `dco`, and `contact_id` to that existing `dco_payee_id`. It does not insert a `suppliers` row and does not set `trips.supplier_id`.

The authorized Godrej India finance approver has not yet given written confirmation. Until that confirmation exists, `20271014184500` stays out of every release set.

## Release order, when later authorized

1. `20271012140000` supplier payable rewrite, with the Godrej id excluded.
2. `20271013101500` payment-request table and issuer.
3. `20271013120000` compliance gate.
4. `20271014183000` payment request on the already-verified and duplicate-event paths.
5. `20271014184500` Godrej DCO classification, only after written confirmation.

The named set `supabase/release-sets/finance-approval.versions` is exactly `20271013101500`, `20271013120000`, `20271014183000`. `20271014184500` is not in that file.

A disposable rehearsal on local container `supabase_db_pulse` (databases `finance_rehearsal` / `finance_rehearsal_backup`, dropped after the run) applied that set, executed `supabase/tests/finance_approval_contract.sql`, ran two concurrent `mark_trip_finance_verified` sessions, restored the pre-apply template, and re-applied. Command: `sh supabase/tests/run-finance-approval-disposable.sh`. That is not a production backup and not a production apply.

Do not run `npm run db:push` or `db:push-set` for this work until a verified production backup, a reviewer other than the author, and explicit apply authorization exist.

P3 #1 (Cash-board Exchange lane) stays closed. Fee-ledger View on `c68a4786` is not changed. Exchange, Gate 1A, and P2 are not opened by this work. `20271014051328` only reasserts the existing Gate 1A quote-accept body so a later weaker definition cannot win.
