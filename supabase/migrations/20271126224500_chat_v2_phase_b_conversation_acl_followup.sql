-- =============================================================================
-- Pulse Chat V2 — Phase B follow-up: lock conversation + participant mutation
--
-- Closes remaining High holes after 20271126104530:
--   A) chat_participants UPDATE could self-promote participant_role to admin
--   B) chat_conversations INSERT/UPDATE still org-member-wide (type/org/trip
--      mutation → privilege escalation to direct_org / cross-thread)
--
-- Additive. Requires Phase B helpers (fn_chat_can_access_conversation, etc.).
-- =============================================================================

SET LOCAL lock_timeout = '5s';

-- ── A. Participants: self may update read/mute only (not role) ───────────────

CREATE OR REPLACE FUNCTION public.trg_chat_participants_immutable_keys()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.conversation_id IS DISTINCT FROM OLD.conversation_id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.participant_role IS DISTINCT FROM OLD.participant_role
     OR NEW.joined_at IS DISTINCT FROM OLD.joined_at THEN
    RAISE EXCEPTION 'chat_participants identity/role columns are immutable'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS chat_participants_immutable_keys ON public.chat_participants;
CREATE TRIGGER chat_participants_immutable_keys
  BEFORE UPDATE ON public.chat_participants
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_chat_participants_immutable_keys();

DROP POLICY IF EXISTS "chat_participants_update_own" ON public.chat_participants;
CREATE POLICY "chat_participants_update_own"
  ON public.chat_participants
  FOR UPDATE
  TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

COMMENT ON POLICY "chat_participants_update_own" ON public.chat_participants IS
  'Phase B follow-up: self-update only; role/identity immutability enforced by trigger.';

REVOKE UPDATE ON public.chat_participants FROM authenticated;
GRANT UPDATE (last_read_at, muted_until) ON public.chat_participants TO authenticated;

-- ── B. Conversations: no client INSERT; UPDATE cannot change identity keys ───

CREATE OR REPLACE FUNCTION public.trg_chat_conversations_immutable_keys()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- legacy_* linkage columns may be cleared by FK ON DELETE SET NULL; do not lock them.
  IF NEW.conversation_type IS DISTINCT FROM OLD.conversation_type
     OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.trip_id IS DISTINCT FROM OLD.trip_id
     OR NEW.channel_key IS DISTINCT FROM OLD.channel_key
     OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'chat_conversations identity columns are immutable'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS chat_conversations_immutable_keys ON public.chat_conversations;
CREATE TRIGGER chat_conversations_immutable_keys
  BEFORE UPDATE ON public.chat_conversations
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_chat_conversations_immutable_keys();

DROP POLICY IF EXISTS "chat_conversations_insert" ON public.chat_conversations;
DROP POLICY IF EXISTS "chat_conversations_insert_deny" ON public.chat_conversations;
CREATE POLICY "chat_conversations_insert_deny"
  ON public.chat_conversations
  FOR INSERT
  TO authenticated
  WITH CHECK (false);

DROP POLICY IF EXISTS "chat_conversations_update" ON public.chat_conversations;
CREATE POLICY "chat_conversations_update"
  ON public.chat_conversations
  FOR UPDATE
  TO authenticated
  USING (public.fn_chat_can_access_conversation(id))
  WITH CHECK (public.fn_chat_can_access_conversation(id));

COMMENT ON POLICY "chat_conversations_update" ON public.chat_conversations IS
  'Phase B follow-up: accessors may update non-identity fields; identity immutability via trigger.';

REVOKE UPDATE ON public.chat_conversations FROM authenticated;
GRANT UPDATE (
  title,
  metadata,
  last_message_at,
  last_message_preview,
  message_count,
  is_archived,
  updated_at,
  client_id,
  supplier_id,
  driver_id
) ON public.chat_conversations TO authenticated;
