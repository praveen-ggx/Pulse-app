-- Supabase default privileges grant EXECUTE to anon and authenticated when a
-- public function is created. 20271118161500 revoked PUBLIC only, so the
-- browser anon key could still call the payment writer.
-- This re-asserts the intended grants for every bulk function that exists.
-- New helpers created by a later bulk migration are covered when this runs
-- after them. It does not change payment rows.
-- Not applied by the 2026-11-18 source release.

SET LOCAL lock_timeout = '5s';

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname LIKE 'bulk\_%' ESCAPE '\'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.bulk_payment_field_submit(uuid, text, text, text, jsonb, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bulk_payment_field_apply_next(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bulk_payment_field_correct(uuid, uuid, text, text, uuid) TO authenticated;
