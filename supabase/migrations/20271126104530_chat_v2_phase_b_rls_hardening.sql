-- =============================================================================
-- Pulse Chat V2 — Phase B: chat_* RLS + access helper hardening
--
-- Closes audited gaps (docs/PULSE_CHAT_V2_PHASE_B_SECURITY_AUDIT.md):
--   B1/B2  Org-wide read of Team/direct threads via can_access / SELECT
--   B3     Arbitrary chat_participants INSERT
--   B4     chat_messages.conversation_id mutation
--   B5     Stale trip-room participants after driver reassignment
--   B6     Inactive membership treated as authorized
--   B7     ensure_direct_chat peers (inactive / drivers)
--   B8     Reactions / read receipts without message ACL
--   B9     Participants DELETE of other users
--
-- Additive only. No mirrors. No table drops. Do not enable Team in production
-- until negative tests pass on preprod and owners sign off.
-- =============================================================================

SET LOCAL lock_timeout = '5s';

-- ── 1. Active membership helpers ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_chat_is_org_member(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members om
    WHERE om.organization_id = p_org_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  );
$$;

COMMENT ON FUNCTION public.fn_chat_is_org_member(uuid) IS
  'True when auth.uid() is an active organization_members row for the org (Phase B).';

-- Trip room ACL: require active membership on host / linked orgs.
CREATE OR REPLACE FUNCTION public.fn_can_access_trip_for_chat(p_trip_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.trips t
    WHERE t.id = p_trip_id
      AND (
        public.fn_chat_is_org_member(t.organization_id)
        OR EXISTS (
          SELECT 1
          FROM public.drivers d
          WHERE d.id = t.driver_id
            AND d.user_id = (SELECT auth.uid())
        )
        OR EXISTS (
          SELECT 1
          FROM public.clients c
          WHERE c.id = t.client_id
            AND c.linked_organization_id IS NOT NULL
            AND public.fn_chat_is_org_member(c.linked_organization_id)
        )
        OR EXISTS (
          SELECT 1
          FROM public.suppliers s
          WHERE s.id = t.supplier_id
            AND s.linked_organization_id IS NOT NULL
            AND public.fn_chat_is_org_member(s.linked_organization_id)
        )
      )
  );
$$;

-- Type-aware conversation ACL (Team = participant + active member; Trip = live trip ACL).
CREATE OR REPLACE FUNCTION public.fn_chat_can_access_conversation(p_conversation_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.chat_conversations cc
    WHERE cc.id = p_conversation_id
      AND (
        CASE cc.conversation_type
          WHEN 'direct' THEN
            public.fn_chat_is_participant(cc.id)
            AND public.fn_chat_is_org_member(cc.organization_id)
          WHEN 'channel' THEN
            public.fn_chat_is_participant(cc.id)
            AND public.fn_chat_is_org_member(cc.organization_id)
          WHEN 'trip' THEN
            cc.trip_id IS NOT NULL
            AND public.fn_can_access_trip_for_chat(cc.trip_id)
          WHEN 'trip_lane' THEN
            (
              cc.trip_id IS NOT NULL
              AND public.fn_can_access_trip_for_chat(cc.trip_id)
            )
            OR (
              public.fn_chat_is_participant(cc.id)
              AND public.fn_chat_is_org_member(cc.organization_id)
            )
          WHEN 'direct_org' THEN
            -- Legacy network bridge rows hosted on one org id: active host member
            -- or explicit participant (linked partner users synced as participants).
            public.fn_chat_is_org_member(cc.organization_id)
            OR public.fn_chat_is_participant(cc.id)
          ELSE
            public.fn_chat_is_participant(cc.id)
            AND public.fn_chat_is_org_member(cc.organization_id)
        END
      )
  );
$$;

COMMENT ON FUNCTION public.fn_chat_can_access_conversation(uuid) IS
  'Phase B type-aware chat ACL: Team/direct requires participant+active member; trip uses live trip participation.';

REVOKE ALL ON FUNCTION public.fn_chat_is_org_member(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_can_access_trip_for_chat(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_chat_can_access_conversation(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_chat_is_org_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_can_access_trip_for_chat(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_chat_can_access_conversation(uuid) TO authenticated;

-- ── 2. Conversation SELECT — no bare org-wide OR ─────────────────────────────

DROP POLICY IF EXISTS "chat_conversations_select" ON public.chat_conversations;
CREATE POLICY "chat_conversations_select"
  ON public.chat_conversations
  FOR SELECT
  TO authenticated
  USING (public.fn_chat_can_access_conversation(id));

-- ── 3. Participants — self-only insert/delete (DEFINER RPCs bypass RLS) ──────

DROP POLICY IF EXISTS "chat_participants_insert" ON public.chat_participants;
CREATE POLICY "chat_participants_insert"
  ON public.chat_participants
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND public.fn_chat_can_access_conversation(conversation_id)
  );

DROP POLICY IF EXISTS "chat_participants_delete" ON public.chat_participants;
CREATE POLICY "chat_participants_delete"
  ON public.chat_participants
  FOR DELETE
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- ── 4. Messages — immutable routing keys ─────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_chat_messages_guard_immutable_keys()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NEW.conversation_id IS DISTINCT FROM OLD.conversation_id
     OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.sender_user_id IS DISTINCT FROM OLD.sender_user_id
     OR NEW.client_message_id IS DISTINCT FROM OLD.client_message_id
     OR NEW.sender_type IS DISTINCT FROM OLD.sender_type THEN
    RAISE EXCEPTION 'chat_messages routing keys are immutable'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_chat_messages_guard_immutable_keys ON public.chat_messages;
CREATE TRIGGER trg_chat_messages_guard_immutable_keys
  BEFORE UPDATE ON public.chat_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_chat_messages_guard_immutable_keys();

DROP POLICY IF EXISTS "chat_messages_update_own" ON public.chat_messages;
CREATE POLICY "chat_messages_update_own"
  ON public.chat_messages
  FOR UPDATE
  TO authenticated
  USING (sender_user_id = (SELECT auth.uid()))
  WITH CHECK (
    sender_user_id = (SELECT auth.uid())
    AND public.fn_chat_can_access_conversation(conversation_id)
  );

-- ── 5. Reactions / read receipts — require message ACL ───────────────────────

DROP POLICY IF EXISTS "chat_reactions_write_own" ON public.chat_reactions;
CREATE POLICY "chat_reactions_write_own"
  ON public.chat_reactions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.chat_messages m
      WHERE m.id = chat_reactions.message_id
        AND public.fn_chat_can_access_conversation(m.conversation_id)
    )
  );

DROP POLICY IF EXISTS "chat_read_receipts_upsert_own" ON public.chat_read_receipts;
CREATE POLICY "chat_read_receipts_upsert_own"
  ON public.chat_read_receipts
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.chat_messages m
      WHERE m.id = chat_read_receipts.message_id
        AND public.fn_chat_can_access_conversation(m.conversation_id)
    )
  );

-- ── 6. Trip room participant sync — add current + revoke stale ───────────────

CREATE OR REPLACE FUNCTION public.fn_sync_trip_room_participants(
  p_conversation_id uuid,
  p_trip_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trip public.trips%ROWTYPE;
BEGIN
  SELECT * INTO v_trip FROM public.trips WHERE id = p_trip_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Fleet org: dispatchers, ops, finance, owner.
  INSERT INTO public.chat_participants (conversation_id, user_id, participant_role)
  SELECT
    p_conversation_id,
    om.user_id,
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

  -- Revoke stale party roles (history rows remain in chat_messages).
  DELETE FROM public.chat_participants cp
  WHERE cp.conversation_id = p_conversation_id
    AND cp.participant_role = 'driver'
    AND (
      v_trip.driver_id IS NULL
      OR NOT EXISTS (
        SELECT 1
        FROM public.drivers d
        WHERE d.id = v_trip.driver_id
          AND d.user_id = cp.user_id
      )
    );

  DELETE FROM public.chat_participants cp
  WHERE cp.conversation_id = p_conversation_id
    AND cp.participant_role = 'client'
    AND (
      v_trip.client_id IS NULL
      OR NOT EXISTS (
        SELECT 1
        FROM public.clients c
        JOIN public.organization_members om
          ON om.organization_id = c.linked_organization_id
         AND om.user_id = cp.user_id
         AND om.status = 'active'
        WHERE c.id = v_trip.client_id
          AND c.linked_organization_id IS NOT NULL
      )
    );

  DELETE FROM public.chat_participants cp
  WHERE cp.conversation_id = p_conversation_id
    AND cp.participant_role = 'supplier'
    AND (
      v_trip.supplier_id IS NULL
      OR NOT EXISTS (
        SELECT 1
        FROM public.suppliers s
        JOIN public.organization_members om
          ON om.organization_id = s.linked_organization_id
         AND om.user_id = cp.user_id
         AND om.status = 'active'
        WHERE s.id = v_trip.supplier_id
          AND s.linked_organization_id IS NOT NULL
      )
    );

  -- Inactive / departed fleet members (keep owner + assigner rows).
  DELETE FROM public.chat_participants cp
  WHERE cp.conversation_id = p_conversation_id
    AND cp.participant_role IN ('member', 'admin')
    AND cp.user_id IS DISTINCT FROM v_trip.owner_user_id
    AND cp.user_id IS DISTINCT FROM v_trip.assigned_by_user_id
    AND NOT EXISTS (
      SELECT 1
      FROM public.organization_members om
      WHERE om.organization_id = v_trip.organization_id
        AND om.user_id = cp.user_id
        AND om.status = 'active'
    );
END;
$$;

COMMENT ON FUNCTION public.fn_sync_trip_room_participants(uuid, uuid) IS
  'Fan-in current trip roster into chat_participants and revoke stale driver/client/supplier/inactive rows (Phase B).';

-- ── 7. ensure_direct_chat — active non-driver peers only ─────────────────────

CREATE OR REPLACE FUNCTION public.ensure_direct_chat(
  p_organization_id uuid,
  p_peer_user_id uuid
)
RETURNS public.chat_conversations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_self uuid := auth.uid();
  v_key text;
  v_row public.chat_conversations%ROWTYPE;
BEGIN
  IF v_self IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  IF p_peer_user_id = v_self THEN
    RAISE EXCEPTION 'Cannot open a DM with yourself';
  END IF;
  IF NOT public.fn_chat_is_org_member(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized for organization' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.organization_members om
    WHERE om.organization_id = p_organization_id
      AND om.user_id = p_peer_user_id
      AND om.status = 'active'
      AND lower(coalesce(om.role, '')) IS DISTINCT FROM 'driver'
  ) THEN
    RAISE EXCEPTION 'Peer is not an eligible active workspace member';
  END IF;

  v_key :=
    'dm:'
    || least(v_self, p_peer_user_id)::text
    || ':'
    || greatest(v_self, p_peer_user_id)::text;

  SELECT * INTO v_row
  FROM public.chat_conversations
  WHERE organization_id = p_organization_id
    AND channel_key = v_key;
  IF FOUND THEN
    RETURN v_row;
  END IF;

  INSERT INTO public.chat_conversations (
    organization_id,
    conversation_type,
    channel_key,
    created_by
  )
  VALUES (p_organization_id, 'direct', v_key, v_self)
  ON CONFLICT (organization_id, channel_key) WHERE channel_key IS NOT NULL
  DO NOTHING
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    SELECT * INTO v_row
    FROM public.chat_conversations
    WHERE organization_id = p_organization_id
      AND channel_key = v_key;
  END IF;

  INSERT INTO public.chat_participants (conversation_id, user_id)
  VALUES (v_row.id, v_self), (v_row.id, p_peer_user_id)
  ON CONFLICT DO NOTHING;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_direct_chat(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_direct_chat(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.ensure_direct_chat(uuid, uuid) IS
  'Open/create workspace Team 1:1. Peer must be active non-driver member (Phase B).';
