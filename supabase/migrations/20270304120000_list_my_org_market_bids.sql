-- A4.4 Phase 4 -- org "My Bids": this organization's own market_bids rows
-- (bidder_organization_id = p_org_id), for the new My Bids segment in
-- app/find-loads/index.tsx. Mirrors the driver app's My Bids
-- (listMyMarketBids), but that reads market_bids directly under
-- market_bids_select's "bidder_user_id = auth.uid()" clause -- which only
-- covers the one member who personally submitted a bid, not every member of
-- the bidding organization. A SECURITY DEFINER RPC is needed here for the
-- same reason list_open_marketplace_loads_for_org needed one: org-level
-- visibility, not just the submitting user's own row.
--
-- Also carries the load-owner's contact, gated by the same
-- contact-visibility policy as list_market_bids_for_indent:
-- owner_masked_phone always populated, owner_phone NULL unless this bid is
-- 'accepted'. Source: indents.organization_id -> organizations.owner_id ->
-- profiles.phone (no phone column on organizations itself).

CREATE OR REPLACE FUNCTION public.list_my_org_market_bids(
  p_org_id uuid,
  p_limit integer DEFAULT 50
)
RETURNS TABLE (
  id                      uuid,
  indent_id               uuid,
  indent_number           text,
  pickup_area             text,
  drop_location           text,
  pickup_date             date,
  load_type               text,
  owner_organization_id   uuid,
  owner_organization_name text,
  owner_masked_phone      text,
  owner_phone             text,
  amount                  numeric,
  note                    text,
  status                  text,
  created_at              timestamptz,
  accepted_at             timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_limit integer := GREATEST(1, LEAST(COALESCE(p_limit, 50), 100));
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_org_member(p_org_id) THEN
    RAISE EXCEPTION 'Not a member of this organization';
  END IF;

  RETURN QUERY
  SELECT
    mb.id,
    mb.indent_id,
    i.indent_number,
    i.pickup_area,
    i.drop_location,
    i.pickup_date,
    i.load_type,
    i.organization_id AS owner_organization_id,
    o.name AS owner_organization_name,
    public.mask_phone_last4(owner_pr.phone) AS owner_masked_phone,
    CASE WHEN mb.status = 'accepted' THEN owner_pr.phone ELSE NULL END AS owner_phone,
    mb.amount,
    mb.note,
    mb.status,
    mb.created_at,
    mb.accepted_at
  FROM public.market_bids mb
  JOIN public.indents i ON i.id = mb.indent_id
  LEFT JOIN public.organizations o ON o.id = i.organization_id
  LEFT JOIN public.profiles owner_pr ON owner_pr.id = o.owner_id
  WHERE mb.bidder_type = 'organization'
    AND mb.bidder_organization_id = p_org_id
  ORDER BY mb.created_at DESC
  LIMIT v_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.list_my_org_market_bids(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_my_org_market_bids(uuid, integer) TO authenticated;

COMMENT ON FUNCTION public.list_my_org_market_bids(uuid, integer) IS
  'A4.4: this organization''s own market_bids rows (bidder_organization_id = p_org_id), for the org "My Bids" screen -- any active member of p_org_id may call this, not just the member who submitted a given bid. owner_masked_phone is always populated; owner_phone is NULL unless the bid is accepted, same Marketplace contact-visibility policy as list_market_bids_for_indent.';
