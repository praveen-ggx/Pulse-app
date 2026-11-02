SET LOCAL lock_timeout = '5s';

-- Finance visibility for DCO Self receivables on the caller's Self workspace.
-- Authenticated SELECT already exists for the workspace owner via
-- _dco_self_caller_workspace(). This adds a read helper for Finance UI that
-- returns outstanding lines without exposing another DCO's book.

CREATE OR REPLACE FUNCTION public.list_dco_self_finance_receivables()
RETURNS TABLE (
  receivable_id uuid,
  party_b_id uuid,
  party_name text,
  billed_amount numeric,
  collected numeric,
  outstanding numeric,
  status text,
  operational_trip_id uuid,
  party_a_label text,
  issued_at timestamptz,
  billed_version integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
  WITH ws AS (
    SELECT public._dco_self_caller_workspace() AS workspace_id
  ),
  collected AS (
    SELECT c.receivable_id, coalesce(sum(c.amount), 0) AS collected
    FROM public.dco_self_collections c
    JOIN public.dco_self_receivables r ON r.id = c.receivable_id
    JOIN ws ON ws.workspace_id IS NOT NULL AND r.workspace_id = ws.workspace_id
    GROUP BY c.receivable_id
  )
  SELECT
    r.id,
    r.party_b_id,
    coalesce(p.name, r.party_a_label, 'Party') AS party_name,
    r.billed_amount,
    coalesce(c.collected, 0) AS collected,
    greatest(0, r.billed_amount - coalesce(c.collected, 0)) AS outstanding,
    r.status,
    r.operational_trip_id,
    r.party_a_label,
    r.issued_at,
    r.billed_version
  FROM public.dco_self_receivables r
  JOIN ws ON ws.workspace_id IS NOT NULL AND r.workspace_id = ws.workspace_id
  LEFT JOIN public.dco_self_parties p ON p.id = r.party_b_id
  LEFT JOIN collected c ON c.receivable_id = r.id
  WHERE r.status <> 'void'
  ORDER BY r.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.list_dco_self_finance_receivables() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_dco_self_finance_receivables() TO authenticated;

COMMENT ON FUNCTION public.list_dco_self_finance_receivables() IS
  'Finance read of the caller DCO Self book. Empty when not an eligible Self workspace.';
