-- Fresh-install repair for 20260903073017_boost_analytics_guard_hardening.sql.
-- That file rewrites get_boost_control_center only when its source contains
-- the pre-hardening permission check. A fresh database still has the empty
-- replay stub from 20260903061451, so the rewrite aborts. This gives that
-- stub the exact check the rewriter looks for. A function that already has
-- the check, or that is not the replay stub, is left unchanged.
-- 20270106000000 still installs the real function body afterward.

SET LOCAL lock_timeout = '5s';

DO $guard$
DECLARE
  v_src text;
  v_def text;
  v_old text := '  IF (select auth.uid()) IS NOT NULL' || E'\n'
        || '     AND NOT public.has_platform_permission((select auth.uid()), ''analytics.view'') THEN' || E'\n'
        || '    RAISE EXCEPTION ''unauthorized: analytics.view permission required'';' || E'\n'
        || '  END IF;';
BEGIN
  SELECT p.prosrc
    INTO v_src
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
   WHERE p.proname = 'get_boost_control_center'
     AND pg_get_function_identity_arguments(p.oid) = ''
   ORDER BY p.oid
   LIMIT 1;

  IF v_src IS NULL OR position('replay_stub' in v_src) = 0 OR position(v_old in v_src) > 0 THEN
    RETURN;
  END IF;

  EXECUTE $fn$CREATE OR REPLACE FUNCTION public.get_boost_control_center()
RETURNS jsonb
LANGUAGE plpgsql
AS $body$
BEGIN
  IF (select auth.uid()) IS NOT NULL
     AND NOT public.has_platform_permission((select auth.uid()), 'analytics.view') THEN
    RAISE EXCEPTION 'unauthorized: analytics.view permission required';
  END IF;
  RETURN '{}'::jsonb;
END;
$body$
$fn$;

  SELECT pg_get_functiondef(p.oid)
    INTO v_def
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
   WHERE p.proname = 'get_boost_control_center'
     AND pg_get_function_identity_arguments(p.oid) = '';

  IF position(v_old in v_def) = 0 THEN
    RAISE EXCEPTION 'fresh replay boost guard was not stored in the form 20260903073017 searches for: %', v_def;
  END IF;
END
$guard$;
