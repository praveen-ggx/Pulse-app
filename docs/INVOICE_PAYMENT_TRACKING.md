# Invoice payment tracking

Payments are a separate record from invoice issuance. An issued invoice keeps the total stored at issue. Nothing in this feature reads the trip ledger or writes `invoices.status`.

## Schema

`invoice_payments` is one customer receipt: organization, optional client, payment date, amount `numeric(14,2)`, mode, transaction reference, deposit account, notes, the member who recorded it, and status `recorded` or `reversed`.

`invoice_payment_allocations` applies part of a receipt to an issued invoice. One receipt can cover several invoices. One invoice can have several receipts. A receipt may keep an unallocated remainder (`payment amount − confirmed allocations`).

`invoice_payment_events` is append-only. Recording writes `recorded` and `allocated`. Reversal writes `reversed` and leaves the earlier events in place. The payment and allocation rows stay; their status becomes `reversed`. Deletes are rejected.

`invoice_payment_operations` stores the idempotency result for record, allocate, and reverse. The same key returns the first result.

Amounts use `numeric(14,2)` (rupees and paise). A non-empty transaction reference is unique per organization, including after reversal, so a retry cannot create a second live receipt with the same reference.

## Authorization

Reads require an active organization member (`is_org_member`). Record, allocate, and reverse require an active member whose role is owner, admin, finance, or accountant, or whose permissions include `finance_manage`. Direct inserts and updates are not granted. Row level security allows members to select only their organization's rows.

## Balances

Amount received is the sum of `confirmed` allocations. Amount outstanding is the issued `total_amount` minus that sum. Status is unpaid, partially paid, paid, or overpaid. Overpaid is derived if received ever exceeds the issued total. The write path rejects an allocation that would pass the invoice balance or the payment remainder.

Customer aging sums outstanding issued invoices for one client: current (not yet due), 1–30, 31–60, 61–90, and over 90. The anchor date is the due date, or the invoice date when no due date is stored.

## Concurrency

Each write takes a transaction advisory lock for the organization, then locks the invoice rows, allocation rows, and payment row with `FOR UPDATE` in id order. A second allocation sees the first commit before it checks the remaining balance.

## Query plans

`scripts/sql/invoice_payment_explain.sql` explains the three reads. On the local database, before any payment rows existed:

- Payment remainder: index-only scan of `invoice_payment_allocations_confirmed_payment`.
- Customer aging: index scan of `idx_invoices_client`, then the confirmed-allocation index for each invoice.
- A single confirmed sum after one row was a sequential scan. Postgres prefers that over the partial index while the table is tiny. The invoice index is `(org_id, invoice_id) WHERE status = 'confirmed'` for when the table grows.

## What this migration does not do

It does not change an issued invoice total, mark an invoice paid by editing its status, or copy payments out of trip transactions. Apply it only on a local database until a release explicitly includes it.
