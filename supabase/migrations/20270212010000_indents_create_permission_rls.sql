-- Add server-side permission enforcement on indent creation
-- Closes the security gap where any authenticated org member could create indents
-- by calling the Supabase API directly, regardless of their surfaces.tripops.indents.create flag.

-- ─── Permission check function ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.can_create_indent(p_org_id uuid)
  RETURNS boolean
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_uid            uuid := auth.uid();
  v_status         text;
  v_role           text;
  v_can_create     boolean;
BEGIN
  IF v_uid IS NULL THEN
    RETURN false;
  END IF;

  -- Get the member's role and permissions
  SELECT status, role, (permissions->'surfaces'->>'tripops.indents.create')::boolean
    INTO v_status, v_role, v_can_create
    FROM public.organization_members
   WHERE organization_id = p_org_id
     AND user_id = v_uid;

  -- Not a member of this org
  IF v_status IS NULL THEN
    RETURN false;
  END IF;

  -- Must be active
  IF v_status != 'active' THEN
    RETURN false;
  END IF;

  -- Owners and admins can always create indents
  IF v_role IN ('owner', 'admin') THEN
    RETURN true;
  END IF;

  -- Regular members: check the explicit surface flag
  RETURN COALESCE(v_can_create, false);
END;
$$;

GRANT EXECUTE ON FUNCTION public.can_create_indent(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.can_create_indent(uuid) FROM public;

-- ─── Update RLS policies on indents table ──────────────────────────────────

-- Drop the old generic policy so we can replace it with two specific ones
DROP POLICY IF EXISTS "Org members can manage indents" ON public.indents;

-- READ, UPDATE, DELETE: still just org membership (unchanged).
-- Postgres accepts one command per policy, so the three commands are separate
-- policies with the same membership predicate.
CREATE POLICY "Org members can view indents"
  ON public.indents
  FOR SELECT
  USING (public.is_org_member(organization_id));

CREATE POLICY "Org members can update indents"
  ON public.indents
  FOR UPDATE
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

CREATE POLICY "Org members can delete indents"
  ON public.indents
  FOR DELETE
  USING (public.is_org_member(organization_id));

-- INSERT: require both org membership AND create permission
CREATE POLICY "Org members with permission can create indents"
  ON public.indents
  FOR INSERT
  WITH CHECK (
    public.is_org_member(organization_id)
    AND public.can_create_indent(organization_id)
  );
