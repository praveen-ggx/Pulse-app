-- Install private.compliance_visible_trips after every relation it reads exists.
-- 20261005122431 skips the helper on a fresh database. 20270917100000 creates
-- organization_member_warehouses, but indents.warehouse_id arrives in
-- 20270918100000, so this file follows that column. Sales orders, shipment
-- allocations, and the other columns are earlier. CREATE OR REPLACE keeps the
-- October body on a database that already installed the helper.

SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION private.compliance_visible_trips(
  p_viewer_org_id uuid,
  p_trip_ids uuid[]
)
RETURNS TABLE (trip_id uuid)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT tr.id
  FROM (SELECT DISTINCT req.id FROM unnest(p_trip_ids) AS req(id)) AS req
  JOIN public.trips tr ON tr.id = req.id
  LEFT JOIN public.indents i ON i.id = tr.indent_id
  WHERE tr.deleted_at IS NULL
    -- Caller must be an active member of the viewer org (get_trips_for_org: is_org_member).
    AND EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = p_viewer_org_id
        AND om.user_id = (SELECT auth.uid())
        AND om.status = 'active'
    )
    AND (
      tr.organization_id = p_viewer_org_id
      OR (
        tr.supplier_id IS NOT NULL
        AND tr.indent_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.suppliers s
          WHERE s.id = tr.supplier_id
            AND s.linked_organization_id = p_viewer_org_id
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.trips m
          WHERE m.organization_id = p_viewer_org_id
            AND m.source = 'mover_asset'
            AND m.source_indent_id = tr.indent_id
            AND m.deleted_at IS NULL
        )
      )
    )
    -- Ground-ops members only see trips touching one of their warehouses.
    AND (
      NOT EXISTS (
        SELECT 1 FROM public.organization_members om
        WHERE om.organization_id = p_viewer_org_id
          AND om.user_id = (SELECT auth.uid())
          AND om.status = 'active'
          AND COALESCE(om.permissions ->> 'platformRole', '') = 'ground_ops'
      )
      OR EXISTS (
        SELECT 1
        FROM public.organization_members om3
        JOIN public.organization_member_warehouses omw
          ON omw.organization_member_id = om3.id
        WHERE om3.organization_id = p_viewer_org_id
          AND om3.user_id = (SELECT auth.uid())
          AND om3.status = 'active'
          AND (
            i.warehouse_id = omw.warehouse_id
            OR EXISTS (
              SELECT 1 FROM public.sales_orders so
              WHERE so.id = i.sales_order_id
                AND (so.pickup_warehouse_id = omw.warehouse_id OR so.drop_warehouse_id = omw.warehouse_id)
            )
            OR (
              i.execution_plan_id IS NOT NULL
              AND EXISTS (
                SELECT 1
                FROM public.shipment_allocations sa
                JOIN public.sales_order_lines sol ON sol.id = sa.sales_order_line_id
                JOIN public.sales_orders so2 ON so2.id = sol.sales_order_id
                WHERE sa.execution_plan_id = i.execution_plan_id
                  AND (so2.pickup_warehouse_id = omw.warehouse_id OR so2.drop_warehouse_id = omw.warehouse_id)
              )
            )
          )
      )
    );
$$;

REVOKE ALL ON FUNCTION private.compliance_visible_trips(uuid, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.compliance_visible_trips(uuid, uuid[]) FROM anon;
REVOKE ALL ON FUNCTION private.compliance_visible_trips(uuid, uuid[]) FROM authenticated;
