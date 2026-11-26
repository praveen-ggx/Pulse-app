-- Keep trip_conversations.driver lane aligned with trips.driver_id on reassign.
-- chat_conversations (trip rooms) already sync; party lanes did not, so driver
-- inbox / RLS stayed on the previous driver after reassignment.

SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.fn_sync_trip_room_on_trip_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room_id uuid;
BEGIN
  IF NEW.driver_id IS NOT DISTINCT FROM OLD.driver_id
     AND NEW.client_id IS NOT DISTINCT FROM OLD.client_id
     AND NEW.supplier_id IS NOT DISTINCT FROM OLD.supplier_id
     AND NEW.organization_id IS NOT DISTINCT FROM OLD.organization_id THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_room_id
  FROM public.chat_conversations
  WHERE trip_id = NEW.id AND conversation_type = 'trip';

  IF v_room_id IS NOT NULL THEN
    UPDATE public.chat_conversations
    SET
      client_id   = NEW.client_id,
      supplier_id = NEW.supplier_id,
      driver_id   = NEW.driver_id,
      organization_id = NEW.organization_id,
      metadata = metadata || jsonb_build_object('trip_status', NEW.status),
      updated_at = now()
    WHERE id = v_room_id;

    PERFORM public.fn_sync_trip_room_participants(v_room_id, NEW.id);
  END IF;

  -- Party lanes: always rewrite driver_id (do not coalesce — reassign must move).
  IF NEW.driver_id IS DISTINCT FROM OLD.driver_id THEN
    UPDATE public.trip_conversations
    SET
      driver_id = NEW.driver_id,
      party_name = CASE
        WHEN party_type = 'driver' AND nullif(trim(coalesce(NEW.driver_display_name, '')), '') IS NOT NULL
          THEN trim(NEW.driver_display_name)
        ELSE party_name
      END,
      updated_at = now()
    WHERE trip_id = NEW.id
      AND party_type = 'driver';

    -- Ensure lane exists / refreshed for the new assignee.
    PERFORM public.fn_ensure_trip_party_conversations(NEW.id);
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_sync_trip_room_on_trip_update() IS
  'Syncs trip room + driver party lane when trips.driver_id / parties change.';
