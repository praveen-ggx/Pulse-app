-- A simulated status change set trips.status_change_origin = 'business_simulated'
-- so fn_broadcast_trip_status_to_chat could append "(simulated)". That AFTER
-- trigger then ran a second UPDATE to clear the marker. The second write did
-- not change status, so the chat trigger (UPDATE OF status) did not broadcast
-- again, but every other trips UPDATE trigger ran and the row was rewritten.
--
-- The marker is still required for the chat copy. It is consumed in a BEFORE
-- trigger on the same statement: the id is stored in a transaction-local
-- setting, and the column is cleared on NEW before the row is written. The
-- AFTER trigger reads that setting and clears it before returning. No second
-- trips UPDATE. driver_command and business_simulation_revoked are not markers
-- this path clears, and a status write that does not actually change status
-- still leaves business_simulated in place.

SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.trips_consume_business_simulated_origin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF coalesce(NEW.status_change_origin, '') = 'business_simulated'
     AND (TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status)
     AND public.fn_trip_status_chat_message_body(NEW) IS NOT NULL THEN
    PERFORM set_config('pulse.trip_status_simulated_id', NEW.id::text, true);
    NEW.status_change_origin := NULL;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.trips_consume_business_simulated_origin() IS
  'Clears business_simulated on the row being written and remembers the trip id for the chat trigger in this transaction only.';

REVOKE ALL ON FUNCTION public.trips_consume_business_simulated_origin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.trips_consume_business_simulated_origin() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.trips_release_simulated_status_marker(p_trip_id uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF p_trip_id IS NOT NULL
     AND current_setting('pulse.trip_status_simulated_id', true) = p_trip_id::text THEN
    PERFORM set_config('pulse.trip_status_simulated_id', '', true);
  END IF;
END;
$$;

COMMENT ON FUNCTION public.trips_release_simulated_status_marker(uuid) IS
  'Clears the transaction-local simulated marker when it belongs to this trip. A different trip id is left in place.';

REVOKE ALL ON FUNCTION public.trips_release_simulated_status_marker(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.trips_release_simulated_status_marker(uuid) TO authenticated, service_role;

DROP TRIGGER IF EXISTS b_trips_consume_business_simulated_origin ON public.trips;
CREATE TRIGGER b_trips_consume_business_simulated_origin
  BEFORE INSERT OR UPDATE OF status ON public.trips
  FOR EACH ROW
  EXECUTE FUNCTION public.trips_consume_business_simulated_origin();

CREATE OR REPLACE FUNCTION public.fn_broadcast_trip_status_to_chat()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_msg       text;
  v_terminal  boolean;
  v_simulated boolean;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
    PERFORM public.trips_release_simulated_status_marker(NEW.id);
    RETURN NEW;
  END IF;

  v_msg := public.fn_trip_status_chat_message_body(NEW);
  IF v_msg IS NULL THEN
    PERFORM public.trips_release_simulated_status_marker(NEW.id);
    RETURN NEW;
  END IF;

  v_simulated := coalesce(NEW.status_change_origin, '') = 'business_simulated'
    OR current_setting('pulse.trip_status_simulated_id', true) = NEW.id::text;
  IF v_simulated THEN
    v_msg := v_msg || ' (simulated)';
  END IF;

  v_terminal := NEW.status IN ('completed', 'delivered', 'done', 'cancelled');

  IF NOT EXISTS (SELECT 1 FROM public.trip_conversations WHERE trip_id = NEW.id LIMIT 1) THEN
    PERFORM public.fn_ensure_trip_party_conversations(NEW.id);
  END IF;

  IF EXISTS (SELECT 1 FROM public.trip_conversations WHERE trip_id = NEW.id LIMIT 1) THEN
    PERFORM public.fn_post_system_message_to_trip_chats(
      NEW.id,
      v_msg,
      NEW.status::text,
      v_simulated
    );
  END IF;

  IF v_terminal THEN
    PERFORM public.fn_post_trip_feedback_prompt_to_chats(NEW.id);
  END IF;

  PERFORM public.trips_release_simulated_status_marker(NEW.id);
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    PERFORM public.trips_release_simulated_status_marker(NEW.id);
    RAISE;
END;
$$;

COMMENT ON FUNCTION public.fn_broadcast_trip_status_to_chat() IS
  'Posts a trip status chat line. A simulated advance is tagged from the transaction-local marker; this function does not update trips.';
