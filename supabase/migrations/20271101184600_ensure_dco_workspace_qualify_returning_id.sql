SET LOCAL lock_timeout = '5s';

-- RETURNS TABLE (id, name, ...) creates OUT variables with those names.
-- `RETURNING id` and unqualified `name` then clash with organizations columns
-- (42702 column reference "id" is ambiguous). Prefer table columns and
-- never RETURNING an unqualified id.

CREATE OR REPLACE FUNCTION public.ensure_dco_workspace()
RETURNS TABLE (
  id uuid,
  name text,
  slug text,
  owner_id uuid,
  operating_model text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
#variable_conflict use_column
DECLARE
  v_uid uuid := auth.uid();
  v_org_id uuid;
  v_name text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_dco_eligible(v_uid) THEN
    RAISE EXCEPTION 'dco_workspace_denied: DCO must be approved and not holding an active fleet-employee seat.';
  END IF;

  SELECT o.id
    INTO v_org_id
  FROM public.organizations o
  WHERE o.owner_id = v_uid
  ORDER BY o.created_at ASC
  LIMIT 1;

  IF v_org_id IS NULL THEN
    SELECT COALESCE(
      NULLIF(TRIM(p.company_name), ''),
      NULLIF(TRIM(p.full_name), '') || '''s workspace',
      'DCO workspace'
    )
      INTO v_name
    FROM public.profiles p
    WHERE p.id = v_uid;

    v_org_id := gen_random_uuid();
    INSERT INTO public.organizations (id, owner_id, name, operating_model)
    VALUES (v_org_id, v_uid, COALESCE(v_name, 'DCO workspace'), 'ASSET_BASED');
  END IF;

  INSERT INTO public.organization_members (organization_id, user_id, role, status)
  VALUES (v_org_id, v_uid, 'owner', 'active')
  ON CONFLICT (organization_id, user_id) DO UPDATE
    SET status = 'active',
        role = 'owner';

  RETURN QUERY
  SELECT o.id, o.name, o.slug, o.owner_id, o.operating_model
  FROM public.organizations o
  WHERE o.id = v_org_id;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_dco_workspace() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ensure_dco_workspace() FROM anon;
GRANT EXECUTE ON FUNCTION public.ensure_dco_workspace() TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_dco_workspace() TO service_role;

COMMENT ON FUNCTION public.ensure_dco_workspace() IS
  'Approved DCO: return (or create) the caller-owned workspace org used for clients. Qualifies organizations.id so RETURNS TABLE OUT params do not clash.';
