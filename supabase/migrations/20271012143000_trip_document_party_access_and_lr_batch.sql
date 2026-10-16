-- Applied on production (2026-10-12) outside the repository; copied verbatim from
-- production's supabase_migrations.schema_migrations.statements (2026-10-16) so the
-- repository matches production. Production already records this version.

-- Trip vault files must be readable and uploadable by every party on the trip
-- (owning org, client org, supplier-linked org, assigned driver), at every stage.
-- The hub E-LR / e-way batch used a per-row EXISTS over trips. Resolve the
-- accessible trip ids once, then join documents.

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
            AND c.organization_id IS NOT NULL
            AND public.is_org_member(c.organization_id)
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
           AND c.organization_id IS NOT NULL
           AND public.is_org_member(c.organization_id)
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
  'LR JSON snapshots are reduced to the LR number so the card does not transfer the full E-LR.';

REVOKE ALL ON FUNCTION public.get_trip_documents_lr_pod_batch(uuid[]) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_trip_documents_lr_pod_batch(uuid[]) TO authenticated;

DROP POLICY IF EXISTS trip_documents_counterparty_insert ON public.trip_documents;

CREATE POLICY trip_documents_counterparty_insert
  ON public.trip_documents
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.trips t
      WHERE t.id = trip_documents.trip_id
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
              AND c.organization_id IS NOT NULL
              AND public.is_org_member(c.organization_id)
          )
        )
    )
  );

DROP POLICY IF EXISTS trip_documents_counterparty_update ON public.trip_documents;

CREATE POLICY trip_documents_counterparty_update
  ON public.trip_documents
  FOR UPDATE
  TO authenticated
  USING (public.can_read_trip_document(trip_id))
  WITH CHECK (public.can_read_trip_document(trip_id));
