-- Org-wise document charge slabs (freight cost range -> flat document charge).
-- Read later when paying trip advance. Additive, no backfill.
--
-- Writes go only through save_org_document_charge_config() so the enabled flag
-- and slab set are replaced atomically and validated server-side.

-- A. Per-org toggle
CREATE TABLE IF NOT EXISTS public.org_document_charge_settings (
  organization_id uuid PRIMARY KEY
    REFERENCES public.organizations(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.org_document_charge_settings IS
  'Whether an org applies slab-based document charges. Slabs in org_document_charge_slabs.';

-- B. Slab rows. max_freight NULL = open-ended ("above"), last slab only.
CREATE TABLE IF NOT EXISTS public.org_document_charge_slabs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL
    REFERENCES public.organizations(id) ON DELETE CASCADE,
  sort_order integer NOT NULL,
  min_freight numeric(14,2) NOT NULL,
  max_freight numeric(14,2),
  charge numeric(14,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT org_document_charge_slabs_min_nonneg CHECK (min_freight >= 0),
  CONSTRAINT org_document_charge_slabs_range CHECK (max_freight IS NULL OR max_freight > min_freight),
  CONSTRAINT org_document_charge_slabs_charge_nonneg CHECK (charge >= 0),
  CONSTRAINT org_document_charge_slabs_order_uniq UNIQUE (organization_id, sort_order)
);

COMMENT ON TABLE public.org_document_charge_slabs IS
  'Document charge per freight range, per org. Lookup: min_freight <= freight AND (max_freight IS NULL OR freight <= max_freight).';

-- C. RLS: org members read; no direct writes (RPC only).
ALTER TABLE public.org_document_charge_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_document_charge_slabs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS org_document_charge_settings_select ON public.org_document_charge_settings;
CREATE POLICY org_document_charge_settings_select
  ON public.org_document_charge_settings
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS org_document_charge_slabs_select ON public.org_document_charge_slabs;
CREATE POLICY org_document_charge_slabs_select
  ON public.org_document_charge_slabs
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

REVOKE ALL ON public.org_document_charge_settings FROM anon, authenticated;
REVOKE ALL ON public.org_document_charge_slabs FROM anon, authenticated;
GRANT SELECT ON public.org_document_charge_settings TO authenticated;
GRANT SELECT ON public.org_document_charge_slabs TO authenticated;

-- D. Who can configure: owner / admin / finance role, or finance.manage grant/surface.
CREATE OR REPLACE FUNCTION public.can_manage_org_document_charges(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members om
    WHERE om.organization_id = p_org_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
      AND (
        om.role IN ('owner', 'admin', 'finance')
        OR COALESCE(om.permissions -> 'grants', '[]'::jsonb) ? 'finance:manage'
        OR COALESCE(om.permissions #>> '{surfaces,finance.manage}', '') = 'true'
      )
  );
$$;

REVOKE ALL ON FUNCTION public.can_manage_org_document_charges(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_manage_org_document_charges(uuid) TO authenticated;

-- E. Atomic save. p_slabs: [{ "min": number, "max": number|null, "charge": number }, ...]
-- in ascending order. Replaces the org's whole slab set.
CREATE OR REPLACE FUNCTION public.save_org_document_charge_config(
  p_org_id uuid,
  p_enabled boolean,
  p_slabs jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_count integer;
  v_i integer;
  v_min numeric;
  v_max numeric;
  v_charge numeric;
  v_prev_max numeric;
BEGIN
  IF p_org_id IS NULL THEN
    RAISE EXCEPTION 'organization required' USING ERRCODE = '22023';
  END IF;
  IF NOT public.can_manage_org_document_charges(p_org_id) THEN
    RAISE EXCEPTION 'not allowed to manage document charges' USING ERRCODE = '42501';
  END IF;
  IF p_slabs IS NULL OR jsonb_typeof(p_slabs) <> 'array' THEN
    RAISE EXCEPTION 'slabs must be an array' USING ERRCODE = '22023';
  END IF;

  v_count := jsonb_array_length(p_slabs);
  IF p_enabled AND v_count = 0 THEN
    RAISE EXCEPTION 'at least one slab is required when enabled' USING ERRCODE = '22023';
  END IF;

  -- Validate before touching rows.
  FOR v_i IN 0 .. v_count - 1 LOOP
    v_min := (p_slabs -> v_i ->> 'min')::numeric;
    v_max := NULLIF(p_slabs -> v_i ->> 'max', '')::numeric;
    v_charge := (p_slabs -> v_i ->> 'charge')::numeric;

    IF v_min IS NULL OR v_min < 0 THEN
      RAISE EXCEPTION 'row %: invalid min', v_i + 1 USING ERRCODE = '22023';
    END IF;
    IF v_charge IS NULL OR v_charge < 0 THEN
      RAISE EXCEPTION 'row %: invalid charge', v_i + 1 USING ERRCODE = '22023';
    END IF;
    IF v_max IS NULL AND v_i < v_count - 1 THEN
      RAISE EXCEPTION 'row %: only the last slab can be open-ended', v_i + 1 USING ERRCODE = '22023';
    END IF;
    IF v_max IS NOT NULL AND v_max <= v_min THEN
      RAISE EXCEPTION 'row %: max must be greater than min', v_i + 1 USING ERRCODE = '22023';
    END IF;
    IF v_i > 0 AND v_min <= v_prev_max THEN
      RAISE EXCEPTION 'row %: overlaps previous slab', v_i + 1 USING ERRCODE = '22023';
    END IF;
    v_prev_max := v_max;
  END LOOP;

  INSERT INTO public.org_document_charge_settings AS s
    (organization_id, enabled, updated_by, updated_at)
  VALUES (p_org_id, p_enabled, auth.uid(), now())
  ON CONFLICT (organization_id) DO UPDATE
    SET enabled = EXCLUDED.enabled,
        updated_by = EXCLUDED.updated_by,
        updated_at = EXCLUDED.updated_at;

  DELETE FROM public.org_document_charge_slabs WHERE organization_id = p_org_id;

  INSERT INTO public.org_document_charge_slabs
    (organization_id, sort_order, min_freight, max_freight, charge)
  SELECT
    p_org_id,
    (e.ord - 1)::integer,
    (e.val ->> 'min')::numeric,
    NULLIF(e.val ->> 'max', '')::numeric,
    (e.val ->> 'charge')::numeric
  FROM jsonb_array_elements(p_slabs) WITH ORDINALITY AS e(val, ord);
END;
$$;

REVOKE ALL ON FUNCTION public.save_org_document_charge_config(uuid, boolean, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_org_document_charge_config(uuid, boolean, jsonb) TO authenticated;
