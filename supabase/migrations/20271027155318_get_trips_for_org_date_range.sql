-- Dated hub pills need trips older than the newest-400 catalog.
--
-- Date semantics (matches lib/dateRangePresets.tripDayMatchesHubDateFilter):
--   a trip is in range if pickup_date is in [p_from, p_to]
--   OR the Asia/Kolkata calendar day of created_at is in [p_from, p_to].
--   Not pickup-only. Not created-only.
--
-- Caps (do not treat dated mode as unlimited):
--   p_from/p_to null: newest 400 + optional Compliance backlog (live behavior).
--   both set: matching rows newest-first, safety cap 2000.
--   2000 is the existing dated-draft bound, not a new arbitrary limit.
--
-- Replacement safety: this file is one transaction (Supabase wraps migrations).
-- DROP of the live 2-arg identity rolls back if CREATE fails, so the function
-- cannot stay absent. After apply, verify PostgREST sees the 4-arg identity:
--   select pg_get_function_identity_arguments(p.oid)
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public' and p.proname = 'get_trips_for_org';
-- expect: p_org_id uuid, p_include_compliance_backlog boolean, p_from date, p_to date
--
-- Visibility, grants, and backlog rules are unchanged from 20271013113000.
-- 2-arg / p_org_id-only callers still bind (new args default null).

SET LOCAL lock_timeout = '5s';

DROP FUNCTION IF EXISTS public.get_trips_for_org(uuid, boolean);

create function public.get_trips_for_org(
  p_org_id uuid,
  p_include_compliance_backlog boolean default false,
  p_from date default null,
  p_to date default null
)
 RETURNS SETOF json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT r.j
  FROM (
    SELECT row_to_json(q) AS j,
           q.id,
           q.created_at,
           row_number() OVER (ORDER BY q.created_at DESC) AS rn
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
        p_from IS NULL
        OR p_to IS NULL
        OR tr.pickup_date BETWEEN p_from AND p_to
        OR (timezone('Asia/Kolkata', tr.created_at))::date BETWEEN p_from AND p_to
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
  ) r
  WHERE (
          p_from IS NOT NULL
          AND p_to IS NOT NULL
          AND r.rn <= 2000
        )
     OR r.rn <= 400
     OR (
       p_include_compliance_backlog
       AND EXISTS (
         SELECT 1 FROM public.trips t
         WHERE t.id = r.id
           AND t.deleted_at IS NULL
           AND (
             t.compliance_verified_at IS NOT NULL
             OR t.compliance_declined_at IS NOT NULL
             OR t.finance_verified_at IS NOT NULL
             OR EXISTS (
               SELECT 1 FROM public.payment_requests pr
               WHERE pr.trip_id = t.id AND pr.status <> 'cancelled'
             )
           )
       )
       AND NOT EXISTS (
         SELECT 1 FROM public.transactions x
         WHERE x.trip_id = r.id AND x.ledger_category = 'compliance_balance'
       )
     )
  ORDER BY r.created_at DESC;
$function$;

REVOKE ALL ON FUNCTION public.get_trips_for_org(uuid, boolean, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_trips_for_org(uuid, boolean, date, date)
  TO anon, authenticated, service_role;

-- Reload PostgREST so p_from/p_to are callable immediately after apply.
NOTIFY pgrst, 'reload schema';
