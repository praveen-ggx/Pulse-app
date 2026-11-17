-- Driver "Decline trip" could unassign the driver from a trip in ANY status —
-- including one already running or completed — and no reason was recorded.
--
-- Now:
--   * only allowed before the trip starts (draft / pending_acceptance / assigned)
--   * optional reason, stored on the reassignment audit row for the fleet
--
-- The app falls back to the old 1-argument call until this is applied.

ALTER TABLE public.trip_assignment_audit
  ADD COLUMN IF NOT EXISTS reason text;

COMMENT ON COLUMN public.trip_assignment_audit.reason IS
  'Why the driver declined (driver_reject_trip). Null for other events.';

DROP FUNCTION IF EXISTS public.driver_reject_trip(uuid);

CREATE OR REPLACE FUNCTION public.driver_reject_trip(p_trip_id uuid, p_reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_driver_id_prev uuid;
  v_vehicle_id_prev uuid;
  v_status text;
BEGIN
  SELECT t.driver_id, t.vehicle_id, t.status
  INTO v_driver_id_prev, v_vehicle_id_prev, v_status
  FROM public.trips t
  INNER JOIN public.drivers d ON d.id = t.driver_id AND d.user_id = auth.uid()
  WHERE t.id = p_trip_id
  FOR UPDATE OF t;

  IF v_driver_id_prev IS NULL THEN
    RAISE EXCEPTION 'Trip not found or you are not the assigned driver';
  END IF;

  IF coalesce(v_status, '') NOT IN ('draft', 'pending_acceptance', 'assigned') THEN
    RAISE EXCEPTION 'trip_already_started: this trip has already started and cannot be declined'
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.trips
  SET driver_id = null, updated_at = now()
  WHERE id = p_trip_id;

  BEGIN
    INSERT INTO public.trip_assignment_audit (
      trip_id,
      event_type,
      driver_id_prev,
      driver_id_new,
      vehicle_id_prev,
      vehicle_id_new,
      changed_by,
      reason
    ) VALUES (
      p_trip_id,
      'reassignment',
      v_driver_id_prev,
      null,
      v_vehicle_id_prev,
      v_vehicle_id_prev,
      auth.uid(),
      nullif(left(trim(coalesce(p_reason, '')), 200), '')
    );
  EXCEPTION
    WHEN undefined_table THEN
      NULL;
  END;
END;
$$;

ALTER FUNCTION public.driver_reject_trip(uuid, text) OWNER TO postgres;

COMMENT ON FUNCTION public.driver_reject_trip(uuid, text) IS
  'Driver unassigns themselves from a trip before it starts; records reassignment audit (with reason) for the dispatcher.';

REVOKE ALL ON FUNCTION public.driver_reject_trip(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.driver_reject_trip(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.driver_reject_trip(uuid, text) TO service_role;

NOTIFY pgrst, 'reload schema';
