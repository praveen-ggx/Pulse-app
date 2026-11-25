-- Pulse Chat V2 Phase B — security acceptance checks (read-only metadata +
-- function-body assertions). Safe against any linked environment.
--
-- Run:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/chat_v2_phase_b_security.sql
--
-- Pass: prints PASS notices for each check.
-- Fail: RAISE EXCEPTION naming the violated invariant.

DO $$
DECLARE
  v_def text;
  v_count integer;
  v_qual text;
  v_with_check text;
BEGIN
  -- 1) Active membership in fn_chat_is_org_member
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'fn_chat_is_org_member';

  IF v_def IS NULL OR position('status' IN lower(v_def)) = 0 THEN
    RAISE EXCEPTION 'Phase B: fn_chat_is_org_member must require active membership';
  END IF;
  RAISE NOTICE 'PASS: fn_chat_is_org_member requires status';

  -- 2) Type-aware can_access (direct / trip branches)
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'fn_chat_can_access_conversation';

  IF v_def IS NULL
     OR position('''direct''' IN v_def) = 0
     OR position('fn_can_access_trip_for_chat' IN v_def) = 0 THEN
    RAISE EXCEPTION 'Phase B: fn_chat_can_access_conversation must be type-aware (direct + trip ACL)';
  END IF;
  RAISE NOTICE 'PASS: fn_chat_can_access_conversation is type-aware';

  -- 3) Conversations SELECT uses can_access only (no bare org OR)
  SELECT qual INTO v_qual
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'chat_conversations'
    AND policyname = 'chat_conversations_select';

  IF v_qual IS NULL OR position('fn_chat_can_access_conversation' IN v_qual) = 0 THEN
    RAISE EXCEPTION 'Phase B: chat_conversations_select must use fn_chat_can_access_conversation';
  END IF;
  IF position('fn_chat_is_org_member(organization_id)' IN coalesce(v_qual, '')) > 0
     AND position('fn_chat_can_access_conversation' IN coalesce(v_qual, '')) > 0
     AND position(' OR ' IN coalesce(v_qual, '')) > 0
     AND position('fn_chat_is_participant' IN coalesce(v_qual, '')) > 0 THEN
    -- Legacy shape: org OR participant — reject if still present as top-level OR with is_org_member(organization_id)
    IF v_qual ~* 'fn_chat_is_org_member\(organization_id\)\s*OR' THEN
      RAISE EXCEPTION 'Phase B: chat_conversations_select still allows bare org-wide OR';
    END IF;
  END IF;
  RAISE NOTICE 'PASS: chat_conversations_select hardened';

  -- 4) Participants INSERT is self-only
  SELECT with_check INTO v_with_check
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'chat_participants'
    AND policyname = 'chat_participants_insert';

  IF v_with_check IS NULL
     OR position('auth.uid()' IN v_with_check) = 0
     OR position('user_id' IN v_with_check) = 0 THEN
    RAISE EXCEPTION 'Phase B: chat_participants_insert must require user_id = auth.uid()';
  END IF;
  RAISE NOTICE 'PASS: chat_participants_insert is self-only';

  -- 5) Participants DELETE is self-only
  SELECT qual INTO v_qual
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'chat_participants'
    AND policyname = 'chat_participants_delete';

  IF v_qual IS NULL OR position('fn_chat_can_access_conversation' IN coalesce(v_qual, '')) > 0 THEN
    RAISE EXCEPTION 'Phase B: chat_participants_delete must not allow deleting via can_access';
  END IF;
  RAISE NOTICE 'PASS: chat_participants_delete is self-only';

  -- 6) Immutable keys trigger present
  SELECT count(*) INTO v_count
  FROM pg_trigger t
  JOIN pg_class c ON c.oid = t.tgrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'chat_messages'
    AND t.tgname = 'trg_chat_messages_guard_immutable_keys'
    AND NOT t.tgisinternal;

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Phase B: missing trg_chat_messages_guard_immutable_keys on chat_messages';
  END IF;
  RAISE NOTICE 'PASS: chat_messages immutable-keys trigger present';

  -- 7) Sync revokes stale drivers
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'fn_sync_trip_room_participants';

  IF v_def IS NULL
     OR position('DELETE FROM public.chat_participants' IN v_def) = 0
     OR position('''driver''' IN v_def) = 0 THEN
    RAISE EXCEPTION 'Phase B: fn_sync_trip_room_participants must DELETE stale driver participants';
  END IF;
  RAISE NOTICE 'PASS: fn_sync_trip_room_participants revokes stale drivers';

  -- 8) ensure_direct_chat rejects drivers / inactive
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'ensure_direct_chat';

  IF v_def IS NULL
     OR position('status' IN lower(v_def)) = 0
     OR position('driver' IN lower(v_def)) = 0 THEN
    RAISE EXCEPTION 'Phase B: ensure_direct_chat must require active non-driver peers';
  END IF;
  RAISE NOTICE 'PASS: ensure_direct_chat peer eligibility hardened';

  -- 9) Reaction insert requires message ACL
  SELECT with_check INTO v_with_check
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'chat_reactions'
    AND policyname = 'chat_reactions_write_own';

  IF v_with_check IS NULL
     OR position('fn_chat_can_access_conversation' IN v_with_check) = 0 THEN
    RAISE EXCEPTION 'Phase B: chat_reactions_write_own must check message conversation ACL';
  END IF;
  RAISE NOTICE 'PASS: chat_reactions_write_own requires conversation ACL';

  -- Follow-up: immutable participant/conversation keys + deny client INSERT
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'chat_participants_immutable_keys'
  ) THEN
    RAISE EXCEPTION 'FAIL: missing chat_participants_immutable_keys trigger';
  END IF;
  RAISE NOTICE 'PASS: chat_participants_immutable_keys trigger present';

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'chat_conversations_immutable_keys'
  ) THEN
    RAISE EXCEPTION 'FAIL: missing chat_conversations_immutable_keys trigger';
  END IF;
  RAISE NOTICE 'PASS: chat_conversations_immutable_keys trigger present';

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'chat_conversations'
      AND policyname = 'chat_conversations_insert_deny'
  ) THEN
    RAISE EXCEPTION 'FAIL: missing chat_conversations_insert_deny policy';
  END IF;
  RAISE NOTICE 'PASS: chat_conversations_insert_deny present';

  -- Channel UPDATE must be admin-gated (not bare can_access)
  SELECT qual INTO v_qual
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'chat_conversations'
    AND policyname = 'chat_conversations_update';

  IF v_qual IS NULL
     OR position('fn_chat_channel_is_admin' IN coalesce(v_qual, '')) = 0 THEN
    RAISE EXCEPTION 'FAIL: chat_conversations_update must require fn_chat_channel_is_admin for channels';
  END IF;
  RAISE NOTICE 'PASS: chat_conversations_update admin-gated for channels';

  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'fn_chat_channel_is_admin';

  IF v_def IS NULL OR position('fn_chat_is_org_member' IN coalesce(v_def, '')) = 0 THEN
    RAISE EXCEPTION 'FAIL: fn_chat_channel_is_admin must require active org membership';
  END IF;
  RAISE NOTICE 'PASS: fn_chat_channel_is_admin requires org membership';

  SELECT qual INTO v_qual
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'chat_messages_archive'
    AND policyname = 'chat_messages_archive_select';

  IF v_qual IS NULL
     OR position('fn_chat_can_access_conversation' IN coalesce(v_qual, '')) = 0 THEN
    RAISE EXCEPTION 'FAIL: chat_messages_archive_select must use conversation ACL';
  END IF;
  RAISE NOTICE 'PASS: chat_messages_archive_select uses conversation ACL';

  RAISE NOTICE 'PASS: Pulse Chat V2 Phase B security metadata suite complete';
END $$;
