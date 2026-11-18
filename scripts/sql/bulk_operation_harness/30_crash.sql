-- Crash injection lives only in this disposable database.
CREATE OR REPLACE FUNCTION public.bulk_test_injection()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_TABLE_NAME = 'transactions' THEN
    IF current_setting('bulk.fail', true) = 'before_payment' AND TG_WHEN = 'BEFORE' THEN
      RAISE EXCEPTION 'injected before payment';
    END IF;
    IF current_setting('bulk.fail', true) = 'after_payment' AND TG_WHEN = 'AFTER' THEN
      RAISE EXCEPTION 'injected after payment';
    END IF;
  ELSIF TG_TABLE_NAME = 'bulk_operation_events'
        AND current_setting('bulk.fail', true) = 'during_event'
        AND TG_OP = 'INSERT'
        AND NEW.event_type = 'applied' THEN
    RAISE EXCEPTION 'injected during event';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bulk_test_tx_before ON public.transactions;
CREATE TRIGGER bulk_test_tx_before
  BEFORE UPDATE ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.bulk_test_injection();

DROP TRIGGER IF EXISTS bulk_test_tx_after ON public.transactions;
CREATE TRIGGER bulk_test_tx_after
  AFTER UPDATE ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.bulk_test_injection();

DROP TRIGGER IF EXISTS bulk_test_event ON public.bulk_operation_events;
CREATE TRIGGER bulk_test_event
  BEFORE INSERT ON public.bulk_operation_events
  FOR EACH ROW
  EXECUTE FUNCTION public.bulk_test_injection();

CREATE OR REPLACE FUNCTION public.bulk_test_defer()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_setting('bulk.fail', true) = 'during_commit' AND NEW.event_type = 'applied' THEN
    RAISE EXCEPTION 'injected during commit';
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS bulk_test_commit ON public.bulk_operation_events;
CREATE CONSTRAINT TRIGGER bulk_test_commit
  AFTER INSERT ON public.bulk_operation_events
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION public.bulk_test_defer();

DO $$
DECLARE
  v jsonb;
  v_step jsonb;
  v_batch uuid;
  v_utr text;
  v_applied integer;
  v_point text;
BEGIN
  FOREACH v_point IN ARRAY ARRAY['before_payment', 'after_payment', 'during_event'] LOOP
    PERFORM set_config('bulk.fail', '', true);
    UPDATE public.transactions
       SET payment_reference = 'OLD123456',
           description = 'Advance | Mode: UPI | UTR: OLD123456 | Request ID: REQ-1001',
           amount_out = 1000,
           transaction_date = '2026-09-01'
     WHERE id = '77777777-7777-7777-7777-777777777772';
    PERFORM set_config('bulk.fail', '', true);
    PERFORM set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
    SET LOCAL ROLE authenticated;
    v := public.bulk_payment_field_submit(
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'compliance_advance', v_point || '.csv', 'crash-' || v_point,
      '{}'::jsonb, '["utr"]'::jsonb,
      jsonb_build_array(jsonb_build_object(
        'rowIndex', 2, 'recordId', '77777777-7777-7777-7777-777777777772',
        'proposed', jsonb_build_object('utr', 'CRASH1234')
      ))
    );
    v_batch := (v->>'batchId')::uuid;
    PERFORM set_config('bulk.fail', v_point, true);
    v_step := public.bulk_payment_field_apply_next(v_batch);
    RESET ROLE;
    SELECT payment_reference INTO v_utr FROM public.transactions WHERE id = '77777777-7777-7777-7777-777777777772';
    SELECT count(*) INTO v_applied FROM public.bulk_operation_events WHERE batch_id = v_batch AND event_type = 'applied';
    IF v_utr IS DISTINCT FROM 'OLD123456' OR v_applied <> 0 OR v_step->>'outcome' IS DISTINCT FROM 'failed' THEN
      RAISE EXCEPTION 'crash % leaked utr=% applied=% outcome=%', v_point, v_utr, v_applied, v_step->>'outcome';
    END IF;
    IF (SELECT count(*) FROM public.bulk_operation_events WHERE batch_id = v_batch AND event_type = 'failed') < 1 THEN
      RAISE EXCEPTION 'crash % did not record the failure', v_point;
    END IF;
  END LOOP;
  PERFORM set_config('bulk.fail', '', true);
END;
$$;

-- Commit injection is a separate statement so the deferred failure can abort it.
INSERT INTO public.bulk_test_state (k, v)
SELECT 'commit_batch', NULL
WHERE NOT EXISTS (SELECT 1 FROM public.bulk_test_state WHERE k = 'commit_batch');
