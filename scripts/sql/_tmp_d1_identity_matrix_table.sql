-- D1 identity matrix as one result table. Sequential JWT switches in one session.
CREATE TEMP TABLE IF NOT EXISTS d1_identity_matrix (
  seq int,
  gate text,
  expected_rows int,
  actual_rows int
);
TRUNCATE d1_identity_matrix;

INSERT INTO d1_identity_matrix VALUES
  (1, 'anon EXECUTE denied', 0,
    CASE WHEN has_function_privilege('anon', 'public.get_driver_owned_trip(uuid)', 'EXECUTE') THEN 1 ELSE 0 END),
  (2, 'PUBLIC EXECUTE denied', 0,
    CASE WHEN has_function_privilege('public', 'public.get_driver_owned_trip(uuid)', 'EXECUTE') THEN 1 ELSE 0 END),
  (3, 'authenticated EXECUTE granted', 1,
    CASE WHEN has_function_privilege('authenticated', 'public.get_driver_owned_trip(uuid)', 'EXECUTE') THEN 1 ELSE 0 END),
  (4, 'return type is not trips', 0,
    CASE WHEN (SELECT t.typname FROM pg_proc p JOIN pg_type t ON t.oid = p.prorettype
      WHERE p.oid = 'public.get_driver_owned_trip(uuid)'::regprocedure) = 'trips' THEN 1 ELSE 0 END),
  (5, 'body does not select trips_driver_view', 0,
    CASE WHEN pg_get_functiondef('public.get_driver_owned_trip(uuid)'::regprocedure) ILIKE '%trips_driver_view%' THEN 1 ELSE 0 END),
  (6, 'no trips policy mentions RPC', 0,
    (SELECT count(*)::int FROM pg_policy
     WHERE polrelid = 'public.trips'::regclass
       AND (
         pg_get_expr(polqual, polrelid) ILIKE '%get_driver_owned_trip%'
         OR COALESCE(pg_get_expr(polwithcheck, polrelid), '') ILIKE '%get_driver_owned_trip%'
       )));

SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claim.sub', '6e31cf96-d1ca-4bf7-87ca-1cba63c563a5', true);
SELECT set_config('request.jwt.claims', '{"sub":"6e31cf96-d1ca-4bf7-87ca-1cba63c563a5","role":"authenticated"}', true);

INSERT INTO d1_identity_matrix
SELECT 7, 'assigned driver A → own trip (TRP031)', 1, count(*)::int
FROM public.get_driver_owned_trip('8b84f286-8ffa-429e-8ba9-1579480a0a8d');

INSERT INTO d1_identity_matrix
SELECT 8, 'assigned driver B same user → own trip (TRP035)', 1, count(*)::int
FROM public.get_driver_owned_trip('f1616486-f32c-455d-b3e9-1e88640f4f8b');

INSERT INTO d1_identity_matrix
SELECT 9, 'same driver → unrelated trip (TRP139)', 0, count(*)::int
FROM public.get_driver_owned_trip('8fc3bfcc-4d44-4ae4-9573-2a661e02c507');

SELECT set_config('request.jwt.claim.sub', 'd0f8d11b-3ce4-48d7-9b5b-6a70101948f4', true);
SELECT set_config('request.jwt.claims', '{"sub":"d0f8d11b-3ce4-48d7-9b5b-6a70101948f4","role":"authenticated"}', true);

INSERT INTO d1_identity_matrix
SELECT 10, 'different driver → Sadam trip', 0, count(*)::int
FROM public.get_driver_owned_trip('8b84f286-8ffa-429e-8ba9-1579480a0a8d');

INSERT INTO d1_identity_matrix
SELECT 11, 'Driver A JWT + Driver B trip UUID', 0, count(*)::int
FROM public.get_driver_owned_trip('8b84f286-8ffa-429e-8ba9-1579480a0a8d');

SELECT set_config('request.jwt.claim.sub', '2950d412-f168-4cc8-aede-ad37472ba525', true);
SELECT set_config('request.jwt.claims', '{"sub":"2950d412-f168-4cc8-aede-ad37472ba525","role":"authenticated"}', true);

INSERT INTO d1_identity_matrix
SELECT 12, 'org owner/staff without driver identity', 0, count(*)::int
FROM public.get_driver_owned_trip('8b84f286-8ffa-429e-8ba9-1579480a0a8d');

SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claims', '{"role":"authenticated"}', true);

INSERT INTO d1_identity_matrix
SELECT 13, 'auth.uid() = NULL', 0, count(*)::int
FROM public.get_driver_owned_trip('8b84f286-8ffa-429e-8ba9-1579480a0a8d');

SELECT seq, gate, expected_rows, actual_rows, (actual_rows = expected_rows) AS passed
FROM d1_identity_matrix
ORDER BY seq;
