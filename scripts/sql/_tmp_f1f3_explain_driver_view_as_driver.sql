-- READ ONLY: driver-role EXPLAIN of trips_driver_view PK.

BEGIN;
SELECT set_config('request.jwt.claim.sub', '6e31cf96-d1ca-4bf7-87ca-1cba63c563a5', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"6e31cf96-d1ca-4bf7-87ca-1cba63c563a5","role":"authenticated"}',
  true
);
SET LOCAL ROLE authenticated;
SET LOCAL statement_timeout = '20s';

EXPLAIN (ANALYZE, BUFFERS, TIMING, FORMAT TEXT)
SELECT *
FROM public.trips_driver_view
WHERE id = '8b84f286-8ffa-429e-8ba9-1579480a0a8d';

ROLLBACK;
