-- Applied remotely 2026-09-21 via MCP (version 20260921183959).
-- trip_documents SELECT was evaluating trips RLS + warehouse/indent joins
-- per row. A 22-row table took 60s+ and stacked PostgREST Warp threads.

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
          FROM public.drivers d
          WHERE d.id = t.driver_id
            AND d.user_id = (SELECT auth.uid())
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.can_read_trip_document(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_read_trip_document(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Users can read trip_documents for trips they can read" ON public.trip_documents;
DROP POLICY IF EXISTS trip_documents_driver_select ON public.trip_documents;
DROP POLICY IF EXISTS trip_documents_org_member_select ON public.trip_documents;

DROP POLICY IF EXISTS trip_documents_select_fast ON public.trip_documents;
CREATE POLICY trip_documents_select_fast
  ON public.trip_documents
  FOR SELECT
  TO authenticated
  USING (public.can_read_trip_document(trip_id));
