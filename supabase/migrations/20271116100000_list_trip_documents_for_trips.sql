-- Compliance trip documents with one permission check per trip.
--
-- Compliance reads trip_documents for 100 trips at a time. Under RLS each
-- document row ran can_read_trip_document (a SECURITY DEFINER function that is
-- never inlined) and the trip_documents_org_member_manage EXISTS, which itself
-- expands the trips policies. Production: ~1,100 s in ~20 h; preproduction:
-- 168 ms planning + 297 ms execution for one 100-trip chunk.
--
-- Visibility here is exactly the RLS SELECT visibility of trip_documents for
-- the caller (auth.uid()):
--
--   permissive (OR, depend only on the trip, so evaluated once per trip)
--     trip_documents_select_fast       can_read_trip_document(trip_id)
--     trip_documents_org_member_manage active owner/admin/member/dispatcher/
--                                      finance member of the trip's org
--   restrictive (AND, per document)
--     trip_documents_expense_receipt_restrict
--       not an expense receipt type, OR uploaded by the caller, OR
--       _can_read_trip_expense_receipt(storage_path).
--
-- _can_read_trip_expense_receipt is SECURITY INVOKER: it is true when the
-- caller can SELECT a fuel/toll/other expense row with that path. Calling it
-- from a definer function would bypass those tables' RLS, so the three
-- tables' SELECT policies are applied explicitly instead (all three are
-- identical: owner_user_id = auth.uid() OR employer expense and
-- is_org_staff(employer_org_id)). supabase/tests/trip_documents_batch_read/
-- checks those policies and the trip_documents policies have not changed.
--
-- Paging: keyset on id (p_after_id), at most 1,000 rows per call, at most 500
-- trip ids per call. Returns the 14 columns the Compliance REST read selected.

CREATE OR REPLACE FUNCTION public.list_trip_documents_for_trips(
  p_trip_ids uuid[],
  p_after_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 500
)
RETURNS TABLE (
  id uuid,
  trip_id uuid,
  document_type text,
  file_name text,
  storage_path text,
  uploaded_at timestamptz,
  uploaded_by uuid,
  status text,
  verified_by uuid,
  verified_at timestamptz,
  rejection_reason text,
  mime_type text,
  document_number text,
  source_entity_document_id uuid
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
#variable_conflict use_column
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 500), 1), 1000);
BEGIN
  IF v_uid IS NULL OR p_trip_ids IS NULL OR cardinality(p_trip_ids) = 0 THEN
    RETURN;
  END IF;
  IF cardinality(p_trip_ids) > 500 THEN
    RAISE EXCEPTION 'list_trip_documents_for_trips: at most 500 trip ids per call'
      USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH readable_trips AS (
    SELECT r.id
    FROM (SELECT DISTINCT u.id FROM unnest(p_trip_ids) AS u(id) WHERE u.id IS NOT NULL) r
    WHERE public.can_read_trip_document(r.id)
       OR EXISTS (
         SELECT 1
         FROM public.trips t
         JOIN public.organization_members om ON om.organization_id = t.organization_id
         WHERE t.id = r.id
           AND om.user_id = v_uid
           AND om.status = 'active'
           AND om.role = ANY (ARRAY['owner', 'admin', 'member', 'dispatcher', 'finance'])
       )
  )
  SELECT d.id, d.trip_id, d.document_type, d.file_name, d.storage_path, d.uploaded_at,
         d.uploaded_by, d.status, d.verified_by, d.verified_at, d.rejection_reason,
         d.mime_type, d.document_number, d.source_entity_document_id
  FROM public.trip_documents d
  JOIN readable_trips rt ON rt.id = d.trip_id
  WHERE (p_after_id IS NULL OR d.id > p_after_id)
    AND (
      COALESCE(d.document_type, '') <> ALL (
        ARRAY['fuel_bill_photo', 'toll_receipt_photo', 'trip_expense_receipt_photo']
      )
      OR d.uploaded_by = v_uid
      OR EXISTS (
        SELECT 1 FROM public.trip_fuel_entries e
        WHERE e.bill_storage_path = d.storage_path
          AND (e.owner_user_id = v_uid
               OR (e.expense_context = 'employer' AND public.is_org_staff(e.employer_org_id)))
      )
      OR EXISTS (
        SELECT 1 FROM public.trip_toll_entries e
        WHERE e.receipt_storage_path = d.storage_path
          AND (e.owner_user_id = v_uid
               OR (e.expense_context = 'employer' AND public.is_org_staff(e.employer_org_id)))
      )
      OR EXISTS (
        SELECT 1 FROM public.trip_other_expenses e
        WHERE e.receipt_storage_path = d.storage_path
          AND (e.owner_user_id = v_uid
               OR (e.expense_context = 'employer' AND public.is_org_staff(e.employer_org_id)))
      )
    )
  ORDER BY d.id
  LIMIT v_limit;
END;
$function$;

REVOKE ALL ON FUNCTION public.list_trip_documents_for_trips(uuid[], uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_trip_documents_for_trips(uuid[], uuid, integer) TO authenticated, service_role;
