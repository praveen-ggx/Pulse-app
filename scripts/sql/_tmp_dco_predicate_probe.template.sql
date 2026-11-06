-- Rolled-back probe for 20271006015124. The whole probe is one DO block that
-- always ends in RAISE EXCEPTION, so the function replacement can never commit.
DO $probe$
DECLARE
  v_out      jsonb := '{}'::jsonb;
  v_locks    jsonb;
  v_def_md5  text;
  v_acl      text;
  r          record;
BEGIN
  PERFORM set_config('lock_timeout', '2s', true);
  PERFORM set_config('statement_timeout', '30s', true);

  CREATE TEMP TABLE pop ON COMMIT DROP AS
  SELECT DISTINCT uid FROM (
    SELECT user_id uid FROM public.organization_members WHERE role = 'driver' AND status = 'active'
    UNION SELECT user_id FROM public.drivers WHERE user_id IS NOT NULL AND left_at IS NULL
    UNION SELECT user_id FROM public.dco_profiles
  ) s WHERE uid IS NOT NULL;

  CREATE TEMP TABLE snap (uid uuid, phase text, emp boolean, dco_elig boolean, mkt_elig boolean, mode text) ON COMMIT DROP;

  FOR r IN SELECT uid FROM pop LOOP
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', r.uid, 'role', 'authenticated')::text, true);
    PERFORM set_config('request.jwt.claim.sub', r.uid::text, true);
    INSERT INTO snap SELECT r.uid, 'old', public._is_active_employee_driver(r.uid), public.is_dco_eligible(r.uid),
      public.is_dco_marketplace_eligible(r.uid), public.get_my_driver_operating_mode()->>'mode';
  END LOOP;

  -- ── migration body (exact text) ──
  EXECUTE $mig$__CREATE_STMT__$mig$;
  EXECUTE 'REVOKE ALL ON FUNCTION public._is_active_employee_driver(uuid) FROM PUBLIC';
  EXECUTE 'REVOKE ALL ON FUNCTION public._is_active_employee_driver(uuid) FROM anon';
  EXECUTE 'REVOKE ALL ON FUNCTION public._is_active_employee_driver(uuid) FROM authenticated';

  SELECT md5(pg_get_functiondef(p.oid)), p.proacl::text INTO v_def_md5, v_acl
  FROM pg_proc p WHERE p.oid = 'public._is_active_employee_driver(uuid)'::regprocedure;

  SELECT coalesce(jsonb_agg(jsonb_build_object('rel', coalesce(c.relname, l.locktype), 'mode', l.mode)), '[]')
  INTO v_locks
  FROM pg_locks l LEFT JOIN pg_class c ON c.oid = l.relation
  WHERE l.pid = pg_backend_pid() AND l.locktype = 'relation'
    AND l.mode <> 'AccessShareLock' AND coalesce(c.relpersistence, 'p') <> 't';

  FOR r IN SELECT uid FROM pop LOOP
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', r.uid, 'role', 'authenticated')::text, true);
    PERFORM set_config('request.jwt.claim.sub', r.uid::text, true);
    INSERT INTO snap SELECT r.uid, 'new', public._is_active_employee_driver(r.uid), public.is_dco_eligible(r.uid),
      public.is_dco_marketplace_eligible(r.uid), public.get_my_driver_operating_mode()->>'mode';
  END LOOP;

  -- per-membership classification of the org's current roster rows
  CREATE TEMP TABLE mem ON COMMIT DROP AS
  SELECT om.user_id uid, om.organization_id org,
    CASE
      WHEN bool_or(d.relationship_status = 'active_employee') THEN 'active_employee'
      WHEN count(d.id) = 0 THEN 'no_roster_row'
      WHEN bool_and(d.relationship_status = 'independent' OR d.tracking_only IS TRUE) THEN 'all_independent'
      WHEN bool_or(d.relationship_status IS NULL) THEN 'null_status'
      ELSE 'other_status'
    END cat
  FROM public.organization_members om
  LEFT JOIN public.drivers d ON d.user_id = om.user_id AND d.organization_id = om.organization_id
    AND d.left_at IS NULL AND d.deleted_at IS NULL
  WHERE om.role = 'driver' AND om.status = 'active'
  GROUP BY 1, 2;

  CREATE TEMP TABLE u ON COMMIT DROP AS
  SELECT p.uid,
    o.emp old_emp, n.emp new_emp, o.dco_elig old_dco, n.dco_elig new_dco,
    o.mkt_elig old_mkt, n.mkt_elig new_mkt, o.mode old_mode, n.mode new_mode,
    (SELECT dp.status FROM public.dco_profiles dp WHERE dp.user_id = p.uid) dco_status,
    (SELECT pr.role FROM public.profiles pr WHERE pr.id = p.uid) profile_role,
    EXISTS (SELECT 1 FROM public.drivers d WHERE d.user_id = p.uid AND d.left_at IS NULL
            AND d.relationship_status = 'active_employee') has_ae_row,
    (SELECT coalesce(string_agg(left(m.org::text, 8) || ':' || m.cat, ',' ORDER BY m.org), '') FROM mem m WHERE m.uid = p.uid) mems,
    EXISTS (SELECT 1 FROM mem m WHERE m.uid = p.uid AND m.cat IN ('no_roster_row', 'null_status', 'other_status')) has_counting_mem,
    EXISTS (SELECT 1 FROM mem m WHERE m.uid = p.uid AND m.cat = 'all_independent') has_indep_mem
  FROM pop p
  JOIN snap o ON o.uid = p.uid AND o.phase = 'old'
  JOIN snap n ON n.uid = p.uid AND n.phase = 'new';

  v_out := jsonb_build_object(
    'post_def_md5', v_def_md5,
    'post_acl', v_acl,
    'non_share_relation_locks', v_locks,
    'population', (SELECT count(*) FROM u),
    'membership_categories', (SELECT jsonb_object_agg(cat, n) FROM (SELECT cat, count(*) n FROM mem GROUP BY cat) s),
    'targets', (SELECT jsonb_object_agg(left(uid::text, 8), jsonb_build_object(
        'emp', old_emp::text || '->' || new_emp::text, 'mkt', old_mkt::text || '->' || new_mkt::text,
        'mode', old_mode || '->' || new_mode, 'mems', mems))
      FROM u WHERE left(uid::text, 8) IN ('1026422b', 'f3beccae', '6e31cf96')),
    'assert', jsonb_build_object(
      'A1_1026422b_eligible', (SELECT new_mkt AND new_mode = 'DCO' FROM u WHERE left(uid::text, 8) = '1026422b'),
      'A2_f3beccae_eligible', (SELECT new_mkt AND new_mode = 'DCO' FROM u WHERE left(uid::text, 8) = 'f3beccae'),
      'A3_6e31cf96_blocked', (SELECT NOT new_mkt AND new_mode = 'DCO_EMPLOYMENT_CONFLICT' FROM u WHERE left(uid::text, 8) = '6e31cf96'),
      'A4_active_employee_still_employed_violations', (SELECT count(*) FROM u WHERE has_ae_row AND NOT new_emp),
      'A4_active_employee_users', (SELECT count(*) FROM u WHERE has_ae_row),
      'A5_independent_only_not_employed_violations', (SELECT count(*) FROM u WHERE has_indep_mem AND NOT has_counting_mem AND NOT has_ae_row AND NOT EXISTS (SELECT 1 FROM mem m WHERE m.uid = u.uid AND m.cat = 'active_employee') AND new_emp),
      'A5_independent_only_users', (SELECT count(*) FROM u WHERE has_indep_mem AND NOT has_counting_mem AND NOT has_ae_row AND NOT EXISTS (SELECT 1 FROM mem m WHERE m.uid = u.uid AND m.cat = 'active_employee')),
      'A6_no_roster_or_null_still_employed_violations', (SELECT count(*) FROM u WHERE has_counting_mem AND NOT new_emp),
      'A6_no_roster_or_null_users', (SELECT count(*) FROM u WHERE has_counting_mem),
      'A7_false_to_true_flips', (SELECT count(*) FROM u WHERE NOT old_emp AND new_emp),
      'A8_mode_changes_outside_flipped', (SELECT count(*) FROM u WHERE old_mode <> new_mode AND old_emp = new_emp)
    ),
    'blast_radius', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'u8', left(uid::text, 8), 'role', profile_role, 'dco', coalesce(dco_status, 'NONE'),
        'emp', old_emp::text || '->' || new_emp::text,
        'dco_elig', old_dco::text || '->' || new_dco::text,
        'mkt', old_mkt::text || '->' || new_mkt::text,
        'mode', old_mode || '->' || new_mode, 'mems', mems) ORDER BY dco_status NULLS LAST, uid), '[]')
      FROM u WHERE old_emp <> new_emp OR old_mode <> new_mode OR old_mkt <> new_mkt)
  );

  RAISE EXCEPTION 'PROBE_RESULT %', v_out::text;
END
$probe$;
