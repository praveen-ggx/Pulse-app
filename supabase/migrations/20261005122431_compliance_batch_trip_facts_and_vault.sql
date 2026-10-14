-- Compliance list: batch truck-type / supplier-name facts and vehicle vault
-- documents in one call each, replacing per-trip get_vehicle_for_trip_viewer /
-- get_supplier_details / vehicles reads (preprod incident 2026-10-05: one list
-- load issued ~800 requests; three sessions starved the 60-connection DB).
--
-- Security boundary: private.compliance_visible_trips(). It mirrors the
-- visibility predicate of public.get_trips_for_org (the compliance list's only
-- trip source) — own-org trips, supplier-linked indent trips minus mover_asset
-- duplicates, ground-ops warehouse scope — and additionally excludes deleted
-- trips. It deliberately does NOT copy get_vehicle_for_trip_viewer, which has no
-- warehouse scope and also admits client-linked viewers.
--
-- The two public RPCs are SECURITY DEFINER (owner postgres bypasses RLS), so all
-- authorization happens in the helper; they never rely on vehicles/suppliers RLS.
-- get_vehicle_for_trip_viewer and get_supplier_details are unchanged.

-- ── Shared visibility helper (not exposed: private has no anon/authenticated USAGE) ──
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

-- ── Facts: truck type + supplier label per visible trip ──
-- supplier_name mirrors get_supplier_details + the client label
-- (name ?? company_name ?? contact_person ?? "").trim(); NULL when the caller
-- could not read the supplier there (not an active member / owner of its org).
CREATE OR REPLACE FUNCTION public.get_compliance_list_trip_facts(
  p_viewer_org_id uuid,
  p_trip_ids uuid[]
)
RETURNS TABLE (
  trip_id uuid,
  vehicle_id uuid,
  truck_type text,
  supplier_name text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_column
BEGIN
  IF p_trip_ids IS NULL OR cardinality(p_trip_ids) = 0 THEN
    RETURN;
  END IF;
  IF cardinality(p_trip_ids) > 1000 THEN
    RAISE EXCEPTION 'get_compliance_list_trip_facts: at most 1000 trip ids per call (got %)', cardinality(p_trip_ids)
      USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT
    tr.id,
    tr.vehicle_id,
    NULLIF(btrim(v.vehicle_type), ''),
    CASE
      WHEN s.id IS NULL THEN NULL
      WHEN NOT (
        EXISTS (
          SELECT 1 FROM public.organization_members om
          WHERE om.organization_id = s.organization_id
            AND om.user_id = (SELECT auth.uid())
            AND om.status = 'active'
        )
        OR EXISTS (
          SELECT 1 FROM public.organizations ow
          WHERE ow.id = s.organization_id
            AND ow.owner_id = (SELECT auth.uid())
        )
      ) THEN NULL
      WHEN s.supplier_type = 'integrated' AND s.linked_organization_id IS NOT NULL
        THEN btrim(COALESCE(NULLIF(btrim(s.name), ''), NULLIF(btrim(lo.name), ''), s.company_name, 'Connected'))
      ELSE btrim(COALESCE(s.name, s.company_name, s.contact_person, ''))
    END
  FROM private.compliance_visible_trips(p_viewer_org_id, p_trip_ids) vt
  JOIN public.trips tr ON tr.id = vt.trip_id
  LEFT JOIN public.vehicles v ON v.id = tr.vehicle_id
  LEFT JOIN public.suppliers s ON s.id = tr.supplier_id
  LEFT JOIN public.organizations lo ON lo.id = s.linked_organization_id
  ORDER BY tr.id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_compliance_list_trip_facts(uuid, uuid[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_compliance_list_trip_facts(uuid, uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_compliance_list_trip_facts(uuid, uuid[]) TO authenticated;

-- ── Vault: vehicle number + raw documents JSON per visible trip with a vehicle ──
-- Empty / NULL documents are returned as-is (a resolved vehicle with no vault docs).
-- trips.owner_vehicle_id references owner_vehicles, not vehicles, and is not used.
CREATE OR REPLACE FUNCTION public.get_compliance_vehicle_vault_for_trips(
  p_viewer_org_id uuid,
  p_trip_ids uuid[]
)
RETURNS TABLE (
  trip_id uuid,
  vehicle_id uuid,
  vehicle_number text,
  documents jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_column
BEGIN
  IF p_trip_ids IS NULL OR cardinality(p_trip_ids) = 0 THEN
    RETURN;
  END IF;
  IF cardinality(p_trip_ids) > 1000 THEN
    RAISE EXCEPTION 'get_compliance_vehicle_vault_for_trips: at most 1000 trip ids per call (got %)', cardinality(p_trip_ids)
      USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT tr.id, v.id, v.vehicle_number, v.documents
  FROM private.compliance_visible_trips(p_viewer_org_id, p_trip_ids) vt
  JOIN public.trips tr ON tr.id = vt.trip_id
  JOIN public.vehicles v ON v.id = tr.vehicle_id
  ORDER BY tr.id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_compliance_vehicle_vault_for_trips(uuid, uuid[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_compliance_vehicle_vault_for_trips(uuid, uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_compliance_vehicle_vault_for_trips(uuid, uuid[]) TO authenticated;
