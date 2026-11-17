-- Each Marketplace bid is acceptable for 48 hours from its own creation.
-- The lane commitment clock is separate: it only decides whether a new load
-- receives a bid. Expiring or withdrawing a commitment does not change
-- market_bids.expires_at, and an accepted bid is not withdrawn when its
-- clock passes.
--
-- Not applied.
--
-- Rollback, only while no later migration depends on expires_at:
--   Re-apply the list_market_bids_for_indent section of
--   20270309030000_market_bids_contact_visibility_fee_gate.sql (DROP
--   FUNCTION through its COMMENT), so the shipper list stops reading
--   expires_at before the column goes. Then:
--   DROP TRIGGER IF EXISTS market_bids_guard_expiry ON public.market_bids;
--   DROP TRIGGER IF EXISTS market_bids_set_expiry ON public.market_bids;
--   DROP FUNCTION IF EXISTS public.tg_market_bid_guard_expiry();
--   DROP FUNCTION IF EXISTS public.tg_market_bid_set_expiry();
--   DROP INDEX IF EXISTS public.market_bids_pending_expiry_idx;
--   ALTER TABLE public.market_bids DROP COLUMN IF EXISTS expires_at;
-- Dropping the column removes the stored clocks. It does not delete bids.
-- Do not withdraw or rewrite bid status as part of the rollback.

SET LOCAL lock_timeout = '5s';

ALTER TABLE public.market_bids
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

COMMENT ON COLUMN public.market_bids.expires_at IS
  'When this individual Marketplace offer stops being acceptable. Set to created_at plus 48 hours. Independent of market_lane_bid_commits.valid_until.';

CREATE OR REPLACE FUNCTION public.tg_market_bid_set_expiry()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
BEGIN
  NEW.expires_at := coalesce(NEW.created_at, pg_catalog.now()) + interval '48 hours';
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS market_bids_set_expiry ON public.market_bids;
CREATE TRIGGER market_bids_set_expiry
  BEFORE INSERT ON public.market_bids
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_market_bid_set_expiry();

CREATE OR REPLACE FUNCTION public.tg_market_bid_guard_expiry()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NEW.expires_at IS DISTINCT FROM OLD.expires_at THEN
    NEW.expires_at := OLD.expires_at;
  END IF;

  IF OLD.status IS DISTINCT FROM 'accepted'
     AND NEW.status = 'accepted'
     AND NEW.expires_at IS NOT NULL
     AND NEW.expires_at <= pg_catalog.now() THEN
    RAISE EXCEPTION 'bid_expired: bid % is no longer acceptable', OLD.id
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS market_bids_guard_expiry ON public.market_bids;
CREATE TRIGGER market_bids_guard_expiry
  BEFORE UPDATE OF status, expires_at ON public.market_bids
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_market_bid_guard_expiry();

-- set_market_bids_updated_at would stamp every existing row as just edited.
-- Nothing reads that stamp to decide expiry, and the backfill must not
-- reorder "recently updated" lists. The trigger change is transactional.
ALTER TABLE public.market_bids DISABLE TRIGGER set_market_bids_updated_at;
UPDATE public.market_bids
SET expires_at = created_at + interval '48 hours'
WHERE expires_at IS NULL;
ALTER TABLE public.market_bids ENABLE TRIGGER set_market_bids_updated_at;

ALTER TABLE public.market_bids
  ALTER COLUMN expires_at SET NOT NULL;

CREATE INDEX IF NOT EXISTS market_bids_pending_expiry_idx
  ON public.market_bids (expires_at)
  WHERE status = 'pending';

COMMENT ON FUNCTION public.tg_market_bid_set_expiry() IS
  'Gives every new market_bids row its own 48-hour acceptance window from created_at.';

COMMENT ON FUNCTION public.tg_market_bid_guard_expiry() IS
  'Refuses acceptance of a Marketplace bid at or after expires_at. Does not change an already accepted bid. App users cannot move the clock.';

REVOKE ALL ON FUNCTION public.tg_market_bid_set_expiry() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_market_bid_guard_expiry() FROM PUBLIC, anon, authenticated;

-- The shipper's bid list returns each bid's own expires_at so an expired
-- offer is not shown as acceptable. The return shape changes, so this is
-- DROP + CREATE (42P13). The body is 20270309030000's, unchanged, with
-- mb.expires_at added as the last column.
DROP FUNCTION IF EXISTS public.list_market_bids_for_indent(uuid);

CREATE FUNCTION public.list_market_bids_for_indent(p_indent_id uuid)
RETURNS TABLE (
  id                      uuid,
  indent_id               uuid,
  bidder_type             text,
  bidder_user_id          uuid,
  bidder_display_name     text,
  bidder_organization_id  uuid,
  bidder_organization_name text,
  bidder_masked_phone     text,
  bidder_phone            text,
  is_fleet_owner          boolean,
  amount                  numeric,
  note                    text,
  status                  text,
  fee_payment_status      text,
  platform_fee_amount     numeric,
  created_at              timestamptz,
  updated_at              timestamptz,
  accepted_at             timestamptz,
  vehicle_number          text,
  vehicle_brand           text,
  vehicle_model           text,
  vehicle_body_type       text,
  vehicle_capacity        text,
  expires_at              timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_org_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT i.organization_id INTO v_org_id
  FROM public.indents i
  WHERE i.id = p_indent_id;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'not_found: indent %', p_indent_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = v_org_id
      AND om.user_id = v_uid
      AND om.status = 'active'
      AND om.role <> 'driver'
  ) THEN
    RAISE EXCEPTION 'unauthorized: caller must be a non-driver member of the organization that owns this indent';
  END IF;

  RETURN QUERY
  SELECT
    mb.id,
    mb.indent_id,
    mb.bidder_type,
    mb.bidder_user_id,
    COALESCE(NULLIF(TRIM(pr.full_name), ''), 'Driver') AS bidder_display_name,
    mb.bidder_organization_id,
    bo.name AS bidder_organization_name,
    public.mask_phone_last4(
      CASE WHEN mb.bidder_type = 'organization' THEN bowner_pr.phone ELSE pr.phone END
    ) AS bidder_masked_phone,
    -- CHANGED (A8.6.2): was `mb.status = 'accepted'`. An accepted-but-unpaid
    -- award (any bidder type once a fee is ever active; organization
    -- awards specifically today, since they can sit accepted-with-no-trip
    -- indefinitely) no longer reveals the real phone.
    CASE
      WHEN mb.status = 'accepted' AND mb.fee_payment_status IN ('paid', 'not_required') THEN
        CASE WHEN mb.bidder_type = 'organization' THEN bowner_pr.phone ELSE pr.phone END
      ELSE NULL
    END AS bidder_phone,
    public.is_driver_fleet_owner(mb.bidder_user_id) AS is_fleet_owner,
    mb.amount,
    mb.note,
    mb.status,
    mb.fee_payment_status,
    mb.platform_fee_amount,
    mb.created_at,
    mb.updated_at,
    mb.accepted_at,
    ov.vehicle_number,
    ov.vehicle_brand,
    ov.vehicle_model,
    ov.vehicle_body_type,
    ov.capacity,
    mb.expires_at
  FROM public.market_bids mb
  LEFT JOIN public.profiles pr ON pr.id = mb.bidder_user_id
  LEFT JOIN public.owner_vehicles ov ON ov.id = mb.owner_vehicle_id
  LEFT JOIN public.organizations bo ON bo.id = mb.bidder_organization_id
  LEFT JOIN public.profiles bowner_pr ON bowner_pr.id = bo.owner_id
  WHERE mb.indent_id = p_indent_id
  ORDER BY mb.created_at DESC;
END;
$function$;

REVOKE ALL ON FUNCTION public.list_market_bids_for_indent(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_market_bids_for_indent(uuid) TO authenticated;

COMMENT ON FUNCTION public.list_market_bids_for_indent(uuid) IS
  'Business Review Hub: list market_bids on one indent. bidder_phone now requires status=accepted AND fee_payment_status IN (paid, not_required) -- A8.6.2 fix for the pre-existing organization-bidder contact leak (accepted-but-unpaid/unallocated award previously revealed the phone immediately). Organization/display name visibility is unaffected -- unchanged by design. expires_at is the bid''s own acceptance deadline.';
