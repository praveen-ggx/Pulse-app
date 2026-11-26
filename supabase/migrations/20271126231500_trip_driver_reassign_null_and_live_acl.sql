-- =============================================================================
-- Trip driver reassignment: null-safe lane sync + live assignment ACL
--
-- Fixes found on preprod acceptance:
-- 1) fn_sync_trip_room_on_trip_update SET driver_id=NULL violates
--    trip_conversations.party_ref_consistent (driver lanes require driver_id).
-- 2) private.user_can_read_trip_conversation / _message grant driver access from
--    conversation.driver_id alone — after null/reassign the previous driver can
--    still read if the lane row still points at them.
--
-- Solution: never null driver_id on driver lanes; revoke via live trips.driver_id
-- match in the read helpers. Non-null reassign still rewrites the lane.
-- =============================================================================

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

  IF NEW.driver_id IS DISTINCT FROM OLD.driver_id THEN
    IF NEW.driver_id IS NOT NULL THEN
      -- Driver → driver (or null → driver): rewrite lane identity.
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

      PERFORM public.fn_ensure_trip_party_conversations(NEW.id);
    ELSE
      -- Driver → null: keep the historical lane row (party_ref_consistent forbids
      -- null driver_id). Access is revoked by live trips.driver_id checks in
      -- private.user_can_read_trip_conversation / user_can_read_trip_message.
      UPDATE public.trip_conversations
      SET
        party_name = CASE
          WHEN nullif(trim(party_name), '') IS NULL THEN 'Unassigned driver'
          WHEN party_name NOT LIKE '%(unassigned)' THEN party_name || ' (unassigned)'
          ELSE party_name
        END,
        updated_at = now()
      WHERE trip_id = NEW.id
        AND party_type = 'driver';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_sync_trip_room_on_trip_update() IS
  'Syncs trip room + driver party lane on party changes. Null assign keeps lane history; ACL uses live trips.driver_id.';

-- Live assignment required for driver lane/message reads.
CREATE OR REPLACE FUNCTION private.user_can_read_trip_conversation(
  p_org_id uuid,
  p_trip_id uuid,
  p_driver_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.user_id = (SELECT auth.uid())
      AND om.organization_id = p_org_id
      AND (om.status = 'active' OR om.status IS NULL)
  )
  OR (
    p_driver_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.trips t
      JOIN public.drivers d ON d.id = t.driver_id
      WHERE t.id = p_trip_id
        AND t.driver_id = p_driver_id
        AND d.user_id = (SELECT auth.uid())
    )
  )
  OR EXISTS (
    SELECT 1
    FROM public.trips t
    JOIN public.clients c ON c.id = t.client_id
    JOIN public.organization_members om
      ON om.user_id = (SELECT auth.uid())
     AND om.organization_id = c.linked_organization_id
     AND (om.status = 'active' OR om.status IS NULL)
    WHERE t.id = p_trip_id
  )
  OR EXISTS (
    SELECT 1
    FROM public.trips t
    JOIN public.suppliers s ON s.id = t.supplier_id
    JOIN public.organization_members om
      ON om.user_id = (SELECT auth.uid())
     AND om.organization_id = s.linked_organization_id
     AND (om.status = 'active' OR om.status IS NULL)
    WHERE t.id = p_trip_id
  )
  OR EXISTS (
    SELECT 1
    FROM public.trips t
    JOIN public.indents i ON i.id = t.indent_id
    JOIN public.direct_quotes dq
      ON dq.indent_id = i.id AND dq.status = 'accepted'
    JOIN public.organization_members om
      ON om.user_id = (SELECT auth.uid())
     AND om.organization_id = dq.bidder_organization_id
     AND (om.status = 'active' OR om.status IS NULL)
    WHERE t.id = p_trip_id
      AND t.supplier_id IS NULL
      AND t.indent_id IS NOT NULL
  );
$$;

CREATE OR REPLACE FUNCTION private.user_can_read_trip_message(
  p_org_id uuid,
  p_conv_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.user_id = (SELECT auth.uid())
      AND om.organization_id = p_org_id
      AND (om.status = 'active' OR om.status IS NULL)
  )
  OR EXISTS (
    SELECT 1
    FROM public.trip_conversations tc
    JOIN public.trips t ON t.id = tc.trip_id
    JOIN public.drivers d ON d.id = tc.driver_id
    WHERE tc.id = p_conv_id
      AND tc.party_type = 'driver'
      AND t.driver_id IS NOT DISTINCT FROM tc.driver_id
      AND d.user_id = (SELECT auth.uid())
  )
  OR EXISTS (
    SELECT 1
    FROM public.trip_conversations tc
    JOIN public.trips t ON t.id = tc.trip_id
    JOIN public.clients c ON c.id = t.client_id
    JOIN public.organization_members om
      ON om.user_id = (SELECT auth.uid())
     AND om.organization_id = c.linked_organization_id
     AND (om.status = 'active' OR om.status IS NULL)
    WHERE tc.id = p_conv_id
  )
  OR EXISTS (
    SELECT 1
    FROM public.trip_conversations tc
    JOIN public.trips t ON t.id = tc.trip_id
    JOIN public.suppliers s ON s.id = t.supplier_id
    JOIN public.organization_members om
      ON om.user_id = (SELECT auth.uid())
     AND om.organization_id = s.linked_organization_id
     AND (om.status = 'active' OR om.status IS NULL)
    WHERE tc.id = p_conv_id
  )
  OR EXISTS (
    SELECT 1
    FROM public.trip_conversations tc
    JOIN public.trips t ON t.id = tc.trip_id
    JOIN public.indents i ON i.id = t.indent_id
    JOIN public.direct_quotes dq
      ON dq.indent_id = i.id AND dq.status = 'accepted'
    JOIN public.organization_members om
      ON om.user_id = (SELECT auth.uid())
     AND om.organization_id = dq.bidder_organization_id
     AND (om.status = 'active' OR om.status IS NULL)
    WHERE tc.id = p_conv_id
      AND t.supplier_id IS NULL
      AND t.indent_id IS NOT NULL
  );
$$;
