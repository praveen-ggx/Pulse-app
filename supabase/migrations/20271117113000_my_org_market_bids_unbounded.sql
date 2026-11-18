-- My Bids has no final row ceiling. Each read is one page. The client
-- continues from the last (created_at, id) until a short page. The count is
-- the organization's total, not the size of one page.

SET LOCAL lock_timeout = '5s';

CREATE INDEX IF NOT EXISTS idx_market_bids_org_created
  ON public.market_bids (bidder_organization_id, created_at DESC, id DESC)
  WHERE bidder_type = 'organization';

CREATE OR REPLACE FUNCTION public.list_my_org_market_bids_page(
  p_org_id uuid,
  p_limit integer DEFAULT 100,
  p_before_created_at timestamptz DEFAULT NULL,
  p_before_id uuid DEFAULT NULL
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
  v_limit integer := GREATEST(1, LEAST(COALESCE(p_limit, 100), 100));
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
    i.vehicle_type,
    i.weight,
    i.organization_id AS owner_organization_id,
    o.name AS owner_organization_name,
    public.mask_phone_last4(owner_pr.phone) AS owner_masked_phone,
    CASE WHEN mb.status = 'accepted' AND mb.fee_payment_status IN ('paid', 'not_required')
      THEN owner_pr.phone ELSE NULL END AS owner_phone,
    mb.amount,
    mb.note,
    mb.status,
    mb.fee_payment_status,
    mb.platform_fee_amount,
    mb.created_at,
    mb.accepted_at
  FROM public.market_bids mb
  JOIN public.indents i ON i.id = mb.indent_id
  LEFT JOIN public.organizations o ON o.id = i.organization_id
  LEFT JOIN public.profiles owner_pr ON owner_pr.id = o.owner_id
  WHERE mb.bidder_type = 'organization'
    AND mb.bidder_organization_id = p_org_id
    AND (
      p_before_created_at IS NULL
      OR p_before_id IS NULL
      OR (mb.created_at, mb.id) < (p_before_created_at, p_before_id)
    )
  ORDER BY mb.created_at DESC, mb.id DESC
  LIMIT v_limit;
END;
$function$;

REVOKE ALL ON FUNCTION public.list_my_org_market_bids_page(uuid, integer, timestamptz, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_my_org_market_bids_page(uuid, integer, timestamptz, uuid) TO authenticated;

COMMENT ON FUNCTION public.list_my_org_market_bids_page(uuid, integer, timestamptz, uuid) IS
  'One page of this organization''s Marketplace bids, newest first. p_limit is the page size (at most 100). Pass the last row''s created_at and id to continue. There is no final row ceiling.';

CREATE OR REPLACE FUNCTION public.count_my_org_market_bids(p_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := (SELECT auth.uid());
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_org_member(p_org_id) THEN
    RAISE EXCEPTION 'Not a member of this organization';
  END IF;

  RETURN (
    SELECT jsonb_build_object(
      'total', count(*),
      'pending', count(*) FILTER (WHERE mb.status = 'pending'),
      'accepted', count(*) FILTER (WHERE mb.status = 'accepted'),
      'rejected', count(*) FILTER (WHERE mb.status = 'rejected'),
      'withdrawn', count(*) FILTER (WHERE mb.status = 'withdrawn'),
      'superseded', count(*) FILTER (WHERE mb.status = 'superseded')
    )
    FROM public.market_bids mb
    WHERE mb.bidder_type = 'organization'
      AND mb.bidder_organization_id = p_org_id
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.count_my_org_market_bids(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.count_my_org_market_bids(uuid) TO authenticated;

COMMENT ON FUNCTION public.count_my_org_market_bids(uuid) IS
  'Authoritative Marketplace bid totals for one organization. Independent of any page.';
