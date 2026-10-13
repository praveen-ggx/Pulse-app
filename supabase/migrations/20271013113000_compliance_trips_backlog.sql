-- Compliance work queue must not lose old trips to the trips list's newest-400 cap
-- (old paid advances SAT812-PAY-000002 / 000004 were missing from the page and
-- the bank export). One source of truth: get_trips_for_org gains an opt-in flag.
--
--   p_include_compliance_backlog = false (default): unchanged — newest 400.
--   p_include_compliance_backlog = true: the newest 400, plus every older trip
--   that has entered the Compliance workflow (compliance verified / declined,
--   finance verified, or a live payment request) and is not settled yet (no
--   compliance balance posted). Older trips that never entered Compliance stay
--   out — this does not enrol pre-Compliance history.
--
-- Body copied from the live definition (20270918100100 lineage); only the
-- signature and the outer selection change.

drop function if exists public.get_trips_for_org(uuid);

create function public.get_trips_for_org(
  p_org_id uuid,
  p_include_compliance_backlog boolean default false
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
  ) r
  WHERE r.rn <= 400
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

-- Same grants as the replaced get_trips_for_org(uuid).
grant execute on function public.get_trips_for_org(uuid, boolean) to anon, authenticated, service_role;
