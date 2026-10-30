-- Department manager: department-limited toggles, scope assignment, org-safe
-- caller resolution. Audit 2026-10-29 (nihas V1.0.25).
--
-- 1. manager_department_surfaces(dept): the toggles a Department manager may
--    switch for a teammate = that department's preset (lib/memberSurfaces.ts
--    managerEditableSurfaceIds; rbac.departmentManager.test.ts keeps both lists
--    identical). Before this, set_member_surfaces_as_manager merged ANY surface
--    key, so a manager could grant Finance / Team / other departments' access.
-- 2. set_member_surfaces_as_manager: the target member decides the org and the
--    caller must be an active manager in that same org (was: the caller's first
--    active membership in any org). Every key must be in the allowlist and a
--    boolean; target must be active, non-owner/admin/driver, same department,
--    not the caller. anon loses EXECUTE.
-- 3. can_manage_member(member): shared check, also used by a SELECT policy so
--    a manager can read their teammates' warehouse rows.
-- 4. set_member_scope_as_manager: Ground Ops / Sourcing managers assign their
--    teammates' warehouses (and Sourcing clients) only from the manager's own
--    scope; assignments outside it are left untouched.
-- 5. organization_member_warehouses writes: owner/admin only (was any staff,
--    which let any member assign warehouses to anyone, themselves included).
--    Manager writes go through set_member_scope_as_manager only.
--
-- No table or data changes. App-side presets are unchanged.

CREATE OR REPLACE FUNCTION public.manager_department_surfaces(p_department text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE p_department
    WHEN 'finance' THEN ARRAY[
      'finance.add_transaction',
      'finance.branding',
      'finance.business_pulse',
      'finance.documents_center',
      'finance.edit_transaction',
      'finance.expenses.approve',
      'finance.expenses.view',
      'finance.invoicing',
      'finance.ledger.customers',
      'finance.ledger.driver',
      'finance.ledger.suppliers',
      'finance.ledger.vehicle',
      'finance.manage',
      'finance.pod_reconciliation',
      'finance.reports',
      'finance.shared_ledger',
      'finance.subtab.cash',
      'finance.subtab.customers',
      'finance.subtab.drivers',
      'finance.subtab.garage',
      'finance.subtab.suppliers',
      'finance.tab',
      'finance.trip_ledger',
      'finance.view',
      'finance.void_adjustments',
      'fleet.drivers.view',
      'fleet.vehicles.view',
      'sales.clients.detail',
      'sales.clients.view',
      'sales.suppliers.detail',
      'sales.suppliers.view',
      'sales.tab',
      'trip_compliance.documents.view',
      'trip_compliance.finance.manage',
      'trip_compliance.finance.reject',
      'trip_compliance.finance.view',
      'trip_compliance.tab',
      'trip_compliance.tab.advance_payment',
      'trip_compliance.tab.advance_verification',
      'trip_compliance.tab.final_settlement',
      'trip_compliance.tab.settlement_verification',
      'tripops.tab',
      'tripops.trips.detail',
      'tripops.trips.docs',
      'tripops.trips.expenses',
      'tripops.trips.finance',
      'tripops.trips.view'
    ]::text[]
    WHEN 'sales' THEN ARRAY[
      'sales.chat',
      'sales.clients.analytics',
      'sales.clients.create',
      'sales.clients.detail',
      'sales.clients.edit',
      'sales.clients.view',
      'sales.load_board',
      'sales.marketplace.bid',
      'sales.marketplace.post',
      'sales.network.connect',
      'sales.network.discover',
      'sales.network.stories',
      'sales.suppliers.analytics',
      'sales.suppliers.create',
      'sales.suppliers.detail',
      'sales.suppliers.edit',
      'sales.suppliers.view',
      'sales.tab',
      'tripops.indents.allocate',
      'tripops.indents.award',
      'tripops.indents.bid',
      'tripops.indents.broadcast',
      'tripops.indents.cancel',
      'tripops.indents.create',
      'tripops.indents.edit',
      'tripops.indents.view',
      'tripops.pulse_loads',
      'tripops.tab',
      'tripops.trips.assign',
      'tripops.trips.create_aggregate',
      'tripops.trips.create_asset',
      'tripops.trips.detail',
      'tripops.trips.reassign',
      'tripops.trips.view'
    ]::text[]
    WHEN 'tripops' THEN ARRAY[
      'fleet.drivers.analytics',
      'fleet.drivers.assign_vehicle',
      'fleet.drivers.create',
      'fleet.drivers.edit',
      'fleet.drivers.invite',
      'fleet.drivers.view',
      'fleet.vehicles.analytics',
      'fleet.vehicles.create',
      'fleet.vehicles.documents',
      'fleet.vehicles.edit',
      'fleet.vehicles.view',
      'trip_compliance.documents.view',
      'trip_compliance.tab',
      'trip_compliance.trip.resubmit',
      'tripops.tab',
      'tripops.trips.assign',
      'tripops.trips.create_aggregate',
      'tripops.trips.create_asset',
      'tripops.trips.detail',
      'tripops.trips.docs',
      'tripops.trips.expenses',
      'tripops.trips.finance',
      'tripops.trips.ratings',
      'tripops.trips.reassign',
      'tripops.trips.simulate',
      'tripops.trips.tracking',
      'tripops.trips.verification',
      'tripops.trips.view'
    ]::text[]
    WHEN 'compliance' THEN ARRAY[
      'trip_compliance.documents.verify',
      'trip_compliance.documents.view',
      'trip_compliance.tab',
      'trip_compliance.trip.mark_verified',
      'tripops.tab',
      'tripops.trips.detail',
      'tripops.trips.docs',
      'tripops.trips.view'
    ]::text[]
    WHEN 'debit_control' THEN ARRAY[
      'trip_compliance.pod.manage',
      'trip_compliance.tab',
      'tripops.tab',
      'tripops.trips.detail',
      'tripops.trips.docs',
      'tripops.trips.view'
    ]::text[]
    WHEN 'vendor_support' THEN ARRAY[
      'finance.subtab.suppliers',
      'finance.tab',
      'finance.view',
      'sales.suppliers.analytics',
      'sales.suppliers.create',
      'sales.suppliers.detail',
      'sales.suppliers.edit',
      'sales.suppliers.view',
      'sales.tab'
    ]::text[]
    WHEN 'ground_ops' THEN ARRAY[
      'trip_compliance.documents.view',
      'trip_compliance.tab',
      'trip_compliance.trip.resubmit',
      'tripops.tab',
      'tripops.trips.detail',
      'tripops.trips.docs',
      'tripops.trips.view'
    ]::text[]
    WHEN 'sourcing' THEN ARRAY[
      'sales.tab',
      'trip_compliance.documents.view',
      'trip_compliance.tab',
      'tripops.indents.view',
      'tripops.tab',
      'tripops.trips.detail',
      'tripops.trips.view'
    ]::text[]
    ELSE ARRAY[]::text[]
  END;
$$;

REVOKE ALL ON FUNCTION public.manager_department_surfaces(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.manager_department_surfaces(text) TO authenticated;

-- True when the caller is an active Department manager allowed to manage this
-- member: same org (resolved from the member), same department, member active
-- and not owner / admin / driver, never the caller themselves.
CREATE OR REPLACE FUNCTION public.can_manage_member(p_member_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members t
    JOIN public.organization_members a
      ON a.organization_id = t.organization_id
     AND a.user_id = (SELECT auth.uid())
     AND a.status = 'active'
    WHERE t.id = p_member_id
      AND t.id <> a.id
      AND t.status = 'active'
      AND t.role NOT IN ('owner', 'admin', 'driver')
      AND COALESCE((a.permissions ->> 'isDepartmentManager')::boolean, false)
      AND cardinality(public.manager_department_surfaces(a.permissions ->> 'platformRole')) > 0
      AND (t.permissions ->> 'platformRole') = (a.permissions ->> 'platformRole')
  );
$$;

REVOKE ALL ON FUNCTION public.can_manage_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_member(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_member_surfaces_as_manager(
  p_member_id uuid,
  p_surfaces jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_org_id uuid;
  v_target_role text;
  v_target_status text;
  v_target_perms jsonb;
  v_actor_id uuid;
  v_actor_perms jsonb;
  v_dept text;
  v_allowed text[];
  v_key text;
  v_value jsonb;
  v_new_perms jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_surfaces IS NULL OR jsonb_typeof(p_surfaces) <> 'object' THEN
    RAISE EXCEPTION 'invalid_surfaces: p_surfaces must be a JSON object';
  END IF;

  -- The target decides the org; the caller must be a member of that same org.
  SELECT organization_id, role, status, permissions
    INTO v_org_id, v_target_role, v_target_status, v_target_perms
  FROM public.organization_members
  WHERE id = p_member_id;
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Member not found';
  END IF;

  SELECT id, permissions INTO v_actor_id, v_actor_perms
  FROM public.organization_members
  WHERE organization_id = v_org_id
    AND user_id = v_uid
    AND status = 'active';
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'not_a_member: caller is not an active member of this organization';
  END IF;
  IF COALESCE((v_actor_perms ->> 'isDepartmentManager')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'not_department_manager: caller is not a department manager';
  END IF;

  v_dept := v_actor_perms ->> 'platformRole';
  v_allowed := public.manager_department_surfaces(v_dept);
  IF cardinality(v_allowed) = 0 THEN
    RAISE EXCEPTION 'not_department_manager: department % has no manager toggles', COALESCE(v_dept, '(none)');
  END IF;

  IF v_target_role IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'cannot_edit_admin: a department manager cannot edit an owner or admin';
  END IF;
  IF v_target_role = 'driver' OR v_target_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'target_not_editable: only active team members can be edited';
  END IF;
  IF (v_target_perms ->> 'platformRole') IS DISTINCT FROM v_dept THEN
    RAISE EXCEPTION 'cross_department: a department manager can only edit members of their own department';
  END IF;
  IF p_member_id = v_actor_id THEN
    RAISE EXCEPTION 'cannot_edit_self: a department manager cannot edit their own surfaces';
  END IF;

  FOR v_key, v_value IN SELECT key, value FROM jsonb_each(p_surfaces) LOOP
    IF jsonb_typeof(v_value) <> 'boolean' THEN
      RAISE EXCEPTION 'invalid_surfaces: % must be true or false', v_key;
    END IF;
    IF NOT (v_key = ANY (v_allowed)) THEN
      RAISE EXCEPTION 'surface_not_allowed: % is outside the % department', v_key, v_dept;
    END IF;
  END LOOP;

  -- Merge only the `surfaces` key — every other permissions field is preserved.
  v_new_perms := COALESCE(v_target_perms, '{}'::jsonb)
    || jsonb_build_object('surfaces', COALESCE(v_target_perms -> 'surfaces', '{}'::jsonb) || p_surfaces);

  UPDATE public.organization_members
  SET permissions = v_new_perms
  WHERE id = p_member_id;

  INSERT INTO public.workspace_audit_log (org_id, actor_id, event_type, payload)
  VALUES (
    v_org_id,
    v_uid,
    'member.surfaces_update_by_manager',
    jsonb_build_object('member_id', p_member_id, 'department', v_dept, 'surfaces', p_surfaces)
  );

  RETURN jsonb_build_object('ok', true, 'member_id', p_member_id, 'surfaces', v_new_perms -> 'surfaces');
END;
$$;

REVOKE ALL ON FUNCTION public.set_member_surfaces_as_manager(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_member_surfaces_as_manager(uuid, jsonb) TO authenticated;

-- Ground Ops / Sourcing manager: set a teammate's warehouses (and Sourcing
-- clients) within the manager's own scope. Ids outside that scope are
-- rejected; the teammate's assignments outside it are kept as they are.
CREATE OR REPLACE FUNCTION public.set_member_scope_as_manager(
  p_member_id uuid,
  p_warehouse_ids uuid[],
  p_client_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_org_id uuid;
  v_actor_id uuid;
  v_actor_perms jsonb;
  v_target_perms jsonb;
  v_dept text;
  v_auth_clients uuid[];
  v_auth_warehouses uuid[];
  v_req_warehouses uuid[] := COALESCE(p_warehouse_ids, '{}');
  v_req_clients uuid[] := COALESCE(p_client_ids, '{}');
  v_bad uuid;
  v_new_clients jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.can_manage_member(p_member_id) THEN
    RAISE EXCEPTION 'not_allowed: you can only edit active members of your own department';
  END IF;

  SELECT organization_id, permissions INTO v_org_id, v_target_perms
  FROM public.organization_members WHERE id = p_member_id;
  SELECT id, permissions INTO v_actor_id, v_actor_perms
  FROM public.organization_members
  WHERE organization_id = v_org_id AND user_id = v_uid AND status = 'active';

  v_dept := v_actor_perms ->> 'platformRole';
  IF v_dept NOT IN ('ground_ops', 'sourcing') THEN
    RAISE EXCEPTION 'scope_not_supported: % members have no warehouse or client scope', v_dept;
  END IF;
  IF v_dept = 'ground_ops' AND cardinality(v_req_clients) > 0 THEN
    RAISE EXCEPTION 'scope_not_supported: Ground Ops members are scoped by warehouse only';
  END IF;

  -- The manager's own clients (Sourcing), live in this org.
  SELECT COALESCE(array_agg(c.id), '{}') INTO v_auth_clients
  FROM public.clients c
  WHERE c.organization_id = v_org_id
    AND c.deleted_at IS NULL
    AND v_dept = 'sourcing'
    AND c.id::text IN (
      SELECT jsonb_array_elements_text(COALESCE(v_actor_perms -> 'clientIds', '[]'::jsonb))
    );

  -- The manager's own warehouses, plus every live warehouse of their clients.
  SELECT COALESCE(array_agg(DISTINCT cw.id), '{}') INTO v_auth_warehouses
  FROM public.client_warehouses cw
  WHERE cw.organization_id = v_org_id
    AND cw.deleted_at IS NULL
    AND (
      cw.id IN (
        SELECT omw.warehouse_id FROM public.organization_member_warehouses omw
        WHERE omw.organization_member_id = v_actor_id
      )
      OR cw.client_id = ANY (v_auth_clients)
    );

  SELECT w INTO v_bad FROM unnest(v_req_warehouses) w WHERE NOT (w = ANY (v_auth_warehouses)) LIMIT 1;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'warehouse_out_of_scope: % is not in your own scope', v_bad;
  END IF;
  SELECT c INTO v_bad FROM unnest(v_req_clients) c WHERE NOT (c = ANY (v_auth_clients)) LIMIT 1;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'client_out_of_scope: % is not in your own scope', v_bad;
  END IF;

  DELETE FROM public.organization_member_warehouses
  WHERE organization_member_id = p_member_id
    AND warehouse_id = ANY (v_auth_warehouses)
    AND NOT (warehouse_id = ANY (v_req_warehouses));
  INSERT INTO public.organization_member_warehouses (organization_member_id, warehouse_id)
  SELECT p_member_id, w FROM unnest(v_req_warehouses) w
  ON CONFLICT (organization_member_id, warehouse_id) DO NOTHING;

  IF v_dept = 'sourcing' THEN
    SELECT COALESCE(jsonb_agg(DISTINCT x), '[]'::jsonb) INTO v_new_clients
    FROM (
      SELECT e AS x
      FROM jsonb_array_elements_text(COALESCE(v_target_perms -> 'clientIds', '[]'::jsonb)) e
      WHERE NOT (e = ANY (SELECT unnest(v_auth_clients)::text))
      UNION
      SELECT unnest(v_req_clients)::text
    ) s;
    UPDATE public.organization_members
    SET permissions = COALESCE(permissions, '{}'::jsonb) || jsonb_build_object('clientIds', v_new_clients)
    WHERE id = p_member_id;
  END IF;

  INSERT INTO public.workspace_audit_log (org_id, actor_id, event_type, payload)
  VALUES (
    v_org_id,
    v_uid,
    'member.scope_update_by_manager',
    jsonb_build_object(
      'member_id', p_member_id,
      'department', v_dept,
      'warehouse_ids', to_jsonb(v_req_warehouses),
      'client_ids', to_jsonb(v_req_clients)
    )
  );

  RETURN jsonb_build_object('ok', true, 'member_id', p_member_id);
END;
$$;

REVOKE ALL ON FUNCTION public.set_member_scope_as_manager(uuid, uuid[], uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_member_scope_as_manager(uuid, uuid[], uuid[]) TO authenticated;

-- Warehouse rows: owner / admin write; managers read their teammates' rows.
DROP POLICY IF EXISTS "org_member_warehouses_staff_manage" ON public.organization_member_warehouses;
DROP POLICY IF EXISTS "org_member_warehouses_admin_manage" ON public.organization_member_warehouses;
CREATE POLICY "org_member_warehouses_admin_manage" ON public.organization_member_warehouses
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.organization_members om
    WHERE om.id = organization_member_warehouses.organization_member_id
      AND public.is_org_admin(om.organization_id)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.organization_members om
    JOIN public.client_warehouses cw
      ON cw.id = organization_member_warehouses.warehouse_id
     AND cw.organization_id = om.organization_id
     AND cw.deleted_at IS NULL
    WHERE om.id = organization_member_warehouses.organization_member_id
      AND public.is_org_admin(om.organization_id)
  )
);

DROP POLICY IF EXISTS "org_member_warehouses_manager_select" ON public.organization_member_warehouses;
CREATE POLICY "org_member_warehouses_manager_select" ON public.organization_member_warehouses
FOR SELECT TO authenticated
USING (public.can_manage_member(organization_member_id));
