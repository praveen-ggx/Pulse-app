-- Marketplace My Bids: shipper identity only at allocation.
--
-- Before: list_my_org_market_bids returned the load owner's organization
-- name/id, indent_number and masked phone for EVERY bid (pending, rejected,
-- awarded-unpaid). Only the unmasked phone waited for the fee gate (A8.6.2).
-- The UI hid them, but they were still in the response payload.
--
-- After: owner_organization_id, owner_organization_name, owner_masked_phone,
-- owner_phone and indent_number are NULL unless the bid is accepted AND the
-- Marketplace fee is settled (paid / not_required) -- the same gate the
-- allocation flow (Assign vehicle) already uses. Same rule as Network pools:
-- the lane is visible, the party is not, until allocation.
--
-- Also returns indents.vehicle_type and indents.weight (kg) so My Bids can
-- pool by the canonical Marketplace pool key (pickup x drop x vehicle) and
-- show Vehicle / Tonnage like the Network pool cards.
--
-- Return type changes, so DROP + CREATE; grants and comment restored below.
-- Body is otherwise identical to 20270309030000 (auth + membership checks,
-- 100-row cap, ordering).

DROP FUNCTION IF EXISTS public.list_my_org_market_bids(uuid, integer);

CREATE FUNCTION public.list_my_org_market_bids(
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
  vehicle_type            text,
  weight                  numeric,
  owner_organization_id   uuid,
  owner_organization_name text,
  owner_masked_phone      text,
  owner_phone             text,
  amount                  numeric,
  note                    text,
  status                  text,
  fee_payment_status      text,
  platform_fee_amount     numeric,
  created_at              timestamptz,
  accepted_at             timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
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
    CASE WHEN r.revealed THEN i.indent_number ELSE NULL END,
    i.pickup_area,
    i.drop_location,
    i.pickup_date,
    i.load_type,
    i.vehicle_type,
    i.weight,
    CASE WHEN r.revealed THEN i.organization_id ELSE NULL END,
    CASE WHEN r.revealed THEN o.name ELSE NULL END,
    CASE WHEN r.revealed THEN public.mask_phone_last4(owner_pr.phone) ELSE NULL END,
    CASE WHEN r.revealed THEN owner_pr.phone ELSE NULL END,
    mb.amount,
    mb.note,
    mb.status,
    mb.fee_payment_status,
    mb.platform_fee_amount,
    mb.created_at,
    mb.accepted_at
  FROM public.market_bids mb
  CROSS JOIN LATERAL (
    SELECT (mb.status = 'accepted'
            AND mb.fee_payment_status IN ('paid', 'not_required')) AS revealed
  ) r
  JOIN public.indents i ON i.id = mb.indent_id
  LEFT JOIN public.organizations o ON o.id = i.organization_id
  LEFT JOIN public.profiles owner_pr ON owner_pr.id = o.owner_id
  WHERE mb.bidder_type = 'organization'
    AND mb.bidder_organization_id = p_org_id
  ORDER BY mb.created_at DESC
  LIMIT v_limit;
END;
$function$;

REVOKE ALL ON FUNCTION public.list_my_org_market_bids(uuid, integer) FROM PUBLIC;
-- Supabase default privileges grant anon directly; the auth.uid() check
-- already rejects anon, this just removes the grant.
REVOKE ALL ON FUNCTION public.list_my_org_market_bids(uuid, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.list_my_org_market_bids(uuid, integer) TO authenticated;

COMMENT ON FUNCTION public.list_my_org_market_bids(uuid, integer) IS
  'Organization bidder''s own Marketplace bids ("My Bids"). Load-owner identity (organization id/name, masked + unmasked phone, indent_number) is NULL until status=accepted AND fee_payment_status IN (paid, not_required), i.e. allocation. Returns vehicle_type/weight for pool keying.';
