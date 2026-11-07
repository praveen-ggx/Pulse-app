-- READ-ONLY audit of invoice receipts, the legacy AR capture, and the dry-run link plan.
--
--   psql "<connection>" -v org=<organization uuid> -f docs/runbooks/invoice-finance-legacy-audit.sql
--
-- Run as a role that can read the finance tables (postgres / service role on the
-- target, or a local copy). The only objects created are session temp views from
-- invoice-finance-legacy-plan.sql; every query below runs in a READ ONLY
-- transaction that is rolled back. Nothing is linked, allocated or changed.
-- Execution of the plan is a separate, approved step:
-- invoice-finance-legacy-link-execute.sql.

\set ON_ERROR_STOP 1
\pset footer off
\ir invoice-finance-legacy-plan.sql

BEGIN READ ONLY;

\echo '== A1. Trip-ledger customer receipts in the legacy capture format (by link status)'
SELECT legacy_format, (linked_payment_id IS NOT NULL) AS linked, ledger_category,
       count(*) AS rows, round(sum(amount), 2) AS amount
FROM legacy_receipt_candidates
GROUP BY 1, 2, 3
ORDER BY 1 DESC, 2, 3;

\echo '== A2. Invoices whose payment state was written by the client (receipt_applied / status paid)'
WITH legacy AS (
  SELECT invoice_id, round(sum(amount), 2) AS legacy_amount, count(*) AS legacy_rows
  FROM legacy_receipt_candidates
  WHERE legacy_format AND invoice_id IS NOT NULL
  GROUP BY invoice_id
)
SELECT i.invoice_number, i.status,
       nullif(i.tax_snapshot->>'receipt_applied', '')::numeric AS receipt_applied_snapshot,
       coalesce(l.legacy_amount, 0) AS legacy_trip_ledger_amount,
       coalesce((SELECT round(sum(a.amount), 2) FROM public.invoice_payment_allocations a
                 WHERE a.org_id = i.org_id AND a.invoice_id = i.id AND a.status = 'confirmed'), 0) AS invoice_allocations,
       CASE
         WHEN i.tax_snapshot ? 'receipt_applied'
              AND nullif(i.tax_snapshot->>'receipt_applied', '')::numeric IS DISTINCT FROM coalesce(l.legacy_amount, 0)
           THEN 'snapshot differs from trip-ledger rows'
         WHEN i.status = 'paid' AND NOT (i.tax_snapshot ? 'receipt_applied')
           THEN 'status paid without a legacy snapshot'
       END AS warning
FROM public.invoices i
LEFT JOIN legacy l ON l.invoice_id = i.id
WHERE i.org_id = :'org'::uuid
  AND (i.tax_snapshot ? 'receipt_applied' OR i.status = 'paid' OR l.invoice_id IS NOT NULL)
ORDER BY i.invoice_date, i.invoice_number;

\echo '== A3. Duplicate payment candidates'
\echo '-- A3a. invoice payments of one client with the same amount within 3 days'
SELECT p1.receipt_number, p2.receipt_number AS other_receipt, p1.client_id, p1.amount,
       p1.payment_date, p2.payment_date AS other_date,
       p1.source_transaction_id IS NOT NULL AS first_linked, p2.source_transaction_id IS NOT NULL AS other_linked
FROM public.invoice_payments p1
JOIN public.invoice_payments p2
  ON p2.org_id = p1.org_id AND p2.client_id = p1.client_id AND p2.amount = p1.amount
 AND p2.id > p1.id AND abs(p2.payment_date - p1.payment_date) <= 3 AND p2.status = 'recorded'
WHERE p1.org_id = :'org'::uuid AND p1.status = 'recorded'
ORDER BY p1.payment_date, p1.receipt_number;
\echo '-- A3b. trip-ledger receipts that also look like a separate invoice payment'
SELECT transaction_id, transaction_date, amount, payment_reference, parsed_invoice_number,
       same_reference_payment, same_amount_date_payment
FROM legacy_receipt_candidates
WHERE linked_payment_id IS NULL AND (same_reference_payment OR same_amount_date_payment)
ORDER BY transaction_date;

\echo '== A4. Receipts with money not applied to any invoice (recorded only)'
SELECT p.receipt_number, p.payment_date, p.client_id, p.amount,
       round(p.amount - coalesce(al.allocated, 0) - coalesce(rf.refunded, 0), 2) AS unapplied
FROM public.invoice_payments p
LEFT JOIN LATERAL (SELECT sum(a.amount) AS allocated FROM public.invoice_payment_allocations a
                   WHERE a.org_id = p.org_id AND a.payment_id = p.id AND a.status = 'confirmed') al ON true
LEFT JOIN LATERAL (SELECT sum(r.amount) AS refunded FROM public.invoice_customer_refunds r
                   WHERE r.org_id = p.org_id AND r.payment_id = p.id AND r.status = 'recorded'
                     AND r.source_type = 'payment') rf ON true
WHERE p.org_id = :'org'::uuid AND p.status = 'recorded'
  AND p.amount - coalesce(al.allocated, 0) - coalesce(rf.refunded, 0) <> 0
ORDER BY p.payment_date, p.receipt_number;

\echo '== A5. Invoice balances inconsistent with allocations (expect no rows)'
SELECT i.invoice_number, i.status, i.total_amount, x.allocated, x.credited, x.cn_refunded, x.issue
FROM public.invoices i
CROSS JOIN LATERAL (
  SELECT coalesce((SELECT sum(a.amount) FROM public.invoice_payment_allocations a
                   WHERE a.org_id = i.org_id AND a.invoice_id = i.id AND a.status = 'confirmed'), 0) AS allocated,
         coalesce((SELECT sum(c.amount) FROM public.invoice_credit_notes c
                   WHERE c.org_id = i.org_id AND c.invoice_id = i.id AND c.status = 'issued'), 0) AS credited,
         coalesce((SELECT sum(r.amount) FROM public.invoice_customer_refunds r
                   WHERE r.org_id = i.org_id AND r.invoice_id = i.id AND r.status = 'recorded'
                     AND r.source_type = 'credit_note'), 0) AS cn_refunded,
         CASE
           WHEN i.status = 'draft' AND EXISTS (SELECT 1 FROM public.invoice_payment_allocations a
                 WHERE a.org_id = i.org_id AND a.invoice_id = i.id AND a.status = 'confirmed')
             THEN 'allocation on a draft'
           WHEN EXISTS (SELECT 1 FROM public.invoice_payment_allocations a
                 JOIN public.invoice_payments p ON p.id = a.payment_id
                 WHERE a.org_id = i.org_id AND a.invoice_id = i.id AND a.status = 'confirmed'
                   AND p.client_id IS DISTINCT FROM i.client_id)
             THEN 'allocation from another client''s receipt'
         END AS issue
) x
WHERE i.org_id = :'org'::uuid
  AND (x.issue IS NOT NULL
       OR x.allocated > i.total_amount
       OR x.credited > i.total_amount)
ORDER BY i.invoice_number;
\echo '-- note: an invoice settled above its total only through a credit note is customer credit (A9), not an error'

\echo '== A6. Cancelled / void invoices with payments or credits left on them (expect no rows)'
SELECT i.invoice_number, i.status,
       (SELECT sum(a.amount) FROM public.invoice_payment_allocations a
        WHERE a.org_id = i.org_id AND a.invoice_id = i.id AND a.status = 'confirmed') AS confirmed_allocations,
       (SELECT sum(c.amount) FROM public.invoice_credit_notes c
        WHERE c.org_id = i.org_id AND c.invoice_id = i.id AND c.status = 'issued') AS issued_credits
FROM public.invoices i
WHERE i.org_id = :'org'::uuid AND i.status IN ('cancelled', 'void')
  AND (EXISTS (SELECT 1 FROM public.invoice_payment_allocations a
               WHERE a.org_id = i.org_id AND a.invoice_id = i.id AND a.status = 'confirmed')
       OR EXISTS (SELECT 1 FROM public.invoice_credit_notes c
                  WHERE c.org_id = i.org_id AND c.invoice_id = i.id AND c.status = 'issued'));

\echo '== A7. Reversed receipts still counted anywhere (expect no rows)'
SELECT p.receipt_number, 'confirmed allocation on a reversed receipt' AS issue
FROM public.invoice_payments p
WHERE p.org_id = :'org'::uuid AND p.status = 'reversed'
  AND EXISTS (SELECT 1 FROM public.invoice_payment_allocations a WHERE a.payment_id = p.id AND a.status = 'confirmed')
UNION ALL
SELECT p.receipt_number, 'recorded refund on a reversed receipt'
FROM public.invoice_payments p
WHERE p.org_id = :'org'::uuid AND p.status = 'reversed'
  AND EXISTS (SELECT 1 FROM public.invoice_customer_refunds r WHERE r.payment_id = p.id AND r.status = 'recorded')
UNION ALL
SELECT p.receipt_number, 'bank line still matched to a reversed receipt (unmatch it)'
FROM public.invoice_payments p
JOIN public.invoice_bank_lines b ON b.matched_payment_id = p.id AND b.status = 'matched'
WHERE p.org_id = :'org'::uuid AND p.status = 'reversed';

\echo '== A8. Credit notes, refunds and receipts per client'
SELECT c.id AS client_id, coalesce(nullif(btrim(coalesce(c.legal_name, '')), ''), c.name) AS client,
       (SELECT round(coalesce(sum(p.amount), 0), 2) FROM public.invoice_payments p
        WHERE p.org_id = c.organization_id AND p.client_id = c.id AND p.status = 'recorded') AS receipts,
       (SELECT round(coalesce(sum(cn.amount), 0), 2) FROM public.invoice_credit_notes cn
        WHERE cn.org_id = c.organization_id AND cn.client_id = c.id AND cn.status = 'issued') AS credit_notes,
       (SELECT round(coalesce(sum(cn.tax_amount), 0), 2) FROM public.invoice_credit_notes cn
        WHERE cn.org_id = c.organization_id AND cn.client_id = c.id AND cn.status = 'issued') AS credit_note_tax,
       (SELECT round(coalesce(sum(r.amount), 0), 2) FROM public.invoice_customer_refunds r
        WHERE r.org_id = c.organization_id AND r.client_id = c.id AND r.status = 'recorded') AS refunds
FROM public.clients c
WHERE c.organization_id = :'org'::uuid
  AND (EXISTS (SELECT 1 FROM public.invoice_payments p WHERE p.org_id = c.organization_id AND p.client_id = c.id)
       OR EXISTS (SELECT 1 FROM public.invoice_credit_notes cn WHERE cn.org_id = c.organization_id AND cn.client_id = c.id))
ORDER BY client;
\echo '-- A8b. GST credit notes above the invoice tax (expect no rows)'
SELECT i.invoice_number, sum(cn.cgst_amount) AS cgst, i.cgst_amount AS invoice_cgst,
       sum(cn.sgst_amount) AS sgst, i.sgst_amount AS invoice_sgst, sum(cn.igst_amount) AS igst, i.igst_amount AS invoice_igst
FROM public.invoice_credit_notes cn
JOIN public.invoices i ON i.id = cn.invoice_id AND i.org_id = cn.org_id
WHERE cn.org_id = :'org'::uuid AND cn.status = 'issued'
GROUP BY i.id, i.invoice_number, i.cgst_amount, i.sgst_amount, i.igst_amount, i.total_amount
HAVING sum(cn.cgst_amount) > i.cgst_amount OR sum(cn.sgst_amount) > i.sgst_amount
    OR sum(cn.igst_amount) > i.igst_amount OR sum(cn.amount) > i.total_amount;

\echo '== A9. Customer ledger closing balance vs open receivables and customer credit (expect difference 0)'
WITH clients_with_activity AS (
  SELECT DISTINCT client_id FROM public.invoices WHERE org_id = :'org'::uuid AND client_id IS NOT NULL
  UNION
  SELECT DISTINCT client_id FROM public.invoice_payments WHERE org_id = :'org'::uuid AND client_id IS NOT NULL
),
ledger AS (
  SELECT ca.client_id,
         coalesce((SELECT r.running_balance FROM public.customer_ledger_rows(:'org'::uuid, ca.client_id) r
                   ORDER BY r.entry_date DESC, r.sort_rank DESC, r.created_at DESC, r.entry_key DESC LIMIT 1), 0) AS closing
  FROM clients_with_activity ca
),
inv AS (
  SELECT i.client_id,
         round(i.total_amount
           - coalesce((SELECT sum(a.amount) FROM public.invoice_payment_allocations a
                       WHERE a.org_id = i.org_id AND a.invoice_id = i.id AND a.status = 'confirmed'), 0)
           - coalesce((SELECT sum(c.amount) FROM public.invoice_credit_notes c
                       WHERE c.org_id = i.org_id AND c.invoice_id = i.id AND c.status = 'issued'), 0)
           + coalesce((SELECT sum(r.amount) FROM public.invoice_customer_refunds r
                       WHERE r.org_id = i.org_id AND r.invoice_id = i.id AND r.status = 'recorded'
                         AND r.source_type = 'credit_note'), 0), 2) AS net
  FROM public.invoices i
  WHERE i.org_id = :'org'::uuid AND i.status IN ('sent', 'paid')
),
pay AS (
  SELECT p.client_id,
         p.amount
           - coalesce((SELECT sum(a.amount) FROM public.invoice_payment_allocations a
                       WHERE a.org_id = p.org_id AND a.payment_id = p.id AND a.status = 'confirmed'), 0)
           - coalesce((SELECT sum(r.amount) FROM public.invoice_customer_refunds r
                       WHERE r.org_id = p.org_id AND r.payment_id = p.id AND r.status = 'recorded'
                         AND r.source_type = 'payment'), 0) AS unapplied
  FROM public.invoice_payments p
  WHERE p.org_id = :'org'::uuid AND p.status = 'recorded'
)
SELECT l.client_id,
       round(l.closing, 2) AS ledger_closing,
       round(coalesce((SELECT sum(greatest(net, 0)) FROM inv WHERE inv.client_id = l.client_id), 0), 2) AS open_receivables,
       round(coalesce((SELECT sum(greatest(-net, 0)) FROM inv WHERE inv.client_id = l.client_id), 0), 2) AS credit_note_credit,
       round(coalesce((SELECT sum(unapplied) FROM pay WHERE pay.client_id = l.client_id), 0), 2) AS unapplied_receipts,
       round(l.closing
         - coalesce((SELECT sum(net) FROM inv WHERE inv.client_id = l.client_id), 0)
         + coalesce((SELECT sum(unapplied) FROM pay WHERE pay.client_id = l.client_id), 0), 2) AS difference
FROM ledger l
ORDER BY abs(round(l.closing
         - coalesce((SELECT sum(net) FROM inv WHERE inv.client_id = l.client_id), 0)
         + coalesce((SELECT sum(unapplied) FROM pay WHERE pay.client_id = l.client_id), 0), 2)) DESC, l.client_id;

\echo '== B1. Dry-run link plan (nothing is executed)'
SELECT plan_status, exclusion, count(*) AS rows, round(sum(amount), 2) AS amount
FROM legacy_link_plan
GROUP BY 1, 2
ORDER BY 1 DESC, 2;

\echo '== B2. Planned links: source row -> destination invoice'
SELECT transaction_id, transaction_date, ledger_category, amount, payment_mode, invoice_number,
       invoice_open_now, invoice_open_after, idempotency_key
FROM legacy_link_plan
WHERE plan_status = 'planned'
ORDER BY invoice_number, transaction_date, transaction_id;

\echo '== B3. Excluded rows (need a person)'
SELECT transaction_id, transaction_date, amount, invoice_number, exclusion, description
FROM legacy_link_plan
WHERE plan_status = 'excluded'
ORDER BY exclusion, transaction_date;

\echo '== B4. Plan fingerprint — the approver passes this to the execute script'
SELECT count(*) AS planned_rows,
       round(coalesce(sum(amount), 0), 2) AS planned_amount,
       md5(coalesce(string_agg(transaction_id::text || ':' || invoice_id::text || ':' || amount::text, ',' ORDER BY transaction_id), '')) AS plan_hash
FROM legacy_link_plan
WHERE plan_status = 'planned';

ROLLBACK;
