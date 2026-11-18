DO $$
DECLARE
  v_utr text;
  v_status text;
  v_applied integer;
  v jsonb;
BEGIN
  SELECT payment_reference INTO v_utr
    FROM public.transactions
   WHERE id = (SELECT ids.v::uuid FROM public.bulk_prod_ids ids WHERE ids.k = 'crash');
  SELECT status INTO v_status
    FROM public.bulk_operation_rows
   WHERE batch_id = (SELECT ids.v::uuid FROM public.bulk_test_state ids WHERE ids.k = 'commit_batch');
  SELECT count(*) INTO v_applied
    FROM public.bulk_operation_events
   WHERE batch_id = (SELECT ids.v::uuid FROM public.bulk_test_state ids WHERE ids.k = 'commit_batch')
     AND event_type = 'applied';
  IF v_utr IS DISTINCT FROM 'OLD123456' OR v_status IS DISTINCT FROM 'ready' OR v_applied <> 0 THEN
    RAISE EXCEPTION 'commit injection left a partial write (% % %)', v_utr, v_status, v_applied;
  END IF;

  PERFORM set_config('bulk.fail', '', true);
  PERFORM set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  SET LOCAL ROLE authenticated;
  v := public.bulk_payment_field_apply_next((SELECT ids.v FROM public.bulk_test_state ids WHERE ids.k = 'commit_batch')::uuid);
  RESET ROLE;
  SELECT payment_reference INTO v_utr
    FROM public.transactions
   WHERE id = (SELECT ids.v::uuid FROM public.bulk_prod_ids ids WHERE ids.k = 'crash');
  SELECT count(*) INTO v_applied
    FROM public.bulk_operation_events
   WHERE batch_id = (SELECT ids.v::uuid FROM public.bulk_test_state ids WHERE ids.k = 'commit_batch')
     AND event_type = 'applied';
  IF v_utr IS DISTINCT FROM 'COMMIT123' OR v_applied <> 1 OR (v->>'outcome') IS DISTINCT FROM 'applied' THEN
    RAISE EXCEPTION 'resume after commit injection did not apply once (% % %)', v_utr, v_applied, v;
  END IF;
END;
$$;
