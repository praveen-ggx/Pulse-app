-- Trip vault reads already use can_read_trip_document (trip_documents_select_fast).
-- Inserts were left on trip_documents_org_member_insert, which inlines the
-- ground-ops warehouse/indent/sales-order nest into every upload. That is the
-- same shape that made a small trip_documents read take 60s on 2026-09-21.
-- Same rule, evaluated once inside a definer function: ordinary members return
-- before the warehouse lookup; ground_ops still needs the upload flag and a
-- warehouse on the trip's indent.

CREATE OR REPLACE FUNCTION public.can_insert_trip_document(p_trip_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_org uuid;
  v_indent uuid;
BEGIN
  IF v_uid IS NULL OR p_trip_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT t.organization_id, t.indent_id
    INTO v_org, v_indent
  FROM public.trips t
  WHERE t.id = p_trip_id;

  IF v_org IS NULL THEN
    RETURN false;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.organization_members om
    WHERE om.organization_id = v_org
      AND om.user_id = v_uid
      AND om.status = 'active'
      AND COALESCE(om.permissions ->> 'platformRole', '') <> 'ground_ops'
  ) THEN
    RETURN true;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.organization_members om
    JOIN public.organizations o ON o.id = om.organization_id
    WHERE om.organization_id = v_org
      AND om.user_id = v_uid
      AND om.status = 'active'
      AND COALESCE(om.permissions ->> 'platformRole', '') = 'ground_ops'
      AND COALESCE((o.settings ->> 'groundOpsDocUploadEnabled')::boolean, false) IS TRUE
  ) THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.organization_members om
    JOIN public.organization_member_warehouses omw
      ON omw.organization_member_id = om.id
    JOIN public.indents i ON i.id = v_indent
    WHERE om.organization_id = v_org
      AND om.user_id = v_uid
      AND om.status = 'active'
      AND (
        i.warehouse_id = omw.warehouse_id
        OR EXISTS (
          SELECT 1
          FROM public.sales_orders so
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
END;
$$;

COMMENT ON FUNCTION public.can_insert_trip_document(uuid) IS
  'Trip vault upload check. Non-ground-ops org members pass immediately. Ground ops need groundOpsDocUploadEnabled and a warehouse on the trip indent.';

REVOKE ALL ON FUNCTION public.can_insert_trip_document(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_insert_trip_document(uuid) TO authenticated, service_role;

-- Heavy SELECT policy is already absent on prod (reads use trip_documents_select_fast).
-- Drop it here so a replay of the ground-ops migrations does not put it back.
DROP POLICY IF EXISTS "trip_documents_org_member_select" ON public.trip_documents;

DROP POLICY IF EXISTS "trip_documents_org_member_insert" ON public.trip_documents;
CREATE POLICY "trip_documents_org_member_insert" ON public.trip_documents
  FOR INSERT
  TO authenticated
  WITH CHECK (public.can_insert_trip_document(trip_id));
