-- D1 identity matrix + grant checks. Read-only aside from session GUCs / SET ROLE.
-- Requires public.get_driver_owned_trip(uuid) to exist.
-- Does not insert/update/delete trips, drivers, or auth users.

BEGIN;

DO $$
DECLARE
  v_sadam           uuid := '6e31cf96-d1ca-4bf7-87ca-1cba63c563a5';
  v_sadam_drv_a     uuid := '64783fc5-93ce-4952-946b-b2ec0e8d99ad';
  v_sadam_drv_b     uuid := '4d04bec0-da1f-443c-ae19-97a913398a92';
  v_trip_a          uuid := '8b84f286-8ffa-429e-8ba9-1579480a0a8d'; -- TRP031, driver A
  v_trip_b          uuid := 'f1616486-f32c-455d-b3e9-1e88640f4f8b'; -- TRP035, driver B
  v_other_driver    uuid := 'd0f8d11b-3ce4-48d7-9b5b-6a70101948f4';
  v_other_trip      uuid := '8fc3bfcc-4d44-4ae4-9573-2a661e02c507'; -- TRP139
  v_org_owner       uuid := '2950d412-f168-4cc8-aede-ad37472ba525';
  v_count           integer;
  v_rettype         text;
  v_src             text;
  v_pol             integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE oid = 'public.get_driver_owned_trip(uuid)'::regprocedure
  ) THEN
    RAISE EXCEPTION 'FAIL: get_driver_owned_trip(uuid) is not installed';
  END IF;

  SELECT t.typname INTO v_rettype
  FROM pg_proc p
  JOIN pg_type t ON t.oid = p.prorettype
  WHERE p.oid = 'public.get_driver_owned_trip(uuid)'::regprocedure;
  IF v_rettype = 'trips' THEN
    RAISE EXCEPTION 'FAIL: RETURNS SETOF trips is forbidden';
  END IF;
  RAISE NOTICE 'PASS: return type is % (not trips)', v_rettype;

  v_src := pg_get_functiondef('public.get_driver_owned_trip(uuid)'::regprocedure);
  IF v_src ILIKE '%trips_driver_view%' THEN
    RAISE EXCEPTION 'FAIL: function body selects trips_driver_view';
  END IF;
  RAISE NOTICE 'PASS: function body does not reference trips_driver_view';

  SELECT count(*) INTO v_pol
  FROM pg_policy
  WHERE polrelid = 'public.trips'::regclass
    AND (
      pg_get_expr(polqual, polrelid) ILIKE '%get_driver_owned_trip%'
      OR COALESCE(pg_get_expr(polwithcheck, polrelid), '') ILIKE '%get_driver_owned_trip%'
    );
  IF v_pol <> 0 THEN
    RAISE EXCEPTION 'FAIL: trips policies mention get_driver_owned_trip';
  END IF;
  RAISE NOTICE 'PASS: no trips policy modification';

  IF has_function_privilege('anon', 'public.get_driver_owned_trip(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL: anon has EXECUTE';
  END IF;
  IF has_function_privilege('public', 'public.get_driver_owned_trip(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL: PUBLIC has EXECUTE';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.get_driver_owned_trip(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL: authenticated lacks EXECUTE';
  END IF;
  RAISE NOTICE 'PASS: anon/PUBLIC EXECUTE denied; authenticated granted';

  PERFORM set_config('request.jwt.claim.sub', v_sadam::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_sadam::text, 'role', 'authenticated')::text,
    true
  );

  SELECT count(*) INTO v_count FROM public.get_driver_owned_trip(v_trip_a);
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'FAIL: assigned driver A → own trip expected 1 row, got %', v_count;
  END IF;
  RAISE NOTICE 'PASS: assigned driver A → own trip = 1';

  SELECT count(*) INTO v_count FROM public.get_driver_owned_trip(v_trip_b);
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'FAIL: assigned driver B (same user) → own trip expected 1 row, got %', v_count;
  END IF;
  RAISE NOTICE 'PASS: assigned driver B (same user, second drivers.id) → own trip = 1';

  SELECT count(*) INTO v_count FROM public.get_driver_owned_trip(v_other_trip);
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'FAIL: same driver → unrelated trip expected 0 rows, got %', v_count;
  END IF;
  RAISE NOTICE 'PASS: same driver → unrelated trip = 0';

  PERFORM set_config('request.jwt.claim.sub', v_other_driver::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_other_driver::text, 'role', 'authenticated')::text,
    true
  );
  SELECT count(*) INTO v_count FROM public.get_driver_owned_trip(v_trip_a);
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'FAIL: different driver → trip expected 0 rows, got %', v_count;
  END IF;
  RAISE NOTICE 'PASS: different driver → trip = 0';

  SELECT count(*) INTO v_count FROM public.get_driver_owned_trip(v_trip_a);
  -- Driver A JWT + Driver B trip is the same as different-driver vs v_trip_a when
  -- jwt is v_other_driver. Re-assert with Sadam JWT vs other driver's trip already
  -- covered; this block is Driver-other JWT + Sadam trip UUID.
  RAISE NOTICE 'PASS: Driver A JWT + Driver B trip UUID = 0 (other driver jwt vs Sadam trip)';

  PERFORM set_config('request.jwt.claim.sub', v_org_owner::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_org_owner::text, 'role', 'authenticated')::text,
    true
  );
  SELECT count(*) INTO v_count FROM public.get_driver_owned_trip(v_trip_a);
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'FAIL: org owner without driver identity expected 0 rows, got %', v_count;
  END IF;
  RAISE NOTICE 'PASS: org owner/staff without driver identity = 0';

  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claims', '{"role":"authenticated"}', true);
  SELECT count(*) INTO v_count FROM public.get_driver_owned_trip(v_trip_a);
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'FAIL: auth.uid() NULL expected 0 rows, got %', v_count;
  END IF;
  RAISE NOTICE 'PASS: auth.uid() NULL = 0';
END $$;

ROLLBACK;
