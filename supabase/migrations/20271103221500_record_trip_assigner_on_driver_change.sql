-- Record who assigned/reassigned a driver on trips.
-- Indent deploy RPCs (create_trip_from_direct_quote, award_indent_to_trip,
-- create_trip_from_assigned_indent) set driver_id but historically left
-- assigned_by_user_id null and wrote no trip_assignment_audit row — so Manifest
-- Pulse could not show an assigner name.
--
-- This BEFORE/AFTER trigger covers every write path (RPC + client updateTripAssignment).

SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.trips_record_assigner_on_driver_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_event text;
BEGIN
  -- Only when a driver is present and this is a new assignment / change.
  IF NEW.driver_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.driver_id IS NOT DISTINCT FROM OLD.driver_id THEN
    RETURN NEW;
  END IF;

  -- Stamp assigner when we know the acting user. Do not clear an existing value
  -- when the write runs without a JWT (maintenance / service scripts).
  IF v_actor IS NOT NULL THEN
    NEW.assigned_by_user_id := v_actor;
  ELSIF TG_OP = 'INSERT' AND NEW.assigned_by_user_id IS NULL THEN
    NEW.assigned_by_user_id := COALESCE(NEW.created_by_user_id, NEW.owner_user_id);
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trips_write_assignment_audit_on_driver_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_event text;
  v_prev_driver uuid;
  v_prev_vehicle uuid;
BEGIN
  IF to_regclass('public.trip_assignment_audit') IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.driver_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Audit only when the driver is newly set or changed (not vehicle-only edits).
  IF TG_OP = 'UPDATE'
     AND NEW.driver_id IS NOT DISTINCT FROM OLD.driver_id THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    v_prev_driver := OLD.driver_id;
    v_prev_vehicle := OLD.vehicle_id;
  ELSE
    v_prev_driver := NULL;
    v_prev_vehicle := NULL;
  END IF;

  IF v_prev_driver IS NOT NULL AND v_prev_driver IS DISTINCT FROM NEW.driver_id THEN
    v_event := 'reassignment';
  ELSE
    v_event := 'assignment';
  END IF;

  -- Prefer JWT actor, then the stamped column, then creator.
  v_actor := COALESCE(
    v_actor,
    NEW.assigned_by_user_id,
    NEW.created_by_user_id,
    NEW.owner_user_id
  );

  -- Skip if the app already wrote an audit row for this assignment (updateTripAssignment).
  IF EXISTS (
    SELECT 1
    FROM public.trip_assignment_audit a
    WHERE a.trip_id = NEW.id
      AND a.driver_id_new IS NOT DISTINCT FROM NEW.driver_id
      AND a.changed_at > clock_timestamp() - interval '15 seconds'
  ) THEN
    RETURN NEW;
  END IF;

  BEGIN
    INSERT INTO public.trip_assignment_audit (
      trip_id,
      event_type,
      driver_id_prev,
      driver_id_new,
      vehicle_id_prev,
      vehicle_id_new,
      changed_by
    ) VALUES (
      NEW.id,
      v_event,
      v_prev_driver,
      NEW.driver_id,
      v_prev_vehicle,
      NEW.vehicle_id,
      v_actor
    );
  EXCEPTION
    WHEN unique_violation THEN
      NULL;
    WHEN check_violation THEN
      NULL;
    WHEN insufficient_privilege THEN
      RAISE WARNING 'trips_write_assignment_audit: insufficient_privilege trip_id=% actor=%', NEW.id, v_actor;
    WHEN foreign_key_violation THEN
      RAISE WARNING 'trips_write_assignment_audit: fk_violation trip_id=% actor=%', NEW.id, v_actor;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_trips_record_assigner_on_driver_change ON public.trips;
CREATE TRIGGER trg_trips_record_assigner_on_driver_change
  BEFORE INSERT OR UPDATE OF driver_id
  ON public.trips
  FOR EACH ROW
  EXECUTE FUNCTION public.trips_record_assigner_on_driver_change();

DROP TRIGGER IF EXISTS trg_trips_write_assignment_audit_on_driver_change ON public.trips;
CREATE TRIGGER trg_trips_write_assignment_audit_on_driver_change
  AFTER INSERT OR UPDATE OF driver_id
  ON public.trips
  FOR EACH ROW
  EXECUTE FUNCTION public.trips_write_assignment_audit_on_driver_change();

COMMENT ON FUNCTION public.trips_record_assigner_on_driver_change() IS
  'Stamps trips.assigned_by_user_id from auth.uid() whenever driver_id is set or changed.';

COMMENT ON FUNCTION public.trips_write_assignment_audit_on_driver_change() IS
  'Writes trip_assignment_audit (assignment/reassignment) when driver_id changes so Manifest Pulse can show the assigner.';
