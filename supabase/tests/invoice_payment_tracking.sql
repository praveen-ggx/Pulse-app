-- Isolated invoice payment cases. Local database only.
-- The whole script rolls back, including the fixture rows.
--   psql "postgresql://postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f supabase/tests/invoice_payment_tracking.sql

BEGIN;

DO $$
DECLARE
  v_org uuid := 'a7100000-0000-4000-8000-0000000000a1';
  v_org_b uuid := 'a7100000-0000-4000-8000-0000000000b1';
  v_finance uuid := 'a7100000-0000-4000-8000-0000000000f1';
  v_clerk uuid := 'a7100000-0000-4000-8000-0000000000c1';
  v_outsider uuid := 'a7100000-0000-4000-8000-0000000000e1';
  v_client uuid := 'a7100000-0000-4000-8000-0000000000d1';
  v_full uuid := 'a7100000-0000-4000-8000-000000000011';
  v_partial uuid := 'a7100000-0000-4000-8000-000000000012';
  v_multi_a uuid := 'a7100000-0000-4000-8000-000000000013';
  v_multi_b uuid := 'a7100000-0000-4000-8000-000000000014';
  v_draft uuid := 'a7100000-0000-4000-8000-000000000015';
  v_other uuid := 'a7100000-0000-4000-8000-000000000016';
  v_result jsonb;
  v_payment uuid;
  v_second uuid;
  v_summary record;
  v_received numeric;
  v_events int;
  v_rows int;
  v_total numeric;
BEGIN
  INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
    (v_finance, 'invoice-pay-finance@test.local', '{}'::jsonb),
    (v_clerk, 'invoice-pay-clerk@test.local', '{}'::jsonb),
    (v_outsider, 'invoice-pay-outsider@test.local', '{}'::jsonb)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.organizations (id, name) VALUES
    (v_org, 'Invoice Payment Test'),
    (v_org_b, 'Invoice Payment Other Org')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.organization_members (organization_id, user_id, status, role) VALUES
    (v_org, v_finance, 'active', 'owner'),
    (v_org, v_clerk, 'active', 'member'),
    (v_org_b, v_outsider, 'active', 'owner')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.clients (id, organization_id, name, phone) VALUES
    (v_client, v_org, 'Payment Test Client', '9000000199')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.invoices (
    id, org_id, invoice_number, financial_year, client_id, client_name, total_amount, status
  ) VALUES
    (v_full, v_org, 'PAY-FULL', '2026-27', v_client, 'Payment Test Client', 1000, 'sent'),
    (v_partial, v_org, 'PAY-PART', '2026-27', v_client, 'Payment Test Client', 1000, 'sent'),
    (v_multi_a, v_org, 'PAY-A', '2026-27', v_client, 'Payment Test Client', 400, 'sent'),
    (v_multi_b, v_org, 'PAY-B', '2026-27', v_client, 'Payment Test Client', 600, 'sent'),
    (v_draft, v_org, 'PAY-DRAFT', '2026-27', v_client, 'Payment Test Client', 1000, 'draft'),
    (v_other, v_org_b, 'PAY-OTHER', '2026-27', NULL, 'Elsewhere', 1000, 'sent')
  ON CONFLICT (id) DO NOTHING;

  PERFORM set_config('request.jwt.claim.sub', v_finance::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_finance)::text, true);

  -- Full payment.
  v_result := public.record_invoice_payment(
    v_org, v_client, CURRENT_DATE, 1000, 'neft', 'UTR-FULL', NULL, 'HDFC', NULL,
    'idem-full-01', jsonb_build_array(jsonb_build_object('invoice_id', v_full, 'amount', 1000))
  );
  SELECT * INTO v_summary FROM public.invoice_payment_summaries(v_org, ARRAY[v_full]);
  IF v_summary.payment_status <> 'paid'
     OR v_summary.amount_received <> 1000
     OR v_summary.amount_outstanding <> 0
     OR v_summary.invoice_total <> 1000 THEN
    RAISE EXCEPTION 'FAIL full payment summary %', to_jsonb(v_summary);
  END IF;
  SELECT total_amount INTO v_total FROM public.invoices WHERE id = v_full;
  IF v_total <> 1000 THEN
    RAISE EXCEPTION 'FAIL issued total changed';
  END IF;
  RAISE NOTICE 'PASS: full payment';

  -- Idempotent replay does not double the receipt.
  v_result := public.record_invoice_payment(
    v_org, v_client, CURRENT_DATE, 1000, 'neft', 'UTR-FULL', NULL, 'HDFC', NULL,
    'idem-full-01', jsonb_build_array(jsonb_build_object('invoice_id', v_full, 'amount', 1000))
  );
  IF (v_result->>'replayed')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'FAIL replay did not return the original payment';
  END IF;
  SELECT amount_received INTO v_received FROM public.invoice_payment_summaries(v_org, ARRAY[v_full]);
  IF v_received <> 1000 THEN
    RAISE EXCEPTION 'FAIL replay doubled the receipt';
  END IF;
  RAISE NOTICE 'PASS: idempotent replay';

  -- Partial, then a second payment.
  v_result := public.record_invoice_payment(
    v_org, v_client, CURRENT_DATE, 400, 'upi', 'UTR-PART-1', NULL, NULL, NULL,
    'idem-part-01', jsonb_build_array(jsonb_build_object('invoice_id', v_partial, 'amount', 400))
  );
  SELECT * INTO v_summary FROM public.invoice_payment_summaries(v_org, ARRAY[v_partial]);
  IF v_summary.payment_status <> 'partially_paid' OR v_summary.amount_outstanding <> 600 THEN
    RAISE EXCEPTION 'FAIL partial summary %', to_jsonb(v_summary);
  END IF;
  PERFORM public.record_invoice_payment(
    v_org, v_client, CURRENT_DATE, 600, 'upi', 'UTR-PART-2', NULL, NULL, NULL,
    'idem-part-02', jsonb_build_array(jsonb_build_object('invoice_id', v_partial, 'amount', 600))
  );
  SELECT payment_status, amount_received INTO v_summary
  FROM public.invoice_payment_summaries(v_org, ARRAY[v_partial]);
  IF v_summary.payment_status <> 'paid' OR v_summary.amount_received <> 1000 THEN
    RAISE EXCEPTION 'FAIL multiple payments %', to_jsonb(v_summary);
  END IF;
  RAISE NOTICE 'PASS: partial and multiple payments';

  -- One payment across two invoices, with an unallocated remainder.
  v_result := public.record_invoice_payment(
    v_org, v_client, CURRENT_DATE, 1000, 'bank', 'UTR-SPLIT', NULL, NULL, NULL,
    'idem-split-01',
    jsonb_build_array(
      jsonb_build_object('invoice_id', v_multi_a, 'amount', 250),
      jsonb_build_object('invoice_id', v_multi_b, 'amount', 250)
    )
  );
  IF (v_result->>'unallocated')::numeric <> 500 THEN
    RAISE EXCEPTION 'FAIL unallocated remainder %', v_result;
  END IF;
  v_payment := (v_result->>'payment_id')::uuid;
  v_result := public.allocate_invoice_payment(
    v_org, v_payment,
    jsonb_build_array(jsonb_build_object('invoice_id', v_multi_a, 'amount', 150)),
    'idem-alloc-01'
  );
  SELECT amount_received INTO v_received FROM public.invoice_payment_summaries(v_org, ARRAY[v_multi_a]);
  IF v_received <> 400 THEN
    RAISE EXCEPTION 'FAIL second allocation %', v_received;
  END IF;
  RAISE NOTICE 'PASS: multi-invoice allocation and unallocated remainder';

  -- Duplicate reference.
  BEGIN
    PERFORM public.record_invoice_payment(
      v_org, v_client, CURRENT_DATE, 10, 'cash', 'UTR-SPLIT', NULL, NULL, NULL,
      'idem-dup-01', '[]'::jsonb
    );
    RAISE EXCEPTION 'FAIL duplicate reference was accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%duplicate transaction reference%' THEN
      RAISE;
    END IF;
  END;
  RAISE NOTICE 'PASS: duplicate reference';

  -- Over-allocation against the invoice.
  BEGIN
    PERFORM public.record_invoice_payment(
      v_org, v_client, CURRENT_DATE, 50, 'cash', 'UTR-OVER', NULL, NULL, NULL,
      'idem-over-01', jsonb_build_array(jsonb_build_object('invoice_id', v_multi_a, 'amount', 50))
    );
    RAISE EXCEPTION 'FAIL over-allocation was accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%allocation exceeds invoice balance%' THEN
      RAISE;
    END IF;
  END;
  RAISE NOTICE 'PASS: over-allocation';

  -- Draft invoice.
  BEGIN
    PERFORM public.record_invoice_payment(
      v_org, v_client, CURRENT_DATE, 10, 'cash', 'UTR-DRAFT', NULL, NULL, NULL,
      'idem-draft-01', jsonb_build_array(jsonb_build_object('invoice_id', v_draft, 'amount', 10))
    );
    RAISE EXCEPTION 'FAIL draft payment was accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%draft invoice cannot receive a payment%' THEN
      RAISE;
    END IF;
  END;
  RAISE NOTICE 'PASS: draft invoice rejected';

  -- Cross-organization invoice.
  BEGIN
    PERFORM public.record_invoice_payment(
      v_org, v_client, CURRENT_DATE, 10, 'cash', 'UTR-XORG', NULL, NULL, NULL,
      'idem-xorg-01', jsonb_build_array(jsonb_build_object('invoice_id', v_other, 'amount', 10))
    );
    RAISE EXCEPTION 'FAIL cross-org allocation was accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%invoice not found in this organization%' THEN
      RAISE;
    END IF;
  END;
  RAISE NOTICE 'PASS: cross-organization allocation rejected';

  -- Unauthorized member.
  PERFORM set_config('request.jwt.claim.sub', v_clerk::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_clerk)::text, true);
  BEGIN
    PERFORM public.record_invoice_payment(
      v_org, v_client, CURRENT_DATE, 10, 'cash', NULL, NULL, NULL, NULL,
      'idem-clerk-01', '[]'::jsonb
    );
    RAISE EXCEPTION 'FAIL clerk payment was accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%not authorized%' THEN
      RAISE;
    END IF;
  END;
  RAISE NOTICE 'PASS: unauthorized caller';

  -- Outsider cannot read the other organization's balances.
  PERFORM set_config('request.jwt.claim.sub', v_outsider::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_outsider)::text, true);
  BEGIN
    SELECT count(*) INTO v_rows FROM public.invoice_payment_summaries(v_org, ARRAY[v_full]);
    RAISE EXCEPTION 'FAIL outsider read another org';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%not authorized%' THEN
      RAISE;
    END IF;
  END;
  RAISE NOTICE 'PASS: cross-organization read rejected';

  -- Reversal keeps the rows and restores the outstanding balance.
  PERFORM set_config('request.jwt.claim.sub', v_finance::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_finance)::text, true);
  SELECT id INTO v_second FROM public.invoice_payments
  WHERE org_id = v_org AND idempotency_key = 'idem-part-01';
  PERFORM public.reverse_invoice_payment(v_org, v_second, 'bank returned', 'idem-reverse-01');
  SELECT * INTO v_summary FROM public.invoice_payment_summaries(v_org, ARRAY[v_partial]);
  IF v_summary.amount_received <> 600 OR v_summary.amount_outstanding <> 400 THEN
    RAISE EXCEPTION 'FAIL reversal balance %', to_jsonb(v_summary);
  END IF;
  SELECT count(*) INTO v_rows FROM public.invoice_payments WHERE id = v_second AND status = 'reversed';
  SELECT count(*) INTO v_events FROM public.invoice_payment_events
  WHERE payment_id = v_second AND event_type IN ('recorded', 'reversed');
  IF v_rows <> 1 OR v_events <> 2 THEN
    RAISE EXCEPTION 'FAIL reversal audit rows payment % events %', v_rows, v_events;
  END IF;
  IF (SELECT total_amount FROM public.invoices WHERE id = v_partial) <> 1000 THEN
    RAISE EXCEPTION 'FAIL reversal changed the issued total';
  END IF;
  RAISE NOTICE 'PASS: reversal and reconciliation';
END $$;

ROLLBACK;
