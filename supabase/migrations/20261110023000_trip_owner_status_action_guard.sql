-- Trip Ops can still simulate and revoke before delivery. Leaving a delivered
-- trip (completed, delivered, done) and cancelling an integrated award are
-- owner/admin only. The check runs in the same UPDATE that would change the
-- row, so a concurrent status change is the OLD row this statement locks.
--
-- Direct PostgREST writes run as current_user = authenticated. Writes inside
-- SECURITY DEFINER functions, and service_role / postgres sessions, keep their
-- own checks and are not re-decided here.

BEGIN;

SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.caller_is_trip_action_admin(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members om
    WHERE om.organization_id = p_org_id
      AND om.user_id = auth.uid()
      AND om.status = 'active'
      AND (
        om.role IN ('owner', 'admin')
        OR COALESCE(om.permissions ->> 'platformRole', '') = 'admin'
      )
  );
$$;

REVOKE ALL ON FUNCTION public.caller_is_trip_action_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.caller_is_trip_action_admin(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.trips_guard_owner_status_actions()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_old text := lower(trim(coalesce(OLD.status, '')));
  v_new text := lower(trim(coalesce(NEW.status, '')));
BEGIN
  -- Office RPCs and service_role run as a different role. authenticated is the
  -- direct Data API / client update path this guard exists for.
  IF current_user IS DISTINCT FROM 'authenticated' THEN
    RETURN NEW;
  END IF;

  IF v_old = v_new THEN
    RETURN NEW;
  END IF;

  -- Revoke Last after delivery. OLD is the locked pre-update status.
  IF v_old IN ('completed', 'delivered', 'done') THEN
    IF NOT public.caller_is_trip_action_admin(OLD.organization_id) THEN
      RAISE EXCEPTION 'trip_revoke_delivered_owner_only'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Integrated award cancel. Read the pre-update indent and supplier: the
  -- client clears indent_id in the same statement.
  IF v_new IN ('cancelled', 'canceled')
     AND lower(trim(coalesce(OLD.source, ''))) IS DISTINCT FROM 'market_bid'
     AND OLD.source_market_bid_id IS NULL
     AND OLD.indent_id IS NOT NULL
     AND OLD.supplier_id IS NOT NULL
  THEN
    IF v_old IN (
      'picked_up', 'pickup', 'in_progress', 'in_transit', 'dispatched', 'transit',
      'at_drop', 'unloading', 'arrived', 'at_destination',
      'completed', 'delivered', 'done'
    ) THEN
      RAISE EXCEPTION 'trip_cancel_not_eligible'
        USING ERRCODE = '42501';
    END IF;
    IF NOT public.caller_is_trip_action_admin(OLD.organization_id) THEN
      RAISE EXCEPTION 'trip_cancel_owner_only'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.trips_guard_owner_status_actions() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS b_trips_guard_owner_status_actions ON public.trips;
CREATE TRIGGER b_trips_guard_owner_status_actions
  BEFORE UPDATE ON public.trips
  FOR EACH ROW
  EXECUTE FUNCTION public.trips_guard_owner_status_actions();

COMMIT;
