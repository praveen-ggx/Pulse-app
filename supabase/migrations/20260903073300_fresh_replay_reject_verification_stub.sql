-- Fresh-install repair for 20260903073406_verification_rpc_anon_lockdown.sql.
-- That file revokes and grants platform_reject_verification before any
-- migration creates it. platform_approve_verification already has a replay
-- stub. This adds the missing reject stub only when the signature is absent.
-- 20261224030000 replaces the body and keeps the grants applied next.

SET LOCAL lock_timeout = '5s';

DO $guard$
BEGIN
  IF to_regprocedure('public.platform_reject_verification(uuid,jsonb,text)') IS NULL THEN
    EXECUTE $fn$
      CREATE FUNCTION public.platform_reject_verification(uuid, jsonb, text)
      RETURNS jsonb
      LANGUAGE plpgsql
      AS $body$
      BEGIN
        RETURN NULL;
      END;
      $body$
    $fn$;
    EXECUTE 'REVOKE ALL ON FUNCTION public.platform_reject_verification(uuid,jsonb,text) FROM PUBLIC';
  END IF;
END
$guard$;
