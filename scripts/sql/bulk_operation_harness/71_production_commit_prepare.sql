GRANT SELECT ON public.bulk_test_state TO authenticated;

DO $$
DECLARE
  v jsonb;
BEGIN
  PERFORM set_config('bulk.fail', '', true);
  PERFORM set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  SET LOCAL ROLE authenticated;
  v := public.bulk_payment_field_submit(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'compliance_advance', 'commit.csv', 'commit-row',
    '{}'::jsonb, '["utr"]'::jsonb,
    jsonb_build_array(jsonb_build_object(
      'rowIndex', 3,
      'recordId', (SELECT ids.v FROM public.bulk_prod_ids ids WHERE ids.k = 'crash'),
      'proposed', jsonb_build_object('utr', 'COMMIT123')
    ))
  );
  RESET ROLE;
  INSERT INTO public.bulk_test_state (k, v) VALUES ('commit_batch', v->>'batchId')
  ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v;
END;
$$;
