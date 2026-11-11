-- Ground Ops can upload an e-way bill during loading, but trip_documents
-- UPDATE and DELETE exclude that role entirely. The number write then matches
-- no row, and the wrong file cannot be removed. The lock trigger already
-- allows a correction while the trip is still at loading (or for 15 minutes
-- on the caller's own upload). These policies only open e-way rows that
-- trigger already allows. In transit, compliance approved, and advance
-- posted stay blocked. Other document types are unchanged.

SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.ground_ops_can_correct_eway_bill(
  p_trip_id uuid,
  p_document_status text,
  p_uploaded_by uuid,
  p_uploaded_at timestamptz
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.trips t
      JOIN public.organization_members om
        ON om.organization_id = t.organization_id
      WHERE t.id = p_trip_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
        AND om.permissions ->> 'platformRole' = 'ground_ops'
    )
    AND (
      public.ground_ops_trip_document_lock_reason(p_trip_id, p_document_status) IS NULL
      OR (
        p_uploaded_by = auth.uid()
        AND p_uploaded_at > now() - interval '15 minutes'
      )
    );
$$;

REVOKE ALL ON FUNCTION public.ground_ops_can_correct_eway_bill(uuid, text, uuid, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ground_ops_can_correct_eway_bill(uuid, text, uuid, timestamptz) TO authenticated;

COMMENT ON FUNCTION public.ground_ops_can_correct_eway_bill(uuid, text, uuid, timestamptz) IS
  'True when the calling Ground Ops member may correct an e-way bill: the trip is not locked, or this is their own upload from the last 15 minutes.';

DROP POLICY IF EXISTS trip_documents_ground_ops_eway_update ON public.trip_documents;
CREATE POLICY trip_documents_ground_ops_eway_update
  ON public.trip_documents
  FOR UPDATE
  TO authenticated
  USING (
    document_type = 'eway_bill'
    AND public.ground_ops_can_correct_eway_bill(trip_id, status, uploaded_by, uploaded_at)
  )
  WITH CHECK (
    document_type = 'eway_bill'
    AND public.ground_ops_can_correct_eway_bill(trip_id, status, uploaded_by, uploaded_at)
  );

DROP POLICY IF EXISTS trip_documents_ground_ops_eway_delete ON public.trip_documents;
CREATE POLICY trip_documents_ground_ops_eway_delete
  ON public.trip_documents
  FOR DELETE
  TO authenticated
  USING (
    document_type = 'eway_bill'
    AND public.ground_ops_can_correct_eway_bill(trip_id, status, uploaded_by, uploaded_at)
  );

-- Storage delete runs after the row is gone, so it cannot look the row up.
-- While the trip is unlocked, Ground Ops may remove an object that lives in
-- the trip's eway_bill folder. Owners and other roles keep the previous rule.
CREATE OR REPLACE FUNCTION public.fn_trip_documents_storage_allowed(
  p_name text,
  p_op text,
  p_owner uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_parts text[];
  v_trip uuid;
  v_conv uuid;
BEGIN
  IF v_uid IS NULL OR p_op NOT IN ('select', 'insert', 'update', 'delete') THEN
    RETURN false;
  END IF;

  v_parts := storage.foldername(p_name);

  IF v_parts[1] = 'trip_chat' THEN
    BEGIN
      v_conv := v_parts[2]::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      RETURN false;
    END;

    IF NOT EXISTS (
      SELECT 1
      FROM public.trip_conversations tc
      JOIN public.trips t ON t.id = tc.trip_id
      WHERE tc.id = v_conv
        AND (
          public.is_org_member(t.organization_id)
          OR EXISTS (
            SELECT 1
            FROM public.drivers d
            WHERE d.id = t.driver_id
              AND d.user_id = v_uid
          )
          OR EXISTS (
            SELECT 1
            FROM public.suppliers s
            WHERE s.id = t.supplier_id
              AND s.linked_organization_id IS NOT NULL
              AND public.is_org_member(s.linked_organization_id)
          )
          OR EXISTS (
            SELECT 1
            FROM public.clients c
            WHERE c.id = t.client_id
              AND c.linked_organization_id IS NOT NULL
              AND public.is_org_member(c.linked_organization_id)
          )
        )
    ) THEN
      RETURN false;
    END IF;

    IF p_op IN ('select', 'insert') THEN
      RETURN true;
    END IF;
    IF p_op = 'update' THEN
      RETURN p_owner IS NOT DISTINCT FROM v_uid;
    END IF;
    IF p_op = 'delete' THEN
      RETURN p_owner IS NOT DISTINCT FROM v_uid
        OR EXISTS (
          SELECT 1
          FROM public.trip_conversations tc
          JOIN public.trips t ON t.id = tc.trip_id
          JOIN public.drivers d ON d.id = t.driver_id
          WHERE tc.id = v_conv
            AND d.user_id = v_uid
        );
    END IF;
    RETURN false;
  END IF;

  BEGIN
    v_trip := v_parts[1]::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN false;
  END;

  IF NOT EXISTS (
    SELECT 1
    FROM public.trips t
    WHERE t.id = v_trip
      AND (
        public.is_org_member(t.organization_id)
        OR EXISTS (
          SELECT 1
          FROM public.suppliers s
          WHERE s.id = t.supplier_id
            AND s.linked_organization_id IS NOT NULL
            AND public.is_org_member(s.linked_organization_id)
        )
        OR EXISTS (
          SELECT 1
          FROM public.clients c
          WHERE c.id = t.client_id
            AND c.linked_organization_id IS NOT NULL
            AND public.is_org_member(c.linked_organization_id)
        )
        OR EXISTS (
          SELECT 1
          FROM public.drivers d
          WHERE d.id = t.driver_id
            AND d.user_id = v_uid
        )
      )
  ) THEN
    RETURN false;
  END IF;

  IF p_op = 'select' THEN
    RETURN true;
  END IF;

  IF p_op = 'insert' THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.trips t
      WHERE t.id = v_trip
        AND (
          EXISTS (
            SELECT 1
            FROM public.drivers d
            WHERE d.id = t.driver_id
              AND d.user_id = v_uid
          )
          OR EXISTS (
            SELECT 1
            FROM public.suppliers s
            WHERE s.id = t.supplier_id
              AND s.linked_organization_id IS NOT NULL
              AND public.is_org_member(s.linked_organization_id)
          )
          OR EXISTS (
            SELECT 1
            FROM public.clients c
            WHERE c.id = t.client_id
              AND c.linked_organization_id IS NOT NULL
              AND public.is_org_member(c.linked_organization_id)
          )
          OR EXISTS (
            SELECT 1
            FROM public.organization_members om
            JOIN public.organizations o ON o.id = om.organization_id
            WHERE om.organization_id = t.organization_id
              AND om.user_id = v_uid
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
                          SELECT 1
                          FROM public.sales_orders so
                          WHERE so.id = i.sales_order_id
                            AND (
                              so.pickup_warehouse_id = omw.warehouse_id
                              OR so.drop_warehouse_id = omw.warehouse_id
                            )
                        )
                        OR (
                          i.execution_plan_id IS NOT NULL
                          AND EXISTS (
                            SELECT 1
                            FROM public.shipment_allocations sa
                            JOIN public.sales_order_lines sol ON sol.id = sa.sales_order_line_id
                            JOIN public.sales_orders so2 ON so2.id = sol.sales_order_id
                            WHERE sa.execution_plan_id = i.execution_plan_id
                              AND (
                                so2.pickup_warehouse_id = omw.warehouse_id
                                OR so2.drop_warehouse_id = omw.warehouse_id
                              )
                          )
                        )
                      )
                  )
                )
              )
          )
        )
    );
  END IF;

  IF p_op = 'update' THEN
    RETURN p_owner IS NOT DISTINCT FROM v_uid;
  END IF;

  IF p_op = 'delete' THEN
    RETURN p_owner IS NOT DISTINCT FROM v_uid
      OR EXISTS (
        SELECT 1
        FROM public.trips t
        JOIN public.drivers d ON d.id = t.driver_id
        WHERE t.id = v_trip
          AND d.user_id = v_uid
      )
      OR EXISTS (
        SELECT 1
        FROM public.trips t
        JOIN public.organization_members om ON om.organization_id = t.organization_id
        WHERE t.id = v_trip
          AND om.user_id = v_uid
          AND om.status = 'active'
          AND COALESCE(om.permissions ->> 'platformRole', '') <> 'ground_ops'
      )
      OR (
        coalesce(v_parts[2], '') = 'eway_bill'
        AND public.ground_ops_can_correct_eway_bill(v_trip, NULL, NULL, NULL)
      );
  END IF;

  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_trip_documents_storage_allowed(text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_trip_documents_storage_allowed(text, text, uuid) TO authenticated;
