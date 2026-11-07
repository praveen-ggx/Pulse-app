-- Production is_org_staff, recovered from the 2026-10-06 Gate 1A catalog dump.
-- Required before 20270917100000 creates policies that call it.
-- No GRANT or REVOKE: production ACL for this function was not in that dump.

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
