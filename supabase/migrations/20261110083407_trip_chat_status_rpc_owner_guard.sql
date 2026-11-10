-- Trip chat changes status through change_trip_status_with_notification.
-- That function is SECURITY DEFINER, so the BEFORE UPDATE guard sees
-- current_user = postgres and returns the row. The same transition rules
-- therefore run here, on the row this statement locks, using
-- auth.uid(). The status write and the status_change message happen only
-- after that decision.
--
-- p_user_id and p_user_name stay ignored. They are not an identity or a role.

BEGIN;

SET LOCAL lock_timeout = '5s';

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
  v_old         text;
  v_new         text;
  v_changed_at  text;
  v_sender_name text;
BEGIN
  -- One locked read. The UPDATE below is the same transaction, so it writes
  -- this row and cannot observe a status committed after the check.
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

  v_old := lower(trim(coalesce(v_prev_status, '')));
  v_new := lower(trim(coalesce(p_new_status, '')));

  IF v_old IS DISTINCT FROM v_new THEN
    IF v_old IN ('completed', 'delivered', 'done') THEN
      IF NOT public.caller_is_trip_action_admin(v_org) THEN
        RAISE EXCEPTION 'trip_revoke_delivered_owner_only'
          USING ERRCODE = '42501';
      END IF;
    END IF;

    IF v_new IN ('cancelled', 'canceled')
       AND lower(trim(coalesce(v_source, ''))) IS DISTINCT FROM 'market_bid'
       AND v_source_market_bid_id IS NULL
       AND v_indent_id IS NOT NULL
       AND v_supplier_id IS NOT NULL
    THEN
      IF v_old IN (
        'picked_up', 'pickup', 'in_progress', 'in_transit', 'dispatched', 'transit',
        'at_drop', 'unloading', 'arrived', 'at_destination',
        'completed', 'delivered', 'done'
      ) THEN
        RAISE EXCEPTION 'trip_cancel_not_eligible'
          USING ERRCODE = '42501';
      END IF;
      IF NOT public.caller_is_trip_action_admin(v_org) THEN
        RAISE EXCEPTION 'trip_cancel_owner_only'
          USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;

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

COMMIT;
