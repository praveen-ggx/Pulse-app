-- Bidder-owned withdraw of pending Network / Reach quotes.
-- submit_network_quote upserts on (indent_id, bidder_organization_id) and
-- locks rejected/accepted rows, so cancel must DELETE pending rows (not reject)
-- or the operator cannot quote again.

CREATE OR REPLACE FUNCTION public.withdraw_network_quotes(
  p_bidder_org_id uuid,
  p_indent_ids uuid[]
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_deleted integer := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_bidder_org_id IS NULL OR p_indent_ids IS NULL OR cardinality(p_indent_ids) = 0 THEN
    RETURN 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = p_bidder_org_id
      AND om.user_id = v_uid
      AND om.status = 'active'
      AND om.role IN ('owner', 'admin', 'member', 'dispatcher', 'finance')
  ) THEN
    RAISE EXCEPTION 'unauthorized: caller is not an active member of bidder organization';
  END IF;

  DELETE FROM public.direct_quotes dq
  WHERE dq.bidder_organization_id = p_bidder_org_id
    AND dq.indent_id = ANY (p_indent_ids)
    AND dq.status = 'pending';

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.withdraw_network_quotes(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.withdraw_network_quotes(uuid, uuid[]) TO authenticated;

COMMENT ON FUNCTION public.withdraw_network_quotes(uuid, uuid[]) IS
  'Deletes the caller org''s pending direct_quotes on the given indents so they can quote again.';

GRANT DELETE ON public.direct_quotes TO authenticated;

DROP POLICY IF EXISTS "Bidders can delete own pending direct quotes" ON public.direct_quotes;
CREATE POLICY "Bidders can delete own pending direct quotes"
  ON public.direct_quotes
  FOR DELETE
  TO authenticated
  USING (
    status = 'pending'
    AND bidder_organization_id IN (
      SELECT om.organization_id
      FROM public.organization_members om
      WHERE om.user_id = auth.uid()
        AND om.status = 'active'
        AND om.role IN ('owner', 'admin', 'member', 'dispatcher', 'finance')
    )
  );
