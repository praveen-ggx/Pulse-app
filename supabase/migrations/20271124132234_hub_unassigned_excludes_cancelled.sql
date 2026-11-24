-- Unassigned no longer counts cancelled trips (Vasanth's decision, Nov 2026).
-- Unassigned = not delivered, not cancelled, and (no driver or draft).
-- Cancelled trips stay in the Cancelled bucket only.
-- count_org_hub_metrics is replaced with only those two predicates changed.
-- hub_tile_match (Unassigned tile page) gets the same rule where it exists.
-- hub_metric_contrib is not changed: its projection trigger is not enabled
-- and nothing in the app reads hub_metric_counter.

SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.count_org_hub_metrics(p_org_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET plan_cache_mode TO 'force_custom_plan'
 SET max_parallel_workers_per_gather TO '0'
 SET random_page_cost TO '1.1'
AS $function$
DECLARE
  v_ground_ops boolean;
BEGIN
  IF p_org_id IS NULL OR NOT public.is_org_member(p_org_id) THEN
    RETURN NULL;
  END IF;

  v_ground_ops := EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = p_org_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
      AND COALESCE(om.permissions ->> 'platformRole', '') = 'ground_ops'
  );

  IF v_ground_ops THEN
  RETURN (
    WITH visible_trips AS NOT MATERIALIZED (
      SELECT t.id, t.status, t.driver_id, t.indent_id
      FROM public.trips t
      LEFT JOIN public.indents i ON i.id = t.indent_id
      WHERE (
          t.organization_id = p_org_id
          OR (
            t.supplier_id IS NOT NULL
            AND t.indent_id IS NOT NULL
            AND EXISTS (
              SELECT 1 FROM public.suppliers s
              WHERE s.id = t.supplier_id
                AND s.linked_organization_id = p_org_id
            )
            AND NOT EXISTS (
              SELECT 1 FROM public.trips m
              WHERE m.organization_id = p_org_id
                AND m.source = 'mover_asset'
                AND m.source_indent_id = t.indent_id
                AND m.deleted_at IS NULL
            )
          )
        )
        AND (
          NOT EXISTS (
            SELECT 1 FROM public.organization_members om
            WHERE om.organization_id = p_org_id
              AND om.user_id = (SELECT auth.uid())
              AND om.status = 'active'
              AND COALESCE(om.permissions ->> 'platformRole', '') = 'ground_ops'
          )
          OR EXISTS (
            SELECT 1
            FROM public.organization_members om3
            JOIN public.organization_member_warehouses omw
              ON omw.organization_member_id = om3.id
            WHERE om3.organization_id = p_org_id
              AND om3.user_id = (SELECT auth.uid())
              AND om3.status = 'active'
              AND (
                i.warehouse_id = omw.warehouse_id
                OR EXISTS (
                  SELECT 1 FROM public.sales_orders so
                  WHERE so.id = i.sales_order_id
                    AND (so.pickup_warehouse_id = omw.warehouse_id
                      OR so.drop_warehouse_id = omw.warehouse_id)
                )
                OR (
                  i.execution_plan_id IS NOT NULL
                  AND EXISTS (
                    SELECT 1
                    FROM public.shipment_allocations sa
                    JOIN public.sales_order_lines sol ON sol.id = sa.sales_order_line_id
                    JOIN public.sales_orders so2 ON so2.id = sol.sales_order_id
                    WHERE sa.execution_plan_id = i.execution_plan_id
                      AND (so2.pickup_warehouse_id = omw.warehouse_id
                        OR so2.drop_warehouse_id = omw.warehouse_id)
                  )
                )
              )
            )
        )
    ),
    visible_indents AS (
      SELECT i.id, i.status, i.cancel_reason
      FROM public.indents i
      WHERE i.organization_id = p_org_id
        AND i.deleted_at IS NULL
        AND (
          NOT EXISTS (
            SELECT 1 FROM public.organization_members om
            WHERE om.organization_id = p_org_id
              AND om.user_id = (SELECT auth.uid())
              AND om.status = 'active'
              AND COALESCE(om.permissions ->> 'platformRole', '') = 'ground_ops'
          )
          OR EXISTS (
            SELECT 1
            FROM public.organization_members om3
            JOIN public.organization_member_warehouses omw
              ON omw.organization_member_id = om3.id
            WHERE om3.organization_id = p_org_id
              AND om3.user_id = (SELECT auth.uid())
              AND om3.status = 'active'
              AND (
                i.warehouse_id = omw.warehouse_id
                OR EXISTS (
                  SELECT 1 FROM public.sales_orders so
                  WHERE so.id = i.sales_order_id
                    AND (so.pickup_warehouse_id = omw.warehouse_id
                      OR so.drop_warehouse_id = omw.warehouse_id)
                )
                OR (
                  i.execution_plan_id IS NOT NULL
                  AND EXISTS (
                    SELECT 1
                    FROM public.shipment_allocations sa
                    JOIN public.sales_order_lines sol ON sol.id = sa.sales_order_line_id
                    JOIN public.sales_orders so2 ON so2.id = sol.sales_order_id
                    WHERE sa.execution_plan_id = i.execution_plan_id
                      AND (so2.pickup_warehouse_id = omw.warehouse_id
                        OR so2.drop_warehouse_id = omw.warehouse_id)
                  )
                )
              )
            )
        )
    ),
    trip_counts AS (
      SELECT
        count(*)::int AS trips_total,
        count(*) FILTER (
          WHERE lower(coalesce(t.status, '')) IN ('completed', 'delivered', 'done')
        )::int AS trips_completed,
        count(*) FILTER (
          WHERE lower(coalesce(t.status, '')) = 'cancelled'
        )::int AS trips_cancelled,
        count(*) FILTER (
          WHERE lower(coalesce(t.status, '')) NOT IN ('completed', 'delivered', 'done', 'cancelled')
        )::int AS trips_active,
        count(*) FILTER (
          WHERE lower(coalesce(t.status, '')) NOT IN ('completed', 'delivered', 'done', 'cancelled')
            AND (
              t.driver_id IS NULL
              OR btrim(t.driver_id::text) = ''
              OR lower(coalesce(t.status, '')) = 'draft'
            )
        )::int AS unassigned,
        count(*) FILTER (
          WHERE t.driver_id IS NOT NULL
            AND btrim(t.driver_id::text) <> ''
            AND lower(coalesce(t.status, '')) = 'assigned'
        )::int AS assigned,
        count(*) FILTER (
          WHERE t.driver_id IS NOT NULL
            AND btrim(t.driver_id::text) <> ''
            AND lower(coalesce(t.status, '')) IN ('picked_up', 'pickup', 'in_progress')
        )::int AS loading,
        count(*) FILTER (
          WHERE t.driver_id IS NOT NULL
            AND btrim(t.driver_id::text) <> ''
            AND lower(coalesce(t.status, '')) IN ('in_transit', 'dispatched', 'transit')
        )::int AS in_transit,
        count(*) FILTER (
          WHERE t.driver_id IS NOT NULL
            AND btrim(t.driver_id::text) <> ''
            AND lower(coalesce(t.status, '')) IN ('unloading', 'arrived', 'at_destination', 'at_drop')
            AND NOT EXISTS (
              SELECT 1 FROM public.trip_documents d WHERE d.trip_id = t.id
            )
        )::int AS unloading,
        count(*) FILTER (
          WHERE t.driver_id IS NOT NULL
            AND btrim(t.driver_id::text) <> ''
            AND lower(coalesce(t.status, '')) IN ('unloading', 'arrived', 'at_destination', 'at_drop')
            AND EXISTS (
              SELECT 1 FROM public.trip_documents d WHERE d.trip_id = t.id
            )
        )::int AS delivered_docs_pending
      FROM visible_trips t
    ),
    indent_counts AS (
      SELECT
        count(*) FILTER (
          WHERE lower(coalesce(i.status, '')) NOT IN ('completed', 'cancelled', 'closed', 'expired')
            AND NOT EXISTS (
              SELECT 1 FROM visible_trips t WHERE t.indent_id = i.id
            )
        )::int AS indent_unallocated,
        count(*) FILTER (
          WHERE lower(coalesce(i.status, '')) IN ('cancelled', 'expired')
        )::int AS indent_failed,
        -- Fail reasons only for cancelled/expired. Leftover cancel_reason on
        -- awarded/open must not inflate Failed sub-chips.
        count(*) FILTER (
          WHERE lower(coalesce(i.status, '')) IN ('cancelled', 'expired')
            AND i.cancel_reason = 'client_cancelled'
        )::int AS fail_client_cancelled,
        count(*) FILTER (
          WHERE lower(coalesce(i.status, '')) IN ('cancelled', 'expired')
            AND (
              i.cancel_reason = 'indent_expired'
              OR (
                lower(coalesce(i.status, '')) = 'expired'
                AND coalesce(i.cancel_reason, '') NOT IN (
                  'client_cancelled', 'no_rates_available', 'wrong_entry'
                )
              )
            )
        )::int AS fail_indent_expired,
        count(*) FILTER (
          WHERE lower(coalesce(i.status, '')) IN ('cancelled', 'expired')
            AND i.cancel_reason = 'no_rates_available'
        )::int AS fail_no_rates_available,
        count(*) FILTER (
          WHERE lower(coalesce(i.status, '')) IN ('cancelled', 'expired')
            AND i.cancel_reason = 'wrong_entry'
        )::int AS fail_wrong_entry
      FROM visible_indents i
    )
    SELECT jsonb_build_object(
      'trips_total', tc.trips_total,
      'trips_completed', tc.trips_completed,
      'trips_cancelled', tc.trips_cancelled,
      'trips_active', tc.trips_active,
      'unassigned', tc.unassigned,
      'assigned', tc.assigned,
      'loading', tc.loading,
      'in_transit', tc.in_transit,
      'unloading', tc.unloading,
      'delivered_docs_pending', tc.delivered_docs_pending,
      'indent_unallocated', ic.indent_unallocated,
      'indent_failed', ic.indent_failed,
      'fail_client_cancelled', ic.fail_client_cancelled,
      'fail_indent_expired', ic.fail_indent_expired,
      'fail_no_rates_available', ic.fail_no_rates_available,
      'fail_wrong_entry', ic.fail_wrong_entry
    )
    FROM trip_counts tc, indent_counts ic
  );

  END IF;

  RETURN (
    WITH grouped AS (
      SELECT lower(coalesce(t.status, '')) AS st,
             (t.driver_id IS NOT NULL AND btrim(t.driver_id::text) <> '') AS has_driver,
             count(*)::bigint AS n
      FROM public.trips t
      WHERE t.organization_id = p_org_id
      GROUP BY 1, 2
      UNION ALL
      SELECT lower(coalesce(t.status, '')),
             (t.driver_id IS NOT NULL AND btrim(t.driver_id::text) <> ''),
             count(*)::bigint
      FROM public.trips t
      WHERE t.organization_id IS DISTINCT FROM p_org_id
        AND t.supplier_id IS NOT NULL
        AND t.indent_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.suppliers s
          WHERE s.id = t.supplier_id AND s.linked_organization_id = p_org_id
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.trips m
          WHERE m.organization_id = p_org_id
            AND m.source = 'mover_asset'
            AND m.source_indent_id = t.indent_id
            AND m.deleted_at IS NULL
        )
      GROUP BY 1, 2
    ),
    trip_counts AS (
      SELECT
        coalesce(sum(n), 0)::int AS trips_total,
        coalesce(sum(n) FILTER (WHERE st IN ('completed', 'delivered', 'done')), 0)::int AS trips_completed,
        coalesce(sum(n) FILTER (WHERE st = 'cancelled'), 0)::int AS trips_cancelled,
        coalesce(sum(n) FILTER (WHERE st NOT IN ('completed', 'delivered', 'done', 'cancelled')), 0)::int AS trips_active,
        coalesce(sum(n) FILTER (
          WHERE st NOT IN ('completed', 'delivered', 'done', 'cancelled')
            AND (NOT has_driver OR st = 'draft')
        ), 0)::int AS unassigned,
        coalesce(sum(n) FILTER (WHERE has_driver AND st = 'assigned'), 0)::int AS assigned,
        coalesce(sum(n) FILTER (WHERE has_driver AND st IN ('picked_up', 'pickup', 'in_progress')), 0)::int AS loading,
        coalesce(sum(n) FILTER (WHERE has_driver AND st IN ('in_transit', 'dispatched', 'transit')), 0)::int AS in_transit,
        0::int AS unloading,
        0::int AS delivered_docs_pending
      FROM grouped
    ),
    indent_counts AS (
      SELECT
        count(*) FILTER (
          WHERE lower(coalesce(i.status, '')) NOT IN ('completed', 'cancelled', 'closed', 'expired')
            AND NOT EXISTS (
              SELECT 1 FROM public.trips t
              WHERE t.indent_id = i.id
                AND (
                  t.organization_id = p_org_id
                  OR (
                    t.supplier_id IS NOT NULL AND t.indent_id IS NOT NULL
                    AND EXISTS (
                      SELECT 1 FROM public.suppliers s
                      WHERE s.id = t.supplier_id AND s.linked_organization_id = p_org_id
                    )
                  )
                )
            )
        )::int AS indent_unallocated,
        count(*) FILTER (WHERE lower(coalesce(i.status, '')) IN ('cancelled', 'expired'))::int AS indent_failed,
        count(*) FILTER (
          WHERE lower(coalesce(i.status, '')) IN ('cancelled', 'expired') AND i.cancel_reason = 'client_cancelled'
        )::int AS fail_client_cancelled,
        count(*) FILTER (
          WHERE lower(coalesce(i.status, '')) IN ('cancelled', 'expired')
            AND (
              i.cancel_reason = 'indent_expired'
              OR (
                lower(coalesce(i.status, '')) = 'expired'
                AND coalesce(i.cancel_reason, '') NOT IN ('client_cancelled', 'no_rates_available', 'wrong_entry')
              )
            )
        )::int AS fail_indent_expired,
        count(*) FILTER (
          WHERE lower(coalesce(i.status, '')) IN ('cancelled', 'expired') AND i.cancel_reason = 'no_rates_available'
        )::int AS fail_no_rates_available,
        count(*) FILTER (
          WHERE lower(coalesce(i.status, '')) IN ('cancelled', 'expired') AND i.cancel_reason = 'wrong_entry'
        )::int AS fail_wrong_entry
      FROM public.indents i
      WHERE i.organization_id = p_org_id AND i.deleted_at IS NULL
    )
    SELECT jsonb_build_object(
      'trips_total', tc.trips_total,
      'trips_completed', tc.trips_completed,
      'trips_cancelled', tc.trips_cancelled,
      'trips_active', tc.trips_active,
      'unassigned', tc.unassigned,
      'assigned', tc.assigned,
      'loading', tc.loading,
      'in_transit', tc.in_transit,
      'unloading', (
        SELECT count(*)::int FROM public.trips t
        WHERE t.organization_id = p_org_id
          AND t.driver_id IS NOT NULL AND btrim(t.driver_id::text) <> ''
          AND lower(coalesce(t.status, '')) IN ('unloading', 'arrived', 'at_destination', 'at_drop')
          AND NOT EXISTS (SELECT 1 FROM public.trip_documents d WHERE d.trip_id = t.id)
      ) + (
        SELECT count(*)::int FROM public.trips t
        WHERE t.organization_id IS DISTINCT FROM p_org_id
          AND t.supplier_id IS NOT NULL AND t.indent_id IS NOT NULL
          AND EXISTS (SELECT 1 FROM public.suppliers s WHERE s.id = t.supplier_id AND s.linked_organization_id = p_org_id)
          AND t.driver_id IS NOT NULL AND btrim(t.driver_id::text) <> ''
          AND lower(coalesce(t.status, '')) IN ('unloading', 'arrived', 'at_destination', 'at_drop')
          AND NOT EXISTS (SELECT 1 FROM public.trip_documents d WHERE d.trip_id = t.id)
      ),
      'delivered_docs_pending', (
        SELECT count(*)::int FROM public.trips t
        WHERE t.organization_id = p_org_id
          AND t.driver_id IS NOT NULL AND btrim(t.driver_id::text) <> ''
          AND lower(coalesce(t.status, '')) IN ('unloading', 'arrived', 'at_destination', 'at_drop')
          AND EXISTS (SELECT 1 FROM public.trip_documents d WHERE d.trip_id = t.id)
      ) + (
        SELECT count(*)::int FROM public.trips t
        WHERE t.organization_id IS DISTINCT FROM p_org_id
          AND t.supplier_id IS NOT NULL AND t.indent_id IS NOT NULL
          AND EXISTS (SELECT 1 FROM public.suppliers s WHERE s.id = t.supplier_id AND s.linked_organization_id = p_org_id)
          AND t.driver_id IS NOT NULL AND btrim(t.driver_id::text) <> ''
          AND lower(coalesce(t.status, '')) IN ('unloading', 'arrived', 'at_destination', 'at_drop')
          AND EXISTS (SELECT 1 FROM public.trip_documents d WHERE d.trip_id = t.id)
      ),
      'indent_unallocated', ic.indent_unallocated,
      'indent_failed', ic.indent_failed,
      'fail_client_cancelled', ic.fail_client_cancelled,
      'fail_indent_expired', ic.fail_indent_expired,
      'fail_no_rates_available', ic.fail_no_rates_available,
      'fail_wrong_entry', ic.fail_wrong_entry
    )
    FROM trip_counts tc, indent_counts ic
  );
END;
$function$
;

DO $do$
DECLARE
  v_def text;
BEGIN
  IF to_regprocedure('public.hub_tile_match(text,boolean,text)') IS NULL THEN
    RETURN;
  END IF;
  v_def := pg_get_functiondef('public.hub_tile_match(text,boolean,text)'::regprocedure);
  v_def := replace(
    v_def,
    $$WHEN 'unassigned' THEN lower(coalesce(p_status, '')) NOT IN ('completed', 'delivered', 'done')$$,
    $$WHEN 'unassigned' THEN lower(coalesce(p_status, '')) NOT IN ('completed', 'delivered', 'done', 'cancelled')$$
  );
  v_def := replace(
    v_def,
    $$OR lower(coalesce(p_status, '')) IN ('cancelled', 'draft')$$,
    $$OR lower(coalesce(p_status, '')) = 'draft'$$
  );
  IF v_def LIKE '%''cancelled'', ''draft''%' THEN
    RAISE EXCEPTION 'hub_tile_match rewrite did not apply';
  END IF;
  EXECUTE v_def;
END
$do$;
