-- Fleet disconnect: notify fleet org (inbox only) + gate DCO request until
-- the driver has left every active fleet-employee seat.
-- Admin approve already refuses while employed (20271005120000).

SET LOCAL lock_timeout = '5s';

-- ── Allow driver_disconnected in the org network inbox ────────────────────
ALTER TABLE public.network_notifications
  DROP CONSTRAINT IF EXISTS network_notifications_event_type_chk;

ALTER TABLE public.network_notifications
  ADD CONSTRAINT network_notifications_event_type_chk CHECK (
    event_type = ANY (ARRAY[
      'indent_created'::text,
      'bid_received'::text,
      'awarded'::text,
      'quote_requested'::text,
      'counter_offered'::text,
      'driver_disconnected'::text
    ])
  );

-- ── leave_fleet: disconnect + notify fleet owner (notification alone) ─────
CREATE OR REPLACE FUNCTION public.leave_fleet(p_organization_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := (select auth.uid());
  v_updated int;
  v_driver_id uuid;
  v_driver_name text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organization_id required';
  END IF;

  UPDATE public.drivers
  SET left_at = now(),
      relationship_status = 'disconnected'
  WHERE organization_id = p_organization_id
    AND user_id = v_uid
    AND left_at IS NULL
  RETURNING id INTO v_driver_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RAISE EXCEPTION 'No active driver link found for this organization';
  END IF;

  -- Soft-close any driver membership so employment predicates stay consistent.
  UPDATE public.organization_members
  SET status = 'inactive',
      updated_at = now()
  WHERE organization_id = p_organization_id
    AND user_id = v_uid
    AND role = 'driver'
    AND status = 'active';

  SELECT COALESCE(
    NULLIF(TRIM(COALESCE(p.full_name, '')), ''),
    NULLIF(TRIM(COALESCE(d.name, '')), ''),
    'Driver'
  )
  INTO v_driver_name
  FROM public.profiles p
  LEFT JOIN public.drivers d ON d.id = v_driver_id
  WHERE p.id = v_uid;

  PERFORM public.emit_network_notification(
    p_organization_id,
    NULL,
    'driver_disconnected',
    COALESCE(v_driver_name, 'Driver') || ' disconnected from your fleet',
    'They left the fleet. Settle any pending payments offline if needed.',
    NULL,
    NULL,
    NULL,
    NULL,
    'driver_disconnected:' || v_driver_id::text || ':' || floor(extract(epoch from now()))::bigint::text,
    jsonb_build_object(
      'driver_user_id', v_uid,
      'driver_id', v_driver_id,
      'organization_id', p_organization_id
    )
  );

  BEGIN
    PERFORM public.record_activity(
      'driver.left_fleet',
      'user',
      v_uid,
      COALESCE(v_driver_name, 'Driver'),
      'organization',
      p_organization_id,
      NULL,
      NULL,
      p_organization_id,
      jsonb_build_object('driver_id', v_driver_id),
      false
    );
  EXCEPTION
    WHEN undefined_function THEN
      NULL;
    WHEN OTHERS THEN
      NULL;
  END;
END;
$function$;

COMMENT ON FUNCTION public.leave_fleet(uuid) IS
  'Driver leaves a fleet: sets left_at + disconnected, soft-closes driver membership, and notifies the fleet org (network inbox).';

REVOKE ALL ON FUNCTION public.leave_fleet(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.leave_fleet(uuid) TO authenticated;

-- ── DCO request only after fleet disconnect (admin still must approve) ────
CREATE OR REPLACE FUNCTION public.request_dco_status()
RETURNS public.dco_profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := (select auth.uid());
  v_row public.dco_profiles;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = v_uid AND p.role = 'driver'
  ) THEN
    RAISE EXCEPTION 'unauthorized: DCO status can only be requested by a driver-role profile';
  END IF;

  IF public._is_active_employee_driver(v_uid) THEN
    RAISE EXCEPTION
      'employment_conflict: leave your active fleet before requesting DCO status';
  END IF;

  INSERT INTO public.dco_profiles (user_id, status, requested_at)
  VALUES (v_uid, 'PENDING', now())
  ON CONFLICT (user_id) DO UPDATE SET
    status = 'PENDING',
    requested_at = now(),
    reviewed_at = NULL,
    reviewed_by = NULL,
    decision_reason = NULL,
    updated_at = now()
  WHERE public.dco_profiles.status = 'REJECTED'
  RETURNING * INTO v_row;

  IF v_row.user_id IS NULL THEN
    SELECT * INTO v_row FROM public.dco_profiles WHERE user_id = v_uid;
    RAISE EXCEPTION
      'invalid_state: a DCO request already exists with status % -- cannot re-request',
      v_row.status;
  END IF;

  RETURN v_row;
END;
$function$;

COMMENT ON FUNCTION public.request_dco_status() IS
  'Driver requests DCO status (PENDING). Refuses while still an active fleet employee; admin approve remains a separate gate.';

REVOKE ALL ON FUNCTION public.request_dco_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_dco_status() TO authenticated;
