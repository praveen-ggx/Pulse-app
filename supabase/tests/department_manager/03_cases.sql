\set ON_ERROR_STOP 0
CREATE OR REPLACE FUNCTION pg_temp.run(p_user text, p_sql text, p_expect text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v_err text;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', p_user, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    EXECUTE p_sql;
    v_err := 'OK';
  EXCEPTION WHEN others THEN v_err := SQLERRM;
  END;
  EXECUTE 'RESET ROLE';
  IF (p_expect = 'OK' AND v_err = 'OK') OR (p_expect <> 'OK' AND v_err LIKE p_expect || '%') THEN
    RETURN 'PASS';
  END IF;
  RETURN 'FAIL got=' || v_err;
END $$;
SELECT n, r FROM (VALUES
 ('01 sourcing mgr toggles teammate view off', pg_temp.run('e0000000-0000-0000-0000-0000000000b1', $q$SELECT public.set_member_surfaces_as_manager('d0000000-0000-0000-0000-0000000000b2','{"tripops.trips.view":false}')$q$, 'OK')),
 ('02 sourcing mgr grants finance.tab', pg_temp.run('e0000000-0000-0000-0000-0000000000b1', $q$SELECT public.set_member_surfaces_as_manager('d0000000-0000-0000-0000-0000000000b2','{"finance.tab":true}')$q$, 'surface_not_allowed')),
 ('03 sourcing mgr grants team.manage', pg_temp.run('e0000000-0000-0000-0000-0000000000b1', $q$SELECT public.set_member_surfaces_as_manager('d0000000-0000-0000-0000-0000000000b2','{"team.manage":true}')$q$, 'surface_not_allowed')),
 ('04 non-boolean value', pg_temp.run('e0000000-0000-0000-0000-0000000000b1', $q$SELECT public.set_member_surfaces_as_manager('d0000000-0000-0000-0000-0000000000b2','{"tripops.trips.view":"yes"}')$q$, 'invalid_surfaces')),
 ('05 self edit', pg_temp.run('e0000000-0000-0000-0000-0000000000b1', $q$SELECT public.set_member_surfaces_as_manager('d0000000-0000-0000-0000-0000000000b1','{"tripops.trips.view":true}')$q$, 'cannot_edit_self')),
 ('06 cross department (sales)', pg_temp.run('e0000000-0000-0000-0000-0000000000b1', $q$SELECT public.set_member_surfaces_as_manager('d0000000-0000-0000-0000-0000000000c1','{"tripops.trips.view":true}')$q$, 'cross_department')),
 ('07 admin target', pg_temp.run('e0000000-0000-0000-0000-0000000000b1', $q$SELECT public.set_member_surfaces_as_manager('d0000000-0000-0000-0000-0000000000a2','{"tripops.trips.view":true}')$q$, 'cannot_edit_admin')),
 ('08 inactive target', pg_temp.run('e0000000-0000-0000-0000-0000000000b1', $q$SELECT public.set_member_surfaces_as_manager('d0000000-0000-0000-0000-0000000000b3','{"tripops.trips.view":true}')$q$, 'target_not_editable')),
 ('09 other org target (mgr only in A)', pg_temp.run('e0000000-0000-0000-0000-0000000000b1', $q$SELECT public.set_member_surfaces_as_manager('d0000000-0000-0000-0000-0000000000bc','{"tripops.trips.view":true}')$q$, 'not_department_manager')),
 ('10 non-manager caller', pg_temp.run('e0000000-0000-0000-0000-0000000000d2', $q$SELECT public.set_member_surfaces_as_manager('d0000000-0000-0000-0000-0000000000b2','{"tripops.trips.view":true}')$q$, 'not_department_manager')),
 ('11 tripops mgr grants assign', pg_temp.run('e0000000-0000-0000-0000-0000000000d1', $q$SELECT public.set_member_surfaces_as_manager('d0000000-0000-0000-0000-0000000000d2','{"tripops.trips.assign":true}')$q$, 'OK')),
 ('12 tripops mgr grants finance.view', pg_temp.run('e0000000-0000-0000-0000-0000000000d1', $q$SELECT public.set_member_surfaces_as_manager('d0000000-0000-0000-0000-0000000000d2','{"finance.view":true}')$q$, 'surface_not_allowed')),
 ('13 admin-preset "manager" has no toggles', pg_temp.run('e0000000-0000-0000-0000-0000000000a9', $q$SELECT public.set_member_surfaces_as_manager('d0000000-0000-0000-0000-0000000000c1','{"sales.tab":true}')$q$, 'not_department_manager')),
 ('14 scope in own scope', pg_temp.run('e0000000-0000-0000-0000-0000000000b1', $q$SELECT public.set_member_scope_as_manager('d0000000-0000-0000-0000-0000000000b2', ARRAY['a1a00000-0000-0000-0000-000000000000','a2000000-0000-0000-0000-000000000000']::uuid[], ARRAY['c3000000-0000-0000-0000-000000000000']::uuid[])$q$, 'OK')),
 ('15 warehouse outside scope', pg_temp.run('e0000000-0000-0000-0000-0000000000b1', $q$SELECT public.set_member_scope_as_manager('d0000000-0000-0000-0000-0000000000b2', ARRAY['a4000000-0000-0000-0000-000000000000']::uuid[], '{}')$q$, 'warehouse_out_of_scope')),
 ('16 client outside scope', pg_temp.run('e0000000-0000-0000-0000-0000000000b1', $q$SELECT public.set_member_scope_as_manager('d0000000-0000-0000-0000-0000000000b2', '{}', ARRAY['c4000000-0000-0000-0000-000000000000']::uuid[])$q$, 'client_out_of_scope')),
 ('17 other-org warehouse', pg_temp.run('e0000000-0000-0000-0000-0000000000b1', $q$SELECT public.set_member_scope_as_manager('d0000000-0000-0000-0000-0000000000b2', ARRAY['ab000000-0000-0000-0000-000000000000']::uuid[], '{}')$q$, 'warehouse_out_of_scope')),
 ('18 ground ops mgr warehouse in scope', pg_temp.run('e0000000-0000-0000-0000-0000000000f1', $q$SELECT public.set_member_scope_as_manager('d0000000-0000-0000-0000-0000000000f2', ARRAY['a1a00000-0000-0000-0000-000000000000']::uuid[], '{}')$q$, 'OK')),
 ('19 ground ops mgr clients', pg_temp.run('e0000000-0000-0000-0000-0000000000f1', $q$SELECT public.set_member_scope_as_manager('d0000000-0000-0000-0000-0000000000f2', '{}', ARRAY['c1000000-0000-0000-0000-000000000000']::uuid[])$q$, 'scope_not_supported')),
 ('20 tripops mgr scope', pg_temp.run('e0000000-0000-0000-0000-0000000000d1', $q$SELECT public.set_member_scope_as_manager('d0000000-0000-0000-0000-0000000000d2', '{}', '{}')$q$, 'scope_not_supported')),
 ('21 scope on self', pg_temp.run('e0000000-0000-0000-0000-0000000000b1', $q$SELECT public.set_member_scope_as_manager('d0000000-0000-0000-0000-0000000000b1', ARRAY['a1a00000-0000-0000-0000-000000000000']::uuid[], '{}')$q$, 'not_allowed')),
 ('22 RLS: mgr inserts own warehouse row', pg_temp.run('e0000000-0000-0000-0000-0000000000b1', $q$INSERT INTO public.organization_member_warehouses (organization_member_id, warehouse_id) VALUES ('d0000000-0000-0000-0000-0000000000b1','a4000000-0000-0000-0000-000000000000')$q$, 'new row violates')),
 ('23 RLS: mgr inserts teammate row directly', pg_temp.run('e0000000-0000-0000-0000-0000000000b1', $q$INSERT INTO public.organization_member_warehouses (organization_member_id, warehouse_id) VALUES ('d0000000-0000-0000-0000-0000000000b2','a1b00000-0000-0000-0000-000000000000')$q$, 'new row violates')),
 ('24 RLS: owner inserts row', pg_temp.run('e0000000-0000-0000-0000-0000000000a1', $q$INSERT INTO public.organization_member_warehouses (organization_member_id, warehouse_id) VALUES ('d0000000-0000-0000-0000-0000000000c1','a1b00000-0000-0000-0000-000000000000')$q$, 'OK'))
) t(n, r) ORDER BY n;
-- anon cannot execute
SET ROLE anon;
DO $$ BEGIN PERFORM public.set_member_surfaces_as_manager('d0000000-0000-0000-0000-0000000000b2','{}'); RAISE NOTICE '25 anon: FAIL (executed)'; EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE '25 anon: PASS'; WHEN others THEN RAISE NOTICE '25 anon: FAIL %', SQLERRM; END $$;
RESET ROLE;
-- state checks after scope ops
SELECT '26 teammate keeps owner W4 + gets W1a,W2: ' || CASE WHEN (SELECT array_agg(warehouse_id::text ORDER BY warehouse_id) FROM organization_member_warehouses WHERE organization_member_id='d0000000-0000-0000-0000-0000000000b2') = ARRAY['a1a00000-0000-0000-0000-000000000000','a2000000-0000-0000-0000-000000000000','a4000000-0000-0000-0000-000000000000'] THEN 'PASS' ELSE 'FAIL' END;
SELECT '27 teammate clients keep C4 + add C3: ' || CASE WHEN (SELECT permissions->'clientIds' FROM organization_members WHERE id='d0000000-0000-0000-0000-0000000000b2') @> '["c4000000-0000-0000-0000-000000000000","c3000000-0000-0000-0000-000000000000"]' THEN 'PASS' ELSE 'FAIL' END;
SELECT '28 surfaces merged only allowed key: ' || CASE WHEN (SELECT permissions->'surfaces' FROM organization_members WHERE id='d0000000-0000-0000-0000-0000000000b2') = '{"tripops.trips.view":false}' THEN 'PASS' ELSE 'FAIL' END;
-- manager select visibility
SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','e0000000-0000-0000-0000-0000000000b1', false);
SELECT '29 mgr sees teammate rows, not sales: ' || CASE WHEN (SELECT count(*) FROM organization_member_warehouses WHERE organization_member_id='d0000000-0000-0000-0000-0000000000b2') = 3 AND (SELECT count(*) FROM organization_member_warehouses WHERE organization_member_id='d0000000-0000-0000-0000-0000000000c1') = 0 THEN 'PASS' ELSE 'FAIL' END;
RESET ROLE;
SELECT '30 audit rows: ' || count(*) FROM workspace_audit_log;
