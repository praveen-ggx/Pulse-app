-- Team DM / channel participants reference auth.users(id).
-- Preprod (and possibly other envs) have organization_members + profiles rows
-- whose user_id no longer exists in auth.users. ensure_direct_chat then failed
-- with chat_participants_user_id_fkey (HTTP 409). Harden eligibility + RPC.

SET LOCAL lock_timeout = '5s';

-- Eligible = active non-driver org member AND real auth login.
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
      AND EXISTS (
        SELECT 1
        FROM auth.users au
        WHERE au.id = om.user_id
      )
  );
$$;

COMMENT ON FUNCTION public.fn_chat_is_eligible_team_member(uuid, uuid) IS
  'Active non-driver org member with a live auth.users row (chat_participants FK).';

-- Ids the Team strip / compose picker may open a DM with.
-- Return SETOF uuid (not uuid[]) so PostgREST never emits `uuid = uuid[]`.
DROP FUNCTION IF EXISTS public.list_team_chat_eligible_user_ids(uuid);

CREATE OR REPLACE FUNCTION public.list_team_chat_eligible_user_ids(
  p_organization_id uuid
)
RETURNS SETOF uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_self uuid := auth.uid();
BEGIN
  IF v_self IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  IF NOT public.fn_chat_is_org_member(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized for organization' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT om.user_id
  FROM public.organization_members om
  WHERE om.organization_id = p_organization_id
    AND om.user_id IS DISTINCT FROM v_self
    AND om.status = 'active'
    AND lower(coalesce(om.role, '')) IS DISTINCT FROM 'driver'
    AND EXISTS (
      SELECT 1 FROM auth.users au WHERE au.id = om.user_id
    )
  ORDER BY om.user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.list_team_chat_eligible_user_ids(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_team_chat_eligible_user_ids(uuid) TO authenticated;

COMMENT ON FUNCTION public.list_team_chat_eligible_user_ids(uuid) IS
  'Team chat roster ids: active non-driver peers that exist in auth.users.';

-- Channel member labels: profiles.full_name only (avoid optional company_name drift).
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
    coalesce(nullif(trim(p.full_name), ''), 'Member') AS full_name,
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
  IF NOT EXISTS (SELECT 1 FROM auth.users au WHERE au.id = v_self) THEN
    RAISE EXCEPTION 'Your account cannot open chat yet';
  END IF;
  IF NOT public.fn_chat_is_eligible_team_member(p_organization_id, p_peer_user_id) THEN
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
    -- Backfill participants if an older partial create left the room empty.
    INSERT INTO public.chat_participants (conversation_id, user_id)
    VALUES (v_row.id, v_self), (v_row.id, p_peer_user_id)
    ON CONFLICT DO NOTHING;
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

COMMENT ON FUNCTION public.ensure_direct_chat(uuid, uuid) IS
  'Open/create workspace Team 1:1. Peer must be active non-driver with auth.users row.';
