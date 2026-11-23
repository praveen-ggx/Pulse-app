-- Cross-org driver phone block: auto-release a stale unclaimed row.
--
-- idx_drivers_phone_normalised allows ONE unclaimed active row per phone
-- across all orgs. When org A's old row (never claimed, no live trip) held
-- the phone, org B could not assign/add/invite that driver ("pending driver
-- entry in another organization") and nobody had a UI to release it.
--
-- release_stale_driver_phone_row() ends such a row (left_at = now()) so the
-- caller can proceed. It never touches: a claimed row (user_id set), a row
-- with any non-terminal trip, a row with a live pending invite, or the
-- caller's own org. Those cases still hit the original error.
-- Callers must already hold lock_driver_phone(last10).

CREATE OR REPLACE FUNCTION public.release_stale_driver_phone_row(p_last10 text, p_requesting_org_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.drivers d
  SET left_at = now(), updated_at = now()
  WHERE d.phone_normalised = p_last10
    AND d.user_id IS NULL
    AND d.left_at IS NULL
    AND d.organization_id IS DISTINCT FROM p_requesting_org_id
    AND NOT EXISTS (
      SELECT 1 FROM public.trips t
      WHERE t.driver_id = d.id
        AND lower(trim(coalesce(t.status::text, ''))) NOT IN ('completed', 'cancelled', 'done', 'delivered')
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.driver_invites i
      WHERE i.driver_id = d.id AND i.status = 'pending' AND i.expires_at > now()
    );
$$;

REVOKE ALL ON FUNCTION public.release_stale_driver_phone_row(text, uuid) FROM PUBLIC, anon, authenticated;


CREATE OR REPLACE FUNCTION public.assign_aggregate_trip_driver(p_trip_id uuid, p_driver_org_id uuid, p_driver_phone text, p_vehicle_display_number text DEFAULT NULL::text, p_vehicle_id uuid DEFAULT NULL::uuid, p_driver_name text DEFAULT NULL::text, p_execution_type text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_trip       public.trips%ROWTYPE;
  v_driver     public.drivers%ROWTYPE;
  v_phone_norm text;
  v_last10     text;
  v_driver_name text;
  v_profile_id uuid;
  v_profile_match_count int;
  v_status     text;
  v_name_arg   text;
  v_execution_type_arg text;
BEGIN
  v_name_arg := nullif(trim(coalesce(p_driver_name, '')), '');
  v_execution_type_arg := nullif(upper(trim(coalesce(p_execution_type, ''))), '');
  IF v_execution_type_arg IS NOT NULL AND v_execution_type_arg NOT IN ('ASSET', 'AGGREGATE') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Invalid execution_type -- must be ASSET or AGGREGATE');
  END IF;
  v_phone_norm := trim(regexp_replace(coalesce(p_driver_phone, ''), '\s+', '', 'g'));
  IF length(v_phone_norm) < 10 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Phone required (at least 10 digits)');
  END IF;
  v_last10 := regexp_replace(v_phone_norm, '\D', '', 'g');
  IF length(v_last10) >= 10 THEN
    v_last10 := right(v_last10, 10);
  ELSE
    v_last10 := v_phone_norm;
  END IF;
  SELECT * INTO v_trip FROM public.trips WHERE id = p_trip_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Trip not found');
  END IF;
  IF lower(trim(coalesce(v_trip.status::text, ''))) IN ('completed', 'delivered', 'done')
     OR v_trip.completed_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Cannot change driver or vehicle after the trip is completed.'
    );
  END IF;
  IF NOT (
    public.is_org_member(v_trip.organization_id)
    OR EXISTS (
      SELECT 1 FROM public.suppliers s
      WHERE s.id = v_trip.supplier_id
        AND s.linked_organization_id IS NOT NULL
        AND public.is_org_member(s.linked_organization_id)
    )
    OR public.is_org_member(p_driver_org_id)
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authorized to assign this trip');
  END IF;
  IF p_vehicle_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM public.trips t
      WHERE t.vehicle_id = p_vehicle_id
        AND t.id <> p_trip_id
        AND lower(trim(coalesce(t.status::text, ''))) NOT IN (
          'completed', 'cancelled', 'done', 'delivered'
        )
    ) THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error',
        'Vehicle is already assigned to another active trip. Complete or unassign that trip first.'
      );
    END IF;
  END IF;
  SELECT * INTO v_driver
  FROM public.drivers
  WHERE organization_id = p_driver_org_id
    AND (
      phone = v_phone_norm
      OR right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 10) = v_last10
    )
  ORDER BY CASE WHEN phone = v_phone_norm THEN 0 ELSE 1 END
  LIMIT 1;
  IF NOT FOUND THEN
    -- idx_drivers_phone_normalised has no org scope -- serialize on the
    -- phone number globally, via the SAME lock namespace every other
    -- driver-by-phone creation path uses.
    PERFORM public.lock_driver_phone(v_last10);

    -- Re-check this org after acquiring the lock, in case a concurrent call
    -- for the SAME org just inserted a matching row.
    SELECT * INTO v_driver
    FROM public.drivers
    WHERE organization_id = p_driver_org_id
      AND (
        phone = v_phone_norm
        OR right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 10) = v_last10
      )
    ORDER BY CASE WHEN phone = v_phone_norm THEN 0 ELSE 1 END
    LIMIT 1;

    IF NOT FOUND THEN
      SELECT count(*) INTO v_profile_match_count
      FROM public.profiles p
      WHERE coalesce(p.role, '') = 'driver'
        AND p.phone IS NOT NULL
        AND length(regexp_replace(p.phone, '\D', '', 'g')) >= 10
        AND right(regexp_replace(p.phone, '\D', '', 'g'), 10) = v_last10;
      IF v_profile_match_count = 1 THEN
        SELECT p.id, nullif(trim(coalesce(p.full_name, '')), '')
          INTO v_profile_id, v_driver_name
        FROM public.profiles p
        WHERE coalesce(p.role, '') = 'driver'
          AND p.phone IS NOT NULL
          AND length(regexp_replace(p.phone, '\D', '', 'g')) >= 10
          AND right(regexp_replace(p.phone, '\D', '', 'g'), 10) = v_last10;
      ELSE
        v_profile_id := NULL;
        v_driver_name := NULL;
      END IF;
      v_driver_name := coalesce(v_name_arg, nullif(trim(coalesce(v_driver_name, '')), ''), 'Driver');

      IF v_profile_id IS NULL THEN
        -- Release a stale other-org unclaimed row first; block only if it is live.
        PERFORM public.release_stale_driver_phone_row(v_last10, p_driver_org_id);
        IF EXISTS (
          SELECT 1 FROM public.drivers d
          WHERE d.phone_normalised = v_last10
            AND d.user_id IS NULL
            AND d.left_at IS NULL
        ) THEN
          RETURN jsonb_build_object(
            'ok', false,
            'error', 'This phone number already has a pending driver entry in another organization. Ask that organization to link or remove it before assigning here.'
          );
        END IF;
      END IF;

      INSERT INTO public.drivers (
        organization_id, name, phone, user_id, status, tracking_only,
        relationship_origin, relationship_status
      )
      VALUES (
        p_driver_org_id, v_driver_name, v_phone_norm, v_profile_id, 'offline', true,
        'phone_assignment', 'independent'
      )
      ON CONFLICT (phone_normalised) WHERE (phone_normalised IS NOT NULL AND user_id IS NULL AND left_at IS NULL)
      DO NOTHING
      RETURNING * INTO v_driver;

      IF v_driver.id IS NULL THEN
        SELECT * INTO v_driver
        FROM public.drivers
        WHERE organization_id = p_driver_org_id
          AND (
            phone = v_phone_norm
            OR right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 10) = v_last10
          )
        LIMIT 1;
        IF NOT FOUND THEN
          RETURN jsonb_build_object(
            'ok', false,
            'error', 'This phone number already has a pending driver entry in another organization. Ask that organization to link or remove it before assigning here.'
          );
        END IF;
      END IF;
    END IF;
  ELSIF v_name_arg IS NOT NULL
        AND (
          v_driver.tracking_only IS TRUE
          OR coalesce(trim(v_driver.name), '') IN ('', 'Driver', '—')
        )
        AND coalesce(trim(v_driver.name), '') IS DISTINCT FROM v_name_arg THEN
    UPDATE public.drivers
    SET name = v_name_arg, updated_at = now()
    WHERE id = v_driver.id
    RETURNING * INTO v_driver;
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.trips t
    WHERE t.driver_id = v_driver.id
      AND t.id <> p_trip_id
      AND lower(trim(coalesce(t.status::text, ''))) NOT IN ('completed', 'cancelled', 'done', 'delivered')
  ) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error',
      'Driver is already assigned to another active trip. Complete or unassign that trip first.'
    );
  END IF;
  v_status := lower(trim(coalesce(v_trip.status::text, '')));
  UPDATE public.trips
  SET
    driver_id = v_driver.id,
    vehicle_id = CASE
      WHEN p_vehicle_id IS NOT NULL THEN p_vehicle_id
      ELSE vehicle_id
    END,
    vehicle_display_number = CASE
      WHEN p_vehicle_id IS NOT NULL THEN NULL
      WHEN p_vehicle_display_number IS NOT NULL AND trim(p_vehicle_display_number) <> '' THEN trim(p_vehicle_display_number)
      ELSE vehicle_display_number
    END,
    execution_type = CASE
      WHEN v_execution_type_arg IS NOT NULL AND execution_type IS NULL THEN v_execution_type_arg
      ELSE execution_type
    END,
    status = CASE
      WHEN v_trip.started_at IS NOT NULL THEN v_trip.status
      WHEN v_trip.completed_at IS NOT NULL THEN v_trip.status
      WHEN v_status IN (
        'in_transit', 'in_progress', 'intransit', 'transit', 'picked_up', 'pickup',
        'at_pickup', 'at_drop', 'loading', 'unloading', 'dispatched', 'on_route',
        'going_to_pickup', 'moving', 'started', 's_in', 's_out', 'd_in', 'd_out',
        'pod_pending', 'arrived', 'at_destination'
      ) THEN v_trip.status
      WHEN v_status IN ('pending', 'assigned', 'draft', 'confirmed') OR v_status = '' THEN 'assigned'
      ELSE v_trip.status
    END,
    updated_at = now()
  WHERE id = p_trip_id;
  IF v_driver.user_id IS NULL THEN
    PERFORM public.generate_trip_otp(p_trip_id, 15);
  END IF;
  SELECT * INTO v_trip FROM public.trips WHERE id = p_trip_id;
  RETURN jsonb_build_object(
    'ok', true,
    'trip', to_jsonb(v_trip),
    'driver_id', v_driver.id,
    'driver_linked', v_driver.user_id IS NOT NULL
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_driver_direct(
  p_org_id uuid,
  p_name text,
  p_phone text,
  p_email text DEFAULT NULL,
  p_payable_amount numeric DEFAULT NULL,
  p_commission_percent numeric DEFAULT NULL,
  p_commission_per_km numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_name        text := coalesce(nullif(trim(p_name), ''), '—');
  v_phone_norm  text := nullif(trim(coalesce(p_phone, '')), '');
  v_email       text := nullif(trim(coalesce(p_email, '')), '');
  v_last10      text;
  v_driver      public.drivers%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;
  IF NOT public.is_org_member(p_org_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not a member of this organization');
  END IF;

  IF v_phone_norm IS NOT NULL THEN
    v_last10 := public.normalise_phone(v_phone_norm);
  END IF;

  -- Reconnect a LEFT driver in this org with the same phone (unchanged intent).
  IF v_last10 IS NOT NULL AND length(v_last10) >= 10 THEN
    SELECT * INTO v_driver
    FROM public.drivers
    WHERE organization_id = p_org_id
      AND left_at IS NOT NULL
      AND phone IS NOT NULL
      AND public.normalise_phone(phone) = v_last10
    ORDER BY left_at DESC
    LIMIT 1;

    IF FOUND THEN
      UPDATE public.drivers
      SET name = v_name,
          phone = v_phone_norm,
          email = v_email,
          left_at = NULL,
          payable_amount = p_payable_amount,
          commission_percent = p_commission_percent,
          commission_per_km = p_commission_per_km,
          updated_at = now()
      WHERE id = v_driver.id
      RETURNING * INTO v_driver;
      RETURN jsonb_build_object('ok', true, 'driver', to_jsonb(v_driver), 'reconnected', true);
    END IF;
  END IF;

  -- No usable phone: nothing can collide with the partial index. Insert directly.
  IF v_last10 IS NULL OR length(v_last10) < 10 THEN
    INSERT INTO public.drivers (
      organization_id, name, phone, email, status,
      payable_amount, commission_percent, commission_per_km,
      relationship_origin, relationship_status
    )
    VALUES (
      p_org_id, v_name, v_phone_norm, v_email, 'offline',
      p_payable_amount, p_commission_percent, p_commission_per_km,
      'manual_add', 'independent'
    )
    RETURNING * INTO v_driver;
    RETURN jsonb_build_object('ok', true, 'driver', to_jsonb(v_driver), 'reconnected', false);
  END IF;

  PERFORM public.lock_driver_phone(v_last10);

  -- Re-check same-org ACTIVE row after lock: idempotent add, not a 23505.
  SELECT * INTO v_driver
  FROM public.drivers
  WHERE organization_id = p_org_id
    AND left_at IS NULL
    AND phone_normalised = v_last10
  LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', true, 'driver', to_jsonb(v_driver), 'reconnected', false);
  END IF;

  -- Release a stale other-org unclaimed row first; block only if it is live.
  PERFORM public.release_stale_driver_phone_row(v_last10, p_org_id);
  IF EXISTS (
    SELECT 1 FROM public.drivers d
    WHERE d.phone_normalised = v_last10
      AND d.user_id IS NULL
      AND d.left_at IS NULL
  ) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'This phone number already has a pending driver entry in another organization. Ask that organization to link or remove it before adding here.'
    );
  END IF;

  INSERT INTO public.drivers (
    organization_id, name, phone, email, status,
    payable_amount, commission_percent, commission_per_km,
    relationship_origin, relationship_status
  )
  VALUES (
    p_org_id, v_name, v_phone_norm, v_email, 'offline',
    p_payable_amount, p_commission_percent, p_commission_per_km,
    'manual_add', 'independent'
  )
  ON CONFLICT (phone_normalised) WHERE (phone_normalised IS NOT NULL AND user_id IS NULL AND left_at IS NULL)
  DO NOTHING
  RETURNING * INTO v_driver;

  IF v_driver.id IS NULL THEN
    SELECT * INTO v_driver
    FROM public.drivers
    WHERE organization_id = p_org_id AND left_at IS NULL AND phone_normalised = v_last10
    LIMIT 1;
    IF NOT FOUND THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error', 'This phone number already has a pending driver entry in another organization. Ask that organization to link or remove it before adding here.'
      );
    END IF;
    RETURN jsonb_build_object('ok', true, 'driver', to_jsonb(v_driver), 'reconnected', false);
  END IF;

  RETURN jsonb_build_object('ok', true, 'driver', to_jsonb(v_driver), 'reconnected', false);
END;
$function$;

CREATE OR REPLACE FUNCTION public.ensure_driver_row_by_phone_insert(
  p_org_id uuid,
  p_name text,
  p_phone text,
  p_user_id uuid,
  p_tracking_only boolean,
  p_commission_percent numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_phone_norm text := nullif(trim(coalesce(p_phone, '')), '');
  v_last10     text;
  v_driver     public.drivers%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;
  IF NOT public.is_org_member(p_org_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not a member of this organization');
  END IF;
  IF v_phone_norm IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Phone is required');
  END IF;
  v_last10 := public.normalise_phone(v_phone_norm);

  -- Only the user_id IS NULL path can ever hit idx_drivers_phone_normalised.
  IF p_user_id IS NULL AND length(coalesce(v_last10, '')) >= 10 THEN
    PERFORM public.lock_driver_phone(v_last10);

    -- Re-check same org after lock (mirrors the TS caller's own pre-check,
    -- closes the window between its read and this insert).
    SELECT * INTO v_driver
    FROM public.drivers
    WHERE organization_id = p_org_id
      AND left_at IS NULL
      AND (phone = v_phone_norm OR phone_normalised = v_last10)
    LIMIT 1;
    IF FOUND THEN
      RETURN jsonb_build_object('ok', true, 'driver', to_jsonb(v_driver));
    END IF;

    -- Release a stale other-org unclaimed row first; block only if it is live.
    PERFORM public.release_stale_driver_phone_row(v_last10, p_org_id);
    IF EXISTS (
      SELECT 1 FROM public.drivers d
      WHERE d.phone_normalised = v_last10 AND d.user_id IS NULL AND d.left_at IS NULL
    ) THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error', 'This phone number already has a pending driver entry in another organization. Ask that organization to link or remove it before assigning here.'
      );
    END IF;
  END IF;

  INSERT INTO public.drivers (
    organization_id, name, phone, user_id, status, tracking_only,
    relationship_origin, relationship_status, commission_percent
  )
  VALUES (
    p_org_id,
    coalesce(nullif(trim(p_name), ''), 'Driver'),
    v_phone_norm,
    p_user_id,
    'offline',
    coalesce(p_tracking_only, false),
    'phone_assignment',
    'independent',
    CASE WHEN coalesce(p_commission_percent, 0) > 0 THEN p_commission_percent ELSE NULL END
  )
  ON CONFLICT (phone_normalised) WHERE (phone_normalised IS NOT NULL AND user_id IS NULL AND left_at IS NULL)
  DO NOTHING
  RETURNING * INTO v_driver;

  IF v_driver.id IS NULL THEN
    SELECT * INTO v_driver
    FROM public.drivers
    WHERE organization_id = p_org_id AND left_at IS NULL AND phone_normalised = v_last10
    LIMIT 1;
    IF NOT FOUND THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error', 'This phone number already has a pending driver entry in another organization. Ask that organization to link or remove it before assigning here.'
      );
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', true, 'driver', to_jsonb(v_driver));
END;
$function$;

CREATE OR REPLACE FUNCTION public.invite_driver(
  p_phone text,
  p_name text,
  p_org_id uuid,
  p_email text DEFAULT NULL,
  p_payable_amount numeric DEFAULT NULL,
  p_commission_percent numeric DEFAULT NULL,
  p_commission_per_km numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_phone_norm text := public.normalise_phone(p_phone);
  v_driver     public.drivers%ROWTYPE;
  v_invite_id  uuid;
  v_org_name   text;
  v_name       text := coalesce(nullif(trim(p_name), ''), 'Driver');
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;
  IF NOT public.is_org_member(p_org_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not a member of this organization');
  END IF;
  IF length(coalesce(v_phone_norm, '')) < 10 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Valid phone required');
  END IF;

  PERFORM public.lock_driver_phone(v_phone_norm);

  SELECT * INTO v_driver
  FROM public.drivers
  WHERE phone_normalised = v_phone_norm
    AND organization_id = p_org_id
    AND left_at IS NULL
  ORDER BY created_at DESC
  LIMIT 1;

  IF FOUND THEN
    -- Reuse the existing row; refresh the same fields the removed client-side
    -- block used to update. relationship_origin is write-once -- untouched.
    UPDATE public.drivers
    SET name = v_name,
        phone = coalesce(nullif(trim(p_phone), ''), phone),
        email = nullif(trim(coalesce(p_email, '')), ''),
        status = 'offline',
        payable_amount = p_payable_amount,
        commission_percent = p_commission_percent,
        commission_per_km = p_commission_per_km,
        updated_at = now()
    WHERE id = v_driver.id
    RETURNING * INTO v_driver;
  ELSE
    -- Release a stale other-org unclaimed row first; block only if it is live.
    PERFORM public.release_stale_driver_phone_row(v_phone_norm, p_org_id);
    IF EXISTS (
      SELECT 1 FROM public.drivers d
      WHERE d.phone_normalised = v_phone_norm AND d.user_id IS NULL AND d.left_at IS NULL
    ) THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error', 'This phone number already has a pending driver entry in another organization. Ask that organization to link or remove it before inviting here.'
      );
    END IF;

    INSERT INTO public.drivers (name, phone, organization_id, status, email, payable_amount, commission_percent, commission_per_km)
    VALUES (
      v_name,
      nullif(trim(p_phone), ''),
      p_org_id,
      'offline',
      nullif(trim(coalesce(p_email, '')), ''),
      p_payable_amount,
      p_commission_percent,
      p_commission_per_km
    )
    ON CONFLICT (phone_normalised) WHERE (phone_normalised IS NOT NULL AND user_id IS NULL AND left_at IS NULL)
    DO NOTHING
    RETURNING * INTO v_driver;

    IF v_driver.id IS NULL THEN
      SELECT * INTO v_driver
      FROM public.drivers
      WHERE phone_normalised = v_phone_norm AND organization_id = p_org_id AND left_at IS NULL
      LIMIT 1;
      IF NOT FOUND THEN
        RETURN jsonb_build_object(
          'ok', false,
          'error', 'This phone number already has a pending driver entry in another organization. Ask that organization to link or remove it before inviting here.'
        );
      END IF;
    END IF;
  END IF;

  UPDATE public.driver_invites
  SET status = 'expired'
  WHERE driver_id = v_driver.id
    AND status = 'pending'
    AND to_user_id IS NULL;

  SELECT name INTO v_org_name FROM public.organizations WHERE id = p_org_id;

  INSERT INTO public.driver_invites (
    driver_id,
    from_organization_id,
    phone_normalised,
    invited_by,
    to_user_id,
    invitee_name,
    from_org_name,
    status,
    expires_at
  )
  VALUES (
    v_driver.id,
    p_org_id,
    v_phone_norm,
    auth.uid(),
    NULL,
    v_name,
    coalesce(v_org_name, 'Company'),
    'pending',
    now() + interval '7 days'
  )
  RETURNING id INTO v_invite_id;

  RETURN jsonb_build_object('ok', true, 'driver', to_jsonb(v_driver), 'invite_id', v_invite_id);
END;
$function$;
