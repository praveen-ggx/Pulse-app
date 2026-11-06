-- Legacy AR capture: candidate trip-ledger receipts and the deterministic link plan.
-- Included by invoice-finance-legacy-audit.sql (read-only) and
-- invoice-finance-legacy-link-execute.sql (approved execution). Creates SESSION TEMP
-- VIEWS only (pg_temp); no persistent object or row is created or changed.
--
-- Requires: psql variable org (organization uuid).
--
-- What the legacy capture wrote (code in 67490624 / 38605c6b, customerReceipt.service.ts):
--   transactions.ledger_category = 'customer_receipt' (cash) or 'tds_receivable' (TDS),
--   description = 'Customer receipt[ <ref>] · <invoice number>[ · trip <trip>]'
--              or 'TDS deducted by customer[ <ref>] · <invoice number>[ · trip <trip>]',
--   and invoices.tax_snapshot.receipt_applied / invoices.status = 'paid' from the client.
--
-- Deterministic link rule — a trip-ledger row is PLANNED only if all hold:
--   R1 customer_receipt / tds_receivable, amount_in > 0, not an opening balance
--   R2 description is exactly the legacy format and names one invoice number
--   R3 that number resolves to exactly one invoice of the org, status sent/paid
--   R4 the row's client (contact_id, contact_type 'client') is the invoice's client
--   R5 the row is not already linked to a recorded invoice payment
--   R6 no recorded invoice payment of that client has the same transaction reference
--   R7 no unlinked recorded invoice payment of that client has the same amount within 3 days
--   R8 planned rows of one invoice, oldest first, fit inside its open balance
-- Everything else is EXCLUDED with the first failing reason and needs a person.

\set ON_ERROR_STOP 1

SET client_min_messages = warning;
DROP VIEW IF EXISTS pg_temp.legacy_link_plan;
DROP VIEW IF EXISTS pg_temp.legacy_receipt_candidates;
RESET client_min_messages;

CREATE TEMP VIEW legacy_receipt_candidates AS
WITH src AS (
  SELECT t.id AS transaction_id,
         t.organization_id AS org_id,
         t.transaction_date,
         t.created_at,
         t.ledger_category,
         round(t.amount_in, 2) AS amount,
         t.contact_id,
         t.contact_type,
         nullif(btrim(coalesce(t.payment_reference, '')), '') AS payment_reference,
         t.trip_id,
         t.description,
         string_to_array(coalesce(t.description, ''), ' · ') AS parts
  FROM public.transactions t
  WHERE t.organization_id = :'org'::uuid
    AND t.ledger_category IN ('customer_receipt', 'tds_receivable')
    AND coalesce(t.amount_in, 0) > 0
    AND coalesce(t.is_opening_balance, false) = false
),
fmt AS (
  SELECT s.*,
         (
           ((s.ledger_category = 'customer_receipt' AND (s.parts[1] = 'Customer receipt' OR s.parts[1] LIKE 'Customer receipt %'))
             OR (s.ledger_category = 'tds_receivable' AND (s.parts[1] = 'TDS deducted by customer' OR s.parts[1] LIKE 'TDS deducted by customer %')))
           AND array_length(s.parts, 1) IN (2, 3)
           AND nullif(btrim(s.parts[2]), '') IS NOT NULL
           AND (array_length(s.parts, 1) = 2 OR s.parts[3] LIKE 'trip %')
         ) AS legacy_format
  FROM src s
)
SELECT f.transaction_id, f.org_id, f.transaction_date, f.created_at, f.ledger_category, f.amount,
       f.contact_id, f.contact_type, f.payment_reference, f.trip_id, f.description, f.legacy_format,
       CASE WHEN f.legacy_format THEN btrim(f.parts[2]) END AS parsed_invoice_number,
       inv.invoice_id, inv.invoice_client_id, inv.invoice_status, coalesce(inv.n, 0) AS invoice_matches,
       lp.id AS linked_payment_id,
       lp.receipt_number AS linked_receipt_number,
       EXISTS (
         SELECT 1 FROM public.invoice_payments p
         WHERE p.org_id = f.org_id AND p.status = 'recorded'
           AND p.client_id = f.contact_id
           AND p.reference_key IS NOT NULL
           AND p.reference_key = lower(f.payment_reference)
           AND p.source_transaction_id IS DISTINCT FROM f.transaction_id
       ) AS same_reference_payment,
       EXISTS (
         SELECT 1 FROM public.invoice_payments p
         WHERE p.org_id = f.org_id AND p.status = 'recorded'
           AND p.client_id = f.contact_id
           AND p.source_transaction_id IS NULL
           AND p.amount = f.amount
           AND abs(p.payment_date - f.transaction_date) <= 3
       ) AS same_amount_date_payment
FROM fmt f
LEFT JOIN LATERAL (
  SELECT (array_agg(i.id ORDER BY i.id))[1] AS invoice_id,
         (array_agg(i.client_id ORDER BY i.id))[1] AS invoice_client_id,
         (array_agg(i.status ORDER BY i.id))[1] AS invoice_status,
         count(*) AS n
  FROM public.invoices i
  WHERE f.legacy_format
    AND i.org_id = f.org_id
    AND i.invoice_number = btrim(f.parts[2])
) inv ON true
LEFT JOIN LATERAL (
  SELECT p.id, p.receipt_number
  FROM public.invoice_payments p
  WHERE p.org_id = f.org_id AND p.source_transaction_id = f.transaction_id AND p.status = 'recorded'
  LIMIT 1
) lp ON true;

CREATE TEMP VIEW legacy_link_plan AS
WITH c AS (
  SELECT lc.*,
         CASE
           WHEN NOT lc.legacy_format THEN 'R2 not in the legacy capture format'
           WHEN lc.linked_payment_id IS NOT NULL THEN 'R5 already linked'
           WHEN lc.invoice_matches = 0 THEN 'R3 invoice number not found'
           WHEN lc.invoice_matches > 1 THEN 'R3 invoice number not unique'
           WHEN lc.invoice_status NOT IN ('sent', 'paid') THEN 'R3 invoice is draft or cancelled'
           WHEN lc.contact_id IS NULL OR coalesce(lc.contact_type, '') <> 'client' THEN 'R4 receipt has no customer'
           WHEN lc.contact_id <> lc.invoice_client_id THEN 'R4 receipt customer differs from the invoice customer'
           WHEN lc.same_reference_payment THEN 'R6 an invoice payment with the same reference exists'
           WHEN lc.same_amount_date_payment THEN 'R7 an invoice payment with the same amount and date exists'
         END AS rule_exclusion
  FROM legacy_receipt_candidates lc
),
open_bal AS (
  SELECT i.id AS invoice_id,
         round(i.total_amount
           - coalesce((SELECT sum(a.amount) FROM public.invoice_payment_allocations a
                       WHERE a.org_id = i.org_id AND a.invoice_id = i.id AND a.status = 'confirmed'), 0)
           - coalesce((SELECT sum(cn.amount) FROM public.invoice_credit_notes cn
                       WHERE cn.org_id = i.org_id AND cn.invoice_id = i.id AND cn.status = 'issued'), 0)
           + coalesce((SELECT sum(r.amount) FROM public.invoice_customer_refunds r
                       WHERE r.org_id = i.org_id AND r.invoice_id = i.id AND r.status = 'recorded'
                         AND r.source_type = 'credit_note'), 0), 2) AS open_amount
  FROM public.invoices i
  WHERE i.org_id = :'org'::uuid
    AND i.id IN (SELECT invoice_id FROM c WHERE rule_exclusion IS NULL)
),
ordered AS (
  SELECT c.*, ob.open_amount,
         sum(c.amount) FILTER (WHERE c.rule_exclusion IS NULL) OVER (
           PARTITION BY c.invoice_id ORDER BY c.transaction_date, c.created_at, c.transaction_id
         ) AS cumulative
  FROM c
  LEFT JOIN open_bal ob ON ob.invoice_id = c.invoice_id
)
SELECT o.transaction_id,
       o.transaction_date,
       o.ledger_category,
       o.amount,
       o.payment_reference,
       o.contact_id AS client_id,
       o.invoice_id,
       o.parsed_invoice_number AS invoice_number,
       o.open_amount AS invoice_open_now,
       CASE WHEN o.rule_exclusion IS NULL AND o.cumulative <= o.open_amount
            THEN round(o.open_amount - o.cumulative, 2) END AS invoice_open_after,
       coalesce(o.rule_exclusion,
                CASE WHEN o.cumulative > o.open_amount THEN 'R8 exceeds the invoice open balance' END) AS exclusion,
       CASE WHEN o.rule_exclusion IS NULL AND o.cumulative <= o.open_amount THEN 'planned' ELSE 'excluded' END AS plan_status,
       CASE WHEN o.ledger_category = 'tds_receivable' THEN 'tds' ELSE 'other' END AS payment_mode,
       'legacy-link:' || o.transaction_id::text AS idempotency_key,
       o.description
FROM ordered o;
