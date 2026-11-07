-- DCO review console can read dco_profiles, but profiles RLS only grants
-- SELECT to the person themselves or to driver_kyc.review. Reviewers with
-- dco.review therefore see status and timestamps with "Unknown driver".
-- This function returns the same queue plus the requesting driver's name,
-- phone, and email, gated by can_review_dco(). A matching profiles policy
-- lets the existing two-step join succeed for those same rows.
--
-- dco_profiles is created by 20270310200000. This database validates the
-- LANGUAGE sql body at CREATE FUNCTION time, so both the function and
-- profiles_dco_reviewer_select fail before that table exists. The statements
-- below are unchanged and run only when the table is already present.
-- 20270310280000 drops the policy, replaces this function, and grants
-- authenticated plus service_role.

DO $guard$
BEGIN
  IF to_regclass('public.dco_profiles') IS NULL THEN
    RAISE NOTICE 'dco review queue identity deferred: dco_profiles does not exist yet';
    RETURN;
  END IF;

  EXECUTE $historical_function$
CREATE OR REPLACE FUNCTION public.list_dco_review_queue()
RETURNS TABLE (
  user_id uuid,
  status text,
  requested_at timestamptz,
  reviewed_at timestamptz,
  decision_reason text,
  driver_name text,
  driver_phone text,
  driver_email text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT
    dp.user_id,
    dp.status,
    dp.requested_at,
    dp.reviewed_at,
    dp.decision_reason,
    p.full_name,
    p.phone,
    p.email
  FROM public.dco_profiles dp
  LEFT JOIN public.profiles p ON p.id = dp.user_id
  WHERE public.can_review_dco()
  ORDER BY dp.requested_at DESC;
$function$;
  $historical_function$;

  EXECUTE $historical_grants$
REVOKE ALL ON FUNCTION public.list_dco_review_queue() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_dco_review_queue() FROM anon;
GRANT EXECUTE ON FUNCTION public.list_dco_review_queue() TO authenticated;
  $historical_grants$;

  EXECUTE $historical_policy$
DROP POLICY IF EXISTS profiles_dco_reviewer_select ON public.profiles;
CREATE POLICY profiles_dco_reviewer_select ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    public.has_platform_permission((select auth.uid()), 'dco.review')
    AND EXISTS (
      SELECT 1 FROM public.dco_profiles dp
      WHERE dp.user_id = profiles.id
    )
  );
  $historical_policy$;
END
$guard$;
