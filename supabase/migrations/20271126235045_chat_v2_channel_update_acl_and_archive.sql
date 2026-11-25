-- =============================================================================
-- Pulse Chat V2 — close channel metadata UPDATE bypass + tighten archive/audit
--
-- Gaps closed:
--   1) Any conversation accessor could UPDATE chat_conversations.metadata and
--      flip private → public (or archive) via PostgREST, bypassing admin RPCs.
--   2) fn_chat_channel_is_admin ignored active org membership (removed admins
--      could keep administering while a stale participant row remained).
--   3) chat_messages_archive / chat_audit_log were readable by any org member.
--
-- Additive. Preprod-only apply until release GO. Does not touch production.
-- =============================================================================

SET LOCAL lock_timeout = '5s';

-- ── 1. Admin helper requires active org membership ───────────────────────────

CREATE OR REPLACE FUNCTION public.fn_chat_channel_is_admin(p_conversation_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.chat_participants cp
    JOIN public.chat_conversations cc ON cc.id = cp.conversation_id
    WHERE cp.conversation_id = p_conversation_id
      AND cp.user_id = (SELECT auth.uid())
      AND lower(coalesce(cp.participant_role, 'member')) = 'admin'
      AND public.fn_chat_is_org_member(cc.organization_id)
  );
$$;

COMMENT ON FUNCTION public.fn_chat_channel_is_admin(uuid) IS
  'True when caller is an active-org channel admin participant.';

REVOKE ALL ON FUNCTION public.fn_chat_channel_is_admin(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_chat_channel_is_admin(uuid) TO authenticated;

-- ── 2. Conversation UPDATE: channels require admin; others keep accessor ACL ─

DROP POLICY IF EXISTS "chat_conversations_update" ON public.chat_conversations;
CREATE POLICY "chat_conversations_update"
  ON public.chat_conversations
  FOR UPDATE
  TO authenticated
  USING (
    CASE conversation_type
      WHEN 'channel' THEN public.fn_chat_channel_is_admin(id)
      ELSE public.fn_chat_can_access_conversation(id)
    END
  )
  WITH CHECK (
    CASE conversation_type
      WHEN 'channel' THEN public.fn_chat_channel_is_admin(id)
      ELSE public.fn_chat_can_access_conversation(id)
    END
  );

COMMENT ON POLICY "chat_conversations_update" ON public.chat_conversations IS
  'Channels: admin-only metadata/title/archive. Other types: conversation accessor. Identity columns locked by trigger; DEFINER RPCs bypass RLS.';

-- Narrow column grants: clients must not rewrite channel visibility via REST.
-- last_message_* may still be touched by authorized non-channel clients;
-- channel title/metadata/archive changes go through admin DEFINER RPCs.
REVOKE UPDATE ON public.chat_conversations FROM authenticated;
GRANT UPDATE (
  last_message_at,
  last_message_preview,
  message_count,
  updated_at,
  client_id,
  supplier_id,
  driver_id
) ON public.chat_conversations TO authenticated;

-- Admins still need title/metadata/is_archived via PostgREST only if policy
-- allows — keep those columns grantable so admin UPDATE policy can succeed
-- when used; channel RPCs remain the preferred path (SECURITY DEFINER).
GRANT UPDATE (
  title,
  metadata,
  is_archived
) ON public.chat_conversations TO authenticated;

-- ── 3. Archive + audit: conversation ACL, not bare org membership ────────────

DROP POLICY IF EXISTS "chat_messages_archive_select" ON public.chat_messages_archive;
CREATE POLICY "chat_messages_archive_select"
  ON public.chat_messages_archive
  FOR SELECT
  TO authenticated
  USING (public.fn_chat_can_access_conversation(conversation_id));

COMMENT ON POLICY "chat_messages_archive_select" ON public.chat_messages_archive IS
  'Archive rows visible only when caller can access the live conversation.';

DROP POLICY IF EXISTS "chat_audit_log_select" ON public.chat_audit_log;
CREATE POLICY "chat_audit_log_select"
  ON public.chat_audit_log
  FOR SELECT
  TO authenticated
  USING (
    CASE
      WHEN conversation_id IS NOT NULL
        THEN public.fn_chat_can_access_conversation(conversation_id)
      ELSE public.fn_chat_is_org_member(organization_id)
    END
  );

COMMENT ON POLICY "chat_audit_log_select" ON public.chat_audit_log IS
  'Prefer conversation ACL; fall back to active org membership only when conversation_id is null.';
