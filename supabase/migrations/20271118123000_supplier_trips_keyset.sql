-- Pages supplier-carried trips as one jsonb object so PostgREST db-max-rows
-- cannot cut the response. The existing get_trips_where_org_is_supplier(uuid)
-- stays for older clients.
--
-- Cursor is (created_at DESC NULLS LAST, id DESC). id alone is not chronological:
-- the legacy function's DISTINCT ON (id) order is only there to collapse duplicates.

CREATE OR REPLACE FUNCTION public.list_trips_where_org_is_supplier_keyset(
  p_org_id uuid,
  p_limit integer DEFAULT 250,
  p_before_created_at timestamptz DEFAULT NULL,
  p_before_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit integer;
  v_rows jsonb;
  v_count integer;
BEGIN
  IF p_org_id IS NULL OR NOT public.is_org_member(p_org_id) THEN
    RETURN jsonb_build_object('rows', '[]'::jsonb, 'has_more', false);
  END IF;

  -- A half-set cursor would restart or skip. Return nothing.
  IF (p_before_created_at IS NULL) <> (p_before_id IS NULL)
     AND NOT (p_before_created_at IS NULL AND p_before_id IS NOT NULL) THEN
    RETURN jsonb_build_object('rows', '[]'::jsonb, 'has_more', false);
  END IF;

  v_limit := LEAST(GREATEST(COALESCE(p_limit, 250), 1), 250);

  WITH visible AS (
    SELECT DISTINCT ON (t.id)
      to_jsonb(v) AS row,
      t.created_at AS sort_created_at,
      t.id
    FROM public.trips_supplier_view v
    INNER JOIN public.trips t ON t.id = v.id
    WHERE t.indent_id IS NOT NULL
      AND (
        EXISTS (
          SELECT 1
          FROM public.suppliers s
          WHERE s.id = t.supplier_id
            AND s.linked_organization_id = p_org_id
        )
        OR EXISTS (
          SELECT 1
          FROM public.direct_quotes dq
          WHERE dq.indent_id = t.indent_id
            AND lower(trim(coalesce(dq.status, ''))) = 'accepted'
            AND dq.bidder_organization_id = p_org_id
        )
      )
    ORDER BY t.id
  ),
  paged AS (
    SELECT row, sort_created_at, id
    FROM visible
    WHERE p_before_id IS NULL
      OR (
        p_before_created_at IS NOT NULL
        AND (
          sort_created_at < p_before_created_at
          OR (sort_created_at = p_before_created_at AND id < p_before_id)
          OR sort_created_at IS NULL
        )
      )
      OR (
        p_before_created_at IS NULL
        AND p_before_id IS NOT NULL
        AND sort_created_at IS NULL
        AND id < p_before_id
      )
    ORDER BY sort_created_at DESC NULLS LAST, id DESC
    LIMIT v_limit + 1
  )
  SELECT
    COALESCE(
      (
        SELECT jsonb_agg(row ORDER BY sort_created_at DESC NULLS LAST, id DESC)
        FROM (
          SELECT row, sort_created_at, id
          FROM paged
          ORDER BY sort_created_at DESC NULLS LAST, id DESC
          LIMIT v_limit
        ) kept
      ),
      '[]'::jsonb
    ),
    (SELECT count(*) FROM paged)
  INTO v_rows, v_count;

  RETURN jsonb_build_object(
    'rows', COALESCE(v_rows, '[]'::jsonb),
    'has_more', COALESCE(v_count, 0) > v_limit
  );
END;
$$;

COMMENT ON FUNCTION public.list_trips_where_org_is_supplier_keyset(uuid, integer, timestamptz, uuid) IS
  'Paged supplier trips. Same membership and supplier visibility as get_trips_where_org_is_supplier. One jsonb page, at most 250 rows.';

REVOKE ALL ON FUNCTION public.list_trips_where_org_is_supplier_keyset(uuid, integer, timestamptz, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_trips_where_org_is_supplier_keyset(uuid, integer, timestamptz, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.list_trips_where_org_is_supplier_keyset(uuid, integer, timestamptz, uuid) TO authenticated;
