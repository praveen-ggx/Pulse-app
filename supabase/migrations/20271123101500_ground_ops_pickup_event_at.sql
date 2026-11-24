-- Ground Ops Simulate Trip: optional stage clock (same picker as Trip Ops).
-- p_event_at is the client-selected Pickup / In-transit date-time. When null,
-- behaviour stays wall-clock now() for older clients.
--
-- Drop + recreate both overloads so SQL Editor re-runs are idempotent
-- (preprod may already have the 3-arg form from an earlier paste).
-- DEFAULT NULL on p_event_at keeps two-arg RPC calls working.
--
-- String literals use $tag$...$tag$ so Supabase SQL Editor paste does not
-- break on nested quotes (lock_timeout '5s', trip''s, RAISE 'Not ...').

BEGIN;

SET LOCAL lock_timeout = 5000;

DROP FUNCTION IF EXISTS public.simulate_ground_ops_pickup_status(uuid, text);
DROP FUNCTION IF EXISTS public.simulate_ground_ops_pickup_status(uuid, text, timestamptz);

CREATE FUNCTION public.simulate_ground_ops_pickup_status(
  p_trip_id uuid,
  p_new_status text,
  p_event_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  v_trip trips%ROWTYPE;
  v_member organization_members%ROWTYPE;
  v_missing text[];
  v_user_name text;
  v_from_status text;
  v_bisim_entry text;
  v_event_at timestamptz;
  v_event_iso text;
  v_edited_iso text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION $e$Not authenticated$e$;
  END IF;

  IF p_new_status NOT IN ($e$in_progress$e$, $e$in_transit$e$) THEN
    RAISE EXCEPTION $e$Invalid status for ground_ops pickup simulation: %$e$, p_new_status;
  END IF;

  SELECT * INTO v_trip FROM trips WHERE id = p_trip_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION $e$Trip not found$e$;
  END IF;

  SELECT * INTO v_member
  FROM organization_members
  WHERE organization_id = v_trip.organization_id
    AND user_id = v_uid
    AND status = $e$active$e$
    AND COALESCE(permissions ->> $e$platformRole$e$, $e$$e$) = $e$ground_ops$e$;
  IF NOT FOUND THEN
    RAISE EXCEPTION $e$Only an active ground_ops member of this trip organization can do this$e$;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM organization_member_warehouses omw
    JOIN indents i ON i.id = v_trip.indent_id
    WHERE omw.organization_member_id = v_member.id
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
  ) THEN
    RAISE EXCEPTION $e$This trip is not at one of your assigned warehouses$e$;
  END IF;

  IF p_new_status = $e$in_progress$e$ AND v_trip.status NOT IN ($e$draft$e$, $e$assigned$e$) THEN
    RAISE EXCEPTION $e$Cannot mark reached-pickup from status %$e$, v_trip.status;
  END IF;
  IF p_new_status = $e$in_transit$e$ AND v_trip.status <> $e$in_progress$e$ THEN
    RAISE EXCEPTION $e$Cannot mark loaded/departed from status %$e$, v_trip.status;
  END IF;

  IF p_new_status = $e$in_transit$e$ THEN
    v_missing := public.ground_ops_missing_mandatory_documents(p_trip_id, v_trip.organization_id);
    IF array_length(v_missing, 1) > 0 THEN
      RETURN jsonb_build_object(
        $e$ok$e$, false,
        $e$error$e$, $e$missing_mandatory_documents$e$,
        $e$missing_document_types$e$, to_jsonb(v_missing)
      );
    END IF;
  END IF;

  v_from_status := v_trip.status;
  SELECT COALESCE(NULLIF(TRIM(p.full_name), $e$$e$), $e$Ground Ops$e$) INTO v_user_name
  FROM profiles p WHERE p.id = v_uid;

  v_event_at := COALESCE(p_event_at, now());
  -- Build ISO by concatenation (no "T"/"Z" inside to_char). Supabase SQL Editor
  -- has rewritten ASCII quotes to U+201C/U+201D, which then get stored in notes
  -- and break Date.parse / Journey clocks.
  v_event_iso :=
    to_char(v_event_at AT TIME ZONE $e$utc$e$, $e$YYYY-MM-DD$e$)
    || $e$T$e$
    || to_char(v_event_at AT TIME ZONE $e$utc$e$, $e$HH24:MI:SS.MS$e$)
    || $e$Z$e$;
  -- Save clock (actual edit time) — same trailing field Trip Ops appendBisimNote writes.
  v_edited_iso :=
    to_char(now() AT TIME ZONE $e$utc$e$, $e$YYYY-MM-DD$e$)
    || $e$T$e$
    || to_char(now() AT TIME ZONE $e$utc$e$, $e$HH24:MI:SS.MS$e$)
    || $e$Z$e$;

  -- [BISIM|{status}|{stageIso}|{lat}|{lng}|{userName}|{fromStatus}|{place}|{editedAt}]
  v_bisim_entry :=
    $e$[BISIM|$e$ || p_new_status || $e$|$e$ || v_event_iso
    || $e$|||$e$ || v_user_name || $e$|$e$ || v_from_status
    || $e$||$e$ || v_edited_iso || $e$]$e$;

  UPDATE trips
  SET
    status = p_new_status,
    status_change_origin = $e$business_simulated$e$,
    started_at = CASE
      WHEN p_new_status = $e$in_progress$e$ AND started_at IS NULL THEN v_event_at
      ELSE started_at
    END,
    notes = CASE
      WHEN COALESCE(TRIM(notes), $e$$e$) = $e$$e$ THEN v_bisim_entry
      ELSE notes || chr(10) || v_bisim_entry
    END,
    updated_at = now()
  WHERE id = p_trip_id;

  RETURN jsonb_build_object($e$ok$e$, true, $e$status$e$, p_new_status);
END;
$fn$;

REVOKE ALL ON FUNCTION public.simulate_ground_ops_pickup_status(uuid, text, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.simulate_ground_ops_pickup_status(uuid, text, timestamptz) TO authenticated;

COMMIT;
