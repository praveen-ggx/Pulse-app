-- READ ONLY identity for the browser trip.

SELECT
  t.id,
  t.trip_number,
  t.driver_id,
  t.organization_id,
  t.status,
  d.user_id AS driver_user_id,
  d.name AS driver_name
FROM public.trips t
LEFT JOIN public.drivers d ON d.id = t.driver_id
WHERE t.id = '8b84f286-8ffa-429e-8ba9-1579480a0a8d';
