-- Hardens the two event-writing functions added in 20261125124952 / 20261125132909 after code review.
-- Replaces both bodies (same signatures, so the app needs no change). Adds one helper.
--
-- Findings fixed:
--  1. A non-member driver could write ANY event type with ANY actor_user_id into an org's timeline.
--     Now the driver path only accepts the event types driver flows write, always records the caller as
--     the actor, and accepts approval_changed only for a driver cancelling their own request.
--  2. Any member of any org could write events for another org's trip (and claim the global singleton
--     key "<trip>:<event>" so the real org's event was silently dropped). Now the target org must be a
--     party to the trip: its owner, the linked supplier or client org, or the accepted direct-quote
--     bidder org. Checked against prod history: 10,371 workflow rows and 85 timeline rows, 0 outside this rule.
--  3. A missing trip and an unauthorized caller now raise the same generic error (no trip-id probing).
--  4. record_trip_workflow_event now requires an ACTIVE membership, like record_trip_operational_timeline_event
--     (prod has 285 active and 17 inactive members, none NULL).
--  5. Timeline writes are retry-safe: an identical row (same trip, org, type, source, actor, payload) written
--     in the last 2 minutes is not inserted again; the existing id is returned. Serialised with an advisory
--     transaction lock, no table change. Legitimate repeated events differ in payload or time.
--
-- Not changed: table policies, grants (authenticated only), SECURITY DEFINER + empty search_path.

CREATE OR REPLACE FUNCTION private.org_is_trip_party(p_org_id uuid, p_trip_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.trips t
    WHERE t.id = p_trip_id
      AND p_org_id IS NOT NULL
      AND (
        t.organization_id = p_org_id
        OR EXISTS (
          SELECT 1 FROM public.suppliers s
          WHERE s.id = t.supplier_id AND s.linked_organization_id = p_org_id
        )
        OR EXISTS (
          SELECT 1 FROM public.clients c
          WHERE c.id = t.client_id AND c.linked_organization_id = p_org_id
        )
        OR (
          t.indent_id IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM public.direct_quotes dq
            WHERE dq.indent_id = t.indent_id
              AND lower(trim(COALESCE(dq.status, ''))) = 'accepted'
              AND dq.bidder_organization_id = p_org_id
          )
        )
      )
  );
$function$;

REVOKE ALL ON FUNCTION private.org_is_trip_party(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.org_is_trip_party(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.record_trip_workflow_event(
  p_trip_id         uuid,
  p_org_id          uuid,
  p_event_type      text,
  p_payload         jsonb DEFAULT '{}'::jsonb,
  p_idempotency_key text  DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_row public.trip_workflow_events%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_trip_id IS NULL OR p_org_id IS NULL OR p_event_type IS NULL OR btrim(p_event_type) = '' THEN
    RAISE EXCEPTION 'invalid_arguments';
  END IF;

  -- Active member of the target org AND that org is a party to the trip.
  -- One generic error for "not a member", "not a party" and "no such trip".
  IF NOT EXISTS (
       SELECT 1 FROM public.organization_members om
       WHERE om.organization_id = p_org_id
         AND om.user_id = v_uid
         AND om.status = 'active'
     )
     OR NOT private.org_is_trip_party(p_org_id, p_trip_id) THEN
    RAISE EXCEPTION 'unauthorized: caller must be an active member of an organization that is a party to this trip';
  END IF;

  IF p_idempotency_key IS NOT NULL
     AND p_idempotency_key <> p_trip_id::text || ':' || p_event_type THEN
    RAISE EXCEPTION 'invalid_idempotency_key';
  END IF;

  INSERT INTO public.trip_workflow_events (trip_id, org_id, event_type, payload, idempotency_key)
  VALUES (p_trip_id, p_org_id, p_event_type, COALESCE(p_payload, '{}'::jsonb), p_idempotency_key)
  ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN to_jsonb(v_row);
END;
$function$;

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
  v_actor     uuid := p_actor_user_id;
  v_payload   jsonb := COALESCE(p_payload, '{}'::jsonb);
  v_member    boolean;
  v_driver    boolean;
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

  IF v_trip_org IS NOT NULL THEN
    v_org := COALESCE(p_organization_id, v_trip_org);

    -- Member path: same membership rule as the table policy, plus the org must be a party to the trip.
    v_member := EXISTS (
        SELECT 1 FROM public.organization_members om
        WHERE om.organization_id = v_org
          AND om.user_id = v_uid
          AND om.status = 'active'
      )
      AND private.org_is_trip_party(v_org, p_trip_id);

    -- Driver path: the trip's assigned driver, writing to the trip's own org, driver-flow events only.
    v_driver := NOT v_member
      AND v_org = v_trip_org
      AND v_driver_id IS NOT NULL
      AND EXISTS (SELECT 1 FROM public.drivers d WHERE d.id = v_driver_id AND d.user_id = v_uid)
      AND (
        p_event_type IN (
          'odometer_added', 'discrepancy_detected', 'fuel_logged', 'toll_logged',
          'other_expense_logged', 'reimbursement_flagged', 'replay_completed', 'replay_failed'
        )
        OR (p_event_type = 'approval_changed' AND v_payload ->> 'action' = 'driver_cancelled')
      );
  END IF;

  -- One generic error for "no such trip", "not allowed" and "not a party".
  IF NOT COALESCE(v_member, false) AND NOT COALESCE(v_driver, false) THEN
    RAISE EXCEPTION 'unauthorized: caller must be an active member of a party organization or the assigned driver of this trip';
  END IF;

  IF v_driver THEN
    v_actor := v_uid;  -- a driver can never attribute an event to someone else
  END IF;

  -- Retry safety: serialise identical writes and skip an identical row from the last 2 minutes.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(concat_ws('|', p_trip_id, v_org, p_event_type, p_source_type, p_source_id, v_actor), 0)
  );

  SELECT e.id INTO v_id
  FROM public.trip_operational_timeline_events e
  WHERE e.trip_id = p_trip_id
    AND e.organization_id = v_org
    AND e.event_type = p_event_type
    AND e.source_type IS NOT DISTINCT FROM p_source_type
    AND e.source_id IS NOT DISTINCT FROM p_source_id
    AND e.actor_user_id IS NOT DISTINCT FROM v_actor
    AND e.payload = v_payload
    AND e.created_at > now() - interval '2 minutes'
  ORDER BY e.created_at DESC
  LIMIT 1;

  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  INSERT INTO public.trip_operational_timeline_events
    (organization_id, trip_id, event_type, source_type, source_id, actor_user_id, payload)
  VALUES
    (v_org, p_trip_id, p_event_type, p_source_type, p_source_id, v_actor, v_payload)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;
