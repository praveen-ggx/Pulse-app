-- Fix: chat_participants insert fails when organization_members / drivers rows
-- carry a user_id that does not exist in auth.users (orphaned reference).
-- Add an EXISTS guard against auth.users on every insert path.

CREATE OR REPLACE FUNCTION public.fn_sync_trip_room_participants(
  p_conversation_id uuid,
  p_trip_id         uuid
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trip public.trips%ROWTYPE;
BEGIN
  SELECT * INTO v_trip FROM public.trips WHERE id = p_trip_id;
  IF NOT FOUND THEN RETURN; END IF;

  -- Fleet org: dispatchers, ops, finance, owner.
  INSERT INTO public.chat_participants (conversation_id, user_id, participant_role)
  SELECT p_conversation_id, om.user_id,
         CASE WHEN om.role IN ('owner', 'admin') THEN 'admin' ELSE 'member' END
  FROM public.organization_members om
  WHERE om.organization_id = v_trip.organization_id
    AND om.status = 'active'
    AND om.user_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = om.user_id)
  ON CONFLICT (conversation_id, user_id) DO NOTHING;

  -- Assigned driver (driver app JWT).
  IF v_trip.driver_id IS NOT NULL THEN
    INSERT INTO public.chat_participants (conversation_id, user_id, participant_role)
    SELECT p_conversation_id, d.user_id, 'driver'
    FROM public.drivers d
    WHERE d.id = v_trip.driver_id
      AND d.user_id IS NOT NULL
      AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = d.user_id)
    ON CONFLICT (conversation_id, user_id) DO NOTHING;
  END IF;

  -- Linked customer org members.
  IF v_trip.client_id IS NOT NULL THEN
    INSERT INTO public.chat_participants (conversation_id, user_id, participant_role)
    SELECT p_conversation_id, om.user_id, 'client'
    FROM public.clients c
    JOIN public.organization_members om
      ON om.organization_id = c.linked_organization_id
    WHERE c.id = v_trip.client_id
      AND c.linked_organization_id IS NOT NULL
      AND om.status = 'active'
      AND om.user_id IS NOT NULL
      AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = om.user_id)
    ON CONFLICT (conversation_id, user_id) DO NOTHING;
  END IF;

  -- Linked supplier org members.
  IF v_trip.supplier_id IS NOT NULL THEN
    INSERT INTO public.chat_participants (conversation_id, user_id, participant_role)
    SELECT p_conversation_id, om.user_id, 'supplier'
    FROM public.suppliers s
    JOIN public.organization_members om
      ON om.organization_id = s.linked_organization_id
    WHERE s.id = v_trip.supplier_id
      AND s.linked_organization_id IS NOT NULL
      AND om.status = 'active'
      AND om.user_id IS NOT NULL
      AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = om.user_id)
    ON CONFLICT (conversation_id, user_id) DO NOTHING;
  END IF;

  -- Trip owner / assigner when present on the row.
  IF v_trip.owner_user_id IS NOT NULL THEN
    INSERT INTO public.chat_participants (conversation_id, user_id, participant_role)
    SELECT p_conversation_id, v_trip.owner_user_id, 'member'
    WHERE EXISTS (SELECT 1 FROM auth.users u WHERE u.id = v_trip.owner_user_id)
    ON CONFLICT (conversation_id, user_id) DO NOTHING;
  END IF;

  IF v_trip.assigned_by_user_id IS NOT NULL THEN
    INSERT INTO public.chat_participants (conversation_id, user_id, participant_role)
    SELECT p_conversation_id, v_trip.assigned_by_user_id, 'member'
    WHERE EXISTS (SELECT 1 FROM auth.users u WHERE u.id = v_trip.assigned_by_user_id)
    ON CONFLICT (conversation_id, user_id) DO NOTHING;
  END IF;
END;
$$;
