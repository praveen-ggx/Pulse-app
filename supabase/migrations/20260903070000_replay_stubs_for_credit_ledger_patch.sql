-- Local replay only. Not a production change and not part of a release set.
--
-- 20260903070151 patches four Reach functions that are first created in
-- December 2026. A chronological replay raises
-- "expected function public.publish_reach_campaign to exist".
-- Production applied 20260903070151 when those functions already existed,
-- so this file must not be pushed. Default db push skips versions that sort
-- before the latest remote version. Do not add this version to a release set
-- and do not apply it with --include-all.
--
-- Each stub is plpgsql with a BEGIN so the patch can splice its marker.
-- Later CREATE OR REPLACE statements replace these signatures.

DO $$
BEGIN
  IF to_regprocedure('public.publish_reach_campaign(uuid,uuid,uuid,text)') IS NULL THEN
    EXECUTE $fn$
      CREATE FUNCTION public.publish_reach_campaign(uuid, uuid, uuid, text)
      RETURNS jsonb
      LANGUAGE plpgsql
      AS $body$
BEGIN
  -- replay_stub
  RETURN NULL;
END;
$body$
    $fn$;
  END IF;

  IF to_regprocedure('public.upgrade_reach_campaign(uuid,uuid,text)') IS NULL THEN
    EXECUTE $fn$
      CREATE FUNCTION public.upgrade_reach_campaign(uuid, uuid, text)
      RETURNS jsonb
      LANGUAGE plpgsql
      AS $body$
BEGIN
  -- replay_stub
  RETURN NULL;
END;
$body$
    $fn$;
  END IF;

  IF to_regprocedure('public.fn_release_reach_referral_escrow(uuid)') IS NULL THEN
    EXECUTE $fn$
      CREATE FUNCTION public.fn_release_reach_referral_escrow(uuid)
      RETURNS void
      LANGUAGE plpgsql
      AS $body$
BEGIN
  -- replay_stub
  RETURN;
END;
$body$
    $fn$;
  END IF;

  IF to_regprocedure('public.platform_approve_verification(uuid,text)') IS NULL THEN
    EXECUTE $fn$
      CREATE FUNCTION public.platform_approve_verification(uuid, text)
      RETURNS jsonb
      LANGUAGE plpgsql
      AS $body$
BEGIN
  -- replay_stub
  RETURN NULL;
END;
$body$
    $fn$;
  END IF;
END $$;
