SELECT current_user, session_user, current_setting('role', true) AS role_setting;

SELECT
  t.id AS trip_id,
  t.trip_number,
  t.status,
  t.driver_id,
  d.user_id AS driver_user_id,
  t.indent_id,
  t.source_indent_id,
  i.execution_plan_id AS indent_plan_id,
  si.execution_plan_id AS source_indent_plan_id,
  (i.execution_plan_id IS NOT NULL) AS indent_has_plan,
  (si.execution_plan_id IS NOT NULL) AS source_indent_has_plan
FROM public.trips t
LEFT JOIN public.drivers d ON d.id = t.driver_id
LEFT JOIN public.indents i ON i.id = t.indent_id
LEFT JOIN public.indents si ON si.id = t.source_indent_id
WHERE t.id IN (
  '3f333e5b-1256-4208-acee-7de3bc305f0b'::uuid,
  '3ed5a3df-97be-4c97-a13a-63092b6139ff'::uuid,
  'f1ae74c8-1ad9-4dcf-baeb-0cd8337166cd'::uuid
);
