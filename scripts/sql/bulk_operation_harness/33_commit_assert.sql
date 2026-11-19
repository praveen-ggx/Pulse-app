DO $$
DECLARE
  v_utr text;
  v_status text;
  v_applied integer;
  v_step jsonb;
  v_batch uuid;
BEGIN
  SELECT payment_reference INTO v_utr
    FROM public.transactions WHERE id = '77777777-7777-7777-7777-777777777772';
  SELECT r.status INTO v_status
    FROM public.bulk_operation_rows r
    JOIN public.bulk_test_state s ON s.k = 'commit_batch' AND r.batch_id = s.v::uuid;
  SELECT count(*) INTO v_applied
    FROM public.bulk_operation_events e
    JOIN public.bulk_test_state s ON s.k = 'commit_batch' AND e.batch_id = s.v::uuid
   WHERE e.event_type = 'applied';
  IF v_utr IS DISTINCT FROM 'OLD123456' OR v_applied <> 0 OR v_status IS DISTINCT FROM 'ready' THEN
    RAISE EXCEPTION 'commit crash leaked utr=% status=% applied=%', v_utr, v_status, v_applied;
  END IF;
  v_batch := (SELECT v FROM public.bulk_test_state WHERE k = 'commit_batch')::uuid;
  PERFORM set_config('bulk.fail', '', true);
  PERFORM set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  SET LOCAL ROLE authenticated;
  v_step := public.bulk_payment_field_apply_next(v_batch);
  RESET ROLE;
  IF v_step->>'outcome' IS DISTINCT FROM 'applied' THEN
    RAISE EXCEPTION 'resume after commit crash failed %', v_step;
  END IF;
  IF (SELECT payment_reference FROM public.transactions WHERE id = '77777777-7777-7777-7777-777777777772') IS DISTINCT FROM 'COMMIT123' THEN
    RAISE EXCEPTION 'resume did not apply the stored row';
  END IF;
  IF (SELECT count(*) FROM public.bulk_operation_events WHERE batch_id = v_batch AND event_type = 'applied') IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'resume applied more than once';
  END IF;
END;
$$;
