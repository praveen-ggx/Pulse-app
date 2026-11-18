DO $$
DECLARE
  v_applied integer;
  v_utr text;
  v_amount numeric;
  v_batches integer;
  v_paid numeric;
BEGIN
  SELECT count(*) INTO v_applied
    FROM public.bulk_operation_events
   WHERE batch_id = (SELECT ids.v::uuid FROM public.bulk_test_state ids WHERE ids.k = 'race_batch')
     AND event_type = 'applied';
  SELECT payment_reference, amount_out INTO v_utr, v_amount
    FROM public.transactions
   WHERE id = (SELECT ids.v::uuid FROM public.bulk_prod_ids ids WHERE ids.k = 'race');
  IF v_applied <> 1 OR v_utr IS DISTINCT FROM 'RACE12345' OR v_amount IS DISTINCT FROM 1000 THEN
    RAISE EXCEPTION 'concurrent apply did not keep one payment write (% % %)', v_applied, v_utr, v_amount;
  END IF;
  SELECT amount_paid INTO v_paid FROM public.trips WHERE id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
  IF v_paid IS DISTINCT FROM 2000 THEN
    RAISE EXCEPTION 'concurrent field update changed client amount_paid to %', v_paid;
  END IF;

  SELECT count(*) INTO v_batches
    FROM public.bulk_operation_batches
   WHERE file_name = 'race-submit.csv';
  SELECT payment_reference INTO v_utr
    FROM public.transactions
   WHERE id = (SELECT ids.v::uuid FROM public.bulk_prod_ids ids WHERE ids.k = 'advance');
  IF v_batches <> 1 OR v_utr IS DISTINCT FROM 'FIXED1234' THEN
    RAISE EXCEPTION 'concurrent submit created a second batch or changed the other payment (% %)', v_batches, v_utr;
  END IF;
  IF (SELECT count(*) FROM public.bulk_test_log WHERE who = 'submit' AND result->>'inProgress' = 'true') <> 1 THEN
    RAISE EXCEPTION 'the second manager was not told the file is already being updated';
  END IF;
END;
$$;
