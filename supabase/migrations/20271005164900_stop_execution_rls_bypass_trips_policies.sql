-- Driver home Job Card (multi-order) reads stop_execution_state and embeds
-- execution_plan_stops. Those SELECT policies joined public.trips as the
-- caller, so Postgres inlined every trips SELECT policy into the plan
-- (1400+ subplans, ~1.7s planning, multi-minute CPU sessions under load).
-- Helpers are SECURITY DEFINER so the trip lookup does not re-enter trips RLS.
-- Same authorization: assigned driver, or org staff of the trip's organization.

CREATE OR REPLACE FUNCTION public.caller_is_staff_of_trip(p_trip_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.trips t
    WHERE t.id = p_trip_id
      AND public.is_org_staff(t.organization_id)
  );
$$;

COMMENT ON FUNCTION public.caller_is_staff_of_trip(uuid) IS
  'RLS helper: true when auth.uid() is org staff of the trip organization. Bypasses trips RLS.';

REVOKE ALL ON FUNCTION public.caller_is_staff_of_trip(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.caller_is_staff_of_trip(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.caller_is_staff_of_trip(uuid) TO anon;

CREATE OR REPLACE FUNCTION public.driver_can_read_execution_plan_stop(p_stop_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.stop_execution_state ses
    JOIN public.trips t ON t.id = ses.trip_id
    JOIN public.drivers d ON d.id = t.driver_id
    WHERE ses.stop_id = p_stop_id
      AND d.user_id = (SELECT auth.uid())
  );
$$;

COMMENT ON FUNCTION public.driver_can_read_execution_plan_stop(uuid) IS
  'RLS helper: true when auth.uid() is the assigned driver of a trip that executes this stop. Bypasses stop_execution_state and trips RLS.';

REVOKE ALL ON FUNCTION public.driver_can_read_execution_plan_stop(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.driver_can_read_execution_plan_stop(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.driver_can_read_execution_plan_stop(uuid) TO anon;

DROP POLICY IF EXISTS stop_execution_state_org_select ON public.stop_execution_state;
CREATE POLICY stop_execution_state_org_select ON public.stop_execution_state
  FOR SELECT
  USING (public.caller_is_staff_of_trip(trip_id));

-- FOR ALL also applied on SELECT and duplicated the trips-policy expansion.
-- Staff write access stays; SELECT is only stop_execution_state_org_select.
DROP POLICY IF EXISTS stop_execution_state_org_manage ON public.stop_execution_state;

CREATE POLICY stop_execution_state_org_insert ON public.stop_execution_state
  FOR INSERT
  WITH CHECK (public.caller_is_staff_of_trip(trip_id));

CREATE POLICY stop_execution_state_org_update ON public.stop_execution_state
  FOR UPDATE
  USING (public.caller_is_staff_of_trip(trip_id))
  WITH CHECK (public.caller_is_staff_of_trip(trip_id));

CREATE POLICY stop_execution_state_org_delete ON public.stop_execution_state
  FOR DELETE
  USING (public.caller_is_staff_of_trip(trip_id));

DROP POLICY IF EXISTS stop_execution_state_driver_select ON public.stop_execution_state;
CREATE POLICY stop_execution_state_driver_select ON public.stop_execution_state
  FOR SELECT
  USING (public.driver_has_assigned_trip_for_trip_id(trip_id));

DROP POLICY IF EXISTS stop_execution_state_driver_update ON public.stop_execution_state;
CREATE POLICY stop_execution_state_driver_update ON public.stop_execution_state
  FOR UPDATE
  USING (public.driver_has_assigned_trip_for_trip_id(trip_id))
  WITH CHECK (public.driver_has_assigned_trip_for_trip_id(trip_id));

DROP POLICY IF EXISTS execution_plan_stops_driver_select ON public.execution_plan_stops;
CREATE POLICY execution_plan_stops_driver_select ON public.execution_plan_stops
  FOR SELECT
  USING (public.driver_can_read_execution_plan_stop(id));

COMMENT ON POLICY stop_execution_state_driver_select ON public.stop_execution_state IS
  'Assigned driver reads own trip stops. Helper avoids inlining trips SELECT policies.';

COMMENT ON POLICY execution_plan_stops_driver_select ON public.execution_plan_stops IS
  'Assigned driver reads stops on their trip. Helper avoids stop_execution_state and trips RLS expansion.';
