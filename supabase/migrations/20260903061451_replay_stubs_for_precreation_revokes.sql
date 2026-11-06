-- Local replay only. Not a production change and not part of a release set.
--
-- 20260903061452 revokes six functions before any migration creates them.
-- A fresh reset fails on the first REVOKE. Production already applied that
-- file when the functions existed, so this file must not be pushed into
-- recorded history. Default db push skips versions that sort before the
-- latest remote version. Do not add these versions to a release set and do
-- not apply them with --include-all.
--
-- Stubs match the argument lists the REVOKE names and the return types of
-- the first later CREATE OR REPLACE, except the two driver-document
-- functions. Their row type does not exist yet; 20270117595900 drops those
-- stubs before the real definitions.

DO $$
BEGIN
  IF to_regprocedure('public.increment_credit_wallet(uuid,text,bigint,text,uuid,text)') IS NULL THEN
    EXECUTE $fn$
      CREATE FUNCTION public.increment_credit_wallet(uuid, text, bigint, text, uuid, text)
      RETURNS TABLE(balance bigint, transaction_id uuid)
      LANGUAGE sql
      AS $body$ SELECT NULL::bigint, NULL::uuid /* replay_stub */ $body$
    $fn$;
  END IF;

  IF to_regprocedure('public.get_boost_control_center()') IS NULL THEN
    EXECUTE $fn$
      CREATE FUNCTION public.get_boost_control_center()
      RETURNS jsonb
      LANGUAGE sql
      AS $body$ SELECT '{}'::jsonb /* replay_stub */ $body$
    $fn$;
  END IF;

  IF to_regprocedure('public.driver_kyc_reopen_submission(uuid,text)') IS NULL THEN
    EXECUTE $fn$
      CREATE FUNCTION public.driver_kyc_reopen_submission(uuid, text)
      RETURNS public.driver_kyc_submissions
      LANGUAGE plpgsql
      AS $body$
      BEGIN
        -- replay_stub
        RETURN NULL;
      END;
      $body$
    $fn$;
  END IF;

  IF to_regprocedure('public.platform_review_driver_kyc_submission(uuid,text,text)') IS NULL THEN
    EXECUTE $fn$
      CREATE FUNCTION public.platform_review_driver_kyc_submission(uuid, text, text)
      RETURNS public.driver_kyc_submissions
      LANGUAGE plpgsql
      AS $body$
      BEGIN
        -- replay_stub
        RETURN NULL;
      END;
      $body$
    $fn$;
  END IF;

  IF to_regprocedure('public.platform_approve_driver_kyc_document(uuid,text)') IS NULL THEN
    EXECUTE $fn$
      CREATE FUNCTION public.platform_approve_driver_kyc_document(uuid, text)
      RETURNS void
      LANGUAGE sql
      AS $body$ SELECT NULL::void /* replay_stub */ $body$
    $fn$;
  END IF;

  IF to_regprocedure('public.platform_reject_driver_kyc_document(uuid,text)') IS NULL THEN
    EXECUTE $fn$
      CREATE FUNCTION public.platform_reject_driver_kyc_document(uuid, text)
      RETURNS void
      LANGUAGE sql
      AS $body$ SELECT NULL::void /* replay_stub */ $body$
    $fn$;
  END IF;
END $$;
