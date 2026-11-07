-- Incident: DB Unhealthy, restart did not recover, kept flipping Unhealthy.
-- Root causes fixed here (see docs/DB_PERFORMANCE_HARDENING_CHECKLIST.md for background):
--   1. get_trips_for_org / market_indents_for_org: expensive CTEs/joins evaluated
--      for the WHOLE table before the org filter (or membership guard) narrows rows.
--      Rewritten to filter by organization_id up front so the planner can use the
--      existing organization_id indexes instead of scanning + joining every row.
--   2. authenticator role's idle_in_transaction_session_timeout (60s) and
--      statement_timeout (45s) were wide enough for these slow RPCs to pile up
--      connections during load instead of failing fast. Tightened.
--   3. Cron jobs (log-watcher-health every 1 min, log-watcher-main every 1 min,
--      detect-cron-startup-timeout-incident every 2 min, cron-health-alert /
--      reach_campaigns_pace every 10 min, ops_capture_slow_queries hourly,
--      monitor-watchdog every 15 min) were firing every 1-2 minutes and
--      themselves timing out ("job startup timeout") while Postgres was
--      saturated, adding load on top of the outage instead of just observing it.
--      Staggered/throttled so health-monitoring cron doesn't compete with
--      recovery when the instance is already under pressure.

-- ---------------------------------------------------------------------------
-- 1a. get_trips_for_org: filter trips by organization/supplier membership
--     BEFORE the DISTINCT ON + correlated EXISTS subqueries, not after.
-- ---------------------------------------------------------------------------
-- Fresh replay reaches this statement before trips.supplier_trip_sequence
-- (20261026000001) and before source_bid_id, owner_vehicle_id, operating_mode,
-- dco_payee_id, the warehouse/sales-order columns, and their tables. Postgres
-- validates this LANGUAGE sql body at creation, so omitting one column still
-- fails. Later migrations replace get_trips_for_org, so this statement runs
-- only when every named object already exists and is not reinstalled afterward.

DO $guard$
BEGIN
  IF to_regclass('public.sales_orders') IS NULL
     OR to_regclass('public.sales_order_lines') IS NULL
     OR to_regclass('public.shipment_allocations') IS NULL
     OR to_regclass('public.organization_member_warehouses') IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'trips'
         AND column_name IN (
           'supplier_trip_sequence', 'source_bid_id', 'owner_vehicle_id',
           'operating_mode', 'dco_payee_id'
         )
       HAVING count(*) = 5
     )
     OR NOT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'indents'
         AND column_name IN ('warehouse_id', 'sales_order_id', 'execution_plan_id')
       HAVING count(*) = 3
     )
  THEN
    RAISE NOTICE 'get_trips_for_org rewrite deferred: a column or table it selects does not exist yet';
    RETURN;
  END IF;

  EXECUTE $historical_function$
CREATE OR REPLACE FUNCTION public.get_trips_for_org(p_org_id uuid)
 RETURNS SETOF json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT row_to_json(q)
  FROM (
    SELECT DISTINCT ON (tr.id)
      CASE WHEN tr.organization_id = p_org_id THEN tr.client_price      END AS client_price,
      CASE WHEN tr.organization_id = p_org_id THEN tr.margin            END AS margin,
      CASE WHEN tr.organization_id = p_org_id THEN tr.platform_fee      END AS platform_fee,
      CASE WHEN tr.organization_id = p_org_id THEN tr.driver_commission END AS driver_commission,
      CASE WHEN tr.organization_id = p_org_id THEN tr.amount_paid       END AS amount_paid,
      CASE WHEN tr.organization_id = p_org_id THEN tr.payment_status    END AS payment_status,
      CASE WHEN tr.organization_id = p_org_id THEN tr.client_id         END AS client_id,

      tr.id,
      tr.organization_id,
      tr.trip_number,
      tr.source,
      tr.display_trip_id,
      tr.driver_display_trip_id,
      tr.trip_code,
      tr.trip_operational_code,
      tr.booking_ref,
      tr.sequence_number,

      tr.pickup_area,
      tr.drop_location,
      tr.distance,
      tr.estimated_duration,
      tr.pickup_lat,
      tr.pickup_lon,
      tr.drop_lat,
      tr.drop_lon,
      tr.load_type,
      tr.load_tons,
      tr.notes,

      tr.client_name,
      tr.supplier_id,
      tr.supplier_trip_sequence,

      tr.supplier_rate,
      tr.advance_paid,
      tr.is_guaranteed,
      tr.trip_payout_mode,
      tr.operating_mode,
      tr.dco_payee_id,

      tr.driver_id,
      tr.vehicle_id,
      tr.owner_vehicle_id,
      tr.driver_display_name,
      tr.vehicle_display_number,

      tr.status,
      tr.pickup_date,
      tr.started_at,
      tr.completed_at,
      tr.created_at,
      tr.updated_at,
      tr.deleted_at,
      tr.status_change_origin,
      tr.pod_received_at,
      tr.pod_required,

      tr.owner_user_id,
      tr.created_by_user_id,
      tr.assigned_by_user_id,

      tr.last_location_at,
      tr.last_location_chat_at,
      tr.actual_distance_traveled_km,
      tr.start_odometer_km,
      tr.end_odometer_km,
      tr.odometer_distance_km,
      tr.gps_distance_km,
      tr.distance_discrepancy_km,
      tr.distance_source,
      tr.odometer_verification_state,
      tr.odometer_notes,
      tr.odometer_updated_by,
      tr.odometer_updated_at,

      tr.indent_id,
      tr.source_indent_id,
      tr.source_indent_code,
      tr.indent_reference_code,
      tr.converted_from_indent_at,
      tr.converted_by,
      tr.source_bid_id,

      i.indent_number
    FROM public.trips tr
    LEFT JOIN public.indents i ON i.id = tr.indent_id
    WHERE public.is_org_member(p_org_id)
      -- Filter to the candidate trip set FIRST (index-backed on organization_id /
      -- supplier_id) so the planner narrows rows before evaluating the
      -- warehouse-visibility EXISTS below, instead of scanning the whole table.
      AND (
        tr.organization_id = p_org_id
        OR (
          tr.supplier_id IS NOT NULL
          AND tr.indent_id IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM public.suppliers s
            WHERE s.id = tr.supplier_id
              AND s.linked_organization_id = p_org_id
          )
          AND NOT EXISTS (
            SELECT 1 FROM public.trips m
            WHERE m.organization_id = p_org_id
              AND m.source = 'mover_asset'
              AND m.source_indent_id = tr.indent_id
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
                  AND (so.pickup_warehouse_id = omw.warehouse_id OR so.drop_warehouse_id = omw.warehouse_id)
              )
              OR (
                i.execution_plan_id IS NOT NULL
                AND EXISTS (
                  SELECT 1
                  FROM public.shipment_allocations sa
                  JOIN public.sales_order_lines sol ON sol.id = sa.sales_order_line_id
                  JOIN public.sales_orders so2 ON so2.id = sol.sales_order_id
                  WHERE sa.execution_plan_id = i.execution_plan_id
                    AND (so2.pickup_warehouse_id = omw.warehouse_id OR so2.drop_warehouse_id = omw.warehouse_id)
                )
              )
            )
        )
      )
    ORDER BY tr.id, tr.created_at DESC
  ) q
  ORDER BY q.created_at DESC
  LIMIT 400;
$function$;
  $historical_function$;
END
$guard$;

-- ---------------------------------------------------------------------------
-- 1b. market_indents_for_org: check org membership BEFORE building/UNIONing
--     the three candidate-indent CTEs, not after. As written, `guard` was only
--     applied in the final WHERE, so Postgres could still execute via_link /
--     via_award / via_reach (each with its own joins) for a caller who turns
--     out not to be a member at all.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.market_indents_for_org(org_id uuid)
 RETURNS TABLE(id uuid, organization_id uuid, indent_number text, pickup_area text, drop_location text, client_name text, client_price numeric, supplier_target numeric, status text, vehicle_type text, load_type text, pickup_date date, circulation_target text, created_at timestamp with time zone, updated_at timestamp with time zone, creator_organization_name text, assigned_supplier_id uuid, assigned_supplier_rate numeric, weight numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Short-circuit before running any of the (expensive, multi-join) candidate
  -- CTEs below — a non-member gets zero rows without touching indents/suppliers/
  -- clients/reach_campaign_targets at all.
  IF NOT public.is_org_staff(org_id) THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH
  raw_relations AS (
    SELECT r.from_organization_id AS shipper_org_id, r.created_at AS link_since
    FROM public.organization_relations r
    WHERE r.to_organization_id = org_id
      AND r.relation_type = 'client_supplier'
      AND r.status = 'active'
    UNION ALL
    SELECT r.to_organization_id AS shipper_org_id, r.created_at AS link_since
    FROM public.organization_relations r
    WHERE r.from_organization_id = org_id
      AND r.relation_type = 'supplier_client'
      AND r.status = 'active'
  ),
  partner_links AS (
    SELECT shipper_org_id, MIN(link_since) AS link_since
    FROM raw_relations
    GROUP BY shipper_org_id
  ),
  fallback_links AS (
    SELECT s.organization_id AS shipper_org_id, MIN(s.updated_at) AS link_since
    FROM public.suppliers s
    WHERE s.linked_organization_id = org_id
      AND s.organization_id IS NOT NULL
      AND s.organization_id <> org_id
    GROUP BY s.organization_id
  ),
  client_org_links AS (
    SELECT c.linked_organization_id AS shipper_org_id, MIN(c.created_at) AS link_since
    FROM public.clients c
    WHERE c.organization_id = org_id
      AND c.status = 'active'
      AND c.linked_organization_id IS NOT NULL
      AND c.linked_organization_id <> org_id
    GROUP BY c.linked_organization_id
  ),
  effective_links AS (
    SELECT pl.shipper_org_id, pl.link_since
    FROM partner_links pl
    UNION ALL
    SELECT fl.shipper_org_id, fl.link_since
    FROM fallback_links fl
    WHERE NOT EXISTS (
      SELECT 1 FROM partner_links pl2
      WHERE pl2.shipper_org_id = fl.shipper_org_id
    )
    UNION ALL
    SELECT clo.shipper_org_id, clo.link_since
    FROM client_org_links clo
    WHERE NOT EXISTS (
      SELECT 1 FROM partner_links pl2
      WHERE pl2.shipper_org_id = clo.shipper_org_id
    )
      AND NOT EXISTS (
        SELECT 1 FROM fallback_links fl2
        WHERE fl2.shipper_org_id = clo.shipper_org_id
      )
  ),
  via_link AS (
    SELECT
      i.id,
      i.organization_id,
      i.indent_number,
      i.pickup_area,
      i.drop_location,
      i.client_name,
      i.client_price,
      i.supplier_target,
      i.status,
      i.vehicle_type,
      i.load_type,
      i.pickup_date,
      i.circulation_target,
      i.created_at,
      i.updated_at,
      o.name::text AS creator_organization_name,
      i.assigned_supplier_id,
      i.assigned_supplier_rate,
      i.weight
    FROM public.indents i
    JOIN public.organizations o ON o.id = i.organization_id
    JOIN effective_links e ON e.shipper_org_id = i.organization_id
      AND i.created_at >= e.link_since
    WHERE i.deleted_at IS NULL
      AND (
        i.circulation_target IS NULL
        OR i.circulation_target IN ('integrated_supplier', 'both')
      )
      AND i.status <> 'draft'
  ),
  via_award AS (
    SELECT
      i.id,
      i.organization_id,
      i.indent_number,
      i.pickup_area,
      i.drop_location,
      i.client_name,
      i.client_price,
      i.supplier_target,
      i.status,
      i.vehicle_type,
      i.load_type,
      i.pickup_date,
      i.circulation_target,
      i.created_at,
      i.updated_at,
      o.name::text AS creator_organization_name,
      i.assigned_supplier_id,
      i.assigned_supplier_rate,
      i.weight
    FROM public.indents i
    JOIN public.organizations o ON o.id = i.organization_id
    WHERE i.deleted_at IS NULL
      AND i.status <> 'draft'
      AND i.organization_id <> org_id
      AND (
        i.assigned_supplier_id = org_id
        OR EXISTS (
          SELECT 1
          FROM public.direct_quotes dq
          WHERE dq.indent_id = i.id
            AND dq.bidder_organization_id = org_id
            AND dq.status = 'accepted'
        )
      )
  ),
  via_reach AS (
    SELECT
      i.id,
      i.organization_id,
      i.indent_number,
      i.pickup_area,
      i.drop_location,
      i.client_name,
      i.client_price,
      i.supplier_target,
      i.status,
      i.vehicle_type,
      i.load_type,
      i.pickup_date,
      i.circulation_target,
      i.created_at,
      i.updated_at,
      o.name::text AS creator_organization_name,
      i.assigned_supplier_id,
      i.assigned_supplier_rate,
      i.weight
    FROM public.reach_campaign_targets t
    JOIN public.reach_campaigns c ON c.id = t.campaign_id
    JOIN public.indents i
      ON i.id = COALESCE(
        c.snapshot_source_indent_id,
        (SELECT p.source_indent_id FROM public.posts p WHERE p.id = c.post_id)
      )
    JOIN public.organizations o ON o.id = i.organization_id
    WHERE t.org_id = org_id
      AND t.released_at IS NOT NULL
      AND c.archived_at IS NULL
      AND i.deleted_at IS NULL
      AND i.status <> 'draft'
      AND i.organization_id <> org_id
      AND (
        (c.status = 'active' AND (c.expires_at IS NULL OR c.expires_at > now()))
        OR EXISTS (
          SELECT 1
          FROM public.direct_quotes dq
          WHERE dq.indent_id = i.id
            AND dq.bidder_organization_id = org_id
        )
      )
  )
  SELECT * FROM via_link
  UNION
  SELECT * FROM via_award
  UNION
  SELECT * FROM via_reach
  ORDER BY created_at DESC;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 2. Tighten authenticator role timeouts. This role is the pooler auth path
--    PostgREST connects through, and its idle_in_transaction_session_timeout
--    (60s) / statement_timeout (45s) were both wide enough to let the slow
--    RPCs above pile up holding connections during the incident window
--    (matches 57P03/23-count and 25P03/5-count in the log dump) instead of
--    failing fast and freeing the connection back to the pool.
-- ---------------------------------------------------------------------------
ALTER ROLE authenticator SET statement_timeout = '20s';
ALTER ROLE authenticator SET idle_in_transaction_session_timeout = '15s';

-- ---------------------------------------------------------------------------
-- 3. Stagger/throttle non-critical health-monitoring cron so it stops adding
--    load during an incident. log-watcher-health and log-watcher-main both ran
--    every 1 minute; detect-cron-startup-timeout-incident every 2 minutes;
--    cron-health-alert and reach_campaigns_pace every 10 minutes but on the
--    SAME offset, meaning they all queued at once and competed for the same
--    saturated connection pool ("job startup timeout" on jobs 2, 6, 9, 11, 15,
--    17, 18 in the incident window). Spread them out and drop frequency on the
--    two that don't need minute-level resolution.
-- ---------------------------------------------------------------------------

-- log-watcher-health: 1 min -> 5 min. A health snapshot does not need to be
-- fresher than 5 minutes, and it was competing with recovery every single
-- minute of the outage.
SELECT cron.alter_job(
  (SELECT jobid FROM cron.job WHERE jobname = 'log-watcher-health'),
  schedule => '*/5 * * * *'
);

-- log-watcher-main: 1 min -> 2 min, offset by 1 minute from log-watcher-health
-- so they do not both fire in the same tick.
SELECT cron.alter_job(
  (SELECT jobid FROM cron.job WHERE jobname = 'log-watcher-main'),
  schedule => '1-59/2 * * * *'
);

-- detect-cron-startup-timeout-incident: 2 min -> 5 min, offset by 2 minutes.
-- Detecting cron startup timeouts every 2 minutes just adds another job that
-- itself times out during the outage; 5 minutes is enough to catch and alert.
SELECT cron.alter_job(
  (SELECT jobid FROM cron.job WHERE jobname = 'detect-cron-startup-timeout-incident'),
  schedule => '2-59/5 * * * *'
);

-- cron-health-alert: keep at 10 min but offset by 3 minutes from the reach
-- jobs below so they stop stacking on the exact same tick.
-- A fresh database has no such job. Do not create one; only reschedule it
-- where it already exists.
DO $$
DECLARE
  v_job_id bigint;
BEGIN
  SELECT jobid INTO v_job_id
  FROM cron.job
  WHERE jobname = 'cron-health-alert';

  IF v_job_id IS NOT NULL THEN
    PERFORM cron.alter_job(
      v_job_id,
      schedule => '3-59/10 * * * *'
    );
  END IF;
END $$;

-- reach_campaigns_pace: not an incident-response job — it is marketing
-- campaign pacing. Move off the :00/:10/:20... offset shared with
-- cron-health-alert so the two stop colliding.
DO $$
DECLARE
  v_job_id bigint;
BEGIN
  SELECT jobid INTO v_job_id
  FROM cron.job
  WHERE jobname = 'reach_campaigns_pace';

  IF v_job_id IS NOT NULL THEN
    PERFORM cron.alter_job(
      v_job_id,
      schedule => '7-59/10 * * * *'
    );
  END IF;
END $$;

-- monitor-watchdog: 15 min, offset by 4 minutes.
DO $$
DECLARE
  v_job_id bigint;
BEGIN
  SELECT jobid INTO v_job_id
  FROM cron.job
  WHERE jobname = 'monitor-watchdog';

  IF v_job_id IS NOT NULL THEN
    PERFORM cron.alter_job(
      v_job_id,
      schedule => '4-59/15 * * * *'
    );
  END IF;
END $$;

-- ops_capture_slow_queries: hourly is fine, but move off the top of the hour
-- (:00) where it was colliding with every other job's shared minute-0 tick.
DO $$
DECLARE
  v_job_id bigint;
BEGIN
  SELECT jobid INTO v_job_id
  FROM cron.job
  WHERE jobname = 'ops_capture_slow_queries';

  IF v_job_id IS NOT NULL THEN
    PERFORM cron.alter_job(
      v_job_id,
      schedule => '6 * * * *'
    );
  END IF;
END $$;
