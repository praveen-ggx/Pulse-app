-- Fix: Ground Ops could not read any trip row directly.
-- trips_ground_ops_select_assigned checks the trip's warehouse by joining
-- public.indents, but "Org members can manage indents" deliberately hides every
-- indent from ground_ops. Inside the policy that join runs as the caller, so it
-- always returned nothing and every direct trips read (compliance hold / decline
-- flags, etc.) came back empty. Only SECURITY DEFINER RPCs (get_trips_for_org,
-- get_trips_delta, get_trip_detail_bundle) showed their trips.
--
-- The warehouse check moves into a SECURITY DEFINER helper (same logic as the
-- policy and get_trips_for_org), so indents stay hidden from Ground Ops while
-- their warehouse-scoped trips become readable. No data changes.

CREATE OR REPLACE FUNCTION public.ground_ops_can_see_trip(p_org_id uuid, p_indent_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT p_indent_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.organization_members om
    JOIN public.organization_member_warehouses omw ON omw.organization_member_id = om.id
    JOIN public.indents i
      ON i.id = p_indent_id
     AND i.organization_id = p_org_id
    WHERE om.organization_id = p_org_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
      AND COALESCE(om.permissions ->> 'platformRole', '') = 'ground_ops'
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
  );
$function$;

REVOKE ALL ON FUNCTION public.ground_ops_can_see_trip(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ground_ops_can_see_trip(uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS trips_ground_ops_select_assigned ON public.trips;
CREATE POLICY trips_ground_ops_select_assigned ON public.trips
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = trips.organization_id
        AND om.user_id = (SELECT auth.uid())
        AND om.status = 'active'
        AND COALESCE(om.permissions ->> 'platformRole', '') = 'ground_ops'
    )
    AND public.ground_ops_can_see_trip(trips.organization_id, trips.indent_id)
  );
