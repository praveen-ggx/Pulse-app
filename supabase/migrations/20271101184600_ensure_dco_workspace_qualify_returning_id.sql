SET LOCAL lock_timeout = '5s';

-- Historical second file: the first cut used RETURNING id INTO a RETURNS TABLE
-- OUT param (42702). Fresh replay now gets a valid function from
-- 20271101154500. This replace is identical so applying 154500-only is no
-- longer a broken intermediate, and applying both stays idempotent.

CREATE OR REPLACE FUNCTION public.dco_self_workspace_id(p_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT o.id
  FROM public.organizations o
  WHERE p_user_id IS NOT NULL
    AND o.owner_id = p_user_id
    AND o.operating_model = 'ASSET_BASED'
    AND NOT EXISTS (
      SELECT 1
      FROM public.organization_members om
      WHERE om.organization_id = o.id
        AND om.user_id IS DISTINCT FROM p_user_id
        AND om.status = 'active'
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.drivers d
      WHERE d.organization_id = o.id
        AND d.left_at IS NULL
        AND d.relationship_status = 'active_employee'
    )
  ORDER BY o.created_at ASC NULLS LAST
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.dco_self_workspace_id(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dco_self_workspace_id(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.dco_self_workspace_id(uuid) FROM authenticated;

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

  v_org_id := public.dco_self_workspace_id(v_uid);

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
  'Approved DCO: return or create the caller-owned Self workspace. Never reuses a staffed fleet/business org.';
