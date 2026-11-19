GRANT SELECT ON public.bulk_test_state TO authenticated;
GRANT INSERT, SELECT ON public.bulk_test_log TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.bulk_test_log_id_seq TO authenticated;

DO $$
DECLARE
  v jsonb;
BEGIN
  PERFORM set_config('bulk.fail', '', true);
  PERFORM set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  SET LOCAL ROLE authenticated;
  v := public.bulk_payment_field_submit(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'compliance_advance', 'race.csv', 'race-row',
    '{}'::jsonb, '["utr"]'::jsonb,
    jsonb_build_array(jsonb_build_object(
      'rowIndex', 2,
      'recordId', (SELECT ids.v FROM public.bulk_prod_ids ids WHERE ids.k = 'race'),
      'proposed', jsonb_build_object('utr', 'RACE12345')
    ))
  );
  RESET ROLE;
  INSERT INTO public.bulk_test_state (k, v) VALUES ('race_batch', v->>'batchId')
  ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v;
END;
$$;
