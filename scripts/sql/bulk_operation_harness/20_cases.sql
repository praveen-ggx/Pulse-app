-- Integration cases. Failures raise. Production is not contacted.
CREATE OR REPLACE FUNCTION public.bulk_test_fail(p_message text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION '%', p_message;
END;
$$;

GRANT EXECUTE ON FUNCTION public.bulk_test_fail(text) TO authenticated;

DO $$
DECLARE
  v jsonb;
  v_step jsonb;
  v_batch uuid;
  v_hash text := '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824';
  v_utr text;
  v_amount numeric;
  v_mode text;
  v_request text;
  v_org uuid;
  v_trip uuid;
  v_applied integer;
  v_event uuid;
  v_second uuid;
  v_payload jsonb;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.bulk_payment_field_submit(
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'compliance_advance', 'view.csv', 'hello',
      '{}'::jsonb, '["utr"]'::jsonb,
      jsonb_build_array(jsonb_build_object('rowIndex', 2, 'recordId', '77777777-7777-7777-7777-777777777771', 'proposed', jsonb_build_object('utr', 'NEW123456')))
    );
    PERFORM public.bulk_test_fail('view user was allowed to confirm');
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  BEGIN
    INSERT INTO public.bulk_operation_batches (
      organization_id, adapter_id, template_id, template_version, operation, status, idempotency_key,
      file_name, file_sha256, file_bytes, review_surface, execute_surface, uploaded_by, confirmed_by, execution_owner
    ) VALUES (
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'x', 'x', '1', 'field_update', 'confirmed', 'forged',
      'x', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 1,
      'trip_compliance.finance.view', 'trip_compliance.finance.manage',
      '22222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222'
    );
    PERFORM public.bulk_test_fail('view user inserted a batch');
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  RESET ROLE;

  PERFORM set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  SET LOCAL ROLE authenticated;
  v := public.bulk_payment_field_submit(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'compliance_advance', 'hello.csv', 'hello',
    '{"utr":"UTR"}'::jsonb, '["utr"]'::jsonb,
    jsonb_build_array(jsonb_build_object(
      'rowIndex', 2,
      'recordId', '77777777-7777-7777-7777-777777777771',
      'proposed', jsonb_build_object('utr', 'NEW123456')
    ))
  );
  IF v->>'fileSha256' IS DISTINCT FROM v_hash THEN
    RAISE EXCEPTION 'file hash %', v->>'fileSha256';
  END IF;
  v_batch := (v->>'batchId')::uuid;
  LOOP
    v_step := public.bulk_payment_field_apply_next(v_batch);
    EXIT WHEN v_step->>'done' = 'true';
  END LOOP;
  IF v_step->>'batchStatus' IS DISTINCT FROM 'completed' THEN
    RAISE EXCEPTION 'expected completed, got %', v_step->>'batchStatus';
  END IF;
  v := public.bulk_payment_field_submit(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'compliance_advance', 'hello.csv', 'hello',
    '{"utr":"UTR"}'::jsonb, '["utr"]'::jsonb,
    jsonb_build_array(jsonb_build_object(
      'rowIndex', 2, 'recordId', '77777777-7777-7777-7777-777777777771',
      'proposed', jsonb_build_object('utr', 'NEW123456')
    ))
  );
  IF v->>'replayed' IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'completed replay did not return history: %', v;
  END IF;
  RESET ROLE;

  SELECT payment_reference, amount_out, organization_id, trip_id,
         public.bulk_ledger_segment(description, 'Mode'),
         public.bulk_ledger_segment(description, 'Request ID')
    INTO v_utr, v_amount, v_org, v_trip, v_mode, v_request
    FROM public.transactions
   WHERE id = '77777777-7777-7777-7777-777777777771';
  IF v_utr IS DISTINCT FROM 'NEW123456' OR v_amount IS DISTINCT FROM 1000
     OR v_mode IS DISTINCT FROM 'UPI' OR v_request IS DISTINCT FROM 'REQ-1001'
     OR v_org IS DISTINCT FROM 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid
     OR v_trip IS DISTINCT FROM '55555555-5555-5555-5555-555555555555'::uuid THEN
    RAISE EXCEPTION 'field preservation failed utr=% amount=% mode=% request=%', v_utr, v_amount, v_mode, v_request;
  END IF;
  SELECT count(*) INTO v_applied
    FROM public.bulk_operation_events
   WHERE batch_id = v_batch AND event_type = 'applied';
  IF v_applied IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'applied events %', v_applied;
  END IF;

  SELECT id, payload INTO v_event, v_payload
    FROM public.bulk_operation_events
   WHERE batch_id = v_batch AND event_type = 'applied'
   ORDER BY created_at
   LIMIT 1;

  PERFORM set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  SET LOCAL ROLE authenticated;
  v := public.bulk_payment_field_correct(
    v_batch,
    (SELECT id FROM public.bulk_operation_rows WHERE batch_id = v_batch AND row_index = 2),
    'utr', 'SECOND123', v_event
  );
  v_second := (v->>'eventId')::uuid;
  PERFORM public.bulk_payment_field_correct(
    v_batch,
    (SELECT id FROM public.bulk_operation_rows WHERE batch_id = v_batch AND row_index = 2),
    'utr', 'THIRD1234', v_second
  );
  RESET ROLE;

  IF (SELECT payload FROM public.bulk_operation_events WHERE id = v_event) IS DISTINCT FROM v_payload THEN
    RAISE EXCEPTION 'original event was edited';
  END IF;
  IF (SELECT corrects_event_id FROM public.bulk_operation_events WHERE id = v_second) IS DISTINCT FROM v_event THEN
    RAISE EXCEPTION 'correction was not linked';
  END IF;
  IF (SELECT count(*) FROM public.bulk_operation_events WHERE batch_id = v_batch AND event_type = 'corrected') IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'expected two corrections';
  END IF;
  IF (SELECT payment_reference FROM public.transactions WHERE id = '77777777-7777-7777-7777-777777777771') IS DISTINCT FROM 'THIRD1234' THEN
    RAISE EXCEPTION 'correction did not land';
  END IF;
  IF (SELECT amount_out FROM public.transactions WHERE id = '77777777-7777-7777-7777-777777777771') IS DISTINCT FROM 1000 THEN
    RAISE EXCEPTION 'correction changed the amount';
  END IF;
  BEGIN
    UPDATE public.bulk_operation_events SET payload = '{}'::jsonb WHERE id = v_event;
    RAISE EXCEPTION 'event update was allowed';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%append-only%' THEN
      RAISE;
    END IF;
  END;

  BEGIN
    INSERT INTO public.bulk_operation_rows (
      batch_id, organization_id, row_index, before_values, proposed_values, status
    ) VALUES (
      v_batch, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 99, '{}'::jsonb, '{}'::jsonb, 'ready'
    );
    RAISE EXCEPTION 'cross-organisation row was inserted';
  EXCEPTION WHEN foreign_key_violation THEN
    NULL;
  END;

  PERFORM set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
  SET LOCAL ROLE authenticated;
  IF (SELECT count(*) FROM public.bulk_operation_batches WHERE id = v_batch) <> 0 THEN
    RAISE EXCEPTION 'organisation B can see organisation A batch';
  END IF;
  BEGIN
    PERFORM public.bulk_payment_field_apply_next(v_batch);
    RAISE EXCEPTION 'organisation B executed organisation A batch';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  RESET ROLE;

  INSERT INTO public.bulk_test_state (k, v) VALUES ('happy_batch', v_batch::text);
END;
$$;

-- Stale detection for each preserved and editable field. Payment 2 starts unchanged.
DO $$
DECLARE
  v jsonb;
  v_step jsonb;
  v_batch uuid;
  v_utr text;
  v_amount numeric;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  SET LOCAL ROLE authenticated;
  v := public.bulk_payment_field_submit(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'compliance_advance', 'stale.csv', 'stale-utr',
    '{}'::jsonb, '["utr"]'::jsonb,
    jsonb_build_array(jsonb_build_object(
      'rowIndex', 2, 'recordId', '77777777-7777-7777-7777-777777777772',
      'proposed', jsonb_build_object('utr', 'STALE1234')
    ))
  );
  v_batch := (v->>'batchId')::uuid;
  RESET ROLE;
  UPDATE public.transactions
     SET payment_reference = 'MOVED1234',
         description = 'Advance | Mode: UPI | UTR: MOVED1234 | Request ID: REQ-1001'
   WHERE id = '77777777-7777-7777-7777-777777777772';
  PERFORM set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  SET LOCAL ROLE authenticated;
  v_step := public.bulk_payment_field_apply_next(v_batch);
  RESET ROLE;
  IF v_step->>'outcome' IS DISTINCT FROM 'stale' THEN
    RAISE EXCEPTION 'stale utr outcome %', v_step;
  END IF;
  SELECT payment_reference, amount_out INTO v_utr, v_amount
    FROM public.transactions WHERE id = '77777777-7777-7777-7777-777777777772';
  IF v_utr IS DISTINCT FROM 'MOVED1234' OR v_amount IS DISTINCT FROM 1000 THEN
    RAISE EXCEPTION 'stale utr wrote the payment utr=% amount=%', v_utr, v_amount;
  END IF;
END;
$$;

DO $$
DECLARE
  v jsonb;
  v_step jsonb;
  v_mode text;
  v_utr text;
BEGIN
  UPDATE public.transactions
     SET payment_reference = 'OLD123456',
         description = 'Advance | Mode: UPI | UTR: OLD123456 | Request ID: REQ-1001',
         amount_out = 1000,
         transaction_date = '2026-09-01'
   WHERE id = '77777777-7777-7777-7777-777777777772';
  PERFORM set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  SET LOCAL ROLE authenticated;
  v := public.bulk_payment_field_submit(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'compliance_advance', 'mode.csv', 'stale-mode',
    '{}'::jsonb, '["utr"]'::jsonb,
    jsonb_build_array(jsonb_build_object(
      'rowIndex', 2, 'recordId', '77777777-7777-7777-7777-777777777772',
      'proposed', jsonb_build_object('utr', 'MODE12345')
    ))
  );
  RESET ROLE;
  UPDATE public.transactions
     SET description = 'Advance | Mode: NEFT | UTR: OLD123456 | Request ID: REQ-1001'
   WHERE id = '77777777-7777-7777-7777-777777777772';
  PERFORM set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  SET LOCAL ROLE authenticated;
  v_step := public.bulk_payment_field_apply_next((v->>'batchId')::uuid);
  RESET ROLE;
  SELECT public.bulk_ledger_segment(description, 'Mode'), payment_reference
    INTO v_mode, v_utr
    FROM public.transactions WHERE id = '77777777-7777-7777-7777-777777777772';
  IF v_step->>'outcome' IS DISTINCT FROM 'stale' OR v_mode IS DISTINCT FROM 'NEFT' OR v_utr IS DISTINCT FROM 'OLD123456' THEN
    RAISE EXCEPTION 'stale mode failed outcome=% mode=% utr=%', v_step->>'outcome', v_mode, v_utr;
  END IF;
END;
$$;

DO $$
DECLARE
  v jsonb;
  v_step jsonb;
  v_amount numeric;
  v_utr text;
  v_date date;
  v_request text;
BEGIN
  UPDATE public.transactions
     SET payment_reference = 'OLD123456',
         description = 'Advance | Mode: UPI | UTR: OLD123456 | Request ID: REQ-1001',
         amount_out = 1000,
         transaction_date = '2026-09-01'
   WHERE id = '77777777-7777-7777-7777-777777777772';
  PERFORM set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  SET LOCAL ROLE authenticated;
  v := public.bulk_payment_field_submit(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'compliance_advance', 'amount.csv', 'stale-amount',
    '{}'::jsonb, '["utr"]'::jsonb,
    jsonb_build_array(jsonb_build_object(
      'rowIndex', 2, 'recordId', '77777777-7777-7777-7777-777777777772',
      'proposed', jsonb_build_object('utr', 'AMT123456')
    ))
  );
  RESET ROLE;
  UPDATE public.transactions SET amount_out = 5 WHERE id = '77777777-7777-7777-7777-777777777772';
  PERFORM set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  SET LOCAL ROLE authenticated;
  v_step := public.bulk_payment_field_apply_next((v->>'batchId')::uuid);
  RESET ROLE;
  SELECT amount_out, payment_reference INTO v_amount, v_utr
    FROM public.transactions WHERE id = '77777777-7777-7777-7777-777777777772';
  IF v_step->>'outcome' IS DISTINCT FROM 'stale' OR v_amount IS DISTINCT FROM 5 OR v_utr IS DISTINCT FROM 'OLD123456' THEN
    RAISE EXCEPTION 'stale amount failed outcome=% amount=% utr=%', v_step->>'outcome', v_amount, v_utr;
  END IF;

  UPDATE public.transactions
     SET amount_out = 1000,
         payment_reference = 'OLD123456',
         description = 'Advance | Mode: UPI | UTR: OLD123456 | Request ID: REQ-1001',
         transaction_date = '2026-09-01'
   WHERE id = '77777777-7777-7777-7777-777777777772';
  PERFORM set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  SET LOCAL ROLE authenticated;
  v := public.bulk_payment_field_submit(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'compliance_advance', 'date.csv', 'stale-date',
    '{}'::jsonb, '["transactionDate"]'::jsonb,
    jsonb_build_array(jsonb_build_object(
      'rowIndex', 2, 'recordId', '77777777-7777-7777-7777-777777777772',
      'proposed', jsonb_build_object('transactionDate', '2026-10-02')
    ))
  );
  RESET ROLE;
  UPDATE public.transactions SET transaction_date = '2026-08-15' WHERE id = '77777777-7777-7777-7777-777777777772';
  PERFORM set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  SET LOCAL ROLE authenticated;
  v_step := public.bulk_payment_field_apply_next((v->>'batchId')::uuid);
  RESET ROLE;
  SELECT transaction_date, payment_reference INTO v_date, v_utr
    FROM public.transactions WHERE id = '77777777-7777-7777-7777-777777777772';
  IF v_step->>'outcome' IS DISTINCT FROM 'stale' OR v_date IS DISTINCT FROM '2026-08-15' OR v_utr IS DISTINCT FROM 'OLD123456' THEN
    RAISE EXCEPTION 'stale date failed outcome=% date=% utr=%', v_step->>'outcome', v_date, v_utr;
  END IF;

  UPDATE public.transactions
     SET transaction_date = '2026-09-01',
         description = 'Advance | Mode: UPI | UTR: OLD123456 | Request ID: REQ-1001'
   WHERE id = '77777777-7777-7777-7777-777777777772';
  PERFORM set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  SET LOCAL ROLE authenticated;
  v := public.bulk_payment_field_submit(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'compliance_advance', 'request.csv', 'stale-request',
    '{}'::jsonb, '["requestId"]'::jsonb,
    jsonb_build_array(jsonb_build_object(
      'rowIndex', 2, 'recordId', '77777777-7777-7777-7777-777777777772',
      'proposed', jsonb_build_object('requestId', 'REQ-2002')
    ))
  );
  RESET ROLE;
  UPDATE public.transactions
     SET description = 'Advance | Mode: UPI | UTR: OLD123456 | Request ID: REQ-9'
   WHERE id = '77777777-7777-7777-7777-777777777772';
  PERFORM set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  SET LOCAL ROLE authenticated;
  v_step := public.bulk_payment_field_apply_next((v->>'batchId')::uuid);
  RESET ROLE;
  SELECT public.bulk_ledger_segment(description, 'Request ID'), payment_reference
    INTO v_request, v_utr
    FROM public.transactions WHERE id = '77777777-7777-7777-7777-777777777772';
  IF v_step->>'outcome' IS DISTINCT FROM 'stale' OR v_request IS DISTINCT FROM 'REQ-9' OR v_utr IS DISTINCT FROM 'OLD123456' THEN
    RAISE EXCEPTION 'stale request failed outcome=% request=% utr=%', v_step->>'outcome', v_request, v_utr;
  END IF;
END;
$$;

-- Partial batch: one real row and one missing payment. Resume must not reapply the first.
DO $$
DECLARE
  v jsonb;
  v_step jsonb;
  v_batch uuid;
  v_applied integer;
BEGIN
  UPDATE public.transactions
     SET payment_reference = 'OLD123456',
         description = 'Advance | Mode: UPI | UTR: OLD123456 | Request ID: REQ-1001',
         amount_out = 1000,
         transaction_date = '2026-09-01'
   WHERE id = '77777777-7777-7777-7777-777777777772';
  PERFORM set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  SET LOCAL ROLE authenticated;
  v := public.bulk_payment_field_submit(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'compliance_advance', 'partial.csv', 'partial-file',
    '{}'::jsonb, '["utr"]'::jsonb,
    jsonb_build_array(
      jsonb_build_object('rowIndex', 2, 'recordId', '77777777-7777-7777-7777-777777777772', 'proposed', jsonb_build_object('utr', 'PART12345')),
      jsonb_build_object('rowIndex', 3, 'recordId', '99999999-9999-9999-9999-999999999999', 'proposed', jsonb_build_object('utr', 'PART99999'))
    )
  );
  v_batch := (v->>'batchId')::uuid;
  LOOP
    v_step := public.bulk_payment_field_apply_next(v_batch);
    EXIT WHEN v_step->>'done' = 'true';
  END LOOP;
  v_step := public.bulk_payment_field_apply_next(v_batch);
  RESET ROLE;
  IF v_step->>'replayed' IS DISTINCT FROM 'true' OR v_step->>'batchStatus' IS DISTINCT FROM 'partial' THEN
    RAISE EXCEPTION 'partial replay failed %', v_step;
  END IF;
  SELECT count(*) INTO v_applied FROM public.bulk_operation_events WHERE batch_id = v_batch AND event_type = 'applied';
  IF v_applied IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'partial applied events %', v_applied;
  END IF;
  IF (SELECT payment_reference FROM public.transactions WHERE id = '77777777-7777-7777-7777-777777777772') IS DISTINCT FROM 'PART12345' THEN
    RAISE EXCEPTION 'partial row was not applied once';
  END IF;
  IF (SELECT count(*) FROM public.bulk_operation_events WHERE batch_id = v_batch AND event_type IN ('failed', 'rejected') AND row_id IS NOT NULL) < 1 THEN
    RAISE EXCEPTION 'missing payment was not recorded';
  END IF;
  INSERT INTO public.bulk_test_state (k, v) VALUES ('partial_batch', v_batch::text);
END;
$$;

-- Missing trip is a terminal event and does not write.
DO $$
DECLARE
  v jsonb;
  v_batch uuid;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  SET LOCAL ROLE authenticated;
  v := public.bulk_payment_field_submit(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'compliance_advance', 'no-trip.csv', 'missing-trip',
    '{}'::jsonb, '["utr"]'::jsonb,
    jsonb_build_array(jsonb_build_object(
      'rowIndex', 2, 'recordId', '77777777-7777-7777-7777-777777777774',
      'proposed', jsonb_build_object('utr', 'NOTRIP123')
    ))
  );
  v_batch := (v->>'batchId')::uuid;
  RESET ROLE;
  IF (SELECT payment_reference FROM public.transactions WHERE id = '77777777-7777-7777-7777-777777777774') IS DISTINCT FROM 'OLD123456' THEN
    RAISE EXCEPTION 'missing trip wrote a payment';
  END IF;
  IF (SELECT count(*) FROM public.bulk_operation_events WHERE batch_id = v_batch AND event_type = 'failed') < 1 THEN
    RAISE EXCEPTION 'missing trip was not audited';
  END IF;
END;
$$;

-- Amount is not an accepted selection.
DO $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.bulk_payment_field_submit(
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'compliance_advance', 'amount-field.csv', 'amount-field',
      '{}'::jsonb, '["amount"]'::jsonb,
      jsonb_build_array(jsonb_build_object('rowIndex', 2, 'recordId', '77777777-7777-7777-7777-777777777772', 'proposed', jsonb_build_object('amount', '1')))
    );
    RAISE EXCEPTION 'amount selection was accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%Only UTR%' THEN
      RAISE;
    END IF;
  END;
  RESET ROLE;
END;
$$;
