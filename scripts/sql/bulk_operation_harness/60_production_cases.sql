-- Production-compatibility cases. Failures raise.

DO $$
DECLARE
  v_src text;
  v_owner oid;
  v_cfg text[];
  v_def boolean;
  v_name text;
BEGIN
  FOREACH v_name IN ARRAY ARRAY[
    'mark_trip_finance_verified',
    'tg_transactions_link_payment_request',
    'issue_payment_request',
    'compliance_advance_calculation'
  ] LOOP
    SELECT md5(p.prosrc), p.proowner
      INTO v_src, v_owner
      FROM pg_proc p
     WHERE p.proname = v_name
       AND (v_name <> 'mark_trip_finance_verified' OR p.pronargs = 4);
    IF v_src IS DISTINCT FROM (SELECT src FROM public.function_fingerprint WHERE name = v_name)
       OR v_owner IS DISTINCT FROM (SELECT owner FROM public.function_fingerprint WHERE name = v_name) THEN
      RAISE EXCEPTION 'posting function % changed when the bulk migration was applied', v_name;
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM pg_proc
     WHERE proname IN (
       'mark_trip_finance_verified', 'issue_payment_request',
       'tg_transactions_link_payment_request', 'compliance_advance_calculation'
     )
       AND prosrc ILIKE '%bulk_operation%'
  ) THEN
    RAISE EXCEPTION 'a posting function now references the bulk engine';
  END IF;

  IF (SELECT pg_get_triggerdef(oid) FROM pg_trigger
       WHERE tgname = 'trg_transactions_link_payment_request' AND NOT tgisinternal) NOT ILIKE '%INSERT%'
     OR (SELECT pg_get_triggerdef(oid) FROM pg_trigger
       WHERE tgname = 'trg_transactions_link_payment_request' AND NOT tgisinternal) ILIKE '%UPDATE%' THEN
    RAISE EXCEPTION 'payment link trigger is no longer insert-or-delete only';
  END IF;

  FOREACH v_name IN ARRAY ARRAY[
    'bulk_payment_field_submit',
    'bulk_payment_field_apply_next',
    'bulk_payment_field_correct'
  ] LOOP
    SELECT prosecdef, proconfig, proowner
      INTO v_def, v_cfg, v_owner
      FROM pg_proc
     WHERE proname = v_name;
    IF NOT v_def THEN
      RAISE EXCEPTION '% is not security definer', v_name;
    END IF;
    IF v_owner IS DISTINCT FROM (SELECT owner FROM public.function_fingerprint WHERE name = 'mark_trip_finance_verified') THEN
      RAISE EXCEPTION '% is not owned by the migration role', v_name;
    END IF;
    IF v_cfg IS NULL OR NOT EXISTS (
      SELECT 1 FROM unnest(v_cfg) c WHERE c LIKE 'search_path=pg_catalog, public%'
    ) THEN
      RAISE EXCEPTION '% search_path is not fixed to pg_catalog, public', v_name;
    END IF;
  END LOOP;

  IF NOT has_function_privilege('authenticated', 'public.bulk_payment_field_submit(uuid,text,text,text,jsonb,jsonb,jsonb)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.bulk_payment_field_apply_next(uuid)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.bulk_payment_field_correct(uuid,uuid,text,text,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated lost execute on the payment RPCs';
  END IF;
  IF has_function_privilege('anon', 'public.bulk_payment_field_submit(uuid,text,text,text,jsonb,jsonb,jsonb)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.bulk_payment_commit_row(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.bulk_payment_field_update_allowed(uuid,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.bulk_payment_read_locked(uuid)', 'EXECUTE')
     OR (SELECT proacl::text FROM pg_proc WHERE proname = 'bulk_sha256') LIKE '{=%' THEN
    RAISE EXCEPTION 'a helper or the submit RPC is executable by the wrong role';
  END IF;
  IF has_table_privilege('authenticated', 'public.bulk_operation_batches', 'INSERT')
     OR has_table_privilege('authenticated', 'public.bulk_operation_batches', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.bulk_operation_events', 'INSERT')
     OR has_table_privilege('anon', 'public.bulk_operation_rows', 'SELECT') THEN
    RAISE EXCEPTION 'PostgREST roles can write the audit tables or anon can read them';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.bulk_prod_as_manage(p_sql text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  EXECUTE p_sql;
  EXECUTE 'RESET ROLE';
END;
$$;

DO $$
DECLARE
  v_quote jsonb;
  v_id uuid;
  v_paid numeric;
  v_status text;
  v_formula text;
  v_trip uuid;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);

  SET LOCAL ROLE authenticated;
  BEGIN
    INSERT INTO public.transactions (
      organization_id, trip_id, ledger_category, amount_out, transaction_date, contact_type, created_by
    ) VALUES (
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      '55555555-5555-5555-5555-555555555555',
      'compliance_advance', 1000, '2026-09-01', 'supplier',
      '11111111-1111-1111-1111-111111111111'
    );
    RAISE EXCEPTION 'unapproved advance insert was accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT ILIKE '%compliance_advance_requires_finance_verified%'
       AND SQLERRM NOT ILIKE '%unapproved advance insert was accepted%' THEN
      RAISE;
    END IF;
    IF SQLERRM ILIKE '%unapproved advance insert was accepted%' THEN
      RAISE;
    END IF;
  END;
  RESET ROLE;

  INSERT INTO public.trips (
    id, organization_id, supplier_id, supplier_rate, supplier_rate_basis,
    operating_mode, compliance_verified_at, finance_verified_at
  ) VALUES (
    'bcbcbcbc-bcbc-bcbc-bcbc-bcbcbcbcbcbc',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '12121212-1212-1212-1212-121212121212',
    10000, 'per_trip', 'FLEET', now(), now()
  );
  SET LOCAL ROLE authenticated;
  BEGIN
    INSERT INTO public.transactions (
      organization_id, trip_id, ledger_category, amount_out, transaction_date, contact_type, created_by
    ) VALUES (
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      'bcbcbcbc-bcbc-bcbc-bcbc-bcbcbcbcbcbc',
      'compliance_advance', 1000, '2026-09-01', 'supplier',
      '11111111-1111-1111-1111-111111111111'
    );
    RAISE EXCEPTION 'advance without a payment request was accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT ILIKE '%advance cannot be paid before it is approved%' THEN
      RAISE;
    END IF;
  END;
  RESET ROLE;

  SET LOCAL ROLE authenticated;
  v_quote := public.mark_trip_finance_verified(
    '55555555-5555-5555-5555-555555555555', 'approve-main', 10, 1
  );
  RESET ROLE;
  IF (v_quote->>'payable')::numeric IS DISTINCT FROM 1000
     OR (v_quote->>'formula_version') IS DISTINCT FROM '1' THEN
    RAISE EXCEPTION 'advance approval payable changed: %', v_quote;
  END IF;

  SET LOCAL ROLE authenticated;
  INSERT INTO public.transactions (
    organization_id, trip_id, ledger_category, description, payment_reference,
    transaction_date, amount_out, amount_in, contact_type, contact_id,
    ledger_flow_type, created_by
  ) VALUES (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '55555555-5555-5555-5555-555555555555',
    'compliance_advance',
    'Advance | Mode: UPI | UTR: OLD123456 | Request ID: REQ-1001',
    'OLD123456',
    '2026-09-01', 1000, 0, 'supplier',
    '12121212-1212-1212-1212-121212121212',
    'expense',
    '11111111-1111-1111-1111-111111111111'
  )
  RETURNING id INTO v_id;
  RESET ROLE;
  INSERT INTO public.bulk_prod_ids (k, v) VALUES ('advance', v_id::text);

  SELECT approved_amount, status, terms_snapshot->>'formula_version'
    INTO v_paid, v_status, v_formula
    FROM public.payment_requests
   WHERE trip_id = '55555555-5555-5555-5555-555555555555'
     AND payment_type = 'advance';
  IF v_paid IS DISTINCT FROM 1000 OR v_status IS DISTINCT FROM 'paid' OR v_formula IS DISTINCT FROM '1' THEN
    RAISE EXCEPTION 'posted advance did not settle the approved request (% % %)', v_paid, v_status, v_formula;
  END IF;

  SET LOCAL ROLE authenticated;
  BEGIN
    INSERT INTO public.transactions (
      organization_id, trip_id, ledger_category, amount_out, transaction_date, contact_type, created_by
    ) VALUES (
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      '55555555-5555-5555-5555-555555555555',
      'compliance_advance', 1000, '2026-09-01', 'supplier',
      '11111111-1111-1111-1111-111111111111'
    );
    RAISE EXCEPTION 'second advance insert was accepted';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;
  RESET ROLE;

  INSERT INTO public.trips (
    id, organization_id, supplier_id, supplier_rate, supplier_rate_basis,
    operating_mode, compliance_verified_at
  ) VALUES (
    'abababab-abab-abab-abab-abababababab',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '12121212-1212-1212-1212-121212121212',
    10000, 'per_trip', 'FLEET', now()
  );
  SET LOCAL ROLE authenticated;
  PERFORM public.mark_trip_finance_verified(
    'abababab-abab-abab-abab-abababababab', 'wrong-amount', 10, 1
  );
  BEGIN
    INSERT INTO public.transactions (
      organization_id, trip_id, ledger_category, amount_out, transaction_date, contact_type, created_by
    ) VALUES (
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      'abababab-abab-abab-abab-abababababab',
      'compliance_advance', 500, '2026-09-01', 'supplier',
      '11111111-1111-1111-1111-111111111111'
    );
    RAISE EXCEPTION 'wrong advance amount was accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT ILIKE '%payment amount must equal the approved advance%' THEN
      RAISE;
    END IF;
  END;
  RESET ROLE;

  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.mark_trip_finance_verified(
      '88888888-8888-8888-8888-888888888888', 'approve-gate', 10, 1
    );
  END;
  INSERT INTO public.transactions (
    organization_id, trip_id, ledger_category, description, payment_reference,
    transaction_date, amount_out, contact_type, contact_id, ledger_flow_type, created_by
  ) VALUES (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '88888888-8888-8888-8888-888888888888',
    'compliance_advance',
    'Advance | Mode: UPI | UTR: GATE123456 | Request ID: REQ-1001',
    'GATE123456', '2026-09-01', 1000, 'supplier',
    '12121212-1212-1212-1212-121212121212', 'expense',
    '11111111-1111-1111-1111-111111111111'
  )
  RETURNING id INTO v_id;
  RESET ROLE;
  INSERT INTO public.bulk_prod_ids (k, v) VALUES ('advance_gate', v_id::text);

  SET LOCAL ROLE authenticated;
  INSERT INTO public.transactions (
    organization_id, trip_id, ledger_category, description, payment_reference,
    transaction_date, amount_out, contact_type, contact_id, ledger_flow_type, created_by
  ) VALUES (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '66666666-6666-6666-6666-666666666666',
    'compliance_balance',
    'Balance | Mode: NEFT | UTR: BAL123456 | Request ID: REQ-3003',
    'BAL123456', '2026-09-02', 800, 'supplier',
    '12121212-1212-1212-1212-121212121212', 'expense',
    '11111111-1111-1111-1111-111111111111'
  )
  RETURNING id INTO v_id;
  RESET ROLE;
  INSERT INTO public.bulk_prod_ids (k, v) VALUES ('balance', v_id::text);
  IF (SELECT status FROM public.payment_requests
       WHERE trip_id = '66666666-6666-6666-6666-666666666666' AND payment_type = 'balance')
     IS DISTINCT FROM 'paid' THEN
    RAISE EXCEPTION 'balance posting did not issue and settle a request';
  END IF;

  SET LOCAL ROLE authenticated;
  INSERT INTO public.transactions (
    organization_id, trip_id, ledger_category, description, payment_reference,
    transaction_date, amount_out, contact_type, contact_id, ledger_flow_type, created_by
  ) VALUES (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '99999999-9999-9999-9999-999999999999',
    'compliance_balance',
    'Balance | Mode: NEFT | UTR: POD123456 | Request ID: REQ-3003',
    'POD123456', '2026-09-02', 800, 'supplier',
    '12121212-1212-1212-1212-121212121212', 'expense',
    '11111111-1111-1111-1111-111111111111'
  )
  RETURNING id INTO v_id;
  RESET ROLE;
  INSERT INTO public.bulk_prod_ids (k, v) VALUES ('balance_gate', v_id::text);

  FOREACH v_trip IN ARRAY ARRAY[
    'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid,
    'dddddddd-dddd-dddd-dddd-dddddddddddd'::uuid
  ] LOOP
    SET LOCAL ROLE authenticated;
    PERFORM public.mark_trip_finance_verified(v_trip, v_trip::text, 10, 1);
    INSERT INTO public.transactions (
      organization_id, trip_id, ledger_category, description, payment_reference,
      transaction_date, amount_out, contact_type, contact_id, ledger_flow_type, created_by
    ) VALUES (
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', v_trip, 'compliance_advance',
      'Advance | Mode: UPI | UTR: OLD123456 | Request ID: REQ-1001',
      'OLD123456', '2026-09-01', 1000, 'supplier',
      '12121212-1212-1212-1212-121212121212', 'expense',
      '11111111-1111-1111-1111-111111111111'
    )
    RETURNING id INTO v_id;
    RESET ROLE;
    INSERT INTO public.bulk_prod_ids (k, v)
    VALUES (CASE WHEN v_trip = 'cccccccc-cccc-cccc-cccc-cccccccccccc' THEN 'crash' ELSE 'race' END, v_id::text);
  END LOOP;
END;
$$;

UPDATE public.transactions
   SET paid_from_account_id = '14141414-1414-1414-1414-141414141414'
 WHERE id = (SELECT ids.v::uuid FROM public.bulk_prod_ids ids WHERE ids.k = 'advance');

DO $$
DECLARE
  v jsonb;
  v_row public.transactions%ROWTYPE;
  v_before jsonb;
  v_event jsonb;
  v_batch uuid;
  v_applied uuid;
  v_n integer;
BEGIN
  UPDATE public.trips SET compliance_verified_at = NULL
   WHERE id = '88888888-8888-8888-8888-888888888888';
  UPDATE public.trips SET pod_received_at = NULL
   WHERE id = '99999999-9999-9999-9999-999999999999';

  PERFORM set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  SET LOCAL ROLE authenticated;
  UPDATE public.transactions SET payment_reference = 'DIRECT123'
   WHERE id = (SELECT ids.v::uuid FROM public.bulk_prod_ids ids WHERE ids.k = 'advance_gate');
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'direct advance edit bypassed the verified-trip policy';
  END IF;
  UPDATE public.transactions SET payment_reference = 'DIRECT123'
   WHERE id = (SELECT ids.v::uuid FROM public.bulk_prod_ids ids WHERE ids.k = 'balance_gate');
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'direct balance edit bypassed the POD policy';
  END IF;
  RESET ROLE;

  PERFORM set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
  SET LOCAL ROLE authenticated;
  UPDATE public.transactions SET payment_reference = 'VIEW12345'
   WHERE id = (SELECT ids.v::uuid FROM public.bulk_prod_ids ids WHERE ids.k = 'advance');
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'view user updated a compliance payment';
  END IF;
  BEGIN
    PERFORM public.bulk_payment_field_submit(
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'compliance_advance', 'view.csv', 'view',
      '{}'::jsonb, '["utr"]'::jsonb,
      jsonb_build_array(jsonb_build_object(
        'rowIndex', 2,
        'recordId', (SELECT ids.v FROM public.bulk_prod_ids ids WHERE ids.k = 'advance'),
        'proposed', jsonb_build_object('utr', 'VIEW12345')
      ))
    );
    RAISE EXCEPTION 'view user submitted a batch';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  BEGIN
    INSERT INTO public.bulk_operation_batches (
      organization_id, adapter_id, template_id, template_version, operation, status,
      idempotency_key, file_name, file_sha256, file_bytes,
      uploaded_by, confirmed_by, execution_owner, review_surface, execute_surface
    ) VALUES (
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'compliance-payment-field-update',
      'compliance-payment-field-update', '1', 'field_update', 'executing',
      repeat('b', 64), 'x.csv', repeat('a', 64), 1,
      '22222222-2222-2222-2222-222222222222',
      '22222222-2222-2222-2222-222222222222',
      '22222222-2222-2222-2222-222222222222',
      'trip_compliance.finance.view', 'trip_compliance.finance.manage'
    );
    RAISE EXCEPTION 'authenticated inserted an audit batch directly';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  RESET ROLE;

  PERFORM set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  SET LOCAL ROLE authenticated;
  v := public.bulk_payment_field_submit(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'compliance_advance', 'gate.csv', 'gate-advance',
    '{}'::jsonb, '["utr"]'::jsonb,
    jsonb_build_array(jsonb_build_object(
      'rowIndex', 2,
      'recordId', (SELECT ids.v FROM public.bulk_prod_ids ids WHERE ids.k = 'advance_gate'),
      'proposed', jsonb_build_object('utr', 'SHOULDNOT')
    ))
  );
  v_batch := (v->>'batchId')::uuid;
  PERFORM public.bulk_payment_field_apply_next(v_batch);
  RESET ROLE;
  IF (SELECT payment_reference FROM public.transactions
       WHERE id = (SELECT ids.v::uuid FROM public.bulk_prod_ids ids WHERE ids.k = 'advance_gate'))
     IS DISTINCT FROM 'GATE123456' THEN
    RAISE EXCEPTION 'RPC wrote an advance whose trip is not compliance-verified';
  END IF;
  IF (SELECT status FROM public.bulk_operation_rows WHERE batch_id = v_batch) IS DISTINCT FROM 'failed'
     AND NOT EXISTS (
       SELECT 1 FROM public.bulk_operation_rows r
        JOIN public.bulk_operation_events e ON e.row_id = r.id
       WHERE r.record_id = (SELECT ids.v FROM public.bulk_prod_ids ids WHERE ids.k = 'advance_gate')
         AND r.status = 'failed'
     ) THEN
    RAISE EXCEPTION 'unverified advance was not recorded as failed';
  END IF;

  SET LOCAL ROLE authenticated;
  v := public.bulk_payment_field_submit(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'compliance_balance', 'gate-bal.csv', 'gate-balance',
    '{}'::jsonb, '["requestId"]'::jsonb,
    jsonb_build_array(jsonb_build_object(
      'rowIndex', 2,
      'recordId', (SELECT ids.v FROM public.bulk_prod_ids ids WHERE ids.k = 'balance_gate'),
      'proposed', jsonb_build_object('requestId', 'REQ-9999')
    ))
  );
  PERFORM public.bulk_payment_field_apply_next((v->>'batchId')::uuid);
  RESET ROLE;
  IF (SELECT description FROM public.transactions
       WHERE id = (SELECT ids.v::uuid FROM public.bulk_prod_ids ids WHERE ids.k = 'balance_gate'))
     NOT LIKE '%REQ-3003%' THEN
    RAISE EXCEPTION 'RPC wrote a balance whose POD has not been received';
  END IF;

  UPDATE public.trips SET compliance_verified_at = now()
   WHERE id = '88888888-8888-8888-8888-888888888888';
  UPDATE public.trips SET pod_received_at = now()
   WHERE id = '99999999-9999-9999-9999-999999999999';

  SELECT to_jsonb(t) INTO v_before
    FROM public.transactions t
   WHERE t.id = (SELECT ids.v::uuid FROM public.bulk_prod_ids ids WHERE ids.k = 'advance');

  SET LOCAL ROLE authenticated;
  v := public.bulk_payment_field_submit(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'compliance_advance', 'utr.csv', 'utr-only',
    '{}'::jsonb, '["utr"]'::jsonb,
    jsonb_build_array(jsonb_build_object(
      'rowIndex', 2,
      'recordId', (SELECT ids.v FROM public.bulk_prod_ids ids WHERE ids.k = 'advance'),
      'proposed', jsonb_build_object('utr', 'UTRONLY12')
    ))
  );
  v := public.bulk_payment_field_apply_next((v->>'batchId')::uuid);
  IF (v->>'done')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'utr-only apply did not finish: %', v;
  END IF;
  RESET ROLE;
  SELECT * INTO v_row FROM public.transactions
   WHERE id = (SELECT ids.v::uuid FROM public.bulk_prod_ids ids WHERE ids.k = 'advance');
  IF v_row.payment_reference IS DISTINCT FROM 'UTRONLY12'
     OR v_row.amount_out IS DISTINCT FROM 1000
     OR v_row.amount_in IS DISTINCT FROM 0
     OR v_row.transaction_date IS DISTINCT FROM DATE '2026-09-01'
     OR v_row.description NOT LIKE '%REQ-1001%'
     OR v_row.description NOT LIKE '%Mode: UPI%'
     OR v_row.paid_from_account_id IS DISTINCT FROM '14141414-1414-1414-1414-141414141414'
     OR v_row.contact_id IS DISTINCT FROM '12121212-1212-1212-1212-121212121212'
     OR v_row.contact_type IS DISTINCT FROM 'supplier'
     OR v_row.ledger_flow_type IS DISTINCT FROM 'expense'
     OR v_row.ledger_category IS DISTINCT FROM 'compliance_advance'
     OR v_row.organization_id IS DISTINCT FROM 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
     OR v_row.trip_id IS DISTINCT FROM '55555555-5555-5555-5555-555555555555'
     OR v_row.created_by IS DISTINCT FROM '11111111-1111-1111-1111-111111111111' THEN
    RAISE EXCEPTION 'utr-only update changed a protected field: %', to_jsonb(v_row);
  END IF;
  IF (SELECT approved_amount FROM public.payment_requests
       WHERE trip_id = v_row.trip_id AND payment_type = 'advance') IS DISTINCT FROM 1000
     OR (SELECT status FROM public.payment_requests
       WHERE trip_id = v_row.trip_id AND payment_type = 'advance') IS DISTINCT FROM 'paid'
     OR (SELECT count(*) FROM public.payment_request_transactions WHERE transaction_id = v_row.id) IS DISTINCT FROM 1
     OR (SELECT count(*) FROM public.driver_ledger) IS DISTINCT FROM 0
     OR (SELECT amount_paid FROM public.trips WHERE id = v_row.trip_id) IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'utr-only update changed the request, driver ledger, or trip payment status';
  END IF;

  SET LOCAL ROLE authenticated;
  v := public.bulk_payment_field_submit(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'compliance_advance', 'req.csv', 'request-only',
    '{}'::jsonb, '["requestId"]'::jsonb,
    jsonb_build_array(jsonb_build_object(
      'rowIndex', 2,
      'recordId', v_row.id,
      'proposed', jsonb_build_object('requestId', 'REQ-2002')
    ))
  );
  PERFORM public.bulk_payment_field_apply_next((v->>'batchId')::uuid);
  RESET ROLE;
  SELECT * INTO v_row FROM public.transactions WHERE id = v_row.id;
  IF v_row.payment_reference IS DISTINCT FROM 'UTRONLY12'
     OR v_row.description NOT LIKE '%REQ-2002%'
     OR v_row.amount_out IS DISTINCT FROM 1000 THEN
    RAISE EXCEPTION 'request-only update moved the UTR or amount';
  END IF;

  SET LOCAL ROLE authenticated;
  v := public.bulk_payment_field_submit(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'compliance_advance', 'date.csv', 'date-only',
    '{}'::jsonb, '["transactionDate"]'::jsonb,
    jsonb_build_array(jsonb_build_object(
      'rowIndex', 2,
      'recordId', v_row.id,
      'proposed', jsonb_build_object('transactionDate', '2026-10-15')
    ))
  );
  PERFORM public.bulk_payment_field_apply_next((v->>'batchId')::uuid);
  RESET ROLE;
  SELECT * INTO v_row FROM public.transactions WHERE id = v_row.id;
  IF v_row.transaction_date IS DISTINCT FROM DATE '2026-10-15'
     OR v_row.description NOT LIKE '%compliance_txn_date_set%'
     OR v_row.payment_reference IS DISTINCT FROM 'UTRONLY12'
     OR v_row.description NOT LIKE '%REQ-2002%'
     OR v_row.amount_out IS DISTINCT FROM 1000 THEN
    RAISE EXCEPTION 'date-only update did not keep the other fields';
  END IF;

  SET LOCAL ROLE authenticated;
  v := public.bulk_payment_field_submit(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'compliance_balance', 'combined.csv', 'combined',
    '{}'::jsonb, '["utr","requestId","transactionDate"]'::jsonb,
    jsonb_build_array(jsonb_build_object(
      'rowIndex', 2,
      'recordId', (SELECT ids.v FROM public.bulk_prod_ids ids WHERE ids.k = 'balance'),
      'proposed', jsonb_build_object(
        'utr', 'BALNEW123',
        'requestId', 'REQ-4444',
        'transactionDate', '2026-11-01'
      )
    ))
  );
  PERFORM public.bulk_payment_field_apply_next((v->>'batchId')::uuid);
  RESET ROLE;
  SELECT * INTO v_row FROM public.transactions
   WHERE id = (SELECT ids.v::uuid FROM public.bulk_prod_ids ids WHERE ids.k = 'balance');
  IF v_row.payment_reference IS DISTINCT FROM 'BALNEW123'
     OR v_row.description NOT LIKE '%REQ-4444%'
     OR v_row.description NOT LIKE '%Mode: NEFT%'
     OR v_row.transaction_date IS DISTINCT FROM DATE '2026-11-01'
     OR v_row.amount_out IS DISTINCT FROM 800
     OR v_row.ledger_category IS DISTINCT FROM 'compliance_balance' THEN
    RAISE EXCEPTION 'combined balance update changed a protected field: %', to_jsonb(v_row);
  END IF;

  SET LOCAL ROLE authenticated;
  v := public.bulk_payment_field_submit(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'compliance_advance', 'stale.csv', 'stale-amount',
    '{}'::jsonb, '["utr"]'::jsonb,
    jsonb_build_array(jsonb_build_object(
      'rowIndex', 2,
      'recordId', (SELECT ids.v FROM public.bulk_prod_ids ids WHERE ids.k = 'advance'),
      'proposed', jsonb_build_object('utr', 'STALE9999')
    ))
  );
  RESET ROLE;
  UPDATE public.transactions SET amount_out = 1100
   WHERE id = (SELECT ids.v::uuid FROM public.bulk_prod_ids ids WHERE ids.k = 'advance');
  SET LOCAL ROLE authenticated;
  PERFORM public.bulk_payment_field_apply_next((v->>'batchId')::uuid);
  RESET ROLE;
  SELECT * INTO v_row FROM public.transactions
   WHERE id = (SELECT ids.v::uuid FROM public.bulk_prod_ids ids WHERE ids.k = 'advance');
  IF v_row.amount_out IS DISTINCT FROM 1100 OR v_row.payment_reference IS DISTINCT FROM 'UTRONLY12' THEN
    RAISE EXCEPTION 'stale amount was overwritten: %', to_jsonb(v_row);
  END IF;
  UPDATE public.transactions SET amount_out = 1000 WHERE id = v_row.id;

  SELECT e.id, e.payload INTO v_applied, v_event
    FROM public.bulk_operation_events e
    JOIN public.bulk_operation_rows r ON r.id = e.row_id
   WHERE r.record_id = v_row.id::text
     AND e.event_type = 'applied'
     AND e.payload->>'field' IS NULL
   ORDER BY e.created_at
   LIMIT 1;
  v_before := v_event;
  SET LOCAL ROLE authenticated;
  v := public.bulk_payment_field_correct(
    (SELECT batch_id FROM public.bulk_operation_events WHERE id = v_applied),
    (SELECT row_id FROM public.bulk_operation_events WHERE id = v_applied),
    'utr', 'FIXED1234', v_applied
  );
  RESET ROLE;
  SELECT * INTO v_row FROM public.transactions WHERE id = v_row.id;
  IF v_row.payment_reference IS DISTINCT FROM 'FIXED1234'
     OR v_row.amount_out IS DISTINCT FROM 1000
     OR (SELECT payload FROM public.bulk_operation_events WHERE id = v_applied) IS DISTINCT FROM v_before THEN
    RAISE EXCEPTION 'correction rewrote history or a protected field';
  END IF;
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.bulk_payment_field_correct(
      (SELECT batch_id FROM public.bulk_operation_events WHERE id = v_applied),
      (SELECT row_id FROM public.bulk_operation_events WHERE id = v_applied),
      'amount', '1', v_applied
    );
    RAISE EXCEPTION 'correction accepted amount';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM ILIKE '%correction accepted amount%' THEN
      RAISE;
    END IF;
  END;
  RESET ROLE;

  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.bulk_payment_field_submit(
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'compliance_advance', 'amount.csv', 'amount',
      '{}'::jsonb, '["amount"]'::jsonb, '[]'::jsonb
    );
    RAISE EXCEPTION 'amount selection was accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM ILIKE '%amount selection was accepted%' THEN
      RAISE;
    END IF;
  END;
  RESET ROLE;

  PERFORM set_config('pulse.exchange_writer', 'on', true);
  INSERT INTO public.transactions (
    id, organization_id, ledger_category, description, payment_reference,
    transaction_date, amount_out, contact_type, contact_id
  ) VALUES (
    'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'EXCHANGE_PAYMENT', 'Exchange', 'EXCH123456', '2026-09-01', 50,
    'supplier', '12121212-1212-1212-1212-121212121212'
  );
  PERFORM set_config('pulse.exchange_writer', '', true);
  BEGIN
    UPDATE public.transactions SET payment_reference = 'EXCH999999'
     WHERE id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
    RAISE EXCEPTION 'exchange payment was edited';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  IF (SELECT payment_reference FROM public.transactions
       WHERE id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee') IS DISTINCT FROM 'EXCH123456' THEN
    RAISE EXCEPTION 'exchange guard did not keep the payment';
  END IF;

  IF (SELECT count(*) FROM public.driver_ledger) <> 0 THEN
    RAISE EXCEPTION 'a supplier payment wrote a driver ledger row';
  END IF;
  INSERT INTO public.transactions (
    organization_id, trip_id, ledger_category, transaction_date,
    amount_in, amount_out, contact_type, created_by
  ) VALUES (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'dddddddd-dddd-dddd-dddd-dddddddddddd',
    'client_receipt', '2026-09-01', 2000, 0, 'client',
    '11111111-1111-1111-1111-111111111111'
  );
  IF (SELECT amount_paid FROM public.trips WHERE id = 'dddddddd-dddd-dddd-dddd-dddddddddddd') IS DISTINCT FROM 2000
     OR (SELECT payment_status FROM public.trips WHERE id = 'dddddddd-dddd-dddd-dddd-dddddddddddd')
        IS DISTINCT FROM 'partial' THEN
    RAISE EXCEPTION 'client receipt did not keep the trip payment status trigger working';
  END IF;
END;
$$;
