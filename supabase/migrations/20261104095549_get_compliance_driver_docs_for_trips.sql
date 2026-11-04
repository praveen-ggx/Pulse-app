-- Trip Ops / Compliance: batch-read driver licence + Aadhaar for visible trips.
--
-- Why: driver_kyc_documents RLS only allows the driver (auth.uid) or platform
-- KYC reviewers. Org members calling listDriverVaultKycDocuments therefore get
-- an empty set, so DL shows only when someone re-uploaded it into that org's
-- entity_documents. Same gap for partner-org entity_documents rows.
--
-- Mirror get_compliance_vehicle_vault_for_trips: SECURITY DEFINER +
-- private.compliance_visible_trips authorization. Returns license/aadhaar from
-- entity_documents (any org for the trip's driver_id) and driver_kyc_documents.

CREATE OR REPLACE FUNCTION public.get_compliance_driver_docs_for_trips(
  p_viewer_org_id uuid,
  p_trip_ids uuid[]
)
RETURNS TABLE (
  trip_id uuid,
  driver_id uuid,
  doc_id text,
  doc_type text,
  status text,
  storage_path text,
  expiry_date date,
  verified_at timestamptz,
  notes text,
  created_at timestamptz,
  source text
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
    RAISE EXCEPTION 'get_compliance_driver_docs_for_trips: at most 1000 trip ids per call (got %)', cardinality(p_trip_ids)
      USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH visible AS (
    SELECT vt.trip_id
    FROM private.compliance_visible_trips(p_viewer_org_id, p_trip_ids) vt
  ),
  trip_drivers AS (
    SELECT tr.id AS trip_id, tr.driver_id
    FROM visible v
    JOIN public.trips tr ON tr.id = v.trip_id
    WHERE tr.driver_id IS NOT NULL
  ),
  entity_rows AS (
    SELECT
      td.trip_id,
      td.driver_id,
      ed.id::text AS doc_id,
      ed.doc_type,
      coalesce(ed.status, 'pending') AS status,
      ed.storage_path,
      ed.expiry_date,
      ed.verified_at,
      ed.doc_label AS notes,
      coalesce(ed.created_at, now()) AS created_at,
      'entity'::text AS source
    FROM trip_drivers td
    JOIN public.entity_documents ed
      ON ed.entity_type = 'driver'
     AND ed.entity_id = td.driver_id
     AND ed.doc_type IN ('license', 'aadhaar')
     AND coalesce(ed.status, 'pending') NOT IN ('rejected', 'replaced')
     AND nullif(btrim(ed.storage_path), '') IS NOT NULL
  ),
  kyc_rows AS (
    SELECT
      td.trip_id,
      td.driver_id,
      k.id::text AS doc_id,
      k.doc_type,
      k.status::text AS status,
      k.storage_path,
      NULL::date AS expiry_date,
      k.verified_at,
      coalesce(k.doc_label, k.file_name) AS notes,
      coalesce(k.created_at, now()) AS created_at,
      'driver-kyc'::text AS source
    FROM trip_drivers td
    JOIN public.drivers d ON d.id = td.driver_id
    JOIN public.driver_kyc_documents k
      ON k.deleted_at IS NULL
     AND k.doc_type IN ('license', 'aadhaar')
     AND nullif(btrim(k.storage_path), '') IS NOT NULL
     AND k.status IS DISTINCT FROM 'rejected'
     AND (
       (d.user_id IS NOT NULL AND k.driver_user_id = d.user_id)
       OR k.driver_user_id = td.driver_id
     )
  )
  SELECT * FROM entity_rows
  UNION ALL
  SELECT * FROM kyc_rows
  ORDER BY trip_id, doc_type, created_at DESC;
END;
$$;

COMMENT ON FUNCTION public.get_compliance_driver_docs_for_trips(uuid, uuid[]) IS
  'Licence/Aadhaar for compliance-visible trips: entity_documents + driver_kyc_documents. Authorized via private.compliance_visible_trips.';

REVOKE ALL ON FUNCTION public.get_compliance_driver_docs_for_trips(uuid, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_compliance_driver_docs_for_trips(uuid, uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_compliance_driver_docs_for_trips(uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_compliance_driver_docs_for_trips(uuid, uuid[]) TO service_role;
