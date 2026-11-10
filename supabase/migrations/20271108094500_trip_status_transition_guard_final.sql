-- Final trip-status authorization. Sorts after 20271005211835, which replaces
-- change_trip_status_with_notification with an unguarded body, and after every
-- other migration in this tree (latest 20271107190000). A full replay therefore
-- ends with these definitions. An incremental apply, where 20271005211835 is
-- already recorded, ends with them too.
--
-- trips_enforce_owner_status_transition is the only copy of the delivered-revoke
-- and integrated-cancel rules. The direct-update trigger calls it for
-- authenticated writers and still returns early for service_role, postgres, and
-- other SECURITY DEFINER writers. Those writers enforce the rules themselves
-- when the JWT has a user id. A null auth.uid() remains the internal path.

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

CREATE OR REPLACE FUNCTION public.trips_enforce_owner_status_transition(
  p_org_id uuid,
  p_old_status text,
  p_new_status text,
  p_source text,
  p_source_market_bid_id uuid,
  p_indent_id uuid,
  p_supplier_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_old text := lower(trim(coalesce(p_old_status, '')));
  v_new text := lower(trim(coalesce(p_new_status, '')));
BEGIN
  -- Internal and service_role calls have no user JWT. Authenticated callers do.
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;
  IF v_old = v_new THEN
    RETURN;
  END IF;

  IF v_old IN ('completed', 'delivered', 'done') THEN
    IF NOT public.caller_is_trip_action_admin(p_org_id) THEN
      RAISE EXCEPTION 'trip_revoke_delivered_owner_only'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF v_new IN ('cancelled', 'canceled')
     AND lower(trim(coalesce(p_source, ''))) IS DISTINCT FROM 'market_bid'
     AND p_source_market_bid_id IS NULL
     AND p_indent_id IS NOT NULL
     AND p_supplier_id IS NOT NULL
  THEN
    IF v_old IN (
      'picked_up', 'pickup', 'in_progress', 'in_transit', 'dispatched', 'transit',
      'at_drop', 'unloading', 'arrived', 'at_destination',
      'completed', 'delivered', 'done'
    ) THEN
      RAISE EXCEPTION 'trip_cancel_not_eligible'
        USING ERRCODE = '42501';
    END IF;
    IF NOT public.caller_is_trip_action_admin(p_org_id) THEN
      RAISE EXCEPTION 'trip_cancel_owner_only'
        USING ERRCODE = '42501';
    END IF;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.trips_enforce_owner_status_transition(uuid, text, text, text, uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.trips_enforce_owner_status_transition(uuid, text, text, text, uuid, uuid, uuid) TO authenticated;

-- True for internal callers, active trip-org staff, or active staff of the
-- supplier's linked organization. Inactive members and other organizations
-- are false. The caller-supplied user id is not consulted.
CREATE OR REPLACE FUNCTION public.trips_status_writer_is_member(
  p_trip_org uuid,
  p_supplier_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_linked uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN true;
  END IF;
  IF public.is_org_staff(p_trip_org) THEN
    RETURN true;
  END IF;
  SELECT s.linked_organization_id INTO v_linked
  FROM public.suppliers s
  WHERE s.id = p_supplier_id;
  RETURN v_linked IS NOT NULL AND public.is_org_staff(v_linked);
END;
$$;

REVOKE ALL ON FUNCTION public.trips_status_writer_is_member(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.trips_status_writer_is_member(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.trips_guard_owner_status_actions()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF current_user IS DISTINCT FROM 'authenticated' THEN
    RETURN NEW;
  END IF;
  PERFORM public.trips_enforce_owner_status_transition(
    OLD.organization_id,
    OLD.status,
    NEW.status,
    OLD.source,
    OLD.source_market_bid_id,
    OLD.indent_id,
    OLD.supplier_id
  );
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.trips_guard_owner_status_actions() FROM PUBLIC, anon;
DROP TRIGGER IF EXISTS b_trips_guard_owner_status_actions ON public.trips;
CREATE TRIGGER b_trips_guard_owner_status_actions
  BEFORE UPDATE ON public.trips
  FOR EACH ROW
  EXECUTE FUNCTION public.trips_guard_owner_status_actions();

CREATE OR REPLACE FUNCTION public.change_trip_status_with_notification(
  p_trip_id         uuid,
  p_organization_id uuid,
  p_new_status      text,
  p_user_id         uuid DEFAULT NULL,
  p_user_name       text DEFAULT 'Dispatcher'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid         uuid := (SELECT auth.uid());
  v_org         uuid;
  v_prev_status text;
  v_source      text;
  v_source_market_bid_id uuid;
  v_indent_id   uuid;
  v_supplier_id uuid;
  v_changed_at  text;
  v_sender_name text;
BEGIN
  SELECT t.organization_id, t.status, t.source, t.source_market_bid_id,
         t.indent_id, t.supplier_id
    INTO v_org, v_prev_status, v_source, v_source_market_bid_id,
         v_indent_id, v_supplier_id
  FROM public.trips t
  WHERE t.id = p_trip_id
  FOR UPDATE;

  IF NOT FOUND
     OR v_uid IS NULL
     OR NOT public.is_org_staff(v_org)
     OR (p_organization_id IS NOT NULL AND p_organization_id IS DISTINCT FROM v_org) THEN
    RAISE EXCEPTION 'trip_not_found: %', p_trip_id USING ERRCODE = '42501';
  END IF;

  PERFORM public.trips_enforce_owner_status_transition(
    v_org, v_prev_status, p_new_status, v_source,
    v_source_market_bid_id, v_indent_id, v_supplier_id
  );

  SELECT nullif(trim(p.full_name), '') INTO v_sender_name
  FROM public.profiles p
  WHERE p.id = v_uid;
  v_sender_name := coalesce(v_sender_name, 'Dispatcher');

  UPDATE public.trips
  SET    status     = p_new_status,
         updated_at = NOW()
  WHERE  id = p_trip_id;

  v_changed_at := to_char(
    now() AT TIME ZONE 'UTC',
    'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
  );

  INSERT INTO public.trip_messages (
    conversation_id, organization_id,
    sender_user_id, sender_role, sender_name,
    content, message_type, metadata,
    is_read, is_delivered
  )
  SELECT
    tc.id,
    tc.organization_id,
    v_uid,
    'system',
    'System',
    v_sender_name || ' changed status: '
      || COALESCE(v_prev_status, '—') || ' → ' || p_new_status,
    'status_change',
    jsonb_build_object(
      'event_type',      'status_change',
      'previous_status', v_prev_status,
      'new_status',      p_new_status,
      'changed_by',      v_uid,
      'changed_by_name', v_sender_name,
      'changed_at',      v_changed_at
    ),
    TRUE,
    TRUE
  FROM public.trip_conversations tc
  WHERE tc.trip_id = p_trip_id;

  RETURN jsonb_build_object(
    'ok',              TRUE,
    'previous_status', v_prev_status,
    'new_status',      p_new_status,
    'changed_at',      v_changed_at
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.change_trip_status_with_notification(uuid, uuid, text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.change_trip_status_with_notification(uuid, uuid, text, uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.submit_business_event(
  p_organization_id  UUID,
  p_trip_id          UUID,
  p_event_type       TEXT,
  p_content          TEXT,
  p_metadata         JSONB DEFAULT '{}',
  p_new_trip_status  TEXT  DEFAULT NULL,
  p_user_id          UUID  DEFAULT NULL,
  p_user_name        TEXT  DEFAULT 'System',
  p_conversation_id  UUID  DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org          uuid;
  v_prev_status  TEXT;
  v_source       text;
  v_source_market_bid_id uuid;
  v_indent_id    uuid;
  v_supplier_id  uuid;
  v_updated_at   TEXT;
  v_message_ids  UUID[] := '{}';
  v_new_id       UUID;
  v_sender_role  TEXT;
  v_linked       uuid;
BEGIN
  SELECT t.organization_id, t.status, t.source, t.source_market_bid_id,
         t.indent_id, t.supplier_id
    INTO v_org, v_prev_status, v_source, v_source_market_bid_id,
         v_indent_id, v_supplier_id
  FROM public.trips t
  WHERE t.id = p_trip_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'submit_business_event: trip % not accessible for org %',
      p_trip_id, p_organization_id;
  END IF;

  SELECT s.linked_organization_id INTO v_linked
  FROM public.suppliers s
  WHERE s.id = v_supplier_id;

  IF v_org IS DISTINCT FROM p_organization_id
     AND v_linked IS DISTINCT FROM p_organization_id THEN
    RAISE EXCEPTION 'submit_business_event: trip % not accessible for org %',
      p_trip_id, p_organization_id;
  END IF;

  IF NOT public.trips_status_writer_is_member(v_org, v_supplier_id) THEN
    RAISE EXCEPTION 'submit_business_event: trip % not accessible for org %',
      p_trip_id, p_organization_id;
  END IF;

  IF p_new_trip_status IS NOT NULL AND p_new_trip_status <> v_prev_status THEN
    PERFORM public.trips_enforce_owner_status_transition(
      v_org, v_prev_status, p_new_trip_status, v_source,
      v_source_market_bid_id, v_indent_id, v_supplier_id
    );
    UPDATE public.trips
    SET    status     = p_new_trip_status,
           updated_at = NOW()
    WHERE  id = p_trip_id;
  END IF;

  v_updated_at := to_char(
    NOW() AT TIME ZONE 'UTC',
    'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
  );

  v_sender_role := CASE p_event_type
    WHEN 'tracking' THEN 'driver'
    WHEN 'ledger'   THEN 'dispatcher'
    ELSE                 'system'
  END;

  IF p_conversation_id IS NOT NULL THEN
    INSERT INTO public.trip_messages (
      conversation_id, organization_id,
      sender_user_id, sender_role, sender_name,
      content, message_type, metadata,
      is_read, is_delivered
    ) VALUES (
      p_conversation_id, p_organization_id,
      p_user_id, v_sender_role, p_user_name,
      p_content, p_event_type, p_metadata,
      TRUE, TRUE
    )
    RETURNING id INTO v_new_id;
    v_message_ids := array_append(v_message_ids, v_new_id);
  ELSE
    FOR v_new_id IN
      INSERT INTO public.trip_messages (
        conversation_id, organization_id,
        sender_user_id, sender_role, sender_name,
        content, message_type, metadata,
        is_read, is_delivered
      )
      SELECT
        tc.id,
        tc.organization_id,
        p_user_id,
        v_sender_role,
        p_user_name,
        p_content,
        p_event_type,
        p_metadata,
        TRUE,
        TRUE
      FROM public.trip_conversations tc
      WHERE tc.trip_id = p_trip_id
      RETURNING id
    LOOP
      v_message_ids := array_append(v_message_ids, v_new_id);
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'ok',           TRUE,
    'message_ids',  v_message_ids,
    'updated_at',   v_updated_at,
    'prev_status',  v_prev_status,
    'new_status',   COALESCE(p_new_trip_status, v_prev_status),
    'event_type',   p_event_type
  );
END;
$$;

REVOKE ALL ON FUNCTION public.submit_business_event(UUID, UUID, TEXT, TEXT, JSONB, TEXT, UUID, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_business_event(UUID, UUID, TEXT, TEXT, JSONB, TEXT, UUID, TEXT, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.process_b2b_event(
  p_organization_id  UUID,
  p_trip_id          UUID,
  p_event_type       TEXT,
  p_payload          JSONB DEFAULT '{}'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trip        RECORD;
  v_prev_status TEXT;
  v_new_status  TEXT;
  v_content     TEXT;
  v_user_id     UUID;
  v_user_name   TEXT;
  v_conv_id     UUID;
  v_new_id      UUID;
  v_message_ids UUID[]    := '{}';
  v_trip_state  JSONB;
  v_msg_meta    JSONB;
  v_sender_role TEXT;
  v_now         TIMESTAMPTZ;
  v_canonical   TEXT;
BEGIN
  SET LOCAL statement_timeout = '8s';
  v_now       := clock_timestamp();
  v_canonical := CASE p_event_type
    WHEN 'system_log'  THEN 'system'
    WHEN 'payment'     THEN 'ledger'
    WHEN 'feedback'    THEN 'feedback_request'
    ELSE p_event_type
  END;

  SELECT t.* INTO v_trip
  FROM   public.trips t
  WHERE  t.id = p_trip_id
    AND (
      t.organization_id = p_organization_id
      OR EXISTS (
        SELECT 1 FROM public.suppliers s
        WHERE  s.id                    = t.supplier_id
          AND  s.linked_organization_id = p_organization_id
      )
    )
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'process_b2b_event: trip % not accessible for org %',
      p_trip_id, p_organization_id
    USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_prev_status := v_trip.status;
  v_new_status  := COALESCE(p_payload->>'new_status', v_prev_status);
  v_content     := COALESCE(NULLIF(trim(p_payload->>'content'), ''), 'System update');
  v_user_id     := NULLIF(p_payload->>'user_id', '')::UUID;
  v_user_name   := COALESCE(NULLIF(p_payload->>'user_name', ''), 'System');
  v_conv_id     := NULLIF(p_payload->>'conversation_id', '')::UUID;

  -- Locked row above. Payload user_id is not an identity. Reject before the
  -- status write and before any trip_messages insert.
  IF NOT public.trips_status_writer_is_member(v_trip.organization_id, v_trip.supplier_id) THEN
    RAISE EXCEPTION 'process_b2b_event: trip % not accessible for org %',
      p_trip_id, p_organization_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  PERFORM public.trips_enforce_owner_status_transition(
    v_trip.organization_id,
    v_prev_status,
    v_new_status,
    v_trip.source,
    v_trip.source_market_bid_id,
    v_trip.indent_id,
    v_trip.supplier_id
  );

  UPDATE public.trips
  SET
    status     = v_new_status,
    driver_id  = CASE WHEN p_payload ? 'driver_id'
                      THEN NULLIF(p_payload->>'driver_id', '')::UUID
                      ELSE driver_id  END,
    vehicle_id = CASE WHEN p_payload ? 'vehicle_id'
                      THEN NULLIF(p_payload->>'vehicle_id', '')::UUID
                      ELSE vehicle_id END,
    updated_at = v_now
  WHERE id = p_trip_id;

  SELECT t.* INTO v_trip FROM public.trips t WHERE t.id = p_trip_id;

  v_trip_state := jsonb_build_object(
    'id',                     v_trip.id,
    'trip_number',            v_trip.trip_number,
    'display_trip_id',        v_trip.display_trip_id,
    'status',                 v_trip.status,
    'driver_id',              v_trip.driver_id,
    'vehicle_id',             v_trip.vehicle_id,
    'supplier_id',            v_trip.supplier_id,
    'client_id',              v_trip.client_id,
    'driver_display_name',    v_trip.driver_display_name,
    'vehicle_display_number', v_trip.vehicle_display_number,
    'pickup_area',            v_trip.pickup_area,
    'drop_location',          v_trip.drop_location,
    'pickup_date',            v_trip.pickup_date,
    'payment_status',         v_trip.payment_status,
    'updated_at',             to_char(v_now AT TIME ZONE 'UTC',
                                      'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  );

  v_sender_role := CASE v_canonical
    WHEN 'tracking'     THEN 'driver'
    WHEN 'ledger'        THEN 'dispatcher'
    WHEN 'ledger_event'  THEN 'dispatcher'
    ELSE                   'system'
  END;

  v_msg_meta := jsonb_build_object(
    'event_type',      p_event_type,
    'previous_status', v_prev_status,
    'new_status',      v_new_status,
    'changed_by',      v_user_id,
    'changed_by_name', v_user_name,
    'changed_at',      to_char(v_now AT TIME ZONE 'UTC',
                               'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'trip_state',      v_trip_state
  ) || COALESCE(p_payload->'extra_meta', '{}');

  IF v_conv_id IS NOT NULL THEN
    INSERT INTO public.trip_messages (
      conversation_id, organization_id,
      sender_user_id, sender_role, sender_name,
      content, message_type, metadata, is_read, is_delivered
    ) VALUES (
      v_conv_id, p_organization_id,
      v_user_id, v_sender_role, v_user_name,
      v_content, v_canonical, v_msg_meta, TRUE, TRUE
    ) RETURNING id INTO v_new_id;
    v_message_ids := array_append(v_message_ids, v_new_id);

  ELSIF v_canonical IN ('ledger', 'ledger_event') THEN
    FOR v_new_id IN
      INSERT INTO public.trip_messages (
        conversation_id, organization_id,
        sender_user_id, sender_role, sender_name,
        content, message_type, metadata, is_read, is_delivered
      )
      SELECT tc.id, tc.organization_id,
             v_user_id, v_sender_role, v_user_name,
             v_content, v_canonical, v_msg_meta, TRUE, TRUE
      FROM   public.trip_conversations tc
      WHERE  tc.trip_id    = p_trip_id
        AND  tc.party_type IN ('client', 'supplier')
      RETURNING id
    LOOP
      v_message_ids := array_append(v_message_ids, v_new_id);
    END LOOP;

  ELSIF v_canonical = 'tracking' THEN
    FOR v_new_id IN
      INSERT INTO public.trip_messages (
        conversation_id, organization_id,
        sender_user_id, sender_role, sender_name,
        content, message_type, metadata, is_read, is_delivered
      )
      SELECT tc.id, tc.organization_id,
             v_user_id, v_sender_role, v_user_name,
             v_content, v_canonical, v_msg_meta, TRUE, TRUE
      FROM   public.trip_conversations tc
      WHERE  tc.trip_id    = p_trip_id
        AND  tc.party_type = 'driver'
      RETURNING id
    LOOP
      v_message_ids := array_append(v_message_ids, v_new_id);
    END LOOP;

  ELSE
    FOR v_new_id IN
      INSERT INTO public.trip_messages (
        conversation_id, organization_id,
        sender_user_id, sender_role, sender_name,
        content, message_type, metadata, is_read, is_delivered
      )
      SELECT tc.id, tc.organization_id,
             v_user_id, v_sender_role, v_user_name,
             v_content, v_canonical,
             v_msg_meta || jsonb_build_object('b2b_operational_broadcast', 'true'),
             TRUE, TRUE
      FROM   public.trip_conversations tc
      WHERE  tc.trip_id = p_trip_id
      RETURNING id
    LOOP
      v_message_ids := array_append(v_message_ids, v_new_id);
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'ok',          TRUE,
    'message_ids', v_message_ids,
    'trip_state',  v_trip_state,
    'prev_status', v_prev_status,
    'new_status',  v_new_status,
    'event_type',  v_canonical
  );
END;
$$;

REVOKE ALL ON FUNCTION public.process_b2b_event(UUID, UUID, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.process_b2b_event(UUID, UUID, TEXT, JSONB) TO authenticated;

COMMIT;
