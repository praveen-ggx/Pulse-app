-- Compliance / Advance "Truck type" must follow the contract indent (and its
-- lane when the indent type is blank), not the assigned vehicle master.
-- Wrong vehicle size/type (e.g. Closed Container · 24 MT on a 20 FT Apollo
-- indent) was showing on Advance Payment and causing Finance "truck type
-- mismatch" rejects even when rates matched the indent.
--
-- Fallback: when there is no indent/lane type, keep the previous
-- "vehicle_type · vehicle_size" label so asset / non-indent trips still work.
-- Signature and grants unchanged.

SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.get_compliance_list_trip_facts(p_viewer_org_id uuid, p_trip_ids uuid[])
 RETURNS TABLE(trip_id uuid, vehicle_id uuid, truck_type text, supplier_name text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
      NULLIF(
        COALESCE(
          NULLIF(btrim(ind.vehicle_type), ''),
          NULLIF(btrim(lane.vehicle_type), ''),
          NULLIF(
            concat_ws(
              ' · ',
              NULLIF(btrim(v.vehicle_type), ''),
              NULLIF(btrim(v.vehicle_size), '')
            ),
            ''
          )
        ),
        ''
      ),
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
    LEFT JOIN public.indents ind
      ON ind.id = COALESCE(tr.indent_id, tr.source_indent_id)
    LEFT JOIN public.client_lane_rates lane
      ON lane.id = ind.lane_id
     AND lane.deleted_at IS NULL
    LEFT JOIN public.vehicles v ON v.id = tr.vehicle_id
    LEFT JOIN public.suppliers s ON s.id = tr.supplier_id
    LEFT JOIN public.organizations lo ON lo.id = s.linked_organization_id
    ORDER BY tr.id;
END;
$function$;

COMMENT ON FUNCTION public.get_compliance_list_trip_facts(uuid, uuid[]) IS
  'Compliance list truck type + supplier label. Truck type prefers indent.vehicle_type, then lane.vehicle_type, then assigned vehicle type · size.';

REVOKE EXECUTE ON FUNCTION public.get_compliance_list_trip_facts(uuid, uuid[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_compliance_list_trip_facts(uuid, uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_compliance_list_trip_facts(uuid, uuid[]) TO authenticated;
