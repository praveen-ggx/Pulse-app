-- Disposable local rehearsal only. The runner wraps this in BEGIN/ROLLBACK.
-- The partial local database stops before later trip_documents columns and
-- warehouse tables exist, so this preparation adds only what the two
-- unapplied authorization migrations read. It also installs the org-member
-- policies those migrations expect to find already in place.

ALTER TABLE public.trip_documents
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS verified_by uuid,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejection_reason text,
  ADD COLUMN IF NOT EXISTS document_number text,
  ADD COLUMN IF NOT EXISTS stop_id uuid,
  ADD COLUMN IF NOT EXISTS ocr_job_id uuid,
  ADD COLUMN IF NOT EXISTS source_entity_document_id uuid;

ALTER TABLE public.indents
  ADD COLUMN IF NOT EXISTS warehouse_id uuid,
  ADD COLUMN IF NOT EXISTS sales_order_id uuid,
  ADD COLUMN IF NOT EXISTS execution_plan_id uuid;

CREATE TABLE IF NOT EXISTS public.organization_member_warehouses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_member_id uuid NOT NULL,
  warehouse_id uuid NOT NULL
);

CREATE TABLE IF NOT EXISTS public.sales_orders (
  id uuid PRIMARY KEY,
  pickup_warehouse_id uuid,
  drop_warehouse_id uuid
);

CREATE TABLE IF NOT EXISTS public.sales_order_lines (
  id uuid PRIMARY KEY,
  sales_order_id uuid
);

CREATE TABLE IF NOT EXISTS public.shipment_allocations (
  id uuid PRIMARY KEY,
  execution_plan_id uuid,
  sales_order_line_id uuid
);

CREATE OR REPLACE FUNCTION public.has_member_surface(p_org_id uuid, p_surface_id text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_status text;
  v_role text;
  v_grant boolean;
BEGIN
  IF v_uid IS NULL THEN
    RETURN false;
  END IF;
  SELECT status, role, (permissions->'surfaces'->>p_surface_id)::boolean
    INTO v_status, v_role, v_grant
    FROM public.organization_members
   WHERE organization_id = p_org_id
     AND user_id = v_uid;
  IF v_status IS NULL OR v_status <> 'active' THEN
    RETURN false;
  END IF;
  IF v_role IN ('owner', 'admin') THEN
    RETURN true;
  END IF;
  RETURN COALESCE(v_grant, false);
END;
$$;

DROP POLICY IF EXISTS "trip_documents_org_member_manage" ON public.trip_documents;
DROP POLICY IF EXISTS "Users can read trip_documents for trips they can read" ON public.trip_documents;
DROP POLICY IF EXISTS trip_documents_driver_select ON public.trip_documents;
DROP POLICY IF EXISTS trip_documents_org_member_select ON public.trip_documents;
DROP POLICY IF EXISTS trip_documents_org_member_insert ON public.trip_documents;
DROP POLICY IF EXISTS trip_documents_org_member_update ON public.trip_documents;
DROP POLICY IF EXISTS trip_documents_org_member_delete ON public.trip_documents;

CREATE POLICY trip_documents_org_member_update ON public.trip_documents
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.trips t
    JOIN public.organization_members om ON om.organization_id = t.organization_id
    WHERE t.id = trip_documents.trip_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
      AND COALESCE(om.permissions ->> 'platformRole', '') <> 'ground_ops'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.trips t
    JOIN public.organization_members om ON om.organization_id = t.organization_id
    WHERE t.id = trip_documents.trip_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
      AND COALESCE(om.permissions ->> 'platformRole', '') <> 'ground_ops'
  )
);

CREATE POLICY trip_documents_org_member_delete ON public.trip_documents
FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.trips t
    JOIN public.organization_members om ON om.organization_id = t.organization_id
    WHERE t.id = trip_documents.trip_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
      AND COALESCE(om.permissions ->> 'platformRole', '') <> 'ground_ops'
  )
);

CREATE POLICY trip_documents_org_member_insert ON public.trip_documents
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.trips t
    JOIN public.organization_members om ON om.organization_id = t.organization_id
    JOIN public.organizations o ON o.id = om.organization_id
    WHERE t.id = trip_documents.trip_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
      AND (
        COALESCE(om.permissions ->> 'platformRole', '') <> 'ground_ops'
        OR (
          COALESCE((o.settings ->> 'groundOpsDocUploadEnabled')::boolean, false) IS TRUE
          AND EXISTS (
            SELECT 1
            FROM public.organization_member_warehouses omw
            JOIN public.indents i ON i.id = t.indent_id
            WHERE omw.organization_member_id = om.id
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
        )
      )
  )
);
