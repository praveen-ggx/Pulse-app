-- DCO corner case: no NEW fleet employment while DOCS_APPROVED.
--
-- DOCS_APPROVED (20271123110000) means "admin approved the DCO request; the
-- driver is leaving their fleet". Joining another fleet in that state would
-- either park a second employment behind the approval (leaving fleet A no
-- longer activates DCO) or, if activation was missed, let an approved driver
-- slip back into employment.
--
-- accept_driver_invite already refuses a second fleet (driver_already_in_fleet),
-- but roster linking by phone and membership rows go straight to the tables.
-- The two existing guard triggers cover every path, so they now also refuse a
-- transition INTO active employment while DOCS_APPROVED.
--
-- Unchanged: edits to an existing active row (pay terms, name), leaving a
-- fleet, APPROVED / SUSPENDED handling, tracking-only / independent rows.

CREATE OR REPLACE FUNCTION public._dco_awaiting_fleet_exit(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.dco_profiles dp
    WHERE dp.user_id = p_user_id AND dp.status = 'DOCS_APPROVED'
  );
$function$;

REVOKE ALL ON FUNCTION public._dco_awaiting_fleet_exit(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._dco_awaiting_fleet_exit(uuid) FROM anon;
REVOKE ALL ON FUNCTION public._dco_awaiting_fleet_exit(uuid) FROM authenticated;

CREATE OR REPLACE FUNCTION public.enforce_dco_not_employee_driver_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF NEW.user_id IS NULL
     OR NEW.left_at IS NOT NULL
     OR NEW.relationship_status IS DISTINCT FROM 'active_employee' THEN
    RETURN NEW;
  END IF;

  -- Only a transition INTO active employment is checked; an existing active
  -- row being edited (pay terms, name) is left alone.
  IF TG_OP = 'UPDATE'
     AND OLD.user_id IS NOT DISTINCT FROM NEW.user_id
     AND OLD.left_at IS NULL
     AND OLD.relationship_status IS NOT DISTINCT FROM 'active_employee' THEN
    RETURN NEW;
  END IF;

  IF public._holds_dco_status(NEW.user_id) THEN
    RAISE EXCEPTION 'dco_not_employee_driver: DCOs cannot join a business as employee drivers. You can operate independently as a DCO.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF public._dco_awaiting_fleet_exit(NEW.user_id) THEN
    RAISE EXCEPTION 'dco_awaiting_fleet_exit: This driver is approved as a DCO and is leaving their fleet, so they cannot join a fleet now.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_dco_not_driver_member()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF NEW.user_id IS NULL OR NEW.role IS DISTINCT FROM 'driver' OR NEW.status IS DISTINCT FROM 'active' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.user_id IS NOT DISTINCT FROM NEW.user_id
     AND OLD.role IS NOT DISTINCT FROM 'driver'
     AND OLD.status IS NOT DISTINCT FROM 'active' THEN
    RETURN NEW;
  END IF;

  IF public._holds_dco_status(NEW.user_id) THEN
    RAISE EXCEPTION 'dco_not_employee_driver: DCOs cannot join a business as employee drivers. You can operate independently as a DCO.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF public._dco_awaiting_fleet_exit(NEW.user_id) THEN
    RAISE EXCEPTION 'dco_awaiting_fleet_exit: This driver is approved as a DCO and is leaving their fleet, so they cannot join a fleet now.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$function$;
