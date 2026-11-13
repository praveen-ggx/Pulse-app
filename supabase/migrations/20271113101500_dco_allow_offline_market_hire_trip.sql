SET LOCAL lock_timeout = '5s';

-- Offline hire of a DCO's truck.
--
-- A Business creating an Aggregate (market-hire) trip adds the hired driver by
-- phone, which links a tracking_only driver row and sets trips.driver_id. When
-- that phone belongs to an approved DCO, enforce_dco_not_assigned_fleet_trip
-- (20271005120000) refused it as an employee-driver assignment, leaving the
-- trip created but unassigned.
--
-- A tracking_only row on a market-hire trip is not employment (same rule the
-- app already applies: DriverControlScreen, drivers.service, aggregateDrivers).
-- Exempt exactly that pair. Everything else is unchanged:
--   * FLEET trips with trip_payout_mode 'asset' or NULL to a DCO stay blocked
--     (boundary test G).
--   * Any non-tracking_only driver row stays blocked.
--   * DCO Marketplace trips (operating_mode = 'DCO') never reach this check.

CREATE OR REPLACE FUNCTION public.enforce_dco_not_assigned_fleet_trip()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_driver_user_id uuid;
  v_tracking_only boolean;
BEGIN
  IF NEW.driver_id IS NULL OR NEW.operating_mode IS DISTINCT FROM 'FLEET' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.driver_id IS NOT DISTINCT FROM NEW.driver_id THEN
    RETURN NEW;
  END IF;

  SELECT d.user_id, d.tracking_only INTO v_driver_user_id, v_tracking_only
  FROM public.drivers d WHERE d.id = NEW.driver_id;

  -- Offline market hire: the DCO is tracked on the trip, not employed.
  IF NEW.trip_payout_mode = 'market' AND v_tracking_only IS TRUE THEN
    RETURN NEW;
  END IF;

  IF v_driver_user_id IS NOT NULL AND public._holds_dco_status(v_driver_user_id) THEN
    RAISE EXCEPTION 'dco_not_employee_driver: DCOs cannot receive employee-driver assignments from a business. You can operate independently as a DCO.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.enforce_dco_not_assigned_fleet_trip() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.enforce_dco_not_assigned_fleet_trip() IS
  'Refuses FLEET trip assignments to a DCO, except an offline market-hire trip (trip_payout_mode = market) on a tracking_only driver row.';
