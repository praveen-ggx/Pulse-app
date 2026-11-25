-- DCO: approve first, leave the fleet after.
--
-- Before: a driver had to leave their fleet BEFORE submitting a DCO request,
-- and admin could not approve while they were still employed. A rejected
-- driver had already quit their job.
--
-- Now:
--   1. request_dco_status   — allowed while still an employee driver.
--   2. platform_approve_dco — still employed → DOCS_APPROVED (approved, waiting
--                             for the driver to leave); not employed → APPROVED.
--   3. Leaving the fleet    — DOCS_APPROVED flips to APPROVED automatically
--                             (triggers on drivers / organization_members, plus
--                             activate_my_dco() as a driver-side safety net).
--   4. platform_reject_dco  — can also withdraw a DOCS_APPROVED approval.
--
-- DOCS_APPROVED is deliberately NOT a DCO status: is_dco_eligible,
-- _holds_dco_status and get_my_driver_operating_mode only treat APPROVED /
-- SUSPENDED as DCO, so the driver stays a normal fleet driver (no marketplace,
-- no DCO trips, no employee/DCO conflict) until they actually leave.
--
-- Driver push: DCO decisions are queued in chat_push_outbox (the existing
-- send-push-notifications cron), so the chat-only columns become nullable.
-- Push is best-effort and never blocks the decision.

-- ── 0. Status value ──────────────────────────────────────────────────────────
DO $$
DECLARE
  v_name text;
BEGIN
  FOR v_name IN
    SELECT c.conname
    FROM pg_constraint c
    WHERE c.conrelid = 'public.dco_profiles'::regclass
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE public.dco_profiles DROP CONSTRAINT %I', v_name);
  END LOOP;
END
$$;

ALTER TABLE public.dco_profiles
  ADD CONSTRAINT dco_profiles_status_check
  CHECK (status IN ('PENDING', 'DOCS_APPROVED', 'APPROVED', 'REJECTED', 'SUSPENDED'));

-- ── 1. Push outbox: allow non-chat rows ──────────────────────────────────────
ALTER TABLE public.chat_push_outbox ALTER COLUMN organization_id DROP NOT NULL;
ALTER TABLE public.chat_push_outbox ALTER COLUMN conversation_id DROP NOT NULL;
ALTER TABLE public.chat_push_outbox ALTER COLUMN message_id DROP NOT NULL;

CREATE OR REPLACE FUNCTION public._enqueue_user_push(
  p_user_id uuid,
  p_title   text,
  p_body    text,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF p_user_id IS NULL THEN
    RETURN;
  END IF;
  INSERT INTO public.chat_push_outbox (user_id, title, body, payload)
  VALUES (p_user_id, coalesce(p_title, ''), coalesce(p_body, ''), coalesce(p_payload, '{}'::jsonb));
EXCEPTION
  WHEN OTHERS THEN
    -- Best-effort: a push problem must never undo a DCO decision.
    NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public._enqueue_user_push(uuid, text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._enqueue_user_push(uuid, text, text, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public._enqueue_user_push(uuid, text, text, jsonb) FROM authenticated;

-- ── 2. Request: no longer requires leaving the fleet first ──────────────────
CREATE OR REPLACE FUNCTION public.request_dco_status()
RETURNS public.dco_profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := (select auth.uid());
  v_row public.dco_profiles;
  v_kyc text;
  v_missing text;
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

  v_kyc := public._driver_kyc_review_status(v_uid);
  IF v_kyc NOT IN ('submitted', 'approved') THEN
    RAISE EXCEPTION
      'kyc_required: upload your identity documents and submit them for verification before requesting DCO status (kyc status: %)',
      v_kyc;
  END IF;

  v_missing := public._dco_kyc_outstanding_docs(v_uid, false);
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION
      'dco_documents_required: upload these documents before requesting DCO status (%)',
      v_missing;
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
  'Driver requests DCO status (PENDING). Allowed while still a fleet employee (they leave after approval). Requires driver KYC submitted and DCO documents uploaded.';

REVOKE ALL ON FUNCTION public.request_dco_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_dco_status() TO authenticated;

-- ── 3. Activation: DOCS_APPROVED → APPROVED once no longer employed ─────────
CREATE OR REPLACE FUNCTION public._activate_dco_if_free(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF p_user_id IS NULL THEN
    RETURN false;
  END IF;

  -- Cheap exit for everyone who is not waiting on activation.
  IF NOT EXISTS (
    SELECT 1 FROM public.dco_profiles dp
    WHERE dp.user_id = p_user_id AND dp.status = 'DOCS_APPROVED'
  ) THEN
    RETURN false;
  END IF;

  IF public._is_active_employee_driver(p_user_id) THEN
    RETURN false;
  END IF;

  UPDATE public.dco_profiles
  SET status = 'APPROVED', updated_at = now()
  WHERE user_id = p_user_id AND status = 'DOCS_APPROVED';

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  INSERT INTO public.dco_payees (user_id)
  VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  PERFORM public.emit_platform_event(
    'DcoApproved', NULL, jsonb_build_object('user_id', p_user_id, 'activated_after_leaving_fleet', true)
  );

  PERFORM public._enqueue_user_push(
    p_user_id,
    'You''re now a DCO',
    'You can start taking trips as an independent owner-operator.',
    jsonb_build_object('type', 'dco_status', 'status', 'APPROVED')
  );

  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public._activate_dco_if_free(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._activate_dco_if_free(uuid) FROM anon;
REVOKE ALL ON FUNCTION public._activate_dco_if_free(uuid) FROM authenticated;

-- Driver-side safety net (DCO screen calls it when it sees DOCS_APPROVED but
-- no fleet). Only ever acts on the caller.
CREATE OR REPLACE FUNCTION public.activate_my_dco()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := (select auth.uid());
  v_status text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  PERFORM public._activate_dco_if_free(v_uid);
  SELECT dp.status INTO v_status FROM public.dco_profiles dp WHERE dp.user_id = v_uid;
  RETURN coalesce(v_status, 'NONE');
END;
$function$;

REVOKE ALL ON FUNCTION public.activate_my_dco() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.activate_my_dco() FROM anon;
GRANT EXECUTE ON FUNCTION public.activate_my_dco() TO authenticated;

-- Any path that ends employment (leave_fleet, owner removes the driver, roster
-- edits) activates a waiting DCO. leave_fleet updates drivers first and the
-- membership second, so both tables need the trigger.
CREATE OR REPLACE FUNCTION public.trg_activate_dco_after_employment_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_user uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.user_id ELSE coalesce(OLD.user_id, NEW.user_id) END;
BEGIN
  BEGIN
    PERFORM public._activate_dco_if_free(v_user);
  EXCEPTION
    WHEN OTHERS THEN
      -- Never block a fleet / membership change; activate_my_dco() retries.
      NULL;
  END;
  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.trg_activate_dco_after_employment_change() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.trg_activate_dco_after_employment_change() FROM anon;
REVOKE ALL ON FUNCTION public.trg_activate_dco_after_employment_change() FROM authenticated;

DROP TRIGGER IF EXISTS activate_dco_after_driver_change ON public.drivers;
CREATE TRIGGER activate_dco_after_driver_change
  AFTER UPDATE OF user_id, left_at, relationship_status, deleted_at OR DELETE ON public.drivers
  FOR EACH ROW
  WHEN (OLD.user_id IS NOT NULL)
  EXECUTE FUNCTION public.trg_activate_dco_after_employment_change();

DROP TRIGGER IF EXISTS activate_dco_after_member_change ON public.organization_members;
CREATE TRIGGER activate_dco_after_member_change
  AFTER UPDATE OF user_id, role, status OR DELETE ON public.organization_members
  FOR EACH ROW
  WHEN (OLD.user_id IS NOT NULL AND OLD.role = 'driver')
  EXECUTE FUNCTION public.trg_activate_dco_after_employment_change();

-- ── 4. Approve: still employed → DOCS_APPROVED, otherwise APPROVED ──────────
CREATE OR REPLACE FUNCTION public.platform_approve_dco(p_user_id uuid)
RETURNS public.dco_profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_row public.dco_profiles;
  v_kyc text;
  v_missing text;
  v_employed boolean;
BEGIN
  IF NOT public.can_review_dco() THEN
    RAISE EXCEPTION 'unauthorized: dco.review permission required';
  END IF;

  v_kyc := public._driver_kyc_review_status(p_user_id);
  IF v_kyc <> 'approved' THEN
    RAISE EXCEPTION
      'kyc_not_verified: verify this driver''s KYC documents before approving DCO (kyc status: %)',
      v_kyc;
  END IF;

  v_missing := public._dco_kyc_outstanding_docs(p_user_id, true);
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION
      'dco_documents_not_verified: verify these DCO documents before approving (%)',
      v_missing;
  END IF;

  v_employed := public._is_active_employee_driver(p_user_id);

  UPDATE public.dco_profiles
  SET status = CASE WHEN v_employed THEN 'DOCS_APPROVED' ELSE 'APPROVED' END,
      reviewed_at = now(), reviewed_by = (select auth.uid()),
      decision_reason = NULL, updated_at = now()
  WHERE user_id = p_user_id AND status = 'PENDING'
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid_state: no PENDING dco_profiles row for user %', p_user_id;
  END IF;

  IF v_employed THEN
    PERFORM public.emit_platform_event(
      'DcoDocsApproved', NULL, jsonb_build_object('user_id', p_user_id)
    );
    PERFORM public._enqueue_user_push(
      p_user_id,
      'DCO approved 🎉',
      'Leave your fleet to start as a DCO.',
      jsonb_build_object('type', 'dco_status', 'status', 'DOCS_APPROVED')
    );
  ELSE
    INSERT INTO public.dco_payees (user_id)
    VALUES (p_user_id)
    ON CONFLICT (user_id) DO NOTHING;

    PERFORM public.emit_platform_event(
      'DcoApproved', NULL, jsonb_build_object('user_id', p_user_id)
    );
    PERFORM public._enqueue_user_push(
      p_user_id,
      'You''re now a DCO',
      'You can start taking trips as an independent owner-operator.',
      jsonb_build_object('type', 'dco_status', 'status', 'APPROVED')
    );
  END IF;

  RETURN v_row;
END;
$function$;

COMMENT ON FUNCTION public.platform_approve_dco(uuid) IS
  'Admin approves a PENDING DCO request (KYC + DCO documents must be verified). Still an employee driver → DOCS_APPROVED (activates to APPROVED when they leave the fleet); otherwise APPROVED.';

REVOKE ALL ON FUNCTION public.platform_approve_dco(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.platform_approve_dco(uuid) TO authenticated;

-- ── 5. Reject: also withdraws a DOCS_APPROVED approval ──────────────────────
CREATE OR REPLACE FUNCTION public.platform_reject_dco(p_user_id uuid, p_reason text)
RETURNS public.dco_profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_row public.dco_profiles;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
BEGIN
  IF NOT public.can_review_dco() THEN
    RAISE EXCEPTION 'unauthorized: dco.review permission required';
  END IF;
  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'rejection_reason_required';
  END IF;

  UPDATE public.dco_profiles
  SET status = 'REJECTED', reviewed_at = now(), reviewed_by = (select auth.uid()),
      decision_reason = v_reason, updated_at = now()
  WHERE user_id = p_user_id AND status IN ('PENDING', 'DOCS_APPROVED')
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid_state: no PENDING or DOCS_APPROVED dco_profiles row for user %', p_user_id;
  END IF;

  PERFORM public.emit_platform_event(
    'DcoRejected', NULL, jsonb_build_object('user_id', p_user_id, 'reason', v_reason)
  );

  PERFORM public._enqueue_user_push(
    p_user_id,
    'DCO request not approved',
    v_reason,
    jsonb_build_object('type', 'dco_status', 'status', 'REJECTED')
  );

  RETURN v_row;
END;
$function$;

REVOKE ALL ON FUNCTION public.platform_reject_dco(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.platform_reject_dco(uuid, text) TO authenticated;

-- ── 6. Admin queue: show whether the driver is still in a fleet ─────────────
-- Return type changes (new column), so DROP + CREATE.
DROP FUNCTION IF EXISTS public.list_dco_review_queue();

CREATE FUNCTION public.list_dco_review_queue()
RETURNS TABLE (
  user_id uuid,
  status text,
  requested_at timestamptz,
  reviewed_at timestamptz,
  decision_reason text,
  driver_name text,
  driver_phone text,
  driver_email text,
  kyc_review_status text,
  dco_docs_unverified text,
  still_in_fleet boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT
    dp.user_id,
    dp.status,
    dp.requested_at,
    dp.reviewed_at,
    dp.decision_reason,
    p.full_name,
    p.phone,
    p.email,
    COALESCE(s.review_status, 'none'),
    public._dco_kyc_outstanding_docs(dp.user_id, true),
    CASE
      WHEN dp.status IN ('PENDING', 'DOCS_APPROVED')
        THEN public._is_active_employee_driver(dp.user_id)
      ELSE false
    END
  FROM public.dco_profiles dp
  LEFT JOIN public.profiles p ON p.id = dp.user_id
  LEFT JOIN public.driver_kyc_submissions s ON s.driver_user_id = dp.user_id
  WHERE public.can_review_dco()
  ORDER BY dp.requested_at DESC;
$function$;

REVOKE ALL ON FUNCTION public.list_dco_review_queue() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_dco_review_queue() FROM anon;
GRANT EXECUTE ON FUNCTION public.list_dco_review_queue() TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_dco_review_queue() TO service_role;
