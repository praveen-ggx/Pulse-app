-- Credit-note GST, customer credit, refunds, and invoice-payment / trip-ledger
-- separation, on a real database.
--
-- Local database only. Every fixture is synthetic and the script rolls back.
-- RPCs run as the `authenticated` role with a JWT subject, the way PostgREST calls
-- them, so grants, RLS and the guards are exercised.
--
--   docker exec -i <db-container> psql -U postgres -d <db> -v ON_ERROR_STOP=1 < supabase/tests/invoice_credit_refunds.sql
--
-- Requires 20271103213000, 20271103220000, 20271103231500 and 20271103234500.
-- Concurrent refunds and credit notes: supabase/tests/invoice_finance_concurrency.sh.

\set ON_ERROR_STOP 1
BEGIN;

CREATE FUNCTION pg_temp.id(p_name text) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT (CASE p_name
    WHEN 'ORG_A' THEN 'f2000000-0000-4000-8000-00000000a001'
    WHEN 'ORG_B' THEN 'f2000000-0000-4000-8000-00000000b001'
    WHEN 'FIN'   THEN 'f2000000-0000-4000-8000-00000000f001'
    WHEN 'CLERK' THEN 'f2000000-0000-4000-8000-00000000c001'
    WHEN 'OUT'   THEN 'f2000000-0000-4000-8000-00000000e001'
    WHEN 'C1'    THEN 'f2000000-0000-4000-8000-0000000c1001'
    WHEN 'C2'    THEN 'f2000000-0000-4000-8000-0000000c2001'
    WHEN 'CB'    THEN 'f2000000-0000-4000-8000-0000000cb001'
    WHEN 'GI'    THEN 'f2000000-0000-4000-8000-000000000101'
    WHEN 'GX'    THEN 'f2000000-0000-4000-8000-000000000102'
    WHEN 'GR'    THEN 'f2000000-0000-4000-8000-000000000103'
    WHEN 'GM'    THEN 'f2000000-0000-4000-8000-000000000104'
    WHEN 'GZ'    THEN 'f2000000-0000-4000-8000-000000000105'
    WHEN 'GMIX'  THEN 'f2000000-0000-4000-8000-000000000106'
    WHEN 'GNR'   THEN 'f2000000-0000-4000-8000-000000000107'
    WHEN 'GL'    THEN 'f2000000-0000-4000-8000-000000000108'
    WHEN 'GD'    THEN 'f2000000-0000-4000-8000-000000000109'
    WHEN 'PI'    THEN 'f2000000-0000-4000-8000-000000000201'
    WHEN 'PI2'   THEN 'f2000000-0000-4000-8000-000000000202'
    WHEN 'AI'    THEN 'f2000000-0000-4000-8000-000000000203'
    WHEN 'SI'    THEN 'f2000000-0000-4000-8000-000000000301'
    WHEN 'SI2'   THEN 'f2000000-0000-4000-8000-000000000302'
    WHEN 'IB'    THEN 'f2000000-0000-4000-8000-000000000401'
    WHEN 'TR1'   THEN 'f2000000-0000-4000-8000-000000000501'
    WHEN 'TX1'   THEN 'f2000000-0000-4000-8000-000000000601'
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
CREATE FUNCTION pg_temp.note(p_number text) RETURNS uuid LANGUAGE sql AS $$
  SELECT id FROM public.invoice_credit_notes WHERE credit_number = p_number;
$$;

CREATE FUNCTION pg_temp.summary(p_invoice text)
RETURNS TABLE (received numeric, outstanding numeric, credited numeric, refunded numeric, customer_credit numeric, status text)
LANGUAGE sql AS $$
  SELECT amount_received, amount_outstanding, amount_credited, amount_refunded, customer_credit, payment_status
  FROM public.invoice_payment_summaries(pg_temp.id('ORG_A'), ARRAY[pg_temp.id(p_invoice)]);
$$;

CREATE FUNCTION pg_temp.refundable(p_type text, p_id uuid) RETURNS numeric LANGUAGE sql AS $$
  SELECT coalesce((SELECT refundable FROM public.customer_refundable_sources(pg_temp.id('ORG_A'), pg_temp.id('C1'))
                   WHERE source_type = p_type AND source_id = p_id), 0);
$$;

-- Ledger closing balance must equal open receivables minus customer credit.
CREATE FUNCTION pg_temp.ledger_reconciles(p_client text) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE
  v_closing numeric;
  v_balance numeric;
BEGIN
  SELECT closing_balance INTO v_closing
  FROM public.customer_ledger_entries(pg_temp.id('ORG_A'), pg_temp.id(p_client), NULL, NULL, 1, 0);
  SELECT ledger_balance INTO v_balance
  FROM public.customer_credit_balance(pg_temp.id('ORG_A'), pg_temp.id(p_client));
  IF coalesce(v_closing, 0) <> v_balance THEN
    RAISE NOTICE 'ledger % vs balance %', v_closing, v_balance;
    RETURN false;
  END IF;
  RETURN true;
END;
$$;

-- ---------------------------------------------------------------------------
-- Fixtures (as postgres)
-- ---------------------------------------------------------------------------

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  (pg_temp.id('FIN'), 'cr-finance@test.local', '{}'),
  (pg_temp.id('CLERK'), 'cr-clerk@test.local', '{}'),
  (pg_temp.id('OUT'), 'cr-outsider@test.local', '{}');
INSERT INTO public.profiles (id, email, full_name, role) VALUES
  (pg_temp.id('FIN'), 'cr-finance@test.local', 'CR Finance Lead', 'user'),
  (pg_temp.id('CLERK'), 'cr-clerk@test.local', 'CR Clerk', 'user'),
  (pg_temp.id('OUT'), 'cr-outsider@test.local', 'CR Outsider', 'user');
INSERT INTO public.organizations (id, name, gstin, state, city) VALUES
  (pg_temp.id('ORG_A'), 'CR Test Org A', '33AAAAA0000A1Z5', 'Tamil Nadu', 'Chennai'),
  (pg_temp.id('ORG_B'), 'CR Test Org B', NULL, 'Karnataka', 'Bengaluru');
INSERT INTO public.organization_members (organization_id, user_id, status, role) VALUES
  (pg_temp.id('ORG_A'), pg_temp.id('FIN'), 'active', 'owner'),
  (pg_temp.id('ORG_A'), pg_temp.id('CLERK'), 'active', 'member'),
  (pg_temp.id('ORG_B'), pg_temp.id('OUT'), 'active', 'owner');
INSERT INTO public.clients (id, organization_id, name, phone, gstin, state) VALUES
  (pg_temp.id('C1'), pg_temp.id('ORG_A'), 'CR Client Intra', '9000000401', '33BBBBB1111B1Z5', 'Tamil Nadu'),
  (pg_temp.id('C2'), pg_temp.id('ORG_A'), 'CR Client Inter', '9000000402', '29CCCCC2222C1Z5', 'Karnataka'),
  (pg_temp.id('CB'), pg_temp.id('ORG_B'), 'CR Client B', '9000000403', NULL, NULL);

-- GST-exclusive invoices as the invoice engine writes them (taxable + CGST/SGST or IGST).
INSERT INTO public.invoices (id, org_id, invoice_number, financial_year, client_id, client_name, status, invoice_date, due_date,
                             subtotal, gst_rate, cgst_amount, sgst_amount, igst_amount, total_amount, line_items, tax_snapshot) VALUES
  (pg_temp.id('GI'),   pg_temp.id('ORG_A'), 'CR-GI', '2026-27', pg_temp.id('C1'), 'CR Client Intra', 'sent', CURRENT_DATE - 10, CURRENT_DATE + 20,
     1000, 18, 90, 90, 0, 1180, '[{"description":"Freight","taxable_value":1000,"tax_rate":18}]', '{"supply_type":"intra"}'),
  (pg_temp.id('GX'),   pg_temp.id('ORG_A'), 'CR-GX', '2026-27', pg_temp.id('C2'), 'CR Client Inter', 'sent', CURRENT_DATE - 10, CURRENT_DATE + 20,
     999.99, 18, 0, 0, 180.00, 1179.99, '[{"description":"Freight","taxable_value":999.99,"tax_rate":18}]', '{"supply_type":"inter"}'),
  (pg_temp.id('GR'),   pg_temp.id('ORG_A'), 'CR-GR', '2026-27', pg_temp.id('C1'), 'CR Client Intra', 'sent', CURRENT_DATE - 10, CURRENT_DATE + 20,
     100.03, 18, 9.00, 9.00, 0, 118.03, '[{"description":"Freight","taxable_value":100.03,"tax_rate":18}]', '{"supply_type":"intra"}'),
  (pg_temp.id('GM'),   pg_temp.id('ORG_A'), 'CR-GM', '2026-27', pg_temp.id('C1'), 'CR Client Intra', 'sent', CURRENT_DATE - 10, CURRENT_DATE + 20,
     1000, 18, 75, 75, 0, 1150, '[{"description":"Goods A","taxable_value":500,"tax_rate":12},{"description":"Goods B","taxable_value":500,"tax_rate":18}]', '{"supply_type":"intra"}'),
  (pg_temp.id('GZ'),   pg_temp.id('ORG_A'), 'CR-GZ', '2026-27', pg_temp.id('C1'), 'CR Client Intra', 'sent', CURRENT_DATE - 10, CURRENT_DATE + 20,
     500, 0, 0, 0, 0, 500, '[]', '{"supply_type":"gst_off"}'),
  (pg_temp.id('GMIX'), pg_temp.id('ORG_A'), 'CR-GMIX', '2026-27', pg_temp.id('C1'), 'CR Client Intra', 'sent', CURRENT_DATE - 10, CURRENT_DATE + 20,
     1000, 18, 45, 45, 90, 1180, '[]', NULL),
  (pg_temp.id('GNR'),  pg_temp.id('ORG_A'), 'CR-GNR', '2026-27', pg_temp.id('C1'), 'CR Client Intra', 'sent', CURRENT_DATE - 10, CURRENT_DATE + 20,
     1000, 0, 90, 90, 0, 1180, '[]', NULL),
  (pg_temp.id('GL'),   pg_temp.id('ORG_A'), 'CR-GL', '2026-27', pg_temp.id('C1'), 'CR Client Intra', 'sent', CURRENT_DATE - 10, CURRENT_DATE + 20,
     1000, 18, 90, 90, 0, 1180, '[]', NULL),
  (pg_temp.id('GD'),   pg_temp.id('ORG_A'), 'DRAFT/CR-GD', 'DRAFT', pg_temp.id('C1'), 'CR Client Intra', 'draft', CURRENT_DATE, NULL,
     1000, 18, 90, 90, 0, 1180, '[]', NULL),
  (pg_temp.id('PI'),   pg_temp.id('ORG_A'), 'CR-PI', '2026-27', pg_temp.id('C1'), 'CR Client Intra', 'sent', CURRENT_DATE - 10, CURRENT_DATE + 20,
     1000, 18, 90, 90, 0, 1180, '[]', '{"supply_type":"intra"}'),
  (pg_temp.id('PI2'),  pg_temp.id('ORG_A'), 'CR-PI2', '2026-27', pg_temp.id('C1'), 'CR Client Intra', 'sent', CURRENT_DATE - 10, CURRENT_DATE + 20,
     1000, 18, 90, 90, 0, 1180, '[]', '{"supply_type":"intra"}'),
  (pg_temp.id('AI'),   pg_temp.id('ORG_A'), 'CR-AI', '2026-27', pg_temp.id('C1'), 'CR Client Intra', 'sent', CURRENT_DATE - 10, CURRENT_DATE + 20,
     1000, 0, 0, 0, 0, 1000, '[]', NULL),
  (pg_temp.id('IB'),   pg_temp.id('ORG_B'), 'CR-IB', '2026-27', pg_temp.id('CB'), 'CR Client B', 'sent', CURRENT_DATE - 10, CURRENT_DATE + 20,
     1000, 18, 90, 90, 0, 1180, '[]', NULL);

-- A credit note issued before 20271103234500 with tax but no breakup.
SELECT set_config('pulse.invoice_payment_write', 'on', true);
INSERT INTO public.invoice_credit_notes (org_id, client_id, invoice_id, credit_number, credit_date, reason, amount, tax_amount, tax_treatment)
VALUES (pg_temp.id('ORG_A'), pg_temp.id('C1'), pg_temp.id('GL'), 'CN/CR-GL/01', CURRENT_DATE, 'Old credit', 118, 18, 'legacy');
SELECT set_config('pulse.invoice_payment_write', '', true);

-- Separation fixtures: one trip billed on SI; SI2 is billed separately.
INSERT INTO public.trips (id, organization_id, trip_number, pickup_area, drop_location, client_name, client_id, client_price)
VALUES (pg_temp.id('TR1'), pg_temp.id('ORG_A'), 'CR-TRIP-1', 'Chennai', 'Madurai', 'CR Client Intra', pg_temp.id('C1'), 1180);
INSERT INTO public.invoices (id, org_id, invoice_number, financial_year, client_id, client_name, status, invoice_date, due_date,
                             subtotal, gst_rate, cgst_amount, sgst_amount, igst_amount, total_amount, trip_ids) VALUES
  (pg_temp.id('SI'),  pg_temp.id('ORG_A'), 'CR-SI', '2026-27', pg_temp.id('C1'), 'CR Client Intra', 'sent', CURRENT_DATE - 5, CURRENT_DATE + 25,
     1000, 18, 90, 90, 0, 1180, ARRAY[pg_temp.id('TR1')]),
  (pg_temp.id('SI2'), pg_temp.id('ORG_A'), 'CR-SI2', '2026-27', pg_temp.id('C1'), 'CR Client Intra', 'sent', CURRENT_DATE - 5, CURRENT_DATE + 25,
     1000, 18, 90, 90, 0, 1180, '{}');

CREATE TEMP TABLE trip_before AS
  SELECT payment_status, amount_paid, client_price FROM public.trips WHERE id = pg_temp.id('TR1');
CREATE TEMP TABLE txn_before AS
  SELECT count(*) AS n, coalesce(sum(amount_in), 0) AS amount_in, coalesce(sum(amount_out), 0) AS amount_out
  FROM public.transactions WHERE organization_id = pg_temp.id('ORG_A');
GRANT SELECT ON trip_before, txn_before TO authenticated;

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_user('FIN');

-- ===========================================================================
-- 1. Credit-note GST
-- ===========================================================================
DO $$
DECLARE
  r jsonb;
  n record;
BEGIN
  -- intra: CGST + SGST at half the rate each
  r := public.issue_invoice_credit_note(pg_temp.id('ORG_A'), pg_temp.id('GI'), CURRENT_DATE, 'Rate correction', 'gst',
         '[{"description":"Rate correction","taxable_amount":100}]', 'cr-gi-000001');
  SELECT * INTO n FROM public.invoice_credit_notes WHERE id = (r->>'credit_note_id')::uuid;
  PERFORM pg_temp.check('intra GST credit: CGST 9 + SGST 9 on taxable 100',
    n.tax_treatment = 'gst' AND n.supply_type = 'intra' AND n.gst_rate = 18 AND n.taxable_amount = 100
    AND n.cgst_amount = 9 AND n.sgst_amount = 9 AND n.igst_amount = 0 AND n.tax_amount = 18 AND n.amount = 118, to_jsonb(n)::text);
  PERFORM pg_temp.check('intra GST credit reduces outstanding by the gross credit',
    (SELECT outstanding FROM pg_temp.summary('GI')) = 1062 AND (SELECT credited FROM pg_temp.summary('GI')) = 118);
  PERFORM pg_temp.check('issued invoice total and tax untouched',
    (SELECT total_amount = 1180 AND cgst_amount = 90 AND subtotal = 1000 FROM public.invoices WHERE id = pg_temp.id('GI')));

  r := public.issue_invoice_credit_note(pg_temp.id('ORG_A'), pg_temp.id('GI'), CURRENT_DATE, 'Rate correction', 'gst',
         '[{"description":"Rate correction","taxable_amount":100}]', 'cr-gi-000001');
  PERFORM pg_temp.check('duplicate submission replays the same credit note',
    (r->>'replayed')::boolean AND (SELECT count(*) FROM public.invoice_credit_notes WHERE invoice_id = pg_temp.id('GI')) = 1, r::text);

  -- inter: IGST at the full rate
  r := public.issue_invoice_credit_note(pg_temp.id('ORG_A'), pg_temp.id('GX'), CURRENT_DATE, 'Short delivery', 'gst',
         '[{"description":"Short delivery","taxable_amount":333.33,"igst_amount":60.00}]', 'cr-gx-000001');
  SELECT * INTO n FROM public.invoice_credit_notes WHERE id = (r->>'credit_note_id')::uuid;
  PERFORM pg_temp.check('inter GST credit: IGST 60.00 on 333.33 (half-up paise), matching caller figure accepted',
    n.supply_type = 'inter' AND n.igst_amount = 60.00 AND n.cgst_amount = 0 AND n.sgst_amount = 0 AND n.amount = 393.33, to_jsonb(n)::text);

  -- two lines: components split by cumulative rounding and sum to the header
  r := public.issue_invoice_credit_note(pg_temp.id('ORG_A'), pg_temp.id('GI'), CURRENT_DATE, 'Two lines', 'gst',
         '[{"description":"A","taxable_amount":50.05},{"description":"B","taxable_amount":49.95}]', 'cr-gi-000002');
  PERFORM pg_temp.check('line components sum to the header exactly',
    (SELECT sum(l.cgst_amount) = n2.cgst_amount AND sum(l.sgst_amount) = n2.sgst_amount AND sum(l.tax_amount) = n2.tax_amount
            AND sum(l.amount) = n2.amount AND n2.cgst_amount = 9 AND min(l.cgst_amount) = 4.50
     FROM public.invoice_credit_note_lines l
     JOIN public.invoice_credit_notes n2 ON n2.id = l.credit_note_id
     WHERE n2.id = (r->>'credit_note_id')::uuid
     GROUP BY n2.cgst_amount, n2.sgst_amount, n2.tax_amount, n2.amount));
END $$;

-- rounding: three partial credits then the closing credit takes exactly what is left
DO $$
DECLARE
  r jsonb;
BEGIN
  PERFORM public.issue_invoice_credit_note(pg_temp.id('ORG_A'), pg_temp.id('GR'), CURRENT_DATE, 'Part 1', 'gst', '[{"description":"p1","taxable_amount":33.33}]', 'cr-gr-000001');
  PERFORM public.issue_invoice_credit_note(pg_temp.id('ORG_A'), pg_temp.id('GR'), CURRENT_DATE, 'Part 2', 'gst', '[{"description":"p2","taxable_amount":33.33}]', 'cr-gr-000002');
  r := public.issue_invoice_credit_note(pg_temp.id('ORG_A'), pg_temp.id('GR'), CURRENT_DATE, 'Part 3', 'gst', '[{"description":"p3","taxable_amount":33.37}]', 'cr-gr-000003');
  PERFORM pg_temp.check('closing credit: taxable and every tax component equal the invoice exactly',
    (SELECT sum(taxable_amount) = 100.03 AND sum(cgst_amount) = 9.00 AND sum(sgst_amount) = 9.00 AND sum(amount) = 118.03
     FROM public.invoice_credit_notes WHERE invoice_id = pg_temp.id('GR')), r::text);
  PERFORM pg_temp.check('fully credited invoice: outstanding 0, status paid',
    (SELECT outstanding = 0 AND status = 'paid' FROM pg_temp.summary('GR')));
END $$;
SELECT pg_temp.expect_error('GST credit beyond the taxable value is refused',
  $q$SELECT public.issue_invoice_credit_note(pg_temp.id('ORG_A'), pg_temp.id('GR'), CURRENT_DATE, 'More', 'gst', '[{"description":"x","taxable_amount":0.01}]', 'cr-gr-000004')$q$,
  '%credit exceeds the invoice taxable value%');
SELECT pg_temp.expect_error('value credit beyond the invoice total is refused',
  $q$SELECT public.issue_invoice_credit_note(pg_temp.id('ORG_A'), pg_temp.id('GR'), CURRENT_DATE, 'More', 'no_gst', '[{"description":"x","amount":0.01}]', 'cr-gr-000005')$q$,
  '%credit exceeds remaining invoice value%');
SELECT pg_temp.expect_error('taxable ceiling: GI has 800 taxable left',
  $q$SELECT public.issue_invoice_credit_note(pg_temp.id('ORG_A'), pg_temp.id('GI'), CURRENT_DATE, 'Too much', 'gst', '[{"description":"x","taxable_amount":800.01}]', 'cr-gi-000003')$q$,
  '%credit exceeds the invoice taxable value%');
SELECT pg_temp.expect_error('mismatched CGST from the caller is refused',
  $q$SELECT public.issue_invoice_credit_note(pg_temp.id('ORG_A'), pg_temp.id('GI'), CURRENT_DATE, 'x', 'gst', '[{"description":"x","taxable_amount":100,"cgst_amount":9.01,"sgst_amount":9}]', 'cr-gi-000004')$q$,
  '%tax components do not match the invoice GST (line 1)%');
SELECT pg_temp.expect_error('IGST on an intra-state invoice is refused',
  $q$SELECT public.issue_invoice_credit_note(pg_temp.id('ORG_A'), pg_temp.id('GI'), CURRENT_DATE, 'x', 'gst', '[{"description":"x","taxable_amount":100,"igst_amount":18}]', 'cr-gi-000005')$q$,
  '%tax components do not match the invoice GST%');
SELECT pg_temp.expect_error('CGST on an inter-state invoice is refused',
  $q$SELECT public.issue_invoice_credit_note(pg_temp.id('ORG_A'), pg_temp.id('GX'), CURRENT_DATE, 'x', 'gst', '[{"description":"x","taxable_amount":100,"cgst_amount":9,"sgst_amount":9}]', 'cr-gx-000002')$q$,
  '%tax components do not match the invoice GST%');
SELECT pg_temp.expect_error('wrong total tax from the caller is refused',
  $q$SELECT public.issue_invoice_credit_note(pg_temp.id('ORG_A'), pg_temp.id('GI'), CURRENT_DATE, 'x', 'gst', '[{"description":"x","taxable_amount":10},{"description":"y","taxable_amount":10,"tax_amount":1.81}]', 'cr-gi-000006')$q$,
  '%tax components do not match the invoice GST (line 2)%');
SELECT pg_temp.expect_error('more than two decimals refused',
  $q$SELECT public.issue_invoice_credit_note(pg_temp.id('ORG_A'), pg_temp.id('GI'), CURRENT_DATE, 'x', 'gst', '[{"description":"x","taxable_amount":10.005}]', 'cr-gi-000007')$q$,
  '%at most two decimals%');
SELECT pg_temp.expect_error('GST credit line needs a taxable amount',
  $q$SELECT public.issue_invoice_credit_note(pg_temp.id('ORG_A'), pg_temp.id('GI'), CURRENT_DATE, 'x', 'gst', '[{"description":"x","amount":10}]', 'cr-gi-000008')$q$,
  '%GST credit lines take a taxable amount%');
SELECT pg_temp.expect_error('multi-rate invoice: GST credit refused',
  $q$SELECT public.issue_invoice_credit_note(pg_temp.id('ORG_A'), pg_temp.id('GM'), CURRENT_DATE, 'x', 'gst', '[{"description":"x","taxable_amount":10}]', 'cr-gm-000001')$q$,
  '%more than one GST rate%');
SELECT pg_temp.expect_error('invoice without GST: GST credit refused',
  $q$SELECT public.issue_invoice_credit_note(pg_temp.id('ORG_A'), pg_temp.id('GZ'), CURRENT_DATE, 'x', 'gst', '[{"description":"x","taxable_amount":10}]', 'cr-gz-000001')$q$,
  '%carries no GST%');
SELECT pg_temp.expect_error('IGST mixed with CGST/SGST refused',
  $q$SELECT public.issue_invoice_credit_note(pg_temp.id('ORG_A'), pg_temp.id('GMIX'), CURRENT_DATE, 'x', 'gst', '[{"description":"x","taxable_amount":10}]', 'cr-gmix-00001')$q$,
  '%mixes IGST%');
SELECT pg_temp.expect_error('missing invoice GST rate refused',
  $q$SELECT public.issue_invoice_credit_note(pg_temp.id('ORG_A'), pg_temp.id('GNR'), CURRENT_DATE, 'x', 'gst', '[{"description":"x","taxable_amount":10}]', 'cr-gnr-000001')$q$,
  '%GST rate is unavailable%');
SELECT pg_temp.expect_error('earlier credit without a breakup blocks a GST credit',
  $q$SELECT public.issue_invoice_credit_note(pg_temp.id('ORG_A'), pg_temp.id('GL'), CURRENT_DATE, 'x', 'gst', '[{"description":"x","taxable_amount":10}]', 'cr-gl-000001')$q$,
  '%earlier credit note without a GST breakup%');
SELECT pg_temp.expect_error('no_gst credit cannot carry tax',
  $q$SELECT public.issue_invoice_credit_note(pg_temp.id('ORG_A'), pg_temp.id('GM'), CURRENT_DATE, 'x', 'no_gst', '[{"description":"x","amount":10,"cgst_amount":1}]', 'cr-gm-000002')$q$,
  '%without GST cannot carry tax%');
SELECT pg_temp.expect_error('unknown tax treatment refused',
  $q$SELECT public.issue_invoice_credit_note(pg_temp.id('ORG_A'), pg_temp.id('GI'), CURRENT_DATE, 'x', 'inclusive', '[{"description":"x","amount":10}]', 'cr-gi-000009')$q$,
  '%with GST or without GST%');
SELECT pg_temp.expect_error('credit note on a draft refused',
  $q$SELECT public.issue_invoice_credit_note(pg_temp.id('ORG_A'), pg_temp.id('GD'), CURRENT_DATE, 'x', 'gst', '[{"description":"x","taxable_amount":10}]', 'cr-gd-000001')$q$,
  '%requires an issued invoice%');
SELECT pg_temp.expect_error('credit date before the invoice refused',
  $q$SELECT public.issue_invoice_credit_note(pg_temp.id('ORG_A'), pg_temp.id('GI'), CURRENT_DATE - 30, 'x', 'gst', '[{"description":"x","taxable_amount":10}]', 'cr-gi-000010')$q$,
  '%before the invoice date%');
SELECT pg_temp.expect_error('credit date in the future refused',
  $q$SELECT public.issue_invoice_credit_note(pg_temp.id('ORG_A'), pg_temp.id('GI'), CURRENT_DATE + 5, 'x', 'gst', '[{"description":"x","taxable_amount":10}]', 'cr-gi-000011')$q$,
  '%cannot be in the future%');
SELECT pg_temp.expect_error('another organization''s invoice is not found',
  $q$SELECT public.issue_invoice_credit_note(pg_temp.id('ORG_A'), pg_temp.id('IB'), CURRENT_DATE, 'x', 'gst', '[{"description":"x","taxable_amount":10}]', 'cr-ib-000001')$q$,
  '%invoice not found in this organization%');
SELECT pg_temp.expect_error('earlier signature cannot send tax',
  $q$SELECT public.issue_invoice_credit_note(pg_temp.id('ORG_A'), pg_temp.id('GM'), CURRENT_DATE, 'x', '[{"description":"x","amount":10,"tax_amount":1.8}]', 'cr-gm-000003')$q$,
  '%calculated from the invoice%');
DO $$
DECLARE
  r jsonb;
BEGIN
  r := public.issue_invoice_credit_note(pg_temp.id('ORG_A'), pg_temp.id('GM'), CURRENT_DATE, 'Goodwill', '[{"description":"Goodwill","amount":50}]', 'cr-gm-000004');
  PERFORM pg_temp.check('earlier signature still issues a value-only credit',
    r->>'tax_treatment' = 'no_gst' AND (r->>'amount')::numeric = 50 AND (r->>'tax_amount')::numeric = 0, r::text);
  r := public.issue_invoice_credit_note(pg_temp.id('ORG_A'), pg_temp.id('GZ'), CURRENT_DATE, 'Discount', 'no_gst', '[{"description":"Discount","amount":100}]', 'cr-gz-000002');
  PERFORM pg_temp.check('invoice without GST takes a value-only credit', (SELECT outstanding FROM pg_temp.summary('GZ')) = 400, r::text);
  PERFORM pg_temp.check('credit note register shows the breakup and lines with components',
    (SELECT tax_treatment = 'gst' AND supply_type = 'intra' AND cgst_amount = 9 AND taxable_amount = 100
            AND (lines->0->>'cgst_amount')::numeric = 9
     FROM public.invoice_credit_note_register(pg_temp.id('ORG_A'), pg_temp.id('C1'), 200, 0)
     WHERE credit_number = 'CN/CR-GI/01'));
  PERFORM pg_temp.check('every GST credit note in the org satisfies amount = taxable + CGST + SGST + IGST',
    NOT EXISTS (SELECT 1 FROM public.invoice_credit_notes
                WHERE org_id = pg_temp.id('ORG_A') AND tax_treatment = 'gst'
                  AND amount <> taxable_amount + cgst_amount + sgst_amount + igst_amount));
END $$;

SELECT pg_temp.as_user('CLERK');
SELECT pg_temp.expect_error('member without finance authority cannot issue',
  $q$SELECT public.issue_invoice_credit_note(pg_temp.id('ORG_A'), pg_temp.id('GI'), CURRENT_DATE, 'x', 'gst', '[{"description":"x","taxable_amount":10}]', 'cr-clerk-0001')$q$,
  '%not authorized%');
SELECT pg_temp.as_user('OUT');
SELECT pg_temp.expect_error('outsider cannot issue',
  $q$SELECT public.issue_invoice_credit_note(pg_temp.id('ORG_A'), pg_temp.id('GI'), CURRENT_DATE, 'x', 'gst', '[{"description":"x","taxable_amount":10}]', 'cr-out-00001')$q$,
  '%not authorized%');
SELECT pg_temp.expect_error('outsider cannot read the credit register',
  $q$SELECT * FROM public.invoice_credit_note_register(pg_temp.id('ORG_A'), NULL, 10, 0)$q$, '%not authorized%');
SELECT pg_temp.as_user('FIN');

SELECT pg_temp.expect_error('client role cannot update a credit note',
  $q$UPDATE public.invoice_credit_notes SET cgst_amount = 0 WHERE invoice_id = pg_temp.id('GI')$q$, '42501');
SELECT pg_temp.expect_error('client role cannot insert a credit note line',
  $q$INSERT INTO public.invoice_credit_note_lines (credit_note_id, org_id, description, amount) VALUES (pg_temp.note('CN/CR-GI/01'), pg_temp.id('ORG_A'), 'x', 1)$q$, '42501');

-- ===========================================================================
-- 2. Customer credit and refunds
-- ===========================================================================
DO $$
DECLARE
  r jsonb;
  v_cn uuid;
  v_refund uuid;
BEGIN
  PERFORM public.record_invoice_payment(pg_temp.id('ORG_A'), pg_temp.id('C1'), CURRENT_DATE, 1180, 'neft', 'CR-UTR-PI', NULL, NULL, NULL,
         'cr-pay-pi-01', jsonb_build_array(jsonb_build_object('invoice_id', pg_temp.id('PI'), 'amount', 1180)));
  PERFORM pg_temp.check('PI fully paid', (SELECT status FROM pg_temp.summary('PI')) = 'paid');

  r := public.issue_invoice_credit_note(pg_temp.id('ORG_A'), pg_temp.id('PI'), CURRENT_DATE, 'Damaged goods', 'gst',
         '[{"description":"Damaged goods","taxable_amount":100}]', 'cr-pi-cn-001');
  v_cn := (r->>'credit_note_id')::uuid;
  PERFORM pg_temp.check('credit on a paid invoice is allowed and becomes customer credit',
    (r->>'customer_credit')::numeric = 118
    AND (SELECT status = 'overpaid' AND outstanding = 0 AND customer_credit = 118 FROM pg_temp.summary('PI')), r::text);
  PERFORM pg_temp.check('allocations are untouched by the credit note',
    (SELECT sum(amount) FROM public.invoice_payment_allocations WHERE invoice_id = pg_temp.id('PI') AND status = 'confirmed') = 1180);
  PERFORM pg_temp.check('credit note is listed as refundable for 118', pg_temp.refundable('credit_note', v_cn) = 118);
  PERFORM pg_temp.check('a credit note does not create a refund by itself',
    NOT EXISTS (SELECT 1 FROM public.invoice_customer_refunds WHERE credit_note_id = v_cn));

  r := public.record_customer_refund(pg_temp.id('ORG_A'), 'credit_note', v_cn, CURRENT_DATE, 50, 'neft', 'CR-RFD-1', NULL, 'cr-rfd-000001');
  v_refund := (r->>'refund_id')::uuid;
  PERFORM pg_temp.check('partial refund numbered RFD/<FY>/<seq>, 68 left',
    (r->>'refund_number') ~ '^RFD/[0-9]{4}-[0-9]{2}/[0-9]{5}$' AND (r->>'refundable_after')::numeric = 68
    AND pg_temp.refundable('credit_note', v_cn) = 68, r::text);
  PERFORM pg_temp.check('summary: refunded 50, customer credit 68, outstanding 0',
    (SELECT refunded = 50 AND customer_credit = 68 AND outstanding = 0 FROM pg_temp.summary('PI')));

  r := public.record_customer_refund(pg_temp.id('ORG_A'), 'credit_note', v_cn, CURRENT_DATE, 50, 'neft', 'CR-RFD-1', NULL, 'cr-rfd-000001');
  PERFORM pg_temp.check('duplicate refund request replays, no second refund',
    (r->>'replayed')::boolean AND (SELECT count(*) FROM public.invoice_customer_refunds WHERE credit_note_id = v_cn) = 1, r::text);
  PERFORM pg_temp.check('ledger reconciles after a partial refund', pg_temp.ledger_reconciles('C1'));
END $$;

SELECT pg_temp.expect_error('refund above the refundable balance refused',
  $q$SELECT public.record_customer_refund(pg_temp.id('ORG_A'), 'credit_note', pg_temp.note('CN/CR-PI/01'), CURRENT_DATE, 68.01, 'neft', NULL, NULL, 'cr-rfd-000002')$q$,
  '%refund exceeds the refundable balance of 68.00%');

DO $$
DECLARE
  r jsonb;
  v_cn uuid := pg_temp.note('CN/CR-PI/01');
  v_first uuid;
  s record;
BEGIN
  r := public.record_customer_refund(pg_temp.id('ORG_A'), 'credit_note', v_cn, CURRENT_DATE, 68, 'upi', 'CR-RFD-2', 'Rest', 'cr-rfd-000003');
  PERFORM pg_temp.check('full refund of the remaining credit leaves nothing refundable',
    pg_temp.refundable('credit_note', v_cn) = 0
    AND (SELECT customer_credit = 0 AND refunded = 118 AND outstanding = 0 AND status = 'paid' FROM pg_temp.summary('PI')), r::text);

  SELECT id INTO v_first FROM public.invoice_customer_refunds WHERE idempotency_key = 'cr-rfd-000001';
  r := public.reverse_customer_refund(pg_temp.id('ORG_A'), v_first, 'Transfer bounced', 'cr-rfdrev-0001');
  PERFORM pg_temp.check('reversed refund: row kept, amount refundable again',
    r->>'status' = 'reversed'
    AND (SELECT status = 'reversed' AND reversal_reason = 'Transfer bounced' AND amount = 50 FROM public.invoice_customer_refunds WHERE id = v_first)
    AND pg_temp.refundable('credit_note', v_cn) = 50
    AND (SELECT refunded = 68 AND customer_credit = 50 FROM pg_temp.summary('PI')), r::text);
  r := public.reverse_customer_refund(pg_temp.id('ORG_A'), v_first, 'Transfer bounced', 'cr-rfdrev-0001');
  PERFORM pg_temp.check('refund reversal replays on the same key', (r->>'replayed')::boolean, r::text);

  PERFORM pg_temp.check('ledger: refund debits and the reversal credit are listed',
    (SELECT count(*) FILTER (WHERE entry_type = 'refund') = 2 AND count(*) FILTER (WHERE entry_type = 'refund_reversal') = 1
            AND sum(debit) FILTER (WHERE entry_type = 'refund') = 118
            AND sum(credit) FILTER (WHERE entry_type = 'refund_reversal') = 50
     FROM public.customer_ledger_entries(pg_temp.id('ORG_A'), pg_temp.id('C1'), NULL, NULL, 500, 0)));
  PERFORM pg_temp.check('ledger reconciles after refund and reversal', pg_temp.ledger_reconciles('C1'));
  PERFORM pg_temp.check('history lists refund events with their numbers',
    (SELECT count(*) FROM public.invoice_finance_history(pg_temp.id('ORG_A'), pg_temp.id('PI'))
     WHERE event_type IN ('refund_recorded', 'refund_reversed') AND reference LIKE 'RFD/%') = 3);
END $$;
SELECT pg_temp.expect_error('a reversed refund cannot be reversed again',
  $q$SELECT public.reverse_customer_refund(pg_temp.id('ORG_A'), (SELECT id FROM public.invoice_customer_refunds WHERE idempotency_key = 'cr-rfd-000001'), 'again', 'cr-rfdrev-0002')$q$,
  '%already reversed%');
SELECT pg_temp.expect_error('refund reversal needs a reason',
  $q$SELECT public.reverse_customer_refund(pg_temp.id('ORG_A'), (SELECT id FROM public.invoice_customer_refunds WHERE idempotency_key = 'cr-rfd-000003'), '  ', 'cr-rfdrev-0003')$q$,
  '%reversal reason is required%');

-- Refunds from an unapplied receipt (advance / overpayment)
DO $$
DECLARE
  r jsonb;
  v_adv uuid;
  v_tds uuid;
BEGIN
  PERFORM public.record_invoice_payment(pg_temp.id('ORG_A'), pg_temp.id('C1'), CURRENT_DATE, 500, 'bank', 'CR-UTR-ADV', NULL, NULL, NULL, 'cr-pay-adv-01', '[]');
  v_adv := pg_temp.pay('cr-pay-adv-01');
  PERFORM pg_temp.check('unapplied receipt is refundable', pg_temp.refundable('payment', v_adv) = 500);
  r := public.record_customer_refund(pg_temp.id('ORG_A'), 'payment', v_adv, CURRENT_DATE, 200, 'bank', 'CR-RFD-ADV', NULL, 'cr-rfd-adv-01');
  PERFORM pg_temp.check('receipt refund: 300 left to allocate or refund',
    pg_temp.refundable('payment', v_adv) = 300
    AND (SELECT unallocated = 300 AND refunded = 200 FROM public.invoice_payment_register(pg_temp.id('ORG_A'), pg_temp.id('C1'), NULL, NULL, 'CR-UTR-ADV', 10, 0)), r::text);
  PERFORM pg_temp.check('receipt document shows the refund and the reduced unapplied amount',
    (SELECT (d->>'unallocated')::numeric = 300 AND (d->>'refunded')::numeric = 200 AND jsonb_array_length(d->'refunds') = 1
     FROM public.invoice_payment_receipt(pg_temp.id('ORG_A'), v_adv) d));

  -- TDS is not cash: refundable is capped at the bank amount
  PERFORM public.record_customer_receipt(pg_temp.id('ORG_A'), pg_temp.id('C1'), CURRENT_DATE, 90, 10, 'neft', 'CR-UTR-TDS', NULL, NULL, NULL, 'cr-pay-tds-01', '[]');
  v_tds := pg_temp.pay('cr-pay-tds-01');
  PERFORM pg_temp.check('receipt with TDS: refundable is the bank amount, not the TDS', pg_temp.refundable('payment', v_tds) = 90);
  PERFORM pg_temp.check('ledger reconciles with an unapplied receipt and a receipt refund', pg_temp.ledger_reconciles('C1'));
END $$;
SELECT pg_temp.expect_error('allocation cannot use refunded receipt money',
  $q$SELECT public.allocate_invoice_payment(pg_temp.id('ORG_A'), pg_temp.pay('cr-pay-adv-01'), jsonb_build_array(jsonb_build_object('invoice_id', pg_temp.id('AI'), 'amount', 300.01)), 'cr-alloc-adv-01')$q$,
  '%allocation exceeds payment balance%');
DO $$
BEGIN
  PERFORM public.allocate_invoice_payment(pg_temp.id('ORG_A'), pg_temp.pay('cr-pay-adv-01'),
    jsonb_build_array(jsonb_build_object('invoice_id', pg_temp.id('AI'), 'amount', 300)), 'cr-alloc-adv-02');
  PERFORM pg_temp.check('remaining 300 allocates; nothing left to refund',
    pg_temp.refundable('payment', pg_temp.pay('cr-pay-adv-01')) = 0 AND (SELECT received FROM pg_temp.summary('AI')) = 300);
END $$;
SELECT pg_temp.expect_error('receipt with nothing unapplied cannot be refunded',
  $q$SELECT public.record_customer_refund(pg_temp.id('ORG_A'), 'payment', pg_temp.pay('cr-pay-adv-01'), CURRENT_DATE, 1, 'bank', NULL, NULL, 'cr-rfd-adv-02')$q$,
  '%nothing is refundable%');
SELECT pg_temp.expect_error('refund of TDS above the bank amount refused',
  $q$SELECT public.record_customer_refund(pg_temp.id('ORG_A'), 'payment', pg_temp.pay('cr-pay-tds-01'), CURRENT_DATE, 90.01, 'bank', NULL, NULL, 'cr-rfd-tds-01')$q$,
  '%refund exceeds the refundable balance%');
SELECT pg_temp.expect_error('receipt with recorded refunds cannot be reversed',
  $q$SELECT public.reverse_invoice_payment(pg_temp.id('ORG_A'), pg_temp.pay('cr-pay-adv-01'), 'Bounced', 'cr-rev-adv-001')$q$,
  '%reverse the refunds first%');
DO $$
BEGIN
  PERFORM public.reverse_customer_refund(pg_temp.id('ORG_A'), (SELECT id FROM public.invoice_customer_refunds WHERE idempotency_key = 'cr-rfd-adv-01'), 'Wrong account', 'cr-rfdrev-adv1');
  PERFORM public.reverse_invoice_payment(pg_temp.id('ORG_A'), pg_temp.pay('cr-pay-adv-01'), 'Bounced', 'cr-rev-adv-002');
  PERFORM pg_temp.check('after its refund is reversed the receipt reverses; its allocation is released',
    (SELECT status FROM public.invoice_payments WHERE id = pg_temp.pay('cr-pay-adv-01')) = 'reversed'
    AND (SELECT received FROM pg_temp.summary('AI')) = 0);
  PERFORM pg_temp.check('ledger reconciles after receipt reversal', pg_temp.ledger_reconciles('C1'));
END $$;
SELECT pg_temp.expect_error('reversed receipt cannot be refunded',
  $q$SELECT public.record_customer_refund(pg_temp.id('ORG_A'), 'payment', pg_temp.pay('cr-pay-adv-01'), CURRENT_DATE, 1, 'bank', NULL, NULL, 'cr-rfd-adv-03')$q$,
  '%reversed receipt cannot be refunded%');

-- A credit-note refund stays valid if the receipt behind it later bounces; the
-- customer then owes the invoice again (net of the credit note and refund).
DO $$
DECLARE
  r jsonb;
BEGIN
  PERFORM public.record_invoice_payment(pg_temp.id('ORG_A'), pg_temp.id('C1'), CURRENT_DATE, 1180, 'neft', 'CR-UTR-PI2', NULL, NULL, NULL,
         'cr-pay-pi2-01', jsonb_build_array(jsonb_build_object('invoice_id', pg_temp.id('PI2'), 'amount', 1180)));
  r := public.issue_invoice_credit_note(pg_temp.id('ORG_A'), pg_temp.id('PI2'), CURRENT_DATE, 'Overcharge', 'gst',
         '[{"description":"Overcharge","taxable_amount":100}]', 'cr-pi2-cn-01');
  PERFORM public.record_customer_refund(pg_temp.id('ORG_A'), 'credit_note', (r->>'credit_note_id')::uuid, CURRENT_DATE, 118, 'neft', 'CR-RFD-PI2', NULL, 'cr-rfd-pi2-01');
  PERFORM public.reverse_invoice_payment(pg_temp.id('ORG_A'), pg_temp.pay('cr-pay-pi2-01'), 'Cheque bounced', 'cr-rev-pi2-01');
  PERFORM pg_temp.check('bounced receipt after a credit-note refund: full 1180 owed again',
    (SELECT outstanding = 1180 AND status = 'unpaid' AND customer_credit = 0 FROM pg_temp.summary('PI2'))
    AND pg_temp.refundable('credit_note', (r->>'credit_note_id')::uuid) = 0);
  PERFORM pg_temp.check('ledger reconciles after the bounce', pg_temp.ledger_reconciles('C1'));
END $$;

SELECT pg_temp.expect_error('TDS-mode receipt cannot be refunded',
  $q$SELECT public.record_customer_refund(pg_temp.id('ORG_A'), 'payment', (SELECT (public.record_invoice_payment(pg_temp.id('ORG_A'), pg_temp.id('C1'), CURRENT_DATE, 40, 'tds', NULL, NULL, NULL, NULL, 'cr-pay-tdsm-01', '[]')->>'payment_id')::uuid), CURRENT_DATE, 1, 'bank', NULL, NULL, 'cr-rfd-tdsm-01')$q$,
  '%TDS is not cash%');
SELECT pg_temp.expect_error('refund amount with three decimals refused',
  $q$SELECT public.record_customer_refund(pg_temp.id('ORG_A'), 'payment', pg_temp.pay('cr-pay-tds-01'), CURRENT_DATE, 1.005, 'bank', NULL, NULL, 'cr-rfd-dec-01')$q$,
  '%at most two decimals%');
SELECT pg_temp.expect_error('refund mode is required',
  $q$SELECT public.record_customer_refund(pg_temp.id('ORG_A'), 'payment', pg_temp.pay('cr-pay-tds-01'), CURRENT_DATE, 1, 'barter', NULL, NULL, 'cr-rfd-mode-01')$q$,
  '%how the refund was paid%');
SELECT pg_temp.expect_error('refund date before the receipt refused',
  $q$SELECT public.record_customer_refund(pg_temp.id('ORG_A'), 'payment', pg_temp.pay('cr-pay-tds-01'), CURRENT_DATE - 3, 1, 'bank', NULL, NULL, 'cr-rfd-date-01')$q$,
  '%cannot be before the receipt or credit note date%');
SELECT pg_temp.expect_error('refund date in the future refused',
  $q$SELECT public.record_customer_refund(pg_temp.id('ORG_A'), 'payment', pg_temp.pay('cr-pay-tds-01'), CURRENT_DATE + 5, 1, 'bank', NULL, NULL, 'cr-rfd-date-02')$q$,
  '%cannot be in the future%');
SELECT pg_temp.expect_error('unknown refund source refused',
  $q$SELECT public.record_customer_refund(pg_temp.id('ORG_A'), 'invoice', pg_temp.id('PI'), CURRENT_DATE, 1, 'bank', NULL, NULL, 'cr-rfd-src-01')$q$,
  '%must be a receipt or a credit note%');
SELECT pg_temp.expect_error('refund idempotency key is required',
  $q$SELECT public.record_customer_refund(pg_temp.id('ORG_A'), 'payment', pg_temp.pay('cr-pay-tds-01'), CURRENT_DATE, 1, 'bank', NULL, NULL, 'short')$q$,
  '%idempotency key is required%');

SELECT pg_temp.as_user('CLERK');
SELECT pg_temp.expect_error('member without finance authority cannot refund',
  $q$SELECT public.record_customer_refund(pg_temp.id('ORG_A'), 'payment', pg_temp.pay('cr-pay-tds-01'), CURRENT_DATE, 1, 'bank', NULL, NULL, 'cr-rfd-clerk-1')$q$,
  '%not authorized%');
DO $$
BEGIN
  PERFORM pg_temp.check('member can read refunds and customer credit',
    (SELECT count(*) FROM public.invoice_refund_register(pg_temp.id('ORG_A'), NULL, NULL, NULL, 50, 0)) >= 4
    AND (SELECT customer_credit >= 0 FROM public.customer_credit_balance(pg_temp.id('ORG_A'), pg_temp.id('C1'))));
END $$;
SELECT pg_temp.as_user('OUT');
SELECT pg_temp.expect_error('outsider cannot refund another organization''s receipt',
  $q$SELECT public.record_customer_refund(pg_temp.id('ORG_A'), 'payment', pg_temp.pay('cr-pay-tds-01'), CURRENT_DATE, 1, 'bank', NULL, NULL, 'cr-rfd-out-01')$q$,
  '%not authorized%');
SELECT pg_temp.expect_error('source from another organization is not found',
  $q$SELECT public.record_customer_refund(pg_temp.id('ORG_B'), 'payment', pg_temp.pay('cr-pay-tds-01'), CURRENT_DATE, 1, 'bank', NULL, NULL, 'cr-rfd-out-02')$q$,
  '%receipt not found in this organization%');
SELECT pg_temp.expect_error('outsider cannot read refunds',
  $q$SELECT * FROM public.invoice_refund_register(pg_temp.id('ORG_A'), NULL, NULL, NULL, 10, 0)$q$, '%not authorized%');
SELECT pg_temp.expect_error('outsider cannot read customer credit',
  $q$SELECT * FROM public.customer_credit_balance(pg_temp.id('ORG_A'), pg_temp.id('C1'))$q$, '%not authorized%');
DO $$
BEGIN
  PERFORM pg_temp.check('RLS hides another organization''s refunds from a direct select',
    (SELECT count(*) FROM public.invoice_customer_refunds WHERE org_id = pg_temp.id('ORG_A')) = 0);
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true);
SET LOCAL ROLE anon;
SELECT pg_temp.expect_error('signed-out caller cannot refund',
  $q$SELECT public.record_customer_refund('f2000000-0000-4000-8000-00000000a001'::uuid, 'payment', 'f2000000-0000-4000-8000-00000000a001'::uuid, CURRENT_DATE, 1, 'bank', NULL, NULL, 'cr-rfd-anon-1')$q$,
  '42501');
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_user('FIN');

SELECT pg_temp.expect_error('client role cannot insert a refund',
  $q$INSERT INTO public.invoice_customer_refunds (org_id, client_id, refund_number, refund_date, amount, source_type, payment_id, refund_mode, idempotency_key, recorded_by) VALUES (pg_temp.id('ORG_A'), pg_temp.id('C1'), 'x', CURRENT_DATE, 1, 'payment', pg_temp.pay('cr-pay-tds-01'), 'bank', 'cr-direct-01', pg_temp.id('FIN'))$q$,
  '42501');
SELECT pg_temp.expect_error('client role cannot update a refund',
  $q$UPDATE public.invoice_customer_refunds SET amount = 1 WHERE org_id = pg_temp.id('ORG_A')$q$, '42501');
RESET ROLE;
-- Every RPC above opened the write window transaction-locally; close it to test the guard.
SELECT set_config('pulse.invoice_payment_write', '', true);
SELECT pg_temp.expect_error('refund rows cannot be changed outside a finance operation',
  $q$UPDATE public.invoice_customer_refunds SET notes = 'x' WHERE org_id = pg_temp.id('ORG_A')$q$, '%changed only by finance operations%');
SELECT set_config('pulse.invoice_payment_write', 'on', true);
SELECT pg_temp.expect_error('refund amount is immutable even inside the write window',
  $q$UPDATE public.invoice_customer_refunds SET amount = amount + 1 WHERE idempotency_key = 'cr-rfd-000003'$q$, '%refund is immutable%');
SELECT pg_temp.expect_error('a reversed refund cannot be reinstated',
  $q$UPDATE public.invoice_customer_refunds SET status = 'recorded', reversed_at = NULL, reversed_by = NULL, reversal_reason = NULL WHERE idempotency_key = 'cr-rfd-000001'$q$, '%refund is immutable%');
SELECT pg_temp.expect_error('refunds cannot be deleted',
  $q$DELETE FROM public.invoice_customer_refunds WHERE idempotency_key = 'cr-rfd-000003'$q$, '%refunds cannot be deleted%');
SELECT pg_temp.expect_error('GST components of an issued credit note are immutable',
  $q$UPDATE public.invoice_credit_notes SET cgst_amount = 0, sgst_amount = 0, tax_amount = 0 WHERE credit_number = 'CN/CR-GI/01'$q$, '%issued credit note is immutable%');
SELECT pg_temp.expect_error('credit note lines stay immutable',
  $q$UPDATE public.invoice_credit_note_lines SET cgst_amount = 0 WHERE org_id = pg_temp.id('ORG_A')$q$, '%credit note lines are immutable%');
SELECT set_config('pulse.invoice_payment_write', '', true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_user('FIN');

DO $$
BEGIN
  PERFORM pg_temp.check('collections stay receipts only; refunds are reported separately',
    (SELECT sum(settled_amount) FROM public.invoice_collections_summary(pg_temp.id('ORG_A'), CURRENT_DATE - 30, CURRENT_DATE + 1))
      = (SELECT sum(amount) FROM public.invoice_payments WHERE org_id = pg_temp.id('ORG_A') AND status = 'recorded')
    AND (SELECT count(*) FROM public.invoice_refund_register(pg_temp.id('ORG_A'), NULL, NULL, NULL, 50, 0) WHERE status = 'recorded') = 2);
  PERFORM pg_temp.check('customer credit balance splits unapplied receipts from credit-note credit',
    (SELECT unapplied_receipts = 100 AND credit_note_credit = 50 AND customer_credit = 150 AND refundable_now = 140
     FROM public.customer_credit_balance(pg_temp.id('ORG_A'), pg_temp.id('C1'))),
    (SELECT to_jsonb(b)::text FROM public.customer_credit_balance(pg_temp.id('ORG_A'), pg_temp.id('C1')) b));
  PERFORM pg_temp.check('ledger reconciles for the inter-state client too', pg_temp.ledger_reconciles('C2'));
END $$;

-- The listing is set-based; the refund RPC enforces invoice_refundable_amount. They must agree.
RESET ROLE;
DO $$
BEGIN
  PERFORM pg_temp.check('refundable listing equals the enforced amount for every receipt and credit note, none missing',
    NOT EXISTS (
      SELECT 1 FROM public.customer_refundable_sources(pg_temp.id('ORG_A'), pg_temp.id('C1')) s
      WHERE s.refundable <> public.invoice_refundable_amount(pg_temp.id('ORG_A'), s.source_type, s.source_id))
    AND NOT EXISTS (
      SELECT 1 FROM public.invoice_payments p
      WHERE p.org_id = pg_temp.id('ORG_A') AND p.client_id = pg_temp.id('C1')
        AND public.invoice_refundable_amount(pg_temp.id('ORG_A'), 'payment', p.id) > 0
        AND NOT EXISTS (SELECT 1 FROM public.customer_refundable_sources(pg_temp.id('ORG_A'), pg_temp.id('C1')) s WHERE s.source_id = p.id))
    AND NOT EXISTS (
      SELECT 1 FROM public.invoice_credit_notes c
      WHERE c.org_id = pg_temp.id('ORG_A') AND c.client_id = pg_temp.id('C1')
        AND public.invoice_refundable_amount(pg_temp.id('ORG_A'), 'credit_note', c.id) > 0
        AND NOT EXISTS (SELECT 1 FROM public.customer_refundable_sources(pg_temp.id('ORG_A'), pg_temp.id('C1')) s WHERE s.source_id = c.id)));
END $$;
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_user('FIN');

-- ===========================================================================
-- 3. Invoice payments and the trip ledger stay independent
-- ===========================================================================
DO $$
DECLARE
  r jsonb;
BEGIN
  r := public.record_customer_receipt(pg_temp.id('ORG_A'), pg_temp.id('C1'), CURRENT_DATE, 500, 0, 'neft', 'CR-UTR-SI-1', NULL, NULL, NULL,
         'cr-pay-si-01', jsonb_build_array(jsonb_build_object('invoice_id', pg_temp.id('SI'), 'amount', 500)));
  PERFORM pg_temp.check('separation 1: invoice payment makes the invoice partially paid',
    (SELECT status = 'partially_paid' AND outstanding = 680 FROM pg_temp.summary('SI')));
  PERFORM pg_temp.check('separation 2: issued invoice row unchanged (status, total)',
    (SELECT status = 'sent' AND total_amount = 1180 FROM public.invoices WHERE id = pg_temp.id('SI')));
  PERFORM public.record_customer_receipt(pg_temp.id('ORG_A'), pg_temp.id('C1'), CURRENT_DATE, 680, 0, 'neft', 'CR-UTR-SI-2', NULL, NULL, NULL,
         'cr-pay-si-02', jsonb_build_array(jsonb_build_object('invoice_id', pg_temp.id('SI'), 'amount', 680)));
  PERFORM pg_temp.check('separation 3: invoice paid from allocations', (SELECT status = 'paid' AND outstanding = 0 FROM pg_temp.summary('SI')));
  PERFORM pg_temp.check('separation 4: trip payment status and amount untouched by invoice payments',
    (SELECT t.payment_status = b.payment_status AND t.amount_paid = b.amount_paid
     FROM public.trips t, trip_before b WHERE t.id = pg_temp.id('TR1')));
  PERFORM pg_temp.check('separation 5: trip ledger untouched by every invoice-side write in this script',
    (SELECT count(*) = (SELECT n FROM txn_before)
            AND coalesce(sum(amount_in), 0) = (SELECT amount_in FROM txn_before)
            AND coalesce(sum(amount_out), 0) = (SELECT amount_out FROM txn_before)
     FROM public.transactions WHERE organization_id = pg_temp.id('ORG_A')));
END $$;

-- The trip ledger records trip money through its own path (as the finance screens do).
RESET ROLE;
INSERT INTO public.transactions (id, organization_id, party_name, description, amount_in, amount_out, transaction_date,
                                 contact_id, contact_type, ledger_category, payment_reference, trip_id)
VALUES (pg_temp.id('TX1'), pg_temp.id('ORG_A'), 'CR Client Intra', 'Customer receipt CR-UTR-TRIP · trip CR-TRIP-1', 1180, 0, CURRENT_DATE,
        pg_temp.id('C1'), 'client', 'customer_receipt', 'CR-UTR-TRIP', pg_temp.id('TR1'));
CREATE TEMP TABLE trip_after_ledger AS
  SELECT payment_status, amount_paid FROM public.trips WHERE id = pg_temp.id('TR1');
CREATE TEMP TABLE tx1_before AS
  SELECT amount_in, description, transaction_date, ledger_category FROM public.transactions WHERE id = pg_temp.id('TX1');
GRANT SELECT ON trip_after_ledger, tx1_before TO authenticated;
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_user('FIN');

DO $$
DECLARE
  r jsonb;
  v_pay uuid;
  v_collect_before numeric;
BEGIN
  PERFORM pg_temp.check('separation 6a: trip payment state follows the trip ledger (trigger), not invoices',
    (SELECT (a.payment_status, a.amount_paid) IS DISTINCT FROM (b.payment_status, b.amount_paid)
     FROM trip_after_ledger a, trip_before b),
    (SELECT to_jsonb(a)::text || ' vs ' || to_jsonb(b)::text FROM trip_after_ledger a, trip_before b));
  PERFORM pg_temp.check('separation 6: a trip-ledger receipt does not settle any invoice',
    (SELECT outstanding FROM pg_temp.summary('SI2')) = 1180 AND (SELECT received FROM pg_temp.summary('SI')) = 1180);
  SELECT coalesce(sum(settled_amount), 0) INTO v_collect_before
  FROM public.invoice_collections_summary(pg_temp.id('ORG_A'), CURRENT_DATE - 30, CURRENT_DATE + 1);

  r := public.link_trip_receipt_to_invoice_payment(pg_temp.id('ORG_A'), pg_temp.id('TX1'), pg_temp.id('C1'),
         jsonb_build_array(jsonb_build_object('invoice_id', pg_temp.id('SI2'), 'amount', 1180)), 'cr-link-tx1-01');
  v_pay := (r->>'payment_id')::uuid;
  PERFORM pg_temp.check('separation 7: link creates exactly one receipt and one allocation',
    (SELECT count(*) FROM public.invoice_payments WHERE source_transaction_id = pg_temp.id('TX1')) = 1
    AND (SELECT count(*) FROM public.invoice_payment_allocations WHERE payment_id = v_pay) = 1
    AND (SELECT status = 'paid' FROM pg_temp.summary('SI2')), r::text);
  PERFORM pg_temp.check('separation 8: linked receipt counted once in collections',
    (SELECT sum(settled_amount) FROM public.invoice_collections_summary(pg_temp.id('ORG_A'), CURRENT_DATE - 30, CURRENT_DATE + 1))
      = v_collect_before + 1180);
  r := public.link_trip_receipt_to_invoice_payment(pg_temp.id('ORG_A'), pg_temp.id('TX1'), pg_temp.id('C1'),
         jsonb_build_array(jsonb_build_object('invoice_id', pg_temp.id('SI2'), 'amount', 1180)), 'cr-link-tx1-01');
  PERFORM pg_temp.check('separation 9: retried link replays without a second receipt',
    (r->>'replayed')::boolean AND (SELECT count(*) FROM public.invoice_payments WHERE source_transaction_id = pg_temp.id('TX1')) = 1);
  PERFORM pg_temp.check('separation 10: link leaves the trip-ledger row and the trip unchanged',
    (SELECT t.amount_in = b.amount_in AND t.description = b.description AND t.transaction_date = b.transaction_date
            AND t.ledger_category = b.ledger_category
     FROM public.transactions t, tx1_before b WHERE t.id = pg_temp.id('TX1'))
    AND (SELECT t.payment_status = a.payment_status AND t.amount_paid = a.amount_paid
         FROM public.trips t, trip_after_ledger a WHERE t.id = pg_temp.id('TR1')));
END $$;
SELECT pg_temp.expect_error('separation 11: a linked trip receipt cannot be linked twice',
  $q$SELECT public.link_trip_receipt_to_invoice_payment(pg_temp.id('ORG_A'), pg_temp.id('TX1'), pg_temp.id('C1'), '[]', 'cr-link-tx1-02')$q$,
  '%already linked%');

DO $$
DECLARE
  v_pay uuid := (SELECT id FROM public.invoice_payments WHERE source_transaction_id = pg_temp.id('TX1'));
  r jsonb;
BEGIN
  PERFORM public.reverse_invoice_payment(pg_temp.id('ORG_A'), v_pay, 'Linked to the wrong invoice', 'cr-rev-link-01');
  PERFORM pg_temp.check('separation 12: reversing the linked receipt reopens only the invoice',
    (SELECT outstanding = 1180 FROM pg_temp.summary('SI2'))
    AND (SELECT status = 'reversed' FROM public.invoice_payment_allocations WHERE payment_id = v_pay)
    AND EXISTS (SELECT 1 FROM public.invoice_payment_events WHERE payment_id = v_pay AND event_type = 'reversed')
    AND EXISTS (SELECT 1 FROM public.invoice_payment_events WHERE payment_id = v_pay AND event_type = 'recorded'));
  PERFORM pg_temp.check('separation 13: trip and trip-ledger row still unchanged after the reversal',
    (SELECT t.amount_in = b.amount_in FROM public.transactions t, tx1_before b WHERE t.id = pg_temp.id('TX1'))
    AND (SELECT t.payment_status = a.payment_status AND t.amount_paid = a.amount_paid
         FROM public.trips t, trip_after_ledger a WHERE t.id = pg_temp.id('TR1')));
  PERFORM pg_temp.check('separation 14: reversed link frees the trip receipt for a correct link',
    EXISTS (SELECT 1 FROM public.trip_ledger_receipts_for_invoicing(pg_temp.id('ORG_A'), pg_temp.id('C1'), true, 50, 0)
            WHERE transaction_id = pg_temp.id('TX1')));
  r := public.link_trip_receipt_to_invoice_payment(pg_temp.id('ORG_A'), pg_temp.id('TX1'), pg_temp.id('C1'),
         jsonb_build_array(jsonb_build_object('invoice_id', pg_temp.id('SI2'), 'amount', 1180)), 'cr-link-tx1-03');
  PERFORM pg_temp.check('separation 15: re-link after reversal records one new active receipt',
    (SELECT count(*) FROM public.invoice_payments WHERE source_transaction_id = pg_temp.id('TX1') AND status = 'recorded') = 1
    AND (SELECT status = 'paid' FROM pg_temp.summary('SI2')));
  PERFORM pg_temp.check('separation 16: ledger reconciles at the end', pg_temp.ledger_reconciles('C1'));
END $$;

ROLLBACK;
