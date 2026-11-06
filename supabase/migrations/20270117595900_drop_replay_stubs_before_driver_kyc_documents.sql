-- Local replay only. Drops the void stubs created by
-- 20260903061451 so 20270118000000 can define the real functions.
-- A production function whose body is not the stub is left in place.

DO $$
DECLARE
  v_name text;
BEGIN
  FOREACH v_name IN ARRAY ARRAY[
    'platform_approve_driver_kyc_document',
    'platform_reject_driver_kyc_document'
  ]
  LOOP
    IF EXISTS (
      SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname = v_name
        AND pg_get_function_identity_arguments(p.oid) = 'uuid, text'
        AND p.prosrc LIKE '%replay_stub%'
    ) THEN
      EXECUTE format('DROP FUNCTION public.%I(uuid, text)', v_name);
    END IF;
  END LOOP;
END $$;
