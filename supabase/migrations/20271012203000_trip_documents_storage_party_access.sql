-- Party access for the private trip-documents bucket.
--
-- The bucket stays private. These policies replace the bucket-wide authenticated
-- SELECT and INSERT policies. A signed-in user who only knows a path can no
-- longer read or upload it.
--
-- Object keys:
--   {trip_id}/{document_type}/{file}
--   trip_chat/{trip_conversation_id}/{file}
-- Any other first folder is denied.
--
-- Trip files follow the same parties as trip_documents:
--   read  — active trip-org member (including ground ops), linked client,
--           linked supplier, assigned driver. A null or stale
--           linked_organization_id grants nothing.
--   insert — assigned driver, linked client, linked supplier, or a trip-org
--           member. Ground ops may insert only when the org toggle is on and
--           the member's warehouse matches the trip indent, matching
--           trip_documents_org_member_insert.
--   update — the object owner, and only when that owner can still read it.
--   delete — the object owner, the assigned driver, or a trip-org member who
--           is not ground ops.
--
-- Chat files under trip_chat/ use the conversation's trip. Read and insert
-- follow the same parties. Update and delete stay with the owner or the
-- assigned driver.

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
      );
  END IF;

  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_trip_documents_storage_allowed(text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_trip_documents_storage_allowed(text, text, uuid) TO authenticated;

DROP POLICY IF EXISTS "Allow authenticated reads to trip-documents" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated uploads to trip-documents" ON storage.objects;
DROP POLICY IF EXISTS "Suppliers can list storage folders" ON storage.objects;
DROP POLICY IF EXISTS "Suppliers can view storage files" ON storage.objects;
DROP POLICY IF EXISTS "trip-documents: org-member via security-definer" ON storage.objects;
DROP POLICY IF EXISTS "Org members can read trip documents by folder" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated users to update their files in trip-documents" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated users to delete their files in trip-documents" ON storage.objects;
DROP POLICY IF EXISTS "Trip access can delete trip-documents objects in trip folder" ON storage.objects;
DROP POLICY IF EXISTS "Supplier can manage trip document files" ON storage.objects;

-- owner_id is text on some storage schemas and uuid on others. Cast through
-- text so the policy resolves on both. A blank owner matches nobody.

CREATE POLICY "trip-documents: party select"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'trip-documents'
    AND public.fn_trip_documents_storage_allowed(name, 'select', NULLIF(btrim(owner_id::text), '')::uuid)
  );

CREATE POLICY "trip-documents: party insert"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'trip-documents'
    AND public.fn_trip_documents_storage_allowed(name, 'insert', NULLIF(btrim(owner_id::text), '')::uuid)
  );

CREATE POLICY "trip-documents: party update"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'trip-documents'
    AND public.fn_trip_documents_storage_allowed(name, 'update', NULLIF(btrim(owner_id::text), '')::uuid)
  )
  WITH CHECK (
    bucket_id = 'trip-documents'
    AND public.fn_trip_documents_storage_allowed(name, 'update', NULLIF(btrim(owner_id::text), '')::uuid)
  );

CREATE POLICY "trip-documents: party delete"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'trip-documents'
    AND public.fn_trip_documents_storage_allowed(name, 'delete', NULLIF(btrim(owner_id::text), '')::uuid)
  );
