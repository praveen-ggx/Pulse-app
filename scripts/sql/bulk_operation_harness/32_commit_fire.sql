SELECT set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
SELECT set_config('bulk.fail', 'during_commit', false);
SET ROLE authenticated;
SELECT public.bulk_payment_field_apply_next((SELECT v FROM public.bulk_test_state WHERE k = 'commit_batch')::uuid);
