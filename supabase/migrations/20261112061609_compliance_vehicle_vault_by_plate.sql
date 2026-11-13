-- Compliance: batch-read vehicle vault documents by normalized plate number
-- for trips that have vehicle_display_number but no vehicle_id FK.
--
-- Why: PR #96 changed the plate-fallback query from .eq(organization_id) to
-- .in(vehicle_number), but the query runs through the Supabase client under
-- RLS. The vehicles table RLS policy is_org_staff(organization_id) silently
-- drops cross-org results, so partner/supplier vehicles are never found.
--
-- Fix: SECURITY DEFINER RPC that authorizes the viewer via
-- private.compliance_visible_trips (same as the existing vehicle vault and
-- driver docs RPCs), then matches vehicles by normalized plate number within
-- the trip's supplier's linked organization only.
--
-- Security model:
--   1. Caller must be an active org member (compliance_visible_trips checks).
--   2. Trip must belong to the viewer's org OR be a linked supplier trip.
--   3. Vehicle is matched ONLY within the trip's supplier's linked_organization_id
--      — never an arbitrary cross-org lookup.
--   4. If the supplier has no linked_organization_id, or the vehicle is not in
--      that org, the trip simply returns no row (same as unregistered vehicles).
--   5. Plate normalization: uppercase, alphanumeric only — matches the
--      TypeScript normalizeVaultVehicleNumber function.

CREATE OR REPLACE FUNCTION public.get_compliance_vehicle_vault_by_plate(
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
    RAISE EXCEPTION 'get_compliance_vehicle_vault_by_plate: at most 1000 trip ids per call (got %)', cardinality(p_trip_ids)
      USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH visible AS (
    SELECT vt.trip_id
    FROM private.compliance_visible_trips(p_viewer_org_id, p_trip_ids) vt
  ),
  plate_trips AS (
    SELECT
      tr.id AS trip_id,
      tr.supplier_id,
      upper(regexp_replace(tr.vehicle_display_number, '[^A-Za-z0-9]', '', 'g')) AS norm_plate
    FROM visible v
    JOIN public.trips tr ON tr.id = v.trip_id
    WHERE tr.vehicle_id IS NULL
      AND tr.vehicle_display_number IS NOT NULL
      AND btrim(tr.vehicle_display_number) != ''
  ),
  supplier_orgs AS (
    SELECT
      pt.trip_id,
      pt.norm_plate,
      s.linked_organization_id AS vehicle_org_id
    FROM plate_trips pt
    JOIN public.suppliers s ON s.id = pt.supplier_id
    WHERE s.linked_organization_id IS NOT NULL
  )
  SELECT DISTINCT ON (so.trip_id)
    so.trip_id,
    v.id AS vehicle_id,
    v.vehicle_number,
    v.documents
  FROM supplier_orgs so
  JOIN public.vehicles v
    ON v.organization_id = so.vehicle_org_id
   AND upper(regexp_replace(v.vehicle_number, '[^A-Za-z0-9]', '', 'g')) = so.norm_plate
   AND v.deleted_at IS NULL
  ORDER BY so.trip_id, v.created_at DESC, v.id DESC;
END;
$$;

COMMENT ON FUNCTION public.get_compliance_vehicle_vault_by_plate(uuid, uuid[]) IS
  'Vehicle vault docs for compliance-visible trips without vehicle_id: matches by normalized plate within the trip supplier linked org. Authorized via private.compliance_visible_trips.';

REVOKE ALL ON FUNCTION public.get_compliance_vehicle_vault_by_plate(uuid, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_compliance_vehicle_vault_by_plate(uuid, uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_compliance_vehicle_vault_by_plate(uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_compliance_vehicle_vault_by_plate(uuid, uuid[]) TO service_role;
