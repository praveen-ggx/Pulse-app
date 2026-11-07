SELECT
  t.id AS trip_id,
  t.trip_number,
  t.status,
  t.driver_id,
  d.user_id AS driver_user_id,
  (SELECT count(*) FROM public.stop_execution_state ses WHERE ses.trip_id = t.id) AS ses_rows
FROM public.trips t
LEFT JOIN public.drivers d ON d.id = t.driver_id
LEFT JOIN public.indents i ON i.id = t.indent_id
LEFT JOIN public.indents si ON si.id = t.source_indent_id
WHERE i.execution_plan_id = '9c9bf109-68ee-408b-a874-16cdb22fe8c0'::uuid
   OR si.execution_plan_id = '9c9bf109-68ee-408b-a874-16cdb22fe8c0'::uuid;
