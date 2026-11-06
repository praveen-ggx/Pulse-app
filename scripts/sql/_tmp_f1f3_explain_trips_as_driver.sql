-- READ ONLY: driver-role EXPLAIN of trips PK vs trips_driver_view PK.
-- Driver user from TRP001/TRP031: 6e31cf96-d1ca-4bf7-87ca-1cba63c563a5
-- Do not persist any data.

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

EXPLAIN (ANALYZE, BUFFERS, COSTS, TIMING, FORMAT TEXT)
SELECT *
FROM public.trips
WHERE id = '8b84f286-8ffa-429e-8ba9-1579480a0a8d';

ROLLBACK;
