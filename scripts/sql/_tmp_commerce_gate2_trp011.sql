SELECT
  t.id,
  t.trip_number,
  t.status,
  t.indent_id,
  t.source_indent_id,
  i.execution_plan_id AS indent_plan_id,
  si.execution_plan_id AS source_indent_plan_id,
  (SELECT count(*) FROM public.stop_execution_state ses WHERE ses.trip_id = t.id) AS ses_rows
FROM public.trips t
LEFT JOIN public.indents i ON i.id = t.indent_id
LEFT JOIN public.indents si ON si.id = t.source_indent_id
WHERE t.trip_number IN ('TRP011', 'TRP047', 'TRP049', 'TRP051');
