-- =============================================================================
-- Sprint 1: Business Verification & Document Upload Pipeline
-- =============================================================================
-- Adds: registration_type enum, extended columns on organizations,
--       verification_audit_logs table, storage bucket policy,
--       and three admin stored procedures (approve / reject / force-unlock).
-- Preserves all existing columns, RLS, and foreign keys.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 1: registration_type enum
-- ─────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE public.registration_type_enum AS ENUM (
    'proprietorship',
    'llp',
    'pvt_ltd',
    'public_ltd',
    'partnership'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 2: Extend organizations with verification pipeline columns
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS registration_type    public.registration_type_enum,
  ADD COLUMN IF NOT EXISTS address_pincode      text,
  ADD COLUMN IF NOT EXISTS address_proof_path   text,    -- Supabase Storage path (private bucket)
  ADD COLUMN IF NOT EXISTS address_proof_type   text,    -- 'lease' | 'utility_bill' | 'other'
  ADD COLUMN IF NOT EXISTS frozen_at            timestamptz,  -- set when status → pending
  ADD COLUMN IF NOT EXISTS submitted_at         timestamptz,
  ADD COLUMN IF NOT EXISTS rejection_reasons    jsonb;   -- { checklist: string[], notes: string }

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 3: verification_audit_logs
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.verification_audit_logs (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  changed_by       uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  previous_status  public.kyc_verification_status,
  new_status       public.kyc_verification_status NOT NULL,
  rejection_reasons jsonb,
  notes            text,
  ip_address       text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_val_audit_org     ON public.verification_audit_logs(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_val_audit_status  ON public.verification_audit_logs(new_status, created_at DESC);

-- RLS: admins read via service_role; owners can read their own audit trail
ALTER TABLE public.verification_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_reads_own_audit"
  ON public.verification_audit_logs FOR SELECT
  USING (
    org_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 4: RPC — submit_business_verification
-- Called by the mobile app "Submit for Verification" CTA.
-- Validates state, freezes the row, and logs the transition atomically.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.submit_business_verification(
  p_org_id             uuid,
  p_registration_type  public.registration_type_enum DEFAULT NULL,
  p_address_pincode    text    DEFAULT NULL,
  p_address_proof_path text    DEFAULT NULL,
  p_address_proof_type text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role            text;
  v_current_status  public.kyc_verification_status;
  v_org_name        text;
BEGIN
  -- Caller must be owner or admin of this org
  SELECT role INTO v_role
  FROM public.organization_members
  WHERE organization_id = p_org_id
    AND user_id = auth.uid()
    AND status = 'active';

  IF v_role IS NULL OR v_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Only workspace owners or admins can submit for verification.';
  END IF;

  -- Fetch current state with row lock
  SELECT verification_status, name
  INTO v_current_status, v_org_name
  FROM public.organizations
  WHERE id = p_org_id
  FOR UPDATE;

  -- Gate: only UNVERIFIED (unverified) or REJECTED state allows submission
  IF v_current_status NOT IN ('unverified', 'rejected') THEN
    RAISE EXCEPTION 'Profile is already % and cannot be resubmitted.', v_current_status;
  END IF;

  -- Require PAN and GSTIN before freeze
  IF NOT EXISTS (
    SELECT 1 FROM public.organizations
    WHERE id = p_org_id
      AND business_pan IS NOT NULL
      AND gstin IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'PAN and GSTIN must be saved before submitting for verification.';
  END IF;

  -- Apply extended fields if provided
  UPDATE public.organizations
  SET
    registration_type  = COALESCE(p_registration_type, registration_type),
    address_pincode    = COALESCE(NULLIF(TRIM(p_address_pincode), ''), address_pincode),
    address_proof_path = COALESCE(NULLIF(TRIM(p_address_proof_path), ''), address_proof_path),
    address_proof_type = COALESCE(NULLIF(TRIM(p_address_proof_type), ''), address_proof_type),
    -- State transition: freeze the row
    verification_status = 'pending',
    frozen_at           = now(),
    submitted_at        = now(),
    rejection_reasons   = NULL,   -- clear previous rejection on resubmit
    updated_at          = now()
  WHERE id = p_org_id;

  -- Audit log entry
  INSERT INTO public.verification_audit_logs
    (org_id, changed_by, previous_status, new_status, notes)
  VALUES
    (p_org_id, auth.uid(), v_current_status, 'pending', 'user_submitted');

  RETURN jsonb_build_object(
    'ok',                true,
    'org_id',            p_org_id,
    'verification_status', 'pending',
    'frozen_at',         now()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_business_verification(
  uuid, public.registration_type_enum, text, text, text
) TO authenticated;

DO $guard_admin_approve_profile$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc
    WHERE oid = to_regprocedure('public.admin_approve_profile(uuid, uuid, text)')
      AND prokind = 'f'
  ) THEN
    RAISE NOTICE 'admin_approve_profile remains a function until 20261113000000';
  ELSE
    EXECUTE $historical$
-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 5: Stored procedure — admin_approve_profile
-- Atomically approves, logs, and unlocks referral attributions.
-- Caller must use service_role key (admin console only).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE PROCEDURE public.admin_approve_profile(
  p_org_id    uuid,
  p_admin_id  uuid,
  p_notes     text DEFAULT NULL
)
LANGUAGE plpgsql
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

  -- 1. Approve the profile
  UPDATE public.organizations
  SET
    verification_status = 'verified',
    verified_at         = now(),
    verified_by         = p_admin_id,
    frozen_at           = frozen_at,  -- keep frozen_at; stays read-only
    updated_at          = now()
  WHERE id = p_org_id;

  -- 2. Audit log
  INSERT INTO public.verification_audit_logs
    (org_id, changed_by, previous_status, new_status, notes)
  VALUES
    (p_org_id, p_admin_id, 'pending', 'verified', p_notes);

  -- 3. Mark org as bidding-eligible (marketplace unlock signal)
  UPDATE public.organizations
  SET marketplace_verified = true
  WHERE id = p_org_id
    AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name   = 'organizations'
        AND column_name  = 'marketplace_verified'
    );

EXCEPTION
  WHEN OTHERS THEN
    RAISE;
END;
$$;

$historical$;
  END IF;
END
$guard_admin_approve_profile$;

DO $guard_admin_reject_profile$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc
    WHERE oid = to_regprocedure('public.admin_reject_profile(uuid, uuid, jsonb, text)')
      AND prokind = 'f'
  ) THEN
    RAISE NOTICE 'admin_reject_profile remains a function until 20261113000000';
  ELSE
    EXECUTE $historical$
-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 6: Stored procedure — admin_reject_profile
-- Rejects, unfreezes the row for correction, logs structured rejection reasons.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE PROCEDURE public.admin_reject_profile(
  p_org_id           uuid,
  p_admin_id         uuid,
  p_rejection_reasons jsonb,   -- { checklist: string[], notes: string }
  p_notes            text DEFAULT NULL
)
LANGUAGE plpgsql
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

  -- 1. Reject and unfreeze so user can correct
  UPDATE public.organizations
  SET
    verification_status  = 'rejected',
    frozen_at            = NULL,   -- unfreeze: mobile app fields become editable again
    rejection_reasons    = p_rejection_reasons,
    kyc_rejected_reason  = p_rejection_reasons->>'notes',
    updated_at           = now()
  WHERE id = p_org_id;

  -- 2. Audit log
  INSERT INTO public.verification_audit_logs
    (org_id, changed_by, previous_status, new_status, rejection_reasons, notes)
  VALUES
    (p_org_id, p_admin_id, 'pending', 'rejected', p_rejection_reasons, p_notes);

EXCEPTION
  WHEN OTHERS THEN
    RAISE;
END;
$$;

$historical$;
  END IF;
END
$guard_admin_reject_profile$;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 7: Stored procedure — admin_force_unlock_profile
-- Manager/Super-Admin only: temporarily unfreezes a VERIFIED profile.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE PROCEDURE public.admin_force_unlock_profile(
  p_org_id   uuid,
  p_admin_id uuid,
  p_reason   text
)
LANGUAGE plpgsql
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

  -- Revert to unverified so user can correct and resubmit through the full pipeline
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

EXCEPTION
  WHEN OTHERS THEN
    RAISE;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 8: DB-level freeze guard
-- Prevents mobile clients (authenticated role) from directly updating
-- frozen columns while the profile is PENDING or VERIFIED via the
-- update_workspace_kyc RPC or any raw UPDATE.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.enforce_verification_freeze()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only block if the row is currently frozen (pending or verified)
  IF OLD.verification_status IN ('pending', 'verified') THEN
    -- Allow admin procedures running as service_role to bypass
    IF current_setting('role', true) = 'service_role' THEN
      RETURN NEW;
    END IF;

    -- Block changes to KYC identity fields from authenticated client
    IF (NEW.business_pan   IS DISTINCT FROM OLD.business_pan   OR
        NEW.gstin          IS DISTINCT FROM OLD.gstin          OR
        NEW.cin            IS DISTINCT FROM OLD.cin            OR
        NEW.registration_type IS DISTINCT FROM OLD.registration_type OR
        NEW.address_proof_path IS DISTINCT FROM OLD.address_proof_path) THEN
      RAISE EXCEPTION
        'PROFILE_FROZEN: Verification fields are locked while status is %. Contact support.',
        OLD.verification_status;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_verification_freeze ON public.organizations;
CREATE TRIGGER trg_verification_freeze
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_verification_freeze();

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 9: Extend get_workspace_kyc_status to include new fields
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_workspace_kyc_status(p_org_id uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'id',                  o.id,
    'name',                o.name,
    'logo_url',            o.logo_url,
    'business_pan',        o.business_pan,
    'gstin',               o.gstin,
    'cin',                 o.cin,
    'registration_type',   o.registration_type,
    'address_line',        o.address_line,
    'city',                o.city,
    'state',               o.state,
    'address_pincode',     o.address_pincode,
    'address_proof_path',  o.address_proof_path,
    'address_proof_type',  o.address_proof_type,
    'verification_status', o.verification_status,
    'frozen_at',           o.frozen_at,
    'submitted_at',        o.submitted_at,
    'verified_at',         o.verified_at,
    'kyc_rejected_reason', o.kyc_rejected_reason,
    'rejection_reasons',   o.rejection_reasons
  )
  FROM public.organizations o
  JOIN public.organization_members om
    ON om.organization_id = o.id
   AND om.user_id = auth.uid()
   AND om.status = 'active'
  WHERE o.id = p_org_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_workspace_kyc_status(uuid) TO authenticated;
