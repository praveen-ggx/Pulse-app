-- Write path for trip_operational_timeline_events that works for the trip's assigned driver.
--
-- Why: the table's INSERT policy is "public.is_org_member(organization_id)". Driver-app flows (odometer,
-- expense request, offline sync) write timeline rows for the trip's org, but a driver is usually not a
-- member of that org, so Postgres rejects the insert (42501, ~4 per day on prod: one of the callers
-- belongs to zero orgs and is a driver on two trips). The client swallows the error, so the timeline
-- entry is silently lost.
--
-- Rule (unchanged for members, one new case):
--   allowed if the caller is an active member of the target org (exactly the old policy), OR
--   the caller is the assigned driver of the trip AND the target org is the trip's own org.
-- p_organization_id is optional; when NULL the trip's org is used. A driver can never write to any other
-- org, and nobody can write an event for a trip that does not exist. The table policies are NOT changed.
-- Append-only like before: no idempotency key, so a retry adds another row (same as the direct insert).

CREATE OR REPLACE FUNCTION public.record_trip_operational_timeline_event(
  p_trip_id         uuid,
  p_event_type      text,
  p_organization_id uuid  DEFAULT NULL,
  p_source_type     text  DEFAULT NULL,
  p_source_id       uuid  DEFAULT NULL,
  p_actor_user_id   uuid  DEFAULT NULL,
  p_payload         jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid       uuid := (SELECT auth.uid());
  v_trip_org  uuid;
  v_driver_id uuid;
  v_org       uuid;
  v_allowed   boolean;
  v_id        uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_trip_id IS NULL OR p_event_type IS NULL OR btrim(p_event_type) = '' THEN
    RAISE EXCEPTION 'invalid_arguments';
  END IF;

  SELECT t.organization_id, t.driver_id INTO v_trip_org, v_driver_id
  FROM public.trips t
  WHERE t.id = p_trip_id;

  IF v_trip_org IS NULL THEN
    RAISE EXCEPTION 'not_found: trip %', p_trip_id;
  END IF;

  v_org := COALESCE(p_organization_id, v_trip_org);

  v_allowed := EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = v_org
      AND om.user_id = v_uid
      AND om.status = 'active'
  )
  OR (
    v_org = v_trip_org
    AND v_driver_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.drivers d
      WHERE d.id = v_driver_id
        AND d.user_id = v_uid
    )
  );

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'unauthorized: caller must be a member of the organization or the assigned driver of this trip';
  END IF;

  INSERT INTO public.trip_operational_timeline_events
    (organization_id, trip_id, event_type, source_type, source_id, actor_user_id, payload)
  VALUES
    (v_org, p_trip_id, p_event_type, p_source_type, p_source_id, p_actor_user_id, COALESCE(p_payload, '{}'::jsonb))
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.record_trip_operational_timeline_event(uuid, text, uuid, text, uuid, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_trip_operational_timeline_event(uuid, text, uuid, text, uuid, uuid, jsonb) TO authenticated;
