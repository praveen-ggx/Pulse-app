-- =============================================================================
-- Convert admin_approve_profile / admin_reject_profile / admin_force_unlock_profile
-- from PROCEDURE to FUNCTION
-- =============================================================================
-- PostgREST's /rpc/ endpoint only resolves FUNCTIONs against its schema cache —
-- PROCEDUREs (callable only via CALL in plain SQL) are invisible to it and
-- return PGRST202 "Could not find the function" for every request, regardless
-- of grants. These three were declared as PROCEDURE in 20261101000000, making
-- them permanently unreachable from the admin console (analytics/) or any
-- other REST client — which is why that console's AdminDataProvider bypassed
-- them entirely and wrote directly to organizations instead.
-- =============================================================================

-- DROP PROCEDURE errors (42809) when the same signature is already a function.
-- Fresh replay keeps the September functions because 20261101000000 cannot
-- replace a function with a procedure. Production still has the procedures,
-- so those are dropped before the function bodies below.
DO $drop_admin_procedures$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc
    WHERE oid = to_regprocedure('public.admin_approve_profile(uuid,uuid,text)')
      AND prokind = 'p'
  ) THEN
    DROP PROCEDURE public.admin_approve_profile(uuid, uuid, text);
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc
    WHERE oid = to_regprocedure('public.admin_reject_profile(uuid,uuid,jsonb,text)')
      AND prokind = 'p'
  ) THEN
    DROP PROCEDURE public.admin_reject_profile(uuid, uuid, jsonb, text);
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc
    WHERE oid = to_regprocedure('public.admin_force_unlock_profile(uuid,uuid,text)')
      AND prokind = 'p'
  ) THEN
    DROP PROCEDURE public.admin_force_unlock_profile(uuid, uuid, text);
  END IF;
END
$drop_admin_procedures$;

-- ─────────────────────────────────────────────────────────────────────────────
-- admin_approve_profile
-- (also drops the dead `marketplace_verified` UPDATE — see 20261113 sibling fix)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_approve_profile(
  p_org_id    uuid,
  p_admin_id  uuid,
  p_notes     text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_current_status public.kyc_verification_status;
BEGIN
  SELECT verification_status INTO v_current_status
  FROM public.organizations
  WHERE id = p_org_id
  FOR UPDATE;

  IF v_current_status != 'pending' THEN
    RAISE EXCEPTION 'Profile is not PENDING. Current status: %', v_current_status;
  END IF;

  UPDATE public.organizations
  SET
    verification_status = 'verified',
    verified_at         = now(),
    verified_by         = p_admin_id,
    updated_at          = now()
  WHERE id = p_org_id;

  INSERT INTO public.verification_audit_logs
    (org_id, changed_by, previous_status, new_status, notes)
  VALUES
    (p_org_id, p_admin_id, 'pending', 'verified', p_notes);

  RETURN jsonb_build_object('ok', true, 'org_id', p_org_id, 'verification_status', 'verified');
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_approve_profile(uuid, uuid, text) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- admin_reject_profile
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_reject_profile(
  p_org_id           uuid,
  p_admin_id         uuid,
  p_rejection_reasons jsonb,
  p_notes            text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_current_status public.kyc_verification_status;
BEGIN
  IF p_rejection_reasons IS NULL
     OR jsonb_array_length(p_rejection_reasons->'checklist') = 0
  THEN
    RAISE EXCEPTION 'At least one rejection reason is required.';
  END IF;

  SELECT verification_status INTO v_current_status
  FROM public.organizations
  WHERE id = p_org_id
  FOR UPDATE;

  IF v_current_status != 'pending' THEN
    RAISE EXCEPTION 'Profile is not PENDING. Current status: %', v_current_status;
  END IF;

  UPDATE public.organizations
  SET
    verification_status  = 'rejected',
    frozen_at             = NULL,
    rejection_reasons     = p_rejection_reasons,
    kyc_rejected_reason   = p_rejection_reasons->>'notes',
    updated_at            = now()
  WHERE id = p_org_id;

  INSERT INTO public.verification_audit_logs
    (org_id, changed_by, previous_status, new_status, rejection_reasons, notes)
  VALUES
    (p_org_id, p_admin_id, 'pending', 'rejected', p_rejection_reasons, p_notes);

  RETURN jsonb_build_object('ok', true, 'org_id', p_org_id, 'verification_status', 'rejected');
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_reject_profile(uuid, uuid, jsonb, text) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- admin_force_unlock_profile
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_force_unlock_profile(
  p_org_id   uuid,
  p_admin_id uuid,
  p_reason   text
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_current_status public.kyc_verification_status;
BEGIN
  IF p_reason IS NULL OR TRIM(p_reason) = '' THEN
    RAISE EXCEPTION 'A reason is required for force-unlock.';
  END IF;

  SELECT verification_status INTO v_current_status
  FROM public.organizations
  WHERE id = p_org_id
  FOR UPDATE;

  IF v_current_status != 'verified' THEN
    RAISE EXCEPTION 'Force-unlock is only valid on VERIFIED profiles. Current: %', v_current_status;
  END IF;

  UPDATE public.organizations
  SET
    verification_status = 'unverified',
    frozen_at           = NULL,
    verified_at         = NULL,
    verified_by         = NULL,
    updated_at          = now()
  WHERE id = p_org_id;

  INSERT INTO public.verification_audit_logs
    (org_id, changed_by, previous_status, new_status, notes)
  VALUES
    (p_org_id, p_admin_id, 'verified', 'unverified',
     'force_unlock: ' || TRIM(p_reason));

  RETURN jsonb_build_object('ok', true, 'org_id', p_org_id, 'verification_status', 'unverified');
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_force_unlock_profile(uuid, uuid, text) TO service_role;
