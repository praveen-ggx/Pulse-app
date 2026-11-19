-- Injected failures on a payment that already has the production triggers.
CREATE OR REPLACE FUNCTION public.bulk_test_injection()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_TABLE_NAME = 'transactions' THEN
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

DROP TRIGGER IF EXISTS bulk_test_tx_after ON public.transactions;
CREATE TRIGGER bulk_test_tx_after
  AFTER UPDATE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.bulk_test_injection();

DROP TRIGGER IF EXISTS bulk_test_event ON public.bulk_operation_events;
CREATE TRIGGER bulk_test_event
  BEFORE INSERT ON public.bulk_operation_events
  FOR EACH ROW EXECUTE FUNCTION public.bulk_test_injection();

DROP TRIGGER IF EXISTS bulk_test_commit ON public.bulk_operation_events;
CREATE CONSTRAINT TRIGGER bulk_test_commit
  AFTER INSERT ON public.bulk_operation_events
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.bulk_test_defer();

DO $$
DECLARE
  v jsonb;
  v_utr text;
  v_applied integer;
  v_request numeric;
BEGIN
  PERFORM set_config('bulk.fail', 'after_payment', true);
  PERFORM set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  SET LOCAL ROLE authenticated;
  v := public.bulk_payment_field_submit(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'compliance_advance', 'crash.csv', 'crash-row',
    '{}'::jsonb, '["utr"]'::jsonb,
    jsonb_build_array(jsonb_build_object(
      'rowIndex', 2,
      'recordId', (SELECT ids.v FROM public.bulk_prod_ids ids WHERE ids.k = 'crash'),
      'proposed', jsonb_build_object('utr', 'CRASH1234')
    ))
  );
  v := public.bulk_payment_field_apply_next((v->>'batchId')::uuid);
  RESET ROLE;
  SELECT payment_reference INTO v_utr
    FROM public.transactions
   WHERE id = (SELECT ids.v::uuid FROM public.bulk_prod_ids ids WHERE ids.k = 'crash');
  SELECT count(*) INTO v_applied
    FROM public.bulk_operation_events e
    JOIN public.bulk_operation_rows r ON r.id = e.row_id
   WHERE r.record_id = (SELECT ids.v FROM public.bulk_prod_ids ids WHERE ids.k = 'crash')
     AND e.event_type = 'applied';
  IF v_utr IS DISTINCT FROM 'OLD123456' OR v_applied <> 0 OR (v->>'outcome') IS DISTINCT FROM 'failed' THEN
    RAISE EXCEPTION 'injected after-payment failure was committed (% % %)', v_utr, v_applied, v;
  END IF;
  SELECT approved_amount INTO v_request
    FROM public.payment_requests
   WHERE trip_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc' AND payment_type = 'advance';
  IF v_request IS DISTINCT FROM 1000 THEN
    RAISE EXCEPTION 'injected failure changed the approved amount';
  END IF;
END;
$$;
