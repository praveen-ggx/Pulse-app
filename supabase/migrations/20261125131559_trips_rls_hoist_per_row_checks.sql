-- trips RLS: evaluate two per-user checks once per statement instead of once per row.
--
-- Evidence (prod, read-only, largest org, as an authenticated member):
--   select count(*) from trips  ->  ~195-250 ms for 3,393 rows, 15.9k buffer hits (heap is 349 pages).
--   has_platform_permission() costs ~35 us per call and is_org_staff() ~18 us per call (both are
--   SECURITY DEFINER, so they are never inlined). Both were evaluated once per trips row, because the
--   policy passed a row column (is_org_staff) or sat in an OR with row-dependent terms
--   (has_platform_permission). That per-row cost sits under every trips read: search_trips_for_org,
--   get_trips_for_org, hub lists, compliance reads.
--
-- This migration changes WHERE the checks are computed, never WHAT they allow:
--   1. trips_platform_admin_select: same two has_platform_permission() calls, wrapped in a scalar
--      subquery so Postgres evaluates them once (InitPlan).
--   2. "Org members can manage trips": is_org_staff(organization_id) becomes
--      organization_id IN (SELECT private.rls_staff_org_ids()), a SECURITY DEFINER set function with the
--      exact body of is_org_staff() minus the per-org filter. It runs once and is hashed. The ground_ops
--      exclusion is copied unchanged.
-- Both policies keep their names, commands and roles (ALTER POLICY), so there is no window where a
-- table has no policy. INSERT/UPDATE/DELETE checks use the same expression as before.
--
-- Not changed: supplier / client / driver / ground-ops read policies (the planner already evaluates their
-- subqueries once: loops=1 in EXPLAIN ANALYZE), and every write-only policy.

CREATE OR REPLACE FUNCTION private.rls_staff_org_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT om.organization_id
  FROM public.organization_members om
  WHERE om.user_id = (SELECT auth.uid())
    AND om.status = 'active'
    AND om.role = ANY (ARRAY['owner','admin','member','dispatcher','finance']);
$function$;

REVOKE ALL ON FUNCTION private.rls_staff_org_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.rls_staff_org_ids() TO authenticated;

ALTER POLICY "trips_platform_admin_select" ON public.trips
  USING ((SELECT (
    public.has_platform_permission((SELECT auth.uid()), 'verification.review'::text)
    OR public.has_platform_permission((SELECT auth.uid()), 'verification.approve'::text)
  )));

ALTER POLICY "Org members can manage trips" ON public.trips
  USING (
    organization_id IN (SELECT private.rls_staff_org_ids())
    AND NOT EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = trips.organization_id
        AND om.user_id = (SELECT auth.uid())
        AND om.status = 'active'
        AND COALESCE(om.permissions ->> 'platformRole', '') = 'ground_ops'
    )
  )
  WITH CHECK (
    organization_id IN (SELECT private.rls_staff_org_ids())
    AND NOT EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = trips.organization_id
        AND om.user_id = (SELECT auth.uid())
        AND om.status = 'active'
        AND COALESCE(om.permissions ->> 'platformRole', '') = 'ground_ops'
    )
  );
