-- Individual registration type (e.g. a single truck owner with no firm).
--
-- Needs only PAN card, Aadhaar card and address proof. GST is never
-- required for an individual (GSTIN / GST certificate checks are skipped),
-- and there is no activity-proof (Udyam / IEC) slot.
--
-- 1. registration_type_enum gains 'individual'.
-- 2. 'aadhaar_card' becomes a valid upload type in both document stores
--    (verification_documents enum + organization_kyc_documents check).
-- 3. submit_business_verification (6-arg) and kyc_missing_required_documents
--    are re-created from their live definitions with only the individual
--    branch added; every other branch is unchanged.
--
-- The new enum values are only referenced inside plpgsql bodies, which are
-- not evaluated at CREATE time, so this is safe in one transaction.

ALTER TYPE public.registration_type_enum ADD VALUE IF NOT EXISTS 'individual';
ALTER TYPE public.verification_document_type ADD VALUE IF NOT EXISTS 'aadhaar_card';

ALTER TABLE public.organization_kyc_documents
  DROP CONSTRAINT IF EXISTS organization_kyc_documents_doc_type_check;
ALTER TABLE public.organization_kyc_documents
  ADD CONSTRAINT organization_kyc_documents_doc_type_check CHECK (
    doc_type = ANY (ARRAY[
      'gst_certificate', 'pan_card', 'cin_certificate', 'address_proof',
      'msme_certificate', 'iec_certificate', 'incorporation_certificate',
      'partnership_deed', 'llp_agreement', 'aadhaar_card', 'other'
    ]::text[])
  );

CREATE OR REPLACE FUNCTION public.submit_business_verification(p_org_id uuid, p_registration_type registration_type_enum DEFAULT NULL::registration_type_enum, p_address_pincode text DEFAULT NULL::text, p_address_proof_path text DEFAULT NULL::text, p_address_proof_type text DEFAULT NULL::text, p_gst_not_applicable boolean DEFAULT NULL::boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_role               text;
  v_current_status     public.kyc_verification_status;
  v_reg_type           public.registration_type_enum;
  v_gst_not_applicable boolean;
  v_gst_required       boolean;
  v_cin                text;
  v_has_address_proof  boolean;
BEGIN
  SELECT role INTO v_role
  FROM public.organization_members
  WHERE organization_id = p_org_id
    AND user_id = auth.uid()
    AND status = 'active';

  IF v_role IS NULL OR v_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Only workspace owners or admins can submit for verification.';
  END IF;

  SELECT verification_status, registration_type, gst_not_applicable, cin
  INTO v_current_status, v_reg_type, v_gst_not_applicable, v_cin
  FROM public.organizations
  WHERE id = p_org_id
  FOR UPDATE;

  IF v_current_status NOT IN ('unverified', 'rejected') THEN
    RAISE EXCEPTION 'Profile is already % and cannot be resubmitted.', v_current_status;
  END IF;

  v_gst_not_applicable := COALESCE(p_gst_not_applicable, v_gst_not_applicable, false);
  v_reg_type := COALESCE(p_registration_type, v_reg_type);

  IF v_reg_type IS NULL THEN
    RAISE EXCEPTION 'Registration type must be selected before submitting.';
  END IF;

  -- Individuals are never asked for GST.
  v_gst_required := NOT v_gst_not_applicable AND v_reg_type::text <> 'individual';

  IF NOT EXISTS (
    SELECT 1 FROM public.organizations
    WHERE id = p_org_id AND business_pan IS NOT NULL AND NULLIF(TRIM(business_pan), '') IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'PAN must be saved before submitting.';
  END IF;

  IF v_gst_required AND NOT EXISTS (
    SELECT 1 FROM public.organizations
    WHERE id = p_org_id AND gstin IS NOT NULL AND NULLIF(TRIM(gstin), '') IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'GSTIN must be saved before submitting, or mark GST as not applicable.';
  END IF;

  IF NOT public.org_has_kyc_document(p_org_id, 'pan_card') THEN
    RAISE EXCEPTION 'PAN card copy must be uploaded before submitting.';
  END IF;

  IF v_gst_required
     AND NOT public.org_has_kyc_document(p_org_id, 'gst_certificate') THEN
    RAISE EXCEPTION 'GST registration certificate must be uploaded before submitting.';
  END IF;

  v_has_address_proof :=
    public.org_has_kyc_document(p_org_id, 'address_proof')
    OR EXISTS (
      SELECT 1 FROM public.verification_documents v
      WHERE v.org_id = p_org_id
        AND v.status <> 'REPLACED'
        AND v.document_type::text LIKE 'address_proof_%'
    )
    OR (
      p_address_proof_path IS NOT NULL AND NULLIF(TRIM(p_address_proof_path), '') IS NOT NULL
    )
    OR EXISTS (
      SELECT 1 FROM public.organizations o
      WHERE o.id = p_org_id
        AND o.address_proof_path IS NOT NULL
        AND NULLIF(TRIM(o.address_proof_path), '') IS NOT NULL
    );

  IF NOT v_has_address_proof THEN
    RAISE EXCEPTION 'Address proof must be uploaded before submitting.';
  END IF;

  IF v_reg_type::text = 'individual' THEN
    IF NOT public.org_has_kyc_document(p_org_id, 'aadhaar_card') THEN
      RAISE EXCEPTION 'Aadhaar card must be uploaded before submitting.';
    END IF;
  ELSIF v_reg_type = 'proprietorship' AND v_gst_not_applicable THEN
    IF NOT public.org_has_kyc_document(
      p_org_id, 'msme_certificate', 'iec_certificate', 'gst_certificate'
    ) THEN
      RAISE EXCEPTION
        'Proprietorship without GST requires an activity proof (Udyam or IEC).';
    END IF;
  ELSIF v_reg_type = 'partnership' THEN
    IF NOT public.org_has_kyc_document(p_org_id, 'partnership_deed') THEN
      RAISE EXCEPTION 'Partnership deed must be uploaded before submitting.';
    END IF;
  ELSIF v_reg_type IN ('pvt_ltd', 'public_ltd') THEN
    IF v_cin IS NULL OR NULLIF(TRIM(v_cin), '') IS NULL THEN
      RAISE EXCEPTION 'CIN must be saved before submitting for limited companies.';
    END IF;
    IF NOT public.org_has_kyc_document(
      p_org_id, 'incorporation_certificate', 'cin_certificate'
    ) THEN
      RAISE EXCEPTION
        'Incorporation / CIN certificate must be uploaded before submitting.';
    END IF;
  ELSIF v_reg_type = 'llp' THEN
    IF NOT public.org_has_kyc_document(
      p_org_id, 'incorporation_certificate', 'cin_certificate'
    ) THEN
      RAISE EXCEPTION 'LLP incorporation certificate must be uploaded before submitting.';
    END IF;
    IF NOT public.org_has_kyc_document(p_org_id, 'llp_agreement') THEN
      RAISE EXCEPTION 'LLP agreement must be uploaded before submitting.';
    END IF;
  END IF;

  UPDATE public.organizations SET
    registration_type   = v_reg_type,
    address_pincode     = COALESCE(NULLIF(TRIM(p_address_pincode), ''),   address_pincode),
    address_proof_path  = COALESCE(NULLIF(TRIM(p_address_proof_path), ''), address_proof_path),
    address_proof_type  = COALESCE(NULLIF(TRIM(p_address_proof_type), ''), address_proof_type),
    gst_not_applicable  = v_gst_not_applicable,
    verification_status = 'pending',
    frozen_at            = now(),
    submitted_at         = now(),
    rejection_reasons    = NULL,
    updated_at           = now()
  WHERE id = p_org_id;

  INSERT INTO public.verification_audit_logs
    (org_id, changed_by, previous_status, new_status, notes)
  VALUES
    (p_org_id, auth.uid(), v_current_status, 'pending', 'user_submitted');

  INSERT INTO public.verification_jobs (organization_id, status, pillar_2_mca_status)
  VALUES (
    p_org_id,
    'QUEUED'::public.verification_job_status,
    CASE WHEN v_reg_type IN ('llp', 'pvt_ltd', 'public_ltd', 'partnership')
         THEN 'QUEUED' ELSE 'NOT_STARTED' END::public.pillar_status_type
  )
  ON CONFLICT (organization_id) DO UPDATE SET
    status              = 'QUEUED',
    ocr_status          = 'QUEUED',
    pillar_1_tax_status = 'QUEUED',
    pillar_2_mca_status = EXCLUDED.pillar_2_mca_status,
    ocr_detail          = NULL,
    pillar_1_tax_detail = NULL,
    pillar_2_mca_detail = NULL,
    attempts            = 0,
    error_logs          = NULL,
    next_attempt_at     = now(),
    completed_at        = NULL,
    updated_at          = now();

  RETURN jsonb_build_object(
    'ok',                  true,
    'org_id',              p_org_id,
    'verification_status', 'pending',
    'frozen_at',           now(),
    'job_queued',          true
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.kyc_missing_required_documents(p_org_id uuid)
 RETURNS text[]
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_reg_type           public.registration_type_enum;
  v_gst_not_applicable boolean;
  v_missing            text[] := '{}';
BEGIN
  SELECT registration_type, gst_not_applicable
  INTO v_reg_type, v_gst_not_applicable
  FROM public.organizations
  WHERE id = p_org_id;

  IF NOT public.org_has_kyc_document(p_org_id, 'pan_card') THEN
    v_missing := array_append(v_missing, 'Business PAN card');
  END IF;

  IF NOT coalesce(v_gst_not_applicable, false)
     AND coalesce(v_reg_type::text, '') <> 'individual'
     AND NOT public.org_has_kyc_document(p_org_id, 'gst_certificate') THEN
    v_missing := array_append(v_missing, 'GST registration certificate');
  END IF;

  IF NOT (
    public.org_has_kyc_document(p_org_id, 'address_proof')
    OR EXISTS (
      SELECT 1 FROM public.organizations o
      WHERE o.id = p_org_id
        AND NULLIF(TRIM(o.address_proof_path), '') IS NOT NULL
    )
  ) THEN
    v_missing := array_append(v_missing, 'Business address proof');
  END IF;

  IF v_reg_type::text = 'individual' THEN
    IF NOT public.org_has_kyc_document(p_org_id, 'aadhaar_card') THEN
      v_missing := array_append(v_missing, 'Aadhaar card');
    END IF;
  ELSIF v_reg_type = 'proprietorship' AND coalesce(v_gst_not_applicable, false) THEN
    IF NOT public.org_has_kyc_document(
      p_org_id, 'msme_certificate', 'iec_certificate', 'gst_certificate'
    ) THEN
      v_missing := array_append(v_missing, 'Activity proof (Udyam or IEC)');
    END IF;
  ELSIF v_reg_type = 'partnership' THEN
    IF NOT public.org_has_kyc_document(p_org_id, 'partnership_deed') THEN
      v_missing := array_append(v_missing, 'Partnership deed');
    END IF;
  ELSIF v_reg_type IN ('pvt_ltd', 'public_ltd') THEN
    IF NOT public.org_has_kyc_document(
      p_org_id, 'incorporation_certificate', 'cin_certificate'
    ) THEN
      v_missing := array_append(v_missing, 'Certificate of Incorporation');
    END IF;
  ELSIF v_reg_type = 'llp' THEN
    IF NOT public.org_has_kyc_document(
      p_org_id, 'incorporation_certificate', 'cin_certificate'
    ) THEN
      v_missing := array_append(v_missing, 'Certificate of Incorporation');
    END IF;
    IF NOT public.org_has_kyc_document(p_org_id, 'llp_agreement') THEN
      v_missing := array_append(v_missing, 'LLP agreement');
    END IF;
  END IF;

  RETURN v_missing;
END;
$function$;
