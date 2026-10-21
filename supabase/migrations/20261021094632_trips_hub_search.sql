-- Trips hub search: the hub list is the newest 400 trips (get_trips_for_org), so
-- searching a client like Ramco Cement only found matches inside that window.
-- search_trips_for_org searches every trip the org can see, with the same
-- visibility rules and the same row shape as get_trips_for_org.
--
-- Matches (case-insensitive, substring): trip number / ids / booking ref, client
-- (trip snapshot + client master), supplier, pickup / drop, vehicle number
-- (spaces ignored), driver name, driver phone (digits only, 4+, +91 / 0 prefix
-- ignored), indent code, LR number and e-way bill number (trip_documents).
--
-- Select list and visibility WHERE are copied from get_trips_for_org
-- (20271013113000_compliance_trips_backlog); only the search filter is new.

create or replace function public.search_trips_for_org(
  p_org_id uuid,
  p_query text,
  p_limit integer default 200
)
 RETURNS SETOF json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT r.j
  FROM (
    SELECT row_to_json(q) AS j,
           q.created_at
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
    CROSS JOIN (
      SELECT
        '%' || replace(replace(replace(btrim(p_query), '\', '\\'), '%', '\%'), '_', '\_') || '%' AS pat,
        '%' || replace(replace(replace(replace(lower(btrim(p_query)), ' ', ''), '\', '\\'), '%', '\%'), '_', '\_') || '%' AS compact_pat,
        -- Phone digits; "+91 98765 43210" / "098765…" search as "9876543210".
        CASE
          WHEN length(x.d) > 10 AND left(x.d, 2) = '91' THEN right(x.d, 10)
          WHEN length(x.d) = 11 AND left(x.d, 1) = '0' THEN right(x.d, 10)
          ELSE x.d
        END AS digits
      FROM (SELECT regexp_replace(COALESCE(p_query, ''), '\D', '', 'g') AS d) x
    ) p
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
      -- Need at least 2 characters to search.
      AND length(btrim(COALESCE(p_query, ''))) >= 2
      -- Search filter (new). Owner-only fields stay owner-only, like the select list.
      AND (
        tr.trip_number ILIKE p.pat
        OR tr.display_trip_id ILIKE p.pat
        OR tr.driver_display_trip_id ILIKE p.pat
        OR tr.trip_code ILIKE p.pat
        OR tr.trip_operational_code ILIKE p.pat
        OR tr.booking_ref ILIKE p.pat
        OR tr.client_name ILIKE p.pat
        OR tr.pickup_area ILIKE p.pat
        OR tr.drop_location ILIKE p.pat
        OR tr.driver_display_name ILIKE p.pat
        OR tr.source_indent_code ILIKE p.pat
        OR tr.indent_reference_code ILIKE p.pat
        OR i.indent_number ILIKE p.pat
        OR replace(lower(COALESCE(tr.vehicle_display_number, '')), ' ', '') LIKE p.compact_pat
        OR EXISTS (
          SELECT 1 FROM public.vehicles v
          WHERE v.id IN (tr.vehicle_id, tr.owner_vehicle_id)
            AND replace(lower(v.vehicle_number), ' ', '') LIKE p.compact_pat
        )
        OR (
          tr.organization_id = p_org_id
          AND EXISTS (
            SELECT 1 FROM public.clients c
            WHERE c.id = tr.client_id AND c.name ILIKE p.pat
          )
        )
        OR EXISTS (
          SELECT 1 FROM public.suppliers s2
          WHERE s2.id = tr.supplier_id
            AND (s2.name ILIKE p.pat OR s2.company_name ILIKE p.pat)
        )
        OR EXISTS (
          SELECT 1 FROM public.drivers d
          WHERE d.id = tr.driver_id
            AND (
              d.name ILIKE p.pat
              OR (
                length(p.digits) >= 4
                AND regexp_replace(COALESCE(d.phone, ''), '\D', '', 'g') LIKE '%' || p.digits || '%'
              )
            )
        )
        OR EXISTS (
          SELECT 1 FROM public.trip_documents td
          WHERE td.trip_id = tr.id
            AND (
              (td.document_type = 'lr' AND td.document_number ILIKE p.pat)
              OR (
                td.document_type = 'eway_bill'
                AND replace(lower(COALESCE(td.document_number, '')), ' ', '') LIKE p.compact_pat
              )
            )
        )
      )
    ORDER BY tr.id, tr.created_at DESC
    ) q
  ) r
  ORDER BY r.created_at DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 200), 1), 500);
$function$;

grant execute on function public.search_trips_for_org(uuid, text, integer) to authenticated, service_role;
