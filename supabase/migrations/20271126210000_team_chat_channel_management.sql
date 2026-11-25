-- Team Slack-like channel management (create / browse / join / invite / leave / update / archive).
-- Additive RPCs only. Channels remain chat_conversations.conversation_type = 'channel'.
-- Visibility + topic live in metadata: { visibility: 'public'|'private', topic, purpose }.

SET LOCAL lock_timeout = '5s';

-- ── helpers ──────────────────────────────────────────────────────────────────

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
    WHERE cp.conversation_id = p_conversation_id
      AND cp.user_id = auth.uid()
      AND lower(coalesce(cp.participant_role, 'member')) = 'admin'
  );
$$;

REVOKE ALL ON FUNCTION public.fn_chat_channel_is_admin(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_chat_channel_is_admin(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_chat_channel_is_public(p_conversation_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(
    lower(nullif(trim(cc.metadata->>'visibility'), '')),
    'public'
  ) = 'public'
  FROM public.chat_conversations cc
  WHERE cc.id = p_conversation_id
    AND cc.conversation_type = 'channel';
$$;

REVOKE ALL ON FUNCTION public.fn_chat_channel_is_public(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_chat_channel_is_public(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_normalize_team_channel_key(p_raw text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v text;
BEGIN
  v := lower(trim(coalesce(p_raw, '')));
  v := regexp_replace(v, '\s+', '-', 'g');
  v := regexp_replace(v, '[^a-z0-9_-]', '', 'g');
  v := regexp_replace(v, '-{2,}', '-', 'g');
  v := trim(both '-' from v);
  IF length(v) > 80 THEN
    v := left(v, 80);
    v := trim(both '-' from v);
  END IF;
  RETURN NULLIF(v, '');
END;
$$;

REVOKE ALL ON FUNCTION public.fn_normalize_team_channel_key(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_normalize_team_channel_key(text) TO authenticated;

-- Eligible active non-driver org member (same bar as ensure_direct_chat).
CREATE OR REPLACE FUNCTION public.fn_chat_is_eligible_team_member(
  p_organization_id uuid,
  p_user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members om
    WHERE om.organization_id = p_organization_id
      AND om.user_id = p_user_id
      AND om.status = 'active'
      AND lower(coalesce(om.role, '')) IS DISTINCT FROM 'driver'
  );
$$;

REVOKE ALL ON FUNCTION public.fn_chat_is_eligible_team_member(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_chat_is_eligible_team_member(uuid, uuid) TO authenticated;

-- ── create_team_chat_channel ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_team_chat_channel(
  p_organization_id uuid,
  p_channel_key text,
  p_title text DEFAULT NULL,
  p_topic text DEFAULT NULL,
  p_visibility text DEFAULT 'public',
  p_member_ids uuid[] DEFAULT NULL
)
RETURNS public.chat_conversations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_self uuid := auth.uid();
  v_key text := public.fn_normalize_team_channel_key(p_channel_key);
  v_title text := nullif(trim(coalesce(p_title, '')), '');
  v_topic text := nullif(trim(coalesce(p_topic, '')), '');
  v_vis text := lower(trim(coalesce(p_visibility, 'public')));
  v_row public.chat_conversations%ROWTYPE;
  v_uid uuid;
BEGIN
  IF v_self IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  IF v_key IS NULL OR v_key LIKE 'dm:%' THEN
    RAISE EXCEPTION 'Invalid channel name';
  END IF;
  IF v_vis NOT IN ('public', 'private') THEN
    RAISE EXCEPTION 'Visibility must be public or private';
  END IF;
  IF NOT public.fn_chat_is_org_member(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized for organization' USING ERRCODE = '42501';
  END IF;
  IF NOT public.fn_chat_is_eligible_team_member(p_organization_id, v_self) THEN
    RAISE EXCEPTION 'Not eligible to create channels' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.chat_conversations
    WHERE organization_id = p_organization_id
      AND channel_key = v_key
  ) THEN
    RAISE EXCEPTION 'A channel named #% already exists', v_key
      USING ERRCODE = '23505';
  END IF;

  IF v_title IS NULL THEN
    v_title := initcap(replace(replace(v_key, '-', ' '), '_', ' '));
  END IF;

  INSERT INTO public.chat_conversations (
    organization_id,
    conversation_type,
    channel_key,
    title,
    created_by,
    metadata
  )
  VALUES (
    p_organization_id,
    'channel',
    v_key,
    v_title,
    v_self,
    jsonb_strip_nulls(
      jsonb_build_object(
        'visibility', v_vis,
        'topic', v_topic,
        'purpose', v_topic,
        'created_via', 'team_channel_ui'
      )
    )
  )
  RETURNING * INTO v_row;

  INSERT INTO public.chat_participants (conversation_id, user_id, participant_role)
  VALUES (v_row.id, v_self, 'admin')
  ON CONFLICT DO NOTHING;

  IF p_member_ids IS NOT NULL THEN
    FOREACH v_uid IN ARRAY p_member_ids
    LOOP
      IF v_uid IS NULL OR v_uid = v_self THEN
        CONTINUE;
      END IF;
      IF NOT public.fn_chat_is_eligible_team_member(p_organization_id, v_uid) THEN
        CONTINUE;
      END IF;
      INSERT INTO public.chat_participants (conversation_id, user_id, participant_role)
      VALUES (v_row.id, v_uid, 'member')
      ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.create_team_chat_channel(uuid, text, text, text, text, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_team_chat_channel(uuid, text, text, text, text, uuid[]) TO authenticated;

COMMENT ON FUNCTION public.create_team_chat_channel(uuid, text, text, text, text, uuid[]) IS
  'Create a workspace Team channel (Slack-like). Creator is admin; optional initial members.';

-- ── list_team_chat_channels (browse + joined) ─────────────────────────────────

CREATE OR REPLACE FUNCTION public.list_team_chat_channels(
  p_organization_id uuid,
  p_limit integer DEFAULT 50
)
RETURNS TABLE (
  id uuid,
  organization_id uuid,
  channel_key text,
  title text,
  topic text,
  visibility text,
  is_archived boolean,
  is_member boolean,
  is_admin boolean,
  member_count integer,
  last_message_at timestamptz,
  last_message_preview text,
  created_at timestamptz,
  created_by uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_self uuid := auth.uid();
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
BEGIN
  IF v_self IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  IF NOT public.fn_chat_is_org_member(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized for organization' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    cc.id,
    cc.organization_id,
    cc.channel_key,
    cc.title,
    nullif(trim(coalesce(cc.metadata->>'topic', cc.metadata->>'purpose', '')), '') AS topic,
    coalesce(nullif(lower(trim(cc.metadata->>'visibility')), ''), 'public') AS visibility,
    cc.is_archived,
    EXISTS (
      SELECT 1 FROM public.chat_participants cp
      WHERE cp.conversation_id = cc.id AND cp.user_id = v_self
    ) AS is_member,
    EXISTS (
      SELECT 1 FROM public.chat_participants cp
      WHERE cp.conversation_id = cc.id
        AND cp.user_id = v_self
        AND lower(coalesce(cp.participant_role, 'member')) = 'admin'
    ) AS is_admin,
    (
      SELECT count(*)::integer
      FROM public.chat_participants cp
      WHERE cp.conversation_id = cc.id
    ) AS member_count,
    cc.last_message_at,
    cc.last_message_preview,
    cc.created_at,
    cc.created_by
  FROM public.chat_conversations cc
  WHERE cc.organization_id = p_organization_id
    AND cc.conversation_type = 'channel'
    AND cc.trip_id IS NULL
    AND cc.is_archived = false
    AND (
      -- Public channels are browsable by any org member.
      coalesce(nullif(lower(trim(cc.metadata->>'visibility')), ''), 'public') = 'public'
      OR EXISTS (
        SELECT 1 FROM public.chat_participants cp
        WHERE cp.conversation_id = cc.id AND cp.user_id = v_self
      )
    )
  ORDER BY
    EXISTS (
      SELECT 1 FROM public.chat_participants cp
      WHERE cp.conversation_id = cc.id AND cp.user_id = v_self
    ) DESC,
    cc.last_message_at DESC NULLS LAST,
    cc.title ASC NULLS LAST
  LIMIT v_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.list_team_chat_channels(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_team_chat_channels(uuid, integer) TO authenticated;

-- ── join / leave / invite ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.join_team_chat_channel(
  p_conversation_id uuid
)
RETURNS public.chat_conversations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_self uuid := auth.uid();
  v_row public.chat_conversations%ROWTYPE;
BEGIN
  IF v_self IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_row
  FROM public.chat_conversations
  WHERE id = p_conversation_id
    AND conversation_type = 'channel'
    AND is_archived = false;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Channel not found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.fn_chat_is_org_member(v_row.organization_id) THEN
    RAISE EXCEPTION 'Not authorized for organization' USING ERRCODE = '42501';
  END IF;
  IF NOT public.fn_chat_is_eligible_team_member(v_row.organization_id, v_self) THEN
    RAISE EXCEPTION 'Not eligible to join channels' USING ERRCODE = '42501';
  END IF;

  IF NOT public.fn_chat_channel_is_public(p_conversation_id)
     AND NOT public.fn_chat_is_participant(p_conversation_id) THEN
    RAISE EXCEPTION 'This channel is private — ask an admin to invite you'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.chat_participants (conversation_id, user_id, participant_role)
  VALUES (p_conversation_id, v_self, 'member')
  ON CONFLICT DO NOTHING;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.join_team_chat_channel(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.join_team_chat_channel(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.leave_team_chat_channel(
  p_conversation_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_self uuid := auth.uid();
  v_org uuid;
  v_admin_count integer;
BEGIN
  IF v_self IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT organization_id INTO v_org
  FROM public.chat_conversations
  WHERE id = p_conversation_id
    AND conversation_type = 'channel';
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Channel not found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.fn_chat_is_participant(p_conversation_id) THEN
    RETURN;
  END IF;

  IF public.fn_chat_channel_is_admin(p_conversation_id) THEN
    SELECT count(*)::integer INTO v_admin_count
    FROM public.chat_participants
    WHERE conversation_id = p_conversation_id
      AND lower(coalesce(participant_role, 'member')) = 'admin';
    IF v_admin_count <= 1 THEN
      RAISE EXCEPTION 'Promote another admin before leaving'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  DELETE FROM public.chat_participants
  WHERE conversation_id = p_conversation_id
    AND user_id = v_self;
END;
$$;

REVOKE ALL ON FUNCTION public.leave_team_chat_channel(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.leave_team_chat_channel(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.invite_team_chat_channel_members(
  p_conversation_id uuid,
  p_member_ids uuid[]
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_self uuid := auth.uid();
  v_org uuid;
  v_uid uuid;
  v_added integer := 0;
BEGIN
  IF v_self IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  IF p_member_ids IS NULL OR cardinality(p_member_ids) = 0 THEN
    RETURN 0;
  END IF;

  SELECT organization_id INTO v_org
  FROM public.chat_conversations
  WHERE id = p_conversation_id
    AND conversation_type = 'channel'
    AND is_archived = false;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Channel not found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.fn_chat_channel_is_admin(p_conversation_id) THEN
    RAISE EXCEPTION 'Only channel admins can invite members' USING ERRCODE = '42501';
  END IF;

  FOREACH v_uid IN ARRAY p_member_ids
  LOOP
    IF v_uid IS NULL OR v_uid = v_self THEN
      CONTINUE;
    END IF;
    IF NOT public.fn_chat_is_eligible_team_member(v_org, v_uid) THEN
      CONTINUE;
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM public.chat_participants
      WHERE conversation_id = p_conversation_id
        AND user_id = v_uid
    ) THEN
      INSERT INTO public.chat_participants (conversation_id, user_id, participant_role)
      VALUES (p_conversation_id, v_uid, 'member');
      v_added := v_added + 1;
    END IF;
  END LOOP;

  RETURN v_added;
END;
$$;

REVOKE ALL ON FUNCTION public.invite_team_chat_channel_members(uuid, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.invite_team_chat_channel_members(uuid, uuid[]) TO authenticated;

-- ── members / update / archive ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.list_team_chat_channel_members(
  p_conversation_id uuid
)
RETURNS TABLE (
  user_id uuid,
  participant_role text,
  joined_at timestamptz,
  full_name text,
  avatar_url text,
  avatar_seed text,
  org_role text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT organization_id INTO v_org
  FROM public.chat_conversations
  WHERE id = p_conversation_id
    AND conversation_type = 'channel';
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Channel not found' USING ERRCODE = 'P0002';
  END IF;

  -- Members always; public browse allows non-members to see names lightly.
  IF NOT public.fn_chat_is_participant(p_conversation_id)
     AND NOT (
       public.fn_chat_is_org_member(v_org)
       AND public.fn_chat_channel_is_public(p_conversation_id)
     ) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    cp.user_id,
    cp.participant_role,
    cp.joined_at,
    coalesce(nullif(trim(p.full_name), ''), nullif(trim(p.company_name), ''), 'Member') AS full_name,
    p.avatar_url,
    p.avatar_seed,
    om.role::text AS org_role
  FROM public.chat_participants cp
  LEFT JOIN public.profiles p ON p.id = cp.user_id
  LEFT JOIN public.organization_members om
    ON om.organization_id = v_org AND om.user_id = cp.user_id
  WHERE cp.conversation_id = p_conversation_id
  ORDER BY
    CASE WHEN lower(coalesce(cp.participant_role, 'member')) = 'admin' THEN 0 ELSE 1 END,
    coalesce(p.full_name, '') ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.list_team_chat_channel_members(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_team_chat_channel_members(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_team_chat_channel(
  p_conversation_id uuid,
  p_title text DEFAULT NULL,
  p_topic text DEFAULT NULL,
  p_visibility text DEFAULT NULL
)
RETURNS public.chat_conversations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.chat_conversations%ROWTYPE;
  v_title text := nullif(trim(coalesce(p_title, '')), '');
  v_topic text := nullif(trim(coalesce(p_topic, '')), '');
  v_vis text := nullif(lower(trim(coalesce(p_visibility, ''))), '');
  v_meta jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  IF NOT public.fn_chat_channel_is_admin(p_conversation_id) THEN
    RAISE EXCEPTION 'Only channel admins can update settings' USING ERRCODE = '42501';
  END IF;
  IF v_vis IS NOT NULL AND v_vis NOT IN ('public', 'private') THEN
    RAISE EXCEPTION 'Visibility must be public or private';
  END IF;

  SELECT * INTO v_row
  FROM public.chat_conversations
  WHERE id = p_conversation_id
    AND conversation_type = 'channel';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Channel not found' USING ERRCODE = 'P0002';
  END IF;

  v_meta := coalesce(v_row.metadata, '{}'::jsonb);
  IF v_topic IS NOT NULL THEN
    v_meta := v_meta || jsonb_build_object('topic', v_topic, 'purpose', v_topic);
  END IF;
  IF v_vis IS NOT NULL THEN
    v_meta := v_meta || jsonb_build_object('visibility', v_vis);
  END IF;

  UPDATE public.chat_conversations
  SET
    title = coalesce(v_title, title),
    metadata = v_meta,
    updated_at = now()
  WHERE id = p_conversation_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.update_team_chat_channel(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_team_chat_channel(uuid, text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.archive_team_chat_channel(
  p_conversation_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  IF NOT public.fn_chat_channel_is_admin(p_conversation_id) THEN
    RAISE EXCEPTION 'Only channel admins can archive' USING ERRCODE = '42501';
  END IF;

  UPDATE public.chat_conversations
  SET is_archived = true, updated_at = now()
  WHERE id = p_conversation_id
    AND conversation_type = 'channel';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Channel not found' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.archive_team_chat_channel(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.archive_team_chat_channel(uuid) TO authenticated;
