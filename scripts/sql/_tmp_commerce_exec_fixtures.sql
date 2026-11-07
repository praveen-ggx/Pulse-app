-- Read-only fixture hunt. No writes. Not a migration.
SELECT
  t.id AS trip_id,
  t.status,
  i.execution_plan_id,
  (
    SELECT COUNT(DISTINCT sol.sales_order_id)
    FROM public.shipment_allocations sa
    JOIN public.sales_order_lines sol ON sol.id = sa.sales_order_line_id
    WHERE sa.execution_plan_id = i.execution_plan_id
  ) AS order_count,
  (
    SELECT COUNT(*)
    FROM public.stop_execution_state ses
    WHERE ses.trip_id = t.id
  ) AS ses_stop_count
FROM public.trips t
JOIN public.indents i ON i.id = t.indent_id
WHERE i.execution_plan_id IS NOT NULL
ORDER BY order_count, ses_stop_count, t.updated_at DESC
LIMIT 40;
