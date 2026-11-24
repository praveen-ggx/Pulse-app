-- 20270917100000 recreates org_member_warehouses_staff_manage after
-- 20261029171316 has already replaced that policy with owner/admin writes.
-- On a clean replay the later file would put the broader staff write back.
-- This restores the department-manager rule: owners and admins write,
-- department managers read their teammates, and a member can still read
-- their own rows through the self-select policy. Existing databases that
-- already have the admin policy get the same statements again.
-- No anonymous grant.

SET LOCAL lock_timeout = '5s';

DROP POLICY IF EXISTS "org_member_warehouses_staff_manage" ON public.organization_member_warehouses;
DROP POLICY IF EXISTS "org_member_warehouses_admin_manage" ON public.organization_member_warehouses;
CREATE POLICY "org_member_warehouses_admin_manage" ON public.organization_member_warehouses
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.organization_members om
    WHERE om.id = organization_member_warehouses.organization_member_id
      AND public.is_org_admin(om.organization_id)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.organization_members om
    JOIN public.client_warehouses cw
      ON cw.id = organization_member_warehouses.warehouse_id
     AND cw.organization_id = om.organization_id
     AND cw.deleted_at IS NULL
    WHERE om.id = organization_member_warehouses.organization_member_id
      AND public.is_org_admin(om.organization_id)
  )
);

DROP POLICY IF EXISTS "org_member_warehouses_manager_select" ON public.organization_member_warehouses;
CREATE POLICY "org_member_warehouses_manager_select" ON public.organization_member_warehouses
FOR SELECT TO authenticated
USING (public.can_manage_member(organization_member_id));
