-- Forward-only correction for 20271012143000.
-- clients.organization_id is the trip-owning organization. The client
-- counterparty is clients.linked_organization_id, which is what the app
-- already sends as the client party. A null or stale link grants nothing.
-- Trip-org membership, supplier linked_organization_id, the assigned driver,
-- ground-ops insert gating, and the restrictive expense-receipt policy stay
-- as they are. Trip status is not an authorization predicate: the vault is
-- open at every stage for an authorized party, and completion is not a lock.

CREATE OR REPLACE FUNCTION public.can_read_trip_document(p_trip_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.trips t
    WHERE t.id = p_trip_id
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
            AND d.user_id = (SELECT auth.uid())
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.can_read_trip_document(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_read_trip_document(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_trip_documents_lr_pod_batch(p_trip_ids uuid[])
RETURNS TABLE (
  trip_id uuid,
  document_type text,
  document_number text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH requested AS (
    SELECT DISTINCT id
    FROM unnest(p_trip_ids) AS id
    WHERE id IS NOT NULL
  ),
  accessible AS (
    SELECT t.id
    FROM public.trips t
    JOIN requested r ON r.id = t.id
    WHERE public.is_org_member(t.organization_id)
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
           AND d.user_id = (SELECT auth.uid())
       )
  )
  SELECT
    td.trip_id,
    td.document_type,
    CASE
      WHEN td.document_type = 'lr'
        AND left(btrim(coalesce(td.document_number, '')), 1) = '{'
        THEN COALESCE(
          substring(td.document_number FROM '"lrNumber"[[:space:]]*:[[:space:]]*"([^"]*)"'),
          td.document_number
        )
      ELSE td.document_number
    END AS document_number
  FROM public.trip_documents td
  JOIN accessible a ON a.id = td.trip_id
  WHERE td.document_type IN ('lr', 'pod', 'soft_pod', 'pod_soft', 'eway_bill');
$$;

COMMENT ON FUNCTION public.get_trip_documents_lr_pod_batch(uuid[]) IS
  'Batch LR/POD/e-way rows for hub cards. Accessible trips are resolved once. '
  'Client access uses clients.linked_organization_id. '
  'LR JSON snapshots are reduced to the LR number so the card does not transfer the full E-LR.';

REVOKE ALL ON FUNCTION public.get_trip_documents_lr_pod_batch(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_trip_documents_lr_pod_batch(uuid[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.can_write_trip_document_as_counterparty(p_trip_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.trips t
    WHERE t.id = p_trip_id
      AND (
        EXISTS (
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
  );
$$;

REVOKE ALL ON FUNCTION public.can_write_trip_document_as_counterparty(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_write_trip_document_as_counterparty(uuid) TO authenticated;

DROP POLICY IF EXISTS trip_documents_counterparty_insert ON public.trip_documents;
CREATE POLICY trip_documents_counterparty_insert
  ON public.trip_documents
  FOR INSERT
  TO authenticated
  WITH CHECK (public.can_write_trip_document_as_counterparty(trip_id));

-- Read access is not update access. The assigned driver keeps INSERT only.
-- Trip-org members keep trip_documents_org_member_manage. Counterparties may
-- replace a file or edit document_number, which are ordinary column updates.
DROP POLICY IF EXISTS trip_documents_counterparty_update ON public.trip_documents;
CREATE POLICY trip_documents_counterparty_update
  ON public.trip_documents
  FOR UPDATE
  TO authenticated
  USING (public.can_write_trip_document_as_counterparty(trip_id))
  WITH CHECK (public.can_write_trip_document_as_counterparty(trip_id));

-- Compliance verification stays on verify_trip_document (security definer,
-- trip-org grant). A counterparty may replace the file, which sets status
-- back to pending and clears verification. They may not move the row, change
-- its type, or edit verification fields on their own.
CREATE OR REPLACE FUNCTION public.trip_documents_guard_verification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_org uuid;
  v_manager boolean;
  v_verifier boolean;
  v_file_replaced boolean;
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  SELECT t.organization_id INTO v_org
  FROM public.trips t
  WHERE t.id = OLD.trip_id;

  -- Same people the org-member UPDATE policy allows. Ground ops is stored
  -- as role 'member' with permissions.platformRole = 'ground_ops' and is
  -- excluded from UPDATE/DELETE. A null platformRole stays allowed: legacy
  -- member rows are operators, not ground ops.
  v_manager := EXISTS (
    SELECT 1
    FROM public.organization_members om
    WHERE om.organization_id = v_org
      AND om.user_id = v_uid
      AND om.status = 'active'
      AND om.role = ANY (ARRAY['owner', 'admin', 'member', 'dispatcher', 'finance'])
      AND COALESCE(om.permissions ->> 'platformRole', '') <> 'ground_ops'
  );
  v_verifier := public.has_member_surface(v_org, 'trip_compliance.documents.verify');

  IF NEW.status IN ('verified', 'rejected')
     AND (
       NEW.status IS DISTINCT FROM OLD.status
       OR NEW.verified_by IS DISTINCT FROM OLD.verified_by
       OR NEW.verified_at IS DISTINCT FROM OLD.verified_at
       OR NEW.rejection_reason IS DISTINCT FROM OLD.rejection_reason
     )
     AND NOT v_verifier
  THEN
    RAISE EXCEPTION 'not authorized to verify trip documents'
      USING ERRCODE = '42501';
  END IF;

  -- Demotion to pending clears verification for every role, including managers
  -- and verifiers. verify_trip_document sets verified or rejected above.
  IF NEW.status = 'pending'
     AND NEW.status IS DISTINCT FROM OLD.status
     AND (
       NEW.verified_by IS NOT NULL
       OR NEW.verified_at IS NOT NULL
       OR NEW.rejection_reason IS NOT NULL
     )
  THEN
    RAISE EXCEPTION 'not authorized to change document status without clearing verification'
      USING ERRCODE = '42501';
  END IF;

  -- Trip-org managers keep the manage policy. Verifiers keep verify_trip_document.
  IF v_manager OR v_verifier THEN
    RETURN NEW;
  END IF;

  IF NEW.trip_id IS DISTINCT FROM OLD.trip_id THEN
    RAISE EXCEPTION 'not authorized to move trip documents'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.document_type IS DISTINCT FROM OLD.document_type THEN
    RAISE EXCEPTION 'not authorized to change trip document type'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.uploaded_by IS DISTINCT FROM OLD.uploaded_by
     AND NEW.uploaded_by IS DISTINCT FROM v_uid
  THEN
    RAISE EXCEPTION 'not authorized to change document uploader'
      USING ERRCODE = '42501';
  END IF;
  -- File replacement is one write: a new storage path, status pending, and
  -- verification cleared. A non-manager cannot demote a verified or rejected
  -- row to pending while leaving verified_by, verified_at, or rejection_reason
  -- in place. document_number stays editable: E-LR and e-way number writes
  -- update that column alone and must keep working on an already verified row.
  v_file_replaced :=
    NEW.storage_path IS DISTINCT FROM OLD.storage_path
    AND NEW.status = 'pending'
    AND NEW.verified_by IS NULL
    AND NEW.verified_at IS NULL
    AND NEW.rejection_reason IS NULL;
  IF (
       NEW.storage_path IS DISTINCT FROM OLD.storage_path
       OR NEW.file_name IS DISTINCT FROM OLD.file_name
       OR NEW.mime_type IS DISTINCT FROM OLD.mime_type
       OR NEW.size_bytes IS DISTINCT FROM OLD.size_bytes
       OR NEW.stop_id IS DISTINCT FROM OLD.stop_id
     )
     AND NOT v_file_replaced
  THEN
    RAISE EXCEPTION 'not authorized to replace a trip document without resetting verification'
      USING ERRCODE = '42501';
  END IF;
  IF (
       NEW.verified_by IS DISTINCT FROM OLD.verified_by
       OR NEW.verified_at IS DISTINCT FROM OLD.verified_at
       OR NEW.rejection_reason IS DISTINCT FROM OLD.rejection_reason
     )
     AND NOT v_file_replaced
  THEN
    RAISE EXCEPTION 'not authorized to change document verification'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.ocr_job_id IS DISTINCT FROM OLD.ocr_job_id
     OR NEW.source_entity_document_id IS DISTINCT FROM OLD.source_entity_document_id
     OR NEW.uploaded_at IS DISTINCT FROM OLD.uploaded_at
  THEN
    RAISE EXCEPTION 'not authorized to change trip document metadata'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT v_file_replaced THEN
    RAISE EXCEPTION 'not authorized to change document status'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.trip_documents_guard_verification() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.trip_documents_guard_verification() TO authenticated, service_role;

DROP TRIGGER IF EXISTS trip_documents_guard_verification ON public.trip_documents;
CREATE TRIGGER trip_documents_guard_verification
  BEFORE UPDATE ON public.trip_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.trip_documents_guard_verification();
