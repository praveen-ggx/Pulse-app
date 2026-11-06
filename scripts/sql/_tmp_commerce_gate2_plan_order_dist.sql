SELECT
  sa.execution_plan_id,
  COUNT(DISTINCT sol.sales_order_id) AS order_count,
  COUNT(DISTINCT sa.pickup_stop_id) + COUNT(DISTINCT sa.drop_stop_id) AS stop_id_mentions,
  COUNT(*) AS allocation_rows
FROM public.shipment_allocations sa
JOIN public.sales_order_lines sol ON sol.id = sa.sales_order_line_id
GROUP BY sa.execution_plan_id
ORDER BY order_count DESC, allocation_rows DESC
LIMIT 15;
