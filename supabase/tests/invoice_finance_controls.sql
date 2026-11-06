-- Finance controls on a real database: payments, allocations, credit notes,
-- cancellation, ledger, aging, receipts, bank reconciliation, the trip-ledger link,
-- organization isolation and direct-write restrictions.
--
-- Local database only. Every fixture is synthetic and the script rolls back.
-- RPCs run as the `authenticated` role with a JWT subject, the way PostgREST calls
-- them, so grants, RLS and the invoice guard are exercised (not bypassed as postgres).
--
--   docker exec -i <db-container> psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/invoice_finance_controls.sql
--
-- Requires 20271103213000, 20271103220000 and 20271103231500.
-- Concurrency is covered separately by supabase/tests/invoice_finance_concurrency.sh.

\set ON_ERROR_STOP 1
BEGIN;

-- ---------------------------------------------------------------------------
-- Helpers (session temp schema; gone at rollback)
-- ---------------------------------------------------------------------------

CREATE FUNCTION pg_temp.id(p_name text) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT (CASE p_name
    WHEN 'ORG_A' THEN 'f1000000-0000-4000-8000-00000000a001'
    WHEN 'ORG_B' THEN 'f1000000-0000-4000-8000-00000000b001'
    WHEN 'FIN'   THEN 'f1000000-0000-4000-8000-00000000f001'
    WHEN 'CLERK' THEN 'f1000000-0000-4000-8000-00000000c001'
    WHEN 'OUT'   THEN 'f1000000-0000-4000-8000-00000000e001'
    WHEN 'C1'    THEN 'f1000000-0000-4000-8000-0000000c1001'
    WHEN 'C2'    THEN 'f1000000-0000-4000-8000-0000000c2001'
    WHEN 'CB'    THEN 'f1000000-0000-4000-8000-0000000cb001'
    WHEN 'I1'    THEN 'f1000000-0000-4000-8000-000000000101'
    WHEN 'I2'    THEN 'f1000000-0000-4000-8000-000000000102'
    WHEN 'I3'    THEN 'f1000000-0000-4000-8000-000000000103'
    WHEN 'I4'    THEN 'f1000000-0000-4000-8000-000000000104'
    WHEN 'I5'    THEN 'f1000000-0000-4000-8000-000000000105'
    WHEN 'I6'    THEN 'f1000000-0000-4000-8000-000000000106'
    WHEN 'I7'    THEN 'f1000000-0000-4000-8000-000000000107'
    WHEN 'I8'    THEN 'f1000000-0000-4000-8000-000000000108'
    WHEN 'I9'    THEN 'f1000000-0000-4000-8000-000000000109'
    WHEN 'I10'   THEN 'f1000000-0000-4000-8000-000000000110'
    WHEN 'IC2'   THEN 'f1000000-0000-4000-8000-000000000201'
    WHEN 'IB'    THEN 'f1000000-0000-4000-8000-000000000301'
    WHEN 'T1'    THEN 'f1000000-0000-4000-8000-000000000401'
    WHEN 'T2'    THEN 'f1000000-0000-4000-8000-000000000402'
  END)::uuid;
$$;

CREATE FUNCTION pg_temp.check(p_label text, p_ok boolean, p_detail text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_ok IS NOT TRUE THEN
    RAISE EXCEPTION 'FAIL %: %', p_label, coalesce(p_detail, 'condition was false');
  END IF;
  RAISE NOTICE 'PASS: %', p_label;
END;
$$;

CREATE FUNCTION pg_temp.expect_error(p_label text, p_sql text, p_pattern text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_msg text;
  v_state text;
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT, v_state = RETURNED_SQLSTATE;
    IF v_msg ILIKE p_pattern OR v_state = p_pattern THEN
      RAISE NOTICE 'PASS: % [% %]', p_label, v_state, v_msg;
      RETURN;
    END IF;
    RAISE EXCEPTION 'FAIL %: unexpected error % %', p_label, v_state, v_msg;
  END;
  RAISE EXCEPTION 'FAIL %: statement succeeded', p_label;
END;
$$;

CREATE FUNCTION pg_temp.as_user(p_name text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', pg_temp.id(p_name)::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', pg_temp.id(p_name), 'role', 'authenticated')::text, true);
END;
$$;

CREATE FUNCTION pg_temp.pay(p_key text) RETURNS uuid LANGUAGE sql AS $$
  SELECT id FROM public.invoice_payments WHERE idempotency_key = p_key;
$$;

CREATE FUNCTION pg_temp.summary(p_invoice text)
RETURNS TABLE (received numeric, outstanding numeric, credited numeric, status text)
LANGUAGE sql AS $$
  SELECT amount_received, amount_outstanding, amount_credited, payment_status
  FROM public.invoice_payment_summaries(pg_temp.id('ORG_A'), ARRAY[pg_temp.id(p_invoice)]);
$$;

-- ---------------------------------------------------------------------------
-- Fixtures (as postgres)
-- ---------------------------------------------------------------------------

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  (pg_temp.id('FIN'), 'fc-finance@test.local', '{}'),
  (pg_temp.id('CLERK'), 'fc-clerk@test.local', '{}'),
  (pg_temp.id('OUT'), 'fc-outsider@test.local', '{}');
INSERT INTO public.profiles (id, email, full_name, role) VALUES
  (pg_temp.id('FIN'), 'fc-finance@test.local', 'FC Finance Lead', 'user'),
  (pg_temp.id('CLERK'), 'fc-clerk@test.local', 'FC Clerk', 'user'),
  (pg_temp.id('OUT'), 'fc-outsider@test.local', 'FC Outsider', 'user');
INSERT INTO public.organizations (id, name, gstin, state, city, address_line) VALUES
  (pg_temp.id('ORG_A'), 'FC Test Org A', '33AAAAA0000A1Z5', 'Tamil Nadu', 'Chennai', '1 Test Street'),
  (pg_temp.id('ORG_B'), 'FC Test Org B', NULL, 'Karnataka', 'Bengaluru', NULL);
INSERT INTO public.organization_members (organization_id, user_id, status, role) VALUES
  (pg_temp.id('ORG_A'), pg_temp.id('FIN'), 'active', 'owner'),
  (pg_temp.id('ORG_A'), pg_temp.id('CLERK'), 'active', 'member'),
  (pg_temp.id('ORG_B'), pg_temp.id('OUT'), 'active', 'owner');
INSERT INTO public.clients (id, organization_id, name, legal_name, phone, gstin, state, billing_address) VALUES
  (pg_temp.id('C1'), pg_temp.id('ORG_A'), 'FC Client One', 'FC Client One Pvt Ltd', '9000000301', '29BBBBB1111B1Z5', 'Karnataka', '9 Billing Road'),
  (pg_temp.id('C2'), pg_temp.id('ORG_A'), 'FC Client Two', NULL, '9000000302', NULL, NULL, NULL),
  (pg_temp.id('CB'), pg_temp.id('ORG_B'), 'FC Client B', NULL, '9000000303', NULL, NULL, NULL);

INSERT INTO public.invoices (id, org_id, invoice_number, financial_year, client_id, client_name, total_amount, status, invoice_date, due_date) VALUES
  (pg_temp.id('I1'),  pg_temp.id('ORG_A'), 'FC-001', '2026-27', pg_temp.id('C1'), 'FC Client One', 1000, 'sent', CURRENT_DATE - 130, CURRENT_DATE - 100),
  (pg_temp.id('I2'),  pg_temp.id('ORG_A'), 'FC-002', '2026-27', pg_temp.id('C1'), 'FC Client One', 1000, 'sent', CURRENT_DATE - 75,  CURRENT_DATE - 45),
  (pg_temp.id('I3'),  pg_temp.id('ORG_A'), 'FC-003', '2026-27', pg_temp.id('C1'), 'FC Client One', 400,  'sent', CURRENT_DATE - 40,  CURRENT_DATE - 10),
  (pg_temp.id('I4'),  pg_temp.id('ORG_A'), 'FC-004', '2026-27', pg_temp.id('C1'), 'FC Client One', 600,  'sent', CURRENT_DATE - 40,  CURRENT_DATE - 10),
  (pg_temp.id('I5'),  pg_temp.id('ORG_A'), 'FC-005', '2026-27', pg_temp.id('C1'), 'FC Client One', 1000, 'sent', CURRENT_DATE - 5,   CURRENT_DATE + 10),
  (pg_temp.id('I6'),  pg_temp.id('ORG_A'), 'FC-006', '2026-27', pg_temp.id('C1'), 'FC Client One', 500,  'sent', CURRENT_DATE - 20,  CURRENT_DATE + 5),
  (pg_temp.id('I7'),  pg_temp.id('ORG_A'), 'DRAFT/FC-007', 'DRAFT', pg_temp.id('C1'), 'FC Client One', 1000, 'draft', CURRENT_DATE, NULL),
  (pg_temp.id('I8'),  pg_temp.id('ORG_A'), 'DRAFT/FC-008', 'DRAFT', pg_temp.id('C1'), 'FC Client One', 700, 'cancelled', CURRENT_DATE - 9, NULL),
  (pg_temp.id('I9'),  pg_temp.id('ORG_A'), 'FC-009', '2026-27', pg_temp.id('C1'), 'FC Client One', 300,  'void', CURRENT_DATE - 60,  CURRENT_DATE - 30),
  (pg_temp.id('I10'), pg_temp.id('ORG_A'), 'FC-010', '2026-27', pg_temp.id('C1'), 'FC Client One', 500,  'sent', CURRENT_DATE - 3,   CURRENT_DATE + 27),
  (pg_temp.id('IC2'), pg_temp.id('ORG_A'), 'FC-C2-1', '2026-27', pg_temp.id('C2'), 'FC Client Two', 800, 'sent', CURRENT_DATE - 2,   CURRENT_DATE + 20),
  (pg_temp.id('IB'),  pg_temp.id('ORG_B'), 'FB-001', '2026-27', pg_temp.id('CB'), 'FC Client B', 1000,  'sent', CURRENT_DATE - 2,   CURRENT_DATE + 20);

-- Trip-ledger customer receipt (legacy capture) and a driver row.
INSERT INTO public.transactions (id, organization_id, party_name, description, amount_in, amount_out, transaction_date, contact_id, contact_type, ledger_category, payment_reference) VALUES
  (pg_temp.id('T1'), pg_temp.id('ORG_A'), 'FC Client One', 'Customer receipt UTR-LEG · FC-010', 500, 0, CURRENT_DATE - 2, pg_temp.id('C1'), 'client', 'customer_receipt', 'UTR-LEG'),
  (pg_temp.id('T2'), pg_temp.id('ORG_A'), 'Some Driver', 'Driver refund', 100, 0, CURRENT_DATE - 2, gen_random_uuid(), 'driver', NULL, NULL);

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_user('FIN');

-- ---------------------------------------------------------------------------
-- Payment recording, partial / full / multiple, split, remainder, idempotency
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r jsonb;
  s record;
  v_n int;
BEGIN
  r := public.record_invoice_payment(pg_temp.id('ORG_A'), pg_temp.id('C1'), CURRENT_DATE, 1000, 'neft', 'UTR-FULL', NULL, 'HDFC 1234', NULL,
         'fc-full-0001', jsonb_build_array(jsonb_build_object('invoice_id', pg_temp.id('I1'), 'amount', 1000)));
  SELECT * INTO s FROM pg_temp.summary('I1');
  PERFORM pg_temp.check('full payment: paid, outstanding 0', s.status = 'paid' AND s.outstanding = 0 AND s.received = 1000, to_jsonb(s)::text);
  PERFORM pg_temp.check('full payment: issued total unchanged',
    (SELECT total_amount FROM public.invoices WHERE id = pg_temp.id('I1')) = 1000);
  PERFORM pg_temp.check('receipt number assigned RCT/<FY>/<seq>',
    (r->>'receipt_number') ~ '^RCT/[0-9]{4}-[0-9]{2}/[0-9]{5}$', r::text);

  r := public.record_invoice_payment(pg_temp.id('ORG_A'), pg_temp.id('C1'), CURRENT_DATE, 1000, 'neft', 'UTR-FULL', NULL, 'HDFC 1234', NULL,
         'fc-full-0001', jsonb_build_array(jsonb_build_object('invoice_id', pg_temp.id('I1'), 'amount', 1000)));
  SELECT count(*) INTO v_n FROM public.invoice_payments WHERE org_id = pg_temp.id('ORG_A');
  PERFORM pg_temp.check('duplicate idempotency key replays without a second receipt',
    (r->>'replayed')::boolean AND v_n = 1 AND (SELECT received FROM pg_temp.summary('I1')) = 1000, r::text);

  PERFORM public.record_invoice_payment(pg_temp.id('ORG_A'), pg_temp.id('C1'), CURRENT_DATE, 400, 'upi', 'UTR-P2A', NULL, NULL, NULL,
         'fc-p2a-0001', jsonb_build_array(jsonb_build_object('invoice_id', pg_temp.id('I2'), 'amount', 400)));
  SELECT * INTO s FROM pg_temp.summary('I2');
  PERFORM pg_temp.check('partial payment: partially_paid, 600 outstanding', s.status = 'partially_paid' AND s.outstanding = 600, to_jsonb(s)::text);
  PERFORM public.record_invoice_payment(pg_temp.id('ORG_A'), pg_temp.id('C1'), CURRENT_DATE, 600, 'upi', 'UTR-P2B', NULL, NULL, NULL,
         'fc-p2b-0001', jsonb_build_array(jsonb_build_object('invoice_id', pg_temp.id('I2'), 'amount', 600)));
  SELECT * INTO s FROM pg_temp.summary('I2');
  PERFORM pg_temp.check('multiple payments on one invoice: paid at 1000', s.status = 'paid' AND s.received = 1000, to_jsonb(s)::text);

  r := public.record_invoice_payment(pg_temp.id('ORG_A'), pg_temp.id('C1'), CURRENT_DATE, 1000, 'bank', 'UTR-SPLIT', NULL, NULL, NULL,
         'fc-split-001', jsonb_build_array(
           jsonb_build_object('invoice_id', pg_temp.id('I3'), 'amount', 250),
           jsonb_build_object('invoice_id', pg_temp.id('I4'), 'amount', 250)));
  PERFORM pg_temp.check('one payment across two invoices leaves 500 unallocated', (r->>'unallocated')::numeric = 500, r::text);
  r := public.allocate_invoice_payment(pg_temp.id('ORG_A'), pg_temp.pay('fc-split-001'),
         jsonb_build_array(jsonb_build_object('invoice_id', pg_temp.id('I3'), 'amount', 150)), 'fc-alloc-001');
  PERFORM pg_temp.check('later allocation of the remainder: I3 paid, 350 left',
    (SELECT status FROM pg_temp.summary('I3')) = 'paid' AND (r->>'unallocated')::numeric = 350, r::text);
  r := public.allocate_invoice_payment(pg_temp.id('ORG_A'), pg_temp.pay('fc-split-001'),
         jsonb_build_array(jsonb_build_object('invoice_id', pg_temp.id('I3'), 'amount', 150)), 'fc-alloc-001');
  PERFORM pg_temp.check('allocation idempotency key replays', (r->>'replayed')::boolean AND (SELECT received FROM pg_temp.summary('I3')) = 400, r::text);
END $$;

SELECT pg_temp.expect_error('duplicate transaction reference (case and spaces ignored)',
  $q$SELECT public.record_invoice_payment(pg_temp.id('ORG_A'), pg_temp.id('C1'), CURRENT_DATE, 10, 'cash', '  utr-split ', NULL, NULL, NULL, 'fc-dup-00001', '[]')$q$,
  '%duplicate transaction reference%');
SELECT pg_temp.expect_error('over-allocation against an invoice',
  $q$SELECT public.allocate_invoice_payment(pg_temp.id('ORG_A'), pg_temp.pay('fc-split-001'), jsonb_build_array(jsonb_build_object('invoice_id', pg_temp.id('I3'), 'amount', 50)), 'fc-over-0001')$q$,
  '%allocation exceeds invoice balance%');
SELECT pg_temp.expect_error('over-allocation against the payment',
  $q$SELECT public.allocate_invoice_payment(pg_temp.id('ORG_A'), pg_temp.pay('fc-split-001'), jsonb_build_array(jsonb_build_object('invoice_id', pg_temp.id('I5'), 'amount', 400)), 'fc-over-0002')$q$,
  '%allocation exceeds payment balance%');
SELECT pg_temp.expect_error('same invoice twice in one allocation',
  $q$SELECT public.record_invoice_payment(pg_temp.id('ORG_A'), pg_temp.id('C1'), CURRENT_DATE, 20, 'cash', NULL, NULL, NULL, NULL, 'fc-twice-001', jsonb_build_array(jsonb_build_object('invoice_id', pg_temp.id('I5'), 'amount', 10), jsonb_build_object('invoice_id', pg_temp.id('I5'), 'amount', 10)))$q$,
  '%duplicate invoice in allocation%');
SELECT pg_temp.expect_error('draft invoice rejects payment',
  $q$SELECT public.record_invoice_payment(pg_temp.id('ORG_A'), pg_temp.id('C1'), CURRENT_DATE, 10, 'cash', NULL, NULL, NULL, NULL, 'fc-draft-001', jsonb_build_array(jsonb_build_object('invoice_id', pg_temp.id('I7'), 'amount', 10)))$q$,
  '%draft invoice cannot receive a payment%');
SELECT pg_temp.expect_error('void invoice rejects payment',
  $q$SELECT public.record_invoice_payment(pg_temp.id('ORG_A'), pg_temp.id('C1'), CURRENT_DATE, 10, 'cash', NULL, NULL, NULL, NULL, 'fc-void-0001', jsonb_build_array(jsonb_build_object('invoice_id', pg_temp.id('I9'), 'amount', 10)))$q$,
  '%invoice is not issued%');
SELECT pg_temp.expect_error('another organization''s invoice is not found',
  $q$SELECT public.record_invoice_payment(pg_temp.id('ORG_A'), pg_temp.id('C1'), CURRENT_DATE, 10, 'cash', NULL, NULL, NULL, NULL, 'fc-xorg-0001', jsonb_build_array(jsonb_build_object('invoice_id', pg_temp.id('IB'), 'amount', 10)))$q$,
  '%invoice not found in this organization%');
SELECT pg_temp.expect_error('another client''s invoice cannot take this client''s payment',
  $q$SELECT public.allocate_invoice_payment(pg_temp.id('ORG_A'), pg_temp.pay('fc-split-001'), jsonb_build_array(jsonb_build_object('invoice_id', pg_temp.id('IC2'), 'amount', 10)), 'fc-xcli-0001')$q$,
  '%allocations must belong to one client%');
SELECT pg_temp.expect_error('payment date in the future',
  $q$SELECT public.record_invoice_payment(pg_temp.id('ORG_A'), pg_temp.id('C1'), CURRENT_DATE + 30, 10, 'cash', NULL, NULL, NULL, NULL, 'fc-future-01', '[]')$q$,
  '%cannot be in the future%');
SELECT pg_temp.expect_error('non-numeric allocation amount',
  $q$SELECT public.record_invoice_payment(pg_temp.id('ORG_A'), pg_temp.id('C1'), CURRENT_DATE, 10, 'cash', NULL, NULL, NULL, NULL, 'fc-nan-00001', jsonb_build_array(jsonb_build_object('invoice_id', pg_temp.id('I5'), 'amount', 'ten')))$q$,
  '%allocation amount must be positive%');

-- ---------------------------------------------------------------------------
-- Credit notes
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r jsonb;
  s record;
BEGIN
  r := public.issue_invoice_credit_note(pg_temp.id('ORG_A'), pg_temp.id('I5'), CURRENT_DATE, 'Rate correction',
         jsonb_build_array(jsonb_build_object('description', 'Rate correction', 'amount', 300, 'tax_amount', 0)), 'fc-cn-00001');
  SELECT * INTO s FROM pg_temp.summary('I5');
  PERFORM pg_temp.check('credit note reduces outstanding, issued total kept',
    s.outstanding = 700 AND s.credited = 300 AND s.status = 'partially_paid'
    AND (SELECT total_amount FROM public.invoices WHERE id = pg_temp.id('I5')) = 1000
    AND r->>'credit_number' = 'CN/FC-005/01', to_jsonb(s)::text || ' ' || r::text);
  r := public.issue_invoice_credit_note(pg_temp.id('ORG_A'), pg_temp.id('I5'), CURRENT_DATE, 'Rate correction',
         jsonb_build_array(jsonb_build_object('description', 'Rate correction', 'amount', 300, 'tax_amount', 0)), 'fc-cn-00001');
  PERFORM pg_temp.check('credit note idempotency replays',
    (r->>'replayed')::boolean AND (SELECT count(*) FROM public.invoice_credit_notes WHERE invoice_id = pg_temp.id('I5')) = 1, r::text);
END $$;

-- Regression: before 20271103231500 an invoice with a credit note could still take the full issued total.
SELECT pg_temp.expect_error('allocation respects credit notes (regression)',
  $q$SELECT public.record_invoice_payment(pg_temp.id('ORG_A'), pg_temp.id('C1'), CURRENT_DATE, 800, 'neft', 'UTR-I5-OVER', NULL, NULL, NULL, 'fc-i5-over-1', jsonb_build_array(jsonb_build_object('invoice_id', pg_temp.id('I5'), 'amount', 800)))$q$,
  '%allocation exceeds invoice balance%');
DO $$
BEGIN
  PERFORM public.record_invoice_payment(pg_temp.id('ORG_A'), pg_temp.id('C1'), CURRENT_DATE, 700, 'neft', 'UTR-I5', NULL, NULL, NULL,
         'fc-i5-00001', jsonb_build_array(jsonb_build_object('invoice_id', pg_temp.id('I5'), 'amount', 700)));
  PERFORM pg_temp.check('payment of the credited balance settles the invoice',
    (SELECT status FROM pg_temp.summary('I5')) = 'paid' AND (SELECT outstanding FROM pg_temp.summary('I5')) = 0);
END $$;
-- Since 20271103234500 the ceiling is the invoice value not yet credited (1000 - 300),
-- not the open balance: a credit on a paid invoice becomes customer credit
-- (covered in invoice_credit_refunds.sql). Above the uncredited value is refused.
SELECT pg_temp.expect_error('credit note cannot exceed the remaining value',
  $q$SELECT public.issue_invoice_credit_note(pg_temp.id('ORG_A'), pg_temp.id('I5'), CURRENT_DATE, 'Extra', '[{"description":"Extra","amount":700.01}]', 'fc-cn-00002')$q$,
  '%credit exceeds remaining invoice value%');
SELECT pg_temp.expect_error('credit note needs an issued invoice',
  $q$SELECT public.issue_invoice_credit_note(pg_temp.id('ORG_A'), pg_temp.id('I7'), CURRENT_DATE, 'Draft', '[{"description":"Draft","amount":50}]', 'fc-cn-00003')$q$,
  '%credit note requires an issued invoice%');
-- Since 20271103234500 the caller cannot send tax at all on the value-only signature
-- (tax is derived from the invoice); the table constraint still bounds it.
SELECT pg_temp.expect_error('credit note tax cannot be sent by the caller',
  $q$SELECT public.issue_invoice_credit_note(pg_temp.id('ORG_A'), pg_temp.id('I10'), CURRENT_DATE, 'Tax', '[{"description":"Tax","amount":10,"tax_amount":20}]', 'fc-cn-00004')$q$,
  '%credit note tax is calculated from the invoice%');
SELECT pg_temp.expect_error('credit note reason is required',
  $q$SELECT public.issue_invoice_credit_note(pg_temp.id('ORG_A'), pg_temp.id('I10'), CURRENT_DATE, '  ', '[{"description":"x","amount":10}]', 'fc-cn-00005')$q$,
  '%credit note reason is required%');

-- ---------------------------------------------------------------------------
-- Cancellation
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r jsonb;
  s record;
BEGIN
  r := public.cancel_customer_invoice(pg_temp.id('ORG_A'), pg_temp.id('I6'), 'Raised on the wrong customer', 'fc-cancel-01');
  SELECT * INTO s FROM pg_temp.summary('I6');
  PERFORM pg_temp.check('cancel: status cancelled, outstanding 0 (regression), number and total kept',
    s.status = 'cancelled' AND s.outstanding = 0
    AND (SELECT invoice_number || ':' || total_amount FROM public.invoices WHERE id = pg_temp.id('I6')) = 'FC-006:500.00',
    to_jsonb(s)::text);
END $$;
SELECT pg_temp.expect_error('cancel twice', $q$SELECT public.cancel_customer_invoice(pg_temp.id('ORG_A'), pg_temp.id('I6'), 'again', 'fc-cancel-02')$q$, '%already cancelled%');
SELECT pg_temp.expect_error('cancel blocked by a payment', $q$SELECT public.cancel_customer_invoice(pg_temp.id('ORG_A'), pg_temp.id('I1'), 'x', 'fc-cancel-03')$q$, '%invoice has payments or credits%');
SELECT pg_temp.expect_error('cancel blocked by a credit note', $q$SELECT public.cancel_customer_invoice(pg_temp.id('ORG_A'), pg_temp.id('I5'), 'x', 'fc-cancel-04')$q$, '%invoice has payments or credits%');
SELECT pg_temp.expect_error('cancel a draft through this operation', $q$SELECT public.cancel_customer_invoice(pg_temp.id('ORG_A'), pg_temp.id('I7'), 'x', 'fc-cancel-05')$q$, '%only an issued invoice can be cancelled%');
SELECT pg_temp.expect_error('cancel needs a reason', $q$SELECT public.cancel_customer_invoice(pg_temp.id('ORG_A'), pg_temp.id('I10'), ' ', 'fc-cancel-06')$q$, '%cancellation reason is required%');
SELECT pg_temp.expect_error('cancelled invoice rejects payment',
  $q$SELECT public.record_invoice_payment(pg_temp.id('ORG_A'), pg_temp.id('C1'), CURRENT_DATE, 10, 'cash', NULL, NULL, NULL, NULL, 'fc-canpay-01', jsonb_build_array(jsonb_build_object('invoice_id', pg_temp.id('I6'), 'amount', 10)))$q$,
  '%invoice is not issued%');

-- ---------------------------------------------------------------------------
-- Direct table writes by an org owner (finance staff) through the table API
-- ---------------------------------------------------------------------------
SELECT pg_temp.expect_error('direct cancel of an issued invoice is blocked (regression)',
  $q$UPDATE public.invoices SET status = 'cancelled' WHERE id = pg_temp.id('I10')$q$, '%issued invoice status changes only through finance operations%');
SELECT pg_temp.expect_error('direct mark-paid of an issued invoice is blocked',
  $q$UPDATE public.invoices SET status = 'paid' WHERE id = pg_temp.id('I10')$q$, '%issued invoice status changes only through finance operations%');
SELECT pg_temp.expect_error('direct re-total of an issued invoice is blocked',
  $q$UPDATE public.invoices SET total_amount = 1 WHERE id = pg_temp.id('I10')$q$, '%issued invoice amounts and identity are immutable%');
SELECT pg_temp.expect_error('direct delete of an issued invoice is blocked',
  $q$DELETE FROM public.invoices WHERE id = pg_temp.id('I10')$q$, '%issued invoice cannot be deleted%');
SELECT pg_temp.expect_error('direct issue of a draft is blocked',
  $q$UPDATE public.invoices SET status = 'sent' WHERE id = pg_temp.id('I7')$q$, '%issued only through the issue operation%');
DO $$
DECLARE
  v_rows int;
BEGIN
  UPDATE public.invoices SET notes = 'Customer asked for a copy' WHERE id = pg_temp.id('I10');
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  PERFORM pg_temp.check('notes on an issued invoice stay editable (existing invoice book flow)', v_rows = 1);
  UPDATE public.invoices SET total_amount = 900, subtotal = 900 WHERE id = pg_temp.id('I7');
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  PERFORM pg_temp.check('drafts stay editable', v_rows = 1);
END $$;
SELECT pg_temp.expect_error('direct insert into invoice_payments is denied',
  $q$INSERT INTO public.invoice_payments (org_id, payment_date, amount, payment_mode, recorded_by, idempotency_key) VALUES (pg_temp.id('ORG_A'), CURRENT_DATE, 1, 'cash', pg_temp.id('FIN'), 'fc-direct-001')$q$, '42501');
SELECT pg_temp.expect_error('direct insert with the write flag set is still denied',
  $q$SELECT set_config('pulse.invoice_payment_write', 'on', true); INSERT INTO public.invoice_payment_allocations (org_id, payment_id, invoice_id, amount, created_by) VALUES (pg_temp.id('ORG_A'), pg_temp.pay('fc-split-001'), pg_temp.id('I10'), 1, pg_temp.id('FIN'))$q$, '42501');
SELECT pg_temp.expect_error('direct update of a payment amount is denied',
  $q$UPDATE public.invoice_payments SET amount = 1 WHERE idempotency_key = 'fc-full-0001'$q$, '42501');
SELECT pg_temp.expect_error('direct delete of an allocation is denied',
  $q$DELETE FROM public.invoice_payment_allocations WHERE org_id = pg_temp.id('ORG_A')$q$, '42501');
SELECT pg_temp.expect_error('direct insert of a credit note is denied',
  $q$INSERT INTO public.invoice_credit_notes (org_id, client_id, invoice_id, credit_number, credit_date, reason, amount) VALUES (pg_temp.id('ORG_A'), pg_temp.id('C1'), pg_temp.id('I10'), 'X', CURRENT_DATE, 'x', 1)$q$, '42501');
SELECT pg_temp.expect_error('direct insert of a bank line is denied',
  $q$INSERT INTO public.invoice_bank_lines (org_id, import_key, txn_date, credit) VALUES (pg_temp.id('ORG_A'), 'k', CURRENT_DATE, 1)$q$, '42501');
SELECT pg_temp.expect_error('direct read of the operations log is allowed but writing it is denied',
  $q$INSERT INTO public.invoice_finance_operations (org_id, operation, idempotency_key, result) VALUES (pg_temp.id('ORG_A'), 'x', 'y', '{}')$q$, '42501');

-- Immutability holds even for the table owner inside the write window.
RESET ROLE;
SELECT set_config('pulse.invoice_payment_write', 'on', true);
SELECT pg_temp.expect_error('credit note reason is immutable (regression)',
  $q$UPDATE public.invoice_credit_notes SET reason = 'changed' WHERE invoice_id = pg_temp.id('I5')$q$, '%issued credit note is immutable%');
SELECT pg_temp.expect_error('credit note lines are immutable (regression)',
  $q$UPDATE public.invoice_credit_note_lines SET amount = 1 WHERE org_id = pg_temp.id('ORG_A')$q$, '%credit note lines are immutable%');
SELECT pg_temp.expect_error('credit notes cannot be deleted',
  $q$DELETE FROM public.invoice_credit_notes WHERE invoice_id = pg_temp.id('I5')$q$, '%credit notes cannot be deleted%');
SELECT pg_temp.expect_error('payments cannot be deleted',
  $q$DELETE FROM public.invoice_payments WHERE idempotency_key = 'fc-full-0001'$q$, '%invoice payments cannot be deleted%');
SELECT pg_temp.expect_error('payment amount is immutable',
  $q$UPDATE public.invoice_payments SET amount = 1 WHERE idempotency_key = 'fc-full-0001'$q$, '%immutable%');
SELECT pg_temp.expect_error('receipt number is immutable',
  $q$UPDATE public.invoice_payments SET receipt_number = 'RCT/X' WHERE idempotency_key = 'fc-full-0001'$q$, '%immutable%');
SELECT pg_temp.expect_error('payment events are append-only',
  $q$UPDATE public.invoice_payment_events SET amount = 1 WHERE org_id = pg_temp.id('ORG_A')$q$, '%append-only%');
SELECT set_config('pulse.invoice_payment_write', '', true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_user('FIN');

-- ---------------------------------------------------------------------------
-- Reversal
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r jsonb;
  s record;
  v_events int;
BEGIN
  r := public.reverse_invoice_payment(pg_temp.id('ORG_A'), pg_temp.pay('fc-p2a-0001'), 'Cheque bounced', 'fc-rev-00001');
  SELECT * INTO s FROM pg_temp.summary('I2');
  SELECT count(*) INTO v_events FROM public.invoice_payment_events
  WHERE payment_id = pg_temp.pay('fc-p2a-0001') AND event_type IN ('recorded', 'allocated', 'reversed');
  PERFORM pg_temp.check('reversal restores the balance and keeps every row',
    s.received = 600 AND s.outstanding = 400 AND s.status = 'partially_paid' AND v_events = 3
    AND (SELECT status FROM public.invoice_payments WHERE id = pg_temp.pay('fc-p2a-0001')) = 'reversed'
    AND (SELECT count(*) FROM public.invoice_payment_allocations WHERE payment_id = pg_temp.pay('fc-p2a-0001') AND status = 'reversed') = 1
    AND (SELECT total_amount FROM public.invoices WHERE id = pg_temp.id('I2')) = 1000,
    to_jsonb(s)::text || ' events ' || v_events);
  r := public.reverse_invoice_payment(pg_temp.id('ORG_A'), pg_temp.pay('fc-p2a-0001'), 'again', 'fc-rev-00002');
  PERFORM pg_temp.check('reversing a reversed payment is a no-op', (r->>'replayed')::boolean AND (SELECT received FROM pg_temp.summary('I2')) = 600, r::text);
END $$;
SELECT pg_temp.expect_error('reversal needs a reason', $q$SELECT public.reverse_invoice_payment(pg_temp.id('ORG_A'), pg_temp.pay('fc-p2b-0001'), '', 'fc-rev-00003')$q$, '%reversal reason is required%');
SELECT pg_temp.expect_error('reversed payment takes no allocation',
  $q$SELECT public.allocate_invoice_payment(pg_temp.id('ORG_A'), pg_temp.pay('fc-p2a-0001'), jsonb_build_array(jsonb_build_object('invoice_id', pg_temp.id('I2'), 'amount', 10)), 'fc-revalloc1')$q$, '%payment is reversed%');

-- ---------------------------------------------------------------------------
-- Customer receipt with TDS
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r jsonb;
BEGIN
  r := public.record_customer_receipt(pg_temp.id('ORG_A'), pg_temp.id('C1'), CURRENT_DATE, 315, 35, 'neft', 'NEFT-TDS-1', NULL, NULL, NULL,
         'fc-tds-00001', jsonb_build_array(jsonb_build_object('invoice_id', pg_temp.id('I4'), 'amount', 350)));
  PERFORM pg_temp.check('bank + TDS receipt settles 350 and keeps the bank part at 315',
    (r->>'amount')::numeric = 350 AND (r->>'tds_amount')::numeric = 35
    AND (SELECT status FROM pg_temp.summary('I4')) = 'paid'
    AND (SELECT amount - tds_amount FROM public.invoice_payments WHERE id = pg_temp.pay('fc-tds-00001')) = 315, r::text);
END $$;
SELECT pg_temp.expect_error('customer receipt needs a client',
  $q$SELECT public.record_customer_receipt(pg_temp.id('ORG_A'), NULL, CURRENT_DATE, 10, 0, 'neft', NULL, NULL, NULL, NULL, 'fc-tds-00002', '[]')$q$, '%client is required%');

-- ---------------------------------------------------------------------------
-- Trip-ledger receipt: explicit link, never automatic
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r jsonb;
  v_before int;
  v_open int;
BEGIN
  SELECT count(*) INTO v_open FROM public.trip_ledger_receipts_for_invoicing(pg_temp.id('ORG_A'), pg_temp.id('C1'), true, 50, 0);
  PERFORM pg_temp.check('unlinked trip-ledger receipts are listed, other parties are not', v_open = 1, v_open::text);
  PERFORM pg_temp.check('a trip-ledger receipt does not settle any invoice by itself',
    (SELECT status FROM pg_temp.summary('I10')) = 'unpaid');
  r := public.link_trip_receipt_to_invoice_payment(pg_temp.id('ORG_A'), pg_temp.id('T1'), pg_temp.id('C1'),
         jsonb_build_array(jsonb_build_object('invoice_id', pg_temp.id('I10'), 'amount', 500)), 'fc-link-0001');
  PERFORM pg_temp.check('explicit link records one payment for the trip-ledger amount',
    (SELECT status FROM pg_temp.summary('I10')) = 'paid'
    AND (SELECT source_transaction_id FROM public.invoice_payments WHERE id = (r->>'payment_id')::uuid) = pg_temp.id('T1')
    AND (r->>'amount')::numeric = 500, r::text);
  SELECT count(*) INTO v_open FROM public.trip_ledger_receipts_for_invoicing(pg_temp.id('ORG_A'), pg_temp.id('C1'), true, 50, 0);
  PERFORM pg_temp.check('linked receipt leaves the unlinked list', v_open = 0);
  PERFORM pg_temp.check('the trip-ledger row is unchanged',
    (SELECT amount_in || ':' || coalesce(ledger_category, '') FROM public.transactions WHERE id = pg_temp.id('T1')) = '500.00:customer_receipt');
END $$;
SELECT pg_temp.expect_error('a trip-ledger receipt links once',
  $q$SELECT public.link_trip_receipt_to_invoice_payment(pg_temp.id('ORG_A'), pg_temp.id('T1'), pg_temp.id('C1'), '[]', 'fc-link-0002')$q$, '%already linked%');
SELECT pg_temp.expect_error('a driver row cannot be linked to a customer',
  $q$SELECT public.link_trip_receipt_to_invoice_payment(pg_temp.id('ORG_A'), pg_temp.id('T2'), pg_temp.id('C1'), '[]', 'fc-link-0003')$q$, '%belongs to another party%');

-- ---------------------------------------------------------------------------
-- Receipt numbers are gapless despite the failed attempts above
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_count int;
  v_last int;
  v_distinct int;
BEGIN
  SELECT count(*), count(DISTINCT receipt_number) INTO v_count, v_distinct
  FROM public.invoice_payments WHERE org_id = pg_temp.id('ORG_A');
  SELECT max(split_part(receipt_number, '/', 3)::int) INTO v_last
  FROM public.invoice_payments WHERE org_id = pg_temp.id('ORG_A');
  PERFORM pg_temp.check('receipt numbers: unique and no gaps after rolled-back attempts',
    v_count = v_distinct AND v_last = v_count, format('count %s distinct %s last %s', v_count, v_distinct, v_last));
END $$;

-- ---------------------------------------------------------------------------
-- Receipt document
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r jsonb;
BEGIN
  r := public.invoice_payment_receipt(pg_temp.id('ORG_A'), pg_temp.pay('fc-split-001'));
  PERFORM pg_temp.check('receipt document comes from payment records',
    (r->>'amount')::numeric = 1000 AND (r->>'allocated')::numeric = 650 AND (r->>'unallocated')::numeric = 350
    AND jsonb_array_length(r->'allocations') = 3
    AND r->'issuer'->>'legal_name' = 'FC Test Org A' AND r->'issuer'->>'gstin' = '33AAAAA0000A1Z5'
    AND r->'customer'->>'legal_name' = 'FC Client One Pvt Ltd'
    AND r->>'recorded_by' = 'FC Finance Lead' AND r->>'status' = 'recorded', r::text);
  r := public.invoice_payment_receipt(pg_temp.id('ORG_A'), pg_temp.pay('fc-p2a-0001'));
  PERFORM pg_temp.check('reversed receipt is marked and has nothing applied',
    r->>'status' = 'reversed' AND (r->>'unallocated')::numeric = 0 AND r->>'reversal_reason' = 'Cheque bounced'
    AND r->'allocations'->0->>'status' = 'reversed', r::text);
  r := public.invoice_payment_receipt(pg_temp.id('ORG_A'), pg_temp.pay('fc-tds-00001'));
  PERFORM pg_temp.check('TDS receipt shows bank and TDS parts', (r->>'bank_amount')::numeric = 315 AND (r->>'tds_amount')::numeric = 35, r::text);
END $$;

-- ---------------------------------------------------------------------------
-- Outstanding, aging, registers
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  c record;
  o record;
  v_rows int;
  v_count bigint;
  v_collected numeric;
BEGIN
  SELECT * INTO c FROM public.customer_invoice_receivables(pg_temp.id('ORG_A'), pg_temp.id('C1'));
  -- Open now: I2 400 (due 45 days ago). Everything else for C1 is settled or cancelled.
  PERFORM pg_temp.check('customer outstanding and aging buckets',
    c.amount_outstanding = 400 AND c.days_31_60 = 400 AND c.current_amount = 0 AND c.days_1_30 = 0
    AND c.days_61_90 = 0 AND c.days_over_90 = 0, to_jsonb(c)::text);
  SELECT * INTO o FROM public.org_receivables_aging(pg_temp.id('ORG_A'), 100, 0) WHERE client_id = pg_temp.id('C1');
  PERFORM pg_temp.check('org aging agrees with the customer aging',
    o.amount_outstanding = c.amount_outstanding AND o.days_31_60 = c.days_31_60 AND o.amount_credited = 300, to_jsonb(o)::text);
  SELECT count(*) INTO v_rows FROM public.org_receivables_aging(pg_temp.id('ORG_A'), 100, 0);
  PERFORM pg_temp.check('org aging lists both clients with open balances, largest first',
    v_rows = 2 AND (SELECT client_id FROM public.org_receivables_aging(pg_temp.id('ORG_A'), 1, 0)) = pg_temp.id('C2'));

  SELECT count(*), max(total_count) INTO v_rows, v_count FROM public.invoice_register(pg_temp.id('ORG_A'), NULL, NULL, NULL, 200, 0);
  PERFORM pg_temp.check('invoice register excludes drafts and discarded drafts', v_rows = 9 AND v_count = 9, v_rows || '/' || v_count);
  PERFORM pg_temp.check('invoice register outstanding matches the summaries',
    (SELECT amount_outstanding FROM public.invoice_register(pg_temp.id('ORG_A'), NULL, NULL, NULL, 200, 0) WHERE invoice_id = pg_temp.id('I2')) = 400
    AND (SELECT status FROM public.invoice_register(pg_temp.id('ORG_A'), NULL, NULL, NULL, 200, 0) WHERE invoice_id = pg_temp.id('I6')) = 'cancelled');

  PERFORM pg_temp.check('open-only register: only invoices with a balance, oldest due first',
    (SELECT jsonb_agg(invoice_number) FROM public.invoice_register(pg_temp.id('ORG_A'), pg_temp.id('C1'), NULL, NULL, 200, 0, true)) = '["FC-002"]'::jsonb
    AND (SELECT jsonb_agg(invoice_number) FROM public.invoice_register(pg_temp.id('ORG_A'), NULL, NULL, NULL, 200, 0, true)) = '["FC-002", "FC-C2-1"]'::jsonb);
  PERFORM pg_temp.check('payment register search by reference',
    (SELECT unallocated FROM public.invoice_payment_register(pg_temp.id('ORG_A'), NULL, NULL, NULL, 'utr-split', 50, 0)) = 350);
  PERFORM pg_temp.check('payment register search by bank amount finds the TDS receipt',
    (SELECT receipt_number FROM public.invoice_payment_register(pg_temp.id('ORG_A'), NULL, NULL, NULL, '315', 50, 0))
      = (SELECT receipt_number FROM public.invoice_payments WHERE id = pg_temp.pay('fc-tds-00001')));
  SELECT sum(settled_amount) INTO v_collected FROM public.invoice_collections_summary(pg_temp.id('ORG_A'), CURRENT_DATE - 30, CURRENT_DATE);
  PERFORM pg_temp.check('collections exclude reversed receipts',
    v_collected = (SELECT sum(amount) FROM public.invoice_payments WHERE org_id = pg_temp.id('ORG_A') AND status = 'recorded' AND payment_date >= CURRENT_DATE - 30),
    v_collected::text);
  PERFORM pg_temp.check('credit note register shows the invoice and lines',
    (SELECT invoice_number || ':' || jsonb_array_length(lines) FROM public.invoice_credit_note_register(pg_temp.id('ORG_A'), NULL, 50, 0)) = 'FC-005:1');
  PERFORM pg_temp.check('invoice history lists the credit note and the payments',
    (SELECT count(*) FROM public.invoice_finance_history(pg_temp.id('ORG_A'), pg_temp.id('I5')) WHERE event_type IN ('credit_issued', 'payment_allocated')) = 2);
END $$;

-- ---------------------------------------------------------------------------
-- Customer ledger: running balance across pages, reversals, cancellations
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_all jsonb := '[]'::jsonb;
  v_page jsonb;
  v_offset int := 0;
  v_prev numeric := 0;
  v_row jsonb;
  v_closing numeric;
  v_unallocated numeric;
  v_outstanding numeric;
  v_total bigint;
  v_opening numeric;
  v_first jsonb;
  v_legacy numeric;
BEGIN
  LOOP
    SELECT coalesce(jsonb_agg(to_jsonb(e)), '[]'::jsonb) INTO v_page
    FROM public.customer_ledger_entries(pg_temp.id('ORG_A'), pg_temp.id('C1'), NULL, NULL, 4, v_offset) e;
    EXIT WHEN jsonb_array_length(v_page) = 0;
    v_all := v_all || v_page;
    v_offset := v_offset + 4;
  END LOOP;
  FOR v_row IN SELECT value FROM jsonb_array_elements(v_all)
  LOOP
    IF round(v_prev + (v_row->>'debit')::numeric - (v_row->>'credit')::numeric, 2) <> (v_row->>'running_balance')::numeric THEN
      RAISE EXCEPTION 'FAIL ledger running balance breaks at %', v_row;
    END IF;
    v_prev := (v_row->>'running_balance')::numeric;
  END LOOP;
  v_total := (v_all->0->>'total_count')::bigint;
  v_closing := (v_all->0->>'closing_balance')::numeric;
  PERFORM pg_temp.check('ledger: running balance is continuous across pages of 4',
    jsonb_array_length(v_all) = v_total AND v_prev = v_closing, format('rows %s total %s last %s closing %s', jsonb_array_length(v_all), v_total, v_prev, v_closing));

  SELECT amount_outstanding INTO v_outstanding FROM public.customer_invoice_receivables(pg_temp.id('ORG_A'), pg_temp.id('C1'));
  SELECT coalesce(sum(unallocated), 0) INTO v_unallocated FROM public.invoice_payment_register(pg_temp.id('ORG_A'), pg_temp.id('C1'), NULL, NULL, NULL, 200, 0);
  PERFORM pg_temp.check('ledger reconciles: closing = outstanding - unallocated receipts',
    v_closing = v_outstanding - v_unallocated, format('closing %s outstanding %s unallocated %s', v_closing, v_outstanding, v_unallocated));

  PERFORM pg_temp.check('reversed receipt: original credit and reversal debit both present (regression)',
    EXISTS (SELECT 1 FROM jsonb_array_elements(v_all) x WHERE x->>'entry_type' = 'payment' AND x->>'payment_id' = pg_temp.pay('fc-p2a-0001')::text AND (x->>'credit')::numeric = 400)
    AND EXISTS (SELECT 1 FROM jsonb_array_elements(v_all) x WHERE x->>'entry_type' = 'reversal' AND x->>'payment_id' = pg_temp.pay('fc-p2a-0001')::text AND (x->>'debit')::numeric = 400));
  PERFORM pg_temp.check('cancelled invoice: debit and cancellation credit both present (regression)',
    EXISTS (SELECT 1 FROM jsonb_array_elements(v_all) x WHERE x->>'entry_type' = 'invoice' AND x->>'invoice_id' = pg_temp.id('I6')::text)
    AND EXISTS (SELECT 1 FROM jsonb_array_elements(v_all) x WHERE x->>'entry_type' = 'cancellation' AND x->>'invoice_id' = pg_temp.id('I6')::text AND (x->>'credit')::numeric = 500));
  PERFORM pg_temp.check('drafts, discarded drafts and voids without a cancel event are not on the ledger',
    NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_all) x WHERE x->>'invoice_id' IN (pg_temp.id('I7')::text, pg_temp.id('I8')::text) AND x->>'entry_type' = 'invoice')
    AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_all) x WHERE x->>'invoice_id' = pg_temp.id('I9')::text AND x->>'entry_type' = 'invoice'));
  PERFORM pg_temp.check('ledger order is deterministic',
    (SELECT jsonb_agg(e.entry_key) FROM public.customer_ledger_entries(pg_temp.id('ORG_A'), pg_temp.id('C1'), NULL, NULL, 500, 0) e)
      = (SELECT jsonb_agg(x->>'entry_key') FROM jsonb_array_elements(v_all) x));

  -- Statement period: opening from history before the period.
  SELECT to_jsonb(e) INTO v_first FROM public.customer_ledger_entries(pg_temp.id('ORG_A'), pg_temp.id('C1'), CURRENT_DATE - 50, CURRENT_DATE, 500, 0) e LIMIT 1;
  SELECT coalesce(sum((x->>'debit')::numeric - (x->>'credit')::numeric), 0) INTO v_opening
  FROM jsonb_array_elements(v_all) x WHERE (x->>'entry_date')::date < CURRENT_DATE - 50;
  PERFORM pg_temp.check('statement opening balance comes from entries before the period',
    (v_first->>'opening_balance')::numeric = v_opening AND v_opening = 2000
    AND (v_first->>'running_balance')::numeric = v_opening + (v_first->>'debit')::numeric - (v_first->>'credit')::numeric
    AND (v_first->>'closing_balance')::numeric = v_opening + (v_first->>'period_debit')::numeric - (v_first->>'period_credit')::numeric,
    v_first::text);

  SELECT sum(debit - credit) INTO v_legacy FROM public.customer_finance_ledger(pg_temp.id('ORG_A'), pg_temp.id('C1'), 100, 0);
  PERFORM pg_temp.check('older ledger RPC now sums to the same balance', v_legacy = v_closing, v_legacy::text);
END $$;

-- ---------------------------------------------------------------------------
-- Bank reconciliation
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r jsonb;
  v_payments int;
  v_line_full uuid;
  v_line_tds uuid;
  v_line_debit uuid;
  v_line_400 uuid;
  v_line_copy uuid;
BEGIN
  SELECT count(*) INTO v_payments FROM public.invoice_payments WHERE org_id = pg_temp.id('ORG_A');
  r := public.import_bank_statement(pg_temp.id('ORG_A'), jsonb_build_array(
    jsonb_build_object('txn_date', CURRENT_DATE, 'reference', 'UTR-FULL', 'description', 'NEFT FC CLIENT', 'credit', '1000'),
    jsonb_build_object('txn_date', CURRENT_DATE, 'reference', 'NEFT-TDS-1', 'description', 'NEFT FC CLIENT', 'credit', '315'),
    jsonb_build_object('txn_date', CURRENT_DATE, 'reference', 'CHG', 'description', 'Bank charges', 'debit', '50'),
    jsonb_build_object('txn_date', CURRENT_DATE, 'reference', 'UPI-400', 'description', 'UPI FC CLIENT', 'credit', '400'),
    jsonb_build_object('txn_date', CURRENT_DATE, 'reference', 'UTR-FULL-COPY', 'description', 'NEFT FC CLIENT', 'credit', '1000')
  ), 'fc-bank-0001');
  PERFORM pg_temp.check('bank import adds lines and creates no payment',
    (r->>'inserted')::int = 5 AND (SELECT count(*) FROM public.invoice_payments WHERE org_id = pg_temp.id('ORG_A')) = v_payments, r::text);
  r := public.import_bank_statement(pg_temp.id('ORG_A'), '[]'::jsonb, 'fc-bank-0001');
  PERFORM pg_temp.check('bank import idempotency key replays', (r->>'replayed')::boolean, r::text);
  r := public.import_bank_statement(pg_temp.id('ORG_A'), jsonb_build_array(
    jsonb_build_object('txn_date', CURRENT_DATE, 'reference', 'utr-full', 'description', 'NEFT  FC CLIENT', 'credit', '1000.00'),
    jsonb_build_object('txn_date', CURRENT_DATE, 'reference', 'NEFT-TDS-1', 'description', 'NEFT FC CLIENT', 'credit', '315.0')
  ), 'fc-bank-0002');
  PERFORM pg_temp.check('re-imported lines are duplicates even with different number formatting (regression)',
    (r->>'inserted')::int = 0 AND (r->>'duplicates')::int = 2, r::text);

  SELECT id INTO v_line_full FROM public.invoice_bank_lines WHERE org_id = pg_temp.id('ORG_A') AND reference = 'UTR-FULL';
  SELECT id INTO v_line_tds FROM public.invoice_bank_lines WHERE org_id = pg_temp.id('ORG_A') AND reference = 'NEFT-TDS-1';
  SELECT id INTO v_line_debit FROM public.invoice_bank_lines WHERE org_id = pg_temp.id('ORG_A') AND reference = 'CHG';
  SELECT id INTO v_line_400 FROM public.invoice_bank_lines WHERE org_id = pg_temp.id('ORG_A') AND reference = 'UPI-400';
  SELECT id INTO v_line_copy FROM public.invoice_bank_lines WHERE org_id = pg_temp.id('ORG_A') AND reference = 'UTR-FULL-COPY';

  r := public.match_bank_line(pg_temp.id('ORG_A'), v_line_full, pg_temp.pay('fc-full-0001'));
  PERFORM pg_temp.check('match a bank credit to its receipt', (r->>'difference')::numeric = 0, r::text);
  r := public.match_bank_line(pg_temp.id('ORG_A'), v_line_tds, pg_temp.pay('fc-tds-00001'));
  PERFORM pg_temp.check('TDS receipt matches its bank part, not the settled amount', (r->>'difference')::numeric = 0, r::text);
  r := public.match_bank_line(pg_temp.id('ORG_A'), v_line_400, pg_temp.pay('fc-p2b-0001'));
  PERFORM pg_temp.check('mismatch is allowed and reported', (r->>'difference')::numeric = -200, r::text);
  PERFORM pg_temp.check('mismatched line is listed for attention',
    (SELECT warning FROM public.bank_reconciliation_lines(pg_temp.id('ORG_A'), 'attention', 50, 0) WHERE line_id = v_line_400) = 'Bank credit and receipt differ');

  PERFORM pg_temp.expect_error('a receipt cannot be matched to a second bank line (regression)',
    format('SELECT public.match_bank_line(%L, %L, %L)', pg_temp.id('ORG_A'), v_line_copy, pg_temp.pay('fc-full-0001')), '%already matched to another bank line%');
  PERFORM pg_temp.expect_error('a debit line cannot be matched to a receipt',
    format('SELECT public.match_bank_line(%L, %L, %L)', pg_temp.id('ORG_A'), v_line_debit, pg_temp.pay('fc-i5-00001')), '%only a bank credit%');
  PERFORM pg_temp.expect_error('a matched line cannot be matched again',
    format('SELECT public.match_bank_line(%L, %L, %L)', pg_temp.id('ORG_A'), v_line_full, pg_temp.pay('fc-i5-00001')), '%bank line is not open%');
  PERFORM pg_temp.expect_error('a reversed receipt cannot be matched',
    format('SELECT public.unmatch_bank_line(%L, %L, %L); SELECT public.match_bank_line(%L, %L, %L)',
      pg_temp.id('ORG_A'), v_line_400, 'reset', pg_temp.id('ORG_A'), v_line_400, pg_temp.pay('fc-p2a-0001')), '%payment not found in this organization%');
  PERFORM pg_temp.expect_error('unmatch needs a reason',
    format('SELECT public.unmatch_bank_line(%L, %L, %L)', pg_temp.id('ORG_A'), v_line_400, ''), '%reason is required%');
  r := public.unmatch_bank_line(pg_temp.id('ORG_A'), v_line_400, 'Wrong receipt');
  PERFORM pg_temp.check('unmatch reopens the line',
    (SELECT status || ':' || coalesce(matched_payment_id::text, '-') FROM public.invoice_bank_lines WHERE id = v_line_400) = 'unmatched:-');
  PERFORM pg_temp.check('the unique-per-receipt rule holds at table level too', EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'invoice_bank_lines_one_line_per_payment'));
  PERFORM pg_temp.check('reconciliation history records import, match and unmatch',
    (SELECT count(*) FROM public.bank_reconciliation_history(pg_temp.id('ORG_A'), 50, 0) WHERE event_type = 'bank_import') = 2
    AND (SELECT count(*) FROM public.bank_reconciliation_history(pg_temp.id('ORG_A'), 50, 0) WHERE event_type = 'bank_matched') = 3
    AND (SELECT count(*) FROM public.bank_reconciliation_history(pg_temp.id('ORG_A'), 50, 0) WHERE event_type = 'bank_unmatched') = 1);

  PERFORM public.reverse_invoice_payment(pg_temp.id('ORG_A'), pg_temp.pay('fc-tds-00001'), 'Customer disputed', 'fc-rev-00004');
  PERFORM pg_temp.check('a matched receipt that is later reversed is flagged',
    (SELECT warning FROM public.bank_reconciliation_lines(pg_temp.id('ORG_A'), 'attention', 50, 0) WHERE line_id = v_line_tds) = 'Matched receipt was reversed');
END $$;
SELECT pg_temp.expect_error('a bad bank row rejects the whole file',
  $q$SELECT public.import_bank_statement(pg_temp.id('ORG_A'), '[{"txn_date":"2026-11-01","credit":"0","debit":"0"}]', 'fc-bank-0003')$q$, '%exactly one of credit or debit%');
SELECT pg_temp.expect_error('an unparseable bank date rejects the file',
  $q$SELECT public.import_bank_statement(pg_temp.id('ORG_A'), '[{"txn_date":"31/31/2026","credit":"10"}]', 'fc-bank-0004')$q$, '%invalid date or amount%');

-- ---------------------------------------------------------------------------
-- Authorization and organization isolation
-- ---------------------------------------------------------------------------
SELECT pg_temp.as_user('CLERK');
DO $$
BEGIN
  PERFORM pg_temp.check('a member can read balances', (SELECT count(*) FROM public.invoice_payment_summaries(pg_temp.id('ORG_A'), ARRAY[pg_temp.id('I2')])) = 1);
END $$;
SELECT pg_temp.expect_error('member without finance role cannot record', $q$SELECT public.record_customer_receipt(pg_temp.id('ORG_A'), pg_temp.id('C1'), CURRENT_DATE, 10, 0, 'cash', NULL, NULL, NULL, NULL, 'fc-clerk-001', '[]')$q$, '%not authorized%');
SELECT pg_temp.expect_error('member cannot issue a credit note', $q$SELECT public.issue_invoice_credit_note(pg_temp.id('ORG_A'), pg_temp.id('I10'), CURRENT_DATE, 'x', '[{"description":"x","amount":1}]', 'fc-clerk-002')$q$, '%not authorized%');
SELECT pg_temp.expect_error('member cannot cancel', $q$SELECT public.cancel_customer_invoice(pg_temp.id('ORG_A'), pg_temp.id('I10'), 'x', 'fc-clerk-003')$q$, '%not authorized%');
SELECT pg_temp.expect_error('member cannot import a statement', $q$SELECT public.import_bank_statement(pg_temp.id('ORG_A'), '[{"txn_date":"2026-11-01","credit":"1"}]', 'fc-clerk-004')$q$, '%not authorized%');
SELECT pg_temp.expect_error('member cannot unmatch', $q$SELECT public.unmatch_bank_line(pg_temp.id('ORG_A'), (SELECT id FROM public.invoice_bank_lines WHERE reference = 'UTR-FULL'), 'x')$q$, '%not authorized%');
SELECT pg_temp.expect_error('member cannot link a trip-ledger receipt', $q$SELECT public.link_trip_receipt_to_invoice_payment(pg_temp.id('ORG_A'), pg_temp.id('T1'), pg_temp.id('C1'), '[]', 'fc-clerk-005')$q$, '%not authorized%');
SELECT pg_temp.expect_error('member cannot reverse', $q$SELECT public.reverse_invoice_payment(pg_temp.id('ORG_A'), pg_temp.pay('fc-full-0001'), 'x', 'fc-clerk-006')$q$, '%not authorized%');
SELECT pg_temp.expect_error('member cannot cancel an issued invoice through the table API', $q$UPDATE public.invoices SET status = 'cancelled' WHERE id = pg_temp.id('I10')$q$, '%status changes only through finance operations%');

SELECT pg_temp.as_user('OUT');
SELECT pg_temp.expect_error('outsider: balances', $q$SELECT * FROM public.invoice_payment_summaries(pg_temp.id('ORG_A'), ARRAY[pg_temp.id('I1')])$q$, '%not authorized%');
SELECT pg_temp.expect_error('outsider: ledger', $q$SELECT * FROM public.customer_ledger_entries(pg_temp.id('ORG_A'), pg_temp.id('C1'), NULL, NULL, 10, 0)$q$, '%not authorized%');
SELECT pg_temp.expect_error('outsider: receipt document', $q$SELECT public.invoice_payment_receipt(pg_temp.id('ORG_A'), pg_temp.pay('fc-full-0001'))$q$, '%not authorized%');
SELECT pg_temp.expect_error('outsider: org aging', $q$SELECT * FROM public.org_receivables_aging(pg_temp.id('ORG_A'), 10, 0)$q$, '%not authorized%');
SELECT pg_temp.expect_error('outsider: bank lines', $q$SELECT * FROM public.bank_reconciliation_lines(pg_temp.id('ORG_A'), NULL, 10, 0)$q$, '%not authorized%');
SELECT pg_temp.expect_error('outsider: payment register', $q$SELECT * FROM public.invoice_payment_register(pg_temp.id('ORG_A'), NULL, NULL, NULL, NULL, 10, 0)$q$, '%not authorized%');
SELECT pg_temp.expect_error('outsider: record payment', $q$SELECT public.record_customer_receipt(pg_temp.id('ORG_A'), pg_temp.id('C1'), CURRENT_DATE, 10, 0, 'cash', NULL, NULL, NULL, NULL, 'fc-out-00001', '[]')$q$, '%not authorized%');
SELECT pg_temp.expect_error('outsider: own org cannot reach another org''s client', $q$SELECT * FROM public.customer_ledger_entries(pg_temp.id('ORG_B'), pg_temp.id('C1'), NULL, NULL, 10, 0)$q$, '%client not found in this organization%');
SELECT pg_temp.expect_error('outsider: own org cannot open another org''s receipt', $q$SELECT public.invoice_payment_receipt(pg_temp.id('ORG_B'), pg_temp.pay('fc-full-0001'))$q$, '%payment not found in this organization%');
SELECT pg_temp.expect_error('outsider: own org cannot allocate another org''s invoice', $q$SELECT public.record_invoice_payment(pg_temp.id('ORG_B'), pg_temp.id('CB'), CURRENT_DATE, 10, 'cash', NULL, NULL, NULL, NULL, 'fc-out-00002', jsonb_build_array(jsonb_build_object('invoice_id', pg_temp.id('I10'), 'amount', 10)))$q$, '%invoice not found in this organization%');
DO $$
BEGIN
  PERFORM pg_temp.check('outsider sees no rows of another org through RLS',
    (SELECT count(*) FROM public.invoice_payments WHERE org_id = pg_temp.id('ORG_A')) = 0
    AND (SELECT count(*) FROM public.invoice_payment_allocations WHERE org_id = pg_temp.id('ORG_A')) = 0
    AND (SELECT count(*) FROM public.invoice_credit_notes WHERE org_id = pg_temp.id('ORG_A')) = 0
    AND (SELECT count(*) FROM public.invoice_bank_lines WHERE org_id = pg_temp.id('ORG_A')) = 0
    AND (SELECT count(*) FROM public.invoice_control_events WHERE org_id = pg_temp.id('ORG_A')) = 0);
END $$;

SELECT set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '', true);
SELECT pg_temp.expect_error('authenticated role without a user', $q$SELECT public.record_customer_receipt(pg_temp.id('ORG_A'), pg_temp.id('C1'), CURRENT_DATE, 10, 0, 'cash', NULL, NULL, NULL, NULL, 'fc-nouser-01', '[]')$q$, '%not authenticated%');
SET LOCAL ROLE anon;
SELECT pg_temp.expect_error('signed out: record', $q$SELECT public.record_customer_receipt(pg_temp.id('ORG_A'), pg_temp.id('C1'), CURRENT_DATE, 10, 0, 'cash', NULL, NULL, NULL, NULL, 'fc-anon-0001', '[]')$q$, '42501');
SELECT pg_temp.expect_error('signed out: balances', $q$SELECT * FROM public.invoice_payment_summaries(pg_temp.id('ORG_A'), ARRAY[pg_temp.id('I1')])$q$, '42501');
SELECT pg_temp.expect_error('signed out: ledger', $q$SELECT * FROM public.customer_ledger_entries(pg_temp.id('ORG_A'), pg_temp.id('C1'), NULL, NULL, 10, 0)$q$, '42501');
SELECT pg_temp.expect_error('signed out: receipt document', $q$SELECT public.invoice_payment_receipt(pg_temp.id('ORG_A'), NULL)$q$, '42501');
SELECT pg_temp.expect_error('signed out: payments table', $q$SELECT count(*) FROM public.invoice_payments$q$, '42501');
RESET ROLE;

DO $$
DECLARE
  v_internal text;
BEGIN
  SELECT string_agg(f, ', ') INTO v_internal FROM unnest(ARRAY[
    'public.record_invoice_payment_core(uuid, uuid, date, numeric, numeric, text, text, uuid, text, text, text, jsonb, uuid)',
    'public.apply_invoice_payment_allocations(uuid, uuid, jsonb)',
    'public.customer_ledger_rows(uuid, uuid)',
    'public.invoice_settled_amount(uuid, uuid)',
    'public.invoice_credited_amount(uuid, uuid)',
    'public.invoice_payment_open_write()'
  ]) f WHERE has_function_privilege('authenticated', f, 'EXECUTE') OR has_function_privilege('anon', f, 'EXECUTE');
  PERFORM pg_temp.check('internal helpers are not callable by client roles', v_internal IS NULL, v_internal);
END $$;

ROLLBACK;
