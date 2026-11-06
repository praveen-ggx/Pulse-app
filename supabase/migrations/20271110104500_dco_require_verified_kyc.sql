-- DCO approval now requires driver identity proofs (KYC).
--
-- Before this, request_dco_status() and platform_approve_dco() never looked at
-- a single document: any driver-role user off a fleet could request, and a
-- reviewer could approve someone with zero proofs on file.
--
-- The proof flow already exists — driver_kyc_documents (per-document
-- verify/reject) + driver_kyc_submissions (driver-level submitted → approved /
-- rejected, reviewed in the Admin Console Driver KYC panel). The mandatory set
-- comes from driver_kyc_doc_requirements (today: Licence, Aadhaar, Selfie; PAN
-- optional), and driver_submit_kyc_for_verification() already refuses a
-- partial set. So DCO just gates on that lifecycle instead of duplicating it:
--
--   1. Request  — KYC must be submitted (review_status 'submitted' | 'approved').
--   2. Validate — reviewer verifies the documents in the Driver KYC panel.
--   3. Approve  — platform_approve_dco() requires review_status = 'approved'.
--
-- DCO-only extras: a DCO is paid directly, so on top of the normal driver set
-- they also need PAN and a bank proof. These are flagged with the new
-- driver_kyc_doc_requirements.required_for_dco column and stay OPTIONAL for
-- the normal driver KYC submit (is_mandatory = false), so employee drivers are
-- unaffected. They are checked per document (not via the submission), because
-- an already-approved driver cannot re-submit KYC — the reviewer verifies the
-- extra documents individually in the Driver KYC panel.
--
-- Vehicle documents (RC/insurance/...) are deliberately NOT part of the gate:
-- owner_vehicles RLS only lets an APPROVED DCO add a vehicle, and Marketplace
-- already requires an active owner vehicle (is_dco_marketplace_eligible).
--
-- Supersedes request_dco_status() from 20271110103000 (keeps its employment
-- gate) and platform_approve_dco() from 20271005120000 (keeps everything, adds
-- the KYC check).

-- ── Helper: driver-level KYC review status ('none' when never submitted) ─────

CREATE OR REPLACE FUNCTION public._driver_kyc_review_status(p_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT COALESCE(
    (SELECT s.review_status
       FROM public.driver_kyc_submissions s
      WHERE s.driver_user_id = p_user_id),
    'none'
  );
$function$;

REVOKE ALL ON FUNCTION public._driver_kyc_review_status(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._driver_kyc_review_status(uuid) FROM anon;
REVOKE ALL ON FUNCTION public._driver_kyc_review_status(uuid) FROM authenticated;

-- ── DCO-only document requirements (PAN + bank proof) ────────────────────────

-- Allow a 'bank_proof' doc type. The original CHECK was declared inline, so
-- drop whatever doc_type check exists by lookup rather than by guessed name.
DO $$
DECLARE
  v_con text;
BEGIN
  FOR v_con IN
    SELECT c.conname
    FROM pg_constraint c
    WHERE c.conrelid = 'public.driver_kyc_documents'::regclass
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%doc_type%'
  LOOP
    EXECUTE format('ALTER TABLE public.driver_kyc_documents DROP CONSTRAINT %I', v_con);
  END LOOP;
END;
$$;

ALTER TABLE public.driver_kyc_documents
  ADD CONSTRAINT driver_kyc_documents_doc_type_check
  CHECK (doc_type IN ('license', 'aadhaar', 'pan', 'selfie', 'bank_proof', 'other'));

ALTER TABLE public.driver_kyc_doc_requirements
  ADD COLUMN IF NOT EXISTS required_for_dco boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.driver_kyc_doc_requirements.required_for_dco IS
  'Required (uploaded for request, verified for approval) only on the DCO path. Independent of is_mandatory, which governs the normal driver KYC submit.';

-- is_mandatory stays false for both: normal drivers are not affected.
INSERT INTO public.driver_kyc_doc_requirements
  (doc_type, label, is_mandatory, sort_order, required_for_dco)
VALUES
  ('pan',        'PAN',                                       false, 3, true),
  ('bank_proof', 'Bank proof (cancelled cheque / passbook)',  false, 5, true)
ON CONFLICT (doc_type) DO UPDATE
  SET required_for_dco = excluded.required_for_dco,
      label            = excluded.label,
      sort_order       = excluded.sort_order,
      updated_at       = now();

-- Labels of DCO-only documents that are not ready. p_need_verified = false:
-- missing / rejected / expired (request gate). true: anything not 'verified'
-- (approval gate). NULL when nothing is outstanding.
CREATE OR REPLACE FUNCTION public._dco_kyc_outstanding_docs(
  p_user_id uuid,
  p_need_verified boolean
)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT string_agg(r.label, ', ' ORDER BY r.sort_order)
  FROM public.driver_kyc_doc_requirements r
  WHERE r.required_for_dco
    AND NOT EXISTS (
      SELECT 1
      FROM public.driver_kyc_documents d
      WHERE d.driver_user_id = p_user_id
        AND d.doc_type = r.doc_type
        AND d.deleted_at IS NULL
        AND d.storage_path IS NOT NULL
        AND CASE
              WHEN p_need_verified THEN d.status = 'verified'
              ELSE d.status NOT IN ('rejected', 'expired')
            END
    );
$function$;

REVOKE ALL ON FUNCTION public._dco_kyc_outstanding_docs(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._dco_kyc_outstanding_docs(uuid, boolean) FROM anon;
REVOKE ALL ON FUNCTION public._dco_kyc_outstanding_docs(uuid, boolean) FROM authenticated;

-- ── 1. Request: KYC must be submitted first ──────────────────────────────────

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

  IF public._is_active_employee_driver(v_uid) THEN
    RAISE EXCEPTION
      'employment_conflict: leave your active fleet before requesting DCO status';
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
  'Driver requests DCO status (PENDING). Refuses while still an active fleet employee or before driver KYC is submitted; admin approve is a separate gate that requires KYC approved.';

REVOKE ALL ON FUNCTION public.request_dco_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_dco_status() TO authenticated;

-- ── 3. Approve: KYC must be verified ─────────────────────────────────────────

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
BEGIN
  IF NOT public.can_review_dco() THEN
    RAISE EXCEPTION 'unauthorized: dco.review permission required';
  END IF;

  IF public._is_active_employee_driver(p_user_id) THEN
    RAISE EXCEPTION 'employment_conflict: user % is still an active employee driver -- they must leave that fleet before DCO approval', p_user_id;
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

  UPDATE public.dco_profiles
  SET status = 'APPROVED', reviewed_at = now(), reviewed_by = (select auth.uid()),
      decision_reason = NULL, updated_at = now()
  WHERE user_id = p_user_id AND status = 'PENDING'
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid_state: no PENDING dco_profiles row for user %', p_user_id;
  END IF;

  INSERT INTO public.dco_payees (user_id)
  VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  PERFORM public.emit_platform_event(
    'DcoApproved', NULL, jsonb_build_object('user_id', p_user_id)
  );

  RETURN v_row;
END;
$function$;

-- ── Admin queue: expose KYC status so the console can gate Approve ───────────
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
  dco_docs_unverified text
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
    public._dco_kyc_outstanding_docs(dp.user_id, true)
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

-- ── Admin KYC queue: DCO document review joins the normal process ────────────
-- An already-verified driver who uploads PAN / bank proof for DCO has a
-- decided submission, so they would never reappear in the "Awaiting" queue.
-- dco_docs_pending counts their DCO-only documents still at 'pending' while a
-- DCO request is open; the console treats > 0 as awaiting review.
-- The view is security_invoker, and a KYC reviewer may lack dco.review (so
-- dco_profiles RLS would hide the row). This definer helper answers only for
-- KYC reviewers or the driver themselves.
CREATE OR REPLACE FUNCTION public._has_pending_dco_request(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT (
      p_user_id = (select auth.uid())
      OR public.can_review_driver_kyc()
    )
    AND EXISTS (
      SELECT 1 FROM public.dco_profiles dp
      WHERE dp.user_id = p_user_id AND dp.status = 'PENDING'
    );
$function$;

REVOKE ALL ON FUNCTION public._has_pending_dco_request(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._has_pending_dco_request(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public._has_pending_dco_request(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public._has_pending_dco_request(uuid) TO service_role;

-- Same definition as 20270122000000 with one column appended (CREATE OR
-- REPLACE VIEW only allows adding columns at the end).
CREATE OR REPLACE VIEW public.driver_kyc_review_queue
WITH (security_invoker = true)
AS
SELECT
  s.driver_user_id,
  d.id                                     AS driver_id,
  d.name                                   AS driver_name,
  d.phone                                  AS driver_phone,
  o.name                                   AS organization_name,
  s.submitted_at,
  s.review_status,
  s.reviewed_at,
  s.review_notes,
  s.attempt_count,
  count(k.id)                              AS document_count,
  count(k.id) FILTER (WHERE k.status = 'pending')  AS pending_count,
  count(k.id) FILTER (WHERE k.status = 'verified') AS verified_count,
  count(k.id) FILTER (WHERE k.status = 'rejected') AS rejected_count,
  (
    SELECT string_agg(r.label, ', ' ORDER BY r.sort_order)
    FROM public.driver_kyc_doc_requirements r
    WHERE NOT r.is_mandatory
      AND NOT EXISTS (
        SELECT 1 FROM public.driver_kyc_documents dk
        WHERE dk.driver_user_id = s.driver_user_id
          AND dk.doc_type = r.doc_type
          AND dk.deleted_at IS NULL
          AND dk.storage_path IS NOT NULL
      )
  )                                        AS optional_not_provided,
  (
    SELECT count(*)::integer
    FROM public.driver_kyc_documents dk
    JOIN public.driver_kyc_doc_requirements r
      ON r.doc_type = dk.doc_type AND r.required_for_dco
    WHERE dk.driver_user_id = s.driver_user_id
      AND dk.deleted_at IS NULL
      AND dk.storage_path IS NOT NULL
      AND dk.status = 'pending'
      AND public._has_pending_dco_request(s.driver_user_id)
  )                                        AS dco_docs_pending
FROM public.driver_kyc_submissions s
LEFT JOIN public.drivers d
       ON d.user_id = s.driver_user_id
LEFT JOIN public.organizations o
       ON o.id = d.organization_id
LEFT JOIN public.driver_kyc_documents k
       ON k.driver_user_id = s.driver_user_id
      AND k.deleted_at IS NULL
GROUP BY s.driver_user_id, d.id, d.name, d.phone, o.name,
         s.submitted_at, s.review_status, s.reviewed_at, s.review_notes,
         s.attempt_count;

GRANT SELECT ON public.driver_kyc_review_queue TO authenticated;
