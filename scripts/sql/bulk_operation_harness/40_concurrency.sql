-- Same-owner row left ready for two workers. A second manager submits the same file.
GRANT SELECT ON public.bulk_test_state TO authenticated;
DO $$
DECLARE
  v jsonb;
BEGIN
  UPDATE public.transactions
     SET payment_reference = 'OLD123456',
         description = 'Advance | Mode: UPI | UTR: OLD123456 | Request ID: REQ-1001',
         amount_out = 2200,
         transaction_date = '2026-09-01'
   WHERE id = '77777777-7777-7777-7777-777777777771';
  PERFORM set_config('bulk.fail', '', true);
  PERFORM set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  SET LOCAL ROLE authenticated;
  v := public.bulk_payment_field_submit(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'compliance_advance', 'race.csv', 'race-row',
    '{}'::jsonb, '["utr"]'::jsonb,
    jsonb_build_array(jsonb_build_object(
      'rowIndex', 2, 'recordId', '77777777-7777-7777-7777-777777777771',
      'proposed', jsonb_build_object('utr', 'RACE12345')
    ))
  );
  RESET ROLE;
  INSERT INTO public.bulk_test_state (k, v) VALUES ('race_batch', v->>'batchId')
  ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v;
END;
$$;
