DO $$
DECLARE
  v_applied integer;
  v_batches integer;
  v_amount numeric;
  v_utr text;
  v_progress integer;
  v_owners integer;
BEGIN
  SELECT count(*) INTO v_applied
    FROM public.bulk_operation_events e
    JOIN public.bulk_test_state s ON s.k = 'race_batch' AND e.batch_id = s.v::uuid
   WHERE e.event_type = 'applied';
  SELECT amount_out, payment_reference INTO v_amount, v_utr
    FROM public.transactions WHERE id = '77777777-7777-7777-7777-777777777771';
  IF v_applied IS DISTINCT FROM 1 OR v_amount IS DISTINCT FROM 2200 OR v_utr IS DISTINCT FROM 'RACE12345' THEN
    RAISE EXCEPTION 'row race failed applied=% amount=% utr=%', v_applied, v_amount, v_utr;
  END IF;

  SELECT count(*) INTO v_batches
    FROM public.bulk_operation_batches
   WHERE file_name = 'race-submit.csv';
  SELECT count(*) INTO v_owners
    FROM public.bulk_operation_batches
   WHERE file_name = 'race-submit.csv';
  SELECT count(*) INTO v_progress
    FROM public.bulk_test_log
   WHERE who = 'submit' AND coalesce(result->>'inProgress', 'false') = 'true';
  IF v_batches IS DISTINCT FROM 1 OR v_progress IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'submit race failed batches=% inProgress=% logs=%', v_batches, v_progress,
      (SELECT jsonb_agg(result) FROM public.bulk_test_log WHERE who = 'submit');
  END IF;
  IF (SELECT payment_reference FROM public.transactions WHERE id = '77777777-7777-7777-7777-777777777772') IS DISTINCT FROM 'OLD123456' THEN
    RAISE EXCEPTION 'concurrent submit wrote a payment';
  END IF;
  IF v_owners IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'more than one execution owner row';
  END IF;
END;
$$;
