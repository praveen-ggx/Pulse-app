-- Function phase of the hot-path release.
-- Indexes are created first, outside any transaction, by
-- supabase/release-manual/20271106053000_hot_path_indexes_concurrent.sql.
-- This file does not create indexes. It refuses to run unless both indexes
-- exist on public.trips and are valid.
-- Function bodies are the locally certified definitions.

SET LOCAL lock_timeout = '5s';

DO $guard$
DECLARE
  bad text;
BEGIN
  SELECT string_agg(expected.name, ', ' ORDER BY expected.name)
    INTO bad
  FROM (
    VALUES
      ('idx_trips_org_count_cover', 'CREATE INDEX idx_trips_org_count_cover ON public.trips USING btree (organization_id) INCLUDE (status, notes, pickup_date, created_at, driver_id)'),
      ('idx_trips_org_created_cover', 'CREATE INDEX idx_trips_org_created_cover ON public.trips USING btree (organization_id, created_at) INCLUDE (status, notes, pickup_date)')
  ) AS expected(name, def)
  LEFT JOIN pg_class c ON c.relname = expected.name AND c.relkind = 'i' AND c.relnamespace = 'public'::regnamespace
  LEFT JOIN pg_index i ON i.indexrelid = c.oid
  LEFT JOIN pg_class t ON t.oid = i.indrelid AND t.relname = 'trips' AND t.relnamespace = 'public'::regnamespace
  WHERE c.oid IS NULL
     OR t.oid IS NULL
     OR i.indisvalid IS NOT TRUE
     OR i.indisready IS NOT TRUE
     OR pg_get_indexdef(c.oid) IS DISTINCT FROM expected.def;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'hot-path indexes missing, invalid, or wrong definition: %', bad;
  END IF;
END
$guard$;

CREATE OR REPLACE FUNCTION public.list_org_hub_trips_keyset(p_org_id uuid, p_limit integer DEFAULT 50, p_before_created_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_before_id uuid DEFAULT NULL::uuid, p_from date DEFAULT NULL::date, p_to date DEFAULT NULL::date, p_bucket text DEFAULT 'all'::text, p_side text DEFAULT 'either'::text, p_supplier_id uuid DEFAULT NULL::uuid, p_supplier_name text DEFAULT NULL::text, p_vehicle_id uuid DEFAULT NULL::uuid, p_vehicle_norm text DEFAULT NULL::text, p_supply text DEFAULT 'all'::text, p_attributed text DEFAULT 'all'::text, p_client_id uuid DEFAULT NULL::uuid, p_driver_id uuid DEFAULT NULL::uuid, p_payment text DEFAULT 'all'::text, p_load_type text DEFAULT NULL::text, p_compliance boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_limit integer;
  v_total bigint;
  v_active bigint;
  v_history bigint;
  v_cancelled bigint;
  v_bucket bigint;
  v_attributed bigint;
  v_rows jsonb;
  v_ground_ops boolean;
BEGIN
  IF p_org_id IS NULL
     OR NOT public.is_org_member(p_org_id)
     OR p_bucket NOT IN ('all', 'active', 'history', 'cancelled', 'closed')
     OR p_side NOT IN ('either', 'owner', 'supplier')
     OR coalesce(p_supply, 'all') NOT IN ('all', 'asset', 'aggregated')
     OR coalesce(p_attributed, 'all') NOT IN ('all', 'attributed')
     OR coalesce(p_payment, 'all') NOT IN ('all', 'pending', 'partial', 'paid')
  THEN
    RETURN NULL;
  END IF;
  v_limit := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);


  v_ground_ops := EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = p_org_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
      AND COALESCE(om.permissions ->> 'platformRole', '') = 'ground_ops'
  );

  IF NOT v_ground_ops
     AND p_side = 'either'
     AND p_supplier_id IS NULL
     AND p_vehicle_id IS NULL
     AND coalesce(btrim(p_vehicle_norm), '') = ''
     AND coalesce(p_supply, 'all') = 'all'
     AND coalesce(p_attributed, 'all') = 'all'
     AND p_client_id IS NULL
     AND p_driver_id IS NULL
     AND coalesce(p_payment, 'all') = 'all'
     AND (p_load_type IS NULL OR btrim(p_load_type) = '' OR lower(btrim(p_load_type)) = 'all')
     AND NOT coalesce(p_compliance, false)
  THEN
    SELECT
      coalesce(sum(n), 0)::bigint,
      coalesce(sum(a), 0)::bigint,
      coalesce(sum(h), 0)::bigint,
      coalesce(sum(c), 0)::bigint,
      coalesce(sum(b), 0)::bigint,
      coalesce(sum(att), 0)::bigint
    INTO v_total, v_active, v_history, v_cancelled, v_bucket, v_attributed
    FROM (
      SELECT
        coalesce(sum(n), 0) AS n,
        coalesce(sum(n) FILTER (
          WHERE st NOT IN ('completed', 'delivered', 'done', 'cancelled')
        ), 0) AS a,
        coalesce(sum(n) FILTER (
          WHERE st IN ('completed', 'delivered', 'done')
        ), 0) AS h,
        coalesce(sum(n) FILTER (WHERE st = 'cancelled'), 0) AS c,
        coalesce(sum(n) FILTER (
          WHERE p_bucket = 'all'
            OR (p_bucket = 'active' AND st NOT IN ('completed', 'delivered', 'done', 'cancelled'))
            OR (p_bucket = 'history' AND st IN ('completed', 'delivered', 'done'))
            OR (p_bucket = 'cancelled' AND st = 'cancelled')
            OR (p_bucket = 'closed' AND st IN ('completed', 'delivered', 'done', 'cancelled'))
        ), 0) AS b,
        coalesce(sum(n) FILTER (WHERE att), 0) AS att
      FROM (
        SELECT lower(coalesce(tr.status, '')) AS st,
               btrim(coalesce(tr.notes, '')) LIKE 'Attributed trip from%' AS att,
               count(*) AS n
        FROM public.trips tr
        WHERE tr.organization_id = p_org_id
          AND (
            p_from IS NULL OR p_to IS NULL
            OR (
              tr.created_at >= (p_from::timestamp AT TIME ZONE 'Asia/Kolkata')
              AND tr.created_at < ((p_to + 1)::timestamp AT TIME ZONE 'Asia/Kolkata')
              AND (tr.pickup_date IS NULL OR tr.pickup_date < p_from OR tr.pickup_date > p_to)
            )
          )
        GROUP BY 1, 2
        UNION ALL
        SELECT lower(coalesce(tr.status, '')),
               btrim(coalesce(tr.notes, '')) LIKE 'Attributed trip from%',
               count(*)
        FROM public.trips tr
        WHERE tr.organization_id = p_org_id
          AND p_from IS NOT NULL
          AND p_to IS NOT NULL
          AND tr.pickup_date BETWEEN p_from AND p_to
        GROUP BY 1, 2
        UNION ALL
        SELECT lower(coalesce(tr.status, '')),
               btrim(coalesce(tr.notes, '')) LIKE 'Attributed trip from%',
               count(*)
        FROM public.trips tr
        WHERE tr.organization_id IS DISTINCT FROM p_org_id
          AND tr.supplier_id IS NOT NULL
          AND tr.indent_id IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM public.suppliers s
            WHERE s.id = tr.supplier_id AND s.linked_organization_id = p_org_id
          )
          AND NOT EXISTS (
            SELECT 1 FROM public.trips m
            WHERE m.organization_id = p_org_id
              AND m.source = 'mover_asset'
              AND m.source_indent_id = tr.indent_id
              AND m.deleted_at IS NULL
          )
          AND (
            p_from IS NULL OR p_to IS NULL
            OR tr.pickup_date BETWEEN p_from AND p_to
            OR (timezone('Asia/Kolkata', tr.created_at))::date BETWEEN p_from AND p_to
          )
        GROUP BY 1, 2
      ) grouped
    ) counts;
  ELSE
  SELECT
    count(*),
    count(*) FILTER (
      WHERE lower(coalesce(tr.status, '')) NOT IN ('completed', 'delivered', 'done', 'cancelled')
    ),
    count(*) FILTER (
      WHERE lower(coalesce(tr.status, '')) IN ('completed', 'delivered', 'done')
    ),
    count(*) FILTER (
      WHERE lower(coalesce(tr.status, '')) = 'cancelled'
    ),
    count(*) FILTER (
      WHERE (
        p_bucket = 'all'
        OR (p_bucket = 'active' AND lower(coalesce(tr.status, '')) NOT IN ('completed', 'delivered', 'done', 'cancelled'))
        OR (p_bucket = 'history' AND lower(coalesce(tr.status, '')) IN ('completed', 'delivered', 'done'))
        OR (p_bucket = 'cancelled' AND lower(coalesce(tr.status, '')) = 'cancelled')
        OR (p_bucket = 'closed' AND lower(coalesce(tr.status, '')) IN ('completed', 'delivered', 'done', 'cancelled'))
      )
    ),
    count(*) FILTER (
      WHERE btrim(coalesce(tr.notes, '')) LIKE 'Attributed trip from%'
    )
  INTO v_total, v_active, v_history, v_cancelled, v_bucket, v_attributed
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

      AND (
        p_side = 'either'
        OR (p_side = 'owner' AND tr.organization_id = p_org_id)
        OR (p_side = 'supplier' AND tr.organization_id IS DISTINCT FROM p_org_id)
      )
      AND (p_supplier_id IS NULL OR tr.supplier_id = p_supplier_id)
      AND (
        (p_vehicle_id IS NULL AND coalesce(btrim(p_vehicle_norm), '') = '')
        OR (p_vehicle_id IS NOT NULL AND tr.vehicle_id = p_vehicle_id)
        OR (
          coalesce(btrim(p_vehicle_norm), '') <> ''
          AND upper(regexp_replace(coalesce(tr.vehicle_display_number, ''), '[^A-Za-z0-9]', '', 'g'))
            = upper(btrim(p_vehicle_norm))
        )
      )

      AND (
        coalesce(p_supply, 'all') = 'all'
        OR (
          (
            upper(btrim(coalesce(tr.operating_mode, ''))) = 'DCO'
            OR upper(btrim(coalesce(tr.execution_type, ''))) = 'AGGREGATE'
            OR (
              upper(btrim(coalesce(tr.execution_type, ''))) IS DISTINCT FROM 'ASSET'
              AND lower(btrim(coalesce(tr.source, ''))) IS DISTINCT FROM 'mover_asset'
              AND lower(btrim(coalesce(tr.trip_payout_mode, ''))) IS DISTINCT FROM 'asset'
              AND (
                lower(btrim(coalesce(tr.trip_payout_mode, ''))) = 'market'
                OR (
                  NOT (
                    lower(btrim(coalesce(tr.source, ''))) = 'direct_quote'
                    AND tr.driver_id IS NOT NULL
                    AND tr.vehicle_id IS NOT NULL
                  )
                  AND tr.supplier_id IS NOT NULL
                )
              )
            )
          ) = (coalesce(p_supply, 'all') = 'aggregated')
        )
      )
      AND (
        coalesce(p_attributed, 'all') = 'all'
        OR btrim(coalesce(tr.notes, '')) LIKE 'Attributed trip from%'
      )
      AND (p_client_id IS NULL OR tr.client_id = p_client_id)
      AND (p_driver_id IS NULL OR tr.driver_id = p_driver_id)

      AND (
        coalesce(p_payment, 'all') = 'all'
        OR (
          coalesce(p_payment, 'all') = 'paid'
          AND lower(coalesce(CASE WHEN tr.organization_id = p_org_id THEN tr.payment_status END, 'pending'))
            IN ('paid', 'fully_paid')
        )
        OR (
          coalesce(p_payment, 'all') NOT IN ('all', 'paid')
          AND lower(coalesce(CASE WHEN tr.organization_id = p_org_id THEN tr.payment_status END, 'pending'))
            = lower(btrim(p_payment))
        )
      )
      AND (
        p_load_type IS NULL
        OR btrim(p_load_type) = ''
        OR lower(btrim(p_load_type)) = 'all'
        OR lower(coalesce(tr.load_type, '')) = lower(btrim(p_load_type))
      )
      AND (
        NOT coalesce(p_compliance, false)
        OR (
          tr.deleted_at IS NULL
          AND (
            tr.compliance_verified_at IS NOT NULL
            OR tr.compliance_declined_at IS NOT NULL
            OR tr.finance_verified_at IS NOT NULL
            OR EXISTS (
              SELECT 1 FROM public.payment_requests pr
              WHERE pr.trip_id = tr.id AND pr.status <> 'cancelled'
            )
          )
          AND NOT EXISTS (
            SELECT 1 FROM public.transactions x
            WHERE x.trip_id = tr.id AND x.ledger_category = 'compliance_balance'
          )
        )
      )
  ;

  END IF;

  SELECT COALESCE(jsonb_agg(payload ORDER BY created_at DESC, id DESC), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT tr.created_at, tr.id,
               jsonb_build_object(
        'client_price', CASE WHEN tr.organization_id = p_org_id THEN tr.client_price      END,
        'margin', CASE WHEN tr.organization_id = p_org_id THEN tr.margin            END,
        'platform_fee', CASE WHEN tr.organization_id = p_org_id THEN tr.platform_fee      END,
        'driver_commission', CASE WHEN tr.organization_id = p_org_id THEN tr.driver_commission END,
        'amount_paid', CASE WHEN tr.organization_id = p_org_id THEN tr.amount_paid       END,
        'payment_status', CASE WHEN tr.organization_id = p_org_id THEN tr.payment_status    END,
        'client_id', CASE WHEN tr.organization_id = p_org_id THEN tr.client_id         END
               ) || jsonb_build_object(
        'id', tr.id,
        'organization_id', tr.organization_id,
        'trip_number', tr.trip_number,
        'source', tr.source,
        'display_trip_id', tr.display_trip_id,
        'driver_display_trip_id', tr.driver_display_trip_id,
        'trip_code', tr.trip_code,
        'trip_operational_code', tr.trip_operational_code,
        'booking_ref', tr.booking_ref,
        'sequence_number', tr.sequence_number,
        'pickup_area', tr.pickup_area,
        'drop_location', tr.drop_location,
        'distance', tr.distance,
        'estimated_duration', tr.estimated_duration,
        'pickup_lat', tr.pickup_lat,
        'pickup_lon', tr.pickup_lon,
        'drop_lat', tr.drop_lat,
        'drop_lon', tr.drop_lon,
        'load_type', tr.load_type,
        'load_tons', tr.load_tons,
        'notes', tr.notes,
        'client_name', tr.client_name,
        'supplier_id', tr.supplier_id,
        'supplier_trip_sequence', tr.supplier_trip_sequence,
        'supplier_rate', tr.supplier_rate,
        'advance_paid', tr.advance_paid,
        'is_guaranteed', tr.is_guaranteed,
        'trip_payout_mode', tr.trip_payout_mode,
        'operating_mode', tr.operating_mode,
        'dco_payee_id', tr.dco_payee_id,
        'driver_id', tr.driver_id,
        'vehicle_id', tr.vehicle_id,
        'owner_vehicle_id', tr.owner_vehicle_id,
        'driver_display_name', tr.driver_display_name,
        'vehicle_display_number', tr.vehicle_display_number,
        'status', tr.status
               ) || jsonb_build_object(
        'pickup_date', tr.pickup_date,
        'started_at', tr.started_at,
        'completed_at', tr.completed_at,
        'created_at', tr.created_at,
        'updated_at', tr.updated_at,
        'deleted_at', tr.deleted_at,
        'status_change_origin', tr.status_change_origin,
        'pod_received_at', tr.pod_received_at,
        'pod_required', tr.pod_required,
        'owner_user_id', tr.owner_user_id,
        'created_by_user_id', tr.created_by_user_id,
        'assigned_by_user_id', tr.assigned_by_user_id,
        'last_location_at', tr.last_location_at,
        'last_location_chat_at', tr.last_location_chat_at,
        'actual_distance_traveled_km', tr.actual_distance_traveled_km,
        'start_odometer_km', tr.start_odometer_km,
        'end_odometer_km', tr.end_odometer_km,
        'odometer_distance_km', tr.odometer_distance_km,
        'gps_distance_km', tr.gps_distance_km,
        'distance_discrepancy_km', tr.distance_discrepancy_km,
        'distance_source', tr.distance_source,
        'odometer_verification_state', tr.odometer_verification_state,
        'odometer_notes', tr.odometer_notes,
        'odometer_updated_by', tr.odometer_updated_by,
        'odometer_updated_at', tr.odometer_updated_at,
        'indent_id', tr.indent_id,
        'source_indent_id', tr.source_indent_id,
        'source_indent_code', tr.source_indent_code,
        'indent_reference_code', tr.indent_reference_code,
        'converted_from_indent_at', tr.converted_from_indent_at,
        'converted_by', tr.converted_by,
        'source_bid_id', tr.source_bid_id,
        'indent_number', i.indent_number
               ) AS payload
    FROM (
      SELECT t.id
      FROM public.trips t
      LEFT JOIN public.indents i ON i.id = t.indent_id
  WHERE public.is_org_member(p_org_id)
      AND (
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
        p_from IS NULL
        OR p_to IS NULL
        OR t.pickup_date BETWEEN p_from AND p_to
        OR (timezone('Asia/Kolkata', t.created_at))::date BETWEEN p_from AND p_to
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

      AND (
        p_side = 'either'
        OR (p_side = 'owner' AND t.organization_id = p_org_id)
        OR (p_side = 'supplier' AND t.organization_id IS DISTINCT FROM p_org_id)
      )
      AND (p_supplier_id IS NULL OR t.supplier_id = p_supplier_id)
      AND (
        (p_vehicle_id IS NULL AND coalesce(btrim(p_vehicle_norm), '') = '')
        OR (p_vehicle_id IS NOT NULL AND t.vehicle_id = p_vehicle_id)
        OR (
          coalesce(btrim(p_vehicle_norm), '') <> ''
          AND upper(regexp_replace(coalesce(t.vehicle_display_number, ''), '[^A-Za-z0-9]', '', 'g'))
            = upper(btrim(p_vehicle_norm))
        )
      )

      AND (
        coalesce(p_supply, 'all') = 'all'
        OR (
          (
            upper(btrim(coalesce(t.operating_mode, ''))) = 'DCO'
            OR upper(btrim(coalesce(t.execution_type, ''))) = 'AGGREGATE'
            OR (
              upper(btrim(coalesce(t.execution_type, ''))) IS DISTINCT FROM 'ASSET'
              AND lower(btrim(coalesce(t.source, ''))) IS DISTINCT FROM 'mover_asset'
              AND lower(btrim(coalesce(t.trip_payout_mode, ''))) IS DISTINCT FROM 'asset'
              AND (
                lower(btrim(coalesce(t.trip_payout_mode, ''))) = 'market'
                OR (
                  NOT (
                    lower(btrim(coalesce(t.source, ''))) = 'direct_quote'
                    AND t.driver_id IS NOT NULL
                    AND t.vehicle_id IS NOT NULL
                  )
                  AND t.supplier_id IS NOT NULL
                )
              )
            )
          ) = (coalesce(p_supply, 'all') = 'aggregated')
        )
      )
      AND (
        coalesce(p_attributed, 'all') = 'all'
        OR btrim(coalesce(t.notes, '')) LIKE 'Attributed trip from%'
      )
      AND (p_client_id IS NULL OR t.client_id = p_client_id)
      AND (p_driver_id IS NULL OR t.driver_id = p_driver_id)

      AND (
        coalesce(p_payment, 'all') = 'all'
        OR (
          coalesce(p_payment, 'all') = 'paid'
          AND lower(coalesce(CASE WHEN t.organization_id = p_org_id THEN t.payment_status END, 'pending'))
            IN ('paid', 'fully_paid')
        )
        OR (
          coalesce(p_payment, 'all') NOT IN ('all', 'paid')
          AND lower(coalesce(CASE WHEN t.organization_id = p_org_id THEN t.payment_status END, 'pending'))
            = lower(btrim(p_payment))
        )
      )
      AND (
        p_load_type IS NULL
        OR btrim(p_load_type) = ''
        OR lower(btrim(p_load_type)) = 'all'
        OR lower(coalesce(t.load_type, '')) = lower(btrim(p_load_type))
      )
      AND (
        NOT coalesce(p_compliance, false)
        OR (
          t.deleted_at IS NULL
          AND (
            t.compliance_verified_at IS NOT NULL
            OR t.compliance_declined_at IS NOT NULL
            OR t.finance_verified_at IS NOT NULL
            OR EXISTS (
              SELECT 1 FROM public.payment_requests pr
              WHERE pr.trip_id = t.id AND pr.status <> 'cancelled'
            )
          )
          AND NOT EXISTS (
            SELECT 1 FROM public.transactions x
            WHERE x.trip_id = t.id AND x.ledger_category = 'compliance_balance'
          )
        )
      )
        AND (
          p_bucket = 'all'
          OR (p_bucket = 'active' AND lower(coalesce(t.status, '')) NOT IN ('completed', 'delivered', 'done', 'cancelled'))
          OR (p_bucket = 'history' AND lower(coalesce(t.status, '')) IN ('completed', 'delivered', 'done'))
          OR (p_bucket = 'cancelled' AND lower(coalesce(t.status, '')) = 'cancelled')
          OR (p_bucket = 'closed' AND lower(coalesce(t.status, '')) IN ('completed', 'delivered', 'done', 'cancelled'))
        )
        AND (
          p_before_created_at IS NULL
          OR t.created_at < p_before_created_at
          OR (t.created_at = p_before_created_at AND t.id < p_before_id)
        )
      ORDER BY t.created_at DESC, t.id DESC
      LIMIT v_limit
    ) page
    JOIN public.trips tr ON tr.id = page.id
    LEFT JOIN public.indents i ON i.id = tr.indent_id
  ) shaped;

  RETURN jsonb_build_object(
    'total', v_total,
    'active_count', v_active,
    'history_count', v_history,
    'cancelled_count', v_cancelled,
    'bucket_count', v_bucket,
    'attributed_count', v_attributed,
    'rows', v_rows
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_trips_delta(
  p_org_id UUID,
  p_since TEXT,
  p_limit INT DEFAULT 200
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_since TIMESTAMPTZ;
  v_after_id UUID;
  v_limit INT;
  v_changed JSONB;
  v_deleted JSONB;
  v_next TEXT;
  v_count INT;
  v_sep INT;
  v_ground_ops boolean;
BEGIN
  IF p_org_id IS NULL OR NOT public.is_org_member(p_org_id) THEN
    RETURN NULL;
  END IF;

  v_limit := LEAST(GREATEST(COALESCE(p_limit, 200), 1), 200);
  v_sep := position('|' in btrim(p_since));
  BEGIN
    IF v_sep > 0 THEN
      v_since := left(btrim(p_since), v_sep - 1)::timestamptz;
      v_after_id := substr(btrim(p_since), v_sep + 1)::uuid;
    ELSE
      v_since := btrim(p_since)::timestamptz;
      v_after_id := NULL;
    END IF;
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'Trip delta cursor is invalid';
  END;

  v_ground_ops := EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = p_org_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
      AND COALESCE(om.permissions ->> 'platformRole', '') = 'ground_ops'
  );

  IF NOT v_ground_ops THEN
    SELECT
      COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.updated_at, t.id) FILTER (WHERE t.deleted_at IS NULL), '[]'::jsonb),
      COALESCE(jsonb_agg(t.id::text) FILTER (WHERE t.deleted_at IS NOT NULL), '[]'::jsonb),
      (array_agg(t.updated_at::text || '|' || t.id::text ORDER BY t.updated_at, t.id))[count(*)],
      count(*)::int
    INTO v_changed, v_deleted, v_next, v_count
    FROM (
      SELECT tr.*
      FROM public.trips tr
      WHERE tr.organization_id = p_org_id
        AND (
          (v_after_id IS NULL AND tr.updated_at > v_since)
          OR (v_after_id IS NOT NULL AND (tr.updated_at, tr.id) > (v_since, v_after_id))
        )
      ORDER BY tr.updated_at, tr.id
      LIMIT v_limit
    ) t;
  ELSE
    SELECT
      COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.updated_at, t.id) FILTER (WHERE t.deleted_at IS NULL), '[]'::jsonb),
      COALESCE(jsonb_agg(t.id::text) FILTER (WHERE t.deleted_at IS NOT NULL), '[]'::jsonb),
      (array_agg(t.updated_at::text || '|' || t.id::text ORDER BY t.updated_at, t.id))[count(*)],
      count(*)::int
    INTO v_changed, v_deleted, v_next, v_count
    FROM (
      SELECT tr.*
      FROM public.trips tr
      LEFT JOIN public.indents i ON i.id = tr.indent_id
      WHERE tr.organization_id = p_org_id
        AND (
          (v_after_id IS NULL AND tr.updated_at > v_since)
          OR (v_after_id IS NOT NULL AND (tr.updated_at, tr.id) > (v_since, v_after_id))
        )
        AND EXISTS (
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
      ORDER BY tr.updated_at, tr.id
      LIMIT v_limit
    ) t;
  END IF;

  RETURN jsonb_build_object(
    'changed', v_changed,
    'deleted_ids', v_deleted,
    'next_cursor', COALESCE(v_next, p_since),
    'has_more', v_count >= v_limit
  );
END;
$$;


CREATE OR REPLACE FUNCTION public.count_org_hub_metrics(p_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
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
          WHERE lower(coalesce(t.status, '')) NOT IN ('completed', 'delivered', 'done')
            AND (
              t.driver_id IS NULL
              OR btrim(t.driver_id::text) = ''
              OR lower(coalesce(t.status, '')) IN ('cancelled', 'draft')
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
          WHERE st NOT IN ('completed', 'delivered', 'done')
            AND (NOT has_driver OR st IN ('cancelled', 'draft'))
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
$function$;


REVOKE ALL ON FUNCTION public.list_org_hub_trips_keyset(uuid, integer, timestamptz, uuid, date, date, text, text, uuid, text, uuid, text, text, text, uuid, uuid, text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_org_hub_trips_keyset(uuid, integer, timestamptz, uuid, date, date, text, text, uuid, text, uuid, text, text, text, uuid, uuid, text, text, boolean) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_trips_delta(uuid, text, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_trips_delta(uuid, text, int) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.count_org_hub_metrics(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.count_org_hub_metrics(uuid) TO authenticated, service_role;

-- Inside plpgsql, parallel workers are not launched, so a parallel plan
-- scans every row on the leader. These functions use the serial index-only
-- plan. random_page_cost 1.1 matches SSD cost; the default of 4 picked the
-- heap index and was slower on the measured plan.
ALTER FUNCTION public.list_org_hub_trips_keyset(uuid, integer, timestamptz, uuid, date, date, text, text, uuid, text, uuid, text, text, text, uuid, uuid, text, text, boolean)
  SET plan_cache_mode = force_custom_plan;
ALTER FUNCTION public.list_org_hub_trips_keyset(uuid, integer, timestamptz, uuid, date, date, text, text, uuid, text, uuid, text, text, text, uuid, uuid, text, text, boolean)
  SET max_parallel_workers_per_gather = 0;
ALTER FUNCTION public.list_org_hub_trips_keyset(uuid, integer, timestamptz, uuid, date, date, text, text, uuid, text, uuid, text, text, text, uuid, uuid, text, text, boolean)
  SET random_page_cost = 1.1;
ALTER FUNCTION public.count_org_hub_metrics(uuid)
  SET plan_cache_mode = force_custom_plan;
ALTER FUNCTION public.count_org_hub_metrics(uuid)
  SET max_parallel_workers_per_gather = 0;
ALTER FUNCTION public.count_org_hub_metrics(uuid)
  SET random_page_cost = 1.1;
