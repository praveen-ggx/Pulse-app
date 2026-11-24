-- Prerequisite for 20261113104714 on a clean replay.
--
-- network_pool_bid_commits_select calls is_org_staff(uuid) inside a policy,
-- and PostgreSQL resolves that function when the policy is created. The
-- recovered definition lives in 20270916120000, which sorts later. This file
-- installs that same body. The later file still replaces it, so an environment
-- that already has the function is rewritten to the same definition and keeps
-- its existing privileges. No grant is added.

SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.is_org_staff(org_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = org_id
      AND user_id = (SELECT auth.uid())
      AND status = 'active'
      AND role = ANY (ARRAY['owner','admin','member','dispatcher','finance'])
  );
$function$
