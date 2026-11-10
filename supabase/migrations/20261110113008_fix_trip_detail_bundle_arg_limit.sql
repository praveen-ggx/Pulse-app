BEGIN;

SET LOCAL lock_timeout = '5s';

-- HOTFIX: 20271104142208 added trip_operational_code + trip_code to the 'trip'
-- jsonb_build_object, taking it to 104 arguments. Postgres caps function calls
-- at 100 arguments (54023) and PL/pgSQL only parses a statement when it runs,
-- so CREATE succeeded but every get_trip_detail_bundle call then failed with
-- "cannot pass more than 100 arguments to a function".
--
-- Fix: build the same 'trip' object as two jsonb_build_object calls joined with
-- || (42 + 62 arguments). Keys and values are unchanged; signature, SECURITY
-- DEFINER, search_path and grants are unchanged.

CREATE OR REPLACE FUNCTION public.get_trip_detail_bundle(p_trip_id uuid, p_viewer_org_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_trip_org_id        UUID;
  v_supplier_linked_id UUID;
  v_client_linked_id   UUID;
  v_is_owner           BOOLEAN;
  v_is_supplier        BOOLEAN;
  v_is_client          BOOLEAN;

  v_trip_id                    UUID;
  v_trip_organization_id       UUID;
  v_trip_number                TEXT;
  v_indent_id                  UUID;
  v_source                     TEXT;
  v_pickup_area                TEXT;
  v_drop_location              TEXT;
  v_distance                   NUMERIC;
  v_estimated_duration         INTERVAL;
  v_client_id                  UUID;
  v_client_name                TEXT;
  v_supplier_id                UUID;
  v_driver_id                  UUID;
  v_vehicle_id                 UUID;
  v_client_price               NUMERIC;
  v_supplier_rate              NUMERIC;
  v_margin                     NUMERIC;
  v_platform_fee               NUMERIC;
  v_driver_commission          NUMERIC;
  v_execution_type              TEXT;
  v_is_guaranteed              BOOLEAN;
  v_payment_status             TEXT;
  v_amount_paid                NUMERIC;
  v_advance_paid                NUMERIC;
  v_status                     TEXT;
  v_pickup_date                DATE;
  v_started_at                 TIMESTAMPTZ;
  v_completed_at               TIMESTAMPTZ;
  v_load_type                  TEXT;
  v_load_tons                  NUMERIC;
  v_notes                      TEXT;
  v_created_at                 TIMESTAMPTZ;
  v_updated_at                 TIMESTAMPTZ;
  v_driver_display_name        TEXT;
  v_vehicle_display_number     TEXT;
  v_pickup_lat                 NUMERIC;
  v_pickup_lon                 NUMERIC;
  v_drop_lat                   NUMERIC;
  v_drop_lon                   NUMERIC;
  v_owner_user_id              UUID;
  v_created_by_user_id         UUID;
  v_assigned_by_user_id        UUID;
  v_trip_payout_mode           TEXT;
  v_driver_display_trip_id     TEXT;
  v_deleted_at                 TIMESTAMPTZ;
  v_display_trip_id            TEXT;
  v_trip_operational_code     TEXT;
  v_trip_code                 TEXT;
  v_last_location_at           TIMESTAMPTZ;
  v_actual_distance_km         NUMERIC;
  v_last_location_chat_at      TIMESTAMPTZ;
  v_operating_mode             TEXT;
  v_dco_payee_id               UUID;
  v_viewer_is_ground_ops       BOOLEAN;
  v_ground_ops_can_access      BOOLEAN;
BEGIN

  IF NOT EXISTS (
    SELECT 1
    FROM organization_members om
    WHERE om.organization_id = p_viewer_org_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
  ) THEN
    RETURN NULL;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM organization_members om
    WHERE om.organization_id = p_viewer_org_id
      AND om.user_id = (SELECT auth.uid())
      AND om.status = 'active'
      AND COALESCE(om.permissions ->> 'platformRole', '') = 'ground_ops'
  ) INTO v_viewer_is_ground_ops;

  IF v_viewer_is_ground_ops THEN
    SELECT EXISTS (
      SELECT 1
      FROM trips t
      JOIN organization_members om ON om.organization_id = t.organization_id
      JOIN organization_member_warehouses omw ON omw.organization_member_id = om.id
      JOIN indents i ON i.id = t.indent_id
      WHERE t.id = p_trip_id
        AND om.user_id = (SELECT auth.uid())
        AND om.organization_id = p_viewer_org_id
        AND om.status = 'active'
        AND (
          i.warehouse_id = omw.warehouse_id
          OR EXISTS (
            SELECT 1 FROM sales_orders so
            WHERE so.id = i.sales_order_id
              AND (so.pickup_warehouse_id = omw.warehouse_id OR so.drop_warehouse_id = omw.warehouse_id)
          )
          OR (
            i.execution_plan_id IS NOT NULL
            AND EXISTS (
              SELECT 1
              FROM shipment_allocations sa
              JOIN sales_order_lines sol ON sol.id = sa.sales_order_line_id
              JOIN sales_orders so2 ON so2.id = sol.sales_order_id
              WHERE sa.execution_plan_id = i.execution_plan_id
                AND (so2.pickup_warehouse_id = omw.warehouse_id OR so2.drop_warehouse_id = omw.warehouse_id)
            )
          )
        )
    ) INTO v_ground_ops_can_access;

    IF NOT v_ground_ops_can_access THEN
      RETURN NULL;
    END IF;
  END IF;

  SELECT
    t.id, t.organization_id, t.trip_number, t.indent_id, t.source,
    t.pickup_area, t.drop_location, t.distance, t.estimated_duration,
    t.client_id, t.client_name, t.supplier_id, t.driver_id, t.vehicle_id,
    t.client_price, t.supplier_rate, t.margin, t.platform_fee, t.driver_commission,
    t.execution_type,
    t.is_guaranteed, t.payment_status, t.amount_paid, t.advance_paid, t.status,
    t.pickup_date, t.started_at, t.completed_at, t.load_type, t.load_tons, t.notes,
    t.created_at, t.updated_at, t.driver_display_name, t.vehicle_display_number,
    t.pickup_lat, t.pickup_lon, t.drop_lat, t.drop_lon,
    t.owner_user_id, t.created_by_user_id, t.assigned_by_user_id,
    t.trip_payout_mode, t.driver_display_trip_id, t.deleted_at, t.display_trip_id,
    t.trip_operational_code, t.trip_code,
    t.last_location_at, t.actual_distance_traveled_km, t.last_location_chat_at,
    t.operating_mode, t.dco_payee_id
  INTO
    v_trip_id, v_trip_organization_id, v_trip_number, v_indent_id, v_source,
    v_pickup_area, v_drop_location, v_distance, v_estimated_duration,
    v_client_id, v_client_name, v_supplier_id, v_driver_id, v_vehicle_id,
    v_client_price, v_supplier_rate, v_margin, v_platform_fee, v_driver_commission,
    v_execution_type,
    v_is_guaranteed, v_payment_status, v_amount_paid, v_advance_paid, v_status,
    v_pickup_date, v_started_at, v_completed_at, v_load_type, v_load_tons, v_notes,
    v_created_at, v_updated_at, v_driver_display_name, v_vehicle_display_number,
    v_pickup_lat, v_pickup_lon, v_drop_lat, v_drop_lon,
    v_owner_user_id, v_created_by_user_id, v_assigned_by_user_id,
    v_trip_payout_mode, v_driver_display_trip_id, v_deleted_at, v_display_trip_id,
    v_trip_operational_code, v_trip_code,
    v_last_location_at, v_actual_distance_km, v_last_location_chat_at,
    v_operating_mode, v_dco_payee_id
  FROM trips t
  WHERE t.id = p_trip_id
    AND t.deleted_at IS NULL
    AND (
      t.organization_id = p_viewer_org_id
      OR (
        t.indent_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM suppliers s
          WHERE s.id = t.supplier_id AND s.linked_organization_id = p_viewer_org_id
        )
      )
      OR EXISTS (
        SELECT 1 FROM clients c
        WHERE c.id = t.client_id AND c.linked_organization_id = p_viewer_org_id
      )
    )
  LIMIT 1;

  IF v_trip_id IS NULL THEN
    RETURN NULL;
  END IF;

  v_trip_org_id := v_trip_organization_id;

  IF v_supplier_id IS NOT NULL THEN
    SELECT s.linked_organization_id INTO v_supplier_linked_id
    FROM suppliers s WHERE s.id = v_supplier_id LIMIT 1;
  END IF;

  IF v_client_id IS NOT NULL THEN
    SELECT c.linked_organization_id INTO v_client_linked_id
    FROM clients c WHERE c.id = v_client_id LIMIT 1;
  END IF;

  v_is_owner    := v_trip_org_id = p_viewer_org_id;
  v_is_supplier := (NOT v_is_owner) AND v_supplier_linked_id IS NOT NULL AND v_supplier_linked_id = p_viewer_org_id;
  v_is_client   := (NOT v_is_owner) AND v_client_linked_id IS NOT NULL AND v_client_linked_id = p_viewer_org_id;

  RETURN jsonb_build_object(

    'trip', jsonb_build_object(
      'id',                          v_trip_id,
      'organization_id',             v_trip_org_id,
      'trip_number',                 v_trip_number,
      'display_trip_id',             v_display_trip_id,
      'trip_operational_code',       v_trip_operational_code,
      'trip_code',                   v_trip_code,
      'driver_display_trip_id',      v_driver_display_trip_id,
      'indent_id',                   v_indent_id,
      'source',                      v_source,
      'pickup_area',                 v_pickup_area,
      'drop_location',               v_drop_location,
      'distance',                    v_distance,
      'estimated_duration',          v_estimated_duration,
      'client_id',                   v_client_id,
      'client_name',                 v_client_name,
      'supplier_id',                 v_supplier_id,
      'driver_id',                   v_driver_id,
      'vehicle_id',                  v_vehicle_id,
      'driver_display_name',         v_driver_display_name,
      'vehicle_display_number',      v_vehicle_display_number,
      'execution_type',              v_execution_type
    ) || jsonb_build_object(
      'margin',                      CASE WHEN v_is_owner THEN v_margin END,
      'platform_fee',                CASE WHEN v_is_owner THEN v_platform_fee END,
      'driver_commission',           CASE WHEN v_is_owner OR (v_is_supplier AND v_execution_type = 'ASSET') THEN v_driver_commission END,
      'amount_paid',                 CASE WHEN v_is_owner THEN v_amount_paid END,
      'payment_status',              CASE WHEN v_is_owner THEN v_payment_status END,
      'client_price',                CASE WHEN v_is_owner OR v_is_client THEN v_client_price END,
      'supplier_rate',               CASE WHEN v_is_owner OR v_is_supplier THEN v_supplier_rate END,
      'advance_paid',                CASE WHEN v_is_owner OR v_is_supplier THEN v_advance_paid END,
      'is_guaranteed',               v_is_guaranteed,
      'status',                      v_status,
      'pickup_date',                 v_pickup_date,
      'started_at',                  v_started_at,
      'completed_at',                v_completed_at,
      'load_type',                   v_load_type,
      'load_tons',                   v_load_tons,
      'notes',                       v_notes,
      'created_at',                  v_created_at,
      'updated_at',                  v_updated_at,
      'pickup_lat',                  v_pickup_lat,
      'pickup_lon',                  v_pickup_lon,
      'drop_lat',                    v_drop_lat,
      'drop_lon',                    v_drop_lon,
      'owner_user_id',               v_owner_user_id,
      'created_by_user_id',          v_created_by_user_id,
      'assigned_by_user_id',         v_assigned_by_user_id,
      'trip_payout_mode',            v_trip_payout_mode,
      'operating_mode',              v_operating_mode,
      'dco_payee_id',                v_dco_payee_id,
      'last_location_at',            v_last_location_at,
      'actual_distance_traveled_km', v_actual_distance_km,
      'last_location_chat_at',       v_last_location_chat_at
    ),

    'assignment_audit', (
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
          'id',               aa.id,
          'trip_id',          aa.trip_id,
          'event_type',       aa.event_type,
          'driver_id_prev',   aa.driver_id_prev,
          'driver_id_new',    aa.driver_id_new,
          'vehicle_id_prev',  aa.vehicle_id_prev,
          'vehicle_id_new',   aa.vehicle_id_new,
          'changed_at',       aa.changed_at,
          'changed_by',       aa.changed_by,
          'driver_new_name', (
            SELECT COALESCE(d.name, d.phone)
            FROM drivers d
            WHERE d.id = aa.driver_id_new
              AND d.organization_id = ANY(ARRAY[v_trip_org_id, p_viewer_org_id, v_supplier_linked_id])
            ORDER BY (d.organization_id = v_trip_org_id) DESC
            LIMIT 1
          ),
          'driver_prev_name', (
            SELECT COALESCE(d.name, d.phone)
            FROM drivers d
            WHERE d.id = aa.driver_id_prev
              AND d.organization_id = ANY(ARRAY[v_trip_org_id, p_viewer_org_id, v_supplier_linked_id])
            ORDER BY (d.organization_id = v_trip_org_id) DESC
            LIMIT 1
          ),
          'vehicle_new_label', (
            SELECT v.vehicle_number ||
                   CASE WHEN v.vehicle_type IS NOT NULL THEN ' · ' || v.vehicle_type ELSE '' END
            FROM vehicles v
            WHERE v.id = aa.vehicle_id_new
              AND v.organization_id = ANY(ARRAY[v_trip_org_id, p_viewer_org_id, v_supplier_linked_id])
            ORDER BY (v.organization_id = v_trip_org_id) DESC
            LIMIT 1
          ),
          'vehicle_prev_label', (
            SELECT v.vehicle_number ||
                   CASE WHEN v.vehicle_type IS NOT NULL THEN ' · ' || v.vehicle_type ELSE '' END
            FROM vehicles v
            WHERE v.id = aa.vehicle_id_prev
              AND v.organization_id = ANY(ARRAY[v_trip_org_id, p_viewer_org_id, v_supplier_linked_id])
            ORDER BY (v.organization_id = v_trip_org_id) DESC
            LIMIT 1
          )
        ) ORDER BY aa.changed_at DESC
      ), '[]'::jsonb)
      FROM (
        SELECT id, trip_id, event_type, driver_id_prev, driver_id_new,
               vehicle_id_prev, vehicle_id_new, changed_at, changed_by
        FROM trip_assignment_audit
        WHERE trip_id = p_trip_id
        ORDER BY changed_at DESC
        LIMIT 20
      ) aa
    ),

    'driver', (
      SELECT jsonb_build_object(
        'id',              d.id,
        'name',            d.name,
        'phone',           d.phone,
        'avatar_url',      d.avatar_url,
        'avatar_seed',     d.avatar_seed,
        'user_id',         d.user_id,
        'organization_id', d.organization_id
      )
      FROM drivers d
      WHERE d.id = v_driver_id
        AND d.organization_id = ANY(ARRAY[v_trip_org_id, p_viewer_org_id, v_supplier_linked_id])
      ORDER BY (d.organization_id = v_trip_org_id) DESC
      LIMIT 1
    ),

    'vehicle', (
      SELECT jsonb_build_object(
        'id',                v.id,
        'vehicle_number',    v.vehicle_number,
        'vehicle_type',      v.vehicle_type,
        'capacity',          v.capacity,
        'vehicle_brand',     v.vehicle_brand,
        'vehicle_body_type', v.vehicle_body_type,
        'organization_id',   v.organization_id,
        'supplier_id',       v.supplier_id,
        'status',            v.status,
        'documents',         v.documents
      )
      FROM vehicles v
      WHERE v.id = v_vehicle_id
        AND v.organization_id = ANY(ARRAY[v_trip_org_id, p_viewer_org_id, v_supplier_linked_id])
      ORDER BY (v.organization_id = v_trip_org_id) DESC
      LIMIT 1
    ),

    'client_detail', (
      SELECT jsonb_build_object(
        'client', jsonb_build_object(
          'id',                     c.id,
          'name',                   c.name,
          'phone',                  c.phone,
          'avatar_url',             c.avatar_url,
          'avatar_seed',            c.avatar_seed,
          'linked_organization_id', c.linked_organization_id,
          'organization_id',        c.organization_id,
          'status',                 c.status
        ),
        'linked_org', CASE WHEN c.linked_organization_id IS NOT NULL THEN (
          SELECT jsonb_build_object(
            'id',       o.id,
            'name',     o.name,
            'logo_url', o.logo_url
          )
          FROM organizations o
          WHERE o.id = c.linked_organization_id
        ) ELSE NULL END
      )
      FROM clients c
      WHERE c.id = v_client_id
      LIMIT 1
    ),

    'supplier_detail', (
      SELECT jsonb_build_object(
        'supplier', jsonb_build_object(
          'id',                     s.id,
          'name',                   s.name,
          'company_name',           s.company_name,
          'phone',                  s.phone,
          'avatar_url',             s.avatar_url,
          'avatar_seed',            s.avatar_seed,
          'linked_organization_id', s.linked_organization_id,
          'organization_id',        s.organization_id
        ),
        'linked_org', CASE WHEN s.linked_organization_id IS NOT NULL THEN (
          SELECT jsonb_build_object(
            'id',       o.id,
            'name',     o.name,
            'logo_url', o.logo_url
          )
          FROM organizations o
          WHERE o.id = s.linked_organization_id
        ) ELSE NULL END
      )
      FROM suppliers s
      WHERE s.id = v_supplier_id
      LIMIT 1
    ),

    'transactions', (
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
          'id',                 tx.id,
          'organization_id',    tx.organization_id,
          'trip_id',            tx.trip_id,
          'party_name',         tx.party_name,
          'description',        tx.description,
          'amount_in',          tx.amount_in,
          'amount_out',         tx.amount_out,
          'transaction_date',   tx.transaction_date,
          'created_at',         tx.created_at,
          'contact_id',         tx.contact_id,
          'contact_type',       tx.contact_type,
          'ledger_entity_type', tx.ledger_entity_type,
          'ledger_flow_type',   tx.ledger_flow_type,
          'ledger_category',    tx.ledger_category
        ) ORDER BY tx.transaction_date DESC, tx.created_at DESC
      ), '[]'::jsonb)
      FROM (
        SELECT id, organization_id, trip_id, party_name, description,
               amount_in, amount_out, transaction_date, created_at,
               contact_id, contact_type, ledger_entity_type, ledger_flow_type, ledger_category
        FROM transactions
        WHERE trip_id = p_trip_id
          AND organization_id = ANY(ARRAY[v_trip_org_id, p_viewer_org_id])
        ORDER BY transaction_date DESC, created_at DESC
        LIMIT 50
      ) tx
    ),

    'adjustments', (
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
          'id',              a.id,
          'trip_id',         a.trip_id,
          'organization_id', a.organization_id,
          'type',            a.type,
          'impact',          a.impact,
          'amount',          a.amount,
          'reason',          a.reason,
          'mission_key',     a.mission_key,
          'created_at',      a.created_at,
          'created_by',      a.created_by,
          'voided_at',       a.voided_at,
          'void_reason',     a.void_reason
        ) ORDER BY a.created_at DESC
      ), '[]'::jsonb)
      FROM (
        SELECT id, trip_id, organization_id, type, impact, amount, reason,
               mission_key, created_at, created_by, voided_at, void_reason
        FROM trip_finance_adjustments
        WHERE trip_id = p_trip_id
          AND organization_id = ANY(ARRAY[v_trip_org_id, p_viewer_org_id])
        ORDER BY created_at DESC
        LIMIT 50
      ) a
    ),

    'documents', (
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
          'id',            td.id,
          'trip_id',       td.trip_id,
          'file_name',     td.file_name,
          'storage_path',  td.storage_path,
          'mime_type',     td.mime_type,
          'size_bytes',    td.size_bytes,
          'uploaded_at',   td.uploaded_at,
          'uploaded_by',   td.uploaded_by,
          'document_type', td.document_type
        ) ORDER BY td.uploaded_at DESC
      ), '[]'::jsonb)
      FROM (
        SELECT id, trip_id, file_name, storage_path, mime_type, size_bytes,
               uploaded_at, uploaded_by, document_type
        FROM trip_documents
        WHERE trip_id = p_trip_id
        ORDER BY uploaded_at DESC
        LIMIT 20
      ) td
    ),

    'otp', (
      SELECT jsonb_build_object(
        'code',       o.code,
        'expires_at', o.expires_at
      )
      FROM trip_otps o
      WHERE o.trip_id = p_trip_id
        AND o.expires_at > NOW()
        AND o.used_at IS NULL
      LIMIT 1
    ),

    'latest_driver_location', (
      SELECT jsonb_build_object(
        'latitude',    dl.latitude,
        'longitude',   dl.longitude,
        'accuracy',    dl.accuracy,
        'recorded_at', dl.recorded_at
      )
      FROM driver_locations dl
      WHERE dl.trip_id = p_trip_id
      ORDER BY dl.recorded_at DESC
      LIMIT 1
    )

  );
END;
$function$;

COMMENT ON FUNCTION public.get_trip_detail_bundle(uuid, uuid) IS
  'Trip detail bundle for Business App. Includes trip_operational_code and trip_code for operational display. Ground Ops viewers gated by warehouse membership; DCO operating_mode/dco_payee_id preserved.';

REVOKE ALL ON FUNCTION public.get_trip_detail_bundle(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_trip_detail_bundle(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_trip_detail_bundle(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_trip_detail_bundle(uuid, uuid) TO service_role;

COMMIT;
