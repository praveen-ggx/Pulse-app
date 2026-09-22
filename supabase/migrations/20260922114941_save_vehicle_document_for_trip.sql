-- Allow a trip's own org to save vehicle vault documents (RC / insurance / FC / PUC)
-- for a vehicle on that trip, even when the truck is owned by a vendor org.
--
-- ROOT CAUSE: vehicles RLS requires is_org_member(vehicles.organization_id).
-- Trip orgs can already *read* cross-org trucks via get_vehicle_for_trip_viewer
-- (SECURITY DEFINER), but UPDATE on vehicles.documents returns 0 rows — so
-- "Save to vault" from Manifest Management silently fails after storage upload.
--
-- SCOPE: same legitimacy check as get_vehicle_for_trip_viewer. Merges one
-- compliance doc type into vehicles.documents JSONB. Storage object must already
-- exist (client uploads under the viewer org's vehicle-documents folder).

CREATE OR REPLACE FUNCTION public.save_vehicle_document_for_trip(
  p_trip_id uuid,
  p_vehicle_id uuid,
  p_viewer_org_id uuid,
  p_doc_type text,
  p_storage_path text,
  p_expiry_date text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_can_write boolean;
  v_docs jsonb;
  v_entry jsonb;
BEGIN
  IF p_doc_type IS NULL OR p_doc_type NOT IN ('rc', 'insurance', 'fitness', 'pollution') THEN
    RAISE EXCEPTION 'unsupported vehicle document type: %', p_doc_type;
  END IF;

  IF p_storage_path IS NULL OR btrim(p_storage_path) = '' THEN
    RAISE EXCEPTION 'storage path is required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.organization_id = p_viewer_org_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ) THEN
    RAISE EXCEPTION 'not authorized for this organization';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM trips t
    WHERE t.id = p_trip_id
      AND t.vehicle_id = p_vehicle_id
      AND t.deleted_at IS NULL
      AND (
        t.organization_id = p_viewer_org_id
        OR EXISTS (
          SELECT 1 FROM suppliers s
          WHERE s.id = t.supplier_id AND s.linked_organization_id = p_viewer_org_id
        )
        OR EXISTS (
          SELECT 1 FROM clients c
          WHERE c.id = t.client_id AND c.linked_organization_id = p_viewer_org_id
        )
      )
  ) INTO v_can_write;

  IF NOT v_can_write THEN
    RAISE EXCEPTION 'not authorized to update documents for this vehicle on this trip';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM vehicles v WHERE v.id = p_vehicle_id) THEN
    RAISE EXCEPTION 'vehicle not found';
  END IF;

  v_entry := jsonb_build_object(
    'url', btrim(p_storage_path),
    'expiryDate', COALESCE(NULLIF(btrim(COALESCE(p_expiry_date, '')), ''), ''),
    'uploadedAt', to_char(timezone('utc', now()), 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  );

  UPDATE vehicles v
  SET
    documents = COALESCE(v.documents, '{}'::jsonb) || jsonb_build_object(p_doc_type, v_entry),
    updated_at = timezone('utc', now())
  WHERE v.id = p_vehicle_id
  RETURNING COALESCE(v.documents, '{}'::jsonb) INTO v_docs;

  RETURN v_docs;
END;
$fn$;

COMMENT ON FUNCTION public.save_vehicle_document_for_trip(uuid, uuid, uuid, text, text, text) IS
  'Trip-org write path for vehicles.documents when the truck is owned by another org. '
  'Mirrors get_vehicle_for_trip_viewer legitimacy checks; caller uploads storage first.';

REVOKE EXECUTE ON FUNCTION public.save_vehicle_document_for_trip(uuid, uuid, uuid, text, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.save_vehicle_document_for_trip(uuid, uuid, uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_vehicle_document_for_trip(uuid, uuid, uuid, text, text, text) TO authenticated;
