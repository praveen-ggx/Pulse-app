SELECT
  t.id AS trip_id,
  t.status,
  COALESCE(
    public.driver_owned_indent_execution_plan_id(t.indent_id),
    (SELECT i.execution_plan_id FROM public.indents i WHERE i.id = t.source_indent_id)
  ) AS execution_plan_id,
  (
    SELECT COUNT(DISTINCT sol.sales_order_id)
    FROM public.shipment_allocations sa
    JOIN public.sales_order_lines sol ON sol.id = sa.sales_order_line_id
    WHERE sa.execution_plan_id = COALESCE(
      (SELECT i.execution_plan_id FROM public.indents i WHERE i.id = t.indent_id),
      (SELECT i.execution_plan_id FROM public.indents i WHERE i.id = t.source_indent_id)
    )
  ) AS order_count,
  (SELECT COUNT(*) FROM public.stop_execution_state ses WHERE ses.trip_id = t.id) AS ses_stop_count
FROM public.trips t
WHERE t.indent_id IS NOT NULL OR t.source_indent_id IS NOT NULL
ORDER BY order_count DESC NULLS LAST
LIMIT 20;
